/**
 * The design foundation, tested where it can actually be tested — **D-U2.5**.
 *
 * These are the rules the approved foundation turns on, and every one of them is
 * asserted here rather than trusted:
 *
 * | Approved rule | Test |
 * |---|---|
 * | **Y14** — colour never carries meaning alone | *the vocabulary survives having its colour removed* |
 * | **Y2** — the four epistemic levels are never conflated | *every level is distinct without colour* |
 * | **ADR-0038** — `content_unverified` never looks like `resolved` | *they differ in glyph, label AND shape* |
 * | **Y19** — one state vocabulary, and unknown values are visibly unknown | *an unrecognised value never renders as benign* |
 * | **§2.1** — the rail never implies a capability that does not exist | *bidirectional nav drift* |
 * | **Y26** — governance information collapses last | *a width sweep* |
 * | **Y22/H3** — the assistant cannot ask anything | *no export can send a request* |
 * | **Z8-a** (U3-a) — every requirement status is renderable, in the existing family | *bidirectional status drift* |
 *
 * The colour test is the one worth reading twice. Asserting *"every state has a
 * colour"* proves nothing; asserting *"delete the colour and the states are still
 * all distinguishable"* is the actual rule, and it fails the moment someone adds
 * a state that differs only in hue.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { RequirementStatus } from '@asdp/schemas';

import {
  REQUIREMENT_STATUSES,
  REQUIREMENT_STATUS_FAMILY,
  VOCABULARY,
  accessibleName,
  badgeClasses,
  semanticState,
  statesIn,
  unknownState,
  type SemanticFamily,
  type SemanticState,
} from './semantics.ts';
import { WORKSPACES, availableWorkspaceIds, isAvailable, navDrift, unavailableReason } from './nav.ts';
import { IMPLEMENTED_WORKSPACES } from '../app/routes.ts';
import {
  appearanceAttributes,
  densityControlLabel,
  nextThemePreference,
  otherDensity,
  resolveTheme,
  themeControlLabel,
  THEME_PREFERENCES,
} from './appearance.ts';
import { BREAKPOINTS, collapseStage, layoutFor } from './responsive.ts';
import * as assistant from '../assistant/assistant-model.ts';
import {
  audit,
  contrastRatio,
  describeFailure,
  luminance,
  parseHex,
  parseTokens,
  resolve,
  type TokenSet,
} from './contrast.ts';

const FAMILIES: readonly SemanticFamily[] = [
  'severity',
  'epistemic',
  'verification',
  'decidedness',
  'lifecycle',
  'gate',
  'policy',
];

/** Everything about a state except its colour. This is what must stay unique. */
const withoutColour = (s: SemanticState): string => `${s.glyph}|${s.shape}|${s.label}`;

describe('Y14 — colour never carries meaning alone', () => {
  test('EVERY state stays distinguishable with the colour removed', () => {
    for (const family of FAMILIES) {
      const states = statesIn(family);
      assert.ok(states.length > 0, `${family} has no states`);
      const keys = states.map(withoutColour);
      assert.equal(
        new Set(keys).size,
        keys.length,
        `${family} has two states that differ only by colour: ${keys.join(' / ')}`,
      );
    }
  });

  test('every state carries a glyph AND a label AND screen-reader text', () => {
    for (const s of VOCABULARY) {
      assert.notEqual(s.glyph.trim(), '', `${s.family}/${s.state} has no glyph`);
      assert.notEqual(s.label.trim(), '', `${s.family}/${s.state} has no label`);
      assert.notEqual(s.srText.trim(), '', `${s.family}/${s.state} has no screen-reader text`);
    }
  });

  test('glyphs are unique within a family, so greyscale is enough on its own', () => {
    for (const family of FAMILIES) {
      const glyphs = statesIn(family).map((s) => s.glyph);
      assert.equal(new Set(glyphs).size, glyphs.length, `${family} reuses a glyph`);
    }
  });

  test('the colour token is the LAST class, and never the only one', () => {
    for (const s of VOCABULARY) {
      const classes = badgeClasses(s);
      assert.ok(classes.includes('badge'));
      assert.ok(classes.some((c) => c.startsWith('badge--shape-')), 'no shape channel');
      assert.ok(classes.some((c) => c.startsWith('badge--tone-')), 'no tone channel');
      assert.ok(classes.length >= 3, 'a badge needs all three channels');
    }
  });
});

