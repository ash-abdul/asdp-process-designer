/**
 * U1 tests — the parts that can be tested without a DOM, which is most of them.
 *
 * Everything that carries a rule lives in a DOM-free module precisely so it can
 * be tested here, under `node --test`, with **no browser dependency**
 * ([ADR-0039](../../../docs/adr/ADR-0039-react-presentation-layer.md), which
 * records why a browser test runner was not adopted: it would download binaries
 * over the network and break the deterministic verification posture A7 requires).
 *
 * Covered: highlight offset mapping including non-BMP text and RTL runs, broken
 * and content-unverified handling, the accessible name, the fail-closed
 * development-auth boundary, the role-map drift guard, and the API client's
 * status vocabulary and contract validation.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  piecesFor,
  brokenRanges,
  isPaintable,
  pieceLabel,
  dirAttribute,
  directionName,
  resolutionName,
  type HighlightRange,
} from './source-viewer/highlight-model.ts';
import {
  isDevelopmentOrigin,
  devAuthHeaders,
  mayInvoke,
  DevAuthRefused,
  COMMAND_ROLES,
  ROLES,
} from './lib/dev-auth.ts';
import { createClient, ApiError, ContractError } from './api/client.ts';
import {
  authorityOf,
  isSettableRank,
  inventoryOrder,
  parseStateOf,
  outcomeOf,
  ingestBody,
  groupBySeverity,
  blocksGate,
  describeRule,
} from './features/sources/source-model.ts';
import { ProjectList, ProjectSummary, SourceContent, HighlightList, labelOf } from './api/contracts.ts';
import {
  setStateOf,
  evidenceExpectationOf,
  confidenceOf,
  versionOf,
  derivationOf,
  degradationsOf,
  provenanceOf,
  chipsFor,
  type RequirementRow,
} from './features/requirements/requirement-model.ts';
import {
  citeUnitBody,
  citeRefusal,
  preview,
  unitOptionLabel,
  anchorSummary,
  originOf,
  bySource,
  type EvidenceRow,
} from './features/evidence/evidence-model.ts';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const LTR = 'The applicant must submit the renewal request within ninety days.';
const RTL = 'يجب على مقدم الطلب تقديم طلب التجديد خلال تسعين يوماً.';
/** Mixed, with a non-BMP character so code-point vs UTF-16 is actually exercised. */
const MIXED = `Policy 🏛 states: ${RTL} — and no later.`;

function range(
  start: number,
  end: number,
  text: string,
  options: Partial<HighlightRange> = {},
): HighlightRange {
  return {
    sourceId: 'src-1',
    start,
    end,
    baseDirection: 'ltr',
    segments: [
      { start, end, text, language: 'en', direction: 'ltr', counterFlow: false },
    ],
    resolution: 'resolved',
    ...options,
  } as HighlightRange;
}

// ---------------------------------------------------------------------------
// The highlight model
// ---------------------------------------------------------------------------

describe('U1 highlight mapping', () => {
  test('NEVER LOSES TEXT: the pieces always reconstruct the source exactly', () => {
    // The invariant that makes every other assertion meaningful. If painting
    // could drop or duplicate a character, a correct-looking highlight would
    // still be rendering the wrong document.
    for (const text of [LTR, RTL, MIXED, '', 'a']) {
      const cps = Array.from(text);
      const ranges = cps.length > 4
        ? [range(2, 5, cps.slice(2, 5).join(''))]
        : [];
      const pieces = piecesFor(text, ranges, 'ltr');
      assert.equal(pieces.map((p) => p.text).join(''), text);
    }
  });

  test('OFFSETS ARE CODE POINTS, not UTF-16 units — the non-BMP case', () => {
    // 🏛 is one code point and TWO UTF-16 units. A naive `text.slice(start,end)`
    // shifts everything after it, so this is the test that would fail if the
    // model ever reverted to string slicing.
    const cps = Array.from(MIXED);
    const emoji = cps.indexOf('🏛');
    assert.ok(emoji > 0, 'fixture must contain the non-BMP character');

    const after = emoji + 1;
    const expected = cps.slice(after, after + 6).join('');
    const pieces = piecesFor(MIXED, [range(after, after + 6, expected)], 'ltr');
    const highlighted = pieces.find((p) => p.range !== undefined);

    assert.equal(highlighted?.text, expected);
    // And the naive computation genuinely differs, so the test is not vacuous.
    assert.notEqual(MIXED.slice(after, after + 6), expected);
  });

  test('a segment carries the SERVER\'s direction, not the document\'s', () => {
    const cps = Array.from(MIXED);
    const start = cps.indexOf('ي');
    assert.ok(start > 0);
    const end = start + 10;
    const arabic = cps.slice(start, end).join('');

    const pieces = piecesFor(
      MIXED,
      [
        {
          sourceId: 'src-1',
          start,
          end,
          baseDirection: 'ltr',
          segments: [
            { start, end, text: arabic, language: 'ar', direction: 'rtl', counterFlow: true },
          ],
          resolution: 'resolved',
        } as HighlightRange,
      ],
      'ltr', // the DOCUMENT is left-to-right
    );

    const highlighted = pieces.find((p) => p.range !== undefined);
    assert.equal(highlighted?.direction, 'rtl', 'an Arabic run inside an English document is rtl');
    assert.equal(highlighted?.segment?.counterFlow, true);
    // Plain text around it keeps the document's direction.
    assert.equal(pieces[0]?.direction, 'ltr');
  });

  test('a multi-segment range paints each run with its own direction', () => {
    const text = 'Start يجب end';
    const cps = Array.from(text);
    const r: HighlightRange = {
      sourceId: 'src-1',
      start: 0,
      end: cps.length,
      baseDirection: 'ltr',
      segments: [
        { start: 0, end: 6, text: 'Start ', language: 'en', direction: 'ltr', counterFlow: false },
        { start: 6, end: 9, text: 'يجب', language: 'ar', direction: 'rtl', counterFlow: true },
        { start: 9, end: cps.length, text: ' end', language: 'en', direction: 'ltr', counterFlow: false },
      ],
      resolution: 'resolved',
    } as HighlightRange;

    const pieces = piecesFor(text, [r], 'ltr');
    assert.deepEqual(pieces.map((p) => p.direction), ['ltr', 'rtl', 'ltr']);
    assert.equal(pieces.map((p) => p.text).join(''), text);
  });

  test('A BROKEN ANCHOR IS NEVER PAINTED, and is reported instead', () => {
    // ADR-0039 §5: a broken anchor has no trustworthy span. Painting a best
    // guess is the specific failure this rule exists to prevent.
    const broken = range(0, 10, LTR.slice(0, 10), {
      resolution: 'broken',
      detail: 'quote not present in source',
    });
    assert.equal(isPaintable(broken), false);

    const pieces = piecesFor(LTR, [broken], 'ltr');
    assert.equal(pieces.length, 1);
    assert.equal(pieces[0]?.range, undefined, 'nothing may be highlighted');
    assert.equal(pieces.map((p) => p.text).join(''), LTR);

    const reported = brokenRanges([broken]);
    assert.equal(reported.length, 1);
    assert.equal(reported[0]?.detail, 'quote not present in source');
  });

  test('content_unverified IS painted but NEVER labelled as resolved (ADR-0038)', () => {
    const unverified = range(0, 10, LTR.slice(0, 10), { resolution: 'content_unverified' });
    assert.equal(isPaintable(unverified), true);

    const piece = piecesFor(LTR, [unverified], 'ltr').find((p) => p.range !== undefined);
    assert.ok(piece !== undefined);
    const label = pieceLabel(piece);
    assert.match(label, /content unverified/);
    assert.doesNotMatch(label, /\bresolved\b/);
  });

  test('an image range is not painted as text', () => {
    // start/end are deliberately zero for an image anchor; treating them as a
    // text extent would highlight the first zero characters of the document.
    const image = {
      sourceId: 'src-1',
      start: 0,
      end: 0,
      baseDirection: 'ltr',
      segments: [],
      resolution: 'content_unverified',
      imageId: 'img-1',
      imageRect: { x: 0, y: 0, width: 10, height: 10 },
    } as unknown as HighlightRange;
    assert.equal(isPaintable(image), false);
    assert.equal(piecesFor(LTR, [image], 'ltr').length, 1);
  });

  test('overlapping ranges resolve deterministically and never duplicate text', () => {
    const a = range(0, 20, LTR.slice(0, 20));
    const b = range(10, 30, LTR.slice(10, 30));
    const pieces = piecesFor(LTR, [a, b], 'ltr');
    assert.equal(pieces.map((p) => p.text).join(''), LTR);
    assert.equal(pieces.filter((p) => p.range !== undefined).length, 1);
  });

  test('out-of-bounds ranges are ignored rather than throwing', () => {
    const beyond = range(0, 10_000, 'nonsense');
    assert.equal(piecesFor(LTR, [beyond], 'ltr').map((p) => p.text).join(''), LTR);
  });

  test('a fully right-to-left document paints without a counter-flow run', () => {
    const cps = Array.from(RTL);
    const r: HighlightRange = {
      sourceId: 'src-1',
      start: 0,
      end: 8,
      baseDirection: 'rtl',
      segments: [
        { start: 0, end: 8, text: cps.slice(0, 8).join(''), language: 'ar', direction: 'rtl', counterFlow: false },
      ],
      resolution: 'resolved',
    } as HighlightRange;
    const pieces = piecesFor(RTL, [r], 'rtl');
    assert.deepEqual([...new Set(pieces.map((p) => p.direction))], ['rtl']);
    assert.equal(pieces.map((p) => p.text).join(''), RTL);
  });

  test('dir and accessible names never rely on colour', () => {
    assert.equal(dirAttribute('rtl'), 'rtl');
    assert.equal(dirAttribute('ltr'), 'ltr');
    assert.equal(dirAttribute('neutral'), 'auto', 'neutral defers to the browser, by decision');
    assert.equal(directionName('rtl'), 'right to left');
    assert.equal(resolutionName('content_unverified'), 'content unverified');
  });
});

