/**
 * Command layer.
 *
 * Owns transactions, gate guards, RBAC and audit interception
 * (architecture-overview.md §1).
 *
 * INVARIANT I3: there is no command that mutates a generated artifact. Not
 * disabled, not permission-gated — absent. The command registry below is
 * exhaustive, and the architecture checker asserts that no handler targets an
 * ArtifactVersion (ADR-0002).
 */

import {
  approveGate as domainApproveGate,
  canEnterStage,
  computeBaselineHash,
  defaultGatePolicy,
  evaluateGate,
  freezeBaseline,
  reopenIfInvalidated,
} from '@asdp/domain';
import type {
  Approval,
  AuditEvent,
  Baseline,
  BaselineMember,
  Gate,
  GateCode,
  Project,
  Role,
  Stage,
} from '@asdp/schemas';
import { GATE_ORDER, ProjectSettings } from '@asdp/schemas';
import type { Clock, IdGenerator, Repositories } from './ports.ts';

// ---------------------------------------------------------------------------
// Actor
// ---------------------------------------------------------------------------

/**
 * The authenticated caller. `kind` exists because several invariants (D3, D14)
 * turn on whether an act was human-initiated.
 */
export interface Actor {
  readonly subject: string;
  readonly roles: readonly Role[];
  readonly kind: 'human' | 'system';
  readonly tokenIssuer?: string;
}

export class AuthorizationError extends Error {}
export class GateGuardError extends Error {}
export class ValidationError extends Error {}

// ---------------------------------------------------------------------------
// Command registry — exhaustive and declared
// ---------------------------------------------------------------------------

/**
 * Every command in the system. `mutatesArtifact` is present so the assertion is
 * explicit rather than implied: it is `false` on every entry, permanently.
 */
export interface CommandDescriptor {
  readonly name: string;
  readonly requiredRoles: readonly Role[];
  /** The stage this command writes to, if any. Drives the read-lock check. */
  readonly stage: Stage | null;
  /** ADR-0002: permanently false for every command. */
  readonly mutatesArtifact: false;
}

export const COMMANDS: readonly CommandDescriptor[] = [
  { name: 'createProject', requiredRoles: ['PlatformAdmin', 'ProcessArchitect'], stage: null, mutatesArtifact: false },
  { name: 'freezeBaseline', requiredRoles: ['BusinessAnalyst', 'ProcessArchitect'], stage: null, mutatesArtifact: false },
  { name: 'evaluateGate', requiredRoles: ['BusinessAnalyst', 'ProcessArchitect', 'TechnicalApprover'], stage: null, mutatesArtifact: false },
  { name: 'approveGate', requiredRoles: ['BusinessApprover', 'TechnicalApprover', 'ProcessArchitect'], stage: null, mutatesArtifact: false },
  { name: 'enterStage', requiredRoles: ['BusinessAnalyst', 'ProcessArchitect'], stage: null, mutatesArtifact: false },

  // --- V1 intake ---------------------------------------------------------
  // `Contributor` may upload a source, because gathering material is not an
  // analytical act. Ranking authority and recording evidence are, so they need
  // an analyst or an architect: authority ranking is the deterministic input to
  // conflict precedence (ADR-0012) and must not be set casually.
  { name: 'ingestSource', requiredRoles: ['Contributor', 'BusinessAnalyst', 'ProcessArchitect'], stage: 'intake', mutatesArtifact: false },
  { name: 'setSourceAuthorityRank', requiredRoles: ['BusinessAnalyst', 'ProcessArchitect'], stage: 'intake', mutatesArtifact: false },
  { name: 'recordEvidence', requiredRoles: ['BusinessAnalyst', 'ProcessArchitect'], stage: 'intake', mutatesArtifact: false },
  { name: 'validateIntake', requiredRoles: ['Viewer', 'Contributor', 'BusinessAnalyst', 'ProcessArchitect', 'ComplianceReviewer'], stage: null, mutatesArtifact: false },
  // V4a. Profiling SPENDS MONEY and may send content to a provider, so it is not
  // a Viewer action even though its output is only commentary. Reading the
  // interaction log is wider: the AI-disclosure question — "what was sent
  // outside, and why?" — is exactly what a compliance reviewer is there to ask.
  { name: 'profileSource', requiredRoles: ['BusinessAnalyst', 'ProcessArchitect'], stage: 'intake', mutatesArtifact: false },
  { name: 'listAiInteractions', requiredRoles: ['Viewer', 'Contributor', 'BusinessAnalyst', 'ProcessArchitect', 'ComplianceReviewer', 'PlatformAdmin'], stage: null, mutatesArtifact: false },
];

