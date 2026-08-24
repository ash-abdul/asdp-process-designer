/**
 * Conflict decisions, clarifications and **G1** (V7).
 *
 * ADR-0034 N3: parse, delegate, map. No business logic.
 *
 * Split from [review.controller.ts](review.controller.ts) when the combined
 * surface passed the `controller-thinness` cap. **The checker caught it and the
 * fix was to split the surface, not to raise the cap** — a rule relaxed to let a
 * change through stops being a rule.
 *
 * The seam is a real one rather than an arbitrary cut: `review.controller.ts` acts
 * on **one requirement at a time**, and everything here acts on **the set as a
 * whole** — the conflicts between its members, the questions it raises, and the
 * gate that approves it.
 *
 * **What this surface does not offer:**
 *
 *   - no route that resolves a conflict without a rationale — the command and
 *     migration 010 both refuse it
 *   - no route that approves a requirement directly; `g1/approve` approves a
 *     **baseline**, and promotion to L4 is its consequence (U1)
 *   - no BPS, spec, IR or generation surface of any kind — that is P3
 */

import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  acknowledgePolicySlot,
  answerQuestion,
  approveG1,
  confirmEquivalence,
  decideConflict,
  g1Readiness,
  generateQuestions,
  type ReviewContext,
} from '../commands/review.ts';
import type { Actor } from '../commands.ts';
import { ActorGuard, CorrelationId, CurrentActor } from './actor.guard.ts';
import { CLOCK, ID_GENERATOR, REPOSITORIES, UNIT_OF_WORK } from './tokens.ts';
import type { Clock, IdGenerator, Repositories, UnitOfWork } from '../ports.ts';
import { optionalString, requiredString } from './request-parsing.ts';

const CONFLICT_DECISIONS = [
  'accepted_recommendation',
  'chose_alternative',
  'not_a_conflict',
] as const;

@Controller('projects/:projectId')
@UseGuards(ActorGuard)
export class G1Controller {
  constructor(
    @Inject(REPOSITORIES) private readonly repos: Repositories,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  private ctx(correlationId: string): ReviewContext {
    return { repos: this.repos, clock: this.clock, ids: this.ids, correlationId, uow: this.uow };
  }

  /** Decide a conflict. **Never rewrites a requirement** (U3). */
  @Post('conflicts/:conflictId/decide')
  @HttpCode(200)
  async conflict(
    @Param('projectId') projectId: string,
    @Param('conflictId') conflictId: string,
    @Body() body: { decision?: unknown; rationale?: unknown },
    @CurrentActor() actor: Actor,
    @CorrelationId() correlationId: string,
  ): Promise<unknown> {
    const decision = requiredString(body.decision, 'decision');
    if (!(CONFLICT_DECISIONS as readonly string[]).includes(decision)) {
      throw new Error(`unknown conflict decision '${decision}'`);
    }
    await decideConflict(this.ctx(correlationId), actor, {
      projectId,
      conflictId,
      decision: decision as (typeof CONFLICT_DECISIONS)[number],
      rationale: requiredString(body.rationale, 'rationale'),
    });
    return { conflictId, decided: true };
  }

  @Post('canonical-entities/:entityId/verdict')
  @HttpCode(200)
  async equivalence(
    @Param('projectId') projectId: string,
    @Param('entityId') entityId: string,
    @Body() body: { verdict?: unknown },
    @CurrentActor() actor: Actor,
    @CorrelationId() correlationId: string,
  ): Promise<unknown> {
    const verdict = requiredString(body.verdict, 'verdict');
    if (verdict !== 'confirm' && verdict !== 'reject') {
      throw new Error(`unknown equivalence verdict '${verdict}'`);
    }
    await confirmEquivalence(this.ctx(correlationId), actor, {
      projectId,
      canonicalEntityId: entityId,
      verdict,
    });
    return { entityId, verdict };
  }

  /** Derive the question set. Deterministic — no provider is reachable (U6). */
  @Post('questions/generate')
  @HttpCode(201)
  async generate(
    @Param('projectId') projectId: string,
    @Body() body: { requirementSetId?: unknown },
    @CurrentActor() actor: Actor,
    @CorrelationId() correlationId: string,
  ): Promise<unknown> {
    const setId = optionalString(body.requirementSetId, 'requirementSetId');
    return generateQuestions(this.ctx(correlationId), actor, {
      projectId,
      ...(setId === undefined ? {} : { requirementSetId: setId }),
    });
  }

  @Get('questions')
  async questions(
    @Param('projectId') projectId: string,
    @Query('setId') setId: unknown,
    @CurrentActor() actor: Actor,
    @CorrelationId() correlationId: string,
  ): Promise<unknown> {
    const ctx = this.ctx(correlationId);
    const requested = optionalString(setId, 'setId');
    const sets = await ctx.repos.requirements.listSets(projectId);
    const target = requested ?? sets[0]?.id;
    if (target === undefined) return { total: 0, questions: [] };
    const questions = await ctx.repos.requirements.questionsForSet(target);
    void actor;
    return { requirementSetId: target, total: questions.length, questions };
  }

  @Post('questions/:questionId/answer')
  @HttpCode(200)
  async answer(
    @Param('projectId') projectId: string,
    @Param('questionId') questionId: string,
    @Body() body: { answer?: unknown },
    @CurrentActor() actor: Actor,
    @CorrelationId() correlationId: string,
  ): Promise<unknown> {
    return answerQuestion(this.ctx(correlationId), actor, {
      projectId,
      questionId,
      answer: requiredString(body.answer, 'answer'),
    });
  }

  @Post('policy-acknowledgements')
  @HttpCode(201)
  async acknowledge(
    @Param('projectId') projectId: string,
    @Body() body: { requirementSetId?: unknown; rafSlot?: unknown; rationale?: unknown },
    @CurrentActor() actor: Actor,
    @CorrelationId() correlationId: string,
  ): Promise<unknown> {
    return acknowledgePolicySlot(this.ctx(correlationId), actor, {
      projectId,
      requirementSetId: requiredString(body.requirementSetId, 'requirementSetId'),
      rafSlot: requiredString(body.rafSlot, 'rafSlot'),
      rationale: requiredString(body.rationale, 'rationale'),
    });
  }

  /** All eight preconditions, met or not — never just the first failure. */
  @Get('g1/readiness')
  async readiness(
    @Param('projectId') projectId: string,
    @Query('setId') setId: unknown,
    @CurrentActor() actor: Actor,
    @CorrelationId() correlationId: string,
  ): Promise<unknown> {
    const requirementSetId = optionalString(setId, 'setId');
    return g1Readiness(this.ctx(correlationId), actor, {
      projectId,
      ...(requirementSetId === undefined ? {} : { requirementSetId }),
    });
  }

  /**
   * Approve G1 — **the only route in the system that produces an L4 requirement**.
   *
   * `BusinessApprover` only, and `approveGate` additionally refuses an approver who
   * authored content in the baseline (U10).
   */
  @Post('g1/approve')
  @HttpCode(201)
  async approve(
    @Param('projectId') projectId: string,
    @Body() body: { requirementSetId?: unknown; comment?: unknown },
    @CurrentActor() actor: Actor,
    @CorrelationId() correlationId: string,
  ): Promise<unknown> {
    const requirementSetId = optionalString(body.requirementSetId, 'requirementSetId');
    const comment = optionalString(body.comment, 'comment');
    return approveG1(this.ctx(correlationId), actor, {
      projectId,
      ...(requirementSetId === undefined ? {} : { requirementSetId }),
      ...(comment === undefined ? {} : { comment }),
    });
  }
}
