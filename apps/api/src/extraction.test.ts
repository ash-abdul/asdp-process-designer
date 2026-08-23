/**
 * V4b-core — AI evidence extraction, end to end.
 *
 * The real application graph with one substitution: the provider is a **replay
 * provider over the authored stub**, which is what CI must use (**A7**). The
 * broker, the egress gate, the chunk planner, the §4.4 gate, the persistence
 * conditions and the SQL constraints are all the real ones.
 *
 * What these tests are for: proving that **what should be rejected is rejected**.
 * Accepting a good citation is the easy half; the half that matters is that an
 * ambiguous or fabricated one cannot get through, and that the refusal is recorded
 * rather than dropped.
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
import { createAuthoredStubProvider, createRefusingProvider, STUB_PROVIDER_ID } from './ai/stub-provider.ts';
import { gateCandidate, scopesFor } from './ai/extraction-gate.ts';
import { unitsForDocument } from './ai/extraction-plan.ts';
import type { Database } from './persistence/db.ts';
import type { EvidenceExtractor } from './ports.ts';
import { DEFAULT_EGRESS_POLICY, CHUNK_STRATEGY_VERSION, planChunks, type AiProvider } from '@asdp/ai';
import { createMemoryRecordingStore, createReplayProvider, type RecordingStore } from '@asdp/eval';
import type { AiRequest, AiResponse, EvidenceExtraction, SourceUnit } from '@asdp/schemas';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Two sections, each with a unique obligation. */
const DOC = [
  '# Renewal',
  '',
  '## 1. Eligibility',
  'The applicant must submit the request within ninety days of expiry.',
  '',
  '## 2. Review',
  'The officer must complete the review within three working days.',
].join('\n');

/** The same sentence twice in ONE paragraph: no locator can resolve it (§4.4). */
const AMBIGUOUS_DOC = [
  '# Standards',
  '',
  '## 1. Closure',
  'The reviewer must sign the file. The reviewer must sign the file.',
].join('\n');

/** The same sentence in TWO units: a unit locator resolves it (§4.4 case 2). */
const DISAMBIGUABLE_DOC = [
  '# Standards',
  '',
  '## 1. Intake',
  'The officer must verify the identity before proceeding.',
  '',
  '## 2. Escalation',
  'The officer must verify the identity before proceeding.',
].join('\n');

interface Server extends RunningApp {
  readonly database: Database;
}

function extractorOver(options: {
  store?: RecordingStore;
  mode?: 'record' | 'replay_only';
  inner?: AiProvider;
} = {}): EvidenceExtractor {
  const inner = options.inner ?? createAuthoredStubProvider();
  const provider = createReplayProvider({
    inner,
    store: options.store ?? createMemoryRecordingStore(),
    mode: options.mode ?? 'record',
    corpusId: 'test',
    taskContext: { promptVersion: 'extract-evidence@1', classification: 'INTERNAL' },
    clock: systemClock(),
  });
  return createBrokerEvidenceExtractor({
    broker: {
      providers: [provider],
      policy: DEFAULT_EGRESS_POLICY,
      routing: { defaultPreferenceOrder: [provider.id] },
      clock: systemClock(),
      ids: counterIdGenerator(),
    },
    mode: 'replay',
    project: { allowExternalProviders: true, classificationCeiling: 'CONFIDENTIAL' },
  });
}

/**
 * The stub, but declaring large context.
 *
 * Needed to isolate OUR chunking decision from the capability ladder's: with
 * `largeContext` the ladder has no reason to plan `chunked_context`, so any that
 * appears was declared by the extractor because it actually split the document.
 */
function largeContextProvider(): AiProvider {
  const base = createAuthoredStubProvider();
  const descriptor = base.descriptor();
  return {
    ...base,
    descriptor: () => ({
      ...descriptor,
      models: descriptor.models.map((m) => ({
        ...m,
        capabilities: [...m.capabilities, 'largeContext' as const, 'nativeCitations' as const],
      })),
    }),
  };
}

