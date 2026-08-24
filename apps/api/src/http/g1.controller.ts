/**
 * **G1** — freeze, validate, evaluate, sign (V7).
 *
 * ADR-0034 N3: parse, delegate, map. No business logic.
 *
 * This surface has been split twice, and neither time was the
 * `controller-thinness` cap raised. First `review.controller.ts` was cut away —
 * one requirement at a time. Then [clarification.controller.ts](clarification.controller.ts)
 * — a human resolving something about the set. What is left is **the gate
 * itself**, which is what this file should have been all along: a rule relaxed to
 * let a change through stops being a rule.
 *
 * **What this surface does not offer:**
 *
 *   - no route that approves a requirement directly; `g1/approve` approves a
 *     **baseline**, and promotion to L4 is its consequence (U1)
 *   - no BPS, spec, IR or generation surface of any kind — that is P3
 */

import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  approveG1,
  g1Readiness,
  validateRequirementSet,
  type ReviewContext,
} from '../commands/review.ts';
import type { Actor } from '../commands.ts';
import { ActorGuard, CorrelationId, CurrentActor } from './actor.guard.ts';
import { CLOCK, ID_GENERATOR, REPOSITORIES, UNIT_OF_WORK } from './tokens.ts';
import type { Clock, IdGenerator, Repositories, UnitOfWork } from '../ports.ts';
import { optionalString } from './request-parsing.ts';

@Controller('projects/:projectId/g1')
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

  /**
   * All eight preconditions, met or not — never just the first failure.
   *
   * A **read**: it persists nothing and consumes no identifier, so a reviewer may
   * check the panel as often as they like without touching an approval.
   */
  @Get('readiness')
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
   * Record a validation run — the `validate` step, and **an act with a
   * consequence**.
   *
   * An approval is a signature over `(baselineContentHash, validationRunId)`, so
   * recording a NEW run over an approved set means that approval now rests on
   * superseded evidence and **G1 reopens by itself** (ADR-0017). Use
   * `GET readiness` to look; use this to establish evidence.
   */
  @Post('validate')
  @HttpCode(201)
  async validate(
    @Param('projectId') projectId: string,
    @Body() body: { requirementSetId?: unknown },
    @CurrentActor() actor: Actor,
    @CorrelationId() correlationId: string,
  ): Promise<unknown> {
    const requirementSetId = optionalString(body.requirementSetId, 'requirementSetId');
    return validateRequirementSet(this.ctx(correlationId), actor, {
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
  @Post('approve')
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
