/**
 * The navigation rail — **Y3**, and §2.1's honesty rule.
 *
 * The rail declares the **whole** product. Most of it is not built, and every
 * unbuilt entry is a **disabled control that names the slice which would deliver
 * it** — never a link that looks live. The model is `design/nav.ts`, and a
 * bidirectional drift test asserts the available entries are exactly the
 * workspaces this build implements, so the rail cannot come to imply a
 * capability that does not exist.
 *
 * Dark in both themes: it is the product's one constant surface.
 */

import type { ReactNode } from 'react';
import { WORKSPACES, sliceBadge, unavailableReason } from '../../design/nav.ts';
import type { RailMode } from '../../design/responsive.ts';

export function Rail({
  mode,
  currentWorkspace,
  onSelect,
  hidden,
  footer,
}: {
  mode: RailMode;
  currentWorkspace: string;
  onSelect: (id: string) => void;
  hidden?: boolean;
  footer?: ReactNode;
}): ReactNode {
  const icons = mode === 'icons';

  return (
    <nav className="rail" aria-label="Workspaces" {...(hidden === true ? { hidden: true } : {})}>
      <div className="rail__brand">
        <span className="rail__mark" aria-hidden="true">
          ◈
        </span>
        <span className="rail__brand-text">
          <span className="rail__brand-name">ASDP</span>
          <span className="rail__brand-sub">Process Designer</span>
        </span>
      </div>

      <p className="rail__section">Workspaces</p>
      <ul className="rail__list">
        {WORKSPACES.map((w) => {
          const reason = unavailableReason(w.id);
          const available = reason === undefined;
          const current = available && w.id === currentWorkspace;
          return (
            <li key={w.id}>
              <button
                type="button"
                className="rail__item"
                disabled={!available}
                aria-current={current ? 'page' : undefined}
                aria-disabled={available ? undefined : 'true'}
                // The reason is the accessible name, so it is never colour or
                // dimming alone that says "you cannot open this".
                aria-label={available ? w.label : `${w.label} — ${reason}`}
                title={available ? undefined : reason}
                data-testid={`nav-${w.id}`}
                data-available={available ? 'true' : 'false'}
                onClick={available ? () => onSelect(w.id) : undefined}
              >
                <span className="rail__glyph" aria-hidden="true">
                  {w.glyph}
                </span>
                {icons ? null : <span className="rail__label">{w.label}</span>}
                {icons || available ? null : (
                  // Decorative: the full reason is in the accessible name above.
                  <span className="rail__slice" aria-hidden="true">
                    {sliceBadge(w.id)}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="rail__foot">{footer}</div>
    </nav>
  );
}
