/**
 * WCAG contrast validation for the design tokens — **D-U2.5 refinement**.
 *
 * The approved foundation says *"contrast verified rather than assumed"* (**Y14**),
 * and until now it was assumed: chosen by eye, reviewed by eye, recorded as a
 * limitation. This module makes it **computable**, and `design.test.ts` asserts it
 * over every declared pair in **both** themes.
 *
 * ## What it does NOT do
 *
 * It does not change a colour to make a check pass. If a semantic pair cannot
 * meet its requirement, the test **fails and names the pair with its measured
 * ratio** — because the alternative is quietly reassigning a colour whose meaning
 * is fixed by the semantic vocabulary. A tone that says *danger* stays the tone
 * that says danger; if it cannot be read, that is a finding to report, not a
 * value to fudge.
 *
 * ## The thresholds
 *
 * | Use | WCAG | Ratio |
 * |---|---|---|
 * | Body and small text | 1.4.3 AA | **4.5** |
 * | Large text (≥24px, or ≥18.66px bold) | 1.4.3 AA | **3.0** |
 * | UI component boundaries, focus rings, meaningful borders | 1.4.11 AA | **3.0** |
 *
 * Pure functions over strings: no DOM, no browser, no stylesheet engine. The CSS
 * is parsed as text, which is deliberate — it means the tokens the browser will
 * actually resolve are the ones under test, rather than a duplicate palette in
 * TypeScript that could drift from them.
 */

/** A parsed set of custom properties for one theme. */
export interface TokenSet {
  readonly theme: 'light' | 'dark';
  readonly values: ReadonlyMap<string, string>;
}

export type Requirement = 'text' | 'large-text' | 'ui';

export const THRESHOLDS: Readonly<Record<Requirement, number>> = {
  text: 4.5,
  'large-text': 3,
  ui: 3,
};

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Extract the declarations of one selector block.
 *
 * Deliberately simple: the token file is a flat list of `--name: value;` pairs
 * inside `:root` selectors, and a real CSS parser would be a dependency (**A4**)
 * for no gain. If the file ever stops being flat, this throws rather than
 * silently returning a partial map — see `parseTokens`.
 */
export function declarationsOf(css: string, selector: string): Map<string, string> {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`selector '${selector}' not found in the token file`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  if (open === -1 || close === -1) throw new Error(`selector '${selector}' has no block`);

  const out = new Map<string, string>();
  for (const line of css.slice(open + 1, close).split('\n')) {
    const stripped = line.replace(/\/\*[\s\S]*?\*\//g, '').trim();
    const match = /^(--[a-z0-9-]+)\s*:\s*(.+?);$/i.exec(stripped);
    if (match !== null && match[1] !== undefined && match[2] !== undefined) {
      out.set(match[1], match[2].trim());
    }
  }
  return out;
}

/**
 * Both themes, as resolved token sets.
 *
 * Dark is the light set with the dark block's overrides applied — exactly how the
 * cascade resolves it in the browser, so a token the dark block forgets to
 * override is checked against its light value, which is the bug worth catching.
 */
export function parseTokens(css: string): readonly TokenSet[] {
  const light = declarationsOf(css, ':root {');
  const darkOverrides = declarationsOf(css, ':root[data-theme="dark"]');
  const dark = new Map(light);
  for (const [k, v] of darkOverrides) dark.set(k, v);
  return [
    { theme: 'light', values: light },
    { theme: 'dark', values: dark },
  ];
}

/** Resolve a token through any chain of `var(--other)` references. */
export function resolve(tokens: TokenSet, name: string, depth = 0): string {
  if (depth > 12) throw new Error(`token '${name}' has a circular reference`);
  const raw = tokens.values.get(name);
  if (raw === undefined) throw new Error(`token '${name}' is not defined for the ${tokens.theme} theme`);
  const varRef = /^var\((--[a-z0-9-]+)\)$/i.exec(raw.trim());
  if (varRef !== null && varRef[1] !== undefined) return resolve(tokens, varRef[1], depth + 1);
  return raw.trim();
}

// ---------------------------------------------------------------------------
// Colour and contrast
// ---------------------------------------------------------------------------

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/**
 * Parse `#rgb` or `#rrggbb`.
 *
 * **Alpha is refused rather than approximated.** A translucent colour's contrast
 * depends on what is behind it, so a validator that guessed a backdrop would
 * report a number nobody can rely on. Any token used in a checked pair must be
 * opaque — which is itself a useful constraint on the palette.
 */
export function parseHex(value: string): Rgb {
  const hex = value.trim();
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) {
    throw new Error(`'${value}' is not an opaque hex colour; contrast cannot be computed for it`);
  }
  const full =
    hex.length === 4
      ? `#${hex[1] ?? ''}${hex[1] ?? ''}${hex[2] ?? ''}${hex[2] ?? ''}${hex[3] ?? ''}${hex[3] ?? ''}`
      : hex;
  return {
    r: Number.parseInt(full.slice(1, 3), 16),
    g: Number.parseInt(full.slice(3, 5), 16),
    b: Number.parseInt(full.slice(5, 7), 16),
  };
}

