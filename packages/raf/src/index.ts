/**
 * @asdp/raf — Requirement Analysis Frame v1.1.
 *
 * PURE package. The frame lives in code so that gap analysis is arithmetic over
 * a known schema: reproducible, comparable across AI providers, and auditable
 * (ADR-0010).
 */

export {
  RAF_VERSION,
  RAF_SLOTS,
  RAF_SLOT_KEYS,
  REQUIRED_SLOT_KEYS,
  DISJOINTNESS_RULES,
  type RafSlotKey,
  type RafGroup,
  type RafSlotDefinition,
  type DisjointnessRule,
  slotDefinition,
  resolveDisjointSlot,
} from './slots.ts';

export {
  type SlotStatus,
  type SlotObservation,
  type SlotCoverage,
  type SlotSourceContribution,
  type EpistemicMix,
  type FrameCoverage,
  type CoverageThresholds,
  slotStatus,
  computeSlotCoverage,
  computeFrameCoverage,
  requiredSlotSummary,
} from './coverage.ts';
