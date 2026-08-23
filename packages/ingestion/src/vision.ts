/**
 * The `VisionExtractor` port.
 *
 * Separate from `TextExtractor` on purpose. Reading pixels is a different kind of
 * act from reading a text layer:
 *
 *   - it calls a model, so it is subject to the egress policy (ADR-0021)
 *   - its output is an **interpretation**, capped at L2 (ADR-0038, D4)
 *   - it can be **refused** — by policy, or because no provider has vision
 *
 * Keeping the ports apart is what stops "extract the text" quietly meaning "ask an
 * AI", which is the preserved V3 rule: *if deterministic extraction can produce
 * the evidence, do not invoke AI.*
 *
 * This package does **not** import `@asdp/ai` — the dependency rules forbid it,
 * and rightly: intake declares the shape of the request, and the application layer
 * routes it through the broker, the egress gate and the degradation ladder. So the
 * port is defined here and implemented in `apps/api`.
 */

import { normalise } from '@asdp/text';
import { spanChecksum } from '@asdp/provenance';
import type { ProvenanceAnchor, VisionRegion, VisionResult } from '@asdp/schemas';
import type { ExtractedUnit } from './units.ts';

export interface VisionInput {
  readonly sourceId: string;
  /** The stored image this call reads. Anchors cite it by id. */
  readonly imageId: string;
  readonly data: Uint8Array;
  readonly mediaType: string;
  readonly width: number;
  readonly height: number;
  /**
   * SHA-256 of the image bytes, recorded onto every anchor minted from it.
   *
   * Without it, verification would have to compare the stored row against
   * itself, which always matches (ADR-0038).
   */
  readonly sha256: string;
  /** `screenshot` or `diagram_image`. Changes the prompt and the ceiling. */
  readonly kind: string;
  /** Language hints, so an Arabic screenshot is not read as though it were English. */
  readonly languageHints?: readonly string[];
}

/**
 * The outcome of a vision attempt.
 *
 * A refusal is a first-class outcome, not an exception, because refusing is
 * **correct behaviour** under several approved rules: a `RESTRICTED` image may not
 * leave, and a provider without vision must be refused with a named degradation
 * rather than silently downgraded. Modelling it as a result forces the caller to
 * handle it.
 */
export type VisionOutcome =
  | { readonly kind: 'extracted'; readonly result: VisionResult; readonly interactionId: string }
  | {
      readonly kind: 'refused';
      readonly reason: string;
      /** Named degradations, never silent. */
      readonly degradations: readonly string[];
      /** Concrete options for the user, per data-governance.md §3.1. */
      readonly options: readonly string[];
    };

export interface VisionExtractor {
  readonly id: string;
  supports(mediaType: string): boolean;
  extract(input: VisionInput): Promise<VisionOutcome>;
}

export class VisionUnavailableError extends Error {}

/**
 * A `VisionExtractor` that refuses, for builds and tests with no provider wired.
 *
 * Refuses rather than returning empty regions: an empty result is
 * indistinguishable from "the image contained no text", and that difference
 * matters — one is a configuration gap, the other is a fact about the document.
 */
export function unavailableVisionExtractor(reason?: string): VisionExtractor {
  return {
    id: 'unavailable@v3',
    supports: () => false,
    extract: async () => ({
      kind: 'refused',
      reason:
        reason ??
        'no vision provider is configured in this build; image content cannot be read. This is a ' +
          'configuration gap, not a statement that the image is empty.',
      degradations: ['no_vision_capability'],
      options: [
        'configure a vision-capable provider (A8 permits Claude API for permitted material)',
        'describe the image content manually as free-text evidence',
        'remove the image from the source set',
      ],
    }),
  };
}

// ---------------------------------------------------------------------------
// Region → unit
// ---------------------------------------------------------------------------

/**
 * Turn vision regions into anchored units.
 *
 * Every anchor is `image_region` at **`page` precision** — never `exact`.
 * provenance-and-anchoring.md §5 permits page precision only for L2/L3 content,
 * which is exactly the ceiling ADR-0038 relies on. Minting these as `exact` would
 * silently claim L1 eligibility for content nothing can verify.
 *
 * Out-of-bounds regions are **dropped, not clamped**. A clamped rectangle is a
 * different claim from the one the model made, and silently correcting it would
 * hide the fact that the model reported a region that does not exist.
 */
export function regionsToUnits(
  input: VisionInput,
  result: VisionResult,
  extractorVersion: string,
): { readonly units: readonly ExtractedUnit[]; readonly dropped: number } {
  const units: ExtractedUnit[] = [];
  let dropped = 0;

  for (const region of result.regions) {
    if (!withinBounds(region, input.width, input.height)) {
      dropped++;
      continue;
    }
    const text = region.text.normalize('NFC');
    if (text.trim().length === 0) {
      dropped++;
      continue;
    }
    const described = normalise(text);

    const anchor: ProvenanceAnchor = {
      sourceId: input.sourceId,
      target: {
        kind: 'image_region',
        imageId: input.imageId,
        rect: region.rect,
        imageSha256: input.sha256,
      },
      quote: text,
      quoteChecksum: spanChecksum(text),
      language: described.primaryLanguage === 'und' ? region.language : described.primaryLanguage,
      direction: described.direction === 'neutral' ? region.direction : described.direction,
      // Never `exact`. See the note above.
      precision: 'page',
      extractorVersion,
    };

    units.push({
      ordinal: units.length,
      type: region.role === 'heading' ? 'heading' : region.role === 'table_cell' ? 'tableCell' : 'image',
      text,
      language: anchor.language,
      direction: anchor.direction,
      anchor,
    });
  }

  return { units, dropped };
}

function withinBounds(region: VisionRegion, width: number, height: number): boolean {
  const { x, y, w, h } = region.rect;
  return w > 0 && h > 0 && x >= 0 && y >= 0 && x + w <= width && y + h <= height;
}
