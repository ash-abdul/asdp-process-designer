/**
 * Reconciliation commands — `CANONICALISE_ENTITIES` and `RECONCILE_SOURCES` (V6).
 *
 * ADR-0034 N4: RBAC, audit and transactions live here, and this file imports no
 * framework package and no provider.
 *
 * The order is the design, and each arrow is a decision:
 *
 *   authorise      → the role may spend money and cause egress
 *   observe        → surface forms in V5's proposals, deterministically
 *   group          → EXACT match-form equality only (Q3)
 *   ASK (merge)    → per kind, through the broker; candidates stay candidates
 *   compare        → per RAF slot, because comparison is slot-scoped
 *   ASK (conflict) → per slot; the model explains, it never settles
 *   GATE           → in the module the evaluation also uses (J5, again)
 *   precedence     → deterministic, versioned, RECOMMENDS ONLY (Q5)
 *   persist        → candidates with decision = null (Q1)
 *   record         → interactions, rejections IN FULL (J9), counts, audit
 *
 * **Nothing here decides anything.** There is no code path to `decision`, to
 * `true_conflict`, or to applying a precedence recommendation — and migration 009
 * refuses the first two on insert, so the boundary survives a direct connection.
 */

import { computePrecedence, type PrecedenceParticipant } from '@asdp/domain';
import { resolveDisjointSlot, type RafSlotKey } from '@asdp/raf';
import type {
  AiInteraction,
  CanonicalEntity,
  CanonicalEntityAlias,
  Conflict,
  ConflictParticipant,
  ReconciledAgreement,
  ReconciliationRejection,
  Requirement,
  RequirementRelation,
} from '@asdp/schemas';
import type { Actor, CommandContext } from '../commands.ts';
import { assertRole, ValidationError } from '../commands.ts';
import type { Canonicaliser, Reconciler, UnitOfWork } from '../ports.ts';
import {
  canonicalMatchForm,
  groupByMatchForm,
  observeActors,
  type ObservedSurfaceForm,
} from '../ai/canonicalisation.ts';
import {
  determineSpecificity,
  gateCandidate,
  gateMerge,
  type ComparableRequirement,
} from '../ai/reconciliation-gate.ts';

export interface ReconciliationContext extends CommandContext {
  readonly uow: UnitOfWork;
  readonly canonicaliser: Canonicaliser;
  readonly reconciler: Reconciler;
}

export interface ReconcileInput {
  readonly projectId: string;
  readonly requirementSetId?: string;
}

export interface ReconciliationRejectionSummary {
  readonly task: 'CANONICALISE_ENTITIES' | 'RECONCILE_SOURCES';
  readonly reason: string;
  readonly detail: string;
  readonly proposedPayload: string;
}

export interface ReconcileResult {
  readonly requirementSetId: string;
  readonly canonical: {
    readonly deterministicGroups: number;
    readonly aiProposedGroups: number;
    readonly entities: readonly CanonicalEntity[];
  };
  readonly conflicts: readonly Conflict[];
  readonly relations: readonly RequirementRelation[];
  readonly counts: Readonly<Record<string, number>>;
  readonly rejected: readonly ReconciliationRejectionSummary[];
  readonly rejectionCounts: Readonly<Record<string, number>>;
  readonly interactionIds: readonly string[];
  readonly slotsCompared: readonly string[];
  readonly refusals: readonly string[];
  readonly degradations: readonly string[];
  readonly limitations: readonly string[];
  /** Stated on every result: nothing here is decided, and V6 cannot decide it. */
  readonly note: string;
}

const NOTE =
  'Every conflict recorded here is a CANDIDATE with decision = null. AI proposed the ' +
  'classification and the explanation; precedence was computed deterministically and is a ' +
  'RECOMMENDATION, never applied. A human decides every true conflict (ADR-0012), in V7.';

// ---------------------------------------------------------------------------
// RECONCILE
// ---------------------------------------------------------------------------

/**
 * Canonicalise, compare and record conflict candidates.
 *
 * **A refused pass is data, not an error.** The run completes and reports which
 * kinds and slots refused. There is deliberately no queue and no resolution
 * workflow: that is V7's workspace.
 */
