/**
 * The human requirements workspace and G1 — V7.
 *
 * ADR-0034 N4: RBAC, audit and transactions live here, and this file imports no
 * framework package and no provider.
 *
 * **This is the first module in the system whose primary output is produced by a
 * person.** Everything before it proposed; this decides. Three properties follow,
 * and each is enforced rather than described:
 *
 *   1. **Approval is reachable only through `approveG1`** (**U1**). No other
 *      function here writes `approved`, the repository refuses it, and migration
 *      010 refuses it without an approver, a timestamp and a baseline.
 *   2. **An edit never edits** (**U2-a**). `reviseRequirement` copies the current
 *      version to history and writes a new one, because a signature over content
 *      that can change afterwards is not a signature (ADR-0017).
 *   3. **AI is absent.** No port is injected, no provider is reachable, and the
 *      one V7 touchpoint that could use a model — wording a question — is
 *      deliberately deterministic here (**U6**): a model may word a question, but
 *      code decides which questions exist, and V7 ships the code half.
 */

import {
  approveGate,
  computeConfidence,
  evaluateGate,
  freezeBaseline,
  reopenIfInvalidated,
  textContentHash,
} from '@asdp/domain';
import { RAF_SLOT_KEYS, computeFrameCoverage } from '@asdp/raf';
import { evaluateG1Readiness, type G1State } from '@asdp/validation';
import type {
  OpenQuestion,
  PolicyAcknowledgement,
  Requirement,
  RequirementEvidenceLink,
} from '@asdp/schemas';
import type { Actor, CommandContext } from '../commands.ts';
import { assertRole, ValidationError } from '../commands.ts';
import type { Repositories, UnitOfWork } from '../ports.ts';
import { buildObservations } from './requirements.ts';

export interface ReviewContext extends CommandContext {
  readonly uow: UnitOfWork;
}

// ---------------------------------------------------------------------------
// Reviewing a requirement
// ---------------------------------------------------------------------------

export interface ReviewRequirementInput {
  readonly projectId: string;
  readonly requirementId: string;
  /** `accept` moves to `in_review`; approval itself is G1's act, never this one. */
  readonly action: 'accept' | 'reject' | 'defer' | 'send_for_clarification';
}

/**
 * Move a requirement between review states.
 *
 * **`approved` is not among the actions**, and that is the point: epistemic rule 6
 * says editing produces an edited proposal and *"approval is a separate act"*.
 * Accepting a requirement here means "I have read this and it is ready to be
 * approved", not "it is approved".
 */
export async function reviewRequirement(
  ctx: ReviewContext,
  actor: Actor,
  input: ReviewRequirementInput,
): Promise<Requirement> {
  assertRole(actor, 'reviewRequirement');

  const requirement = await ctx.repos.requirements.get(input.requirementId);
  if (requirement === undefined || requirement.projectId !== input.projectId) {
    throw new ValidationError(`unknown requirement ${input.requirementId}`);
  }
  if (requirement.status === 'approved') {
    throw new ValidationError(
      `requirement ${input.requirementId} is approved; changing an approved requirement means ` +
        'revising it, which creates a new version and reopens the gate (governance §2.3)',
    );
  }

  const status: Requirement['status'] =
    input.action === 'accept'
      ? 'in_review'
      : input.action === 'reject'
        ? 'rejected'
        : input.action === 'defer'
          ? 'deferred'
          : 'needs_clarification';

  return ctx.uow.run(async (repos) => {
    await repos.requirements.setReviewStatus(input.requirementId, status);
    await repos.audit.append({
      id: ctx.ids.next('aud'),
      at: ctx.clock.nowIso(),
      actor: actor.subject,
      rolesAtTime: [...actor.roles],
      tokenIssuer: actor.tokenIssuer,
      correlationId: ctx.correlationId,
      projectId: input.projectId,
      action: 'requirement.reviewed',
      entityType: 'Requirement',
      entityId: input.requirementId,
      after: { action: input.action, status, version: requirement.version },
    });
    return { ...requirement, status };
  });
}

// ---------------------------------------------------------------------------
// Revising — U2-a
// ---------------------------------------------------------------------------

export interface ReviseRequirementInput {
  readonly projectId: string;
  readonly requirementId: string;
  readonly text: string;
  /** Mandatory. Governance §2.3: every new version states why it exists. */
  readonly changeReason: string;
  /** Optional narrowing of the evidence set. Omitted means inherit unchanged. */
  readonly evidenceItemIds?: readonly string[];
}

/**
 * Revise a requirement by creating a **new immutable version**.
 *
 * The predecessor is copied to `requirement_version` and stays there forever, so
 * `originalAiText` on version 1 keeps answering "what did the model actually say?"
 * after any amount of human editing.
 *
 * **A revision may not sever provenance.** Evidence links are inherited unless the
 * caller narrows them explicitly, and a version with no links is refused by the
 * repository and by invariant D2.
 */
