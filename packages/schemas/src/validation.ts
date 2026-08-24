/**
 * Validation engine contracts.
 *
 * validation-architecture.md v2.0 §4. The `gates[]` and `severityByGate` fields
 * exist because gate coupling used to be *inferred* from the layer, and that
 * inference broke in two places: specification preconditions block G2 (which no
 * layer mapped to), and some conditions are legitimately tolerable at one gate
 * and not another.
 */

import { z } from 'zod';
import { EntityId, GateCode, Sha256 } from './primitives.ts';

export const ValidationLayer = z.enum(['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6']);
export type ValidationLayer = z.infer<typeof ValidationLayer>;

/**
 * ERROR blocks the applicable gate and cannot be waived.
 * WARNING may proceed only where policy permits, with an explicit justified
 * acknowledgement. INFO is informational only.
 */
export const Severity = z.enum(['error', 'warning', 'info']);
export type Severity = z.infer<typeof Severity>;

/** Rule identifier, e.g. "L4-SPEC-005". Stable, ASCII, never reused. */
export const RuleId = z.string().regex(/^L[0-6]-[A-Z]+-\d{3}[a-z]?$/);
export type RuleId = z.infer<typeof RuleId>;

/** Where a finding points. */
export const TargetRef = z.object({
  specElementId: EntityId.optional(),
  artifactKey: z.string().optional(),
  elementId: z.string().optional(),
  decisionId: z.string().optional(),
  ruleSeq: z.number().int().nonnegative().optional(),
  fieldKey: z.string().optional(),
  requirementId: z.string().optional(),
  sourceId: EntityId.optional(),
});
export type TargetRef = z.infer<typeof TargetRef>;

/**
 * A rule definition. Severity is a fixed property unless there is a stated
 * reason otherwise; `severityByGate` is the exception, not the pattern.
 */
export const RuleDefinition = z.object({
  id: RuleId,
  layer: ValidationLayer,
  /** Explicit, not inferred from the layer. */
  gates: z.array(GateCode).min(1),
  severity: Severity,
  /** Per-gate override. Present on exactly two rules today. */
  severityByGate: z.record(GateCode, Severity).optional(),
  /** Localisation key, not a formatted string (validation-architecture.md §5). */
  messageKey: z.string().min(1),
  fixHintKey: z.string().min(1),
  documentation: z.string().min(1),
  /** ERROR rules guarding structural integrity are not profile-adjustable. */
  profileAdjustable: z.boolean().default(true),
});
export type RuleDefinition = z.infer<typeof RuleDefinition>;

/**
 * A finding. Its id is deterministic — `<ruleId>@<targetRef>` — so the same
 * defect in two runs yields the same id, making findings trackable, waivable
 * and diffable.
 */
export const Finding = z.object({
  id: z.string().min(1),
  runId: EntityId,
  ruleId: RuleId,
  layer: ValidationLayer,
  /** Resolved per gate at evaluation time. */
  severityAtGate: z.record(GateCode, Severity),
  targetRef: TargetRef,
  messageKey: z.string(),
  messageParams: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  fixHintKey: z.string(),
  fixHintParams: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  waiverId: EntityId.optional(),
  firstSeenRunId: EntityId.optional(),
});
export type Finding = z.infer<typeof Finding>;

export const ValidationRun = z.object({
  id: EntityId,
  projectId: EntityId,
  /**
   * The requirement set the run covered, when it covered one.
   *
   * Set for a G1 run: the signature ADR-0017 requires binds
   * `(baselineContentHash, validationRunId)`, so "which run was this approval
   * relying on, and over what?" has to be answerable from the run itself.
   */
  requirementSetId: EntityId.optional(),
  baselineHash: Sha256.optional(),
  /** Which gate this run is evidence for. */
  gate: GateCode.optional(),
  rulePackVersion: z.string(),
  camundaTargetProfileId: z.string(),
  standardsProfileId: z.string(),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  status: z.enum(['running', 'completed', 'failed']),
  findings: z.array(Finding).default([]),
});
export type ValidationRun = z.infer<typeof ValidationRun>;

export const Waiver = z.object({
  id: EntityId,
  findingId: z.string(),
  baselineHash: Sha256,
  justification: z.string().min(1),
  approvedBy: EntityId,
  approvedAt: z.string(),
  expiresAt: z.string().optional(),
});
export type Waiver = z.infer<typeof Waiver>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve a rule's severity at a specific gate. */
export function severityAt(rule: RuleDefinition, gate: GateCode): Severity | undefined {
  if (!rule.gates.includes(gate)) return undefined;
  return rule.severityByGate?.[gate] ?? rule.severity;
}

/** Deterministic finding id: same defect, same id, every run. */
export function findingId(ruleId: string, target: TargetRef): string {
  const parts = Object.entries(target)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${String(v)}`);
  return `${ruleId}@${parts.join(',')}`;
}

/** A finding blocks a gate when its resolved severity there is `error`. */
export function blocksGate(finding: Finding, gate: GateCode): boolean {
  return finding.severityAtGate[gate] === 'error';
}

/**
 * A waiver is valid only at gates where the rule is a WARNING
 * (validation-architecture.md §10).
 */
export function waiverApplies(finding: Finding, gate: GateCode): boolean {
  return finding.waiverId !== undefined && finding.severityAtGate[gate] === 'warning';
}