/** WCAG 2.x relative luminance. */
export function luminance(colour: Rgb): number {
  const channel = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(colour.r) + 0.7152 * channel(colour.g) + 0.0722 * channel(colour.b);
}

/** WCAG 2.x contrast ratio, 1..21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

// ---------------------------------------------------------------------------
// The declared pairs
// ---------------------------------------------------------------------------

export interface Pair {
  /** What this combination is used for, in the words of the UI. */
  readonly what: string;
  readonly foreground: string;
  readonly background: string;
  readonly requirement: Requirement;
}

/**
 * Every token combination the application actually paints, with the requirement
 * that applies to it.
 *
 * Adding a combination to the stylesheet without adding it here is the drift this
 * cannot catch — so the list is grouped to match the token file, and the semantic
 * tones are generated from the vocabulary rather than typed out, which means a new
 * semantic state is checked automatically.
 */
export function declaredPairs(tones: readonly string[]): readonly Pair[] {
  const pairs: Pair[] = [
    // --- body text and surfaces ---
    { what: 'body text on the page background', foreground: '--asdp-fg', background: '--asdp-bg', requirement: 'text' },
    { what: 'body text on a card', foreground: '--asdp-fg', background: '--asdp-surface', requirement: 'text' },
    { what: 'body text on a sunken surface', foreground: '--asdp-fg', background: '--asdp-surface-sunken', requirement: 'text' },
    { what: 'muted text on a card', foreground: '--asdp-fg-muted', background: '--asdp-surface', requirement: 'text' },
    { what: 'muted text on the page background', foreground: '--asdp-fg-muted', background: '--asdp-bg', requirement: 'text' },
    { what: 'faint text (hints, secondary cells) on a card', foreground: '--asdp-fg-faint', background: '--asdp-surface', requirement: 'text' },
    { what: 'faint text on a sunken surface', foreground: '--asdp-fg-faint', background: '--asdp-surface-sunken', requirement: 'text' },

    // --- accent, links and primary actions ---
    { what: 'link and accent text on a card', foreground: '--asdp-accent', background: '--asdp-surface', requirement: 'text' },
    { what: 'primary button label', foreground: '--asdp-accent-fg', background: '--asdp-accent', requirement: 'text' },
    { what: 'accent text on its own soft tint', foreground: '--asdp-accent', background: '--asdp-accent-soft', requirement: 'text' },
    { what: 'the focus ring against a card', foreground: '--asdp-focus', background: '--asdp-surface', requirement: 'ui' },
    { what: 'the focus ring against the page background', foreground: '--asdp-focus', background: '--asdp-bg', requirement: 'ui' },

    // --- the AI accent ---
    { what: 'Ask ASDP accent text on a card', foreground: '--asdp-ai', background: '--asdp-surface', requirement: 'text' },
    { what: 'Ask ASDP accent text on its own soft tint', foreground: '--asdp-ai', background: '--asdp-ai-soft', requirement: 'text' },
    { what: "Ask ASDP's panel border", foreground: '--asdp-ai-line', background: '--asdp-ai-soft', requirement: 'ui' },

    // --- the rail, which is dark in both themes ---
    { what: 'rail item text', foreground: '--asdp-rail-fg', background: '--asdp-rail-bg', requirement: 'text' },
    { what: 'rail item text on hover', foreground: '--asdp-rail-fg', background: '--asdp-rail-bg-hover', requirement: 'text' },
    { what: 'the active rail item', foreground: '--asdp-rail-fg-strong', background: '--asdp-rail-active', requirement: 'text' },
    { what: 'rail section labels and unavailable entries', foreground: '--asdp-rail-fg-muted', background: '--asdp-rail-bg', requirement: 'text' },

    // --- borders that carry meaning (1.4.11) ---
    { what: 'a control border against a card', foreground: '--asdp-line-strong', background: '--asdp-surface', requirement: 'ui' },
    { what: 'a control border against the page background', foreground: '--asdp-line-strong', background: '--asdp-bg', requirement: 'ui' },

    // --- development authentication, which must never be subtle (F-U1-b) ---
    { what: 'the development authentication warning', foreground: '--asdp-dev-fg', background: '--asdp-dev-bg', requirement: 'text' },

    // --- the source viewer: text sits ON the highlight ---
    { what: 'document text under a resolved highlight', foreground: '--asdp-fg', background: '--asdp-hl-resolved', requirement: 'text' },
    { what: 'document text under a content-unverified highlight', foreground: '--asdp-fg', background: '--asdp-hl-unverified', requirement: 'text' },
    { what: 'document text under a drifted highlight', foreground: '--asdp-fg', background: '--asdp-hl-drifted', requirement: 'text' },
  ];

  // --- every semantic tone, as badge text and as a badge border ---
  for (const tone of tones) {
    pairs.push({
      what: `the '${tone}' badge label on its own tint`,
      foreground: `--asdp-tone-${tone}`,
      // `undecided` has a transparent tint by design, so it is checked against the
      // surface it actually sits on — a table cell.
      background: tone === 'undecided' ? '--asdp-surface' : `--asdp-tone-${tone}-soft`,
      requirement: 'text',
    });
    pairs.push({
      what: `the '${tone}' badge border against a card`,
      foreground: `--asdp-tone-${tone}`,
      background: '--asdp-surface',
      requirement: 'ui',
    });
  }

  return pairs;
}