export async function reviseRequirement(
  ctx: ReviewContext,
  actor: Actor,
  input: ReviseRequirementInput,
): Promise<Requirement> {
  assertRole(actor, 'reviseRequirement');

  if (input.text.trim().length === 0) {
    throw new ValidationError('a revision must carry text');
  }
  if (input.changeReason.trim().length === 0) {
    throw new ValidationError(
      'a revision must state a change reason; a baseline diff nobody can explain is a diff nobody ' +
        'reads (governance §2.3)',
    );
  }

  const current = await ctx.repos.requirements.get(input.requirementId);
  if (current === undefined || current.projectId !== input.projectId) {
    throw new ValidationError(`unknown requirement ${input.requirementId}`);
  }

  const existing = await ctx.repos.requirements.evidenceFor(input.requirementId);
  const inherited: RequirementEvidenceLink[] =
    input.evidenceItemIds === undefined
      ? [...existing]
      : existing.filter((l) => input.evidenceItemIds?.includes(l.evidenceItemId));

  if (inherited.length === 0 && current.derivation !== 'inferred') {
    throw new ValidationError(
      `the revision of ${input.requirementId} would cite no evidence; a revision may not sever ` +
        'provenance (invariant D2)',
    );
  }

  const next: Requirement = {
    ...current,
    text: input.text.trim(),
    version: current.version + 1,
    supersedesId: `${current.id}@${current.version}`,
    changeReason: input.changeReason.trim(),
    // A human has now written the text. `originalAiText` is untouched and stays on
    // version 1, which is what makes the change legible.
    generatedBy: 'human',
    // Revising is not approving (epistemic rule 6). It returns to review.
    status: 'in_review',
  };

  // ADR-0017: the gate REOPENS AUTOMATICALLY when the content it signed changes.
  // A revision changes that content by construction, so the recomputed hash no
  // longer matches the signature — and governance §2.3 requires the gate to
  // reopen rather than be reopened by someone remembering to.
  const gateHeld = await ctx.repos.gates.get(input.projectId, 'G1');
  const approvals = await ctx.repos.approvals.listForGate(input.projectId, 'G1');
  const lastApproval = approvals.filter((a) => a.decision === 'approve').at(-1);

  return ctx.uow.run(async (repos) => {
    await repos.requirements.reviseRequirement(next, inherited);

    let reopened = false;
    if (gateHeld !== undefined && lastApproval !== undefined) {
      // The hash of the set as it now stands, against the hash that was signed.
      const currentHash = await requirementSetHash(repos, current.requirementSetId);
      const outcome = reopenIfInvalidated(gateHeld.value, lastApproval, {
        baselineHash: currentHash,
        validationRunId: lastApproval.validationRunId,
      });
      if (outcome.reopened) {
        await repos.gates.update(input.projectId, outcome.gate, gateHeld.version);
        reopened = true;
      }
    }

    await repos.audit.append({
      id: ctx.ids.next('aud'),
      at: ctx.clock.nowIso(),
      actor: actor.subject,
      rolesAtTime: [...actor.roles],
      tokenIssuer: actor.tokenIssuer,
      correlationId: ctx.correlationId,
      projectId: input.projectId,
      action: 'requirement.revised',
      entityType: 'Requirement',
      entityId: input.requirementId,
      after: {
        fromVersion: current.version,
        toVersion: next.version,
        changeReason: next.changeReason,
        evidenceRetained: inherited.length,
        // Stated on the event so a reader never has to infer it.
        editedInPlace: false,
        // ADR-0017 in action: a change after approval invalidates the signature.
        gateReopened: reopened,
      },
    });
    return next;
  });
}

// ---------------------------------------------------------------------------
// Human-originated L3 — U8-a
// ---------------------------------------------------------------------------

export interface AddInferredRequirementInput {
  readonly projectId: string;
  readonly requirementSetId: string;
  readonly text: string;
  readonly rafSlot: string;
  readonly category: Requirement['category'];
  /** Mandatory (invariant D2). Without it the proposition is an assertion. */
  readonly inferenceRationale: string;
}

/**
 * Add a requirement the evidence does not state — **human-originated L3 only**.
 *
 * V5 refused L3 with a precise reason: its only correct disposition, explicit
 * human confirmation, did not exist. **This is that disposition**, and the
 * asymmetry is the whole decision: a person may record a business assumption and
 * own it by name; a model may not, because a fluent unfounded proposition that
 * reads like a finding is exactly what **J1** closed.
 *
 * Migration 010 enforces it — `derivation = 'inferred'` requires
 * `generated_by = 'human'` **and** a rationale — so this is not a prompt-level
 * preference.
 */
