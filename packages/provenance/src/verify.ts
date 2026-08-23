/**
 * Target verification — the other axis of provenance.
 *
 * [ADR-0038](../../../docs/adr/ADR-0038-target-versus-content-verification.md): provenance
 * verification is two independent questions.
 *
 *   TARGET   does the thing this anchor points at still exist, unchanged, and does
 *            the anchor address a real region of it?
 *   CONTENT  is the recorded quote actually the content at that location?
 *
 * A deterministic textual source answers both, and only then is an anchor
 * `resolved`. **Visual evidence answers only the first**, because the only text
 * available for an image is what a vision model reported — so resolving the quote
 * against it would verify AI output against AI output, and the checksum would
 * always match.
 *
 * That is why this module exists separately from `resolve.ts`: target
 * verification checks things the AI did not produce.
 */

import type { AnchorTarget, ProvenanceAnchor } from './anchor.ts';

/**
 * Which verification axes an anchor kind supports.
 *
 * Derived from the kind, never stored, so it cannot drift and no adapter can
 * quietly claim a stronger guarantee than its evidence supports.
 */
export type ContentVerifiability = 'verifiable' | 'target_only';

/**
 * Whether an anchor kind's CONTENT can be verified against ground truth.
 *
 * `target_only` is about the absence of independent ground truth, **not** about
 * who produced the anchor. An AI-located quote over stored text is `verifiable`,
 * because the stored text is independent of the AI. A parser-produced quote over
 * an image would still be `target_only`, because there is nothing to check it
 * against (epistemic-model.md §1 permits AI extraction to produce L1; what
 * disqualifies image content is the anchor, not the author).
 */
export function contentVerifiability(kind: AnchorTarget['kind']): ContentVerifiability {
  switch (kind) {
    // Ground-truth text exists and the anchor addresses a span of it.
    case 'text_range':
    case 'docx_block':
    case 'pdf_region':
    case 'sheet_cell':
    case 'transcript':
      return 'verifiable';
    // A structured model file is ground truth: the element's identity and its
    // recorded name are both checkable against the stored bytes.
    case 'bpmn_element':
    case 'dmn_rule':
    case 'form_field':
      return 'verifiable';
    // Pixels. Whatever text was reported came from a model.
    case 'image_region':
      return 'target_only';
  }
}

// ---------------------------------------------------------------------------
// Image targets
// ---------------------------------------------------------------------------

/** The stored facts about an image, against which a target is verified. */
export interface StoredImage {
  readonly imageId: string;
  /** SHA-256 of the stored bytes. */
  readonly sha256: string;
  readonly width: number;
  readonly height: number;
}

export type TargetVerification =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

/**
 * Verify an `image_region` target.
 *
 * Four deterministic checks over bytes the AI did not produce: the image exists,
 * its checksum matches what was ingested, and the rectangle lies within its
 * bounds. Tampering with the stored image, or citing a region outside it, fails.
 */
export function verifyImageTarget(
  anchor: ProvenanceAnchor,
  stored: StoredImage | undefined,
  expectedSha256: string | undefined,
): TargetVerification {
  const target = anchor.target;
  if (target.kind !== 'image_region') {
    return { ok: false, reason: `anchor kind '${target.kind}' is not an image region` };
  }
  if (stored === undefined) {
    return { ok: false, reason: `image '${target.imageId}' no longer exists` };
  }
  if (stored.imageId !== target.imageId) {
    return {
      ok: false,
      reason: `image identity mismatch: anchor cites '${target.imageId}', stored image is '${stored.imageId}'`,
    };
  }
  // The checksum is the point, and WHERE it comes from is the point too.
  //
  // The anchor's own `imageSha256` is preferred over the caller-supplied value,
  // because the anchor is an INDEPENDENT record of what the image was at mint
  // time. Comparing the stored row against itself would always match — a check
  // that cannot fail, which is precisely the vacuous guarantee ADR-0038 exists
  // to prevent.
  const mintedAgainst = target.imageSha256 ?? expectedSha256;
  if (mintedAgainst !== undefined && stored.sha256 !== mintedAgainst) {
    return {
      ok: false,
      reason: `image '${target.imageId}' has changed since the anchor was minted`,
    };
  }

  const { x, y, w, h } = target.rect;
  if (w <= 0 || h <= 0) {
    return { ok: false, reason: `rectangle has non-positive extent (${w}×${h})` };
  }
  if (x < 0 || y < 0 || x + w > stored.width || y + h > stored.height) {
    return {
      ok: false,
      reason:
        `rectangle ${x},${y} ${w}×${h} lies outside the image bounds ` +
        `(${stored.width}×${stored.height})`,
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Element targets
// ---------------------------------------------------------------------------

/** Element identities present in a stored model file. */
export interface StoredModel {
  readonly fileId: string;
  readonly sha256: string;
  /** Every addressable element id in the file. */
  readonly elementIds: ReadonlySet<string>;
}

/**
 * Verify a `bpmn_element`, `dmn_rule` or `form_field` target.
 *
 * The element id must be present in the stored file, and the file must be
 * unchanged. Unlike an image, this also settles CONTENT: a deterministic parser
 * read the element's name from those same bytes, so the quote is checkable.
 */
export function verifyElementTarget(
  anchor: ProvenanceAnchor,
  stored: StoredModel | undefined,
  expectedSha256: string | undefined,
): TargetVerification {
  const target = anchor.target;
  const elementId =
    target.kind === 'bpmn_element'
      ? target.elementId
      : target.kind === 'dmn_rule'
        ? (target.ruleId ?? target.decisionId)
        : target.kind === 'form_field'
          ? target.fieldId
          : undefined;
  const fileId =
    target.kind === 'bpmn_element' || target.kind === 'dmn_rule' || target.kind === 'form_field'
      ? target.fileId
      : undefined;

  if (elementId === undefined || fileId === undefined) {
    return { ok: false, reason: `anchor kind '${target.kind}' does not address a model element` };
  }
  if (stored === undefined) {
    return { ok: false, reason: `model file '${fileId}' no longer exists` };
  }
  if (stored.fileId !== fileId) {
    return {
      ok: false,
      reason: `file identity mismatch: anchor cites '${fileId}', stored file is '${stored.fileId}'`,
    };
  }
  // A checksum comparison is only performed when the caller supplies an
  // INDEPENDENT expectation. It is optional here because the element-existence
  // check below is already substantive: ids are recomputed from the stored bytes,
  // so a changed file makes a cited element vanish.
  if (
    expectedSha256 !== undefined &&
    expectedSha256 !== '' &&
    stored.sha256 !== '' &&
    stored.sha256 !== expectedSha256
  ) {
    return { ok: false, reason: `model file '${fileId}' has changed since the anchor was minted` };
  }
  if (!stored.elementIds.has(elementId)) {
    return {
      ok: false,
      reason: `element '${elementId}' is not present in model file '${fileId}'`,
    };
  }
  return { ok: true };
}
