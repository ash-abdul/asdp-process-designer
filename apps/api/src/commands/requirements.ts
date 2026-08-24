/**
 * Requirement proposal commands — `POPULATE_FRAME` (V5).
 *
 * ADR-0034 N4: RBAC, audit and transactions live here, and this file imports no
 * framework package and no provider. The AI layer is reached through the
 * `FramePopulator` port, so this module cannot know which provider answered.
 *
 * The order is the design:
 *
 *   authorise  → the role may spend money and cause egress
 *   select     → ELIGIBLE evidence only, anchors re-resolved now
 *   batch      → deterministic, versioned batches of evidence (J7)
 *   ASK        → one call per pass, six passes, through the broker
 *   GATE       → four conditions, in the module the evaluation also uses (J5)
 *   derive     → level, derivation, confidence, flags — all by code (J8)
 *   persist    → only what passed, always as `draft` (J4)
 *   record     → interactions, rejections IN FULL (J9), counts, audit
 *
 * **The result is a set of PROPOSALS, never approved requirements**
 * ([ADR-0004](../../../../docs/adr/ADR-0004-ai-proposes-code-commits.md),
 * [ADR-0007](../../../../docs/adr/ADR-0007-epistemic-ladder.md)). There is no code
 * path to `approved`, no baseline, no signature — and migration 008 refuses every
 * status but `draft` on insert, so the boundary survives a direct connection.
 */

import { RAF_VERSION, computeFrameCoverage, type RafSlotKey, type SlotObservation } from '@asdp/raf';
import type {
  AiInteraction,
  EvidenceItem,
  ProposalRejectionReason,
  Requirement,
  RequirementEvidenceLink,
  RequirementFlag,
  SlotPolicyBlock,
  Source,
} from '@asdp/schemas';
import { isCitable, resolveAnchor } from '@asdp/provenance';
import { allocateD15_requirementId } from '@asdp/domain';
import type { Actor, CommandContext } from '../commands.ts';
import { assertRole, ValidationError } from '../commands.ts';
import type { FramePopulator, UnitOfWork } from '../ports.ts';
import { FRAME_PASSES, FRAME_PASS_VERSION, slotBriefFor } from '../ai/frame-passes.ts';
import {
  duplicateKey,
  gateProposal,
  type EligibleEvidence,
  type ProposalOutcome,
} from '../ai/proposal-gate.ts';
import { deriveFlags } from '../ai/requirement-flags.ts';

export interface RequirementsContext extends CommandContext {
  readonly uow: UnitOfWork;
  /**
   * The `POPULATE_FRAME` port.
   *
   * Injected, so the composition root decides whether a provider exists at all and
   * whether it is live or replaying. Nothing in this module can reach a network.
   */
  readonly populator: FramePopulator;
  /**
   * How many evidence items one pass may be shown at once.
   *
   * A property of the wired model's context window, so it is configuration rather
   * than a constant here.
   */
  readonly frameEvidencePerBatch: number;
}

export interface PopulateFrameInput {
  readonly projectId: string;
}

/** One rejected proposal, retained in full (**J9**). */
export interface ProposalRejectionSummary {
  readonly reason: ProposalRejectionReason;
  readonly detail: string;
  readonly proposedText: string;
  readonly proposedSlot?: string;
  readonly citedEvidenceIds: readonly string[];
  readonly framePass: string;
}

export interface PopulateFrameResult {
  readonly requirementSetId: string;
  readonly version: number;
  readonly rafVersion: string;
  /** Proposals actually written. Every one cites evidence and is `draft`. */
  readonly accepted: readonly Requirement[];
  /** Everything refused, with its reason and its text. Never silently dropped. */
  readonly rejected: readonly ProposalRejectionSummary[];
  readonly rejectionCounts: Readonly<Record<string, number>>;
  readonly flags: readonly RequirementFlag[];
  readonly interactionIds: readonly string[];
  readonly passes: readonly {
    readonly passId: string;
    readonly title: string;
    readonly proposed: number;
    readonly accepted: number;
    readonly rejected: number;
    readonly refused?: string;
  }[];
  readonly evidence: {
    readonly eligible: number;
    readonly ineligible: number;
    readonly batches: number;
    readonly strategyVersion: string;
  };
  readonly degradations: readonly string[];
  /** What the model said it could not tell. Recorded, never structural (**J1**). */
  readonly limitations: readonly string[];
}

