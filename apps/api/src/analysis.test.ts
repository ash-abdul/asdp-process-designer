/**
 * V4a — the AI broker and live-path foundation, end to end.
 *
 * These tests drive the **real** application graph: NestJS composition, PGlite
 * with migrations applied, a filesystem blob store, and the real broker with its
 * egress gate, capability negotiation, routing and degradation ladder. What is
 * substituted is one thing only — the provider — and it is substituted with a
 * **replay provider over recorded fixtures**, which is what CI is supposed to use
 * (**A7**).
 *
 * The chain V4a is accepted on:
 *
 *   source → broker → governed provider → structured response
 *          → ai_interaction audit → deterministic replay
 *
 * What is deliberately NOT tested here is quality. Nothing in this file measures
 * whether a profile is *right*; the recordings are authored, and the baseline
 * report says so. These tests prove the chain holds and that the record of it is
 * truthful.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadConfig } from './config.ts';
import { listen, type RunningApp } from './http/bootstrap.ts';
import { createPgliteDatabase } from './persistence/pglite-database.ts';
import { migrate } from './persistence/migrate.ts';
import { createFilesystemBlobStore } from './blob/filesystem-blob-store.ts';
import { counterIdGenerator, systemClock } from './repo-memory.ts';
import { createBrokerSourceProfiler, decodeStructured, PROFILE_MAX_CONTEXT_CHARS } from './ai/broker-profiler.ts';
import { createAuthoredStubProvider, createRefusingProvider, STUB_PROVIDER_ID } from './ai/stub-provider.ts';
import type { Database } from './persistence/db.ts';
import type { SourceProfiler } from './ports.ts';
import {
  DEFAULT_EGRESS_POLICY,
  EgressViolationError,
  assertDevelopmentCeiling,
  type AiProvider,
} from '@asdp/ai';
import {
  createFilesystemRecordingStore,
  createMemoryRecordingStore,
  createReplayProvider,
  type RecordingStore,
} from '@asdp/eval';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BRD = [
  '# Trade Licence Renewal — Business Requirements',
  '',
  '## 1. Purpose',
  'This document describes the renewal of a commercial trade licence.',
  '',
  '## 2. Decision',
  'An application is approved when eligibility holds, and refused when it does not.',
].join('\n');

const ARABIC_SOP = [
  '# إجراء تشغيلي — تجديد الرخصة',
  '',
  '## ١. الغرض',
  'يوضح هذا الإجراء الخطوات التشغيلية للتجديد.',
].join('\n');

interface Server extends RunningApp {
  readonly database: Database;
}

/**
 * Build a profiler over the real broker and a replay provider.
 *
 * `record` mode against the authored stub on first use, so a test does not depend
 * on a fixture file existing; `replay_only` afterwards is what the determinism
 * test exercises. The important part is that the broker, the gate and the ladder
 * are the real ones.
 */
function replayProfiler(options: {
  store: RecordingStore;
  mode?: 'record' | 'replay_only';
  inner?: AiProvider;
  classification?: string;
}): SourceProfiler {
  const inner = options.inner ?? createAuthoredStubProvider();
  const provider = createReplayProvider({
    inner,
    store: options.store,
    mode: options.mode ?? 'record',
    corpusId: 'test',
    taskContext: { promptVersion: 'profile-source@1', classification: options.classification ?? 'INTERNAL' },
    clock: systemClock(),
  });

  return createBrokerSourceProfiler({
    broker: {
      providers: [provider],
      policy: DEFAULT_EGRESS_POLICY,
      routing: { defaultPreferenceOrder: [provider.id] },
      clock: systemClock(),
      ids: counterIdGenerator(),
    },
    // The composition root's decision, recorded rather than inferred. A replay is
    // never reported as a live call.
    mode: 'replay',
    project: { allowExternalProviders: true, classificationCeiling: 'CONFIDENTIAL' },
  });
}

async function startServer(options: {
  profiler?: SourceProfiler;
  dataDir?: string;
} = {}): Promise<Server> {
  const blobRoot = await mkdtemp(join(tmpdir(), 'asdp-v4a-blob-'));
  const config = loadConfig({ PORT: '0', ASDP_LOG_LEVEL: 'error', ASDP_BLOB_ROOT: blobRoot });
  const database = await createPgliteDatabase(
    options.dataDir === undefined ? {} : { dataDir: options.dataDir },
  );
  await migrate(database);
  const blobStore = await createFilesystemBlobStore({ rootDirectory: blobRoot });
  const running = await listen(
    {
      config,
      database,
      blobStore,
      clock: systemClock(),
      ids: counterIdGenerator(),
      ...(options.profiler === undefined ? {} : { sourceProfiler: options.profiler }),
    },
    0,
  );
  return {
    ...running,
    database,
    close: async () => {
      await running.close();
      await database.close();
    },
  };
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
  const text = await res.text();
  return { status: res.status, json: text.length === 0 ? undefined : JSON.parse(text) };
}

