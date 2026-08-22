/**
 * Evaluation metrics.
 *
 * ai-evaluation-framework.md §3. Two metrics are not scores but defect
 * detectors, and are treated as such:
 *
 *   anchorResolutionRate  TARGET 100%. Below 100% is a DEFECT, not a score.
 *   hallucinationRate     TARGET 0. An uncited claim presented as extracted
 *                         fact is the failure mode the whole architecture exists
 *                         to prevent, so it must be measured, not assumed away.
 */

import type { CorpusTier } from './corpus.ts';

export type ExtractionMode = 'extracted' | 'interpreted' | 'inferred';
export type AnchorPrecision = 'exact' | 'cell' | 'page' | 'document' | 'none';

/** One extracted item, as produced by a pass and verified by the harness. */
export interface ExtractedItem {
  readonly id: string;
  readonly quote?: string;
  readonly mode: ExtractionMode;
  /** Did the harness resolve the anchor and verify its checksum? */
  readonly anchorResolved: boolean;
  readonly anchorPrecision: AnchorPrecision;
  /** Slot the item was assigned to, for slot-accuracy scoring. */
  readonly assignedSlot?: string;
}

/** One labelled item from a gold set. */
export interface GoldItem {
  readonly id: string;
  readonly quote: string;
  readonly expectedSlot?: string;
}

export interface ProvenanceMetrics {
  /** TARGET 100%. Anything less is a defect. */
  readonly anchorResolutionRate: number;
  readonly precisionDistribution: Readonly<Record<AnchorPrecision, number>>;
  /** TARGET 0. Items claimed as extracted with no resolvable anchor. */
  readonly hallucinationRate: number;
  readonly hallucinatedItemIds: readonly string[];
  readonly isDefect: boolean;
  readonly defectReasons: readonly string[];
}

/**
 * Compute provenance metrics.
 *
 * `hallucinationRate` counts items claimed as **extracted** whose anchor did not
 * resolve. An item honestly marked `inferred` is not a hallucination — the
 * failure is claiming source support that does not exist.
 */
export function computeProvenanceMetrics(items: readonly ExtractedItem[]): ProvenanceMetrics {
  const distribution: Record<AnchorPrecision, number> = {
    exact: 0, cell: 0, page: 0, document: 0, none: 0,
  };
  for (const i of items) distribution[i.anchorPrecision]++;

  const anchoredCandidates = items.filter((i) => i.mode !== 'inferred');
  const resolved = anchoredCandidates.filter((i) => i.anchorResolved);
  const anchorResolutionRate =
    anchoredCandidates.length === 0 ? 1 : resolved.length / anchoredCandidates.length;

  const hallucinated = items.filter((i) => i.mode === 'extracted' && !i.anchorResolved);
  const hallucinationRate = items.length === 0 ? 0 : hallucinated.length / items.length;

  const defectReasons: string[] = [];
  if (anchorResolutionRate < 1) {
    defectReasons.push(
      `anchor resolution rate ${(anchorResolutionRate * 100).toFixed(1)}% is below the 100% target; ` +
        'an unresolvable anchor is a hard error (ADR-0008)',
    );
  }
  if (hallucinated.length > 0) {
    defectReasons.push(
      `${hallucinated.length} item(s) claimed as extracted have no resolvable anchor`,
    );
  }

  return {
    anchorResolutionRate,
    precisionDistribution: distribution,
    hallucinationRate,
    hallucinatedItemIds: hallucinated.map((i) => i.id),
    isDefect: defectReasons.length > 0,
    defectReasons,
  };
}

export interface ExtractionQualityMetrics {
  readonly precision: number;
  readonly recall: number;
  readonly f1: number;
  readonly truePositives: number;
  readonly falsePositives: number;
  readonly falseNegatives: number;
  /** Fraction of the gold set that is labelled, so partial gold sets are honest. */
  readonly goldCoverage: number;
}

