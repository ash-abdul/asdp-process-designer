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
  type AdmittedMediaType,
  type MediaFamily,
  TEXT_PLAIN,
  TEXT_MARKDOWN,
  DOCX,
  XLSX,
  PPTX,
  PDF,
  PNG,
  JPEG,
  WEBP,
  GIF,
  BMP,
  BPMN,
  DMN,
  CAMUNDA_FORM,
  IMAGE_TYPES,
  MODEL_TYPES,
  ADMITTED,
  familyOf,
  requiresVision,
} from './media-types.ts';

export {
  type ImageInfo,
  ImageError,
  readImageInfo,
  looksLikeImage,
} from './image.ts';

export {
  BPMN_MEDIA_TYPE,
  DMN_MEDIA_TYPE,
  FORM_MEDIA_TYPE,
  MODEL_EXTRACTOR_VERSION,
  ModelImportError,
  extractModel,
  modelElementIds,
  modelExtractor,
} from './model-import.ts';

export {
  type ExtractionInput,
  type ExtractionOutput,
  type PageDescriptor,
  type TextExtractor,
  type PageRasteriser,
  type RasteriseInput,
  type RasterisedPage,
  UnsupportedMediaTypeError,
  RasterisationUnavailableError,
  selectExtractor,
  unavailableRasteriser,
} from './ports.ts';

export {
  MissingDecodedTextError,
  freeTextExtractor,
  markdownExtractor,
  defaultExtractors,
} from './extractors.ts';

export {
  type VisionExtractor,
  type VisionInput,
  type VisionOutcome,
  VisionUnavailableError,
  unavailableVisionExtractor,
  regionsToUnits,
} from './vision.ts';

export {
  type ExtractedUnit,
  type ExtractionResult,
  type Line,
  toLines,
  isBlank,
  isTrimmable,
  trimSpan,
  describeSpan,
  mintTextAnchor,
  buildUnit,
} from './units.ts';

export { FREETEXT_EXTRACTOR_VERSION, extractFreeText } from './freetext.ts';
export { MARKDOWN_EXTRACTOR_VERSION, extractMarkdown } from './markdown.ts';

export {
  DOCX_MEDIA_TYPE,
  DOCX_EXTRACTOR_VERSION,
  DocxError,
  extractDocx,
  docxExtractor,
} from './docx.ts';

export {
  type ZipEntry,
  ZipError,
  readZipEntries,
  readZipEntry,
  readZipTextEntry,
  looksLikeZip,
} from './zip.ts';

export {
  type XmlToken,
  XmlError,
  tokeniseXml,
  decodeXmlEntities,
  localName,
} from './xml.ts';

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
