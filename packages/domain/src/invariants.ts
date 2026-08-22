/**
 * Domain invariants D1–D15.
 *
 * domain-model.md §8. Enforced in this pure package — not in the UI, and not in
 * database constraints alone. Several are ALSO expressed as validation rules
 * with stable IDs, so the same condition is both unreachable and explicable:
 * the invariant prevents the state, the rule reports it.
 */

import { isAscii, isJobTypeSafe, isNcNameSafe, isVariableNameSafe } from '@asdp/text';
import { maxClassification, type Classification } from '@asdp/schemas';
import type { Derivation, EpistemicLevel } from './types.ts';

export class InvariantViolation extends Error {
  readonly invariant: string;
  constructor(invariant: string, message: string) {
    super(`${invariant}: ${message}`);
    this.name = 'InvariantViolation';
    this.invariant = invariant;
  }
}

// ---------------------------------------------------------------------------
// D1 — evidence anchors
// ---------------------------------------------------------------------------

/** An EvidenceItem may not be stored unless its anchor is verified. */
export function assertD1_evidenceAnchorVerified(anchorVerified: boolean): void {
  if (!anchorVerified) {
    throw new InvariantViolation(
      'D1',
      'EvidenceItem requires a verified, resolvable anchor before it may be persisted',
    );
  }
}

// ---------------------------------------------------------------------------
// D2 — evidence or inference rationale
// ---------------------------------------------------------------------------

export function assertD2_evidenceOrRationale(
  level: EpistemicLevel,
  derivation: Derivation,
  evidenceCount: number,
  inferenceRationale: string | undefined,
): void {
  if ((level === 'L1' || level === 'L2') && evidenceCount < 1) {
    throw new InvariantViolation(
      'D2',
      `a requirement at ${level} must reference at least one EvidenceItem`,
    );
  }
  if (derivation === 'inferred' && (inferenceRationale ?? '').trim().length === 0) {
    throw new InvariantViolation(
      'D2',
      'an inferred requirement must carry an inferenceRationale',
    );
  }
}

// ---------------------------------------------------------------------------
// D3 — only a human may set L4
// ---------------------------------------------------------------------------

export type ActorKind = 'human' | 'ai' | 'system';

/**
 * Structural expression of ADR-0007: the AI layer cannot approve anything. The
 * dependency rule prevents @asdp/ai reaching this code at all; this is the
 * second line of defence.
 */
export function assertD3_humanOnlyApproval(
  targetLevel: EpistemicLevel,
  actorKind: ActorKind,
): void {
  if (targetLevel === 'L4' && actorKind !== 'human') {
    throw new InvariantViolation(
      'D3',
      `only a human-initiated command may set epistemicLevel L4 (actor was '${actorKind}')`,
    );
  }
}

// ---------------------------------------------------------------------------
// D4 — G1 blockers
// ---------------------------------------------------------------------------

export interface G1Readiness {
  readonly blockingFlagCount: number;
  readonly unresolvedConflictCount: number;
  readonly unansweredBlockingQuestionCount: number;
  readonly nonL4RequirementCount: number;
  readonly emptyRequiredSlotCount: number;
}

export function evaluateD4_g1Blockers(r: G1Readiness): string[] {
  const reasons: string[] = [];
  if (r.blockingFlagCount > 0) reasons.push(`${r.blockingFlagCount} blocking requirement flag(s)`);
  if (r.unresolvedConflictCount > 0) reasons.push(`${r.unresolvedConflictCount} unresolved conflict(s)`);
  if (r.unansweredBlockingQuestionCount > 0)
    reasons.push(`${r.unansweredBlockingQuestionCount} unanswered blocking question(s)`);
  if (r.nonL4RequirementCount > 0)
    reasons.push(`${r.nonL4RequirementCount} requirement(s) not yet approved to L4`);
  if (r.emptyRequiredSlotCount > 0)
    reasons.push(`${r.emptyRequiredSlotCount} required analysis slot(s) empty`);
  return reasons;
}

