/**
 * Tests for @asdp/ingestion.
 *
 * The obligations in provenance-and-anchoring.md §8 are the spine of this file:
 * round-trip, checksum sensitivity, bidi correctness, normalisation invariance,
 * non-BMP safety, quote location and rejection. Those are CI assertions the
 * specification demands per adapter, not tests invented for coverage.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { codePointLength, sliceByCodePoints } from '@asdp/text';
import { resolveTextAnchor, spanChecksum } from '@asdp/provenance';
import {
  assertAnchorContractsAgree,
  extractFreeText,
  extractMarkdown,
  freeTextExtractor,
  markdownExtractor,
  selectExtractor,
  defaultExtractors,
  guardSource,
  hashBytes,
  highlightForAnchor,
  highlightForRange,
  normaliseSource,
  segmentRange,
  sniffBinary,
  type ExtractedUnit,
} from './index.ts';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

/** Arabic: "Identity verification must complete within two working days." */
const ARABIC = 'يجب إكمال التحقق من الهوية خلال يومي عمل.';

/** Mixed direction — the normal case in a bilingual BRD, not an edge case. */
const MIXED = `The system must call the SADAD endpoint.

على النظام استدعاء خدمة SADAD خلال 30 ثانية.`;

const GUARD_OPTIONS = { filename: 'brd.txt', maxBytes: 1024 * 1024 };

// ---------------------------------------------------------------------------
// The ingest guard
// ---------------------------------------------------------------------------

