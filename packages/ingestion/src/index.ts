/**
 * @asdp/ingestion — source intake.
 *
 * ADAPTER package (module-map.md §2): I/O is permitted but confined. In practice
 * V1 needs almost none — the guard hashes bytes and the adapters are pure
 * functions over decoded text. Blob storage and persistence stay in `apps/api`
 * behind their own ports, so this package never touches a filesystem or a
 * database.
 *
 * ADR-0023 rule 1: this package does not normalise text or compute an offset by
 * itself. `@asdp/text` owns both, and every offset here is a code-point index
 * produced by it.
 */

import { normalise, type NormalisedText } from '@asdp/text';
import type { AcceptedMediaType } from './guard.ts';
import { extractFreeText } from './freetext.ts';
import { extractMarkdown } from './markdown.ts';
import type { ExtractionResult } from './units.ts';

export {
  type AcceptedMediaType,
  type AcceptedSource,
  type RefusedSource,
  type GuardResult,
  type GuardOptions,
  type RefusalCode,
  guardSource,
  sniffBinary,
  hashBytes,
} from './guard.ts';

export {
  type ExtractedUnit,
  type ExtractionResult,
  type Line,
  toLines,
  isBlank,
  trimSpan,
  describeSpan,
  mintTextAnchor,
  buildUnit,
} from './units.ts';

export { FREETEXT_EXTRACTOR_VERSION, extractFreeText } from './freetext.ts';
export { MARKDOWN_EXTRACTOR_VERSION, extractMarkdown } from './markdown.ts';

export { segmentRange, highlightForAnchor, highlightForRange } from './highlight.ts';

export { assertAnchorContractsAgree } from './contract.ts';

/**
 * Normalise decoded source text into its canonical stored form.
 *
 * The result's `text` is what gets persisted and what every anchor is resolved
 * against. Storing the raw decode instead would make offsets depend on the input
 * encoding form, so the same document in NFC and NFD would anchor differently.
 */
export function normaliseSource(rawText: string): NormalisedText {
  return normalise(rawText);
}

/**
 * Select and run the adapter for an accepted media type.
 *
 * Exhaustive over `AcceptedMediaType`, so adding a media type to the guard
 * without giving it an adapter is a compile error rather than a runtime
 * fall-through that silently produces zero units.
 */
export function extractUnits(
  mimeType: AcceptedMediaType,
  sourceId: string,
  normalisedText: string,
): ExtractionResult {
  switch (mimeType) {
    case 'text/plain':
      return extractFreeText(sourceId, normalisedText);
    case 'text/markdown':
      return extractMarkdown(sourceId, normalisedText);
  }
}