export async function reconcileSources(
  ctx: ReconciliationContext,
  actor: Actor,
  input: ReconcileInput,
): Promise<ReconcileResult> {
  assertRole(actor, 'reconcileSources');

  const project = await ctx.repos.projects.get(input.projectId);
  if (project === undefined) throw new ValidationError(`unknown project ${input.projectId}`);

  const sets = await ctx.repos.requirements.listSets(input.projectId);
  const requirementSetId = input.requirementSetId ?? sets[0]?.id;
  if (requirementSetId === undefined) {
    throw new ValidationError(
      `project ${input.projectId} has no requirement set; reconciliation compares proposals, and ` +
        'V5 must run first',
    );
  }
  const set = await ctx.repos.requirements.getSet(requirementSetId);
  if (set === undefined || set.projectId !== input.projectId) {
    throw new ValidationError(
      `unknown requirement set ${requirementSetId} in project ${input.projectId}`,
    );
  }

  const requirements = await ctx.repos.requirements.listForSet(requirementSetId);
  if (requirements.length < 2) {
    throw new ValidationError(
      `requirement set ${requirementSetId} holds ${requirements.length} proposal(s); comparison ` +
        'needs at least two, and reporting "no conflicts" over one would be misleading',
    );
  }

  const links = await ctx.repos.requirements.evidenceForSet(requirementSetId);
  const evidence = await ctx.repos.evidence.listForProject(input.projectId);
  const evidenceById = new Map(evidence.map((e) => [e.id, e]));
  const sources = await ctx.repos.sources.list(input.projectId);
  const sourceById = new Map(sources.map((s) => [s.id, s]));

  const comparable = buildComparable(requirements, links, evidenceById, sourceById);
  const now = ctx.clock.nowIso();

  const interactions: AiInteraction[] = [];
  const rejected: ReconciliationRejectionSummary[] = [];
  const rejectionRecords: ReconciliationRejection[] = [];
  const refusals: string[] = [];
  const limitations: string[] = [];
  const degradations = new Set<string>();

  const entities: { entity: CanonicalEntity; aliases: CanonicalEntityAlias[] }[] = [];
  const conflicts: { conflict: Conflict; participants: ConflictParticipant[] }[] = [];
  const relations: RequirementRelation[] = [];

  const recordRejection = (
    task: 'CANONICALISE_ENTITIES' | 'RECONCILE_SOURCES',
    reason: string,
    detail: string,
    proposedPayload: string,
    interaction: AiInteraction | undefined,
    classification: ReconciliationRejection['classification'],
  ): void => {
    rejected.push({ task, reason, detail, proposedPayload });
    rejectionRecords.push({
      id: ctx.ids.next('rrj'),
      projectId: input.projectId,
      requirementSetId,
      task,
      reason: reason as ReconciliationRejection['reason'],
      detail,
      // J9: the payload, not a checksum. ADR-0032 names rejected proposals, and
      // with limitation 62 outstanding there is nowhere else to recover it from.
      proposedPayload,
      ...(interaction === undefined ? {} : { aiInteractionId: interaction.id }),
      classification,
      createdAt: now,
    });
  };

  // --- canonicalisation ---------------------------------------------------
  //
  // Deterministic FIRST, so the model is only ever asked the harder question:
  // exact match-form equality is settled before the call, and what remains is the
  // equivalence folding cannot see.
  const observed: ObservedSurfaceForm[] = [];
  for (const requirement of requirements) {
    observed.push(
      ...observeActors(
        requirement.id,
        requirement.text,
        requirement.language,
        requirement.classification,
      ),
    );
  }

  const deterministicGroups = groupByMatchForm(observed);
  let aiProposedGroups = 0;

  for (const group of deterministicGroups) {
    // A group of one is not a merge; it is a surface form nobody else used. Kept
    // as a canonical entity anyway, because the aliases are what later passes and
    // the evaluation compare against.
    const entityId = ctx.ids.next('cen');
    const members = group.members;
    entities.push({
      entity: {
        id: entityId,
        projectId: input.projectId,
        requirementSetId,
        kind: group.kind,
        labelEn: pickLabel(members, 'en'),
        labelAr: pickLabel(members, 'ar'),
        matchForm: group.matchForm,
        origin: 'deterministic',
        classification: members[0]?.classification as CanonicalEntity['classification'],
        mergedFromIds: [],
        requirementIds: [...new Set(members.map((m) => m.requirementId))],
        createdAt: now,
      },
      aliases: members.map((m) => ({
        id: ctx.ids.next('cal'),
        canonicalEntityId: entityId,
        surfaceForm: m.surfaceForm,
        matchForm: canonicalMatchForm(m.surfaceForm),
        language: m.language,
        origin: 'deterministic' as const,
        requirementId: m.requirementId,
      })),
    });
  }

  // The AI pass sees the surface forms that survived deterministic grouping — one
  // representative per group, because asking it to re-merge identical forms would
  // measure nothing.
  const shownByMatchForm = new Map<string, ObservedSurfaceForm>();
  for (const group of deterministicGroups) {
    const first = group.members[0];
    if (first !== undefined) shownByMatchForm.set(group.matchForm, first);
  }

  if (shownByMatchForm.size >= 2) {
    const surfaceForms = [...shownByMatchForm.values()].map((m) => m.surfaceForm);
    const classification = highestClassification(requirements);
    const outcome = await ctx.canonicaliser.canonicalise({
      projectId: input.projectId,
      kind: 'actor',
      surfaceForms,
      classification,
      languageHints: [...new Set(requirements.map((r) => r.language))],
      correlationId: ctx.correlationId,
    });

    if (outcome.interaction !== undefined) interactions.push(outcome.interaction);
    if (outcome.kind === 'refused') {
      for (const d of outcome.degradations) degradations.add(d);
      refusals.push(`CANONICALISE_ENTITIES(actor): ${outcome.reason}`);
    } else {
      for (const d of outcome.interaction.routing.degradations) degradations.add(d);
      limitations.push(...outcome.canonicalisation.limitations.map((l) => `canonicalise: ${l}`));

      for (const candidate of outcome.canonicalisation.merges) {
        const gated = gateMerge({ candidate, shown: shownByMatchForm });
        if (gated.kind === 'rejected') {
          recordRejection(
            'CANONICALISE_ENTITIES',
            gated.reason,
            gated.detail,
            gated.proposedPayload,
            outcome.interaction,
            classification,
          );
          continue;
        }

        // Q3: an AI-proposed merge is a SEPARATE, UNCONFIRMED entity that records
        // which deterministic entities it would absorb. The originals are NOT
        // removed — that is what makes the merge reversible, and what stops an AI
        // suggestion silently eliminating a distinct business concept.
        const mergedFromIds = gated.members.flatMap((m) => {
          const match = canonicalMatchForm(m.surfaceForm);
          const held = entities.find((e) => e.entity.matchForm === match && e.entity.kind === m.kind);
          return held === undefined ? [] : [held.entity.id];
        });

        const entityId = ctx.ids.next('cen');
        aiProposedGroups++;
        entities.push({
          entity: {
            id: entityId,
            projectId: input.projectId,
            requirementSetId,
            kind: gated.members[0]?.kind ?? 'actor',
            labelEn: gated.labelEn,
            labelAr: gated.labelAr,
            matchForm: canonicalMatchForm(gated.labelEn.length > 0 ? gated.labelEn : gated.labelAr),
            origin: 'ai_proposed',
            classification: gated.classification,
            mergedFromIds: [...new Set(mergedFromIds)],
            requirementIds: [...new Set(gated.members.map((m) => m.requirementId))],
            aiInteractionId: outcome.interaction.id,
            // confirmedBy / confirmedAt deliberately absent: V7 confirms.
            createdAt: now,
          },
          aliases: gated.members.map((m) => ({
            id: ctx.ids.next('cal'),
            canonicalEntityId: entityId,
            surfaceForm: m.surfaceForm,
            matchForm: canonicalMatchForm(m.surfaceForm),
            language: m.language,
            origin: 'ai_proposed' as const,
            requirementId: m.requirementId,
            aiInteractionId: outcome.interaction.id,
          })),
        });
      }
    }
  }

  // --- comparison, per RAF slot -------------------------------------------
  const bySlot = new Map<string, ComparableRequirement[]>();
  for (const requirement of comparable.values()) {
    const list = bySlot.get(requirement.rafSlot) ?? [];
    list.push(requirement);
    bySlot.set(requirement.rafSlot, list);
  }

  const slotsCompared: string[] = [];

  for (const [rafSlot, inSlot] of [...bySlot.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    // One proposition in a slot has nothing to disagree with. Skipping it is not
    // "no conflict found" — nothing was compared, which is what `silent` means.
    if (inSlot.length < 2) continue;
    slotsCompared.push(rafSlot);

    const shown = new Map(inSlot.map((r) => [r.requirementId, r]));
    const classification = highestClassificationOf(inSlot);

    const outcome = await ctx.reconciler.reconcile({
      projectId: input.projectId,
      rafSlot,
      requirements: inSlot.map((r) => ({ requirementId: r.requirementId, text: r.text })),
      classification,
      languageHints: [...new Set(requirements.map((r) => r.language))],
      correlationId: ctx.correlationId,
    });

    if (outcome.interaction !== undefined) interactions.push(outcome.interaction);
    if (outcome.kind === 'refused') {
      for (const d of outcome.degradations) degradations.add(d);
      refusals.push(`RECONCILE_SOURCES(${rafSlot}): ${outcome.reason}`);
      continue;
    }

    for (const d of outcome.interaction.routing.degradations) degradations.add(d);
    limitations.push(...outcome.reconciliation.limitations.map((l) => `${rafSlot}: ${l}`));

    for (const candidate of outcome.reconciliation.candidates) {
      const gated = gateCandidate({ candidate, shown });
      if (gated.kind === 'rejected') {
        recordRejection(
          'RECONCILE_SOURCES',
          gated.reason,
          gated.detail,
          gated.proposedPayload,
          outcome.interaction,
          classification,
        );
        continue;
      }

      // --- deterministic precedence (Q5) ---------------------------------
      //
      // Computed for every classification, not only contradictions: an
      // `equivalent` pair still has an ordering, and a reader deciding which
      // wording to keep wants to see it. It RECOMMENDS; nothing applies it.
      const specificity = determineSpecificity(gated.a, gated.b);
      const recommendation = computePrecedence({
        a: participantOf(gated.a),
        b: participantOf(gated.b),
        specificity,
      });

      const conflictId = ctx.ids.next('cfl');
      conflicts.push({
        conflict: {
          id: conflictId,
          projectId: input.projectId,
          requirementSetId,
          topic: gated.topic,
          rafSlot: gated.rafSlot,
          classification: gated.classification,
          explanation: gated.explanation,
          detectedBy: `${ctx.reconciler.id} (${outcome.interaction.modelId})`,
          aiInteractionId: outcome.interaction.id,
          ...(recommendation.recommendedRequirementId === undefined
            ? {}
            : {
                recommendedRequirementId: recommendation.recommendedRequirementId,
                proposedResolution:
                  `Precedence favours ${recommendation.recommendedRequirementId}. ` +
                  'This is a RECOMMENDATION for a human to consider, not a decision (ADR-0012).',
              }),
          precedenceRationale: {
            decidedByStep: recommendation.decidedByStep,
            steps: recommendation.steps.map((s) => ({
              step: s.step,
              outcome: s.outcome,
              detail: s.detail,
            })),
            rationale: recommendation.rationale,
            functionVersion: recommendation.functionVersion,
            undecidable: recommendation.undecidable,
          },
          dataClassification: gated.dataClassification,
          // Q1: decision, decidedBy and decidedAt are absent. There is no branch
          // anywhere in this file that sets them.
          createdAt: now,
        },
        participants: [
          { conflictId, role: 'requirement' as const, entityId: gated.a.requirementId },
          { conflictId, role: 'requirement' as const, entityId: gated.b.requirementId },
          ...gated.a.evidenceItemIds.map((id) => ({
            conflictId,
            role: 'evidence' as const,
            entityId: id,
          })),
          ...gated.b.evidenceItemIds.map((id) => ({
            conflictId,
            role: 'evidence' as const,
            entityId: id,
          })),
        ],
      });

      // A typed edge for the pair, so the relation is queryable without reading
      // every conflict. `equivalent` is not a conflict, so it is not recorded as
      // one — the taxonomy has to survive into the data model or it is decorative.
      if (gated.classification === 'potentially_contradictory') {
        relations.push({
          id: ctx.ids.next('rel'),
          projectId: input.projectId,
          fromId: gated.a.requirementId,
          toId: gated.b.requirementId,
          kind: 'conflicts',
          detectedBy: ctx.reconciler.id,
          aiInteractionId: outcome.interaction.id,
          createdAt: now,
        });
      }
    }
  }

  const counts: Record<string, number> = {};
  for (const { conflict } of conflicts) {
    counts[conflict.classification] = (counts[conflict.classification] ?? 0) + 1;
  }
  const rejectionCounts: Record<string, number> = {};
  for (const r of rejected) rejectionCounts[r.reason] = (rejectionCounts[r.reason] ?? 0) + 1;

  return ctx.uow.run(async (repos) => {
    for (const interaction of interactions) await repos.aiInteractions.insert(interaction);
    for (const entry of entities) {
      await repos.reconciliation.insertCanonicalEntity(entry.entity, entry.aliases);
    }
    for (const entry of conflicts) {
      await repos.reconciliation.insertConflict(entry.conflict, entry.participants);
    }
    for (const relation of relations) await repos.reconciliation.insertRelation(relation);
    for (const rejection of rejectionRecords) {
      await repos.reconciliation.insertRejection(rejection);
    }

    await repos.audit.append({
      id: ctx.ids.next('aud'),
      at: now,
      actor: actor.subject,
      rolesAtTime: [...actor.roles],
      tokenIssuer: actor.tokenIssuer,
      correlationId: ctx.correlationId,
      projectId: input.projectId,
      action: 'sources.reconciled',
      entityType: 'RequirementSet',
      entityId: requirementSetId,
      after: {
        requirementSetId,
        canonicalEntities: entities.length,
        deterministicGroups: deterministicGroups.length,
        aiProposedGroups,
        conflictCandidates: conflicts.length,
        conflictCounts: counts,
        relations: relations.length,
        rejectedCount: rejected.length,
        rejectionCounts,
        rejections: rejected,
        aiInteractionIds: interactions.map((i) => i.id),
        slotsCompared,
        refusals,
        degradations: [...degradations],
        limitations,
        // Stated on every event so a reader never has to infer it.
        everyConflictUndecided: true,
        precedenceApplied: false,
      },
    });

    return {
      requirementSetId,
      canonical: {
        deterministicGroups: deterministicGroups.length,
        aiProposedGroups,
        entities: entities.map((e) => e.entity),
      },
      conflicts: conflicts.map((c) => c.conflict),
      relations,
      counts,
      rejected,
      rejectionCounts,
      interactionIds: interactions.map((i) => i.id),
      slotsCompared,
      refusals,
      degradations: [...degradations],
      limitations,
      note: NOTE,
    };
  });
}

// ---------------------------------------------------------------------------
// The reconciliation-aware read model — Q6
// ---------------------------------------------------------------------------

export interface ReconciliationViewInput {
  readonly projectId: string;
  readonly requirementSetId?: string;
}

/**
 * The reconciliation view — **computed on read** (**Q6**).
 *
 * V5 rows are insert-only and their confidence is a stored function of stored
 * factors. Mutating `crossSourceAgreement` would make a recorded score
 * unreproducible, so nothing here writes: the stored value stays auditable and
 * the reconciled value is derived beside it.
 *
 * **Two rules this function exists to enforce:**
 *
 *   1. **Absence of a detected conflict is never agreement.** A proposition
 *      nothing contradicted stays `silent` — a detector that found nothing and a
 *      corpus with nothing to find are indistinguishable from outside.
 *   2. **Corroboration requires a HUMAN-CONFIRMED equivalence** (**U4**). It was
 *      unreachable in V6, and that was the correct answer *then*.
 *
 * ## Why V6 could not claim corroboration, and why V7 can
 *
 * Corroboration means two sources agree **about the same content**. The only
 * evidence of that is an `equivalent` classification, and in V6 equivalence was
 * **AI-proposed** — deterministic duplicates were already collapsed in V5.
 * **Q6** was explicit: where V7 human confirmation would be needed, the V6 state
 * stayed *provisional* rather than manufacturing corroboration.
 *
 * **U4 is the missing half, and confirmation is what discharges the qualifier.**
 * A person has now looked at the proposed merge and said the two surface forms
 * denote the same thing. Three conditions must all hold, and each closes a way
 * this could become agreement manufactured from nothing:
 *
 *   - the equivalence candidate is classified `equivalent` — the only evidence
 *     of agreement about content there is;
 *   - the propositions it names rest on **more than one source** — a document
 *     does not corroborate itself;
 *   - a **human has confirmed** the canonical entity tying them, and confirmation
 *     is only offered for `ai_proposed` entities, because exact match-form
 *     equality was never a judgement to confirm (migration 010).
 *
 * A contradiction still wins: a proposition named by an undecided contradictory
 * candidate is `contradicted` however many sources agree elsewhere.
 *
 * **Still computed on read.** Nothing here writes. A V5 requirement row's stored
 * `crossSourceAgreement` and its stored confidence are untouched, because
 * mutating them would make a recorded score unreproducible; the reconciled value
 * is derived beside the stored one and both are returned.
 *
 * **An earlier version of this function got that wrong**, and a test caught it: it
 * raised `corroborated` when a *deterministic canonical entity* tied two
 * propositions resting on different sources. That is shared **vocabulary**, not
 * agreement about content — two statements both naming "the reviewing officer",
 * one saying three days and the other ten, share an actor and contradict each
 * other. Treating a shared name as corroboration is "absence of detected conflict
 * becomes agreement" wearing a canonical entity as cover, which is the exact
 * failure Q6 forbids.
 */
export async function reconciliationView(
  ctx: CommandContext,
  actor: Actor,
  input: ReconciliationViewInput,
): Promise<{
  readonly requirementSetId?: string;
  readonly agreement: readonly ReconciledAgreement[];
  readonly conflicts: readonly Conflict[];
  readonly conflictsBySlot: Readonly<Record<string, number>>;
  readonly canonicalEntities: number;
  readonly unconfirmedMerges: number;
  readonly note: string;
}> {
  assertRole(actor, 'reconciliationView');

  const project = await ctx.repos.projects.get(input.projectId);
  if (project === undefined) throw new ValidationError(`unknown project ${input.projectId}`);

  const sets = await ctx.repos.requirements.listSets(input.projectId);
  const requirementSetId = input.requirementSetId ?? sets[0]?.id;
  if (requirementSetId === undefined) {
    return {
      agreement: [],
      conflicts: [],
      conflictsBySlot: {},
      canonicalEntities: 0,
      unconfirmedMerges: 0,
      note: `${NOTE} No requirement set exists for this project.`,
    };
  }

  const requirements = await ctx.repos.requirements.listForSet(requirementSetId);
  const conflicts = await ctx.repos.reconciliation.conflictsForSet(requirementSetId);
  const participants = await ctx.repos.reconciliation.participantsForSet(requirementSetId);
  const entities = await ctx.repos.reconciliation.canonicalEntitiesForSet(requirementSetId);
  const links = await ctx.repos.requirements.evidenceForSet(requirementSetId);
  const evidence = await ctx.repos.evidence.listForProject(input.projectId);
  const evidenceById = new Map(evidence.map((e) => [e.id, e]));

  const conflictsByRequirement = new Map<string, string[]>();
  for (const participant of participants) {
    if (participant.role !== 'requirement') continue;
    const list = conflictsByRequirement.get(participant.entityId) ?? [];
    list.push(participant.conflictId);
    conflictsByRequirement.set(participant.entityId, list);
  }
  const contradictoryConflictIds = new Set(
    conflicts.filter((c) => c.classification === 'potentially_contradictory').map((c) => c.id),
  );

  // Requirements an `equivalent` candidate names, across distinct sources. This is
  // the ONLY evidence of agreement V6 has — and because equivalence is AI-proposed,
  // it is PROVISIONAL, never corroboration (Q6).
  const sourcesByRequirement = new Map<string, Set<string>>();
  for (const link of links) {
    const item = evidenceById.get(link.evidenceItemId);
    if (item === undefined) continue;
    const held = sourcesByRequirement.get(link.requirementId) ?? new Set<string>();
    held.add(item.sourceId);
    sourcesByRequirement.set(link.requirementId, held);
  }

  // Requirements a HUMAN has confirmed an equivalence over — U4. Confirmation is
  // only offered for `ai_proposed` entities (migration 010), because exact
  // match-form equality was never a judgement to confirm.
  const confirmedEquivalenceRequirements = new Set<string>();
  for (const entity of entities) {
    if (entity.origin !== 'ai_proposed' || entity.confirmedBy === undefined) continue;
    for (const requirementId of entity.requirementIds) {
      confirmedEquivalenceRequirements.add(requirementId);
    }
  }

  const equivalentConflictIds = new Set(
    conflicts.filter((c) => c.classification === 'equivalent').map((c) => c.id),
  );
  const provisionallyAgreed = new Set<string>();
  const corroborated = new Set<string>();
  for (const conflict of conflicts) {
    if (!equivalentConflictIds.has(conflict.id)) continue;
    const named = participants
      .filter((p) => p.conflictId === conflict.id && p.role === 'requirement')
      .map((p) => p.entityId);
    const sources = new Set<string>();
    for (const requirementId of named) {
      for (const sourceId of sourcesByRequirement.get(requirementId) ?? []) sources.add(sourceId);
    }
    // Two propositions from the SAME source saying the same thing is repetition,
    // not corroboration — a document does not corroborate itself.
    if (sources.size <= 1) continue;

    // U4: a confirmed equivalence over these propositions discharges the
    // provisional qualifier and the agreement becomes claimable. Without one it
    // stays provisional, exactly as V6 left it.
    const confirmed = named.some((id) => confirmedEquivalenceRequirements.has(id));
    for (const requirementId of named) {
      if (confirmed) corroborated.add(requirementId);
      else provisionallyAgreed.add(requirementId);
    }
  }

  const unconfirmedMergeRequirements = new Set<string>();
  for (const entity of entities) {
    if (entity.origin !== 'ai_proposed' || entity.confirmedBy !== undefined) continue;
    for (const requirementId of entity.requirementIds) unconfirmedMergeRequirements.add(requirementId);
  }

  const agreement: ReconciledAgreement[] = requirements.map((requirement) => {
    const ids = conflictsByRequirement.get(requirement.id) ?? [];
    const contradicted = ids.some((id) => contradictoryConflictIds.has(id));
    const provisional = unconfirmedMergeRequirements.has(requirement.id);

    const agreedProvisionally = provisionallyAgreed.has(requirement.id);
    const agreed = corroborated.has(requirement.id);

    if (contradicted) {
      return {
        requirementId: requirement.id,
        storedAgreement: 'silent' as const,
        reconciledAgreement: 'contradicted' as const,
        provisionalCorroboration: agreedProvisionally || provisional,
        reason: 'an unresolved conflict candidate names this proposition',
        conflictIds: ids,
      };
    }

    // U4: the ONE way to `corroborated`, and it needs a human's confirmation.
    // Note what is still refused here — absence of a detected conflict, a shared
    // canonical entity, and an unconfirmed AI equivalence all leave it `silent`.
    if (agreed) {
      return {
        requirementId: requirement.id,
        // The STORED value is untouched. V5 rows are insert-only and their
        // confidence is a function of stored factors; the reconciled value is
        // derived beside it, never written over it (Q6, computed on read).
        storedAgreement: 'silent' as const,
        reconciledAgreement: 'corroborated' as const,
        // Discharged: it was provisional until a person confirmed the merge.
        provisionalCorroboration: false,
        reason:
          'a HUMAN-CONFIRMED equivalence ties this proposition to a proposition resting on a ' +
          'different source (U4). Confirmation discharges the provisional qualifier V6 could not ' +
          'discharge; the stored agreement is unchanged and this value is computed on read',
        conflictIds: ids,
      };
    }

    return {
      requirementId: requirement.id,
      storedAgreement: 'silent' as const,
      reconciledAgreement: 'silent' as const,
      provisionalCorroboration: agreedProvisionally || provisional,
      reason: agreedProvisionally
        ? 'an AI-proposed EQUIVALENCE ties this proposition to another source. It is unconfirmed, ' +
          'so it is recorded as provisional and does NOT raise corroboration; a human confirmation ' +
          'is required (U4) and nothing here manufactures agreement (Q6)'
        : provisional
          ? 'an AI-proposed entity merge touches this proposition but nothing established ' +
            'agreement about its content; unconfirmed, and not corroboration (Q6)'
          : 'nothing corroborated or contradicted this proposition. Absence of a detected conflict ' +
            'is NOT agreement',
      conflictIds: ids,
    };
  });

  const conflictsBySlot: Record<string, number> = {};
  for (const conflict of conflicts) {
    conflictsBySlot[conflict.rafSlot] = (conflictsBySlot[conflict.rafSlot] ?? 0) + 1;
  }

  return {
    requirementSetId,
    agreement,
    conflicts,
    conflictsBySlot,
    canonicalEntities: entities.length,
    unconfirmedMerges: entities.filter(
      (e) => e.origin === 'ai_proposed' && e.confirmedBy === undefined,
    ).length,
    note: NOTE,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildComparable(
  requirements: readonly Requirement[],
  links: readonly { requirementId: string; evidenceItemId: string }[],
  evidenceById: ReadonlyMap<string, { sourceId: string }>,
  sourceById: ReadonlyMap<string, { authorityRank: number; effectiveDate?: string }>,
): ReadonlyMap<string, ComparableRequirement> {
  const evidenceByRequirement = new Map<string, string[]>();
  for (const link of links) {
    const list = evidenceByRequirement.get(link.requirementId) ?? [];
    list.push(link.evidenceItemId);
    evidenceByRequirement.set(link.requirementId, list);
  }

  const out = new Map<string, ComparableRequirement>();
  for (const requirement of requirements) {
    const evidenceItemIds = evidenceByRequirement.get(requirement.id) ?? [];
    const first = evidenceItemIds[0];
    const sourceId = first === undefined ? '' : (evidenceById.get(first)?.sourceId ?? '');
    const source = sourceById.get(sourceId);
    out.set(requirement.id, {
      requirementId: requirement.id,
      // Slot legality is V5's; the disjointness resolution is re-applied here so
      // a comparison never straddles a pair by accident.
      rafSlot: resolveDisjointSlot([requirement.rafSlot as RafSlotKey]).slot,
      text: requirement.text,
      classification: requirement.classification,
      sourceId,
      sourceAuthorityRank: source?.authorityRank ?? 0,
      ...(source?.effectiveDate === undefined ? {} : { effectiveDate: source.effectiveDate }),
      epistemicLevel: requirement.epistemicLevel as ComparableRequirement['epistemicLevel'],
      evidenceItemIds,
    });
  }
  return out;
}

function participantOf(r: ComparableRequirement): PrecedenceParticipant {
  return {
    requirementId: r.requirementId,
    sourceId: r.sourceId,
    sourceAuthorityRank: r.sourceAuthorityRank,
    ...(r.effectiveDate === undefined ? {} : { effectiveDate: r.effectiveDate }),
    epistemicLevel: r.epistemicLevel,
  };
}

/** The first surface form in the requested language, or empty. Never a guessed translation. */
function pickLabel(members: readonly ObservedSurfaceForm[], language: string): string {
  return members.find((m) => m.language.startsWith(language))?.surfaceForm ?? '';
}

function highestClassification(
  requirements: readonly Requirement[],
): Requirement['classification'] {
  const order = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED', 'PROHIBITED'];
  return requirements.reduce<Requirement['classification']>(
    (max, r) => (order.indexOf(r.classification) > order.indexOf(max) ? r.classification : max),
    'PUBLIC',
  );
}

function highestClassificationOf(
  items: readonly ComparableRequirement[],
): ComparableRequirement['classification'] {
  const order = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED', 'PROHIBITED'];
  return items.reduce<ComparableRequirement['classification']>(
    (max, r) => (order.indexOf(r.classification) > order.indexOf(max) ? r.classification : max),
    'PUBLIC',
  );
}