describe('ingest guard — content type by magic bytes, not by claim', () => {
  test('accepts UTF-8 plain text', () => {
    const r = guardSource(utf8('Hello.'), GUARD_OPTIONS);
    assert.equal(r.accepted, true);
    if (!r.accepted) return;
    assert.equal(r.mimeType, 'text/plain');
    assert.equal(r.kind, 'freetext');
    assert.equal(r.detection.encoding, 'utf-8');
    assert.equal(r.rawText, 'Hello.');
  });

  test('accepts Arabic text byte-exactly', () => {
    const r = guardSource(utf8(ARABIC), GUARD_OPTIONS);
    assert.equal(r.accepted, true);
    if (!r.accepted) return;
    assert.equal(r.rawText, ARABIC, 'Arabic must round-trip through the guard unchanged');
  });

  test('strips a UTF-8 BOM but records that it was present', () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('Hi.')]);
    const r = guardSource(withBom, GUARD_OPTIONS);
    assert.equal(r.accepted, true);
    if (!r.accepted) return;
    assert.equal(r.rawText, 'Hi.', 'the BOM must not become the first character of the text');
    assert.equal(r.detection.encoding, 'utf-8-bom');
  });

  test('selects the Markdown adapter from the extension, and records that it did', () => {
    const r = guardSource(utf8('# Title'), { ...GUARD_OPTIONS, filename: 'spec.md' });
    assert.equal(r.accepted, true);
    if (!r.accepted) return;
    assert.equal(r.mimeType, 'text/markdown');
    assert.equal(r.kind, 'markdown');
    assert.equal(r.detection.adapterSelectedBy, 'extension');
  });

  test('REFUSES a PDF, and names the slice that will parse it', () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
    const r = guardSource(pdf, { ...GUARD_OPTIONS, filename: 'brd.pdf' });
    assert.equal(r.accepted, false);
    if (r.accepted) return;
    assert.equal(r.code, 'unsupported_binary_type');
    assert.equal(r.detectedMimeType, 'application/pdf');
    assert.match(r.reason, /PDF/);
    assert.match(
      r.reason,
      /V2-PDF/,
      'the refusal must name the slice that will parse it — PDF moved to V2-PDF',
    );
  });

  test('REFUSES a PDF even when the filename claims .txt — content wins', () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
    const r = guardSource(pdf, { ...GUARD_OPTIONS, filename: 'definitely-text.txt' });
    assert.equal(r.accepted, false, 'the extension must never admit a file the content refutes');
  });

  test('REFUSES a PNG and an executable by signature', () => {
    const cases: readonly (readonly [string, Uint8Array])[] = [
      ['png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      ['exe', new Uint8Array([0x4d, 0x5a, 0x90, 0x00])],
      ['gzip', new Uint8Array([0x1f, 0x8b, 0x08, 0x00])],
    ];
    for (const [label, bytes] of cases) {
      const r = guardSource(bytes, GUARD_OPTIONS);
      assert.equal(r.accepted, false, `${label} must be refused`);
      if (!r.accepted) assert.equal(r.code, 'unsupported_binary_type');
    }
  });

  test('a truncated ZIP is refused as an unreadable archive, not mis-parsed', () => {
    const r = guardSource(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]), GUARD_OPTIONS);
    assert.equal(r.accepted, false);
    if (r.accepted) return;
    assert.equal(r.code, 'unreadable_archive');
  });

  test('REFUSES UTF-16 rather than transcoding it silently', () => {
    const utf16 = new Uint8Array([0xff, 0xfe, 0x48, 0x00, 0x69, 0x00]);
    const r = guardSource(utf16, GUARD_OPTIONS);
    assert.equal(r.accepted, false);
    if (r.accepted) return;
    assert.equal(r.code, 'unsupported_text_encoding');
    assert.match(r.reason, /UTF-16 LE/);
  });

  test('REFUSES invalid UTF-8 rather than substituting replacement characters', () => {
    // 0xC3 starts a two-byte sequence; 0x28 cannot continue it.
    const broken = new Uint8Array([0x41, 0xc3, 0x28, 0x42]);
    const r = guardSource(broken, GUARD_OPTIONS);
    assert.equal(r.accepted, false);
    if (r.accepted) return;
    assert.equal(r.code, 'undecodable_text');
  });

  test('REFUSES text containing NUL bytes', () => {
    const r = guardSource(new Uint8Array([0x41, 0x00, 0x42]), GUARD_OPTIONS);
    assert.equal(r.accepted, false);
    if (r.accepted) return;
    assert.equal(r.code, 'embedded_nul');
  });

  test('enforces the size limit, and reports both sizes', () => {
    const r = guardSource(utf8('abcdefghij'), { ...GUARD_OPTIONS, maxBytes: 5 });
    assert.equal(r.accepted, false);
    if (r.accepted) return;
    assert.equal(r.code, 'too_large');
    assert.match(r.reason, /10 bytes/);
    assert.match(r.reason, /5-byte limit/);
  });

  test('refuses an empty upload', () => {
    const r = guardSource(new Uint8Array(0), GUARD_OPTIONS);
    assert.equal(r.accepted, false);
    if (r.accepted) return;
    assert.equal(r.code, 'empty');
  });

  test('hashes the RAW bytes, so identical content deduplicates and different content does not', () => {
    assert.equal(hashBytes(utf8('same')), hashBytes(utf8('same')));
    assert.notEqual(hashBytes(utf8('same')), hashBytes(utf8('same ')));
    assert.match(hashBytes(utf8('x')), /^[0-9a-f]{64}$/);
  });

  test('computes the hash even for a refused source, so refusals are attributable', () => {
    const r = guardSource(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), GUARD_OPTIONS);
    assert.match(r.sha256, /^[0-9a-f]{64}$/);
  });

  test('sniffBinary returns null for text', () => {
    assert.equal(sniffBinary(utf8('plain text')), null);
    assert.equal(sniffBinary(utf8(ARABIC)), null);
  });
});

// ---------------------------------------------------------------------------
// Anchor soundness — the obligations in provenance-and-anchoring.md §8
// ---------------------------------------------------------------------------

/** Every unit's anchor must resolve against the text it was extracted from. */
function assertRoundTrip(units: readonly ExtractedUnit[], text: string): void {
  assert.ok(units.length > 0, 'the fixture must produce at least one unit');
  for (const unit of units) {
    const resolution = resolveTextAnchor(unit.anchor, text);
    assert.equal(
      resolution.status,
      'resolved',
      `unit ${unit.ordinal} did not resolve: ${resolution.detail ?? ''}`,
    );
    assert.equal(resolution.text, unit.text, `unit ${unit.ordinal} resolved to different text`);
    assert.equal(unit.anchor.quote, unit.text, 'the quote must equal the unit text');

    const target = unit.anchor.target;
    assert.equal(target.kind, 'text_range', 'a text adapter mints text_range anchors only');
    if (target.kind !== 'text_range') continue;
    assert.equal(
      unit.anchor.quote,
      sliceByCodePoints(text, target.charStart, target.charEnd),
      `unit ${unit.ordinal}: the quote must equal the slice at its own offsets`,
    );
  }
}