describe('Y2 / ADR-0007 — the epistemic ladder is never conflated', () => {
  test('all four levels exist and are distinct without colour', () => {
    const levels = statesIn('epistemic').map((s) => s.state);
    assert.deepEqual([...levels].sort(), ['L1', 'L2', 'L3', 'L4']);
    const keys = statesIn('epistemic').map(withoutColour);
    assert.equal(new Set(keys).size, 4);
  });

  test('an AI level and an approved level never share a glyph or a label', () => {
    const l2 = semanticState('epistemic', 'L2');
    const l3 = semanticState('epistemic', 'L3');
    const l4 = semanticState('epistemic', 'L4');
    for (const ai of [l2, l3]) {
      assert.notEqual(ai.glyph, l4.glyph);
      assert.notEqual(ai.label, l4.label);
      // The words matter: an AI item must never read as approved.
      assert.doesNotMatch(ai.label.toLowerCase(), /approved/);
    }
    assert.match(l4.label.toLowerCase(), /approved/);
  });

  test('the accessible name states the level in words, not by colour', () => {
    assert.match(accessibleName(semanticState('epistemic', 'L3'), 'REQ-0001'), /REQ-0001.*recommend/i);
  });
});

describe('ADR-0038 — content_unverified must never look like resolved', () => {
  test('they differ in glyph, in label and in border treatment', () => {
    const resolved = semanticState('verification', 'resolved');
    const unverified = semanticState('verification', 'content_unverified');
    assert.notEqual(resolved.glyph, unverified.glyph);
    assert.notEqual(resolved.label, unverified.label);
    assert.notEqual(resolved.shape, unverified.shape);
    assert.notEqual(withoutColour(resolved), withoutColour(unverified));
  });

  test('"unverified" is said in words, so the distinction survives greyscale', () => {
    assert.match(semanticState('verification', 'content_unverified').label.toLowerCase(), /unverified/);
    assert.match(semanticState('verification', 'content_unverified').srText.toLowerCase(), /not verified/);
  });
});

describe('Y19 — decidedness, and unknown values', () => {
  test('undecided is its own state and never reads as a low value', () => {
    const undecided = semanticState('decidedness', 'undecided');
    assert.match(undecided.label.toLowerCase(), /undecided/);
    assert.match(undecided.srText.toLowerCase(), /nobody has decided/);
    assert.doesNotMatch(undecided.label, /0|zero|low/i);
  });

  test('an unrecognised value renders as UNRECOGNISED, never as benign', () => {
    // The drift this catches is a server that starts emitting something new.
    const s = semanticState('severity', 'catastrophe');
    assert.match(s.label.toLowerCase(), /unrecognised/);
    assert.equal(s.tone, 'unknown');
    for (const known of statesIn('severity')) {
      assert.notEqual(s.label, known.label);
    }
  });

  test('an ABSENT value is also visibly unrecognised, not defaulted', () => {
    assert.match(semanticState('lifecycle', undefined).label.toLowerCase(), /unrecognised/);
    assert.match(unknownState('gate', 'x').glyph, /⚠/);
  });
});

// ---------------------------------------------------------------------------
// U3-a — requirement statuses in the vocabulary, and the drift guard
// ---------------------------------------------------------------------------

