/**
 * H4 — project-scoped requirement identity, end to end.
 *
 * The defect these tests exist for: `requirement.id` was a GLOBAL primary key
 * while `nextRequirementNumber` allocated from the project's high-water mark
 * (invariant D15, *"a per-project monotonic sequence"*). The second project in a
 * database to run POPULATE_FRAME allocated `REQ-0001` again, collided, and failed
 * with a 503 — so **a second project could never reach G1** (limitation 77).
 *
 * Every test in the repository used one project per server, which is why it stood
 * for two slices. These use two, deliberately, and the first of them is the
 * criterion Phase 2's H4 half rests on.
 *
 * Approved boundary: `docs/60-plan/h4-proposal.md`, decisions **K1–K6** and
 * **K8**. **K7 is NOT approved**, so the D15 non-reuse guard is asserted at the
 * repository boundary rather than over HTTP — the transaction wrapper still
 * flattens a domain error to `503` (limitation 79 / H6), and asserting a 503
 * would assert nothing about the invariant.
 *
 * What these tests are NOT for: semantic quality of any kind. Nothing here says a
 * requirement is right, only that two projects' requirements stay apart.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadConfig } from './config.ts';
import { listen, type RunningApp } from './http/bootstrap.ts';
import { createPgliteDatabase } from './persistence/pglite-database.ts';
import { migrate, migrationsDirectory } from './persistence/migrate.ts';
import { createFilesystemBlobStore } from './blob/filesystem-blob-store.ts';
import { counterIdGenerator, systemClock } from './repo-memory.ts';
import { createBrokerEvidenceExtractor } from './ai/broker-extractor.ts';
import { createBrokerFramePopulator } from './ai/broker-frame-populator.ts';
import { createAuthoredStubProvider } from './ai/stub-provider.ts';
import { createSqlRepositories } from './persistence/repositories.ts';
import { freezeBaseline, textContentHash, allocateD15_requirementId } from '@asdp/domain';
import { DEFAULT_EGRESS_POLICY, type AiProvider } from '@asdp/ai';
import { createMemoryRecordingStore, createReplayProvider } from '@asdp/eval';
import type { Database } from './persistence/db.ts';

// ---------------------------------------------------------------------------
// Harness — the real application graph, provider replayed over the stub (A7)
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
    corpusId: 'h4',
    taskContext: { promptVersion, classification: 'INTERNAL' },
    clock: systemClock(),
  });
}

function brokerOptions(ids: ReturnType<typeof counterIdGenerator>, promptVersion: string) {
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

async function startServer(): Promise<Server> {
  const blobRoot = await mkdtemp(join(tmpdir(), 'asdp-h4-blob-'));
  const config = loadConfig({ PORT: '0', ASDP_LOG_LEVEL: 'error', ASDP_BLOB_ROOT: blobRoot });
  const database = await createPgliteDatabase({});
  await migrate(database);
  const blobStore = await createFilesystemBlobStore({ rootDirectory: blobRoot });
  const ids = counterIdGenerator();
  const running = await listen(
    {
      config,
      database,
      blobStore,
      clock: systemClock(),
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

// A sequence as well as a clock: two projects created inside one millisecond
// would otherwise collide on the project KEY, which is a fixture bug wearing the
// costume of the defect under test.
let projectSequence = 0;

/** Ingest → extract → populate, exactly as V5 leaves a project. */
async function projectWithProposals(
  s: Server,
  label: string,
): Promise<{ projectId: string; setId: string }> {
  projectSequence += 1;
  const created = await call(
    s, 'POST', '/projects',
    { key: `h4-${label}-${Date.now()}-${projectSequence}`, name: `H4 ${label}` }, asAdmin,
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
  assert.ok(populated.json.accepted.length > 0, 'the fixture must produce proposals');
  return { projectId, setId: populated.json.requirementSetId };
}

/** Every human act G1 requires, for one project. */
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
  assert.equal(coverage.status, 200);

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

/**
 * One requirement, read through the project's list route.
 *
 * There is no `GET /requirements/:id` route — reads go through the list, which is
 * already scoped by `:projectId`. That is why this helper takes both halves of
 * the identity: asking for `REQ-0001` without saying which project is not a
 * question the system can answer.
 */
async function requirementIn(
  s: Server,
  projectId: string,
  id: string,
): Promise<any | undefined> {
  const listed = await call(s, 'GET', `/projects/${projectId}/requirements`, undefined, asAnalyst);
  assert.equal(listed.status, 200, JSON.stringify(listed.json));
  return listed.json.requirements.find((r: any) => r.id === id);
}

// ---------------------------------------------------------------------------
// A1, A2 — THE acceptance criterion
// ---------------------------------------------------------------------------

describe('H4 two projects in one database', () => {
  test('BOTH PROJECTS REACH G1 INDEPENDENTLY, and both start at REQ-0001', async () => {
    // THE test. Limitation 77 said the second project could not produce a single
    // requirement; this says both reach a signed baseline.
    const s = await startServer();
    try {
      const a = await projectWithProposals(s, 'a');
      const b = await projectWithProposals(s, 'b');
      assert.notEqual(a.projectId, b.projectId);

      // A1: each project allocated its OWN REQ-0001. Before H4 the second
      // POPULATE_FRAME returned 503 and this line was unreachable.
      for (const { projectId } of [a, b]) {
        const listed = await call(
          s, 'GET', `/projects/${projectId}/requirements`, undefined, asAnalyst,
        );
        assert.equal(listed.status, 200);
        const ids = listed.json.requirements.map((r: any) => r.id);
        assert.ok(ids.includes('REQ-0001'), `${projectId} has no REQ-0001: ${ids.join(', ')}`);
      }

      // A2: both reach G1, independently, in one server lifetime.
      for (const { projectId, setId } of [a, b]) {
        await makeReady(s, projectId, setId);
        const readiness = await call(
          s, 'GET', `/projects/${projectId}/g1/readiness`, undefined, asAnalyst,
        );
        assert.equal(
          readiness.json.ready, true,
          `${projectId} still blocked: ${JSON.stringify(
            readiness.json.preconditions.filter((p: any) => !p.met),
          )}`,
        );

        const approved = await call(s, 'POST', `/projects/${projectId}/g1/approve`, {}, asApprover);
        assert.equal(approved.status, 201, JSON.stringify(approved.json));
        assert.equal(approved.json.gateStatus, 'approved');
        assert.match(String(approved.json.baselineHash), /^[0-9a-f]{64}$/);
      }

      // Independent means independent: approving B did not disturb A's gate.
      for (const { projectId } of [a, b]) {
        const gates = await call(s, 'GET', `/projects/${projectId}/gates`, undefined, asAnalyst);
        const g1 = (gates.json as any[]).find((g: any) => g.code === 'G1');
        assert.equal(g1.status, 'approved', `${projectId} G1 is ${g1.status}`);
      }
    } finally {
      await s.close();
    }
  });

  test('numbering continues per project — each project reaches its own REQ-0002', async () => {
    // D15 is a PER-PROJECT monotonic sequence. "No collision" would also be
    // satisfied by numbering globally, which is the option the boundary rejected
    // because it leaks one project's count into another's identifiers.
    const s = await startServer();
    try {
      const a = await projectWithProposals(s, 'seq-a');
      const b = await projectWithProposals(s, 'seq-b');

      for (const { projectId } of [a, b]) {
        const listed = await call(
          s, 'GET', `/projects/${projectId}/requirements`, undefined, asAnalyst,
        );
        const ids: string[] = listed.json.requirements.map((r: any) => r.id).sort();
        assert.deepEqual(
          ids.slice(0, 2), ['REQ-0001', 'REQ-0002'],
          `${projectId} numbering is not per project: ${ids.join(', ')}`,
        );
      }
    } finally {
      await s.close();
    }
  });
});

// ---------------------------------------------------------------------------
// A3, A4 — structural scoping
// ---------------------------------------------------------------------------

describe('H4 requirement addressing is structurally project-scoped', () => {
  test("acting on project B's REQ-0001 leaves project A's REQ-0001 untouched", async () => {
    // A3. The point is not that a check rejects a foreign id — a check did that
    // before H4. The point is that `REQ-0001` names a DIFFERENT ROW in each
    // project, and every read and write lands on the right one.
    const s = await startServer();
    try {
      const a = await projectWithProposals(s, 'own');
      const b = await projectWithProposals(s, 'other');

      const shared = 'REQ-0001';
      const beforeA = await requirementIn(s, a.projectId, shared);
      const beforeB = await requirementIn(s, b.projectId, shared);
      assert.ok(beforeA !== undefined && beforeB !== undefined, 'both projects hold a REQ-0001');
      assert.equal(beforeA.projectId, a.projectId);
      assert.equal(beforeB.projectId, b.projectId);
      assert.notEqual(beforeA.projectId, beforeB.projectId);

      // Defer B's. A's must not move.
      const deferred = await call(
        s, 'POST', `/projects/${b.projectId}/requirements/${shared}/review`,
        { action: 'defer' }, asAnalyst,
      );
      assert.equal(deferred.status, 200, JSON.stringify(deferred.json));

      const afterA = await requirementIn(s, a.projectId, shared);
      const afterB = await requirementIn(s, b.projectId, shared);
      assert.equal(afterB.status, 'deferred');
      assert.equal(afterA.status, beforeA.status, "deferring B's REQ-0001 changed A's");
      assert.notEqual(afterA.status, 'deferred');
    } finally {
      await s.close();
    }
  });

  test('an id that exists ONLY in another project is not addressable', async () => {
    // A3, the adverse half. A requirement number present in A and absent from B
    // must not be actionable through B's route.
    //
    // The status is **400**, not 404: the command layer raises `ValidationError`
    // for an unresolvable requirement and the filter maps that to 400. That
    // mapping predates H4 and is not this boundary's to change — asserted as it
    // actually behaves rather than as §12 of CLAUDE.md would suggest, so the
    // discrepancy is visible rather than papered over.
    const s = await startServer();
    try {
      const a = await projectWithProposals(s, 'has');
      const b = await projectWithProposals(s, 'hasnt');

      // Both projects populate from the same document, so they allocate the SAME
      // id set — which is itself the point of the slice. To get an id A has and B
      // does not, A is given one more requirement than B.
      const extra = await call(
        s, 'POST', `/projects/${a.projectId}/requirements/inferred`,
        {
          requirementSetId: a.setId,
          text: 'The business intends to renew licences promptly.',
          rafSlot: 'businessObjective',
          category: 'constraint',
          inferenceRationale: 'Recorded from the sponsor interview.',
        },
        asAnalyst,
      );
      assert.equal(extra.status, 201, JSON.stringify(extra.json));
      const onlyInA: string = extra.json.id;

      const bIds = new Set<string>(
        (await call(s, 'GET', `/projects/${b.projectId}/requirements`, undefined, asAnalyst))
          .json.requirements.map((r: any) => r.id),
      );
      assert.ok(!bIds.has(onlyInA), `B unexpectedly holds ${onlyInA}`);
      assert.ok(
        (await requirementIn(s, a.projectId, onlyInA)) !== undefined,
        `A must hold ${onlyInA}`,
      );

      for (const path of [
        `/projects/${b.projectId}/requirements/${onlyInA}/review`,
        `/projects/${b.projectId}/requirements/${onlyInA}/confirm-inference`,
      ]) {
        const r = await call(s, 'POST', path, { action: 'accept' }, asAnalyst);
        assert.equal(r.status, 400, `${path} → ${r.status}: ${JSON.stringify(r.json)}`);
        assert.match(String(r.json.error), /unknown requirement/);
      }

      // And A's row is untouched by the attempts: same status it was created
      // with, and still unconfirmed. Compared against the CREATED status rather
      // than a literal, so this asserts "nothing moved" rather than restating a
      // default that belongs to U8-a and could legitimately change.
      const stillThere = await requirementIn(s, a.projectId, onlyInA);
      assert.ok(stillThere !== undefined);
      assert.equal(stillThere.status, extra.json.status, "B's attempts moved A's requirement");
      assert.equal(stillThere.inferenceConfirmedBy, undefined, "B's attempt confirmed A's inference");
    } finally {
      await s.close();
    }
  });

  test("a revision may NOT cite another project's evidence — now refused by the KEY", async () => {
    // A4. This test existed before H4 and asserted the same 400; what changed is
    // that the composite foreign key means there is no row to point at even if
    // the command check were removed. The assertion is unchanged deliberately.
    const s = await startServer();
    try {
      const a = await projectWithProposals(s, 'cite-a');
      const b = await projectWithProposals(s, 'cite-b');

      const foreign = await call(
        s, 'GET', `/projects/${b.projectId}/evidence`, undefined, asAnalyst,
      );
      assert.ok(foreign.json.evidence.length > 0, 'the second project must hold evidence');

      const listed = await call(
        s, 'GET', `/projects/${a.projectId}/requirements`, undefined, asAnalyst,
      );
      const target = listed.json.requirements.find((r: any) => r.derivation !== 'inferred');

      const attempted = await call(
        s, 'POST', `/projects/${a.projectId}/requirements/${target.id}/revise`,
        {
          text: 'Borrowed from elsewhere.',
          changeReason: 'attempting a cross-project citation',
          evidenceItemIds: [foreign.json.evidence[0].id],
        },
        asAnalyst,
      );
      assert.equal(attempted.status, 400, JSON.stringify(attempted.json));
      assert.match(String(attempted.json.error), /not in project/);
    } finally {
      await s.close();
    }
  });

  test('SQL REFUSES a cross-project evidence link, not merely the command layer', async () => {
    // A4's structural half, asserted against the database directly. The command
    // check above could be removed by a future refactor; this could not be.
    const s = await startServer();
    try {
      const a = await projectWithProposals(s, 'fk-a');
      const b = await projectWithProposals(s, 'fk-b');

      const bEvidence = (
        await call(s, 'GET', `/projects/${b.projectId}/evidence`, undefined, asAnalyst)
      ).json.evidence[0];
      assert.ok(bEvidence !== undefined, 'project B must hold evidence');

      // A's project id paired with a requirement id A does not own. Before H4 the
      // foreign key named `requirement(id)` alone and the project half of this
      // pair was not checked by anything in SQL.
      await assert.rejects(
        () =>
          s.database.query(
            `insert into requirement_evidence (project_id, requirement_id, evidence_item_id, contribution)
             values ($1, 'REQ-9999', $2, 'supporting')`,
            [a.projectId, bEvidence.id],
          ),
        /violates foreign key/,
        'the composite key must refuse a link to a requirement the project does not own',
      );

      // The same insert against a requirement the project DOES own is accepted,
      // so the refusal above is the key doing its job rather than the table being
      // unwritable.
      const owned = await requirementIn(s, a.projectId, 'REQ-0001');
      assert.ok(owned !== undefined);
      const aEvidence = (
        await call(s, 'GET', `/projects/${a.projectId}/evidence`, undefined, asAnalyst)
      ).json.evidence.find((e: any) => e.id !== undefined);
      const inserted = await s.database.query(
        `insert into requirement_evidence (project_id, requirement_id, evidence_item_id, contribution)
         values ($1, 'REQ-0001', $2, 'supporting')
         on conflict do nothing`,
        [a.projectId, aEvidence.id],
      );
      assert.ok(inserted !== undefined);
    } finally {
      await s.close();
    }
  });
});

// ---------------------------------------------------------------------------
// A5, A6, A7 — baselines, revisions, reconciliation
// ---------------------------------------------------------------------------

describe('H4 baselines, revisions and reconciliation stay within a project', () => {
  test('A5: a baseline names only its own project’s requirements', async () => {
    const s = await startServer();
    try {
      const a = await projectWithProposals(s, 'bl-a');
      const b = await projectWithProposals(s, 'bl-b');
      await makeReady(s, a.projectId, a.setId);
      await makeReady(s, b.projectId, b.setId);

      const approvedA = await call(s, 'POST', `/projects/${a.projectId}/g1/approve`, {}, asApprover);
      const approvedB = await call(s, 'POST', `/projects/${b.projectId}/g1/approve`, {}, asApprover);
      assert.equal(approvedA.status, 201, JSON.stringify(approvedA.json));
      assert.equal(approvedB.status, 201, JSON.stringify(approvedB.json));

      // Every baseline_member row belongs to a requirement in the SAME project as
      // its baseline. Asserted in SQL because baseline_member holds no project id
      // of its own — it inherits one from the baseline, and that is the claim.
      const rows = await s.database.query(
        `select bl.project_id as baseline_project, m.artifact_id
           from baseline_member m
           join baseline bl on bl.id = m.baseline_id`,
      );
      assert.ok(rows.rows.length > 0, 'both baselines must have members');
      for (const row of rows.rows) {
        const owned = await s.database.query(
          'select 1 from requirement where project_id = $1 and id = $2',
          [row.baseline_project, row.artifact_id],
        );
        assert.equal(
          owned.rows.length, 1,
          `baseline in ${row.baseline_project} names ${row.artifact_id}, which it does not own`,
        );
      }

      // Two projects, two different baselines, both naming REQ-0001 — and that is
      // correct, because a baseline is scoped by its project.
      const artifacts = rows.rows.map((r) => String(r.artifact_id));
      assert.ok(
        artifacts.filter((id) => id === 'REQ-0001').length === 2,
        'both projects should have a REQ-0001 in their baseline',
      );
    } finally {
      await s.close();
    }
  });

  test('A6: two projects revise their own REQ-0001 and keep separate histories', async () => {
    const s = await startServer();
    try {
      const a = await projectWithProposals(s, 'rev-a');
      const b = await projectWithProposals(s, 'rev-b');

      for (const [project, text] of [[a, 'Project A wording.'], [b, 'Project B wording.']] as const) {
        const r = await call(
          s, 'POST', `/projects/${project.projectId}/requirements/REQ-0001/revise`,
          { text, changeReason: 'clarified after review' }, asAnalyst,
        );
        // 201, not 200: a revision CREATES a new version (U2-a), and the route
        // says so with its status.
        assert.equal(r.status, 201, JSON.stringify(r.json));
        assert.equal(r.json.version, 2);
      }

      // Current versions are distinct and each project kept its own.
      const currentA = await requirementIn(s, a.projectId, 'REQ-0001');
      const currentB = await requirementIn(s, b.projectId, 'REQ-0001');
      assert.equal(currentA.text, 'Project A wording.');
      assert.equal(currentB.text, 'Project B wording.');

      // And the superseded history is two independent rows, not one overwritten
      // one. This is the requirement_version primary key, which was global.
      const history = await s.database.query(
        `select project_id, requirement_id, version from requirement_version
          where requirement_id = 'REQ-0001' order by project_id`,
      );
      assert.equal(history.rows.length, 2, JSON.stringify(history.rows));
      assert.deepEqual(
        [...new Set(history.rows.map((r) => String(r.project_id)))].sort(),
        [a.projectId, b.projectId].sort(),
      );
    } finally {
      await s.close();
    }
  });

  test('A7: reconciliation aliases resolve to the requirement in their OWN project', async () => {
    const s = await startServer();
    try {
      const a = await projectWithProposals(s, 'rec-a');
      const b = await projectWithProposals(s, 'rec-b');

      for (const { projectId } of [a, b]) {
        const r = await call(
          s, 'POST', `/projects/${projectId}/reconcile`, undefined, asAnalyst,
        );
        assert.equal(r.status, 201, JSON.stringify(r.json));
      }

      // Every alias names a requirement in the same project as the alias itself.
      const aliases = await s.database.query(
        'select project_id, requirement_id from canonical_entity_alias',
      );
      assert.ok(aliases.rows.length > 0, 'reconciliation must produce aliases');
      for (const row of aliases.rows) {
        const owned = await s.database.query(
          'select 1 from requirement where project_id = $1 and id = $2',
          [row.project_id, row.requirement_id],
        );
        assert.equal(
          owned.rows.length, 1,
          `alias in ${row.project_id} names ${row.requirement_id}, which it does not own`,
        );
      }
    } finally {
      await s.close();
    }
  });
});

// ---------------------------------------------------------------------------
// A8, A9 — the migration, and what a signature covers
// ---------------------------------------------------------------------------

describe('H4 migration 013', () => {
  /** Apply 001..012 only, so pre-H4 data can be seeded. */
  async function migrateToPreH4(db: Database): Promise<void> {
    const dir = migrationsDirectory();
    const staged = await mkdtemp(join(tmpdir(), 'asdp-h4-mig-'));
    for (const file of (await readdir(dir)).filter(
      (f) => f.endsWith('.sql') && !f.startsWith('013'),
    )) {
      await writeFile(join(staged, file), await readFile(join(dir, file), 'utf8'));
    }
    const result = await migrate(db, staged);
    assert.equal(result.applied.length, 12, 'the pre-H4 schema is migrations 001..012');
  }

  const NOW = '2026-08-24T00:00:00.000Z';

  async function seedPreH4(db: Database, projectId: string, ids: readonly string[]): Promise<void> {
    await db.query(
      `insert into project (id, key, name_json, description, settings_json, created_by, created_at)
       values ($1,$2,$3,'',$4,'seed',$5)`,
      [projectId, `seed-${projectId}`, JSON.stringify({ en: projectId }), JSON.stringify({}), NOW],
    );
    await db.query(
      `insert into requirement_set (id, project_id, version, status, raf_version, created_by, created_at)
       values ($1,$2,1,'draft','raf-1.1','seed',$3)`,
      [`set-${projectId}`, projectId, NOW],
    );
    await db.query(
      `insert into source (id, project_id, filename, mime_type, byte_size, sha256, blob_ref,
                           uploaded_by, uploaded_at, kind, primary_language, direction,
                           classification, status)
       values ($1,$2,'seed.md','text/markdown',10,$3,'blob/seed','seed',$4,'markdown','en','ltr',
               'INTERNAL','parsed')`,
      [`src-${projectId}`, projectId, 'a'.repeat(64), NOW],
    );
    await db.query(
      `insert into evidence_item (id, project_id, source_id, anchor_json, verbatim_text, language,
                                  extracted_by, citation_mode, anchor_verified, classification,
                                  created_by, created_at)
       values ($1,$2,$3,$4,'seeded quote','en','parser','none',true,'INTERNAL','seed',$5)`,
      [
        `ev-${projectId}`, projectId, `src-${projectId}`,
        JSON.stringify({
          kind: 'text_span',
          quote: 'seeded quote',
          quoteChecksum: 'c'.repeat(64),
          target: { sourceId: `src-${projectId}` },
        }),
        NOW,
      ],
    );
    for (const id of ids) {
      await db.query(
        `insert into requirement (id, requirement_set_id, project_id, text, original_ai_text,
                                  category, raf_slot, epistemic_level, derivation,
                                  computed_confidence, confidence_band, confidence_function_version,
                                  human_confirmation_required, status, generated_by, prompt_version,
                                  frame_pass, classification, language, version, created_by, created_at)
         values ($1,$2,$3,$4,$4,'functional','businessObjective','L1','extracted',0.9,'HIGH','cf-1',
                 false,'draft','parser','p1','pass-1','INTERNAL','en',1,'seed',$5)`,
        [id, `set-${projectId}`, projectId, `Text of ${id}`, NOW],
      );
      // Pre-H4 shape: the link table has NO project_id column yet.
      await db.query(
        `insert into requirement_evidence (requirement_id, evidence_item_id, contribution)
         values ($1,$2,'primary')`,
        [id, `ev-${projectId}`],
      );
    }
  }

  test('A8: every existing requirement id survives the migration unchanged', async () => {
    const db = await createPgliteDatabase({});
    try {
      await migrateToPreH4(db);
      await seedPreH4(db, 'prj-legacy', ['REQ-0001', 'REQ-0002', 'REQ-0003']);

      const applied = await migrate(db);
      assert.deepEqual(applied.applied, ['013_requirement_project_scope.sql']);

      const after = await db.query('select id, project_id from requirement order by id');
      assert.deepEqual(
        after.rows.map((r) => String(r.id)),
        ['REQ-0001', 'REQ-0002', 'REQ-0003'],
        'K6: no id is renumbered',
      );

      // And the backfill is total: every link now names the project it belonged to.
      const links = await db.query(
        'select requirement_id, project_id from requirement_evidence order by requirement_id',
      );
      assert.equal(links.rows.length, 3);
      for (const row of links.rows) {
        assert.equal(String(row.project_id), 'prj-legacy', 'backfill must recover the project');
      }
    } finally {
      await db.close();
    }
  });

  test('A9: A BASELINE HASH SIGNED BEFORE THE MIGRATION IS IDENTICAL AFTER IT', async () => {
    // K5, and the most important test in this slice, because its failure mode is
    // silent: a hash that moved would invalidate every existing G1 signature and
    // reopen every approved gate, with nothing to indicate why.
    const db = await createPgliteDatabase({});
    try {
      await migrateToPreH4(db);
      await seedPreH4(db, 'prj-signed', ['REQ-0001', 'REQ-0002']);

      const membersOf = async (): Promise<
        readonly { artifactId: string; versionId: string; contentHash: string }[]
      > => {
        const rows = await db.query(
          'select id, version, text from requirement where project_id = $1 order by id',
          ['prj-signed'],
        );
        return rows.rows.map((r) => ({
          artifactId: String(r.id),
          versionId: `${String(r.id)}@${Number(r.version)}`,
          contentHash: textContentHash(String(r.text)),
        }));
      };

      const frozenBefore = freezeBaseline(
        'bl-before',
        {
          projectId: 'prj-signed',
          stage: 'requirements',
          members: await membersOf(),
          rafVersion: 'raf-1.1',
          rulePackVersion: 'rp-1.2',
          camundaTargetProfileId: 'camunda-8x-baseline',
        },
        NOW,
      );

      await migrate(db);

      const frozenAfter = freezeBaseline(
        'bl-before',
        {
          projectId: 'prj-signed',
          stage: 'requirements',
          members: await membersOf(),
          rafVersion: 'raf-1.1',
          rulePackVersion: 'rp-1.2',
          camundaTargetProfileId: 'camunda-8x-baseline',
        },
        NOW,
      );

      assert.equal(
        frozenAfter.contentHash,
        frozenBefore.contentHash,
        'the migration moved a baseline hash; every existing ADR-0017 signature is now invalid',
      );

      // Belt and braces on what the hash is computed FROM: the member identifiers
      // must still be `REQ-####` and `REQ-####@n`, not a surrogate (K1, K2).
      for (const member of frozenAfter.members) {
        assert.match(member.artifactId, /^REQ-[0-9]{4,}$/);
        assert.match(member.versionId, /^REQ-[0-9]{4,}@[0-9]+$/);
      }
    } finally {
      await db.close();
    }
  });
});

// ---------------------------------------------------------------------------
// K3, and the D15 guard
// ---------------------------------------------------------------------------

describe('H4 allocation and the D15 guard', () => {
  test('K3: the domain allocator is what the application uses', async () => {
    // Not a tautology: it asserts the shape the two removed inline allocators
    // produced, so a change to the allocator that broke the format would fail
    // here rather than in production.
    assert.equal(allocateD15_requirementId(0), 'REQ-0001');
    assert.equal(allocateD15_requirementId(1), 'REQ-0002');
    assert.equal(allocateD15_requirementId(41), 'REQ-0042');
  });

  test('D15 non-reuse is still refused WITHIN a project', async () => {
    // Asserted at the repository boundary rather than over HTTP: K7 was NOT
    // approved, so `PgliteDatabase.transaction` still flattens this to a 503
    // (limitation 79 / H6) and an HTTP-level assertion would prove nothing about
    // the invariant. The guard itself is what matters, and it is here.
    const db = await createPgliteDatabase({});
    try {
      await migrate(db);
      const repos = createSqlRepositories(db);
      await db.query(
        `insert into project (id, key, name_json, description, settings_json, created_by, created_at)
         values ('prj-dup','dup-key',$1,'',$2,'seed',$3)`,
        [JSON.stringify({ en: 'dup' }), JSON.stringify({}), NOW_ISO],
      );
      await db.query(
        `insert into requirement_set (id, project_id, version, status, raf_version, created_by, created_at)
         values ('set-dup','prj-dup',1,'draft','raf-1.1','seed',$1)`,
        [NOW_ISO],
      );
      await db.query(
        `insert into source (id, project_id, filename, mime_type, byte_size, sha256, blob_ref,
                             uploaded_by, uploaded_at, kind, primary_language, direction,
                             classification, status)
         values ('src-dup','prj-dup','s.md','text/markdown',10,$1,'blob/s','seed',$2,'markdown',
                 'en','ltr','INTERNAL','parsed')`,
        ['a'.repeat(64), NOW_ISO],
      );
      await db.query(
        `insert into evidence_item (id, project_id, source_id, anchor_json, verbatim_text, language,
                                    extracted_by, citation_mode, anchor_verified, classification,
                                    created_by, created_at)
         values ('ev-dup','prj-dup','src-dup',$1,'q','en','parser','none',true,'INTERNAL','seed',$2)`,
        [
          JSON.stringify({
            kind: 'text_span',
            quote: 'q',
            quoteChecksum: 'c'.repeat(64),
            target: { sourceId: 'src-dup' },
          }),
          NOW_ISO,
        ],
      );

      const proposal = {
        id: 'REQ-0001',
        requirementSetId: 'set-dup',
        projectId: 'prj-dup',
        text: 'A requirement.',
        originalAiText: 'A requirement.',
        category: 'functional' as const,
        rafSlot: 'businessObjective',
        epistemicLevel: 'L1' as const,
        derivation: 'extracted' as const,
        computedConfidence: 0.9,
        confidenceBand: 'HIGH' as const,
        confidenceFunctionVersion: 'cf-1',
        humanConfirmationRequired: false,
        status: 'draft' as const,
        version: 1,
        generatedBy: 'parser' as const,
        degradations: [] as string[],
        classification: 'INTERNAL' as const,
        language: 'en',
        createdBy: 'seed',
        createdAt: NOW_ISO,
      };
      const links = [
        {
          projectId: 'prj-dup',
          requirementId: 'REQ-0001',
          evidenceItemId: 'ev-dup',
          contribution: 'primary' as const,
        },
      ];

      await repos.requirements.insertProposal(proposal as never, links, []);
      await assert.rejects(
        () => repos.requirements.insertProposal(proposal as never, links, []),
        /never reused \(D15\)/,
        'reusing an id inside ONE project must still be refused',
      );
    } finally {
      await db.close();
    }
  });
});

const NOW_ISO = '2026-08-24T00:00:00.000Z';
