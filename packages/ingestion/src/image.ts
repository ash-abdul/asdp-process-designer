/**
 * Image intake — format recognition and dimension reading.
 *
 * Dimensions matter more than they look: [ADR-0038](../../../docs/adr/ADR-0038-target-versus-content-verification.md)
 * target verification checks that an `image_region` rectangle lies **within the
 * image bounds**, and without the real width and height that check is
 * unenforceable. So this is not metadata — it is one of the four things that make
 * visual provenance verifiable at all.
 *
 * Read from file headers with **no dependency**. Each format needs a handful of
 * bytes at a known offset, and a decoder would be a large dependency bought for
 * two integers (**A4**).
 *
 * Refuses rather than guesses. A truncated or malformed header yields a named
 * error, never a default size — a wrong bound would silently let an out-of-bounds
 * rectangle pass verification.
 */

export class ImageError extends Error {}

export interface ImageInfo {
  readonly mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | 'image/bmp';
  readonly width: number;
  readonly height: number;
}

function u16be(d: Uint8Array, at: number): number {
  const a = d[at];
  const b = d[at + 1];
  if (a === undefined || b === undefined) throw new ImageError(`truncated header at ${at}`);
  return (a << 8) | b;
}

function u32be(d: Uint8Array, at: number): number {
  const a = d[at];
  const b = d[at + 1];
  const c = d[at + 2];
  const e = d[at + 3];
  if (a === undefined || b === undefined || c === undefined || e === undefined) {
    throw new ImageError(`truncated header at ${at}`);
  }
  return ((a << 24) | (b << 16) | (c << 8) | e) >>> 0;
}

function u32le(d: Uint8Array, at: number): number {
  const a = d[at];
  const b = d[at + 1];
  const c = d[at + 2];
  const e = d[at + 3];
  if (a === undefined || b === undefined || c === undefined || e === undefined) {
    throw new ImageError(`truncated header at ${at}`);
  }
  return ((a | (b << 8) | (c << 16) | (e << 24)) >>> 0);
}

function i32le(d: Uint8Array, at: number): number {
  const v = u32le(d, at);
  // BMP heights are signed: a negative height means a top-down bitmap.
  return v > 0x7fffffff ? v - 0x100000000 : v;
}

function startsWith(d: Uint8Array, bytes: readonly number[], at = 0): boolean {
  if (d.length < at + bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) if (d[at + i] !== bytes[i]) return false;
  return true;
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const GIF87 = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61];
const GIF89 = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
const BMP = [0x42, 0x4d];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

/**
 * Read an image's format and dimensions, or refuse.
 *
 * Recognition is by content only. The filename is never consulted — an image is
 * admitted on the same terms as every other source.
 */
export function readImageInfo(data: Uint8Array): ImageInfo {
  // --- PNG: IHDR is always the first chunk ------------------------------
  if (startsWith(data, PNG)) {
    // 8 signature + 4 length + 4 type, then width and height.
    if (!startsWith(data, [0x49, 0x48, 0x44, 0x52], 12)) {
      throw new ImageError('PNG has no IHDR chunk where the format requires one');
    }
    const width = u32be(data, 16);
    const height = u32be(data, 20);
    if (width === 0 || height === 0) throw new ImageError('PNG reports a zero dimension');
    return { mediaType: 'image/png', width, height };
  }

  // --- GIF: logical screen descriptor, little-endian --------------------
  if (startsWith(data, GIF87) || startsWith(data, GIF89)) {
    const a = data[6];
    const b = data[7];
    const c = data[8];
    const e = data[9];
    if (a === undefined || b === undefined || c === undefined || e === undefined) {
      throw new ImageError('GIF header is truncated');
    }
    const width = a | (b << 8);
    const height = c | (e << 8);
    if (width === 0 || height === 0) throw new ImageError('GIF reports a zero dimension');
    return { mediaType: 'image/gif', width, height };
  }

  // --- BMP: DIB header --------------------------------------------------
  if (startsWith(data, BMP)) {
    const dibSize = u32le(data, 14);
    if (dibSize < 12) throw new ImageError(`unsupported BMP DIB header size ${dibSize}`);
    // BITMAPCOREHEADER (12) uses 16-bit dimensions; everything later uses 32-bit.
    const width = dibSize === 12 ? u16be(data, 19) : u32le(data, 18);
    const height = dibSize === 12 ? u16be(data, 21) : Math.abs(i32le(data, 22));
    if (width === 0 || height === 0) throw new ImageError('BMP reports a zero dimension');
    return { mediaType: 'image/bmp', width, height };
  }

  // --- WEBP: RIFF container --------------------------------------------
  if (startsWith(data, RIFF) && startsWith(data, WEBP, 8)) {
    return readWebp(data);
  }

  // --- JPEG: scan the segment chain for a start-of-frame marker --------
  if (startsWith(data, [0xff, 0xd8, 0xff])) {
    return readJpeg(data);
  }

  throw new ImageError('content is not a recognised image format (PNG, JPEG, WEBP, GIF or BMP)');
}

