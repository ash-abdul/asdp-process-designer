/**
 * Tests for V3 intake — images, vision regions, and structural model import.
 *
 * Two properties carry most of the weight here:
 *
 *   1. an image's DIMENSIONS are read correctly, because ADR-0038 bounds checking
 *      is unenforceable without them
 *   2. a vision region outside those bounds is DROPPED, not clamped — a clamped
 *      rectangle is a different claim from the one the model made
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  BPMN_MEDIA_TYPE,
  DMN_MEDIA_TYPE,
  FORM_MEDIA_TYPE,
  ImageError,
  ModelImportError,
  extractModel,
  guardSource,
  looksLikeImage,
  modelElementIds,
  readImageInfo,
  regionsToUnits,
  unavailableVisionExtractor,
  type VisionInput,
} from './index.ts';

// ---------------------------------------------------------------------------
// Image fixtures — built byte by byte, so the headers are exactly what is claimed
// ---------------------------------------------------------------------------

function pngOf(width: number, height: number): Uint8Array {
  const be = (v: number): number[] => [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // signature
    ...be(13), 0x49, 0x48, 0x44, 0x52, // IHDR length + type
    ...be(width), ...be(height),
    8, 2, 0, 0, 0, // bit depth, colour type, compression, filter, interlace
    0, 0, 0, 0, // CRC (not verified by the reader)
  ]);
}

function gifOf(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61,
    width & 0xff, (width >> 8) & 0xff,
    height & 0xff, (height >> 8) & 0xff,
    0, 0, 0,
  ]);
}

function bmpOf(width: number, height: number): Uint8Array {
  const le = (v: number): number[] => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  return new Uint8Array([
    0x42, 0x4d, ...le(0), 0, 0, 0, 0, ...le(54),
    ...le(40), ...le(width), ...le(height),
    1, 0, 24, 0,
  ]);
}

function jpegOf(width: number, height: number): Uint8Array {
  const be16 = (v: number): number[] => [(v >> 8) & 0xff, v & 0xff];
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, ...be16(16), // SOI + APP0 with a length to skip
    0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
    0xff, 0xc0, ...be16(17), 8, // SOF0
    ...be16(height), ...be16(width),
    3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1,
  ]);
}

function webpLosslessOf(width: number, height: number): Uint8Array {
  // VP8L packs (width-1) in 14 bits then (height-1) in 14 bits.
  const bits = (width - 1) | ((height - 1) << 14);
  const le = (v: number): number[] => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46, ...le(0),
    0x57, 0x45, 0x42, 0x50,
    0x56, 0x50, 0x38, 0x4c, ...le(0),
    0x2f, // VP8L signature byte at offset 20
    ...le(bits),
  ]);
}

const GUARD = { filename: 'shot.png', maxBytes: 1024 * 1024 };

// ---------------------------------------------------------------------------

describe('image dimension reading', () => {
  test('reads PNG, GIF, BMP, JPEG and lossless WEBP dimensions', () => {
    assert.deepEqual(readImageInfo(pngOf(800, 600)), { mediaType: 'image/png', width: 800, height: 600 });
    assert.deepEqual(readImageInfo(gifOf(320, 240)), { mediaType: 'image/gif', width: 320, height: 240 });
    assert.deepEqual(readImageInfo(bmpOf(64, 48)), { mediaType: 'image/bmp', width: 64, height: 48 });
    assert.deepEqual(readImageInfo(jpegOf(1024, 768)), { mediaType: 'image/jpeg', width: 1024, height: 768 });
    assert.deepEqual(readImageInfo(webpLosslessOf(200, 100)), { mediaType: 'image/webp', width: 200, height: 100 });
  });

  test('a JPEG with several segments before the frame header still reads', () => {
    // The frame header has no fixed offset, so the reader must walk the chain.
    assert.equal(readImageInfo(jpegOf(7, 11)).width, 7);
    assert.equal(readImageInfo(jpegOf(7, 11)).height, 11);
  });

  test('REFUSES a zero dimension, which would make every bounds check vacuous', () => {
    assert.throws(() => readImageInfo(pngOf(0, 100)), ImageError);
    assert.throws(() => readImageInfo(gifOf(10, 0)), ImageError);
  });

  test('REFUSES a truncated header rather than defaulting the size', () => {
    assert.throws(() => readImageInfo(pngOf(10, 10).subarray(0, 14)), ImageError);
    assert.throws(() => readImageInfo(new Uint8Array([0xff, 0xd8, 0xff])), ImageError);
  });

  test('REFUSES non-image bytes', () => {
    assert.throws(() => readImageInfo(new TextEncoder().encode('not an image')), ImageError);
    assert.equal(looksLikeImage(new TextEncoder().encode('nope')), false);
  });

  test('a RIFF file that is not WEBP is not treated as an image', () => {
    const wav = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
    assert.equal(looksLikeImage(wav), false);
  });
});

describe('the guard admits images', () => {
  test('ADMITS a PNG, records its dimensions, and defaults the kind conservatively', () => {
    const r = guardSource(pngOf(800, 600), GUARD);
    assert.equal(r.accepted, true);
    if (!r.accepted) return;
    assert.equal(r.mimeType, 'image/png');
    assert.equal(r.family, 'image');
    // `screenshot`, not `diagram_image`: same L2 ceiling, but without the
    // element-wise confirmation obligation, which the caller opts into.
    assert.equal(r.kind, 'screenshot');
    assert.deepEqual(r.imageInfo, { mediaType: 'image/png', width: 800, height: 600 });
    assert.equal(r.rawText, undefined, 'an image has no text layer');
    assert.equal(r.detection.adapterSelectedBy, 'image-header');
  });

  test('admits an image whatever the filename claims', () => {
    const r = guardSource(pngOf(10, 10), { ...GUARD, filename: 'notes.txt' });
    assert.equal(r.accepted, true);
    if (!r.accepted) return;
    assert.equal(r.mimeType, 'image/png');
  });

  test('REFUSES an image whose header cannot be read, naming why it matters', () => {
    const r = guardSource(pngOf(10, 10).subarray(0, 14), GUARD);
    assert.equal(r.accepted, false);
    if (r.accepted) return;
    assert.equal(r.code, 'unreadable_image');
    assert.match(r.reason, /Dimensions are required/);
  });
});

describe('vision regions → units', () => {
  const input: VisionInput = {
    sourceId: 'src-1',
    imageId: 'img-1',
    data: pngOf(800, 600),
    mediaType: 'image/png',
    width: 800,
    height: 600,
    sha256: 'a'.repeat(64),
    kind: 'screenshot',
  };

  test('records the image checksum ON THE ANCHOR, so verification is not vacuous', () => {
    // Comparing the stored image row against itself would always match. The
    // anchor carrying its own record of what the image was is what makes
    // "unchanged" checkable (ADR-0038).
    const { units } = regionsToUnits(
      input,
      { regions: [{ rect: { x: 1, y: 1, w: 10, h: 10 }, text: 'Label', language: 'en', direction: 'ltr', role: 'label' }], limitations: [] },
      'vision@1',
    );
    const target = units[0]?.anchor.target;
    assert.ok(target?.kind === 'image_region');
    assert.equal(target.imageSha256, 'a'.repeat(64));
  });

  test('mints image_region anchors at PAGE precision, never exact', () => {
    const { units } = regionsToUnits(
      input,
      {
        regions: [
          { rect: { x: 10, y: 10, w: 100, h: 20 }, text: 'Submit', language: 'en', direction: 'ltr', role: 'label' },
        ],
        limitations: [],
      },
      'vision@1',
    );
    assert.equal(units.length, 1);
    assert.equal(units[0]?.anchor.target.kind, 'image_region');
    assert.equal(
      units[0]?.anchor.precision,
      'page',
      'exact precision would silently claim L1 eligibility for unverifiable content',
    );
  });

  test('DROPS an out-of-bounds region rather than clamping it', () => {
    const { units, dropped } = regionsToUnits(
      input,
      {
        regions: [
          { rect: { x: 700, y: 10, w: 200, h: 20 }, text: 'Overflows', language: 'en', direction: 'ltr', role: 'label' },
          { rect: { x: 10, y: 10, w: 50, h: 20 }, text: 'Fits', language: 'en', direction: 'ltr', role: 'label' },
        ],
        limitations: [],
      },
      'vision@1',
    );
    assert.equal(dropped, 1);
    assert.equal(units.length, 1);
    assert.equal(units[0]?.text, 'Fits');
  });

  test('drops an empty region: whitespace is not evidence', () => {
    const { units, dropped } = regionsToUnits(
      input,
      { regions: [{ rect: { x: 1, y: 1, w: 5, h: 5 }, text: '   ', language: 'en', direction: 'ltr', role: 'unknown' }], limitations: [] },
      'vision@1',
    );
    assert.equal(units.length, 0);
    assert.equal(dropped, 1);
  });

  test('Arabic region text is NFC-normalised and tagged rtl', () => {
    const arabic = 'تسجيل العميل';
    const { units } = regionsToUnits(
      input,
      { regions: [{ rect: { x: 1, y: 1, w: 50, h: 20 }, text: arabic, language: 'ar', direction: 'rtl', role: 'label' }], limitations: [] },
      'vision@1',
    );
    assert.equal(units[0]?.text, arabic);
    assert.equal(units[0]?.direction, 'rtl');
    assert.equal(units[0]?.language, 'ar');
  });
});

describe('the vision extractor refuses when unconfigured', () => {
  test('REFUSES rather than returning empty regions', async () => {
    // An empty result is indistinguishable from "the image contained no text",
    // and that difference matters: one is a configuration gap, the other a fact.
    const outcome = await unavailableVisionExtractor().extract({
      sourceId: 's', imageId: 'i', data: pngOf(10, 10), mediaType: 'image/png',
      width: 10, height: 10, sha256: 'b'.repeat(64), kind: 'screenshot',
    });
    assert.equal(outcome.kind, 'refused');
    if (outcome.kind !== 'refused') return;
    assert.match(outcome.reason, /configuration gap/);
    assert.deepEqual(outcome.degradations, ['no_vision_capability']);
    assert.ok(outcome.options.length >= 2, 'a refusal must offer concrete options');
  });
});

// ---------------------------------------------------------------------------
// Structural model import
// ---------------------------------------------------------------------------

const BPMN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="Process_1" name="Customer Onboarding">
    <bpmn:startEvent id="Start_1" name="Application received"/>
    <bpmn:userTask id="Activity_1" name="التحقق من الهوية"/>
    <bpmn:exclusiveGateway id="Gateway_1" name="Amount over 1000?"/>
    <bpmn:sequenceFlow id="Flow_1" name="yes">
      <bpmn:conditionExpression>amount &gt; 1000</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:endEvent id="End_1"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" id="Diagram_1">
    <bpmndi:BPMNShape id="Shape_1" bpmnElement="Activity_1"/>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

const DMN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/">
  <decision id="Decision_1" name="Escalation policy">
    <decisionTable id="Table_1">
      <rule id="Rule_1"><inputEntry>&gt; 1000</inputEntry><outputEntry>"escalate"</outputEntry></rule>
    </decisionTable>
  </decision>
</definitions>`;

const FORM_JSON = JSON.stringify({
  schemaVersion: 16,
  executionPlatform: 'Camunda Cloud',
  components: [
    { key: 'applicantName', label: 'Applicant name', type: 'textfield' },
    { key: 'group1', type: 'group', components: [{ key: 'amount', label: 'المبلغ', type: 'number' }] },
    { key: 'noLabel', type: 'textfield' },
  ],
});

describe('the guard recognises structural model files from CONTENT', () => {
  test('recognises BPMN by namespace, not extension', () => {
    const r = guardSource(new TextEncoder().encode(BPMN_XML), { ...GUARD, filename: 'legacy.xml' });
    assert.equal(r.accepted, true);
    if (!r.accepted) return;
    assert.equal(r.mimeType, BPMN_MEDIA_TYPE);
    assert.equal(r.family, 'model');
    assert.equal(r.kind, 'bpmn');
    assert.equal(r.detection.adapterSelectedBy, 'document-markup');
  });

  test('recognises DMN and a Camunda form', () => {
    const dmn = guardSource(new TextEncoder().encode(DMN_XML), { ...GUARD, filename: 'rules.xml' });
    assert.equal(dmn.accepted && dmn.mimeType, DMN_MEDIA_TYPE);
    const form = guardSource(new TextEncoder().encode(FORM_JSON), { ...GUARD, filename: 'f.json' });
    assert.equal(form.accepted && form.mimeType, FORM_MEDIA_TYPE);
  });

  test('a .bpmn file that is really a note is read as TEXT', () => {
    const r = guardSource(new TextEncoder().encode('Just a note about the BPMN.'), {
      ...GUARD,
      filename: 'notes.bpmn',
    });
    assert.equal(r.accepted, true);
    if (!r.accepted) return;
    assert.equal(r.mimeType, 'text/plain', 'content decides, not the extension');
  });
});

describe('structural import produces citable evidence', () => {
  test('extracts BPMN flow nodes with bpmn_element anchors at exact precision', () => {
    const out = extractModel('src-1', BPMN_MEDIA_TYPE, BPMN_XML);
    const texts = out.units.map((u) => u.text);
    assert.ok(texts.includes('Customer Onboarding'));
    assert.ok(texts.includes('Application received'));
    assert.ok(texts.includes('Amount over 1000?'));
    assert.ok(texts.includes('amount > 1000'), 'entity references are decoded');
    assert.ok(out.units.every((u) => u.anchor.target.kind === 'bpmn_element'));
    assert.ok(out.units.every((u) => u.anchor.precision === 'exact'));
    assert.ok(out.units.every((u) => u.type === 'bpmnElement'));
  });

  test('an Arabic element name round-trips with rtl direction', () => {
    const out = extractModel('src-1', BPMN_MEDIA_TYPE, BPMN_XML);
    const arabic = out.units.find((u) => u.text === 'التحقق من الهوية');
    assert.ok(arabic !== undefined);
    assert.equal(arabic.direction, 'rtl');
    assert.equal(arabic.language, 'ar');
  });

  test('DIAGRAM GEOMETRY IS NOT EVIDENCE and is not extracted', () => {
    const out = extractModel('src-1', BPMN_MEDIA_TYPE, BPMN_XML);
    assert.ok(!out.units.some((u) => u.text.includes('Shape_1')));
    assert.ok(out.limitations.some((l) => /geometry/.test(l)));
  });

  test('an unnamed element produces no unit, and the omission is reported', () => {
    // A synthesised label would put text into a quote that appears nowhere in the
    // source, and its checksum would verify against something nobody wrote.
    const out = extractModel('src-1', BPMN_MEDIA_TYPE, BPMN_XML);
    assert.ok(!out.units.some((u) => u.text === 'End_1'));
    assert.ok(out.limitations.some((l) => /no name or expression/.test(l)));
  });

  test('every import declares that it is EVIDENCE ONLY', () => {
    for (const [type, text] of [
      [BPMN_MEDIA_TYPE, BPMN_XML],
      [DMN_MEDIA_TYPE, DMN_XML],
      [FORM_MEDIA_TYPE, FORM_JSON],
    ] as const) {
      const out = extractModel('src-1', type, text);
      assert.ok(
        out.limitations.some((l) => /EVIDENCE only/.test(l)),
        `${type} must declare the evidence-only boundary`,
      );
    }
  });

  test('extracts DMN decisions and rule entries with dmn_rule anchors', () => {
    const out = extractModel('src-1', DMN_MEDIA_TYPE, DMN_XML);
    const texts = out.units.map((u) => u.text);
    assert.ok(texts.includes('Escalation policy'));
    assert.ok(texts.includes('> 1000'));
    assert.ok(out.units.every((u) => u.anchor.target.kind === 'dmn_rule'));
  });

  test('extracts form fields recursively, including nested groups and Arabic labels', () => {
    const out = extractModel('src-1', FORM_MEDIA_TYPE, FORM_JSON);
    const texts = out.units.map((u) => u.text);
    assert.deepEqual(texts, ['Applicant name', 'المبلغ']);
    assert.ok(out.units.every((u) => u.anchor.target.kind === 'form_field'));
    assert.equal(out.units[1]?.direction, 'rtl');
  });

  test('the canonical text is the file verbatim, NFC-normalised', () => {
    const out = extractModel('src-1', BPMN_MEDIA_TYPE, BPMN_XML);
    assert.equal(out.canonicalText, BPMN_XML.normalize('NFC'));
  });

  test('modelElementIds lists what ADR-0038 target verification needs', () => {
    const ids = modelElementIds(BPMN_MEDIA_TYPE, BPMN_XML);
    assert.ok(ids.has('Activity_1'));
    assert.ok(ids.has('Gateway_1'));
    assert.ok(!ids.has('Shape_1'), 'geometry is not addressable evidence');
  });

  test('REFUSES a malformed model rather than importing part of it', () => {
    assert.throws(() => extractModel('s', BPMN_MEDIA_TYPE, '<bpmn:definitions><bpmn:process>'), ModelImportError);
    assert.throws(() => extractModel('s', FORM_MEDIA_TYPE, '{not json'), ModelImportError);
    assert.throws(() => extractModel('s', FORM_MEDIA_TYPE, '{"components":[]}'), ModelImportError);
  });

  test('REFUSES a model with no named element, so nothing false is citable', () => {
    const bare = `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"><process id="p"/></definitions>`;
    assert.throws(() => extractModel('s', BPMN_MEDIA_TYPE, bare), ModelImportError);
  });

  test('no page structure: a model file is not paginated', () => {
    assert.deepEqual(extractModel('src-1', BPMN_MEDIA_TYPE, BPMN_XML).pages, []);
  });
});
