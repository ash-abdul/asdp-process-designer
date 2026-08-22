/**
 * The ingest guard.
 *
 * Nothing enters the system without passing through here. Four obligations
 * (roadmap P1, `L0-ING-001`, `L0-ING-006`):
 *
 *   1. content type determined by CONTENT, not by the client's claim
 *   2. size bounded
 *   3. SHA-256 computed for deduplication and for the content-addressed blob key
 *   4. anything V1 cannot parse is REFUSED with a named reason
 *
 * On (4): refusal is the point. A binary document that reaches a text adapter
 * produces garbage units with garbage anchors, and garbage anchors resolve —
 * which is worse than a rejection, because it looks like provenance.
 * `parse_failed` is a recorded status, never a silent empty parse.
 */

import { createHash } from 'node:crypto';
import type { SourceKind } from '@asdp/schemas';
import { readZipEntries, ZipError } from './zip.ts';
import {
  DOCX,
  PPTX,
  TEXT_MARKDOWN,
  TEXT_PLAIN,
  XLSX,
  familyOf,
  type AdmittedMediaType,
  type MediaFamily,
} from './media-types.ts';

/** Content types V2 can parse. Everything else is refused by name. */
export type AcceptedMediaType = AdmittedMediaType;

/** Why a file was refused. Stable codes so the API can be tested on them. */
export type RefusalCode =
  | 'empty'
  | 'too_large'
  | 'unsupported_binary_type'
  | 'undecodable_text'
  | 'unsupported_text_encoding'
  | 'embedded_nul'
  | 'unreadable_archive'
  | 'unsupported_ooxml_kind';

export interface GuardOptions {
  readonly filename: string;
  /** Maximum accepted size in bytes. */
  readonly maxBytes: number;
  /** Client-declared type. Recorded, never trusted for admission. */
  readonly declaredMimeType?: string;
}

export interface AcceptedSource {
  readonly accepted: true;
  readonly mimeType: AcceptedMediaType;
  readonly family: MediaFamily;
  readonly kind: SourceKind;
  readonly sha256: string;
  readonly byteSize: number;
  /**
   * Decoded, pre-normalisation text — **text family only**.
   *
   * Undefined for `ooxml`, whose text lives inside compressed XML parts and is
   * the adapter's business to assemble. Passed forward rather than re-decoded, so
   * the bytes the guard admitted are the bytes that get extracted.
   */
  readonly rawText?: string;
  /** How the type was decided, so the decision is auditable. */
  readonly detection: {
    readonly binarySniff: 'clean' | 'ooxml';
    readonly encoding: 'utf-8' | 'utf-8-bom' | 'n/a';
    /** `text/plain` vs `text/markdown` is the one choice the extension makes. */
    readonly adapterSelectedBy: 'extension' | 'default' | 'archive-contents';
  };
}

export interface RefusedSource {
  readonly accepted: false;
  readonly code: RefusalCode;
  readonly reason: string;
  readonly sha256: string;
  readonly byteSize: number;
  /** What the bytes appear to be, when recognised. Helps the user act. */
  readonly detectedMimeType?: string;
}

export type GuardResult = AcceptedSource | RefusedSource;

// ---------------------------------------------------------------------------
// Magic-byte signatures
// ---------------------------------------------------------------------------

interface Signature {
  readonly bytes: readonly number[];
  readonly offset: number;
  readonly mimeType: string;
  readonly label: string;
  /** The slice that will parse it, so the refusal can say when it arrives. */
  readonly arrivesIn: 'V2-PDF' | 'V3' | 'a later slice' | 'never';
}

/**
 * Recognised binary formats.
 *
 * Listed so a refusal can name the format and the slice that will handle it,
 * rather than saying "unsupported". A user who uploads a PDF in V1 should learn
 * that PDFs arrive in V2, not that their file was wrong.
 */
