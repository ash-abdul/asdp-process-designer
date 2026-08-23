/**
 * The evidence persistence gate — **F5** and provenance **§4.4**, in one place.
 *
 * Every AI-extracted candidate passes through here, and it is deliberately shared
 * between the command that persists evidence and the offline harness that measures
 * extraction quality. If the gate lived in the command, the evaluation would be
 * measuring a *reimplementation* of the rules rather than the rules, and the two
 * would drift — which is the failure mode that makes an evaluation number worse
 * than no number.
 *
 * ## The four conditions (F5)
 *
 *   1. structured output validates          — checked upstream, per extraction
 *   2. the citation resolves UNIQUELY        — §4.4, checked here
 *   3. the anchor verifies independently     — re-resolved against stored text
 *   4. applicable provenance rules pass      — precision and quote checksum
 *
 * All four, or nothing is written. A candidate failing any one is **rejected with
 * a reason code**, never downgraded into something storable.
 *
 * ## Why rejection is a first-class result rather than an exception
 *
 * **F2** requires rejections to be recorded, countable and diagnosable, and
 * forbids building an analyst workflow for them. A thrown error would satisfy
 * neither: it would stop the pass on the first bad candidate, and it would leave
 * nothing to count. So a rejection is a value, and the caller records it.
 */

import { computeConfidence, type ConfidenceResult } from '@asdp/domain';
import {
  isCitable,
  locateQuote,
  textOffsetsOf,
  mayBecomeEvidence,
  resolveAnchor,
  spanChecksum,
  type LocateOutcome,
  type ProvenanceAnchor,
} from '@asdp/provenance';
import type {
  Degradation,
  EvidenceCandidate,
  EvidenceItem,
  QualityTier,
  SourceUnit,
} from '@asdp/schemas';

/** Why a candidate did not become evidence. Closed set, so it can be counted. */
export type RejectionReason =
  /** The quote was empty or whitespace after normalisation. */
  | 'empty_quote'
  /** The quote does not appear in the source at all — a fabricated citation. */
  | 'quote_not_found'
  /** Several locations remain possible: §4.4 forbids choosing one. */
  | 'ambiguous_citation'
  /** Located, but re-resolution against the stored text did not verify. */
  | 'anchor_unverified';

export interface GateInput {
  readonly sourceId: string;
  /** The source's canonical text — the ground truth the anchor is verified against. */
  readonly storedText: string;
  readonly candidate: EvidenceCandidate;
  /**
   * Code-point ranges the locator hints resolve to, by unit id and by heading.
   *
   * Resolved by the CALLER from stored structure, because a hint is only worth
   * anything once a parser has turned it into a range (§4.4). A hint naming a unit
   * that does not exist simply has no scope, and is treated as absent rather than
   * trusted.
   */
  readonly scopesByUnitId: ReadonlyMap<string, { charStart: number; charEnd: number }>;
  readonly scopesByHeading: ReadonlyMap<string, { charStart: number; charEnd: number }>;
  readonly extractorVersion: string;
  /** Signals for computed confidence (ADR-0011). */
  readonly confidenceInputs: {
    readonly sourceAuthorityRank: number;
    readonly providerCapabilityTier: QualityTier;
    readonly degradations: readonly Degradation[];
  };
}

export type GateOutcome =
  | {
      readonly kind: 'accepted';
      readonly anchor: ProvenanceAnchor;
      readonly disambiguatedByHint: boolean;
      readonly confidence: ConfidenceResult;
    }
  | {
      readonly kind: 'rejected';
      readonly reason: RejectionReason;
      readonly detail: string;
      /** How many locations matched. Present for the ambiguous case. */
      readonly matchCount?: number;
      /** Whether a hint was resolved to a scope and applied. */
      readonly hintApplied: boolean;
      /**
       * Checksum of the rejected quote — **not the quote itself**.
       *
       * Enough to correlate, count and diagnose (F2) without copying unanchored
       * source text into audit records that may carry different handling. The
       * verbatim quote appears only in the offline evaluation report over a
       * synthetic corpus, which is where diagnosis actually happens.
       */
      readonly quoteChecksum: string;
    };

