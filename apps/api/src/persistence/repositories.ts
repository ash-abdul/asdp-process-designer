/**
 * SQL repository adapters.
 *
 * ADR-0035: plain parameterised SQL. Every parameter is passed in the array —
 * never interpolated — and the checker rule `sql-injection-guard` fails the build
 * if that discipline slips.
 *
 * Insert-only repositories (baseline, approval, audit) expose no update or delete
 * method, mirroring the SQL grants in migration 001 (invariant D8).
 */

import type {
  Approval,
  AuditEvent,
  Baseline,
  BaselineMember,
  Gate,
  GateCode,
  Project,
  Role,
  Stage,
  ValidationRun,
} from '@asdp/schemas';
import {
  ConcurrencyError,
  NotFoundError,
  type ApprovalRepository,
  type AuditRepository,
  type BaselineRepository,
  type GateRepository,
  type ProjectRepository,
  type Repositories,
  type ValidationRunRepository,
  type Versioned,
} from '../ports.ts';
import { UniqueViolationError, type Database, type Db } from './db.ts';
import { createSqlIntakeRepositories } from './intake-repositories.ts';
import { createSqlRequirementRepositories } from './requirement-repositories.ts';
import { createSqlReconciliationRepositories } from './reconciliation-repositories.ts';

// ---------------------------------------------------------------------------
// Row mapping. Hand-written, because ADR-0035 chose plain SQL over an ORM — so
// these mappers carry the type safety an ORM would have generated, and are
// covered by tests.
// ---------------------------------------------------------------------------

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function mapProject(r: Record<string, unknown>): Project {
  return {
    id: String(r.id),
    key: String(r.key),
    name: r.name_json as Project['name'],
    description: String(r.description ?? ''),
    settings: r.settings_json as Project['settings'],
    createdBy: String(r.created_by),
    createdAt: toIso(r.created_at),
  };
}

function mapGate(r: Record<string, unknown>): Gate {
  return {
    code: String(r.code) as GateCode,
    projectId: String(r.project_id),
    status: String(r.status) as Gate['status'],
    policy: r.policy_json as Gate['policy'],
    approvedBaselineHash:
      r.approved_baseline_hash === null || r.approved_baseline_hash === undefined
        ? undefined
        : String(r.approved_baseline_hash),
  };
}

function mapApproval(r: Record<string, unknown>): Approval {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    gate: String(r.gate_code) as GateCode,
    baselineId: String(r.baseline_id),
    signedBaselineHash: String(r.signed_baseline_hash),
    validationRunId: String(r.validation_run_id),
    approver: String(r.approver),
    roleAtApproval: String(r.role_at_approval) as Role,
    decision: String(r.decision) as Approval['decision'],
    comment: String(r.comment ?? ''),
    at: toIso(r.at),
  };
}

function mapAuditEvent(r: Record<string, unknown>): AuditEvent {
  return {
    id: String(r.id),
    at: toIso(r.at),
    projectId: r.project_id === null ? undefined : String(r.project_id),
    actor: String(r.actor),
    rolesAtTime: (r.roles_at_time as string[] | null ?? []) as Role[],
    tokenIssuer: r.token_issuer === null ? undefined : String(r.token_issuer),
    action: String(r.action),
    entityType: String(r.entity_type),
    entityId: r.entity_id === null ? undefined : String(r.entity_id),
    before: r.before_json ?? undefined,
    after: r.after_json ?? undefined,
    correlationId: r.correlation_id === null ? undefined : String(r.correlation_id),
    gateContext: (r.gate_context_json ?? undefined) as AuditEvent['gateContext'],
  };
}

// ---------------------------------------------------------------------------
// Repositories
// ---------------------------------------------------------------------------

class SqlProjectRepository implements ProjectRepository {
  constructor(private readonly db: Db) {}

  async create(project: Project): Promise<void> {
    try {
      await this.db.query(
        `insert into project (id, key, name_json, description, settings_json, created_by, created_at)
         values ($1, $2, $3::jsonb, $4, $5::jsonb, $6, $7)`,
        [
          project.id,
          project.key,
          JSON.stringify(project.name),
          project.description,
          JSON.stringify(project.settings),
          project.createdBy,
          project.createdAt,
        ],
      );
    } catch (err) {
      if (err instanceof UniqueViolationError) {
        throw new Error(`project id or key already exists: ${project.id} / ${project.key}`);
      }
      throw err;
    }
  }

