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
  /** Exactly one match, globally or within an applied hint scope: an anchor is minted. */
  | {
      readonly status: 'located';
      readonly anchor: ProvenanceAnchor;
      /** True when a hint narrowed several matches down to this one. */
      readonly disambiguatedByHint: boolean;
    }
  /**
   * Several matches remain possible (**§4.4**).
   *
   * `citationOnlyAnchor` is a **page-precision anchor for general source
   * citation** — navigation and display. It is NOT eligible to support a
   * requirement, and `mayBecomeEvidence` returns false for this status at any
   * precision. The field is named for what it is licensed for, because the
   * previous shape (`anchor`) invited exactly the misuse §4.4 forbids.
   */
  | {
      readonly status: 'ambiguous';
      readonly matchCount: number;
      /** Present only when a hint was supplied and failed to resolve to one. */
      readonly hintApplied: boolean;
      readonly citationOnlyAnchor?: ProvenanceAnchor;
    }
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
   * Optional locating hint (**§4.4**).
   *
   * A hint's **presence** licenses nothing. It must be *applied*: `scope` is the
   * code-point range the hint resolves to — a `SourceUnit`, a section, or a
   * heading-defined block, resolved by the caller against stored structure —
   * and a match is accepted only if exactly one candidate falls inside it.
   *
   * `page` and `section` are carried for the record and for diagnostics; they do
   * not disambiguate on their own, because a model asserting "section 3" is a
   * claim, not a verification. `scope` is what a parser checked.
   */
  readonly hint?: {
    readonly page?: number;
    readonly section?: string;
    readonly unitId?: string;
    readonly heading?: string;
    /** The range the hint resolves to, computed by the caller from stored structure. */
    readonly scope?: { readonly charStart: number; readonly charEnd: number };
  };
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
      disambiguatedByHint: false,
    };
  }

  // --- several matches: §4.4 --------------------------------------------
  //
  // A hint is APPLIED, never merely counted. Until revision 1.1 of
  // provenance-and-anchoring.md this branch selected `matches[0]` — the first
  // occurrence, arbitrarily — and demoted precision to `page`, which §4.4 now
  // forbids as a combination: an arbitrary selection made eligible by demotion.
  const scope = req.hint?.scope;
  if (scope !== undefined) {
    const inScope = matches.filter((m) => m.start >= scope.charStart && m.end <= scope.charEnd);
    if (inScope.length === 1) {
      const m = inScope[0]!;
      return {
        status: 'located',
        // Exact precision is honest here: the hint did not approximate the
        // location, it selected among candidates that were each exact.
        anchor: build(m.start, m.end, capPrecision('exact', req.maxPrecision)),
        disambiguatedByHint: true,
      };
    }
  }

  // Still ambiguous. A page-precision anchor is offered for GENERAL CITATION
  // only — §4.4 keeps demotion for navigation and display — and it is built over
  // the enclosing scope where one exists rather than over an arbitrarily chosen
  // occurrence. Where no scope exists, no anchor is offered at all: there is
  // nothing honest to point at.
  const citationOnlyAnchor =
    scope === undefined
      ? undefined
      : build(scope.charStart, scope.charEnd, capPrecision('page', req.maxPrecision));

  return {
    status: 'ambiguous',
    matchCount: matches.length,
    hintApplied: scope !== undefined,
    ...(citationOnlyAnchor === undefined ? {} : { citationOnlyAnchor }),
  };
}

/**
 * Whether a located outcome may become AI-extracted evidence (**§4.4**).
 *
 * `located` may. **`ambiguous` never may**, at any precision — this returned
 * `outcome.anchor !== undefined` until revision 1.1, which let a demoted anchor
 * carry an ambiguous claim into the requirements path. Precision is a
 * description, not a permission.
 *
 * An ambiguous item may still be retained as an L2 interpretation with no
 * anchor, or dropped, per task policy; and its `citationOnlyAnchor` may be used
 * to point a reader at the enclosing region. Neither makes it evidence.
 */
export function mayBecomeEvidence(
  outcome: LocateOutcome,
): outcome is Extract<LocateOutcome, { status: 'located' }> {
  // A type guard rather than a boolean, so a caller that checks it gets the
  // narrowed outcome and cannot reach for an anchor the ambiguous case has no
  // business handing out.
  return outcome.status === 'located';
}