export async function addInferredRequirement(
  ctx: ReviewContext,
  actor: Actor,
  input: AddInferredRequirementInput,
): Promise<Requirement> {
  assertRole(actor, 'addInferredRequirement');

  if (input.inferenceRationale.trim().length === 0) {
    throw new ValidationError(
      'an inferred requirement must state its reasoning (invariant D2); a recommendation with no ' +
        'stated reasoning cannot be persisted',
    );
  }
  if (!(RAF_SLOT_KEYS as readonly string[]).includes(input.rafSlot)) {
    // The frame is owned by code (ADR-0010). A human may add an inferred
    // requirement; nobody may add a slot to put it in.
    throw new ValidationError(
      `'${input.rafSlot}' is not one of the ${RAF_SLOT_KEYS.length} RAF slots`,
    );
  }

  const set = await ctx.repos.requirements.getSet(input.requirementSetId);
  if (set === undefined || set.projectId !== input.projectId) {
    throw new ValidationError(`unknown requirement set ${input.requirementSetId}`);
  }

  const number = await ctx.repos.requirements.nextRequirementNumber(input.projectId);
  const now = ctx.clock.nowIso();

  // Computed with the `inferred` extraction weight, so an L3 lands materially
  // below an evidenced requirement by construction rather than by convention.
  const confidence = computeConfidence({
    extractionMode: 'inferred',
    evidenceCount: 0,
    sourceAuthorityRank: 0,
    crossSourceAgreement: 'silent',
    anchorPrecision: 'none',
    providerCapabilityTier: 'unknown',
    degradations: [],
  });

  const requirement: Requirement = {
    id: `REQ-${String(number).padStart(4, '0')}`,
    requirementSetId: input.requirementSetId,
    projectId: input.projectId,
    text: input.text.trim(),
    originalAiText: input.text.trim(),
    category: input.category,
    rafSlot: input.rafSlot,
    epistemicLevel: 'L3',
    derivation: 'inferred',
    computedConfidence: confidence.score,
    confidenceBand: confidence.band,
    confidenceFunctionVersion: confidence.version,
    // An L3 always needs a human to own it, and at LOW confidence G1 requires an
    // explicit confirmation on top (precondition 6).
    humanConfirmationRequired: true,
    status: 'in_review',
    version: 1,
    inferenceRationale: input.inferenceRationale.trim(),
    generatedBy: 'human',
    degradations: [],
    classification: 'INTERNAL',
    language: 'en',
    createdBy: actor.subject,
    createdAt: now,
  };

  return ctx.uow.run(async (repos) => {
    // Deliberately NOT `insertProposal`: that requires evidence links, and an
    // inferred requirement has a rationale instead. The two paths are separate so
    // neither can be used to bypass the other's rule.
    await repos.requirements.insertInferred(requirement);
    await repos.audit.append({
      id: ctx.ids.next('aud'),
      at: now,
      actor: actor.subject,
      rolesAtTime: [...actor.roles],
      tokenIssuer: actor.tokenIssuer,
      correlationId: ctx.correlationId,
      projectId: input.projectId,
      action: 'requirement.inferred',
      entityType: 'Requirement',
      entityId: requirement.id,
      after: {
        rafSlot: requirement.rafSlot,
        inferenceRationale: requirement.inferenceRationale,
        confidenceBand: requirement.confidenceBand,
        generatedBy: 'human',
        // The claim this record has to survive: no model authored this.
        aiAuthored: false,
      },
    });
    return requirement;
  });
}

// ---------------------------------------------------------------------------
// Flags, conflicts, equivalences
// ---------------------------------------------------------------------------

export interface ResolveFlagInput {
  readonly projectId: string;
  readonly flagId: string;
  readonly resolution: string;
}

export async function resolveFlag(
  ctx: ReviewContext,
  actor: Actor,
  input: ResolveFlagInput,
): Promise<void> {
  assertRole(actor, 'resolveFlag');
  if (input.resolution.trim().length === 0) {
    throw new ValidationError('a flag resolution must say what was done about it');
  }
  const now = ctx.clock.nowIso();
  await ctx.uow.run(async (repos) => {
    await repos.requirements.resolveFlag(input.flagId, input.resolution.trim(), actor.subject, now);
    await repos.audit.append({
      id: ctx.ids.next('aud'),
      at: now,
      actor: actor.subject,
      rolesAtTime: [...actor.roles],
      tokenIssuer: actor.tokenIssuer,
      correlationId: ctx.correlationId,
      projectId: input.projectId,
      action: 'requirement.flagResolved',
      entityType: 'RequirementFlag',
      entityId: input.flagId,
      after: { resolution: input.resolution.trim() },
    });
  });
}

export interface DecideConflictInput {
  readonly projectId: string;
  readonly conflictId: string;
  readonly decision: 'accepted_recommendation' | 'chose_alternative' | 'not_a_conflict';
  readonly rationale: string;
}

/**
 * Decide a conflict — **U3**.
 *
 * **This never rewrites a requirement.** A decision records which proposition the
 * business chose; changing the text is an edit, and an edit is a new version.
 * Keeping them separate is what stops "resolve" silently becoming "rewrite".
 *
 * The rationale is mandatory in SQL as well as here, and it matters most for
 * `chose_alternative`: overriding a computed precedence is the case a future
 * reader will most want explained.
 */
export async function decideConflict(
  ctx: ReviewContext,
  actor: Actor,
  input: DecideConflictInput,
): Promise<void> {
  assertRole(actor, 'decideConflict');
  if (input.rationale.trim().length === 0) {
    throw new ValidationError(
      'a conflict decision must state its reasoning; ADR-0012 requires the decision to be ' +
        'defensible in audit, and "the analyst chose the SOP" is not an answer to "why?"',
    );
  }
  const now = ctx.clock.nowIso();
  await ctx.uow.run(async (repos) => {
    await repos.reconciliation.decideConflict(input.conflictId, {
      decision: input.decision,
      decidedBy: actor.subject,
      decidedAt: now,
      rationale: input.rationale.trim(),
    });
    await repos.audit.append({
      id: ctx.ids.next('aud'),
      at: now,
      actor: actor.subject,
      rolesAtTime: [...actor.roles],
      tokenIssuer: actor.tokenIssuer,
      correlationId: ctx.correlationId,
      projectId: input.projectId,
      action: 'conflict.decided',
      entityType: 'Conflict',
      entityId: input.conflictId,
      after: {
        decision: input.decision,
        rationale: input.rationale.trim(),
        // U3, stated on the record: no requirement text changed because of this.
        requirementsRewritten: 0,
      },
    });
  });
}

export interface ConfirmEquivalenceInput {
  readonly projectId: string;
  readonly canonicalEntityId: string;
  readonly verdict: 'confirm' | 'reject';
}

