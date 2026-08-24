/**
 * Conflict decisions, equivalence confirmation and the clarification queue (V7).
 *
 * ADR-0034 N3: parse, delegate, map. No business logic.
 *
 * **The second split of the V7 surface, and the reason is the same as the
 * first.** `controller-thinness` fired again when answering a question grew the
 * intake injections it needs for **U7**. The cap was not raised — the surface was
 * cut along a real seam: everything here is a human **resolving something** about
 * the set, and [g1.controller.ts](g1.controller.ts) is now only the gate itself.
 *
 * This is the one V7 controller that carries the intake ports, because **U7** says
 * an answered question becomes a `SourceUnit` in a `transcript` `Source` ingested
 * through the existing V1 text path. The gate controller does not carry them, and
 * should not: a gate has no business reaching intake.
 *
 * **What this surface does not offer:** no route that resolves a conflict without
 * a rationale, and no route that applies a precedence recommendation — ADR-0012
 * and Q5 forbid both, and `reconciliation.test.ts` asserts their absence.
 */

import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  acknowledgePolicySlot,
  answerQuestion,
  confirmEquivalence,
  decideConflict,
  generateQuestions,
  type ClarificationContext,
} from '../commands/review.ts';
import type { Actor } from '../commands.ts';
import { ActorGuard, CorrelationId, CurrentActor } from './actor.guard.ts';
import {
  BLOB_STORE,
  CLOCK,
  CONFIG,
  EXTRACTORS,
  ID_GENERATOR,
  REPOSITORIES,
  UNIT_OF_WORK,
  VISION_EXTRACTOR,
} from './tokens.ts';
import type { BlobStore, Clock, IdGenerator, Repositories, UnitOfWork } from '../ports.ts';
import type { TextExtractor, VisionExtractor } from '@asdp/ingestion';
import type { Config } from '../config.ts';
import { optionalString, requiredString } from './request-parsing.ts';

const CONFLICT_DECISIONS = [
  'accepted_recommendation',
  'chose_alternative',
  'not_a_conflict',
] as const;

@Controller('projects/:projectId')
@UseGuards(ActorGuard)
export class ClarificationController {
  constructor(
    @Inject(REPOSITORIES) private readonly repos: Repositories,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(BLOB_STORE) private readonly blobs: BlobStore,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CONFIG) private readonly config: Config,
    @Inject(EXTRACTORS) private readonly extractors: readonly TextExtractor[],
    @Inject(VISION_EXTRACTOR) private readonly vision: VisionExtractor,
  ) {}

  private ctx(correlationId: string): ClarificationContext {
    return {
      repos: this.repos,
      clock: this.clock,
      ids: this.ids,
      correlationId,
      blobs: this.blobs,
      uow: this.uow,
      maxSourceBytes: this.config.maxSourceBytes,
      extractors: this.extractors,
      vision: this.vision,
    };
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

  /** Confirm or reject an AI-proposed equivalence (**U4**). */
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

  /** Answer a question. The answer becomes an anchored `transcript` unit (**U7**). */
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
}