describe('anchor obligations (provenance-and-anchoring.md §8)', () => {
  test('OBLIGATION 1 — round-trip, free text', () => {
    const text = normaliseSource('First para.\n\nSecond para.\n').text;
    assertRoundTrip(extractFreeText('src-1', text).units, text);
  });

  test('OBLIGATION 1 — round-trip, Markdown with every construct', () => {
    const raw = [
      '---',
      'title: ignored front matter',
      '---',
      '# Heading one',
      '',
      'A paragraph that runs',
      'across two lines.',
      '',
      '## Heading two',
      '',
      '- first item',
      '- second item',
      '  - nested item',
      '',
      '1. numbered item',
      '',
      '> quoted line one',
      '> quoted line two',
      '',
      '```',
      'code line',
      '```',
      '',
      '---',
      '',
      'Final paragraph.',
    ].join('\n');
    const text = normaliseSource(raw).text;
    assertRoundTrip(extractMarkdown('src-2', text).units, text);
  });

  test('OBLIGATION 1 — round-trip, Arabic and mixed direction', () => {
    for (const raw of [ARABIC, MIXED]) {
      const text = normaliseSource(raw).text;
      assertRoundTrip(extractFreeText('src-3', text).units, text);
      assertRoundTrip(extractMarkdown('src-4', text).units, text);
    }
  });

  test('OBLIGATION 2 — checksum sensitivity: one changed character is never silently RESOLVED', () => {
    const text = normaliseSource('The applicant must supply a valid identity document.').text;
    const unit = extractFreeText('src-5', text).units[0] as ExtractedUnit;

    const mutated = text.replace('valid', 'VALID');
    const resolution = resolveTextAnchor(unit.anchor, mutated);
    assert.notEqual(resolution.status, 'resolved', 'a mutated span must not resolve cleanly');
    assert.ok(['drifted', 'broken'].includes(resolution.status));
  });

  test('OBLIGATION 2 — a deleted span BREAKS the anchor rather than resolving elsewhere', () => {
    const text = normaliseSource('Alpha statement.\n\nBravo statement.').text;
    const units = extractFreeText('src-6', text).units;
    const second = units[1] as ExtractedUnit;

    const resolution = resolveTextAnchor(second.anchor, 'Alpha statement.');
    assert.equal(resolution.status, 'broken');
  });

  test('OBLIGATION 3 — bidi: a mixed range yields several segments, and they TILE the range', () => {
    const text = normaliseSource(MIXED).text;
    const units = extractFreeText('src-7', text).units;
    const arabicUnit = units.find((u) => u.direction === 'rtl');
    assert.ok(arabicUnit !== undefined, 'the mixed fixture must produce an RTL unit');

    const highlight = highlightForAnchor(arabicUnit.anchor, text);
    assert.equal(highlight.resolution, 'resolved');
    assert.ok(
      highlight.segments.length > 1,
      'an Arabic span containing "SADAD" and "30" must paint more than one segment',
    );

    // Tiling: segments must be contiguous and cover exactly the range.
    assert.equal(highlight.segments[0]?.start, highlight.start);
    assert.equal(highlight.segments[highlight.segments.length - 1]?.end, highlight.end);
    for (let i = 1; i < highlight.segments.length; i++) {
      assert.equal(
        highlight.segments[i]?.start,
        highlight.segments[i - 1]?.end,
        'a gap between segments would leave characters unhighlighted inside the quote',
      );
    }
    assert.equal(
      highlight.segments.map((s) => s.text).join(''),
      sliceByCodePoints(text, highlight.start, highlight.end),
      'the concatenated segments must equal the highlighted text exactly',
    );
  });

  test('OBLIGATION 3 — counterFlow marks the segments that run against the base direction', () => {
    const text = normaliseSource('على النظام استدعاء خدمة SADAD.').text;
    const highlight = highlightForRange('src-8', text, 0, codePointLength(text));
    assert.equal(highlight.baseDirection, 'rtl');
    const counter = highlight.segments.filter((s) => s.counterFlow);
    assert.ok(counter.length > 0, 'the Latin run inside Arabic text must be marked counterFlow');
    assert.ok(counter.every((s) => s.direction === 'ltr'));
  });

  test('OBLIGATION 4 — normalisation invariance: NFC and NFD input yield identical anchors', () => {
    // Arabic hamza-bearing text is decomposable, so NFC and NFD genuinely differ.
    const composed = 'إجراء التحقق من الهوية';
    const decomposed = composed.normalize('NFD');
    assert.notEqual(composed, decomposed, 'the fixture must actually decompose, or this proves nothing');

    const a = normaliseSource(composed);
    const b = normaliseSource(decomposed);
    assert.equal(a.text, b.text, 'both forms must normalise to the same stored text');

    const unitsA = extractFreeText('src-9', a.text).units;
    const unitsB = extractFreeText('src-9', b.text).units;
    assert.deepEqual(
      unitsA.map((u) => u.anchor),
      unitsB.map((u) => u.anchor),
      'identical logical content must produce identical anchors',
    );
  });

  test('OBLIGATION 5 — non-BMP safety: offsets are code points, not UTF-16 units', () => {
    // U+1F4C4 PAGE FACING UP is a surrogate pair in UTF-16.
    const raw = 'Attach 📄 the document.\n\nThen sign 📄 it.';
    const text = normaliseSource(raw).text;
    const units = extractFreeText('src-10', text).units;

    assertRoundTrip(units, text);

    const second = units[1] as ExtractedUnit;
    const start = second.anchor.target.kind === 'text_range' ? second.anchor.target.charStart : -1;
    assert.ok(start > 0);
    assert.notEqual(
      start,
      text.indexOf('Then sign'),
      'a code-point offset must differ from the UTF-16 index once a surrogate pair precedes it',
    );
    assert.equal(
      sliceByCodePoints(text, start, start + 4),
      'Then',
      'the code-point offset must address the right characters',
    );
  });

  test('OBLIGATION 7 — a quote that is not in the source produces no resolvable anchor', () => {
    const text = normaliseSource('The policy applies to retail customers.').text;
    const fabricated = {
      sourceId: 'src-11',
      target: { kind: 'text_range' as const, charStart: 0, charEnd: 10 },
      quote: 'a sentence that was never written',
      quoteChecksum: spanChecksum('a sentence that was never written'),
      language: 'en',
      direction: 'ltr' as const,
      precision: 'exact' as const,
      extractorVersion: 'test@1',
    };
    assert.equal(resolveTextAnchor(fabricated, text).status, 'broken');

    const highlight = highlightForAnchor(fabricated, text);
    assert.equal(highlight.resolution, 'broken');
    assert.equal(highlight.segments.length, 0, 'a broken anchor must highlight nothing');
    assert.ok(highlight.detail !== undefined, 'and must say why');
  });
});

