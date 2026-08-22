/**
 * Tests for the DOCX adapter, the ZIP reader and the XML tokeniser.
 *
 * Fixtures are built here rather than committed as binaries, for two reasons: a
 * committed `.docx` is opaque in review, and building one makes the test state
 * exactly which WordprocessingML constructs it is exercising.
 *
 * The spine is the same as V1's: the obligations in provenance-and-anchoring.md
 * §8. A DOCX anchor that cannot round-trip is worth no more than a PDF one.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';

import { resolveTextAnchor } from '@asdp/provenance';
import { sliceByCodePoints, codePointLength } from '@asdp/text';
import {
  DOCX,
  DocxError,
  ZipError,
  XmlError,
  decodeXmlEntities,
  docxExtractor,
  extractDocx,
  guardSource,
  highlightForAnchor,
  localName,
  looksLikeZip,
  readZipEntries,
  readZipTextEntry,
  tokeniseXml,
  type ExtractedUnit,
} from './index.ts';

// ---------------------------------------------------------------------------
// A minimal ZIP writer — TEST ONLY
// ---------------------------------------------------------------------------

/**
 * Build a ZIP archive.
 *
 * Deliberately lives in the test file: production reads DOCX and never writes
 * one, so a writer in `zip.ts` would be unused surface area. `deflate` is
 * exercised as well as `stored`, because the production reader supports both and
 * an untested branch is an unsupported branch.
 */
function buildZip(
  files: readonly { name: string; content: string | Uint8Array; method?: 'stored' | 'deflate' }[],
): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

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

  const u16 = (v: number): Uint8Array => new Uint8Array([v & 0xff, (v >>> 8) & 0xff]);
  const u32 = (v: number): Uint8Array =>
    new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]);
  const cat = (...parts: Uint8Array[]): Uint8Array => {
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let at = 0;
    for (const p of parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  };

  for (const file of files) {
    const raw = typeof file.content === 'string' ? encoder.encode(file.content) : file.content;
    const deflated = file.method === 'deflate' ? new Uint8Array(deflateRawSync(raw)) : raw;
    const method = file.method === 'deflate' ? 8 : 0;
    const nameBytes = encoder.encode(file.name);
    const sum = crc32(raw);

    const local = cat(
      u32(0x04034b50), u16(20), u16(0), u16(method), u16(0), u16(0),
      u32(sum), u32(deflated.length), u32(raw.length),
      u16(nameBytes.length), u16(0), nameBytes, deflated,
    );
    chunks.push(local);

    central.push(cat(
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(method), u16(0), u16(0),
      u32(sum), u32(deflated.length), u32(raw.length),
      u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes,
    ));
    offset += local.length;
  }

  const directory = cat(...central);
  const eocd = cat(
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(directory.length), u32(offset), u16(0),
  );
  return cat(...chunks, directory, eocd);
}

// ---------------------------------------------------------------------------
// DOCX fixtures
// ---------------------------------------------------------------------------

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`;

function docxFrom(bodyXml: string, extraParts: readonly { name: string; content: string }[] = []): Uint8Array {
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${bodyXml}</w:body></w:document>`;
  return buildZip([
    { name: '[Content_Types].xml', content: CONTENT_TYPES },
    { name: 'word/document.xml', content: document, method: 'deflate' },
    ...extraParts.map((p) => ({ name: p.name, content: p.content })),
  ]);
}

