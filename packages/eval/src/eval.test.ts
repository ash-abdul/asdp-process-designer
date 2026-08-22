/**
 * Tests for @asdp/eval.
 *
 * Phase 1 acceptance criterion 10: the harness computes metrics from recordings
 * with NO NETWORK, and reports state their corpus tier so a synthetic-only
 * metric cannot be over-read.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { toMatchText } from '@asdp/text';
import type { AiRequest, AiResponse } from '@asdp/schemas';
import { createPrivateEndpointProvider } from '@asdp/ai';
import {
  CorpusNotFoundError,
  RecordingMissError,
  ReportIncompleteError,
  TIER_WEIGHT,
  assertNotHeldOut,
  buildReport,
  computeExtractionQuality,
  computeProvenanceMetrics,
  computeSlotAccuracy,
  createCorpusRegistry,
  createMemoryRecordingStore,
  createReplayProvider,
  mayAcceptChange,
  recordingKeyHash,
  requestInputHash,
  type CorpusDescriptor,
  type CorpusStore,
  type ExtractedItem,
  type GoldItem,
} from './index.ts';

// ---------------------------------------------------------------------------
// Corpus registry
// ---------------------------------------------------------------------------

const SYNTHETIC: CorpusDescriptor = {
  id: 'syn-bilingual-1',
  name: 'Synthetic bilingual onboarding corpus',
  tier: 'synthetic',
  classification: 'PUBLIC',
  languages: ['en', 'ar'],
  documents: [
    { documentId: 'brd', sourceKind: 'brd', language: 'en', provenance: 'authored for tests' },
    { documentId: 'policy-ar', sourceKind: 'policy', language: 'ar', provenance: 'authored for tests' },
  ],
  heldOut: false,
};

const REAL_HELD_OUT: CorpusDescriptor = {
  id: 'real-1',
  name: 'Real ASDP material',
  tier: 'real',
  classification: 'RESTRICTED',
  languages: ['ar', 'en'],
  documents: [],
  heldOut: true,
};

function storeWith(corpora: readonly CorpusDescriptor[]): CorpusStore {
  return {
    async list() {
      return corpora;
    },
    async get(id) {
      return corpora.find((c) => c.id === id);
    },
    async readDocument(corpusId, documentId) {
      return `content of ${corpusId}/${documentId}`;
    },
  };
}

describe('corpus registry (ADR-0031)', () => {
  test('resolves a registered corpus by id', async () => {
    const registry = createCorpusRegistry(storeWith([SYNTHETIC]));
    const c = await registry.resolve('syn-bilingual-1');
    assert.equal(c.tier, 'synthetic');
    assert.deepEqual(c.languages, ['en', 'ar']);
  });

  test('an unregistered corpus is an explicit error, never an empty default', async () => {
    const registry = createCorpusRegistry(storeWith([]));
    await assert.rejects(() => registry.resolve('nope'), CorpusNotFoundError);
  });

  test('THE HARNESS DOES NOT ASSUME AN IN-REPO CORPUS: the store is injected', async () => {
    // The property that lets real corpora arrive later as a data-loading
    // exercise rather than a redesign (ADR-0031).
    const registry = createCorpusRegistry(storeWith([REAL_HELD_OUT]));
    const doc = await registry.readDocument('real-1', 'x');
    assert.equal(doc, 'content of real-1/x');
  });

  test('synthetic corpora are down-weighted in a composite score', () => {
    assert.ok(TIER_WEIGHT.synthetic < TIER_WEIGHT.sanitised);
    assert.ok(TIER_WEIGHT.sanitised <= TIER_WEIGHT.representative);
  });

  test('reports the highest registered tier', async () => {
    const registry = createCorpusRegistry(storeWith([SYNTHETIC, REAL_HELD_OUT]));
    assert.equal(await registry.highestRegisteredTier(), 'real');
  });
});

describe('anti-over-fitting rule (Phase 0 decision 6)', () => {
  test('synthetic evidence alone is sufficient while only synthetic corpora exist', () => {
    const r = mayAcceptChange(['synthetic'], 'synthetic');
    assert.equal(r.allowed, true);
  });

  test('ONCE A HIGHER-TIER CORPUS EXISTS, SYNTHETIC EVIDENCE ALONE IS REFUSED', () => {
    const r = mayAcceptChange(['synthetic'], 'representative');
    assert.equal(r.allowed, false);
    assert.match(r.reason ?? '', /synthetic evidence alone/);
  });

  test('higher-tier evidence is accepted', () => {
    assert.equal(mayAcceptChange(['representative'], 'representative').allowed, true);
    assert.equal(mayAcceptChange(['synthetic', 'sanitised'], 'sanitised').allowed, true);
  });

  test('a held-out corpus may not be used for prompt iteration', () => {
    assert.throws(() => assertNotHeldOut(REAL_HELD_OUT, 'iteration'), /held out/);
    assert.doesNotThrow(() => assertNotHeldOut(REAL_HELD_OUT, 'measurement'));
    assert.doesNotThrow(() => assertNotHeldOut(SYNTHETIC, 'iteration'));
  });
});

// ---------------------------------------------------------------------------
// Record / replay — acceptance criterion 10
// ---------------------------------------------------------------------------

describe('record and replay (ADR-0031 rule 5)', () => {
  const request: AiRequest = {
    taskType: 'EXTRACT_EVIDENCE',
    taskVersion: '1',
    systemInstruction: 'extract evidence',
    content: [{ kind: 'text', text: 'يجب إتمام التحقق', classification: 'PUBLIC' }],
    outputContract: { mode: 'schema' },
    citationMode: 'post_hoc',
    determinism: 'deterministic',
    reasoningTier: 'standard',
    languageHints: ['ar'],
  };

  const liveResponse: AiResponse = {
    outputs: [{ quote: 'يجب إتمام التحقق' }],
    citations: [],
    usage: { inputUnits: 5, cachedInputUnits: 0, outputUnits: 3, costEstimate: 0, latencyMs: 1 },
    providerMeta: { providerId: 'asdp-private-llm', modelId: 'local-small', capabilityTier: 'B' },
    degradations: ['post_hoc_citations'],
  };

  function liveProvider(onCall: () => void) {
    return createPrivateEndpointProvider({
      providerId: 'asdp-private-llm',
      endpointUrl: 'http://internal/model',
      modelId: 'local-small',
      contextUnits: 32_000,
      maxOutputUnits: 4_000,
      capabilities: ['schemaConstrainedOutput'],
      transport: async () => {
        onCall();
        return liveResponse;
      },
    });
  }

  test('the request hash changes when the prompt or content changes', () => {
    const h1 = requestInputHash(request);
    const h2 = requestInputHash({ ...request, systemInstruction: 'different' });
    const h3 = requestInputHash({
      ...request,
      content: [{ kind: 'text', text: 'other', classification: 'PUBLIC' }],
    });
    assert.notEqual(h1, h2);
    assert.notEqual(h1, h3);
    assert.equal(h1, requestInputHash({ ...request }), 'stable for identical input');
  });

  test('record mode calls the provider once and stores the response', async () => {
    let calls = 0;
    const store = createMemoryRecordingStore();
    const provider = createReplayProvider({
      inner: liveProvider(() => calls++),
      store,
      mode: 'record',
      corpusId: 'syn-bilingual-1',
      taskContext: { promptVersion: 'p1', classification: 'PUBLIC' },
      clock: { nowIso: () => '2026-08-22T00:00:00.000Z' },
    });
    await provider.invoke(request, 'local-small');
    assert.equal(calls, 1);
    assert.equal((await store.list()).length, 1);
  });

  test('REPLAY MODE RUNS WITH NO NETWORK: the provider is never called', async () => {
    let calls = 0;
    const store = createMemoryRecordingStore();

    // Record first.
    const recorder = createReplayProvider({
      inner: liveProvider(() => calls++),
      store, mode: 'record', corpusId: 'syn-bilingual-1',
      taskContext: { promptVersion: 'p1', classification: 'PUBLIC' },
      clock: { nowIso: () => '2026-08-22T00:00:00.000Z' },
    });
    await recorder.invoke(request, 'local-small');
    assert.equal(calls, 1);

    // Then replay: no further provider calls.
    const replayer = createReplayProvider({
      inner: liveProvider(() => calls++),
      store, mode: 'replay_only', corpusId: 'syn-bilingual-1',
      taskContext: { promptVersion: 'p1', classification: 'PUBLIC' },
      clock: { nowIso: () => '2026-08-22T00:00:00.000Z' },
    });
    const replayed = await replayer.invoke(request, 'local-small');
    assert.equal(calls, 1, 'the provider was NOT contacted during replay');
    assert.deepEqual(replayed.outputs, liveResponse.outputs);
    assert.equal((await replayer.health()).detail, 'replay mode: provider not contacted');
  });

  test('a replay miss FAILS rather than silently reaching the network', async () => {
    const provider = createReplayProvider({
      inner: liveProvider(() => {
        throw new Error('must not be called');
      }),
      store: createMemoryRecordingStore(),
      mode: 'replay_only',
      corpusId: 'syn-bilingual-1',
      taskContext: { promptVersion: 'p1', classification: 'PUBLIC' },
      clock: { nowIso: () => '2026-08-22T00:00:00.000Z' },
    });
    await assert.rejects(() => provider.invoke(request, 'local-small'), RecordingMissError);
  });

  test('a changed prompt version misses the recording, so stale results cannot leak through', async () => {
    const store = createMemoryRecordingStore();
    const recorder = createReplayProvider({
      inner: liveProvider(() => undefined), store, mode: 'record',
      corpusId: 'syn-bilingual-1', taskContext: { promptVersion: 'p1', classification: 'PUBLIC' },
      clock: { nowIso: () => '2026-08-22T00:00:00.000Z' },
    });
    await recorder.invoke(request, 'local-small');

    const replayer = createReplayProvider({
      inner: liveProvider(() => undefined), store, mode: 'replay_only',
      corpusId: 'syn-bilingual-1', taskContext: { promptVersion: 'p2', classification: 'PUBLIC' },
      clock: { nowIso: () => '2026-08-22T00:00:00.000Z' },
    });
    await assert.rejects(() => replayer.invoke(request, 'local-small'), RecordingMissError);
  });

  test('verify mode reports provider drift', async () => {
    const store = createMemoryRecordingStore();
    const recorder = createReplayProvider({
      inner: liveProvider(() => undefined), store, mode: 'record',
      corpusId: 'syn-bilingual-1', taskContext: { promptVersion: 'p1', classification: 'PUBLIC' },
      clock: { nowIso: () => '2026-08-22T00:00:00.000Z' },
    });
    await recorder.invoke(request, 'local-small');

    const reports: { drifted: boolean }[] = [];
    const drifting = createPrivateEndpointProvider({
      providerId: 'asdp-private-llm', endpointUrl: 'http://internal/model',
      modelId: 'local-small', contextUnits: 32_000, maxOutputUnits: 4_000,
      capabilities: ['schemaConstrainedOutput'],
      transport: async () => ({ ...liveResponse, outputs: [{ quote: 'SOMETHING ELSE' }] }),
    });
    const verifier = createReplayProvider({
      inner: drifting, store, mode: 'verify',
      corpusId: 'syn-bilingual-1', taskContext: { promptVersion: 'p1', classification: 'PUBLIC' },
      clock: { nowIso: () => '2026-08-22T00:00:00.000Z' },
      onDrift: (r) => reports.push({ drifted: r.drifted }),
    });
    await verifier.invoke(request, 'local-small');
    assert.equal(reports.length, 1);
    assert.equal(reports[0]?.drifted, true, 'a silently updated model is detected');
  });

  test('recordings inherit their corpus classification', async () => {
    const store = createMemoryRecordingStore();
    const recorder = createReplayProvider({
      inner: liveProvider(() => undefined), store, mode: 'record',
      corpusId: 'real-1', taskContext: { promptVersion: 'p1', classification: 'RESTRICTED' },
      clock: { nowIso: () => '2026-08-22T00:00:00.000Z' },
    });
    await recorder.invoke(request, 'local-small');
    const stored = (await store.list())[0];
    assert.equal(stored?.classification, 'RESTRICTED');
  });

  test('recording key hashes are stable and distinct', () => {
    const base = {
      corpusId: 'c', taskType: 't', promptVersion: 'p',
      providerId: 'pr', modelId: 'm', inputHash: 'h',
    };
    assert.equal(recordingKeyHash(base), recordingKeyHash({ ...base }));
    assert.notEqual(recordingKeyHash(base), recordingKeyHash({ ...base, modelId: 'm2' }));
  });
});

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

describe('provenance metrics — defect detectors, not scores', () => {
  test('a fully anchored extraction scores 100% and is not a defect', () => {
    const items: ExtractedItem[] = [
      { id: '1', quote: 'a', mode: 'extracted', anchorResolved: true, anchorPrecision: 'exact' },
      { id: '2', quote: 'b', mode: 'interpreted', anchorResolved: true, anchorPrecision: 'exact' },
    ];
    const m = computeProvenanceMetrics(items);
    assert.equal(m.anchorResolutionRate, 1);
    assert.equal(m.hallucinationRate, 0);
    assert.equal(m.isDefect, false);
  });

  test('ANCHOR RESOLUTION BELOW 100% IS A DEFECT, NOT A SCORE', () => {
    const items: ExtractedItem[] = [
      { id: '1', quote: 'a', mode: 'extracted', anchorResolved: true, anchorPrecision: 'exact' },
      { id: '2', quote: 'b', mode: 'extracted', anchorResolved: false, anchorPrecision: 'none' },
    ];
    const m = computeProvenanceMetrics(items);
    assert.equal(m.anchorResolutionRate, 0.5);
    assert.equal(m.isDefect, true);
    assert.match(m.defectReasons.join(' '), /below the 100% target/);
  });

  test('HALLUCINATION: an item claimed as extracted with no anchor is counted and named', () => {
    const items: ExtractedItem[] = [
      { id: 'good', quote: 'a', mode: 'extracted', anchorResolved: true, anchorPrecision: 'exact' },
      { id: 'bad', quote: 'invented', mode: 'extracted', anchorResolved: false, anchorPrecision: 'none' },
    ];
    const m = computeProvenanceMetrics(items);
    assert.equal(m.hallucinationRate, 0.5);
    assert.deepEqual(m.hallucinatedItemIds, ['bad']);
    assert.equal(m.isDefect, true);
  });

  test('an honestly-marked inference is NOT a hallucination', () => {
    const items: ExtractedItem[] = [
      { id: '1', quote: undefined, mode: 'inferred', anchorResolved: false, anchorPrecision: 'none' },
    ];
    const m = computeProvenanceMetrics(items);
    assert.equal(m.hallucinationRate, 0, 'declared inference is legitimate');
    assert.equal(m.anchorResolutionRate, 1, 'inferred items are excluded from the anchor rate');
    assert.equal(m.isDefect, false);
  });

  test('precision distribution is reported', () => {
    const items: ExtractedItem[] = [
      { id: '1', mode: 'extracted', anchorResolved: true, anchorPrecision: 'exact' },
      { id: '2', mode: 'extracted', anchorResolved: true, anchorPrecision: 'page' },
      { id: '3', mode: 'extracted', anchorResolved: true, anchorPrecision: 'page' },
    ];
    const m = computeProvenanceMetrics(items);
    assert.equal(m.precisionDistribution.exact, 1);
    assert.equal(m.precisionDistribution.page, 2);
  });
});

describe('extraction quality against a gold set', () => {
  const gold: GoldItem[] = [
    { quote: 'يجب إتمام التحقق', id: 'g1', expectedSlot: 'slasAndTimers' },
    { quote: 'Applications above AED 50,000', id: 'g2', expectedSlot: 'businessRules' },
  ];

  test('computes precision, recall and F1', () => {
    const items: ExtractedItem[] = [
      { id: '1', quote: 'يجب إتمام التحقق', mode: 'extracted', anchorResolved: true, anchorPrecision: 'exact' },
      { id: '2', quote: 'not in the gold set', mode: 'extracted', anchorResolved: true, anchorPrecision: 'exact' },
    ];
    const q = computeExtractionQuality(items, gold, toMatchText);
    assert.equal(q.truePositives, 1);
    assert.equal(q.falsePositives, 1);
    assert.equal(q.falseNegatives, 1);
    assert.equal(q.precision, 0.5);
    assert.equal(q.recall, 0.5);
    assert.equal(q.f1, 0.5);
  });

  test('MATCHING IS ARABIC-TOLERANT: a quote differing by diacritics still matches', () => {
    const items: ExtractedItem[] = [
      { id: '1', quote: 'يَجِب إتمام التحقق', mode: 'extracted', anchorResolved: true, anchorPrecision: 'exact' },
    ];
    const q = computeExtractionQuality(items, gold, toMatchText);
    assert.equal(q.truePositives, 1, 'diacritic difference must not count as a miss');
  });

  test('a partial gold set reports its coverage honestly', () => {
    const q = computeExtractionQuality([], gold, toMatchText, 10);
    assert.equal(q.goldCoverage, 0.2);
  });

  test('slot accuracy scores only labelled items', () => {
    const items: ExtractedItem[] = [
      { id: '1', quote: 'يجب إتمام التحقق', mode: 'extracted', anchorResolved: true, anchorPrecision: 'exact', assignedSlot: 'slasAndTimers' },
      { id: '2', quote: 'Applications above AED 50,000', mode: 'extracted', anchorResolved: true, anchorPrecision: 'exact', assignedSlot: 'decisions' },
      { id: '3', quote: 'unlabelled', mode: 'extracted', anchorResolved: true, anchorPrecision: 'exact', assignedSlot: 'inputs' },
    ];
    const s = computeSlotAccuracy(items, gold, toMatchText);
    assert.equal(s.scored, 2, 'the unlabelled item is not scored');
    assert.equal(s.accuracy, 0.5);
  });
});

describe('report generation', () => {
  const provenance = computeProvenanceMetrics([
    { id: '1', quote: 'a', mode: 'extracted', anchorResolved: true, anchorPrecision: 'exact' },
  ]);

  test('REPORT GENERATION FAILS WITHOUT A CORPUS TIER', () => {
    assert.throws(
      () =>
        buildReport({
          corpusId: 'c', corpusTier: undefined, language: 'en',
          providerId: 'p', modelId: 'm', promptVersion: 'v1', provenance,
        }),
      ReportIncompleteError,
    );
  });

  test('a synthetic report is labelled and MAY NOT justify a routing decision', () => {
    const r = buildReport({
      corpusId: 'syn-1', corpusTier: 'synthetic', language: 'en',
      providerId: 'p', modelId: 'm', promptVersion: 'v1', provenance,
    });
    assert.equal(r.usableForRoutingDecision, false);
    assert.match(r.caveats.join(' '), /SYNTHETIC CORPUS/);
  });

  test('a representative report may justify a routing decision', () => {
    const r = buildReport({
      corpusId: 'rep-1', corpusTier: 'representative', language: 'ar',
      providerId: 'p', modelId: 'm', promptVersion: 'v1', provenance,
    });
    assert.equal(r.usableForRoutingDecision, true);
    assert.equal(r.language, 'ar');
  });

  test('provenance defects surface as report caveats', () => {
    const defective = computeProvenanceMetrics([
      { id: 'bad', quote: 'x', mode: 'extracted', anchorResolved: false, anchorPrecision: 'none' },
    ]);
    const r = buildReport({
      corpusId: 'rep-1', corpusTier: 'representative', language: 'en',
      providerId: 'p', modelId: 'm', promptVersion: 'v1', provenance: defective,
    });
    assert.ok(r.caveats.length >= 2);
    assert.match(r.caveats.join(' '), /no resolvable anchor/);
  });
});
