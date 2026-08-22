/**
 * Highlight ranges for the source viewer.
 *
 * provenance-and-anchoring.md §6: the viewer renders highlights from a
 * logical-range → visual-segment map produced HERE. It must never reconstruct a
 * highlight by re-searching the rendered text in the browser — that reintroduces
 * every normalisation and direction bug the pipeline exists to eliminate, and it
 * silently disagrees with the anchor whenever the two searches differ.
 *
 * One logical range may paint SEVERAL segments. That is not an edge case in a
 * bilingual product: any Arabic range containing a Latin term, a number, or a
 * URL is visually discontiguous while remaining one logical span.
 *
 * Direction classification is delegated to `@asdp/text`, which owns it
 * (ADR-0023 rule 1). Nothing here re-derives what is Arabic.
 */

import { baseDirection, sliceByCodePoints, codePointLength, type Direction } from '@asdp/text';
import { resolveTextAnchor, textOffsetsOf } from '@asdp/provenance';
import type { HighlightRange, HighlightSegment, ProvenanceAnchor } from '@asdp/schemas';
import { describeSpan } from './units.ts';

/**
 * Split a text range into direction-homogeneous segments that TILE the range.
 *
 * Tiling matters: a viewer paints what it is given, so a gap between segments is
 * an unhighlighted character inside a highlighted quote. Neutral runs (spaces,
 * punctuation, digits) extend the current segment rather than splitting it,
 * matching how `normalise` builds its runs — otherwise every space would start a
 * new segment and the map would be useless.
 */
export function segmentRange(
  storedText: string,
  start: number,
  end: number,
  base: Direction,
): HighlightSegment[] {
  const slice = sliceByCodePoints(storedText, start, end);
  if (slice.length === 0) return [];

  const segments: HighlightSegment[] = [];
  let runStart = start;
  let runDirection: Direction | null = null;
  let offset = start;

  const emit = (until: number, direction: Direction): void => {
    if (until <= runStart) return;
    const text = sliceByCodePoints(storedText, runStart, until);
    const described = describeSpan(text);
    segments.push({
      start: runStart,
      end: until,
      text,
      language: described.language,
      direction,
      counterFlow: direction !== 'neutral' && direction !== base,
    });
  };

  for (const ch of slice) {
    const d = baseDirection(ch);
    if (d !== 'neutral') {
      if (runDirection === null) {
        // Leading neutrals join the first strong run rather than becoming a
        // segment of their own — a leading space is part of the highlight.
        runDirection = d;
      } else if (d !== runDirection) {
        emit(offset, runDirection);
        runStart = offset;
        runDirection = d;
      }
    }
    offset++;
  }

  // Trailing neutrals stay with the final run. A range that is entirely neutral
  // is one neutral segment, which is correct rather than a degenerate case.
  emit(end, runDirection ?? 'neutral');
  return segments;
}

/**
 * Build the highlight range for an anchor against the stored source text.
 *
 * The anchor is RESOLVED first, never trusted. A drifted anchor highlights its
 * repaired location and says so; a broken anchor highlights nothing and says so.
 * Painting a broken anchor's recorded offsets would show the user a confident
 * highlight over the wrong text, which is the exact failure ADR-0008 exists to
 * prevent.
 */
export function highlightForAnchor(
  anchor: ProvenanceAnchor,
  storedText: string,
): HighlightRange {
  // Any target carrying code-point offsets is highlightable — `text_range`, and
  // `docx_block` / `pdf_region` when they recorded them. One predicate, shared
  // with the resolver, so the two can never disagree about what is verifiable.
  const offsets = textOffsetsOf(anchor.target);
  if (offsets === null) {
    return {
      sourceId: anchor.sourceId,
      start: 0,
      end: 0,
      baseDirection: 'neutral',
      segments: [],
      resolution: 'broken',
      detail:
        `anchor kind '${anchor.target.kind}' carries no text offsets; it is highlighted by its ` +
        'own adapter against a page image or a parsed model, not against source text',
    };
  }

  const resolution = resolveTextAnchor(anchor, storedText);
  if (resolution.status === 'broken') {
    return {
      sourceId: anchor.sourceId,
      start: offsets.start,
      end: offsets.end,
      baseDirection: anchor.direction,
      segments: [],
      resolution: 'broken',
      ...(resolution.detail === undefined ? {} : { detail: resolution.detail }),
    };
  }

  const start = resolution.repairedStart ?? offsets.start;
  const end = resolution.repairedEnd ?? offsets.end;
  const base = baseDirection(sliceByCodePoints(storedText, start, end));

  return {
    sourceId: anchor.sourceId,
    start,
    end,
    baseDirection: base === 'neutral' ? anchor.direction : base,
    segments: segmentRange(storedText, start, end, base),
    resolution: resolution.status,
    ...(resolution.detail === undefined ? {} : { detail: resolution.detail }),
  };
}

/**
 * Build a highlight for an explicit offset range, for a viewer selection that
 * has no anchor yet. Bounds are clamped rather than rejected, because a viewer
 * scrolling past the end of a document is not an error.
 */
export function highlightForRange(
  sourceId: string,
  storedText: string,
  start: number,
  end: number,
): HighlightRange {
  const length = codePointLength(storedText);
  const from = Math.max(0, Math.min(start, length));
  const to = Math.max(from, Math.min(end, length));
  const base = baseDirection(sliceByCodePoints(storedText, from, to));

  return {
    sourceId,
    start: from,
    end: to,
    baseDirection: base,
    segments: segmentRange(storedText, from, to, base),
    resolution: 'resolved',
  };
}
