/**
 * Tests for @asdp/api — the governance spine end to end.
 *
 * Phase 1 acceptance criteria 1, 4, 7 and Phase 0 exit criterion 2:
 * "a project can be created, a gate opened, a baseline hashed, an approval
 * signed and invalidated by a content change, with every action audited."
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import type { BaselineMember } from '@asdp/schemas';
import { loadConfig, ConfigError } from './config.ts';
import { listen, type RunningApp } from './http/bootstrap.ts';
import { DomainErrorFilter } from './http/domain-error.filter.ts';
import { AnchorVerificationError } from './commands/intake.ts';
import { createPgliteDatabase } from './persistence/pglite-database.ts';
import { migrate } from './persistence/migrate.ts';
import { createFilesystemBlobStore } from './blob/filesystem-blob-store.ts';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  COMMANDS,
  approveProjectGate,
  assertRole,
  assertStageEnterable,
  createProject,
  evaluateProjectGate,
  freezeProjectBaseline,
  reconcileGates,
  AuthorizationError,
  GateGuardError,
  ValidationError,
  type Actor,
  type CommandContext,
} from './commands.ts';
import {
  counterIdGenerator,
  createMemoryRepositories,
  memoryDependencyProbe,
  systemClock,
} from './repo-memory.ts';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function context(): CommandContext {
  return {
    repos: createMemoryRepositories(),
    clock: systemClock(),
    ids: counterIdGenerator(),
    correlationId: 'test-correlation',
  };
}

const admin: Actor = { subject: 'u-admin', roles: ['PlatformAdmin'], kind: 'human' };
const architect: Actor = { subject: 'u-architect', roles: ['ProcessArchitect'], kind: 'human' };
const analyst: Actor = { subject: 'u-analyst', roles: ['BusinessAnalyst'], kind: 'human' };
const businessApprover: Actor = { subject: 'u-owner', roles: ['BusinessApprover'], kind: 'human' };
const viewer: Actor = { subject: 'u-viewer', roles: ['Viewer'], kind: 'human' };

const MEMBERS: BaselineMember[] = [
  { artifactId: 'art-requirements', versionId: 'v1', contentHash: 'a'.repeat(64) },
];
const CHANGED_MEMBERS: BaselineMember[] = [
  { artifactId: 'art-requirements', versionId: 'v2', contentHash: 'b'.repeat(64) },
];

// ---------------------------------------------------------------------------
// Command registry — invariant I3
// ---------------------------------------------------------------------------

describe('command registry (invariant I3 / ADR-0002)', () => {
  test('NO COMMAND MUTATES A GENERATED ARTIFACT', () => {
    assert.ok(COMMANDS.length > 0, 'the registry must not be empty');
    for (const c of COMMANDS) {
      assert.equal(c.mutatesArtifact, false, `${c.name} must never mutate an artifact`);
    }
  });

  test('every command declares at least one required role', () => {
    for (const c of COMMANDS) {
      assert.ok(c.requiredRoles.length > 0, `${c.name} needs required roles`);
    }
  });

  test('an unauthorised role is rejected at the command layer', () => {
    assert.throws(() => assertRole(viewer, 'createProject'), AuthorizationError);
    assert.doesNotThrow(() => assertRole(admin, 'createProject'));
  });

  test('an unknown command is an error, not a silent pass', () => {
    assert.throws(() => assertRole(admin, 'deleteEverything'), /unknown command/);
  });
});

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

describe('configuration (ADR-0028 K3)', () => {
  test('defaults are usable with a blob root supplied', () => {
    const c = loadConfig({ ASDP_BLOB_ROOT: '/tmp/asdp-blobs' });
    assert.equal(c.port, 3000);
    assert.equal(c.repository, 'pglite', 'ADR-0035: pglite is the development default');
    assert.equal(c.blobStore, 'filesystem');
    assert.equal(c.replicaCount, 1);
    assert.equal(c.rafVersion, 'raf-1.1');
    assert.equal(c.rulePackVersion, 'rp-1.2');
  });

  test('fails fast on a missing required value', () => {
    assert.throws(
      () => loadConfig({ ASDP_REPOSITORY: 'postgres', ASDP_BLOB_ROOT: '/tmp/x' }),
      /ASDP_DATABASE_URL is required/,
    );
    assert.throws(
      () => loadConfig({ ASDP_AUTH_MODE: 'oidc', ASDP_BLOB_ROOT: '/tmp/x' }),
      /ASDP_OIDC_ISSUER_URL is required/,
    );
    assert.throws(() => loadConfig({}), /ASDP_BLOB_ROOT is required/);
    assert.throws(
      () => loadConfig({ ASDP_BLOB_STORE: 's3' }),
      /ASDP_OBJECT_STORE_ENDPOINT is required/,
    );
  });

  test('A6 GUARD: a filesystem blob store is refused behind multiple replicas', () => {
    assert.throws(
      () => loadConfig({ ASDP_BLOB_ROOT: '/tmp/x', ASDP_REPLICA_COUNT: '3' }),
      /single-node only/,
    );
    assert.doesNotThrow(() =>
      loadConfig({ ASDP_BLOB_STORE: 's3', ASDP_OBJECT_STORE_ENDPOINT: 'http://minio:9000', ASDP_REPLICA_COUNT: '3' }),
    );
  });

  test('rejects an invalid enumerated value rather than coercing it', () => {
    assert.throws(() => loadConfig({ ASDP_LOG_LEVEL: 'verbose' }), ConfigError);
    assert.throws(() => loadConfig({ PORT: 'abc' }), /must be a number/);
  });
});

// ---------------------------------------------------------------------------
// Project creation and gate initialisation
// ---------------------------------------------------------------------------

describe('project creation', () => {
  test('creates a project with all five gates closed', async () => {
    const ctx = context();
    const project = await createProject(ctx, admin, { key: 'onboarding', name: 'Customer Onboarding' });

    assert.equal(project.key, 'onboarding');
    assert.equal(project.settings.strictness, 'strict', 'strict is the default');
    assert.equal(project.settings.allowExternalProviders, true);

    const gates = await ctx.repos.gates.list(project.id);
    assert.equal(gates.length, 5);
    for (const g of gates) {
      assert.equal(g.status, 'not_ready', `${g.code} starts closed`);
    }
  });

  test('rejects an invalid or duplicate project key', async () => {
    const ctx = context();
    await assert.rejects(
      () => createProject(ctx, admin, { key: 'AB', name: 'x' }),
      ValidationError,
    );
    await createProject(ctx, admin, { key: 'onboarding', name: 'x' });
    await assert.rejects(
      () => createProject(ctx, admin, { key: 'onboarding', name: 'y' }),
      /already in use/,
    );
  });

  test('project creation is audited', async () => {
    const ctx = context();
    const project = await createProject(ctx, admin, { key: 'onboarding', name: 'x' });
    const events = await ctx.repos.audit.list(project.id);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.action, 'project.created');
    assert.equal(events[0]?.actor, 'u-admin');
    assert.deepEqual(events[0]?.rolesAtTime, ['PlatformAdmin']);
  });
});

// ---------------------------------------------------------------------------
// Read-locks — the structural prevention of silent conversion
// ---------------------------------------------------------------------------

describe('read-locks (ADR-0017)', () => {
  test('GENERATION IS UNREACHABLE until G2 is approved', async () => {
    const ctx = context();
    const project = await createProject(ctx, admin, { key: 'onboarding', name: 'x' });

    await assert.rejects(
      () => assertStageEnterable(ctx, project.id, 'generation'),
      (err: unknown) => err instanceof GateGuardError && /G2/.test(err.message),
    );
  });

  test('the specification stage is unreachable until G1 is approved', async () => {
    const ctx = context();
    const project = await createProject(ctx, admin, { key: 'onboarding', name: 'x' });
    await assert.rejects(
      () => assertStageEnterable(ctx, project.id, 'specification'),
      GateGuardError,
    );
  });

  test('intake is always reachable', async () => {
    const ctx = context();
    const project = await createProject(ctx, admin, { key: 'onboarding', name: 'x' });
    await assert.doesNotReject(() => assertStageEnterable(ctx, project.id, 'intake'));
  });
});

// ---------------------------------------------------------------------------
// The full approval lifecycle
// ---------------------------------------------------------------------------

describe('approval lifecycle (Phase 0 exit criterion 2)', () => {
  test('freeze → evaluate → approve → stage unlocked', async () => {
    const ctx = context();
    const project = await createProject(ctx, admin, { key: 'onboarding', name: 'x' });

    const baseline = await freezeProjectBaseline(ctx, analyst, {
      projectId: project.id,
      stage: 'requirements',
      members: MEMBERS,
    });
    assert.match(baseline.contentHash, /^[0-9a-f]{64}$/);

    // A gate with blocking findings cannot be approved.
    const notReady = await evaluateProjectGate(ctx, analyst, {
      projectId: project.id,
      gate: 'G1',
      baselineId: baseline.id,
      validationRunId: 'run-1',
      blockingFindingIds: ['L4-SPEC-001@x'],
    });
    assert.equal(notReady.status, 'not_ready');
    await assert.rejects(
      () =>
        approveProjectGate(ctx, businessApprover, {
          projectId: project.id,
          gate: 'G1',
          baselineId: baseline.id,
          validationRunId: 'run-1',
        }),
      GateGuardError,
    );

    // Clean evaluation makes it ready.
    const ready = await evaluateProjectGate(ctx, analyst, {
      projectId: project.id,
      gate: 'G1',
      baselineId: baseline.id,
      validationRunId: 'run-1',
      blockingFindingIds: [],
    });
    assert.equal(ready.status, 'ready');

    const approved = await approveProjectGate(ctx, businessApprover, {
      projectId: project.id,
      gate: 'G1',
      baselineId: baseline.id,
      validationRunId: 'run-1',
      contentAuthors: ['u-analyst'],
    });
    assert.equal(approved.quorumMet, true);
    assert.equal(approved.gate.status, 'approved');
    assert.equal(approved.approval.signedBaselineHash, baseline.contentHash);
    assert.equal(approved.approval.validationRunId, 'run-1');
    assert.equal(approved.approval.roleAtApproval, 'BusinessApprover');

    // The downstream stage is now reachable.
    await assert.doesNotReject(() => assertStageEnterable(ctx, project.id, 'specification'));
    // But generation still is not: it needs G2.
    await assert.rejects(() => assertStageEnterable(ctx, project.id, 'generation'), GateGuardError);
  });

  test('SEGREGATION OF DUTIES: the author cannot approve their own content', async () => {
    const ctx = context();
    const project = await createProject(ctx, admin, { key: 'onboarding', name: 'x' });
    const baseline = await freezeProjectBaseline(ctx, analyst, {
      projectId: project.id, stage: 'requirements', members: MEMBERS,
    });
    await evaluateProjectGate(ctx, analyst, {
      projectId: project.id, gate: 'G1', baselineId: baseline.id,
      validationRunId: 'run-1', blockingFindingIds: [],
    });

    await assert.rejects(
      () =>
        approveProjectGate(ctx, { ...businessApprover, subject: 'u-analyst' }, {
          projectId: project.id, gate: 'G1', baselineId: baseline.id,
          validationRunId: 'run-1', contentAuthors: ['u-analyst'],
        }),
      /segregation of duties/,
    );
  });

  test('G2 requires a quorum of two distinct approvers', async () => {
    const ctx = context();
    const project = await createProject(ctx, admin, { key: 'onboarding', name: 'x' });
    const baseline = await freezeProjectBaseline(ctx, analyst, {
      projectId: project.id, stage: 'specification', members: MEMBERS,
    });
    await evaluateProjectGate(ctx, architect, {
      projectId: project.id, gate: 'G2', baselineId: baseline.id,
      validationRunId: 'run-1', blockingFindingIds: [],
    });

    const first = await approveProjectGate(ctx, businessApprover, {
      projectId: project.id, gate: 'G2', baselineId: baseline.id, validationRunId: 'run-1',
    });
    assert.equal(first.quorumMet, false, 'one signature is not enough at G2');

    const second = await approveProjectGate(ctx, architect, {
      projectId: project.id, gate: 'G2', baselineId: baseline.id, validationRunId: 'run-1',
    });
    assert.equal(second.quorumMet, true);
    assert.equal(second.gate.status, 'approved');
  });
});

// ---------------------------------------------------------------------------
// Automatic reopening — acceptance criterion 7
// ---------------------------------------------------------------------------

describe('automatic reopening (acceptance criterion 7)', () => {
  async function approvedProject() {
    const ctx = context();
    const project = await createProject(ctx, admin, { key: 'onboarding', name: 'x' });
    const baseline = await freezeProjectBaseline(ctx, analyst, {
      projectId: project.id, stage: 'requirements', members: MEMBERS,
    });
    await evaluateProjectGate(ctx, analyst, {
      projectId: project.id, gate: 'G1', baselineId: baseline.id,
      validationRunId: 'run-1', blockingFindingIds: [],
    });
    await approveProjectGate(ctx, businessApprover, {
      projectId: project.id, gate: 'G1', baselineId: baseline.id, validationRunId: 'run-1',
    });
    return { ctx, project, baseline };
  }

  test('CHANGING THE BASELINE CONTENT REOPENS THE APPROVED GATE', async () => {
    const { ctx, project } = await approvedProject();

    const revised = await freezeProjectBaseline(ctx, analyst, {
      projectId: project.id, stage: 'requirements', members: CHANGED_MEMBERS,
    });

    const reopened = await reconcileGates(ctx, analyst, project.id, {
      baselineHash: revised.contentHash,
      validationRunId: 'run-1',
    });
    assert.deepEqual(reopened, ['G1']);

    const g1 = await ctx.repos.gates.get(project.id, 'G1');
    assert.equal(g1?.value.status, 'reopened');
    assert.equal(g1?.value.approvedBaselineHash, undefined);

    // And the downstream stage is locked again.
    await assert.rejects(() => assertStageEnterable(ctx, project.id, 'specification'), GateGuardError);
  });

  test('CHANGING THE VALIDATION EVIDENCE REOPENS THE APPROVED GATE', async () => {
    const { ctx, project, baseline } = await approvedProject();
    const reopened = await reconcileGates(ctx, analyst, project.id, {
      baselineHash: baseline.contentHash,
      validationRunId: 'run-2',
    });
    assert.deepEqual(reopened, ['G1']);
  });

  test('unchanged content and evidence leave the gate approved', async () => {
    const { ctx, project, baseline } = await approvedProject();
    const reopened = await reconcileGates(ctx, analyst, project.id, {
      baselineHash: baseline.contentHash,
      validationRunId: 'run-1',
    });
    assert.deepEqual(reopened, []);
    const g1 = await ctx.repos.gates.get(project.id, 'G1');
    assert.equal(g1?.value.status, 'approved');
  });

  test('reopening is audited', async () => {
    const { ctx, project } = await approvedProject();
    await reconcileGates(ctx, analyst, project.id, {
      baselineHash: 'c'.repeat(64), validationRunId: 'run-1',
    });
    const events = await ctx.repos.audit.list(project.id);
    const reopen = events.find((e) => e.action === 'gate.reopened');
    assert.ok(reopen !== undefined, 'reopening must be audited');
  });
});

// ---------------------------------------------------------------------------
// Append-only audit and insert-only repositories
// ---------------------------------------------------------------------------

describe('insert-only and append-only guarantees (invariant D8)', () => {
  test('the audit log has no update or delete method', () => {
    const repos = createMemoryRepositories();
    const audit = repos.audit as unknown as Record<string, unknown>;
    for (const forbidden of ['update', 'delete', 'remove', 'purge', 'clear']) {
      assert.equal(audit[forbidden], undefined, `audit must not expose '${forbidden}'`);
    }
  });

  test('baselines and approvals expose no update or delete method', () => {
    const repos = createMemoryRepositories();
    for (const repo of [repos.baselines, repos.approvals]) {
      const r = repo as unknown as Record<string, unknown>;
      for (const forbidden of ['update', 'delete', 'remove', 'purge']) {
        assert.equal(r[forbidden], undefined, `must not expose '${forbidden}'`);
      }
    }
  });

  test('re-inserting a baseline id is rejected', async () => {
    const repos = createMemoryRepositories();
    const baseline = {
      id: 'bl-1', projectId: 'p1', stage: 'requirements' as const,
      contentHash: 'a'.repeat(64), frozenAt: '2026-08-22T00:00:00Z',
      members: [], rafVersion: 'raf-1.1', rulePackVersion: 'rp-1.2',
      camundaTargetProfileId: 'camunda-8x-baseline',
    };
    await repos.baselines.insert(baseline);
    await assert.rejects(() => repos.baselines.insert(baseline), /insert-only/);
  });

  test('every command produces at least one audit event', async () => {
    const ctx = context();
    const project = await createProject(ctx, admin, { key: 'onboarding', name: 'x' });
    const baseline = await freezeProjectBaseline(ctx, analyst, {
      projectId: project.id, stage: 'requirements', members: MEMBERS,
    });
    await evaluateProjectGate(ctx, analyst, {
      projectId: project.id, gate: 'G1', baselineId: baseline.id,
      validationRunId: 'run-1', blockingFindingIds: [],
    });
    await approveProjectGate(ctx, businessApprover, {
      projectId: project.id, gate: 'G1', baselineId: baseline.id, validationRunId: 'run-1',
    });
    const events = await ctx.repos.audit.list(project.id);
    assert.deepEqual(
      events.map((e) => e.action),
      ['project.created', 'baseline.frozen', 'gate.evaluated', 'gate.approved'],
    );
  });
});

// ---------------------------------------------------------------------------
// HTTP surface — the runnable application (milestone M1)
// ---------------------------------------------------------------------------

describe('HTTP surface over NestJS + PGlite (ADR-0034, ADR-0035)', () => {
  /**
   * Starts the REAL application graph: NestJS composition, PGlite persistence
   * with migrations applied, filesystem blob store. The composition under test
   * is the composition that ships.
   */
  async function startServer(): Promise<RunningApp> {
    const blobRoot = await mkdtemp(join(tmpdir(), 'asdp-blob-'));
    const config = loadConfig({
      PORT: '0',
      ASDP_LOG_LEVEL: 'error',
      ASDP_BLOB_ROOT: blobRoot,
    });
    const database = await createPgliteDatabase();
    await migrate(database);
    const blobStore = await createFilesystemBlobStore({ rootDirectory: blobRoot });
    return listen(
      { config, database, blobStore, clock: systemClock(), ids: counterIdGenerator() },
      0,
    );
  }

  async function call(
    running: RunningApp,
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<{ status: number; json: any }> {
    const res = await fetch(`http://127.0.0.1:${running.port}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: await res.json() };
  }

  const asAdmin = { 'x-asdp-subject': 'u-admin', 'x-asdp-roles': 'PlatformAdmin' };
  const asAnalyst = { 'x-asdp-subject': 'u-analyst', 'x-asdp-roles': 'BusinessAnalyst' };
  const asOwner = { 'x-asdp-subject': 'u-owner', 'x-asdp-roles': 'BusinessApprover' };

  test('liveness and readiness are distinct endpoints (ADR-0028 K4)', async () => {
    const running = await startServer();
    try {
      const live = await call(running, 'GET', '/health/live');
      assert.equal(live.status, 200);
      assert.equal(live.json.status, 'live');

      const ready = await call(running, 'GET', '/health/ready');
      assert.equal(ready.status, 200);
      assert.equal(ready.json.ok, true);
      assert.ok(Array.isArray(ready.json.dependencies));
    } finally {
      await running.close();
    }
  });

  test('reports its pinned versions at /meta', async () => {
    const running = await startServer();
    try {
      const meta = await call(running, 'GET', '/meta');
      assert.equal(meta.json.rafVersion, 'raf-1.1');
      assert.equal(meta.json.rulePackVersion, 'rp-1.2');
      assert.equal(meta.json.repository, 'pglite', 'ADR-0035 development adapter');
      assert.equal(meta.json.blobStore, 'filesystem', 'A6 development adapter');
      assert.equal(meta.json.framework, 'nestjs', 'ADR-0034');
    } finally {
      await running.close();
    }
  });

  test('THERE IS NO ANONYMOUS ACCESS (ADR-0027)', async () => {
    const running = await startServer();
    try {
      const r = await call(running, 'GET', '/projects');
      // 401, not 403. V1 settled the posture: absent credentials are an
      // AUTHENTICATION failure, and 403 is reserved for an authenticated caller
      // who lacks the role. Phase 1 returned 403 for both, which conflated two
      // different facts and told the caller to go looking for the wrong problem.
      assert.equal(r.status, 401, 'an unauthenticated request must be refused');
      assert.match(String(r.json.error), /unauthenticated/);
    } finally {
      await running.close();
    }
  });

  test('a caller with no roles is refused as unauthenticated', async () => {
    const running = await startServer();
    try {
      const r = await call(running, 'GET', '/projects', undefined, {
        'x-asdp-subject': 'u-x',
      });
      // A subject with no roles cannot be authenticated at all in header mode:
      // there is no identity to authorise. 401, not 403.
      assert.equal(r.status, 401);
    } finally {
      await running.close();
    }
  });

  test('an unauthorised role gets 403, not 500', async () => {
    const running = await startServer();
    try {
      const r = await call(running, 'POST', '/projects', { key: 'x-project', name: 'X' }, {
        'x-asdp-subject': 'u-v', 'x-asdp-roles': 'Viewer',
      });
      assert.equal(r.status, 403);
    } finally {
      await running.close();
    }
  });

  test('END TO END: create project, freeze, evaluate, approve, then see the stage unlock', async () => {
    const running = await startServer();
    try {
      const created = await call(running, 'POST', '/projects', {
        key: 'onboarding', name: 'Customer Onboarding',
      }, asAdmin);
      assert.equal(created.status, 201);
      const projectId = created.json.id as string;

      // Generation is locked from creation.
      const lockedBefore = await call(
        running, 'GET', `/projects/${projectId}/stages/generation/enterable`, undefined, asAnalyst,
      );
      assert.equal(lockedBefore.json.enterable, false);
      assert.match(String(lockedBefore.json.reason), /G2/);

      const baseline = await call(running, 'POST', `/projects/${projectId}/baselines`, {
        stage: 'requirements', members: MEMBERS,
      }, asAnalyst);
      assert.equal(baseline.status, 201);
      assert.match(baseline.json.contentHash, /^[0-9a-f]{64}$/);

      const blocked = await call(running, 'POST', `/projects/${projectId}/gates/G1/evaluate`, {
        baselineId: baseline.json.id, validationRunId: 'run-1',
        blockingFindingIds: ['L4-SPEC-001@step-1'],
      }, asAnalyst);
      assert.equal(blocked.json.status, 'not_ready');

      const refused = await call(running, 'POST', `/projects/${projectId}/gates/G1/approve`, {
        baselineId: baseline.json.id, validationRunId: 'run-1',
      }, asOwner);
      assert.equal(refused.status, 409, 'a not-ready gate cannot be approved');
      assert.equal(refused.json.kind, 'gate_guard');

      const ready = await call(running, 'POST', `/projects/${projectId}/gates/G1/evaluate`, {
        baselineId: baseline.json.id, validationRunId: 'run-1', blockingFindingIds: [],
      }, asAnalyst);
      assert.equal(ready.json.status, 'ready');

      const approved = await call(running, 'POST', `/projects/${projectId}/gates/G1/approve`, {
        baselineId: baseline.json.id, validationRunId: 'run-1',
      }, asOwner);
      assert.equal(approved.status, 200);
      assert.equal(approved.json.quorumMet, true);

      const specNow = await call(
        running, 'GET', `/projects/${projectId}/stages/specification/enterable`, undefined, asAnalyst,
      );
      assert.equal(specNow.json.enterable, true);

      const genStill = await call(
        running, 'GET', `/projects/${projectId}/stages/generation/enterable`, undefined, asAnalyst,
      );
      assert.equal(genStill.json.enterable, false, 'generation still needs G2');

      const audit = await call(running, 'GET', `/projects/${projectId}/audit`, undefined, asAdmin);
      assert.ok(audit.json.length >= 4, 'every action is audited');
    } finally {
      await running.close();
    }
  });

  /**
   * **An unverifiable anchor is a REFUSAL, not a server failure.**
   *
   * `AnchorVerificationError` was absent from the filter's mapping chain and
   * fell through to the generic 500 — telling the caller the server broke when
   * the server had worked exactly as ADR-0008 requires. Found while building
   * U3-b, the first surface to expose evidence recording to a human.
   *
   * The real `DomainErrorFilter` is exercised here rather than a copy of its
   * logic, because a test that reimplements the mapping cannot catch the mapping
   * being wrong.
   *
   * **This is asserted at the filter, not over HTTP, and that is deliberate.**
   * Both anchor-minting paths in `recordEvidence` derive the quote FROM the
   * stored text, so the anchor always re-resolves and the refusal is currently
   * unreachable over the wire. It is a guard against a future path — and a guard
   * that returns the wrong status is still wrong.
   */
  test('AN UNVERIFIABLE ANCHOR IS 400, NOT 500 — it is a refusal', () => {
    const captured: { status?: number; body?: unknown; correlationId?: string } = {};
    const response = {
      status(code: number) {
        captured.status = code;
        return this;
      },
      json(body: unknown) {
        captured.body = body;
      },
      setHeader(name: string, value: string) {
        if (name === 'x-correlation-id') captured.correlationId = value;
      },
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({ headers: {} }),
      }),
    } as never;

    const reason =
      'refusing to store evidence with a broken anchor: the quote is no longer present in this source';
    new DomainErrorFilter().catch(new AnchorVerificationError(reason), host);

    assert.notEqual(captured.status, 500, 'a domain refusal must not be reported as a server failure');
    assert.equal(captured.status, 400);
    // The server's own words survive: a refusal the caller cannot read is a
    // refusal the caller cannot act on.
    assert.deepEqual(captured.body, { error: reason });
    assert.ok(captured.correlationId, 'every response still carries a correlation id');
  });

  test('the 400 mapping is SPECIFIC — an unexpected error is still 500', () => {
    // The control for the test above. Without it, "everything is 400" would pass.
    const captured: { status?: number; body?: unknown } = {};
    const response = {
      status(code: number) {
        captured.status = code;
        return this;
      },
      json(body: unknown) {
        captured.body = body;
      },
      setHeader() {},
    };
    const host = {
      switchToHttp: () => ({ getResponse: () => response, getRequest: () => ({ headers: {} }) }),
    } as never;

    new DomainErrorFilter().catch(new Error('something genuinely unexpected'), host);
    assert.equal(captured.status, 500);
  });

  test('a malformed body yields 400', async () => {
    const running = await startServer();
    try {
      const r = await call(running, 'POST', '/projects', { name: 'no key' }, asAdmin);
      assert.equal(r.status, 400);
    } finally {
      await running.close();
    }
  });

  test('SETTLED POSTURE: an unknown route 404s before authentication', async () => {
    // Phase 1 ran authentication before routing, so an anonymous request to an
    // unknown path was refused with 403 and route existence was not disclosed.
    // NestJS routes first, so an unmatched path 404s before the guard runs.
    //
    // Reviewed and ACCEPTED: route names are not secrets in a documented API, and
    // restoring the old order would mean fighting the composition layer
    // (ADR-0034 N1). The Phase 1 behaviour must not be restored — CLAUDE.md §12.
    const running = await startServer();
    try {
      const res = await fetch(`http://127.0.0.1:${running.port}/nope`);
      assert.equal(res.status, 404);
      assert.ok(res.headers.get('x-correlation-id'), 'every response still carries a correlation id');
    } finally {
      await running.close();
    }
  });

  test('a KNOWN route still refuses anonymous callers (ADR-0027 unchanged)', async () => {
    // The security property that actually matters is untouched: a real endpoint
    // never serves an unauthenticated caller.
    const running = await startServer();
    try {
      const res = await fetch(`http://127.0.0.1:${running.port}/projects`);
      assert.equal(res.status, 401, 'unauthenticated, not unauthorised');
      const body = (await res.json()) as { error: string };
      assert.match(body.error, /unauthenticated/);
    } finally {
      await running.close();
    }
  });

  test('an authenticated caller gets 404 for an unknown route', async () => {
    const running = await startServer();
    try {
      const res = await fetch(`http://127.0.0.1:${running.port}/nope`, { headers: asAdmin });
      assert.equal(res.status, 404);
      assert.ok(res.headers.get('x-correlation-id'));
      const body = (await res.json()) as { error: string };
      assert.match(body.error, /Cannot GET \/nope/, 'stable { error } envelope, not NestJS shape');
    } finally {
      await running.close();
    }
  });

  test('health endpoints are reachable without authentication, as probes require', async () => {
    const running = await startServer();
    try {
      for (const path of ['/health/live', '/health/ready', '/meta']) {
        const res = await fetch(`http://127.0.0.1:${running.port}${path}`);
        assert.equal(res.status, 200, `${path} must be probe-accessible`);
      }
    } finally {
      await running.close();
    }
  });
});
