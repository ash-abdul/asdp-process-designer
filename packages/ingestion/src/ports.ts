/**
 * Intake ports — the A3 abstractions.
 *
 * **A3 (approved)** requires a `TextExtractor` abstraction and a
 * `PageRasteriser` abstraction, with text extraction attempted first and a
 * confidence-driven per-page fallback to vision. These are those two ports.
 *
 * Both are defined here in V2 even though only text extractors are implemented,
 * because the shape of the fallback decision is part of the approved
 * architecture: an extractor reports **per-page confidence** and **marks** pages
 * needing vision, and it is not the extractor's business to decide what happens
 * next. Defining the boundary now is what stops the PDF adapter growing its own
 * private notion of "good enough" later.
 */

import type { SourceUnitType } from '@asdp/schemas';
import type { ExtractedUnit } from './units.ts';

// ---------------------------------------------------------------------------
// TextExtractor
// ---------------------------------------------------------------------------

export interface ExtractionInput {
  /** Assigned before extraction, because anchors carry it. */
  readonly sourceId: string;
  readonly data: Uint8Array;
  /** Determined by the ingest guard from content, never from the filename. */
  readonly mediaType: string;
  readonly filename: string;
  /**
   * Text already decoded and validated by the ingest guard, for text families.
   *
   * Passed forward rather than re-decoded so that BOM and encoding handling live
   * in exactly one place — the place that made the admission decision. Absent for
   * container formats, whose text is the adapter's to assemble.
   */
  readonly decodedText?: string;
}

/**
 * A page of a paginated source.
 *
 * Present in V2 so the PDF adapter adds values rather than a schema. A DOCX has
 * no pages until it is laid out, so the DOCX extractor reports none — which is a
 * fact about the format, not a gap in the adapter.
 */
export interface PageDescriptor {
  /** 1-based, matching how a human refers to a page. */
  readonly pageNumber: number;
  /** Code-point range of this page within the canonical text. */
  readonly charStart: number;
  readonly charEnd: number;
  /**
   * Extraction confidence for this page, 0–1.
   *
   * Computed by the adapter from observable signals, never invented and never
   * reported by a model. Feeds the A3 fallback decision and `L0-ING-008`.
   */
  readonly confidence: number;
  /**
   * True when this page's text could not be extracted reliably and vision is
   * required. **Marking is the extractor's job; performing the vision call is
   * not** — and in V2 no vision call exists at all.
   */
  readonly requiresVisionFallback: boolean;
  /** Why, when it does. Never a silent flag. */
  readonly fallbackReason?: string;
}

export interface ExtractionOutput {
  /** Adapter identity and version, recorded on every anchor. */
  readonly extractorVersion: string;
  /**
   * NFC, logical-order canonical text. The authoritative stored form, and what
   * every anchor in `units` resolves against.
   */
  readonly canonicalText: string;
  readonly units: readonly ExtractedUnit[];
  /** Empty for unpaginated formats. */
  readonly pages: readonly PageDescriptor[];
  /**
   * Fidelity losses this extraction incurred, in plain language.
   *
   * Required by the approved V2 boundary item 8: *document extraction
   * limitations where exact fidelity is not achievable*. Reported to the user
   * rather than recorded in a comment, because the person citing the document is
   * the one who needs to know what was dropped.
   */
  readonly limitations: readonly string[];
}

export interface TextExtractor {
  /** Stable id, e.g. `docx@1`. Appears in `extractorVersion`. */
  readonly id: string;
  supports(mediaType: string): boolean;
  extract(input: ExtractionInput): ExtractionOutput;
}

export class UnsupportedMediaTypeError extends Error {}

/**
 * Resolve the extractor for a media type.
 *
 * Explicit failure rather than a default, so a media type the guard admits but
 * no adapter handles is a loud error at ingest instead of a source with zero
 * units that looks like an empty document.
 */
export function selectExtractor(
  extractors: readonly TextExtractor[],
  mediaType: string,
): TextExtractor {
  const found = extractors.find((e) => e.supports(mediaType));
  if (found === undefined) {
    throw new UnsupportedMediaTypeError(
      `no text extractor supports '${mediaType}'; the ingest guard admitted a media type that ` +
        'no adapter can read, which is a wiring defect rather than a user error',
    );
  }
  return found;
}

// ---------------------------------------------------------------------------
// PageRasteriser — PORT ONLY
// ---------------------------------------------------------------------------

export interface RasteriseInput {
  readonly sourceId: string;
  readonly data: Uint8Array;
  readonly mediaType: string;
  /** 1-based page numbers to render. */
  readonly pageNumbers: readonly number[];
  /** Render scale. 2 is a reasonable default for legible vision input. */
  readonly scale: number;
}

export interface RasterisedPage {
  readonly pageNumber: number;
  readonly width: number;
  readonly height: number;
  readonly mediaType: 'image/png';
  readonly data: Uint8Array;
}

/**
 * Rasterise pages of a paginated source.
 *
 * **DEFINED BUT NOT IMPLEMENTED IN V2.** There is deliberately no adapter:
 *
 *   1. Only PDF needs rasterising, and PDF intake is V2-PDF — blocked on spike
 *      S2 completing against representative Arabic material and on
 *      ADR-0037 being approved.
 *   2. Nothing consumes a page image until V3's vision path exists, so an
 *      implementation now would be unused code carrying a runtime dependency.
 *
 * The port exists anyway because A3 approved the abstraction, and because the
 * DOCX adapter should sit in an architecture that already knows where
 * rasterisation goes.
 */
export interface PageRasteriser {
  readonly id: string;
  supports(mediaType: string): boolean;
  rasterise(input: RasteriseInput): Promise<readonly RasterisedPage[]>;
}

export class RasterisationUnavailableError extends Error {}

/**
 * The only `PageRasteriser` in V2: one that refuses, by name and with a reason.
 *
 * Registered rather than left absent so that a caller reaching for
 * rasterisation gets an explanation instead of `undefined`, and so the refusal
 * is visible in the composition root rather than implied by a missing binding.
 */
export function unavailableRasteriser(): PageRasteriser {
  return {
    id: 'unavailable@v2',
    supports: () => false,
    rasterise: () =>
      Promise.reject(
        new RasterisationUnavailableError(
          'page rasterisation is not implemented in V2. It belongs to V2-PDF, which is blocked ' +
            'on spike S2 completing against representative Arabic PDFs and on ADR-0037 being ' +
            'approved. No PDF engine is present in this build.',
        ),
      ),
  };
}

/** Sentinel used by unit types that carry no text, for readability. */
export const IMAGE_UNIT_TYPES: readonly SourceUnitType[] = ['image'];
