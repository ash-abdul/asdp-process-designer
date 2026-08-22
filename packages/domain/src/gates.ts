/**
 * Gate state machine and read-locks.
 *
 * governance-and-gates.md, ADR-0017.
 *
 * Gates are state transitions on immutable baselines, enforced in the domain
 * layer — not checkboxes. Downstream stages are STRUCTURALLY read-locked until
 * the upstream gate passes: this is what makes "no silent conversion of vague
 * requirements into executable BPMN" a property of the system rather than a
 * policy statement.
 */

import type {
  Approval,
  Gate,
  GateCode,
  GatePolicy,
  Role,
  Stage,
} from '@asdp/schemas';
import { GATE_ORDER } from '@asdp/schemas';

// ---------------------------------------------------------------------------
// Stage ↔ gate topology
// ---------------------------------------------------------------------------

/** The gate that must be approved before a stage may be entered. */
const STAGE_PREREQUISITE: Readonly<Record<Stage, GateCode | null>> = {
  intake: null,
  analysis: null,
  requirements: null,
  specification: 'G1', // requires approved requirements
  generation: 'G2', // requires approved BPS — the structural lock
  validation: 'G2',
  testing: 'G3',
  release: 'G3',
};

/** Which gate a stage submits to. */
const STAGE_GATE: Readonly<Record<Stage, GateCode | null>> = {
  intake: 'G0',
  analysis: null,
  requirements: 'G1',
  specification: 'G2',
  generation: null,
  validation: 'G3',
  testing: null,
  release: 'G4',
};

/** G0 is advisory: it reports, it does not block (governance-and-gates.md §1). */
export function isAdvisory(gate: GateCode): boolean {
  return gate === 'G0';
}

export function gateIndex(gate: GateCode): number {
  return GATE_ORDER.indexOf(gate);
}

export function prerequisiteGate(stage: Stage): GateCode | null {
  return STAGE_PREREQUISITE[stage];
}

export function gateForStage(stage: Stage): GateCode | null {
  return STAGE_GATE[stage];
}

// ---------------------------------------------------------------------------
// Read-locks
// ---------------------------------------------------------------------------

export interface LockContext {
  readonly gates: Readonly<Record<GateCode, Gate>>;
}

export type LockDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string; readonly blockingGate: GateCode };

/**
 * May this stage be entered?
 *
 * Enforced at the command layer, not the UI. Attempting a downstream command
 * before the upstream gate passes fails here.
 */
