/**
 * Structured requirement proposals — V5.
 *
 * The entities [domain-model.md](../../../docs/20-domain/domain-model.md) §3 already
 * specifies, **restricted to the fields V5 populates**. Fields the domain model
 * defines but V5 does not set — `priority`, `acceptanceCriteria`, the approval
 * columns, the supersession chain — are **omitted rather than added and left
 * null**, so a later slice adds them deliberately rather than inheriting a field
 * nobody decided to fill.
 *
 * ## What a Requirement is here, and what it is not
 *
 * A V5 `Requirement` is a **proposal**: an L2 interpretation of evidence, always
 * `draft`, always citing at least one `EvidenceItem`, never approved. Promotion to
 * L4 is a human act ([ADR-0007](../../../docs/adr/ADR-0007-epistemic-ladder.md)),
 * and V5 builds no route to it — decision **J4**, enforced in SQL by migration
 * 008 rather than by convention.
 *
 * ## The field that does not exist
 *
 * There is no `text` the model wrote that we treat as authoritative without
 * recording that it was the model's: `originalAiText` keeps the pre-edit wording
 * for audit, and V5 never edits, so the two are equal today and will diverge the
 * moment a human workspace exists.
 */

import { z } from 'zod';
import { Bcp47, Classification, EntityId, EpistemicLevel } from './primitives.ts';

// ---------------------------------------------------------------------------
// RequirementSet
// ---------------------------------------------------------------------------

/**
 * Set status.
 *
 * `draft` is the only value V5 writes. The others exist because a set is the unit
 * a future baseline freezes, and naming them now costs nothing while renaming
 * them later would cost a migration.
 */
export const RequirementSetStatus = z.enum(['draft', 'in_review', 'baselined', 'superseded']);
export type RequirementSetStatus = z.infer<typeof RequirementSetStatus>;

export const RequirementSet = z.object({
  id: EntityId,
  projectId: EntityId,
  /** Monotonic per project. Version 1 is the first population pass. */
  version: z.number().int().positive(),
  status: RequirementSetStatus,
  /** The frame version the set was populated against — `raf-1.1` today. */
  rafVersion: z.string().min(1),
  createdBy: EntityId,
  createdAt: z.string(),
});
export type RequirementSet = z.infer<typeof RequirementSet>;

// ---------------------------------------------------------------------------
// Requirement
// ---------------------------------------------------------------------------

export const RequirementCategory = z.enum([
  'functional',
  'business_rule',
  'data',
  'integration',
  'nfr',
  'security',
  'constraint',
  'assumption',
  'dependency',
  'sla',
  'notification',
  'role',
]);
export type RequirementCategory = z.infer<typeof RequirementCategory>;

/**
 * Lifecycle status.
 *
 * V5 wrote `draft` and nothing else (**J4**). **V7 opens the review states** —
 * `in_review`, `needs_clarification`, `rejected`, `deferred` — and opens
 * `approved` **only to the G1 approval transaction** (**U1**), which migration 010
 * enforces by requiring an approver, a timestamp and a baseline alongside it.
 */
export const RequirementStatus = z.enum([
  'draft',
  'needs_clarification',
  'in_review',
  'approved',
  'rejected',
  'superseded',
  'deferred',
]);
export type RequirementStatus = z.infer<typeof RequirementStatus>;

/**
 * How the proposition relates to the evidence beneath it.
 *
 * `inferred` was **absent by decision J1** in V5, for a precise reason: an inferred
 * proposition has no direct source, and its only correct disposition — explicit
 * human confirmation — did not exist yet.
 *
 * **V7 is that slice, so `inferred` is admitted — for a HUMAN author carrying an
 * `inferenceRationale`, and for nobody else** (**U8-a**). An AI-authored inference
 * is refused by migration 010, not merely discouraged by a prompt: admitting one
 * would reopen exactly what J1 closed — a fluent, unfounded proposition that reads
 * like a finding.
 */
export const RequirementDerivation = z.enum(['extracted', 'interpreted', 'inferred']);
export type RequirementDerivation = z.infer<typeof RequirementDerivation>;

