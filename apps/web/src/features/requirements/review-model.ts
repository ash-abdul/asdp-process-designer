/**
 * The review decisions — **U3-d**, DOM-free.
 *
 * Everything a decision means lives here so it can be tested without a browser:
 * the action vocabulary, what each action does to a status, the phase machine,
 * the refusal classifier, the **Z6-a** eligibility rule and the **G1** reopen
 * comparison. `RequirementInspector.tsx` renders what this file decides.
 *
 * ## The one sentence this file exists to keep true
 *
 * **`accept` is not `approve`.** `review.ts` in the command layer is explicit
 * that accepting means *"I have read this and it is ready to be approved"*. The
 * API has no route to `approved` — `POST g1/approve` alone reaches it, the
 * repository refuses `setReviewStatus('approved')` independently, and migration
 * 010 refuses it without an approver, a timestamp and a baseline. So the word
 * **must not appear on any control here**, and no outcome message may claim a
 * requirement is approved. A button that lied about this would be lying about
 * the epistemic ladder ([ADR-0007](../../../../../docs/adr/ADR-0007-epistemic-ladder.md)),
 * not merely mislabelled.
 *
 * ## What this file is NOT
 *
 * It holds **no business rule** ([ADR-0039](../../../../../docs/adr/ADR-0039-react-presentation-layer.md)
 * §3). It does not decide whether a requirement *may* be accepted, whether the
 * actor is authorised, or whether a status transition is legal. The server does
 * all three and refuses when the answer is no; this file maps the server's
 * vocabulary to words a reviewer can read, and renders refusals verbatim.
 *
 * **Z6-a is a friction safeguard and nothing more.** `mayDecide` makes a
 * careless decision harder to record by requiring the detail pane. It is **not**
 * evidence that meaningful human review occurred, it must never be described as
 * such, and **it does not close limitation 70**.
 */

import { ApiError } from '../../api/client.ts';
import type { RequirementStatusValue } from '../../design/semantics.ts';
import type { RequirementRow } from './requirement-model.ts';

// ---------------------------------------------------------------------------
// The action vocabulary
// ---------------------------------------------------------------------------

/**
 * The four review actions — exactly the four the API accepts.
 *
 * `approve` is deliberately absent, and its absence is enforced twice: the
 * controller refuses it with a **400**, and a structural test asserts no control
 * in this feature is labelled with the word.
 */
export type ReviewAction = 'accept' | 'reject' | 'defer' | 'send_for_clarification';

/**
 * The status vocabulary, reused from **U3-a** rather than restated.
 *
 * `RequirementRow.status` is a bare `string` because the API's list is validated
 * at the client boundary and rendered without narrowing. The *outcome* of a
 * review action is narrower than that, and using U3-a's union here means the
 * existing bidirectional drift guard already covers this file: a status the API
 * gained and the UI had not would fail `design.test.ts` before it could reach a
 * reviewer.
 */
type RequirementStatus = RequirementStatusValue;

export interface ReviewActionSpec {
  readonly action: ReviewAction;
  /** The control's label. **Never** the word approve, in any form. */
  readonly label: string;
  /** The status the API will set. Mirrors `reviewRequirement`, and is asserted against it. */
  readonly resulting: RequirementStatus;
  /** What the reviewer is told the act means, before they perform it. */
  readonly means: string;
}

/**
 * The four actions, in the order the inspector renders them.
 *
 * The order is deliberate and is not severity-ranked: `accept` first because it
 * is the common case, `reject` second because it is the consequential one, and
 * the two holding actions after. Nothing here is a default — there is no
 * pre-selected action and no primary-tone shortcut that makes one a single
 * keystroke away.
 */
export const REVIEW_ACTIONS: readonly ReviewActionSpec[] = [
  {
    action: 'accept',
    label: 'Accept',
    resulting: 'in_review',
    // The wording the whole slice turns on. "Ready to be approved" is a
    // statement about this requirement's readiness; "approved" would be a claim
    // about a gate that only G1 can make.
    means: 'I have read this and it is ready to be approved. It does not approve it.',
  },
  {
    action: 'reject',
    label: 'Reject',
    resulting: 'rejected',
    means: 'This requirement should not be part of the set.',
  },
  {
    action: 'defer',
    label: 'Defer',
    resulting: 'deferred',
    means: 'Not now — hold it out of the set without rejecting it.',
  },
  {
    action: 'send_for_clarification',
    label: 'Send for clarification',
    resulting: 'needs_clarification',
    means: 'Something about this needs answering before it can be judged.',
  },
];

/** The status the API sets for an action. Mirrors `reviewRequirement` exactly. */
export function resultingStatus(action: ReviewAction): RequirementStatus {
  const spec = REVIEW_ACTIONS.find((a) => a.action === action);
  // Unreachable through the type, and thrown rather than defaulted: a silent
  // fallback here would invent a status the server never returned.
  if (spec === undefined) throw new Error(`no such review action: ${String(action)}`);
  return spec.resulting;
}

