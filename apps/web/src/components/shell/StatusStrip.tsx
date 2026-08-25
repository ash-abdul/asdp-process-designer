/**
 * The status strip — **Y3, Y26**.
 *
 * It is **never hidden, at any width**. That is the collapse invariant: what
 * collapses is chrome, never state. `responsive.ts` returns
 * `governanceVisible: true` in every layout it can produce, and a test sweeps
 * the width range to keep it that way.
 *
 * What belongs here is what a reviewer should never have to go looking for: the
 * environment, the identity in force, the classification ceiling in play, and
 * how fresh what they are reading is.
 */

import type { ReactNode } from 'react';

export function StatusStrip({ items }: { items: readonly { readonly glyph: string; readonly label: ReactNode; readonly testId?: string }[] }): ReactNode {
  return (
    <div className="statusstrip" data-testid="status-strip">
      {items.map((item, i) => (
        <span
          key={i}
          className="statusstrip__item"
          {...(item.testId === undefined ? {} : { 'data-testid': item.testId })}
        >
          <span aria-hidden="true">{item.glyph}</span>
          {item.label}
        </span>
      ))}
    </div>
  );
}
