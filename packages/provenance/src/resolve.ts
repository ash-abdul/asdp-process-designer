/**
 * Anchor resolution.
 *
 * Given an anchor and the stored source, return the exact region and verify it.
 * Three outcomes (provenance-and-anchoring.md §3):
 *
 *   RESOLVED  checksum matches — the anchor is sound
 *   DRIFTED   the quote is found at a small offset delta — repair and flag
 *   BROKEN    the quote is not found — hard error; dependent evidence is
 *             quarantined and its requirements flagged
 *
 * Drift repair is bounded and recorded. It exists because re-parsing with an
 * upgraded adapter can shift offsets slightly; it must never become a
 * general-purpose fuzzy fallback that hides real breakage.
 */

import { sliceByCodePoints, buildMatchFormCollapsed, toMatchText } from '@asdp/text';
import type { ProvenanceAnchor } from './anchor.ts';
import { spanChecksum } from './checksum.ts';

export type ResolutionStatus = 'resolved' | 'drifted' | 'broken';

export interface Resolution {
  readonly status: ResolutionStatus;
  /** The text actually found at the anchored location. */
  readonly text?: string;
  /** For a drifted anchor, the corrected offsets. */
  readonly repairedStart?: number;
  readonly repairedEnd?: number;
  /** Why the anchor failed or drifted. */
  readonly detail?: string;
}

/** Maximum offset shift tolerated as drift rather than breakage. */
const MAX_DRIFT = 64;

/**
 * Resolve a text-offset anchor against the stored normalised text.
 *
 * Only `text_range` anchors (and `pdf_region` anchors that carry offsets) can be
 * verified against text. Region- and element-addressed anchors are verified by
 * their own adapters against page images or parsed models.
 */
export function resolveTextAnchor(anchor: ProvenanceAnchor, storedText: string): Resolution {
  const target = anchor.target;
  let start: number;
  let end: number;

  if (target.kind === 'text_range') {
    start = target.charStart;
    end = target.charEnd;
  } else if (target.kind === 'pdf_region' && target.charStart !== undefined && target.charEnd !== undefined) {
    start = target.charStart;
    end = target.charEnd;
  } else {
    return {
      status: 'broken',
      detail: `anchor kind '${target.kind}' carries no text offsets; verify it with its own adapter`,
    };
  }

  if (start < 0 || end < start) {
    return { status: 'broken', detail: `invalid offsets ${start}..${end}` };
  }

  const found = sliceByCodePoints(storedText, start, end);
  if (spanChecksum(found) === anchor.quoteChecksum) {
    return { status: 'resolved', text: found };
  }

  // Bounded drift repair: search a window around the recorded offsets for the
  // quote, tolerantly (match form), and correct the offsets if found.
  const repaired = findQuoteNear(storedText, anchor.quote, start, MAX_DRIFT);
  if (repaired !== null) {
    return {
      status: 'drifted',
      text: sliceByCodePoints(storedText, repaired.start, repaired.end),
      repairedStart: repaired.start,
      repairedEnd: repaired.end,
      detail: `offsets shifted by ${repaired.start - start}; repaired and flagged for review`,
    };
  }

  return {
    status: 'broken',
    detail: `checksum mismatch and quote not found within ±${MAX_DRIFT} code points`,
  };
}

/**
 * Search for a quote near an expected offset, using the tolerant match form.
 * Returns stored-form offsets, or null.
 */
function findQuoteNear(
  storedText: string,
  quote: string,
  expectedStart: number,
  window: number,
): { start: number; end: number } | null {
  const haystack = buildMatchFormCollapsed(storedText);
  const needle = toMatchText(quote).replace(/\s+/g, ' ').trim();
  if (needle.length === 0) return null;

  let from = 0;
  let best: { start: number; end: number; distance: number } | null = null;

  for (;;) {
    const at = haystack.text.indexOf(needle, from);
    if (at === -1) break;
    const storedStart = haystack.toStored[at];
    const lastIndex = at + needle.length - 1;
    const storedLast = haystack.toStored[lastIndex];
    if (storedStart !== undefined && storedLast !== undefined) {
      const distance = Math.abs(storedStart - expectedStart);
      if (distance <= window && (best === null || distance < best.distance)) {
        best = { start: storedStart, end: storedLast + 1, distance };
      }
    }
    from = at + 1;
  }

  return best === null ? null : { start: best.start, end: best.end };
}

/**
 * Assert an anchor is sound. Used at persistence time: an EvidenceItem may not
 * be stored unless this passes (domain invariant D1).
 */
export function assertAnchorResolvable(
  anchor: ProvenanceAnchor,
  storedText: string,
): void {
  const r = resolveTextAnchor(anchor, storedText);
  if (r.status === 'broken') {
    throw new Error(
      `unresolvable anchor for source ${anchor.sourceId}: ${r.detail ?? 'unknown reason'}`,
    );
  }
}