// ---------------------------------------------------------------------------
// Evidence eligibility — deterministic, and re-checked every time
// ---------------------------------------------------------------------------

interface EligibilityReport {
  readonly eligible: readonly EligibleEvidence[];
  readonly ineligible: readonly { readonly evidenceItemId: string; readonly reason: string }[];
}

/**
 * Select the evidence a population pass may cite.
 *
 * **Anchors are re-resolved here and again in the gate**, and that is not
 * duplication: this pass decides what the model is *shown*, and the gate decides
 * what may be *written*. Something could in principle change between them, and the
 * gate is the one whose answer is binding.
 */
export async function selectEligibleEvidence(
  items: readonly EvidenceItem[],
  sourceById: ReadonlyMap<string, Source>,
  textBySource: ReadonlyMap<string, string>,
): Promise<EligibilityReport> {
  const eligible: EligibleEvidence[] = [];
  const ineligible: { evidenceItemId: string; reason: string }[] = [];

  for (const item of items) {
    const source = sourceById.get(item.sourceId);
    const storedText = textBySource.get(item.sourceId);
    if (source === undefined || storedText === undefined) {
      ineligible.push({
        evidenceItemId: item.id,
        reason: `source ${item.sourceId} has no stored text, so the anchor cannot be verified`,
      });
      continue;
    }
    if (!item.anchorVerified) {
      ineligible.push({ evidenceItemId: item.id, reason: 'anchorVerified is false (D1)' });
      continue;
    }
    const resolution = resolveAnchor(item.anchor, { storedText });
    if (!isCitable(resolution.status) || resolution.status !== 'resolved') {
      ineligible.push({
        evidenceItemId: item.id,
        reason: `the anchor no longer resolves (${resolution.status}); ADR-0008 refuses to build on it`,
      });
      continue;
    }
    eligible.push({
      item,
      storedText,
      sourceAuthorityRank: source.authorityRank,
      sourceKind: source.kind,
      sourcePrimaryLanguage: source.primaryLanguage,
    });
  }

  return { eligible, ineligible };
}

/**
 * Batch evidence deterministically.
 *
 * Ordered by source, then by the item's own id, so the same project produces the
 * same batches every time — which is what makes a recording replayable and a batch
 * id mean something. Versioned for the same reason `structural-1` is: change the
 * algorithm and a recording keyed on it misses rather than replaying wrongly.
 */
export function planEvidenceBatches(
  evidence: readonly EligibleEvidence[],
  perBatch: number,
): readonly (readonly EligibleEvidence[])[] {
  const size = Math.max(1, perBatch);
  const ordered = [...evidence].sort((a, b) =>
    a.item.sourceId === b.item.sourceId
      ? a.item.id.localeCompare(b.item.id)
      : a.item.sourceId.localeCompare(b.item.sourceId),
  );
  const batches: EligibleEvidence[][] = [];
  for (let i = 0; i < ordered.length; i += size) {
    batches.push(ordered.slice(i, i + size));
  }
  return batches;
}

export const EVIDENCE_BATCH_STRATEGY_VERSION = 'evidence-batch-1';

// ---------------------------------------------------------------------------
// POPULATE_FRAME
// ---------------------------------------------------------------------------

/**
 * Populate the Requirement Analysis Frame from verified evidence.
 *
 * **A refused pass is data, not an error.** The run completes, reports which
 * passes refused and why, and the counts feed the evaluation. There is
 * deliberately no queue and no remediation workflow: that is V7's workspace.
 */
