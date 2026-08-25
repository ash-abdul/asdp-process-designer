/**
 * Responsive behaviour — **Y26**.
 *
 * Three breakpoints and a **fixed collapse order**. The invariant is the point:
 *
 * > **What collapses is chrome, never state.** Severity, epistemic level,
 * > decidedness, verification and refusal reasons are the last things to be
 * > hidden, never the first.
 *
 * So `governanceVisible` is `true` in **every** layout this function can return,
 * and a test sweeps the whole width range asserting it — which is how a future
 * "just hide the status strip on mobile" change fails verification rather than
 * shipping.
 *
 * Below 768px **no approval affordance is offered**. That is a deliberate
 * refusal, not an omission: approving a requirement on a phone is exactly the
 * *approval theatre* limitation 70 already warns about.
 *
 * **It is scoped to approvals, deliberately.** U2's writes — uploading a source
 * and setting an authority rank — stay available at every width. Removing them
 * on a narrow screen would take away capability U2 delivered, and D-U2.5 is
 * presentation-only; refusing an *approval* flow that does not exist yet takes
 * nothing away and binds U5 when it arrives.
 */

export type RailMode = 'expanded' | 'icons' | 'drawer';
export type PanelMode = 'docked' | 'overlay';

export interface ShellLayout {
  readonly rail: RailMode;
  readonly inspector: PanelMode;
  readonly assistant: PanelMode;
  /** Panes shown side by side in the working area. */
  readonly columns: 1 | 2;
  /**
   * Whether **approval** affordances may be offered at this size. Never gates
   * U2's uploads or ranking — see the note at the top of this file.
   */
  readonly approvalAffordances: boolean;
  /** NEVER false. Asserted across the whole width range. */
  readonly governanceVisible: true;
}

export const BREAKPOINTS = { wide: 1440, medium: 1024, narrow: 768 } as const;

export function layoutFor(width: number): ShellLayout {
  if (width >= BREAKPOINTS.wide) {
    return { rail: 'expanded', inspector: 'docked', assistant: 'docked', columns: 2, approvalAffordances: true, governanceVisible: true };
  }
  if (width >= BREAKPOINTS.medium) {
    return { rail: 'icons', inspector: 'docked', assistant: 'overlay', columns: 2, approvalAffordances: true, governanceVisible: true };
  }
  if (width >= BREAKPOINTS.narrow) {
    return { rail: 'icons', inspector: 'overlay', assistant: 'overlay', columns: 1, approvalAffordances: true, governanceVisible: true };
  }
  return { rail: 'drawer', inspector: 'overlay', assistant: 'overlay', columns: 1, approvalAffordances: false, governanceVisible: true };
}

/** How far collapsed a layout is, 0 (nothing) to 3 (most). Monotonic in width. */
export function collapseStage(width: number): 0 | 1 | 2 | 3 {
  if (width >= BREAKPOINTS.wide) return 0;
  if (width >= BREAKPOINTS.medium) return 1;
  if (width >= BREAKPOINTS.narrow) return 2;
  return 3;
}
