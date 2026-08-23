/**
 * Deterministic context assembly — **F4**.
 *
 * Step 6 of the broker flow (ai-provider-abstraction.md §2) is context assembly,
 * and this is it. A pass that reads a document larger than the provider's context
 * has three options: refuse, truncate, or chunk. Truncation is forbidden because
 * it reports a fragment as a whole; refusing is what V4a did; chunking is what
 * **E4** and **F4** approve, under conditions.
 *
 * ## Structural first, and why that is not tidiness
 *
 * Boundaries are taken from the document's own structure — `SourceUnit`, section,
 * heading-defined block — in preference to a character count. A chunk that
 * respects unit boundaries **cannot split a quote that a unit contains**, so the
 * common case needs no overlap at all and every quote remains locatable inside
 * exactly one chunk. Overlap exists for the one case structure cannot help with:
 * a single unit larger than the whole context window.
 *
 * ## Nothing here is silent
 *
 * Every chunk carries its **id** and its **original source range** in code
 * points, so a proposal derived from chunk 3 of 7 is traceable to the text that
 * produced it rather than to the document. Overlap is recorded as a number, not
 * implied. A chunked read declares `chunked_context`, and
 * `computeConfidence` applies the declared 0.15 penalty for it (ADR-0011,
 * ADR-0022 §5).
 *
 * The strategy is **versioned**: change the algorithm and `CHUNK_STRATEGY_VERSION`
 * changes with it, so a recorded interaction says which algorithm produced it and
 * a recording keyed on a different strategy misses rather than replaying wrongly.
 */

/**
 * Chunking strategy identity. **Bump this on any behaviour change.**
 *
 * `structural-1`: pack whole units greedily up to the budget; split a single
 * over-budget unit by size with overlap; never split across a unit boundary.
 */
export const CHUNK_STRATEGY_VERSION = 'structural-1';

/** A unit of document structure, as the caller sees it. */
export interface ChunkableUnit {
  readonly id: string;
  /** Code-point offsets into the source's canonical text. */
  readonly charStart: number;
  readonly charEnd: number;
  readonly text: string;
}

export interface Chunk {
  /** `c1`, `c2`, … in document order. Deterministic, and stable for one strategy. */
  readonly chunkId: string;
  /** Code-point range in the ORIGINAL source text, not in the chunk. */
  readonly charStart: number;
  readonly charEnd: number;
  readonly text: string;
  /** Units wholly or partly contained. One entry when a unit was split. */
  readonly unitIds: readonly string[];
  /** True when this chunk is a size-based slice of a single over-budget unit. */
  readonly splitUnit: boolean;
  /** Code points shared with the previous chunk. Zero unless a unit was split. */
  readonly overlapChars: number;
}

export interface ChunkPlan {
  readonly strategyVersion: string;
  readonly chunks: readonly Chunk[];
  /** True when the content did not fit in one chunk. */
  readonly chunked: boolean;
  /** True when any structural unit had to be split by size. */
  readonly splitAnyUnit: boolean;
  readonly maxChars: number;
  readonly overlapChars: number;
}

export interface ChunkOptions {
  /** Character budget per chunk, derived from the model's context window. */
  readonly maxChars: number;
  /**
   * Overlap applied **only** when splitting a single over-budget unit.
   *
   * It exists so a sentence spanning a size boundary is present whole in at least
   * one chunk. It is never applied between structural chunks, because a unit
   * boundary is not a place a quote can straddle.
   */
  readonly overlapChars?: number;
}

/**
 * Plan the chunks for a set of units.
 *
 * Pure and deterministic: same units and options, same plan, every time. That is
 * what makes a recorded interaction replayable and a chunk id meaningful.
 */
export function planChunks(
  units: readonly ChunkableUnit[],
  options: ChunkOptions,
): ChunkPlan {
  const maxChars = Math.max(1, options.maxChars);
  const overlapChars = Math.max(0, Math.min(options.overlapChars ?? 0, Math.floor(maxChars / 4)));

  const chunks: Chunk[] = [];
  let splitAnyUnit = false;

  /** Units accumulating into the current chunk. */
  let pending: ChunkableUnit[] = [];

  const flush = (): void => {
    if (pending.length === 0) return;
    const first = pending[0] as ChunkableUnit;
    const last = pending[pending.length - 1] as ChunkableUnit;
    chunks.push({
      chunkId: `c${chunks.length + 1}`,
      charStart: first.charStart,
      charEnd: last.charEnd,
      text: pending.map((u) => u.text).join('\n\n'),
      unitIds: pending.map((u) => u.id),
      splitUnit: false,
      overlapChars: 0,
    });
    pending = [];
  };

  for (const unit of units) {
    const length = [...unit.text].length;

    // A unit that cannot fit alone is the only case size-based splitting applies
    // to. Flush first, so a split unit never shares a chunk with its neighbours —
    // that keeps every chunk either wholly structural or wholly one split unit.
    if (length > maxChars) {
      flush();
      splitAnyUnit = true;
      const codePoints = [...unit.text];
      const step = Math.max(1, maxChars - overlapChars);
      let offset = 0;
      let sliceIndex = 0;
      while (offset < codePoints.length) {
        const end = Math.min(offset + maxChars, codePoints.length);
        chunks.push({
          chunkId: `c${chunks.length + 1}`,
          // Ranges are in the ORIGINAL text, so a quote located inside this chunk
          // maps back to the source without arithmetic at the call site.
          charStart: unit.charStart + offset,
          charEnd: unit.charStart + end,
          text: codePoints.slice(offset, end).join(''),
          unitIds: [unit.id],
          splitUnit: true,
          overlapChars: sliceIndex === 0 ? 0 : Math.min(overlapChars, maxChars),
        });
        if (end >= codePoints.length) break;
        offset += step;
        sliceIndex++;
      }
      continue;
    }

    const pendingLength = pending.reduce((n, u) => n + [...u.text].length + 2, 0);
    if (pendingLength + length > maxChars) flush();
    pending.push(unit);
  }
  flush();

  return {
    strategyVersion: CHUNK_STRATEGY_VERSION,
    chunks,
    chunked: chunks.length > 1,
    splitAnyUnit,
    maxChars,
    overlapChars,
  };
}
