/**
 * Free-text adapter.
 *
 * Deliberately the simplest possible reading of a plain-text source: blank lines
 * separate paragraphs, and everything is a paragraph. It does not guess at
 * headings, lists or emphasis, because plain text carries no markup and a guess
 * would be an interpretation — which is L2 work, not intake work.
 *
 * Every unit carries an exact, parser-minted anchor.
 */

import { toCodePoints } from '@asdp/text';
import { buildUnit, isBlank, toLines, type ExtractedUnit, type ExtractionResult } from './units.ts';

/**
 * Bump when the unit boundaries or anchor offsets this adapter produces change.
 * Recorded on every anchor so re-verification can be selective rather than total.
 */
export const FREETEXT_EXTRACTOR_VERSION = 'freetext@1';

export function extractFreeText(sourceId: string, normalisedText: string): ExtractionResult {
  const cps = toCodePoints(normalisedText);
  const lines = toLines(cps);
  const units: ExtractedUnit[] = [];

  let blockStart: number | null = null;
  let blockEnd = 0;

  const flush = (): void => {
    if (blockStart === null) return;
    const unit = buildUnit({
      sourceId,
      cps,
      start: blockStart,
      end: blockEnd,
      ordinal: units.length,
      type: 'paragraph',
      extractorVersion: FREETEXT_EXTRACTOR_VERSION,
    });
    if (unit !== null) units.push(unit);
    blockStart = null;
  };

  for (const line of lines) {
    if (isBlank(line)) {
      flush();
      continue;
    }
    if (blockStart === null) blockStart = line.start;
    blockEnd = line.end;
  }
  flush();

  return { extractorVersion: FREETEXT_EXTRACTOR_VERSION, units };
}
