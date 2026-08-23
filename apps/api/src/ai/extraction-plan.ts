/**
 * Shared offline extraction planning (V4b-core).
 *
 * Used by **both** the capture runner and the evaluation harness, and that is the
 * whole point: a recording is keyed on the system instruction and the content
 * (`requestInputHash`), so if the two built their requests even slightly
 * differently, every replay would miss and the harness would fail for a reason
 * that has nothing to do with extraction.
 *
 * Deliberately not exported to the application: the command builds its chunks from
 * *stored* units, which is the real path. This module exists so an offline corpus
 * document can be put through the identical adapter and planner.
 */

import { planChunks, type ChunkPlan } from '@asdp/ai';
import { defaultExtractors, selectExtractor } from '@asdp/ingestion';
import type { SourceUnit } from '@asdp/schemas';

/** Run the real ingestion adapter over a corpus document. */
export function unitsForDocument(documentId: string, text: string): readonly SourceUnit[] {
  const extractor = selectExtractor(defaultExtractors(), 'text/markdown');
  if (extractor === undefined) throw new Error('no markdown extractor is registered');
  const output = extractor.extract({
    sourceId: documentId,
    mediaType: 'text/markdown',
    filename: `${documentId}.md`,
    data: new TextEncoder().encode(text),
    decodedText: text,
  });
  return output.units.map((unit, index) => ({
    id: `su-${index + 1}`,
    sourceId: documentId,
    projectId: 'eval',
    ordinal: unit.ordinal,
    type: unit.type,
    text: unit.text,
    language: unit.language,
    direction: unit.direction,
    ...(unit.depth === undefined ? {} : { depth: unit.depth }),
    anchor: unit.anchor,
  }));
}

/** Budget used by the offline paths. Matches the configured default. */
export const OFFLINE_CHUNK_CHARS = 24_000;
export const OFFLINE_OVERLAP_CHARS = 400;

/** Plan chunks over a document's units, identically for capture and evaluation. */
export function planForUnits(units: readonly SourceUnit[]): ChunkPlan {
  const chunkable = units.flatMap((unit) =>
    unit.text === null
      ? []
      : [
          {
            id: unit.id,
            charStart: (unit.anchor.target as { charStart: number }).charStart,
            charEnd: (unit.anchor.target as { charEnd: number }).charEnd,
            text: unit.text,
          },
        ],
  );
  return planChunks(chunkable, {
    maxChars: OFFLINE_CHUNK_CHARS,
    overlapChars: OFFLINE_OVERLAP_CHARS,
  });
}
