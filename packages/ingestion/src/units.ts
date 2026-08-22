/**
 * Unit extraction primitives shared by the text adapters.
 *
 * Anchors minted here are **parser-minted** (provenance-and-anchoring.md §4.1):
 * deterministic, exact precision, and never produced by an AI. The AI never
 * computes an offset — that is the structural reason provenance survives a
 * provider swap.
 *
 * All offsets are Unicode CODE-POINT indices over NFC, logical-order text.
 * `@asdp/text` owns the arithmetic; nothing here re-implements it.
 */

import { normalise, type Direction } from '@asdp/text';
import { spanChecksum } from '@asdp/provenance';
import type { ProvenanceAnchor, SourceUnitType } from '@asdp/schemas';

/** One extracted unit, before the application layer assigns it an id. */
export interface ExtractedUnit {
  readonly ordinal: number;
  readonly type: SourceUnitType;
  /** Exactly the text the anchor spans. Never a trimmed or decorated variant. */
  readonly text: string;
  readonly language: string;
  readonly direction: Direction;
  readonly depth?: number;
  readonly anchor: ProvenanceAnchor;
}

export interface ExtractionResult {
  /** Adapter identity and version, recorded on every anchor. */
  readonly extractorVersion: string;
  readonly units: readonly ExtractedUnit[];
}

/** A line of the source, in code-point offsets. */
export interface Line {
  /** Inclusive code-point offset of the first character. */
  readonly start: number;
  /** Exclusive code-point offset, EXCLUDING the newline. */
  readonly end: number;
  readonly text: string;
}

/** Code points that may be trimmed from a span without changing its meaning. */
function isTrimmable(cp: string): boolean {
  return cp === ' ' || cp === '\t' || cp === '\r' || cp === '\n' || cp === '\u00A0' || cp === '\uFEFF';
}

/**
 * Split into lines over a code-point array.
 *
 * `\r` is excluded from the line text so a CRLF file yields the same units as an
 * LF file — otherwise the same document committed on two platforms would produce
 * different checksums and every anchor would appear to drift.
 */
export function toLines(cps: readonly string[]): Line[] {
  const lines: Line[] = [];
  let start = 0;
  for (let i = 0; i <= cps.length; i++) {
    if (i === cps.length || cps[i] === '\n') {
      let end = i;
      if (end > start && cps[end - 1] === '\r') end--;
      lines.push({ start, end, text: cps.slice(start, end).join('') });
      start = i + 1;
    }
  }
  // A trailing newline produces a final empty line, which is correct: it is a
  // blank line and terminates the preceding block.
  return lines;
}

export function isBlank(line: Line): boolean {
  return line.text.trim().length === 0;
}

/**
 * Tighten a span so it excludes leading and trailing whitespace.
 *
 * Required for anchor soundness: the anchor's quote must equal the slice at its
 * offsets exactly, so a span may not include whitespace the unit's text omits.
 * Returns null when the span is entirely whitespace.
 */
export function trimSpan(
  cps: readonly string[],
  start: number,
  end: number,
): { readonly start: number; readonly end: number } | null {
  let s = start;
  let e = end;
  while (s < e && isTrimmable(cps[s] as string)) s++;
  while (e > s && isTrimmable(cps[e - 1] as string)) e--;
  return e > s ? { start: s, end: e } : null;
}

/** Language and direction of a span, derived by `@asdp/text`. */
export function describeSpan(text: string): {
  readonly language: string;
  readonly direction: Direction;
} {
  const n = normalise(text);
  return { language: n.primaryLanguage, direction: n.direction };
}

/**
 * Mint an exact text anchor over a span.
 *
 * The quote and its checksum are recorded together, so resolution can verify
 * rather than assume (ADR-0008). `precision` is `exact` because a parser knows
 * precisely where it read.
 */
export function mintTextAnchor(args: {
  readonly sourceId: string;
  readonly spanText: string;
  readonly charStart: number;
  readonly charEnd: number;
  readonly language: string;
  readonly direction: Direction;
  readonly extractorVersion: string;
}): ProvenanceAnchor {
  return {
    sourceId: args.sourceId,
    target: { kind: 'text_range', charStart: args.charStart, charEnd: args.charEnd },
    quote: args.spanText,
    quoteChecksum: spanChecksum(args.spanText),
    language: args.language,
    direction: args.direction,
    precision: 'exact',
    extractorVersion: args.extractorVersion,
  };
}

/** Build a unit from a tightened span. Returns null for an empty span. */
export function buildUnit(args: {
  readonly sourceId: string;
  readonly cps: readonly string[];
  readonly start: number;
  readonly end: number;
  readonly ordinal: number;
  readonly type: SourceUnitType;
  readonly depth?: number;
  readonly extractorVersion: string;
}): ExtractedUnit | null {
  const span = trimSpan(args.cps, args.start, args.end);
  if (span === null) return null;

  const spanText = args.cps.slice(span.start, span.end).join('');
  const described = describeSpan(spanText);

  return {
    ordinal: args.ordinal,
    type: args.type,
    text: spanText,
    language: described.language,
    direction: described.direction,
    ...(args.depth === undefined ? {} : { depth: args.depth }),
    anchor: mintTextAnchor({
      sourceId: args.sourceId,
      spanText,
      charStart: span.start,
      charEnd: span.end,
      language: described.language,
      direction: described.direction,
      extractorVersion: args.extractorVersion,
    }),
  };
}