// ---------------------------------------------------------------------------
// D7 — ASCII technical identifiers (ADR-0024)
// ---------------------------------------------------------------------------

export function assertD7_asciiIdentifier(kind: string, value: string): void {
  if (!isAscii(value)) {
    throw new InvariantViolation('D7', `${kind} must be ASCII: '${value}'`);
  }
  if (!isNcNameSafe(value)) {
    throw new InvariantViolation('D7', `${kind} must be NCName-safe: '${value}'`);
  }
}

export function assertD7_variableName(name: string): void {
  if (!isVariableNameSafe(name)) {
    throw new InvariantViolation(
      'D7',
      `process variable / FEEL identifier must be ASCII without FEEL operators: '${name}'`,
    );
  }
}

export function assertD7_jobType(jobType: string): void {
  if (!isJobTypeSafe(jobType)) {
    throw new InvariantViolation(
      'D7',
      `job type must be lower-case ASCII in <domain>.<action> form: '${jobType}'`,
    );
  }
}

// ---------------------------------------------------------------------------
// D9 — artifacts are produced only by compilers
// ---------------------------------------------------------------------------

export type ArtifactOrigin = 'compiler' | 'import';

/**
 * There is deliberately no 'human' origin. `generatedBy` admits only 'compiler'
 * and 'import'; a value outside that set indicates a code path that should not
 * exist (ADR-0002, ADR-0003).
 */
export function assertD9_artifactOrigin(origin: string): asserts origin is ArtifactOrigin {
  if (origin !== 'compiler' && origin !== 'import') {
    throw new InvariantViolation(
      'D9',
      `artifact origin must be 'compiler' or 'import'; got '${origin}'. ` +
        'Generated artifacts are never hand-authored (ADR-0002).',
    );
  }
}

// ---------------------------------------------------------------------------
// D10 — classification only rises
// ---------------------------------------------------------------------------

export function deriveD10_requirementClassification(
  evidenceClassifications: readonly Classification[],
  dataFieldClassifications: readonly Classification[],
): Classification {
  return maxClassification([...evidenceClassifications, ...dataFieldClassifications]);
}

export function assertD10_classificationNotLowered(
  previous: Classification,
  next: Classification,
  authorised: boolean,
): void {
  const order = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED', 'PROHIBITED'] as const;
  if (order.indexOf(next) < order.indexOf(previous) && !authorised) {
    throw new InvariantViolation(
      'D10',
      `lowering classification from ${previous} to ${next} requires an authorised, audited act`,
    );
  }
}

// ---------------------------------------------------------------------------
// D12 — handed-off releases are frozen
// ---------------------------------------------------------------------------

export function assertD12_releaseNotFrozen(state: string): void {
  if (state === 'handed_off') {
    throw new InvariantViolation(
      'D12',
      'a handed-off release is frozen permanently; produce a new candidate instead (ADR-0018)',
    );
  }
}

// ---------------------------------------------------------------------------
// D14 — proposals are applied only by a human-initiated command
// ---------------------------------------------------------------------------

export function assertD14_proposalApplication(actorKind: ActorKind): void {
  if (actorKind !== 'human') {
    throw new InvariantViolation(
      'D14',
      `a Proposal may only be applied by a human-initiated command (actor was '${actorKind}')`,
    );
  }
}

// ---------------------------------------------------------------------------
// D15 — identifiers are never reused
// ---------------------------------------------------------------------------

/** Allocate the next requirement id from a monotonic sequence. */
export function allocateD15_requirementId(highestAllocated: number): string {
  const next = highestAllocated + 1;
  return `REQ-${String(next).padStart(4, '0')}`;
}

export function assertD15_notReused(candidate: string, everAllocated: ReadonlySet<string>): void {
  if (everAllocated.has(candidate)) {
    throw new InvariantViolation(
      'D15',
      `identifier '${candidate}' was previously allocated and may never be reused`,
    );
  }
}