// ---------------------------------------------------------------------------
// Adapter behaviour
// ---------------------------------------------------------------------------

describe('free-text adapter', () => {
  test('blank lines separate paragraphs; everything is a paragraph', () => {
    const text = normaliseSource('One.\n\n\nTwo.\n\nThree.').text;
    const units = extractFreeText('s', text).units;
    assert.equal(units.length, 3);
    assert.ok(units.every((u) => u.type === 'paragraph'), 'plain text carries no markup to guess at');
    assert.deepEqual(units.map((u) => u.text), ['One.', 'Two.', 'Three.']);
  });

  test('a multi-line paragraph is ONE unit spanning its newline', () => {
    const text = normaliseSource('The system must\nvalidate the request.').text;
    const units = extractFreeText('s', text).units;
    assert.equal(units.length, 1);
    assert.match(units[0]?.text ?? '', /\n/);
  });

  test('CRLF and LF input produce identical units', () => {
    const lf = normaliseSource('One.\n\nTwo.').text;
    const crlf = normaliseSource('One.\r\n\r\nTwo.').text;
    assert.deepEqual(
      extractFreeText('s', lf).units.map((u) => u.text),
      extractFreeText('s', crlf).units.map((u) => u.text),
      'the same document on two platforms must not anchor differently',
    );
  });

  test('ordinals are dense and start at zero', () => {
    const text = normaliseSource('A.\n\nB.\n\nC.').text;
    const units = extractFreeText('s', text).units;
    assert.deepEqual(units.map((u) => u.ordinal), [0, 1, 2]);
  });

  test('whitespace-only input produces no units rather than an empty one', () => {
    const text = normaliseSource('   \n\n  \t \n').text;
    assert.equal(extractFreeText('s', text).units.length, 0);
  });
});

