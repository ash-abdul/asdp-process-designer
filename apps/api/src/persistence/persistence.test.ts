/**
 * Tests for the persistence layer.
 *
 * ADR-0035: PGlite is PostgreSQL 18.3, so these tests exercise real PostgreSQL
 * semantics — constraints, transactions, jsonb, arrays. The same SQL and the same
 * repository code will run against a container; that is the point.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import type { Approval, Baseline, Gate, Project } from '@asdp/schemas';
import { defaultGatePolicy } from '@asdp/domain';
import { createPgliteDatabase } from './pglite-database.ts';
import { migrate, appliedMigrations, MigrationDriftError } from './migrate.ts';
import { createSqlRepositories, withTransaction } from './repositories.ts';
import {
  CheckViolationError,
  ForeignKeyViolationError,
  UniqueViolationError,
  type Database,
} from './db.ts';
import { ConcurrencyError } from '../ports.ts';

let db: Database;

beforeEach(async () => {
  db = await createPgliteDatabase();
  await migrate(db);
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function project(over: Partial<Project> = {}): Project {
  return {
    id: 'prj-1',
    key: 'onboarding',
    // Arabic name, to prove Unicode round-trips through jsonb.
    name: { primary: { lang: 'ar', text: 'تسجيل العملاء', direction: 'rtl' }, translations: [] },
    description: '',
    settings: {
      standardsProfileId: 'standards-default',
      camundaTargetProfileId: 'camunda-8x-baseline',
      allowExternalProviders: true,
      classificationDefault: 'INTERNAL',
      classificationCeiling: 'RESTRICTED',
      strictness: 'strict',
      defaultRequirementLanguage: 'en',
      rafVersion: 'raf-1.1',
      rulePackVersion: 'rp-1.2',
    },
    createdBy: 'u-admin',
    createdAt: '2026-08-22T10:00:00.000Z',
    ...over,
  };
}

function baseline(over: Partial<Baseline> = {}): Baseline {
  return {
    id: 'bl-1',
    projectId: 'prj-1',
    stage: 'requirements',
    contentHash: 'a'.repeat(64),
    frozenAt: '2026-08-22T10:05:00.000Z',
    members: [
      { artifactId: 'art-a', versionId: 'v1', contentHash: 'b'.repeat(64) },
      { artifactId: 'art-b', versionId: 'v2', contentHash: 'c'.repeat(64) },
    ],
    rafVersion: 'raf-1.1',
    rulePackVersion: 'rp-1.2',
    camundaTargetProfileId: 'camunda-8x-baseline',
    ...over,
  };
}

function gates(): Gate[] {
  return (['G0', 'G1', 'G2', 'G3', 'G4'] as const).map((code) => ({
    code,
    projectId: 'prj-1',
    status: 'not_ready' as const,
    policy: defaultGatePolicy(code),
  }));
}

function approval(over: Partial<Approval> = {}): Approval {
  return {
    id: 'ap-1',
    projectId: 'prj-1',
    gate: 'G1',
    baselineId: 'bl-1',
    signedBaselineHash: 'a'.repeat(64),
    validationRunId: 'run-1',
    approver: 'u-owner',
    roleAtApproval: 'BusinessApprover',
    decision: 'approve',
    comment: '',
    at: '2026-08-22T10:10:00.000Z',
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Engine and migrations
// ---------------------------------------------------------------------------

describe('database engine (ADR-0035)', () => {
  test('is PostgreSQL, not a look-alike', async () => {
    const described = await db.describe();
    assert.equal(described.engine, 'pglite');
    assert.match(described.version, /^\d+\.\d+/, `version was ${described.version}`);
    assert.ok(Number(described.version.split('.')[0]) >= 16, 'a modern PostgreSQL major');
  });

  test('ping reports reachability for the readiness probe', async () => {
    assert.equal(await db.ping(), true);
  });
});

describe('migrations', () => {
  test('applying twice is idempotent', async () => {
    const second = await migrate(db);
    assert.equal(second.applied.length, 0);
    assert.ok(second.alreadyApplied.length >= 1);
  });

  test('applied migrations are recorded with a checksum', async () => {
    const applied = await appliedMigrations(db);
    assert.ok(applied.length >= 1);
    assert.match(applied[0]?.checksum ?? '', /^[0-9a-f]{64}$/);
    assert.match(applied[0]?.filename ?? '', /\.sql$/);
  });

  test('DRIFT is refused: an edited applied migration fails rather than diverging', async () => {
    // Simulate an edit by recording a different checksum for the same filename.
    const applied = await appliedMigrations(db);
    const filename = applied[0]?.filename as string;
    await db.query('update schema_migration set checksum = $1 where filename = $2', [
      'f'.repeat(64),
      filename,
    ]);
    await assert.rejects(() => migrate(db), MigrationDriftError);
  });
});

// ---------------------------------------------------------------------------
// Constraints are real
// ---------------------------------------------------------------------------

describe('SQL constraints enforce the domain (invariant D8)', () => {
  test('a malformed project key is rejected by a CHECK constraint', async () => {
    const repos = createSqlRepositories(db);
    await assert.rejects(
      () => repos.projects.create(project({ key: 'AB' })),
      CheckViolationError,
    );
  });

  test('a non-hex content hash is rejected by a CHECK constraint', async () => {
    const repos = createSqlRepositories(db);
    await repos.projects.create(project());
    await assert.rejects(
      () => repos.baselines.insert(baseline({ contentHash: 'not-a-hash'.padEnd(64, 'x') })),
      CheckViolationError,
    );
  });

  test('a baseline referencing an unknown project is rejected by a FOREIGN KEY', async () => {
    const repos = createSqlRepositories(db);
    await assert.rejects(
      () => repos.baselines.insert(baseline({ projectId: 'prj-missing' })),
      ForeignKeyViolationError,
    );
  });

  test('an invalid gate status is rejected by a CHECK constraint', async () => {
    const repos = createSqlRepositories(db);
    await repos.projects.create(project());
    await assert.rejects(
      () =>
        repos.gates.putAll('prj-1', [
          { code: 'G1', projectId: 'prj-1', status: 'nonsense' as Gate['status'], policy: defaultGatePolicy('G1') },
        ]),
      CheckViolationError,
    );
  });

  test('INSERT-ONLY: re-inserting a baseline id is refused', async () => {
    const repos = createSqlRepositories(db);
    await repos.projects.create(project());
    await repos.baselines.insert(baseline());
    await assert.rejects(() => repos.baselines.insert(baseline()), /insert-only/);
  });

  test('INSERT-ONLY: re-inserting an approval id is refused', async () => {
    const repos = createSqlRepositories(db);
    await repos.projects.create(project());
    await repos.baselines.insert(baseline());
    await repos.approvals.insert(approval());
    await assert.rejects(() => repos.approvals.insert(approval()), /insert-only/);
  });

  test('a duplicate project key is refused', async () => {
    const repos = createSqlRepositories(db);
    await repos.projects.create(project());
    await assert.rejects(
      () => repos.projects.create(project({ id: 'prj-2' })),
      /already exists/,
    );
  });
});

// ---------------------------------------------------------------------------
// Round-trips
// ---------------------------------------------------------------------------

describe('round-trips', () => {
  test('a project round-trips, including Arabic text through jsonb', async () => {
    const repos = createSqlRepositories(db);
    const original = project();
    await repos.projects.create(original);

    const back = await repos.projects.get('prj-1');
    assert.equal(back?.key, 'onboarding');
    assert.equal(back?.name.primary.text, 'تسجيل العملاء', 'Arabic survives jsonb byte-exact');
    assert.equal(back?.name.primary.direction, 'rtl');
    assert.equal(back?.settings.rafVersion, 'raf-1.1');
    assert.equal(back?.createdAt, original.createdAt);
  });

  test('lookup by key works', async () => {
    const repos = createSqlRepositories(db);
    await repos.projects.create(project());
    assert.equal((await repos.projects.getByKey('onboarding'))?.id, 'prj-1');
    assert.equal(await repos.projects.getByKey('absent'), undefined);
  });

  test('a baseline round-trips with its members in stable order', async () => {
    const repos = createSqlRepositories(db);
    await repos.projects.create(project());
    await repos.baselines.insert(baseline());

    const back = await repos.baselines.get('bl-1');
    assert.equal(back?.contentHash, 'a'.repeat(64));
    assert.equal(back?.members.length, 2);
    assert.deepEqual(back?.members.map((m) => m.artifactId), ['art-a', 'art-b']);
    assert.equal(back?.rulePackVersion, 'rp-1.2');
  });

  test('a baseline can be found by content hash', async () => {
    const repos = createSqlRepositories(db);
    await repos.projects.create(project());
    await repos.baselines.insert(baseline());
    const found = await repos.baselines.getByHash('prj-1', 'a'.repeat(64));
    assert.equal(found?.id, 'bl-1');
  });

  test('audit events round-trip with roles array and jsonb payloads', async () => {
    const repos = createSqlRepositories(db);
    await repos.projects.create(project());
    await repos.audit.append({
      id: 'aud-1',
      at: '2026-08-22T10:00:00.000Z',
      projectId: 'prj-1',
      actor: 'u-admin',
      rolesAtTime: ['PlatformAdmin', 'ProcessArchitect'],
      tokenIssuer: 'header-mode',
      action: 'project.created',
      entityType: 'Project',
      entityId: 'prj-1',
      after: { key: 'onboarding', nested: { arabic: 'التحقق' } },
      correlationId: 'corr-1',
      gateContext: { gate: 'G1' },
    });

    const events = await repos.audit.list('prj-1');
    assert.equal(events.length, 1);
    const e = events[0];
    assert.deepEqual(e?.rolesAtTime, ['PlatformAdmin', 'ProcessArchitect'], 'text[] round-trips');
    assert.equal((e?.after as { nested: { arabic: string } }).nested.arabic, 'التحقق');
    assert.equal(e?.gateContext?.gate, 'G1');
    assert.equal(await repos.audit.count(), 1);
  });

  test('approvals are listed per gate in time order', async () => {
    const repos = createSqlRepositories(db);
    await repos.projects.create(project());
    await repos.baselines.insert(baseline());
    await repos.approvals.insert(approval({ id: 'ap-2', at: '2026-08-22T11:00:00.000Z' }));
    await repos.approvals.insert(approval({ id: 'ap-1', at: '2026-08-22T10:00:00.000Z' }));

    const list = await repos.approvals.listForGate('prj-1', 'G1');
    assert.deepEqual(list.map((a) => a.id), ['ap-1', 'ap-2']);
    assert.equal(list.length, 2);
    assert.equal((await repos.approvals.listForGate('prj-1', 'G2')).length, 0);
  });
});

// ---------------------------------------------------------------------------
// Optimistic concurrency
// ---------------------------------------------------------------------------

describe('optimistic concurrency (ADR-0028 K12)', () => {
  test('a gate update at the expected version succeeds and bumps the version', async () => {
    const repos = createSqlRepositories(db);
    await repos.projects.create(project());
    await repos.gates.putAll('prj-1', gates());

    const held = await repos.gates.get('prj-1', 'G1');
    assert.ok(held !== undefined);
    await repos.gates.update('prj-1', { ...held.value, status: 'ready' }, held.version);

    const after = await repos.gates.get('prj-1', 'G1');
    assert.equal(after?.value.status, 'ready');
    assert.equal(after?.version, held.version + 1);
  });

  test('A STALE VERSION LOSES: a concurrent writer cannot clobber silently', async () => {
    const repos = createSqlRepositories(db);
    await repos.projects.create(project());
    await repos.gates.putAll('prj-1', gates());

    const first = await repos.gates.get('prj-1', 'G1');
    assert.ok(first !== undefined);
    // Two readers hold the same version; the first write wins.
    await repos.gates.update('prj-1', { ...first.value, status: 'ready' }, first.version);
    await assert.rejects(
      () => repos.gates.update('prj-1', { ...first.value, status: 'approved' }, first.version),
      ConcurrencyError,
    );

    const final = await repos.gates.get('prj-1', 'G1');
    assert.equal(final?.value.status, 'ready', 'the losing write did not land');
  });
});

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

describe('transactions (gate transitions must be atomic)', () => {
  test('a failure rolls back every write in the unit of work', async () => {
    const repos = createSqlRepositories(db);
    await repos.projects.create(project());

    await assert.rejects(() =>
      withTransaction(db, async (tx) => {
        await tx.baselines.insert(baseline());
        await tx.audit.append({
          id: 'aud-tx', at: '2026-08-22T10:00:00.000Z', projectId: 'prj-1',
          actor: 'u', rolesAtTime: [], action: 'baseline.frozen', entityType: 'Baseline',
        });
        throw new Error('deliberate failure after two writes');
      }),
    );

    assert.equal(await repos.baselines.get('bl-1'), undefined, 'baseline rolled back');
    assert.equal(await repos.audit.count(), 0, 'audit rolled back');
  });

  test('a successful unit of work commits everything together', async () => {
    const repos = createSqlRepositories(db);
    await repos.projects.create(project());

    await withTransaction(db, async (tx) => {
      await tx.baselines.insert(baseline());
      await tx.audit.append({
        id: 'aud-tx', at: '2026-08-22T10:00:00.000Z', projectId: 'prj-1',
        actor: 'u', rolesAtTime: ['BusinessAnalyst'], action: 'baseline.frozen',
        entityType: 'Baseline', entityId: 'bl-1',
      });
    });

    assert.ok((await repos.baselines.get('bl-1')) !== undefined);
    assert.equal(await repos.audit.count(), 1);
  });
});

// ---------------------------------------------------------------------------
// Portability
// ---------------------------------------------------------------------------

describe('PostgreSQL portability (ADR-0035)', () => {
  test('the repositories expose no update or delete on insert-only stores', () => {
    const repos = createSqlRepositories(db);
    for (const repo of [repos.baselines, repos.approvals, repos.audit]) {
      const r = repo as unknown as Record<string, unknown>;
      for (const forbidden of ['update', 'delete', 'remove', 'purge', 'clear']) {
        assert.equal(r[forbidden], undefined, `must not expose '${forbidden}'`);
      }
    }
  });

  test('NO DATABASE COLLATION IS RELIED UPON (ADR-0023, S7 finding)', async () => {
    // Spike S7 found ICU collation is accepted in DDL but inert in PGlite. The
    // migrations therefore declare no collation, and bilingual ordering is the
    // application's job via @asdp/text match forms. This asserts the absence.
    const r = await db.query<{ n: number }>(
      `select count(*)::int as n from information_schema.columns
        where table_schema = 'public' and collation_name is not null`,
    );
    assert.equal(Number(r.rows[0]?.n ?? 0), 0, 'no column declares a collation');
  });
});