  async get(id: string): Promise<Project | undefined> {
    const r = await this.db.query('select * from project where id = $1', [id]);
    const row = r.rows[0];
    return row === undefined ? undefined : mapProject(row);
  }

  async getByKey(key: string): Promise<Project | undefined> {
    const r = await this.db.query('select * from project where key = $1', [key]);
    const row = r.rows[0];
    return row === undefined ? undefined : mapProject(row);
  }

  async list(): Promise<readonly Project[]> {
    const r = await this.db.query('select * from project order by created_at, id');
    return r.rows.map(mapProject);
  }
}

class SqlGateRepository implements GateRepository {
  constructor(private readonly db: Db) {}

  async putAll(projectId: string, gates: readonly Gate[]): Promise<void> {
    for (const g of gates) {
      await this.db.query(
        `insert into gate (project_id, code, status, policy_json, approved_baseline_hash, version)
         values ($1, $2, $3, $4::jsonb, $5, 1)
         on conflict (project_id, code) do update
           set status = excluded.status,
               policy_json = excluded.policy_json,
               approved_baseline_hash = excluded.approved_baseline_hash,
               version = gate.version + 1`,
        [projectId, g.code, g.status, JSON.stringify(g.policy), g.approvedBaselineHash ?? null],
      );
    }
  }

  async get(projectId: string, code: GateCode): Promise<Versioned<Gate> | undefined> {
    const r = await this.db.query(
      'select * from gate where project_id = $1 and code = $2',
      [projectId, code],
    );
    const row = r.rows[0];
    if (row === undefined) return undefined;
    return { value: mapGate(row), version: Number(row.version) };
  }

  async list(projectId: string): Promise<readonly Gate[]> {
    const r = await this.db.query(
      'select * from gate where project_id = $1 order by code',
      [projectId],
    );
    return r.rows.map(mapGate);
  }

  /**
   * Optimistic update (ADR-0028 K12: multi-replica safe). The version predicate
   * is in the WHERE clause, so a concurrent writer loses rather than silently
   * clobbering.
   */
  async update(projectId: string, gate: Gate, expectedVersion: number): Promise<void> {
    const r = await this.db.query(
      `update gate
          set status = $3, policy_json = $4::jsonb, approved_baseline_hash = $5,
              version = version + 1
        where project_id = $1 and code = $2 and version = $6`,
      [
        projectId,
        gate.code,
        gate.status,
        JSON.stringify(gate.policy),
        gate.approvedBaselineHash ?? null,
        expectedVersion,
      ],
    );
    if (r.affectedRows === 0) {
      const current = await this.get(projectId, gate.code);
      if (current === undefined) throw new NotFoundError(`gate ${gate.code} not found`);
      throw new ConcurrencyError(
        `gate ${gate.code} was modified concurrently ` +
          `(expected v${expectedVersion}, found v${current.version})`,
      );
    }
  }
}

/** INSERT-ONLY (D8): no update or delete method exists. */
class SqlBaselineRepository implements BaselineRepository {
  constructor(private readonly db: Db) {}