const SIGNATURES: readonly Signature[] = [
  { bytes: [0x25, 0x50, 0x44, 0x46, 0x2d], offset: 0, mimeType: 'application/pdf', label: 'PDF', arrivesIn: 'V2-PDF' },
  { bytes: [0x50, 0x4b, 0x05, 0x06], offset: 0, mimeType: 'application/zip', label: 'empty ZIP archive', arrivesIn: 'never' },
  { bytes: [0xd0, 0xcf, 0x11, 0xe0], offset: 0, mimeType: 'application/x-ole-storage', label: 'legacy Microsoft Office (DOC/XLS)', arrivesIn: 'a later slice' },
  { bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], offset: 0, mimeType: 'image/png', label: 'PNG image', arrivesIn: 'V3' },
  { bytes: [0xff, 0xd8, 0xff], offset: 0, mimeType: 'image/jpeg', label: 'JPEG image', arrivesIn: 'V3' },
  { bytes: [0x47, 0x49, 0x46, 0x38], offset: 0, mimeType: 'image/gif', label: 'GIF image', arrivesIn: 'V3' },
  { bytes: [0x42, 0x4d], offset: 0, mimeType: 'image/bmp', label: 'BMP image', arrivesIn: 'V3' },
  { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0, mimeType: 'application/x-riff', label: 'RIFF container (WEBP/WAV/AVI)', arrivesIn: 'V3' },
  { bytes: [0x1f, 0x8b], offset: 0, mimeType: 'application/gzip', label: 'gzip archive', arrivesIn: 'never' },
  { bytes: [0x7f, 0x45, 0x4c, 0x46], offset: 0, mimeType: 'application/x-elf', label: 'ELF executable', arrivesIn: 'never' },
  { bytes: [0x4d, 0x5a], offset: 0, mimeType: 'application/x-dosexec', label: 'Windows executable', arrivesIn: 'never' },
];

/** Byte-order marks. Only UTF-8 is accepted in V1. */
const UTF8_BOM = [0xef, 0xbb, 0xbf];
const UTF16_BOMS: readonly { readonly bytes: readonly number[]; readonly label: string }[] = [
  { bytes: [0xff, 0xfe], label: 'UTF-16 LE' },
  { bytes: [0xfe, 0xff], label: 'UTF-16 BE' },
];

function startsWith(data: Uint8Array, bytes: readonly number[], offset: number): boolean {
  if (data.length < offset + bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) {
    if (data[offset + i] !== bytes[i]) return false;
  }
  return true;
}

