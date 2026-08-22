/**
 * Governance contracts: projects, gates, baselines, approvals, audit.
 *
 * domain-model.md §2, governance-and-gates.md, ADR-0016, ADR-0017.
 */

import { z } from 'zod';
import {
  Classification,
  EntityId,
  GateCode,
  LocalizedText,
  Role,
  Sha256,
  Stage,
} from './primitives.ts';

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export const ProjectSettings = z.object({
  standardsProfileId: z.string().default('standards-default'),
  camundaTargetProfileId: z.string().default('camunda-8x-baseline'),
  /** false ⇒ a fully on-premise project (ADR-0021 rule 6). */
  allowExternalProviders: z.boolean().default(true),
  classificationDefault: Classification.default('INTERNAL'),
  /** Maximum classification this project may hold. */
  classificationCeiling: Classification.default('RESTRICTED'),
  strictness: z.enum(['strict', 'permissive']).default('strict'),
  defaultRequirementLanguage: z.string().default('en'),
  rafVersion: z.string().default('raf-1.1'),
  rulePackVersion: z.string().default('rp-1.2'),
});
export type ProjectSettings = z.infer<typeof ProjectSettings>;

export const Project = z.object({
  id: EntityId,
  key: z.string().regex(/^[a-z][a-z0-9-]{2,48}$/),
  name: LocalizedText,
  description: z.string().default(''),
  settings: ProjectSettings,
  createdBy: EntityId,
  createdAt: z.string(),
});
export type Project = z.infer<typeof Project>;

// ---------------------------------------------------------------------------
// Gate policy
// ---------------------------------------------------------------------------

export const GatePolicy = z.object({
  requiredRoles: z.array(Role).min(1),
  additionalRoles: z.array(Role).default([]),
  quorum: z.number().int().positive().default(1),
  /** Segregation of duties: default off (governance-and-gates.md §3). */
  allowSelfApproval: z.boolean().default(false),
  approvalExpiryDays: z.number().int().positive().default(90),
});
export type GatePolicy = z.infer<typeof GatePolicy>;

export const GateStatus = z.enum(['not_ready', 'ready', 'approved', 'rejected', 'reopened']);
export type GateStatus = z.infer<typeof GateStatus>;

export const Gate = z.object({
  code: GateCode,
  projectId: EntityId,
  status: GateStatus,
  policy: GatePolicy,
  /** The baseline this gate currently holds an approval for, if any. */
  approvedBaselineHash: Sha256.optional(),
});
export type Gate = z.infer<typeof Gate>;

// ---------------------------------------------------------------------------
// Baselines (ADR-0016)
// ---------------------------------------------------------------------------

/** One member of a baseline: an artifact at an exact version. */
export const BaselineMember = z.object({
  artifactId: EntityId,
  versionId: EntityId,
  contentHash: Sha256,
});
export type BaselineMember = z.infer<typeof BaselineMember>;

/**
 * A frozen, self-consistent set of member versions. Insert-only (invariant D8).
 * Dependencies resolve WITHIN the baseline, never against "latest".
 */
export const Baseline = z.object({
  id: EntityId,
  projectId: EntityId,
  stage: Stage,
  contentHash: Sha256,
  frozenAt: z.string(),
  members: z.array(BaselineMember),
  rafVersion: z.string(),
  rulePackVersion: z.string(),
  camundaTargetProfileId: z.string(),
});
export type Baseline = z.infer<typeof Baseline>;

// ---------------------------------------------------------------------------
// Approvals (ADR-0017)
// ---------------------------------------------------------------------------

/**
 * A signature over (baselineContentHash, validationRunId).
 *
 * If EITHER changes, the signature no longer matches and the gate reopens
 * automatically. There is no re-approve-without-re-review path.
 */
export const Approval = z.object({
  id: EntityId,
  projectId: EntityId,
  gate: GateCode,
  baselineId: EntityId,
  signedBaselineHash: Sha256,
  validationRunId: EntityId,
  approver: EntityId,
  roleAtApproval: Role,
  decision: z.enum(['approve', 'reject']),
  comment: z.string().default(''),
  at: z.string(),
});
export type Approval = z.infer<typeof Approval>;

// ---------------------------------------------------------------------------
// Audit (audit-and-compliance.md §1)
// ---------------------------------------------------------------------------

/** Append-only. No update path, no delete path, no administrative purge. */
export const AuditEvent = z.object({
  id: EntityId,
  at: z.string(),
  projectId: EntityId.optional(),
  actor: EntityId,
  rolesAtTime: z.array(Role),
  tokenIssuer: z.string().optional(),
  action: z.string().min(1),
  entityType: z.string().min(1),
  entityId: EntityId.optional(),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
  correlationId: z.string().optional(),
  gateContext: z
    .object({ gate: GateCode, baselineHash: Sha256.optional() })
    .optional(),
});
export type AuditEvent = z.infer<typeof AuditEvent>;

// ---------------------------------------------------------------------------
// Stage state
// ---------------------------------------------------------------------------

export const StageState = z.object({
  projectId: EntityId,
  stage: Stage,
  status: z.enum(['locked', 'open', 'submitted', 'approved', 'stale']),
  currentBaselineId: EntityId.optional(),
  enteredAt: z.string(),
});
export type StageState = z.infer<typeof StageState>;
