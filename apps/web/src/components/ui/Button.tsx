/**
 * Buttons — **Y18**.
 *
 * The rule with teeth: **a control the current role may not use is disabled
 * WITH ITS REASON**, rendered next to it rather than hidden in a tooltip. The
 * API refuses independently, and U2's browser tests assert both halves; the
 * affordance is a courtesy, the server is the authority
 * ([ADR-0039](../../../../../docs/adr/ADR-0039-react-presentation-layer.md) §4).
 *
 * There is no `variant="destructive"` shortcut that skips confirmation, and no
 * bulk-action component at all — **Y18** forbids a bulk approve anywhere, and
 * the cheapest way to keep that true is to give it nowhere to live.
 */

import type { ReactNode } from 'react';

export type ButtonTone = 'default' | 'primary' | 'subtle' | 'ai';

export function Button({
  children,
  onClick,
  tone,
  type,
  disabled,
  small,
  glyph,
  testId,
  ariaLabel,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: ButtonTone;
  type?: 'button' | 'submit';
  disabled?: boolean;
  small?: boolean;
  glyph?: string;
  testId?: string;
  ariaLabel?: string;
  title?: string;
}): ReactNode {
  const classes = ['btn'];
  if (tone !== undefined && tone !== 'default') classes.push(`btn--${tone}`);
  if (small === true) classes.push('btn--sm');

  return (
    <button
      type={type ?? 'button'}
      className={classes.join(' ')}
      disabled={disabled === true}
      {...(onClick === undefined ? {} : { onClick })}
      {...(testId === undefined ? {} : { 'data-testid': testId })}
      {...(ariaLabel === undefined ? {} : { 'aria-label': ariaLabel })}
      {...(title === undefined ? {} : { title })}
    >
      {glyph === undefined ? null : (
        <span className="btn__glyph" aria-hidden="true">
          {glyph}
        </span>
      )}
      {children}
    </button>
  );
}

/**
 * Why a control is unavailable, in words, beside the control.
 *
 * `role="note"` rather than `alert`: it is a standing condition, not an event.
 */
export function Reason({ children, testId }: { children: ReactNode; testId?: string }): ReactNode {
  return (
    <p className="reason" role="note" {...(testId === undefined ? {} : { 'data-testid': testId })}>
      {children}
    </p>
  );
}
