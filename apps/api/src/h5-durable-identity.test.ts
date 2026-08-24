/**
 * H5 — durable identity generation, end to end.
 *
 * The defect these tests exist for: every surrogate identifier came from
 * `counterIdGenerator`, a per-process counter with no persistence, written into
 * a global primary key. A restart reset the counter while the database kept
 * every row, so **the first write of any kind after a restart collided**
 * (limitation 78). Two instances collided for the same reason: both counted
 * from zero.
 *
 * Every test in the repository used one process against a fresh in-memory
 * database, which is why it stood from V0.
 *
 * Approved boundary: `docs/60-plan/h5-proposal.md` v0.2, decisions **M1–M9**.
 * **M5**: these tests exercise the PRODUCTION generator against DURABLE storage.
 * Using `counterIdGenerator` here would prove nothing — it is the defect.
 *
 * Out of scope by decision, and untouched: **H6** (limitation 79), **H7**
 * (limitation 80) and **H8** (limitation 81).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

import { durableIdGenerator, freezeBaseline, textContentHash } from '@asdp/domain';
import { loadConfig } from './config.ts';
import { listen, type RunningApp } from './http/bootstrap.ts';
import { createPgliteDatabase } from './persistence/pglite-database.ts';
import { migrate } from './persistence/migrate.ts';
import { createFilesystemBlobStore } from './blob/filesystem-blob-store.ts';
import { systemClock } from './repo-memory.ts';
import { createBrokerEvidenceExtractor } from './ai/broker-extractor.ts';
import { createBrokerFramePopulator } from './ai/broker-frame-populator.ts';
import { createAuthoredStubProvider } from './ai/stub-provider.ts';
import { DEFAULT_EGRESS_POLICY, type AiProvider } from '@asdp/ai';
import { createMemoryRecordingStore, createReplayProvider } from '@asdp/eval';
import type { Database } from './persistence/db.ts';

// ---------------------------------------------------------------------------
// Harness — the REAL application graph, on a DURABLE dataDir that survives close
// ---------------------------------------------------------------------------

const DOC = [
  '# Licence renewal',
  '',
  '## 1. Eligibility',
  'The applicant must submit the renewal request within ninety days of expiry.',
  '',
  '## 2. Review',
  'The reviewing officer must complete the review within three working days.',
  '',
  '## 3. Outcome',
  'A renewal is rejected when the establishment has an unpaid penalty.',
].join('\n');

interface Server extends RunningApp {
  readonly database: Database;
}

function replayOverStub(promptVersion: string): AiProvider {
  return createReplayProvider({
    inner: createAuthoredStubProvider(),
    store: createMemoryRecordingStore(),
    mode: 'record',
    corpusId: 'h5',
    taskContext: { promptVersion, classification: 'INTERNAL' },
    clock: systemClock(),
  });
}

function brokerOptions(ids: { next(prefix: string): string }, promptVersion: string) {
  const provider = replayOverStub(promptVersion);
  return {
    broker: {
      providers: [provider],
      policy: DEFAULT_EGRESS_POLICY,
      routing: { defaultPreferenceOrder: [provider.id] },
      clock: systemClock(),
      ids,
    },
    mode: 'replay' as const,
    project: { allowExternalProviders: true, classificationCeiling: 'CONFIDENTIAL' as const },
  };
}

/**
 * Boot the application against a durable directory.
 *
 * **The generator is constructed fresh on every boot**, exactly as a new process
 * would construct it. That is what makes this a restart rather than a reconnect,
 * and it is the whole point: a generator that remembered anything would pass
 * these tests for the wrong reason.
 */
