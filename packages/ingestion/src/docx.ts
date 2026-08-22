/**
 * DOCX adapter — WordprocessingML.
 *
 * A DOCX stores text in **logical order by construction**: `w:t` elements hold
 * characters in reading order, and the renderer applies bidi at display time. So
 * the question spike S2 exists to answer for PDF — is this logical or visual
 * order? — simply does not arise here. That is the structural reason DOCX was
 * unblocked while PDF waits.
 *
 * Anchors are `docx_block` targets carrying **both** addressings:
 *
 *   blockPath + runStart/runEnd  the document-model address, stable per version
 *   charStart/charEnd            code-point offsets into the canonical text
 *
 * The second is what lets the same resolver verify a DOCX anchor as any other
 * (ADR-0008). Without it a DOCX anchor would be unverifiable, and `L0-ING-002`
 * would have nothing to check.
 *
 * Tracked changes: **`w:ins` content is accepted, `w:del` content is dropped** —
 * the accepted text is the document as it stands, per
 * provenance-and-anchoring.md §7. A deletion is not evidence of a requirement.
 */

import { normalise, toCodePoints, type Direction } from '@asdp/text';
import { spanChecksum } from '@asdp/provenance';
import type { ProvenanceAnchor, SourceUnitType } from '@asdp/schemas';
import { readZipEntries, readZipEntry, ZipError, type ZipEntry } from './zip.ts';
import { localName, tokeniseXml, XmlError } from './xml.ts';
import { isTrimmable, type ExtractedUnit } from './units.ts';
import type { ExtractionInput, ExtractionOutput, TextExtractor } from './ports.ts';

export const DOCX_MEDIA_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Bump when block boundaries, run indices or offsets change. */
export const DOCX_EXTRACTOR_VERSION = 'docx@1';

/** The main document part. Its absence means this is not a Word document. */
const DOCUMENT_PART = 'word/document.xml';

export class DocxError extends Error {}

// ---------------------------------------------------------------------------
// Block model
// ---------------------------------------------------------------------------

/** A paragraph, with its structural address and its runs. */
interface Block {
  /** XPath-like address, e.g. `body/p[4]` or `body/tbl[0]/tr[1]/tc[0]/p[0]`. */
  readonly path: string;
  readonly type: SourceUnitType;
  /** Heading level, or list indent level. */
  readonly depth?: number;
  /** Text of each run, in document order. Empty runs are kept so indices are stable. */
  readonly runs: readonly string[];
}