export async function populateFrame(
  ctx: RequirementsContext,
  actor: Actor,
  input: PopulateFrameInput,
): Promise<PopulateFrameResult> {
  assertRole(actor, 'populateFrame');

  const project = await ctx.repos.projects.get(input.projectId);
  if (project === undefined) throw new ValidationError(`unknown project ${input.projectId}`);

  const allEvidence = await ctx.repos.evidence.listForProject(input.projectId);
  if (allEvidence.length === 0) {
    throw new ValidationError(
      `project ${input.projectId} has no evidence; requirements are built from evidence, never ` +
        'from sources directly (ADR-0007)',
    );
  }

  const sources = await ctx.repos.sources.list(input.projectId);
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const textBySource = new Map<string, string>();
  for (const source of sources) {
    const text = await ctx.repos.sources.getText(source.id);
    if (text !== undefined) textBySource.set(source.id, text);
  }

  const eligibility = await selectEligibleEvidence(allEvidence, sourceById, textBySource);
  if (eligibility.eligible.length === 0) {
    throw new ValidationError(
      `project ${input.projectId} has no ELIGIBLE evidence: ${eligibility.ineligible.length} ` +
        'item(s) exist but none has an anchor that resolves. A requirement may not rest on a ' +
        'citation that points nowhere (ADR-0008)',
    );
  }

  const batches = planEvidenceBatches(eligibility.eligible, ctx.frameEvidencePerBatch);

  // The set is allocated up front: every proposal in this run belongs to one set,
  // and a run that produced proposals across two sets would make the version
  // meaningless.
  const sets = await ctx.repos.requirements.listSets(input.projectId);
  const version = sets.reduce((max, s) => Math.max(max, s.version), 0) + 1;
  const requirementSetId = ctx.ids.next('rqs');
  const now = ctx.clock.nowIso();

  const accepted: {
    requirement: Requirement;
    links: RequirementEvidenceLink[];
    flags: RequirementFlag[];
  }[] = [];
  const rejected: ProposalRejectionSummary[] = [];
  const rejectionRecords: Parameters<
    typeof ctx.repos.requirements.insertRejection
  >[0][] = [];
  const interactions: AiInteraction[] = [];
  const limitations: string[] = [];
  const degradations = new Set<string>();
  const passSummaries: {
    passId: string;
    title: string;
    proposed: number;
    accepted: number;
    rejected: number;
    refused?: string;
  }[] = [];
  const policyBlocks: SlotPolicyBlock[] = [];
  const held = new Set<string>();

  // Requirement numbers come from the project-wide high-water mark and advance
  // across the whole run (invariant D15: never reused, even after rejection).
  let nextNumber = await ctx.repos.requirements.nextRequirementNumber(input.projectId);

  for (const [batchIndex, batch] of batches.entries()) {
    const byId = new Map(batch.map((e) => [e.item.id, e]));
    const batchClassification = batch
      .map((e) => e.item.classification)
      .reduce((max, c) => (c === 'RESTRICTED' || max === 'RESTRICTED' ? 'RESTRICTED' : c > max ? c : max));

    for (const pass of FRAME_PASSES) {
      const summary = { passId: pass.id, title: pass.title, proposed: 0, accepted: 0, rejected: 0 };

      const outcome = await ctx.populator.populate({
        projectId: input.projectId,
        passId: pass.id,
        passTitle: pass.title,
        slotBrief: slotBriefFor(pass),
        evidence: batch.map((e) => ({
          evidenceItemId: e.item.id,
          verbatimText: e.item.verbatimText,
        })),
        batch: {
          batchId: `b${batchIndex + 1}`,
          index: batchIndex,
          total: batches.length,
          strategyVersion: EVIDENCE_BATCH_STRATEGY_VERSION,
        },
        classification: batchClassification,
        languageHints: [...new Set(batch.map((e) => e.item.language))],
        correlationId: ctx.correlationId,
      });

      if (outcome.interaction !== undefined) interactions.push(outcome.interaction);

      if (outcome.kind === 'refused') {
        for (const d of outcome.degradations) degradations.add(d);
        passSummaries.push({ ...summary, refused: outcome.reason });
        // RECORD the block, per slot the pass would have populated.
        //
        // A refusal that lives only in the response is forgotten by the next
        // read, and the slot comes back `empty` — which turns "we were not
        // permitted to read this" into "the sources do not say", the one
        // distinction data-governance.md §3.1 exists to preserve. It is also why
        // `L4-REQ-007` could not fire: nothing could ever produce a
        // `blocked_by_policy` slot for it to find.
        if (outcome.refusalKind === 'policy') {
          for (const slot of pass.slots) {
            policyBlocks.push({
              id: ctx.ids.next('spb'),
              projectId: input.projectId,
              requirementSetId,
              rafSlot: slot,
              classification: batchClassification,
              provider: ctx.populator.id,
              reason: outcome.reason,
              blockedAt: ctx.clock.nowIso(),
            });
          }
        }
        continue;
      }

      for (const d of outcome.interaction.routing.degradations) degradations.add(d);
      limitations.push(...outcome.population.limitations.map((l) => `${pass.id}: ${l}`));

      for (const proposal of outcome.population.items) {
        summary.proposed++;

        const gated: ProposalOutcome = gateProposal({
          proposal,
          batch: byId,
          passSlots: pass.slots,
          passId: pass.id,
          confidenceInputs: {
            providerCapabilityTier: outcome.interaction.capabilityTier,
            degradations: outcome.interaction.routing.degradations,
          },
        });

        if (gated.kind === 'rejected') {
          summary.rejected++;
          rejected.push({
            reason: gated.reason,
            detail: gated.detail,
            proposedText: gated.proposedText,
            ...(gated.proposedSlot === undefined ? {} : { proposedSlot: gated.proposedSlot }),
            citedEvidenceIds: gated.citedEvidenceIds,
            framePass: pass.id,
          });
          rejectionRecords.push({
            id: ctx.ids.next('rej'),
            projectId: input.projectId,
            requirementSetId,
            reason: gated.reason,
            detail: gated.detail,
            // J9: the text, not a checksum. ADR-0032 names rejected proposals.
            proposedText: gated.proposedText,
            ...(gated.proposedSlot === undefined ? {} : { proposedSlot: gated.proposedSlot }),
            citedEvidenceIds: [...gated.citedEvidenceIds],
            framePass: pass.id,
            aiInteractionId: outcome.interaction.id,
            classification: gated.classification,
            createdAt: now,
          });
          continue;
        }

        // J2: deduplication, NOT conflict resolution. Identical text on an
        // identical evidence set is one proposition offered twice; identical text
        // on DIFFERENT evidence is two propositions from two places, and V5 keeps
        // both because deciding between them is reconciliation.
        const key = duplicateKey(
          gated.slot,
          gated.text,
          gated.evidence.map((e) => e.evidenceItemId),
        );
        if (held.has(key)) {
          summary.rejected++;
          const detail =
            'an identical proposition on an identical evidence set is already held; this is ' +
            'deduplication, not conflict resolution (J2)';
          rejected.push({
            reason: 'duplicate',
            detail,
            proposedText: gated.text,
            proposedSlot: gated.slot,
            citedEvidenceIds: gated.evidence.map((e) => e.evidenceItemId),
            framePass: pass.id,
          });
          rejectionRecords.push({
            id: ctx.ids.next('rej'),
            projectId: input.projectId,
            requirementSetId,
            reason: 'duplicate',
            detail,
            proposedText: gated.text,
            proposedSlot: gated.slot,
            citedEvidenceIds: gated.evidence.map((e) => e.evidenceItemId),
            framePass: pass.id,
            aiInteractionId: outcome.interaction.id,
            classification: gated.classification,
            createdAt: now,
          });
          continue;
        }
        held.add(key);

        // K3: the ONE allocator. This was an inline template literal until H4,
        // and the second copy of it is how the identifier drifted away from the
        // key that was supposed to hold it.
        const requirementId = allocateD15_requirementId(nextNumber - 1);
        nextNumber++;

        const citedEvidence = gated.evidence
          .map((e) => byId.get(e.evidenceItemId))
          .filter((e): e is EligibleEvidence => e !== undefined);

        const requirement: Requirement = {
          id: requirementId,
          requirementSetId,
          projectId: input.projectId,
          text: gated.text,
          // V5 never edits, so these are equal today. Retaining it now means the
          // audit answer exists the moment a workspace can change `text`.
          originalAiText: gated.text,
          category: proposal.category,
          rafSlot: gated.slot,
          epistemicLevel: gated.epistemicLevel,
          derivation: gated.derivation,
          computedConfidence: gated.confidence.score,
          confidenceBand: gated.confidence.band,
          confidenceFunctionVersion: gated.confidence.version,
          humanConfirmationRequired: gated.humanConfirmationRequired,
          // J4. There is no other value anywhere in this file, and migration 008
          // refuses one anyway.
          status: 'draft',
          // V7 (U2-a): every proposal starts at version 1. A human edit creates
          // version 2 and supersedes this row, which stays in the history.
          version: 1,
          generatedBy: 'ai',
          aiInteractionId: outcome.interaction.id,
          promptVersion: ctx.populator.id,
          providerId: outcome.interaction.providerId,
          modelId: outcome.interaction.modelId,
          capabilityTier: outcome.interaction.capabilityTier,
          degradations: [...outcome.interaction.routing.degradations],
          framePass: pass.id,
          classification: gated.classification,
          language: gated.language,
          createdBy: actor.subject,
          createdAt: now,
        };

        const links: RequirementEvidenceLink[] = gated.evidence.map((e) => ({
          projectId: input.projectId,
          requirementId,
          evidenceItemId: e.evidenceItemId,
          contribution: e.contribution,
        }));

        const flags: RequirementFlag[] = deriveFlags(gated, citedEvidence).map((f) => ({
          id: ctx.ids.next('rfl'),
          requirementId,
          projectId: input.projectId,
          kind: f.kind,
          severity: f.severity,
          detail: f.detail,
          // Rule-raised, never model-raised: a model grading its own output would
          // grade it well (J6, J8).
          raisedBy: 'rule' as const,
          createdAt: now,
        }));

        accepted.push({ requirement, links, flags });
        summary.accepted++;
      }

      passSummaries.push(summary);
    }
  }

  const rejectionCounts: Record<string, number> = {};
  for (const r of rejected) rejectionCounts[r.reason] = (rejectionCounts[r.reason] ?? 0) + 1;

  return ctx.uow.run(async (repos) => {
    for (const interaction of interactions) await repos.aiInteractions.insert(interaction);

    await repos.requirements.createSet({
      id: requirementSetId,
      projectId: input.projectId,
      version,
      // J4: a set is created `draft`. `baselined` is a V7 act.
      status: 'draft',
      rafVersion: RAF_VERSION,
      createdBy: actor.subject,
      createdAt: now,
    });

    for (const entry of accepted) {
      await repos.requirements.insertProposal(entry.requirement, entry.links, entry.flags);
    }
    for (const rejection of rejectionRecords) {
      await repos.requirements.insertRejection(rejection);
    }
    // Recorded in the same transaction as the proposals, so a refused pass and an
    // accepted one never disagree about what this run saw.
    for (const block of policyBlocks) {
      await repos.requirements.recordSlotPolicyBlock(block);
    }

    await repos.audit.append({
      id: ctx.ids.next('aud'),
      at: now,
      actor: actor.subject,
      rolesAtTime: [...actor.roles],
      tokenIssuer: actor.tokenIssuer,
      correlationId: ctx.correlationId,
      projectId: input.projectId,
      action: 'requirements.proposed',
      entityType: 'RequirementSet',
      entityId: requirementSetId,
      after: {
        requirementSetId,
        version,
        rafVersion: RAF_VERSION,
        acceptedCount: accepted.length,
        acceptedIds: accepted.map((a) => a.requirement.id),
        rejectedCount: rejected.length,
        rejectionCounts,
        // J9: the reason AND the text, because ADR-0032 names rejected proposals
        // explicitly and no payload store exists to recover them from (H3).
        rejections: rejected,
        flagCount: accepted.reduce((n, a) => n + a.flags.length, 0),
        aiInteractionIds: interactions.map((i) => i.id),
        framePassVersion: FRAME_PASS_VERSION,
        evidenceBatchStrategy: EVIDENCE_BATCH_STRATEGY_VERSION,
        eligibleEvidence: eligibility.eligible.length,
        ineligibleEvidence: eligibility.ineligible,
        degradations: [...degradations],
        limitations,
        // Stated on every event so a reader never has to infer it: nothing here
        // is approved, and nothing in V5 can approve it.
        statusOfEverythingWritten: 'draft',
      },
    });

    return {
      requirementSetId,
      version,
      rafVersion: RAF_VERSION,
      accepted: accepted.map((a) => a.requirement),
      rejected,
      rejectionCounts,
      flags: accepted.flatMap((a) => a.flags),
      interactionIds: interactions.map((i) => i.id),
      passes: passSummaries,
      evidence: {
        eligible: eligibility.eligible.length,
        ineligible: eligibility.ineligible.length,
        batches: batches.length,
        strategyVersion: EVIDENCE_BATCH_STRATEGY_VERSION,
      },
      degradations: [...degradations],
      limitations,
    };
  });
}

