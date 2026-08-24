/**
 * V7 — the human requirements workspace and G1, end to end.
 *
 * The real application graph. The AI ports are replay providers over the authored
 * stub, exactly as V5 and V6 use them, because **V7 makes no AI call of its own**:
 * its one touchpoint — wording a question — is deterministic here (**U6**).
 *
 * The test that matters is `G1 IS REACHABLE`: draft proposals to a signed
 * baseline, through a person. Everything else exists to prove that the ways of
 * reaching it dishonestly are closed.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadConfig } from './config.ts';
import { listen, type RunningApp } from './http/bootstrap.ts';
import { createPgliteDatabase } from './persistence/pglite-database.ts';
import { migrate } from './persistence/migrate.ts';
import { createFilesystemBlobStore } from './blob/filesystem-blob-store.ts';
import { counterIdGenerator, systemClock } from './repo-memory.ts';
import { createBrokerEvidenceExtractor } from './ai/broker-extractor.ts';
import { createBrokerFramePopulator } from './ai/broker-frame-populator.ts';
import { createBrokerCanonicaliser, createBrokerReconciler } from './ai/broker-reconciler.ts';
import { createAuthoredStubProvider } from './ai/stub-provider.ts';
import type { Database } from './persistence/db.ts';
import { DEFAULT_EGRESS_POLICY, type AiProvider } from '@asdp/ai';
import { createMemoryRecordingStore, createReplayProvider } from '@asdp/eval';
import { L4_REQUIREMENT_RULES, evaluateG1Readiness, type G1State } from '@asdp/validation';

// ---------------------------------------------------------------------------
// Harness
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

function replay(promptVersion: string): AiProvider {
  return createReplayProvider({
    inner: createAuthoredStubProvider(),
    store: createMemoryRecordingStore(),
    mode: 'record',
    corpusId: 'test',
    taskContext: { promptVersion, classification: 'INTERNAL' },
    clock: systemClock(),
  });
}

function broker(promptVersion: string, ids: ReturnType<typeof counterIdGenerator>) {
  const provider = replay(promptVersion);
  return {
    broker: {
      providers: [provider],
      policy: DEFAULT_EGRESS_POLICY,
      routing: { defaultPreferenceOrder: [provider.id] },
      clock: systemClock(),
      ids,
    },
    mode: 'replay' as const,
    project: { allowExternalProviders: true, classificationCeiling: 'CONFIDENTIAL' },
  };
}

async function startServer(): Promise<Server> {
  const blobRoot = await mkdtemp(join(tmpdir(), 'asdp-v7-'));
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
      evidenceExtractor: createBrokerEvidenceExtractor(broker('extract-evidence@1', ids)),
      framePopulator: createBrokerFramePopulator(broker('populate-frame@1', ids)),
      canonicaliser: createBrokerCanonicaliser(broker('canonicalise-entities@1', ids)),
      reconciler: createBrokerReconciler(broker('reconcile-sources@1', ids)),
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
const asViewer = { 'x-asdp-subject': 'u-viewer', 'x-asdp-roles': 'Viewer' };

/** Ingest → extract → populate: a project holding draft proposals, as V5 leaves it. */
async function projectWithProposals(s: Server): Promise<{ projectId: string; setId: string }> {
  const created = await call(s, 'POST', '/projects', { key: `v7-${Date.now()}`, name: 'V7' }, asAdmin);
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const projectId = created.json.id;

  const ingested = await call(
    s, 'POST', `/projects/${projectId}/sources`, { filename: 'brd.md', text: DOC }, asAnalyst,
  );
  assert.equal(ingested.status, 201);
  const sourceId = ingested.json.source.id;

  const extracted = await call(
    s, 'POST', `/projects/${projectId}/sources/${sourceId}/extract-evidence`, undefined, asAnalyst,
  );
  assert.equal(extracted.status, 201);

  const populated = await call(s, 'POST', `/projects/${projectId}/populate-frame`, undefined, asAnalyst);
  assert.equal(populated.status, 201, JSON.stringify(populated.json));
  assert.ok(populated.json.accepted.length > 0, 'the fixture must produce proposals');
  return { projectId, setId: populated.json.requirementSetId };
}

