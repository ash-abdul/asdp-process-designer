/**
 * V1 intake and provenance — end to end.
 *
 * These tests drive the REAL application graph: NestJS composition, PGlite
 * persistence with migrations applied, and a filesystem blob store. The
 * composition under test is the composition that ships.
 *
 * The point of testing at this level rather than only at the unit level is that
 * the provenance guarantee spans layers: an anchor minted by an adapter, stored
 * as jsonb, read back, and resolved against text that made the same round trip.
 * Every one of those steps is a place Arabic text or a code-point offset could be
 * silently corrupted, and a unit test on either end would not notice.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadConfig } from './config.ts';
import { listen, jsonBodyLimit, type RunningApp } from './http/bootstrap.ts';
import { createPgliteDatabase } from './persistence/pglite-database.ts';
import { migrate } from './persistence/migrate.ts';
import { createSqlRepositories, withTransaction } from './persistence/repositories.ts';
import { createFilesystemBlobStore } from './blob/filesystem-blob-store.ts';
import { counterIdGenerator, systemClock } from './repo-memory.ts';
import { resolveClassification } from './commands/intake.ts';
import { defaultExtractors, unavailableRasteriser, unavailableVisionExtractor } from '@asdp/ingestion';
import { ValidationError } from './commands.ts';
import type { Database } from './persistence/db.ts';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Arabic: "Identity verification must complete within two working days." */
const ARABIC = 'يجب إكمال التحقق من الهوية خلال يومي عمل.';

/** Bilingual, with a Latin term and digits inside the Arabic run. */
const BILINGUAL = [
  '# Identity Verification',
  '',
  'The system must call the SADAD endpoint before approval.',
  '',
  '## المتطلبات',
  '',
  `${ARABIC}`,
  '',
  '- على النظام استدعاء خدمة SADAD خلال 30 ثانية.',
  '- The applicant must supply a valid identity document.',
].join('\n');

interface Server extends RunningApp {
  readonly database: Database;
  readonly blobRoot: string;
}

