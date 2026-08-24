/**
 * Canonicalisation, conflict candidates and reconciliation — V6.
 *
 * The entities [domain-model.md](../../../docs/20-domain/domain-model.md) §4–§5
 * already specifies, **restricted to what V6 populates**. Fields the domain model
 * defines but V6 leaves alone — `Conflict.decision`, `decidedBy`, `decidedAt` —
 * are present and **nullable**, because they exist and V7 fills them; they are not
 * omitted, because omitting them would hide that they are deliberately empty.
 *
 * ## The one thing to understand before reading further
 *
 * **Nothing here decides anything.** A `Conflict` written by V6 means *"these
 * propositions may not both hold, here is why, and here is what precedence would
 * suggest"*. `decision` is always null (**Q1**), and the recommendation is named
 * `proposedResolution` rather than `resolution` because the name is part of the
 * guarantee.
 *
 * ## Why canonical entities live here rather than in a registry
 *
 * **Q2:** these are scoped to reconciliation. They exist so two propositions can
 * be compared, not so anyone can browse a glossary. The P3 Domain Model Registry
 * is a separate product surface and promoting these rows into it is a future
 * explicit architecture decision.
 */

import { z } from 'zod';
import { Bcp47, Classification, EntityId } from './primitives.ts';

// ---------------------------------------------------------------------------
// Canonical entities
// ---------------------------------------------------------------------------

/**
 * What kind of thing a canonical entity is.
 *
 * Mirrors the domain vocabulary ([domain-model.md](../../../docs/20-domain/domain-model.md)
 * §5) so a later promotion into the Registry is a move rather than a translation.
 * **Merging across kinds is refused** — a human role and a system are not the same
 * thing however similar their names.
 */
export const CanonicalEntityKind = z.enum([
  'term',
  'actor',
  'data_entity',
  'business_rule',
  'business_event',
]);
export type CanonicalEntityKind = z.infer<typeof CanonicalEntityKind>;

/**
 * How a canonical entity came to exist.
 *
 * The distinction **Q3** rests on: `deterministic` means exact match-form equality
 * — a fact about text, which code may act on. `ai_proposed` means a model claimed
 * two surface forms mean the same thing, which is a claim about the business and
 * stays a candidate until a human confirms it in V7.
 */
export const CanonicalOrigin = z.enum(['deterministic', 'ai_proposed']);
export type CanonicalOrigin = z.infer<typeof CanonicalOrigin>;

export const CanonicalEntity = z.object({
  id: EntityId,
  projectId: EntityId,
  requirementSetId: EntityId,
  kind: CanonicalEntityKind,
  /**
   * Bilingual label, both required in shape and at least one non-empty in fact.
   *
   * A canonical entity with only an English label silently becomes an English
   * concept, and ADR-0023 exists to prevent exactly that.
   */
  labelEn: z.string(),
  labelAr: z.string(),
  /** The match form the deterministic grouping used. Derived, never truth (ADR-0023). */
  matchForm: z.string().min(1),
  origin: CanonicalOrigin,
  /** At least the maximum classification of its aliases' requirements (D10). */
  classification: Classification,
  /**
   * Ids this entity absorbed, so a merge is **reversible and auditable**
   * (`mergedFromIds[]` in the domain model). Over-merge is silent, and this is
   * what makes it undoable rather than merely regrettable.
   */
  mergedFromIds: z.array(z.string()).default([]),
  /** Every requirement whose text contributed a surface form. */
  requirementIds: z.array(z.string()).default([]),
  aiInteractionId: EntityId.optional(),
  /**
   * **Null in V6, always.** A non-exact merge is confirmed by a human in V7, and
   * until then it may group candidates for review but may not resolve one.
   */
  confirmedBy: EntityId.optional(),
  confirmedAt: z.string().optional(),
  createdAt: z.string(),
});
export type CanonicalEntity = z.infer<typeof CanonicalEntity>;

/** One observed surface form, and where it was observed. */
export const CanonicalEntityAlias = z.object({
  id: EntityId,
  canonicalEntityId: EntityId,
  /**
   * The owning project.
   *
   * An alias names a REQUIREMENT, and a requirement's identity is
   * `(projectId, id)` since H4 — so `requirementId` alone does not name one. It
   * is also what lets the composite foreign key refuse an alias that reaches
   * across a project boundary.
   */
  projectId: EntityId,
  /** As written in the requirement text. */
  surfaceForm: z.string().min(1),
  /** The folded form (ADR-0023 §2): what equality was actually tested on. */
  matchForm: z.string().min(1),
  language: Bcp47,
  origin: CanonicalOrigin,
  requirementId: z.string().min(1),
  aiInteractionId: EntityId.optional(),
});
export type CanonicalEntityAlias = z.infer<typeof CanonicalEntityAlias>;

