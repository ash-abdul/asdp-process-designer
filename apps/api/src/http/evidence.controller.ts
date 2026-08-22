/**
 * Evidence and intake validation.
 *
 * ADR-0034 N3: parse, delegate, map. No business logic.
 *
 * There is no update endpoint and no delete endpoint, and that is not an
 * omission: an EvidenceItem is immutable and is only ever re-extracted
 * (invariants D1, D8). The absence is the enforcement.
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
  UseGuards,
} from '@nestjs/common';
import type { Classification } from '@asdp/schemas';
import { allRules } from '@asdp/validation';
import { recordEvidence, validateIntake, type IntakeContext } from '../commands/intake.ts';
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
import { maybe, optionalInteger, optionalString, requiredString } from './request-parsing.ts';

interface RecordEvidenceBody {
  sourceId?: unknown;
  sourceUnitId?: unknown;
  charStart?: unknown;
  charEnd?: unknown;
  rafSlotHint?: unknown;
  classification?: unknown;
}

@Controller('projects/:projectId')
@UseGuards(ActorGuard)
export class EvidenceController {
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

  @Post('evidence')
  @HttpCode(201)
  async record(
    @Param('projectId') projectId: string,
    @Body() body: RecordEvidenceBody,
    @CurrentActor() actor: Actor,
    @CorrelationId() correlationId: string,
  ): Promise<unknown> {
    return recordEvidence(this.ctx(correlationId), actor, {
      projectId,
      sourceId: requiredString(body.sourceId, 'sourceId'),
      ...maybe('sourceUnitId', optionalString(body.sourceUnitId, 'sourceUnitId')),
      ...maybe('charStart', optionalInteger(body.charStart, 'charStart')),
      ...maybe('charEnd', optionalInteger(body.charEnd, 'charEnd')),
      ...maybe('rafSlotHint', optionalString(body.rafSlotHint, 'rafSlotHint')),
      ...maybe(
        'classification',
        optionalString(body.classification, 'classification') as Classification | undefined,
      ),
    });
  }

  @Get('evidence')
  async list(@Param('projectId') projectId: string): Promise<unknown> {
    const items = await this.repos.evidence.listForProject(projectId);
    return { total: items.length, evidence: items };
  }

  @Get('evidence/:evidenceId')
  async get(
    @Param('projectId') projectId: string,
    @Param('evidenceId') evidenceId: string,
  ): Promise<unknown> {
    const item = await this.repos.evidence.get(evidenceId);
    if (item === undefined || item.projectId !== projectId) {
      throw new BadRequestException(`unknown evidence ${evidenceId}`);
    }
    return item;
  }

  /**
   * Run the L0 ingestion rule pack.
   *
   * `summary.blocking` is the list a G1 evaluation consumes (invariant I6): the
   * gate is closed by named findings, never by a count, so the reason is always
   * reportable.
   */
  @Post('intake/validate')
  @HttpCode(200)
  async validate(
    @Param('projectId') projectId: string,
    @CurrentActor() actor: Actor,
    @CorrelationId() correlationId: string,
  ): Promise<unknown> {
    return validateIntake(this.ctx(correlationId), actor, projectId);
  }

  /** The rule catalogue this build implements, for the UI and for review. */
  @Get('intake/rules')
  async rules(): Promise<unknown> {
    const rules = allRules();
    return { total: rules.length, rules };
  }
}