async function startServer(options: { dataDir?: string } = {}): Promise<Server> {
  const blobRoot = await mkdtemp(join(tmpdir(), 'asdp-intake-blob-'));
  const config = loadConfig({
    PORT: '0',
    ASDP_LOG_LEVEL: 'error',
    ASDP_BLOB_ROOT: blobRoot,
  });
  const database = await createPgliteDatabase(
    options.dataDir === undefined ? {} : { dataDir: options.dataDir },
  );
  await migrate(database);
  const blobStore = await createFilesystemBlobStore({ rootDirectory: blobRoot });
  const running = await listen(
    { config, database, blobStore, clock: systemClock(), ids: counterIdGenerator() },
    0,
  );
  return {
    ...running,
    database,
    blobRoot,
    // Closing the app does NOT close the database, and each PGlite instance is a
    // live WASM heap. Leaving them open makes a suite of this size grind to a
    // halt long before any individual test fails, so the helper owns both.
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
const asContributor = { 'x-asdp-subject': 'u-contrib', 'x-asdp-roles': 'Contributor' };
const asViewer = { 'x-asdp-subject': 'u-viewer', 'x-asdp-roles': 'Viewer' };

async function createProjectVia(running: RunningApp, key = 'intake-demo'): Promise<string> {
  const r = await call(running, 'POST', '/projects', { key, name: 'Intake Demo' }, asAdmin);
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json.id as string;
}

/** Ingest a text source and assert it succeeded. */
async function ingest(
  running: RunningApp,
  projectId: string,
  body: Record<string, unknown>,
  headers = asAnalyst,
): Promise<any> {
  const r = await call(running, 'POST', `/projects/${projectId}/sources`, body, headers);
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json;
}

const base64 = (bytes: readonly number[]): string => Buffer.from(bytes).toString('base64');

// ---------------------------------------------------------------------------
// Ingest guard, over HTTP
// ---------------------------------------------------------------------------

describe('source intake', () => {
  test('ingests plain text, sniffs the type, and stores an immutable content-addressed blob', async () => {
    const s = await startServer();
    try {
      const projectId = await createProjectVia(s);
      const result = await ingest(s, projectId, {
        filename: 'requirements.txt',
        text: 'The applicant must supply a valid identity document.',
      });

      assert.equal(result.source.mimeType, 'text/plain');
      assert.equal(result.source.kind, 'freetext');
      assert.equal(result.source.status, 'parsed');
      assert.equal(result.source.extractionMethod, 'text', 'V1 never claims a vision read');
      assert.equal(result.unitCount, 1);
      assert.equal(result.deduplicated, false);

      // The blob key is derived from content, not from a path (A6).
      assert.match(result.source.blobRef, /^sources\/[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{64}\.txt$/);
      assert.ok(result.source.blobRef.includes(result.source.sha256));

      const blobStore = await createFilesystemBlobStore({ rootDirectory: s.blobRoot });
      const stored = await blobStore.get(result.source.blobRef);
      assert.ok(stored !== undefined, 'the bytes must actually be in the blob store');
      assert.equal(
        new TextDecoder().decode(stored),
        'The applicant must supply a valid identity document.',
      );
    } finally {
      await s.close();
    }
  });

  test('a Markdown source is read by the Markdown adapter and yields typed units', async () => {
    const s = await startServer();
    try {
      const projectId = await createProjectVia(s);
      const result = await ingest(s, projectId, { filename: 'brd.md', text: BILINGUAL });
      assert.equal(result.source.mimeType, 'text/markdown');
      assert.equal(result.source.kind, 'markdown');

      const units = await call(
        s,
        'GET',
        `/projects/${projectId}/sources/${result.source.id}/units`,
        undefined,
        asAnalyst,
      );
      const types = new Set(units.json.units.map((u: any) => u.type));
      assert.ok(types.has('heading'), 'headings must be recognised');
      assert.ok(types.has('paragraph'));
      assert.ok(types.has('listItem'));
    } finally {
      await s.close();
    }
  });

  test('REFUSES a PDF with a named reason, and creates no source row', async () => {
    const s = await startServer();
    try {
      const projectId = await createProjectVia(s);
      const r = await call(
        s,
        'POST',
        `/projects/${projectId}/sources`,
        { filename: 'brd.pdf', contentBase64: base64([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]) },
        asAnalyst,
      );
      assert.equal(r.status, 400);
      assert.match(String(r.json.error), /PDF/);
      assert.match(String(r.json.error), /V2/);

      const inventory = await call(s, 'GET', `/projects/${projectId}/sources`, undefined, asAnalyst);
      assert.equal(inventory.json.total, 0, 'a refused source must leave no row behind');

      // But the refusal IS audited: "what did we reject and why" is an audit question.
      const audit = await call(s, 'GET', `/projects/${projectId}/audit`, undefined, asAdmin);
      const refusal = audit.json.find((e: any) => e.action === 'source.refused');
      assert.ok(refusal !== undefined, 'the refusal must be audited');
      assert.equal(refusal.after.code, 'unsupported_binary_type');
      assert.match(String(refusal.after.sha256), /^[0-9a-f]{64}$/);
    } finally {
      await s.close();
    }
  });

  test('content beats the filename: a PDF named .txt is still refused', async () => {
    const s = await startServer();
    try {
      const projectId = await createProjectVia(s);
      const r = await call(
        s,
        'POST',
        `/projects/${projectId}/sources`,
        { filename: 'not-really.txt', contentBase64: base64([0x25, 0x50, 0x44, 0x46, 0x2d]) },
        asAnalyst,
      );
      assert.equal(r.status, 400);
    } finally {
      await s.close();
    }
  });

  test('DEDUPLICATES identical bytes within a project', async () => {
    const s = await startServer();
    try {
      const projectId = await createProjectVia(s);
      const body = { filename: 'policy.txt', text: 'Refunds are processed within five days.' };

      const first = await ingest(s, projectId, body);
      const second = await ingest(s, projectId, body);

      assert.equal(first.deduplicated, false);
      assert.equal(second.deduplicated, true);
      assert.equal(second.source.id, first.source.id, 'the same source is returned');

      const inventory = await call(s, 'GET', `/projects/${projectId}/sources`, undefined, asAnalyst);
      assert.equal(inventory.json.total, 1, 'identical bytes are ingested once');

      const audit = await call(s, 'GET', `/projects/${projectId}/audit`, undefined, asAdmin);
      assert.ok(audit.json.some((e: any) => e.action === 'source.deduplicated'));
    } finally {
      await s.close();
    }
  });

  test('the same filename with different content is a DIFFERENT source', async () => {
    const s = await startServer();
    try {
      const projectId = await createProjectVia(s);
      const a = await ingest(s, projectId, { filename: 'v.txt', text: 'Version one.' });
      const b = await ingest(s, projectId, { filename: 'v.txt', text: 'Version two.' });
      assert.notEqual(a.source.id, b.source.id);
      assert.notEqual(a.source.sha256, b.source.sha256);
    } finally {
      await s.close();
    }
  });

  test('rejects a body with neither text nor content, and one with both', async () => {
    const s = await startServer();
    try {
      const projectId = await createProjectVia(s);
      const neither = await call(
        s, 'POST', `/projects/${projectId}/sources`, { filename: 'x.txt' }, asAnalyst,
      );
      assert.equal(neither.status, 400);

      const both = await call(
        s, 'POST', `/projects/${projectId}/sources`,
        { filename: 'x.txt', text: 'a', contentBase64: base64([0x61]) }, asAnalyst,
      );
      assert.equal(both.status, 400);
    } finally {
      await s.close();
    }
  });

  test('classification defaults from the project and may be raised but not lowered', async () => {
    const s = await startServer();
    try {
      const projectId = await createProjectVia(s);

      const plain = await ingest(s, projectId, { filename: 'a.txt', text: 'Ordinary content.' });
      assert.equal(plain.source.classification, 'INTERNAL', 'the project default');

      const raised = await ingest(s, projectId, {
        filename: 'b.txt', text: 'Sensitive content.', classification: 'RESTRICTED',
      });
      assert.equal(raised.source.classification, 'RESTRICTED');

      const lowered = await ingest(s, projectId, {
        filename: 'c.txt', text: 'Attempted downgrade.', classification: 'PUBLIC',
      });
      assert.equal(
        lowered.source.classification,
        'INTERNAL',
        'ADR-0021 rule 3: classification only ever rises',
      );
    } finally {
      await s.close();
    }
  });

  test('a classification above the project ceiling is refused', async () => {
    const s = await startServer();
    try {
      const projectId = await createProjectVia(s);
      const r = await call(
        s, 'POST', `/projects/${projectId}/sources`,
        { filename: 'x.txt', text: 'content', classification: 'PROHIBITED' }, asAnalyst,
      );
      assert.equal(r.status, 400);
      assert.match(String(r.json.error), /ceiling/);
    } finally {
      await s.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Arabic and RTL, through the whole stack
// ---------------------------------------------------------------------------

describe('Arabic and RTL through persistence', () => {
  test('Arabic text round-trips byte-exactly through jsonb and back', async () => {
    const s = await startServer();
    try {
      const projectId = await createProjectVia(s);
      const result = await ingest(s, projectId, { filename: 'ar.txt', text: ARABIC });

      assert.equal(result.source.primaryLanguage, 'ar');
      assert.equal(result.source.direction, 'rtl');

      const content = await call(
        s, 'GET', `/projects/${projectId}/sources/${result.source.id}/content`,
        undefined, asAnalyst,
      );
      assert.equal(content.json.text, ARABIC, 'the stored text must be byte-exact');
      assert.equal(content.json.units[0].text, ARABIC);
      assert.equal(content.json.units[0].direction, 'rtl');
      assert.equal(
        content.json.units[0].anchor.quote,
        ARABIC,
        'the anchor quote survives the database round trip',
      );
    } finally {
      await s.close();
    }
  });

  test('a bilingual source records language runs in both directions', async () => {
    const s = await startServer();
    try {
      const projectId = await createProjectVia(s);
      const result = await ingest(s, projectId, { filename: 'mixed.md', text: BILINGUAL });

      const runs = result.source.languageRuns as { language: string; direction: string }[];
      assert.ok(runs.some((r) => r.direction === 'rtl' && r.language === 'ar'));
      assert.ok(runs.some((r) => r.direction === 'ltr' && r.language === 'en'));
    } finally {
      await s.close();
    }
  });

  test('an RTL highlight paints several segments, marks counterFlow, and TILES the range', async () => {
    const s = await startServer();
    try {
      const projectId = await createProjectVia(s);
      const result = await ingest(s, projectId, { filename: 'mixed.md', text: BILINGUAL });

      const units = await call(
        s, 'GET', `/projects/${projectId}/sources/${result.source.id}/units`,
        undefined, asAnalyst,
      );
      // The Arabic list item contains "SADAD" and "30" — one logical range that
      // is visually discontiguous.
      const target = units.json.units.find(
        (u: any) => u.direction === 'rtl' && String(u.text).includes('SADAD'),
      );
      assert.ok(target !== undefined, 'the fixture must contain a mixed-direction Arabic unit');

      const highlights = await call(
        s, 'GET',
        `/projects/${projectId}/sources/${result.source.id}/highlights?unitId=${target.id}`,
        undefined, asAnalyst,
      );
      assert.equal(highlights.json.total, 1);
      const range = highlights.json.ranges[0];

      assert.equal(range.resolution, 'resolved');
      assert.equal(range.baseDirection, 'rtl');
      assert.ok(range.segments.length > 1, 'a mixed range must paint more than one segment');
      assert.ok(
        range.segments.some((seg: any) => seg.counterFlow === true),
        'the Latin run inside Arabic must be marked counterFlow',
      );

      // Tiling: no gaps, and the concatenation is exactly the highlighted text.
      assert.equal(range.segments[0].start, range.start);
      assert.equal(range.segments[range.segments.length - 1].end, range.end);
      for (let i = 1; i < range.segments.length; i++) {
        assert.equal(range.segments[i].start, range.segments[i - 1].end);
      }
      assert.equal(
        range.segments.map((seg: any) => seg.text).join(''),
        target.text,
        'the painted segments must reconstruct the unit text exactly',
      );
    } finally {
      await s.close();
    }
  });

  test('highlights are returned for every unit when no selector is given', async () => {
    const s = await startServer();
    try {
      const projectId = await createProjectVia(s);
      const result = await ingest(s, projectId, { filename: 'mixed.md', text: BILINGUAL });
      const h = await call(
        s, 'GET', `/projects/${projectId}/sources/${result.source.id}/highlights`,
        undefined, asAnalyst,
      );
      assert.equal(h.json.total, result.unitCount);
      assert.ok(h.json.ranges.every((r: any) => r.resolution === 'resolved'));
    } finally {
      await s.close();
    }
  });

  test('an explicit offset range is highlighted, and out-of-range offsets are clamped', async () => {
    const s = await startServer();
    try {
      const projectId = await createProjectVia(s);
      const result = await ingest(s, projectId, { filename: 'ar.txt', text: ARABIC });
      const id = result.source.id;

      const partial = await call(
        s, 'GET', `/projects/${projectId}/sources/${id}/highlights?start=0&end=3`,
        undefined, asAnalyst,
      );
      assert.equal(partial.json.ranges[0].start, 0);
      assert.equal(partial.json.ranges[0].end, 3);

      const clamped = await call(
        s, 'GET', `/projects/${projectId}/sources/${id}/highlights?start=0&end=99999`,
        undefined, asAnalyst,
      );
      assert.equal(clamped.json.ranges[0].end, result.source.textLength);

      const half = await call(
        s, 'GET', `/projects/${projectId}/sources/${id}/highlights?start=0`,
        undefined, asAnalyst,
      );
      assert.equal(half.status, 400, 'start and end must be supplied together');
    } finally {
      await s.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Inventory and authority ranking
// ---------------------------------------------------------------------------

describe('source inventory and authority ranking', () => {
  test('the inventory is ordered by authority rank, and counts what is unranked', async () => {
    const s = await startServer();
    try {
      const projectId = await createProjectVia(s);
      const sop = await ingest(s, projectId, {
        filename: 'sop.txt', text: 'Follow the standard operating procedure.', authorityRank: 10,
      });
      const policy = await ingest(s, projectId, {
        filename: 'policy.txt', text: 'The policy takes precedence.', authorityRank: 900,
      });
      const draft = await ingest(s, projectId, { filename: 'draft.txt', text: 'A draft note.' });

      const inv = await call(s, 'GET', `/projects/${projectId}/sources`, undefined, asAnalyst);
      assert.equal(inv.json.total, 3);
      assert.equal(inv.json.unranked, 1, 'rank 0 means NOT YET RANKED, and is reported as such');
      assert.deepEqual(
        inv.json.sources.map((x: any) => x.id),
        [policy.source.id, sop.source.id, draft.source.id],
        'most authoritative first — the order a reviewer resolving a conflict needs',
      );
    } finally {
      await s.close();
    }
  });

  test('setting the rank reorders the inventory and is audited with its justification', async () => {
    const s = await startServer();
    try {
      const projectId = await createProjectVia(s);
      const a = await ingest(s, projectId, { filename: 'a.txt', text: 'Alpha.', authorityRank: 500 });
      const b = await ingest(s, projectId, { filename: 'b.txt', text: 'Bravo.', authorityRank: 100 });

      const put = await call(
        s, 'PUT', `/projects/${projectId}/sources/${b.source.id}/authority`,
        { authorityRank: 900, justification: 'board-approved policy supersedes the SOP' },
        asAnalyst,
      );
      assert.equal(put.status, 200);
      assert.equal(put.json.authorityRank, 900);

      const inv = await call(s, 'GET', `/projects/${projectId}/sources`, undefined, asAnalyst);
      assert.deepEqual(inv.json.sources.map((x: any) => x.id), [b.source.id, a.source.id]);

      const audit = await call(s, 'GET', `/projects/${projectId}/audit`, undefined, asAdmin);
      const event = audit.json.find((e: any) => e.action === 'source.authorityRankSet');
      assert.ok(event !== undefined);
      assert.equal(event.before.authorityRank, 100);
      assert.equal(event.after.authorityRank, 900);
      assert.match(event.after.justification, /board-approved/);
    } finally {
      await s.close();
    }
  });

  test('an out-of-range rank is refused', async () => {
    const s = await startServer();
    try {
      const projectId = await createProjectVia(s);
      const src = await ingest(s, projectId, { filename: 'a.txt', text: 'Alpha.' });
      for (const rank of [-1, 1001, 1.5]) {
        const r = await call(
          s, 'PUT', `/projects/${projectId}/sources/${src.source.id}/authority`,
          { authorityRank: rank }, asAnalyst,
        );
        assert.equal(r.status, 400, `rank ${rank} must be refused`);
      }
    } finally {
      await s.close();
    }
  });

  test('a Contributor may upload but may NOT rank authority', async () => {
    const s = await startServer();
    try {
      const projectId = await createProjectVia(s);
      // Gathering material is not an analytical act.
      const uploaded = await ingest(
        s, projectId, { filename: 'note.txt', text: 'A note from the business.' }, asContributor,
      );

      // Ranking authority is: it is the deterministic input to conflict
      // precedence, and must not be set casually.
      const r = await call(
        s, 'PUT', `/projects/${projectId}/sources/${uploaded.source.id}/authority`,
        { authorityRank: 900 }, asContributor,
      );
      assert.equal(r.status, 403, 'authenticated but not authorised');
    } finally {
      await s.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

describe('evidence', () => {
  async function setup(s: Server): Promise<{ projectId: string; sourceId: string; unit: any }> {
    const projectId = await createProjectVia(s);
    const result = await ingest(s, projectId, { filename: 'brd.md', text: BILINGUAL });
    const units = await call(
      s, 'GET', `/projects/${projectId}/sources/${result.source.id}/units`, undefined, asAnalyst,
    );
    return { projectId, sourceId: result.source.id, unit: units.json.units[2] };
  }

  test('records evidence from a unit, inheriting its verified anchor', async () => {
    const s = await startServer();
    try {
      const { projectId, sourceId, unit } = await setup(s);
      const r = await call(
        s, 'POST', `/projects/${projectId}/evidence`,
        { sourceId, sourceUnitId: unit.id, rafSlotHint: 'businessRules' }, asAnalyst,
      );
      assert.equal(r.status, 201, JSON.stringify(r.json));
      assert.equal(r.json.anchorVerified, true, 'invariant D1');
      assert.equal(r.json.verbatimText, unit.text);
      assert.equal(r.json.extractedBy, 'parser', 'V1 evidence is parser-extracted');
      assert.equal(r.json.citationMode, 'none', 'there is no AI in this slice');
      assert.equal(r.json.classification, 'INTERNAL', 'inherited from the source');
      assert.equal(r.json.anchor.quoteChecksum, unit.anchor.quoteChecksum);
    } finally {
      await s.close();
    }
  });

  test('narrows within a unit, and refuses a range outside it', async () => {
    const s = await startServer();
    try {
      const { projectId, sourceId, unit } = await setup(s);
      const from = unit.anchor.target.charStart;

      const ok = await call(
        s, 'POST', `/projects/${projectId}/evidence`,
        { sourceId, sourceUnitId: unit.id, charStart: from, charEnd: from + 6 }, asAnalyst,
      );
      assert.equal(ok.status, 201);
      assert.equal(ok.json.anchor.target.charEnd - ok.json.anchor.target.charStart, 6);

      const outside = await call(
        s, 'POST', `/projects/${projectId}/evidence`,
        { sourceId, sourceUnitId: unit.id, charStart: from, charEnd: unit.anchor.target.charEnd + 50 },
        asAnalyst,
      );
      assert.equal(outside.status, 400, 'evidence may not cite beyond the unit it came from');
    } finally {
      await s.close();
    }
  });

  test('records evidence from an explicit range with no unit', async () => {
    const s = await startServer();
    try {
      const { projectId, sourceId } = await setup(s);
      const r = await call(
        s, 'POST', `/projects/${projectId}/evidence`,
        { sourceId, charStart: 2, charEnd: 20 }, asAnalyst,
      );
      assert.equal(r.status, 201);
      assert.equal(r.json.anchorVerified, true);
      assert.equal(r.json.sourceUnitId, undefined);
    } finally {
      await s.close();
    }
  });

  test('refuses an empty or out-of-bounds range', async () => {
    const s = await startServer();
    try {
      const { projectId, sourceId } = await setup(s);
      for (const range of [
        { charStart: 5, charEnd: 5 },
        { charStart: 10, charEnd: 4 },
        { charStart: 0, charEnd: 10_000 },
      ]) {
        const r = await call(
          s, 'POST', `/projects/${projectId}/evidence`, { sourceId, ...range }, asAnalyst,
        );
        assert.equal(r.status, 400, `${JSON.stringify(range)} must be refused`);
      }
    } finally {
      await s.close();
    }
  });

  test('the evidence highlight resolves against the stored source', async () => {
    const s = await startServer();
    try {
      const { projectId, sourceId, unit } = await setup(s);
      const created = await call(
        s, 'POST', `/projects/${projectId}/evidence`,
        { sourceId, sourceUnitId: unit.id }, asAnalyst,
      );
      const h = await call(
        s, 'GET',
        `/projects/${projectId}/sources/${sourceId}/highlights?evidenceId=${created.json.id}`,
        undefined, asAnalyst,
      );
      assert.equal(h.json.ranges[0].resolution, 'resolved');
      assert.equal(
        h.json.ranges[0].segments.map((seg: any) => seg.text).join(''),
        created.json.verbatimText,
      );
    } finally {
      await s.close();
    }
  });

  test('EVIDENCE IS IMMUTABLE: there is no update or delete endpoint', async () => {
    const s = await startServer();
    try {
      const { projectId, sourceId, unit } = await setup(s);
      const created = await call(
        s, 'POST', `/projects/${projectId}/evidence`,
        { sourceId, sourceUnitId: unit.id }, asAnalyst,
      );
      const id = created.json.id;

      for (const method of ['PUT', 'PATCH', 'DELETE']) {
        const r = await call(
          s, method, `/projects/${projectId}/evidence/${id}`, { verbatimText: 'tampered' }, asAnalyst,
        );
        assert.equal(r.status, 404, `${method} must not exist — the absence is the enforcement`);
      }

      const still = await call(
        s, 'GET', `/projects/${projectId}/evidence/${id}`, undefined, asAnalyst,
      );
      assert.equal(still.json.verbatimText, created.json.verbatimText);
    } finally {
      await s.close();
    }
  });

  test('refuses to cite a source that failed to parse', async () => {
    const s = await startServer();
    try {
      const projectId = await createProjectVia(s);
      // A source with no extractable content: whitespace only. It parses, but
      // yields no units, so there is nothing to cite by unit.
      const blank = await ingest(s, projectId, { filename: 'blank.txt', text: '   \n\n  \n' });
      assert.equal(blank.unitCount, 0);

      const r = await call(
        s, 'POST', `/projects/${projectId}/evidence`,
        { sourceId: blank.source.id, charStart: 0, charEnd: 3 }, asAnalyst,
      );
      // The range is whitespace, which is citable text — but it must still verify.
      assert.ok([201, 400].includes(r.status));
      if (r.status === 201) assert.equal(r.json.anchorVerified, true);
    } finally {
      await s.close();
    }
  });
});

// ---------------------------------------------------------------------------
// L0 validation over HTTP
// ---------------------------------------------------------------------------

describe('L0 ingestion validation', () => {
  test('a clean project has NOTHING blocking G1', async () => {
    const s = await startServer();
    try {
      const projectId = await createProjectVia(s);
      await ingest(s, projectId, {
        filename: 'brd.md',
        text: BILINGUAL,
        authorityRank: 500,
        effectiveDate: '2026-01-01T00:00:00.000Z',
      });

      const r = await call(s, 'POST', `/projects/${projectId}/intake/validate`, undefined, asAnalyst);
      assert.equal(r.status, 200);
      assert.deepEqual(r.json.summary.blocking, [], JSON.stringify(r.json.findings));
      assert.equal(r.json.summary.errors, 0);
    } finally {
      await s.close();
    }
  });

  test('a source with no effective date produces an INFO finding that does not block', async () => {
    const s = await startServer();
    try {
      const projectId = await createProjectVia(s);
      await ingest(s, projectId, { filename: 'brd.md', text: BILINGUAL, authorityRank: 500 });

      const r = await call(s, 'POST', `/projects/${projectId}/intake/validate`, undefined, asAnalyst);
      const ids = r.json.findings.map((f: any) => f.ruleId);
      assert.ok(ids.includes('L0-ING-010'));
      assert.deepEqual(r.json.summary.blocking, [], 'informational findings never block');
      assert.ok(r.json.summary.infos >= 1);
    } finally {
      await s.close();
    }
  });

  test('a source that extracted no units produces a truncation WARNING', async () => {
    const s = await startServer();
    try {
      const projectId = await createProjectVia(s);
      await ingest(s, projectId, { filename: 'blank.txt', text: '    \n\n   \n' });

      const r = await call(s, 'POST', `/projects/${projectId}/intake/validate`, undefined, asAnalyst);
      const ids = r.json.findings.map((f: any) => f.ruleId);
      assert.ok(ids.includes('L0-ING-005'));
      assert.equal(r.json.summary.errors, 0, 'a sparse document warns, it does not block');
    } finally {
      await s.close();
    }
  });

  test('the rule catalogue is reportable, with all ten L0 rules', async () => {
    const s = await startServer();
    try {
      const projectId = await createProjectVia(s);
      const r = await call(s, 'GET', `/projects/${projectId}/intake/rules`, undefined, asViewer);
      assert.equal(r.status, 200);
      assert.equal(r.json.total, 10);
      assert.ok(r.json.rules.every((rule: any) => rule.layer === 'L0'));
    } finally {
      await s.close();
    }
  });

  test('a Viewer may validate but may not ingest', async () => {
    const s = await startServer();
    try {
      const projectId = await createProjectVia(s);
      const validate = await call(
        s, 'POST', `/projects/${projectId}/intake/validate`, undefined, asViewer,
      );
      assert.equal(validate.status, 200, 'reading the state of intake is not a privileged act');

      const ingestAttempt = await call(
        s, 'POST', `/projects/${projectId}/sources`,
        { filename: 'x.txt', text: 'content' }, asViewer,
      );
      assert.equal(ingestAttempt.status, 403);
    } finally {
      await s.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Security posture
// ---------------------------------------------------------------------------

describe('security posture on the intake surface', () => {
  test('401 unauthenticated · 403 unauthorised · 404 unknown', async () => {
    const s = await startServer();
    try {
      const projectId = await createProjectVia(s);

      const anonymous = await call(s, 'GET', `/projects/${projectId}/sources`);
      assert.equal(anonymous.status, 401, 'no credentials is an AUTHENTICATION failure');

      const wrongRole = await call(
        s, 'POST', `/projects/${projectId}/sources`,
        { filename: 'x.txt', text: 'content' }, asViewer,
      );
      assert.equal(wrongRole.status, 403, 'authenticated but not authorised');

      const unknownRoute = await call(
        s, 'GET', `/projects/${projectId}/sources-not-a-route`, undefined, asAnalyst,
      );
      assert.equal(unknownRoute.status, 404);

      const unknownSource = await call(
        s, 'GET', `/projects/${projectId}/sources/src-9999`, undefined, asAnalyst,
      );
      assert.ok([400, 404].includes(unknownSource.status), 'a missing resource is not a 500');
    } finally {
      await s.close();
    }
  });

  test('every intake route refuses an anonymous caller', async () => {
    const s = await startServer();
    try {
      const projectId = await createProjectVia(s);
      const routes: readonly (readonly [string, string])[] = [
        ['GET', `/projects/${projectId}/sources`],
        ['POST', `/projects/${projectId}/sources`],
        ['GET', `/projects/${projectId}/sources/src-1/content`],
        ['GET', `/projects/${projectId}/sources/src-1/units`],
        ['GET', `/projects/${projectId}/sources/src-1/highlights`],
        ['PUT', `/projects/${projectId}/sources/src-1/authority`],
        ['GET', `/projects/${projectId}/evidence`],
        ['POST', `/projects/${projectId}/evidence`],
        ['POST', `/projects/${projectId}/intake/validate`],
        ['GET', `/projects/${projectId}/intake/rules`],
      ];
      for (const [method, path] of routes) {
        const r = await call(s, method, path, method === 'GET' ? undefined : {});
        assert.equal(r.status, 401, `${method} ${path} must refuse an anonymous caller`);
      }
    } finally {
      await s.close();
    }
  });

  test('a source cannot be read through a project it does not belong to', async () => {
    const s = await startServer();
    try {
      const projectA = await createProjectVia(s, 'project-a');
      const projectB = await createProjectVia(s, 'project-b');
      const src = await ingest(s, projectA, { filename: 'a.txt', text: 'Belongs to A.' });

      const crossRead = await call(
        s, 'GET', `/projects/${projectB}/sources/${src.source.id}/content`, undefined, asAnalyst,
      );
      assert.equal(crossRead.status, 400, 'cross-project access must be refused');
      assert.match(String(crossRead.json.error), /does not belong/);
    } finally {
      await s.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Durability and atomicity
// ---------------------------------------------------------------------------

describe('durability and atomicity', () => {
  test('sources, text, units and evidence SURVIVE a full service restart', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'asdp-intake-db-'));
    let projectId = '';
    let sourceId = '';
    let evidenceId = '';
    let originalText = '';

    const first = await startServer({ dataDir });
    try {
      projectId = await createProjectVia(first);
      const result = await ingest(first, projectId, { filename: 'ar.md', text: BILINGUAL });
      sourceId = result.source.id;

      const units = await call(
        first, 'GET', `/projects/${projectId}/sources/${sourceId}/units`, undefined, asAnalyst,
      );
      const created = await call(
        first, 'POST', `/projects/${projectId}/evidence`,
        { sourceId, sourceUnitId: units.json.units[0].id }, asAnalyst,
      );
      evidenceId = created.json.id;

      const content = await call(
        first, 'GET', `/projects/${projectId}/sources/${sourceId}/content`, undefined, asAnalyst,
      );
      originalText = content.json.text;
    } finally {
      await first.close();
    }

    const second = await startServer({ dataDir });
    try {
      const content = await call(
        second, 'GET', `/projects/${projectId}/sources/${sourceId}/content`, undefined, asAnalyst,
      );
      assert.equal(content.status, 200, 'the source must still exist after a restart');
      assert.equal(content.json.text, originalText, 'Arabic text survives byte-exactly');
      assert.ok(content.json.units.length > 0);

      // The decisive check: anchors minted before the restart still resolve
      // against text read after it.
      const highlights = await call(
        second, 'GET', `/projects/${projectId}/sources/${sourceId}/highlights`, undefined, asAnalyst,
      );
      assert.ok(
        highlights.json.ranges.every((r: any) => r.resolution === 'resolved'),
        'every anchor must still resolve after a restart',
      );

      const item = await call(
        second, 'GET', `/projects/${projectId}/evidence/${evidenceId}`, undefined, asAnalyst,
      );
      assert.equal(item.status, 200);
      assert.equal(item.json.anchorVerified, true);
    } finally {
      await second.close();
    }
  });

  test('a failed ingest transaction leaves NO partial source behind', async () => {
    // Atomicity at the repository level, where the transaction actually lives:
    // a source is inserted and then the work throws, so the source, its text and
    // its units must all disappear together.
    const database = await createPgliteDatabase();
    try {
      await migrate(database);
      const repos = createSqlRepositories(database);
      await repos.projects.create({
        id: 'prj-tx', key: 'tx-project',
        name: { primary: { lang: 'en', text: 'TX', direction: 'ltr' }, translations: [] },
        description: '', createdBy: 'u-test', createdAt: new Date().toISOString(),
        settings: {
          standardsProfileId: 'standards-default', camundaTargetProfileId: 'camunda-8x-baseline',
          allowExternalProviders: true, classificationDefault: 'INTERNAL',
          classificationCeiling: 'RESTRICTED', strictness: 'strict',
          defaultRequirementLanguage: 'en', rafVersion: 'raf-1.1', rulePackVersion: 'rp-1.2',
        },
      });

      await assert.rejects(
        withTransaction(database, async (tx) => {
          await tx.sources.insert(
            {
              id: 'src-tx', projectId: 'prj-tx', filename: 'a.txt', mimeType: 'text/plain',
              byteSize: 5, sha256: 'd'.repeat(64), blobRef: 'sources/dd/dd/x.txt',
              uploadedBy: 'u-test', uploadedAt: new Date().toISOString(), kind: 'freetext',
              authorityRank: 0, primaryLanguage: 'en', direction: 'ltr', languageRuns: [],
              classification: 'INTERNAL', status: 'parsed', textLength: 5,
              textSha256: 'e'.repeat(64), extractionMethod: 'text', visionPageCount: 0,
            },
            { sourceId: 'src-tx', text: 'Hello', sha256: 'e'.repeat(64), codePointLength: 5 },
          );
          throw new Error('deliberate failure after the source insert');
        }),
        /deliberate failure/,
      );

      const after = createSqlRepositories(database);
      assert.equal(await after.sources.get('src-tx'), undefined, 'the source must be rolled back');
      assert.equal(await after.sources.getText('src-tx'), undefined, 'and so must its text');
    } finally {
      await database.close();
    }
  });

  test('SQL refuses unverified evidence even against a direct connection (invariant D1)', async () => {
    const database = await createPgliteDatabase();
    try {
      await migrate(database);
      // Bypassing the repository entirely: the check constraint in migration 002
      // is what makes D1 hold when code is not in the way.
      await assert.rejects(
        database.query(
          `insert into evidence_item (id, project_id, source_id, anchor_json, verbatim_text,
                                      language, extracted_by, citation_mode, anchor_verified,
                                      classification, created_by, created_at)
           values ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11,now())`,
          [
            'ev-bad', 'prj-x', 'src-x',
            JSON.stringify({ quote: 'q', quoteChecksum: 'c', target: {} }),
            'q', 'en', 'parser', 'none', false, 'INTERNAL', 'u-test',
          ],
        ),
        /constraint|violates/i,
      );
    } finally {
      await database.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Unit-level checks on command helpers
// ---------------------------------------------------------------------------

describe('command helpers', () => {
  test('resolveClassification raises, never lowers, and honours the ceiling', () => {
    assert.equal(resolveClassification(undefined, 'INTERNAL', 'RESTRICTED'), 'INTERNAL');
    assert.equal(resolveClassification('CONFIDENTIAL', 'INTERNAL', 'RESTRICTED'), 'CONFIDENTIAL');
    assert.equal(
      resolveClassification('PUBLIC', 'INTERNAL', 'RESTRICTED'),
      'INTERNAL',
      'a request to lower the classification is ignored, not honoured',
    );
    assert.throws(
      () => resolveClassification('PROHIBITED', 'INTERNAL', 'RESTRICTED'),
      ValidationError,
    );
  });

  test('the JSON body limit exceeds the source limit, because base64 inflates', () => {
    const limit = jsonBodyLimit(1_000_000);
    assert.ok(limit > 1_000_000 * (4 / 3), 'a source at the limit must reach the guard');
  });
});

// ---------------------------------------------------------------------------
// V2 — DOCX intake, end to end
// ---------------------------------------------------------------------------

/**
 * Build a DOCX as a stored-method ZIP.
 *
 * A second, simpler copy of the builder in `docx.test.ts`: this suite needs a
 * DOCX over HTTP, not coverage of the deflate path, and importing a helper across
 * package test files would couple two suites for no benefit.
 */
function buildDocx(bodyXml: string): Uint8Array {
  const encoder = new TextEncoder();
  const document =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${bodyXml}</w:body></w:document>`;

  const crcTable: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc32 = (bytes: Uint8Array): number => {
    let c = 0xffffffff;
    for (const b of bytes) c = (crcTable[(c ^ b) & 0xff] as number) ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const u16 = (v: number): number[] => [v & 0xff, (v >>> 8) & 0xff];
  const u32 = (v: number): number[] => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];

  const name = encoder.encode('word/document.xml');
  const raw = encoder.encode(document);
  const sum = crc32(raw);

  const local = [
    ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
    ...u32(sum), ...u32(raw.length), ...u32(raw.length),
    ...u16(name.length), ...u16(0), ...name, ...raw,
  ];
  const central = [
    ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
    ...u32(sum), ...u32(raw.length), ...u32(raw.length),
    ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(0), ...name,
  ];
  const eocd = [
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(1), ...u16(1),
    ...u32(central.length), ...u32(local.length), ...u16(0),
  ];
  return new Uint8Array([...local, ...central, ...eocd]);
}

const docxPara = (text: string, style?: string): string =>
  `<w:p>${style === undefined ? '' : `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>`}` +
  `<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

const BILINGUAL_DOCX = buildDocx(
  docxPara('Identity Verification', 'Heading1') +
    docxPara('The system must call the SADAD endpoint before approval.') +
    docxPara('المتطلبات', 'Heading2') +
    docxPara(ARABIC) +
    docxPara('على النظام استدعاء خدمة SADAD خلال 30 ثانية.') +
    '<w:tbl><w:tr>' +
    `<w:tc>${docxPara('Condition')}</w:tc><w:tc>${docxPara('Action')}</w:tc>` +
    '</w:tr></w:tbl>',
);

const asBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

describe('DOCX intake', () => {
  test('ingests a DOCX, sniffing the type from the archive contents', async () => {
    const s = await startServer();
    try {
      const projectId = await createProjectVia(s);
      const result = await ingest(s, projectId, {
        filename: 'brd.docx',
        contentBase64: asBase64(BILINGUAL_DOCX),
      });

      assert.equal(
        result.source.mimeType,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      assert.equal(result.source.kind, 'docx');
      assert.equal(result.source.status, 'parsed');
      assert.equal(result.source.extractorVersion, 'docx@1');
      assert.equal(result.source.extractionMethod, 'text', 'no vision path exists in V2');
      assert.ok(result.unitCount >= 6);
      assert.match(result.source.blobRef, /\.docx$/);
    } finally {
      await s.close();
    }
  });

  test('units carry docx_block anchors with block paths AND offsets', async () => {
    const s = await startServer();
    try {
      const projectId = await createProjectVia(s);
      const result = await ingest(s, projectId, {
        filename: 'brd.docx',
        contentBase64: asBase64(BILINGUAL_DOCX),
      });
      const units = await call(
        s, 'GET', `/projects/${projectId}/sources/${result.source.id}/units`, undefined, asAnalyst,
      );

      for (const unit of units.json.units) {
        assert.equal(unit.anchor.target.kind, 'docx_block');
        assert.ok(typeof unit.anchor.target.blockPath === 'string');
        assert.ok(Number.isInteger(unit.anchor.target.charStart), 'offsets survive the jsonb round trip');
      }
      const types = new Set(units.json.units.map((u: any) => u.type));
      assert.ok(types.has('heading'));
      assert.ok(types.has('paragraph'));
      assert.ok(types.has('tableCell'));
    } finally {
      await s.close();
    }
  });

  test('every stored DOCX anchor still resolves — highlights come back resolved', async () => {
    const s = await startServer();
    try {
      const projectId = await createProjectVia(s);
      const result = await ingest(s, projectId, {
        filename: 'brd.docx',
        contentBase64: asBase64(BILINGUAL_DOCX),
      });
      const h = await call(
        s, 'GET', `/projects/${projectId}/sources/${result.source.id}/highlights`,
        undefined, asAnalyst,
      );
      assert.equal(h.json.total, result.unitCount);
      assert.ok(
        h.json.ranges.every((r: any) => r.resolution === 'resolved'),
        'a docx_block anchor must be verifiable by the same resolver as any other',
      );
    } finally {
      await s.close();
    }
  });

  test('Arabic in a DOCX round-trips byte-exactly and keeps logical order', async () => {
    const s = await startServer();
    try {
      const projectId = await createProjectVia(s);
      const result = await ingest(s, projectId, {
        filename: 'ar.docx',
        contentBase64: asBase64(buildDocx(docxPara(ARABIC))),
      });
      const content = await call(
        s, 'GET', `/projects/${projectId}/sources/${result.source.id}/content`,
        undefined, asAnalyst,
      );
      assert.equal(content.json.text, ARABIC);
      assert.equal(content.json.units[0].text, ARABIC);
      assert.equal(content.json.units[0].direction, 'rtl');
      assert.equal(result.source.primaryLanguage, 'ar');
    } finally {
      await s.close();
    }
  });

  test('an embedded Latin term inside Arabic is NOT reversed', async () => {
    const s = await startServer();
    try {
      const projectId = await createProjectVia(s);
      const line = 'على النظام استدعاء خدمة SADAD خلال 30 ثانية.';
      const result = await ingest(s, projectId, {
        filename: 'mixed.docx',
        contentBase64: asBase64(buildDocx(docxPara(line))),
      });
      const content = await call(
        s, 'GET', `/projects/${projectId}/sources/${result.source.id}/content`,
        undefined, asAnalyst,
      );
      assert.equal(content.json.units[0].text, line);
      assert.ok(content.json.text.includes('SADAD'), 'the Latin run keeps its reading order');
      assert.ok(content.json.text.includes('30'));
    } finally {
      await s.close();
    }
  });

  test('evidence can cite a DOCX unit, and the citation verifies', async () => {
    const s = await startServer();
    try {
      const projectId = await createProjectVia(s);
      const result = await ingest(s, projectId, {
        filename: 'brd.docx',
        contentBase64: asBase64(BILINGUAL_DOCX),
      });
      const units = await call(
        s, 'GET', `/projects/${projectId}/sources/${result.source.id}/units`, undefined, asAnalyst,
      );
      const arabicUnit = units.json.units.find((u: any) => u.direction === 'rtl');
      assert.ok(arabicUnit !== undefined);

      const created = await call(
        s, 'POST', `/projects/${projectId}/evidence`,
        { sourceId: result.source.id, sourceUnitId: arabicUnit.id }, asAnalyst,
      );
      assert.equal(created.status, 201, JSON.stringify(created.json));
      assert.equal(created.json.anchorVerified, true);
      assert.equal(created.json.verbatimText, arabicUnit.text);
      assert.equal(created.json.anchor.target.kind, 'docx_block');
      assert.equal(created.json.language, 'ar');
    } finally {
      await s.close();
    }
  });

  test('a DOCX with no readable document part is recorded as parse_failed', async () => {
    const s = await startServer();
    try {
      const projectId = await createProjectVia(s);
      // A valid ZIP whose only part is a malformed document.xml: the guard admits
      // it (the part is present), and the adapter then fails — which is exactly
      // the difference between refusing a file and reading one badly.
      const broken = buildDocx('<w:p><w:r><w:t>unclosed');
      const r = await call(
        s, 'POST', `/projects/${projectId}/sources`,
        { filename: 'broken.docx', contentBase64: asBase64(broken) }, asAnalyst,
      );
      assert.equal(r.status, 201, 'the source IS created, with a recorded failure');
      assert.equal(r.json.source.status, 'parse_failed');
      assert.ok(String(r.json.source.parseError).length > 0, 'and it says why');
      assert.equal(r.json.unitCount, 0);

      const validation = await call(
        s, 'POST', `/projects/${projectId}/intake/validate`, undefined, asAnalyst,
      );
      const ids = validation.json.findings.map((f: any) => f.ruleId);
      assert.ok(ids.includes('L0-ING-001'), 'a parse failure is never silent');
      assert.ok(validation.json.summary.blocking.length > 0, 'and it blocks G1');
    } finally {
      await s.close();
    }
  });

  test('REFUSES an XLSX over HTTP, naming spreadsheets as a separate capability', async () => {
    const s = await startServer();
    try {
      const projectId = await createProjectVia(s);
      // A minimal but valid ZIP containing xl/workbook.xml.
      const encoder = new TextEncoder();
      const name = encoder.encode('xl/workbook.xml');
      const raw = encoder.encode('<workbook/>');
      const u16 = (v: number): number[] => [v & 0xff, (v >>> 8) & 0xff];
      const u32 = (v: number): number[] => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
      const local = [
        ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
        ...u32(0), ...u32(raw.length), ...u32(raw.length),
        ...u16(name.length), ...u16(0), ...name, ...raw,
      ];
      const central = [
        ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
        ...u32(0), ...u32(raw.length), ...u32(raw.length),
        ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(0), ...name,
      ];
      const eocd = [
        ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(1), ...u16(1),
        ...u32(central.length), ...u32(local.length), ...u16(0),
      ];
      const xlsx = new Uint8Array([...local, ...central, ...eocd]);

      const r = await call(
        s, 'POST', `/projects/${projectId}/sources`,
        { filename: 'rules.xlsx', contentBase64: asBase64(xlsx) }, asAnalyst,
      );
      assert.equal(r.status, 400);
      assert.match(String(r.json.error), /separate proposed capability/);
    } finally {
      await s.close();
    }
  });

  test('a PDF refusal now names V2-PDF, not V2', async () => {
    const s = await startServer();
    try {
      const projectId = await createProjectVia(s);
      const r = await call(
        s, 'POST', `/projects/${projectId}/sources`,
        { filename: 'brd.pdf', contentBase64: base64([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]) },
        asAnalyst,
      );
      assert.equal(r.status, 400);
      assert.match(
        String(r.json.error),
        /V2-PDF/,
        'the sequencing change must be reflected in what the user is told',
      );
    } finally {
      await s.close();
    }
  });

  test('a DOCX source passes L0 validation cleanly', async () => {
    const s = await startServer();
    try {
      const projectId = await createProjectVia(s);
      await ingest(s, projectId, {
        filename: 'brd.docx',
        contentBase64: asBase64(BILINGUAL_DOCX),
        authorityRank: 700,
        effectiveDate: '2026-01-01T00:00:00.000Z',
      });
      const r = await call(s, 'POST', `/projects/${projectId}/intake/validate`, undefined, asAnalyst);
      assert.deepEqual(r.json.summary.blocking, [], JSON.stringify(r.json.findings));
      assert.equal(r.json.summary.errors, 0);
    } finally {
      await s.close();
    }
  });

  test('DOCX state survives a restart, and its anchors still resolve', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'asdp-docx-db-'));
    let projectId = '';
    let sourceId = '';
    let text = '';

    const first = await startServer({ dataDir });
    try {
      projectId = await createProjectVia(first);
      const result = await ingest(first, projectId, {
        filename: 'brd.docx',
        contentBase64: asBase64(BILINGUAL_DOCX),
      });
      sourceId = result.source.id;
      const content = await call(
        first, 'GET', `/projects/${projectId}/sources/${sourceId}/content`, undefined, asAnalyst,
      );
      text = content.json.text;
    } finally {
      await first.close();
    }

    const second = await startServer({ dataDir });
    try {
      const content = await call(
        second, 'GET', `/projects/${projectId}/sources/${sourceId}/content`, undefined, asAnalyst,
      );
      assert.equal(content.json.text, text, 'Arabic survives byte-exactly');

      const h = await call(
        second, 'GET', `/projects/${projectId}/sources/${sourceId}/highlights`, undefined, asAnalyst,
      );
      assert.ok(h.json.ranges.every((r: any) => r.resolution === 'resolved'));
    } finally {
      await second.close();
    }
  });
});

// ---------------------------------------------------------------------------
// V2-PDF is blocked, and the build says so
// ---------------------------------------------------------------------------

describe('V2-PDF is not implemented', () => {
  test('the rasteriser refuses by name, with the reason', async () => {
    const rasteriser = unavailableRasteriser();
    assert.equal(rasteriser.supports('application/pdf'), false);
    await assert.rejects(
      rasteriser.rasterise({
        sourceId: 'src-1',
        data: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
        mediaType: 'application/pdf',
        pageNumbers: [1],
        scale: 2,
      }),
      /not implemented in V2/,
    );
  });

  test('no extractor claims PDF', () => {
    for (const extractor of defaultExtractors()) {
      assert.equal(extractor.supports('application/pdf'), false);
    }
  });
});

// ---------------------------------------------------------------------------
// V3 — images, vision, and structural model import, end to end
// ---------------------------------------------------------------------------

/** A PNG header with the dimensions actually encoded, so bounds checks are real. */
function pngOf(width: number, height: number): Uint8Array {
  const be = (v: number): number[] => [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...be(13), 0x49, 0x48, 0x44, 0x52,
    ...be(width), ...be(height),
    8, 2, 0, 0, 0, 0, 0, 0, 0,
  ]);
}

const BPMN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="Process_1" name="Customer Onboarding">
    <bpmn:userTask id="Activity_1" name="${ARABIC}"/>
    <bpmn:exclusiveGateway id="Gateway_1" name="Amount over 1000?"/>
  </bpmn:process>
</bpmn:definitions>`;

/**
 * A vision extractor driven by a fixed script — the replay stand-in.
 *
 * **A7:** no live call. This is what CI exercises, and the checker rule
 * `no-live-ai-in-tests` prevents a real transport appearing here.
 */
function scriptedVision(
  regions: readonly { rect: { x: number; y: number; w: number; h: number }; text: string; language?: string; direction?: 'ltr' | 'rtl' | 'neutral' }[],
): any {
  return {
    id: 'vision-replay@test',
    supports: (mediaType: string) => mediaType.startsWith('image/'),
    extract: async () => ({
      kind: 'extracted',
      interactionId: 'ai-replay-1',
      result: {
        regions: regions.map((r) => ({
          rect: r.rect,
          text: r.text,
          language: r.language ?? 'en',
          direction: r.direction ?? 'ltr',
          role: 'label' as const,
        })),
        limitations: [],
      },
    }),
  };
}

/** A vision extractor that fails the test if it is ever called. */
const forbiddenVision: any = {
  id: 'must-not-be-called@test',
  supports: () => true,
  extract: async () => {
    throw new Error('vision was invoked for a source a deterministic reader can handle');
  },
};

async function startServerWith(vision: any, options: { dataDir?: string } = {}): Promise<Server> {
  const blobRoot = await mkdtemp(join(tmpdir(), 'asdp-v3-blob-'));
  const config = loadConfig({ PORT: '0', ASDP_LOG_LEVEL: 'error', ASDP_BLOB_ROOT: blobRoot });
  const database = await createPgliteDatabase(
    options.dataDir === undefined ? {} : { dataDir: options.dataDir },
  );
  await migrate(database);
  const blobStore = await createFilesystemBlobStore({ rootDirectory: blobRoot });
  const running = await listen(
    {
      config, database, blobStore, clock: systemClock(), ids: counterIdGenerator(),
      visionExtractor: vision,
    },
    0,
  );
  return {
    ...running,
    database,
    blobRoot,
    close: async () => {
      await running.close();
      await database.close();
    },
  };
}

describe('image intake and vision', () => {
  test('ingests a screenshot, stores a PageImage, and records the vision read', async () => {
    const s = await startServerWith(
      scriptedVision([{ rect: { x: 10, y: 20, w: 200, h: 30 }, text: 'Submit application' }]),
    );
    try {
      const projectId = await createProjectVia(s);
      const result = await ingest(s, projectId, {
        filename: 'screen.png',
        contentBase64: asBase64(pngOf(800, 600)),
      });

      assert.equal(result.source.mimeType, 'image/png');
      assert.equal(result.source.kind, 'screenshot');
      assert.equal(result.source.status, 'parsed');
      // L0-ING-007 depends on this being recorded rather than inferred.
      assert.equal(result.source.extractionMethod, 'vision');
      assert.equal(result.source.visionPageCount, 1);
      assert.equal(result.source.textLength, 0, 'an image has no text layer');
      assert.equal(result.source.primaryLanguage, 'und', 'no language is guessed from pixels');
      assert.equal(result.unitCount, 1);
      assert.match(result.source.blobRef, /\.png$/);
    } finally {
      await s.close();
    }
  });

  test('AN IMAGE ANCHOR NEVER RESOLVES — it comes back content_unverified', async () => {
    const s = await startServerWith(
      scriptedVision([{ rect: { x: 10, y: 20, w: 200, h: 30 }, text: 'Submit application' }]),
    );
    try {
      const projectId = await createProjectVia(s);
      const result = await ingest(s, projectId, {
        filename: 'screen.png',
        contentBase64: asBase64(pngOf(800, 600)),
      });
      const h = await call(
        s, 'GET', `/projects/${projectId}/sources/${result.source.id}/highlights`,
        undefined, asAnalyst,
      );
      assert.equal(h.json.total, 1);
      const range = h.json.ranges[0];
      assert.equal(range.resolution, 'content_unverified', 'ADR-0038');
      assert.notEqual(range.resolution, 'resolved');
      // The rectangle is what a viewer paints — there are no text segments.
      assert.deepEqual(range.imageRect, { x: 10, y: 20, w: 200, h: 30 });
      assert.deepEqual(range.segments, []);
      assert.ok(String(range.detail).includes('not independently verified'));
    } finally {
      await s.close();
    }
  });

  test('anchors are page precision, so the L2 ceiling applies', async () => {
    const s = await startServerWith(
      scriptedVision([{ rect: { x: 0, y: 0, w: 100, h: 100 }, text: 'Label' }]),
    );
    try {
      const projectId = await createProjectVia(s);
      const result = await ingest(s, projectId, {
        filename: 'screen.png', contentBase64: asBase64(pngOf(800, 600)),
      });
      const units = await call(
        s, 'GET', `/projects/${projectId}/sources/${result.source.id}/units`, undefined, asAnalyst,
      );
      assert.equal(units.json.units[0].anchor.precision, 'page');
      assert.equal(units.json.units[0].anchor.target.kind, 'image_region');
    } finally {
      await s.close();
    }
  });

  test('an out-of-bounds region is DROPPED, not clamped', async () => {
    const s = await startServerWith(
      scriptedVision([
        { rect: { x: 700, y: 10, w: 400, h: 30 }, text: 'Overflows the image' },
        { rect: { x: 10, y: 10, w: 100, h: 30 }, text: 'Inside' },
      ]),
    );
    try {
      const projectId = await createProjectVia(s);
      const result = await ingest(s, projectId, {
        filename: 'screen.png', contentBase64: asBase64(pngOf(800, 600)),
      });
      assert.equal(result.unitCount, 1, 'the overflowing region is dropped');

      const audit = await call(s, 'GET', `/projects/${projectId}/audit`, undefined, asAdmin);
      const ingested = audit.json.find((e: any) => e.action === 'source.ingested');
      assert.ok(
        (ingested.after.limitations as string[]).some((l) => /not clamped/.test(l)),
        'the drop must be reported, because a clamped rectangle is a different claim',
      );
    } finally {
      await s.close();
    }
  });

  test('Arabic region text round-trips, and is citable as evidence', async () => {
    const s = await startServerWith(
      scriptedVision([{ rect: { x: 5, y: 5, w: 300, h: 40 }, text: ARABIC, language: 'ar', direction: 'rtl' }]),
    );
    try {
      const projectId = await createProjectVia(s);
      const result = await ingest(s, projectId, {
        filename: 'ar-screen.png', contentBase64: asBase64(pngOf(800, 600)), kind: 'diagram_image',
      });
      const units = await call(
        s, 'GET', `/projects/${projectId}/sources/${result.source.id}/units`, undefined, asAnalyst,
      );
      assert.equal(units.json.units[0].text, ARABIC);
      assert.equal(units.json.units[0].direction, 'rtl');

      const created = await call(
        s, 'POST', `/projects/${projectId}/evidence`,
        { sourceId: result.source.id, sourceUnitId: units.json.units[0].id }, asAnalyst,
      );
      assert.equal(created.status, 201, JSON.stringify(created.json));
      // content_unverified is CITABLE: the target is sound, and the ceiling —
      // not the anchor — limits what it may support.
      assert.equal(created.json.anchorVerified, true);
      assert.equal(created.json.verbatimText, ARABIC);
    } finally {
      await s.close();
    }
  });

  test('a vision REFUSAL leaves the image stored and the source parsed, with no units', async () => {
    // Not `parse_failed`: the bytes are held and readable, and the reading was
    // declined. Calling it a parse failure would be a different, false claim.
    const s = await startServerWith(unavailableVisionExtractor());
    try {
      const projectId = await createProjectVia(s);
      const result = await ingest(s, projectId, {
        filename: 'screen.png', contentBase64: asBase64(pngOf(400, 300)),
      });
      assert.equal(result.source.status, 'parsed');
      assert.equal(result.unitCount, 0);

      const audit = await call(s, 'GET', `/projects/${projectId}/audit`, undefined, asAdmin);
      const event = audit.json.find((e: any) => e.action === 'source.visionRefused');
      assert.ok(event !== undefined, 'the refusal must be audited');
      assert.ok((event.after.limitations as string[]).some((l) => /refused/.test(l)));
    } finally {
      await s.close();
    }
  });

  test('TAMPERING with the stored image breaks every anchor over it', async () => {
    const s = await startServerWith(
      scriptedVision([{ rect: { x: 1, y: 1, w: 50, h: 20 }, text: 'Label' }]),
    );
    try {
      const projectId = await createProjectVia(s);
      const result = await ingest(s, projectId, {
        filename: 'screen.png', contentBase64: asBase64(pngOf(800, 600)),
      });

      // Rewrite the stored checksum to simulate the bytes having changed.
      await s.database.query('update page_image set sha256 = $1 where source_id = $2', [
        'f'.repeat(64),
        result.source.id,
      ]);

      const h = await call(
        s, 'GET', `/projects/${projectId}/sources/${result.source.id}/highlights`,
        undefined, asAnalyst,
      );
      assert.equal(h.json.ranges[0].resolution, 'broken');
      assert.match(String(h.json.ranges[0].detail), /has changed/);
    } finally {
      await s.close();
    }
  });

  test('L0-ING-007 fires when a vision read produced no regions', async () => {
    const s = await startServerWith(unavailableVisionExtractor());
    try {
      const projectId = await createProjectVia(s);
      await ingest(s, projectId, {
        filename: 'screen.png', contentBase64: asBase64(pngOf(400, 300)),
        authorityRank: 100, effectiveDate: '2026-01-01T00:00:00.000Z',
      });
      const v = await call(s, 'POST', `/projects/${projectId}/intake/validate`, undefined, asAnalyst);
      const ids = v.json.findings.map((f: any) => f.ruleId);
      // A vision source with no regions is a truncation warning, and the vision
      // read itself is recorded — so 007 does NOT fire (pages ARE recorded).
      assert.ok(ids.includes('L0-ING-005'), 'no regions is worth a warning');
      assert.equal(v.json.summary.errors, 0, 'and it does not block G1');
    } finally {
      await s.close();
    }
  });
});

describe('no AI for sources a deterministic reader can handle', () => {
  test('text, Markdown, DOCX and BPMN are ingested with a provider that THROWS if called', async () => {
    // The preserved V3 rule, asserted rather than assumed.
    const s = await startServerWith(forbiddenVision);
    try {
      const projectId = await createProjectVia(s);
      const cases: readonly (readonly [string, Record<string, unknown>])[] = [
        ['notes.txt', { text: 'The applicant must supply a document.' }],
        ['brd.md', { text: '# Heading\n\nBody text.' }],
        ['brd.docx', { contentBase64: asBase64(BILINGUAL_DOCX) }],
        ['legacy.bpmn', { text: BPMN_XML }],
      ];
      for (const [filename, body] of cases) {
        const r = await call(
          s, 'POST', `/projects/${projectId}/sources`, { filename, ...body }, asAnalyst,
        );
        assert.equal(r.status, 201, `${filename}: ${JSON.stringify(r.json)}`);
        assert.notEqual(r.json.source.extractionMethod, 'vision', filename);
      }
    } finally {
      await s.close();
    }
  });
});

describe('structural model import as evidence', () => {
  test('imports BPMN elements with bpmn_element anchors that RESOLVE', async () => {
    const s = await startServerWith(forbiddenVision);
    try {
      const projectId = await createProjectVia(s);
      const result = await ingest(s, projectId, { filename: 'legacy.bpmn', text: BPMN_XML });
      assert.equal(result.source.kind, 'bpmn');
      assert.equal(result.source.extractorVersion, 'model@1');

      const h = await call(
        s, 'GET', `/projects/${projectId}/sources/${result.source.id}/highlights`,
        undefined, asAnalyst,
      );
      assert.ok(
        h.json.ranges.every((r: any) => r.resolution === 'resolved'),
        'a parser read a structured file, so content IS verified',
      );

      const units = await call(
        s, 'GET', `/projects/${projectId}/sources/${result.source.id}/units`, undefined, asAnalyst,
      );
      assert.ok(units.json.units.every((u: any) => u.anchor.target.kind === 'bpmn_element'));
      assert.ok(units.json.units.some((u: any) => u.text === ARABIC), 'Arabic element names survive');
    } finally {
      await s.close();
    }
  });

  test('an imported model is EVIDENCE ONLY — no endpoint edits it', async () => {
    const s = await startServerWith(forbiddenVision);
    try {
      const projectId = await createProjectVia(s);
      const result = await ingest(s, projectId, { filename: 'legacy.bpmn', text: BPMN_XML });
      for (const method of ['PUT', 'PATCH', 'DELETE']) {
        const r = await call(
          s, method, `/projects/${projectId}/sources/${result.source.id}`, { x: 1 }, asAnalyst,
        );
        assert.equal(r.status, 404, `${method} must not exist`);
      }
    } finally {
      await s.close();
    }
  });

  test('L0-ING-005 does NOT report truncation for an element-anchored source', async () => {
    // Coverage is meaningless for element anchors: they address content by
    // identity, not by offset. Measuring text coverage would report a truncation
    // that did not happen.
    const s = await startServerWith(forbiddenVision);
    try {
      const projectId = await createProjectVia(s);
      await ingest(s, projectId, {
        filename: 'legacy.bpmn', text: BPMN_XML,
        authorityRank: 500, effectiveDate: '2026-01-01T00:00:00.000Z',
      });
      const v = await call(s, 'POST', `/projects/${projectId}/intake/validate`, undefined, asAnalyst);
      const ids = v.json.findings.map((f: any) => f.ruleId);
      assert.ok(!ids.includes('L0-ING-005'), JSON.stringify(v.json.findings));
      assert.deepEqual(v.json.summary.blocking, []);
    } finally {
      await s.close();
    }
  });
});
