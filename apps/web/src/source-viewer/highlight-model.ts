/**
 * The highlight model — **DOM-free by design**.
 *
 * [ADR-0039](../../../../docs/adr/ADR-0039-react-presentation-layer.md) §5 and
 * [provenance-and-anchoring.md](../../../../docs/20-domain/provenance-and-anchoring.md) §6:
 * **the server computes highlight ranges; this client paints them.**
 *
 * ## The one rule this file exists to enforce
 *
 * **The client NEVER searches rendered text to locate a highlight.** There is no
 * `indexOf`, no `match`, no normalisation and no trimming anywhere in this
 * module. Offsets arrive from the server as code points over the same NFC,
 * logical-order text it hashed, and are used exactly as given.
 *
 * Searching would find *something* most of the time and the wrong span the rest —
 * silently, because a wrong highlight looks exactly like a right one.
 *
 * ## The server has already done the hard part
 *
 * A `HighlightRange` arrives **pre-segmented into direction runs**. Each
 * `HighlightSegment` carries its own `direction`, `language` and — crucially —
 * `counterFlow`, meaning *this run reads against the document's base direction*.
 * The client does not compute any of that, and must not: `@asdp/text`'s bidi
 * analysis is server-side and stays there.
 *
 * ## Why offsets are code points, not UTF-16 units
 *
 * JavaScript string indices are UTF-16 code units. A non-BMP character occupies
 * **two** units and **one** code point, so slicing a code-point offset with
 * `String.prototype.slice` cuts it in half and shifts every later highlight.
 * `piecesFor` converts once, with the code-point-aware string iterator.
 *
 * Kept out of any component so all of it is testable under `node --test` with no
 * DOM at all.
 */

import type { HighlightRange, HighlightSegment } from '@asdp/schemas';

/**
 * `TextDirection` is exported from `@asdp/schemas` as a zod VALUE, not a type,
 * so the type is derived from the shape that uses it rather than restated.
 * Restating `'ltr' | 'rtl' | 'neutral'` here would be a second copy of a
 * vocabulary the contract package owns.
 */
export type TextDirection = HighlightSegment['direction'];

export type { HighlightRange, HighlightSegment };

/** One piece of the document as it will be rendered. */
export interface Piece {
  readonly text: string;
  readonly direction: TextDirection;
  /** Present when this piece is part of a highlight. */
  readonly range?: HighlightRange;
  readonly segment?: HighlightSegment;
  readonly key: string;
}

/**
 * A range is paintable when it has a text extent that still means something.
 *
 * `broken` is excluded: a broken anchor has no trustworthy span, and painting
 * one would be exactly the best-guess highlight ADR-0039 forbids. It is reported
 * by `brokenRanges` instead, so the UI shows it in place with its reason.
 *
 * Image ranges are excluded here too — they are rectangles over stored pixels,
 * not text extents, and `start`/`end` are deliberately zero for them.
 */
export function isPaintable(range: HighlightRange): boolean {
  if (range.resolution === 'broken') return false;
  if (range.imageId !== undefined) return false;
  return range.segments.length > 0 && range.end > range.start;
}

/**
 * Split text into an ordered, non-overlapping run of pieces.
 *
 * Highlighted pieces come from the **server's** segments, so each carries the
 * direction the server determined. Plain pieces take the document's base
 * direction.
 *
 * Overlaps resolve by earliest start, then longest; anything overlapping an
 * already-emitted highlight is skipped. Deterministic, and it never loses text:
 * concatenating every piece's `text` reproduces the input exactly.
 */
export function piecesFor(
  text: string,
  ranges: readonly HighlightRange[],
  documentDirection: TextDirection,
): readonly Piece[] {
  // ONE conversion, code-point aware. Index i is code point i.
  const codePoints = Array.from(text);
  const total = codePoints.length;

  const paintable = ranges
    .filter(isPaintable)
    .filter((r) => r.start >= 0 && r.end <= total)
    .slice()
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const pieces: Piece[] = [];
  let cursor = 0;
  let emitted = 0;

  const plain = (from: number, to: number): void => {
    if (to <= from) return;
    pieces.push({
      text: codePoints.slice(from, to).join(''),
      direction: documentDirection,
      key: `plain-${from}`,
    });
  };

  for (const range of paintable) {
    if (range.start < cursor) continue;
    plain(cursor, range.start);

    // Walk the server's segments in order. Any gap between them inside the
    // range is still part of the highlight, so it is emitted with the range's
    // base direction rather than dropped.
    const segments = range.segments.slice().sort((a, b) => a.start - b.start);
    let inner = range.start;
    for (const segment of segments) {
      const from = Math.max(segment.start, inner);
      const to = Math.min(segment.end, range.end);
      if (to <= from) continue;
      if (from > inner) {
        pieces.push({
          text: codePoints.slice(inner, from).join(''),
          direction: range.baseDirection,
          range,
          key: `hl-${emitted}-gap-${inner}`,
        });
      }
      pieces.push({
        text: codePoints.slice(from, to).join(''),
        direction: segment.direction,
        range,
        segment,
        key: `hl-${emitted}-seg-${from}`,
      });
      inner = to;
    }
    if (inner < range.end) {
      pieces.push({
        text: codePoints.slice(inner, range.end).join(''),
        direction: range.baseDirection,
        range,
        key: `hl-${emitted}-tail-${inner}`,
      });
    }

    emitted += 1;
    cursor = range.end;
  }

  plain(cursor, total);
  return pieces;
}

/** Ranges that no longer resolve. Shown in place, never painted. */
export function brokenRanges(ranges: readonly HighlightRange[]): readonly HighlightRange[] {
  return ranges.filter((r) => r.resolution === 'broken');
}

/**
 * The accessible name for a highlighted piece.
 *
 * **W8: a highlight is never identified by colour alone.** This is what a screen
 * reader announces, and it is also why `resolution` appears in it: ADR-0038 says
 * `content_unverified` must never be made to look like `resolved` — in a column
 * or in a pixel.
 */
export function pieceLabel(piece: Piece): string {
  const range = piece.range;
  if (range === undefined) return '';
  const parts: string[] = ['evidence'];
  if (range.resolution !== 'resolved') parts.push(resolutionName(range.resolution));
  if (piece.segment?.counterFlow === true) parts.push('counter-flow');
  parts.push(directionName(piece.direction));
  if (piece.segment?.language !== undefined) parts.push(piece.segment.language);
  return parts.join(', ');
}

export function resolutionName(resolution: HighlightRange['resolution']): string {
  return resolution === 'content_unverified' ? 'content unverified'
    : resolution === 'drifted' ? 'drifted'
    : resolution === 'broken' ? 'broken'
    : 'resolved';
}

export function directionName(direction: TextDirection): string {
  return direction === 'rtl' ? 'right to left'
    : direction === 'ltr' ? 'left to right'
    : 'neutral';
}

/**
 * The `dir` attribute for a piece.
 *
 * `neutral` yields `auto` — the one place the browser is allowed to decide, and
 * only because the server has said it has no opinion either.
 */
export function dirAttribute(direction: TextDirection): 'ltr' | 'rtl' | 'auto' {
  return direction === 'neutral' ? 'auto' : direction;
}
