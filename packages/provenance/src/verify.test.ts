/**
 * Tests for ADR-0038 — target verification versus content verification.
 *
 * The decisive assertion in this file is that an `image_region` anchor **never**
 * reports `resolved`. If that regresses, a vision citation becomes
 * indistinguishable from a verified one in every overlay, trace query and
 * disclosure report — which is the exact failure the ADR exists to prevent.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  contentVerifiability,
  isCitable,
  resolveAnchor,
  spanChecksum,
  verifyElementTarget,
  verifyImageTarget,
  type ProvenanceAnchor,
  type StoredImage,
  type StoredModel,
} from './index.ts';

const TEXT = 'The applicant must supply a valid identity document.';

const image: StoredImage = { imageId: 'img-1', sha256: 'a'.repeat(64), width: 800, height: 600 };

function imageAnchor(
  rect = { x: 10, y: 20, w: 100, h: 40 },
  quote = 'Submit application',
  imageId = 'img-1',
): ProvenanceAnchor {
  return {
    sourceId: 'src-1',
    target: { kind: 'image_region', imageId, rect },
    quote,
    quoteChecksum: spanChecksum(quote),
    language: 'en',
    direction: 'ltr',
    precision: 'page',
    extractorVersion: 'vision@1',
  };
}

function textAnchor(start = 4, end = 13): ProvenanceAnchor {
  const quote = Array.from(TEXT).slice(start, end).join('');
  return {
    sourceId: 'src-1',
    target: { kind: 'text_range', charStart: start, charEnd: end },
    quote,
    quoteChecksum: spanChecksum(quote),
    language: 'en',
    direction: 'ltr',
    precision: 'exact',
    extractorVersion: 'test@1',
  };
}

function elementAnchor(elementId = 'Activity_1'): ProvenanceAnchor {
  const quote = 'Verify identity';
  return {
    sourceId: 'src-1',
    target: { kind: 'bpmn_element', fileId: 'src-1', elementId },
    quote,
    quoteChecksum: spanChecksum(quote),
    language: 'en',
    direction: 'ltr',
    precision: 'exact',
    extractorVersion: 'model@1',
  };
}

const model: StoredModel = {
  fileId: 'src-1',
  sha256: 'b'.repeat(64),
  elementIds: new Set(['Activity_1', 'Gateway_1']),
};

// ---------------------------------------------------------------------------

describe('contentVerifiability', () => {
  test('text and model anchors are content-verifiable; image anchors are not', () => {
    for (const kind of ['text_range', 'docx_block', 'pdf_region', 'sheet_cell', 'transcript'] as const) {
      assert.equal(contentVerifiability(kind), 'verifiable', kind);
    }
    for (const kind of ['bpmn_element', 'dmn_rule', 'form_field'] as const) {
      assert.equal(contentVerifiability(kind), 'verifiable', kind);
    }
    assert.equal(contentVerifiability('image_region'), 'target_only');
  });

  test('the axis depends on the ANCHOR, not on who produced it', () => {
    // epistemic-model.md §1 permits AI extraction to produce L1, so "an AI read
    // it" cannot be the discriminator. An AI-located quote over stored text is
    // verifiable; a parser-produced quote over pixels would not be.
    assert.equal(contentVerifiability('text_range'), 'verifiable');
    assert.equal(contentVerifiability('image_region'), 'target_only');
  });
});

describe('image target verification', () => {
  test('passes for an in-bounds rectangle over an unchanged image', () => {
    assert.deepEqual(verifyImageTarget(imageAnchor(), image, image.sha256), { ok: true });
  });

  test('FAILS when the image no longer exists', () => {
    const r = verifyImageTarget(imageAnchor(), undefined, image.sha256);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /no longer exists/);
  });

  test('FAILS when the image bytes changed — tampering is detected', () => {
    const r = verifyImageTarget(imageAnchor(), image, 'c'.repeat(64));
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /has changed/);
  });

  test('FAILS when the cited image is a different image', () => {
    const r = verifyImageTarget(imageAnchor(undefined, 'x', 'img-2'), image, image.sha256);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /identity mismatch/);
  });

  test('FAILS for a rectangle outside the bounds', () => {
    for (const rect of [
      { x: 750, y: 20, w: 100, h: 40 },
      { x: 10, y: 590, w: 20, h: 40 },
      { x: -5, y: 10, w: 20, h: 20 },
    ]) {
      const r = verifyImageTarget(imageAnchor(rect), image, image.sha256);
      assert.equal(r.ok, false, JSON.stringify(rect));
      if (!r.ok) assert.match(r.reason, /outside the image bounds/);
    }
  });

  test('FAILS for a zero-extent rectangle, which would make bounds vacuous', () => {
    const r = verifyImageTarget(imageAnchor({ x: 10, y: 10, w: 0, h: 10 }), image, image.sha256);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /non-positive extent/);
  });
});

describe('element target verification', () => {
  test('passes for a present element in an unchanged file', () => {
    assert.deepEqual(verifyElementTarget(elementAnchor(), model, model.sha256), { ok: true });
  });

  test('FAILS for an element that is not in the file', () => {
    const r = verifyElementTarget(elementAnchor('Activity_9999'), model, model.sha256);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /not present/);
  });

  test('FAILS when the model file changed', () => {
    const r = verifyElementTarget(elementAnchor(), model, 'd'.repeat(64));
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /has changed/);
  });
});

describe('resolveAnchor — the four states', () => {
  test('a text anchor over matching text is RESOLVED', () => {
    const r = resolveAnchor(textAnchor(), { storedText: TEXT });
    assert.equal(r.status, 'resolved');
  });

  test('AN IMAGE ANCHOR IS NEVER RESOLVED — it is content_unverified', () => {
    const r = resolveAnchor(imageAnchor(), { storedImage: image, expectedSha256: image.sha256 });
    assert.equal(r.status, 'content_unverified');
    assert.notEqual(r.status, 'resolved');
    assert.match(String(r.detail), /not independently verified/);
    // The quote is still returned: a human reviewing the highlight needs to see
    // what the model claimed to read.
    assert.equal(r.text, 'Submit application');
  });

  test('a tampered image makes its anchor BROKEN, not content_unverified', () => {
    const r = resolveAnchor(imageAnchor(), { storedImage: image, expectedSha256: 'e'.repeat(64) });
    assert.equal(r.status, 'broken');
  });

  test('a model element anchor IS resolved — a parser read the stored bytes', () => {
    const r = resolveAnchor(elementAnchor(), { storedModel: model, expectedSha256: model.sha256 });
    assert.equal(r.status, 'resolved');
  });

  test('a missing model element is BROKEN', () => {
    const r = resolveAnchor(elementAnchor('Nope_1'), {
      storedModel: model,
      expectedSha256: model.sha256,
    });
    assert.equal(r.status, 'broken');
  });

  test('a text anchor with no stored text is BROKEN, not silently passed', () => {
    assert.equal(resolveAnchor(textAnchor(), {}).status, 'broken');
  });

  test('checksum sensitivity survives the unified resolver', () => {
    // The mutation must fall INSIDE the anchored span, or the anchor rightly
    // still resolves — chars 4..13 are "applicant", so that is what changes here.
    const r = resolveAnchor(textAnchor(), { storedText: TEXT.replace('applicant', 'APPLICANT') });
    assert.notEqual(r.status, 'resolved');
  });

  test('a mutation OUTSIDE the anchored span leaves the anchor resolved', () => {
    // Stated explicitly because it is the property that makes the test above
    // meaningful: resolution checks the anchored span, not the whole document.
    const r = resolveAnchor(textAnchor(), { storedText: TEXT.replace('valid', 'VALID') });
    assert.equal(r.status, 'resolved');
  });
});

describe('isCitable', () => {
  test('content_unverified IS citable — it is a qualification, not a failure', () => {
    assert.equal(isCitable('resolved'), true);
    assert.equal(isCitable('content_unverified'), true);
    assert.equal(isCitable('drifted'), false);
    assert.equal(isCitable('broken'), false);
  });

  test('the reflex "anything but resolved is a problem" is wrong, and this encodes why', () => {
    // A drifted anchor means the text and the anchor disagree — a defect.
    // content_unverified means the target is sound and the CONTENT is an
    // interpretation, which the epistemic ceiling handles rather than the anchor.
    assert.notEqual(isCitable('content_unverified'), isCitable('drifted'));
  });
});