/**
 * What the reviewer is told **after** the action succeeded.
 *
 * Derived from the status the server actually returned, not from the action that
 * was sent — so if the API ever mapped an action differently, the reviewer would
 * read the truth rather than this client's expectation.
 */
export function outcomeWording(status: string): string {
  switch (status) {
    case 'in_review':
      // Never "approved". A test asserts this string, because it is the one
      // sentence in the slice a plausible rewording would break.
      return 'now in review — ready to be approved. Approval is G1’s act, and nothing here performs it.';
    case 'rejected':
      return 'rejected, and no longer part of the requirement set.';
    case 'deferred':
      return 'deferred, and held out of the requirement set for now.';
    case 'needs_clarification':
      return 'sent for clarification.';
    case 'draft':
      return 'still a draft.';
    case 'approved':
      // Unreachable: no route sets it from this screen. Rendered as a plain
      // statement of fact if the server ever returned it, and still not claimed
      // as this action's doing.
      return 'approved — which this screen cannot do, and did not do.';
    case 'superseded':
      return 'superseded by a later version.';
    default:
      return `now ${String(status)}.`;
  }
}

// ---------------------------------------------------------------------------
// Z6-a — a decision needs the requirement's detail context
// ---------------------------------------------------------------------------

/**
 * Whether a decision may be recorded at all — **Z6-a**.
 *
 * The rule is *"no control and no keyboard path that records a decision on a
 * requirement whose detail pane has not been rendered"*. The structural half is
 * that the controls exist only inside `RequirementInspector`, which renders only
 * when a requirement is selected; this predicate is the second half, so a future
 * caller that acquired a row from somewhere else still cannot act on it without
 * passing the row the inspector holds.
 *
 * **Approved with its qualification, restated because it is the easiest thing in
 * this slice to overstate:** this is friction, not evidence. It makes a careless
 * decision harder to record. It does not show that anyone read anything, and it
 * closes no part of limitation 70.
 */
export function mayDecide(row: RequirementRow | undefined): boolean {
  return row !== undefined;
}

/**
 * Whether **Confirm inference** is offered for this requirement.
 *
 * Only for `derivation === 'inferred'`. For anything else the control is **not
 * rendered at all** rather than rendered disabled: the API refuses a non-inferred
 * requirement with *"there is nothing to confirm"*, and a permanently disabled
 * control on every other row would imply a capability that does not apply and
 * add noise to the one place it does.
 *
 * Authorisation is a separate axis. An inferred requirement shows the control to
 * everyone and **disables it with the missing role named** for an actor who may
 * not use it — the Y18 rule, unchanged. Relevance decides whether it exists;
 * role decides whether it is usable.
 */
export function confirmInferenceOffered(row: RequirementRow): boolean {
  return row.derivation === 'inferred';
}

// ---------------------------------------------------------------------------
// The phase machine
// ---------------------------------------------------------------------------

/**
 * What a decision is doing, and how it ended.
 *
 * `refused` is a **first-class outcome**, not an error (**Y27**) — the server
 * declining to review an approved requirement is the system working. Modelled on
 * `CitePhase` from U3-b for the same reason: one idiom for one kind of thing.
 *
 * `requirementId` is carried on every non-idle phase so an outcome can never be
 * rendered against a requirement it did not concern — the bug where a reviewer
 * changes selection mid-request and reads someone else's refusal.
 */
export type ReviewPhase =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'sending';
      readonly requirementId: string;
      /** `undefined` for confirm-inference, which is not one of the four. */
      readonly action: ReviewAction | 'confirm_inference';
    }
  | {
      readonly kind: 'applied';
      readonly requirementId: string;
      readonly action: ReviewAction | 'confirm_inference';
      /**
       * The status the server returned — **not** the one this client predicted.
       *
       * A `string`, deliberately: narrowing it here would mean rejecting a status
       * the server actually sent, and the honest response to an unrecognised
       * status is to say so (U3-a's `unknownState`), never to discard it.
       */
      readonly status: string;
      readonly message: string;
    }
  | {
      readonly kind: 'refused';
      readonly requirementId: string;
      readonly action: ReviewAction | 'confirm_inference';
      /** The server's own words. Never paraphrased, never invented. */
      readonly reason: string;
      readonly status?: number;
      /** True when the refusal is about the caller's role rather than the data. */
      readonly roleRefusal: boolean;
      /** True when re-reading and retrying is the right response (409). */
      readonly staleRead: boolean;
    };

/**
 * Turn a failed decision into a refusal, **quoting the server**.
 *
 * The status vocabulary is preserved (CLAUDE.md §12) because it sends the reader
 * somewhere different in each case: 403 to their permissions, 409 to a re-read,
 * 400 to the requirement itself. Collapsing them into *"something went wrong"*
 * is how a precise refusal becomes useless.
 *
 * **503 carries a known mis-signal, recorded rather than papered over.**
 * Limitation 79 / **H6**: a domain error thrown *inside* a transaction is
 * flattened to `503 database unavailable`. Both U3-d routes throw their own
 * guards **before** the transaction opens, so this slice's refusals are correctly
 * 400 — but a defect deeper in one would mis-report as an outage. The client
 * renders the server's words either way, and does not attempt to second-guess
 * which it is.
 */