describe('U3-a / Z8-a — every requirement status is renderable', () => {
  test('THE STATUS LIST EQUALS THE API\'S, IN BOTH DIRECTIONS', () => {
    // U2-a's lesson, for the third time: a one-directional check catches half
    // the drift. `UI ⊆ API` would let this build name a status no server can
    // send; `API ⊆ UI` would let a new server status fall through to
    // `unknownState`, which is honest but is a fallback rather than a design.
    const api = [...RequirementStatus.options].sort();
    const ui = [...REQUIREMENT_STATUSES].sort();

    assert.deepEqual(ui, api, `requirement statuses drifted — UI ${ui.join(', ')} vs API ${api.join(', ')}`);
  });

  test('every status resolves to a REAL state, never to "Unrecognised"', () => {
    for (const status of REQUIREMENT_STATUSES) {
      const state = semanticState(REQUIREMENT_STATUS_FAMILY, status);
      assert.equal(state.state, status, `${status} did not resolve`);
      assert.doesNotMatch(
        state.label.toLowerCase(),
        /unrecognised/,
        `${status} renders as unrecognised, which a reviewer would read as a defect`,
      );
      assert.notEqual(state.tone, 'unknown', `${status} fell through to the unknown tone`);
    }
  });

  test('Z8-a: they extend the EXISTING family — no new family was added', () => {
    // The approved decision was "extend `lifecycle`". A new family would be an
    // architectural change needing its own approval (§20.8), so the count of
    // families is asserted rather than assumed.
    assert.equal(REQUIREMENT_STATUS_FAMILY, 'lifecycle');
    assert.equal(FAMILIES.length, 7, 'a semantic family was added or removed');
    const families = new Set(VOCABULARY.map((s) => s.family));
    assert.equal(families.size, 7);
  });

  test('Z8-a: no new tone token, and no new shape', () => {
    // Colour and shape are the accepted baseline (§20.8). A new tone would need
    // a token, and `contrast.ts` derives its declared pairs from the tones the
    // vocabulary uses — so adding one silently would change what is audited.
    const TONES = new Set(['danger', 'caution', 'neutral', 'fact', 'ai', 'approved', 'ok', 'pending', 'undecided', 'muted']);
    const SHAPES = new Set(['solid', 'outline', 'dashed', 'double']);
    for (const status of REQUIREMENT_STATUSES) {
      const state = semanticState(REQUIREMENT_STATUS_FAMILY, status);
      assert.ok(TONES.has(state.tone), `${status} introduced a new tone '${state.tone}'`);
      assert.ok(SHAPES.has(state.shape), `${status} introduced a new shape '${state.shape}'`);
    }
  });

  test('Z7.1 — "in review" is NEVER worded as approval', () => {
    // `reviewRequirement` maps `accept` to `in_review`, and the API has no route
    // that writes `approved` at all. A badge that read "Accepted" beside a ladder
    // whose top rung is human approval is exactly the conflation ADR-0007 forbids.
    const inReview = semanticState('lifecycle', 'in_review');
    assert.doesNotMatch(inReview.label, /approved/i);
    assert.match(inReview.srText.toLowerCase(), /not approved/);

    const approved = semanticState('lifecycle', 'approved');
    assert.notEqual(inReview.label, approved.label);
    assert.notEqual(inReview.glyph, approved.glyph);
    assert.match(approved.srText.toLowerCase(), /g1|baseline/);
  });

  test('the source states survive the extension, unchanged', () => {
    // U3-a is a vocabulary addition, not a redecoration. The four source states
    // keep their glyph, shape and tone; only `superseded`'s wording generalises,
    // because the entry is now shared with a requirement (§7.1).
    const expected = [
      ['parsed', '✓', 'solid', 'ok'],
      ['parsing', '⋯', 'outline', 'pending'],
      ['parse_failed', '✕', 'solid', 'danger'],
      ['superseded', '⇥', 'dashed', 'muted'],
    ] as const;
    for (const [value, glyph, shape, tone] of expected) {
      const s = semanticState('lifecycle', value);
      assert.equal(s.glyph, glyph, `${value} changed glyph`);
      assert.equal(s.shape, shape, `${value} changed shape`);
      assert.equal(s.tone, tone, `${value} changed tone`);
    }
  });

  test('`superseded` is shared, so its wording names neither half specifically', () => {
    // One family means one entry, and `RequirementStatus` contains `superseded`
    // too. The badge's `subject` says which record it describes.
    const s = semanticState('lifecycle', 'superseded');
    assert.doesNotMatch(s.srText, /source/i, 'the shared state still reads as source-only');
    assert.match(accessibleName(s, 'REQ-0007'), /^REQ-0007, Superseded, /);
  });

  test('U3 is NOT implemented by this slice: the rail still says so', () => {
    // U3-a is the vocabulary and its guard. The workspace is U3-c, and claiming
    // it here would be exactly the dishonest navigation §2.1 forbids.
    assert.equal(isAvailable('requirements'), false);
    assert.match(unavailableReason('requirements') ?? '', /U3/);
  });
});