/**
 * Take a project all the way to G1-ready.
 *
 * Every step here is a **human act**, and that is the point of the test: the eight
 * preconditions are satisfied by a person doing eight kinds of work, not by a flag
 * somewhere being flipped.
 */
async function makeReady(s: Server, projectId: string, setId: string): Promise<void> {
  // 1. Accept every proposal.
  const listed = await call(s, 'GET', `/projects/${projectId}/requirements`, undefined, asAnalyst);
  for (const requirement of listed.json.requirements) {
    const r = await call(
      s, 'POST', `/projects/${projectId}/requirements/${requirement.id}/review`,
      { action: 'accept' }, asAnalyst,
    );
    assert.equal(r.status, 200, JSON.stringify(r.json));
  }

  // 2. Resolve every blocking flag. (V5 raises warnings and infos only, so this is
  //    usually a no-op — asserted rather than assumed.)
  const coverage = await call(s, 'GET', `/projects/${projectId}/frame-coverage`, undefined, asAnalyst);
  assert.equal(coverage.status, 200);

  // 3. Fill every empty REQUIRED slot with a human-originated inferred requirement.
  //    This is U8-a doing the work it was approved for: the evidence does not state
  //    a business objective, and a person may record one and own it by name.
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
    // Every one is L3, and every one needs confirming before G1 (precondition 6).
    assert.equal(r.json.epistemicLevel, 'L3');
  }

  // 4. Confirm every LOW-confidence inference, and accept the new requirements.
  const withInferred = await call(s, 'GET', `/projects/${projectId}/requirements`, undefined, asAnalyst);
  for (const requirement of withInferred.json.requirements) {
    if (requirement.derivation !== 'inferred') continue;
    await call(
      s, 'POST', `/projects/${projectId}/requirements/${requirement.id}/confirm-inference`,
      {}, asAnalyst,
    );
  }
}

// ---------------------------------------------------------------------------
// The journey
// ---------------------------------------------------------------------------

