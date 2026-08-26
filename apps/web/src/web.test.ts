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
import { GateList, InferenceConfirmed, ReviewedRequirement } from './api/contracts.ts';
import {
  REVIEW_ACTIONS,
  confirmInferenceOffered,
  g1StatusOf,
  isSending,
  mayDecide,
  observeG1,
  outcomeWording,
  refusalAdvice,
  resultingStatus,
  reviewRefusal,
  type ReviewPhase,
} from './features/requirements/review-model.ts';
import {
  setStateOf,
  evidenceExpectationOf,
  confidenceOf,
  confirmationOf,
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

  /**
   * **NARROWED AT U3-d — an intentional scope transition, not a weakened test.**
   *
   * This assertion forbade `/review` and `/confirm-inference` as well, and it was
   * **correct when written**: U3-c was read-only, and a helper anticipating a
   * decision would rightly have failed here. **U3-d built both routes under the
   * approved boundary** (Z4, §12), so the assertion became false about the code
   * rather than the code becoming wrong.
   *
   * The rule it enforces is unchanged — *the feature names no route it has not
   * built* — and only membership moved. Everything still unauthorised is still
   * forbidden, and by more files than before: `/revise`, `requirements/inferred`
   * and `requirement-flags` are asserted absent across four files in
   * *"NO REVISION AND NO HUMAN-INFERRED AUTHORING ANYWHERE"*, which also covers
   * the new `review-model.ts`.
   *
   * The two routes U3-d added are not simply dropped from scrutiny: they are
   * asserted **present and correct** against the API's own allow-list, and the
   * list screen is asserted to name neither (**Z6-a**).
   *
   * Recorded here rather than in a commit message because the next person to
   * read this test needs to know it was narrowed on purpose.
   */
  test('U3-c READ-ONLY SCOPE, narrowed at U3-d: no UNAUTHORISED write route in the feature', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const forbidden = ['/revise', 'requirements/inferred', 'requirement-flags'];
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

  /**
   * **Assertion corrected at U3-d, and the previous one was wrong to pin a
   * setter name.**
   *
   * It required the literal `setRequirement(undefined)` in the navigate handler.
   * U3-d routes the same clearing through `selectRequirement(undefined)`, which
   * drops the selection **and** the review outcome that belonged to it — so the
   * old assertion failed while the behaviour it protects got strictly stronger.
   *
   * A test that names the setter tests the code's spelling. This one tests the
   * property: navigating away drops the selection, and whatever does it also
   * drops the outcome.
   */
  test('leaving the requirements workspace also clears the selection', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, '..', 'src', 'app', 'App.tsx'), 'utf8');
    assert.match(
      source,
      /if \(id !== 'requirements'\) (setRequirement|selectRequirement)\(undefined\);/,
      'navigating away from the workspace must drop the selection',
    );
    // And whichever path does it must also drop the decision outcome, or a
    // refusal recorded against a requirement outlives the requirement.
    const select = /function selectRequirement\([\s\S]*?\n {2}\}/.exec(source);
    assert.ok(select !== null, 'selectRequirement must exist to carry both halves');
    assert.match(select[0] as string, /setRequirement\(row\)/);
    assert.match(select[0] as string, /clearReview\(\)/);
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

// ---------------------------------------------------------------------------
// U3-d — the review actions
// ---------------------------------------------------------------------------

describe('U3-d the review action vocabulary', () => {
  test('THE FOUR ACTIONS ARE EXACTLY THE FOUR THE API ACCEPTS', () => {
    // Parsed from the controller rather than restated, so an action added or
    // removed there fails here. @asdp/api is not importable from the
    // presentation layer (ADR-0039 §2), which is why this reads the source.
    const here = dirname(fileURLToPath(import.meta.url));
    const controller = readFileSync(
      join(here, '..', '..', 'api', 'src', 'http', 'review.controller.ts'),
      'utf8',
    );
    const list = /\['accept',([\s\S]*?)\]\.includes\(action\)/.exec(controller);
    assert.ok(list !== null, 'could not find the review action allow-list in the controller');
    const api = ['accept', ...[...(list[1] as string).matchAll(/'([a-z_]+)'/g)].map((m) => m[1] as string)].sort();
    const ui = REVIEW_ACTIONS.map((a) => a.action).sort();
    assert.deepEqual(ui, api, 'the UI action list and the API allow-list must be equal');
  });

  test('ACCEPT MAPS TO in_review — never approved', () => {
    assert.equal(resultingStatus('accept'), 'in_review');
    for (const spec of REVIEW_ACTIONS) {
      assert.notEqual(spec.resulting, 'approved', `${spec.action} must not produce 'approved'`);
    }
  });

  test('the other three mappings match the command layer', () => {
    assert.equal(resultingStatus('reject'), 'rejected');
    assert.equal(resultingStatus('defer'), 'deferred');
    assert.equal(resultingStatus('send_for_clarification'), 'needs_clarification');
  });

  test('NO ACTION IS LABELLED WITH THE WORD APPROVE, in any form', () => {
    for (const spec of REVIEW_ACTIONS) {
      assert.doesNotMatch(spec.label, /approv/i, `${spec.action} is labelled '${spec.label}'`);
    }
  });

  test("accept's OWN DESCRIPTION says it does not approve", () => {
    // The sentence that carries the distinction to the reviewer. If this ever
    // reads "approves this requirement" the slice is lying about the ladder.
    const accept = REVIEW_ACTIONS.find((a) => a.action === 'accept');
    assert.match(accept?.means ?? '', /ready to be approved/);
    assert.match(accept?.means ?? '', /does not approve it/i);
  });

  test('an unknown action THROWS rather than defaulting to a status', () => {
    // A silent fallback would invent a status the server never returned.
    assert.throws(() => resultingStatus('approve' as never), /no such review action/);
  });
});

describe('U3-d outcome wording', () => {
  test('in_review SAYS READY TO BE APPROVED and NEVER says it is approved', () => {
    const words = outcomeWording('in_review');
    assert.match(words, /ready to be approved/);
    assert.doesNotMatch(words, /\bis approved\b/);
    assert.match(words, /Approval is G1/);
  });

  test('every other status has its own words, and none claims an approval', () => {
    for (const status of ['rejected', 'deferred', 'needs_clarification', 'draft', 'superseded']) {
      const words = outcomeWording(status);
      assert.ok(words.length > 0, `${status} has no wording`);
      assert.doesNotMatch(words, /ready to be approved/, `${status} must not borrow accept's words`);
    }
  });

  test('an UNRECOGNISED status is reported, not swallowed', () => {
    // U3-a's principle: an unknown value says it is unknown rather than getting
    // a benign default.
    assert.match(outcomeWording('teleported'), /teleported/);
  });

  test('even `approved` is not claimed as this screen\'s doing', () => {
    // Unreachable from here. If the server ever returned it, the wording must
    // still not imply this control performed it.
    assert.match(outcomeWording('approved'), /which this screen cannot do, and did not do/);
  });
});

describe('U3-d Z6-a — a decision needs the requirement detail context', () => {
  test('mayDecide IS FALSE WITHOUT A REQUIREMENT', () => {
    assert.equal(mayDecide(undefined), false);
    assert.equal(mayDecide(requirementRow()), true);
  });

  test('THE LIST NAMES NO REVIEW ROUTE AND NO REVIEW HANDLER', () => {
    // Z6-a's structural half: no decision from a list row alone. The controls
    // live in the inspector; the list gains nothing at all.
    const here = dirname(fileURLToPath(import.meta.url));
    const list = readFileSync(
      join(here, '..', 'src', 'features', 'requirements', 'Requirements.tsx'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    for (const forbidden of ['/review', '/confirm-inference', 'onReview', 'onConfirmInference', 'ReviewSurface']) {
      assert.ok(!list.includes(forbidden), `Requirements.tsx names ${forbidden}: no decision from a row`);
    }
  });

  test('THE REVIEW SURFACE TAKES ONE REQUIREMENT AND ONE ACTION — no array anywhere', () => {
    // The shape limitation 70's mitigation depends on. A bulk path would need a
    // signature to live in, and there must be none.
    const here = dirname(fileURLToPath(import.meta.url));
    const inspector = readFileSync(
      join(here, '..', 'src', 'features', 'requirements', 'RequirementInspector.tsx'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    const surface = /export interface ReviewSurface \{([\s\S]*?)\n\}/.exec(inspector);
    assert.ok(surface !== null, 'could not find the ReviewSurface interface');
    const body = surface[1] as string;
    assert.ok(!body.includes('[]'), 'ReviewSurface must take no array');
    assert.ok(!body.includes('readonly ids'), 'ReviewSurface must take no id list');
    assert.match(body, /onReview: \(action: ReviewAction\) => void/, 'one action, no list');
  });
});

describe('U3-d confirm-inference is offered by RELEVANCE, not by permission', () => {
  test('offered ONLY for an inferred requirement', () => {
    assert.equal(confirmInferenceOffered(requirementRow({ derivation: 'inferred' })), true);
    for (const derivation of ['extracted', 'interpreted']) {
      assert.equal(
        confirmInferenceOffered(requirementRow({ derivation })),
        false,
        `${derivation} has no inference to confirm`,
      );
    }
  });

  test('a NON-INFERRED requirement gets NO CONTROL AT ALL, not a disabled one', () => {
    // The API's refusal for that case is "there is nothing to confirm" — about
    // relevance, not permission. A permanently disabled control on every other
    // row would imply a capability that does not apply.
    const here = dirname(fileURLToPath(import.meta.url));
    const inspector = readFileSync(
      join(here, '..', 'src', 'features', 'requirements', 'RequirementInspector.tsx'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    // The block is rendered behind the relevance predicate, not behind a role.
    assert.match(
      inspector,
      /confirmInferenceOffered\(row\) \? \(/,
      'the confirm block must be gated on relevance',
    );
  });
});

describe('U3-d the phase machine', () => {
  test('idle → sending → applied, carrying the requirement it concerns', () => {
    const sending: ReviewPhase = { kind: 'sending', requirementId: 'REQ-0001', action: 'accept' };
    assert.equal(isSending(sending), true);
    assert.equal(isSending({ kind: 'idle' }), false);
    assert.equal(isSending({
      kind: 'applied', requirementId: 'REQ-0001', action: 'accept',
      status: 'in_review', message: 'x',
    }), false);
  });

  test('EVERY NON-IDLE PHASE NAMES ITS REQUIREMENT', () => {
    // Without it, changing selection mid-request shows one requirement's
    // refusal under another's heading.
    const phases: ReviewPhase[] = [
      { kind: 'sending', requirementId: 'REQ-1', action: 'accept' },
      { kind: 'applied', requirementId: 'REQ-2', action: 'reject', status: 'rejected', message: 'm' },
      reviewRefusal('REQ-3', 'defer', new ApiError(400, {}, 'no')),
    ];
    assert.deepEqual(phases.map((p) => (p.kind === 'idle' ? undefined : p.requirementId)), ['REQ-1', 'REQ-2', 'REQ-3']);
  });

  test('a REFUSAL QUOTES THE SERVER and is not a crash', () => {
    const phase = reviewRefusal(
      'REQ-0001',
      'accept',
      new ApiError(400, { error: 'x' }, 'requirement REQ-0001 is approved; changing an approved requirement means revising it'),
    );
    assert.equal(phase.kind, 'refused');
    if (phase.kind !== 'refused') return;
    assert.match(phase.reason, /is approved; changing an approved requirement means revising it/);
    assert.equal(phase.status, 400);
    assert.equal(phase.roleRefusal, false);
    assert.equal(phase.staleRead, false);
  });

  test('THE STATUS VOCABULARY IS PRESERVED — 403 and 409 are not the same refusal', () => {
    // CLAUDE.md §12. A 403 sends the reader to their permissions; a 409 sends
    // them back to re-read the requirement.
    const forbidden = reviewRefusal('REQ-1', 'accept', new ApiError(403, {}, 'role'));
    const conflict = reviewRefusal('REQ-1', 'accept', new ApiError(409, {}, 'changed'));
    assert.equal(forbidden.kind === 'refused' && forbidden.roleRefusal, true);
    assert.equal(forbidden.kind === 'refused' && forbidden.staleRead, false);
    assert.equal(conflict.kind === 'refused' && conflict.staleRead, true);
    assert.equal(conflict.kind === 'refused' && conflict.roleRefusal, false);
  });

  test('a NON-API failure is still a refusal, and still not invented', () => {
    const phase = reviewRefusal('REQ-1', 'accept', new Error('socket closed'));
    assert.equal(phase.kind === 'refused' && phase.reason, 'socket closed');
    const nothing = reviewRefusal('REQ-1', 'accept', 'not an error');
    assert.match(nothing.kind === 'refused' ? nothing.reason : '', /no reason was given/);
  });

  test('refusalAdvice sends the reader to the RIGHT PLACE for each status', () => {
    const advice = (status: number): string =>
      refusalAdvice(reviewRefusal('R', 'accept', new ApiError(status, {}, 'm')) as never);
    assert.match(advice(403), /BusinessAnalyst or ProcessArchitect/);
    assert.match(advice(409), /Reload and read it again/);
    assert.match(advice(404), /removed, or the project may have changed/);
    // The H6 / limitation 79 caveat: a 503 may be a flattened domain error. The
    // client reports what it was told and does not diagnose which.
    assert.match(advice(503), /could not complete the write/);
    assert.match(advice(400), /Nothing was recorded/);
  });
});

describe('U3-d the G1 reopen surface', () => {
  test('CAUSATION IS CLAIMED ONLY FOR approved → reopened ACROSS THIS ACTION', () => {
    const o = observeG1('approved', 'reopened');
    assert.equal(o.causedByThisAction, true);
    assert.equal(o.reopened, true);
    assert.match(o.message ?? '', /Your decision reopened G1/);
  });

  test('AN ALREADY-REOPENED GATE IS REPORTED AS STATE, with NO causal claim', () => {
    // The distinction the approved decision turns on. A gate reopened before the
    // reviewer arrived was not reopened by them.
    for (const before of ['reopened', 'not_ready', 'ready', 'rejected', undefined] as const) {
      const o = observeG1(before, 'reopened');
      assert.equal(o.reopened, true, `before=${String(before)}`);
      assert.equal(o.causedByThisAction, false, `before=${String(before)} must not claim causation`);
      assert.doesNotMatch(o.message ?? '', /Your decision/, `before=${String(before)}`);
      assert.match(o.message ?? '', /already the case/);
    }
  });

  test('NOTHING IS SAID when G1 did not reopen', () => {
    for (const after of ['not_ready', 'ready', 'approved', 'rejected', undefined] as const) {
      const o = observeG1('approved', after);
      assert.equal(o.reopened, false, `after=${String(after)}`);
      assert.equal(o.message, undefined, `after=${String(after)} must say nothing`);
    }
  });

  test('AN UNKNOWN BEFORE CANNOT PRODUCE A CAUSAL CLAIM', () => {
    // `readG1` degrades to undefined when the gate list cannot be read, and the
    // safe consequence is that causation becomes unclaimable rather than guessed.
    assert.equal(observeG1(undefined, 'reopened').causedByThisAction, false);
  });

  test('g1StatusOf picks G1 out of the gate list, and tolerates its absence', () => {
    assert.equal(g1StatusOf([{ code: 'G0', status: 'approved' }, { code: 'G1', status: 'reopened' }]), 'reopened');
    assert.equal(g1StatusOf([{ code: 'G0', status: 'approved' }]), undefined);
    assert.equal(g1StatusOf(undefined), undefined);
    assert.equal(g1StatusOf([]), undefined);
  });
});

describe('U3-d role map drift, now that both commands are CONSUMED', () => {
  test('reviewRequirement AND confirmInference MATCH THE API EXACTLY', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const commands = readFileSync(join(here, '..', '..', 'api', 'src', 'commands.ts'), 'utf8');
    for (const name of ['reviewRequirement', 'confirmInference']) {
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

  test('a Viewer may READ requirements and may NOT decide on one', () => {
    const viewer = { subject: 'u-v', roles: ['Viewer'] as const };
    assert.equal(mayInvoke(viewer, 'listRequirements'), true);
    assert.equal(mayInvoke(viewer, 'reviewRequirement'), false);
    assert.equal(mayInvoke(viewer, 'confirmInference'), false);
  });

  test('a ComplianceReviewer may read and may NOT decide — the API says so', () => {
    // Worth asserting explicitly: the name suggests otherwise, and the API's
    // reviewRequirement grants only BusinessAnalyst and ProcessArchitect.
    const cr = { subject: 'u-c', roles: ['ComplianceReviewer'] as const };
    assert.equal(mayInvoke(cr, 'listRequirements'), true);
    assert.equal(mayInvoke(cr, 'reviewRequirement'), false);
  });

  test('an analyst and an architect may BOTH decide', () => {
    for (const role of ['BusinessAnalyst', 'ProcessArchitect'] as const) {
      assert.equal(mayInvoke({ subject: 'u', roles: [role] }, 'reviewRequirement'), true, role);
      assert.equal(mayInvoke({ subject: 'u', roles: [role] }, 'confirmInference'), true, role);
    }
  });
});

describe('U3-d integration — the typed client against recorded fixtures', () => {
  const client = (impl: typeof fetch) =>
    createClient({ baseUrl: 'http://localhost:3000', headers: () => ({}), fetchImpl: impl });

  const reviewed = {
    id: 'REQ-0001',
    requirementSetId: 'rqs-1',
    projectId: 'prj-1',
    text: 'The applicant must submit within ninety days.',
    originalAiText: 'The applicant must submit within ninety days.',
    category: 'business_rule',
    rafSlot: 'rules.eligibility',
    epistemicLevel: 'L2',
    derivation: 'interpreted',
    computedConfidence: 0.62,
    confidenceBand: 'MEDIUM',
    confidenceFunctionVersion: 'conf-1.2',
    humanConfirmationRequired: true,
    status: 'in_review',
    version: 1,
    generatedBy: 'ai',
    degradations: [],
    classification: 'INTERNAL',
    language: 'en',
    createdBy: 'u-analyst',
    createdAt: '2026-08-26T00:00:00.000Z',
  };

  test('a review returns the UPDATED REQUIREMENT, validated against the server schema', async () => {
    const c = client(stubFetch(200, reviewed));
    const r = await c.post('/projects/prj-1/requirements/REQ-0001/review', { action: 'accept' }, ReviewedRequirement);
    assert.equal(r.status, 'in_review');
    assert.equal(outcomeWording(r.status), outcomeWording('in_review'));
  });

  test('A RESPONSE CLAIMING approved IS STILL PARSED — and still not claimed as ours', async () => {
    // The schema permits it, because the server's enum does. What must never
    // happen is this client SAYING it approved something.
    const c = client(stubFetch(200, { ...reviewed, status: 'approved' }));
    const r = await c.post('/projects/prj-1/requirements/REQ-0001/review', { action: 'accept' }, ReviewedRequirement);
    assert.doesNotMatch(outcomeWording(r.status), /ready to be approved/);
    assert.match(outcomeWording(r.status), /cannot do, and did not do/);
  });

  test('A CONTRACT DRIFT ON A DECISION IS LOUD', async () => {
    const c = client(stubFetch(200, { id: 'REQ-0001' }));
    await assert.rejects(
      () => c.post('/projects/prj-1/requirements/REQ-0001/review', { action: 'accept' }, ReviewedRequirement),
      ContractError,
    );
  });

  test('a 403 from a Viewer becomes a ROLE refusal', async () => {
    const c = client(stubFetch(403, { error: 'reviewRequirement requires one of: BusinessAnalyst, ProcessArchitect' }));
    try {
      await c.post('/projects/prj-1/requirements/REQ-0001/review', { action: 'accept' }, ReviewedRequirement);
      assert.fail('should have thrown');
    } catch (error) {
      const phase = reviewRefusal('REQ-0001', 'accept', error);
      assert.equal(phase.kind === 'refused' && phase.roleRefusal, true);
      assert.match(phase.kind === 'refused' ? phase.reason : '', /BusinessAnalyst, ProcessArchitect/);
    }
  });

  test('a 409 becomes a STALE READ, and advises a re-read rather than a retry', async () => {
    const c = client(stubFetch(409, { error: 'the requirement changed', kind: 'concurrency' }));
    try {
      await c.post('/projects/prj-1/requirements/REQ-0001/review', { action: 'accept' }, ReviewedRequirement);
      assert.fail('should have thrown');
    } catch (error) {
      const phase = reviewRefusal('REQ-0001', 'accept', error);
      assert.equal(phase.kind === 'refused' && phase.staleRead, true);
      assert.match(refusalAdvice(phase as never), /Reload and read it again/);
    }
  });

  test('THE ALREADY-APPROVED REFUSAL IS A 400 AND READS AS A REFUSAL', async () => {
    const message =
      'requirement REQ-0001 is approved; changing an approved requirement means revising it, ' +
      'which creates a new version and reopens the gate (governance §2.3)';
    const c = client(stubFetch(400, { error: message }));
    try {
      await c.post('/projects/prj-1/requirements/REQ-0001/review', { action: 'accept' }, ReviewedRequirement);
      assert.fail('should have thrown');
    } catch (error) {
      const phase = reviewRefusal('REQ-0001', 'accept', error);
      assert.equal(phase.kind === 'refused' && phase.status, 400);
      // Verbatim. A paraphrase here is a refusal the reviewer cannot look up.
      assert.equal(phase.kind === 'refused' && phase.reason, message);
    }
  });

  test('confirm-inference returns {requirementId, confirmed} and NOTHING ELSE is assumed', async () => {
    const c = client(stubFetch(200, { requirementId: 'REQ-0001', confirmed: true }));
    const r = await c.post('/projects/prj-1/requirements/REQ-0001/confirm-inference', {}, InferenceConfirmed);
    assert.equal(r.confirmed, true);
    assert.equal(r.requirementId, 'REQ-0001');
  });

  test('confirmed:false IS NOT A SHAPE THE SERVER SENDS, and is refused', async () => {
    const c = client(stubFetch(200, { requirementId: 'REQ-0001', confirmed: false }));
    await assert.rejects(
      () => c.post('/projects/prj-1/requirements/REQ-0001/confirm-inference', {}, InferenceConfirmed),
      ContractError,
    );
  });

  test("confirm-inference on a NON-INFERRED requirement is the SERVER's refusal", async () => {
    const c = client(stubFetch(400, { error: 'requirement REQ-0001 is not inferred; there is nothing to confirm' }));
    try {
      await c.post('/projects/prj-1/requirements/REQ-0001/confirm-inference', {}, InferenceConfirmed);
      assert.fail('should have thrown');
    } catch (error) {
      const phase = reviewRefusal('REQ-0001', 'confirm_inference', error);
      assert.match(phase.kind === 'refused' ? phase.reason : '', /there is nothing to confirm/);
    }
  });

  test('THE GATE LIST PARSES, and a reopened G1 is found in it', async () => {
    // `policy` is a GatePolicy OBJECT, not a label — the fixture says so because
    // the schema is the server's and a guessed shape is how a client drifts.
    const policy = { requiredRoles: ['BusinessApprover'] };
    const c = client(stubFetch(200, [
      { code: 'G0', projectId: 'prj-1', status: 'approved', policy },
      { code: 'G1', projectId: 'prj-1', status: 'reopened', policy },
    ]));
    const gates = await c.get('/projects/prj-1/gates', GateList);
    assert.equal(g1StatusOf(gates), 'reopened');
  });

  test('A GUESSED GATE SHAPE IS REFUSED, not quietly accepted', async () => {
    // The mistake this fixture originally made, kept as a test: `policy` as a
    // string parses as nothing and must fail loudly at the boundary.
    const c = client(stubFetch(200, [{ code: 'G1', projectId: 'prj-1', status: 'reopened', policy: 'blocking' }]));
    await assert.rejects(() => c.get('/projects/prj-1/gates', GateList), ContractError);
  });
});

describe('U3-d scope — what is still absent', () => {
  test('NO REVISION AND NO HUMAN-INFERRED AUTHORING ANYWHERE — that is U3-e', () => {
    // Narrowed from U3-c's list, which also forbade /review and
    // /confirm-inference. U3-d legitimately introduces those two; everything
    // else on that list is still unauthorised, and §21.7.10's inferred-revision
    // conflict is deliberately left alone rather than worked around here.
    const here = dirname(fileURLToPath(import.meta.url));
    // `changeReason` is deliberately NOT forbidden: it is a field of the CURRENT
    // row, which U3-c renders under G-e's bound to say *that* an edit happened.
    // Reading it is not authoring a revision, and banning the word would have
    // deleted U3-c's accepted history section to make a U3-d test pass.
    const forbidden = ['/revise', 'requirements/inferred', 'requirement-flags'];
    for (const file of ['requirement-model.ts', 'review-model.ts', 'Requirements.tsx', 'RequirementInspector.tsx']) {
      const source = readFileSync(
        join(here, '..', 'src', 'features', 'requirements', file),
        'utf8',
      ).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      for (const route of forbidden) {
        assert.ok(!source.includes(route), `${file} names ${route}: revision is U3-e`);
      }
    }
  });

  test('NO BULK MODEL EXISTS in the list, the inspector OR the review model', () => {
    // Widened from U3-c, which covered only the list. The inspector is where the
    // controls now live, so it is where a bulk path would appear.
    //
    // `Promise.all` is deliberately NOT among the tokens. `Requirements.tsx`
    // already uses it to read requirements and evidence in parallel — two
    // different reads, not one act over many requirements — and forbidding it
    // would have meant either serialising an accepted read or, worse, rewriting
    // U3-c's data loading to make a U3-d assertion pass. Concurrency is not
    // bulk. What matters is that no DECISION path takes more than one id, and
    // the ReviewSurface shape test asserts exactly that.
    const here = dirname(fileURLToPath(import.meta.url));
    for (const file of ['Requirements.tsx', 'RequirementInspector.tsx', 'review-model.ts']) {
      const source = readFileSync(
        join(here, '..', 'src', 'features', 'requirements', file),
        'utf8',
      ).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      for (const f of ['selectAll', 'checkbox', 'selectedIds', 'toggleAll', 'multiSelect']) {
        assert.ok(!source.includes(f), `${file} contains '${f}': no bulk model may exist`);
      }
    }
  });

  test('NO DECISION PATH ITERATES OVER REQUIREMENTS', () => {
    // The property the `Promise.all` token was a bad proxy for. The composition
    // root holds the only decision call; it must act on one id.
    const here = dirname(fileURLToPath(import.meta.url));
    const app = readFileSync(join(here, '..', 'src', 'app', 'App.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    const fn = /const submitDecision = useCallback\([\s\S]*?\n {4}\[identity\.subject/.exec(app);
    assert.ok(fn !== null, 'could not find submitDecision');
    const body = fn[0] as string;
    assert.match(body, /requirementId: string/, 'one requirement id, not a list');
    for (const bulk of ['.map(', '.forEach(', 'for (', 'Promise.all', '[]']) {
      assert.ok(!body.includes(bulk), `submitDecision contains '${bulk}': one act, one requirement`);
    }
  });

  test('NO CONTROL IN THE FEATURE IS LABELLED APPROVE', () => {
    // Scoped to CONTROL LABELS, not all prose: the Actions note legitimately
    // says "accepting does not approve anything", and banning the word outright
    // would forbid the sentence that makes the distinction.
    const here = dirname(fileURLToPath(import.meta.url));
    const inspector = readFileSync(
      join(here, '..', 'src', 'features', 'requirements', 'RequirementInspector.tsx'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

    // The five control labels come from two places, and both are checked: the
    // four review labels are DATA in review-model.ts, and confirm-inference is
    // literal JSX. An earlier version of this test tried to extract every
    // `<Button>…</Button>` body with one regex and matched three of five,
    // because JSX children nest and a lazy regex stops at the first close tag.
    // Extracting labels from where they are actually declared is both correct
    // and readable.
    const labels = [
      ...REVIEW_ACTIONS.map((a) => a.label),
      ...[...inspector.matchAll(/>\s*\{[^}]*\?\s*'[^']*'\s*:\s*'([^']+)'\}\s*</g)].map((m) => m[1] as string),
    ];
    assert.ok(labels.length >= 5, `expected at least the five review controls, found ${labels.length}`);
    assert.ok(labels.includes('Confirm inference'), 'the confirm control must be among the labels');
    for (const label of labels) {
      assert.doesNotMatch(label, /approv/i, `a control is labelled with 'approve': ${label.trim()}`);
    }

    // And the in-flight labels are not a loophole for the word either.
    for (const busy of [...inspector.matchAll(/'(Recording…|Confirming…)'/g)].map((m) => m[1] as string)) {
      assert.doesNotMatch(busy, /approv/i);
    }
  });

  test('Z2-B HOLDS — no AI-invoking control reached the review surface', () => {
    // Comments are stripped, as they are in every structural guard here: the
    // files explain WHY `mutate()`'s G1 reconciliation matters, and prose naming
    // a thing is not the thing. The repository-wide Z2-B guard in the U1 block
    // covers every module; this one is the narrow, local restatement for the two
    // files U3-d touched.
    const here = dirname(fileURLToPath(import.meta.url));
    for (const file of ['review-model.ts', 'RequirementInspector.tsx']) {
      const source = readFileSync(
        join(here, '..', 'src', 'features', 'requirements', file),
        'utf8',
      ).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      for (const ai of ['populate-frame', 'extract-evidence', '/profile', '/reconcile']) {
        assert.ok(!source.includes(ai), `${file} names ${ai}: Z2-B forbids an AI-invoking control`);
      }
    }
  });
});

describe('U3-d confirmation state — REQUIRED and GIVEN are different facts', () => {
  test('REQUIRED BUT NOT GIVEN reads as undecided, and says so', () => {
    const c = confirmationOf(requirementRow({ humanConfirmationRequired: true }));
    assert.equal(c.state, 'undecided');
    assert.match(c.detail, /not yet confirmed/);
  });

  test('GIVEN reads as decided AND NAMES WHO — the defect U3-c had', () => {
    // `confirmInference` sets inferenceConfirmedBy and deliberately does NOT
    // clear humanConfirmationRequired: the requirement still required a
    // confirmation, and now it has one. Rendering only the flag reported
    // "undecided" forever and made a completed act invisible.
    const c = confirmationOf(requirementRow({
      humanConfirmationRequired: true,
      inferenceConfirmedBy: 'u-analyst',
      inferenceConfirmedAt: '2026-08-26T10:00:00.000Z',
    }));
    assert.equal(c.state, 'decided');
    assert.match(c.detail, /Confirmed by u-analyst/);
    // A DATE, not a raw ISO instant — the visual review's finding. The full
    // instant stays in the audit entry, where millisecond precision matters.
    assert.match(c.detail, /on 2026-08-26\.$/);
    assert.doesNotMatch(c.detail, /T\d\d:/, 'no machine timestamp in a human field');
  });

  test('a confirmation with no timestamp still names its author', () => {
    const c = confirmationOf(requirementRow({ inferenceConfirmedBy: 'u-arch' }));
    assert.equal(c.state, 'decided');
    assert.match(c.detail, /Confirmed by u-arch\.$/);
  });

  test('NOT REQUIRED is decided, and does not pretend someone confirmed it', () => {
    const c = confirmationOf(requirementRow({ humanConfirmationRequired: false }));
    assert.equal(c.state, 'decided');
    assert.match(c.detail, /No separate confirmation is required/);
    assert.doesNotMatch(c.detail, /Confirmed by/);
  });
});

describe('U3-d the workspace caption no longer claims to be read-only', () => {
  test('THE SUBTITLE DOES NOT SAY "read-only", and does not promise approval later', () => {
    // Found by the visual review: the caption still read "Read-only in this
    // build: reviewing, revising and approving are later slices". Reviewing is
    // now available, and approving is not a later slice of this screen in ANY
    // build — it is G1's act and no control here reaches it.
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      join(here, '..', 'src', 'features', 'requirements', 'Requirements.tsx'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.ok(!source.includes('Read-only in this build'), 'the workspace is no longer read-only');
    assert.ok(
      !/approving are later slices/.test(source),
      'approving is not a later slice of this screen; it is G1\'s act',
    );
    assert.match(source, /approving is never done here/, 'and the caption must say so');
  });
});
