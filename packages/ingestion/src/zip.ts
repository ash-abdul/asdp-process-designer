/**
 * Minimal ZIP reader.
 *
 * A DOCX is a ZIP of XML parts, so reading one needs an inflater. `node:zlib`
 * already provides raw DEFLATE, which leaves only the container format — the
 * central directory and local file headers. That is the ~150 lines below, and it
 * is why V2 adds no dependency (**A4**: avoid unnecessary ones).
 *
 * Deliberately a READER only. There is no writer, because ASDP never produces a
 * DOCX, and an unused writer is surface area with no purpose.
 *
 * Refuses rather than guesses. An archive this cannot represent faithfully —
 * ZIP64, encryption, a multi-disk spanned archive — is rejected by name. A
 * partially-understood archive would yield partial text, and partial text with
 * confident anchors is the failure mode the whole intake design exists to
 * prevent.
 */

import { inflateRawSync } from 'node:zlib';

export class ZipError extends Error {}

/** One entry in the archive. */
export interface ZipEntry {
  readonly name: string;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly compressionMethod: number;
  /** Offset of the local file header. */
  readonly localHeaderOffset: number;
  readonly crc32: number;
}

const SIG_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const SIG_CENTRAL_FILE_HEADER = 0x02014b50;
const SIG_LOCAL_FILE_HEADER = 0x04034b50;
const SIG_ZIP64_END_LOCATOR = 0x07064b50;

const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

/** ZIP64 sentinel: a field of all-ones means "see the ZIP64 extra field". */
const ZIP64_SENTINEL_32 = 0xffffffff;
const ZIP64_SENTINEL_16 = 0xffff;

function u16(b: Uint8Array, at: number): number {
  const lo = b[at];
  const hi = b[at + 1];
  if (lo === undefined || hi === undefined) throw new ZipError(`truncated archive at ${at}`);
  return lo | (hi << 8);
}

function u32(b: Uint8Array, at: number): number {
  const a = b[at];
  const c = b[at + 1];
  const d = b[at + 2];
  const e = b[at + 3];
  if (a === undefined || c === undefined || d === undefined || e === undefined) {
    throw new ZipError(`truncated archive at ${at}`);
  }
  // `>>> 0` because a 32-bit value with the high bit set would otherwise be
  // negative, and offsets must never be negative.
  return ((a | (c << 8) | (d << 16) | (e << 24)) >>> 0);
}

/**
 * Locate the End of Central Directory record.
 *
 * Scanned backwards because the record sits at the end but may be followed by a
 * comment of up to 64 KiB. Bounded to that maximum plus the record size, so a
 * corrupt file cannot make this walk the whole archive.
 */
function findEndOfCentralDirectory(data: Uint8Array): number {
  const maxComment = 0xffff;
  const minRecord = 22;
  const from = Math.max(0, data.length - (maxComment + minRecord));
  for (let i = data.length - minRecord; i >= from; i--) {
    if (u32(data, i) === SIG_END_OF_CENTRAL_DIRECTORY) return i;
  }
  throw new ZipError('not a ZIP archive: no end-of-central-directory record found');
}

