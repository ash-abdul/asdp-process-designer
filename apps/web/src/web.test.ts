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
import { readFileSync } from 'node:fs';
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
import { ProjectList, SourceContent, HighlightList } from './api/contracts.ts';

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

  test('every role named in the UI map is a role the API defines', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const primitives = readFileSync(
      join(here, '..', '..', '..', 'packages', 'schemas', 'src', 'primitives.ts'),
      'utf8',
    );
    for (const role of ROLES) {
      assert.ok(primitives.includes(`'${role}'`), `unknown role in the UI map: ${role}`);
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