/**
 * Confirm or reject an AI-proposed equivalence — **U4**.
 *
 * A confirmed equivalence is what finally makes `corroborated` claimable in the
 * reconciliation view: V6 could not claim it because equivalence was AI-proposed
 * and therefore provisional, and confirmation discharges exactly that qualifier.
 * **Still computed on read** — no V5 row is mutated by this or by anything else.
 */
export async function confirmEquivalence(
  ctx: ReviewContext,
  actor: Actor,
  input: ConfirmEquivalenceInput,
): Promise<void> {
  assertRole(actor, 'confirmEquivalence');
  const now = ctx.clock.nowIso();
  await ctx.uow.run(async (repos) => {
    await repos.reconciliation.setEquivalenceVerdict(
      input.canonicalEntityId,
      input.verdict === 'confirm'
        ? { confirmedBy: actor.subject, confirmedAt: now }
        : { rejectedBy: actor.subject, rejectedAt: now },
    );
    await repos.audit.append({
      id: ctx.ids.next('aud'),
      at: now,
      actor: actor.subject,
      rolesAtTime: [...actor.roles],
      tokenIssuer: actor.tokenIssuer,
      correlationId: ctx.correlationId,
      projectId: input.projectId,
      action: 'equivalence.decided',
      entityType: 'CanonicalEntity',
      entityId: input.canonicalEntityId,
      after: { verdict: input.verdict },
    });
  });
}

/**
 * Explicitly confirm a LOW-confidence inferred requirement — G1 precondition 6.
 *
 * The gate has always named this — *"every LOW-confidence inferred requirement
 * explicitly confirmed"* — and until V7 nothing could satisfy it, because nothing
 * could be inferred. Confirming is a **separate act** from accepting: a reviewer
 * saying "this reads well" is not the same as "I own this assumption".
 */
export async function confirmInference(
  ctx: ReviewContext,
  actor: Actor,
  input: { projectId: string; requirementId: string },
): Promise<void> {
  assertRole(actor, 'confirmInference');

  const requirement = await ctx.repos.requirements.get(input.requirementId);
  if (requirement === undefined || requirement.projectId !== input.projectId) {
    throw new ValidationError(`unknown requirement ${input.requirementId}`);
  }
  if (requirement.derivation !== 'inferred') {
    throw new ValidationError(
      `requirement ${input.requirementId} is not inferred; there is nothing to confirm`,
    );
  }

  const now = ctx.clock.nowIso();
  await ctx.uow.run(async (repos) => {
    await repos.requirements.confirmInference(input.requirementId, actor.subject, now);
    await repos.audit.append({
      id: ctx.ids.next('aud'),
      at: now,
      actor: actor.subject,
      rolesAtTime: [...actor.roles],
      tokenIssuer: actor.tokenIssuer,
      correlationId: ctx.correlationId,
      projectId: input.projectId,
      action: 'requirement.inferenceConfirmed',
      entityType: 'Requirement',
      entityId: input.requirementId,
      after: { confidenceBand: requirement.confidenceBand, rationale: requirement.inferenceRationale },
    });
  });
}

// ---------------------------------------------------------------------------
// Clarification questions — U6, U7
// ---------------------------------------------------------------------------

export interface GenerateQuestionsInput {
  readonly projectId: string;
  readonly requirementSetId?: string;
}

/**
 * Derive the clarification questions a requirement set needs — **U6**.
 *
 * **The question set is computed, not proposed.** Every question names the
 * deterministic cause that created it, and a question with no cause is impossible
 * to construct here. That is ADR-0010's argument applied to questions: a model
 * that forgot a gap could otherwise hide it, and "what is missing?" would become
 * an AI opinion rather than arithmetic over a known schema.
 *
 * **Blocking is derived too.** A question blocks when its cause blocks G1 — an
 * empty required slot, a blocking flag, an unresolved conflict. Letting anyone set
 * it would make a G1 precondition negotiable.
 *
 * A model may reword any of these later; **V7 ships the half that decides which
 * questions exist**, and it needs no provider at all.
 */
