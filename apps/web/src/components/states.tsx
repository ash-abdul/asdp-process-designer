/**
 * Loading, empty and error states — **W9**.
 *
 * Three rules, and they are the reason this is a shared component rather than
 * an inline ternary in each screen:
 *
 * 1. **An empty state carries its reason**, never a blank pane. *"No sources
 *    yet"* is useless; *"no sources yet — upload one to begin"* is not.
 * 2. **The API's status vocabulary survives to the screen.** CLAUDE.md §12 makes
 *    401, 403, 404 and 503 mean different things, and a UI that renders them all
 *    as *"something went wrong"* sends the user looking in the wrong place.
 * 3. **A 503 is reported honestly.** Limitation 79 / H6 means a domain error
 *    thrown inside a transaction still surfaces as `503 database unavailable`.
 *    Rewriting that in the client would hide a recorded defect.
 *
 * **Y27 adds a fourth state: REFUSAL, and it is not an error.** A permission
 * refusal, an egress refusal and a duplicate are three different outcomes and
 * they read differently. A refusal is the system working, so it is styled as a
 * caution rather than a failure — and it always quotes the server rather than
 * paraphrasing it.
 */

import type { ReactNode } from 'react';
import { ApiError, ContractError } from '../api/client.ts';
import { Button } from './ui/Button.tsx';

export function Loading({ what, lines }: { what: string; lines?: number }): ReactNode {
  // A skeleton that matches the eventual layout, not a spinner where a count
  // will be (Y27). The live region carries the words for a screen reader.
  const count = lines ?? 3;
  return (
    <div className="state state--loading" role="status" aria-live="polite">
      <span>Loading {what}…</span>
      <span aria-hidden="true" className="stack" style={{ gap: '6px', marginBlockStart: '6px' }}>
        {Array.from({ length: count }, (_, i) => (
          <span key={i} className="skeleton" style={{ inlineSize: `${100 - i * 12}%` }} />
        ))}
      </span>
    </div>
  );
}

export function Empty({ what, hint }: { what: string; hint: string }): ReactNode {
  return (
    <div className="state state--empty">
      <p className="state__title">
        <span aria-hidden="true">○</span>
        <strong>No {what} yet.</strong>
      </p>
      {/* An empty state carries its reason. "None" and "none yet decided" differ. */}
      <p className="state__hint">{hint}</p>
    </div>
  );
}

/**
 * A refusal — **Y27**.
 *
 * The server's own words, and its rule id or policy where it gave one. Never a
 * paraphrase: a refusal the UI has reworded is a refusal the user cannot look up.
 */
export function Refused({
  what,
  reason,
  rule,
  testId,
}: {
  what: string;
  reason: string;
  rule?: string;
  testId?: string;
}): ReactNode {
  return (
    <div className="state state--refusal" role="alert" {...(testId === undefined ? {} : { 'data-testid': testId })}>
      <p className="state__title">
        <span aria-hidden="true">⊘</span>
        <strong>Refused — {what}</strong>
      </p>
      <p>{reason}</p>
      {rule === undefined ? null : (
        <p className="state__hint">
          Rule <code>{rule}</code>
        </p>
      )}
      <p className="state__hint">A refusal is the system working. Nothing was changed.</p>
    </div>
  );
}

/** What the user should be told, and what they should do about it. */
function describe(error: Error): { title: string; advice: string; detail?: string } {
  if (error instanceof ContractError) {
    return {
      title: 'The server returned something this page did not expect',
      advice:
        'This is a contract mismatch between the UI and the API, not a problem with your data. ' +
        'It is reported rather than hidden so it can be fixed.',
      detail: error.message,
    };
  }
  if (error instanceof ApiError) {
    switch (error.kind) {
      case 'unauthenticated':
        return {
          title: 'Sign-in required',
          advice: 'Your identity was not accepted. This is a credentials problem, not a permissions one.',
          detail: error.message,
        };
      case 'forbidden':
        return {
          title: 'Your role does not permit this',
          advice:
            'This is a permissions problem, not a credentials one. Sign in with a role that has it, ' +
            'or ask someone who does.',
          detail: error.message,
        };
      case 'not_found':
        return { title: 'Not found', advice: 'It may have been removed, or the link may be stale.', detail: error.message };
      case 'conflict':
        return {
          title: 'Someone else changed this first',
          advice: 'Reload to see the current state before acting again.',
          detail: error.message,
        };
      case 'unavailable':
        return {
          title: 'The service cannot complete this right now',
          advice:
            'The API returned 503. Note that a domain error thrown inside a transaction is currently ' +
            'reported this way too (limitation 79 / H6), so the cause may be your input rather than the ' +
            'database. The audit log will say which.',
          detail: error.message,
        };
      case 'invalid':
        return { title: 'That request was rejected', advice: 'The server explained why:', detail: error.message };
      default:
        return { title: 'Request failed', advice: 'The server did not explain further.', detail: error.message };
    }
  }
  return { title: 'Something went wrong', advice: 'The error was not one this page recognises.', detail: error.message };
}

export function Failed({ error, retry }: { error: Error; retry?: () => void }): ReactNode {
  const { title, advice, detail } = describe(error);
  return (
    <div className="state state--error" role="alert">
      <p className="state__title">
        <span aria-hidden="true">✕</span>
        <strong>{title}</strong>
      </p>
      <p>{advice}</p>
      {detail === undefined ? null : <p className="state__detail">{detail}</p>}
      {retry === undefined ? null : (
        <span className="row">
          <Button onClick={retry} glyph="↻">
            Try again
          </Button>
        </span>
      )}
    </div>
  );
}