describe('markdown adapter', () => {
  const parse = (raw: string): readonly ExtractedUnit[] => {
    const text = normaliseSource(raw).text;
    const units = extractMarkdown('s', text).units;
    assertRoundTrip(units, text);
    return units;
  };

  test('ATX headings carry depth and exclude the marker from the anchor', () => {
    const units = parse('# One\n\n### Three\n');
    assert.equal(units[0]?.type, 'heading');
    assert.equal(units[0]?.depth, 1);
    assert.equal(units[0]?.text, 'One', 'the "# " marker is not part of the heading text');
    assert.equal(units[1]?.depth, 3);
  });

  test('list items carry depth from indentation and exclude the bullet', () => {
    const units = parse('- top\n  - nested\n1. numbered\n');
    assert.deepEqual(units.map((u) => u.type), ['listItem', 'listItem', 'listItem']);
    assert.deepEqual(units.map((u) => u.text), ['top', 'nested', 'numbered']);
    assert.equal(units[0]?.depth, 0);
    assert.equal(units[1]?.depth, 1);
  });

  test('a fenced code block is one unit, and the fences are excluded', () => {
    const units = parse('Intro.\n\n```json\n{"a":1}\n{"b":2}\n```\n\nOutro.');
    const code = units.find((u) => u.type === 'codeBlock');
    assert.ok(code !== undefined);
    assert.equal(code.text, '{"a":1}\n{"b":2}');
    assert.ok(!code.text.includes('```'));
  });

  test('markdown syntax inside a fenced block does not become a heading', () => {
    const units = parse('```\n# not a heading\n- not a list\n```\n');
    assert.equal(units.length, 1);
    assert.equal(units[0]?.type, 'codeBlock');
  });

  test('consecutive block-quote lines are one unit', () => {
    const units = parse('> line one\n> line two\n\nAfter.');
    const quote = units.find((u) => u.type === 'blockQuote');
    assert.ok(quote !== undefined);
    assert.match(quote.text, /line one/);
    assert.match(quote.text, /line two/);
  });

  test('YAML front matter is skipped, so metadata never becomes citable evidence', () => {
    const units = parse('---\ntitle: Draft\nowner: nobody\n---\n\nReal content.');
    assert.equal(units.length, 1);
    assert.equal(units[0]?.text, 'Real content.');
  });

  test('an unterminated leading --- is a thematic break, not front matter', () => {
    const units = parse('---\n\nContent after a rule.');
    assert.equal(units.length, 1);
    assert.equal(units[0]?.text, 'Content after a rule.');
  });

  test('thematic breaks produce no units', () => {
    const units = parse('A.\n\n***\n\nB.');
    assert.deepEqual(units.map((u) => u.text), ['A.', 'B.']);
  });

  test('an Arabic heading is tagged rtl and ar', () => {
    const units = parse(`## ${ARABIC}\n`);
    assert.equal(units[0]?.type, 'heading');
    assert.equal(units[0]?.direction, 'rtl');
    assert.equal(units[0]?.language, 'ar');
  });

  test('extractorVersion is recorded on every anchor, for selective re-verification', () => {
    const text = normaliseSource('# Title\n').text;
    const result = extractMarkdown('s', text);
    assert.equal(result.extractorVersion, 'markdown@1');
    assert.ok(result.units.every((u) => u.anchor.extractorVersion === 'markdown@1'));
  });
});