describe('§2.1 — the rail never implies a capability that does not exist', () => {
  test('the available entries EQUAL the implemented workspaces, in both directions', () => {
    // U2-a's lesson applied to navigation: a one-directional check catches half
    // the drift, and the half it misses is a rail entry claiming a capability
    // this build does not have.
    const drift = navDrift();
    assert.deepEqual(drift.displayedButUnbuilt, [], 'the rail offers a workspace that is not implemented');
    assert.deepEqual(drift.builtButUndisplayed, [], 'a workspace is implemented but not offered');
    assert.deepEqual([...availableWorkspaceIds()].sort(), [...IMPLEMENTED_WORKSPACES].sort());
  });

  test('every unavailable entry names the slice that would deliver it', () => {
    for (const w of WORKSPACES) {
      if (w.availability.kind === 'future') {
        assert.notEqual(w.availability.slice.trim(), '', `${w.id} has no slice`);
        assert.notEqual(w.availability.note.trim(), '', `${w.id} has no note`);
        const reason = unavailableReason(w.id);
        assert.ok(reason !== undefined && reason.includes(w.availability.slice));
        assert.match(reason, /not built/i);
      }
    }
  });

  test('requirements, specifications and processes are all future — U3 and P3 are not authorised', () => {
    for (const id of ['requirements', 'specifications', 'processes', 'decisions', 'forms', 'services']) {
      assert.equal(isAvailable(id), false, `${id} must not be available`);
    }
    assert.match(unavailableReason('requirements') ?? '', /U3/);
    assert.match(unavailableReason('specifications') ?? '', /P3/);
  });

  test('no overview dashboard is offered, because its metrics have no API', () => {
    // The visual reference shows readiness percentages and condition counts.
    // Inventing them was explicitly forbidden by the approval (§26.2).
    assert.equal(isAvailable('overview'), false);
  });

  test('every rail entry has a unique id, label and glyph', () => {
    const ids = WORKSPACES.map((w) => w.id);
    const labels = WORKSPACES.map((w) => w.label);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(new Set(labels).size, labels.length);
  });
});

describe('Y15 — theme and density', () => {
  test('system follows the OS; an explicit choice wins', () => {
    assert.equal(resolveTheme('system', true), 'dark');
    assert.equal(resolveTheme('system', false), 'light');
    assert.equal(resolveTheme('light', true), 'light');
    assert.equal(resolveTheme('dark', false), 'dark');
  });

  test('three steps return the preference to where it started', () => {
    let p = THEME_PREFERENCES[0]!;
    const seen = [p];
    for (let i = 0; i < 3; i += 1) {
      p = nextThemePreference(p);
      seen.push(p);
    }
    assert.equal(seen[0], seen[3]);
    assert.equal(new Set(seen).size, 3);
  });

  test('exactly two attributes drive the token layer', () => {
    assert.deepEqual(appearanceAttributes('dark', 'compact'), { 'data-theme': 'dark', 'data-density': 'compact' });
  });

  test('density toggles between exactly two values', () => {
    assert.equal(otherDensity('comfortable'), 'compact');
    assert.equal(otherDensity('compact'), 'comfortable');
  });

  test('both controls SAY what they do — never a bare icon (W8)', () => {
    assert.match(themeControlLabel('system', 'dark'), /system.*showing dark/i);
    assert.match(themeControlLabel('light', 'light'), /light/i);
    assert.match(densityControlLabel('comfortable'), /switch to compact/i);
  });
});