// ---------------------------------------------------------------------------
// Cross-source classification — Q8
// ---------------------------------------------------------------------------

/**
 * What the relationship between two propositions is. **Five outcomes, and only
 * one of them is a conflict.**
 *
 * The taxonomy exists because the most damaging failure here is a detector that
 * treats textual difference as business disagreement: it produces a queue nobody
 * trusts, and an abandoned queue blocks G1 forever.
 *
 * **AI may propose `equivalent`, `complementary` and `potentially_contradictory`.
 * It may never establish `true_conflict`** — that is a human act in V7, and no
 * V6 code path writes it.
 */
export const CrossSourceClassification = z.enum([
  /** Identical normalised text AND identical evidence set. Deterministic; V5 already collapses these. */
  'duplicate',
  /** Different wording, same business content, after canonicalisation. */
  'equivalent',
  /** Both true, same topic, adding different things. NEVER a conflict. */
  'complementary',
  /** Same topic, and both cannot hold as stated. A CANDIDATE, with an explanation. */
  'potentially_contradictory',
  /** A human has confirmed the contradiction is real. **V7 only.** */
  'true_conflict',
]);
export type CrossSourceClassification = z.infer<typeof CrossSourceClassification>;

/** The three a model is permitted to propose. `true_conflict` and `duplicate` are not among them. */
export const AI_PROPOSABLE_CLASSIFICATIONS: readonly CrossSourceClassification[] = [
  'equivalent',
  'complementary',
  'potentially_contradictory',
];

// ---------------------------------------------------------------------------
// Conflict
// ---------------------------------------------------------------------------

export const ConflictParticipantRole = z.enum(['requirement', 'evidence']);
export type ConflictParticipantRole = z.infer<typeof ConflictParticipantRole>;

export const ConflictParticipant = z.object({
  conflictId: EntityId,
  role: ConflictParticipantRole,
  /** A `REQ-####` or an evidence id. Resolved at write time; `L1-CONF-001` re-checks. */
  entityId: z.string().min(1),
});
export type ConflictParticipant = z.infer<typeof ConflictParticipant>;

/** The recorded precedence computation — never a decision (**Q5**). */
export const PrecedenceRationale = z.object({
  /** Which ADR-0012 step produced the recommendation, or `undecidable`. */
  decidedByStep: z.enum([
    'source_authority',
    'effective_date',
    'specificity',
    'epistemic_level',
    'undecidable',
  ]),
  steps: z
    .array(
      z.object({
        step: z.string(),
        outcome: z.enum(['a', 'b', 'tie', 'not_comparable']),
        detail: z.string(),
      }),
    )
    .default([]),
  rationale: z.string(),
  /** A rationale whose function is unknown cannot be compared to another. */
  functionVersion: z.string().min(1),
  undecidable: z.boolean(),
});
export type PrecedenceRationale = z.infer<typeof PrecedenceRationale>;

export const Conflict = z.object({
  id: EntityId,
  projectId: EntityId,
  requirementSetId: EntityId,
  /** What the disagreement is about. AI-proposed, human-editable in V7. */
  topic: z.string().min(1),
  /** The RAF slot both propositions sit in. Comparison is slot-scoped. */
  rafSlot: z.string().min(1),
  classification: CrossSourceClassification,
  /** The model's explanation of why these may not both hold. */
  explanation: z.string(),
  /** The task, prompt version and interaction. An undisclosable detection is not one. */
  detectedBy: z.string().min(1),
  aiInteractionId: EntityId.optional(),

  /**
   * Which participant precedence favours — **a recommendation, never applied**
   * (**Q5**). Absent when precedence could not separate them.
   */
  recommendedRequirementId: z.string().optional(),
  proposedResolution: z.string().optional(),
  precedenceRationale: PrecedenceRationale.optional(),

  /** At least the maximum classification of its participants (D10). */
  dataClassification: Classification,

  /**
   * **Always null in V6** (**Q1**), and refused on insert by migration 009.
   *
   * ADR-0012: *"a human MUST decide every conflict"*. The columns exist because
   * V7 fills them, and adding them later would mean migrating rows that already
   * matter.
   */
  decision: z.string().optional(),
  decidedBy: EntityId.optional(),
  decidedAt: z.string().optional(),

  createdAt: z.string(),
});
export type Conflict = z.infer<typeof Conflict>;