describe('extractor registry', () => {
  const run = (mediaType: string, raw: string) => {
    const extractor = selectExtractor(defaultExtractors(), mediaType);
    return extractor.extract({
      sourceId: 's',
      data: utf8(raw),
      mediaType,
      filename: 'f',
      decodedText: raw,
    });
  };

  test('selects by media type', () => {
    assert.equal(run('text/markdown', '# Heading\n').extractorVersion, 'markdown@1');
    assert.equal(run('text/plain', '# Heading\n').extractorVersion, 'freetext@1');
    // The same input read as plain text is a paragraph, not a heading — the
    // adapter choice is a real decision, not a formality.
    assert.equal(run('text/plain', '# Heading\n').units[0]?.type, 'paragraph');
    assert.equal(run('text/markdown', '# Heading\n').units[0]?.type, 'heading');
  });

  test('the canonical text is the normalised text, and anchors resolve against it', () => {
    const out = run('text/plain', 'One.\n\nTwo.');
    assert.equal(out.canonicalText, 'One.\n\nTwo.');
    assertRoundTrip(out.units, out.canonicalText);
  });

  test('text formats report no pages and no limitations', () => {
    const out = run('text/plain', 'Body.');
    assert.deepEqual(out.pages, [], 'pagination is a rendering property these formats lack');
    assert.deepEqual(out.limitations, []);
  });

  test('a media type with no extractor is a loud error, not an empty document', () => {
    assert.throws(
      () => selectExtractor(defaultExtractors(), 'application/pdf'),
      /no text extractor supports/,
    );
  });

  test('THERE IS NO PDF EXTRACTOR in this build', () => {
    // PDF intake is V2-PDF, blocked on spike S2 and ADR-0037. Asserted rather
    // than assumed, so adding one silently fails a test.
    for (const extractor of defaultExtractors()) {
      assert.equal(extractor.supports('application/pdf'), false, `${extractor.id} must not claim PDF`);
    }
  });

  test('a text extractor without decodedText fails as a wiring defect', () => {
    assert.throws(
      () =>
        freeTextExtractor().extract({
          sourceId: 's',
          data: utf8('x'),
          mediaType: 'text/plain',
          filename: 'f',
        }),
      /requires decodedText/,
    );
    assert.ok(markdownExtractor().supports('text/markdown'));
  });
});

// ---------------------------------------------------------------------------
// Highlights
// ---------------------------------------------------------------------------

describe('highlight ranges', () => {
  test('a pure-LTR range is a single segment with no counterFlow', () => {
    const text = normaliseSource('A simple English sentence.').text;
    const segments = segmentRange(text, 0, codePointLength(text), 'ltr');
    assert.equal(segments.length, 1);
    assert.equal(segments[0]?.counterFlow, false);
  });

  test('an all-neutral range is one neutral segment, not zero', () => {
    const text = normaliseSource('12345 -- 67890').text;
    const segments = segmentRange(text, 0, codePointLength(text), 'ltr');
    assert.equal(segments.length, 1);
    assert.equal(segments[0]?.direction, 'neutral');
  });

  test('an empty range yields no segments', () => {
    assert.deepEqual(segmentRange('abc', 1, 1, 'ltr'), []);
  });

  test('highlightForRange clamps out-of-bounds offsets rather than throwing', () => {
    const text = normaliseSource('Short.').text;
    const h = highlightForRange('s', text, 0, 9999);
    assert.equal(h.end, codePointLength(text));
    assert.equal(h.resolution, 'resolved');
  });

  test('a non-text anchor kind is reported as unhighlightable, not silently empty', () => {
    const h = highlightForAnchor(
      {
        sourceId: 's',
        target: { kind: 'image_region', imageId: 'img-1', rect: { x: 0, y: 0, w: 1, h: 1 } },
        quote: 'x',
        quoteChecksum: spanChecksum('x'),
        language: 'en',
        direction: 'ltr',
        precision: 'page',
        extractorVersion: 'test@1',
      },
      'irrelevant',
    );
    assert.equal(h.resolution, 'broken');
    assert.match(String(h.detail), /image_region/);
  });
});

// ---------------------------------------------------------------------------
// Contract agreement
// ---------------------------------------------------------------------------

describe('anchor contract', () => {
  test('the zod schema and the pure type agree in both directions', () => {
    // The real assertion is at compile time; this proves it is still wired in.
    assert.equal(assertAnchorContractsAgree(), true);
  });
});
