/**
 * The requirement inspector — **Y6**'s fixed section order, proved on a
 * requirement for the first time.
 *
 * D-U2.5 recorded *"one inspector, one entity: the fixed section order is proved
 * on a source; requirements, conflicts and gates have no inspector because they
 * have no screen."* This is that limitation discharged for requirements.
 *
 * Order, unchanged from the accepted foundation:
 * **identity → provenance → confidence → actions → history.**
 *
 * ## The Actions section — **U3-d**
 *
 * It now holds the four review decisions and confirm-inference. **Revise and
 * human-inferred authoring remain U3-e and are absent**, and the section says so
 * by omission rather than by an anticipatory disabled control.
 *
 * **This inspector still never becomes an editor** (**Y7**). It records
 * decisions *about* a requirement; it does not change a requirement's text.
 * That distinction is what U3-e exists to handle properly, as a new version.
 *
 * Read-only composition is still expressible: with no `review` prop the section
 * renders U3-c's standing note unchanged.
 *
 * ## History, bounded by G-e
 *
 * A predecessor is **named** and never fetched. No API returns a prior version,
 * **G-e is deliberately unfilled**, and U3 provides no version-history viewer.
 */

import type { ReactNode } from 'react';
import { Inspector, InspectorSection } from '../../components/shell/Inspector.tsx';
import { InspectorRow } from '../../components/ui/Card.tsx';
import { StateBadge, Chip } from '../../components/ui/Badge.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Refused } from '../../components/states.tsx';
import {
  chipsFor,
  confidenceOf,
  confirmationOf,
  evidenceExpectationOf,
  degradationsOf,
  derivationOf,
  provenanceOf,
  versionOf,
  type RequirementRow,
} from './requirement-model.ts';
import {
  REVIEW_ACTIONS,
  confirmInferenceOffered,
  isSending,
  mayDecide,
  refusalAdvice,
  type ReviewAction,
  type ReviewPhase,
} from './review-model.ts';

/**
 * What the inspector needs in order to offer a decision — **U3-d**.
 *
 * The handlers take **one requirement id and one action**. There is no array
 * parameter anywhere in this interface, and that is the shape limitation 70's
 * only structural mitigation depends on: a bulk path would need a signature to
 * live in, and there is none.
 */
export interface ReviewSurface {
  readonly phase: ReviewPhase;
  /** Whether the current role may review at all. Affordance — the API decides. */
  readonly mayReview: boolean;
  /** Whether the current role may confirm an inference. Affordance only. */
  readonly mayConfirm: boolean;
  readonly onReview: (action: ReviewAction) => void;
  readonly onConfirmInference: () => void;
  /** A G1 reopen to report, or `undefined` when there is nothing to say. */
  readonly g1Message?: string;
}

