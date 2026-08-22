/**
 * Local structural types.
 *
 * Re-declared here rather than imported from @asdp/schemas so that the pure
 * confidence and invariant functions stay free of a Zod dependency: a pure
 * package should be usable from a hot loop without pulling in a validator.
 * The shapes are asserted to match the schemas by a conformance test.
 */

export type Derivation = 'extracted' | 'interpreted' | 'inferred';
export type ConfidenceBand = 'HIGH' | 'MEDIUM' | 'LOW';
export type AnchorPrecision = 'exact' | 'cell' | 'page' | 'document';
export type QualityTier = 'A' | 'B' | 'C' | 'unknown';
export type EpistemicLevel = 'L1' | 'L2' | 'L3' | 'L4';

export type Degradation =
  | 'post_hoc_citations'
  | 'chunked_context'
  | 'prompt_repair_loop'
  | 'no_caching'
  | 'pre_extracted_document'
  | 'decomposed_reasoning';
