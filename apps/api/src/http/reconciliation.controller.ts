/**
 * Reconciliation endpoints (V6).
 *
 * ADR-0034 N3: parse, delegate, map. No business logic.
 *
 * **What this surface deliberately does not offer**, because the absence is the
 * enforcement:
 *
 *   - no resolve, accept, reject or decide route — **Q1**. A human decides every
 *     conflict, in V7's workspace
 *   - no route that applies a precedence recommendation — **Q5**
 *   - no confirm route for an AI-proposed merge — **Q3**; confirmation is V7
 *   - no clarification or question route — **Q7**
 *
 * A test asserts each of those returns 404, because "we did not build it" and "it
 * is not reachable" are different claims and only the second one holds.
 */

import { Controller, Get, HttpCode, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  reconcileSources,
  reconciliationView,
  type ReconciliationContext,
} from '../commands/reconciliation.ts';
import type { Actor } from '../commands.ts';
import { ActorGuard, CorrelationId, CurrentActor } from './actor.guard.ts';
import { CANONICALISER, CLOCK, ID_GENERATOR, RECONCILER, REPOSITORIES, UNIT_OF_WORK } from './tokens.ts';
import type {
  Canonicaliser,
  Clock,
  IdGenerator,
  Reconciler,
  Repositories,
  UnitOfWork,
} from '../ports.ts';
import { optionalString } from './request-parsing.ts';

@Controller('projects/:projectId')
@UseGuards(ActorGuard)
export class ReconciliationController {
  constructor(
    @Inject(REPOSITORIES) private readonly repos: Repositories,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CANONICALISER) private readonly canonicaliser: Canonicaliser,
    @Inject(RECONCILER) private readonly reconciler: Reconciler,
  ) {}

  private ctx(correlationId: string): ReconciliationContext {
    return {
      repos: this.repos,
      clock: this.clock,
      ids: this.ids,
      correlationId,
      uow: this.uow,
      canonicaliser: this.canonicaliser,
      reconciler: this.reconciler,
    };
  }

  /**
   * Canonicalise, compare, and record conflict **candidates**.
   *
   * **201 with a report, not an error, when candidates are rejected.** A rejection
   * is a normal outcome — a merge across kinds, a cross-slot pair, a model that
   * proposed a resolution — and the caller is told how many, why, and what was
   * proposed (**J9**).
   */
  @Post('reconcile')
  @HttpCode(201)
  async reconcile(
    @Param('projectId') projectId: string,
    @Query('setId') setId: unknown,
    @CurrentActor() actor: Actor,
    @CorrelationId() correlationId: string,
  ): Promise<unknown> {
    const requirementSetId = optionalString(setId, 'setId');
    return reconcileSources(this.ctx(correlationId), actor, {
      projectId,
      ...(requirementSetId === undefined ? {} : { requirementSetId }),
    });
  }

  /**
   * The reconciliation view — agreement and conflicts, **computed on read**.
   *
   * There is no route that writes agreement, because nothing stores it (**Q6**).
   */
  @Get('reconciliation')
  async view(
    @Param('projectId') projectId: string,
    @Query('setId') setId: unknown,
    @CurrentActor() actor: Actor,
    @CorrelationId() correlationId: string,
  ): Promise<unknown> {
    const requirementSetId = optionalString(setId, 'setId');
    return reconciliationView(this.ctx(correlationId), actor, {
      projectId,
      ...(requirementSetId === undefined ? {} : { requirementSetId }),
    });
  }
}