export const Requirement = z.object({
  /** `REQ-####`, per project, monotonic, never reused (invariant D15). */
  id: z.string().regex(/^REQ-\d{4,}$/),
  requirementSetId: EntityId,
  projectId: EntityId,

  /** The proposition, in the language of the evidence it rests on. */
  text: z.string().min(1),
  /** The model's wording before any human edit. V5 never edits, so they match. */
  originalAiText: z.string().min(1),
  category: RequirementCategory,
  /** One of the 27 RAF slots. Legality is checked by code, never by the model. */
  rafSlot: z.string().min(1),

  // --- provenance ---------------------------------------------------------
  /** L1 and L2 only in V5. L3 is refused (**J1**); L4 is a human act (ADR-0007). */
  epistemicLevel: EpistemicLevel,
  derivation: RequirementDerivation,
  /** Computed by us (ADR-0011), never provider-reported. */
  computedConfidence: z.number().min(0).max(1),
  confidenceBand: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  confidenceFunctionVersion: z.string().min(1),
  /**
   * Whether a human must confirm this before it can be relied on.
   *
   * Computed from level and confidence. It is not a workflow — nothing in V5
   * consumes it — but recording it at write time means the later workspace reads a
   * decision made with the evidence in hand rather than reconstructing one.
   */
  humanConfirmationRequired: z.boolean(),

  // --- versioning (V7, U2-a) ----------------------------------------------
  /**
   * Which version of this requirement this row is.
   *
   * The **id never changes** (invariant D15): `REQ-0007` is `REQ-0007` forever.
   * An edit creates a new version, and `(id, version)` is what a baseline member
   * names — because a signature over content that can change afterwards is not a
   * signature ([ADR-0017](../../../docs/adr/ADR-0017-approval-as-baseline-signature.md)).
   */
  version: z.number().int().positive().default(1),
  supersedesId: z.string().optional(),
  supersededById: z.string().optional(),
  /** Mandatory on every version after the first (governance §2.3). */
  changeReason: z.string().optional(),
  /**
   * **Required when `derivation` is `inferred`** (invariant D2, **U8-a**).
   *
   * A recommendation with no stated reasoning cannot be persisted, and this is the
   * field that makes a human-originated L3 answerable rather than merely asserted.
   */
  inferenceRationale: z.string().optional(),

  // --- lifecycle ----------------------------------------------------------
  status: RequirementStatus,
  /**
   * Written **only** by the G1 approval transaction (**U1**).
   *
   * Migration 010 refuses `status: 'approved'` without all three, and refuses all
   * three without `approved`. No edit, accept or status route can reach them.
   */
  approvedBy: EntityId.optional(),
  approvedAt: z.string().optional(),
  approvalBaselineId: EntityId.optional(),
  /**
   * Explicit confirmation of a LOW-confidence inferred requirement.
   *
   * G1 precondition 6 has always named this — *"every LOW-confidence inferred
   * requirement explicitly confirmed"* — and until V7 nothing could satisfy it,
   * because nothing could be inferred.
   */
  inferenceConfirmedBy: EntityId.optional(),
  inferenceConfirmedAt: z.string().optional(),

  // --- AI work provenance -------------------------------------------------
  generatedBy: z.enum(['ai', 'human', 'parser']),
  aiInteractionId: EntityId.optional(),
  promptVersion: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  capabilityTier: z.string().optional(),
  degradations: z.array(z.string()).default([]),
  /** The pass that proposed it — prompting provenance, not domain structure. */
  framePass: z.string().optional(),

  /** At least the maximum classification of its evidence (invariant D10). */
  classification: Classification,
  language: Bcp47,
  createdBy: EntityId,
  createdAt: z.string(),
});
export type Requirement = z.infer<typeof Requirement>;

// ---------------------------------------------------------------------------
// RequirementEvidenceLink
// ---------------------------------------------------------------------------

/**
 * The traceability edge, and the reason a requirement can exist at all.
 *
 * Every requirement has at least one (invariant **D2**), and every link names an
 * `EvidenceItem` whose anchor **re-resolved at write time**. The chain is
 * requirement → link → evidence → verified anchor → source, and no step is
 * optional.
 */
export const RequirementEvidenceLink = z.object({
  requirementId: z.string().min(1),
  evidenceItemId: EntityId,
  /**
   * What this evidence contributes.
   *
   * `primary` is the item the proposition principally restates; `supporting`
   * corroborates or qualifies it. Deterministic: the first cited item is primary,
   * because a model ranking its own citations would be an unverifiable judgement.
   */
  contribution: z.enum(['primary', 'supporting']),
});
export type RequirementEvidenceLink = z.infer<typeof RequirementEvidenceLink>;

