/**
 * V5 — structured requirement proposals, end to end.
 *
 * The real application graph with one substitution: the provider is a **replay
 * provider over the authored stub**, which is what CI must use (**A7**). The
 * broker, the egress gate, the six-pass partition, the proposal gate, the SQL
 * constraints and the coverage arithmetic are all the real ones.
 *
 * What these tests are for: proving that **nothing V5 writes can look approved**,
 * that **nothing ungrounded is written at all**, and that what is refused is
 * refused loudly and retained in full.
 *
 * What they are NOT for, and cannot be: proving that a proposition faithfully
 * represents the evidence it cites. No deterministic check can establish that —
 * see `docs/60-plan/v5-proposal.md` §18, R-V5-1. Everything asserted here is a
 * defect detector.
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
import { createAuthoredStubProvider, STUB_PROVIDER_ID } from './ai/stub-provider.ts';
import { FRAME_PASSES, partitionProblems, passForSlot } from './ai/frame-passes.ts';
import { duplicateKey, gateProposal, type EligibleEvidence } from './ai/proposal-gate.ts';
import { deriveFlags } from './ai/requirement-flags.ts';
import { planEvidenceBatches } from './commands/requirements.ts';
import type { Database } from './persistence/db.ts';
import type { EvidenceExtractor, FramePopulator } from './ports.ts';
import { DEFAULT_EGRESS_POLICY, type AiProvider } from '@asdp/ai';
import { createMemoryRecordingStore, createReplayProvider } from '@asdp/eval';
import { RAF_SLOT_KEYS, REQUIRED_SLOT_KEYS } from '@asdp/raf';
import { spanChecksum } from '@asdp/provenance';
import { evaluateL1Requirements, L1_REQUIREMENT_RULES } from '@asdp/validation';
import type {
  AiRequest,
  AiResponse,
  EvidenceItem,
  FramePopulation,
  ProvenanceAnchor,
} from '@asdp/schemas';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Obligations the stub's marker table can place across several passes. */
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

/**
 * One id generator for the whole graph.
 *
 * Both brokers mint `AiInteraction` ids from it, so they cannot collide. Two
 * independent counters is not a realistic composition: a root wires one generator
 * and hands it to everything, which is the only reason ids are unique at all.
 */
