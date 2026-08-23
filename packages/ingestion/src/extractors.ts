/**
 * The text extractors, as A3 ports.
 *
 * V1's `extractUnits(mimeType, …)` dispatcher becomes a registry of
 * `TextExtractor` implementations. Same behaviour for text, but now the DOCX
 * adapter — and later the PDF adapter — plug in without another `switch`, and
 * every adapter reports its own limitations and page structure through one shape.
 */

import { normalise } from '@asdp/text';
import { extractFreeText, FREETEXT_EXTRACTOR_VERSION } from './freetext.ts';
import { extractMarkdown, MARKDOWN_EXTRACTOR_VERSION } from './markdown.ts';
import { docxExtractor } from './docx.ts';
import { modelExtractor } from './model-import.ts';
import { TEXT_MARKDOWN, TEXT_PLAIN } from './media-types.ts';
import type { ExtractionInput, ExtractionOutput, TextExtractor } from './ports.ts';

export class MissingDecodedTextError extends Error {}

/**
 * Decoded text for a text-family source.
 *
 * The guard already decoded and validated it, so it is passed forward rather than
 * decoded again. Two decodes would be two places for BOM and encoding handling to
 * diverge, and the guard's decode is the one that made the admission decision.
 */
function requireDecodedText(input: ExtractionInput): string {
  if (input.decodedText === undefined) {
    throw new MissingDecodedTextError(
      `extractor for '${input.mediaType}' requires decodedText from the ingest guard; ` +
        'this is a wiring defect, not a bad document',
    );
  }
  return input.decodedText;
}

/** Build the output shape shared by the two plain-text adapters. */
function textOutput(
  input: ExtractionInput,
  extract: (sourceId: string, canonicalText: string) => { extractorVersion: string; units: ExtractionOutput['units'] },
): ExtractionOutput {
  // Normalisation is the extractor's step, and the normalised form is what gets
  // stored — so anchors are offsets into exactly the string that is persisted.
  const normalised = normalise(requireDecodedText(input));
  const result = extract(input.sourceId, normalised.text);
  return {
    extractorVersion: result.extractorVersion,
    canonicalText: normalised.text,
    units: result.units,
    // Plain text and Markdown are unpaginated: pagination is a rendering
    // property, and these formats have no renderer in the pipeline.
    pages: [],
    limitations: [],
  };
}

export function freeTextExtractor(): TextExtractor {
  return {
    id: FREETEXT_EXTRACTOR_VERSION,
    supports: (mediaType) => mediaType === TEXT_PLAIN,
    extract: (input) => textOutput(input, extractFreeText),
  };
}

export function markdownExtractor(): TextExtractor {
  return {
    id: MARKDOWN_EXTRACTOR_VERSION,
    supports: (mediaType) => mediaType === TEXT_MARKDOWN,
    extract: (input) => textOutput(input, extractMarkdown),
  };
}

/**
 * Every extractor this build has.
 *
 * There is deliberately **no PDF extractor**: PDF intake is V2-PDF, blocked on
 * spike S2 completing against representative Arabic material and on ADR-0037
 * being approved. A PDF therefore never reaches an extractor at all — the ingest
 * guard refuses it by name first, which is the better place to say no.
 *
 * There is also **no image extractor here**, and that is not an omission. An
 * image's content is read by a `VisionExtractor`, which is a different port
 * because it is a different kind of act: it calls a model, it is subject to the
 * egress policy, and its output is an interpretation rather than an extraction.
 * Keeping the two apart is what stops "extract text" quietly meaning "ask an AI"
 * (the preserved V3 rule: if deterministic extraction can produce the evidence,
 * do not invoke AI).
 */
export function defaultExtractors(): readonly TextExtractor[] {
  return [freeTextExtractor(), markdownExtractor(), docxExtractor(), modelExtractor()];
}
