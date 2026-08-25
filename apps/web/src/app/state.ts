/**
 * Application state — **W4: plain React state, no library**.
 *
 * This slice has almost no cache-coherence problem: every screen reads a small
 * resource and U1 writes nothing at all. A data-fetching library would be
 * solving a problem this application does not yet have, and **A4** prefers plain
 * code over a small surface. If a later slice genuinely needs cross-screen
 * invalidation, that is its own dependency decision.
 *
 * DOM-free, so the reducer is testable without a browser.
 */

import type { DevIdentity } from '../lib/dev-auth.ts';

/** The three states any remote read can be in. Rendered distinctly (W9). */
export type Remote<T> =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly error: Error }
  | { readonly kind: 'ready'; readonly value: T };

export const idle = <T>(): Remote<T> => ({ kind: 'idle' });
export const loading = <T>(): Remote<T> => ({ kind: 'loading' });
export const failed = <T>(error: Error): Remote<T> => ({ kind: 'error', error });
export const ready = <T>(value: T): Remote<T> => ({ kind: 'ready', value });

/** Whether a ready value should be shown as empty rather than as content. */
export function isEmpty<T>(state: Remote<T>, count: (value: T) => number): boolean {
  return state.kind === 'ready' && count(state.value) === 0;
}

export interface Session {
  readonly identity: DevIdentity;
  readonly origin: string;
}