/**
 * WEBP dimensions.
 *
 * Three sub-formats, each storing them differently. Handled explicitly rather
 * than approximated, because a wrong bound weakens target verification.
 */
function readWebp(data: Uint8Array): ImageInfo {
  const fourcc = String.fromCharCode(...data.subarray(12, 16));

  if (fourcc === 'VP8 ') {
    // Lossy. After the 3-byte frame tag comes the start code 9d 01 2a, then two
    // 16-bit fields whose low 14 bits are the dimensions; the top 2 bits are a
    // scale factor and are not part of the size.
    if (!startsWith(data, [0x9d, 0x01, 0x2a], 23)) {
      throw new ImageError('WEBP (VP8) is missing the keyframe start code');
    }
    const a = data[26];
    const b = data[27];
    const c = data[28];
    const e = data[29];
    if (a === undefined || b === undefined || c === undefined || e === undefined) {
      throw new ImageError('WEBP (VP8) header is truncated');
    }
    const w = (a | (b << 8)) & 0x3fff;
    const h = (c | (e << 8)) & 0x3fff;
    if (w === 0 || h === 0) throw new ImageError('WEBP (VP8) reports a zero dimension');
    return { mediaType: 'image/webp', width: w, height: h };
  }

  if (fourcc === 'VP8L') {
    // Lossless: 14-bit dimensions minus one, bit-packed after a signature byte.
    const bits = u32le(data, 21);
    const w = (bits & 0x3fff) + 1;
    const h = ((bits >>> 14) & 0x3fff) + 1;
    return { mediaType: 'image/webp', width: w, height: h };
  }

  if (fourcc === 'VP8X') {
    // Extended: 24-bit canvas dimensions minus one.
    const a = data[24];
    const b = data[25];
    const c = data[26];
    const d2 = data[27];
    const e = data[28];
    const f = data[29];
    if ([a, b, c, d2, e, f].some((v) => v === undefined)) {
      throw new ImageError('WEBP (VP8X) header is truncated');
    }
    const w = ((a as number) | ((b as number) << 8) | ((c as number) << 16)) + 1;
    const h = ((d2 as number) | ((e as number) << 8) | ((f as number) << 16)) + 1;
    return { mediaType: 'image/webp', width: w, height: h };
  }

  throw new ImageError(`unsupported WEBP sub-format '${fourcc}'`);
}

/**
 * JPEG dimensions.
 *
 * Requires walking the segment chain: there is no fixed offset, because any
 * number of application and comment segments may precede the frame header.
 */
function readJpeg(data: Uint8Array): ImageInfo {
  let at = 2;
  const limit = data.length;

  while (at + 3 < limit) {
    if (data[at] !== 0xff) {
      throw new ImageError(`malformed JPEG: expected a marker at byte ${at}`);
    }
    const marker = data[at + 1] as number;

    // Padding and standalone markers carry no length field.
    if (marker === 0xff) {
      at++;
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
      at += 2;
      continue;
    }

    const length = u16be(data, at + 2);
    if (length < 2) throw new ImageError('malformed JPEG segment length');

    // Start-of-frame markers, excluding DHT (c4), JPG (c8) and DAC (cc).
    const isFrameHeader =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isFrameHeader) {
      const height = u16be(data, at + 5);
      const width = u16be(data, at + 7);
      if (width === 0 || height === 0) throw new ImageError('JPEG reports a zero dimension');
      return { mediaType: 'image/jpeg', width, height };
    }
    at += 2 + length;
  }

  throw new ImageError('JPEG contains no start-of-frame header, so its dimensions are unknown');
}

/** True when the bytes look like a supported image. Cheap pre-check. */
export function looksLikeImage(data: Uint8Array): boolean {
  return (
    startsWith(data, PNG) ||
    startsWith(data, GIF87) ||
    startsWith(data, GIF89) ||
    startsWith(data, BMP) ||
    startsWith(data, [0xff, 0xd8, 0xff]) ||
    (startsWith(data, RIFF) && startsWith(data, WEBP, 8))
  );
}