async function boot(dataDir: string, blobRoot: string): Promise<Server> {
  const config = loadConfig({ PORT: '0', ASDP_LOG_LEVEL: 'error', ASDP_BLOB_ROOT: blobRoot });
  const database = await createPgliteDatabase({ dataDir });
  await migrate(database);
  const blobStore = await createFilesystemBlobStore({ rootDirectory: blobRoot });
  const clock = systemClock();
  const ids = durableIdGenerator(clock, randomBytes);
  const running = await listen(
    {
      config,
      database,
      blobStore,
      clock,
      ids,
      evidenceExtractor: createBrokerEvidenceExtractor(brokerOptions(ids, 'extract-evidence@1')),
      framePopulator: createBrokerFramePopulator(brokerOptions(ids, 'populate-frame@1')),
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

async function durablePaths(): Promise<{ dataDir: string; blobRoot: string }> {
  return {
    dataDir: await mkdtemp(join(tmpdir(), 'asdp-h5-db-')),
    blobRoot: await mkdtemp(join(tmpdir(), 'asdp-h5-blob-')),
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
const asApprover = { 'x-asdp-subject': 'u-approver', 'x-asdp-roles': 'BusinessApprover' };

let sequence = 0;

async function projectWithProposals(
  s: Server,
  label: string,
): Promise<{ projectId: string; setId: string }> {
  sequence += 1;
  const created = await call(
    s, 'POST', '/projects',
    { key: `h5-${label}-${Date.now()}-${sequence}`, name: `H5 ${label}` }, asAdmin,
  );
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const projectId = created.json.id;

  const ingested = await call(
    s, 'POST', `/projects/${projectId}/sources`, { filename: 'brd.md', text: DOC }, asAnalyst,
  );
  assert.equal(ingested.status, 201, JSON.stringify(ingested.json));
  const extracted = await call(
    s, 'POST', `/projects/${projectId}/sources/${ingested.json.source.id}/extract-evidence`,
    undefined, asAnalyst,
  );
  assert.equal(extracted.status, 201, JSON.stringify(extracted.json));
  const populated = await call(
    s, 'POST', `/projects/${projectId}/populate-frame`, undefined, asAnalyst,
  );
  assert.equal(populated.status, 201, JSON.stringify(populated.json));
  return { projectId, setId: populated.json.requirementSetId };
}

async function makeReady(s: Server, projectId: string, setId: string): Promise<void> {
  const listed = await call(s, 'GET', `/projects/${projectId}/requirements`, undefined, asAnalyst);
  for (const requirement of listed.json.requirements) {
    const r = await call(
      s, 'POST', `/projects/${projectId}/requirements/${requirement.id}/review`,
      { action: 'accept' }, asAnalyst,
    );
    assert.equal(r.status, 200, JSON.stringify(r.json));
  }
  const coverage = await call(
    s, 'GET', `/projects/${projectId}/frame-coverage`, undefined, asAnalyst,
  );
  for (const slot of coverage.json.coverage.g1Blockers) {
    const r = await call(
      s, 'POST', `/projects/${projectId}/requirements/inferred`,
      {
        requirementSetId: setId,
        text: `The business intends: ${slot}.`,
        rafSlot: slot,
        category: 'constraint',
        inferenceRationale: `No source states ${slot}; recorded from the sponsor interview.`,
      },
      asAnalyst,
    );
    assert.equal(r.status, 201, JSON.stringify(r.json));
  }
  const withInferred = await call(
    s, 'GET', `/projects/${projectId}/requirements`, undefined, asAnalyst,
  );
  for (const requirement of withInferred.json.requirements) {
    if (requirement.derivation !== 'inferred') continue;
    const r = await call(
      s, 'POST', `/projects/${projectId}/requirements/${requirement.id}/confirm-inference`,
      {}, asAnalyst,
    );
    assert.equal(r.status, 200, JSON.stringify(r.json));
  }
}

/** A clock frozen at, or driven to, an exact instant. */
function fixedClock(iso: string): { nowIso(): string; set(next: string): void } {
  let current = iso;
  return { nowIso: () => current, set: (next) => { current = next; } };
}

// ---------------------------------------------------------------------------
// B1, B5 — restart durability, and the Phase 2 closure condition
// ---------------------------------------------------------------------------

describe('H5 restart durability', () => {
  test('THREE restarts against ONE durable database, a project created after each', async () => {
    // THE test. Before H5 the second boot failed on `prj-0001` and no further
    // project could ever be created in that database.
    const { dataDir, blobRoot } = await durablePaths();
    const ids: string[] = [];
    for (let boot_ = 1; boot_ <= 3; boot_++) {
      const s = await boot(dataDir, blobRoot);
      try {
        const created = await call(
          s, 'POST', '/projects', { key: `restart-${boot_}`, name: `boot ${boot_}` }, asAdmin,
        );
        assert.equal(created.status, 201, `boot ${boot_}: ${JSON.stringify(created.json)}`);
        ids.push(created.json.id);
      } finally {
        await s.close();
      }
    }
    assert.equal(new Set(ids).size, 3, `ids repeated across restarts: ${ids.join(', ')}`);

    // And all three survive in the one database.
    const s = await boot(dataDir, blobRoot);
    try {
      const rows = await s.database.query('select id from project order by id');
      assert.equal(rows.rows.length, 3, JSON.stringify(rows.rows));
    } finally {
      await s.close();
    }
  });

  test('B5: project A reaches G1, THE APPLICATION RESTARTS, project B reaches G1', async () => {
    // The Phase 2 closure condition itself: durable multi-project G1.
    const { dataDir, blobRoot } = await durablePaths();

    let first = await boot(dataDir, blobRoot);
    let aId: string;
    try {
      const a = await projectWithProposals(first, 'a');
      aId = a.projectId;
      await makeReady(first, a.projectId, a.setId);
      const approved = await call(first, 'POST', `/projects/${a.projectId}/g1/approve`, {}, asApprover);
      assert.equal(approved.status, 201, JSON.stringify(approved.json));
      assert.equal(approved.json.gateStatus, 'approved');
    } finally {
      await first.close();
    }

    // --- restart: new process, new generator, same database -----------------
    const second = await boot(dataDir, blobRoot);
    try {
      const b = await projectWithProposals(second, 'b');
      assert.notEqual(b.projectId, aId);
      await makeReady(second, b.projectId, b.setId);
      const approved = await call(second, 'POST', `/projects/${b.projectId}/g1/approve`, {}, asApprover);
      assert.equal(approved.status, 201, JSON.stringify(approved.json));
      assert.equal(approved.json.gateStatus, 'approved');

      // Project A's gate is still approved, and both baselines coexist.
      const gatesA = await call(second, 'GET', `/projects/${aId}/gates`, undefined, asAnalyst);
      assert.equal((gatesA.json as any[]).find((g) => g.code === 'G1').status, 'approved');
      const baselines = await second.database.query('select project_id from baseline');
      assert.ok(baselines.rows.length >= 2, JSON.stringify(baselines.rows));
    } finally {
      await second.close();
    }
  });

  test('B1 holds for NON-project entities too — sources and evidence across a restart', async () => {
    // Proves durability is a property of the generator, not of one table.
    const { dataDir, blobRoot } = await durablePaths();
    const sourceIds: string[] = [];
    let projectId = '';
    for (let boot_ = 1; boot_ <= 2; boot_++) {
      const s = await boot(dataDir, blobRoot);
      try {
        if (boot_ === 1) {
          const created = await call(
            s, 'POST', '/projects', { key: 'multi-entity', name: 'multi' }, asAdmin,
          );
          assert.equal(created.status, 201);
          projectId = created.json.id;
        }
        // The TEXT must differ per boot, not just the filename: identical bytes
        // deduplicate to one source within a project by design
        // (`source.deduplicated`), so reusing DOC would return the existing row
        // and the test would measure deduplication rather than durability.
        const ingested = await call(
          s, 'POST', `/projects/${projectId}/sources`,
          { filename: `doc-${boot_}.md`, text: `${DOC}\n\n## Appendix ${boot_}\nBoot ${boot_} only.` },
          asAnalyst,
        );
        assert.equal(ingested.status, 201, `boot ${boot_}: ${JSON.stringify(ingested.json)}`);
        assert.notEqual(
          ingested.json.deduplicated, true,
          `boot ${boot_} deduplicated; the fixture must present new bytes`,
        );
        sourceIds.push(ingested.json.source.id);
        const extracted = await call(
          s, 'POST', `/projects/${projectId}/sources/${ingested.json.source.id}/extract-evidence`,
          undefined, asAnalyst,
        );
        assert.equal(extracted.status, 201, JSON.stringify(extracted.json));
      } finally {
        await s.close();
      }
    }
    assert.equal(new Set(sourceIds).size, 2, `source ids repeated: ${sourceIds.join(', ')}`);
  });
});

// ---------------------------------------------------------------------------
// B2, B6 — multi-instance, ordering, and the clock
// ---------------------------------------------------------------------------

describe('H5 generator properties', () => {
  test('B2: two independent generators mint 50 000 ids each with ZERO collisions', async () => {
    const clock = systemClock();
    const a = durableIdGenerator(clock, randomBytes);
    const b = durableIdGenerator(clock, randomBytes);
    const seen = new Set<string>();
    let total = 0;
    for (let i = 0; i < 50_000; i++) {
      seen.add(a.next('aud'));
      seen.add(b.next('aud'));
      total += 2;
    }
    assert.equal(seen.size, total, `${total - seen.size} collisions across two instances`);
  });

  test('B6: 10 000 ids minted inside ONE millisecond sort EXACTLY in mint order', async () => {
    // The test a fresh-random suffix fails. Adjacent audit events share a
    // millisecond in the overwhelming majority of writes, so this is the normal
    // case rather than an edge case, and `order by at, id` depends on it.
    const clock = fixedClock('2026-08-24T12:00:00.000Z');
    const ids = durableIdGenerator(clock, randomBytes);
    const minted: string[] = [];
    for (let i = 0; i < 10_000; i++) minted.push(ids.next('aud'));

    assert.equal(new Set(minted).size, minted.length, 'ids within one millisecond must be unique');
    assert.deepEqual(
      minted, [...minted].sort(),
      'ids minted in one millisecond must sort in mint order',
    );
  });

  test('a CLOCK ROLLBACK does not produce lexical time regression within a process', async () => {
    const clock = fixedClock('2026-08-24T12:00:00.500Z');
    const ids = durableIdGenerator(clock, randomBytes);
    const before = ids.next('aud');

    clock.set('2026-08-24T12:00:00.400Z'); // NTP correction, 100ms backwards
    const after = ids.next('aud');
    assert.ok(after > before, `clock rollback produced a regressing id: ${before} then ${after}`);

    clock.set('2026-08-24T11:59:00.000Z'); // a full minute backwards
    const wayBack = ids.next('aud');
    assert.ok(wayBack > after, `large rollback regressed: ${after} then ${wayBack}`);

    // And time moving forward again still works.
    clock.set('2026-08-24T12:00:01.000Z');
    assert.ok(ids.next('aud') > wayBack);
  });

  test('ids are fixed width, prefixed, and Crockford base32 throughout', async () => {
    const ids = durableIdGenerator(systemClock(), randomBytes);
    for (const prefix of ['aud', 'prj', 'src', 'bsl']) {
      const id = ids.next(prefix);
      assert.match(id, new RegExp(`^${prefix}-[0-9A-HJKMNP-TV-Z]{26}$`), id);
      assert.equal(id.length, prefix.length + 1 + 26);
    }
  });

  test('the generator is deterministic given a clock and an entropy source', async () => {
    // M9: state is ordering state. Two generators given the same inputs agree,
    // which is what makes the property testable at all.
    const seed = () => Uint8Array.from(Array.from({ length: 10 }, (_, i) => i + 1));
    const a = durableIdGenerator(fixedClock('2026-08-24T12:00:00.000Z'), seed);
    const b = durableIdGenerator(fixedClock('2026-08-24T12:00:00.000Z'), seed);
    assert.deepEqual(
      [a.next('aud'), a.next('aud'), a.next('aud')],
      [b.next('aud'), b.next('aud'), b.next('aud')],
    );
  });

  test('an empty prefix is refused rather than producing a bare id', async () => {
    const ids = durableIdGenerator(systemClock(), randomBytes);
    assert.throws(() => ids.next(''), /prefix may not be empty/);
  });
});

// ---------------------------------------------------------------------------
// B3, B4 — existing data and ADR-0017
// ---------------------------------------------------------------------------

describe('H5 backward compatibility', () => {
  test('B3: counter-format ids already persisted are read, extended and UNCHANGED', async () => {
    const { dataDir, blobRoot } = await durablePaths();

    // Seed a pre-H5 database directly: exactly the shape the counter produced.
    {
      const db = await createPgliteDatabase({ dataDir });
      await migrate(db);
      await db.query(
        `insert into project (id, key, name_json, description, settings_json, created_by, created_at)
         values ('prj-0001','legacy-project',$1,'',$2,'seed',$3)`,
        [JSON.stringify({ en: 'legacy' }), JSON.stringify({}), '2026-08-24T00:00:00.000Z'],
      );
      await db.query(
        `insert into gate (project_id, code, status, policy_json, version)
         values ('prj-0001','G1','not_ready',$1,1)`,
        [JSON.stringify({})],
      );
      await db.close();
    }

    const s = await boot(dataDir, blobRoot);
    try {
      // The legacy row is untouched and still addressable.
      const legacy = await s.database.query('select id, key from project where id = $1', ['prj-0001']);
      assert.equal(legacy.rows.length, 1);
      assert.equal(String(legacy.rows[0]?.key), 'legacy-project');

      // A new project is created alongside it, under the new format.
      const created = await call(
        s, 'POST', '/projects', { key: 'modern-project', name: 'modern' }, asAdmin,
      );
      assert.equal(created.status, 201, JSON.stringify(created.json));
      assert.notEqual(created.json.id, 'prj-0001');
      assert.match(String(created.json.id), /^prj-[0-9A-HJKMNP-TV-Z]{26}$/);

      // Both coexist; nothing was renumbered.
      const all = await s.database.query('select id from project order by id');
      const ids = all.rows.map((r) => String(r.id));
      assert.equal(ids.length, 2);
      assert.ok(ids.includes('prj-0001'), `legacy id lost: ${ids.join(', ')}`);
    } finally {
      await s.close();
    }
  });

  test('B4: a baseline signed with counter-format ids rehashes IDENTICALLY', async () => {
    // No generated id is an input to `computeBaselineHash` except `projectId` as
    // a value, and no existing project id changes — so no signature can move.
    // Asserted by executing the hash, not by arguing it.
    const members = [
      { artifactId: 'REQ-0001', versionId: 'REQ-0001@1', contentHash: textContentHash('first') },
      { artifactId: 'REQ-0002', versionId: 'REQ-0002@2', contentHash: textContentHash('second') },
    ];
    const input = {
      projectId: 'prj-0001', // a legacy, counter-format project id
      stage: 'requirements' as const,
      members,
      rafVersion: 'raf-1.1',
      rulePackVersion: 'rp-1.2',
      camundaTargetProfileId: 'camunda-8x-baseline',
    };
    const before = freezeBaseline('bl-0001', input, '2026-08-24T00:00:00.000Z');
    const after = freezeBaseline(
      'bsl-01K3PSGXVQ7YB4WQ2M0RN8T3ZF', // a new-format baseline id
      input,
      '2026-08-24T00:00:00.000Z',
    );
    assert.equal(
      after.contentHash, before.contentHash,
      'the baseline id must not be an input to the signature',
    );
    for (const member of after.members) {
      assert.match(member.artifactId, /^REQ-[0-9]{4,}$/);
    }
  });

  test('REQ-#### is untouched — still allocated per project from the database', async () => {
    // M6. H5 must not disturb class 1, which was already durable.
    const { dataDir, blobRoot } = await durablePaths();
    const s = await boot(dataDir, blobRoot);
    try {
      const a = await projectWithProposals(s, 'req');
      const listed = await call(
        s, 'GET', `/projects/${a.projectId}/requirements`, undefined, asAnalyst,
      );
      const ids: string[] = listed.json.requirements.map((r: any) => r.id).sort();
      assert.ok(ids.includes('REQ-0001'), `requirement ids are not REQ-####: ${ids.join(', ')}`);
      for (const id of ids) assert.match(id, /^REQ-[0-9]{4,}$/);
    } finally {
      await s.close();
    }
  });
});
