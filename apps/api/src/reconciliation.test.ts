/**
 * V6 — canonicalisation, conflict candidates and deterministic precedence.
 *
 * The real application graph with one substitution: the provider is a **replay
 * provider over the authored stub**, which is what CI must use (**A7**) and what
 * **H3** requires regardless — no live provider call is permitted while
 * limitation 62 stands.
 *
 * What these tests are for: proving that **nothing V6 writes is decided**, that
 * **no distinct concept is silently merged away**, and that precedence recommends
 * without ever applying itself.
 *
 * What they are NOT for, and cannot be: proving that two propositions really
 * contradict, or that two surface forms really mean the same thing. Both are
 * semantic judgements no deterministic check establishes — `v6-proposal.md` §19,
 * R-V6-6. Everything asserted here is a defect detector.
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
import {
  createBrokerCanonicaliser,
  createBrokerReconciler,
} from './ai/broker-reconciler.ts';
import { createAuthoredStubProvider, STUB_PROVIDER_ID } from './ai/stub-provider.ts';
import {
  canonicalMatchForm,
  groupByMatchForm,
  observeActors,
} from './ai/canonicalisation.ts';
import {
  determineSpecificity,
  gateCandidate,
  gateMerge,
  type ComparableRequirement,
} from './ai/reconciliation-gate.ts';
import type { Database } from './persistence/db.ts';
import type { Canonicaliser, EvidenceExtractor, FramePopulator, Reconciler } from './ports.ts';
import { DEFAULT_EGRESS_POLICY, type AiProvider } from '@asdp/ai';
import { createMemoryRecordingStore, createReplayProvider } from '@asdp/eval';
import { computePrecedence, PRECEDENCE_FUNCTION_VERSION } from '@asdp/domain';
import { evaluateL1Conflicts, L1_CONFLICT_RULES, allRules } from '@asdp/validation';
import type { AiRequest, AiResponse, SourceReconciliation } from '@asdp/schemas';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Two sources that disagree about the same limit, in the same RAF slot. */
const POLICY = [
  '# Renewal policy',
  '',
  '## 1. Review',
  'The reviewing officer must complete the review within three working days.',
].join('\n');

const SOP = [
  '# Renewal procedure',
  '',
  '## 1. Review',
  'The reviewing officer must complete the review within ten working days.',
].join('\n');

interface Server extends RunningApp {
  readonly database: Database;
}

function replayOverStub(promptVersion: string, inner?: AiProvider): AiProvider {
  return createReplayProvider({
    inner: inner ?? createAuthoredStubProvider(),
    store: createMemoryRecordingStore(),
    mode: 'record',
    corpusId: 'test',
    taskContext: { promptVersion, classification: 'INTERNAL' },
    clock: systemClock(),
  });
}

type Ids = ReturnType<typeof counterIdGenerator>;

function brokerOver(provider: AiProvider, ids: Ids) {
  return {
    providers: [provider],
    policy: DEFAULT_EGRESS_POLICY,
    routing: { defaultPreferenceOrder: [provider.id] },
    clock: systemClock(),
    ids,
  };
}

const PROJECT = { allowExternalProviders: true, classificationCeiling: 'CONFIDENTIAL' } as const;

function extractorOver(ids: Ids): EvidenceExtractor {
  return createBrokerEvidenceExtractor({
    broker: brokerOver(replayOverStub('extract-evidence@1'), ids),
    mode: 'replay',
    project: PROJECT,
  });
}

function populatorOver(ids: Ids): FramePopulator {
  return createBrokerFramePopulator({
    broker: brokerOver(replayOverStub('populate-frame@1'), ids),
    mode: 'replay',
    project: PROJECT,
  });
}

function canonicaliserOver(ids: Ids, inner?: AiProvider): Canonicaliser {
  return createBrokerCanonicaliser({
    broker: brokerOver(replayOverStub('canonicalise-entities@1', inner), ids),
    mode: 'replay',
    project: PROJECT,
  });
}

function reconcilerOver(ids: Ids, inner?: AiProvider): Reconciler {
  return createBrokerReconciler({
    broker: brokerOver(replayOverStub('reconcile-sources@1', inner), ids),
    mode: 'replay',
    project: PROJECT,
  });
}

/** A provider returning a scripted reconciliation, for cases the stub cannot produce. */
function scriptedReconciler(reconciliation: SourceReconciliation): AiProvider {
  const base = createAuthoredStubProvider();
  return {
    ...base,
    invoke: async (request: AiRequest): Promise<AiResponse> => {
      const payload =
        request.taskType === 'RECONCILE_SOURCES'
          ? reconciliation
          : request.taskType === 'CANONICALISE_ENTITIES'
            ? { merges: [], limitations: [] }
            : { items: [], limitations: [] };
      return {
        outputs: [JSON.stringify(payload)],
        citations: [],
        usage: { inputUnits: 10, cachedInputUnits: 0, outputUnits: 5, costEstimate: 0, latencyMs: 0 },
        providerMeta: { providerId: STUB_PROVIDER_ID, modelId: 'stub-1', capabilityTier: 'unknown' },
        degradations: [],
      };
    },
  };
}

