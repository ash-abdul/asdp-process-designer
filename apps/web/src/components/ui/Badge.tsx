/**
 * Semantic badges — **Y17**, and the rule that matters: **a component renders a
 * decision it was given.**
 *
 * `Badge` takes a `SemanticState` that `semantics.ts` produced from a value the
 * **server** supplied. It computes nothing. There is no `severityFor()` here and
 * there never will be — severity is the rule catalogue's
 * ([ADR-0026](../../../../../docs/adr/ADR-0026-static-validation-first.md)) and
 * an epistemic level is [ADR-0007](../../../../../docs/adr/ADR-0007-epistemic-ladder.md)'s.
 *
 * Three channels are rendered, always: the **glyph**, the **border treatment**
 * and the **colour**. Remove the colour and the badge still says which state it
 * is — which is the property `web.test.ts` asserts over the whole vocabulary.
 */

import type { ReactNode } from 'react';
import { accessibleName, badgeClasses, semanticState, type SemanticFamily, type SemanticState } from '../../design/semantics.ts';

export function Badge({
  state,
  subject,
  testId,
}: {
  state: SemanticState;
  /** Prepended to the accessible name, e.g. a filename or a rule id. */
  subject?: string;
  testId?: string;
}): ReactNode {
  return (
    <span
      className={badgeClasses(state).join(' ')}
      aria-label={accessibleName(state, subject)}
      {...(testId === undefined ? {} : { 'data-testid': testId })}
      data-state={state.state}
    >
      {/* The glyph is decoration for a screen reader — the aria-label carries the words. */}
      <span className="badge__glyph" aria-hidden="true">
        {state.glyph}
      </span>
      <span>{state.label}</span>
    </span>
  );
}

/** The common case: a family and the server's raw value. */
export function StateBadge({
  family,
  value,
  subject,
  testId,
}: {
  family: SemanticFamily;
  value: string | undefined;
  subject?: string;
  testId?: string;
}): ReactNode {
  return <Badge state={semanticState(family, value)} {...(subject === undefined ? {} : { subject })} {...(testId === undefined ? {} : { testId })} />;
}

/** Plain metadata: a kind, a classification, a language. Not a semantic state. */
export function Chip({ children, variant, title }: { children: ReactNode; variant?: 'rank'; title?: string }): ReactNode {
  return (
    <span className={variant === undefined ? 'chip' : `chip chip--${variant}`} {...(title === undefined ? {} : { title })}>
      {children}
    </span>
  );
}