export function commandDescriptor(name: string): CommandDescriptor {
  const found = COMMANDS.find((c) => c.name === name);
  if (found === undefined) throw new Error(`unknown command '${name}'`);
  return found;
}

/** Role capability check — the first of the three authorisation checks. */
export function assertRole(actor: Actor, command: string): void {
  const descriptor = commandDescriptor(command);
  const permitted = descriptor.requiredRoles.some((r) => actor.roles.includes(r));
  if (!permitted) {
    throw new AuthorizationError(
      `role(s) [${actor.roles.join(', ')}] may not execute '${command}'; requires one of [${descriptor.requiredRoles.join(', ')}]`,
    );
  }
}

// ---------------------------------------------------------------------------
// Command context
// ---------------------------------------------------------------------------

export interface CommandContext {
  readonly repos: Repositories;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly correlationId: string;
}

async function audit(
  ctx: CommandContext,
  actor: Actor,
  event: Omit<AuditEvent, 'id' | 'at' | 'actor' | 'rolesAtTime' | 'tokenIssuer' | 'correlationId'>,
): Promise<void> {
  await ctx.repos.audit.append({
    id: ctx.ids.next('aud'),
    at: ctx.clock.nowIso(),
    actor: actor.subject,
    rolesAtTime: [...actor.roles],
    tokenIssuer: actor.tokenIssuer,
    correlationId: ctx.correlationId,
    ...event,
  });
}

// ---------------------------------------------------------------------------
// createProject
// ---------------------------------------------------------------------------

export interface CreateProjectInput {
  readonly key: string;
  readonly name: string;
  readonly description?: string;
  readonly settings?: Partial<ProjectSettings>;
}

export async function createProject(
  ctx: CommandContext,
  actor: Actor,
  input: CreateProjectInput,
): Promise<Project> {
  assertRole(actor, 'createProject');

  if (!/^[a-z][a-z0-9-]{2,48}$/.test(input.key)) {
    throw new ValidationError(
      `project key must be lower-case ASCII, 3–49 chars: '${input.key}'`,
    );
  }
  if (await ctx.repos.projects.getByKey(input.key) !== undefined) {
    throw new ValidationError(`project key '${input.key}' already in use`);
  }

  const settings = ProjectSettings.parse(input.settings ?? {});
  const project: Project = {
    id: ctx.ids.next('prj'),
    key: input.key,
    name: { primary: { lang: 'en', text: input.name, direction: 'ltr' }, translations: [] },
    description: input.description ?? '',
    settings,
    createdBy: actor.subject,
    createdAt: ctx.clock.nowIso(),
  };

  await ctx.repos.projects.create(project);

  // Every project starts with all five gates closed. Downstream stages are
  // therefore read-locked from creation (ADR-0017).
  const gates: Gate[] = GATE_ORDER.map((code) => ({
    code,
    projectId: project.id,
    status: 'not_ready' as const,
    policy: defaultGatePolicy(code),
  }));
  await ctx.repos.gates.putAll(project.id, gates);

  await audit(ctx, actor, {
    projectId: project.id,
    action: 'project.created',
    entityType: 'Project',
    entityId: project.id,
    after: { key: project.key, settings },
  });

  return project;
}

// ---------------------------------------------------------------------------
// freezeBaseline
// ---------------------------------------------------------------------------

export interface FreezeBaselineInput {
  readonly projectId: string;
  readonly stage: Stage;
  readonly members: readonly BaselineMember[];
}

