/**
 * Tests for @asdp/text.
 *
 * Obligations from provenance-and-anchoring.md §8 and ADR-0023:
 *   - normalisation invariance (NFC == NFD input)
 *   - non-BMP safety (the test that catches accidental UTF-16 arithmetic)
 *   - bidi correctness on mixed Arabic/English fixtures
 *   - tolerant match forms across Arabic orthographic variation
 *   - identifier stability and ASCII safety
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalise,
  baseDirection,
  isMixedDirection,
  codePointLength,
  sliceByCodePoints,
  codePointToUtf16Index,
  buildMatchForm,
  buildMatchFormCollapsed,
  toMatchText,
  foldPresentationForms,
  hasPresentationForms,
  stripDiacritics,
  foldDigits,
  mintIdentifier,
  transliterate,
  slugify,
  isNcNameSafe,
  isAscii,
  isVariableNameSafe,
  isJobTypeSafe,
  formatMessage,
  isolate,
} from './index.ts';

// Arabic: "identity verification must complete within three business days"
const AR = 'يجب إتمام التحقق من الهوية خلال ثلاثة أيام عمل';
const EN = 'Identity verification must complete within 3 business days';
const MIXED = 'Step 1: التحقق من الهوية (IdentityService)';

describe('code-point arithmetic', () => {
  test('codePointLength counts code points, not UTF-16 units', () => {
    // U+1F600 GRINNING FACE is a surrogate pair: .length === 2, code points === 1
    const s = 'a\u{1F600}b';
    assert.equal(s.length, 4, 'UTF-16 length is 4');
    assert.equal(codePointLength(s), 3, 'code-point length is 3');
  });

  test('NON-BMP SAFETY: slicing by code points does not split surrogate pairs', () => {
    const s = 'a\u{1F600}b';
    // A naive String.slice(1, 2) would return a lone high surrogate.
    assert.equal(sliceByCodePoints(s, 1, 2), '\u{1F600}');
    assert.equal(sliceByCodePoints(s, 0, 2), 'a\u{1F600}');
    assert.equal(sliceByCodePoints(s, 2, 3), 'b');
  });

  test('code-point offset maps to the correct UTF-16 index', () => {
    const s = 'a\u{1F600}b';
    assert.equal(codePointToUtf16Index(s, 0), 0);
    assert.equal(codePointToUtf16Index(s, 1), 1);
    assert.equal(codePointToUtf16Index(s, 2), 3, 'skips the surrogate pair');
    assert.equal(codePointToUtf16Index(s, 3), 4);
  });

  test('Arabic text with supplementary-plane characters keeps offsets aligned', () => {
    const s = `${AR} \u{1F4C4}`;
    const n = normalise(s);
    assert.equal(n.length, codePointLength(n.text));
    assert.equal(sliceByCodePoints(n.text, n.length - 1, n.length), '\u{1F4C4}');
  });
});

describe('normalisation', () => {
  test('output is NFC', () => {
    // Arabic letter alef with hamza above, composed vs decomposed.
    const composed = 'أ';
    const decomposed = 'أ';
    assert.equal(normalise(decomposed).text, composed);
    assert.equal(normalise(composed).text, composed);
  });

  test('NORMALISATION INVARIANCE: NFC and NFD input yield identical stored text', () => {
    const nfc = AR.normalize('NFC');
    const nfd = AR.normalize('NFD');
    assert.notEqual(nfc, nfd, 'the fixture must actually differ before normalisation');
    assert.equal(normalise(nfc).text, normalise(nfd).text);
    assert.equal(normalise(nfc).length, normalise(nfd).length);
  });

  test('detects Arabic as the primary language and rtl direction', () => {
    const n = normalise(AR);
    assert.equal(n.primaryLanguage, 'ar');
    assert.equal(n.direction, 'rtl');
  });

  test('detects English as the primary language and ltr direction', () => {
    const n = normalise(EN);
    assert.equal(n.primaryLanguage, 'en');
    assert.equal(n.direction, 'ltr');
  });

  test('segments a mixed document into language runs', () => {
    const n = normalise(MIXED);
    const languages = new Set(n.runs.map((r) => r.language));
    assert.ok(languages.has('ar'), 'has an Arabic run');
    assert.ok(languages.has('en'), 'has an English run');
    // Runs must be contiguous and ordered.
    for (let i = 1; i < n.runs.length; i++) {
      assert.ok((n.runs[i]!.start) >= (n.runs[i - 1]!.end - 1));
    }
  });

  test('bidi control characters are recorded, not stripped', () => {
    const withControl = `abc‏def`;
    const n = normalise(withControl);
    assert.equal(n.length, 7, 'the control character is counted in offsets');
    assert.equal(n.bidiControls.length, 1);
    assert.equal(n.bidiControls[0]!.offset, 3);
    assert.equal(n.bidiControls[0]!.codePoint, 0x200f);
  });

  test('baseDirection uses first strong character', () => {
    assert.equal(baseDirection(AR), 'rtl');
    assert.equal(baseDirection(EN), 'ltr');
    assert.equal(baseDirection('123 — '), 'neutral');
    assert.equal(baseDirection('  ' + AR), 'rtl');
  });

  test('isMixedDirection detects mixed runs', () => {
    assert.equal(isMixedDirection(MIXED), true);
    assert.equal(isMixedDirection(AR), false);
    assert.equal(isMixedDirection(EN), false);
  });
});

describe('Arabic folding', () => {
  test('strips diacritics and Tatweel', () => {
    const withHarakat = 'مُحَمَّد';
    const withTatweel = 'محـــمد';
    assert.equal(stripDiacritics(withHarakat), 'محمد');
    assert.equal(stripDiacritics(withTatweel), 'محمد');
  });

  test('folds Arabic-Indic digits to ASCII', () => {
    assert.equal(foldDigits('٥٠٠٠٠'), '50000');
    assert.equal(foldDigits('۱۲۳'), '123');
  });

  test('folds presentation forms to base letters', () => {
    // U+FEDF ARABIC LETTER LAM INITIAL FORM → U+0644 LAM
    assert.equal(foldPresentationForms('ﻟ'), 'ل');
    // U+FEFB ARABIC LIGATURE LAM WITH ALEF ISOLATED FORM → two letters
    assert.equal(foldPresentationForms('ﻻ'), 'لا');
  });

  test('detects presentation forms', () => {
    assert.equal(hasPresentationForms('ﻟﻠ'), true);
    assert.equal(hasPresentationForms(AR), false);
  });

  test('REGRESSION: hamza has one shape, so alef must not fold to yeh-with-hamza', () => {
    // U+0621 HAMZA occupies a single slot in Presentation Forms-B. Treating it
    // as two shifted every subsequent letter by one, silently mistranslating
    // U+FE8D ALEF ISOLATED as U+0626 YEH WITH HAMZA. Found by the presentation
    // form quote-location test in @asdp/provenance.
    assert.equal(foldPresentationForms('ﺀ'), 'ء', 'hamza isolated');
    assert.equal(foldPresentationForms('ﺍ'), 'ا', 'alef isolated');
    assert.equal(foldPresentationForms('ﺎ'), 'ا', 'alef final');
    assert.equal(foldPresentationForms('ﺏ'), 'ب', 'beh isolated');
    assert.equal(foldPresentationForms('ﺓ'), 'ة', 'teh marbuta isolated');
    assert.equal(foldPresentationForms('ﻮ'), 'و', 'waw final');
    assert.equal(foldPresentationForms('ﺍﻟﻬﻮﻳﺔ'), 'الهوية', 'full word');
  });

  test('every Presentation Forms-B code point folds to an Arabic base letter', () => {
    for (let cp = 0xfe80; cp <= 0xfefc; cp++) {
      const folded = foldPresentationForms(String.fromCodePoint(cp));
      for (const ch of folded) {
        const base = ch.codePointAt(0) as number;
        assert.ok(
          base >= 0x0621 && base <= 0x064a,
          `U+${cp.toString(16)} folded to U+${base.toString(16)}, outside the Arabic block`,
        );
      }
    }
  });
});

describe('match form and offset mapping', () => {
  test('tolerates diacritics: needle without harakat finds text with harakat', () => {
    const stored = 'مُحَمَّد علي';
    const mf = buildMatchForm(stored);
    assert.ok(mf.text.includes('محمد'), `match form was: ${mf.text}`);
  });

  test('tolerates Alef variants', () => {
    assert.equal(toMatchText('أحمد'), toMatchText('احمد'));
    assert.equal(toMatchText('إبراهيم'), toMatchText('ابراهيم'));
  });

  test('tolerates Yeh and Teh Marbuta variants', () => {
    assert.equal(toMatchText('على'), toMatchText('علي'));
    assert.equal(toMatchText('مدرسة'), toMatchText('مدرسه'));
  });

  test('tolerates digit form', () => {
    assert.equal(toMatchText('٥٠٠٠٠ درهم'), toMatchText('50000 درهم'));
  });

  test('case-folds Latin', () => {
    assert.equal(toMatchText('IdentityService'), toMatchText('identityservice'));
  });

  test('offset map points every match character back to a stored index', () => {
    const stored = 'مُحَمَّد';
    const mf = buildMatchForm(stored);
    assert.equal(mf.text.length, mf.toStored.length, 'map covers every match char');
    for (const idx of mf.toStored) {
      assert.ok(idx >= 0 && idx < mf.storedLength, `stored index ${idx} in range`);
    }
    // Monotonically non-decreasing: folding never reorders.
    for (let i = 1; i < mf.toStored.length; i++) {
      assert.ok((mf.toStored[i] as number) >= (mf.toStored[i - 1] as number));
    }
  });

  test('ligature expansion maps both output characters to one stored index', () => {
    const mf = buildMatchForm('ﻻ'); // lam-alef ligature, one stored code point
    assert.equal(mf.storedLength, 1);
    assert.equal(mf.text.length, 2, 'expands to two characters');
    assert.deepEqual(mf.toStored, [0, 0], 'both map back to the single stored index');
  });

  test('collapsed form normalises whitespace runs while keeping the map aligned', () => {
    const stored = 'يجب   إتمام\n\nالتحقق';
    const mf = buildMatchFormCollapsed(stored);
    assert.ok(!/\s{2,}/.test(mf.text), 'no whitespace runs remain');
    assert.equal(mf.text.length, mf.toStored.length);
  });
});

describe('identifier minting (ADR-0024)', () => {
  test('prefers an English name when available', () => {
    const m = mintIdentifier({
      prefix: 'Activity',
      displayName: 'التحقق من الهوية',
      englishName: 'Verify identity',
      discriminator: '1',
    });
    assert.equal(m.id, 'Activity_verify_identity_1');
    assert.equal(m.strategy, 'english');
    assert.equal(m.displayName, 'التحقق من الهوية', 'display name preserved verbatim');
  });

  test('falls back to transliteration when no English name exists', () => {
    const m = mintIdentifier({
      prefix: 'Activity',
      displayName: 'التحقق من الهوية',
      discriminator: '7',
    });
    assert.equal(m.strategy, 'transliterated');
    assert.ok(isNcNameSafe(m.id), `${m.id} must be NCName-safe`);
    assert.ok(isAscii(m.id), `${m.id} must be ASCII`);
    assert.ok(m.id.startsWith('Activity_'));
    assert.ok(m.id.endsWith('_7'));
  });

  test('falls back to an ordinal identifier when nothing transliterates', () => {
    const m = mintIdentifier({
      prefix: 'Activity',
      displayName: '※◆●',
      discriminator: '12',
    });
    assert.equal(m.strategy, 'ordinal');
    assert.equal(m.id, 'Activity_12');
  });

  test('IDENTIFIER STABILITY: same identity yields the same id across calls', () => {
    const opts = {
      prefix: 'Activity',
      displayName: 'التحقق من الهوية',
      englishName: 'Verify identity',
      discriminator: 'a1b2',
    } as const;
    assert.equal(mintIdentifier(opts).id, mintIdentifier(opts).id);
  });

  test('all minted identifiers are ASCII NCName-safe for Arabic input', () => {
    const names = ['التحقق من الهوية', 'مراجعة كبار الموظفين', 'إشعار المشرف', 'قرار الأهلية'];
    for (const [i, name] of names.entries()) {
      const m = mintIdentifier({ prefix: 'Activity', displayName: name, discriminator: String(i) });
      assert.ok(isAscii(m.id), `${m.id} ascii`);
      assert.ok(isNcNameSafe(m.id), `${m.id} ncname`);
    }
  });

  test('rejects a non-ASCII prefix', () => {
    assert.throws(() =>
      mintIdentifier({ prefix: 'نشاط', displayName: 'x', discriminator: '1' }),
    );
  });

  test('slug truncation never produces a trailing separator', () => {
    const s = slugify('a very long specification step name that exceeds the limit', 20);
    assert.ok(s.length <= 20, `${s} within limit`);
    assert.ok(!s.endsWith('_'), `${s} has no trailing separator`);
  });

  test('transliterate maps Arabic to Latin deterministically', () => {
    const a = transliterate('محمد');
    assert.equal(a, transliterate('محمد'));
    assert.ok(isAscii(a));
  });

  test('variable names reject FEEL operators', () => {
    assert.equal(isVariableNameSafe('applicationAmount'), true);
    assert.equal(isVariableNameSafe('application_amount'), true);
    assert.equal(isVariableNameSafe('application.amount'), false, 'dot is a FEEL operator');
    assert.equal(isVariableNameSafe('application-amount'), false, 'hyphen is a FEEL operator');
    assert.equal(isVariableNameSafe('مبلغ'), false, 'non-ASCII rejected');
  });

  test('job types follow the domain.action convention', () => {
    assert.equal(isJobTypeSafe('identity.verify'), true);
    assert.equal(isJobTypeSafe('crm.customer.create'), true);
    assert.equal(isJobTypeSafe('identityverify'), false, 'needs a separator');
    assert.equal(isJobTypeSafe('Identity.Verify'), false, 'lower-case only');
    assert.equal(isJobTypeSafe('هوية.تحقق'), false, 'non-ASCII rejected');
  });
});

describe('bidi-safe composition (ADR-0023 rule 9)', () => {
  test('isolates an interpolated value', () => {
    const wrapped = isolate('التحقق');
    assert.ok(wrapped.startsWith('⁨'), 'starts with FSI');
    assert.ok(wrapped.endsWith('⁩'), 'ends with PDI');
  });

  test('formatMessage isolates an Arabic parameter inside an English template', () => {
    const out = formatMessage(
      "Step '{stepName}' is automated but has no integration specification.",
      { stepName: 'التحقق من الهوية' },
    );
    assert.ok(out.includes('⁨'), 'Arabic parameter is isolated');
    assert.ok(out.includes('التحقق من الهوية'));
  });

  test('formatMessage uses named parameters and leaves unknown keys intact', () => {
    const out = formatMessage('{a} then {b}', { a: 'first' });
    assert.equal(out, 'first then {b}');
  });

  test('formatMessage does not isolate a same-direction plain value', () => {
    const out = formatMessage("Step '{stepName}' has no actor.", { stepName: 'Verify identity' });
    assert.equal(out, "Step 'Verify identity' has no actor.");
  });

  test('numeric parameters are rendered', () => {
    assert.equal(formatMessage('{n} findings', { n: 7 }), '7 findings');
  });
});
