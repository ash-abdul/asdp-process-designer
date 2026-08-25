/**
 * **Ask ASDP** — the model behind a dock that cannot do anything yet.
 *
 * ## Read this before touching the file
 *
 * **H3 / limitation 62 is unresolved.**
 * [ADR-0032](../../../../docs/adr/ADR-0032-retain-everything.md) requires prompt
 * and response payloads to be retained, and migration 006 stores metadata only.
 * **No live provider call is permitted from anywhere, including here.** An
 * unretained payload is unrecoverable, which is why the gap blocks rather than
 * warns.
 *
 * So this module deliberately contains **no way to ask anything**:
 *
 * - it exports **no** send, ask, submit, query, prompt or complete function;
 * - `availability()` is a **constant** — there is no argument, no flag and no
 *   environment variable that can make it available;
 * - there is **no stub answer**, because a stub that looks like a live answer is
 *   worse than no answer at all. Every evaluation number in this repository is
 *   already a synthetic corpus against an authored stub, and a *"helpful"*
 *   canned reply in the UI is how that stops being obvious.
 *
 * `web.test.ts` asserts the absence structurally, by inspecting this module's
 * exported names — because a comment promising restraint is not a control.
 *
 * ## What it IS
 *
 * The **UX architecture** approved as **Y22**: where the assistant lives, what
 * context it is bound to, what an answer will look like, and how the future
 * interactions are classified. Design, recorded in code so the shell is built
 * to the right shape.
 */

/**
 * The only availability this build can be in.
 *
 * A single-member union, on purpose: adding `{ kind: 'available' }` is a visible
 * type change that the compiler propagates to every use site, rather than a
 * boolean somebody can flip.
 */
export interface Unavailable {
  readonly kind: 'unavailable';
  /** Shown to the user, verbatim. */
  readonly message: string;
  /** What must be resolved. Named so nobody has to go looking. */
  readonly blocker: 'H3';
  readonly detail: string;
}

export function availability(): Unavailable {
  return {
    kind: 'unavailable',
    message: 'Ask ASDP unavailable — live AI enablement pending.',
    blocker: 'H3',
    detail:
      'Prompt and response payloads are not yet retained (limitation 62 / H3), and ADR-0032 requires ' +
      'retention before any live provider call. Nothing here calls a model, and no stub answer is ' +
      'shown in place of one.',
  };
}

// ---------------------------------------------------------------------------
// Context — the assistant always shows what it would be answering about
// ---------------------------------------------------------------------------

export type ContextScope = 'none' | 'project' | 'source';

export interface AssistantContext {
  readonly scope: ContextScope;
  /** Short, for the context chip. */
  readonly label: string;
  /** Longer, for the panel. */
  readonly detail: string;
}

export interface Selection {
  readonly projectLabel?: string;
  readonly projectKey?: string;
  readonly sourceName?: string;
}

/**
 * What the assistant is bound to.
 *
 * **No hidden context.** If nothing is selected it says so rather than guessing
 * — a chatbot guesses; a governed assistant states its scope.
 */
export function contextFor(selection: Selection): AssistantContext {
  if (selection.sourceName !== undefined && selection.projectKey !== undefined) {
    return {
      scope: 'source',
      label: `${selection.projectKey} · ${selection.sourceName}`,
      detail: `Answers would be scoped to the source “${selection.sourceName}” in project ${selection.projectKey}.`,
    };
  }
  if (selection.projectKey !== undefined) {
    return {
      scope: 'project',
      label: selection.projectKey,
      detail: `Answers would be scoped to project ${selection.projectKey}. Select a source to narrow them.`,
    };
  }
  return {
    scope: 'none',
    label: 'No project selected',
    detail: 'Select a project, and a source, to give the assistant something to be about.',
  };
}

// ---------------------------------------------------------------------------
// The future interactions — Y23's classification is the load-bearing part
// ---------------------------------------------------------------------------

/**
 * `deterministic` — computable **today** from data the API already returns, with
 * no model involved. `narration` — needs a model to add prose over facts.
 *
 * **Y23**: *"Show supporting evidence"* and *"Why is G1 blocked?"* are the two
 * most-used answers and the two most damaging to fabricate. They are classified
 * `deterministic` so that when they are built they are built as **queries**, and
 * any model involvement is a narration layer over an answer that is already
 * correct.
 */
export type Determinism = 'deterministic' | 'narration';

export interface FutureAction {
  readonly id: string;
  readonly label: string;
  readonly determinism: Determinism;
  /** The epistemic level the answer would carry (ADR-0007). */
  readonly level: 'L1' | 'L2' | 'L3';
  readonly note: string;
}

export const FUTURE_ACTIONS: readonly FutureAction[] = [
  {
    id: 'show-evidence',
    label: 'Show supporting evidence',
    determinism: 'deterministic',
    level: 'L1',
    note: 'A navigation action over existing anchors. Answerable without a model at all.',
  },
  {
    id: 'why-g1-blocked',
    label: 'Why is G1 blocked?',
    determinism: 'deterministic',
    level: 'L1',
    note: 'The five G1 blocker categories are computed by the API. The answer is a query, not a prompt.',
  },
  { id: 'explain-this', label: 'Explain this', determinism: 'narration', level: 'L2', note: 'Prose over facts already on screen.' },
  {
    id: 'identify-conflicts',
    label: 'Identify conflicts',
    determinism: 'narration',
    level: 'L2',
    note: 'Conflict candidates and precedence are deterministic; the explanation of why is not.',
  },
  {
    id: 'summarise-issues',
    label: 'Summarise outstanding issues',
    determinism: 'narration',
    level: 'L2',
    note: 'Grouping and prioritising findings, flags, questions and gaps.',
  },
  {
    id: 'explain-impact',
    label: 'Explain impact of a change',
    determinism: 'narration',
    level: 'L3',
    note: 'Reading the traceability graph aloud. Advice, never a decision.',
  },
];

/** The governance properties, shown in the dock so the boundary is visible, not implied. */
export const GOVERNANCE_NOTES: readonly string[] = [
  'Context-bound — it shows what it is answering about, and never has hidden context.',
  'Evidence-first — every answer would carry its evidence and navigable references, or say it has none.',
  'Non-committal — it has no approve, no edit and no write control of any kind. Approval stays yours.',
  'Badged — answers are AI interpretation or recommendation, never an extracted fact and never approved.',
  'Confidence is computed and shown with its inputs. It is never presented as accuracy.',
];