/** Compare extracted items against a gold set by normalised quote match. */
export function computeExtractionQuality(
  items: readonly ExtractedItem[],
  gold: readonly GoldItem[],
  normalise: (s: string) => string,
  totalGoldPopulation?: number,
): ExtractionQualityMetrics {
  const goldSet = new Set(gold.map((g) => normalise(g.quote)));
  const extractedSet = new Set(
    items.filter((i) => i.quote !== undefined).map((i) => normalise(i.quote as string)),
  );

  let truePositives = 0;
  for (const e of extractedSet) if (goldSet.has(e)) truePositives++;
  const falsePositives = extractedSet.size - truePositives;
  const falseNegatives = goldSet.size - truePositives;

  const precision = extractedSet.size === 0 ? 0 : truePositives / extractedSet.size;
  const recall = goldSet.size === 0 ? 0 : truePositives / goldSet.size;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  return {
    precision,
    recall,
    f1,
    truePositives,
    falsePositives,
    falseNegatives,
    goldCoverage:
      totalGoldPopulation === undefined || totalGoldPopulation === 0
        ? 1
        : gold.length / totalGoldPopulation,
  };
}

/** Slot assignment accuracy against a gold set. */
export function computeSlotAccuracy(
  items: readonly ExtractedItem[],
  gold: readonly GoldItem[],
  normalise: (s: string) => string,
): { readonly accuracy: number; readonly scored: number } {
  const expectedBy = new Map(
    gold.filter((g) => g.expectedSlot !== undefined).map((g) => [normalise(g.quote), g.expectedSlot as string]),
  );
  let correct = 0;
  let scored = 0;
  for (const i of items) {
    if (i.quote === undefined || i.assignedSlot === undefined) continue;
    const expected = expectedBy.get(normalise(i.quote));
    if (expected === undefined) continue;
    scored++;
    if (expected === i.assignedSlot) correct++;
  }
  return { accuracy: scored === 0 ? 0 : correct / scored, scored };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export interface EvaluationReport {
  readonly corpusId: string;
  /** MUST be stated prominently: a synthetic-only metric cannot be over-read. */
  readonly corpusTier: CorpusTier;
  readonly language: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly promptVersion: string;
  readonly provenance: ProvenanceMetrics;
  readonly quality?: ExtractionQualityMetrics;
  readonly slotAccuracy?: { readonly accuracy: number; readonly scored: number };
  /** False when the tier is too low to justify a routing decision. */
  readonly usableForRoutingDecision: boolean;
  readonly caveats: readonly string[];
}

export class ReportIncompleteError extends Error {}

/**
 * Build a report.
 *
 * Report generation FAILS if the corpus tier is absent (ADR-0031 enforcement) —
 * a metric with no stated provenance is worse than no metric, because it will be
 * quoted as if validated.
 */
export function buildReport(input: {
  readonly corpusId: string;
  readonly corpusTier: CorpusTier | undefined;
  readonly language: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly promptVersion: string;
  readonly provenance: ProvenanceMetrics;
  readonly quality?: ExtractionQualityMetrics;
  readonly slotAccuracy?: { readonly accuracy: number; readonly scored: number };
}): EvaluationReport {
  if (input.corpusTier === undefined) {
    throw new ReportIncompleteError(
      'corpus tier is required: a metric without a stated tier cannot be interpreted (ADR-0031)',
    );
  }

  const caveats: string[] = [];
  if (input.corpusTier === 'synthetic') {
    caveats.push(
      'SYNTHETIC CORPUS: these metrics measure mechanics, not real-world performance, and may ' +
        'not be used to justify a routing decision',
    );
  }
  if (input.provenance.isDefect) {
    caveats.push(...input.provenance.defectReasons);
  }
  if (input.quality !== undefined && input.quality.goldCoverage < 1) {
    caveats.push(
      `partial gold set: ${(input.quality.goldCoverage * 100).toFixed(0)}% of the population is labelled`,
    );
  }

  return {
    corpusId: input.corpusId,
    corpusTier: input.corpusTier,
    language: input.language,
    providerId: input.providerId,
    modelId: input.modelId,
    promptVersion: input.promptVersion,
    provenance: input.provenance,
    quality: input.quality,
    slotAccuracy: input.slotAccuracy,
    usableForRoutingDecision: input.corpusTier !== 'synthetic',
    caveats,
  };
}