export function RequirementInspector({
  row,
  sourceOf,
  onFollowEvidence,
  onClose,
  review,
}: {
  row: RequirementRow;
  sourceOf: (evidenceItemId: string) => string | undefined;
  onFollowEvidence: (evidenceItemId: string, sourceId: string) => void;
  onClose: () => void;
  /**
   * The review surface — **U3-d**.
   *
   * Optional, so the inspector still renders without it and the read-only
   * composition remains expressible. When absent the Actions section says the
   * build is read-only, exactly as it did in U3-c.
   */
  review?: ReviewSurface;
}): ReactNode {
  const confidence = confidenceOf(row);
  const confirmation = confirmationOf(row);
  const version = versionOf(row);
  const derivation = derivationOf(row);
  const degradations = degradationsOf(row);
  const chips = chipsFor(row, sourceOf);
  // Whether having no evidence is legitimate depends on the DERIVATION. An
  // inferred requirement is supported by its mandatory rationale instead.
  const expectation = evidenceExpectationOf(row, chips.length);

  return (
    <Inspector title={row.id} subtitle="Requirement proposal" onClose={onClose}>
      <InspectorSection title="Identity">
        <InspectorRow label="Proposition">
          {/* Source-language content, in its own direction (ADR-0023). */}
          <span dir={row.language.startsWith('ar') ? 'rtl' : 'ltr'} lang={row.language} data-testid="req-text">
            {row.text}
          </span>
        </InspectorRow>
        <InspectorRow label="RAF slot">
          <Chip>{row.rafSlot}</Chip>
        </InspectorRow>
        <InspectorRow label="Category">
          <Chip>{row.category}</Chip>
        </InspectorRow>
        <InspectorRow label="Status">
          <StateBadge family="lifecycle" value={row.status} subject={row.id} testId="req-status" />
        </InspectorRow>
        <InspectorRow label="Classification">
          <Chip title="At least the maximum classification of its evidence (invariant D10)">{row.classification}</Chip>
        </InspectorRow>
      </InspectorSection>

      <InspectorSection title="Provenance">
        <InspectorRow label="Epistemic level">
          <StateBadge family="epistemic" value={row.epistemicLevel} subject={row.id} testId="req-level" />
        </InspectorRow>
        <InspectorRow label="Derivation">
          <Chip>{derivation.derivation}</Chip>
        </InspectorRow>
        {derivation.rationale === undefined ? null : (
          <InspectorRow label="Inference rationale">
            <span data-testid="req-rationale">{derivation.rationale}</span>
          </InspectorRow>
        )}
        {derivation.defect === undefined ? null : (
          // A broken invariant is reported, never rendered as a blank field.
          <InspectorRow label="Inference rationale">
            <strong data-testid="req-rationale-defect">{derivation.defect}</strong>
          </InspectorRow>
        )}
        {provenanceOf(row).map((entry) => (
          <InspectorRow key={entry.label} label={entry.label}>
            {entry.value === undefined ? (
              <Chip title="Not applicable, or the API did not state it">not stated</Chip>
            ) : (
              <code className="id">{entry.value}</code>
            )}
          </InspectorRow>
        ))}
        <InspectorRow label="Evidence">
          {expectation.kind === 'rationale_instead' ? (
            /*
              **Legitimate, and it must not read as a defect.** An inferred
              requirement is supported by the rationale above rather than by a
              citation — `insertInferred` stores no links on purpose. Saying
              "none" here without saying why is how a correct row gets reported
              as broken.
            */
            <span className="table__sub" data-testid="req-evidence-rationale">
              None, and that is correct for an inferred requirement: it rests on the rationale above
              rather than on a citation. Invariant D2 is satisfied by the rationale.
            </span>
          ) : expectation.kind === 'defect' ? (
            <strong data-testid="req-no-evidence">{expectation.detail}</strong>
          ) : (
            <span className="row" data-testid="req-evidence">
              {chips.map((chip) =>
                chip.followable ? (
                  <Button
                    key={chip.evidenceItemId}
                    small
                    glyph="“”"
                    testId={`evidence-chip-${chip.evidenceItemId}`}
                    title={`Open the source at this anchored region · ${chip.contribution}`}
                    onClick={() => onFollowEvidence(chip.evidenceItemId, chip.sourceId as string)}
                  >
                    {chip.contribution}
                  </Button>
                ) : (
                  // Never dropped: a citation the workspace cannot follow is
                  // exactly what a reviewer needs to be told about (ADR-0008).
                  <Chip key={chip.evidenceItemId} title={`Evidence ${chip.evidenceItemId} is not in this project's evidence list`}>
                    unresolved citation
                  </Chip>
                ),
              )}
            </span>
          )}
        </InspectorRow>
      </InspectorSection>

      <InspectorSection title="Confidence">
        <InspectorRow label="Band">
          <Chip>{confidence.band}</Chip>
        </InspectorRow>
        <InspectorRow label="Computed value">
          {/* Y21: never a bare percentage, and never without its function. */}
          <span className="table__num" data-testid="req-confidence">
            {confidence.score}
          </span>
          <span className="table__sub"> · {confidence.functionVersion}</span>
        </InspectorRow>
        <InspectorRow label="Human confirmation">
          {/*
            **Two different facts, and U3-d had to stop conflating them.**

            `humanConfirmationRequired` says a confirmation IS REQUIRED — it is
            computed at write time and `confirmInference` does not clear it, quite
            correctly: the requirement still required one. `inferenceConfirmedBy`
            says a confirmation WAS GIVEN.

            U3-c rendered only the first, so recording a confirmation changed
            nothing on screen and the badge went on reading *"undecided"* after
            the act. Both fields are in the schema and both are returned; showing
            only one made a completed act invisible.
          */}
          <StateBadge
            family="decidedness"
            value={confirmation.state}
            subject={row.id}
            testId="req-confirmation"
          />
          <span className="table__sub" data-testid="req-confirmation-detail">
            {' '}
            {confirmation.detail}
          </span>
        </InspectorRow>
        <InspectorRow label="Degradations">
          {degradations.items.length === 0 ? (
            <span className="table__sub" data-testid="req-degradations">
              {degradations.summary}
            </span>
          ) : (
            <span className="row" data-testid="req-degradations">
              {degradations.items.map((d) => (
                <Chip key={d}>{d}</Chip>
              ))}
            </span>
          )}
        </InspectorRow>
        <p className="state__hint">{confidence.caution}</p>
      </InspectorSection>

      <InspectorSection title="Actions">
        {review === undefined ? (
          <p className="state__hint" data-testid="req-actions">
            <strong>Read-only in this build.</strong> Accepting, rejecting, deferring, sending for
            clarification, revising and confirming an inference are later slices and are not built.
            Nothing here approves anything: approval is G1&apos;s act alone, and no route reaches it.
          </p>
        ) : (
          <ReviewActions row={row} review={review} />
        )}
      </InspectorSection>

      <InspectorSection title="History">
        <InspectorRow label="Version">
          <span className="table__num" data-testid="req-version">
            {version.version}
          </span>
          {version.edited ? <span className="table__sub"> · edited by a person</span> : null}
        </InspectorRow>
        {version.predecessor === undefined ? null : (
          <InspectorRow label="Supersedes">
            <code className="id" data-testid="req-predecessor">
              {version.predecessor}
            </code>
          </InspectorRow>
        )}
        {version.changeReason === undefined ? null : (
          <InspectorRow label="Change reason">
            <span data-testid="req-change-reason">{version.changeReason}</span>
          </InspectorRow>
        )}
        {version.textDiffersFromAi ? (
          <InspectorRow label="Original AI wording">
            {/* What the model actually said, kept legible after any amount of
                human editing. It is on THIS row — no history read is involved. */}
            <span dir={row.language.startsWith('ar') ? 'rtl' : 'ltr'} lang={row.language} data-testid="req-original">
              {row.originalAiText}
            </span>
          </InspectorRow>
        ) : null}
        <p className="state__hint" data-testid="req-history-note">
          The predecessor is <strong>named, not retrievable</strong>. No API returns a prior version,
          and this build provides no version-history viewer.
        </p>
      </InspectorSection>
    </Inspector>
  );
}