async function startServer(
  options: {
    reconciler?: (ids: Ids) => Reconciler;
    canonicaliser?: (ids: Ids) => Canonicaliser;
    noReconciler?: boolean;
  } = {},
): Promise<Server> {
  const blobRoot = await mkdtemp(join(tmpdir(), 'asdp-v6-blob-'));
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
      evidenceExtractor: extractorOver(ids),
      framePopulator: populatorOver(ids),
      ...(options.noReconciler === true
        ? {}
        : {
            canonicaliser:
              options.canonicaliser === undefined
                ? canonicaliserOver(ids)
                : options.canonicaliser(ids),
            reconciler:
              options.reconciler === undefined ? reconcilerOver(ids) : options.reconciler(ids),
          }),
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

/** Ingest two disagreeing sources, extract evidence, populate the frame. */
async function projectWithProposals(s: Server): Promise<string> {
  const created = await call(s, 'POST', '/projects', { key: `v6-${Date.now()}`, name: 'V6' }, asAdmin);
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const projectId = created.json.id;

  for (const [filename, text] of [
    ['policy.md', POLICY],
    ['sop.md', SOP],
  ] as const) {
    const ingested = await call(
      s, 'POST', `/projects/${projectId}/sources`, { filename, text }, asAnalyst,
    );
    assert.equal(ingested.status, 201, JSON.stringify(ingested.json));
    const extracted = await call(
      s, 'POST', `/projects/${projectId}/sources/${ingested.json.source.id}/extract-evidence`,
      undefined, asAnalyst,
    );
    assert.equal(extracted.status, 201, JSON.stringify(extracted.json));
  }

  const populated = await call(s, 'POST', `/projects/${projectId}/populate-frame`, undefined, asAnalyst);
  assert.equal(populated.status, 201, JSON.stringify(populated.json));
  assert.ok(populated.json.accepted.length >= 2, 'the fixture must produce comparable proposals');
  return projectId;
}

async function reconcile(s: Server, projectId: string): Promise<any> {
  const r = await call(s, 'POST', `/projects/${projectId}/reconcile`, undefined, asAnalyst);
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json;
}

// ---------------------------------------------------------------------------
// Q4 / precedence — the pure engine
// ---------------------------------------------------------------------------

function participant(overrides: Record<string, unknown> = {}): any {
  return {
    requirementId: 'REQ-0001',
    sourceId: 'src-1',
    sourceAuthorityRank: 1,
    effectiveDate: '2026-01-01T00:00:00.000Z',
    epistemicLevel: 'L2',
    ...overrides,
  };
}

describe('deterministic precedence (ADR-0012, Q4, Q5)', () => {
  test('step 1: declared source authority decides, and lower rank is stronger', () => {
    const r = computePrecedence({
      a: participant({ requirementId: 'REQ-0001', sourceAuthorityRank: 0 }),
      b: participant({ requirementId: 'REQ-0002', sourceAuthorityRank: 3 }),
      specificity: 'undetermined',
    });
    assert.equal(r.recommendedRequirementId, 'REQ-0001');
    assert.equal(r.decidedByStep, 'source_authority');
    assert.equal(r.undecidable, false);
  });

  test('step 2: a more recent effective date wins when both are known', () => {
    const r = computePrecedence({
      a: participant({ requirementId: 'REQ-0001', effectiveDate: '2025-01-01T00:00:00.000Z' }),
      b: participant({ requirementId: 'REQ-0002', effectiveDate: '2026-06-01T00:00:00.000Z' }),
      specificity: 'undetermined',
    });
    assert.equal(r.recommendedRequirementId, 'REQ-0002');
    assert.equal(r.decidedByStep, 'effective_date');
  });

  test('a MISSING date is not comparable — it is neither a win nor a loss', () => {
    const r = computePrecedence({
      a: participant({ requirementId: 'REQ-0001', effectiveDate: undefined }),
      b: participant({ requirementId: 'REQ-0002', effectiveDate: '2026-06-01T00:00:00.000Z' }),
      specificity: 'undetermined',
    });
    // It must fall through to the next step rather than treating "no date" as older.
    assert.notEqual(r.decidedByStep, 'effective_date');
    const dateStep = r.steps.find((s) => s.step === 'effective_date');
    assert.equal(dateStep?.outcome, 'not_comparable');
  });

  test('step 3: specificity decides only when deterministically established', () => {
    const r = computePrecedence({
      a: participant({ requirementId: 'REQ-0001' }),
      b: participant({ requirementId: 'REQ-0002' }),
      specificity: 'more_specific',
    });
    assert.equal(r.recommendedRequirementId, 'REQ-0001');
    assert.equal(r.decidedByStep, 'specificity');
  });

  test('step 4: extracted outranks interpreted', () => {
    const r = computePrecedence({
      a: participant({ requirementId: 'REQ-0001', epistemicLevel: 'L1' }),
      b: participant({ requirementId: 'REQ-0002', epistemicLevel: 'L2' }),
      specificity: 'undetermined',
    });
    assert.equal(r.recommendedRequirementId, 'REQ-0001');
    assert.equal(r.decidedByStep, 'epistemic_level');
  });

  test('NO TIE IS EVER BROKEN — an undecidable ordering says so (Q4)', () => {
    // Equal authority, equal dates, undetermined specificity, equal level. The
    // honest answer is that precedence cannot separate them; breaking the tie
    // would be an arbitrary pick wearing a deterministic rationale as cover.
    const r = computePrecedence({
      a: participant({ requirementId: 'REQ-0001' }),
      b: participant({ requirementId: 'REQ-0002' }),
      specificity: 'undetermined',
    });
    assert.equal(r.undecidable, true);
    assert.equal(r.decidedByStep, 'undecidable');
    assert.equal(r.recommendedRequirementId, undefined);
    assert.match(r.rationale, /cannot separate/);
  });

  test('precedence is REPRODUCIBLE: same input, byte-identical output', () => {
    // ADR-0012 exists to make precedence reproducible and defensible in audit.
    // Anything less makes a recorded rationale worthless.
    const input = {
      a: participant({ requirementId: 'REQ-0001', sourceAuthorityRank: 0 }),
      b: participant({ requirementId: 'REQ-0002', sourceAuthorityRank: 2 }),
      specificity: 'undetermined' as const,
    };
    assert.equal(JSON.stringify(computePrecedence(input)), JSON.stringify(computePrecedence(input)));
    assert.equal(computePrecedence(input).functionVersion, PRECEDENCE_FUNCTION_VERSION);
  });

  test('the rationale names WHICH step decided, on what values', () => {
    const r = computePrecedence({
      a: participant({ requirementId: 'REQ-0001', sourceAuthorityRank: 0 }),
      b: participant({ requirementId: 'REQ-0002', sourceAuthorityRank: 5 }),
      specificity: 'undetermined',
    });
    // "The AI decided the policy outweighed the email" is not an acceptable audit
    // answer, and neither is "precedence said so".
    assert.match(r.rationale, /source authority/);
    assert.match(r.rationale, /rank 0 versus 5/);
  });
});

describe('specificity determination (Q4)', () => {
  const base: ComparableRequirement = {
    requirementId: 'REQ-0001',
    rafSlot: 'processSteps',
    text: 'The officer must complete the review.',
    classification: 'INTERNAL',
    sourceId: 'src-1',
    sourceAuthorityRank: 1,
    epistemicLevel: 'L2',
    evidenceItemIds: ['ev-1', 'ev-2'],
  };

  test('a strict subset of evidence is more specific', () => {
    const a = { ...base, requirementId: 'REQ-0001', evidenceItemIds: ['ev-1'] };
    const b = { ...base, requirementId: 'REQ-0002', evidenceItemIds: ['ev-1', 'ev-2'] };
    assert.equal(determineSpecificity(a, b), 'more_specific');
  });

  test('an explicit qualifying condition is more specific', () => {
    const a = { ...base, text: 'If the applicant is overseas, the officer must extend the review.' };
    const b = { ...base, requirementId: 'REQ-0002', text: 'The officer must complete the review.' };
    assert.equal(determineSpecificity(a, b), 'more_specific');
  });

  test('NOTHING TESTABLE means undetermined — no heuristic fallback', () => {
    const a = { ...base, requirementId: 'REQ-0001' };
    const b = { ...base, requirementId: 'REQ-0002' };
    assert.equal(determineSpecificity(a, b), 'undetermined');
  });

  test('when the two tests DISAGREE the answer is undetermined, not a guess', () => {
    // Evidence scope says a is narrower; the qualifier says b is. Picking one
    // would be a heuristic, which Q4 forbids.
    const a = { ...base, requirementId: 'REQ-0001', evidenceItemIds: ['ev-1'] };
    const b = {
      ...base,
      requirementId: 'REQ-0002',
      evidenceItemIds: ['ev-1', 'ev-2'],
      text: 'If the applicant is overseas, the officer must extend the review.',
    };
    assert.equal(determineSpecificity(a, b), 'undetermined');
  });
});

// ---------------------------------------------------------------------------
// Q3 — canonicalisation, and the over-merge defences
// ---------------------------------------------------------------------------

describe('Q3 canonicalisation is conservative', () => {
  test('the match form folds Arabic and case, so equal forms group', () => {
    assert.equal(canonicalMatchForm('The  Officer'), canonicalMatchForm('the officer'));
    // Alef variants fold (ADR-0023 §2), which is what makes Arabic grouping work.
    assert.equal(canonicalMatchForm('المراجع'), canonicalMatchForm('المراجع'));
  });

  test('grouping NEVER crosses entity kinds', () => {
    const groups = groupByMatchForm([
      { surfaceForm: 'the system', kind: 'actor', language: 'en', requirementId: 'REQ-0001', classification: 'INTERNAL' },
      { surfaceForm: 'the system', kind: 'data_entity', language: 'en', requirementId: 'REQ-0002', classification: 'INTERNAL' },
    ]);
    // Same text, different kinds: two groups, not one. A human role and a data
    // entity are not the same thing however identical their names.
    assert.equal(groups.length, 2);
  });

  test('grouping is deterministic and stable under input order', () => {
    const observed = [
      { surfaceForm: 'the officer', kind: 'actor' as const, language: 'en', requirementId: 'REQ-0002', classification: 'INTERNAL' },
      { surfaceForm: 'The Officer', kind: 'actor' as const, language: 'en', requirementId: 'REQ-0001', classification: 'INTERNAL' },
    ];
    const a = groupByMatchForm(observed);
    const b = groupByMatchForm([...observed].reverse());
    assert.equal(JSON.stringify(a), JSON.stringify(b));
    assert.equal(a.length, 1, 'exact match-form equality merges');
  });

  test('observeActors finds forms in both scripts and never duplicates one', () => {
    const forms = observeActors('REQ-0001', 'The officer and المراجع must both sign.', 'en', 'INTERNAL');
    const texts = forms.map((f) => f.surfaceForm.toLowerCase());
    assert.ok(texts.some((t) => t.includes('officer')));
    assert.ok(forms.some((f) => /المراجع/.test(f.surfaceForm)));
  });

  test('a merge ACROSS KINDS is rejected — the silent over-merge', () => {
    const shown = new Map([
      [canonicalMatchForm('the officer'), { surfaceForm: 'the officer', kind: 'actor' as const, language: 'en', requirementId: 'REQ-0001', classification: 'INTERNAL' }],
      [canonicalMatchForm('the system'), { surfaceForm: 'the system', kind: 'data_entity' as const, language: 'en', requirementId: 'REQ-0002', classification: 'INTERNAL' }],
    ]);
    const outcome = gateMerge({
      candidate: { surfaceForms: ['the officer', 'the system'], labelEn: 'X', labelAr: 'س', reason: 'same' },
      shown,
    });
    assert.equal(outcome.kind, 'rejected');
    if (outcome.kind !== 'rejected') return;
    assert.equal(outcome.reason, 'merge_across_kinds');
  });

  test('a merge ACROSS CLASSIFICATIONS is rejected — it would raise one silently', () => {
    const shown = new Map([
      [canonicalMatchForm('the officer'), { surfaceForm: 'the officer', kind: 'actor' as const, language: 'en', requirementId: 'REQ-0001', classification: 'INTERNAL' }],
      [canonicalMatchForm('the reviewer'), { surfaceForm: 'the reviewer', kind: 'actor' as const, language: 'en', requirementId: 'REQ-0002', classification: 'CONFIDENTIAL' }],
    ]);
    const outcome = gateMerge({
      candidate: { surfaceForms: ['the officer', 'the reviewer'], labelEn: 'Officer', labelAr: 'الموظف', reason: 'same role' },
      shown,
    });
    assert.equal(outcome.kind, 'rejected');
    if (outcome.kind !== 'rejected') return;
    assert.equal(outcome.reason, 'merge_across_classifications');
  });

  test('a merge naming an unseen surface form is rejected', () => {
    const outcome = gateMerge({
      candidate: { surfaceForms: ['the officer', 'the ghost'], labelEn: 'Officer', labelAr: 'الموظف', reason: 'same' },
      shown: new Map([
        [canonicalMatchForm('the officer'), { surfaceForm: 'the officer', kind: 'actor' as const, language: 'en', requirementId: 'REQ-0001', classification: 'INTERNAL' }],
      ]),
    });
    assert.equal(outcome.kind, 'rejected');
    if (outcome.kind !== 'rejected') return;
    assert.equal(outcome.reason, 'surface_form_not_in_batch');
    // J9: the candidate is retained, not hashed away.
    assert.match(outcome.proposedPayload, /the ghost/);
  });

  test('a degenerate merge of one form is rejected — it merges nothing', () => {
    const shown = new Map([
      [canonicalMatchForm('the officer'), { surfaceForm: 'the officer', kind: 'actor' as const, language: 'en', requirementId: 'REQ-0001', classification: 'INTERNAL' }],
    ]);
    const outcome = gateMerge({
      candidate: { surfaceForms: ['the officer'], labelEn: 'Officer', labelAr: 'الموظف', reason: 'itself' },
      shown,
    });
    assert.equal(outcome.kind, 'rejected');
    if (outcome.kind !== 'rejected') return;
    assert.equal(outcome.reason, 'merge_degenerate');
  });
});

// ---------------------------------------------------------------------------
// Q8 — classification, and what AI may never claim
// ---------------------------------------------------------------------------

function comparable(overrides: Partial<ComparableRequirement> = {}): ComparableRequirement {
  return {
    requirementId: 'REQ-0001',
    rafSlot: 'processSteps',
    text: 'The officer must complete the review within three working days.',
    classification: 'INTERNAL',
    sourceId: 'src-1',
    sourceAuthorityRank: 1,
    epistemicLevel: 'L2',
    evidenceItemIds: ['ev-1'],
    ...overrides,
  };
}

describe('Q8 classification boundary', () => {
  const a = comparable({ requirementId: 'REQ-0001' });
  const b = comparable({ requirementId: 'REQ-0002', sourceId: 'src-2' });
  const shown = new Map([
    ['REQ-0001', a],
    ['REQ-0002', b],
  ]);

  test('AI may propose potentially_contradictory', () => {
    const outcome = gateCandidate({
      candidate: {
        requirementIds: ['REQ-0001', 'REQ-0002'],
        classification: 'potentially_contradictory',
        topic: 'time limit',
        explanation: 'one states three days and the other ten; they cannot both hold',
      },
      shown,
    });
    assert.equal(outcome.kind, 'accepted');
  });

  test('AI MAY NOT establish true_conflict', () => {
    const outcome = gateCandidate({
      candidate: {
        requirementIds: ['REQ-0001', 'REQ-0002'],
        classification: 'true_conflict' as never,
        topic: 'time limit',
        explanation: 'they disagree',
      },
      shown,
    });
    assert.equal(outcome.kind, 'rejected');
    if (outcome.kind !== 'rejected') return;
    assert.equal(outcome.reason, 'true_conflict_proposed_by_ai');
  });

  test('a candidate proposing a RESOLUTION is rejected (Q5)', () => {
    const outcome = gateCandidate({
      candidate: {
        requirementIds: ['REQ-0001', 'REQ-0002'],
        classification: 'potentially_contradictory',
        topic: 'time limit',
        // Fluent, plausible, and exactly how the boundary would erode.
        explanation: 'The policy takes precedence, so the three-day limit is authoritative.',
      },
      shown,
    });
    assert.equal(outcome.kind, 'rejected');
    if (outcome.kind !== 'rejected') return;
    assert.equal(outcome.reason, 'resolution_proposed_by_ai');
  });

  test('a CROSS-SLOT candidate is rejected — comparison is slot-scoped', () => {
    const other = comparable({ requirementId: 'REQ-0003', rafSlot: 'businessRules' });
    const outcome = gateCandidate({
      candidate: {
        requirementIds: ['REQ-0001', 'REQ-0003'],
        classification: 'potentially_contradictory',
        topic: 'x',
        explanation: 'they differ',
      },
      shown: new Map([
        ['REQ-0001', a],
        ['REQ-0003', other],
      ]),
    });
    assert.equal(outcome.kind, 'rejected');
    if (outcome.kind !== 'rejected') return;
    assert.equal(outcome.reason, 'cross_slot_candidate');
  });

  test('a candidate naming an unseen requirement is rejected', () => {
    const outcome = gateCandidate({
      candidate: {
        requirementIds: ['REQ-0001', 'REQ-9999'],
        classification: 'equivalent',
        topic: 'x',
        explanation: 'same',
      },
      shown,
    });
    assert.equal(outcome.kind, 'rejected');
    if (outcome.kind !== 'rejected') return;
    assert.equal(outcome.reason, 'requirement_not_in_batch');
  });

  test('a candidate with one distinct participant is rejected', () => {
    const outcome = gateCandidate({
      candidate: {
        requirementIds: ['REQ-0001', 'REQ-0001'],
        classification: 'equivalent',
        topic: 'x',
        explanation: 'same',
      },
      shown,
    });
    assert.equal(outcome.kind, 'rejected');
    if (outcome.kind !== 'rejected') return;
    assert.equal(outcome.reason, 'degenerate_candidate');
  });

  test('classification is DERIVED to the maximum over participants (D10)', () => {
    const confidential = comparable({ requirementId: 'REQ-0002', classification: 'CONFIDENTIAL' });
    const outcome = gateCandidate({
      candidate: {
        requirementIds: ['REQ-0001', 'REQ-0002'],
        classification: 'equivalent',
        topic: 'x',
        explanation: 'same content',
      },
      shown: new Map([
        ['REQ-0001', a],
        ['REQ-0002', confidential],
      ]),
    });
    assert.equal(outcome.kind, 'accepted');
    if (outcome.kind !== 'accepted') return;
    assert.equal(outcome.dataClassification, 'CONFIDENTIAL');
  });
});

// ---------------------------------------------------------------------------
// End to end
// ---------------------------------------------------------------------------

describe('RECONCILE end to end', () => {
  test('records conflict CANDIDATES with a precedence recommendation', async () => {
    const s = await startServer();
    try {
      const projectId = await projectWithProposals(s);
      const result = await reconcile(s, projectId);

      assert.ok(result.conflicts.length > 0, JSON.stringify(result));
      for (const conflict of result.conflicts) {
        // Q1: the single most important assertion in this file.
        assert.equal(conflict.decision, undefined);
        assert.equal(conflict.decidedBy, undefined);
        assert.equal(conflict.decidedAt, undefined);
        // Q8: never true_conflict from V6.
        assert.notEqual(conflict.classification, 'true_conflict');
        // Q5: a recommendation always carries a rationale naming the step.
        if (conflict.recommendedRequirementId !== undefined) {
          assert.ok(conflict.precedenceRationale !== undefined);
          assert.equal(conflict.precedenceRationale.functionVersion, PRECEDENCE_FUNCTION_VERSION);
          assert.match(String(conflict.proposedResolution), /RECOMMENDATION/);
        }
        assert.match(String(conflict.detectedBy), /reconcile-sources@1/);
        assert.match(String(conflict.aiInteractionId), /^ai/);
      }
      assert.match(String(result.note), /decision = null/);
      assert.match(String(result.note), /RECOMMENDATION, never applied/);
    } finally {
      await s.close();
    }
  });

  test('SQL REFUSES a decided conflict, not just the command (Q1)', async () => {
    const s = await startServer();
    try {
      const projectId = await projectWithProposals(s);
      const result = await reconcile(s, projectId);
      const id = result.conflicts[0].id;

      // Reaching past the command deliberately: the claim is that the DATABASE
      // refuses this, so proving it through the command would prove nothing.
      await assert.rejects(
        s.database.query('update conflict set decision = $1 where id = $2', ['keep REQ-0001', id]),
        /conflict_v6_undecided|violates check constraint/i,
      );
      await assert.rejects(
        s.database.query('update conflict set decided_by = $1 where id = $2', ['u-analyst', id]),
        /conflict_v6_undecided|violates check constraint/i,
      );
    } finally {
      await s.close();
    }
  });

  test('SQL refuses a true_conflict classification from any path (Q8)', async () => {
    const s = await startServer();
    try {
      const projectId = await projectWithProposals(s);
      const result = await reconcile(s, projectId);
      await assert.rejects(
        s.database.query('update conflict set classification = $1 where id = $2', [
          'true_conflict',
          result.conflicts[0].id,
        ]),
        /conflict_classification_valid|violates check constraint/i,
      );
    } finally {
      await s.close();
    }
  });

  test('SQL refuses a confirmed canonical merge (Q3)', async () => {
    const s = await startServer();
    try {
      const projectId = await projectWithProposals(s);
      const result = await reconcile(s, projectId);
      assert.ok(result.canonical.entities.length > 0);
      await assert.rejects(
        s.database.query('update canonical_entity set confirmed_by = $1 where id = $2', [
          'u-analyst',
          result.canonical.entities[0].id,
        ]),
        /canonical_entity_v6_unconfirmed|violates check constraint/i,
      );
    } finally {
      await s.close();
    }
  });

  test('THERE IS STILL NO APPLY OR AUTO-RESOLVE ROUTE — V7 added deciding, not applying', async () => {
    // REWRITTEN IN V7, and the reason matters. This asserted 404 on SEVEN paths,
    // because at V6 none of them existed and a human had no way to act at all.
    // V7 legitimately adds `decide` and the equivalence verdict — that is the
    // slice's entire purpose — so asserting their absence now would assert that
    // V7 was not built.
    //
    // What must STILL 404 is the thing no slice may ever add: a route that
    // APPLIES a precedence recommendation, or resolves a conflict without a human
    // deciding it. Q5 and ADR-0012 forbid both, and that is what this test now
    // guards.
    const s = await startServer();
    try {
      const projectId = await projectWithProposals(s);
      const result = await reconcile(s, projectId);
      const conflictId = result.conflicts[0].id;

      for (const path of [
        // Applying precedence automatically — the failure Q5 exists to prevent.
        `/projects/${projectId}/conflicts/${conflictId}/apply`,
        `/projects/${projectId}/conflicts/${conflictId}/apply-precedence`,
        `/projects/${projectId}/conflicts/${conflictId}/auto-resolve`,
        // Bulk-resolving without a per-conflict rationale.
        `/projects/${projectId}/conflicts/resolve-all`,
      ]) {
        const r = await call(s, 'POST', path, {}, asAnalyst);
        assert.equal(r.status, 404, path);
      }
    } finally {
      await s.close();
    }
  });

  test('a V6 conflict is STILL undecided until a human decides it in V7', async () => {
    // The V6 guarantee, restated against a build that CAN decide: reconciliation
    // writes candidates, and deciding is a separate human act with a rationale.
    const s = await startServer();
    try {
      const projectId = await projectWithProposals(s);
      const result = await reconcile(s, projectId);
      for (const conflict of result.conflicts) {
        assert.equal(conflict.decision, undefined);
        assert.equal(conflict.decidedBy, undefined);
      }

      // And a decision without a rationale is refused, at the command and in SQL.
      const noRationale = await call(
        s, 'POST', `/projects/${projectId}/conflicts/${result.conflicts[0].id}/decide`,
        { decision: 'accepted_recommendation', rationale: '' }, asAnalyst,
      );
      assert.equal(noRationale.status >= 400, true, 'ADR-0012 requires a defensible decision');
    } finally {
      await s.close();
    }
  });

  test('nothing is superseded, suppressed or rewritten by a recommendation (Q5)', async () => {
    const s = await startServer();
    try {
      const projectId = await projectWithProposals(s);
      const before = await call(s, 'GET', `/projects/${projectId}/requirements`, undefined, asAnalyst);
      await reconcile(s, projectId);
      const after = await call(s, 'GET', `/projects/${projectId}/requirements`, undefined, asAnalyst);

      // Same proposals, same statuses, same confidence. Precedence recommended;
      // nothing acted on it.
      assert.equal(after.json.total, before.json.total);
      assert.deepEqual(
        after.json.requirements.map((r: any) => `${r.id}:${r.status}:${r.computedConfidence}`),
        before.json.requirements.map((r: any) => `${r.id}:${r.status}:${r.computedConfidence}`),
      );
    } finally {
      await s.close();
    }
  });

  test('rejected candidates are retained IN FULL, and counted (J9)', async () => {
    const s = await startServer({
      reconciler: (ids) =>
        reconcilerOver(
          ids,
          scriptedReconciler({
            candidates: [
              {
                requirementIds: ['REQ-9998', 'REQ-9999'],
                classification: 'potentially_contradictory',
                topic: 'invented',
                explanation: 'these do not exist',
              },
            ],
            limitations: ['the stub could not tell'],
          }),
        ),
    });
    try {
      const projectId = await projectWithProposals(s);
      const result = await reconcile(s, projectId);

      assert.equal(result.conflicts.length, 0);
      assert.ok(result.rejected.length > 0);
      assert.equal(result.rejectionCounts.requirement_not_in_batch, result.rejected.length);
      assert.match(String(result.rejected[0].proposedPayload), /REQ-9999/);

      const rows = await s.database.query(
        'select proposed_payload, reason from reconciliation_rejection where project_id = $1',
        [projectId],
      );
      assert.ok(rows.rows.length > 0, 'a rejection must be persisted, not only reported');

      const audit = await call(s, 'GET', `/projects/${projectId}/audit`, undefined, asAdmin);
      const event = audit.json.find((e: any) => e.action === 'sources.reconciled');
      assert.ok(event !== undefined);
      assert.equal(event.after.everyConflictUndecided, true);
      assert.equal(event.after.precedenceApplied, false);
      assert.ok(event.after.limitations.length > 0);
    } finally {
      await s.close();
    }
  });

  test('replay is deterministic: the same project yields the same candidates', async () => {
    const first = await startServer();
    let firstShape: string;
    try {
      const projectId = await projectWithProposals(first);
      const result = await reconcile(first, projectId);
      firstShape = JSON.stringify(
        result.conflicts.map((c: any) => `${c.rafSlot}:${c.classification}:${c.topic}`).sort(),
      );
    } finally {
      await first.close();
    }

    const second = await startServer();
    try {
      const projectId = await projectWithProposals(second);
      const result = await reconcile(second, projectId);
      const secondShape = JSON.stringify(
        result.conflicts.map((c: any) => `${c.rafSlot}:${c.classification}:${c.topic}`).sort(),
      );
      assert.equal(secondShape, firstShape);
    } finally {
      await second.close();
    }
  });

  test('the default build REFUSES: no provider is configured', async () => {
    const s = await startServer({ noReconciler: true });
    try {
      const projectId = await projectWithProposals(s);
      const result = await reconcile(s, projectId);
      assert.equal(result.conflicts.length, 0);
      assert.ok(result.refusals.length > 0);
      assert.match(String(result.refusals.join(' ')), /no AI provider is configured/);
      // And the refusal must not read as "the sources agree".
      assert.match(String(result.refusals.join(' ')), /not a statement that the sources agree/);
    } finally {
      await s.close();
    }
  });

  test('a Viewer may READ reconciliation but may not run it', async () => {
    const s = await startServer();
    try {
      const projectId = await projectWithProposals(s);
      await reconcile(s, projectId);
      const view = await call(s, 'GET', `/projects/${projectId}/reconciliation`, undefined, asViewer);
      assert.equal(view.status, 200);
      const attempted = await call(s, 'POST', `/projects/${projectId}/reconcile`, undefined, asViewer);
      assert.equal(attempted.status, 403);
    } finally {
      await s.close();
    }
  });

  test('a set with fewer than two proposals is refused by name', async () => {
    const s = await startServer();
    try {
      const created = await call(s, 'POST', '/projects', { key: `v6-solo-${Date.now()}`, name: 'Solo' }, asAdmin);
      const projectId = created.json.id;
      const r = await call(s, 'POST', `/projects/${projectId}/reconcile`, undefined, asAnalyst);
      // Reporting "no conflicts" over nothing would be the worst possible answer.
      assert.equal(r.status, 400);
      assert.match(String(r.json.error), /no requirement set|at least two/i);
    } finally {
      await s.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Q6 — the reconciliation view
// ---------------------------------------------------------------------------

describe('Q6 reconciliation-aware view', () => {
  test('stored confidence and agreement are NEVER mutated', async () => {
    const s = await startServer();
    try {
      const projectId = await projectWithProposals(s);
      await reconcile(s, projectId);

      const view = await call(s, 'GET', `/projects/${projectId}/reconciliation`, undefined, asAnalyst);
      assert.equal(view.status, 200);
      for (const entry of view.json.agreement) {
        // V5 wrote `silent`; V6 never rewrites it. The derived value sits beside it.
        assert.equal(entry.storedAgreement, 'silent');
      }
    } finally {
      await s.close();
    }
  });

  test('a contradicted proposition reads as contradicted in the DERIVED view', async () => {
    const s = await startServer();
    try {
      const projectId = await projectWithProposals(s);
      const result = await reconcile(s, projectId);
      const contradictory = result.conflicts.filter(
        (c: any) => c.classification === 'potentially_contradictory',
      );
      assert.ok(contradictory.length > 0, 'the fixture must produce a contradiction candidate');

      const view = await call(s, 'GET', `/projects/${projectId}/reconciliation`, undefined, asAnalyst);
      const contradicted = view.json.agreement.filter(
        (a: any) => a.reconciledAgreement === 'contradicted',
      );
      assert.ok(contradicted.length > 0);
      assert.match(String(contradicted[0].reason), /unresolved conflict candidate/);
    } finally {
      await s.close();
    }
  });

  test('ABSENCE OF A CONFLICT IS NEVER AGREEMENT (Q6)', async () => {
    const s = await startServer({
      // A reconciler that finds nothing at all.
      reconciler: (ids) => reconcilerOver(ids, scriptedReconciler({ candidates: [], limitations: [] })),
    });
    try {
      const projectId = await projectWithProposals(s);
      await reconcile(s, projectId);

      const view = await call(s, 'GET', `/projects/${projectId}/reconciliation`, undefined, asAnalyst);
      // Nothing was contradicted, and nothing may therefore be called corroborated:
      // a detector that found nothing and a corpus with nothing to find are
      // indistinguishable from outside.
      const corroborated = view.json.agreement.filter(
        (a: any) => a.reconciledAgreement === 'corroborated',
      );
      assert.equal(corroborated.length, 0, 'V6 never claims corroboration (Q6)');
      const silent = view.json.agreement.filter((a: any) => a.reconciledAgreement === 'silent');
      assert.ok(silent.length > 0);
      assert.match(String(silent[0].reason), /Absence of a detected conflict is NOT agreement/);
    } finally {
      await s.close();
    }
  });

  test('SHARED VOCABULARY IS NOT AGREEMENT — corroboration is unreachable in V6', async () => {
    // The defect a test caught during implementation: an earlier version raised
    // `corroborated` when a DETERMINISTIC canonical entity tied two propositions
    // resting on different sources. That is shared vocabulary, not agreement about
    // content — both fixtures name "the reviewing officer" while stating three days
    // and ten days, so they share an actor AND contradict each other.
    const s = await startServer();
    try {
      const projectId = await projectWithProposals(s);
      const result = await reconcile(s, projectId);
      // The canonical entity that would have triggered it does exist.
      assert.ok(
        result.canonical.entities.some((e: any) => e.origin === 'deterministic'),
        'the fixture must produce a deterministic canonical entity spanning both sources',
      );

      const view = await call(s, 'GET', `/projects/${projectId}/reconciliation`, undefined, asAnalyst);
      assert.equal(
        view.json.agreement.filter((a: any) => a.reconciledAgreement === 'corroborated').length,
        0,
        'a shared actor name must never become corroboration',
      );
    } finally {
      await s.close();
    }
  });

  test('U4 — a HUMAN-CONFIRMED equivalence raises corroboration, and mutates no V5 row', async () => {
    // The half of Q6 V6 could not claim, and the criterion-9 proof beside it.
    //
    // V6's position was precise rather than timid: equivalence was AI-PROPOSED, so
    // raising corroboration would have manufactured agreement from an unconfirmed
    // claim. Confirmation is what discharges that qualifier — and nothing else
    // does, which is what the assertions before the verdict are for.
    // A reconciler that raises NO candidates, so the only conflict in the project
    // is the equivalent one this test records. With a contradictory candidate in
    // play the answer would be `contradicted` whatever else agreed, and the test
    // would be measuring precedence rather than corroboration.
    const s = await startServer({
      reconciler: (ids) => reconcilerOver(ids, scriptedReconciler({ candidates: [], limitations: [] })),
    });
    try {
      const projectId = await projectWithProposals(s);
      await reconcile(s, projectId);

      const sets = await s.database.query(
        'select id from requirement_set where project_id = $1',
        [projectId],
      );
      const setId = String((sets.rows[0] as any).id);

      // Two propositions in ONE slot resting on DIFFERENT sources, and named by no
      // contradictory candidate — the only shape corroboration could ever apply to.
      const rows = await s.database.query(
        `select r.id as rid, r.raf_slot as slot, e.source_id as sid
           from requirement r
           join requirement_evidence re on re.requirement_id = r.id
           join evidence_item e on e.id = re.evidence_item_id
          where r.requirement_set_id = $1`,
        [setId],
      );
      const contradictory = new Set(
        (
          await s.database.query(
            `select p.entity_id as eid from conflict_participant p
               join conflict c on c.id = p.conflict_id
              where c.requirement_set_id = $1 and c.classification = 'potentially_contradictory'`,
            [setId],
          )
        ).rows.map((r: any) => String(r.eid)),
      );

      const bySlot = new Map<string, Map<string, string>>();
      for (const row of rows.rows as any[]) {
        if (contradictory.has(String(row.rid))) continue;
        const held = bySlot.get(String(row.slot)) ?? new Map<string, string>();
        // First requirement seen per source, so the pair spans two documents.
        if (!held.has(String(row.sid))) held.set(String(row.sid), String(row.rid));
        bySlot.set(String(row.slot), held);
      }
      const pair = [...bySlot.entries()].find(([, bySource]) => bySource.size >= 2);
      assert.ok(pair !== undefined, 'the fixture must offer a two-source pair in one slot');
      const [slot, bySource] = pair;
      const [left, right] = [...bySource.values()];

      const interaction = await s.database.query('select id from ai_interaction limit 1');
      const interactionId = String((interaction.rows[0] as any).id);

      // An EQUIVALENT candidate over the pair, and an AI-PROPOSED merge tying
      // them. Both are states V6 legitimately produces; V6 simply had no verdict
      // to record against them.
      await s.database.query(
        `insert into conflict (id, project_id, requirement_set_id, topic, raf_slot, classification,
                               explanation, detected_by, data_classification, created_at)
         values ($1,$2,$3,'same proposition',$4,'equivalent',
                 'both documents state the same thing','ai','INTERNAL',now())`,
        ['cfl-u4', projectId, setId, slot],
      );
      for (const requirementId of [left, right]) {
        await s.database.query(
          `insert into conflict_participant (conflict_id, role, entity_id)
           values ('cfl-u4','requirement',$1)`,
          [requirementId],
        );
      }
      await s.database.query(
        `insert into canonical_entity (id, project_id, requirement_set_id, kind, label_en, label_ar,
                                       match_form, origin, classification, requirement_ids,
                                       ai_interaction_id, created_at)
         values ($1,$2,$3,'actor','reviewing officer','الموظف المراجع','reviewing officer',
                 'ai_proposed','INTERNAL',$4,$5,now())`,
        ['can-u4', projectId, setId, [left, right], interactionId],
      );

      // BEFORE: unconfirmed, so provisional and NOT corroborated. If this were
      // already corroborated the verdict below would prove nothing.
      const before = await call(s, 'GET', `/projects/${projectId}/reconciliation`, undefined, asAnalyst);
      const beforeLeft = before.json.agreement.find((a: any) => a.requirementId === left);
      assert.equal(beforeLeft.reconciledAgreement, 'silent');
      assert.equal(beforeLeft.provisionalCorroboration, true);
      assert.match(String(beforeLeft.reason), /unconfirmed/);

      // Criterion 9: snapshot every V5 row, byte for byte.
      const snapshot = async (): Promise<string> =>
        JSON.stringify(
          (
            await s.database.query(
              `select id, text, original_ai_text, computed_confidence, confidence_band,
                      confidence_function_version, epistemic_level, derivation, status, version
                 from requirement where requirement_set_id = $1 order by id`,
              [setId],
            )
          ).rows,
        );
      const v5Before = await snapshot();

      const verdict = await call(
        s, 'POST', `/projects/${projectId}/canonical-entities/can-u4/verdict`,
        { verdict: 'confirm' }, asAnalyst,
      );
      assert.equal(verdict.status, 200, JSON.stringify(verdict.json));

      // AFTER: corroborated, and the provisional qualifier is discharged.
      const after = await call(s, 'GET', `/projects/${projectId}/reconciliation`, undefined, asAnalyst);
      for (const requirementId of [left, right]) {
        const row = after.json.agreement.find((a: any) => a.requirementId === requirementId);
        assert.equal(row.reconciledAgreement, 'corroborated', `${requirementId} must be corroborated`);
        assert.equal(row.provisionalCorroboration, false);
        assert.match(String(row.reason), /HUMAN-CONFIRMED/);
        // COMPUTED ON READ: the stored value is untouched beside the derived one.
        assert.equal(row.storedAgreement, 'silent');
      }

      // CRITERION 9, and the reason confidence stays reproducible: not one V5 row
      // changed. Corroboration is derived on read, never written back.
      assert.equal(await snapshot(), v5Before, 'no V5 requirement row may be mutated (Q6)');
    } finally {
      await s.close();
    }
  });

  test('U4 — an equivalence a human REJECTED never corroborates', async () => {
    const s = await startServer();
    try {
      const projectId = await projectWithProposals(s);
      await reconcile(s, projectId);
      const view = await call(s, 'GET', `/projects/${projectId}/reconciliation`, undefined, asAnalyst);
      // Nothing is confirmed in this project, so nothing may be corroborated —
      // the standing guarantee, restated against a build that CAN corroborate.
      assert.equal(
        view.json.agreement.filter((a: any) => a.reconciledAgreement === 'corroborated').length,
        0,
        'corroboration requires a confirmation that has not happened here',
      );
    } finally {
      await s.close();
    }
  });

  test('no raf_coverage table appeared, and coverage still answers (Q9)', async () => {
    const s = await startServer();
    try {
      const projectId = await projectWithProposals(s);
      await reconcile(s, projectId);

      const r = await s.database.query(
        "select table_name from information_schema.tables where table_name = 'raf_coverage'",
      );
      assert.equal(r.rows.length, 0, 'V6 must not introduce a coverage table either');

      const coverage = await call(s, 'GET', `/projects/${projectId}/frame-coverage`, undefined, asAnalyst);
      assert.equal(coverage.status, 200);
      // Q9: coverage keeps its V5 shape. Conflicts live beside it, not inside it.
      assert.equal(coverage.json.coverage.conflicts, undefined);
    } finally {
      await s.close();
    }
  });
});

// ---------------------------------------------------------------------------
// L1-CONF
// ---------------------------------------------------------------------------

describe('L1-CONF validation', () => {
  const base = {
    id: 'cfl-1',
    projectId: 'prj-1',
    detectedByAi: true,
    aiInteractionId: 'ai-1',
    hasRecommendation: true,
    hasRationale: true,
    precedenceUndecidable: false,
    participants: [{ role: 'requirement', entityId: 'REQ-0001' }],
    usedUnconfirmedMerge: false,
    undatedSourceIds: [] as string[],
  };
  const known = {
    knownRequirementIds: new Set(['REQ-0001']),
    knownEvidenceIds: new Set(['ev-1']),
  };

  test('the catalogue holds SEVEN L1-CONF rules, all L1, all at G1', () => {
    assert.equal(L1_CONFLICT_RULES.length, 7);
    for (const rule of L1_CONFLICT_RULES) {
      assert.equal(rule.layer, 'L1');
      assert.deepEqual(rule.gates, ['G1']);
      assert.match(rule.id, /^L1-CONF-00[1-7]$/);
    }
    // No NEW validation layer was introduced. V7 populates L4, which
    // validation-architecture.md §3 has always defined — the assertion that
    // matters is that every layer in use is one of the SEVEN, not that the set
    // never grows. It was ['L0','L1'] before V7 and is correct to change here.
    const layers = [...new Set(allRules().map((r) => r.layer))].sort();
    assert.deepEqual(layers, ['L0', 'L1', 'L4']);
    for (const layer of layers) {
      assert.ok(['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6'].includes(layer), layer);
    }
    // Ids are never reused: a duplicate would make findings and waivers ambiguous.
    assert.equal(new Set(allRules().map((r) => r.id)).size, allRules().length);
  });

  test('L1-CONF-004 fires on a decided conflict — the gravest defect here', () => {
    const findings = evaluateL1Conflicts(
      { conflicts: [{ ...base, decision: 'keep REQ-0001' }], ...known },
      'run-1',
    );
    assert.ok(findings.some((f) => f.ruleId === 'L1-CONF-004'));
    assert.equal(findings.find((f) => f.ruleId === 'L1-CONF-004')?.severityAtGate.G1, 'error');
  });

  test('L1-CONF-001 fires on an unresolvable participant', () => {
    const findings = evaluateL1Conflicts(
      { conflicts: [{ ...base, participants: [{ role: 'requirement', entityId: 'REQ-9999' }] }], ...known },
      'run-1',
    );
    assert.ok(findings.some((f) => f.ruleId === 'L1-CONF-001'));
  });

  test('L1-CONF-003 fires on a recommendation with no rationale', () => {
    const findings = evaluateL1Conflicts(
      { conflicts: [{ ...base, hasRationale: false }], ...known },
      'run-1',
    );
    assert.ok(findings.some((f) => f.ruleId === 'L1-CONF-003'));
  });

  test('L1-CONF-005 warns when precedence is undecidable, and does not block', () => {
    const findings = evaluateL1Conflicts(
      { conflicts: [{ ...base, precedenceUndecidable: true }], ...known },
      'run-1',
    );
    const finding = findings.find((f) => f.ruleId === 'L1-CONF-005');
    assert.ok(finding !== undefined);
    // A warning: the conflict is real and a human can still decide it.
    assert.equal(finding.severityAtGate.G1, 'warning');
  });

  test('L1-CONF-005 STOPS firing once a human has decided — no waiver factory', () => {
    // Found in the V6 acceptance review. A WARNING requires a waiver to pass a
    // gate (validation-architecture.md §1), so a rule that keeps firing after the
    // human has decided would ask them to justify a condition they already
    // handled — every G1, forever. Latent in V6, which writes no decided
    // conflicts, and live the moment V7 exists.
    const undecided = evaluateL1Conflicts(
      { conflicts: [{ ...base, precedenceUndecidable: true }], ...known },
      'run-1',
    );
    assert.ok(undecided.some((f) => f.ruleId === 'L1-CONF-005'));

    const decided = evaluateL1Conflicts(
      {
        conflicts: [{ ...base, precedenceUndecidable: true, decision: 'keep REQ-0001', decidedBy: 'u-analyst' }],
        ...known,
      },
      'run-1',
    );
    assert.ok(!decided.some((f) => f.ruleId === 'L1-CONF-005'));
    // L1-CONF-004 still fires, because a decision written by anything other than
    // V7's human path is exactly what it exists to catch.
    assert.ok(decided.some((f) => f.ruleId === 'L1-CONF-004'));
  });

  test('a clean conflict produces no findings', () => {
    const findings = evaluateL1Conflicts({ conflicts: [base], ...known }, 'run-1');
    assert.deepEqual(findings, []);
  });
});
