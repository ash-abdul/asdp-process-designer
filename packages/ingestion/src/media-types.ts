/**
 * Media types the intake pipeline knows about.
 *
 * In their own module so the guard can name a type without importing the adapter
 * that reads it, and so the adapter can name it without importing the guard.
 */

export const TEXT_PLAIN = 'text/plain';
export const TEXT_MARKDOWN = 'text/markdown';

export const DOCX =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Recognised but NOT admitted. Named so a refusal can say which slice they need. */
export const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const PPTX =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';
export const PDF = 'application/pdf';

// --- V3: images and structural models -----------------------------------

export const PNG = 'image/png';
export const JPEG = 'image/jpeg';
export const WEBP = 'image/webp';
export const GIF = 'image/gif';
export const BMP = 'image/bmp';

export const BPMN = 'application/bpmn+xml';
export const DMN = 'application/dmn+xml';
export const CAMUNDA_FORM = 'application/vnd.camunda.form+json';

export const IMAGE_TYPES = [PNG, JPEG, WEBP, GIF, BMP] as const;
export const MODEL_TYPES = [BPMN, DMN, CAMUNDA_FORM] as const;

/** Media types this build can parse. */
export const ADMITTED = [
  TEXT_PLAIN,
  TEXT_MARKDOWN,
  DOCX,
  ...IMAGE_TYPES,
  ...MODEL_TYPES,
] as const;
export type AdmittedMediaType = (typeof ADMITTED)[number];

/**
 * Families, because the guard's obligations differ by family.
 *
 *   text   decode and validate UTF-8; the adapter reads the decoded string
 *   ooxml  a ZIP of XML parts; the adapter assembles the text
 *   image  no text at all; dimensions are read so provenance bounds are checkable
 *   model  decodable text, but a structured model — parsed, never interpreted
 */
export type MediaFamily = 'text' | 'ooxml' | 'image' | 'model';

export function familyOf(mediaType: AdmittedMediaType): MediaFamily {
  if (mediaType === DOCX) return 'ooxml';
  if ((IMAGE_TYPES as readonly string[]).includes(mediaType)) return 'image';
  if ((MODEL_TYPES as readonly string[]).includes(mediaType)) return 'model';
  return 'text';
}

/** True when this media type's content is read by a vision model. */
export function requiresVision(mediaType: string): boolean {
  return (IMAGE_TYPES as readonly string[]).includes(mediaType);
}