// ---------------------------------------------------------------------------
// Reading proposals and coverage
// ---------------------------------------------------------------------------

export interface ListRequirementsInput {
  readonly projectId: string;
  readonly requirementSetId?: string;
}

export async function listRequirements(
  ctx: CommandContext,
  actor: Actor,
  input: ListRequirementsInput,
): Promise<{
  readonly requirementSetId?: string;
  readonly total: number;
  readonly requirements: readonly (Requirement & {
    readonly evidence: readonly RequirementEvidenceLink[];
  })[];
}> {
  assertRole(actor, 'listRequirements');

  const project = await ctx.repos.projects.get(input.projectId);
  if (project === undefined) throw new ValidationError(`unknown project ${input.projectId}`);

  const setId = input.requirementSetId ?? (await latestSetId(ctx, input.projectId));
  if (setId === undefined) return { total: 0, requirements: [] };

  const set = await ctx.repos.requirements.getSet(setId);
  if (set === undefined || set.projectId !== input.projectId) {
    throw new ValidationError(`unknown requirement set ${setId} in project ${input.projectId}`);
  }

  const requirements = await ctx.repos.requirements.listForSet(setId);
  const links = await ctx.repos.requirements.evidenceForSet(setId);
  const byRequirement = new Map<string, RequirementEvidenceLink[]>();
  for (const link of links) {
    const list = byRequirement.get(link.requirementId) ?? [];
    list.push(link);
    byRequirement.set(link.requirementId, list);
  }

  return {
    requirementSetId: setId,
    total: requirements.length,
    requirements: requirements.map((r) => ({
      ...r,
      evidence: byRequirement.get(r.id) ?? [],
    })),
  };
}