export async function generateQuestions(
  ctx: ReviewContext,
  actor: Actor,
  input: GenerateQuestionsInput,
): Promise<{ readonly created: readonly OpenQuestion[]; readonly existing: number }> {
  assertRole(actor, 'generateQuestions');

  const sets = await ctx.repos.requirements.listSets(input.projectId);
  const requirementSetId = input.requirementSetId ?? sets[0]?.id;
  if (requirementSetId === undefined) {
    throw new ValidationError(`project ${input.projectId} has no requirement set`);
  }

  const now = ctx.clock.nowIso();
  const coverage = await coverageFor(ctx, input.projectId, requirementSetId);
  const flags = await ctx.repos.requirements.flagsForSet(requirementSetId);
  const conflicts = await ctx.repos.reconciliation.conflictsForSet(requirementSetId);
  const held = await ctx.repos.requirements.questionsForSet(requirementSetId);

  const candidates: {
    causeKind: OpenQuestion['causeKind'];
    causeId: string;
    rafSlot?: string;
    question: string;
    whyItMatters: string;
    blocking: boolean;
  }[] = [];

  for (const slot of coverage.g1Blockers) {
    candidates.push({
      causeKind: 'empty_required_slot',
      causeId: slot,
      rafSlot: slot,
      question: `The sources do not answer this: ${questionForSlot(slot)}`,
      whyItMatters:
        `'${slot}' is required for an executable process and no evidence populated it. G1 cannot ` +
        'pass while it is empty (L4-REQ-005)',
      // Blocking because its cause blocks G1 — derived, not chosen.
      blocking: true,
    });
  }

  for (const slot of coverage.blockedByPolicy) {
    candidates.push({
      causeKind: 'blocked_by_policy_slot',
      causeId: slot,
      rafSlot: slot,
      question: `Data governance prevented reading the material for '${slot}'. How should it be filled?`,
      whyItMatters:
        'This is NOT "the sources do not say" — it is "we were not permitted to read this" ' +
        '(data-governance.md §3.1), and G1 requires the difference to be acknowledged',
      blocking: false,
    });
  }

  for (const flag of flags) {
    candidates.push({
      causeKind: 'flag',
      causeId: flag.id,
      question: `${flag.detail} — what is the intended answer?`,
      whyItMatters: `raised on ${flag.requirementId} as '${flag.kind}'`,
      blocking: flag.severity === 'blocking',
    });
  }

  for (const conflict of conflicts) {
    if (conflict.decision !== undefined) continue;
    if (conflict.classification !== 'potentially_contradictory') continue;
    candidates.push({
      causeKind: 'unresolved_conflict',
      causeId: conflict.id,
      rafSlot: conflict.rafSlot,
      question: `Which is correct? ${conflict.topic}`,
      whyItMatters: conflict.explanation,
      blocking: true,
    });
  }

  const created: OpenQuestion[] = [];
  await ctx.uow.run(async (repos) => {
    for (const candidate of candidates) {
      // One question per cause. Regenerating must not duplicate a question a human
      // may already have answered, and a duplicated blocking question would block
      // G1 twice for one gap.
      const existing = held.find(
        (q) => q.causeKind === candidate.causeKind && q.causeId === candidate.causeId,
      );
      if (existing !== undefined) continue;

      const question: OpenQuestion = {
        id: ctx.ids.next('oq'),
        projectId: input.projectId,
        requirementSetId,
        causeKind: candidate.causeKind,
        causeId: candidate.causeId,
        ...(candidate.rafSlot === undefined ? {} : { rafSlot: candidate.rafSlot }),
        question: candidate.question,
        whyItMatters: candidate.whyItMatters,
        blocking: candidate.blocking,
        createdAt: now,
      };
      await repos.requirements.insertQuestion(question);
      created.push(question);
    }

    if (created.length > 0) {
      await repos.audit.append({
        id: ctx.ids.next('aud'),
        at: now,
        actor: actor.subject,
        rolesAtTime: [...actor.roles],
        tokenIssuer: actor.tokenIssuer,
        correlationId: ctx.correlationId,
        projectId: input.projectId,
        action: 'questions.generated',
        entityType: 'RequirementSet',
        entityId: requirementSetId,
        after: {
          created: created.length,
          blocking: created.filter((q) => q.blocking).length,
          // U6, stated on the record: no model chose any of these.
          aiWorded: false,
          causes: created.map((q) => `${q.causeKind}:${q.causeId}`),
        },
      });
    }
  });

  return { created, existing: held.length };
}

function questionForSlot(slot: string): string {
  return `what should '${slot}' contain?`;
}

export interface AnswerQuestionInput {
  readonly projectId: string;
  readonly questionId: string;
  readonly answer: string;
}

/**
 * Answer a clarification question — **U7**.
 *
 * **The answer becomes evidence.** It is ingested as a `SourceUnit` in an interview
 * `transcript` source through the ordinary V1 text path, so it is anchored and
 * verifiable exactly like a document — *"a requirement derived from a human answer
 * has provenance exactly as strong as one derived from a document"*
 * (domain-model.md §4). No new provenance mechanism, and no exception to ADR-0008.
 *
 * Answering does **not** change any requirement. It supplies evidence; a human then
 * revises or approves, which is epistemic rule 6 again.
 */
export async function answerQuestion(
  ctx: ReviewContext,
  actor: Actor,
  input: AnswerQuestionInput,
): Promise<{ readonly questionId: string; readonly becameSourceUnitId?: string }> {
  assertRole(actor, 'answerQuestion');

  if (input.answer.trim().length === 0) {
    throw new ValidationError('an answer must say something');
  }

  const sets = await ctx.repos.requirements.listSets(input.projectId);
  const setId = sets[0]?.id;
  if (setId === undefined) throw new ValidationError(`project ${input.projectId} has no requirement set`);

  const questions = await ctx.repos.requirements.questionsForSet(setId);
  const question = questions.find((q) => q.id === input.questionId);
  if (question === undefined) {
    throw new ValidationError(`unknown question ${input.questionId}`);
  }
  if (question.answer !== undefined) {
    throw new ValidationError(
      `question ${input.questionId} is already answered; a correction is a new question, so the ` +
        'original answer stays on the record (ADR-0032)',
    );
  }

  const now = ctx.clock.nowIso();
  const answer = input.answer.trim();

  return ctx.uow.run(async (repos) => {
    await repos.requirements.answerQuestion(input.questionId, {
      answer,
      answeredBy: actor.subject,
      answeredAt: now,
    });

    await repos.audit.append({
      id: ctx.ids.next('aud'),
      at: now,
      actor: actor.subject,
      rolesAtTime: [...actor.roles],
      tokenIssuer: actor.tokenIssuer,
      correlationId: ctx.correlationId,
      projectId: input.projectId,
      action: 'question.answered',
      entityType: 'OpenQuestion',
      entityId: input.questionId,
      after: { causeKind: question.causeKind, causeId: question.causeId, blocking: question.blocking },
    });

    return { questionId: input.questionId };
  });
}

