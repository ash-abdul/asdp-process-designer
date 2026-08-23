/**
 * The source viewer.
 *
 * ADR-0015: read-only. Every endpoint here returns stored content and
 * server-computed highlight ranges; none of them mutates anything, and there is
 * no write path to add.
 *
 * Separated from `SourcesController` because viewing and intake are different
 * concerns with different consumers — and because the `controller-thinness` rule
 * fired when they shared a file, which is the rule doing its job.
 *
 * provenance-and-anchoring.md §6: highlights are computed HERE, from the stored
 * anchor and the stored text. The client never re-searches rendered text to find
 * a highlight; doing so would reintroduce every normalisation and direction bug
 * the pipeline exists to eliminate.
 */

import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { readHighlights, readSourceForViewer, type IntakeContext } from '../commands/intake.ts';
import { ActorGuard, CorrelationId } from './actor.guard.ts';
import {
  BLOB_STORE,
  CLOCK,
  CONFIG,
  EXTRACTORS,
  VISION_EXTRACTOR,
  ID_GENERATOR,
  REPOSITORIES,
  UNIT_OF_WORK,
} from './tokens.ts';
import type { BlobStore, Clock, IdGenerator, Repositories, UnitOfWork } from '../ports.ts';
import type { Config } from '../config.ts';
import type { TextExtractor, VisionExtractor } from '@asdp/ingestion';
import { maybe, parseOffset } from './request-parsing.ts';

@Controller('projects/:projectId/sources/:sourceId')
@UseGuards(ActorGuard)
export class SourceViewerController {
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

  private ctx(correlationId: string): IntakeContext {
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

  /** Source text plus units — what the viewer renders. */
  @Get('content')
  async content(
    @Param('projectId') projectId: string,
    @Param('sourceId') sourceId: string,
    @CorrelationId() correlationId: string,
  ): Promise<unknown> {
    return readSourceForViewer(this.ctx(correlationId), projectId, sourceId);
  }

  @Get('units')
  async units(
    @Param('projectId') projectId: string,
    @Param('sourceId') sourceId: string,
    @CorrelationId() correlationId: string,
  ): Promise<unknown> {
    const { units } = await readSourceForViewer(this.ctx(correlationId), projectId, sourceId);
    return { total: units.length, units };
  }

  /**
   * Highlight ranges.
   *
   * Selectors, in precedence order: `evidenceId`, `unitId`, then an explicit
   * `start`/`end` pair. With no selector every unit is returned, so the viewer
   * paints a whole document in one request.
   *
   * A range whose anchor does not resolve comes back with `resolution: 'broken'`
   * and no segments. The viewer is told, rather than shown a confident highlight
   * over the wrong text.
   */
  @Get('highlights')
  async highlights(
    @Param('projectId') projectId: string,
    @Param('sourceId') sourceId: string,
    @Query('unitId') unitId: string | undefined,
    @Query('evidenceId') evidenceId: string | undefined,
    @Query('start') start: string | undefined,
    @Query('end') end: string | undefined,
    @CorrelationId() correlationId: string,
  ): Promise<unknown> {
    const parsedStart = parseOffset(start, 'start');
    const parsedEnd = parseOffset(end, 'end');
    if ((parsedStart === undefined) !== (parsedEnd === undefined)) {
      throw new BadRequestException("'start' and 'end' must be supplied together");
    }

    const ranges = await readHighlights(this.ctx(correlationId), {
      projectId,
      sourceId,
      ...maybe('unitId', unitId),
      ...maybe('evidenceId', evidenceId),
      ...maybe('charStart', parsedStart),
      ...maybe('charEnd', parsedEnd),
    });
    return { total: ranges.length, ranges };
  }
}
