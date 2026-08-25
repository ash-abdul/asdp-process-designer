/**
 * The contextual inspector — **Y6, Y7**.
 *
 * One selected entity, in depth, in a **fixed section order** so a reviewer
 * learns one shape and reuses it: identity → epistemic level → state → evidence
 * and provenance → confidence → actions → history.
 *
 * **Y7: it never becomes an editor for a generated artifact**, and making a
 * section editable later needs a new ADR. An inspector with a *"fix this"* field
 * is exactly how an override editor arrives without anyone deciding to build one
 * ([ADR-0003](../../../../../docs/adr/ADR-0003-no-override-editor.md)).
 *
 * D-U2.5 uses it for the one entity U1/U2 actually has in depth: a **source**.
 */

import type { ReactNode } from 'react';
import { Button } from '../ui/Button.tsx';

export function Inspector({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose?: () => void;
  children: ReactNode;
}): ReactNode {
  // Whether this panel is docked or overlaid is the SHELL's decision, published
  // as `data-inspector` on the shell and acted on in CSS. The panel does not
  // carry a copy of it: a second source of truth for the same fact is a fact
  // that can be wrong, and this one was — it was hardcoded `false`.
  return (
    <aside className="inspector" aria-label="Inspector" data-testid="inspector">
      <div className="panel__head">
        <h2 className="section-title">Inspector</h2>
        <span className="panel__spacer" />
        {onClose === undefined ? null : (
          <Button onClick={onClose} tone="subtle" small glyph="✕" ariaLabel="Close the inspector" testId="inspector-close">
            Close
          </Button>
        )}
      </div>
      <div className="inspector__title">
        <h3>{title}</h3>
        {subtitle === undefined ? null : <p className="table__sub">{subtitle}</p>}
      </div>
      {children}
    </aside>
  );
}

export function InspectorSection({ title, children }: { title: ReactNode; children: ReactNode }): ReactNode {
  return (
    <section className="inspector__section">
      <h4 className="section-title">{title}</h4>
      <div className="inspector__rows">{children}</div>
    </section>
  );
}