/**
 * The five review controls — **U3-d**.
 *
 * ## Why this lives inside the inspector and nowhere else
 *
 * **Z6-a.** A decision may not be recorded on a requirement whose detail pane has
 * not been rendered, so the controls exist only in a component that renders only
 * when a requirement is open. `Requirements.tsx` names neither route and gains no
 * control, and a structural test asserts it.
 *
 * That is a **friction safeguard and nothing more**. It makes a careless decision
 * harder to record. It is not evidence that anyone reviewed anything, it must
 * never be described as such, and **it does not close limitation 70**.
 *
 * ## One act, one requirement
 *
 * Every control posts one requirement id. All five are disabled together while
 * any one of them is in flight, so a second decision cannot be started on top of
 * the first. There is no select-all, no multi-select, no *"accept all visible"*,
 * and no keyboard path that reaches more than the open requirement.
 *
 * ## Accept is not approve
 *
 * `Accept` maps to `in_review`. The word *approve* appears on **no control** —
 * only in the standing note that says approval is G1's act, which is the sentence
 * that makes the distinction rather than blurring it.
 */
function ReviewActions({ row, review }: { row: RequirementRow; review: ReviewSurface }): ReactNode {
  // Z6-a's second half. Structurally this is always true here — the inspector
  // renders only for a selected requirement — and it is asserted rather than
  // assumed so a future caller cannot route around the first half.
  if (!mayDecide(row)) return null;

  const sending = isSending(review.phase);
  const phase = review.phase;
  // An outcome belongs to the requirement it was recorded against. Without this
  // check, changing selection mid-request would show one requirement's refusal
  // under another's heading.
  const mine = phase.kind !== 'idle' && phase.requirementId === row.id;
  const roleReason = 'Needs BusinessAnalyst or ProcessArchitect.';

  return (
    <>
      <p className="state__hint" data-testid="req-actions">
        One decision, on this requirement. <strong>Accepting does not approve anything</strong> —
        it records that this requirement is ready to be approved. Approval is G1&apos;s act alone,
        and no control here reaches it.
      </p>

      <div className="row" data-testid="review-actions">
        {REVIEW_ACTIONS.map((spec) => (
          <Button
            key={spec.action}
            testId={`review-${spec.action}`}
            small
            disabled={!review.mayReview || sending}
            title={spec.means}
            onClick={() => review.onReview(spec.action)}
          >
            {sending && mine && phase.kind === 'sending' && phase.action === spec.action
              ? 'Recording…'
              : spec.label}
          </Button>
        ))}
      </div>

      {/* Relevance decides whether it exists; role decides whether it is usable.
          A non-inferred requirement gets no control at all rather than a
          permanently disabled one, because the API's refusal for that case —
          "there is nothing to confirm" — is about relevance, not permission. */}
      {confirmInferenceOffered(row) ? (
        <div className="stack" data-testid="confirm-inference-block">
          <p className="state__hint">
            This is an <strong>inferred</strong> requirement — a person&apos;s recommendation, L3.
            Confirming records that a human stands behind the inference. It is a separate act from
            accepting it, and it is not a shortcut to either.
          </p>
          {/*
            **Two visual-review findings fixed here, and the second was mine.**

            First: `tone="subtle"` inside a flex column stretched the button to
            full width, so it rendered as centred text with no box. Wrapped in
            `.row` it sizes to its content.

            Second, and the real one: **`.btn--subtle` sets
            `border-color: transparent` and shows a border only on hover.** So a
            control that records a governance decision was invisible *as a
            control* until the pointer happened to be over it — and the screenshot
            that appeared to show a border was simply taken while hovering. The
            default tone is correct for this: subordination is carried by
            placement and by the sentence above it, not by making a button look
            like prose. No token and no CSS changed — the wrong one of the
            existing tones had been chosen.

            The order matters too: the sentence explaining what an L3 confirmation
            IS comes before the control, so R-V7-3's point — L3 is not a shortcut
            — survives without disguising the button.
          */}
          <span className="row">
            <Button
              testId="review-confirm-inference"
              small
              disabled={!review.mayConfirm || sending}
              onClick={review.onConfirmInference}
            >
              {sending && mine && phase.kind === 'sending' && phase.action === 'confirm_inference'
                ? 'Confirming…'
                : 'Confirm inference'}
            </Button>
          </span>
        </div>
      ) : null}

      {review.mayReview ? null : (
        <p className="state__hint" data-testid="review-role-refused">
          {roleReason} These controls are disabled for your role, and{' '}
          <strong>the API refuses regardless of this control</strong>.
        </p>
      )}

      {mine && phase.kind === 'applied' ? (
        <p className="state__hint" role="status" data-testid="review-applied">
          <strong>{phase.requirementId}</strong> is {phase.message}
        </p>
      ) : null}

      {mine && phase.kind === 'refused' ? (
        <>
          <Refused
            what={`${phase.requirementId} was not changed`}
            // The server's own words, ALONE. Summarising them is how a precise
            // refusal — "is approved; changing an approved requirement means
            // revising it" — becomes a vague one.
            //
            // The advice used to be concatenated onto this string, and the visual
            // review caught the result: server messages carry no trailing full
            // stop, so it read as one run-on sentence — "unknown requirement
            // REQ-9999 Nothing was recorded." Two elements, so the quotation stays
            // a quotation and this application's advice stays visibly its own.
            reason={phase.reason}
            testId="review-refused"
          />
          <p className="state__hint" data-testid="review-refused-advice">
            {refusalAdvice(phase)}
          </p>
        </>
      ) : null}

      {/* The G1 reopen surface. Causation is claimed only for an
          approved → reopened transition observed across this action; an
          already-reopened gate is reported as state. */}
      {review.g1Message === undefined ? null : (
        <p className="state__hint" role="status" data-testid="review-g1">
          <StateBadge family="gate" value="reopened" subject="G1" />{' '}
          {review.g1Message}
        </p>
      )}
    </>
  );
}