export async function freezeProjectBaseline(
  ctx: CommandContext,
  actor: Actor,
  input: FreezeBaselineInput,
): Promise<Baseline> {
  assertRole(actor, 'freezeBaseline');

  const project = await ctx.repos.projects.get(input.projectId);
  if (project === undefined) throw new ValidationError(`unknown project ${input.projectId}`);

  const baseline = freezeBaseline(
    ctx.ids.next('bl'),
    {
      projectId: project.id,
      stage: input.stage,
      members: input.members,
      rafVersion: project.settings.rafVersion,
      rulePackVersion: project.settings.rulePackVersion,
      camundaTargetProfileId: project.settings.camundaTargetProfileId,
    },
    ctx.clock.nowIso(),
  );

  await ctx.repos.baselines.insert(baseline);
  await audit(ctx, actor, {
    projectId: project.id,
    action: 'baseline.frozen',
    entityType: 'Baseline',
    entityId: baseline.id,
    after: { stage: baseline.stage, contentHash: baseline.contentHash, memberCount: baseline.members.length },
  });
  return baseline;
}

// ---------------------------------------------------------------------------
// evaluateGate
// ---------------------------------------------------------------------------

export interface EvaluateGateInput {
  readonly projectId: string;
  readonly gate: GateCode;
  readonly baselineId: string;
  readonly validationRunId: string;
  /** Blocking findings for THIS gate, from the Validation Engine (invariant I6). */
  readonly blockingFindingIds: readonly string[];
}

export async function evaluateProjectGate(
  ctx: CommandContext,
  actor: Actor,
  input: EvaluateGateInput,
): Promise<Gate> {
  assertRole(actor, 'evaluateGate');

  const held = await ctx.repos.gates.get(input.projectId, input.gate);
  if (held === undefined) throw new ValidationError(`unknown gate ${input.gate}`);

  const baseline = await ctx.repos.baselines.get(input.baselineId);
  if (baseline === undefined) throw new ValidationError(`unknown baseline ${input.baselineId}`);

  const next = evaluateGate(held.value, {
    blockingFindingIds: input.blockingFindingIds,
    baselineHash: baseline.contentHash,
    validationRunId: input.validationRunId,
  });

  await ctx.repos.gates.update(input.projectId, next, held.version);
  await audit(ctx, actor, {
    projectId: input.projectId,
    action: 'gate.evaluated',
    entityType: 'Gate',
    entityId: input.gate,
    before: { status: held.value.status },
    after: { status: next.status, blockingFindings: input.blockingFindingIds.length },
    gateContext: { gate: input.gate, baselineHash: baseline.contentHash },
  });
  return next;
}

// ---------------------------------------------------------------------------
// approveGate
// ---------------------------------------------------------------------------

export interface ApproveGateInput {
  readonly projectId: string;
  readonly gate: GateCode;
  readonly baselineId: string;
  readonly validationRunId: string;
  readonly comment?: string;
  /** Authors of the content under approval, for segregation of duties. */
  readonly contentAuthors?: readonly string[];
}

export interface ApproveGateResult {
  readonly gate: Gate;
  readonly approval: Approval;
  readonly quorumMet: boolean;
}