export interface Measurement {
  readonly what: string;
  readonly theme: 'light' | 'dark';
  readonly requirement: Requirement;
  readonly ratio: number;
  readonly required: number;
  readonly passes: boolean;
  readonly foreground: string;
  readonly background: string;
}

/** Measure one pair in one theme. Throws only if a token is missing or translucent. */
export function measure(tokens: TokenSet, pair: Pair): Measurement {
  const fg = parseHex(resolve(tokens, pair.foreground));
  const bg = parseHex(resolve(tokens, pair.background));
  const ratio = contrastRatio(fg, bg);
  const required = THRESHOLDS[pair.requirement];
  return {
    what: pair.what,
    theme: tokens.theme,
    requirement: pair.requirement,
    ratio: Math.round(ratio * 100) / 100,
    required,
    passes: ratio >= required,
    foreground: pair.foreground,
    background: pair.background,
  };
}

/** Measure everything. The report, not a verdict — the test decides. */
export function audit(css: string, tones: readonly string[]): readonly Measurement[] {
  const pairs = declaredPairs(tones);
  return parseTokens(css).flatMap((tokens) => pairs.map((pair) => measure(tokens, pair)));
}

/** A one-line description, used in test failures so the number is actionable. */
export function describeFailure(m: Measurement): string {
  return (
    `${m.theme}: ${m.what} — ${m.ratio}:1, needs ${m.required}:1 ` +
    `(${m.foreground} on ${m.background}, WCAG AA ${m.requirement})`
  );
}