/** Style names Word uses for headings, mapped to a depth. */
function headingDepth(styleId: string | undefined): number | undefined {
  if (styleId === undefined) return undefined;
  // Matches `Heading1`, `heading 1`, `Ttulo1` is NOT matched — a localised style
  // name is not guessed at, it is simply not a heading for our purposes, and the
  // limitation is reported.
  const m = /^heading\s*([1-9])$/i.exec(styleId.replace(/[\s_-]+/g, ' ').trim());
  return m === null ? undefined : Number(m[1]);
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

interface ParseState {
  readonly blocks: Block[];
  readonly limitations: Set<string>;
}

/**
 * Walk the token stream and collect paragraph blocks.
 *
 * A single pass with an explicit element stack. Counters per container give each
 * paragraph a stable sibling index, which is what makes `blockPath` reproducible
 * for one extractor version.
 */
function parseDocument(xml: string, state: ParseState): void {
  const tokens = tokeniseXml(xml);

  /** Container stack, each with its own child counters. */
  const stack: { name: string; path: string; counters: Map<string, number> }[] = [
    { name: 'body', path: 'body', counters: new Map() },
  ];

  const nextIndex = (container: { counters: Map<string, number> }, key: string): number => {
    const n = container.counters.get(key) ?? 0;
    container.counters.set(key, n + 1);
    return n;
  };

  // Current paragraph under construction.
  let paragraphPath: string | null = null;
  let runs: string[] = [];
  let currentRun: string | null = null;
  let styleId: string | undefined;
  let listLevel: number | undefined;
  let inTable = false;

  // Depth counters for content we must ignore entirely.
  let deletedDepth = 0;
  let fieldInstructionDepth = 0;

  const flushRun = (): void => {
    if (currentRun !== null) {
      runs.push(currentRun);
      currentRun = null;
    }
  };

  const flushParagraph = (): void => {
    flushRun();
    if (paragraphPath !== null) {
      const depth = headingDepth(styleId);
      const type: SourceUnitType =
        depth !== undefined
          ? 'heading'
          : inTable
            ? 'tableCell'
            : listLevel !== undefined
              ? 'listItem'
              : 'paragraph';
      state.blocks.push({
        path: paragraphPath,
        type,
        ...(depth !== undefined ? { depth } : listLevel !== undefined ? { depth: listLevel } : {}),
        runs: [...runs],
      });
    }
    paragraphPath = null;
    runs = [];
    styleId = undefined;
    listLevel = undefined;
  };

  for (const token of tokens) {
    if (token.kind === 'open') {
      const name = localName(token.name);

      // --- content to ignore wholesale ---------------------------------
      if (name === 'del') {
        // Tracked deletion: not part of the accepted text.
        if (!token.selfClosing) deletedDepth++;
        state.limitations.add(
          'tracked deletions were excluded; the accepted text of the document was extracted',
        );
        continue;
      }
      if (name === 'instrText') {
        // Field instruction code (e.g. a TOC directive), not document content.
        if (!token.selfClosing) fieldInstructionDepth++;
        continue;
      }
      if (deletedDepth > 0 || fieldInstructionDepth > 0) continue;

      switch (name) {
        case 'tbl': {
          const container = stack[stack.length - 1] as (typeof stack)[number];
          const idx = nextIndex(container, 'tbl');
          stack.push({ name: 'tbl', path: `${container.path}/tbl[${idx}]`, counters: new Map() });
          inTable = true;
          state.limitations.add(
            'table cells are extracted as individual units in row-major order; merged cells are ' +
              'not reconstructed, and the table structure itself is not modelled',
          );
          break;
        }
        case 'tr': {
          const container = stack[stack.length - 1] as (typeof stack)[number];
          const idx = nextIndex(container, 'tr');
          stack.push({ name: 'tr', path: `${container.path}/tr[${idx}]`, counters: new Map() });
          break;
        }
        case 'tc': {
          const container = stack[stack.length - 1] as (typeof stack)[number];
          const idx = nextIndex(container, 'tc');
          stack.push({ name: 'tc', path: `${container.path}/tc[${idx}]`, counters: new Map() });
          break;
        }
        case 'p': {
          // A paragraph inside a paragraph does not occur in WordprocessingML;
          // flushing defensively keeps a malformed part from merging blocks.
          flushParagraph();
          const container = stack[stack.length - 1] as (typeof stack)[number];
          const idx = nextIndex(container, 'p');
          paragraphPath = `${container.path}/p[${idx}]`;
          if (token.selfClosing) flushParagraph();
          break;
        }
        case 'pStyle':
          styleId = token.attributes.get('w:val') ?? token.attributes.get('val');
          break;
        case 'ilvl': {
          const raw = token.attributes.get('w:val') ?? token.attributes.get('val');
          const parsed = raw === undefined ? Number.NaN : Number(raw);
          listLevel = Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
          break;
        }
        case 'numPr':
          // A numbered/bulleted paragraph. `ilvl` refines the level when present.
          if (listLevel === undefined) listLevel = 0;
          break;
        case 'r':
          // A new run begins. Start an empty one so run indices count every run,
          // including runs that contain only formatting.
          flushRun();
          currentRun = '';
          if (token.selfClosing) flushRun();
          break;
        case 'tab':
          if (currentRun !== null) currentRun += '\t';
          break;
        case 'br':
        case 'cr':
          if (currentRun !== null) currentRun += '\n';
          break;
        default:
          break;
      }
      continue;
    }

    if (token.kind === 'close') {
      const name = localName(token.name);
      if (name === 'del') {
        if (deletedDepth > 0) deletedDepth--;
        continue;
      }
      if (name === 'instrText') {
        if (fieldInstructionDepth > 0) fieldInstructionDepth--;
        continue;
      }
      if (deletedDepth > 0 || fieldInstructionDepth > 0) continue;

      switch (name) {
        case 'p':
          flushParagraph();
          break;
        case 'r':
          flushRun();
          break;
        case 'tc':
        case 'tr':
        case 'tbl':
          if ((stack[stack.length - 1] as (typeof stack)[number]).name === name) stack.pop();
          if (name === 'tbl') inTable = stack.some((s) => s.name === 'tbl');
          break;
        default:
          break;
      }
      continue;
    }

    // --- text ------------------------------------------------------------
    if (deletedDepth > 0 || fieldInstructionDepth > 0) continue;
    if (currentRun !== null) currentRun += token.text;
  }

  flushParagraph();
}

/**
 * Text of a block, and the run boundaries within it.
 *
 * Returned together because a unit needs the text and the run range that produced
 * it, and deriving one from the other twice invites them to disagree.
 */
function blockText(block: Block): { text: string; runStart: number; runEnd: number } {
  return { text: block.runs.join(''), runStart: 0, runEnd: block.runs.length };
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

function describe(text: string): { language: string; direction: Direction } {
  const n = normalise(text);
  return { language: n.primaryLanguage, direction: n.direction };
}

/**
 * Extract a DOCX into canonical text plus anchored units.
 *
 * The canonical text is **assembled here**, one block per line. That differs from
 * the V1 text adapters, where the canonical text was the decoded file itself: a
 * DOCX has no linear text to store, so the extractor defines it. Offsets are
 * taken against that assembled string, which is exactly what gets persisted, so
 * an anchor and the stored text can never be out of step.
 */
export function extractDocx(sourceId: string, data: Uint8Array): ExtractionOutput {
  const state: ParseState = { blocks: [], limitations: new Set() };

  let entries: readonly ZipEntry[];
  try {
    entries = readZipEntries(data);
  } catch (err) {
    throw new DocxError(
      `not a readable DOCX: ${err instanceof ZipError ? err.message : String(err)}`,
    );
  }

  const documentEntry = entries.find((e) => e.name === DOCUMENT_PART);
  if (documentEntry === undefined) {
    throw new DocxError(
      `the archive contains no '${DOCUMENT_PART}', so it is not a Word document. ` +
        `Parts found: ${entries.slice(0, 8).map((e) => e.name).join(', ')}`,
    );
  }

  let xml: string;
  try {
    xml = new TextDecoder('utf-8', { fatal: true }).decode(readZipEntry(data, documentEntry));
  } catch (err) {
    throw new DocxError(
      `'${DOCUMENT_PART}' could not be decoded as UTF-8: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  try {
    parseDocument(xml, state);
  } catch (err) {
    throw new DocxError(
      `'${DOCUMENT_PART}' is not well-formed: ${err instanceof XmlError ? err.message : String(err)}`,
    );
  }

  // Parts we knowingly do not read. Reported rather than left for a user to
  // discover by noticing something missing.
  const partNames = new Set(entries.map((e) => e.name));
  if (partNames.has('word/footnotes.xml') || partNames.has('word/endnotes.xml')) {
    state.limitations.add('footnotes and endnotes were not extracted');
  }
  if (partNames.has('word/comments.xml')) {
    state.limitations.add('comments were not extracted');
  }
  if ([...partNames].some((n) => n.startsWith('word/header') || n.startsWith('word/footer'))) {
    state.limitations.add('headers and footers were not extracted');
  }
  if ([...partNames].some((n) => n.startsWith('word/media/'))) {
    state.limitations.add(
      'embedded images were not extracted; image analysis arrives with the multimodal slice',
    );
  }

  // --- assemble the canonical text and anchor every block ----------------
  const units: ExtractedUnit[] = [];
  const pieces: string[] = [];
  let offset = 0;

  for (const block of state.blocks) {
    const { text, runStart, runEnd } = blockText(block);

    // NFC per block, then measured in CODE POINTS throughout. Mixing UTF-16
    // indices with code-point offsets here would put every anchor after the first
    // supplementary-plane character in the wrong place.
    const normalisedBlock = text.normalize('NFC');
    const cps = toCodePoints(normalisedBlock);

    let s = 0;
    let e = cps.length;
    while (s < e && isTrimmable(cps[s] as string)) s++;
    while (e > s && isTrimmable(cps[e - 1] as string)) e--;

    if (e === s) {
      // An empty paragraph is real in a document but is not citable evidence, so
      // it contributes a blank line to the canonical text and no unit. The line
      // is kept because dropping it would shift every later offset.
      pieces.push(normalisedBlock);
      offset += cps.length + 1; // +1 for the joining '\n'
      continue;
    }

    const content = cps.slice(s, e).join('');
    const charStart = offset + s;
    const charEnd = offset + e;


    const described = describe(content);
    const anchor: ProvenanceAnchor = {
      sourceId,
      target: {
        kind: 'docx_block',
        blockPath: block.path,
        runStart,
        runEnd,
        charStart,
        charEnd,
      },
      quote: content,
      quoteChecksum: spanChecksum(content),
      language: described.language,
      direction: described.direction,
      precision: 'exact',
      extractorVersion: DOCX_EXTRACTOR_VERSION,
    };

    units.push({
      ordinal: units.length,
      type: block.type,
      text: content,
      language: described.language,
      direction: described.direction,
      ...(block.depth === undefined ? {} : { depth: block.depth }),
      anchor,
    });

    pieces.push(normalisedBlock);
    offset += toCodePoints(normalisedBlock).length + 1; // +1 for the joining '\n'
  }

  const canonicalText = pieces.join('\n');

  return {
    extractorVersion: DOCX_EXTRACTOR_VERSION,
    canonicalText,
    units,
    // A DOCX has no pages until it is laid out by a renderer. Reporting none is a
    // fact about the format, not a gap in the adapter.
    pages: [],
    limitations: [...state.limitations].sort(),
  };
}

/** The DOCX `TextExtractor`. */
export function docxExtractor(): TextExtractor {
  return {
    id: DOCX_EXTRACTOR_VERSION,
    supports: (mediaType) => mediaType === DOCX_MEDIA_TYPE,
    extract: (input: ExtractionInput) => extractDocx(input.sourceId, input.data),
  };
}