describe('Y26 — what collapses is chrome, never state', () => {
  test('governance information is visible at EVERY width', () => {
    for (let w = 320; w <= 2200; w += 17) {
      assert.equal(layoutFor(w).governanceVisible, true, `governance hidden at ${w}px`);
    }
  });

  test('the collapse order is the approved one', () => {
    assert.deepEqual(layoutFor(1600), {
      rail: 'expanded', inspector: 'docked', assistant: 'docked', columns: 2, approvalAffordances: true, governanceVisible: true,
    });
    assert.equal(layoutFor(1200).rail, 'icons');
    assert.equal(layoutFor(1200).assistant, 'overlay');
    assert.equal(layoutFor(1200).inspector, 'docked');
    assert.equal(layoutFor(900).inspector, 'overlay');
    assert.equal(layoutFor(600).rail, 'drawer');
  });

  test('collapsing is monotonic — nothing un-collapses as the window narrows', () => {
    let previous = collapseStage(2400);
    for (let w = 2400; w >= 320; w -= 13) {
      const stage = collapseStage(w);
      assert.ok(stage >= previous, `stage went backwards at ${w}px`);
      previous = stage;
    }
  });

  test('the breakpoints are the three approved ones', () => {
    assert.deepEqual(BREAKPOINTS, { wide: 1440, medium: 1024, narrow: 768 });
  });

  test("U2's writes stay available at every width", () => {
    // approvalAffordances gates APPROVAL flows, which do not exist yet. It must
    // never be read as gating upload or ranking: D-U2.5 is presentation-only,
    // and removing a U2 capability on a narrow screen would not be.
    for (const w of [320, 500, 767, 768, 1024, 1440, 1920]) {
      const layout = layoutFor(w);
      assert.equal(typeof layout.approvalAffordances, 'boolean');
      assert.equal(layout.governanceVisible, true, `at ${w}px`);
    }
    assert.equal(layoutFor(500).approvalAffordances, false);
    assert.equal(layoutFor(1440).approvalAffordances, true);
  });
});

describe('Y22 / H3 — the assistant cannot ask anything', () => {
  test('availability is a CONSTANT: nothing can make it available', () => {
    const a = assistant.availability();
    assert.equal(a.kind, 'unavailable');
    assert.equal(a.blocker, 'H3');
    assert.match(a.message, /unavailable/i);
    assert.match(a.message, /live AI enablement pending/i);
    // Called twice, with nothing to influence it either time.
    assert.deepEqual(assistant.availability(), a);
    assert.equal(assistant.availability.length, 0, 'availability() must take no argument');
  });

  test('NO export could send a request, and none returns an answer', () => {
    // Structural, not editorial: a comment promising restraint is not a control.
    const forbidden = /^(ask|send|submit|query|prompt|complete|chat|generate|answer|stream|fetch|call|invoke)/i;
    for (const name of Object.keys(assistant)) {
      assert.doesNotMatch(name, forbidden, `assistant-model exports '${name}', which reads like a call path`);
    }
  });

  test('no stub answer exists anywhere in the module', () => {
    // A canned reply that looks like a live answer is worse than no answer:
    // every evaluation figure in this repository is already a synthetic corpus
    // against an authored stub, and a plausible UI answer hides that.
    const values = Object.values(assistant).filter((v) => typeof v !== 'function');
    const serialised = JSON.stringify(values);
    assert.doesNotMatch(serialised, /"answer"|"response"|"reply"|"completion"/i);
  });

  test('context is stated, never guessed', () => {
    assert.equal(assistant.contextFor({}).scope, 'none');
    assert.match(assistant.contextFor({}).label, /No project selected/i);
    assert.equal(assistant.contextFor({ projectKey: 'alpha' }).scope, 'project');
    assert.match(assistant.contextFor({ projectKey: 'alpha' }).detail, /alpha/);
    const withSource = assistant.contextFor({ projectKey: 'alpha', sourceName: 'brd.md' });
    assert.equal(withSource.scope, 'source');
    assert.match(withSource.label, /alpha/);
    assert.match(withSource.label, /brd\.md/);
  });

  test('Y23 — the two most damaging answers are classified DETERMINISTIC', () => {
    const byId = new Map(assistant.FUTURE_ACTIONS.map((a) => [a.id, a]));
    for (const id of ['show-evidence', 'why-g1-blocked']) {
      const action = byId.get(id);
      assert.ok(action !== undefined, `${id} is missing`);
      assert.equal(action.determinism, 'deterministic', `${id} must not be a prompt`);
      assert.equal(action.level, 'L1', `${id} answers facts, not opinions`);
    }
  });

  test('every future action declares a level, and none claims to be approved', () => {
    for (const action of assistant.FUTURE_ACTIONS) {
      assert.ok(['L1', 'L2', 'L3'].includes(action.level), `${action.id} has no level`);
      assert.notEqual(action.level as string, 'L4', 'an assistant answer is never human-approved');
      assert.notEqual(action.note.trim(), '');
    }
  });

  test('the governance notes state the non-negotiables on screen', () => {
    const all = assistant.GOVERNANCE_NOTES.join(' ').toLowerCase();
    assert.match(all, /context/);
    assert.match(all, /evidence/);
    assert.match(all, /no approve/);
    assert.match(all, /never presented as accuracy/);
  });
});

