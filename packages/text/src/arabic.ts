/**
 * Arabic orthographic folding.
 *
 * Two forms are maintained for every text run (ADR-0023 rule 3):
 *   stored form  verbatim, diacritics and Tatweel preserved — used for display,
 *                quoting and evidence
 *   match form   derived, folded — used for deduplication, search and
 *                deterministic quote location
 *
 * The match form exists because AI providers return quotes that differ from the
 * source in exactly these respects, and `post_hoc` citation resolution
 * (ADR-0022) depends on tolerant matching that still yields an exact anchor.
 */

/** Arabic diacritics (harakat) and Quranic annotation marks. */
const DIACRITICS = new Set([
  0x064b, 0x064c, 0x064d, 0x064e, 0x064f, 0x0650, 0x0651, 0x0652, // fathatan..sukun
  0x0653, 0x0654, 0x0655, 0x0656, 0x0657, 0x0658, 0x0659, 0x065a,
  0x065b, 0x065c, 0x065d, 0x065e, 0x065f,
  0x0670, // superscript alef
  0x06d6, 0x06d7, 0x06d8, 0x06d9, 0x06da, 0x06db, 0x06dc,
  0x06df, 0x06e0, 0x06e1, 0x06e2, 0x06e3, 0x06e4, 0x06e7, 0x06e8,
  0x06ea, 0x06eb, 0x06ec, 0x06ed,
]);

const TATWEEL = 0x0640;

/** Letter folding applied to the match form only. */
const LETTER_FOLD = new Map<number, string>([
  // Alef variants → bare alef
  [0x0622, 'ا'], // آ alef with madda
  [0x0623, 'ا'], // أ alef with hamza above
  [0x0625, 'ا'], // إ alef with hamza below
  [0x0671, 'ا'], // ٱ alef wasla
  // Yeh variants → yeh
  [0x0649, 'ي'], // ى alef maksura
  [0x0626, 'ي'], // ئ yeh with hamza
  [0x06cc, 'ي'], // ی farsi yeh
  [0x06d2, 'ي'], // ۲ yeh barree
  // Teh marbuta → heh (search only; changes meaning, never applied to stored form)
  [0x0629, 'ه'], // ة
  // Kaf / heh variants
  [0x06a9, 'ك'], // ک keheh
  [0x06be, 'ه'], // ھ heh doachashmee
  // Waw with hamza → waw
  [0x0624, 'و'], // ؤ
]);

/** Arabic-Indic and Eastern Arabic-Indic digits → ASCII. */
const DIGIT_FOLD = new Map<number, string>();
for (let i = 0; i < 10; i++) {
  DIGIT_FOLD.set(0x0660 + i, String(i)); // ٠-٩
  DIGIT_FOLD.set(0x06f0 + i, String(i)); // ۰-۹
}

/** Arabic presentation forms → base letters (isolated/initial/medial/final). */
const PRESENTATION_FORM_BASE = new Map<number, string>([
  // Lam-Alef ligatures decompose to two letters.
  [0xfefb, 'لا'], [0xfefc, 'لا'],
  [0xfef7, 'لأ'], [0xfef8, 'لأ'],
  [0xfef9, 'لإ'], [0xfefa, 'لإ'],
  [0xfef5, 'لآ'], [0xfef6, 'لآ'],
]);

/**
 * Fold an Arabic presentation form (U+FE70–U+FEFF) to its base letter.
 *
 * PDF text extraction commonly yields presentation forms rather than base
 * letters. Folding them is a prerequisite for both anchoring and matching
 * (ADR-0023 rule 7). Returns null when the code point is not a presentation form.
 */
export function foldPresentationForm(cp: number): string | null {
  const ligature = PRESENTATION_FORM_BASE.get(cp);
  if (ligature !== undefined) return ligature;
  if (cp < 0xfe70 || cp > 0xfefc) return null;

  // Arabic Presentation Forms-B (U+FE80…) lays out each base letter's shapes
  // contiguously. Shape counts are NOT uniform:
  //   1  HAMZA — no contextual shapes at all
  //   2  non-connecting letters (isolated, final)
  //   4  connecting letters (isolated, final, initial, medial)
  // Getting HAMZA wrong shifts every subsequent letter by one slot, which
  // silently mistranslates ALEF as YEH-WITH-HAMZA. Hence the explicit table.
  const SHAPE_WIDTHS: readonly (readonly [number, number])[] = [
    [0x0621, 1], // ء hamza
    [0x0622, 2], // آ alef with madda
    [0x0623, 2], // أ alef with hamza above
    [0x0624, 2], // ؤ waw with hamza
    [0x0625, 2], // إ alef with hamza below
    [0x0626, 4], // ئ yeh with hamza
    [0x0627, 2], // ا alef
    [0x0628, 4], // ب beh
    [0x0629, 2], // ة teh marbuta
    [0x062a, 4], // ت teh
    [0x062b, 4], // ث theh
    [0x062c, 4], // ج jeem
    [0x062d, 4], // ح hah
    [0x062e, 4], // خ khah
    [0x062f, 2], // د dal
    [0x0630, 2], // ذ thal
    [0x0631, 2], // ر reh
    [0x0632, 2], // ز zain
    [0x0633, 4], // س seen
    [0x0634, 4], // ش sheen
    [0x0635, 4], // ص sad
    [0x0636, 4], // ض dad
    [0x0637, 4], // ط tah
    [0x0638, 4], // ظ zah
    [0x0639, 4], // ع ain
    [0x063a, 4], // غ ghain
    [0x0641, 4], // ف feh
    [0x0642, 4], // ق qaf
    [0x0643, 4], // ك kaf
    [0x0644, 4], // ل lam
    [0x0645, 4], // م meem
    [0x0646, 4], // ن noon
    [0x0647, 4], // ه heh
    [0x0648, 2], // و waw
    [0x0649, 2], // ى alef maksura
    [0x064a, 4], // ي yeh
  ];
  let slot = 0xfe80;
  for (const [base, width] of SHAPE_WIDTHS) {
    if (cp >= slot && cp < slot + width) return String.fromCodePoint(base);
    slot += width;
  }
  return null;
}

/** Remove diacritics and Tatweel. Applied to the match form only. */
export function stripDiacritics(s: string): string {
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number;
    if (DIACRITICS.has(cp) || cp === TATWEEL) continue;
    out += ch;
  }
  return out;
}

/** Fold Arabic-Indic digits to ASCII. Applied to the match form only. */
export function foldDigits(s: string): string {
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number;
    out += DIGIT_FOLD.get(cp) ?? ch;
  }
  return out;
}

/** Fold Alef/Yeh/Hamza/Teh-Marbuta variants. Applied to the match form only. */
export function foldLetters(s: string): string {
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number;
    out += LETTER_FOLD.get(cp) ?? ch;
  }
  return out;
}

/**
 * Fold presentation forms and ligatures to base letters.
 *
 * Applied to BOTH forms: a presentation form in the stored text would be a
 * faithful record of a broken extraction, not of the document. Correcting it is
 * part of producing the canonical stored form.
 */
export function foldPresentationForms(s: string): string {
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number;
    out += foldPresentationForm(cp) ?? ch;
  }
  return out;
}

/** True when the string contains any Arabic presentation form. */
export function hasPresentationForms(s: string): boolean {
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number;
    if (cp >= 0xfb50 && cp <= 0xfefc && foldPresentationForm(cp) !== null) return true;
  }
  return false;
}
