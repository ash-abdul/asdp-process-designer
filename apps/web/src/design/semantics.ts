/**
 * The semantic state vocabulary — **Y2, Y14, Y19**.
 *
 * One place defines what a state *means*, what it is *called*, and how it is
 * *shown*. Every screen reuses it; no screen invents a badge.
 *
 * ## The rule this file exists to make testable
 *
 * **Y14: colour never carries meaning alone.** So every state declares three
 * independent channels:
 *
 * | Channel | Field | Survives |
 * |---|---|---|
 * | A glyph | `glyph` | greyscale, colour-blindness, a bad projector |
 * | A border treatment | `shape` | greyscale |
 * | A colour token | `tone` | nothing on its own |
 *
 * `web.test.ts` asserts that **dropping `tone` entirely leaves every state in a
 * family still distinguishable**. That is the difference between claiming the
 * rule and having it.
 *
 * ## What this file is NOT
 *
 * It is **not** a rule engine. It maps a value the **server** produced to a way
 * of showing it. It never decides severity (that is the rule catalogue's,
 * [ADR-0026](../../../../docs/adr/ADR-0026-static-validation-first.md)), never
 * decides an epistemic level ([ADR-0007](../../../../docs/adr/ADR-0007-epistemic-ladder.md)),
 * and never decides whether an anchor resolved
 * ([ADR-0038](../../../../docs/adr/ADR-0038-target-versus-content-verification.md)).
 */

/** The seven dimensions of state this application shows. */
export type SemanticFamily =
  | 'severity'
  | 'epistemic'
  | 'verification'
  | 'decidedness'
  | 'lifecycle'
  | 'gate'
  | 'policy';

/** The non-colour border treatment. A second channel, independent of the glyph. */
export type SemanticShape = 'solid' | 'outline' | 'dashed' | 'double';

export interface SemanticState {
  readonly family: SemanticFamily;
  /** The machine value, as the server said it. */
  readonly state: string;
  /** What a person calls it. */
  readonly label: string;
  /** The non-colour cue. Never empty. */
  readonly glyph: string;
  /** The second non-colour cue. */
  readonly shape: SemanticShape;
  /** The colour token. The THIRD channel, and never the only one. */
  readonly tone: string;
  /** What a screen reader is told, beyond the label. */
  readonly srText: string;
}

const S = (
  family: SemanticFamily,
  state: string,
  label: string,
  glyph: string,
  shape: SemanticShape,
  tone: string,
  srText: string,
): SemanticState => ({ family, state, label, glyph, shape, tone, srText });

/**
 * The vocabulary.
 *
 * Kept as data, not as a switch, so a test can enumerate it. A switch statement
 * cannot be asked *"is every case distinguishable without colour?"*.
 */
export const VOCABULARY: readonly SemanticState[] = [
  // --- severity: the rule catalogue's, carried through unaltered (ADR-0026) --
  S('severity', 'error', 'Error', '✕', 'solid', 'danger', 'error severity'),
  S('severity', 'warning', 'Warning', '▲', 'double', 'caution', 'warning severity'),
  S('severity', 'info', 'Info', 'i', 'outline', 'neutral', 'informational severity'),

  // --- the epistemic ladder (ADR-0007). Four levels, never conflated ---------
  S('epistemic', 'L1', 'Extracted', '“”', 'solid', 'fact', 'level 1, extracted fact'),
  S('epistemic', 'L2', 'Interpreted', '≈', 'dashed', 'ai', 'level 2, AI interpretation'),
  S('epistemic', 'L3', 'Recommended', '◈', 'double', 'ai', 'level 3, AI recommendation'),
  S('epistemic', 'L4', 'Human approved', '✓', 'outline', 'approved', 'level 4, approved by a human'),

  // --- verification (ADR-0038). These two must NEVER look alike -------------
  S('verification', 'resolved', 'Resolved', '⦿', 'solid', 'fact', 'anchor resolved to its exact region'),
  S(
    'verification',
    'content_unverified',
    'Content unverified',
    '?',
    'dashed',
    'caution',
    'target exists but its content is not verified',
  ),
  S('verification', 'drifted', 'Drifted', '≠', 'double', 'danger', 'the anchored content has changed'),
  S('verification', 'broken', 'Broken anchor', '⊘', 'double', 'danger', 'anchor no longer resolves'),

  // --- decidedness. "Nobody decided" is not a low value --------------------
  S('decidedness', 'decided', 'Decided', '●', 'solid', 'neutral', 'decided'),
  S('decidedness', 'undecided', 'Undecided', '○', 'dashed', 'undecided', 'undecided — nobody has decided yet'),

  // --- lifecycle, as the sources API reports it ----------------------------
  S('lifecycle', 'parsed', 'Parsed', '✓', 'solid', 'ok', 'parsed successfully'),
  S('lifecycle', 'parsing', 'Parsing', '⋯', 'outline', 'pending', 'parsing in progress'),
  S('lifecycle', 'parse_failed', 'Could not be parsed', '✕', 'solid', 'danger', 'parse failed; the source is still recorded'),
  S('lifecycle', 'superseded', 'Superseded', '⇥', 'dashed', 'muted', 'superseded by a later source'),

  // --- the gate (ADR-0017). "reopened" is its own state --------------------
  S('gate', 'not_ready', 'Not ready', '○', 'dashed', 'undecided', 'gate not ready'),
  S('gate', 'ready', 'Ready', '◑', 'outline', 'ok', 'gate ready to approve'),
  S('gate', 'approved', 'Approved', '✓', 'solid', 'approved', 'gate approved'),
  S('gate', 'reopened', 'Reopened', '↺', 'double', 'caution', 'gate reopened because its baseline or validation run changed'),

  // --- egress policy (ADR-0021) -------------------------------------------
  S('policy', 'permitted', 'Permitted', '●', 'solid', 'ok', 'egress permitted'),
  S('policy', 'blocked_by_policy', 'Blocked by policy', '⊗', 'solid', 'danger', 'blocked by data classification policy'),
];

/**
 * An unrecognised value gets a state that **says** it is unrecognised.
 *
 * It must never fall through to a benign default. A value the UI does not know
 * is exactly the case where quietly rendering "ok" is a lie, and the drift it
 * would hide is a server that started emitting something new.
 */
export function unknownState(family: SemanticFamily, value: string): SemanticState {
  return S(family, value, `Unrecognised: ${value}`, '⚠', 'double', 'unknown', `unrecognised ${family} value`);
}

export function semanticState(family: SemanticFamily, value: string | undefined): SemanticState {
  if (value === undefined) return unknownState(family, '(absent)');
  const found = VOCABULARY.find((s) => s.family === family && s.state === value);
  return found ?? unknownState(family, value);
}

export function statesIn(family: SemanticFamily): readonly SemanticState[] {
  return VOCABULARY.filter((s) => s.family === family);
}

/** Class names for a badge. Colour is one of three, and it is listed last. */
export function badgeClasses(state: SemanticState): readonly string[] {
  return ['badge', `badge--shape-${state.shape}`, `badge--tone-${state.tone}`];
}

/**
 * The accessible name. Direction and language are added by the caller where the
 * content has them — U1's precedent: *"evidence, counter-flow, right to left, ar"*.
 */
export function accessibleName(state: SemanticState, subject?: string): string {
  return subject === undefined ? `${state.label}, ${state.srText}` : `${subject}, ${state.label}, ${state.srText}`;
}