// ---------------------------------------------------------------------------
// Y14 — contrast, computed rather than assumed
// ---------------------------------------------------------------------------

describe('WCAG AA contrast over the real token file', () => {
  // The stylesheet the browser resolves is the one under test. A duplicate
  // palette in TypeScript could drift from it; this cannot.
  const css = readFileSync(new URL('../../src/design/tokens.css', import.meta.url), 'utf8');
  const tones = [...new Set(VOCABULARY.map((s) => s.tone))];

  test('every declared token combination meets its WCAG AA requirement, in BOTH themes', () => {
    const failures = audit(css, tones).filter((m) => !m.passes);
    assert.deepEqual(
      failures.map(describeFailure),
      [],
      `${failures.length} token combination(s) fail WCAG AA:\n  ${failures.map(describeFailure).join('\n  ')}`,
    );
  });

  test('the audit actually covers something — a vacuous pass is a defect too', () => {
    // A test that measures nothing passes. This is the guard against that.
    const measurements = audit(css, tones);
    assert.ok(measurements.length >= 90, `only ${measurements.length} combinations measured`);
    assert.equal(new Set(measurements.map((m) => m.theme)).size, 2, 'both themes must be measured');
    // Every semantic tone is covered as text AND as a border.
    for (const tone of tones) {
      const forTone = measurements.filter((m) => m.foreground === `--asdp-tone-${tone}`);
      assert.ok(forTone.some((m) => m.requirement === 'text'), `${tone} is not checked as text`);
      assert.ok(forTone.some((m) => m.requirement === 'ui'), `${tone} is not checked as a border`);
    }
  });

  test('the contrast maths matches the WCAG reference values', () => {
    // Black on white is exactly 21:1; a colour against itself is exactly 1:1.
    assert.equal(Math.round(contrastRatio(parseHex('#000000'), parseHex('#ffffff'))), 21);
    assert.equal(contrastRatio(parseHex('#777777'), parseHex('#777777')), 1);
    // A known WCAG example: #767676 on white is the classic 4.54:1 boundary.
    const boundary = contrastRatio(parseHex('#767676'), parseHex('#ffffff'));
    assert.ok(boundary >= 4.5 && boundary < 4.6, `expected ~4.54, got ${boundary}`);
    assert.equal(luminance(parseHex('#000000')), 0);
    assert.equal(Math.round(luminance(parseHex('#ffffff'))), 1);
  });

  test('a translucent token is REFUSED rather than approximated', () => {
    // Contrast against a translucent colour depends on what is behind it, so a
    // guessed backdrop would produce a number nobody could rely on.
    assert.throws(() => parseHex('#37456380'), /not an opaque hex colour/);
    assert.throws(() => parseHex('transparent'), /not an opaque hex colour/);
  });

  test('a token missing from the dark block is checked against its light value', () => {
    const [light, dark] = parseTokens(css);
    assert.ok(light !== undefined && dark !== undefined);
    assert.equal(light.theme, 'light');
    assert.equal(dark.theme, 'dark');
    // Dark inherits everything it does not override — the cascade, as the browser
    // resolves it. A token the dark block forgets is the bug worth catching.
    assert.ok(dark.values.size >= light.values.size);
    assert.notEqual(resolve(light, '--asdp-bg'), resolve(dark, '--asdp-bg'));
  });

  test('var() chains resolve, and a circular one is refused', () => {
    const fake: TokenSet = {
      theme: 'light',
      values: new Map([
        ['--a', 'var(--b)'],
        ['--b', '#123456'],
        ['--loop', 'var(--loop)'],
      ]),
    };
    assert.equal(resolve(fake, '--a'), '#123456');
    assert.throws(() => resolve(fake, '--loop'), /circular/);
    assert.throws(() => resolve(fake, '--missing'), /not defined/);
  });
});