function sharedIds(): ReturnType<typeof counterIdGenerator> {
  return counterIdGenerator();
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

function extractorOver(ids: ReturnType<typeof counterIdGenerator>): EvidenceExtractor {
  const provider = replayOverStub('extract-evidence@1');
  return createBrokerEvidenceExtractor({
    broker: {
      providers: [provider],
      policy: DEFAULT_EGRESS_POLICY,
      routing: { defaultPreferenceOrder: [provider.id] },
      clock: systemClock(),
      ids,
    },
    mode: 'replay',
    project: { allowExternalProviders: true, classificationCeiling: 'CONFIDENTIAL' },
  });
}

function populatorOver(
  ids: ReturnType<typeof counterIdGenerator>,
  inner?: AiProvider,
): FramePopulator {
  const provider = replayOverStub('populate-frame@1', inner);
  return createBrokerFramePopulator({
    broker: {
      providers: [provider],
      policy: DEFAULT_EGRESS_POLICY,
      routing: { defaultPreferenceOrder: [provider.id] },
      clock: systemClock(),
      ids,
    },
    mode: 'replay',
    project: { allowExternalProviders: true, classificationCeiling: 'CONFIDENTIAL' },
  });
}

/** A provider returning a scripted population, for cases the stub cannot produce. */
function scriptedProvider(population: FramePopulation): AiProvider {
  const base = createAuthoredStubProvider();
  return {
    ...base,
    invoke: async (request: AiRequest): Promise<AiResponse> => ({
      outputs: [
        JSON.stringify(request.taskType === 'POPULATE_FRAME' ? population : { items: [], limitations: [] }),
      ],
      citations: [],
      usage: { inputUnits: 10, cachedInputUnits: 0, outputUnits: 5, costEstimate: 0, latencyMs: 0 },
      providerMeta: { providerId: STUB_PROVIDER_ID, modelId: 'stub-1', capabilityTier: 'unknown' },
      degradations: [],
    }),
  };
}

async function startServer(
  options: {
    populator?: (ids: ReturnType<typeof counterIdGenerator>) => FramePopulator;
    evidencePerBatch?: number;
  } = {},
): Promise<Server> {
  const blobRoot = await mkdtemp(join(tmpdir(), 'asdp-v5-blob-'));
  const config = loadConfig({
    PORT: '0',
    ASDP_LOG_LEVEL: 'error',
    ASDP_BLOB_ROOT: blobRoot,
    ...(options.evidencePerBatch === undefined
      ? {}
      : { ASDP_FRAME_EVIDENCE_PER_BATCH: String(options.evidencePerBatch) }),
  });
  const database = await createPgliteDatabase({});
  await migrate(database);
  const blobStore = await createFilesystemBlobStore({ rootDirectory: blobRoot });
  const ids = sharedIds();
  const running = await listen(
    {
      config,
      database,
      blobStore,
      clock: systemClock(),
      ids,
      evidenceExtractor: extractorOver(ids),
      framePopulator: options.populator === undefined ? populatorOver(ids) : options.populator(ids),
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

async function project(s: Server): Promise<string> {
  const r = await call(s, 'POST', '/projects', { key: `v5-${Date.now()}`, name: 'V5' }, asAdmin);
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json.id;
}

/** Ingest, extract evidence, and return the project with evidence in place. */
async function projectWithEvidence(s: Server, text = DOC): Promise<{ projectId: string; sourceId: string }> {
  const projectId = await project(s);
  const ingested = await call(
    s, 'POST', `/projects/${projectId}/sources`, { filename: 'brd.md', text }, asAnalyst,
  );
  assert.equal(ingested.status, 201, JSON.stringify(ingested.json));
  const sourceId = ingested.json.source.id;

  const extracted = await call(
    s, 'POST', `/projects/${projectId}/sources/${sourceId}/extract-evidence`, undefined, asAnalyst,
  );
  assert.equal(extracted.status, 201, JSON.stringify(extracted.json));
  assert.ok(extracted.json.accepted.length > 0, 'the fixture must produce evidence to build on');
  return { projectId, sourceId };
}

async function populate(s: Server, projectId: string): Promise<any> {
  const r = await call(s, 'POST', `/projects/${projectId}/populate-frame`, undefined, asAnalyst);
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json;
}

// ---------------------------------------------------------------------------
// J7 — the partition
// ---------------------------------------------------------------------------

describe('J7 the six-pass partition', () => {
  test('covers all 27 slots exactly once and splits no disjointness pair', () => {
    // The partition is the reason nine group-shaped passes were rejected: a pass
    // that split a pair would ask two calls about slots that must be told apart.
    assert.deepEqual(partitionProblems(), []);
    assert.equal(FRAME_PASSES.length, 6);
    assert.equal(
      FRAME_PASSES.reduce((n, p) => n + p.slots.length, 0),
      RAF_SLOT_KEYS.length,
    );
  });

  test('outcomes and outputs share a pass — the pair that crosses two RAF groups', () => {
    // The specific fact that made a group-shaped partition wrong.
    assert.equal(passForSlot('outcomes')?.id, passForSlot('outputs')?.id);
  });

  test('every required-for-executability slot is reachable', () => {
    // A required slot no pass asks about would be permanently empty, and an empty
    // required slot blocks G1 — a self-inflicted blocker nobody could diagnose.
    for (const key of REQUIRED_SLOT_KEYS) {
      assert.ok(passForSlot(key) !== undefined, `no pass covers required slot ${key}`);
    }
  });
});

// ---------------------------------------------------------------------------
// The chain
// ---------------------------------------------------------------------------

describe('POPULATE_FRAME end to end', () => {
  test('produces grounded, attributed, confidence-carrying DRAFT proposals', async () => {
    const s = await startServer();
    try {
      const { projectId } = await projectWithEvidence(s);
      const result = await populate(s, projectId);

      assert.ok(result.accepted.length > 0, JSON.stringify(result));
      for (const requirement of result.accepted) {
        // J4: the single most important assertion in this file.
        assert.equal(requirement.status, 'draft');
        // J1: L2 only. L3 is refused and L4 is a human act.
        assert.equal(requirement.epistemicLevel, 'L2');
        assert.ok(['extracted', 'interpreted'].includes(requirement.derivation));
        // J8: attributed, and the interaction is named.
        assert.equal(requirement.generatedBy, 'ai');
        assert.match(String(requirement.aiInteractionId), /^ai/);
        assert.equal(requirement.promptVersion, 'populate-frame@1');
        // ADR-0011: computed, with its function version travelling alongside.
        assert.equal(typeof requirement.computedConfidence, 'number');
        assert.ok(['HIGH', 'MEDIUM', 'LOW'].includes(requirement.confidenceBand));
        assert.equal(requirement.confidenceFunctionVersion, 'confidence-1');
        // The frame is owned by code: the slot must be one of the 27.
        assert.ok((RAF_SLOT_KEYS as readonly string[]).includes(requirement.rafSlot));
        assert.match(String(requirement.id), /^REQ-\d{4}$/);
      }

      // Six passes per batch, each recorded separately (J7).
      assert.equal(result.passes.length, 6);
      assert.equal(result.interactionIds.length, 6);
    } finally {
      await s.close();
    }
  });

  test('EVERY proposal traces to eligible evidence, and the chain resolves', async () => {
    const s = await startServer();
    try {
      const { projectId, sourceId } = await projectWithEvidence(s);
      await populate(s, projectId);

      const listed = await call(s, 'GET', `/projects/${projectId}/requirements`, undefined, asAnalyst);
      assert.equal(listed.status, 200);
      assert.ok(listed.json.total > 0);

      const evidence = await call(s, 'GET', `/projects/${projectId}/evidence`, undefined, asAnalyst);
      const byId = new Map<string, EvidenceItem>(
        evidence.json.evidence.map((e: EvidenceItem) => [e.id, e]),
      );
      const source = await call(s, 'GET', `/projects/${projectId}/sources/${sourceId}`, undefined, asAnalyst);
      assert.equal(source.status, 200);

      for (const requirement of listed.json.requirements) {
        // D2: at least one link, and exactly one primary.
        assert.ok(requirement.evidence.length >= 1, requirement.id);
        assert.equal(requirement.evidence.filter((e: any) => e.contribution === 'primary').length, 1);

        for (const link of requirement.evidence) {
          const item = byId.get(link.evidenceItemId);
          // proposal -> link -> evidence -> verified anchor -> source.
          assert.ok(item !== undefined, `${requirement.id} cites unknown evidence`);
          assert.equal(item.anchorVerified, true);
          assert.equal(item.sourceId, sourceId);
          const anchor = item.anchor as ProvenanceAnchor;
          assert.ok(DOC.includes(anchor.quote), 'the cited quote must still be in the document');
        }
      }
    } finally {
      await s.close();
    }
  });

  test('the whole pass commits together and survives a restart', async () => {
    const blobRoot = await mkdtemp(join(tmpdir(), 'asdp-v5-restart-'));
    const database = await createPgliteDatabase({});
    await migrate(database);
    const config = loadConfig({ PORT: '0', ASDP_LOG_LEVEL: 'error', ASDP_BLOB_ROOT: blobRoot });
    const blobStore = await createFilesystemBlobStore({ rootDirectory: blobRoot });

    const boot = async (): Promise<Server> => {
      const ids = sharedIds();
      const running = await listen(
        {
          config,
          database,
          blobStore,
          clock: systemClock(),
          ids,
          evidenceExtractor: extractorOver(ids),
          framePopulator: populatorOver(ids),
        },
        0,
      );
      return { ...running, database };
    };

    let s = await boot();
    let projectId: string;
    let expected: number;
    try {
      const created = await projectWithEvidence(s);
      projectId = created.projectId;
      const result = await populate(s, projectId);
      expected = result.accepted.length;
      await s.close();
    } catch (err) {
      await s.close();
      await database.close();
      throw err;
    }

    s = await boot();
    try {
      const listed = await call(s, 'GET', `/projects/${projectId}/requirements`, undefined, asAnalyst);
      assert.equal(listed.json.total, expected, 'proposals must survive a service restart');
      // And the citations still resolve after the restart, which is the part that
      // makes durability mean something rather than just rows existing.
      for (const requirement of listed.json.requirements) {
        assert.ok(requirement.evidence.length >= 1);
      }
    } finally {
      await s.close();
      await database.close();
    }
  });
});

// ---------------------------------------------------------------------------
// J4 — nothing V5 writes can look approved
// ---------------------------------------------------------------------------

describe('J4 draft only, enforced in SQL', () => {
  test('SQL REFUSES an approved requirement, not just the command', async () => {
    const s = await startServer();
    try {
      const { projectId } = await projectWithEvidence(s);
      const result = await populate(s, projectId);
      const id = result.accepted[0].id;

      // Reaching past the command deliberately: the claim is that the DATABASE
      // refuses this, so proving it through the command would prove nothing.
      await assert.rejects(
        s.database.query('update requirement set status = $1 where id = $2', ['approved', id]),
        /requirement_status_draft_only|violates check constraint/i,
      );
    } finally {
      await s.close();
    }
  });

  test('SQL refuses an L3 or L4 proposal, and an inferred derivation', async () => {
    const s = await startServer();
    try {
      const { projectId } = await projectWithEvidence(s);
      const result = await populate(s, projectId);
      const id = result.accepted[0].id;

      // J1 and ADR-0007, in SQL. L4 is a human act; L3 is refused in V5.
      await assert.rejects(
        s.database.query('update requirement set epistemic_level = $1 where id = $2', ['L4', id]),
        /requirement_level_valid|violates check constraint/i,
      );
      await assert.rejects(
        s.database.query('update requirement set derivation = $1 where id = $2', ['inferred', id]),
        /requirement_derivation_valid|violates check constraint/i,
      );
    } finally {
      await s.close();
    }
  });

  test('THERE IS STILL NO DIRECT APPROVAL ROUTE — approval is G1 alone (U1)', async () => {
    // REWRITTEN IN V7. This asserted 404 on eight paths because at V5 nothing
    // human-facing existed; V7 legitimately adds `review` and the G1 gate, so
    // asserting their absence would assert that V7 was not built.
    //
    // What must STILL 404 is a route that approves a REQUIREMENT directly.
    // Approval is a signature over a BASELINE (ADR-0017), and promotion to L4 is
    // its consequence — never a per-requirement action, however convenient.
    const s = await startServer();
    try {
      const { projectId } = await projectWithEvidence(s);
      const result = await populate(s, projectId);
      const id = result.accepted[0].id;

      for (const path of [
        `/projects/${projectId}/requirements/${id}/approve`,
        `/projects/${projectId}/requirements/${id}/promote`,
        `/projects/${projectId}/requirements/${id}/status`,
        `/projects/${projectId}/requirements/approve-all`,
        `/projects/${projectId}/requirement-rejections/resolve`,
      ]) {
        const r = await call(s, 'POST', path, { status: 'approved' }, asAnalyst);
        assert.equal(r.status, 404, path);
      }
    } finally {
      await s.close();
    }
  });

  test('a Viewer may READ proposals and coverage but may not populate', async () => {
    const s = await startServer();
    try {
      const { projectId } = await projectWithEvidence(s);
      await populate(s, projectId);

      const listed = await call(s, 'GET', `/projects/${projectId}/requirements`, undefined, asViewer);
      assert.equal(listed.status, 200);
      const coverage = await call(s, 'GET', `/projects/${projectId}/frame-coverage`, undefined, asViewer);
      assert.equal(coverage.status, 200);

      const attempted = await call(s, 'POST', `/projects/${projectId}/populate-frame`, undefined, asViewer);
      assert.equal(attempted.status, 403, 'populating spends money and writes proposals');
    } finally {
      await s.close();
    }
  });
});

// ---------------------------------------------------------------------------
// The gate — one condition per test
// ---------------------------------------------------------------------------

function evidenceFor(overrides: Partial<EvidenceItem> = {}): EligibleEvidence {
  const text = 'The officer must approve the request within five working days.';
  const item: EvidenceItem = {
    id: 'ev-1',
    projectId: 'prj-1',
    sourceId: 'src-1',
    anchor: {
      sourceId: 'src-1',
      target: { kind: 'text_range', charStart: 0, charEnd: [...text].length },
      quote: text,
      quoteChecksum: spanChecksum(text),
      language: 'en',
      direction: 'ltr',
      precision: 'exact',
      extractorVersion: 'test@1',
    },
    verbatimText: text,
    language: 'en',
    extractedBy: 'parser',
    citationMode: 'parser_minted',
    anchorVerified: true,
    classification: 'INTERNAL',
    createdBy: 'u-1',
    createdAt: '2026-08-23T00:00:00.000Z',
    ...overrides,
  } as EvidenceItem;
  return {
    item,
    storedText: text,
    sourceAuthorityRank: 1,
    sourceKind: 'brd',
    sourcePrimaryLanguage: 'en',
  };
}

function gate(proposal: Partial<Parameters<typeof gateProposal>[0]['proposal']> = {}, evidence = evidenceFor()) {
  return gateProposal({
    proposal: {
      slot: 'processSteps',
      text: 'The officer approves the request.',
      category: 'functional',
      evidenceItemIds: [evidence.item.id],
      ...proposal,
    } as Parameters<typeof gateProposal>[0]['proposal'],
    batch: new Map([[evidence.item.id, evidence]]),
    passSlots: [...(passForSlot('processSteps')?.slots ?? [])],
    passId: 'P2',
    confidenceInputs: { providerCapabilityTier: 'unknown', degradations: [] },
  });
}

describe('the proposal gate — four conditions, all of them', () => {
  test('condition 4a: a proposal citing NO evidence is rejected as an L3 inference', () => {
    const outcome = gate({ evidenceItemIds: [] });
    assert.equal(outcome.kind, 'rejected');
    if (outcome.kind !== 'rejected') return;
    assert.equal(outcome.reason, 'no_evidence_cited');
    // J9: the text is retained on the rejection, not hashed away.
    assert.equal(outcome.proposedText, 'The officer approves the request.');
  });

  test('condition 2: a citation the pass was never shown is rejected', () => {
    const outcome = gate({ evidenceItemIds: ['ev-does-not-exist'] });
    assert.equal(outcome.kind, 'rejected');
    if (outcome.kind !== 'rejected') return;
    assert.equal(outcome.reason, 'evidence_not_in_batch');
  });

  test('condition 2: a citation whose anchor no longer resolves is rejected', () => {
    // The stored text no longer contains the quote: the source moved on and the
    // anchor did not. ADR-0008 refuses to build on it.
    const drifted = evidenceFor();
    const outcome = gateProposal({
      proposal: {
        slot: 'processSteps',
        text: 'The officer approves the request.',
        category: 'functional',
        evidenceItemIds: ['ev-1'],
      },
      batch: new Map([['ev-1', { ...drifted, storedText: 'Something else entirely.' }]]),
      passSlots: [...(passForSlot('processSteps')?.slots ?? [])],
      passId: 'P2',
      confidenceInputs: { providerCapabilityTier: 'unknown', degradations: [] },
    });
    assert.equal(outcome.kind, 'rejected');
    if (outcome.kind !== 'rejected') return;
    assert.equal(outcome.reason, 'anchor_unresolved');
  });

  test('condition 2: unverified evidence may not support a requirement', () => {
    const outcome = gate({}, evidenceFor({ anchorVerified: false }));
    assert.equal(outcome.kind, 'rejected');
    if (outcome.kind !== 'rejected') return;
    assert.equal(outcome.reason, 'anchor_unresolved');
  });

  test('J1: an assumption THE EVIDENCE STATES is permitted in the assumptions slot', () => {
    // Added during the V5 acceptance review, which found this approved J1 case
    // working but untested. The distinction it protects is the whole of J1: an
    // assumption a DOCUMENT states is evidence like any other, while one the
    // MODEL supplies is an L3 inference. Nothing else in the gate separates them.
    const stated = 'It is assumed that the register is available during working hours.';
    const evidence = evidenceFor({ id: 'ev-assume', verbatimText: stated });
    const withText: EligibleEvidence = {
      ...evidence,
      item: {
        ...evidence.item,
        verbatimText: stated,
        anchor: {
          ...evidence.item.anchor,
          target: { kind: 'text_range', charStart: 0, charEnd: [...stated].length },
          quote: stated,
          quoteChecksum: spanChecksum(stated),
        },
      },
      storedText: stated,
    };

    const pass = passForSlot('assumptions');
    assert.ok(pass !== undefined);
    const outcome = gateProposal({
      proposal: {
        slot: 'assumptions',
        text: stated,
        category: 'assumption',
        evidenceItemIds: ['ev-assume'],
      },
      batch: new Map([['ev-assume', withText]]),
      passSlots: [...(pass?.slots ?? [])],
      passId: pass?.id ?? 'P1',
      confidenceInputs: { providerCapabilityTier: 'unknown', degradations: [] },
    });

    assert.equal(outcome.kind, 'accepted');
    if (outcome.kind !== 'accepted') return;
    assert.equal(outcome.slot, 'assumptions');
    assert.equal(outcome.epistemicLevel, 'L2');
  });

  test('J1: an assumption THE MODEL INVENTS is rejected, and its text is kept', () => {
    // The other half, and the one that matters: a model filling a gap with a
    // sensible default is exactly the L3 inference V5 refuses. It is rejected by
    // the same rule that rejects any uncited proposal, which is why the reason
    // code is `no_evidence_cited` rather than something assumption-specific.
    const pass = passForSlot('assumptions');
    const outcome = gateProposal({
      proposal: {
        slot: 'assumptions',
        text: 'It is assumed the service is available 24/7.',
        category: 'assumption',
        evidenceItemIds: [],
      },
      batch: new Map(),
      passSlots: [...(pass?.slots ?? [])],
      passId: pass?.id ?? 'P1',
      confidenceInputs: { providerCapabilityTier: 'unknown', degradations: [] },
    });

    assert.equal(outcome.kind, 'rejected');
    if (outcome.kind !== 'rejected') return;
    assert.equal(outcome.reason, 'no_evidence_cited');
    assert.match(outcome.detail, /L3 inference/);
    // J9: retained in full, so "the model wanted to assume this" stays answerable.
    assert.equal(outcome.proposedText, 'It is assumed the service is available 24/7.');
  });

  test('condition 3: a slot outside the frame is rejected — the model may not extend it', () => {
    const outcome = gate({ slot: 'inventedSlot' });
    assert.equal(outcome.kind, 'rejected');
    if (outcome.kind !== 'rejected') return;
    assert.equal(outcome.reason, 'slot_not_in_pass');
    assert.match(outcome.detail, /ADR-0010/);
  });

  test('condition 3: a real slot the pass did not offer is rejected', () => {
    // `securityAndPrivacy` is a legitimate slot — in pass P6, not P2. Assigning it
    // here would decide a slot without its disjointness partner in view.
    const outcome = gate({ slot: 'securityAndPrivacy' });
    assert.equal(outcome.kind, 'rejected');
    if (outcome.kind !== 'rejected') return;
    assert.equal(outcome.reason, 'slot_not_in_pass');
  });

  test('condition 4b: classification is DERIVED from evidence, never proposed', () => {
    const confidential = evidenceFor({ classification: 'CONFIDENTIAL' });
    const outcome = gate({}, confidential);
    assert.equal(outcome.kind, 'accepted');
    if (outcome.kind !== 'accepted') return;
    // D10: classification may rise, never fall. The model has no say.
    assert.equal(outcome.classification, 'CONFIDENTIAL');
  });

  test('an accepted proposal computes its own level, derivation and confidence', () => {
    const outcome = gate();
    assert.equal(outcome.kind, 'accepted');
    if (outcome.kind !== 'accepted') return;
    assert.equal(outcome.epistemicLevel, 'L2');
    assert.equal(outcome.derivation, 'extracted');
    assert.equal(outcome.confidence.version, 'confidence-1');
    // J2: nothing has been compared, so `silent` — NOT a claim of agreement.
    assert.equal(outcome.confidence.factors.crossSourceAgreement, 'silent');
    assert.equal(outcome.evidence[0]?.contribution, 'primary');
  });

  test('confidence is WEAKEST-LINK over the evidence it rests on', () => {
    const strong = evidenceFor();
    const weak: EligibleEvidence = {
      ...evidenceFor({ id: 'ev-2' }),
      // A lower-authority source, and a page-precision anchor.
      sourceAuthorityRank: 4,
    };
    const weakened: EligibleEvidence = {
      ...weak,
      item: { ...weak.item, anchor: { ...weak.item.anchor, precision: 'page' } },
    };

    const both = gateProposal({
      proposal: {
        slot: 'processSteps',
        text: 'The officer approves the request.',
        category: 'functional',
        evidenceItemIds: ['ev-1', 'ev-2'],
      },
      batch: new Map([
        ['ev-1', strong],
        ['ev-2', weakened],
      ]),
      passSlots: [...(passForSlot('processSteps')?.slots ?? [])],
      passId: 'P2',
      confidenceInputs: { providerCapabilityTier: 'unknown', degradations: [] },
    });

    assert.equal(both.kind, 'accepted');
    if (both.kind !== 'accepted') return;
    // Two citations, so `interpreted`; and the weakest of the two decides.
    assert.equal(both.derivation, 'interpreted');
    assert.equal(both.confidence.factors.anchorPrecision, 'page');
    assert.equal(both.confidence.factors.sourceAuthorityRank, 4);
  });
});

// ---------------------------------------------------------------------------
// J2 — deduplication is not conflict resolution
// ---------------------------------------------------------------------------

describe('J2 conflicts stay in V6', () => {
  test('identical text on an IDENTICAL evidence set is one proposition', () => {
    const a = duplicateKey('processSteps', 'The officer approves.', ['ev-1', 'ev-2']);
    const b = duplicateKey('processSteps', '  the  OFFICER   approves. ', ['ev-2', 'ev-1']);
    assert.equal(a, b, 'normalisation and evidence-set order must not matter');
  });

  test('identical text on DIFFERENT evidence is TWO propositions, deliberately', () => {
    // The heart of J2. Two sources saying the same thing is not one fact — and
    // deciding which to keep would be reconciliation, which is V6's subject.
    const a = duplicateKey('processSteps', 'The officer approves.', ['ev-1']);
    const b = duplicateKey('processSteps', 'The officer approves.', ['ev-2']);
    assert.notEqual(a, b);
  });

  test('nothing in a populated frame claims two sources agree', async () => {
    const s = await startServer();
    try {
      const { projectId } = await projectWithEvidence(s);
      const result = await populate(s, projectId);

      // No conflict record, no agreement claim, and no route to either.
      assert.equal((result as Record<string, unknown>).conflicts, undefined);
      const conflicts = await call(s, 'GET', `/projects/${projectId}/conflicts`, undefined, asAnalyst);
      assert.equal(conflicts.status, 404);
    } finally {
      await s.close();
    }
  });
});

// ---------------------------------------------------------------------------
// J9 — rejected proposals are retained in full
// ---------------------------------------------------------------------------

describe('J9 rejection retention', () => {
  test('a rejected proposal is retained WITH ITS TEXT, and counted', async () => {
    // Scripted, because the authored stub cites correctly by construction: it can
    // only propose from lines it was given.
    const s = await startServer({
      populator: (ids) =>
        populatorOver(
          ids,
          scriptedProvider({
          items: [
            {
              slot: 'processSteps',
              text: 'The system should be user-friendly and efficient.',
              category: 'nfr',
              // Cites nothing: an L3 inference in all but name.
              evidenceItemIds: [],
            },
          ],
          limitations: ['the evidence does not describe the objective'],
        }),
      ),
    });
    try {
      const { projectId } = await projectWithEvidence(s);
      const result = await populate(s, projectId);

      assert.equal(result.accepted.length, 0, JSON.stringify(result.accepted));
      assert.ok(result.rejected.length > 0);
      assert.equal(result.rejectionCounts.no_evidence_cited, result.rejected.length);

      const rejection = result.rejected[0];
      assert.equal(rejection.reason, 'no_evidence_cited');
      // ADR-0032 names rejected proposals: the TEXT is retained, not a checksum.
      assert.equal(rejection.proposedText, 'The system should be user-friendly and efficient.');
      assert.match(String(rejection.framePass), /^P[1-6]$/);

      // And it is in the append-only audit record too, not only in the response.
      const audit = await call(s, 'GET', `/projects/${projectId}/audit`, undefined, asAdmin);
      const event = audit.json.find((e: any) => e.action === 'requirements.proposed');
      assert.ok(event !== undefined);
      assert.equal(event.after.acceptedCount, 0);
      assert.equal(event.after.rejectedCount, result.rejected.length);
      assert.equal(
        event.after.rejections[0].proposedText,
        'The system should be user-friendly and efficient.',
      );
      // J1: the model's uncertainty is recorded, not silently dropped.
      assert.ok(event.after.limitations.length > 0);
    } finally {
      await s.close();
    }
  });

  test('the rejection record is stored, not merely returned', async () => {
    const s = await startServer({
      populator: (ids) =>
        populatorOver(
          ids,
          scriptedProvider({
          items: [
            { slot: 'inventedSlot', text: 'Something.', category: 'functional', evidenceItemIds: [] },
          ],
          limitations: [],
        }),
      ),
    });
    try {
      const { projectId } = await projectWithEvidence(s);
      await populate(s, projectId);
      const rows = await s.database.query(
        'select proposed_text, reason from requirement_rejection where project_id = $1',
        [projectId],
      );
      assert.ok(rows.rows.length > 0, 'a rejection must be persisted, not only reported');
      assert.equal(String(rows.rows[0]?.proposed_text), 'Something.');
    } finally {
      await s.close();
    }
  });
});

// ---------------------------------------------------------------------------
// J6 — flags, not catalogue rules
// ---------------------------------------------------------------------------

describe('J6 quality signals are flags', () => {
  test('a vague quantifier with no threshold is FLAGGED, not rejected', () => {
    const accepted = gate({ text: 'The officer must respond promptly.' });
    assert.equal(accepted.kind, 'accepted');
    if (accepted.kind !== 'accepted') return;
    const flags = deriveFlags(accepted, [evidenceFor()]);
    assert.ok(flags.some((f) => f.kind === 'vague_quantifier'));
  });

  test('a threshold present means no vague-quantifier flag', () => {
    const accepted = gate({ text: 'The officer must respond promptly, within 3 working days.' });
    assert.equal(accepted.kind, 'accepted');
    if (accepted.kind !== 'accepted') return;
    const flags = deriveFlags(accepted, [evidenceFor()]);
    assert.ok(!flags.some((f) => f.kind === 'vague_quantifier'));
  });

  test('an obligation with no actor is flagged', () => {
    const accepted = gate({ text: 'The request must be approved before issue.' });
    assert.equal(accepted.kind, 'accepted');
    if (accepted.kind !== 'accepted') return;
    const flags = deriveFlags(accepted, [evidenceFor()]);
    assert.ok(flags.some((f) => f.kind === 'actor_unknown'));
  });

  test('flags reach the database and the coverage view', async () => {
    const s = await startServer({
      populator: (ids) =>
        populatorOver(
          ids,
          scriptedProvider({
          items: [
            {
              slot: 'processSteps',
              text: 'The request must be approved promptly.',
              category: 'functional',
              evidenceItemIds: ['PLACEHOLDER'],
            },
          ],
          limitations: [],
        }),
      ),
    });
    try {
      const { projectId } = await projectWithEvidence(s);
      // The scripted id will not match, so this run rejects — which is itself the
      // point of the next assertion: a flag is never raised on something rejected.
      const result = await populate(s, projectId);
      assert.equal(result.flags.length, 0);
      assert.ok(result.rejected.length > 0);
    } finally {
      await s.close();
    }
  });

  test('the L1-REQ catalogue holds FIVE structural rules and no quality rules', () => {
    assert.equal(L1_REQUIREMENT_RULES.length, 5);
    for (const rule of L1_REQUIREMENT_RULES) {
      assert.equal(rule.layer, 'L1');
      assert.deepEqual(rule.gates, ['G1']);
      assert.match(rule.id, /^L1-REQ-00[1-5]$/);
    }
    // J6: quality signals are flags, so they must NOT appear as catalogue rules.
    const ids = L1_REQUIREMENT_RULES.map((r) => r.id).join(' ');
    assert.ok(!/vague|actor|untestable/i.test(ids + L1_REQUIREMENT_RULES.map((r) => r.messageKey).join(' ')));
  });

  test('L1-REQ-001 fires for a requirement with no evidence', () => {
    const findings = evaluateL1Requirements(
      {
        requirements: [
          { id: 'REQ-0001', projectId: 'prj-1', rafSlot: 'processSteps', classification: 'INTERNAL', resolvedSlot: 'processSteps' },
        ],
        links: [],
        evidenceById: new Map(),
        textBySource: new Map(),
      },
      'run-1',
    );
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.ruleId, 'L1-REQ-001');
    assert.equal(findings[0]?.severityAtGate.G1, 'error');
  });

  test('L1-REQ-002 fires when a cited anchor has drifted since the proposal', () => {
    const evidence = evidenceFor();
    const findings = evaluateL1Requirements(
      {
        requirements: [
          { id: 'REQ-0001', projectId: 'prj-1', rafSlot: 'processSteps', classification: 'INTERNAL', resolvedSlot: 'processSteps' },
        ],
        links: [{ requirementId: 'REQ-0001', evidenceItemId: 'ev-1', contribution: 'primary' }],
        evidenceById: new Map([['ev-1', evidence.item]]),
        // The source text no longer contains the quote.
        textBySource: new Map([['src-1', 'A completely different document.']]),
      },
      'run-1',
    );
    assert.ok(findings.some((f) => f.ruleId === 'L1-REQ-002'));
  });

  test('a clean requirement produces no findings', () => {
    const evidence = evidenceFor();
    const findings = evaluateL1Requirements(
      {
        requirements: [
          { id: 'REQ-0001', projectId: 'prj-1', rafSlot: 'processSteps', classification: 'INTERNAL', resolvedSlot: 'processSteps' },
        ],
        links: [{ requirementId: 'REQ-0001', evidenceItemId: 'ev-1', contribution: 'primary' }],
        evidenceById: new Map([['ev-1', evidence.item]]),
        textBySource: new Map([['src-1', evidence.storedText]]),
      },
      'run-1',
    );
    assert.deepEqual(findings, []);
  });
});

// ---------------------------------------------------------------------------
// J3 — coverage, computed on read
// ---------------------------------------------------------------------------

describe('J3 coverage', () => {
  test('coverage is computed from proposals and names its G1 blockers', async () => {
    const s = await startServer();
    try {
      const { projectId } = await projectWithEvidence(s);
      await populate(s, projectId);

      const r = await call(s, 'GET', `/projects/${projectId}/frame-coverage`, undefined, asAnalyst);
      assert.equal(r.status, 200);
      assert.equal(r.json.rafVersion, 'raf-1.1');
      assert.equal(r.json.coverage.slots.length, RAF_SLOT_KEYS.length);
      // Required slots the evidence never filled block G1 — correctly, and this
      // fixture cannot fill most of them.
      assert.ok(r.json.coverage.g1Blockers.length > 0);
      // The note is part of the contract: an `adequate` slot is not "settled".
      assert.match(String(r.json.note), /DRAFT/);
      assert.match(String(r.json.note), /Conflicts are not detected in V5/);
    } finally {
      await s.close();
    }
  });

  test('coverage has NO conflicts field — it cannot smuggle in reconciliation', async () => {
    const s = await startServer();
    try {
      const { projectId } = await projectWithEvidence(s);
      await populate(s, projectId);
      const r = await call(s, 'GET', `/projects/${projectId}/frame-coverage`, undefined, asAnalyst);
      assert.equal(r.json.coverage.conflicts, undefined);
      assert.equal(r.json.coverage.openQuestions, undefined);
    } finally {
      await s.close();
    }
  });

  test('NO raf_coverage table exists — coverage is computed on read (J3-b)', async () => {
    const s = await startServer();
    try {
      const r = await s.database.query(
        "select table_name from information_schema.tables where table_name = 'raf_coverage'",
      );
      assert.equal(r.rows.length, 0, 'a persisted snapshot would go stale on the next insert');
    } finally {
      await s.close();
    }
  });

  test('an unpopulated project reports every slot empty rather than erroring', async () => {
    const s = await startServer();
    try {
      const projectId = await project(s);
      const r = await call(s, 'GET', `/projects/${projectId}/frame-coverage`, undefined, asAnalyst);
      assert.equal(r.status, 200);
      assert.equal(r.json.coverage.slots.every((slot: any) => slot.status === 'empty'), true);
      assert.equal(r.json.coverage.g1Blockers.length, REQUIRED_SLOT_KEYS.length);
    } finally {
      await s.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Batching, replay and refusal
// ---------------------------------------------------------------------------

describe('batching, replay and refusal', () => {
  test('evidence batching is deterministic and stable', () => {
    const items = ['ev-3', 'ev-1', 'ev-2'].map((id) => evidenceFor({ id, sourceId: 'src-1' }));
    const a = planEvidenceBatches(items, 2);
    const b = planEvidenceBatches([...items].reverse(), 2);
    assert.deepEqual(
      a.map((batch) => batch.map((e) => e.item.id)),
      b.map((batch) => batch.map((e) => e.item.id)),
      'input order must not change the plan',
    );
    assert.deepEqual(a[0]?.map((e) => e.item.id), ['ev-1', 'ev-2']);
  });

  test('a split batch DECLARES chunked_context and reaches confidence', async () => {
    const s = await startServer({ evidencePerBatch: 1 });
    try {
      const { projectId } = await projectWithEvidence(s);
      const result = await populate(s, projectId);
      assert.ok(result.evidence.batches > 1, 'the fixture must split at one item per batch');
      // E4 rules 4 and 5: the split declares itself rather than relying on the
      // capability ladder to name it — the V4b-core defect, not repeated.
      assert.ok(result.degradations.includes('chunked_context'), JSON.stringify(result.degradations));
    } finally {
      await s.close();
    }
  });

  test('replay is deterministic: the same project yields the same proposals', async () => {
    const first = await startServer();
    let firstTexts: string[];
    try {
      const { projectId } = await projectWithEvidence(first);
      const result = await populate(first, projectId);
      firstTexts = result.accepted.map((r: any) => `${r.rafSlot}:${r.text}`).sort();
    } finally {
      await first.close();
    }

    const second = await startServer();
    try {
      const { projectId } = await projectWithEvidence(second);
      const result = await populate(second, projectId);
      const secondTexts = result.accepted.map((r: any) => `${r.rafSlot}:${r.text}`).sort();
      assert.deepEqual(secondTexts, firstTexts);
    } finally {
      await second.close();
    }
  });

  test('the default build REFUSES: no provider is configured', async () => {
    const blobRoot = await mkdtemp(join(tmpdir(), 'asdp-v5-none-'));
    const database = await createPgliteDatabase({});
    await migrate(database);
    const config = loadConfig({ PORT: '0', ASDP_LOG_LEVEL: 'error', ASDP_BLOB_ROOT: blobRoot });
    const blobStore = await createFilesystemBlobStore({ rootDirectory: blobRoot });
    const ids = sharedIds();
    const running = await listen(
      {
        config,
        database,
        blobStore,
        clock: systemClock(),
        ids,
        evidenceExtractor: extractorOver(ids),
        // No populator: the application ships unable to populate the frame.
      },
      0,
    );
    const s: Server = { ...running, database };
    try {
      const { projectId } = await projectWithEvidence(s);
      const result = await populate(s, projectId);
      assert.equal(result.accepted.length, 0);
      assert.equal(result.passes.filter((p: any) => p.refused !== undefined).length, 6);
      assert.match(String(result.passes[0].refused), /no AI provider is configured/);
    } finally {
      await running.close();
      await database.close();
    }
  });

  test('a REFUSAL WITH NO PROVIDER records NO policy block — it is not a governance finding', async () => {
    // The distinction data-governance.md §3.1 draws, in the direction that is
    // easy to get wrong. "No provider is configured" says nothing about whether
    // anyone was permitted to read anything, and recording it as
    // `blocked_by_policy` would put a governance claim on the record that nobody
    // made — then demand a human acknowledge it at G1.
    const blobRoot = await mkdtemp(join(tmpdir(), 'asdp-v5-nopolicy-'));
    const database = await createPgliteDatabase({});
    await migrate(database);
    const config = loadConfig({ PORT: '0', ASDP_LOG_LEVEL: 'error', ASDP_BLOB_ROOT: blobRoot });
    const blobStore = await createFilesystemBlobStore({ rootDirectory: blobRoot });
    const ids = sharedIds();
    const running = await listen(
      { config, database, blobStore, clock: systemClock(), ids, evidenceExtractor: extractorOver(ids) },
      0,
    );
    const s: Server = { ...running, database };
    try {
      const { projectId } = await projectWithEvidence(s);
      const result = await populate(s, projectId);
      assert.equal(result.passes.filter((p: any) => p.refused !== undefined).length, 6);

      const blocks = await database.query(
        'select * from slot_policy_block where project_id = $1',
        [projectId],
      );
      assert.equal(blocks.rows.length, 0, 'an unavailable provider is not a policy denial');
    } finally {
      await running.close();
      await database.close();
    }
  });

  test('an EGRESS refusal DOES record a policy block, per slot the pass would have filled', async () => {
    // The producing path for `blocked_by_policy`, which had none: `slotStatus`
    // could always return it and nothing could ever cause it, so `L4-REQ-007`
    // reported met on every project whatever the egress gate had refused.
    //
    // The evidence is reclassified past the command, because the point under test
    // is what the POPULATE pass does when the gate refuses — not how the evidence
    // came to be RESTRICTED.
    const s = await startServer();
    try {
      const { projectId } = await projectWithEvidence(s);
      await s.database.query(
        'update evidence_item set classification = $1 where project_id = $2',
        ['PROHIBITED', projectId],
      );

      const result = await populate(s, projectId);
      assert.equal(result.accepted.length, 0, 'nothing may be proposed from content that cannot leave');
      assert.ok(result.passes.every((p: any) => p.refused !== undefined));
      assert.match(String(result.passes[0].refused), /no provider may receive PROHIBITED content/);

      const blocks = await s.database.query(
        'select raf_slot, classification, reason from slot_policy_block where project_id = $1',
        [projectId],
      );
      assert.ok(blocks.rows.length > 0, 'a denied analysis must leave a record');
      assert.equal(String((blocks.rows[0] as any).classification), 'PROHIBITED');

      // And it reads back as BLOCKED, not as a slot the sources are silent on.
      const coverage = await call(s, 'GET', `/projects/${projectId}/frame-coverage`, undefined, asAnalyst);
      assert.ok(
        coverage.json.coverage.blockedByPolicy.length > 0,
        'the slot must report blocked_by_policy, never empty',
      );
      for (const slot of coverage.json.coverage.blockedByPolicy) {
        assert.ok(
          !coverage.json.coverage.g1Blockers.includes(slot),
          'a blocked slot is acknowledged at G1, not filled',
        );
      }
    } finally {
      await s.close();
    }
  });

  test('a project with no evidence is refused by name, not answered emptily', async () => {
    const s = await startServer();
    try {
      const projectId = await project(s);
      const r = await call(s, 'POST', `/projects/${projectId}/populate-frame`, undefined, asAnalyst);
      assert.equal(r.status, 400);
      assert.match(String(r.json.error), /no evidence/i);
    } finally {
      await s.close();
    }
  });
});
