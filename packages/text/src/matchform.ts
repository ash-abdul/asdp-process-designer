/**
 * The derived match form and its offset map back to the stored form.
 *
 * ADR-0023 rule 3: the match form is derived, never stored as truth, and an
 * offset map back to the stored form is maintained so that a match in the match
 * form yields an **exact anchor** into the stored form.
 *
 * This is the machinery that makes `post_hoc` citation recovery viable on Arabic
 * sources (ADR-0022): a provider returns a quote that differs from the document
 * only by diacritics, Alef variants, Tatweel or digit form, and we still mint an
 * exact-precision anchor.
 */

import { foldDigits, foldLetters, foldPresentationForms, stripDiacritics } from './arabic.ts';
import { toCodePoints } from './normalise.ts';

export interface MatchForm {
  /** The folded, case-normalised text used for searching only. */
  readonly text: string;
  /**
   * For each code-point index in `text`, the corresponding code-point index in
   * the stored form. Folding can drop characters (diacritics) or expand them
   * (lam-alef ligature → two letters), so this map is not the identity.
   */
  readonly toStored: readonly number[];
  /** Length of the stored form in code points, for bounds checking. */
  readonly storedLength: number;
}

/**
 * Build the match form of a stored string, together with its offset map.
 *
 * Folding order matters: presentation forms and ligatures expand first (so their
 * expansions are then subject to letter folding), diacritics are removed, then
 * letters and digits are folded, then Latin is case-folded. Applying letter
 * folding before ligature expansion would miss `لأ` inside U+FEF7.
 */
export function buildMatchForm(stored: string): MatchForm {
  const storedCps = toCodePoints(stored);

  let text = '';
  const toStored: number[] = [];

  for (let i = 0; i < storedCps.length; i++) {
    const ch = storedCps[i] as string;

    // 1. presentation forms and ligatures (may expand to several characters)
    const expanded = foldPresentationForms(ch);

    // 2. diacritics and Tatweel are dropped entirely
    const withoutDiacritics = stripDiacritics(expanded);
    if (withoutDiacritics.length === 0) continue;

    // 3. letter and digit folding, then Latin case folding
    const folded = foldDigits(foldLetters(withoutDiacritics)).toLowerCase();

    // Every code point produced by this stored character maps back to index i.
    for (const _ of folded) {
      toStored.push(i);
    }
    text += folded;
  }

  return { text, toStored, storedLength: storedCps.length };
}

/** Normalise a search needle the same way, discarding its offset map. */
export function toMatchText(s: string): string {
  return buildMatchForm(s.normalize('NFC')).text;
}

/**
 * Collapse runs of whitespace to a single space and trim.
 *
 * Applied to both haystack and needle before matching, because PDF extraction
 * frequently introduces or loses whitespace at line breaks. Whitespace collapse
 * is tracked in the offset map by the caller via `buildMatchFormCollapsed`.
 */
function isWhitespace(ch: string): boolean {
  return /\s/u.test(ch);
}

/**
 * Build a match form with whitespace runs collapsed to a single space, keeping
 * the offset map accurate. This is the form used for quote location, since a
 * quote reproduced from a PDF rarely preserves the original line breaking.
 */
export function buildMatchFormCollapsed(stored: string): MatchForm {
  const base = buildMatchForm(stored);
  const cps = toCodePoints(base.text);

  let text = '';
  const toStored: number[] = [];
  let previousWasSpace = false;

  for (let i = 0; i < cps.length; i++) {
    const ch = cps[i] as string;
    const mapped = base.toStored[i] as number;
    if (isWhitespace(ch)) {
      if (previousWasSpace) continue;
      text += ' ';
      toStored.push(mapped);
      previousWasSpace = true;
      continue;
    }
    text += ch;
    toStored.push(mapped);
    previousWasSpace = false;
  }

  // Trim, keeping the map aligned.
  let start = 0;
  let end = text.length;
  while (start < end && text[start] === ' ') start++;
  while (end > start && text[end - 1] === ' ') end--;

  return {
    text: text.slice(start, end),
    toStored: toStored.slice(start, end),
    storedLength: base.storedLength,
  };
}