// ---------------------------------------------------------------------------
// RequirementFlag
// ---------------------------------------------------------------------------

/**
 * Quality signals on a **grounded** proposal.
 *
 * RAF §3 derives the `ambiguities` slot from exactly these kinds, which is why
 * they are flags rather than catalogue rules (**J6**): G1's criterion is "0
 * blocking flags", so blocking-ness belongs to the flag.
 *
 * V5 raises `warning` and `info` only. Nothing here blocks, because the gate that
 * blocking would serve is V7.
 */
export const RequirementFlagKind = z.enum([
  'ambiguous',
  'vague_quantifier',
  'actor_unknown',
  'untestable',
  'unverifiable',
  'single_source',
  'content_unverified_evidence',
]);
export type RequirementFlagKind = z.infer<typeof RequirementFlagKind>;

export const RequirementFlag = z.object({
  id: EntityId,
  requirementId: z.string().min(1),
  projectId: EntityId,
  kind: RequirementFlagKind,
  severity: z.enum(['blocking', 'warning', 'info']),
  detail: z.string().min(1),
  /** `rule` in V5. `ai` and `human` exist for later slices; neither is written here. */
  raisedBy: z.enum(['ai', 'human', 'rule']),
  createdAt: z.string(),

  /**
   * Resolution — written by a human in **V7**.
   *
   * The columns existed from migration 008 and were unwritten; migration 010 adds
   * the rule that makes them meaningful: all three together, or none. An
   * unresolved blocking flag is a G1 blocker (`L4-REQ-002`).
   */
  resolution: z.string().optional(),
  resolvedBy: EntityId.optional(),
  resolvedAt: z.string().optional(),
});
export type RequirementFlag = z.infer<typeof RequirementFlag>;

// ---------------------------------------------------------------------------
// RequirementRejection — J9
// ---------------------------------------------------------------------------

/**
 * Why a proposed requirement did not become one. Closed set, so it can be counted.
 *
 * Free text cannot be counted, and a rejection nobody can count is a rejection
 * nobody measures.
 */
export const ProposalRejectionReason = z.enum([
  /** The model cited no evidence at all — an L3 inference by another name (**J1**). */
  'no_evidence_cited',
  /** It cited an id that was not in the batch it was shown. */
  'evidence_not_in_batch',
  /** It cited an id that does not exist, or belongs to another project. */
  'evidence_not_found',
  /** A cited anchor did not re-resolve at write time (ADR-0008). */
  'anchor_unresolved',
  /** The proposed slot is not one of the 27, or not in this pass. */
  'slot_not_in_pass',
  /** The v1.1 disjointness rules place this item in the other slot of a pair. */
  'disjointness_violation',
  /** The proposal's classification would sit below its evidence (invariant D10). */
  'classification_violation',
  /** No text after trimming. */
  'empty_text',
  /** An identical proposition on identical evidence is already held. */
  'duplicate',
]);
export type ProposalRejectionReason = z.infer<typeof ProposalRejectionReason>;

/**
 * A rejected proposal, retained in full — **J9**.
 *
 * [ADR-0032](../../../docs/adr/ADR-0032-retain-everything.md) requires the audit log
 * to retain "rejected proposals and rejected requirements", and this is that
 * record. **The text is kept, not a checksum**, which is a deliberate difference
 * from V4b's **F2**: a rejected *quote* is unanchored source content, while this is
 * model-authored text about which the ADR is explicit.
 *
 * It carries a classification because the proposition may paraphrase classified
 * source material, so it is read under the same controls as the evidence it names.
 */
export const RequirementRejection = z.object({
  id: EntityId,
  projectId: EntityId,
  requirementSetId: EntityId,
  reason: ProposalRejectionReason,
  detail: z.string().min(1),
  /** The model's proposed text, retained (**J9**). */
  proposedText: z.string(),
  /** The slot it proposed, when it proposed a parseable one. */
  proposedSlot: z.string().optional(),
  /** Evidence ids it cited, whether or not they resolved. */
  citedEvidenceIds: z.array(z.string()).default([]),
  framePass: z.string(),
  aiInteractionId: EntityId.optional(),
  classification: Classification,
  createdAt: z.string(),
});
export type RequirementRejection = z.infer<typeof RequirementRejection>;

