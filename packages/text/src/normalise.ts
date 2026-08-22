/**
 * Canonical text normalisation.
 *
 * ADR-0023: every stored string is NFC, in logical order, language-tagged.
 * One package owns normalisation; no other component may normalise text or
 * compute an offset.
 *
 * Offsets throughout ASDP are **Unicode code-point indices** over NFC text.
 * Never UTF-16 code units (silently wrong for supplementary-plane characters),
 * never grapheme clusters (unstable across ICU versions).
 */

/** Base text direction of a run. */
export type Direction = 'ltr' | 'rtl' | 'neutral';

/** A contiguous run of text sharing a language and direction. */
export interface TextRun {
  /** Code-point offset, inclusive. */
  readonly start: number;
  /** Code-point offset, exclusive. */
  readonly end: number;
  /** BCP-47 tag, or 'und' when undetermined. */
  readonly language: string;
  readonly direction: Direction;
}

export interface NormalisedText {
  /** NFC, logical order. The authoritative stored form. */
  readonly text: string;
  /** Length in **code points** (not UTF-16 units). */
  readonly length: number;
  readonly primaryLanguage: string;
  readonly direction: Direction;
  readonly runs: readonly TextRun[];
  /** Bidi control characters present, recorded rather than stripped (ADR-0023 rule 6). */
  readonly bidiControls: readonly { readonly offset: number; readonly codePoint: number }[];
}

// ---------------------------------------------------------------------------
// Code-point aware primitives
// ---------------------------------------------------------------------------

/** Split a string into an array of code points. */
export function toCodePoints(s: string): string[] {
  return Array.from(s);
}

/** Length in code points. */
export function codePointLength(s: string): number {
  let n = 0;
  for (const _ of s) n++;
  return n;
}

/**
 * Slice by **code-point** offsets. This is the only sanctioned way to take a
 * substring anywhere in ASDP; `String.prototype.slice` uses UTF-16 units and is
 * wrong for supplementary-plane characters.
 */
export function sliceByCodePoints(s: string, start: number, end: number): string {
  const cps = toCodePoints(s);
  return cps.slice(start, end).join('');
}

/** Convert a code-point offset to the equivalent UTF-16 index. */
export function codePointToUtf16Index(s: string, codePointOffset: number): number {
  let cp = 0;
  let i = 0;
  while (i < s.length && cp < codePointOffset) {
    const point = s.codePointAt(i);
    i += point !== undefined && point > 0xffff ? 2 : 1;
    cp++;
  }
  return i;
}

// ---------------------------------------------------------------------------
// Unicode ranges
// ---------------------------------------------------------------------------

const BIDI_CONTROLS = new Set([
  0x061c, // ARABIC LETTER MARK
  0x200e, // LEFT-TO-RIGHT MARK
  0x200f, // RIGHT-TO-LEFT MARK
  0x202a, // LEFT-TO-RIGHT EMBEDDING
  0x202b, // RIGHT-TO-LEFT EMBEDDING
  0x202c, // POP DIRECTIONAL FORMATTING
  0x202d, // LEFT-TO-RIGHT OVERRIDE
  0x202e, // RIGHT-TO-LEFT OVERRIDE
  0x2066, // LEFT-TO-RIGHT ISOLATE
  0x2067, // RIGHT-TO-LEFT ISOLATE
  0x2068, // FIRST STRONG ISOLATE
  0x2069, // POP DIRECTIONAL ISOLATE
]);

/** Arabic, Arabic Supplement, Arabic Extended-A/B, Presentation Forms A/B. */
function isArabicCodePoint(cp: number): boolean {
  return (
    (cp >= 0x0600 && cp <= 0x06ff) ||
    (cp >= 0x0750 && cp <= 0x077f) ||
    (cp >= 0x0870 && cp <= 0x089f) ||
    (cp >= 0x08a0 && cp <= 0x08ff) ||
    (cp >= 0xfb50 && cp <= 0xfdff) ||
    (cp >= 0xfe70 && cp <= 0xfeff)
  );
}

function isLatinLetter(cp: number): boolean {
  return (cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a);
}

/** Strongly RTL scripts in scope: Arabic and Hebrew. */
function isStrongRtl(cp: number): boolean {
  return isArabicCodePoint(cp) || (cp >= 0x0590 && cp <= 0x05ff);
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise raw decoded text into the canonical stored form.
 *
 * Deliberately does NOT strip bidi controls, diacritics or Tatweel: the stored
 * form is verbatim so evidence quotes remain faithful. Folding belongs to the
 * derived match form (see matchform.ts).
 */
export function normalise(raw: string): NormalisedText {
  const text = raw.normalize('NFC');

  const bidiControls: { offset: number; codePoint: number }[] = [];
  const runs: TextRun[] = [];

  let arabicCount = 0;
  let latinCount = 0;

  let offset = 0;
  let runStart = 0;
  let runDirection: Direction | null = null;
  let runLanguage = 'und';

  const pushRun = (end: number): void => {
    if (end > runStart && runDirection !== null) {
      runs.push({ start: runStart, end, language: runLanguage, direction: runDirection });
    }
  };

  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;

    if (BIDI_CONTROLS.has(cp)) bidiControls.push({ offset, codePoint: cp });

    let direction: Direction = 'neutral';
    let language = 'und';
    if (isStrongRtl(cp)) {
      direction = 'rtl';
      if (isArabicCodePoint(cp)) {
        language = 'ar';
        arabicCount++;
      }
    } else if (isLatinLetter(cp)) {
      direction = 'ltr';
      language = 'en';
      latinCount++;
    }

    // Neutral characters (spaces, digits, punctuation) extend the current run
    // rather than splitting it — otherwise every space would start a new run.
    if (direction !== 'neutral' && (direction !== runDirection || language !== runLanguage)) {
      pushRun(offset);
      runStart = offset;
      runDirection = direction;
      runLanguage = language;
    } else if (runDirection === null && direction !== 'neutral') {
      runDirection = direction;
      runLanguage = language;
    }

    offset++;
  }
  pushRun(offset);

  const primaryLanguage = arabicCount > latinCount ? 'ar' : latinCount > 0 ? 'en' : 'und';
  const direction: Direction =
    arabicCount > latinCount ? 'rtl' : latinCount > 0 ? 'ltr' : 'neutral';

  return {
    text,
    length: offset,
    primaryLanguage,
    direction,
    runs,
    bidiControls,
  };
}

/**
 * Base direction of a string, by the Unicode "first strong character" heuristic.
 * Used to set `dir` per text node rather than inheriting the UI locale
 * (ADR-0023 rule 9).
 */
export function baseDirection(s: string): Direction {
  for (const ch of s.normalize('NFC')) {
    const cp = ch.codePointAt(0) as number;
    if (isStrongRtl(cp)) return 'rtl';
    if (isLatinLetter(cp)) return 'ltr';
  }
  return 'neutral';
}

/** True when a string mixes strongly-directional runs and therefore needs isolation. */
export function isMixedDirection(s: string): boolean {
  let sawLtr = false;
  let sawRtl = false;
  for (const ch of s.normalize('NFC')) {
    const cp = ch.codePointAt(0) as number;
    if (isStrongRtl(cp)) sawRtl = true;
    else if (isLatinLetter(cp)) sawLtr = true;
    if (sawLtr && sawRtl) return true;
  }
  return false;
}
