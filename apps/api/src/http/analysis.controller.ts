/**
 * AI analysis endpoints (V4a).
 *
 * ADR-0034 N3: parse, delegate, map. No business logic.
 *
 * There is no endpoint that turns a profile into a requirement, a RAF item or
 * evidence, and that absence is the enforcement of **E3** — a profile is a
 * proposal, and the surface offers no way to promote one.
 */

import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  listAiInteractions,
  profileSource,
  type AnalysisContext,
} from '../commands/analysis.ts';
import type { Actor } from '../commands.ts';
import { ActorGuard, CorrelationId, CurrentActor } from './actor.guard.ts';
import { CLOCK, ID_GENERATOR, REPOSITORIES, SOURCE_PROFILER, UNIT_OF_WORK } from './tokens.ts';
import type { Clock, IdGenerator, Repositories, SourceProfiler, UnitOfWork } from '../ports.ts';
import { optionalString } from './request-parsing.ts';

@Controller('projects/:projectId')
@UseGuards(ActorGuard)
export class AnalysisController {
  constructor(
    @Inject(REPOSITORIES) private readonly repos: Repositories,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(SOURCE_PROFILER) private readonly profiler: SourceProfiler,
  ) {}

  private ctx(correlationId: string): AnalysisContext {
    return {
      repos: this.repos,
      clock: this.clock,
      ids: this.ids,
      correlationId,
      uow: this.uow,
      profiler: this.profiler,
    };
  }

  /**
   * Profile a source.
   *
   * **202 on a refusal, not an error.** A refusal is a legitimate outcome — the
   * egress gate forbade the call, no provider has the capability, or the source is
   * over the single-call context limit — and it carries named degradations and
   * options. Returning 4xx would tell the caller they made a bad request when they
   * did not.
   */
  @Post('sources/:sourceId/profile')
  @HttpCode(201)
  async profile(
    @Param('projectId') projectId: string,
    @Param('sourceId') sourceId: string,
    @CurrentActor() actor: Actor,
    @CorrelationId() correlationId: string,
  ): Promise<unknown> {
    return profileSource(this.ctx(correlationId), actor, { projectId, sourceId });
  }

  /**
   * The AI-disclosure log: every interaction, with what left and why.
   *
   * Read-only. There is no update route and no delete route, because an
   * interaction is history (invariant I8, ADR-0032).
   */
  @Get('ai-interactions')
  async interactions(
    @Param('projectId') projectId: string,
    @Query('sourceId') sourceId: unknown,
    @CurrentActor() actor: Actor,
    @CorrelationId() correlationId: string,
  ): Promise<unknown> {
    const forSource = optionalString(sourceId, 'sourceId');
    const interactions = await listAiInteractions(this.ctx(correlationId), actor, {
      projectId,
      ...(forSource === undefined ? {} : { sourceId: forSource }),
    });
    return { total: interactions.length, interactions };
  }
}