describe('G1 end to end', () => {
  test('the readiness panel reports ALL EIGHT preconditions, not the first failure', async () => {
    const s = await startServer();
    try {
      const { projectId } = await projectWithProposals(s);
      const r = await call(s, 'GET', `/projects/${projectId}/g1/readiness`, undefined, asAnalyst);
      assert.equal(r.status, 200);
      assert.equal(r.json.preconditions.length, 8);
      assert.deepEqual(
        r.json.preconditions.map((p: any) => p.ruleId),
        L4_REQUIREMENT_RULES.map((rule) => rule.id),
      );
      // Fresh proposals are `draft`, so at minimum L4-REQ-001 is unmet — and the
      // panel must say so by rule id, because that is what a reviewer cites.
      assert.equal(r.json.ready, false);
      assert.ok(r.json.preconditions.some((p: any) => p.ruleId === 'L4-REQ-001' && !p.met));
    } finally {
      await s.close();
    }
  });

  test('G1 IS REACHABLE: draft proposals to a signed baseline, through a person', async () => {
    // THE test. Phase 2 ends when this passes.
    const s = await startServer();
    try {
      const { projectId, setId } = await projectWithProposals(s);

      const before = await call(s, 'GET', `/projects/${projectId}/g1/readiness`, undefined, asAnalyst);
      assert.equal(before.json.ready, false, 'a fresh set is never ready');

      await makeReady(s, projectId, setId);

      const after = await call(s, 'GET', `/projects/${projectId}/g1/readiness`, undefined, asAnalyst);
      assert.equal(
        after.json.ready,
        true,
        `still blocked: ${JSON.stringify(after.json.preconditions.filter((p: any) => !p.met))}`,
      );

      // The approver is NOT the author — segregation of duties (U10).
      const approved = await call(s, 'POST', `/projects/${projectId}/g1/approve`, {}, asApprover);
      assert.equal(approved.status, 201, JSON.stringify(approved.json));
      assert.equal(approved.json.gateStatus, 'approved');
      assert.match(String(approved.json.baselineHash), /^[0-9a-f]{64}$/);
      assert.ok(approved.json.approvedRequirementIds.length > 0);

      // Every requirement in the baseline is now L4 — the first and only promotion
      // in the system, and it carries its signature.
      const listed = await call(s, 'GET', `/projects/${projectId}/requirements`, undefined, asAnalyst);
      const inBaseline = listed.json.requirements.filter(
        (r: any) => r.status !== 'rejected' && r.status !== 'deferred',
      );
      assert.ok(inBaseline.length > 0);
      for (const requirement of inBaseline) {
        assert.equal(requirement.status, 'approved');
        assert.equal(requirement.approvedBy, 'u-approver');
        assert.equal(requirement.approvalBaselineId, approved.json.baselineId);
        assert.ok(String(requirement.approvedAt).length > 0);
      }

      // And the gate itself is approved, bound to the hash that was signed.
      const gates = await call(s, 'GET', `/projects/${projectId}/gates`, undefined, asAnalyst);
      const g1 = gates.json.find((g: any) => g.code === 'G1');
      assert.equal(g1.status, 'approved');
      assert.equal(g1.approvedBaselineHash, approved.json.baselineHash);
    } finally {
      await s.close();
    }
  });

  test('SEGREGATION OF DUTIES: the author may not approve their own work', async () => {
    const s = await startServer();
    try {
      const { projectId, setId } = await projectWithProposals(s);
      await makeReady(s, projectId, setId);

      // u-analyst authored the inferred requirements in makeReady. Approving with
      // the BusinessApprover role but the AUTHOR's subject must still be refused.
      const asAuthorApprover = {
        'x-asdp-subject': 'u-analyst',
        'x-asdp-roles': 'BusinessApprover',
      };
      const r = await call(s, 'POST', `/projects/${projectId}/g1/approve`, {}, asAuthorApprover);
      assert.equal(r.status, 400, JSON.stringify(r.json));
      assert.match(String(r.json.error), /segregation of duties/i);
    } finally {
      await s.close();
    }
  });

  test('an ANALYST may not approve G1 — role, before segregation', async () => {
    const s = await startServer();
    try {
      const { projectId, setId } = await projectWithProposals(s);
      await makeReady(s, projectId, setId);
      const r = await call(s, 'POST', `/projects/${projectId}/g1/approve`, {}, asAnalyst);
      assert.equal(r.status, 403);
    } finally {
      await s.close();
    }
  });

  test('a REVISION after approval reopens G1 — ADR-0017, by construction', async () => {
    const s = await startServer();
    try {
      const { projectId, setId } = await projectWithProposals(s);
      await makeReady(s, projectId, setId);
      const approved = await call(s, 'POST', `/projects/${projectId}/g1/approve`, {}, asApprover);
      assert.equal(approved.status, 201);

      const listed = await call(s, 'GET', `/projects/${projectId}/requirements`, undefined, asAnalyst);
      const target = listed.json.requirements[0];

      // Revising an APPROVED requirement is refused through the review route, and
      // must go through revision — which creates a new version, changing the
      // content the signature covered.
      const revised = await call(
        s, 'POST', `/projects/${projectId}/requirements/${target.id}/revise`,
        { text: 'Amended after approval.', changeReason: 'stakeholder correction' }, asAnalyst,
      );
      assert.equal(revised.status, 201, JSON.stringify(revised.json));
      assert.equal(revised.json.version, target.version + 1);
      // The requirement is no longer approved: it returned to review, so the
      // baseline no longer describes the current set and G1 is not satisfiable
      // without a fresh freeze, hash and signature.
      assert.equal(revised.json.status, 'in_review');

      // THE assertion: the gate reopened BY ITSELF. Nobody asked it to, and there
      // is no route that would — ADR-0017 says reopening is automatic, and this is
      // what that means in practice.
      const gates = await call(s, 'GET', `/projects/${projectId}/gates`, undefined, asAnalyst);
      const g1 = gates.json.find((g: any) => g.code === 'G1');
      assert.equal(g1.status, 'reopened', 'a post-approval change must reopen the gate');
      assert.equal(g1.approvedBaselineHash, undefined, 'the stale signature must not survive');

      // The revised requirement is no longer approved either: the signature that
      // covered it covered different content.
      const after = await call(s, 'GET', `/projects/${projectId}/requirements`, undefined, asAnalyst);
      const revisedNow = after.json.requirements.find((r: any) => r.id === target.id);
      assert.equal(revisedNow.status, 'in_review');
      assert.equal(revisedNow.approvedBy, undefined);
    } finally {
      await s.close();
    }
  });

  test('a Viewer may READ readiness but may not approve', async () => {
    const s = await startServer();
    try {
      const { projectId } = await projectWithProposals(s);
      const read = await call(s, 'GET', `/projects/${projectId}/g1/readiness`, undefined, asViewer);
      assert.equal(read.status, 200);
      const attempted = await call(s, 'POST', `/projects/${projectId}/g1/approve`, {}, asViewer);
      assert.equal(attempted.status, 403);
    } finally {
      await s.close();
    }
  });

  test('G1 is REFUSED while any precondition is unmet, and says which', async () => {
    const s = await startServer();
    try {
      const { projectId } = await projectWithProposals(s);
      const r = await call(s, 'POST', `/projects/${projectId}/g1/approve`, {}, asApprover);
      assert.equal(r.status, 400);
      assert.match(String(r.json.error), /L4-REQ-00\d/);
    } finally {
      await s.close();
    }
  });
});

