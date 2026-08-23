/**
 * Requirement proposal endpoints (V5).
 *
 * ADR-0034 N3: parse, delegate, map. No business logic.
 *
 * **What this surface deliberately does not offer**, because absence is the
 * enforcement:
 *
 *   - no approve route, no review route, no status route — **J4**. Approval is a
 *     human act at G1 and belongs to V7's workspace
 *   - no edit route and no delete route — a proposal is insert-only
 *   - no conflict route and no clarification route — **J2** keeps conflicts in V6,
 *     and questions depend on them
 *   - no remediation queue for rejected proposals — the V4b posture, unchanged
 *
 * A test asserts each of those returns 404, because "we did not build it" and "it
 * is not reachable" are different claims and only the second one holds.
 */

import { Controller, Get, HttpCode, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  frameCoverage,
  listRequirements,
  populateFrame,
  type RequirementsContext,
} from '../commands/requirements.ts';
import type { Actor } from '../commands.ts';
import { ActorGuard, CorrelationId, CurrentActor } from './actor.guard.ts';
import {
  CLOCK,
  CONFIG,
  FRAME_POPULATOR,
  ID_GENERATOR,
  REPOSITORIES,
  UNIT_OF_WORK,
} from './tokens.ts';
import type { Clock, FramePopulator, IdGenerator, Repositories, UnitOfWork } from '../ports.ts';
import type { Config } from '../config.ts';
import { optionalString } from './request-parsing.ts';

@Controller('projects/:projectId')
@UseGuards(ActorGuard)
export class RequirementsController {
  constructor(
    @Inject(REPOSITORIES) private readonly repos: Repositories,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(FRAME_POPULATOR) private readonly populator: FramePopulator,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  private ctx(correlationId: string): RequirementsContext {
    return {
      repos: this.repos,
      clock: this.clock,
      ids: this.ids,
      correlationId,
      uow: this.uow,
      populator: this.populator,
      frameEvidencePerBatch: this.config.frameEvidencePerBatch,
    };
  }

  /**
   * Populate the frame from this project's verified evidence.
   *
   * **201 with a report, not an error, when proposals are rejected.** A rejection
   * is a normal outcome — a proposition citing nothing, a slot outside the pass, a
   * citation whose anchor has drifted — and the caller is told how many, why, and
   * what the text was (**J9**). Returning 4xx would say the request was bad when
   * it was not.
   */
  @Post('populate-frame')
  @HttpCode(201)
  async populate(
    @Param('projectId') projectId: string,
    @CurrentActor() actor: Actor,
    @CorrelationId() correlationId: string,
  ): Promise<unknown> {
    return populateFrame(this.ctx(correlationId), actor, { projectId });
  }

  /** Read the proposals in a set, each with the evidence it cites. */
  @Get('requirements')
  async list(
    @Param('projectId') projectId: string,
    @Query('setId') setId: unknown,
    @CurrentActor() actor: Actor,
    @CorrelationId() correlationId: string,
  ): Promise<unknown> {
    const requirementSetId = optionalString(setId, 'setId');
    return listRequirements(this.ctx(correlationId), actor, {
      projectId,
      ...(requirementSetId === undefined ? {} : { requirementSetId }),
    });
  }

  /**
   * Coverage over the frame — computed on read (**J3-b**).
   *
   * There is no route that writes coverage, because there is no coverage table.
   */
  @Get('frame-coverage')
  async coverage(
    @Param('projectId') projectId: string,
    @Query('setId') setId: unknown,
    @CurrentActor() actor: Actor,
    @CorrelationId() correlationId: string,
  ): Promise<unknown> {
    const requirementSetId = optionalString(setId, 'setId');
    return frameCoverage(this.ctx(correlationId), actor, {
      projectId,
      ...(requirementSetId === undefined ? {} : { requirementSetId }),
    });
  }
}
