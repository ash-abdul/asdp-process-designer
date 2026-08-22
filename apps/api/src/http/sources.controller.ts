/**
 * Sources: intake, inventory, authority ranking, and the source viewer.
 *
 * ADR-0034 N3: this controller parses the request, delegates to a command, and
 * maps the result. It holds no business logic, and it may not import
 * @asdp/domain — the architecture checker fails the build if it does.
 *
 * ADR-0015: every read here is read-only. There is no endpoint that edits stored
 * source text, and there is none to add: a corrected document is a new source
 * that supersedes the old one, so old anchors stay valid against the old bytes.
 */

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { Classification, SourceKind } from '@asdp/schemas';
import {
  ingestSource,
  readSourceForViewer,
  setSourceAuthorityRank,
  type IntakeContext,
} from '../commands/intake.ts';
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
} from './tokens.ts';
import type { BlobStore, Clock, IdGenerator, Repositories, UnitOfWork } from '../ports.ts';
import type { Config } from '../config.ts';
import type { TextExtractor } from '@asdp/ingestion';
import { decodeContent, maybe, optionalInteger, optionalString, requiredString } from './request-parsing.ts';

interface IngestBody {
  filename?: unknown;
  /** UTF-8 text. Mutually exclusive with `contentBase64`. */
  text?: unknown;
  /** Base64-encoded bytes, for content that is not a convenient JSON string. */
  contentBase64?: unknown;
  declaredMimeType?: unknown;
  classification?: unknown;
  kind?: unknown;
  authorityRank?: unknown;
  effectiveDate?: unknown;
  supersedesSourceId?: unknown;
}

interface AuthorityBody {
  authorityRank?: unknown;
  justification?: unknown;
}

@Controller('projects/:projectId/sources')
@UseGuards(ActorGuard)
export class SourcesController {
  constructor(
    @Inject(REPOSITORIES) private readonly repos: Repositories,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(BLOB_STORE) private readonly blobs: BlobStore,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CONFIG) private readonly config: Config,
    @Inject(EXTRACTORS) private readonly extractors: readonly TextExtractor[],
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
    };
  }

  @Post()
  @HttpCode(201)
  async ingest(
    @Param('projectId') projectId: string,
    @Body() body: IngestBody,
    @CurrentActor() actor: Actor,
    @CorrelationId() correlationId: string,
  ): Promise<unknown> {
    const result = await ingestSource(this.ctx(correlationId), actor, {
      projectId,
      filename: requiredString(body.filename, 'filename'),
      data: decodeContent(body),
      ...maybe('declaredMimeType', optionalString(body.declaredMimeType, 'declaredMimeType')),
      ...maybe('classification', optionalString(body.classification, 'classification') as Classification | undefined),
      ...maybe('kind', optionalString(body.kind, 'kind') as SourceKind | undefined),
      ...maybe('authorityRank', optionalInteger(body.authorityRank, 'authorityRank')),
      ...maybe('effectiveDate', optionalString(body.effectiveDate, 'effectiveDate')),
      ...maybe('supersedesSourceId', optionalString(body.supersedesSourceId, 'supersedesSourceId')),
    });

    return {
      source: result.source,
      unitCount: result.units.length,
      deduplicated: result.deduplicated,
    };
  }

  /**
   * The source inventory.
   *
   * Ordered by authority rank descending — the order a reviewer resolving a
   * conflict needs. `unranked` is surfaced explicitly because rank 0 means "not
   * yet ranked", which is a different fact from "ranked lowest" and weakens
   * conflict precedence until someone decides.
   */
  @Get()
  async inventory(@Param('projectId') projectId: string): Promise<unknown> {
    const sources = await this.repos.sources.list(projectId);
    return {
      total: sources.length,
      unranked: sources.filter((s) => s.authorityRank === 0).length,
      parseFailed: sources.filter((s) => s.status === 'parse_failed').length,
      sources,
    };
  }

  @Get(':sourceId')
  async get(
    @Param('projectId') projectId: string,
    @Param('sourceId') sourceId: string,
    @CorrelationId() correlationId: string,
  ): Promise<unknown> {
    const { source, units } = await readSourceForViewer(this.ctx(correlationId), projectId, sourceId);
    return { source, unitCount: units.length };
  }

  @Put(':sourceId/authority')
  @HttpCode(200)
  async authority(
    @Param('projectId') projectId: string,
    @Param('sourceId') sourceId: string,
    @Body() body: AuthorityBody,
    @CurrentActor() actor: Actor,
    @CorrelationId() correlationId: string,
  ): Promise<unknown> {
    const rank = optionalInteger(body.authorityRank, 'authorityRank');
    if (rank === undefined) throw new BadRequestException("'authorityRank' is required");

    return setSourceAuthorityRank(this.ctx(correlationId), actor, {
      projectId,
      sourceId,
      authorityRank: rank,
      ...maybe('justification', optionalString(body.justification, 'justification')),
    });
  }
}