const asAdmin = { 'x-asdp-subject': 'u-admin', 'x-asdp-roles': 'PlatformAdmin' };
const asAnalyst = { 'x-asdp-subject': 'u-analyst', 'x-asdp-roles': 'BusinessAnalyst' };
const asViewer = { 'x-asdp-subject': 'u-viewer', 'x-asdp-roles': 'Viewer' };
const asReviewer = { 'x-asdp-subject': 'u-rev', 'x-asdp-roles': 'ComplianceReviewer' };

async function project(s: Server): Promise<string> {
  const r = await call(s, 'POST', '/projects', { key: `v4a-${Date.now()}`, name: 'V4a' }, asAdmin);
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json.id;
}

async function ingest(s: Server, projectId: string, filename: string, text: string): Promise<string> {
  const r = await call(s, 'POST', `/projects/${projectId}/sources`, { filename, text }, asAnalyst);
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json.source.id;
}

// ---------------------------------------------------------------------------
// The chain
// ---------------------------------------------------------------------------

describe('PROFILE_SOURCE through the broker', () => {
  test('profiles a source and records the interaction end to end', async () => {
    const s = await startServer({ profiler: replayProfiler({ store: createMemoryRecordingStore() }) });
    try {
      const projectId = await project(s);
      const sourceId = await ingest(s, projectId, 'brd.md', BRD);

      const r = await call(
        s, 'POST', `/projects/${projectId}/sources/${sourceId}/profile`, undefined, asAnalyst,
      );

      assert.equal(r.status, 201, JSON.stringify(r.json));
      assert.equal(r.json.kind, 'profiled');
      assert.equal(r.json.profile.documentKind, 'brd');
      assert.deepEqual(r.json.profile.languages, ['en']);
      assert.ok(r.json.profile.sectionHeadings.length > 0, 'headings are reported');
      // A7: a replay is never reported as a live call.
      assert.equal(r.json.mode, 'replay');
      assert.equal(r.json.providerId, STUB_PROVIDER_ID);
      assert.deepEqual(r.json.degradations, []);
      // ADR-0022: the capabilities the answer rested on, not the provider's whole list.
      assert.deepEqual(r.json.capabilitiesUsed, ['schemaConstrainedOutput']);
      assert.match(String(r.json.interactionId), /^ai/);
    } finally {
      await s.close();
    }
  });

  test('an Arabic source is profiled without its language being guessed as English', async () => {
    const s = await startServer({ profiler: replayProfiler({ store: createMemoryRecordingStore() }) });
    try {
      const projectId = await project(s);
      const sourceId = await ingest(s, projectId, 'sop.md', ARABIC_SOP);
      const r = await call(
        s, 'POST', `/projects/${projectId}/sources/${sourceId}/profile`, undefined, asAnalyst,
      );
      assert.equal(r.json.kind, 'profiled');
      assert.deepEqual(r.json.profile.languages, ['ar']);
      assert.equal(r.json.profile.documentKind, 'sop');
    } finally {
      await s.close();
    }
  });

  test('THE INTERACTION IS PERSISTED with everything the disclosure report needs', async () => {
    const s = await startServer({ profiler: replayProfiler({ store: createMemoryRecordingStore() }) });
    try {
      const projectId = await project(s);
      const sourceId = await ingest(s, projectId, 'brd.md', BRD);
      await call(s, 'POST', `/projects/${projectId}/sources/${sourceId}/profile`, undefined, asAnalyst);

      const log = await call(
        s, 'GET', `/projects/${projectId}/ai-interactions`, undefined, asReviewer,
      );
      assert.equal(log.status, 200);
      assert.equal(log.json.total, 1);

      const i = log.json.interactions[0];
      assert.equal(i.taskType, 'PROFILE_SOURCE');
      assert.equal(i.promptVersion, 'profile-source@1');
      assert.equal(i.providerId, STUB_PROVIDER_ID);
      assert.equal(i.modelId, 'stub-1');
      assert.equal(i.deploymentClass, 'on_premise');
      assert.deepEqual(i.capabilitiesUsed, ['schemaConstrainedOutput']);
      assert.equal(i.routing.contentClassification, 'INTERNAL');
      assert.equal(i.egressDecision, 'permitted');
      // E4 rule 2: full context is stated, not assumed.
      assert.equal(i.contextMode, 'full');
      assert.deepEqual(i.chunkRanges, []);
      assert.equal(i.mode, 'replay');
      assert.equal(i.sourceId, sourceId);
      assert.ok(typeof i.correlationId === 'string' && i.correlationId.length > 0);
      assert.equal(i.humanVerdict, 'pending');
      assert.ok(i.usage.inputUnits > 0, 'usage is recorded as the provider reported it');
      assert.equal(i.usage.costEstimate, 0);
      assert.ok(i.proposalId !== undefined, 'the proposal is named');
    } finally {
      await s.close();
    }
  });

  test('the interaction and the audit event commit TOGETHER, and survive a restart', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'asdp-v4a-durable-'));
    let projectId = '';
    let sourceId = '';
    let interactionId = '';

    const first = await startServer({
      profiler: replayProfiler({ store: createMemoryRecordingStore() }),
      dataDir,
    });
    try {
      projectId = await project(first);
      sourceId = await ingest(first, projectId, 'brd.md', BRD);
      const r = await call(
        first, 'POST', `/projects/${projectId}/sources/${sourceId}/profile`, undefined, asAnalyst,
      );
      interactionId = r.json.interactionId;
    } finally {
      await first.close();
    }

    const second = await startServer({
      profiler: replayProfiler({ store: createMemoryRecordingStore() }),
      dataDir,
    });
    try {
      const log = await call(
        second, 'GET', `/projects/${projectId}/ai-interactions?sourceId=${sourceId}`, undefined, asReviewer,
      );
      assert.equal(log.json.total, 1, 'the interaction survived the restart');
      assert.equal(log.json.interactions[0].id, interactionId);

      const audit = await call(second, 'GET', `/projects/${projectId}/audit`, undefined, asAdmin);
      const event = audit.json.find((e: any) => e.action === 'source.profiled');
      assert.ok(event !== undefined, 'the audit event survived too');
      assert.equal(event.after.aiInteractionId, interactionId);
      assert.equal(event.after.providerReached, true);
      assert.equal(event.after.egressDecision, 'permitted');
    } finally {
      await second.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Deterministic replay — A7
// ---------------------------------------------------------------------------

describe('deterministic replay', () => {
  test('the same source replays to a byte-identical profile', async () => {
    const store = createMemoryRecordingStore();
    const recording = await startServer({ profiler: replayProfiler({ store, mode: 'record' }) });
    let firstProfile: unknown;
    let projectId = '';
    try {
      projectId = await project(recording);
      const sourceId = await ingest(recording, projectId, 'brd.md', BRD);
      const r = await call(
        recording, 'POST', `/projects/${projectId}/sources/${sourceId}/profile`, undefined, asAnalyst,
      );
      firstProfile = r.json.profile;
    } finally {
      await recording.close();
    }

    // Now REPLAY ONLY, against a provider that throws if it is ever reached.
    const replaying = await startServer({
      profiler: replayProfiler({ store, mode: 'replay_only', inner: createRefusingProvider() }),
    });
    try {
      const replayProject = await project(replaying);
      const sourceId = await ingest(replaying, replayProject, 'brd.md', BRD);
      const r = await call(
        replaying, 'POST', `/projects/${replayProject}/sources/${sourceId}/profile`, undefined, asAnalyst,
      );
      assert.equal(r.json.kind, 'profiled', JSON.stringify(r.json));
      assert.deepEqual(r.json.profile, firstProfile, 'replay must be byte-identical');
    } finally {
      await replaying.close();
    }
  });

  test('A RECORDING MISS IS AN ERROR, never a network call', async () => {
    // An empty store in replay_only: the provider would have to be contacted, and
    // a green build that depended on a live model is not a green build.
    const s = await startServer({
      profiler: replayProfiler({
        store: createMemoryRecordingStore(),
        mode: 'replay_only',
        inner: createRefusingProvider(),
      }),
    });
    try {
      const projectId = await project(s);
      const sourceId = await ingest(s, projectId, 'brd.md', BRD);
      const r = await call(
        s, 'POST', `/projects/${projectId}/sources/${sourceId}/profile`, undefined, asAnalyst,
      );
      // A provider failure is a refusal, not a 500: the broker reports it with
      // options rather than pretending the pass succeeded.
      assert.equal(r.json.kind, 'refused');
      assert.match(String(r.json.reason), /replay_only|no recording/i);
      assert.ok(r.json.options.length > 0, 'a refusal carries options');
    } finally {
      await s.close();
    }
  });

  test('the recording store round-trips through the filesystem', async () => {
    const root = await mkdtemp(join(tmpdir(), 'asdp-v4a-rec-'));
    await mkdir(root, { recursive: true });
    const store = createFilesystemRecordingStore({ rootDirectory: root });

    const s = await startServer({ profiler: replayProfiler({ store, mode: 'record' }) });
    try {
      const projectId = await project(s);
      const sourceId = await ingest(s, projectId, 'brd.md', BRD);
      await call(s, 'POST', `/projects/${projectId}/sources/${sourceId}/profile`, undefined, asAnalyst);
    } finally {
      await s.close();
    }

    const held = await createFilesystemRecordingStore({ rootDirectory: root }).list();
    assert.equal(held.length, 1, 'the recording was written to disk');
    assert.equal(held[0]?.key.taskType, 'PROFILE_SOURCE');
    assert.equal(held[0]?.key.providerId, STUB_PROVIDER_ID);
    // ADR-0031 rule 6: a recording inherits its corpus classification.
    assert.equal(held[0]?.classification, 'INTERNAL');
  });

  test('a replay provider keeps the inner provider identity', () => {
    // The broker selects by descriptor and looks up by id, so a wrapper whose two
    // identities disagree can never be found — every brokered call refused with
    // "router selected an unknown provider". V4a found this by wiring it.
    const inner = createAuthoredStubProvider();
    const wrapped = createReplayProvider({
      inner,
      store: createMemoryRecordingStore(),
      mode: 'replay_only',
      corpusId: 'test',
      taskContext: { promptVersion: 'p@1', classification: 'INTERNAL' },
      clock: systemClock(),
    });
    assert.equal(wrapped.id, inner.id);
    assert.equal(wrapped.id, wrapped.descriptor().providerId);
  });
});

// ---------------------------------------------------------------------------
// Refusals — E4, egress, and the unwired default
// ---------------------------------------------------------------------------

describe('refusals are first-class', () => {
  test('the default build REFUSES: no provider is configured', async () => {
    const s = await startServer();
    try {
      const projectId = await project(s);
      const sourceId = await ingest(s, projectId, 'brd.md', BRD);
      const r = await call(
        s, 'POST', `/projects/${projectId}/sources/${sourceId}/profile`, undefined, asAnalyst,
      );
      assert.equal(r.status, 201);
      assert.equal(r.json.kind, 'refused');
      assert.match(String(r.json.reason), /no AI provider is configured/);
      // A configuration gap, stated as one — not a claim about the document.
      assert.deepEqual(r.json.degradations, ['no_provider_configured']);
      assert.equal(r.json.interactionId, undefined, 'no provider was reached, so nothing is recorded');

      const log = await call(s, 'GET', `/projects/${projectId}/ai-interactions`, undefined, asReviewer);
      assert.equal(log.json.total, 0);

      const audit = await call(s, 'GET', `/projects/${projectId}/audit`, undefined, asAdmin);
      const event = audit.json.find((e: any) => e.action === 'source.profileRefused');
      assert.ok(event !== undefined, 'a refusal is audited');
      assert.equal(event.after.providerReached, false);
    } finally {
      await s.close();
    }
  });

  test('E4: an over-context source is REFUSED BY NAME, never truncated', async () => {
    const s = await startServer({ profiler: replayProfiler({ store: createMemoryRecordingStore() }) });
    try {
      const projectId = await project(s);
      // Over the single-call limit. Chunking is approved (E4) but is V4b.
      const huge = `# Big\n\n${'requirement text. '.repeat(8000)}`;
      assert.ok(huge.length > PROFILE_MAX_CONTEXT_CHARS);
      const sourceId = await ingest(s, projectId, 'big.md', huge);

      const r = await call(
        s, 'POST', `/projects/${projectId}/sources/${sourceId}/profile`, undefined, asAnalyst,
      );
      assert.equal(r.json.kind, 'refused');
      assert.match(String(r.json.reason), /over the .* character single-call limit/);
      // The degradation is named even though the call was not made: E4 rule 6.
      assert.deepEqual(r.json.degradations, ['chunked_context']);
      assert.equal(r.json.interactionId, undefined, 'nothing was sent, so nothing is recorded');
    } finally {
      await s.close();
    }
  });

  test('a RESTRICTED source cannot be profiled by an external provider', async () => {
    // The production egress gate, exercised through the real broker rather than
    // asserted at the unit level.
    const external = createAuthoredStubProvider();
    const asExternal: AiProvider = {
      ...external,
      descriptor: () => ({ ...external.descriptor(), deploymentClass: 'external_hosted' }),
    };
    const s = await startServer({
      profiler: replayProfiler({
        store: createMemoryRecordingStore(),
        inner: asExternal,
        classification: 'RESTRICTED',
      }),
    });
    try {
      const projectId = await project(s);
      const r = await call(
        s, 'POST', `/projects/${projectId}/sources`,
        { filename: 'secret.md', text: BRD, classification: 'RESTRICTED' }, asAnalyst,
      );
      assert.equal(r.status, 201, JSON.stringify(r.json));
      const sourceId = r.json.source.id;

      const p = await call(
        s, 'POST', `/projects/${projectId}/sources/${sourceId}/profile`, undefined, asAnalyst,
      );
      assert.equal(p.json.kind, 'refused');
      assert.ok(p.json.options.length > 0);

      const log = await call(s, 'GET', `/projects/${projectId}/ai-interactions`, undefined, asReviewer);
      assert.equal(log.json.total, 0, 'a refused call produces NO interaction, because nothing was sent');
    } finally {
      await s.close();
    }
  });
});

// ---------------------------------------------------------------------------
// E1 — the development egress ceiling
// ---------------------------------------------------------------------------

describe('E1 development egress ceiling', () => {
  const external = () => ({
    ...createAuthoredStubProvider().descriptor(),
    deploymentClass: 'external_hosted' as const,
  });
  const text = (classification: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED') =>
    [{ kind: 'text' as const, text: 'x', classification }];

  test('PUBLIC and INTERNAL may leave in development', () => {
    assertDevelopmentCeiling(text('PUBLIC'), external());
    assertDevelopmentCeiling(text('INTERNAL'), external());
  });

  test('CONFIDENTIAL MAY NOT leave merely for development, though policy permits it', () => {
    // The production policy allows CONFIDENTIAL to an external provider; E1 does
    // not, because "we were developing" is not a reason to send it.
    assert.throws(() => assertDevelopmentCeiling(text('CONFIDENTIAL'), external()), EgressViolationError);
  });

  test('RESTRICTED is refused by BOTH gates', () => {
    assert.throws(() => assertDevelopmentCeiling(text('RESTRICTED'), external()), EgressViolationError);
  });

  test('an on-premise provider is unaffected — nothing leaves the enterprise', () => {
    const onPrem = createAuthoredStubProvider().descriptor();
    assertDevelopmentCeiling(text('CONFIDENTIAL'), onPrem);
    assertDevelopmentCeiling(text('RESTRICTED'), onPrem);
  });
});

// ---------------------------------------------------------------------------
// Structured output decoding
// ---------------------------------------------------------------------------

describe('decodeStructured', () => {
  test('decodes JSON text from the outputs list', () => {
    const decoded = decodeStructured(['{"documentKind":"brd"}']);
    assert.equal(decoded.ok, true);
    assert.deepEqual(decoded.ok ? decoded.value : undefined, { documentKind: 'brd' });
  });

  test('accepts an object output unchanged', () => {
    const decoded = decodeStructured([{ documentKind: 'sop' }]);
    assert.equal(decoded.ok, true);
  });

  test('a FENCED response is refused, not silently stripped', () => {
    // Stripping a fence is a repair, and a repair is a declared degradation
    // (prompt_repair_loop) rather than a convenience.
    const decoded = decodeStructured(['```json\n{"documentKind":"brd"}\n```']);
    assert.equal(decoded.ok, false);
  });

  test('an empty or non-JSON response is refused with a reason', () => {
    assert.equal(decodeStructured([]).ok, false);
    assert.equal(decodeStructured(['']).ok, false);
    assert.equal(decodeStructured(['not json']).ok, false);
  });
});

// ---------------------------------------------------------------------------
// Authorisation and the absence of a promotion path
// ---------------------------------------------------------------------------

describe('security posture on the analysis surface', () => {
  test('a Viewer may READ the interaction log but may not spend money', async () => {
    const s = await startServer({ profiler: replayProfiler({ store: createMemoryRecordingStore() }) });
    try {
      const projectId = await project(s);
      const sourceId = await ingest(s, projectId, 'brd.md', BRD);

      const denied = await call(
        s, 'POST', `/projects/${projectId}/sources/${sourceId}/profile`, undefined, asViewer,
      );
      assert.equal(denied.status, 403, 'profiling causes egress and cost');

      const allowed = await call(
        s, 'GET', `/projects/${projectId}/ai-interactions`, undefined, asViewer,
      );
      assert.equal(allowed.status, 200, 'an audit a reviewer cannot read is not an audit');
    } finally {
      await s.close();
    }
  });

  test('anonymous callers are rejected on both routes', async () => {
    const s = await startServer({ profiler: replayProfiler({ store: createMemoryRecordingStore() }) });
    try {
      const projectId = await project(s);
      for (const [method, path] of [
        ['POST', `/projects/${projectId}/sources/x/profile`],
        ['GET', `/projects/${projectId}/ai-interactions`],
      ] as const) {
        const r = await call(s, method, path);
        assert.equal(r.status, 401, `${method} ${path}`);
      }
    } finally {
      await s.close();
    }
  });

  test('THERE IS NO ROUTE THAT PROMOTES A PROFILE (E3)', async () => {
    const s = await startServer({ profiler: replayProfiler({ store: createMemoryRecordingStore() }) });
    try {
      const projectId = await project(s);
      const sourceId = await ingest(s, projectId, 'brd.md', BRD);
      const profiled = await call(
        s, 'POST', `/projects/${projectId}/sources/${sourceId}/profile`, undefined, asAnalyst,
      );
      assert.equal(profiled.status, 201, JSON.stringify(profiled.json));

      // A profile is a proposal. Nothing turns it into a requirement, a RAF item
      // or evidence — the absence of a route is the enforcement.
      for (const path of [
        `/projects/${projectId}/requirements`,
        `/projects/${projectId}/raf`,
        `/projects/${projectId}/sources/${sourceId}/profile/approve`,
      ]) {
        const r = await call(s, 'POST', path, {}, asAnalyst);
        assert.equal(r.status, 404, path);
      }

      // And the profile did not become evidence as a side effect.
      const evidence = await call(s, 'GET', `/projects/${projectId}/evidence`, undefined, asAnalyst);
      assert.equal(evidence.json.total, 0, 'profiling creates no evidence');
    } finally {
      await s.close();
    }
  });

  test('an interaction cannot be mutated: no update route, and none in SQL', async () => {
    const s = await startServer({ profiler: replayProfiler({ store: createMemoryRecordingStore() }) });
    try {
      const projectId = await project(s);
      const sourceId = await ingest(s, projectId, 'brd.md', BRD);
      const r = await call(
        s, 'POST', `/projects/${projectId}/sources/${sourceId}/profile`, undefined, asAnalyst,
      );
      const id = r.json.interactionId;

      for (const method of ['PUT', 'PATCH', 'DELETE'] as const) {
        const attempt = await call(
          s, method, `/projects/${projectId}/ai-interactions/${id}`, { mode: 'replay' }, asAdmin,
        );
        assert.equal(attempt.status, 404, method);
      }

      // The one permitted mutation is the human verdict, and it is constrained.
      await assert.rejects(
        s.database.query('update ai_interaction set human_verdict = $1 where id = $2', ['maybe', id]),
        /constraint|violates/i,
      );
    } finally {
      await s.close();
    }
  });

  test('SQL refuses RESTRICTED content recorded against an external provider', async () => {
    const database = await createPgliteDatabase();
    try {
      await migrate(database);
      // ADR-0021 in SQL: if such a row could exist, the egress guarantee would
      // rest entirely on the code being correct.
      await assert.rejects(
        database.query(
          `insert into ai_interaction (id, project_id, at, task_type, task_version, prompt_version,
                                       provider_id, model_id, deployment_class, capability_tier,
                                       routing_json, content_classification, egress_decision)
           values ($1,$2,now(),$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12)`,
          [
            'ai-bad', 'prj-x', 'PROFILE_SOURCE', '1', 'p@1', 'claude', 'm', 'external_hosted',
            'unknown', JSON.stringify({}), 'RESTRICTED', 'permitted',
          ],
        ),
        /constraint|violates/i,
      );
    } finally {
      await database.close();
    }
  });
});