// ---------------------------------------------------------------------------
// THE CLIENT MUST NOT SEARCH TEXT — asserted against the source itself
// ---------------------------------------------------------------------------

describe('U1 the no-text-search rule', () => {
  test('the highlight model contains NO text search of any kind', () => {
    // ADR-0039 §5. The architecture checker enforces this too; asserting it here
    // as well means the rule survives a checker refactor.
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      join(here, '..', 'src', 'source-viewer', 'highlight-model.ts'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''); // strip comments: prose may discuss them

    for (const forbidden of ['indexOf(', '.search(', '.match(', 'normalize(', '.trim(']) {
      assert.ok(
        !source.includes(forbidden),
        `highlight-model.ts must not use ${forbidden} — the client never re-searches text`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Development authentication — W5-A
// ---------------------------------------------------------------------------

describe('U1 development authentication fails closed', () => {
  test('permitted ONLY on localhost', () => {
    for (const ok of ['http://localhost:5173', 'http://127.0.0.1:3000', 'https://localhost']) {
      assert.equal(isDevelopmentOrigin(ok), true, ok);
    }
    for (const refused of [
      'https://asdp.example.gov',
      'https://localhost.evil.com',
      'http://evil.com/?x=localhost',
      'https://staging.internal',
      'file:///tmp',
      'not-a-url',
      '',
    ]) {
      assert.equal(isDevelopmentOrigin(refused), false, refused);
    }
  });

  test('REFUSES to produce headers off localhost — it does not fall back', () => {
    const identity = { subject: 'u-analyst', roles: ['BusinessAnalyst'] as const };
    assert.throws(
      () => devAuthHeaders(identity, 'https://asdp.example.gov'),
      (err: Error) =>
        err instanceof DevAuthRefused && /NOT the production authentication architecture/.test(err.message),
    );
  });

  test('produces the headers the API expects, on localhost', () => {
    const headers = devAuthHeaders(
      { subject: 'u-analyst', roles: ['BusinessAnalyst', 'Viewer'] },
      'http://localhost:5173',
    );
    assert.equal(headers['x-asdp-subject'], 'u-analyst');
    assert.equal(headers['x-asdp-roles'], 'BusinessAnalyst,Viewer');
  });

  test('an empty subject or no role is refused', () => {
    assert.throws(() => devAuthHeaders({ subject: '  ', roles: ['Viewer'] }, 'http://localhost'), DevAuthRefused);
    assert.throws(() => devAuthHeaders({ subject: 'u', roles: [] }, 'http://localhost'), DevAuthRefused);
  });
});

// ---------------------------------------------------------------------------
// The role map is a COURTESY, and must not drift — W10 / G-c deferred
// ---------------------------------------------------------------------------

describe('U1 role map drift guard', () => {
  test('every command in the UI map exists in the API COMMANDS registry', () => {
    // G-c was deferred in favour of hardcoding, on condition of this test. It
    // reads the API source rather than importing it, because @asdp/api is not
    // importable from the presentation layer (ADR-0039 §2).
    const here = dirname(fileURLToPath(import.meta.url));
    const commands = readFileSync(
      join(here, '..', '..', 'api', 'src', 'commands.ts'),
      'utf8',
    );
    for (const name of Object.keys(COMMAND_ROLES)) {
      assert.ok(
        commands.includes(`name: '${name}'`),
        `the UI names a command the API does not have: ${name}`,
      );
    }
  });

  test('THE ROLE LIST EQUALS THE API\'S, IN BOTH DIRECTIONS (U2-a)', () => {
    // U1 asserted only one direction — that every role the UI names exists in
    // the API — which is true of ANY subset, and U1 shipped five of ten. A
    // Contributor could not sign in, and `ingestSource` permits Contributor.
    //
    // Both directions now, so a MISSING role fails verification as surely as an
    // unknown one.
    const here = dirname(fileURLToPath(import.meta.url));
    const primitives = readFileSync(
      join(here, '..', '..', '..', 'packages', 'schemas', 'src', 'primitives.ts'),
      'utf8',
    );

    const block = /export const Role = z\.enum\(\[([\s\S]*?)\]\)/.exec(primitives);
    assert.ok(block !== null, 'could not find the Role enum in @asdp/schemas');
    const apiRoles = [...(block[1] as string).matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1] as string);
    assert.ok(apiRoles.length > 0, 'the Role enum parsed as empty');

    const ui = [...ROLES].sort();
    const api = [...apiRoles].sort();

    const missing = api.filter((r) => !ui.includes(r as never));
    const unknown = ui.filter((r) => !api.includes(r));

    assert.deepEqual(missing, [], `roles the API defines but the UI cannot select: ${missing.join(', ')}`);
    assert.deepEqual(unknown, [], `roles the UI names but the API does not define: ${unknown.join(', ')}`);
    assert.deepEqual(ui, api, 'the UI role list and the API Role enum must be equal');
  });

  test('every role a U2 command requires is SELECTABLE in the UI', () => {
    // The consequence the one-directional test missed: a command whose role
    // cannot be chosen at sign-in is a command no one can reach.
    for (const [command, roles] of Object.entries(COMMAND_ROLES)) {
      for (const role of roles) {
        assert.ok(
          (ROLES as readonly string[]).includes(role),
          `${command} requires '${role}', which the sign-in screen cannot select`,
        );
      }
    }
  });

  test('the U2 command role maps match the API COMMANDS registry exactly', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const commands = readFileSync(join(here, '..', '..', 'api', 'src', 'commands.ts'), 'utf8');
    for (const command of ['ingestSource', 'setSourceAuthorityRank']) {
      const line = commands.split('\n').find((l) => l.includes(`name: '${command}'`));
      assert.ok(line !== undefined, `the API has no command '${command}'`);
      const required = [...line.matchAll(/'([A-Za-z]+)'/g)]
        .map((m) => m[1] as string)
        .filter((r) => (ROLES as readonly string[]).includes(r));
      const mapped = [...(COMMAND_ROLES[command] ?? [])].sort();
      assert.deepEqual(
        mapped,
        [...required].sort(),
        `${command}: the UI role map disagrees with the API`,
      );
    }
  });

  test('mayInvoke is an affordance, and defers to the API when it does not know', () => {
    const analyst = { subject: 'u', roles: ['BusinessAnalyst'] as const };
    const viewer = { subject: 'u', roles: ['Viewer'] as const };
    assert.equal(mayInvoke(analyst, 'reviewRequirement'), true);
    assert.equal(mayInvoke(viewer, 'reviewRequirement'), false);
    assert.equal(mayInvoke(viewer, 'listRequirements'), true);
    // Unknown to the UI: let the server decide rather than guessing a refusal.
    assert.equal(mayInvoke(viewer, 'someCommandTheUiHasNeverHeardOf'), true);
  });
});

// ---------------------------------------------------------------------------
// The API client
// ---------------------------------------------------------------------------

function stubFetch(status: number, body: unknown): typeof fetch {
  return (async () =>
    new Response(body === undefined ? '' : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
}

describe('U1 API client', () => {
  const client = (impl: typeof fetch) =>
    createClient({ baseUrl: 'http://localhost:3000', headers: () => ({}), fetchImpl: impl });

  test('validates a good response and returns typed data', async () => {
    const c = client(stubFetch(200, [{ id: 'prj-1', key: 'alpha' }]));
    const projects = await c.get('/projects', ProjectList);
    assert.equal(projects[0]?.key, 'alpha');
  });

  test('A CONTRACT DRIFT IS LOUD, not a blank pane', async () => {
    const c = client(stubFetch(200, [{ id: 'prj-1' }])); // `key` missing
    await assert.rejects(() => c.get('/projects', ProjectList), ContractError);
  });

  test('PRESERVES the status vocabulary — 401, 403, 404, 409, 503 are distinct', async () => {
    // CLAUDE.md §12. A UI that collapses these sends the user to the wrong place:
    // 403 means find a permission, 401 means find a credential.
    const cases: [number, string][] = [
      [401, 'unauthenticated'],
      [403, 'forbidden'],
      [404, 'not_found'],
      [409, 'conflict'],
      [503, 'unavailable'],
      [400, 'invalid'],
      [418, 'unknown'],
    ];
    for (const [status, kind] of cases) {
      const c = client(stubFetch(status, { error: 'nope' }));
      await assert.rejects(
        () => c.get('/projects', ProjectList),
        (err: Error) => err instanceof ApiError && err.kind === kind && err.status === status,
        `status ${status} must map to ${kind}`,
      );
    }
  });

  test("uses the SERVER's message rather than inventing one", async () => {
    const c = client(stubFetch(403, { error: "role 'BusinessApprover' is required" }));
    await assert.rejects(
      () => c.get('/projects', ProjectList),
      (err: Error) => err instanceof ApiError && /BusinessApprover/.test(err.message),
    );
  });

  test('parses a source-content and a highlight response', async () => {
    const content = client(
      stubFetch(200, {
        source: { id: 'src-1', filename: 'brd.md', direction: 'rtl' },
        text: RTL,
        units: [{ id: 'su-1', ordinal: 0 }],
      }),
    );
    const parsed = await content.get('/x', SourceContent);
    assert.equal(parsed.source.direction, 'rtl');

    const highlights = client(
      stubFetch(200, {
        total: 1,
        ranges: [
          {
            sourceId: 'src-1',
            start: 0,
            end: 3,
            baseDirection: 'rtl',
            segments: [{ start: 0, end: 3, text: 'يجب', language: 'ar', direction: 'rtl', counterFlow: false }],
            resolution: 'resolved',
          },
        ],
      }),
    );
    const list = await highlights.get('/y', HighlightList);
    assert.equal(list.ranges[0]?.resolution, 'resolved');
  });
});

// ---------------------------------------------------------------------------
// U2 — sources: the four distinctions, DOM-free
// ---------------------------------------------------------------------------

describe('U2 authority ranking', () => {
  test('UNRANKED IS NOT RANK ZERO', () => {
    // The distinction the screen turns on. Rank 0 means nobody has decided;
    // rendering it as "lowest" makes an undecided judgement look decided — the
    // same class of error as content_unverified versus resolved.
    assert.equal(authorityOf({ id: 's', filename: 'a', authorityRank: 0 }).kind, 'unranked');
    assert.equal(authorityOf({ id: 's', filename: 'a' }).kind, 'unranked');
    const ranked = authorityOf({ id: 's', filename: 'a', authorityRank: 3 });
    assert.equal(ranked.kind, 'ranked');
    assert.match(ranked.label, /Rank 3/);
    assert.match(authorityOf({ id: 's', filename: 'a' }).label, /nobody has decided/);
  });

  test('rank 0 is NOT settable — it is a state, not a value a human picks', () => {
    assert.equal(isSettableRank(0), false);
    assert.equal(isSettableRank(1), true);
    assert.equal(isSettableRank(100), true);
    assert.equal(isSettableRank(101), false);
    assert.equal(isSettableRank(2.5), false);
    assert.equal(isSettableRank(-1), false);
  });

  test('inventory orders by authority descending, unranked LAST', () => {
    // ADR-0012: highest authority first is the order a reviewer resolving a
    // conflict needs. Unranked sorts last because it is undecided, not low.
    const ordered = inventoryOrder([
      { id: '1', filename: 'c.md' },
      { id: '2', filename: 'a.md', authorityRank: 5 },
      { id: '3', filename: 'b.md', authorityRank: 9 },
      { id: '4', filename: 'd.md', authorityRank: 0 },
    ]);
    assert.deepEqual(ordered.map((s) => s.filename), ['b.md', 'a.md', 'c.md', 'd.md']);
  });
});

describe('U2 parse state', () => {
  test('A PARSE FAILURE IS A STATE, not a disappearance — and keeps its reason', () => {
    const failed_ = parseStateOf({
      id: 's', filename: 'x.pdf', status: 'parse_failed', parseError: 'no readable document part',
    });
    assert.equal(failed_.tone, 'failed');
    assert.equal(failed_.detail, 'no readable document part');
  });

  test('a failure with no stated reason says so rather than inventing one', () => {
    const state = parseStateOf({ id: 's', filename: 'x', status: 'parse_failed' });
    assert.match(state.detail as string, /did not say why/);
  });

  test('the other states are distinct', () => {
    assert.equal(parseStateOf({ id: 's', filename: 'x', status: 'parsed' }).tone, 'ok');
    assert.equal(parseStateOf({ id: 's', filename: 'x', status: 'parsing' }).tone, 'pending');
    assert.equal(parseStateOf({ id: 's', filename: 'x', status: 'superseded' }).tone, 'superseded');
  });
});

describe('U2 upload', () => {
  test('A DUPLICATE IS REPORTED AS A DUPLICATE, never as an upload', () => {
    const dedup = outcomeOf({ source: { id: 'src-1' }, deduplicated: true });
    assert.equal(dedup.kind, 'deduplicated');
    const created = outcomeOf({ source: { id: 'src-2' }, unitCount: 7 });
    assert.equal(created.kind, 'created');
    assert.notEqual(dedup.kind, created.kind, 'the two outcomes must never collapse');
  });

  test('text and bytes are mutually exclusive, as the API requires', () => {
    assert.throws(() => ingestBody({ filename: 'a.md' }), /either text or bytes/);
    assert.throws(
      () => ingestBody({ filename: 'a.md', text: 'x', bytes: new Uint8Array([1]) }),
      /mutually exclusive/,
    );
  });

  test('base64 round-trips bytes exactly, including non-ASCII', () => {
    const bytes = new TextEncoder().encode('يجب تقديم الطلب — 🏛');
    const body = ingestBody({ filename: 'ar.md', bytes });
    const back = new Uint8Array(Buffer.from(body.contentBase64 as string, 'base64'));
    assert.deepEqual([...back], [...bytes]);
    assert.equal(new TextDecoder().decode(back), 'يجب تقديم الطلب — 🏛');
  });

  test('base64 handles a payload larger than one chunk', () => {
    const bytes = new Uint8Array(0x8000 * 2 + 17).map((_, i) => i % 251);
    const body = ingestBody({ filename: 'big.bin', bytes });
    const back = new Uint8Array(Buffer.from(body.contentBase64 as string, 'base64'));
    assert.equal(back.length, bytes.length);
    assert.deepEqual([...back.slice(-5)], [...bytes.slice(-5)]);
  });

  test('optional fields are omitted rather than sent empty', () => {
    const body = ingestBody({ filename: 'a.md', text: 'x', kind: '' });
    assert.equal('kind' in body, false);
    assert.equal('classification' in body, false);
  });
});

describe('U2 validation findings', () => {
  const findings = [
    { ruleId: 'L0-ING-003', severity: 'warning' },
    { ruleId: 'L0-ING-001', severity: 'error' },
    { ruleId: 'L0-ING-009', severity: 'info' },
    { ruleId: 'L0-ING-002', severity: 'error' },
  ];

  test('groups by severity with blocking first — the SERVER\'s severity', () => {
    const groups = groupBySeverity(findings);
    assert.deepEqual(groups.map((g) => g.severity), ['error', 'warning', 'info']);
    assert.equal(groups[0]?.findings.length, 2);
  });

  test('BLOCKING IS DECIDED BY SEVERITY, never by the UI', () => {
    assert.equal(blocksGate(findings), true);
    assert.equal(blocksGate([{ ruleId: 'L0-ING-009', severity: 'info' }]), false);
    assert.equal(blocksGate([{ ruleId: 'X', severity: 'blocking' }]), true);
    assert.equal(blocksGate([]), false);
  });

  test('an unknown rule is shown by id — no description is invented', () => {
    const catalogue = [{ id: 'L0-ING-001', description: 'A source must declare a classification' }];
    assert.equal(describeRule('L0-ING-001', catalogue), 'A source must declare a classification');
    assert.equal(describeRule('L0-ING-999', catalogue), undefined);
  });

  test('an unrecognised severity sorts last rather than being dropped', () => {
    const groups = groupBySeverity([{ ruleId: 'A', severity: 'mystery' }, { ruleId: 'B', severity: 'error' }]);
    assert.deepEqual(groups.map((g) => g.severity), ['error', 'mystery']);
  });
});

describe('U2 project label tolerance', () => {
  test('BOTH name shapes the API returns are accepted', () => {
    // Found by U2's browser tests: creating a project with a string `name`
    // stores `text` as a string, while an object name stores a record. U1
    // accepted only the record, so a project created the other way made the
    // entire list fail validation.
    const asRecord = ProjectSummary.parse({
      id: 'prj-1', key: 'alpha',
      name: { primary: { lang: 'en', text: { en: 'Alpha' }, direction: 'ltr' }, translations: [] },
    });
    const asString = ProjectSummary.parse({
      id: 'prj-2', key: 'beta',
      name: { primary: { lang: 'en', text: 'Beta', direction: 'ltr' }, translations: [] },
    });
    assert.equal(labelOf(asRecord).text, 'Alpha');
    assert.equal(labelOf(asString).text, 'Beta');
  });

  test('an Arabic label keeps its own direction', () => {
    const arabic = ProjectSummary.parse({
      id: 'prj-3', key: 'gamma',
      name: { primary: { lang: 'ar', text: 'تجديد الرخصة', direction: 'rtl' }, translations: [] },
    });
    assert.equal(labelOf(arabic).direction, 'rtl');
    assert.equal(labelOf(arabic).text, 'تجديد الرخصة');
  });

  test('a project with no name falls back to its key, never to blank', () => {
    const bare = ProjectSummary.parse({ id: 'prj-4', key: 'delta' });
    assert.equal(labelOf(bare).text, 'delta');
  });
});

// ---------------------------------------------------------------------------
// U3-b — evidence: citing a unit, and the inventory
// ---------------------------------------------------------------------------

/** A row shaped like the API's, with the fields U3-b renders. */
function evidenceRow(over: Partial<EvidenceRow> = {}): EvidenceRow {
  return {
    id: 'ev-1',
    sourceId: 'src-1',
    sourceUnitId: 'su-1',
    verbatimText: 'The applicant must submit the renewal request within ninety days.',
    language: 'en',
    classification: 'INTERNAL',
    extractedBy: 'parser',
    anchorVerified: true,
    anchor: { precision: 'exact', direction: 'ltr', target: { kind: 'text_range' } },
    createdBy: 'u-analyst',
    createdAt: '2026-08-26T00:00:00.000Z',
    ...over,
  };
}

describe('U3-b citing a unit', () => {
  test('THE BODY CARRIES NO CHARACTER RANGE — unit level only (Z3)', () => {
    // The rule the whole module exists for. `recordEvidence` accepts charStart
    // and charEnd; minting them from a bidirectional DOM selection is the class
    // of bug ADR-0039 §5 exists to prevent, so this UI never sends them.
    const body = citeUnitBody('src-1', 'su-7');

    assert.deepEqual(body, { sourceId: 'src-1', sourceUnitId: 'su-7' });
    assert.deepEqual(Object.keys(body).sort(), ['sourceId', 'sourceUnitId']);
    for (const forbidden of ['charStart', 'charEnd']) {
      assert.ok(!(forbidden in body), `the citation body must never carry ${forbidden}`);
    }
  });

  test('THE MODULE EXPORTS NO WAY to build a character-range citation', () => {
    // Structural, not editorial: absence is the enforcement. A future helper
    // called `citeRangeBody` would fail here before it could fail in review.
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      join(here, '..', 'src', 'features', 'evidence', 'evidence-model.ts'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''); // strip comments: prose names them

    for (const forbidden of ['charStart', 'charEnd']) {
      assert.ok(!source.includes(forbidden), `evidence-model.ts must not mention ${forbidden}`);
    }
  });

  test('a refusal QUOTES THE SERVER and never summarises it', () => {
    const reason =
      'refusing to store evidence with a broken anchor: the quote is no longer present';
    const phase = citeRefusal('su-1', new ApiError(500, { error: reason }, reason));

    assert.equal(phase.kind, 'refused');
    if (phase.kind !== 'refused') return;
    assert.equal(phase.reason, reason, 'the server\'s words must survive verbatim');
    assert.equal(phase.roleRefusal, false);
  });

  test('a 403 is a ROLE refusal, and 400/500 are not — the status vocabulary holds', () => {
    // CLAUDE.md §12: a caller who gets 403 goes looking for a permissions
    // problem. Collapsing these sends them to the wrong place.
    const forbidden = citeRefusal('su-1', new ApiError(403, { error: 'needs BusinessAnalyst' }, 'needs BusinessAnalyst'));
    assert.equal(forbidden.kind === 'refused' && forbidden.roleRefusal, true);

    for (const status of [400, 404, 409, 500, 503]) {
      const other = citeRefusal('su-1', new ApiError(status, { error: 'no' }, 'no'));
      assert.equal(other.kind === 'refused' && other.roleRefusal, false, `status ${status}`);
    }
  });

  test('a non-API failure still produces a refusal, not a blank', () => {
    const phase = citeRefusal('su-1', new TypeError('network down'));
    assert.equal(phase.kind, 'refused');
    if (phase.kind !== 'refused') return;
    assert.match(phase.reason, /network down/);
    assert.equal(phase.status, undefined, 'no status may be invented for a non-HTTP failure');
  });

  test('a unit with no text SAYS SO rather than rendering blank', () => {
    assert.match(unitOptionLabel({ id: 'su-1', ordinal: 3 }), /no text recorded/);
    assert.match(unitOptionLabel({ id: 'su-1', ordinal: 3, text: '   ' }), /no text recorded/);
    assert.match(unitOptionLabel({ id: 'su-1', text: 'x' }), /^su-1 · x$/);
    assert.match(unitOptionLabel({ id: 'su-1', ordinal: 2, text: 'Eligibility' }), /^2 · Eligibility$/);
  });

  test('a truncated quote is VISIBLY truncated, and counts code points', () => {
    // A silently cut quote reads as the whole quote, and evidence is verbatim.
    assert.equal(preview('short', 10), 'short');
    assert.equal(preview('abcdefghijkl', 5), 'abcde…');
    // Non-BMP: slicing UTF-16 units here would split a surrogate pair.
    assert.equal(preview('🏛🏛🏛🏛', 2), '🏛🏛…');
    assert.equal(preview('  spaced\n\ntext  ', 50), 'spaced text');
  });
});

describe('U3-b the evidence inventory', () => {
  test('ANCHOR VERIFICATION IS NOT A RESOLUTION STATUS (ADR-0038)', () => {
    // recordEvidence stores anchorVerified: true for everything it accepts, and
    // content_unverified IS accepted. Mapping that boolean to the `resolved`
    // badge would label a content-unverified anchor as resolved — the one
    // conflation ADR-0038 exists to prevent.
    const summary = anchorSummary(evidenceRow());
    assert.equal(summary.verified, true);
    assert.ok(!('resolution' in summary), 'the row carries no resolution status to report');
    assert.ok(!('resolved' in summary));
  });

  test('the inventory NEVER renders a verification badge from anchorVerified', () => {
    // Asserted over the component source, because this is a mistake that would
    // look completely correct in review.
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      join(here, '..', 'src', 'features', 'evidence', 'Evidence.tsx'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

    assert.ok(
      !source.includes('StateBadge'),
      'Evidence.tsx must not render a semantic verification badge from anchorVerified',
    );
    assert.ok(!source.includes("'resolved'"), 'the inventory may not claim an anchor resolved');
  });

  test('the anchor is reported in the SERVER\'s terms, each field its own', () => {
    const summary = anchorSummary(
      evidenceRow({ anchor: { precision: 'page', direction: 'rtl', target: { kind: 'pdf_region' } } }),
    );
    assert.equal(summary.precision, 'page');
    assert.equal(summary.target, 'pdf_region');
    assert.equal(summary.direction, 'rtl');
  });

  test('an unrecognised origin is NOT defaulted to something benign', () => {
    assert.match(originOf(evidenceRow({ extractedBy: 'parser' })).label, /Parser/);
    assert.match(originOf(evidenceRow({ extractedBy: 'ai' })).label, /AI/);
    const unknown = originOf(evidenceRow({ extractedBy: 'telepathy' }));
    assert.match(unknown.label, /Unrecognised/);
    assert.doesNotMatch(unknown.label, /Parser/);
  });

  test('grouping by source PRESERVES the API order, and invents none', () => {
    const rows = [
      evidenceRow({ id: 'ev-1', sourceId: 'src-b' }),
      evidenceRow({ id: 'ev-2', sourceId: 'src-a' }),
      evidenceRow({ id: 'ev-3', sourceId: 'src-b' }),
    ];
    const groups = bySource(rows);

    // Group order follows first appearance; within a group, the API's order.
    assert.deepEqual(groups.map((g) => g.sourceId), ['src-b', 'src-a']);
    assert.deepEqual(groups[0]?.rows.map((r) => r.id), ['ev-1', 'ev-3']);
    assert.deepEqual(groups[1]?.rows.map((r) => r.id), ['ev-2']);
    // Nothing is dropped.
    assert.equal(groups.reduce((n, g) => n + g.rows.length, 0), rows.length);
  });

  test('an empty list groups to nothing rather than throwing', () => {
    assert.deepEqual(bySource([]), []);
  });
});

describe('U3-b role drift, and Z2-B', () => {
  test('EVERY COMMAND A SCREEN GATES ON matches the API exactly', () => {
    // The API source is READ, not imported: @asdp/api is not importable from the
    // presentation layer (ADR-0039 §2), which is the same reason the U2 test
    // parses it this way.
    //
    // Scoped to what is CONSUMED, and the scope is stated rather than implied.
    // `listRequirements`, `frameCoverage` and `g1Readiness` sit in the map, are
    // gated on by no screen, and do NOT match the API. That is recorded in
    // dev-auth.ts and reported with U3-b; correcting them belongs to U3-c, the
    // slice that first consumes them. Widening this test to cover them would
    // have meant fixing them inside U3-b, which is not U3-b's scope.
    const here = dirname(fileURLToPath(import.meta.url));
    const commands = readFileSync(join(here, '..', '..', 'api', 'src', 'commands.ts'), 'utf8');
    const consumed = ['ingestSource', 'setSourceAuthorityRank', 'validateIntake', 'recordEvidence'];

    for (const name of consumed) {
      const line = commands.split('\n').find((l) => l.includes(`name: '${name}'`));
      assert.ok(line !== undefined, `the API has no command '${name}'`);
      const required = [...line.matchAll(/'([A-Za-z]+)'/g)]
        .map((m) => m[1] as string)
        .filter((r) => (ROLES as readonly string[]).includes(r));
      assert.ok(required.length > 0, `no roles parsed for ${name}`);
      assert.deepEqual(
        [...(COMMAND_ROLES[name] ?? [])].sort(),
        [...required].sort(),
        `${name}: the UI role map disagrees with the API`,
      );
    }
  });

  test('a Contributor may upload and may NOT cite evidence', () => {
    const contributor = { subject: 'u-c', roles: ['Contributor'] as const };
    assert.equal(mayInvoke(contributor, 'ingestSource'), true);
    assert.equal(mayInvoke(contributor, 'recordEvidence'), false);
    assert.equal(mayInvoke({ subject: 'u-a', roles: ['BusinessAnalyst'] as const }, 'recordEvidence'), true);
  });

  test('Z2-B — apps/web CONTAINS NO AI-INVOKING CONTROL', () => {
    // The structural guarantee behind Z2-B. Every AI port refuses by default
    // today, so a control here would be a live provider call the moment one is
    // wired — and H3 is unresolved. Asserted over every non-test module.
    const here = dirname(fileURLToPath(import.meta.url));
    const root = join(here, '..', 'src');
    const forbidden = ['populate-frame', 'extract-evidence', '/profile', 'reconcile'];

    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if ((entry.endsWith('.ts') || entry.endsWith('.tsx')) && !entry.endsWith('.test.ts')) {
          files.push(full);
        }
      }
    };
    walk(root);
    assert.ok(files.length > 0, 'no source files were scanned — the walk is broken');

    for (const file of files) {
      const source = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      for (const route of forbidden) {
        assert.ok(
          !source.includes(route),
          `${file} references '${route}': apps/web must hold no AI-invoking control (Z2-B)`,
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------
// U3-c — the read-only requirements workspace
// ---------------------------------------------------------------------------

function requirementRow(over: Partial<RequirementRow> = {}): RequirementRow {
  return {
    id: 'REQ-0001',
    requirementSetId: 'rqs-1',
    text: 'The applicant must submit the renewal request within ninety days.',
    originalAiText: 'The applicant must submit the renewal request within ninety days.',
    category: 'business_rule',
    rafSlot: 'rules.eligibility',
    epistemicLevel: 'L2',
    derivation: 'interpreted',
    computedConfidence: 0.62,
    confidenceBand: 'MEDIUM',
    confidenceFunctionVersion: 'conf-1.2',
    humanConfirmationRequired: true,
    version: 1,
    status: 'draft',
    generatedBy: 'ai',
    aiInteractionId: 'ai-1',
    promptVersion: 'frame@1',
    providerId: 'stub',
    modelId: 'stub-1',
    degradations: [],
    classification: 'INTERNAL',
    language: 'en',
    createdBy: 'u-analyst',
    createdAt: '2026-08-26T00:00:00.000Z',
    evidence: [{ evidenceItemId: 'ev-1', contribution: 'primary' }],
    ...over,
  };
}

describe('U3-c the two empty states', () => {
  test('NO PASS and AN EMPTY SET ARE DIFFERENT FACTS, and never collapse', () => {
    // The API distinguishes them: it omits requirementSetId when no pass has run,
    // and returns it with an empty list when a pass ran and proposed nothing.
    // "No requirements" for both would be the same class of error as rendering
    // `unranked` as rank 0.
    assert.deepEqual(setStateOf({ requirements: [] }), { kind: 'no_pass' });
    assert.deepEqual(setStateOf({ requirementSetId: 'rqs-1', requirements: [] }), {
      kind: 'empty_set',
      requirementSetId: 'rqs-1',
    });
  });

  test('a populated set reports its id and its count', () => {
    assert.deepEqual(setStateOf({ requirementSetId: 'rqs-1', requirements: [1, 2, 3] }), {
      kind: 'populated',
      requirementSetId: 'rqs-1',
      total: 3,
    });
  });
});

describe('U3-c confidence — Y21', () => {
  test('CONFIDENCE IS NEVER A BARE PERCENTAGE', () => {
    // "A bare 92% reads as 92% correct, which nothing in this repository has
    // ever measured." The band leads; the score never appears without the
    // version of the function that produced it.
    const c = confidenceOf(requirementRow({ computedConfidence: 0.925 }));
    assert.equal(c.band, 'MEDIUM');
    assert.equal(c.score, '0.93');
    assert.equal(c.functionVersion, 'conf-1.2');
    for (const value of Object.values(c)) {
      assert.doesNotMatch(String(value), /%/, 'a confidence value must never be rendered as a percentage');
    }
    assert.match(c.caution.toLowerCase(), /not a measure of accuracy/);
  });

  test('the module never emits a percent sign anywhere', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      join(here, '..', 'src', 'features', 'requirements', 'requirement-model.ts'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.ok(!source.includes("'%'"), 'no percent formatting may exist in the requirement model');
    assert.ok(!source.includes('* 100'), 'a confidence score must not be scaled to a percentage');
  });
});

describe('U3-c versions — bounded by G-e', () => {
  test('A PREDECESSOR IS NAMED, NEVER RETRIEVABLE (G-e is unfilled)', () => {
    const v = versionOf(requirementRow({ version: 2, supersedesId: 'REQ-0001@1', changeReason: 'clarified', generatedBy: 'human' }));
    assert.equal(v.version, 2);
    assert.equal(v.predecessor, 'REQ-0001@1');
    assert.equal(v.changeReason, 'clarified');
    // The type is the literal `false`: this is not a capability switched off,
    // it is one that does not exist.
    assert.equal(v.historyAvailable, false);
  });

  test('"edited" comes from the SERVER\'s facts, not from comparing strings', () => {
    // A revision that restored the original wording is still a revision. The two
    // signals can disagree, so they are reported separately.
    const restored = versionOf(requirementRow({ version: 2, generatedBy: 'human' }));
    assert.equal(restored.edited, true);
    assert.equal(restored.textDiffersFromAi, false);

    const untouched = versionOf(requirementRow());
    assert.equal(untouched.edited, false);
    assert.equal(untouched.predecessor, undefined);
  });

  test('originalAiText is reported as differing only when it does', () => {
    const edited = versionOf(requirementRow({ text: 'Reworded.', version: 2, generatedBy: 'human' }));
    assert.equal(edited.textDiffersFromAi, true);
  });
});

describe('U3-c derivation and provenance', () => {
  test('AN INFERRED REQUIREMENT WITH NO RATIONALE IS A DEFECT, not a blank', () => {
    // Invariant D2 requires one and addInferredRequirement refuses without it,
    // so a row missing it means something wrote past the guard. An empty field
    // would turn a broken invariant into a cosmetic gap.
    const bad = derivationOf(requirementRow({ derivation: 'inferred' }));
    assert.match(bad.defect ?? '', /D2/);
    assert.equal(bad.rationale, undefined);

    const blank = derivationOf(requirementRow({ derivation: 'inferred', inferenceRationale: '   ' }));
    assert.ok(blank.defect !== undefined, 'whitespace is not a rationale');

    const good = derivationOf(requirementRow({ derivation: 'inferred', inferenceRationale: 'The SOP implies it.' }));
    assert.equal(good.rationale, 'The SOP implies it.');
    assert.equal(good.defect, undefined);
  });

  test('a non-inferred requirement is not asked for a rationale', () => {
    const d = derivationOf(requirementRow({ derivation: 'extracted' }));
    assert.equal(d.defect, undefined);
    assert.equal(d.rationale, undefined);
  });

  test('NO DEGRADATIONS means "none RECORDED", which is a different claim', () => {
    assert.match(degradationsOf(requirementRow()).summary, /none recorded/i);
    const some = degradationsOf(requirementRow({ degradations: ['no_provider_configured'] }));
    assert.deepEqual(some.items, ['no_provider_configured']);
  });

  test('a human-authored requirement reports AI provenance as absent, not blank', () => {
    const human = provenanceOf(requirementRow({ generatedBy: 'human', aiInteractionId: 'ai-1', modelId: 'm' }));
    const interaction = human.find((e) => e.label === 'AI interaction');
    assert.equal(interaction?.value, undefined, 'a human author has no AI interaction to report');
    const authored = human.find((e) => e.label === 'Authored by');
    assert.equal(authored?.value, 'human');
  });

  test('an AI-authored requirement carries its full provenance', () => {
    const ai = provenanceOf(requirementRow({ framePass: 'pass-2' }));
    assert.equal(ai.find((e) => e.label === 'Provider')?.value, 'stub');
    assert.equal(ai.find((e) => e.label === 'Model')?.value, 'stub-1');
    assert.equal(ai.find((e) => e.label === 'Frame pass')?.value, 'pass-2');
  });
});

describe('U3-c evidence chips', () => {
  test('AN UNRESOLVED CITATION IS SHOWN, never dropped', () => {
    // A citation the workspace cannot follow is exactly what a reviewer needs to
    // be told about (ADR-0008). Silently shortening the list would make a broken
    // traceability edge invisible.
    const chips = chipsFor(
      requirementRow({ evidence: [{ evidenceItemId: 'ev-1', contribution: 'primary' }, { evidenceItemId: 'ev-gone' }] }),
      (id) => (id === 'ev-1' ? 'src-1' : undefined),
    );
    assert.equal(chips.length, 2, 'no chip may be dropped');
    assert.equal(chips[0]?.followable, true);
    assert.equal(chips[0]?.sourceId, 'src-1');
    assert.equal(chips[1]?.followable, false);
    assert.equal(chips[1]?.sourceId, undefined);
  });

  test('a contribution the API did not state is NOT assumed to be "supporting"', () => {
    const chips = chipsFor(requirementRow({ evidence: [{ evidenceItemId: 'ev-1' }] }), () => 'src-1');
    assert.equal(chips[0]?.contribution, 'not stated');
  });
});

describe('U3-c ordering and read-only scope', () => {
  test('THE CLIENT DOES NOT SORT — the API\'s order is rendered unchanged', () => {
    // The repository read is `order by id asc` on a TEXT column, so REQ-10000
    // sorts before REQ-9999 past the ten-thousandth requirement — the same class
    // as limitations 80/81. Sorting correctly here would be a business rule in
    // the browser AND would hide a recorded defect behind a client-side patch.
    const here = dirname(fileURLToPath(import.meta.url));
    for (const file of ['requirement-model.ts', 'Requirements.tsx']) {
      const source = readFileSync(
        join(here, '..', 'src', 'features', 'requirements', file),
        'utf8',
      ).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      assert.ok(!source.includes('.sort('), `${file} must not re-order what the API returned`);
      assert.ok(!source.includes('localeCompare'), `${file} must not re-order what the API returned`);
    }
  });

  test('U3-c IS READ-ONLY: no write route is named anywhere in the feature', () => {
    // Accept, reject, defer, revise and confirm are U3-d/U3-e. Absence is the
    // enforcement, and a helper that anticipated one would fail here.
    const here = dirname(fileURLToPath(import.meta.url));
    const forbidden = ['/review', '/revise', '/confirm-inference', 'requirements/inferred', 'requirement-flags'];
    for (const file of ['requirement-model.ts', 'Requirements.tsx', 'RequirementInspector.tsx']) {
      const source = readFileSync(
        join(here, '..', 'src', 'features', 'requirements', file),
        'utf8',
      ).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      for (const route of forbidden) {
        assert.ok(!source.includes(route), `${file} names ${route}: U3-c is read-only`);
      }
    }
  });

  test('NO BULK SELECTION MODEL EXISTS to extend', () => {
    // Limitation 70's only structural mitigation. A checkbox column or a
    // select-all would fail here before it could fail review.
    const here = dirname(fileURLToPath(import.meta.url));
    // Comments are stripped: the file's own prose explains why there is no
    // checkbox column, and prose naming a thing is not the thing.
    const source = readFileSync(
      join(here, '..', 'src', 'features', 'requirements', 'Requirements.tsx'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    for (const f of ['selectAll', 'checkbox', 'selectedIds', 'toggleAll', 'multiSelect']) {
      assert.ok(!source.includes(f), `Requirements.tsx contains '${f}': no bulk model may exist`);
    }
  });
});

describe('U3-c role map, corrected', () => {
  test('listRequirements NOW MATCHES the API exactly (the U3-b finding, closed)', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const commands = readFileSync(join(here, '..', '..', 'api', 'src', 'commands.ts'), 'utf8');
    const line = commands.split('\n').find((l) => l.includes("name: 'listRequirements'"));
    assert.ok(line !== undefined);
    const required = [...line.matchAll(/'([A-Za-z]+)'/g)]
      .map((m) => m[1] as string)
      .filter((r) => (ROLES as readonly string[]).includes(r));
    assert.deepEqual([...(COMMAND_ROLES['listRequirements'] ?? [])].sort(), [...required].sort());
    // The specific consequence the old map had: these three were refused by the
    // UI and permitted by the API.
    for (const role of ['Contributor', 'ComplianceReviewer', 'PlatformAdmin']) {
      assert.ok(mayInvoke({ subject: 'u', roles: [role] as never }, 'listRequirements'), role);
    }
  });
});

// ---------------------------------------------------------------------------
// U3-c amendment — findings from the visual review
// ---------------------------------------------------------------------------

describe('U3-c amendment: derivation AND evidence, together', () => {
  test('AN INFERRED REQUIREMENT WITH NO EVIDENCE IS VALID, not a D2 violation', () => {
    // The defect this closes: the inspector reported an inferred L3 with no
    // citations as "invariant D2 requires at least one, so this row should not
    // exist" — telling a reviewer a perfectly legal row was broken.
    //
    // `addInferredRequirement` stores NO links on purpose: "deliberately NOT
    // insertProposal: that requires evidence links, and an inferred requirement
    // has a rationale instead." D2 is satisfied by the mandatory rationale.
    const inferred = requirementRow({ derivation: 'inferred', epistemicLevel: 'L3', evidence: [] });
    const expectation = evidenceExpectationOf(inferred, 0);

    assert.equal(expectation.kind, 'rationale_instead');
    assert.ok(!('detail' in expectation), 'a valid state must carry no defect text');
  });

  test('ANY OTHER derivation with no evidence IS still a defect', () => {
    // The other half. Closing the false positive must not close the true one:
    // insertProposal refuses an unevidenced proposal at the repository boundary,
    // so one arriving here means something wrote past the guard.
    for (const derivation of ['extracted', 'interpreted']) {
      const row = requirementRow({ derivation, evidence: [] });
      const expectation = evidenceExpectationOf(row, 0);
      assert.equal(expectation.kind, 'defect', `${derivation} with no evidence must still be a defect`);
      assert.match(expectation.kind === 'defect' ? expectation.detail : '', /D2/);
    }
  });

  test('evidence present is "cited", whatever the derivation', () => {
    for (const derivation of ['extracted', 'interpreted', 'inferred']) {
      assert.equal(evidenceExpectationOf(requirementRow({ derivation }), 1).kind, 'cited', derivation);
    }
  });

  test('THE COMBINATION IS THE TEST — neither field alone decides it', () => {
    // Why this test exists at all. `derivationOf` and `chipsFor` were each
    // covered, and the bug lived in their combination, which nothing asserted.
    // A 2x2 over (derivation, citedCount), so the pairing cannot silently regress.
    const cases = [
      { derivation: 'inferred', cited: 0, expected: 'rationale_instead' },
      { derivation: 'inferred', cited: 1, expected: 'cited' },
      { derivation: 'interpreted', cited: 0, expected: 'defect' },
      { derivation: 'interpreted', cited: 1, expected: 'cited' },
    ];
    for (const c of cases) {
      assert.equal(
        evidenceExpectationOf(requirementRow({ derivation: c.derivation }), c.cited).kind,
        c.expected,
        `${c.derivation} with ${c.cited} citation(s)`,
      );
    }
  });

  test('the inspector renders the valid case WITHOUT defect wording', () => {
    // Asserted over the component, because the defect was in what it rendered.
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      join(here, '..', 'src', 'features', 'requirements', 'RequirementInspector.tsx'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

    // The defect message must reach the screen only through the model's
    // `defect` branch, never as a literal for any empty-evidence row.
    assert.ok(
      !source.includes('cites NO evidence'),
      'the inspector must not hard-code a missing-evidence defect message',
    );
    assert.ok(source.includes('evidenceExpectationOf'), 'it must ask the model which case this is');
  });
});

describe('U3-c amendment: a requirement never outlives its project', () => {
  test('CHANGING PROJECT CLEARS THE SELECTED REQUIREMENT', () => {
    // The defect this closes: after "Change project" the inspector still showed
    // a requirement from the project just left, beside the project list.
    // A requirement is scoped to a project by construction — its identity is
    // (projectId, id) since H4 — so it must not survive the selection changing.
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, '..', 'src', 'app', 'App.tsx'), 'utf8');

    const leave = /const leaveProject = \(\): void => \{([\s\S]*?)\};/.exec(source);
    assert.ok(leave !== null, 'App.tsx must have a single place that leaves a project');
    const body = leave[1] as string;
    assert.match(body, /setProject\(undefined\)/, 'it must clear the project');
    assert.match(body, /setRequirement\(undefined\)/, 'it must clear the selected requirement');
    assert.match(body, /closeDocument\(\)/, 'it must close any open document');

    // And the control actually uses it, rather than clearing the project inline.
    assert.match(source, /onClick=\{leaveProject\}/, 'the Change project control must call it');
    assert.ok(
      !/setProject\(undefined\);\s*\n\s*closeDocument\(\);/.test(source),
      'no path may clear the project without also clearing the requirement',
    );
  });

  test('leaving the requirements workspace also clears the selection', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, '..', 'src', 'app', 'App.tsx'), 'utf8');
    assert.match(
      source,
      /if \(id !== 'requirements'\) setRequirement\(undefined\);/,
      'navigating away from the workspace must drop the selection',
    );
  });
});

describe('U3-c amendment: the evidence page is not titled by its id', () => {
  test('THE HEADING IS THE DOCUMENT; the evidence id is secondary', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, '..', 'src', 'source-viewer', 'DocumentView.tsx'), 'utf8');

    // The heading prefers the document's own filename, which `GET …/content`
    // already returns — no new API surface for a presentation change.
    assert.match(source, /narrow\(state\.value\)\.filename/, 'the heading must use the loaded filename');
    // The id is kept for traceability, in the sub-line rather than the h1.
    assert.match(source, /data-testid="document-evidence-id"/, 'the evidence id must remain on the page');
    assert.ok(
      !/<h1[^>]*>\{`Evidence /.test(source),
      'a raw evidence id must not be the page heading',
    );
  });

  test('App no longer names the page after the evidence id', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, '..', 'src', 'app', 'App.tsx'), 'utf8');
    assert.ok(
      !source.includes('`Evidence ${evidenceItemId}`'),
      'the evidence id must not be passed as the document name',
    );
  });
});

describe('U3-c amendment: Y21 and the confidence column', () => {
  test('THE LIST KEEPS THE BAND, and never emits a percentage', () => {
    // Y21: "Confidence is a computed band with its inputs inspectable, never a
    // bare percentage." The band is required in the list; the inputs must be
    // INSPECTABLE, which the inspector provides in full.
    const here = dirname(fileURLToPath(import.meta.url));
    const list = readFileSync(
      join(here, '..', 'src', 'features', 'requirements', 'Requirements.tsx'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

    assert.match(list, /c\.band/, 'the list must show the band');
    assert.ok(!list.includes("'%'") && !list.includes('* 100'), 'never a percentage');
    // The function version is not lost: it is one hover away and in the inspector.
    assert.match(list, /c\.functionVersion/, 'the function version must remain reachable from the list');
  });

  test('THE INSPECTOR STILL CARRIES THE COMPLETE confidence information', () => {
    // The approved U3 boundary requires band, computed value, function version
    // and degradations on the detail. Moving detail out of the list must not
    // move it out of the product.
    const here = dirname(fileURLToPath(import.meta.url));
    const inspector = readFileSync(
      join(here, '..', 'src', 'features', 'requirements', 'RequirementInspector.tsx'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

    for (const required of ['confidence.band', 'confidence.score', 'confidence.functionVersion', 'req-degradations']) {
      assert.ok(inspector.includes(required), `the inspector must still render ${required}`);
    }
  });
});
