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
  /**
   * **Shared by a source and a requirement**, which is why the wording is not
   * source-specific any more (**U3-a**, and the consequence of **Z8-a** recorded
   * in [u3-proposal.md](../../../../docs/60-plan/u3-proposal.md) §7.1).
   *
   * `RequirementStatus` also contains `superseded`, and one family means one
   * entry. The badge's `subject` names which record it describes, so nothing is
   * lost by saying "record" rather than "source". Glyph, shape and tone are
   * unchanged.
   */
  S('lifecycle', 'superseded', 'Superseded', '⇥', 'dashed', 'muted', 'superseded by a later record'),

  // --- lifecycle, as the requirements API reports it (U3-a) -----------------
  //
  // **Z8-a**: these EXTEND the existing family. No new family, no new colour
  // token, no new shape — a requirement's state is a lifecycle exactly as a
  // source's is, and splitting them would give the same word two vocabularies.
  //
  // Every glyph is unique within the family, which is what makes the badges
  // readable in greyscale. That constraint is why `approved` is not `✓` (taken by
  // `parsed`) and `rejected` is not `✕` (taken by `parse_failed`).
  S('lifecycle', 'draft', 'Draft', '◌', 'dashed', 'undecided', 'proposed; nobody has reviewed it yet'),
  /**
   * **`in_review` is what `accept` produces, and it is NOT approval** (**Z7.1**).
   *
   * `reviewRequirement` maps `accept` to `in_review`, and the API has no route
   * that writes `approved` at all — that is the G1 transaction's alone. The label
   * and the screen-reader text both say so, because a reviewer who reads
   * "accepted" as "approved" has been misled by the badge.
   */
  S('lifecycle', 'in_review', 'In review', '◑', 'outline', 'pending', 'read and marked ready to be approved — not approved'),
  S('lifecycle', 'needs_clarification', 'Needs clarification', '?', 'outline', 'caution', 'sent for clarification; a question is outstanding'),
  S('lifecycle', 'deferred', 'Deferred', '⊖', 'dashed', 'muted', 'set aside; no decision has been taken'),
  S('lifecycle', 'rejected', 'Rejected', '⊘', 'solid', 'danger', 'rejected by a reviewer'),
  /**
   * The shield is deliberate rather than decorative.
   *
   * `approved` is written **only** by the G1 approval transaction — migration 010
   * refuses the status without an approver, a timestamp and a baseline, and
   * refuses all three without it. So the state a requirement reaches here is a
   * **gate** act, and the glyph says which act.
   */
  S('lifecycle', 'approved', 'Approved', '⛉', 'solid', 'approved', 'approved at G1 by a human, over a signed baseline'),

  // --- the gate (ADR-0017). "reopened" is its own state --------------------
  S('gate', 'not_ready', 'Not ready', '○', 'dashed', 'undecided', 'gate not ready'),
  S('gate', 'ready', 'Ready', '◑', 'outline', 'ok', 'gate ready to approve'),
  S('gate', 'approved', 'Approved', '✓', 'solid', 'approved', 'gate approved'),
  S('gate', 'reopened', 'Reopened', '↺', 'double', 'caution', 'gate reopened because its baseline or validation run changed'),

  // --- egress policy (ADR-0021) -------------------------------------------
  S('policy', 'permitted', 'Permitted', '●', 'solid', 'ok', 'egress permitted'),
  S('policy', 'blocked_by_policy', 'Blocked by policy', '⊗', 'solid', 'danger', 'blocked by data classification policy'),
];

// ---------------------------------------------------------------------------
// The requirement-status drift guard — U3-a
// ---------------------------------------------------------------------------

/**
 * The requirement statuses this build renders — **the UI's half of a drift
 * guard**, and the same shape as `ROLES` in `lib/dev-auth.ts`.
 *
 * This list must equal `RequirementStatus` in `@asdp/schemas` **exactly**, and
 * `design.test.ts` asserts equality in **both** directions. The bidirectional
 * part is U2-a's lesson, and it is not a formality:
 *
 * - **UI ⊆ API** alone would let this list name a status the server can never
 *   send — a badge for a state that does not exist;
 * - **API ⊆ UI** alone would let a new server status render through
 *   `unknownState`, which is honest but is a fallback, not a design.
 *
 * The list is declared here rather than derived from `@asdp/schemas` at runtime
 * on purpose. Deriving it would make the two agree **by construction**, which
 * sounds better and is worse: the drift test would then be asserting that a
 * value equals itself, and the thing it exists to catch — a vocabulary entry
 * nobody added — would pass silently. This is the same trade **G-c / W5b**
 * already took for roles: hardcode, and test the drift.
 *
 * **Every entry must resolve to a real `lifecycle` state**, which the same test
 * asserts. A status that fell through to `unknownState` would render as
 * *"Unrecognised"* to a reviewer.
 */
export const REQUIREMENT_STATUSES = [
  'draft',
  'needs_clarification',
  'in_review',
  'approved',
  'rejected',
  'superseded',
  'deferred',
] as const;

export type RequirementStatusValue = (typeof REQUIREMENT_STATUSES)[number];

/**
 * The family every requirement status is rendered in — **Z8-a**.
 *
 * Named rather than inlined at each call site so that "requirement statuses live
 * in `lifecycle`" is one fact in one place, and so the test asserts the same
 * thing the components do.
 */
export const REQUIREMENT_STATUS_FAMILY: SemanticFamily = 'lifecycle';

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