async function latestSetId(ctx: CommandContext, projectId: string): Promise<string | undefined> {
  const sets = await ctx.repos.requirements.listSets(projectId);
  return sets[0]?.id;
}

export interface FrameCoverageInput {
  readonly projectId: string;
  readonly requirementSetId?: string;
}

/**
 * Coverage over a requirement set — **J3-a**, and **computed on read** (**J3-b**).
 *
 * No `raf_coverage` table exists. Proposals are insert-only, so a stored snapshot
 * would go stale the moment the next one landed, and a stale coverage row is worse
 * than none: it reports a gap that has been filled, or hides one that has opened.
 * Freezing a snapshot is what a **baseline** does, and V5 takes no baseline.
 *
 * Every number here comes from `@asdp/raf` (ADR-0010), so what is "missing" is
 * arithmetic over a known schema rather than an AI opinion. **This is assessment
 * of the populated frame, not reconciliation**: `FrameCoverage` has no `conflicts`
 * field, and V5 compares nothing across sources (**J2**, **J3-a**).
 */
export async function frameCoverage(
  ctx: CommandContext,
  actor: Actor,
  input: FrameCoverageInput,
): Promise<{
  readonly requirementSetId?: string;
  readonly rafVersion: string;
  readonly coverage: ReturnType<typeof computeFrameCoverage>;
  readonly ambiguities: readonly RequirementFlag[];
  readonly note: string;
}> {
  assertRole(actor, 'frameCoverage');

  const project = await ctx.repos.projects.get(input.projectId);
  if (project === undefined) throw new ValidationError(`unknown project ${input.projectId}`);

  const note =
    'Coverage is computed on read from the proposals in this set (J3-b). Every proposal is a ' +
    'DRAFT AI proposition, so an `adequate` slot means "the evidence produced propositions here", ' +
    'not "this is settled". Conflicts are not detected in V5 (J2), so nothing here reports ' +
    'agreement between sources.';

  const setId = input.requirementSetId ?? (await latestSetId(ctx, input.projectId));
  if (setId === undefined) {
    // No set: every slot is empty, and saying so is more useful than an error.
    // An unpopulated frame is a legitimate state, and the required-slot blockers
    // are exactly what a reader wants to see.
    return {
      rafVersion: RAF_VERSION,
      coverage: computeFrameCoverage([], RAF_VERSION),
      ambiguities: [],
      note: `${note} No population pass has run for this project.`,
    };
  }

  const set = await ctx.repos.requirements.getSet(setId);
  if (set === undefined || set.projectId !== input.projectId) {
    throw new ValidationError(`unknown requirement set ${setId} in project ${input.projectId}`);
  }

  const requirements = await ctx.repos.requirements.listForSet(setId);
  const links = await ctx.repos.requirements.evidenceForSet(setId);
  const flags = await ctx.repos.requirements.flagsForSet(setId);
  const evidence = await ctx.repos.evidence.listForProject(input.projectId);
  const evidenceById = new Map(evidence.map((e) => [e.id, e]));
  const sources = await ctx.repos.sources.list(input.projectId);
  const sourceById = new Map(sources.map((s) => [s.id, s]));

  const policyBlocks = await ctx.repos.requirements.slotPolicyBlocksForSet(setId);
  const observations = buildObservations(
    requirements,
    links,
    evidenceById,
    sourceById,
    policyBlocks,
  );

  return {
    requirementSetId: setId,
    rafVersion: set.rafVersion,
    coverage: computeFrameCoverage(observations, set.rafVersion),
    // RAF §3: the `ambiguities` derived slot is an aggregation over flags of
    // exactly these kinds — computed, never asserted by a model.
    ambiguities: flags.filter((f) =>
      ['ambiguous', 'vague_quantifier', 'actor_unknown', 'untestable', 'unverifiable'].includes(
        f.kind,
      ),
    ),
    note,
  };
}