// ---------------------------------------------------------------------------
// The human workspace — V7
// ---------------------------------------------------------------------------

/**
 * What caused a clarification question to exist — **U6**.
 *
 * **A question with no cause is refused.** The question *set* is derived
 * deterministically from flags, coverage gaps and conflicts, because a model that
 * forgot a gap could otherwise hide it — which is ADR-0010's whole argument,
 * applied to questions. Only the *wording* may be AI-proposed.
 */
export const QuestionCauseKind = z.enum([
  'flag',
  'empty_required_slot',
  'weak_required_slot',
  'blocked_by_policy_slot',
  'unresolved_conflict',
]);
export type QuestionCauseKind = z.infer<typeof QuestionCauseKind>;

export const OpenQuestion = z.object({
  id: EntityId,
  projectId: EntityId,
  requirementSetId: EntityId,
  /** The deterministic cause, and the id of the thing that caused it. Both required. */
  causeKind: QuestionCauseKind,
  causeId: z.string().min(1),
  rafSlot: z.string().optional(),
  question: z.string().min(1),
  whyItMatters: z.string().min(1),
  /**
   * **Derived, never chosen:** a question is blocking when its cause blocks G1 —
   * an empty required slot, a blocking flag, an unresolved conflict. Letting a
   * model or a user set this would make G1's precondition negotiable.
   */
  blocking: z.boolean(),
  /** Present when a model worded it. The wording is advisory; the cause is not. */
  aiInteractionId: EntityId.optional(),
  answer: z.string().optional(),
  answeredBy: EntityId.optional(),
  answeredAt: z.string().optional(),
  /**
   * **U7:** the answer becomes a `SourceUnit` in an interview transcript, so a
   * requirement derived from a human answer is anchored exactly as strongly as one
   * derived from a document. The domain model's own mechanism; no new provenance
   * path and no exception to ADR-0008.
   */
  becameSourceUnitId: EntityId.optional(),
  createdAt: z.string(),
});
export type OpenQuestion = z.infer<typeof OpenQuestion>;

/**
 * A human acknowledgement that a RAF slot could not be populated **because policy
 * forbade reading the material** — G1 precondition 7.
 *
 * *"We were not permitted to read this"* is a fundamentally different finding from
 * *"the sources do not say"* (data-governance.md §3.1), and G1 requires the
 * difference to be acknowledged rather than silently passed over.
 */
/**
 * A RAF slot that data-governance policy prevented the system from analysing.
 *
 * The symmetric record to [PolicyAcknowledgement]: one states that analysis was
 * **denied**, the other that a human **accepted the consequence** at G1.
 *
 * It exists because *"we were not permitted to read this"* is a fundamentally
 * different finding from *"the sources do not say"* (data-governance.md §3.1),
 * and without a record the first silently becomes the second on the next read.
 */
export const SlotPolicyBlock = z.object({
  id: EntityId,
  projectId: EntityId,
  requirementSetId: EntityId,
  rafSlot: z.string().min(1),
  /** The classification that could not leave. */
  classification: z.string().min(1),
  /** Where it could not go. */
  provider: z.string().min(1),
  reason: z.string().min(1),
  blockedAt: z.string(),
});
export type SlotPolicyBlock = z.infer<typeof SlotPolicyBlock>;

export const PolicyAcknowledgement = z.object({
  id: EntityId,
  projectId: EntityId,
  requirementSetId: EntityId,
  rafSlot: z.string().min(1),
  acknowledgedBy: EntityId,
  acknowledgedAt: z.string(),
  rationale: z.string().min(1),
});
export type PolicyAcknowledgement = z.infer<typeof PolicyAcknowledgement>;

/** How a human decided a conflict — **U3**. Closed set, so decisions are countable. */
export const ConflictDecision = z.enum([
  /** Precedence was followed. */
  'accepted_recommendation',
  /** The other participant was chosen. The rationale is what a future reader needs. */
  'chose_alternative',
  /** Not a conflict at all — a labelled false positive, and V6's missing ground truth. */
  'not_a_conflict',
]);
export type ConflictDecision = z.infer<typeof ConflictDecision>;
