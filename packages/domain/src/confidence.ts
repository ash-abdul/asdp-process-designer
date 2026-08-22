/**
 * Computed confidence.
 *
 * ADR-0011: confidence is a deterministic, versioned function over signals —
 * NOT the model's self-assessment. Model self-rating is poorly calibrated and
 * not comparable across providers, which matters acutely here because provider
 * routing is policy-driven (ADR-0021): the same content may be analysed by
 * different models in different projects.
 *
 * Two inputs exist purely because of the provider abstraction:
 *   providerCapabilityTier  a requirement extracted by a lower-tier on-premise
 *                           model is legitimately less confident, and the record
 *                           says so rather than hiding it
 *   degradationPenalty      chunked context, post_hoc citations or redacted
 *                           input each reduce confidence by a declared amount
 */

import type {
  AnchorPrecision,
  ConfidenceBand,
  Degradation,
  Derivation,
  QualityTier,
} from './types.ts';

/** Function version, so historical bands remain interpretable. */
export const CONFIDENCE_FUNCTION_VERSION = 'confidence-1';

export type CrossSourceAgreement = 'corroborated' | 'silent' | 'contradicted';

export interface ConfidenceFactors {
  readonly extractionMode: Derivation;
  readonly evidenceCount: number;
  /** Highest authority rank among supporting sources. 0 = highest authority. */
  readonly sourceAuthorityRank: number;
  readonly crossSourceAgreement: CrossSourceAgreement;
  readonly anchorPrecision: AnchorPrecision | 'none';
  readonly providerCapabilityTier: QualityTier;
  readonly degradations: readonly Degradation[];
  /** Weighted low, and never the band by itself. */
  readonly modelSelfRating?: number;
}

export interface ConfidenceResult {
  readonly band: ConfidenceBand;
  readonly score: number;
  readonly version: string;
  /** One-sentence explanation, as required by ADR-0011. */
  readonly explanation: string;
  readonly factors: ConfidenceFactors;
}

const EXTRACTION_WEIGHT: Readonly<Record<Derivation, number>> = {
  extracted: 1.0,
  interpreted: 0.6,
  inferred: 0.3,
};

const PRECISION_WEIGHT: Readonly<Record<AnchorPrecision | 'none', number>> = {
  exact: 1.0,
  cell: 0.9,
  page: 0.7,
  document: 0.4,
  none: 0.0,
};

const AGREEMENT_WEIGHT: Readonly<Record<CrossSourceAgreement, number>> = {
  corroborated: 1.0,
  silent: 0.75,
  contradicted: 0.3,
};

const TIER_WEIGHT: Readonly<Record<QualityTier, number>> = {
  A: 1.0,
  B: 0.85,
  C: 0.65,
  unknown: 0.7,
};

/** Declared penalty per degradation (ADR-0022 §5). */
const DEGRADATION_PENALTY: Readonly<Record<Degradation, number>> = {
  post_hoc_citations: 0.05,
  chunked_context: 0.15,
  prompt_repair_loop: 0.05,
  no_caching: 0.0,
  pre_extracted_document: 0.05,
  decomposed_reasoning: 0.1,
};

function evidenceWeight(count: number): number {
  if (count <= 0) return 0.35;
  if (count === 1) return 0.75;
  if (count === 2) return 0.9;
  return 1.0;
}

function authorityWeight(rank: number): number {
  if (rank <= 0) return 1.0;
  if (rank === 1) return 0.9;
  if (rank === 2) return 0.8;
  return 0.7;
}

/**
 * Compute the confidence band.
 *
 * Deliberately a weighted product rather than a sum: a zero on any critical
 * dimension (no anchor at all, contradicted by a higher-authority source) must
 * drag the result down rather than be averaged away.
 */
export function computeConfidence(factors: ConfidenceFactors): ConfidenceResult {
  const base =
    EXTRACTION_WEIGHT[factors.extractionMode] *
    evidenceWeight(factors.evidenceCount) *
    authorityWeight(factors.sourceAuthorityRank) *
    AGREEMENT_WEIGHT[factors.crossSourceAgreement] *
    Math.max(PRECISION_WEIGHT[factors.anchorPrecision], factors.extractionMode === 'inferred' ? 0.5 : 0) *
    TIER_WEIGHT[factors.providerCapabilityTier];

  const penalty = factors.degradations.reduce(
    (sum, d) => sum + (DEGRADATION_PENALTY[d] ?? 0),
    0,
  );

  // Model self-rating nudges by at most ±0.05.
  const nudge =
    factors.modelSelfRating === undefined ? 0 : (factors.modelSelfRating - 0.5) * 0.1;

  const score = Math.max(0, Math.min(1, base - penalty + nudge));
  const band: ConfidenceBand = score >= 0.7 ? 'HIGH' : score >= 0.45 ? 'MEDIUM' : 'LOW';

  return {
    band,
    score: Math.round(score * 1000) / 1000,
    version: CONFIDENCE_FUNCTION_VERSION,
    explanation: explain(band, factors),
    factors,
  };
}

/**
 * The UI must always be able to explain a band in one sentence
 * (ADR-0011 consequences).
 */
function explain(band: ConfidenceBand, f: ConfidenceFactors): string {
  const parts: string[] = [];
  parts.push(f.extractionMode);

  if (f.evidenceCount === 0) parts.push('no supporting evidence');
  else if (f.evidenceCount === 1) parts.push('from a single source');
  else parts.push(`from ${f.evidenceCount} sources`);

  if (f.sourceAuthorityRank > 1) parts.push('low-authority source');
  if (f.crossSourceAgreement === 'contradicted') parts.push('contradicted by another source');
  else if (f.crossSourceAgreement === 'silent') parts.push('no corroboration');

  if (f.anchorPrecision === 'none') parts.push('no anchor');
  else if (f.anchorPrecision !== 'exact') parts.push(`${f.anchorPrecision}-level anchor`);

  if (f.providerCapabilityTier !== 'A') {
    parts.push(`extracted at provider tier ${f.providerCapabilityTier}`);
  }
  if (f.degradations.length > 0) {
    parts.push(`degraded extraction (${f.degradations.join(', ')})`);
  }

  return `${band} — ${parts.join(', ')}.`;
}

/**
 * Whether a requirement needs explicit human confirmation before G1
 * (epistemic-model.md §5).
 */
export function requiresHumanConfirmation(
  band: ConfidenceBand,
  derivation: Derivation,
): boolean {
  if (derivation === 'inferred') return true;
  return band === 'LOW';
}

/**
 * A LOW-confidence inferred requirement may never sit on an executable path
 * (epistemic-model.md rule 4; validation rule L4-TRACE-005).
 */
export function permittedOnExecutablePath(
  band: ConfidenceBand,
  derivation: Derivation,
  humanConfirmed: boolean,
): boolean {
  if (derivation === 'inferred' && !humanConfirmed) return false;
  if (band === 'LOW' && !humanConfirmed) return false;
  return true;
}
