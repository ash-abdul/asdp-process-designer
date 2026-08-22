/**
 * Coverage arithmetic.
 *
 * ADR-0010: `missingInformation`, `ambiguities`, `conflicts` and `openQuestions`
 * are DERIVED BY CODE, never asserted by the model. Slot status is a
 * deterministic function of item count, evidence count, distinct source count,
 * confidence band and epistemic mix.
 */

import {
  REQUIRED_SLOT_KEYS,
  RAF_SLOT_KEYS,
  slotDefinition,
  type RafSlotKey,
} from './slots.ts';

export type ConfidenceBand = 'HIGH' | 'MEDIUM' | 'LOW';

export type SlotStatus = 'empty' | 'weak' | 'adequate' | 'blocked_by_policy';

export interface EpistemicMix {
  readonly l1: number;
  readonly l2: number;
  readonly l3: number;
  readonly l4: number;
}

/** Which sources contributed to a slot — provenance visible per slot (v1.1). */
export interface SlotSourceContribution {
  readonly sourceId: string;
  readonly sourceKind: string;
  readonly primaryLanguage: string;
  readonly authorityRank: number;
  readonly itemCount: number;
}

export interface SlotObservation {
  readonly slot: RafSlotKey;
  readonly itemCount: number;
  readonly evidenceCount: number;
  readonly distinctSourceCount: number;
  readonly sourceInventory: readonly SlotSourceContribution[];
  readonly confidenceBand: ConfidenceBand | null;
  readonly epistemicMix: EpistemicMix;
  /**
   * True when data governance prevented analysis of the sources that would
   * populate this slot. Takes precedence over `empty`: "we were not permitted to
   * read this" is a fundamentally different finding from "the sources do not say".
   */
  readonly blockedByPolicy?: { readonly classification: string; readonly provider: string };
}

export interface SlotCoverage extends SlotObservation {
  readonly status: SlotStatus;
  readonly requiredForExecutability: boolean;
  readonly blockedReason?: string;
}

export interface CoverageThresholds {
  /** A required slot supported by a single source is weak. */
  readonly requireMultipleSourcesForRequiredSlots: boolean;
}

const DEFAULT_THRESHOLDS: CoverageThresholds = {
  requireMultipleSourcesForRequiredSlots: true,
};

/**
 * Determine slot status deterministically.
 *
 * Order matters: `blocked_by_policy` takes precedence over `empty`
 * (data-governance.md §3.1).
 */
export function slotStatus(
  obs: SlotObservation,
  thresholds: CoverageThresholds = DEFAULT_THRESHOLDS,
): SlotStatus {
  if (obs.blockedByPolicy !== undefined) return 'blocked_by_policy';
  if (obs.itemCount === 0) return 'empty';

  const required = slotDefinition(obs.slot).requiredForExecutability;

  if (obs.evidenceCount === 0) return 'weak'; // everything here is inferred
  if (obs.confidenceBand === 'LOW') return 'weak';
  if (obs.epistemicMix.l3 > obs.epistemicMix.l1 + obs.epistemicMix.l2) return 'weak';
  if (
    required &&
    thresholds.requireMultipleSourcesForRequiredSlots &&
    obs.distinctSourceCount === 1
  ) {
    return 'weak';
  }
  return 'adequate';
}

export function computeSlotCoverage(
  obs: SlotObservation,
  thresholds?: CoverageThresholds,
): SlotCoverage {
  const def = slotDefinition(obs.slot);
  const status = slotStatus(obs, thresholds);
  return {
    ...obs,
    status,
    requiredForExecutability: def.requiredForExecutability,
    blockedReason:
      obs.blockedByPolicy === undefined
        ? undefined
        : `analysis denied: ${obs.blockedByPolicy.classification} content may not reach ${obs.blockedByPolicy.provider}`,
  };
}

export interface FrameCoverage {
  readonly rafVersion: string;
  readonly slots: readonly SlotCoverage[];
  /** Derived: slots empty, weak or blocked, weighted by requirement. */
  readonly missingInformation: readonly RafSlotKey[];
  readonly blockedByPolicy: readonly RafSlotKey[];
  /** Required slots that are empty — these BLOCK G1. */
  readonly g1Blockers: readonly RafSlotKey[];
  /** Required slots that are weak — these require acknowledgement. */
  readonly g1Acknowledgements: readonly RafSlotKey[];
}

/**
 * Compute whole-frame coverage.
 *
 * Slots with no observation are treated as `empty`, so an omitted slot can never
 * be mistaken for an adequate one.
 */
export function computeFrameCoverage(
  observations: readonly SlotObservation[],
  rafVersion: string,
  thresholds?: CoverageThresholds,
): FrameCoverage {
  const byKey = new Map(observations.map((o) => [o.slot, o]));

  const slots = RAF_SLOT_KEYS.map((key) => {
    const obs = byKey.get(key) ?? {
      slot: key,
      itemCount: 0,
      evidenceCount: 0,
      distinctSourceCount: 0,
      sourceInventory: [],
      confidenceBand: null,
      epistemicMix: { l1: 0, l2: 0, l3: 0, l4: 0 },
    };
    return computeSlotCoverage(obs, thresholds);
  });

  const missingInformation = slots
    .filter((s) => s.status !== 'adequate')
    .map((s) => s.slot);

  const blockedByPolicy = slots
    .filter((s) => s.status === 'blocked_by_policy')
    .map((s) => s.slot);

  const g1Blockers = slots
    .filter((s) => s.requiredForExecutability && s.status === 'empty')
    .map((s) => s.slot);

  const g1Acknowledgements = slots
    .filter(
      (s) =>
        (s.requiredForExecutability && s.status === 'weak') ||
        s.status === 'blocked_by_policy',
    )
    .map((s) => s.slot);

  return { rafVersion, slots, missingInformation, blockedByPolicy, g1Blockers, g1Acknowledgements };
}

/** Required slots and their status, for the coverage dashboard header. */
export function requiredSlotSummary(coverage: FrameCoverage): {
  readonly total: number;
  readonly adequate: number;
  readonly weak: number;
  readonly empty: number;
  readonly blocked: number;
} {
  const required = coverage.slots.filter((s) => REQUIRED_SLOT_KEYS.includes(s.slot));
  return {
    total: required.length,
    adequate: required.filter((s) => s.status === 'adequate').length,
    weak: required.filter((s) => s.status === 'weak').length,
    empty: required.filter((s) => s.status === 'empty').length,
    blocked: required.filter((s) => s.status === 'blocked_by_policy').length,
  };
}
