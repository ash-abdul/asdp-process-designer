/**
 * Technical identifier minting.
 *
 * ADR-0024: technical identifiers MUST be ASCII; display names MUST preserve
 * Unicode. Arabic characters work inconsistently across FEEL evaluation,
 * connector configuration, worker code, log aggregation and shell tooling, and
 * the failure mode is a latent runtime defect found months later in one tool.
 *
 * Identifiers are derived from a specification element's **identity**, never its
 * position, so they are stable across regeneration — without which every
 * regeneration would present every element as new and diff-based review would be
 * worthless (pattern-mapping.md §6).
 *
 * Strategy is the OD-4 hybrid: English name or glossary term → transliteration →
 * ordinal, always with a stable discriminator.
 */

import { stripDiacritics } from './arabic.ts';

/** XML NCName-safe: [A-Za-z_][A-Za-z0-9_.-]* */
const NCNAME_START = /^[A-Za-z_]$/;
const NCNAME_CHAR = /^[A-Za-z0-9_.-]$/;

export type IdentifierStrategy = 'english' | 'transliterated' | 'ordinal';

export interface MintedIdentifier {
  readonly id: string;
  readonly strategy: IdentifierStrategy;
  /** The Unicode display name, preserved verbatim. */
  readonly displayName: string;
}

export interface MintOptions {
  /** Element type prefix, e.g. 'Activity', 'Gateway', 'Event'. ASCII. */
  readonly prefix: string;
  /** The element's Unicode display name. */
  readonly displayName: string;
  /** An English name or glossary translation, when one exists. */
  readonly englishName?: string;
  /**
   * Stable discriminator derived from the specification element's identity.
   * NOT a positional counter.
   */
  readonly discriminator: string;
  /** Maximum slug length before truncation. */
  readonly maxSlugLength?: number;
}

/**
 * Arabic → Latin transliteration table.
 *
 * Deterministic and reversible-by-lookup, not phonetic guesswork: the generated
 * identifier is a handle, and the ID → display-name mapping is stored so an
 * operator can connect a log entry to a business step (ADR-0024 consequences).
 */
const TRANSLITERATION = new Map<string, string>([
  ['ا', 'a'], ['أ', 'a'], ['إ', 'i'], ['آ', 'aa'], ['ٱ', 'a'],
  ['ب', 'b'], ['ت', 't'], ['ث', 'th'], ['ج', 'j'], ['ح', 'h'], ['خ', 'kh'],
  ['د', 'd'], ['ذ', 'dh'], ['ر', 'r'], ['ز', 'z'], ['س', 's'], ['ش', 'sh'],
  ['ص', 's'], ['ض', 'd'], ['ط', 't'], ['ظ', 'z'], ['ع', 'a'], ['غ', 'gh'],
  ['ف', 'f'], ['ق', 'q'], ['ك', 'k'], ['ل', 'l'], ['م', 'm'], ['ن', 'n'],
  ['ه', 'h'], ['و', 'w'], ['ي', 'y'], ['ى', 'a'], ['ة', 'h'],
  ['ء', ''], ['ؤ', 'u'], ['ئ', 'i'],
  ['٠', '0'], ['١', '1'], ['٢', '2'], ['٣', '3'], ['٤', '4'],
  ['٥', '5'], ['٦', '6'], ['٧', '7'], ['٨', '8'], ['٩', '9'],
]);

/** True when every character is ASCII NCName-safe and the first is a valid start. */
export function isNcNameSafe(id: string): boolean {
  if (id.length === 0) return false;
  const chars = Array.from(id);
  const first = chars[0] as string;
  if (!NCNAME_START.test(first)) return false;
  return chars.every((c) => NCNAME_CHAR.test(c));
}

/** True when the whole string is printable ASCII. */
export function isAscii(s: string): boolean {
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number;
    if (cp > 0x7f) return false;
  }
  return true;
}

/** Transliterate Arabic to a Latin approximation. Returns '' if nothing maps. */
export function transliterate(s: string): string {
  const stripped = stripDiacritics(s.normalize('NFC'));
  let out = '';
  let mapped = false;
  for (const ch of stripped) {
    const t = TRANSLITERATION.get(ch);
    if (t !== undefined) {
      out += t;
      if (t.length > 0) mapped = true;
    } else if (/^[A-Za-z0-9]$/.test(ch)) {
      out += ch;
    } else {
      out += ' ';
    }
  }
  return mapped || /[A-Za-z0-9]/.test(out) ? out : '';
}

/** Lower-case, ASCII-only, underscore-separated slug. */
export function slugify(s: string, maxLength = 40): string {
  const words = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);

  let slug = '';
  for (const w of words) {
    const candidate = slug.length === 0 ? w : `${slug}_${w}`;
    if (candidate.length > maxLength) break;
    slug = candidate;
  }
  return slug;
}

/**
 * Mint a technical identifier.
 *
 * Hybrid strategy (OD-4): prefer an English name, fall back to transliteration,
 * fall back to an ordinal-only identifier. The display name is always preserved
 * unchanged.
 */
export function mintIdentifier(opts: MintOptions): MintedIdentifier {
  const maxSlug = opts.maxSlugLength ?? 40;

  if (!isAscii(opts.prefix) || !isNcNameSafe(opts.prefix)) {
    throw new Error(`identifier prefix must be ASCII NCName-safe: ${opts.prefix}`);
  }

  let slug = '';
  let strategy: IdentifierStrategy = 'ordinal';

  if (opts.englishName !== undefined && opts.englishName.trim().length > 0) {
    slug = slugify(opts.englishName, maxSlug);
    if (slug.length > 0) strategy = 'english';
  }

  if (slug.length === 0) {
    const romanised = transliterate(opts.displayName);
    slug = slugify(romanised, maxSlug);
    if (slug.length > 0) strategy = 'transliterated';
  }

  const id = slug.length > 0
    ? `${opts.prefix}_${slug}_${opts.discriminator}`
    : `${opts.prefix}_${opts.discriminator}`;

  if (!isNcNameSafe(id)) {
    throw new Error(`minted identifier is not NCName-safe: ${id}`);
  }

  return { id, strategy, displayName: opts.displayName };
}

/**
 * Validate a process-variable or FEEL identifier.
 *
 * Stricter than NCName: no dots or hyphens, because those are operators in FEEL.
 */
export function isVariableNameSafe(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

/** Validate a Camunda job type against the `<domain>.<action>` convention. */
export function isJobTypeSafe(jobType: string): boolean {
  return /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/.test(jobType);
}