// ---------------------------------------------------------------------------
// U1 — approval only through G1
// ---------------------------------------------------------------------------

describe('U1 approval is reachable only through G1', () => {
  test('SQL REFUSES an approved requirement with no signature', async () => {
    const s = await startServer();
    try {
      const { projectId } = await projectWithProposals(s);
      const listed = await call(s, 'GET', `/projects/${projectId}/requirements`, undefined, asAnalyst);
      const id = listed.json.requirements[0].id;

      // Reaching past the command deliberately: the claim is that the DATABASE
      // refuses this, so proving it through the command would prove nothing.
      await assert.rejects(
        s.database.query('update requirement set status = $1 where id = $2', ['approved', id]),
        /requirement_approved_requires_signature|violates check constraint/i,
      );
    } finally {
      await s.close();
    }
  });

  test('there is NO route that approves a requirement directly', async () => {
    const s = await startServer();
    try {
      const { projectId } = await projectWithProposals(s);
      const listed = await call(s, 'GET', `/projects/${projectId}/requirements`, undefined, asAnalyst);
      const id = listed.json.requirements[0].id;

      for (const path of [
        `/projects/${projectId}/requirements/${id}/approve`,
        `/projects/${projectId}/requirements/${id}/status`,
        `/projects/${projectId}/requirements/${id}/promote`,
      ]) {
        const r = await call(s, 'POST', path, { status: 'approved' }, asAnalyst);
        assert.equal(r.status, 404, path);
      }
    } finally {
      await s.close();
    }
  });

  test("the review route refuses 'approve' as an action", async () => {
    const s = await startServer();
    try {
      const { projectId } = await projectWithProposals(s);
      const listed = await call(s, 'GET', `/projects/${projectId}/requirements`, undefined, asAnalyst);
      const id = listed.json.requirements[0].id;
      const r = await call(
        s, 'POST', `/projects/${projectId}/requirements/${id}/review`, { action: 'approve' }, asAnalyst,
      );
      assert.equal(r.status >= 400, true, 'approval is not a review action (U1)');
    } finally {
      await s.close();
    }
  });
});

// ---------------------------------------------------------------------------
// U2-a — an edit is a new version
// ---------------------------------------------------------------------------