export function reviewRefusal(
  requirementId: string,
  action: ReviewAction | 'confirm_inference',
  error: unknown,
): ReviewPhase {
  if (error instanceof ApiError) {
    return {
      kind: 'refused',
      requirementId,
      action,
      reason: error.message,
      status: error.status,
      roleRefusal: error.status === 403,
      staleRead: error.status === 409,
    };
  }
  return {
    kind: 'refused',
    requirementId,
    action,
    reason: error instanceof Error ? error.message : 'the request failed, and no reason was given',
    roleRefusal: false,
    staleRead: false,
  };
}

/**
 * What to tell the reader to do about a refusal, beyond the server's words.
 *
 * Advice only — the reason is always shown verbatim alongside it.
 */
export function refusalAdvice(phase: Extract<ReviewPhase, { kind: 'refused' }>): string {
  if (phase.roleRefusal) return 'This needs the BusinessAnalyst or ProcessArchitect role.';
  if (phase.staleRead) return 'This requirement changed while it was open. Reload and read it again before deciding.';
  if (phase.status === 404) return 'It may have been removed, or the project may have changed.';
  if (phase.status === 503) return 'The service could not complete the write. Nothing was recorded.';
  return 'Nothing was recorded.';
}

/** Whether any decision is in flight — every control is disabled while one is. */
export function isSending(phase: ReviewPhase): boolean {
  return phase.kind === 'sending';
}

// ---------------------------------------------------------------------------
// The G1 reopen surface
// ---------------------------------------------------------------------------

/** The gate statuses this file compares. Mirrors `GateStatus` in `@asdp/schemas`. */
export type GateStatusValue = 'not_ready' | 'ready' | 'approved' | 'rejected' | 'reopened';

export interface G1Observation {
  /** G1's status now, whatever it is. Rendered as state, always. */
  readonly status: GateStatusValue | undefined;
  /** True when G1 stands reopened now. */
  readonly reopened: boolean;
  /**
   * True **only** when `approved → reopened` was observed across this action.
   *
   * This is the whole point of reading the gates twice. A gate already reopened
   * before the reviewer acted was not reopened *by* them, and saying so would be
   * inventing a causal claim out of a coincidence of timing.
   */
  readonly causedByThisAction: boolean;
  /** What the reviewer is told, or `undefined` when there is nothing to say. */
  readonly message: string | undefined;
}

/**
 * Compare G1 before and after a mutation — the **G1-reopen surface**.
 *
 * `mutate()` reconciles G1 inside every workspace mutation and **discards**
 * whether it reopened, so no mutation response carries the fact. Reading
 * `GET /projects/:p/gates` either side of the action is what the approved
 * boundary specifies (**Z6**, §5.1), and it needs no API change.
 *
 * **Which actions can cause this, from the command layer rather than assumed:**
 * `requirementSetHash` excludes `rejected` and `deferred` members, so **reject**
 * and **defer** change the baseline hash and can reopen an approved G1, while
 * **accept**, **send for clarification** and **confirm-inference** leave the hash
 * untouched and cannot. In either case this function reports what it observed
 * rather than what the action was expected to do.
 *
 * **Not demonstrated as a naturally reachable journey in U3-d**, and the
 * acceptance record says so: reaching `approved` needs the full G1 flow, which is
 * U5. The server-side proof already exists — `review.test.ts`, *"a REVISION
 * after approval reopens G1"*.
 */
export function observeG1(
  before: GateStatusValue | undefined,
  after: GateStatusValue | undefined,
): G1Observation {
  const reopened = after === 'reopened';
  const causedByThisAction = before === 'approved' && reopened;

  if (causedByThisAction) {
    return {
      status: after,
      reopened,
      causedByThisAction,
      message:
        'Your decision reopened G1. It held an approval, and the approved baseline no longer ' +
        'matches, so that approval no longer stands and the set needs approving again.',
    };
  }
  if (reopened) {
    return {
      status: after,
      reopened,
      causedByThisAction,
      // State, with no causal claim. It was already reopened when the reviewer
      // arrived, and attributing it to them would be a fabrication.
      message: 'G1 stands reopened. This was already the case before this decision.',
    };
  }
  return { status: after, reopened, causedByThisAction, message: undefined };
}

/** G1's status out of a gate list, or `undefined` when the project has no G1 row. */
export function g1StatusOf(
  gates: readonly { readonly code: string; readonly status: string }[] | undefined,
): GateStatusValue | undefined {
  const g1 = gates?.find((g) => g.code === 'G1');
  return g1 === undefined ? undefined : (g1.status as GateStatusValue);
}
