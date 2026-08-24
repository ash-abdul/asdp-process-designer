/**
 * The requirement review lifecycle (V7).
 *
 * ADR-0034 N3: parse, delegate, map. No business logic.
 *
 * **What this surface offers that no earlier one did:** a way for a person to
 * decide. Everything before V7 could only propose.
 *
 * Split from [g1.controller.ts](g1.controller.ts) when the combined surface passed
 * the `controller-thinness` cap. **The checker caught it and the fix was to split
 * the surface, not to raise the cap** — a rule relaxed to let a change through
 * stops being a rule. The seam is real rather than arbitrary: this file acts on
 * **one requirement at a time**, and G1's acts on **the set as a whole**.
 *
 * **What it still does not offer**, because absence is the enforcement:
 *
 *   - **no route that sets `approved`** — U1. That is `POST g1/approve` alone, and
 *     the repository and migration 010 refuse it independently
 *   - **no route that edits requirement text in place** — a revision is a new
 *     version, and `PUT /requirements/:id` does not exist (U2-a)
 *   - no delete route for anything
 *   - no BPS, spec, IR or generation surface of any kind — that is P3
 *
 * A test asserts each of those returns 404, because "we did not build it" and "it
 * is not reachable" are different claims and only the second one holds.
 */

import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  acknowledgePolicySlot,
  addInferredRequirement,
  answerQuestion,
  approveG1,
  confirmEquivalence,
  confirmInference,
  decideConflict,
  g1Readiness,
  generateQuestions,
  resolveFlag,
  reviewRequirement,
  reviseRequirement,
  type ReviewContext,
} from '../commands/review.ts';
import type { Actor } from '../commands.ts';
import { ActorGuard, CorrelationId, CurrentActor } from './actor.guard.ts';
import { CLOCK, ID_GENERATOR, REPOSITORIES, UNIT_OF_WORK } from './tokens.ts';
import type { Clock, IdGenerator, Repositories, UnitOfWork } from '../ports.ts';
import { optionalString, requiredString } from './request-parsing.ts';

@Controller('projects/:projectId')
@UseGuards(ActorGuard)
export class ReviewController {
  constructor(
    @Inject(REPOSITORIES) private readonly repos: Repositories,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  private ctx(correlationId: string): ReviewContext {
    return {
      repos: this.repos,
      clock: this.clock,
      ids: this.ids,
      correlationId,
      uow: this.uow,
    };
  }

  @Post('requirements/:requirementId/review')
  @HttpCode(200)
  async review(
    @Param('projectId') projectId: string,
    @Param('requirementId') requirementId: string,
    @Body() body: { action?: unknown },
    @CurrentActor() actor: Actor,
    @CorrelationId() correlationId: string,
  ): Promise<unknown> {
    const action = requiredString(body.action, 'action');
    if (!['accept', 'reject', 'defer', 'send_for_clarification'].includes(action)) {
      // `approve` is deliberately not among them: approval is G1's act (U1).
      throw new Error(`unknown review action '${action}'`);
    }
    return reviewRequirement(this.ctx(correlationId), actor, {
      projectId,
      requirementId,
      action: action as 'accept' | 'reject' | 'defer' | 'send_for_clarification',
    });
  }

  /** Revise: a **new version**, never an in-place edit (U2-a). POST, not PUT. */
  @Post('requirements/:requirementId/revise')
  @HttpCode(201)
  async revise(
    @Param('projectId') projectId: string,
    @Param('requirementId') requirementId: string,
    @Body() body: { text?: unknown; changeReason?: unknown; evidenceItemIds?: unknown },
    @CurrentActor() actor: Actor,
    @CorrelationId() correlationId: string,
  ): Promise<unknown> {
    return reviseRequirement(this.ctx(correlationId), actor, {
      projectId,
      requirementId,
      text: requiredString(body.text, 'text'),
      changeReason: requiredString(body.changeReason, 'changeReason'),
      ...(Array.isArray(body.evidenceItemIds)
        ? { evidenceItemIds: body.evidenceItemIds.map(String) }
        : {}),
    });
  }

  /** Human-originated L3 (U8-a). There is no AI route to this. */
  @Post('requirements/inferred')
  @HttpCode(201)
  async inferred(
    @Param('projectId') projectId: string,
    @Body()
    body: {
      requirementSetId?: unknown;
      text?: unknown;
      rafSlot?: unknown;
      category?: unknown;
      inferenceRationale?: unknown;
    },
    @CurrentActor() actor: Actor,
    @CorrelationId() correlationId: string,
  ): Promise<unknown> {
    return addInferredRequirement(this.ctx(correlationId), actor, {
      projectId,
      requirementSetId: requiredString(body.requirementSetId, 'requirementSetId'),
      text: requiredString(body.text, 'text'),
      rafSlot: requiredString(body.rafSlot, 'rafSlot'),
      category: requiredString(body.category, 'category') as never,
      inferenceRationale: requiredString(body.inferenceRationale, 'inferenceRationale'),
    });
  }

  /** Confirm a LOW-confidence inference — G1 precondition 6, and a separate act. */
  @Post('requirements/:requirementId/confirm-inference')
  @HttpCode(200)
  async confirm(
    @Param('projectId') projectId: string,
    @Param('requirementId') requirementId: string,
    @CurrentActor() actor: Actor,
    @CorrelationId() correlationId: string,
  ): Promise<unknown> {
    await confirmInference(this.ctx(correlationId), actor, { projectId, requirementId });
    return { requirementId, confirmed: true };
  }

  @Post('requirement-flags/:flagId/resolve')
  @HttpCode(200)
  async flag(
    @Param('projectId') projectId: string,
    @Param('flagId') flagId: string,
    @Body() body: { resolution?: unknown },
    @CurrentActor() actor: Actor,
    @CorrelationId() correlationId: string,
  ): Promise<unknown> {
    await resolveFlag(this.ctx(correlationId), actor, {
      projectId,
      flagId,
      resolution: requiredString(body.resolution, 'resolution'),
    });
    return { flagId, resolved: true };
  }
}