/** Resolve a candidate's locator to a verified range, or to nothing. */
function scopeFor(input: GateInput): { charStart: number; charEnd: number } | undefined {
  const locator = input.candidate.locator;
  if (locator === undefined) return undefined;
  // Unit id first: it names something an ingestion adapter created, which is the
  // strongest hint available. A heading is second. `section` and `page` are
  // carried for the record but resolve nothing on their own — a model asserting
  // "section 3" is a claim, not a verification.
  if (locator.unitId !== undefined) {
    const byUnit = input.scopesByUnitId.get(locator.unitId);
    if (byUnit !== undefined) return byUnit;
  }
  if (locator.heading !== undefined) {
    const byHeading = input.scopesByHeading.get(locator.heading);
    if (byHeading !== undefined) return byHeading;
  }
  return undefined;
}

/**
 * Apply the gate to one candidate.
 *
 * Pure: no I/O, no clock, no persistence. The caller decides what to do with the
 * outcome, which is what lets the evaluation harness run the identical rules with
 * no database in sight.
 */
export function gateCandidate(input: GateInput): GateOutcome {
  const quote = input.candidate.quote;
  const checksum = spanChecksum(quote);

  if (quote.trim().length === 0) {
    return {
      kind: 'rejected',
      reason: 'empty_quote',
      detail: 'the candidate carried no quote after trimming',
      hintApplied: false,
      quoteChecksum: checksum,
    };
  }

  const scope = scopeFor(input);

  // --- condition 2: the citation must resolve UNIQUELY (§4.4) ------------
  const located: LocateOutcome = locateQuote({
    sourceId: input.sourceId,
    storedText: input.storedText,
    quote,
    extractorVersion: input.extractorVersion,
    ...(input.candidate.locator === undefined && scope === undefined
      ? {}
      : {
          hint: {
            ...(input.candidate.locator?.page === undefined
              ? {}
              : { page: input.candidate.locator.page }),
            ...(input.candidate.locator?.section === undefined
              ? {}
              : { section: input.candidate.locator.section }),
            ...(input.candidate.locator?.unitId === undefined
              ? {}
              : { unitId: input.candidate.locator.unitId }),
            ...(input.candidate.locator?.heading === undefined
              ? {}
              : { heading: input.candidate.locator.heading }),
            ...(scope === undefined ? {} : { scope }),
          },
        }),
  });

  if (located.status === 'not_found') {
    // The strongest signal the harness has: a quote that is not in the document
    // is an unsupported claim, and this is what `hallucinationRate` counts.
    return {
      kind: 'rejected',
      reason: 'quote_not_found',
      detail: located.detail,
      hintApplied: scope !== undefined,
      quoteChecksum: checksum,
    };
  }

  if (!mayBecomeEvidence(located)) {
    return {
      kind: 'rejected',
      reason: 'ambiguous_citation',
      detail:
        `the quote matches ${located.status === 'ambiguous' ? located.matchCount : 'several'} ` +
        'locations and no deterministic locating information resolved it to one; §4.4 forbids ' +
        'choosing an occurrence, and demotion does not make an ambiguous claim eligible',
      ...(located.status === 'ambiguous' ? { matchCount: located.matchCount } : {}),
      hintApplied: located.status === 'ambiguous' ? located.hintApplied : scope !== undefined,
      quoteChecksum: checksum,
    };
  }

  const anchor = located.anchor;

  // --- conditions 3 and 4: verify INDEPENDENTLY --------------------------
  //
  // The anchor was just minted from this text, so this looks redundant — and it
  // is not. It runs the same resolver every downstream consumer runs, over the
  // same stored text, so an adapter that mints something the resolver cannot read
  // fails here rather than at read time. ADR-0008: refuse the write.
  const resolution = resolveAnchor(anchor, { storedText: input.storedText });
  if (!isCitable(resolution.status) || resolution.status !== 'resolved') {
    return {
      kind: 'rejected',
      reason: 'anchor_unverified',
      detail:
        `the minted anchor did not verify against the stored text (${resolution.status}` +
        `${resolution.detail === undefined ? '' : `: ${resolution.detail}`})`,
      hintApplied: scope !== undefined,
      quoteChecksum: checksum,
    };
  }

  // --- computed confidence (ADR-0011) ------------------------------------
  //
  // `post_hoc_citations` is NOT added here: the degradation list comes from the
  // interaction, and whether citations were located rather than native is already
  // recorded there by the broker.
  const confidence = computeConfidence({
    // The quote is verbatim and anchored, so this is an extraction, not an
    // interpretation. What limits it is the ceiling, not the derivation.
    extractionMode: 'extracted',
    evidenceCount: 1,
    sourceAuthorityRank: input.confidenceInputs.sourceAuthorityRank,
    // Nothing corroborates or contradicts it yet: cross-source reconciliation is
    // V6. `silent` is the honest value, not a penalty for being first.
    crossSourceAgreement: 'silent',
    anchorPrecision: anchor.precision,
    providerCapabilityTier: input.confidenceInputs.providerCapabilityTier,
    degradations: [...input.confidenceInputs.degradations],
    ...(input.candidate.modelSelfRating === undefined
      ? {}
      : { modelSelfRating: input.candidate.modelSelfRating }),
  });

  return {
    kind: 'accepted',
    anchor,
    disambiguatedByHint: located.disambiguatedByHint,
    confidence,
  };
}