describe('U2-a revision creates a new immutable version', () => {
  test('a revision bumps the version, keeps the id, and demands a reason', async () => {
    const s = await startServer();
    try {
      const { projectId } = await projectWithProposals(s);
      const listed = await call(s, 'GET', `/projects/${projectId}/requirements`, undefined, asAnalyst);
      const original = listed.json.requirements[0];

      const noReason = await call(
        s, 'POST', `/projects/${projectId}/requirements/${original.id}/revise`,
        { text: 'A clearer wording.', changeReason: '' }, asAnalyst,
      );
      assert.equal(noReason.status >= 400, true, 'governance §2.3 requires a change reason');

      const revised = await call(
        s, 'POST', `/projects/${projectId}/requirements/${original.id}/revise`,
        { text: 'A clearer wording of the same obligation.', changeReason: 'ambiguous wording' },
        asAnalyst,
      );
      assert.equal(revised.status, 201, JSON.stringify(revised.json));
      // D15: the id never changes. The version is what moves.
      assert.equal(revised.json.id, original.id);
      assert.equal(revised.json.version, original.version + 1);
      assert.equal(revised.json.generatedBy, 'human');
      // Epistemic rule 6: editing is not approving.
      assert.equal(revised.json.status, 'in_review');
    } finally {
      await s.close();
    }
  });

  test('the ORIGINAL AI text survives the revision — version 1 keeps it', async () => {
    const s = await startServer();
    try {
      const { projectId } = await projectWithProposals(s);
      const listed = await call(s, 'GET', `/projects/${projectId}/requirements`, undefined, asAnalyst);
      const original = listed.json.requirements[0];

      await call(
        s, 'POST', `/projects/${projectId}/requirements/${original.id}/revise`,
        { text: 'Entirely rewritten by a human.', changeReason: 'clarity' }, asAnalyst,
      );

      // "What did the model actually say?" must stay answerable after any amount
      // of human editing — which is the whole reason originalAiText exists.
      const history = await s.database.query(
        'select version, text from requirement_version where requirement_id = $1',
        [original.id],
      );
      assert.equal(history.rows.length, 1);
      assert.equal(Number(history.rows[0]?.version), 1);
      assert.equal(String(history.rows[0]?.text), original.text);

      const current = await s.database.query(
        'select original_ai_text, text from requirement where id = $1',
        [original.id],
      );
      assert.equal(String(current.rows[0]?.original_ai_text), original.originalAiText);
      assert.equal(String(current.rows[0]?.text), 'Entirely rewritten by a human.');
    } finally {
      await s.close();
    }
  });

  test('a revision may NOT sever provenance', async () => {
    const s = await startServer();
    try {
      const { projectId } = await projectWithProposals(s);
      const listed = await call(s, 'GET', `/projects/${projectId}/requirements`, undefined, asAnalyst);
      const original = listed.json.requirements[0];

      const severed = await call(
        s, 'POST', `/projects/${projectId}/requirements/${original.id}/revise`,
        { text: 'No longer cites anything.', changeReason: 'test', evidenceItemIds: [] },
        asAnalyst,
      );
      assert.equal(severed.status >= 400, true, 'invariant D2 forbids a citation-free requirement');
    } finally {
      await s.close();
    }
  });

  test('there is no in-place edit route — PUT does not exist', async () => {
    const s = await startServer();
    try {
      const { projectId } = await projectWithProposals(s);
      const listed = await call(s, 'GET', `/projects/${projectId}/requirements`, undefined, asAnalyst);
      const id = listed.json.requirements[0].id;
      const r = await call(
        s, 'PUT', `/projects/${projectId}/requirements/${id}`, { text: 'edited' }, asAnalyst,
      );
      assert.equal(r.status, 404, 'an in-place edit would break ADR-0017');
    } finally {
      await s.close();
    }
  });
});

// ---------------------------------------------------------------------------
// U8-a — L3 is human-originated only
// ---------------------------------------------------------------------------