/** Read the central directory. */
export function readZipEntries(data: Uint8Array): readonly ZipEntry[] {
  const eocd = findEndOfCentralDirectory(data);

  // ZIP64 is refused rather than mis-read. The locator sits immediately before
  // the EOCD when present.
  if (eocd >= 20 && u32(data, eocd - 20) === SIG_ZIP64_END_LOCATOR) {
    throw new ZipError('ZIP64 archives are not supported; re-save the document without ZIP64');
  }

  const disk = u16(data, eocd + 4);
  const startDisk = u16(data, eocd + 6);
  if (disk !== 0 || startDisk !== 0) {
    throw new ZipError('multi-disk (spanned) ZIP archives are not supported');
  }

  const count = u16(data, eocd + 10);
  const directorySize = u32(data, eocd + 12);
  const directoryOffset = u32(data, eocd + 16);

  if (count === ZIP64_SENTINEL_16 || directorySize === ZIP64_SENTINEL_32 || directoryOffset === ZIP64_SENTINEL_32) {
    throw new ZipError('ZIP64 archives are not supported; re-save the document without ZIP64');
  }
  if (directoryOffset + directorySize > data.length) {
    throw new ZipError('central directory extends beyond the end of the archive');
  }

  const entries: ZipEntry[] = [];
  let at = directoryOffset;

  for (let i = 0; i < count; i++) {
    if (u32(data, at) !== SIG_CENTRAL_FILE_HEADER) {
      throw new ZipError(`malformed central directory entry ${i}`);
    }
    const flags = u16(data, at + 8);
    // Bit 0 is the encryption flag. An encrypted part cannot be read, and
    // returning its ciphertext as text would be worse than refusing.
    if ((flags & 0x0001) !== 0) {
      throw new ZipError('encrypted ZIP entries are not supported');
    }

    const compressionMethod = u16(data, at + 10);
    const crc32 = u32(data, at + 16);
    const compressedSize = u32(data, at + 20);
    const uncompressedSize = u32(data, at + 24);
    const nameLength = u16(data, at + 28);
    const extraLength = u16(data, at + 30);
    const commentLength = u16(data, at + 32);
    const localHeaderOffset = u32(data, at + 42);

    if (compressedSize === ZIP64_SENTINEL_32 || uncompressedSize === ZIP64_SENTINEL_32 || localHeaderOffset === ZIP64_SENTINEL_32) {
      throw new ZipError('ZIP64 archives are not supported; re-save the document without ZIP64');
    }

    const nameBytes = data.subarray(at + 46, at + 46 + nameLength);
    // OOXML part names are ASCII in practice; UTF-8 decodes it either way.
    const name = new TextDecoder('utf-8').decode(nameBytes);

    entries.push({
      name,
      compressedSize,
      uncompressedSize,
      compressionMethod,
      localHeaderOffset,
      crc32,
    });

    at += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

/**
 * Read and decompress one entry.
 *
 * The local header is re-read rather than trusted from the central directory,
 * because the two can disagree and the local header is what actually precedes
 * the data.
 */
export function readZipEntry(data: Uint8Array, entry: ZipEntry): Uint8Array {
  const at = entry.localHeaderOffset;
  if (u32(data, at) !== SIG_LOCAL_FILE_HEADER) {
    throw new ZipError(`malformed local header for '${entry.name}'`);
  }
  const nameLength = u16(data, at + 26);
  const extraLength = u16(data, at + 28);
  const dataStart = at + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;

  if (dataEnd > data.length) {
    throw new ZipError(`entry '${entry.name}' extends beyond the end of the archive`);
  }
  const compressed = data.subarray(dataStart, dataEnd);

  switch (entry.compressionMethod) {
    case METHOD_STORED:
      return compressed;
    case METHOD_DEFLATE:
      try {
        return new Uint8Array(inflateRawSync(compressed));
      } catch (err) {
        throw new ZipError(
          `entry '${entry.name}' failed to inflate: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    default:
      throw new ZipError(
        `entry '${entry.name}' uses unsupported compression method ${entry.compressionMethod}; ` +
          'only stored and deflate are supported',
      );
  }
}

/** Read a named entry as UTF-8 text, or undefined when absent. */
export function readZipTextEntry(data: Uint8Array, name: string): string | undefined {
  const entry = readZipEntries(data).find((e) => e.name === name);
  if (entry === undefined) return undefined;
  const bytes = readZipEntry(data, entry);
  // `fatal` for the same reason the ingest guard uses it: a lenient decode
  // substitutes U+FFFD and yields corrupted text that still anchors.
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/** True when the bytes begin with a local file header. Cheap pre-check. */
export function looksLikeZip(data: Uint8Array): boolean {
  return data.length >= 4 && u32(data, 0) === SIG_LOCAL_FILE_HEADER;
}