  async insert(baseline: Baseline): Promise<void> {
    try {
      await this.db.query(
        `insert into baseline (id, project_id, stage, content_hash, frozen_at,
                               raf_version, rule_pack_version, camunda_target_profile_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          baseline.id,
          baseline.projectId,
          baseline.stage,
          baseline.contentHash,
          baseline.frozenAt,
          baseline.rafVersion,
          baseline.rulePackVersion,
          baseline.camundaTargetProfileId,
        ],
      );
    } catch (err) {
      if (err instanceof UniqueViolationError) {
        throw new Error(`baseline ${baseline.id} already exists; baselines are insert-only`);
      }
      throw err;
    }
    for (const m of baseline.members) {
      await this.db.query(
        `insert into baseline_member (baseline_id, artifact_id, version_id, content_hash)
         values ($1,$2,$3,$4)`,
        [baseline.id, m.artifactId, m.versionId, m.contentHash],
      );
    }
  }

  private async members(baselineId: string): Promise<BaselineMember[]> {
    const r = await this.db.query(
      'select artifact_id, version_id, content_hash from baseline_member where baseline_id = $1 order by artifact_id',
      [baselineId],
    );
    return r.rows.map((row) => ({
      artifactId: String(row.artifact_id),
      versionId: String(row.version_id),
      contentHash: String(row.content_hash),
    }));
  }

  private async hydrate(row: Record<string, unknown>): Promise<Baseline> {
    return {
      id: String(row.id),
      projectId: String(row.project_id),
      stage: String(row.stage) as Stage,
      contentHash: String(row.content_hash),
      frozenAt: toIso(row.frozen_at),
      members: await this.members(String(row.id)),
      rafVersion: String(row.raf_version),
      rulePackVersion: String(row.rule_pack_version),
      camundaTargetProfileId: String(row.camunda_target_profile_id),
    };
  }

  async get(id: string): Promise<Baseline | undefined> {
    const r = await this.db.query('select * from baseline where id = $1', [id]);
    const row = r.rows[0];
    return row === undefined ? undefined : this.hydrate(row);
  }

  async getByHash(projectId: string, contentHash: string): Promise<Baseline | undefined> {
    const r = await this.db.query(
      'select * from baseline where project_id = $1 and content_hash = $2',
      [projectId, contentHash],
    );
    const row = r.rows[0];
    return row === undefined ? undefined : this.hydrate(row);
  }

  async list(projectId: string): Promise<readonly Baseline[]> {
    const r = await this.db.query(
      'select * from baseline where project_id = $1 order by frozen_at, id',
      [projectId],
    );
    return Promise.all(r.rows.map((row) => this.hydrate(row)));
  }
}

/** INSERT-ONLY (D8). */
class SqlApprovalRepository implements ApprovalRepository {
  constructor(private readonly db: Db) {}

  async insert(approval: Approval): Promise<void> {
    try {
      await this.db.query(
        `insert into approval (id, project_id, gate_code, baseline_id, signed_baseline_hash,
                               validation_run_id, approver, role_at_approval, decision, comment, at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          approval.id, approval.projectId, approval.gate, approval.baselineId,
          approval.signedBaselineHash, approval.validationRunId, approval.approver,
          approval.roleAtApproval, approval.decision, approval.comment, approval.at,
        ],
      );
    } catch (err) {
      if (err instanceof UniqueViolationError) {
        throw new Error(`approval ${approval.id} already exists; approvals are insert-only`);
      }
      throw err;
    }
  }

  async listForGate(projectId: string, gate: GateCode): Promise<readonly Approval[]> {
    const r = await this.db.query(
      'select * from approval where project_id = $1 and gate_code = $2 order by at, id',
      [projectId, gate],
    );
    return r.rows.map(mapApproval);
  }
}

/**
 * INSERT-ONLY (D8). The second limb of the ADR-0017 signature.
 *
 * Findings travel with the run, so a signed run stays answerable forever: "what
 * did the validation this approval relied on actually say?" is a question the
 * audit asks years later, and a run that stored only a count could not answer it.
 */
class SqlValidationRunRepository implements ValidationRunRepository {
  constructor(private readonly db: Db) {}