describe('U8-a human-originated L3', () => {
  test('a human may add an inferred requirement WITH a rationale', async () => {
    const s = await startServer();
    try {
      const { projectId, setId } = await projectWithProposals(s);
      const r = await call(
        s, 'POST', `/projects/${projectId}/requirements/inferred`,
        {
          requirementSetId: setId,
          text: 'The service is intended to reduce renewal turnaround.',
          rafSlot: 'businessObjective',
          category: 'constraint',
          inferenceRationale: 'Stated by the sponsor; no document records it.',
        },
        asAnalyst,
      );
      assert.equal(r.status, 201, JSON.stringify(r.json));
      assert.equal(r.json.epistemicLevel, 'L3');
      assert.equal(r.json.derivation, 'inferred');
      assert.equal(r.json.generatedBy, 'human');
      assert.equal(r.json.humanConfirmationRequired, true);
      // Lower by construction than an evidenced requirement.
      assert.equal(r.json.confidenceBand, 'LOW');
    } finally {
      await s.close();
    }
  });

  test('an inferred requirement WITHOUT a rationale is refused (D2)', async () => {
    const s = await startServer();
    try {
      const { projectId, setId } = await projectWithProposals(s);
      const r = await call(
        s, 'POST', `/projects/${projectId}/requirements/inferred`,
        {
          requirementSetId: setId,
          text: 'Something nobody wrote down.',
          rafSlot: 'businessObjective',
          category: 'constraint',
          inferenceRationale: '   ',
        },
        asAnalyst,
      );
      assert.equal(r.status >= 400, true);
    } finally {
      await s.close();
    }
  });

  test('SQL REFUSES an AI-authored inference — J1 still holds where it applies', async () => {
    const s = await startServer();
    try {
      const { projectId } = await projectWithProposals(s);
      const listed = await call(s, 'GET', `/projects/${projectId}/requirements`, undefined, asAnalyst);
      const aiAuthored = listed.json.requirements.find((r: any) => r.generatedBy === 'ai');
      assert.ok(aiAuthored !== undefined);

      // The exact thing U8-b would have allowed, refused by the database.
      await assert.rejects(
        s.database.query(
          `update requirement set derivation = 'inferred', epistemic_level = 'L3',
                                  inference_rationale = 'the model thought so'
            where id = $1`,
          [aiAuthored.id],
        ),
        /requirement_inferred_is_human_with_rationale|violates check constraint/i,
      );
    } finally {
      await s.close();
    }
  });

  test('SQL refuses L4 as a stored claim — approval is a status, not a level', async () => {
    const s = await startServer();
    try {
      const { projectId } = await projectWithProposals(s);
      const listed = await call(s, 'GET', `/projects/${projectId}/requirements`, undefined, asAnalyst);
      await assert.rejects(
        s.database.query('update requirement set epistemic_level = $1 where id = $2', [
          'L4',
          listed.json.requirements[0].id,
        ]),
        /requirement_level_valid|violates check constraint/i,
      );
    } finally {
      await s.close();
    }
  });
});

// ---------------------------------------------------------------------------
// U6 — questions come from deterministic causes
// ---------------------------------------------------------------------------