export function canEnterStage(stage: Stage, ctx: LockContext): LockDecision {
  const required = prerequisiteGate(stage);
  if (required === null) return { allowed: true };

  const gate = ctx.gates[required];
  if (gate.status !== 'approved') {
    return {
      allowed: false,
      blockingGate: required,
      reason: `stage '${stage}' is read-locked until ${required} is approved (currently '${gate.status}')`,
    };
  }
  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

export interface GateEvaluation {
  /** Blocking findings for THIS gate, resolved through severityByGate. */
  readonly blockingFindingIds: readonly string[];
  /** The baseline hash the evaluation covered. */
  readonly baselineHash: string;
  readonly validationRunId: string;
}

export type TransitionResult =
  | { readonly ok: true; readonly gate: Gate }
  | { readonly ok: false; readonly reason: string };

/**
 * Mark a gate ready (or not) from a validation evaluation. The Validation Engine
 * is the sole authority on readiness; gates only query it (invariant I6).
 */
export function evaluateGate(gate: Gate, evaluation: GateEvaluation): Gate {
  const ready = evaluation.blockingFindingIds.length === 0;
  return { ...gate, status: ready ? 'ready' : 'not_ready' };
}

export interface ApprovalAttempt {
  readonly approver: string;
  readonly roleAtApproval: Role;
  readonly baselineHash: string;
  readonly validationRunId: string;
  /** Authors of the content under approval, for segregation of duties. */
  readonly contentAuthors: readonly string[];
  /** Approvals already recorded for this gate and baseline. */
  readonly existingApprovals: readonly Approval[];
}

/**
 * Attempt to approve a gate.
 *
 * Checks, in order: gate readiness, role, segregation of duties, quorum.
 */
export function approveGate(gate: Gate, attempt: ApprovalAttempt): TransitionResult {
  if (gate.status === 'approved') {
    return { ok: false, reason: `${gate.code} is already approved` };
  }
  if (gate.status !== 'ready') {
    return {
      ok: false,
      reason: `${gate.code} is not ready: blocking findings must be resolved first`,
    };
  }

  const permitted: readonly Role[] = [...gate.policy.requiredRoles, ...gate.policy.additionalRoles];
  if (!permitted.includes(attempt.roleAtApproval)) {
    return {
      ok: false,
      reason: `role '${attempt.roleAtApproval}' may not approve ${gate.code}`,
    };
  }

  if (!gate.policy.allowSelfApproval && attempt.contentAuthors.includes(attempt.approver)) {
    return {
      ok: false,
      reason: `segregation of duties: ${attempt.approver} authored content under approval at ${gate.code}`,
    };
  }

  const alreadyApproved = attempt.existingApprovals.filter(
    (a) =>
      a.gate === gate.code &&
      a.decision === 'approve' &&
      a.signedBaselineHash === attempt.baselineHash,
  );
  if (alreadyApproved.some((a) => a.approver === attempt.approver)) {
    return { ok: false, reason: `${attempt.approver} has already approved ${gate.code}` };
  }

  const signatures = alreadyApproved.length + 1;
  if (signatures < gate.policy.quorum) {
    // Recorded, but the gate does not open until quorum is met.
    return { ok: true, gate: { ...gate, status: 'ready' } };
  }

  return {
    ok: true,
    gate: { ...gate, status: 'approved', approvedBaselineHash: attempt.baselineHash },
  };
}

/**
 * Reopen a gate because its approved content or its validation evidence changed.
 *
 * This is the mechanism behind ADR-0017: an approval is a signature over
 * (baselineHash, validationRunId). If either changes, the signature no longer
 * matches and the gate reopens AUTOMATICALLY — there is no
 * re-approve-without-re-review path.
 */
export function reopenIfInvalidated(
  gate: Gate,
  approval: Approval | undefined,
  current: { readonly baselineHash: string; readonly validationRunId: string },
): { readonly gate: Gate; readonly reopened: boolean; readonly reason?: string } {
  if (gate.status !== 'approved' || approval === undefined) {
    return { gate, reopened: false };
  }

  if (approval.signedBaselineHash !== current.baselineHash) {
    return {
      gate: { ...gate, status: 'reopened', approvedBaselineHash: undefined },
      reopened: true,
      reason: 'baseline content changed after approval',
    };
  }
  if (approval.validationRunId !== current.validationRunId) {
    return {
      gate: { ...gate, status: 'reopened', approvedBaselineHash: undefined },
      reopened: true,
      reason: 'validation evidence changed after approval',
    };
  }
  return { gate, reopened: false };
}

/** Whether an approval has expired under the gate policy. */
export function isApprovalExpired(
  approval: Approval,
  policy: GatePolicy,
  nowIso: string,
): boolean {
  const approvedAt = Date.parse(approval.at);
  const now = Date.parse(nowIso);
  if (Number.isNaN(approvedAt) || Number.isNaN(now)) return false;
  const ageDays = (now - approvedAt) / 86_400_000;
  return ageDays > policy.approvalExpiryDays;
}

/** Default policies per gate (governance-and-gates.md §3). */
export function defaultGatePolicy(gate: GateCode): GatePolicy {
  const base = { additionalRoles: [] as Role[], allowSelfApproval: false, approvalExpiryDays: 90 };
  switch (gate) {
    case 'G0':
      return { ...base, requiredRoles: ['BusinessAnalyst'], quorum: 1 };
    case 'G1':
      return { ...base, requiredRoles: ['BusinessApprover'], additionalRoles: ['BusinessAnalyst'], quorum: 1 };
    case 'G2':
      return { ...base, requiredRoles: ['BusinessApprover', 'ProcessArchitect'], quorum: 2 };
    case 'G3':
      return { ...base, requiredRoles: ['TechnicalApprover'], additionalRoles: ['ProcessArchitect'], quorum: 1 };
    case 'G4':
      return { ...base, requiredRoles: ['BusinessApprover', 'TechnicalApprover'], quorum: 2 };
  }
}