/**
 * A typed relation between two requirement proposals.
 *
 * The domain model's `RequirementRelation`. V6 writes `duplicates` and
 * `conflicts`; `refines` and `depends_on` exist in the vocabulary and are not
 * produced here.
 */
export const RequirementRelation = z.object({
  id: EntityId,
  projectId: EntityId,
  fromId: z.string().min(1),
  toId: z.string().min(1),
  kind: z.enum(['refines', 'conflicts', 'depends_on', 'duplicates']),
  detectedBy: z.string().min(1),
  aiInteractionId: EntityId.optional(),
  createdAt: z.string(),
});
export type RequirementRelation = z.infer<typeof RequirementRelation>;

// ---------------------------------------------------------------------------
// Rejections — J9 applied again
// ---------------------------------------------------------------------------

/** Why a canonicalisation or reconciliation candidate was refused. Closed set. */
export const ReconciliationRejectionReason = z.enum([
  /** A merge candidate named a surface form the pass was not shown. */
  'surface_form_not_in_batch',
  /** A merge candidate spanned entity kinds. */
  'merge_across_kinds',
  /** A merge candidate spanned classifications, which would raise one silently. */
  'merge_across_classifications',
  /** A merge candidate had fewer than two members, so it merges nothing. */
  'merge_degenerate',
  /** A conflict candidate named a requirement the pass was not shown. */
  'requirement_not_in_batch',
  /** A conflict candidate named requirements in different RAF slots. */
  'cross_slot_candidate',
  /** The model proposed `true_conflict`, which only a human may establish (**Q8**). */
  'true_conflict_proposed_by_ai',
  /** The model proposed a classification outside the closed set. */
  'classification_not_permitted',
  /** The model proposed a resolution rather than an explanation (**Q5**). */
  'resolution_proposed_by_ai',
  /** Fewer than two distinct participants: nothing to compare. */
  'degenerate_candidate',
]);
export type ReconciliationRejectionReason = z.infer<typeof ReconciliationRejectionReason>;

/**
 * A rejected candidate, retained **in full** — **J9**, applied to V6's output.
 *
 * [ADR-0032](../../../docs/adr/ADR-0032-retain-everything.md) requires the
 * append-only record to retain rejected proposals, and a rejected merge or
 * conflict candidate is one. The text is kept, not a checksum: it is
 * model-authored, not a copied source span, and with limitation 62 outstanding
 * there is no payload store to recover it from.
 */
export const ReconciliationRejection = z.object({
  id: EntityId,
  projectId: EntityId,
  requirementSetId: EntityId,
  task: z.enum(['CANONICALISE_ENTITIES', 'RECONCILE_SOURCES']),
  reason: ReconciliationRejectionReason,
  detail: z.string().min(1),
  /** The candidate as the model proposed it, retained verbatim. */
  proposedPayload: z.string(),
  aiInteractionId: EntityId.optional(),
  classification: Classification,
  createdAt: z.string(),
});
export type ReconciliationRejection = z.infer<typeof ReconciliationRejection>;

// ---------------------------------------------------------------------------
// The reconciliation-aware read model — Q6
// ---------------------------------------------------------------------------

/**
 * What reconciliation says about one requirement, **computed on read**.
 *
 * Nothing here is stored against the requirement, and that is decision **Q6**: V5
 * rows are insert-only and their confidence is a stored function of stored
 * factors. Mutating `crossSourceAgreement` would make a recorded score
 * unreproducible; recomputing it on read leaves the original auditable and the
 * derived view honest.
 */
export const ReconciledAgreement = z.object({
  requirementId: z.string().min(1),
  /** As stored by V5. Always `silent`, and never rewritten. */
  storedAgreement: z.enum(['corroborated', 'silent', 'contradicted']),
  /**
   * As reconciliation sees it now.
   *
   * **`corroborated` only on DETERMINISTIC equivalence across distinct sources.**
   * An AI-proposed equivalence is provisional until a human confirms it in V7, and
   * **absence of a detected conflict never becomes agreement** — a detector that
   * found nothing and a corpus with nothing to find are indistinguishable.
   */
  reconciledAgreement: z.enum(['corroborated', 'silent', 'contradicted']),
  /** True when an AI-proposed equivalence would have raised this and did not. */
  provisionalCorroboration: z.boolean(),
  /** Why the reconciled value differs from the stored one, or why it does not. */
  reason: z.string(),
  /** Unresolved conflict candidates naming this requirement. */
  conflictIds: z.array(z.string()).default([]),
});
export type ReconciledAgreement = z.infer<typeof ReconciledAgreement>;