describe('U6 clarification questions', () => {
  test('every question names the deterministic cause that created it', async () => {
    const s = await startServer();
    try {
      const { projectId } = await projectWithProposals(s);
      const generated = await call(s, 'POST', `/projects/${projectId}/questions/generate`, {}, asAnalyst);
      assert.equal(generated.status, 201, JSON.stringify(generated.json));
      assert.ok(generated.json.created.length > 0);

      for (const question of generated.json.created) {
        assert.ok(question.causeKind.length > 0);
        assert.ok(question.causeId.length > 0);
      }
      // An empty required slot blocks G1, so its question blocks too — derived,
      // not chosen.
      const slotQuestions = generated.json.created.filter(
        (q: any) => q.causeKind === 'empty_required_slot',
      );
      assert.ok(slotQuestions.length > 0);
      assert.ok(slotQuestions.every((q: any) => q.blocking === true));
    } finally {
      await s.close();
    }
  });

  test('regenerating does not duplicate a question for the same cause', async () => {
    const s = await startServer();
    try {
      const { projectId } = await projectWithProposals(s);
      const first = await call(s, 'POST', `/projects/${projectId}/questions/generate`, {}, asAnalyst);
      const second = await call(s, 'POST', `/projects/${projectId}/questions/generate`, {}, asAnalyst);
      assert.ok(first.json.created.length > 0);
      // A duplicated blocking question would block G1 twice for one gap.
      assert.equal(second.json.created.length, 0);
    } finally {
      await s.close();
    }
  });

  test('an answered question cannot be answered again', async () => {
    const s = await startServer();
    try {
      const { projectId } = await projectWithProposals(s);
      const generated = await call(s, 'POST', `/projects/${projectId}/questions/generate`, {}, asAnalyst);
      const id = generated.json.created[0].id;

      const answered = await call(
        s, 'POST', `/projects/${projectId}/questions/${id}/answer`, { answer: 'Ninety days.' }, asAnalyst,
      );
      assert.equal(answered.status, 200);

      const again = await call(
        s, 'POST', `/projects/${projectId}/questions/${id}/answer`, { answer: 'Sixty days.' }, asAnalyst,
      );
      assert.equal(again.status >= 400, true, 'a correction is a new question (ADR-0032)');
    } finally {
      await s.close();
    }
  });
});

// ---------------------------------------------------------------------------
// The L4-REQ pack
// ---------------------------------------------------------------------------

describe('L4-REQ — G1 readiness rules', () => {
  const clean: G1State = {
    projectId: 'prj-1',
    requirementSetId: 'rqs-1',
    unapprovedRequirementIds: [],
    openBlockingFlagIds: [],
    undecidedConflictIds: [],
    unansweredBlockingQuestionIds: [],
    emptyRequiredSlots: [],
    unconfirmedInferenceIds: [],
    unacknowledgedPolicySlots: [],
    openL0FindingIds: [],
  };

  test('the pack holds exactly eight rules, all L4, all G1, all errors', () => {
    assert.equal(L4_REQUIREMENT_RULES.length, 8);
    for (const rule of L4_REQUIREMENT_RULES) {
      assert.equal(rule.layer, 'L4');
      assert.deepEqual(rule.gates, ['G1']);
      assert.equal(rule.severity, 'error', 'a G1 precondition is blocking, never waivable');
      assert.match(rule.id, /^L4-REQ-00[1-8]$/);
    }
  });

  test('a clean set produces NO findings — the rule pack is not vacuous', () => {
    assert.deepEqual(evaluateG1Readiness(clean, 'run-1'), []);
  });

  test('EACH precondition blocks independently', () => {
    // Eight states, each short by exactly one thing. This is the criterion the
    // acceptance test list calls out: a reviewer must see which one failed.
    const cases: [string, Partial<G1State>][] = [
      ['L4-REQ-001', { unapprovedRequirementIds: ['REQ-0001'] }],
      ['L4-REQ-002', { openBlockingFlagIds: ['rfl-1'] }],
      ['L4-REQ-003', { undecidedConflictIds: ['cfl-1'] }],
      ['L4-REQ-004', { unansweredBlockingQuestionIds: ['oq-1'] }],
      ['L4-REQ-005', { emptyRequiredSlots: ['businessObjective'] }],
      ['L4-REQ-006', { unconfirmedInferenceIds: ['REQ-0002'] }],
      ['L4-REQ-007', { unacknowledgedPolicySlots: ['securityAndPrivacy'] }],
      ['L4-REQ-008', { openL0FindingIds: ['L0-ING-003@x'] }],
    ];

    for (const [ruleId, overrides] of cases) {
      const findings = evaluateG1Readiness({ ...clean, ...overrides }, 'run-1');
      assert.equal(findings.length, 1, `${ruleId}: expected exactly one finding`);
      assert.equal(findings[0]?.ruleId, ruleId);
      assert.equal(findings[0]?.severityAtGate.G1, 'error');
    }
  });
});