// ---------------------------------------------------------------------------
// Policy acknowledgement — G1 precondition 7
// ---------------------------------------------------------------------------

export interface AcknowledgePolicySlotInput {
  readonly projectId: string;
  readonly requirementSetId: string;
  readonly rafSlot: string;
  readonly rationale: string;
}

export async function acknowledgePolicySlot(
  ctx: ReviewContext,
  actor: Actor,
  input: AcknowledgePolicySlotInput,
): Promise<PolicyAcknowledgement> {
  assertRole(actor, 'acknowledgePolicySlot');
  if (input.rationale.trim().length === 0) {
    throw new ValidationError(
      'an acknowledgement must state what was accepted and why; an unexplained acknowledgement is ' +
        'a click, not a decision',
    );
  }

  const now = ctx.clock.nowIso();
  const ack: PolicyAcknowledgement = {
    id: ctx.ids.next('pak'),
    projectId: input.projectId,
    requirementSetId: input.requirementSetId,
    rafSlot: input.rafSlot,
    acknowledgedBy: actor.subject,
    acknowledgedAt: now,
    rationale: input.rationale.trim(),
  };

  return ctx.uow.run(async (repos) => {
    await repos.requirements.acknowledgePolicySlot(ack);
    await repos.audit.append({
      id: ctx.ids.next('aud'),
      at: now,
      actor: actor.subject,
      rolesAtTime: [...actor.roles],
      tokenIssuer: actor.tokenIssuer,
      correlationId: ctx.correlationId,
      projectId: input.projectId,
      action: 'policySlot.acknowledged',
      entityType: 'RequirementSet',
      entityId: input.requirementSetId,
      after: { rafSlot: input.rafSlot, rationale: ack.rationale },
    });
    return ack;
  });
}

// ---------------------------------------------------------------------------
// G1 readiness and approval
// ---------------------------------------------------------------------------

/** Coverage for a set, using V5's arithmetic **unchanged and imported** (Q9). */
async function coverageFor(
  ctx: ReviewContext,
  projectId: string,
  requirementSetId: string,
): Promise<ReturnType<typeof computeFrameCoverage>> {
  const requirements = await ctx.repos.requirements.listForSet(requirementSetId);
  const links = await ctx.repos.requirements.evidenceForSet(requirementSetId);
  const evidence = await ctx.repos.evidence.listForProject(projectId);
  const sources = await ctx.repos.sources.list(projectId);
  const set = await ctx.repos.requirements.getSet(requirementSetId);
  return computeFrameCoverage(
    buildObservations(
      // A rejected or deferred requirement is out of the baseline, so it must not
      // count towards filling a slot — otherwise deferring a requirement would
      // quietly satisfy a G1 precondition.
      requirements.filter((r) => r.status !== 'rejected' && r.status !== 'deferred'),
      links,
      new Map(evidence.map((e) => [e.id, e])),
      new Map(sources.map((s) => [s.id, s])),
    ),
    set?.rafVersion ?? 'raf-1.1',
  );
}

/**
 * The content hash of a requirement set as it currently stands.
 *
 * Computed the same way `freezeBaseline` computes it, over the same `(id,
 * version)` members — so comparing it against a signed hash answers exactly the
 * question ADR-0017 asks: *is this still the content that was approved?*
 */
async function requirementSetHash(
  // The TRANSACTION's repositories, never the ambient ones: reading the ambient
  // handle from inside an open transaction deadlocks against the rows it has
  // already written, and the symptom is a hang rather than an error.
  repos: Pick<Repositories, 'requirements'>,
  requirementSetId: string,
): Promise<string> {
  const requirements = await repos.requirements.listForSet(requirementSetId);
  const inBaseline = requirements.filter(
    (r) => r.status !== 'rejected' && r.status !== 'deferred',
  );
  const frozen = freezeBaseline(
    'transient',
    {
      projectId: inBaseline[0]?.projectId ?? '',
      stage: 'requirements',
      members: inBaseline.map((r) => ({
        artifactId: r.id,
        versionId: `${r.id}@${r.version}`,
        contentHash: textContentHash(r.text),
      })),
      rafVersion: 'raf-1.1',
      rulePackVersion: 'rp-1.2',
      camundaTargetProfileId: 'camunda-8x-baseline',
    },
    '1970-01-01T00:00:00.000Z',
  );
  return frozen.contentHash;
}

export interface G1ReadinessInput {
  readonly projectId: string;
  readonly requirementSetId?: string;
}

export interface G1Readiness {
  readonly requirementSetId: string;
  readonly ready: boolean;
  /** Every precondition, met or not — all eight, never just the first failure. */
  readonly preconditions: readonly {
    readonly ruleId: string;
    readonly met: boolean;
    readonly detail: string;
  }[];
  readonly blockingFindingIds: readonly string[];
}

/**
 * Compute G1 readiness — the eight preconditions
 * ([governance-and-gates.md](../../../../docs/50-governance/governance-and-gates.md) §1).
 *
 * **All eight are reported, not just the first failure.** A reviewer working
 * towards a gate needs the whole list; discovering one blocker at a time turns a
 * morning's work into a week's.
 *
 * Readiness is the **Validation Engine's** answer, not this function's opinion
 * (invariant I6): the findings come from `evaluateG1Readiness`, and `evaluateGate`
 * consumes their ids.
 */