  async insert(run: ValidationRun): Promise<void> {
    try {
      await this.db.query(
        `insert into validation_run (id, project_id, requirement_set_id, gate, baseline_hash,
                                     rule_pack_version, camunda_target_profile_id,
                                     standards_profile_id, started_at, finished_at, status,
                                     findings)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,
        [
          run.id, run.projectId, run.requirementSetId ?? null, run.gate ?? null,
          run.baselineHash ?? null, run.rulePackVersion, run.camundaTargetProfileId,
          run.standardsProfileId, run.startedAt, run.finishedAt ?? null, run.status,
          JSON.stringify(run.findings),
        ],
      );
    } catch (err) {
      if (err instanceof UniqueViolationError) {
        throw new Error(`validation run ${run.id} already exists; runs are insert-only`);
      }
      throw err;
    }
  }

  async get(id: string): Promise<ValidationRun | undefined> {
    const r = await this.db.query('select * from validation_run where id = $1', [id]);
    const row = r.rows[0];
    return row === undefined ? undefined : mapValidationRun(row);
  }

  async latestForSet(requirementSetId: string, gate: GateCode): Promise<ValidationRun | undefined> {
    const r = await this.db.query(
      `select * from validation_run
        where requirement_set_id = $1 and gate = $2
        order by started_at desc, id desc
        limit 1`,
      [requirementSetId, gate],
    );
    const row = r.rows[0];
    return row === undefined ? undefined : mapValidationRun(row);
  }
}

function mapValidationRun(row: Record<string, unknown>): ValidationRun {
  const finishedAt = row.finished_at;
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    ...(row.requirement_set_id === null || row.requirement_set_id === undefined
      ? {}
      : { requirementSetId: String(row.requirement_set_id) }),
    ...(row.gate === null || row.gate === undefined ? {} : { gate: row.gate as GateCode }),
    ...(row.baseline_hash === null || row.baseline_hash === undefined
      ? {}
      : { baselineHash: String(row.baseline_hash) }),
    rulePackVersion: String(row.rule_pack_version),
    camundaTargetProfileId: String(row.camunda_target_profile_id),
    standardsProfileId: String(row.standards_profile_id),
    startedAt: row.started_at instanceof Date ? row.started_at.toISOString() : String(row.started_at),
    ...(finishedAt === null || finishedAt === undefined
      ? {}
      : { finishedAt: finishedAt instanceof Date ? finishedAt.toISOString() : String(finishedAt) }),
    status: row.status as ValidationRun['status'],
    findings: (row.findings ?? []) as ValidationRun['findings'],
  };
}

/** APPEND-ONLY (ADR-0032): no update, no delete, no purge. */
class SqlAuditRepository implements AuditRepository {
  constructor(private readonly db: Db) {}

  async append(event: AuditEvent): Promise<void> {
    await this.db.query(
      `insert into audit_event (id, at, project_id, actor, roles_at_time, token_issuer,
                               action, entity_type, entity_id, before_json, after_json,
                               correlation_id, gate_context_json)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13::jsonb)`,
      [
        event.id, event.at, event.projectId ?? null, event.actor,
        [...event.rolesAtTime], event.tokenIssuer ?? null,
        event.action, event.entityType, event.entityId ?? null,
        event.before === undefined ? null : JSON.stringify(event.before),
        event.after === undefined ? null : JSON.stringify(event.after),
        event.correlationId ?? null,
        event.gateContext === undefined ? null : JSON.stringify(event.gateContext),
      ],
    );
  }

  async list(projectId?: string): Promise<readonly AuditEvent[]> {
    const r =
      projectId === undefined
        ? await this.db.query('select * from audit_event order by at, id')
        : await this.db.query(
            'select * from audit_event where project_id = $1 order by at, id',
            [projectId],
          );
    return r.rows.map(mapAuditEvent);
  }

  async count(): Promise<number> {
    const r = await this.db.query<{ n: string }>('select count(*)::int as n from audit_event');
    return Number(r.rows[0]?.n ?? 0);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Build the repository set over a database handle (a connection or a transaction). */
export function createSqlRepositories(db: Db): Repositories {
  return {
    projects: new SqlProjectRepository(db),
    gates: new SqlGateRepository(db),
    baselines: new SqlBaselineRepository(db),
    approvals: new SqlApprovalRepository(db),
    validationRuns: new SqlValidationRunRepository(db),
    audit: new SqlAuditRepository(db),
    // Intake repositories live in their own module but share this handle, so a
    // transaction spans governance and intake writes alike.
    ...createSqlIntakeRepositories(db),
    // Same handle again, so a population pass writes its interactions, its
    // proposals, its rejections and its audit event in ONE transaction.
    ...createSqlRequirementRepositories(db),
    // Same handle again, so canonicalisation, conflicts and their audit event
    // commit in ONE transaction with the interactions that produced them.
    ...createSqlReconciliationRepositories(db),
  };
}

/**
 * Run a unit of work transactionally with a repository set bound to the
 * transaction — so a baseline freeze, a gate update and an audit append commit or
 * roll back together.
 */
export async function withTransaction<T>(
  database: Database,
  fn: (repos: Repositories) => Promise<T>,
): Promise<T> {
  return database.transaction((tx) => fn(createSqlRepositories(tx)));
}