/** Recognise a binary format by signature, or null when nothing matches. */
export function sniffBinary(data: Uint8Array): Signature | null {
  for (const sig of SIGNATURES) {
    if (startsWith(data, sig.bytes, sig.offset)) return sig;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Extension → adapter selection
// ---------------------------------------------------------------------------

/** Local file header. An OOXML package is a ZIP, so this is the entry point. */
const ZIP_LOCAL_HEADER = [0x50, 0x4b, 0x03, 0x04];

const MARKDOWN_EXTENSIONS = ['.md', '.markdown', '.mdown', '.mkd'];

function extensionOf(filename: string): string {
  const at = filename.lastIndexOf('.');
  return at === -1 ? '' : filename.slice(at).toLowerCase();
}

/**
 * Choose between the two text adapters.
 *
 * This is the ONLY decision the filename influences, and it cannot admit a file
 * that content sniffing rejected — it only picks which text adapter runs on
 * bytes already proven to be decodable text. Markdown has no magic bytes, so
 * there is nothing else to go on; recording `adapterSelectedBy` keeps that
 * honest rather than implicit.
 */
function selectTextType(filename: string): {
  readonly mimeType: 'text/plain' | 'text/markdown';
  readonly kind: SourceKind;
  readonly by: 'extension' | 'default';
} {
  if (MARKDOWN_EXTENSIONS.includes(extensionOf(filename))) {
    return { mimeType: TEXT_MARKDOWN, kind: 'markdown', by: 'extension' };
  }
  return { mimeType: TEXT_PLAIN, kind: 'freetext', by: 'default' };
}

// ---------------------------------------------------------------------------
// The guard
// ---------------------------------------------------------------------------

/** SHA-256 of the raw bytes. The dedupe key and the blob key input. */
export function hashBytes(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Admit or refuse an uploaded source.
 *
 * Order matters: size and emptiness first (cheapest, and a 2 GB file should not
 * be decoded to find out it is unsupported), then binary signatures, then
 * encoding, then a strict UTF-8 decode. The hash is computed regardless, because
 * a refusal is worth recording against the content that caused it.
 */
export function guardSource(data: Uint8Array, options: GuardOptions): GuardResult {
  const sha256 = hashBytes(data);
  const byteSize = data.byteLength;
  const refuse = (code: RefusalCode, reason: string, detectedMimeType?: string): RefusedSource => ({
    accepted: false,
    code,
    reason,
    sha256,
    byteSize,
    ...(detectedMimeType === undefined ? {} : { detectedMimeType }),
  });

  if (byteSize === 0) {
    return refuse('empty', 'the uploaded source is empty; there is nothing to anchor');
  }
  if (byteSize > options.maxBytes) {
    return refuse(
      'too_large',
      `source is ${byteSize} bytes, which exceeds the ${options.maxBytes}-byte limit`,
    );
  }

  // --- OOXML packages ----------------------------------------------------
  // Checked BEFORE the generic binary sniff, because an OOXML package is a ZIP
  // and would otherwise be refused as one. Which OOXML kind it is can only be
  // decided by looking inside, so this is content sniffing one level deeper —
  // still content, never the filename.
  if (startsWith(data, ZIP_LOCAL_HEADER, 0)) {
    let partNames: readonly string[];
    try {
      partNames = readZipEntries(data).map((e) => e.name);
    } catch (err) {
      return refuse(
        'unreadable_archive',
        `content is a ZIP-based package that could not be read: ` +
          `${err instanceof ZipError ? err.message : String(err)}`,
        'application/zip',
      );
    }

    const has = (name: string): boolean => partNames.includes(name);

    if (has('word/document.xml')) {
      return {
        accepted: true,
        mimeType: DOCX,
        family: familyOf(DOCX),
        kind: 'docx',
        sha256,
        byteSize,
        detection: {
          binarySniff: 'ooxml',
          encoding: 'n/a',
          adapterSelectedBy: 'archive-contents',
        },
      };
    }
    if (has('xl/workbook.xml')) {
      return refuse(
        'unsupported_ooxml_kind',
        'content is an Excel workbook (XLSX). Spreadsheet ingestion is a separate proposed ' +
          'capability and is deliberately not part of V2; it needs its own approved boundary.',
        XLSX,
      );
    }
    if (has('ppt/presentation.xml')) {
      return refuse(
        'unsupported_ooxml_kind',
        'content is a PowerPoint presentation (PPTX), which is not a planned source type.',
        PPTX,
      );
    }
    return refuse(
      'unsupported_ooxml_kind',
      'content is a ZIP archive with no recognised OOXML document part. V2 reads Word ' +
        `documents (word/document.xml). Parts found: ${partNames.slice(0, 6).join(', ')}`,
      'application/zip',
    );
  }

  const binary = sniffBinary(data);
  if (binary !== null) {
    const when =
      binary.arrivesIn === 'never'
        ? 'This format is not a business source and will not be supported.'
        : `Parsing for this format arrives in ${binary.arrivesIn}.`;
    return refuse(
      'unsupported_binary_type',
      `content is ${binary.label}, which this build cannot parse. ${when} ` +
        'V2 accepts UTF-8 free text, Markdown and Word documents (DOCX).',
      binary.mimeType,
    );
  }

  for (const bom of UTF16_BOMS) {
    if (startsWith(data, bom.bytes, 0)) {
      return refuse(
        'unsupported_text_encoding',
        `content is ${bom.label} encoded. Only UTF-8 is decoded; re-save the file as UTF-8. ` +
          'Transcoding is not performed silently, because a lossy conversion would corrupt ' +
          'anchors without corrupting the text visibly.',
        'text/plain',
      );
    }
  }

  const hasBom = startsWith(data, UTF8_BOM, 0);
  const body = hasBom ? data.subarray(UTF8_BOM.length) : data;

  let rawText: string;
  try {
    // `fatal` is the point: a lenient decode substitutes U+FFFD, which would
    // store corrupted text that still hashes and still anchors.
    rawText = new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    return refuse(
      'undecodable_text',
      'content is not valid UTF-8 and matches no recognised document format, so it cannot be ' +
        'decoded without substitution. Lenient decoding is refused because it would store ' +
        'corrupted text that still anchors successfully.',
    );
  }

  // A NUL inside otherwise-decodable text means binary content that happens to
  // pass a UTF-8 decode. Refusing is cheaper than discovering it downstream.
  if (rawText.includes('\u0000')) {
    return refuse(
      'embedded_nul',
      'content contains NUL bytes, which indicates binary data rather than text',
    );
  }

  const selected = selectTextType(options.filename);
  return {
    accepted: true,
    family: 'text',
    mimeType: selected.mimeType,
    kind: selected.kind,
    sha256,
    byteSize,
    rawText,
    detection: {
      binarySniff: 'clean',
      encoding: hasBom ? 'utf-8-bom' : 'utf-8',
      adapterSelectedBy: selected.by,
    },
  };
}