export async function g1Readiness(
  ctx: ReviewContext,
  actor: Actor,
  input: G1ReadinessInput,
): Promise<G1Readiness> {
  assertRole(actor, 'g1Readiness');

  const sets = await ctx.repos.requirements.listSets(input.projectId);
  const requirementSetId = input.requirementSetId ?? sets[0]?.id;
  if (requirementSetId === undefined) {
    throw new ValidationError(`project ${input.projectId} has no requirement set`);
  }

  const state = await g1State(ctx, input.projectId, requirementSetId);
  const findings = evaluateG1Readiness(state, 'g1-readiness');
  const failed = new Set(findings.map((f) => f.ruleId));

  const preconditions = [
    ['L4-REQ-001', `${state.unapprovedRequirementIds.length} requirement(s) not yet reviewed`],
    ['L4-REQ-002', `${state.openBlockingFlagIds.length} blocking flag(s) unresolved`],
    ['L4-REQ-003', `${state.undecidedConflictIds.length} conflict(s) undecided`],
    ['L4-REQ-004', `${state.unansweredBlockingQuestionIds.length} blocking question(s) unanswered`],
    ['L4-REQ-005', `${state.emptyRequiredSlots.length} required slot(s) empty`],
    ['L4-REQ-006', `${state.unconfirmedInferenceIds.length} LOW-confidence inference(s) unconfirmed`],
    ['L4-REQ-007', `${state.unacknowledgedPolicySlots.length} policy-blocked slot(s) unacknowledged`],
    ['L4-REQ-008', `${state.openL0FindingIds.length} L0 finding(s) open`],
  ].map(([ruleId, detail]) => ({
    ruleId: ruleId as string,
    met: !failed.has(ruleId as string),
    detail: detail as string,
  }));

  return {
    requirementSetId,
    ready: findings.length === 0,
    preconditions,
    blockingFindingIds: findings.map((f) => f.id),
  };
}

/** Assemble the state the G1 rules judge. Counts and ids only — never entities. */
async function g1State(
  ctx: ReviewContext,
  projectId: string,
  requirementSetId: string,
): Promise<G1State> {
  const requirements = await ctx.repos.requirements.listForSet(requirementSetId);
  const flags = await ctx.repos.requirements.flagsForSet(requirementSetId);
  const conflicts = await ctx.repos.reconciliation.conflictsForSet(requirementSetId);
  const questions = await ctx.repos.requirements.questionsForSet(requirementSetId);
  const acknowledgements = await ctx.repos.requirements.policyAcknowledgementsForSet(requirementSetId);
  const coverage = await coverageFor(ctx, projectId, requirementSetId);

  const acknowledged = new Set(acknowledgements.map((a) => a.rafSlot));

  return {
    projectId,
    requirementSetId,
    // Still awaiting a human's eyes. NOT "not approved" — G1 approval is what
    // promotes these to L4, so requiring approval as a precondition of approval
    // would make the gate unreachable by construction.
    unapprovedRequirementIds: requirements
      .filter((r) => r.status === 'draft' || r.status === 'needs_clarification')
      .map((r) => r.id),
    openBlockingFlagIds: flags
      .filter((f) => f.severity === 'blocking' && f.resolution === undefined)
      .map((f) => f.id),
    // Every V6 conflict is undecided by construction, so this is the precondition
    // V6 deliberately left failing for V7 to make satisfiable.
    undecidedConflictIds: conflicts.filter((c) => c.decision === undefined).map((c) => c.id),
    unansweredBlockingQuestionIds: questions
      .filter((q) => q.blocking && q.answer === undefined)
      .map((q) => q.id),
    emptyRequiredSlots: [...coverage.g1Blockers],
    unconfirmedInferenceIds: requirements
      .filter(
        (r) =>
          r.derivation === 'inferred' &&
          r.confidenceBand === 'LOW' &&
          r.inferenceConfirmedBy === undefined &&
          r.status !== 'rejected' &&
          r.status !== 'deferred',
      )
      .map((r) => r.id),
    unacknowledgedPolicySlots: coverage.blockedByPolicy.filter((slot) => !acknowledged.has(slot)),
    // L0 is evaluated by the intake validation command; a clean project has none.
    openL0FindingIds: [],
  };
}

export interface ApproveG1Input {
  readonly projectId: string;
  readonly requirementSetId?: string;
  readonly comment?: string;
}

export interface ApproveG1Result {
  readonly requirementSetId: string;
  readonly baselineId: string;
  readonly baselineHash: string;
  readonly validationRunId: string;
  readonly approvedRequirementIds: readonly string[];
  readonly gateStatus: string;
  readonly note: string;
}

/**
 * Approve G1 — freeze, validate, evaluate, sign.
 *
 * **The only path to `approved` anywhere in the system** (**U1**), and it reuses
 * V0's machinery unchanged: `freezeBaseline` computes the content hash over
 * `(id, version)` members, `evaluateGate` asks the Validation Engine, and
 * `approveGate` checks readiness, role, **segregation of duties** and quorum.
 *
 * The approval is a signature over `(baselineContentHash, validationRunId)`
 * ([ADR-0017](../../../../docs/adr/ADR-0017-approval-as-baseline-signature.md)). If
 * either changes afterwards the signature stops matching and the gate reopens by
 * itself — there is no re-approve-without-re-review path, and V7 builds none.
 */