/**
 * Turn proposals into the observations `@asdp/raf` expects.
 *
 * Deliberately mechanical. The one judgement — what counts as `weak` — belongs to
 * `slotStatus` in the pure package, where it is testable and versioned, and not
 * here.
 */
export function buildObservations(
  requirements: readonly Requirement[],
  links: readonly RequirementEvidenceLink[],
  evidenceById: ReadonlyMap<string, EvidenceItem>,
  sourceById: ReadonlyMap<string, Source>,
  /**
   * Slots data-governance policy denied analysis of.
   *
   * `blocked_by_policy` takes precedence over `empty` in `slotStatus`, so a
   * blocked slot must produce an observation **even with no requirements in it**
   * — otherwise it falls through to the default empty observation and the
   * distinction is lost exactly where it matters (data-governance.md §3.1).
   */
  policyBlocks: readonly SlotPolicyBlock[] = [],
): readonly SlotObservation[] {
  const blockBySlot = new Map(policyBlocks.map((b) => [b.rafSlot, b]));
  const linksByRequirement = new Map<string, RequirementEvidenceLink[]>();
  for (const link of links) {
    const list = linksByRequirement.get(link.requirementId) ?? [];
    list.push(link);
    linksByRequirement.set(link.requirementId, list);
  }

  const bySlot = new Map<string, Requirement[]>();
  for (const requirement of requirements) {
    const list = bySlot.get(requirement.rafSlot) ?? [];
    list.push(requirement);
    bySlot.set(requirement.rafSlot, list);
  }
  // A blocked slot is observed even when nothing populated it — that is the case
  // the record exists for.
  for (const slot of blockBySlot.keys()) if (!bySlot.has(slot)) bySlot.set(slot, []);

  const observations: SlotObservation[] = [];

  for (const [slot, items] of bySlot) {
    const evidenceIds = new Set<string>();
    const sourceCounts = new Map<string, number>();
    for (const requirement of items) {
      for (const link of linksByRequirement.get(requirement.id) ?? []) {
        evidenceIds.add(link.evidenceItemId);
        const evidence = evidenceById.get(link.evidenceItemId);
        if (evidence !== undefined) {
          sourceCounts.set(evidence.sourceId, (sourceCounts.get(evidence.sourceId) ?? 0) + 1);
        }
      }
    }

    const sourceInventory = [...sourceCounts.entries()].flatMap(([sourceId, itemCount]) => {
      const source = sourceById.get(sourceId);
      return source === undefined
        ? []
        : [
            {
              sourceId,
              sourceKind: source.kind,
              primaryLanguage: source.primaryLanguage,
              authorityRank: source.authorityRank,
              itemCount,
            },
          ];
    });

    // Weakest link over the slot's items: a slot is no better supported than its
    // least confident proposition.
    const bands = items.map((i) => i.confidenceBand);
    const confidenceBand = bands.includes('LOW')
      ? ('LOW' as const)
      : bands.includes('MEDIUM')
        ? ('MEDIUM' as const)
        : bands.includes('HIGH')
          ? ('HIGH' as const)
          : null;

    observations.push({
      slot: slot as RafSlotKey,
      itemCount: items.length,
      evidenceCount: evidenceIds.size,
      distinctSourceCount: sourceCounts.size,
      sourceInventory,
      confidenceBand,
      // V5 writes L2 only: L3 is refused (J1) and L4 is a human act (ADR-0007).
      // L3 became producible in V7 (**U8-a**, human-originated only), and L4 is
      // the consequence of approval rather than a stored level — so it is counted
      // from `status`, which is where it actually lives (migration 010).
      epistemicMix: {
        l1: items.filter((i) => i.epistemicLevel === 'L1').length,
        l2: items.filter((i) => i.epistemicLevel === 'L2').length,
        l3: items.filter((i) => i.epistemicLevel === 'L3').length,
        l4: items.filter((i) => i.status === 'approved').length,
      },
      ...(blockBySlot.has(slot)
        ? {
            blockedByPolicy: {
              classification: blockBySlot.get(slot)?.classification ?? 'UNKNOWN',
              provider: blockBySlot.get(slot)?.provider ?? 'unknown',
            },
          }
        : {}),
    });
  }

  return observations;
}
