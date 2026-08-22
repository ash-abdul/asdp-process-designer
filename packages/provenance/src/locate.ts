/**
 * Deterministic quote location — the `post_hoc` citation path.
 *
 * ADR-0022: when a provider has no native citation capability, the task schema
 * requires a verbatim quote and we locate it ourselves, minting the anchor.
 *
 * The rule that preserves the traceability guarantee across providers of
 * differing capability: **an unlocatable quote never becomes evidence**
 * (ADR-0008). Recall may drop on a weaker provider; provenance integrity does
 * not.
 */

import { buildMatchFormCollapsed, sliceByCodePoints, toMatchText, normalise } from '@asdp/text';
import type { AnchorPrecision, ProvenanceAnchor } from './anchor.ts';
import { spanChecksum } from './checksum.ts';

export type LocateOutcome =
  /** Exactly one match: an exact-precision anchor is minted. */
  | { readonly status: 'located'; readonly anchor: ProvenanceAnchor }
  /** Several matches and no disambiguating hint: precision is demoted. */
  | { readonly status: 'ambiguous'; readonly matchCount: number; readonly anchor?: ProvenanceAnchor }
  /** Not found: REJECTED. The item does not become evidence. */
  | { readonly status: 'not_found'; readonly detail: string };

export interface LocateRequest {
  readonly sourceId: string;
  /** The stored, NFC, logical-order source text. */
  readonly storedText: string;
  /** The quote as returned by the provider. */
  readonly quote: string;
  readonly extractorVersion: string;
  /**
   * Optional locating hint (section, page). Present hints allow an anchor to be
   * minted even when the quote appears several times.
   */
  readonly hint?: { readonly page?: number; readonly section?: string };
  /** Precision ceiling for this source kind — a diagram image can never be exact. */
  readonly maxPrecision?: AnchorPrecision;
}

const PRECISION_ORDER: readonly AnchorPrecision[] = ['document', 'page', 'cell', 'exact'];

function capPrecision(desired: AnchorPrecision, ceiling?: AnchorPrecision): AnchorPrecision {
  if (ceiling === undefined) return desired;
  return PRECISION_ORDER.indexOf(desired) <= PRECISION_ORDER.indexOf(ceiling) ? desired : ceiling;
}

/**
 * Locate a quote in the stored text and mint an anchor.
 *
 * Matching is tolerant (folded match form, collapsed whitespace) because a
 * provider reproduces a quote with different diacritics, Alef variants, Tatweel,
 * digit form or line breaking. The resulting anchor is nonetheless **exact**,
 * because the offset map translates the match back to stored-form offsets.
 */
export function locateQuote(req: LocateRequest): LocateOutcome {
  const needle = toMatchText(req.quote).replace(/\s+/g, ' ').trim();
  if (needle.length === 0) {
    return { status: 'not_found', detail: 'quote is empty after normalisation' };
  }

  const haystack = buildMatchFormCollapsed(req.storedText);

  const matches: { start: number; end: number }[] = [];
  let from = 0;
  for (;;) {
    const at = haystack.text.indexOf(needle, from);
    if (at === -1) break;
    const storedStart = haystack.toStored[at];
    const storedLast = haystack.toStored[at + needle.length - 1];
    if (storedStart !== undefined && storedLast !== undefined) {
      matches.push({ start: storedStart, end: storedLast + 1 });
    }
    from = at + 1;
  }

  if (matches.length === 0) {
    return {
      status: 'not_found',
      detail: `quote not present in source ${req.sourceId}; rejected rather than anchored`,
    };
  }

  const build = (start: number, end: number, precision: AnchorPrecision): ProvenanceAnchor => {
    const span = sliceByCodePoints(req.storedText, start, end);
    const n = normalise(span);
    return {
      sourceId: req.sourceId,
      target: { kind: 'text_range', charStart: start, charEnd: end },
      quote: span,
      quoteChecksum: spanChecksum(span),
      language: n.primaryLanguage,
      direction: n.direction,
      precision,
      extractorVersion: req.extractorVersion,
    };
  };

  if (matches.length === 1) {
    const m = matches[0]!;
    return {
      status: 'located',
      anchor: build(m.start, m.end, capPrecision('exact', req.maxPrecision)),
    };
  }

  // Several matches. With a hint we may still mint an anchor; without one the
  // precision is demoted rather than guessing which occurrence was meant.
  if (req.hint !== undefined && (req.hint.page !== undefined || req.hint.section !== undefined)) {
    const m = matches[0]!;
    return {
      status: 'ambiguous',
      matchCount: matches.length,
      anchor: build(m.start, m.end, capPrecision('page', req.maxPrecision)),
    };
  }

  return { status: 'ambiguous', matchCount: matches.length };
}

/**
 * Whether a located outcome may become L1 evidence.
 *
 * `not_found` never may. `ambiguous` without an anchor never may — it may be
 * retained as an L2 interpretation with no anchor, or dropped, per task policy
 * (provenance-and-anchoring.md §4.2).
 */
export function mayBecomeEvidence(outcome: LocateOutcome): boolean {
  if (outcome.status === 'located') return true;
  if (outcome.status === 'ambiguous') return outcome.anchor !== undefined;
  return false;
}