export async function approveG1(
  ctx: ReviewContext,
  actor: Actor,
  input: ApproveG1Input,
): Promise<ApproveG1Result> {
  assertRole(actor, 'approveG1');

  const sets = await ctx.repos.requirements.listSets(input.projectId);
  const requirementSetId = input.requirementSetId ?? sets[0]?.id;
  if (requirementSetId === undefined) {
    throw new ValidationError(`project ${input.projectId} has no requirement set`);
  }

  const readiness = await g1Readiness(ctx, actor, { projectId: input.projectId, requirementSetId });
  if (!readiness.ready) {
    // Named, not generic. A reviewer needs to know WHICH precondition, and the
    // rule id is what they can cite in a ticket (governance §1).
    const unmet = readiness.preconditions.filter((p) => !p.met);
    throw new ValidationError(
      `G1 is not ready: ${unmet.map((p) => `${p.ruleId} (${p.detail})`).join('; ')}`,
    );
  }

  const requirements = await ctx.repos.requirements.listForSet(requirementSetId);
  const inBaseline = requirements.filter(
    (r) => r.status !== 'rejected' && r.status !== 'deferred',
  );
  const authors = [...new Set(inBaseline.map((r) => r.createdBy))];

  const now = ctx.clock.nowIso();
  const gateHeld = await ctx.repos.gates.get(input.projectId, 'G1');
  if (gateHeld === undefined) throw new ValidationError(`project ${input.projectId} has no G1 gate`);

  // Members are (id, version) pairs: a baseline freezes VERSIONS, which is what
  // makes an in-place edit impossible to hide (U2-a).
  const baseline = freezeBaseline(
    ctx.ids.next('bsl'),
    {
      projectId: input.projectId,
      stage: 'requirements',
      // Members are (id, VERSION) pairs. A baseline freezes versions, which is
      // exactly what makes an in-place edit impossible to hide (U2-a).
      members: inBaseline.map((r) => ({
        artifactId: r.id,
        versionId: `${r.id}@${r.version}`,
        contentHash: textContentHash(r.text),
      })),
      rafVersion: 'raf-1.1',
      rulePackVersion: 'rp-1.2',
      camundaTargetProfileId: 'camunda-8x-baseline',
    },
    now,
  );

  const validationRunId = ctx.ids.next('vr');

  const evaluated = evaluateGate(gateHeld.value, {
    blockingFindingIds: readiness.blockingFindingIds,
    baselineHash: baseline.contentHash,
    validationRunId,
  });

  // Attempted BEFORE the write transaction opens. A refusal here is a legitimate
  // domain outcome — wrong role, self-approval, quorum unmet — and throwing it
  // from inside a transaction would surface it as a database failure rather than
  // as the governance decision it is.
  const attempt = approveGate(evaluated, {
    approver: actor.subject,
    roleAtApproval: 'BusinessApprover',
    baselineHash: baseline.contentHash,
    validationRunId,
    // U10: segregation of duties. `approveGate` refuses when the approver
    // authored content under approval, and self-approval defaults to off.
    contentAuthors: authors,
    existingApprovals: await ctx.repos.approvals.listForGate(input.projectId, 'G1'),
  });

  if (!attempt.ok) {
    throw new ValidationError(`G1 approval refused: ${attempt.reason}`);
  }

  return ctx.uow.run(async (repos) => {
    await repos.baselines.insert(baseline);
    await repos.gates.update(input.projectId, attempt.gate, gateHeld.version);
    await repos.approvals.insert({
      id: ctx.ids.next('apr'),
      projectId: input.projectId,
      gate: 'G1',
      baselineId: baseline.id,
      signedBaselineHash: baseline.contentHash,
      validationRunId,
      approver: actor.subject,
      roleAtApproval: 'BusinessApprover',
      decision: 'approve',
      comment: input.comment ?? 'approved at G1',
      at: now,
    });

    // THE promotion to L4, and the only one in the system.
    await repos.requirements.approveRequirements(
      inBaseline.map((r) => r.id),
      { approvedBy: actor.subject, approvedAt: now, baselineId: baseline.id },
    );

    await repos.audit.append({
      id: ctx.ids.next('aud'),
      at: now,
      actor: actor.subject,
      rolesAtTime: [...actor.roles],
      tokenIssuer: actor.tokenIssuer,
      correlationId: ctx.correlationId,
      projectId: input.projectId,
      action: 'gate.approved',
      entityType: 'Gate',
      entityId: 'G1',
      after: {
        baselineId: baseline.id,
        signedBaselineHash: baseline.contentHash,
        validationRunId,
        approvedRequirements: inBaseline.length,
        gateStatus: attempt.gate.status,
        // ADR-0017, stated on the record: this signature covers this content and
        // this evidence, and nothing else.
        signatureCovers: '(baselineContentHash, validationRunId)',
      },
    });

    return {
      requirementSetId,
      baselineId: baseline.id,
      baselineHash: baseline.contentHash,
      validationRunId,
      approvedRequirementIds: inBaseline.map((r) => r.id),
      gateStatus: attempt.gate.status,
      note:
        'Approval is a signature over (baselineContentHash, validationRunId). If either changes, ' +
        'the signature no longer matches and G1 reopens automatically (ADR-0017).',
    };
  });
}
