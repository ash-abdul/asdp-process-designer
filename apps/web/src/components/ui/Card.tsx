/**
 * Cards and fields — **Y17, Y18**.
 *
 * A card is a **container**, not a place to put information that exists nowhere
 * else (**Y18**). A field always has a **visible label** — never a placeholder
 * standing in for one, which disappears exactly when the user needs it.
 */

import type { ReactNode } from 'react';

export function Card({
  title,
  actions,
  children,
  flush,
  labelledBy,
  testId,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  labelledBy?: string;
  testId?: string;
}): ReactNode {
  return (
    <section
      className="card"
      {...(labelledBy === undefined ? {} : { 'aria-labelledby': labelledBy })}
      {...(testId === undefined ? {} : { 'data-testid': testId })}
    >
      {title === undefined ? null : (
        <header className="card__head">
          <h3 className="section-title">{title}</h3>
          <span className="card__spacer" />
          {actions}
        </header>
      )}
      <div className={flush === true ? 'card__body card__body--flush' : 'card__body'}>{children}</div>
    </section>
  );
}

export function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}): ReactNode {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint === undefined ? null : <span className="field__hint">{hint}</span>}
    </div>
  );
}

/** A key/value row in the inspector. Keys are quiet; values carry direction. */
export function InspectorRow({ label, children }: { label: ReactNode; children: ReactNode }): ReactNode {
  return (
    <div className="inspector__row">
      <span className="inspector__key">{label}</span>
      <span className="inspector__value">{children}</span>
    </div>
  );
}
