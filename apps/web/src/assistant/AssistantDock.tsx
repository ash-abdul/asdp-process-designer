/**
 * **Ask ASDP** — the dock, and it does nothing.
 *
 * ## What this component is
 *
 * The approved UX architecture (**Y22, Y24**): a persistent but **collapsible**
 * dock, never modal, never unprompted, showing **what it would be answering
 * about**, what an answer would look like, and why it cannot answer yet.
 *
 * ## What it is NOT, and cannot become by accident
 *
 * **H3 / limitation 62 is unresolved**, so:
 *
 * - there is **no network call here** — no `fetch`, no client, no handler that
 *   could reach one. A browser test asserts zero requests while the dock is
 *   opened and interacted with;
 * - there is **no stub answer**. Not a canned reply, not a sample, not a
 *   *"here's what this would look like"* fabrication. Every evaluation figure in
 *   this repository is already a synthetic corpus against an authored stub, and a
 *   plausible-looking canned answer in the UI is how that stops being obvious;
 * - the composer is **present and disabled**, so the future input location is
 *   established without being usable;
 * - the future actions are **listed and disabled**, each labelled with whether it
 *   would be **deterministic** or **narration** (**Y23**) — because the two
 *   most-used answers should never be prompts.
 *
 * The dock also states its governance properties, so *"it cannot approve
 * anything"* is on screen rather than merely true.
 */

import type { ReactNode } from 'react';
import { availability, contextFor, FUTURE_ACTIONS, GOVERNANCE_NOTES, type Selection } from './assistant-model.ts';
import { Button } from '../components/ui/Button.tsx';
import { StateBadge } from '../components/ui/Badge.tsx';

export function AssistantDock({
  selection,
  overlay,
  onCollapse,
}: {
  selection: Selection;
  overlay?: boolean;
  onCollapse: () => void;
}): ReactNode {
  const state = availability();
  const context = contextFor(selection);

  return (
    <aside
      className="assistant"
      aria-label="Ask ASDP"
      data-testid="assistant"
      data-available="false"
      data-overlay={overlay === true ? 'true' : 'false'}
    >
      <div className="panel__head">
        <span className="assistant__brand">
          <span aria-hidden="true">✦</span> Ask ASDP
        </span>
        <span className="panel__spacer" />
        <Button onClick={onCollapse} tone="subtle" small glyph="»" ariaLabel="Collapse Ask ASDP" testId="assistant-collapse">
          Collapse
        </Button>
      </div>

      {/* Context is never hidden. A governed assistant states its scope. */}
      <div className="assistant__context" data-testid="assistant-context">
        <strong>Context</strong>
        <span>{context.label}</span>
        <span className="table__sub">{context.detail}</span>
      </div>

      {/*
        The honest unavailable state. `role="status"` rather than `alert`: it is a
        standing condition of this build, not an event that just happened.
      */}
      <div className="assistant__unavailable" role="status" data-testid="assistant-unavailable">
        <strong>{state.message}</strong>
        <span className="state__hint">{state.detail}</span>
        <span className="row">
          <StateBadge family="policy" value="blocked_by_policy" subject="Ask ASDP" testId="assistant-blocker" />
          <span className="state__hint">
            Blocked by <code>{state.blocker}</code>
          </span>
        </span>
      </div>

      <section className="inspector__section">
        <h3 className="section-title">What it will answer</h3>
        <ul className="assistant__actions">
          {FUTURE_ACTIONS.map((action) => (
            <li key={action.id} className="assistant__action">
              <Button disabled tone="ai" small glyph={action.determinism === 'deterministic' ? '▣' : '✦'} testId={`assistant-action-${action.id}`} title={action.note}>
                {action.label}
              </Button>
              <StateBadge family="epistemic" value={action.level} subject={action.label} />
              <span className="state__hint">{action.determinism === 'deterministic' ? 'deterministic' : 'narration'}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="inspector__section">
        <h3 className="section-title">How it is governed</h3>
        <ul className="assistant__notes">
          {GOVERNANCE_NOTES.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </section>

      {/* The future input location, established and disabled. */}
      <div className="assistant__composer">
        <label className="field__label" htmlFor="assistant-input">
          Ask a question
        </label>
        <textarea
          id="assistant-input"
          data-testid="assistant-input"
          rows={2}
          disabled
          placeholder="Unavailable until live AI enablement is complete."
        />
        <span className="state__hint">
          Disabled. No question is sent anywhere, and no answer is simulated.
        </span>
      </div>
    </aside>
  );
}

/** The collapsed state: a persistent tab, so the assistant is never gone. */
export function AssistantTab({ onExpand }: { onExpand: () => void }): ReactNode {
  return (
    <div className="assistant-tab">
      <button
        type="button"
        className="assistant-tab__button"
        onClick={onExpand}
        data-testid="assistant-expand"
        aria-label="Open Ask ASDP — currently unavailable, live AI enablement pending"
      >
        ✦ Ask ASDP
      </button>
    </div>
  );
}