/** A paragraph of one run. */
const para = (text: string, style?: string): string =>
  `<w:p>${style === undefined ? '' : `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>`}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

/** A list item at an indent level. */
const listItem = (text: string, level = 0): string =>
  `<w:p><w:pPr><w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="1"/></w:numPr></w:pPr>` +
  `<w:r><w:t>${text}</w:t></w:r></w:p>`;

/** Arabic: "Identity verification must complete within two working days." */
const ARABIC = 'يجب إكمال التحقق من الهوية خلال يومي عمل.';
/** Arabic with an embedded Latin term and digits — the bidi case. */
const MIXED_AR = 'على النظام استدعاء خدمة SADAD خلال 30 ثانية.';

// ---------------------------------------------------------------------------
// Shared assertions
// ---------------------------------------------------------------------------

/** Every unit's anchor must resolve against the canonical text. */
function assertRoundTrip(units: readonly ExtractedUnit[], canonicalText: string): void {
  assert.ok(units.length > 0, 'the fixture must produce at least one unit');
  for (const unit of units) {
    const resolution = resolveTextAnchor(unit.anchor, canonicalText);
    assert.equal(
      resolution.status,
      'resolved',
      `unit ${unit.ordinal} did not resolve: ${resolution.detail ?? ''}`,
    );
    assert.equal(resolution.text, unit.text);

    const target = unit.anchor.target;
    assert.equal(target.kind, 'docx_block', 'a DOCX adapter mints docx_block anchors');
    if (target.kind !== 'docx_block') continue;
    assert.ok(target.charStart !== undefined, 'offsets are required for verifiability');
    assert.equal(
      unit.anchor.quote,
      sliceByCodePoints(canonicalText, target.charStart as number, target.charEnd as number),
      `unit ${unit.ordinal}: the quote must equal the slice at its own offsets`,
    );
  }
}

const run = (docx: Uint8Array): ReturnType<typeof extractDocx> => extractDocx('src-1', docx);

// ---------------------------------------------------------------------------
// ZIP reader
// ---------------------------------------------------------------------------

describe('ZIP reader', () => {
  test('reads stored and deflated entries', () => {
    const zip = buildZip([
      { name: 'a.txt', content: 'stored content' },
      { name: 'b.txt', content: 'deflated content', method: 'deflate' },
    ]);
    assert.equal(readZipTextEntry(zip, 'a.txt'), 'stored content');
    assert.equal(readZipTextEntry(zip, 'b.txt'), 'deflated content');
  });

  test('lists entries in central-directory order', () => {
    const zip = buildZip([{ name: 'one' , content: '1' }, { name: 'two', content: '2' }]);
    assert.deepEqual(readZipEntries(zip).map((e) => e.name), ['one', 'two']);
  });

  test('an absent entry is undefined, not an error', () => {
    const zip = buildZip([{ name: 'a', content: 'x' }]);
    assert.equal(readZipTextEntry(zip, 'missing'), undefined);
  });

  test('round-trips Arabic and non-BMP content byte-exactly', () => {
    const payload = `${ARABIC} 📄`;
    const zip = buildZip([{ name: 'ar.txt', content: payload, method: 'deflate' }]);
    assert.equal(readZipTextEntry(zip, 'ar.txt'), payload);
  });

  test('REFUSES a truncated archive rather than returning partial entries', () => {
    const zip = buildZip([{ name: 'a', content: 'x' }]);
    assert.throws(() => readZipEntries(zip.subarray(0, zip.length - 10)), ZipError);
  });

  test('REFUSES non-ZIP bytes', () => {
    assert.throws(() => readZipEntries(new TextEncoder().encode('not a zip at all')), ZipError);
    assert.equal(looksLikeZip(new TextEncoder().encode('nope')), false);
  });

  test('looksLikeZip recognises a local file header', () => {
    assert.equal(looksLikeZip(buildZip([{ name: 'a', content: 'x' }])), true);
  });
});

// ---------------------------------------------------------------------------
// XML tokeniser
// ---------------------------------------------------------------------------

describe('XML tokeniser', () => {
  test('tokenises elements, attributes and text', () => {
    const tokens = tokeniseXml('<w:p a="1"><w:t>hi</w:t></w:p>');
    assert.deepEqual(tokens.map((t) => t.kind), ['open', 'open', 'text', 'close', 'close']);
    const first = tokens[0];
    assert.ok(first !== undefined && first.kind === 'open');
    assert.equal(first.name, 'w:p');
    assert.equal(first.attributes.get('a'), '1');
  });

  test('handles self-closing elements', () => {
    const tokens = tokeniseXml('<w:br/>');
    assert.equal(tokens.length, 1);
    assert.ok(tokens[0]?.kind === 'open' && tokens[0].selfClosing);
  });

  test('skips comments, declarations and processing instructions', () => {
    const tokens = tokeniseXml('<?xml version="1.0"?><!-- note --><a/>');
    assert.equal(tokens.length, 1);
    assert.ok(tokens[0]?.kind === 'open');
  });

  test('treats CDATA as literal text, without entity decoding', () => {
    const tokens = tokeniseXml('<a><![CDATA[5 < 6 & 7]]></a>');
    const text = tokens.find((t) => t.kind === 'text');
    assert.ok(text?.kind === 'text');
    assert.equal(text.text, '5 < 6 & 7');
  });

  test('a > inside an attribute value does not end the tag', () => {
    const tokens = tokeniseXml('<a v="1 > 0"><b/></a>');
    const first = tokens[0];
    assert.ok(first !== undefined && first.kind === 'open');
    assert.equal(first.attributes.get('v'), '1 > 0');
  });

  test('decodes the five predefined entities and numeric references', () => {
    assert.equal(decodeXmlEntities('&amp;&lt;&gt;&quot;&apos;'), '&<>"\'');
    assert.equal(decodeXmlEntities('&#65;&#x627;'), 'Aا');
  });

  test('REFUSES an unknown entity rather than leaving it in the text', () => {
    // Leaving `&nbsp;` in place would put a literal seven-character string into a
    // quote and its checksum, so the anchor would verify against text nobody wrote.
    assert.throws(() => decodeXmlEntities('a&nbsp;b'), XmlError);
  });

  test('REFUSES malformed markup rather than recovering', () => {
    assert.throws(() => tokeniseXml('<a>'), XmlError, 'unclosed element');
    assert.throws(() => tokeniseXml('<a></b>'), XmlError, 'mismatched end tag');
    assert.throws(() => tokeniseXml('</a>'), XmlError, 'stray end tag');
    assert.throws(() => tokeniseXml('<a'), XmlError, 'unterminated start tag');
    assert.throws(() => tokeniseXml('<!-- unterminated'), XmlError);
    assert.throws(() => tokeniseXml('<a><![CDATA[x'), XmlError);
  });

  test('localName strips the namespace prefix', () => {
    assert.equal(localName('w:tbl'), 'tbl');
    assert.equal(localName('body'), 'body');
  });
});

// ---------------------------------------------------------------------------
// The guard, on OOXML
// ---------------------------------------------------------------------------

describe('ingest guard — OOXML', () => {
  const options = { filename: 'brd.docx', maxBytes: 1024 * 1024 };

  test('ADMITS a Word document, deciding the kind from the archive contents', () => {
    const r = guardSource(docxFrom(para('Body text.')), options);
    assert.equal(r.accepted, true);
    if (!r.accepted) return;
    assert.equal(r.mimeType, DOCX);
    assert.equal(r.family, 'ooxml');
    assert.equal(r.kind, 'docx');
    assert.equal(r.detection.adapterSelectedBy, 'archive-contents');
    assert.equal(r.detection.encoding, 'n/a');
    assert.equal(r.rawText, undefined, 'container text is the adapter’s to assemble');
  });

  test('admits a DOCX even when the filename lies — content decides', () => {
    const r = guardSource(docxFrom(para('x')), { ...options, filename: 'notes.txt' });
    assert.equal(r.accepted, true);
    if (!r.accepted) return;
    assert.equal(r.mimeType, DOCX);
  });

  test('REFUSES an XLSX, naming spreadsheet ingestion as a separate capability', () => {
    const xlsx = buildZip([
      { name: '[Content_Types].xml', content: CONTENT_TYPES },
      { name: 'xl/workbook.xml', content: '<workbook/>' },
    ]);
    const r = guardSource(xlsx, { ...options, filename: 'rules.xlsx' });
    assert.equal(r.accepted, false);
    if (r.accepted) return;
    assert.equal(r.code, 'unsupported_ooxml_kind');
    assert.match(r.reason, /separate proposed capability/);
  });

  test('REFUSES a PPTX', () => {
    const pptx = buildZip([{ name: 'ppt/presentation.xml', content: '<p/>' }]);
    const r = guardSource(pptx, { ...options, filename: 'deck.pptx' });
    assert.equal(r.accepted, false);
    if (r.accepted) return;
    assert.equal(r.code, 'unsupported_ooxml_kind');
  });

  test('REFUSES a ZIP with no recognised OOXML part, and says what it found', () => {
    const zip = buildZip([{ name: 'readme.txt', content: 'hello' }]);
    const r = guardSource(zip, { ...options, filename: 'archive.zip' });
    assert.equal(r.accepted, false);
    if (r.accepted) return;
    assert.equal(r.code, 'unsupported_ooxml_kind');
    assert.match(r.reason, /readme\.txt/);
  });

  test('the size limit applies to OOXML too', () => {
    const r = guardSource(docxFrom(para('x')), { ...options, maxBytes: 10 });
    assert.equal(r.accepted, false);
    if (r.accepted) return;
    assert.equal(r.code, 'too_large');
  });
});

// ---------------------------------------------------------------------------
// DOCX extraction
// ---------------------------------------------------------------------------

describe('DOCX extraction', () => {
  test('extracts paragraphs with resolvable anchors', () => {
    const out = run(docxFrom(para('First paragraph.') + para('Second paragraph.')));
    assert.equal(out.extractorVersion, 'docx@1');
    assert.deepEqual(out.units.map((u) => u.text), ['First paragraph.', 'Second paragraph.']);
    assert.deepEqual(out.units.map((u) => u.type), ['paragraph', 'paragraph']);
    assertRoundTrip(out.units, out.canonicalText);
  });

  test('anchors carry BOTH the block address and the character offsets', () => {
    const out = run(docxFrom(para('Only one.')));
    const target = out.units[0]?.anchor.target;
    assert.ok(target?.kind === 'docx_block');
    assert.equal(target.blockPath, 'body/p[0]');
    assert.equal(target.runStart, 0);
    assert.equal(target.runEnd, 1);
    assert.equal(target.charStart, 0);
    assert.equal(target.charEnd, codePointLength('Only one.'));
  });

  test('block paths are stable and distinguish siblings', () => {
    const out = run(docxFrom(para('a') + para('b') + para('c')));
    assert.deepEqual(
      out.units.map((u) => (u.anchor.target.kind === 'docx_block' ? u.anchor.target.blockPath : '')),
      ['body/p[0]', 'body/p[1]', 'body/p[2]'],
    );
  });

  test('joins multiple runs into one paragraph, and counts every run', () => {
    const body = '<w:p><w:r><w:t xml:space="preserve">The system </w:t></w:r>' +
      '<w:r><w:rPr><w:b/></w:rPr><w:t>must</w:t></w:r>' +
      '<w:r><w:t xml:space="preserve"> respond.</w:t></w:r></w:p>';
    const out = run(docxFrom(body));
    assert.equal(out.units[0]?.text, 'The system must respond.');
    const target = out.units[0]?.anchor.target;
    assert.ok(target?.kind === 'docx_block');
    assert.equal(target.runEnd, 3, 'three runs, including the formatted one');
    assertRoundTrip(out.units, out.canonicalText);
  });

  test('recognises headings and their depth', () => {
    const out = run(docxFrom(para('Scope', 'Heading1') + para('Detail', 'Heading3') + para('Body')));
    assert.deepEqual(out.units.map((u) => u.type), ['heading', 'heading', 'paragraph']);
    assert.deepEqual(out.units.map((u) => u.depth), [1, 3, undefined]);
  });

  test('recognises list items and their indent level', () => {
    const out = run(docxFrom(listItem('top') + listItem('nested', 1)));
    assert.deepEqual(out.units.map((u) => u.type), ['listItem', 'listItem']);
    assert.deepEqual(out.units.map((u) => u.depth), [0, 1]);
  });

  test('extracts table cells as units, in row-major order, and reports the limitation', () => {
    const body =
      '<w:tbl><w:tr>' +
      `<w:tc>${para('Condition')}</w:tc><w:tc>${para('Action')}</w:tc>` +
      '</w:tr><w:tr>' +
      `<w:tc>${para('Amount > 1000')}</w:tc><w:tc>${para('Escalate')}</w:tc>` +
      '</w:tr></w:tbl>';
    const out = run(docxFrom(body));
    assert.deepEqual(out.units.map((u) => u.text), ['Condition', 'Action', 'Amount > 1000', 'Escalate']);
    assert.ok(out.units.every((u) => u.type === 'tableCell'));
    assert.deepEqual(
      out.units.map((u) => (u.anchor.target.kind === 'docx_block' ? u.anchor.target.blockPath : '')),
      [
        'body/tbl[0]/tr[0]/tc[0]/p[0]',
        'body/tbl[0]/tr[0]/tc[1]/p[0]',
        'body/tbl[0]/tr[1]/tc[0]/p[0]',
        'body/tbl[0]/tr[1]/tc[1]/p[0]',
      ],
    );
    assert.ok(out.limitations.some((l) => /merged cells/.test(l)));
    assertRoundTrip(out.units, out.canonicalText);
  });

  test('tabs and line breaks become whitespace inside a run', () => {
    const body = '<w:p><w:r><w:t>A</w:t><w:tab/><w:t>B</w:t><w:br/><w:t>C</w:t></w:r></w:p>';
    const out = run(docxFrom(body));
    assert.equal(out.units[0]?.text, 'A\tB\nC');
    assertRoundTrip(out.units, out.canonicalText);
  });

  test('ACCEPTS tracked insertions and DROPS tracked deletions', () => {
    const body =
      '<w:p>' +
      '<w:r><w:t xml:space="preserve">The limit is </w:t></w:r>' +
      '<w:del><w:r><w:delText>500</w:delText></w:r></w:del>' +
      '<w:ins><w:r><w:t>1000</w:t></w:r></w:ins>' +
      '<w:r><w:t> AED.</w:t></w:r>' +
      '</w:p>';
    const out = run(docxFrom(body));
    assert.equal(out.units[0]?.text, 'The limit is 1000 AED.');
    assert.ok(!(out.units[0]?.text ?? '').includes('500'), 'a deletion is not evidence');
    assert.ok(out.limitations.some((l) => /tracked deletions/.test(l)));
  });

  test('drops field instruction codes, which are not document content', () => {
    const body =
      '<w:p><w:r><w:instrText> TOC \\o "1-3" </w:instrText></w:r>' +
      '<w:r><w:t>Real text.</w:t></w:r></w:p>';
    const out = run(docxFrom(body));
    assert.equal(out.units[0]?.text, 'Real text.');
  });

  test('an empty paragraph produces no unit but still occupies a line', () => {
    const out = run(docxFrom(para('Before.') + '<w:p/>' + para('After.')));
    assert.deepEqual(out.units.map((u) => u.text), ['Before.', 'After.']);
    // The blank line is kept: dropping it would shift every later offset.
    assertRoundTrip(out.units, out.canonicalText);
    assert.match(out.canonicalText, /Before\.\n\nAfter\./);
  });

  test('reports the parts it did not read', () => {
    const out = run(
      docxFrom(para('Body.'), [
        { name: 'word/footnotes.xml', content: '<footnotes/>' },
        { name: 'word/comments.xml', content: '<comments/>' },
        { name: 'word/header1.xml', content: '<hdr/>' },
        { name: 'word/media/image1.png', content: 'not really a png' },
      ]),
    );
    const joined = out.limitations.join(' | ');
    assert.match(joined, /footnotes/);
    assert.match(joined, /comments/);
    assert.match(joined, /headers and footers/);
    assert.match(joined, /embedded images/);
  });

  test('a DOCX has no pages, because pagination is a rendering property', () => {
    assert.deepEqual(run(docxFrom(para('x'))).pages, []);
  });

  test('REFUSES an archive with no document part', () => {
    const zip = buildZip([{ name: 'other.xml', content: '<x/>' }]);
    assert.throws(() => run(zip), DocxError);
  });

  test('REFUSES a malformed document part rather than extracting partially', () => {
    const broken = buildZip([{ name: 'word/document.xml', content: '<w:body><w:p>' }]);
    assert.throws(() => run(broken), DocxError);
  });

  test('the extractor is selected by media type and nothing else', () => {
    const extractor = docxExtractor();
    assert.equal(extractor.supports(DOCX), true);
    assert.equal(extractor.supports('text/plain'), false);
    assert.equal(extractor.supports('application/pdf'), false);
  });
});

// ---------------------------------------------------------------------------
// Arabic and mixed-direction DOCX
// ---------------------------------------------------------------------------

describe('DOCX — Arabic and mixed Arabic/English', () => {
  test('Arabic text is extracted byte-exactly, in logical order', () => {
    const out = run(docxFrom(para(ARABIC)));
    assert.equal(out.units[0]?.text, ARABIC, 'a DOCX stores logical order by construction');
    assert.equal(out.units[0]?.direction, 'rtl');
    assert.equal(out.units[0]?.language, 'ar');
    assertRoundTrip(out.units, out.canonicalText);
  });

  test('an embedded Latin run inside Arabic keeps its reading order', () => {
    const out = run(docxFrom(para(MIXED_AR)));
    const text = out.units[0]?.text ?? '';
    assert.equal(text, MIXED_AR);
    assert.ok(text.includes('SADAD'), 'the Latin term must not be reversed');
    assert.ok(text.includes('30'), 'digits must not be reversed');
  });

  test('a mixed range paints several tiling segments, with counterFlow marked', () => {
    const out = run(docxFrom(para(MIXED_AR)));
    const unit = out.units[0] as ExtractedUnit;
    const highlight = highlightForAnchor(unit.anchor, out.canonicalText);

    assert.equal(highlight.resolution, 'resolved');
    assert.equal(highlight.baseDirection, 'rtl');
    assert.ok(highlight.segments.length > 1, 'an Arabic span containing Latin must split');
    assert.ok(highlight.segments.some((s) => s.counterFlow));

    assert.equal(highlight.segments[0]?.start, highlight.start);
    assert.equal(highlight.segments[highlight.segments.length - 1]?.end, highlight.end);
    for (let i = 1; i < highlight.segments.length; i++) {
      assert.equal(highlight.segments[i]?.start, highlight.segments[i - 1]?.end);
    }
    assert.equal(highlight.segments.map((s) => s.text).join(''), unit.text);
  });

  test('a bilingual document tags each block with its own language and direction', () => {
    const out = run(docxFrom(para('The system must respond.') + para(ARABIC) + para(MIXED_AR)));
    assert.deepEqual(out.units.map((u) => u.language), ['en', 'ar', 'ar']);
    assert.deepEqual(out.units.map((u) => u.direction), ['ltr', 'rtl', 'rtl']);
    assertRoundTrip(out.units, out.canonicalText);
  });

  test('NFC and NFD input produce identical canonical text and identical anchors', () => {
    const composed = 'إجراء التحقق من الهوية';
    const decomposed = composed.normalize('NFD');
    assert.notEqual(composed, decomposed, 'the fixture must actually decompose');

    const a = run(docxFrom(para(composed)));
    const b = run(docxFrom(para(decomposed)));
    assert.equal(a.canonicalText, b.canonicalText);
    assert.deepEqual(a.units.map((u) => u.anchor), b.units.map((u) => u.anchor));
  });

  test('non-BMP characters do not shift offsets — code points, not UTF-16 units', () => {
    const out = run(docxFrom(para('Attach 📄 now.') + para('Then sign it.')));
    assertRoundTrip(out.units, out.canonicalText);

    const second = out.units[1]?.anchor.target;
    assert.ok(second?.kind === 'docx_block');
    assert.notEqual(
      second.charStart,
      out.canonicalText.indexOf('Then sign'),
      'a code-point offset must differ from the UTF-16 index after a surrogate pair',
    );
    assert.equal(
      sliceByCodePoints(out.canonicalText, second.charStart as number, (second.charStart as number) + 4),
      'Then',
    );
  });

  test('checksum sensitivity: a one-character change never resolves silently', () => {
    const out = run(docxFrom(para('The applicant must supply a valid document.')));
    const mutated = out.canonicalText.replace('valid', 'VALID');
    const resolution = resolveTextAnchor((out.units[0] as ExtractedUnit).anchor, mutated);
    assert.notEqual(resolution.status, 'resolved');
  });

  test('Arabic survives the deflate round trip inside the archive', () => {
    // The document part is deflated in every fixture here, so a corruption in the
    // inflater would show up as mangled Arabic rather than as an exception.
    const out = run(docxFrom(para(ARABIC)));
    assert.equal(out.canonicalText, ARABIC);
  });
});