// ---------------------------------------------------------------------------
// Hint resolution — the step that makes a locator APPLIED rather than present
// ---------------------------------------------------------------------------

/**
 * Resolve locator hints to code-point ranges (**§4.4**).
 *
 * A hint is worth nothing until a parser has turned it into a range over stored
 * structure, so this is the step that makes a locator *applied* rather than
 * merely present. A heading maps to the span from the heading to the next heading
 * of the same or shallower depth, which is what a reader means by "the section".
 */
export function scopesFor(units: readonly SourceUnit[]): {
  byUnitId: Map<string, { charStart: number; charEnd: number }>;
  byHeading: Map<string, { charStart: number; charEnd: number }>;
} {
  const byUnitId = new Map<string, { charStart: number; charEnd: number }>();
  const byHeading = new Map<string, { charStart: number; charEnd: number }>();

  const ranges = units.map((unit) => {
    const offsets = textOffsetsOf(unit.anchor.target as never);
    return { unit, offsets };
  });

  for (const { unit, offsets } of ranges) {
    if (offsets === null) continue;
    byUnitId.set(unit.id, { charStart: offsets.start, charEnd: offsets.end });
  }

  // Heading texts that occur more than once. A document repeating a heading
  // verbatim cannot be disambiguated by it, so it must not appear to be: keeping
  // the first would hand back a scope that selects the FIRST occurrence of a
  // repeated quote, which is the arbitrary pick §4.4 forbids, wearing a hint as
  // cover. A repeated heading therefore resolves to NOTHING and the candidate
  // falls through to the ambiguous rejection.
  const repeatedHeadings = new Set<string>();

  for (const [index, entry] of ranges.entries()) {
    if (entry.offsets === null || entry.unit.type !== 'heading' || entry.unit.text === null) continue;
    const depth = entry.unit.depth ?? 1;
    let end = entry.offsets.end;
    for (const later of ranges.slice(index + 1)) {
      if (later.offsets === null) continue;
      if (later.unit.type === 'heading' && (later.unit.depth ?? 1) <= depth) break;
      end = later.offsets.end;
    }
    if (byHeading.has(entry.unit.text)) {
      repeatedHeadings.add(entry.unit.text);
      continue;
    }
    byHeading.set(entry.unit.text, { charStart: entry.offsets.start, charEnd: end });
  }

  for (const text of repeatedHeadings) byHeading.delete(text);

  return { byUnitId, byHeading };
}

/** The unit whose range contains this anchor, so evidence cites its unit. */
export function unitForAnchor(
  units: readonly SourceUnit[],
  anchor: EvidenceItem['anchor'],
): string | undefined {
  const target = textOffsetsOf(anchor.target as never);
  if (target === null) return undefined;
  for (const unit of units) {
    const offsets = textOffsetsOf(unit.anchor.target as never);
    if (offsets === null) continue;
    if (target.start >= offsets.start && target.end <= offsets.end) return unit.id;
  }
  return undefined;
}
