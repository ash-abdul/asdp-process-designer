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

/** Media types V2 can parse. */
export const ADMITTED = [TEXT_PLAIN, TEXT_MARKDOWN, DOCX] as const;
export type AdmittedMediaType = (typeof ADMITTED)[number];

/** Families, because the guard's obligations differ by family. */
export type MediaFamily = 'text' | 'ooxml';

export function familyOf(mediaType: AdmittedMediaType): MediaFamily {
  return mediaType === DOCX ? 'ooxml' : 'text';
}