/** A provider returning a scripted extraction, for cases the stub cannot produce. */
function scriptedProvider(extraction: EvidenceExtraction): AiProvider {
  const base = createAuthoredStubProvider();
  return {
    ...base,
    invoke: async (_request: AiRequest): Promise<AiResponse> => ({
      outputs: [JSON.stringify(extraction)],
      citations: [],
      usage: { inputUnits: 10, cachedInputUnits: 0, outputUnits: 5, costEstimate: 0, latencyMs: 0 },
      providerMeta: { providerId: STUB_PROVIDER_ID, modelId: 'stub-1', capabilityTier: 'unknown' },
      degradations: [],
    }),
  };
}

async function startServer(options: { extractor?: EvidenceExtractor; chunkChars?: number } = {}): Promise<Server> {
  const blobRoot = await mkdtemp(join(tmpdir(), 'asdp-v4b-blob-'));
  const config = loadConfig({
    PORT: '0',
    ASDP_LOG_LEVEL: 'error',
    ASDP_BLOB_ROOT: blobRoot,
    ...(options.chunkChars === undefined
      ? {}
      : { ASDP_EXTRACTION_CHUNK_CHARS: String(options.chunkChars) }),
  });
  const database = await createPgliteDatabase({});
  await migrate(database);
  const blobStore = await createFilesystemBlobStore({ rootDirectory: blobRoot });
  const running = await listen(
    {
      config,
      database,
      blobStore,
      clock: systemClock(),
      ids: counterIdGenerator(),
      evidenceExtractor: options.extractor ?? extractorOver(),
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
  const r = await call(s, 'POST', '/projects', { key: `v4b-${Date.now()}`, name: 'V4b' }, asAdmin);
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json.id;
}

async function ingest(s: Server, projectId: string, filename: string, text: string): Promise<string> {
  const r = await call(s, 'POST', `/projects/${projectId}/sources`, { filename, text }, asAnalyst);
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json.source.id;
}

async function extract(s: Server, projectId: string, sourceId: string): Promise<any> {
  const r = await call(
    s, 'POST', `/projects/${projectId}/sources/${sourceId}/extract-evidence`, undefined, asAnalyst,
  );
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json;
}

// ---------------------------------------------------------------------------
// The chain
// ---------------------------------------------------------------------------

describe('EXTRACT_EVIDENCE end to end', () => {
  test('extracts anchored, attributed, confidence-carrying evidence', async () => {
    const s = await startServer();
    try {
      const projectId = await project(s);
      const sourceId = await ingest(s, projectId, 'brd.md', DOC);
      const result = await extract(s, projectId, sourceId);

      assert.equal(result.accepted.length, 2, JSON.stringify(result));
      for (const item of result.accepted) {
        // F5: AI-derived and it says so; migration 005 enforces the pairing.
        assert.equal(item.extractedBy, 'ai');
        assert.match(String(item.aiInteractionId), /^ai/);
        // We located the quote ourselves (provenance §4.2).
        assert.equal(item.citationMode, 'post_hoc');
        assert.equal(item.anchorVerified, true);
        assert.equal(item.anchor.precision, 'exact');
        assert.equal(item.anchor.target.kind, 'text_range');
        // The quote is verbatim: it must be findable in the document.
        assert.ok(DOC.includes(item.verbatimText), item.verbatimText);
        // ADR-0011: computed, with its function version travelling alongside.
        assert.ok(typeof item.computedConfidence === 'number');
        assert.ok(['HIGH', 'MEDIUM', 'LOW'].includes(item.confidenceBand));
        assert.equal(item.confidenceFunctionVersion, 'confidence-1');
        assert.ok(item.sourceUnitId !== undefined, 'evidence cites the unit it came from');
      }
    } finally {
      await s.close();
    }
  });

  test('persisted evidence reads back through PGlite with its attribution intact', async () => {
    const s = await startServer();
    try {
      const projectId = await project(s);
      const sourceId = await ingest(s, projectId, 'brd.md', DOC);
      const result = await extract(s, projectId, sourceId);

      const listed = await call(s, 'GET', `/projects/${projectId}/evidence`, undefined, asAnalyst);
      assert.equal(listed.json.total, result.accepted.length);
      const fetched = await call(
        s, 'GET', `/projects/${projectId}/evidence/${result.accepted[0].id}`, undefined, asAnalyst,
      );
      assert.equal(fetched.json.extractedBy, 'ai');
      assert.equal(fetched.json.confidenceFunctionVersion, 'confidence-1');
      assert.ok(fetched.json.computedConfidence > 0);
    } finally {
      await s.close();
    }
  });

  test('the degradation ladder runs and its degradations reach confidence', async () => {
    const s = await startServer();
    try {
      const projectId = await project(s);
      const sourceId = await ingest(s, projectId, 'brd.md', DOC);
      const result = await extract(s, projectId, sourceId);

      // The stub declares only schema-constrained output, so the preferred
      // capabilities (native citations, large context, caching) are unavailable
      // and the ladder must have named the degradation rather than proceeding
      // silently (ADR-0022).
      assert.ok(result.degradations.includes('post_hoc_citations'), JSON.stringify(result.degradations));

      const log = await call(s, 'GET', `/projects/${projectId}/ai-interactions`, undefined, asAdmin);
      assert.ok(log.json.interactions[0].routing.degradations.includes('post_hoc_citations'));

      // ADR-0011: the declared penalty is applied, so a degraded extraction cannot
      // present itself as confidently as an undegraded one.
      assert.ok(result.accepted[0].computedConfidence < 1);
    } finally {
      await s.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Provenance §4.4 — the three cases
// ---------------------------------------------------------------------------

describe('provenance §4.4 enforcement', () => {
  test('CASE 1 — a unique quote is accepted', async () => {
    const s = await startServer();
    try {
      const projectId = await project(s);
      const sourceId = await ingest(s, projectId, 'brd.md', DOC);
      const result = await extract(s, projectId, sourceId);
      assert.equal(result.rejected.length, 0);
      assert.equal(result.accepted.length, 2);
    } finally {
      await s.close();
    }
  });

  test('CASE 2 — a repeated quote in TWO units is disambiguated by its unit locator', async () => {
    const s = await startServer();
    try {
      const projectId = await project(s);
      const sourceId = await ingest(s, projectId, 'sop.md', DISAMBIGUABLE_DOC);
      const result = await extract(s, projectId, sourceId);

      // Each occurrence sits in its own unit, so the locator resolves to exactly
      // one — accepted, and at EXACT precision: the hint selected among candidates
      // that were each exact, it did not approximate.
      assert.equal(result.accepted.length, 1, JSON.stringify(result));
      assert.equal(result.accepted[0].anchor.precision, 'exact');
      assert.equal(result.rejected.length, 0);
    } finally {
      await s.close();
    }
  });

  test('CASE 3 — A QUOTE REPEATED INSIDE ONE UNIT IS REJECTED', async () => {
    const s = await startServer();
    try {
      const projectId = await project(s);
      const sourceId = await ingest(s, projectId, 'sop.md', AMBIGUOUS_DOC);
      const result = await extract(s, projectId, sourceId);

      // No locator can resolve it: both occurrences are inside the same unit.
      assert.equal(result.accepted.length, 0, JSON.stringify(result.accepted));
      assert.ok(result.rejected.length >= 1);
      assert.equal(result.rejected[0].reason, 'ambiguous_citation');
      assert.equal(result.rejected[0].matchCount, 2);
      assert.equal(result.rejected[0].hintApplied, true, 'the scope WAS applied — it did not narrow');
      assert.equal(result.rejectionCounts.ambiguous_citation, result.rejected.length);

      // And nothing was written, at any precision.
      const listed = await call(s, 'GET', `/projects/${projectId}/evidence`, undefined, asAnalyst);
      assert.equal(listed.json.total, 0, 'demotion must not make an ambiguous claim storable');
    } finally {
      await s.close();
    }
  });

  test('NO OCCURRENCE IS EVER CHOSEN ARBITRARILY', async () => {
    // The behaviour this replaces: `locateQuote` took matches[0] when a hint was
    // merely present. A page hint is a model's assertion, not a verified scope.
    const scoped = scopesFor([] as readonly SourceUnit[]);
    const outcome = gateCandidate({
      sourceId: 'src-1',
      storedText: 'The officer must sign. Then the officer must sign.',
      candidate: { quote: 'The officer must sign.', locator: { page: 7, section: '1' } },
      scopesByUnitId: scoped.byUnitId,
      scopesByHeading: scoped.byHeading,
      extractorVersion: 'test@1',
      confidenceInputs: { sourceAuthorityRank: 0, providerCapabilityTier: 'unknown', degradations: [] },
    });
    assert.equal(outcome.kind, 'rejected');
    if (outcome.kind !== 'rejected') return;
    assert.equal(outcome.reason, 'ambiguous_citation');
    assert.equal(outcome.hintApplied, false, 'an unresolvable hint is not an applied hint');
  });

  test('A REPEATED HEADING RESOLVES NOTHING — it must not select the first section', async () => {
    // A heading that occurs twice does not identify a section, so it cannot
    // disambiguate an occurrence. Keeping the first one would hand back a scope
    // containing exactly one candidate and accept it at EXACT precision — the
    // arbitrary pick of §4.4, wearing a hint as cover.
    const doc = [
      '# Fees',
      '',
      '## Charges',
      'The fee is 100 AED.',
      '',
      '## Notes',
      'Filler.',
      '',
      '## Charges',
      'The fee is 100 AED.',
    ].join('\n');

    const units = unitsForDocument('src-1', doc);
    const scoped = scopesFor(units);
    assert.equal(
      scoped.byHeading.has('Charges'),
      false,
      'a heading occurring twice must resolve to no scope at all',
    );
    assert.equal(scoped.byHeading.has('Notes'), true, 'a unique heading still resolves');

    const outcome = gateCandidate({
      sourceId: 'src-1',
      storedText: doc,
      // No unitId, so the heading is the only hint on offer — which is exactly
      // the case the schema permits and the first-wins map used to reward.
      candidate: { quote: 'The fee is 100 AED.', locator: { heading: 'Charges' } },
      scopesByUnitId: scoped.byUnitId,
      scopesByHeading: scoped.byHeading,
      extractorVersion: 'test@1',
      confidenceInputs: { sourceAuthorityRank: 0, providerCapabilityTier: 'unknown', degradations: [] },
    });

    assert.equal(outcome.kind, 'rejected');
    if (outcome.kind !== 'rejected') return;
    assert.equal(outcome.reason, 'ambiguous_citation');
    assert.equal(outcome.matchCount, 2);
    assert.equal(outcome.hintApplied, false, 'a repeated heading is not an applied hint');
  });

  test('A FABRICATED QUOTE IS REJECTED — the unsupported-evidence case', async () => {
    // The authored stub can only quote text it was given, so this case needs a
    // scripted provider. It is the trap the corpus cannot exercise.
    const s = await startServer({
      extractor: extractorOver({
        inner: scriptedProvider({
          items: [{ quote: 'The applicant must pay a fee of 500 in advance.' }],
          limitations: [],
        }),
      }),
    });
    try {
      const projectId = await project(s);
      const sourceId = await ingest(s, projectId, 'brd.md', DOC);
      const result = await extract(s, projectId, sourceId);

      assert.equal(result.accepted.length, 0);
      assert.equal(result.rejected[0].reason, 'quote_not_found');
      const listed = await call(s, 'GET', `/projects/${projectId}/evidence`, undefined, asAnalyst);
      assert.equal(listed.json.total, 0, 'a quote absent from the document is never evidence');
    } finally {
      await s.close();
    }
  });

  test('a paraphrase is rejected too — verbatim is not a style preference', async () => {
    const s = await startServer({
      extractor: extractorOver({
        inner: scriptedProvider({
          // Same meaning, different words. Unlocatable, therefore unanchorable.
          items: [{ quote: 'Applicants have ninety days to submit their renewal request.' }],
          limitations: [],
        }),
      }),
    });
    try {
      const projectId = await project(s);
      const sourceId = await ingest(s, projectId, 'brd.md', DOC);
      const result = await extract(s, projectId, sourceId);
      assert.equal(result.accepted.length, 0);
      assert.equal(result.rejected[0].reason, 'quote_not_found');
    } finally {
      await s.close();
    }
  });
});

// ---------------------------------------------------------------------------
// F2 — rejections are recorded, countable, and not queued
// ---------------------------------------------------------------------------

describe('F2 rejection recording', () => {
  test('rejections are AUDITED with reason, count and checksum — never silently dropped', async () => {
    const s = await startServer();
    try {
      const projectId = await project(s);
      const sourceId = await ingest(s, projectId, 'sop.md', AMBIGUOUS_DOC);
      const result = await extract(s, projectId, sourceId);

      const audit = await call(s, 'GET', `/projects/${projectId}/audit`, undefined, asAdmin);
      const event = audit.json.find((e: any) => e.action === 'evidence.extracted');
      assert.ok(event !== undefined);
      assert.equal(event.after.acceptedCount, 0);
      assert.equal(event.after.rejectedCount, result.rejected.length);
      assert.equal(event.after.rejectionCounts.ambiguous_citation, result.rejected.length);

      const recorded = event.after.rejections[0];
      assert.equal(recorded.reason, 'ambiguous_citation');
      assert.equal(recorded.matchCount, 2);
      assert.match(String(recorded.quoteChecksum), /^[0-9a-f]{32}$/);
      // The checksum, not the quote: a rejected item never became evidence, and
      // the audit store is not a content store.
      assert.equal(recorded.quote, undefined);
      assert.ok(String(recorded.detail).includes('§4.4'));
    } finally {
      await s.close();
    }
  });

  test('NO REMEDIATION QUEUE EXISTS — that is the later human workspace (F2)', async () => {
    const s = await startServer();
    try {
      const projectId = await project(s);
      const sourceId = await ingest(s, projectId, 'sop.md', AMBIGUOUS_DOC);
      await extract(s, projectId, sourceId);

      for (const path of [
        `/projects/${projectId}/extraction-rejections`,
        `/projects/${projectId}/clarifications`,
        `/projects/${projectId}/sources/${sourceId}/rejections/resolve`,
      ]) {
        const r = await call(s, 'POST', path, {}, asAnalyst);
        assert.equal(r.status, 404, path);
      }
    } finally {
      await s.close();
    }
  });
});

// ---------------------------------------------------------------------------
// F4 — chunking
// ---------------------------------------------------------------------------

describe('F4 structural chunking', () => {
  test('a small source is ONE chunk and reports full context', async () => {
    const s = await startServer();
    try {
      const projectId = await project(s);
      const sourceId = await ingest(s, projectId, 'brd.md', DOC);
      const result = await extract(s, projectId, sourceId);

      assert.equal(result.chunking.chunks, 1);
      assert.equal(result.chunking.chunked, false);
      assert.equal(result.chunking.splitAnyUnit, false);
      assert.equal(result.chunking.strategyVersion, CHUNK_STRATEGY_VERSION);

      const log = await call(s, 'GET', `/projects/${projectId}/ai-interactions`, undefined, asAdmin);
      assert.equal(log.json.interactions[0].contextMode, 'full');
      assert.deepEqual(log.json.interactions[0].chunkRanges, []);
    } finally {
      await s.close();
    }
  });

  test('a source over the budget is CHUNKED, and every chunk is recorded', async () => {
    // A tiny budget forces structural chunking without a huge fixture.
    const s = await startServer({ chunkChars: 80 });
    try {
      const projectId = await project(s);
      const sourceId = await ingest(s, projectId, 'brd.md', DOC);
      const result = await extract(s, projectId, sourceId);

      assert.ok(result.chunking.chunks > 1, JSON.stringify(result.chunking));
      assert.equal(result.chunking.chunked, true);

      const log = await call(s, 'GET', `/projects/${projectId}/ai-interactions`, undefined, asAdmin);
      assert.equal(log.json.total, result.chunking.chunks, 'one interaction per chunk');
      for (const interaction of log.json.interactions) {
        // E4 rules 2 and 3: stated, with the range and the strategy version.
        assert.equal(interaction.contextMode, 'chunked');
        assert.equal(interaction.chunkCount, result.chunking.chunks);
        assert.equal(interaction.chunkStrategyVersion, CHUNK_STRATEGY_VERSION);
        assert.equal(interaction.chunkRanges.length, 1);
        assert.ok(interaction.chunkRanges[0].charEnd > interaction.chunkRanges[0].charStart);
      }
    } finally {
      await s.close();
    }
  });

  test('CHUNKING IS NEVER SILENT: the split declares itself and reaches confidence', async () => {
    // A large-context provider, so the capability ladder has no reason to plan
    // `chunked_context` — anything that appears was declared because we split.
    const chunkedServer = await startServer({
      chunkChars: 80,
      extractor: extractorOver({ inner: largeContextProvider() }),
    });
    let chunked: any;
    try {
      const projectId = await project(chunkedServer);
      const sourceId = await ingest(chunkedServer, projectId, 'brd.md', DOC);
      chunked = await extract(chunkedServer, projectId, sourceId);
      assert.ok(chunked.chunking.chunked, 'the budget forced a split');
      assert.ok(
        chunked.degradations.includes('chunked_context'),
        JSON.stringify(chunked.degradations),
      );
    } finally {
      await chunkedServer.close();
    }

    const wholeServer = await startServer({
      extractor: extractorOver({ inner: largeContextProvider() }),
    });
    try {
      const projectId = await project(wholeServer);
      const sourceId = await ingest(wholeServer, projectId, 'brd.md', DOC);
      const full = await extract(wholeServer, projectId, sourceId);
      assert.equal(
        full.degradations.includes('chunked_context'),
        false,
        'an unsplit read must not claim a split',
      );
      // ADR-0022 §5 declares a 0.15 penalty, so a chunked read is strictly less
      // confident than the same read whole. Propagation, not decoration.
      assert.ok(
        chunked.accepted[0].computedConfidence < full.accepted[0].computedConfidence,
        `${chunked.accepted[0].computedConfidence} !< ${full.accepted[0].computedConfidence}`,
      );
    } finally {
      await wholeServer.close();
    }
  });

  test('an over-budget SINGLE unit is split by size, with recorded overlap', () => {
    // The one case structure cannot help with. Unit boundaries are preferred, so
    // this is the fallback and it is deliberately visible in the plan.
    const long = 'x'.repeat(500);
    const plan = planChunks(
      [{ id: 'su-1', charStart: 0, charEnd: 500, text: long }],
      { maxChars: 200, overlapChars: 50 },
    );
    assert.ok(plan.splitAnyUnit);
    assert.ok(plan.chunks.length >= 3);
    assert.equal(plan.chunks[0]?.overlapChars, 0, 'the first slice overlaps nothing');
    assert.equal(plan.chunks[1]?.overlapChars, 50);
    for (const chunk of plan.chunks) {
      assert.deepEqual(chunk.unitIds, ['su-1']);
      assert.equal(chunk.splitUnit, true);
      // Ranges are in the ORIGINAL text, so a located quote maps back with no
      // arithmetic at the call site.
      assert.ok(chunk.charEnd > chunk.charStart);
      assert.ok(chunk.charEnd <= 500);
    }
    // Overlap means consecutive slices share text: evidence spanning a size
    // boundary survives in at least one chunk.
    assert.ok((plan.chunks[1] as { charStart: number }).charStart < (plan.chunks[0] as { charEnd: number }).charEnd);
  });

  test('structural chunks NEVER split a unit that fits', () => {
    const units = [
      { id: 'su-1', charStart: 0, charEnd: 50, text: 'a'.repeat(50) },
      { id: 'su-2', charStart: 50, charEnd: 100, text: 'b'.repeat(50) },
      { id: 'su-3', charStart: 100, charEnd: 150, text: 'c'.repeat(50) },
    ];
    const plan = planChunks(units, { maxChars: 120, overlapChars: 20 });
    assert.equal(plan.splitAnyUnit, false);
    for (const chunk of plan.chunks) assert.equal(chunk.splitUnit, false);
    // Every unit appears exactly once across all chunks: no duplication, no loss.
    const seen = plan.chunks.flatMap((c) => c.unitIds);
    assert.deepEqual([...seen].sort(), ['su-1', 'su-2', 'su-3']);
  });
});

// ---------------------------------------------------------------------------
// A7 — replay, and the unwired default
// ---------------------------------------------------------------------------

describe('A7 and the persistence gate', () => {
  test('replay is deterministic: the same source yields the same evidence', async () => {
    const store = createMemoryRecordingStore();
    const first = await startServer({ extractor: extractorOver({ store, mode: 'record' }) });
    let quotes: string[] = [];
    try {
      const projectId = await project(first);
      const sourceId = await ingest(first, projectId, 'brd.md', DOC);
      const result = await extract(first, projectId, sourceId);
      quotes = result.accepted.map((a: any) => a.verbatimText).sort();
    } finally {
      await first.close();
    }

    const replaying = await startServer({
      extractor: extractorOver({ store, mode: 'replay_only', inner: createRefusingProvider() }),
    });
    try {
      const projectId = await project(replaying);
      const sourceId = await ingest(replaying, projectId, 'brd.md', DOC);
      const result = await extract(replaying, projectId, sourceId);
      assert.deepEqual(result.accepted.map((a: any) => a.verbatimText).sort(), quotes);
    } finally {
      await replaying.close();
    }
  });

  test('a recording miss REFUSES rather than reaching a provider', async () => {
    const s = await startServer({
      extractor: extractorOver({ mode: 'replay_only', inner: createRefusingProvider() }),
    });
    try {
      const projectId = await project(s);
      const sourceId = await ingest(s, projectId, 'brd.md', DOC);
      const result = await extract(s, projectId, sourceId);
      assert.equal(result.accepted.length, 0);
      assert.equal(result.refusals.length, 1, JSON.stringify(result.refusals));
      assert.match(String(result.refusals[0]), /replay_only|no recording/i);
    } finally {
      await s.close();
    }
  });

  test('the default build REFUSES: no provider is configured', async () => {
    const blobRoot = await mkdtemp(join(tmpdir(), 'asdp-v4b-none-'));
    const config = loadConfig({ PORT: '0', ASDP_LOG_LEVEL: 'error', ASDP_BLOB_ROOT: blobRoot });
    const database = await createPgliteDatabase({});
    await migrate(database);
    const blobStore = await createFilesystemBlobStore({ rootDirectory: blobRoot });
    const running = await listen(
      { config, database, blobStore, clock: systemClock(), ids: counterIdGenerator() },
      0,
    );
    const s: Server = {
      ...running,
      database,
      close: async () => {
        await running.close();
        await database.close();
      },
    };
    try {
      const projectId = await project(s);
      const sourceId = await ingest(s, projectId, 'brd.md', DOC);
      const result = await extract(s, projectId, sourceId);
      assert.equal(result.accepted.length, 0);
      assert.match(String(result.refusals[0]), /no AI provider is configured/);
    } finally {
      await s.close();
    }
  });

  test('THERE IS NO PROMOTION ROUTE (F5) — evidence stays evidence', async () => {
    const s = await startServer();
    try {
      const projectId = await project(s);
      const sourceId = await ingest(s, projectId, 'brd.md', DOC);
      const result = await extract(s, projectId, sourceId);
      assert.ok(result.accepted.length > 0);

      for (const path of [
        `/projects/${projectId}/requirements`,
        `/projects/${projectId}/raf`,
        `/projects/${projectId}/specifications`,
        `/projects/${projectId}/evidence/${result.accepted[0].id}/approve`,
        `/projects/${projectId}/evidence/${result.accepted[0].id}/promote`,
      ]) {
        const r = await call(s, 'POST', path, {}, asAnalyst);
        assert.equal(r.status, 404, path);
      }
    } finally {
      await s.close();
    }
  });

  test('SQL refuses AI evidence with no computed confidence (migration 007)', async () => {
    const database = await createPgliteDatabase({});
    try {
      await migrate(database);
      // A model's reading entering the requirements path without a confidence
      // value would be indistinguishable from a parser's verbatim extraction at
      // the point it matters most.
      await assert.rejects(
        database.query(
          `insert into evidence_item (id, project_id, source_id, anchor_json, verbatim_text,
                                      language, extracted_by, ai_interaction_id, citation_mode,
                                      anchor_verified, classification, created_by, created_at)
           values ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11,$12,now())`,
          [
            'ev-noconf', 'prj-x', 'src-x',
            JSON.stringify({ quote: 'q', quoteChecksum: 'c', target: { kind: 'text_range' } }),
            'q', 'en', 'ai', 'ai-1', 'post_hoc', true, 'INTERNAL', 'u-test',
          ],
        ),
        /constraint|violates/i,
      );
    } finally {
      await database.close();
    }
  });

  test('a Viewer may not extract — it spends money and writes evidence', async () => {
    const s = await startServer();
    try {
      const projectId = await project(s);
      const sourceId = await ingest(s, projectId, 'brd.md', DOC);
      const denied = await call(
        s, 'POST', `/projects/${projectId}/sources/${sourceId}/extract-evidence`, undefined, asViewer,
      );
      assert.equal(denied.status, 403);
      const anonymous = await call(
        s, 'POST', `/projects/${projectId}/sources/${sourceId}/extract-evidence`,
      );
      assert.equal(anonymous.status, 401);
    } finally {
      await s.close();
    }
  });
});
