/**
 * Projects, baselines and gates.
 *
 * ADR-0034 N3: this controller parses the request, delegates to a command, and
 * maps the result. It holds NO business logic, and it may not import
 * @asdp/domain — the architecture checker fails the build if it does.
 *
 * RBAC, gate guards, audit and transactions all live in the command layer, which
 * is where they already were before NestJS (ADR-0034 N4).
 */

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { BaselineMember, GateCode, Stage } from '@asdp/schemas';
import {
  approveProjectGate,
  assertStageEnterable,
  createProject,
  evaluateProjectGate,
  freezeProjectBaseline,
  GateGuardError,
  type CommandContext,
} from '../commands.ts';
import type { Actor } from '../commands.ts';
import { ActorGuard, CorrelationId, CurrentActor } from './actor.guard.ts';
import { CLOCK, ID_GENERATOR, REPOSITORIES } from './tokens.ts';
import type { Clock, IdGenerator, Repositories } from '../ports.ts';

interface CreateProjectBody {
  key?: unknown;
  name?: unknown;
  description?: unknown;
  settings?: unknown;
}
interface FreezeBaselineBody {
  stage?: unknown;
  members?: unknown;
}
interface GateBody {
  baselineId?: unknown;
  validationRunId?: unknown;
  blockingFindingIds?: unknown;
  comment?: unknown;
  contentAuthors?: unknown;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new BadRequestException(`'${field}' is required and must be a non-empty string`);
  }
  return value;
}

@Controller('projects')
@UseGuards(ActorGuard)
export class ProjectsController {
  constructor(
    @Inject(REPOSITORIES) private readonly repos: Repositories,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  private ctx(correlationId: string): CommandContext {
    return { repos: this.repos, clock: this.clock, ids: this.ids, correlationId };
  }

  @Post()
  @HttpCode(201)
  async create(
    @Body() body: CreateProjectBody,
    @CurrentActor() actor: Actor,
    @CorrelationId() correlationId: string,
  ): Promise<unknown> {
    return createProject(this.ctx(correlationId), actor, {
      key: requireString(body.key, 'key'),
      name: requireString(body.name, 'name'),
      description: typeof body.description === 'string' ? body.description : undefined,
      settings: (body.settings ?? undefined) as never,
    });
  }

  @Get()
  async list(): Promise<unknown> {
    return this.repos.projects.list();
  }

  @Get(':projectId')
  async get(@Param('projectId') projectId: string): Promise<unknown> {
    const project = await this.repos.projects.get(projectId);
    if (project === undefined) throw new NotFoundException('project not found');
    return project;
  }

  @Get(':projectId/gates')
  async gates(@Param('projectId') projectId: string): Promise<unknown> {
    return this.repos.gates.list(projectId);
  }

  @Get(':projectId/audit')
  async audit(@Param('projectId') projectId: string): Promise<unknown> {
    return this.repos.audit.list(projectId);
  }

  @Post(':projectId/baselines')
  @HttpCode(201)
  async freeze(
    @Param('projectId') projectId: string,
    @Body() body: FreezeBaselineBody,
    @CurrentActor() actor: Actor,
    @CorrelationId() correlationId: string,
  ): Promise<unknown> {
    return freezeProjectBaseline(this.ctx(correlationId), actor, {
      projectId,
      stage: requireString(body.stage, 'stage') as Stage,
      members: (Array.isArray(body.members) ? body.members : []) as BaselineMember[],
    });
  }

  @Get(':projectId/baselines')
  async baselines(@Param('projectId') projectId: string): Promise<unknown> {
    return this.repos.baselines.list(projectId);
  }

  // NestJS defaults POST to 201. These are state transitions on an existing
  // resource, not creations, so the Phase 1 contract of 200 is preserved
  // explicitly — the HTTP contract must not change because the framework did.
  @Post(':projectId/gates/:gate/evaluate')
  @HttpCode(200)
  async evaluate(
    @Param('projectId') projectId: string,
    @Param('gate') gate: string,
    @Body() body: GateBody,
    @CurrentActor() actor: Actor,
    @CorrelationId() correlationId: string,
  ): Promise<unknown> {
    return evaluateProjectGate(this.ctx(correlationId), actor, {
      projectId,
      gate: gate as GateCode,
      baselineId: requireString(body.baselineId, 'baselineId'),
      validationRunId: requireString(body.validationRunId, 'validationRunId'),
      blockingFindingIds: Array.isArray(body.blockingFindingIds)
        ? (body.blockingFindingIds as string[])
        : [],
    });
  }

  @Post(':projectId/gates/:gate/approve')
  @HttpCode(200)
  async approve(
    @Param('projectId') projectId: string,
    @Param('gate') gate: string,
    @Body() body: GateBody,
    @CurrentActor() actor: Actor,
    @CorrelationId() correlationId: string,
  ): Promise<unknown> {
    return approveProjectGate(this.ctx(correlationId), actor, {
      projectId,
      gate: gate as GateCode,
      baselineId: requireString(body.baselineId, 'baselineId'),
      validationRunId: requireString(body.validationRunId, 'validationRunId'),
      comment: typeof body.comment === 'string' ? body.comment : undefined,
      contentAuthors: Array.isArray(body.contentAuthors) ? (body.contentAuthors as string[]) : [],
    });
  }

  /** Read-lock probe: may this stage be entered? */
  @Get(':projectId/stages/:stage/enterable')
  async enterable(
    @Param('projectId') projectId: string,
    @Param('stage') stage: string,
    @CorrelationId() correlationId: string,
  ): Promise<unknown> {
    try {
      await assertStageEnterable(this.ctx(correlationId), projectId, stage as Stage);
      return { stage, enterable: true };
    } catch (err) {
      if (err instanceof GateGuardError) {
        return { stage, enterable: false, reason: err.message };
      }
      throw err;
    }
  }
}
