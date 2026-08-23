/**
 * Anchor resolution.
 *
 * Given an anchor and the stored source, return the exact region and verify it
 * (provenance-and-anchoring.md §3). Four outcomes, because ADR-0038 separates
 * target verification from content verification — see `ResolutionStatus`.
 *
 * Drift repair is bounded and recorded. It exists because re-parsing with an
 * upgraded adapter can shift offsets slightly; it must never become a
 * general-purpose fuzzy fallback that hides real breakage.
 */

import { sliceByCodePoints, buildMatchFormCollapsed, toMatchText } from '@asdp/text';
import { textOffsetsOf, type ProvenanceAnchor } from './anchor.ts';
import { spanChecksum } from './checksum.ts';
import {
  contentVerifiability,
  verifyElementTarget,
  verifyImageTarget,
  type StoredImage,
  type StoredModel,
} from './verify.ts';

/**
 * Resolution outcome (ADR-0038).
 *
 *   resolved            target verified AND content verified
 *   content_unverified  target verified; the quote is an AI interpretation and is
 *                       NOT independently verified
 *   drifted             content found at a small offset delta; repaired, flagged
 *   broken              target missing, or content not found — hard error
 *
 * `content_unverified` is NOT a failure, so the reflex "anything other than
 * resolved is a problem" is wrong. It is also deliberately named for the
 * limitation rather than the reassurance: a consumer reading it cannot mistake it
 * for a verification. `resolved` must never be reused for the visual case, or a
 * vision citation becomes indistinguishable from a verified one in every overlay,
 * trace query and disclosure report.
 */
export type ResolutionStatus = 'resolved' | 'content_unverified' | 'drifted' | 'broken';

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
 * Any target carrying code-point offsets can be verified this way — `text_range`
 * always, `pdf_region` and `docx_block` when they recorded them. Region- and
 * element-addressed anchors without offsets are verified by their own adapters
 * against page images or parsed models.
 */
export function resolveTextAnchor(anchor: ProvenanceAnchor, storedText: string): Resolution {
  const target = anchor.target;
  const offsets = textOffsetsOf(target);
  if (offsets === null) {
    return {
      status: 'broken',
      detail: `anchor kind '${target.kind}' carries no text offsets; verify it with its own adapter`,
    };
  }
  const start = offsets.start;
  const end = offsets.end;

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

// ---------------------------------------------------------------------------
// Unified resolution (ADR-0038)
// ---------------------------------------------------------------------------

/**
 * Everything resolution may need, by anchor kind.
 *
 * Passed in rather than fetched, because this package is pure: it verifies, it
 * does not load. The caller supplies the stored facts.
 */
export interface ResolutionContext {
  /** Canonical text of the source, for content-verifiable text anchors. */
  readonly storedText?: string;
  /** The stored image, for `image_region`. */
  readonly storedImage?: StoredImage;
  /** The stored model file, for element anchors. */
  readonly storedModel?: StoredModel;
  /**
   * Checksum the anchor was minted against, when the caller knows it.
   *
   * Supplying it turns "the target exists" into "the target is unchanged", which
   * is the difference between a weak and a real guarantee.
   */
  readonly expectedSha256?: string;
}

/**
 * Resolve any anchor.
 *
 * The single entry point, so the two verification axes are applied consistently
 * rather than per-adapter. Which axes apply is derived from the anchor kind by
 * `contentVerifiability`, never chosen by the caller.
 */
export function resolveAnchor(
  anchor: ProvenanceAnchor,
  context: ResolutionContext,
): Resolution {
  const kind = anchor.target.kind;

  // --- image: target only ------------------------------------------------
  if (kind === 'image_region') {
    const target = verifyImageTarget(anchor, context.storedImage, context.expectedSha256);
    if (!target.ok) return { status: 'broken', detail: target.reason };
    // The target is intact. The quote came from a vision model and there is
    // nothing independent to check it against, so it is reported as such.
    return {
      status: 'content_unverified',
      text: anchor.quote,
      detail:
        'image target verified (identity, checksum, bounds); the quoted content is an AI ' +
        'interpretation and is not independently verified (ADR-0038)',
    };
  }

  // --- model elements: target verification settles content too -----------
  if (kind === 'bpmn_element' || kind === 'dmn_rule' || kind === 'form_field') {
    const target = verifyElementTarget(anchor, context.storedModel, context.expectedSha256);
    if (!target.ok) return { status: 'broken', detail: target.reason };
    return { status: 'resolved', text: anchor.quote };
  }

  // --- text-offset anchors ----------------------------------------------
  if (context.storedText === undefined) {
    return { status: 'broken', detail: `no stored text supplied for a '${kind}' anchor` };
  }
  if (contentVerifiability(kind) !== 'verifiable') {
    return { status: 'broken', detail: `anchor kind '${kind}' has no content verification path` };
  }
  return resolveTextAnchor(anchor, context.storedText);
}

/**
 * True when a resolution outcome permits the anchor to be stored and cited.
 *
 * `content_unverified` PASSES: the target is sound and the epistemic ceiling —
 * not the anchor — is what limits what such evidence may support (ADR-0038,
 * provenance-and-anchoring.md §5).
 */
export function isCitable(status: ResolutionStatus): boolean {
  return status === 'resolved' || status === 'content_unverified';
}
