/**
 * Tests for @asdp/provenance.
 *
 * Obligations from provenance-and-anchoring.md §8:
 *   1. round-trip: resolve(anchor) returns the stored span
 *   2. checksum sensitivity: a one-character mutation is never silently resolved
 *   3. bidi correctness on mixed Arabic/English fixtures
 *   4. normalisation invariance
 *   5. non-BMP safety
 *   6. tolerant quote location across Arabic orthographic variation
 *   7. an unlocatable quote never produces evidence
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { normalise, sliceByCodePoints } from '@asdp/text';
import {
  locateQuote,
  mayBecomeEvidence,
  resolveTextAnchor,
  assertAnchorResolvable,
  spanChecksum,
  describeAnchor,
  type ProvenanceAnchor,
} from './index.ts';

const EXTRACTOR = 'test-extractor@1';

const AR_DOC = normalise(
  'سياسة التحقق من الهوية\n\n' +
    'يجب إتمام التحقق من الهوية خلال ثلاثة أيام عمل من تاريخ تقديم الطلب.\n' +
    'الطلبات التي تتجاوز ٥٠٠٠٠ درهم تتطلب مراجعة من كبار الموظفين.\n',
).text;

const MIXED_DOC = normalise(
  'Section 3.1 — Identity verification\n' +
    'The step التحقق من الهوية must complete within 3 business days.\n' +
    'Applications above AED 50,000 require senior review.\n',
).text;

function anchorFor(text: string, start: number, end: number): ProvenanceAnchor {
  const span = sliceByCodePoints(text, start, end);
  const n = normalise(span);
  return {
    sourceId: 'src-1',
    target: { kind: 'text_range', charStart: start, charEnd: end },
    quote: span,
    quoteChecksum: spanChecksum(span),
    language: n.primaryLanguage,
    direction: n.direction,
    precision: 'exact',
    extractorVersion: EXTRACTOR,
  };
}

describe('anchor round-trip (obligation 1)', () => {
  test('resolves an Arabic span to exactly the stored text', () => {
    const start = AR_DOC.indexOf('يجب');
    const cpStart = Array.from(AR_DOC.slice(0, start)).length;
    const a = anchorFor(AR_DOC, cpStart, cpStart + 3);
    const r = resolveTextAnchor(a, AR_DOC);
    assert.equal(r.status, 'resolved');
    assert.equal(r.text, 'يجب');
  });

  test('resolves an English span', () => {
    const a = anchorFor(MIXED_DOC, 0, 7);
    const r = resolveTextAnchor(a, MIXED_DOC);
    assert.equal(r.status, 'resolved');
    assert.equal(r.text, 'Section');
  });

  test('every unit of a document round-trips', () => {
    for (const [i, line] of MIXED_DOC.split('\n').entries()) {
      if (line.length === 0) continue;
      const at = MIXED_DOC.indexOf(line);
      const cpStart = Array.from(MIXED_DOC.slice(0, at)).length;
      const cpEnd = cpStart + Array.from(line).length;
      const a = anchorFor(MIXED_DOC, cpStart, cpEnd);
      const r = resolveTextAnchor(a, MIXED_DOC);
      assert.equal(r.status, 'resolved', `line ${i} must resolve`);
      assert.equal(r.text, line);
    }
  });
});

describe('checksum sensitivity (obligation 2)', () => {
  test('a one-character mutation is never silently resolved', () => {
    const a = anchorFor(MIXED_DOC, 0, 7);
    const mutated = 'Xection' + MIXED_DOC.slice(7);
    const r = resolveTextAnchor(a, mutated);
    assert.notEqual(r.status, 'resolved', 'must not report resolved');
    assert.ok(r.status === 'drifted' || r.status === 'broken');
  });

  test('deleting the quote entirely breaks the anchor', () => {
    const a = anchorFor(MIXED_DOC, 0, 7);
    const r = resolveTextAnchor(a, MIXED_DOC.replace('Section', 'XXXXXXX'));
    assert.equal(r.status, 'broken');
  });

  test('an inserted prefix drifts and is repaired with the shift recorded', () => {
    const needle = 'Applications above';
    const at = Array.from(MIXED_DOC.slice(0, MIXED_DOC.indexOf(needle))).length;
    const a = anchorFor(MIXED_DOC, at, at + Array.from(needle).length);

    const shifted = 'PREAMBLE LINE\n' + MIXED_DOC;
    const r = resolveTextAnchor(a, shifted);
    assert.equal(r.status, 'drifted');
    assert.equal(r.repairedStart, at + Array.from('PREAMBLE LINE\n').length);
    assert.ok((r.detail ?? '').includes('shifted'));
  });

  test('a shift beyond the drift window is broken, not repaired', () => {
    const needle = 'Section';
    const a = anchorFor(MIXED_DOC, 0, Array.from(needle).length);
    const shifted = 'x'.repeat(500) + MIXED_DOC;
    const r = resolveTextAnchor(a, shifted);
    assert.equal(r.status, 'broken', 'drift repair must be bounded');
  });

  test('assertAnchorResolvable throws on a broken anchor (invariant D1)', () => {
    const a = anchorFor(MIXED_DOC, 0, 7);
    assert.throws(
      () => assertAnchorResolvable(a, MIXED_DOC.replace('Section', 'XXXXXXX')),
      /unresolvable anchor/,
    );
  });

  test('assertAnchorResolvable accepts a drifted anchor', () => {
    const needle = 'Applications';
    const at = Array.from(MIXED_DOC.slice(0, MIXED_DOC.indexOf(needle))).length;
    const a = anchorFor(MIXED_DOC, at, at + needle.length);
    assert.doesNotThrow(() => assertAnchorResolvable(a, 'AB\n' + MIXED_DOC));
  });
});

describe('bidi and non-BMP correctness (obligations 3, 5)', () => {
  test('an Arabic anchor records rtl direction and ar language', () => {
    const at = Array.from(MIXED_DOC.slice(0, MIXED_DOC.indexOf('التحقق'))).length;
    const a = anchorFor(MIXED_DOC, at, at + Array.from('التحقق من الهوية').length);
    assert.equal(a.direction, 'rtl');
    assert.equal(a.language, 'ar');
    assert.equal(resolveTextAnchor(a, MIXED_DOC).status, 'resolved');
  });

  test('an anchor spanning a supplementary-plane character resolves exactly', () => {
    const doc = normalise('before \u{1F4C4} after التحقق').text;
    const a = anchorFor(doc, 7, 8);
    assert.equal(a.quote, '\u{1F4C4}');
    const r = resolveTextAnchor(a, doc);
    assert.equal(r.status, 'resolved');
    assert.equal(r.text, '\u{1F4C4}');
  });

  test('offsets after a supplementary-plane character stay aligned', () => {
    const doc = normalise('a\u{1F600}bcd').text;
    const a = anchorFor(doc, 2, 5);
    assert.equal(a.quote, 'bcd');
    assert.equal(resolveTextAnchor(a, doc).status, 'resolved');
  });
});

describe('normalisation invariance (obligation 4)', () => {
  test('the same logical content in NFC and NFD yields identical anchors', () => {
    const nfc = normalise('أحمد علي'.normalize('NFC')).text;
    const nfd = normalise('أحمد علي'.normalize('NFD')).text;
    assert.equal(nfc, nfd);
    const a1 = anchorFor(nfc, 0, 4);
    const a2 = anchorFor(nfd, 0, 4);
    assert.equal(a1.quoteChecksum, a2.quoteChecksum);
  });
});

describe('quote location — the post_hoc citation path (obligation 6)', () => {
  test('locates an exact quote and mints an exact anchor', () => {
    const out = locateQuote({
      sourceId: 'src-1',
      storedText: AR_DOC,
      quote: 'خلال ثلاثة أيام عمل',
      extractorVersion: EXTRACTOR,
    });
    assert.equal(out.status, 'located');
    if (out.status !== 'located') return;
    assert.equal(out.anchor.precision, 'exact');
    assert.equal(resolveTextAnchor(out.anchor, AR_DOC).status, 'resolved');
    assert.ok(mayBecomeEvidence(out));
  });

  test('locates a quote that differs by diacritics', () => {
    const doc = normalise('يَجِب إتمام التحقق').text;
    const out = locateQuote({
      sourceId: 'src-1',
      storedText: doc,
      quote: 'يجب إتمام',
      extractorVersion: EXTRACTOR,
    });
    assert.equal(out.status, 'located');
    if (out.status !== 'located') return;
    // The minted anchor quotes the STORED form, diacritics intact.
    assert.equal(out.anchor.quote, 'يَجِب إتمام');
    assert.equal(resolveTextAnchor(out.anchor, doc).status, 'resolved');
  });

  test('locates a quote that differs by Alef variant', () => {
    const doc = normalise('الطلبات التي تتجاوز الحد').text;
    const out = locateQuote({
      sourceId: 'src-1',
      storedText: doc,
      quote: 'الطلبات التى تتجاوز',
      extractorVersion: EXTRACTOR,
    });
    assert.equal(out.status, 'located');
  });

  test('locates a quote that differs by digit form', () => {
    const out = locateQuote({
      sourceId: 'src-1',
      storedText: AR_DOC,
      quote: 'تتجاوز 50000 درهم',
      extractorVersion: EXTRACTOR,
    });
    assert.equal(out.status, 'located');
    if (out.status !== 'located') return;
    assert.ok(out.anchor.quote.includes('٥٠٠٠٠'), 'stored form keeps Arabic-Indic digits');
  });

  test('locates a quote whose whitespace differs from the source', () => {
    const doc = normalise('يجب   إتمام\nالتحقق من الهوية').text;
    const out = locateQuote({
      sourceId: 'src-1',
      storedText: doc,
      quote: 'يجب إتمام التحقق',
      extractorVersion: EXTRACTOR,
    });
    assert.equal(out.status, 'located');
  });

  test('locates a quote containing Arabic presentation forms', () => {
    const out = locateQuote({
      sourceId: 'src-1',
      storedText: AR_DOC,
      // "الهوية" written with presentation forms, as PDF extraction often yields
      quote: 'ﺍﻟﻬﻮﻳﺔ',
      extractorVersion: EXTRACTOR,
    });
    assert.notEqual(out.status, 'not_found');
  });

  test('REJECTS an unlocatable quote — it never becomes evidence (obligation 7)', () => {
    const out = locateQuote({
      sourceId: 'src-1',
      storedText: AR_DOC,
      quote: 'هذا النص غير موجود في المستند إطلاقاً',
      extractorVersion: EXTRACTOR,
    });
    assert.equal(out.status, 'not_found');
    assert.equal(mayBecomeEvidence(out), false);
  });

  test('rejects an empty quote', () => {
    const out = locateQuote({
      sourceId: 'src-1',
      storedText: AR_DOC,
      quote: '   ',
      extractorVersion: EXTRACTOR,
    });
    assert.equal(out.status, 'not_found');
  });

  test('a repeated quote is ambiguous and yields no anchor without a hint', () => {
    const doc = normalise('التحقق من الهوية ثم التحقق من الهوية مرة أخرى').text;
    const out = locateQuote({
      sourceId: 'src-1',
      storedText: doc,
      quote: 'التحقق من الهوية',
      extractorVersion: EXTRACTOR,
    });
    assert.equal(out.status, 'ambiguous');
    if (out.status !== 'ambiguous') return;
    assert.equal(out.matchCount, 2);
    assert.equal(out.anchor, undefined);
    assert.equal(mayBecomeEvidence(out), false, 'ambiguous without hint cannot be evidence');
  });

  test('a repeated quote with a locating hint mints a page-precision anchor', () => {
    const doc = normalise('التحقق من الهوية ثم التحقق من الهوية مرة أخرى').text;
    const out = locateQuote({
      sourceId: 'src-1',
      storedText: doc,
      quote: 'التحقق من الهوية',
      extractorVersion: EXTRACTOR,
      hint: { page: 7 },
    });
    assert.equal(out.status, 'ambiguous');
    if (out.status !== 'ambiguous') return;
    assert.ok(out.anchor !== undefined);
    assert.equal(out.anchor?.precision, 'page', 'precision demoted, not exact');
    assert.equal(mayBecomeEvidence(out), true);
  });

  test('a precision ceiling caps the minted anchor (diagram images can never be exact)', () => {
    const out = locateQuote({
      sourceId: 'src-diagram',
      storedText: MIXED_DOC,
      quote: 'senior review',
      extractorVersion: EXTRACTOR,
      maxPrecision: 'page',
    });
    assert.equal(out.status, 'located');
    if (out.status !== 'located') return;
    assert.equal(out.anchor.precision, 'page');
  });
});

describe('anchor description', () => {
  test('renders each anchor kind for the traceability matrix', () => {
    const base = {
      sourceId: 's',
      quote: 'q',
      quoteChecksum: 'c',
      language: 'en',
      direction: 'ltr',
      precision: 'exact',
      extractorVersion: EXTRACTOR,
    } as const;
    assert.equal(
      describeAnchor({ ...base, target: { kind: 'text_range', charStart: 10, charEnd: 20 } }),
      'chars 10–20',
    );
    assert.equal(
      describeAnchor({
        ...base,
        target: { kind: 'pdf_region', page: 7, rects: [], charStart: 3, charEnd: 9 },
      }),
      'p.7 chars 3–9',
    );
    assert.equal(
      describeAnchor({ ...base, target: { kind: 'sheet_cell', sheet: 'Rules', a1Range: 'B4:F27' } }),
      'Rules!B4:F27',
    );
    assert.equal(
      describeAnchor({
        ...base,
        target: { kind: 'dmn_rule', fileId: 'f', decisionId: 'assess', ruleId: '3' },
      }),
      'decision assess rule 3',
    );
  });
});