export async function approveProjectGate(
  ctx: CommandContext,
  actor: Actor,
  input: ApproveGateInput,
): Promise<ApproveGateResult> {
  assertRole(actor, 'approveGate');

  const held = await ctx.repos.gates.get(input.projectId, input.gate);
  if (held === undefined) throw new ValidationError(`unknown gate ${input.gate}`);

  const baseline = await ctx.repos.baselines.get(input.baselineId);
  if (baseline === undefined) throw new ValidationError(`unknown baseline ${input.baselineId}`);

  const existing = await ctx.repos.approvals.listForGate(input.projectId, input.gate);

  // The approver's role must be one the gate policy permits; pick the first
  // matching role so the record states which capacity they signed in.
  const permitted: readonly Role[] = [
    ...held.value.policy.requiredRoles,
    ...held.value.policy.additionalRoles,
  ];
  const roleAtApproval = actor.roles.find((r) => permitted.includes(r));
  if (roleAtApproval === undefined) {
    throw new AuthorizationError(
      `role(s) [${actor.roles.join(', ')}] may not approve ${input.gate}`,
    );
  }

  const outcome = domainApproveGate(held.value, {
    approver: actor.subject,
    roleAtApproval,
    baselineHash: baseline.contentHash,
    validationRunId: input.validationRunId,
    contentAuthors: input.contentAuthors ?? [],
    existingApprovals: existing,
  });

  if (!outcome.ok) throw new GateGuardError(outcome.reason);

  const approval: Approval = {
    id: ctx.ids.next('ap'),
    projectId: input.projectId,
    gate: input.gate,
    baselineId: baseline.id,
    signedBaselineHash: baseline.contentHash,
    validationRunId: input.validationRunId,
    approver: actor.subject,
    roleAtApproval,
    decision: 'approve',
    comment: input.comment ?? '',
    at: ctx.clock.nowIso(),
  };

  await ctx.repos.approvals.insert(approval);
  await ctx.repos.gates.update(input.projectId, outcome.gate, held.version);
  await audit(ctx, actor, {
    projectId: input.projectId,
    action: 'gate.approved',
    entityType: 'Approval',
    entityId: approval.id,
    after: {
      gate: input.gate,
      signedBaselineHash: approval.signedBaselineHash,
      validationRunId: approval.validationRunId,
      status: outcome.gate.status,
    },
    gateContext: { gate: input.gate, baselineHash: baseline.contentHash },
  });

  return {
    gate: outcome.gate,
    approval,
    quorumMet: outcome.gate.status === 'approved',
  };
}

// ---------------------------------------------------------------------------
// Read-lock guard and automatic reopening
// ---------------------------------------------------------------------------

/**
 * Assert a stage may be entered. This is where "no silent conversion of vague
 * requirements into executable BPMN" is enforced: the generation stage is
 * unreachable until G2 is approved.
 */
export async function assertStageEnterable(
  ctx: CommandContext,
  projectId: string,
  stage: Stage,
): Promise<void> {
  const gates = await ctx.repos.gates.list(projectId);
  const byCode = Object.fromEntries(gates.map((g) => [g.code, g])) as Record<GateCode, Gate>;
  const decision = canEnterStage(stage, { gates: byCode });
  if (!decision.allowed) throw new GateGuardError(decision.reason);
}

/**
 * Re-check every approved gate against current content and reopen any whose
 * signature no longer matches (ADR-0017). Called after any change that could
 * alter a baseline or a validation run.
 */
export async function reconcileGates(
  ctx: CommandContext,
  actor: Actor,
  projectId: string,
  current: { readonly baselineHash: string; readonly validationRunId: string },
): Promise<readonly GateCode[]> {
  const reopened: GateCode[] = [];
  for (const code of GATE_ORDER) {
    const held = await ctx.repos.gates.get(projectId, code);
    if (held === undefined || held.value.status !== 'approved') continue;

    const approvals = await ctx.repos.approvals.listForGate(projectId, code);
    const signing = approvals.find(
      (a) => a.signedBaselineHash === held.value.approvedBaselineHash && a.decision === 'approve',
    );

    const result = reopenIfInvalidated(held.value, signing, current);
    if (!result.reopened) continue;

    await ctx.repos.gates.update(projectId, result.gate, held.version);
    reopened.push(code);
    await audit(ctx, actor, {
      projectId,
      action: 'gate.reopened',
      entityType: 'Gate',
      entityId: code,
      before: { status: 'approved' },
      after: { status: result.gate.status, reason: result.reason },
      gateContext: { gate: code },
    });
  }
  return reopened;
}

/** Recompute a baseline hash without persisting — used by reconciliation. */
export function projectBaselineHash(
  project: Project,
  stage: Stage,
  members: readonly BaselineMember[],
): string {
  return computeBaselineHash({
    projectId: project.id,
    stage,
    members,
    rafVersion: project.settings.rafVersion,
    rulePackVersion: project.settings.rulePackVersion,
    camundaTargetProfileId: project.settings.camundaTargetProfileId,
  });
}
