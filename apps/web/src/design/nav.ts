/**
 * The navigation rail model — **Y3, and §2.1 of the approved foundation**.
 *
 * The rail declares the **whole** product with unbuilt entries visibly
 * unavailable and labelled with the slice that would deliver them. That is a
 * deliberate decision rather than an oversight:
 *
 * - it makes the product's shape legible;
 * - it makes *"not authorised yet"* an explicit **state** rather than an absence;
 * - it stops the navigation being re-cut at every slice.
 *
 * **The honesty constraint is mechanical, not editorial.** A `future` entry
 * cannot be activated, it must name its slice, and `web.test.ts` asserts the
 * available set equals `IMPLEMENTED_WORKSPACES` **in both directions** — so a
 * rail entry can never quietly imply a capability this build does not have.
 */

import { IMPLEMENTED_WORKSPACES } from '../app/routes.ts';

export type Availability =
  | { readonly kind: 'available' }
  /** Not built. `slice` names what would deliver it; `note` says so in words. */
  | { readonly kind: 'future'; readonly slice: string; readonly note: string };

export interface Workspace {
  readonly id: string;
  readonly label: string;
  /** A short glyph for the collapsed rail. Text, not an icon dependency (A4). */
  readonly glyph: string;
  readonly availability: Availability;
}

const available = (id: string, label: string, glyph: string): Workspace => ({
  id,
  label,
  glyph,
  availability: { kind: 'available' },
});

const future = (id: string, label: string, glyph: string, slice: string, note: string): Workspace => ({
  id,
  label,
  glyph,
  availability: { kind: 'future', slice, note },
});

/**
 * The rail, in journey order.
 *
 * Only **Sources** exists. Everything else is future-state and says which slice
 * would build it. There is deliberately **no Overview/dashboard entry that
 * pretends to work**: the visual reference's readiness metrics have no API
 * behind them, and inventing them was explicitly forbidden by the approval
 * (§26.2). It appears here as future, like the rest.
 */
export const WORKSPACES: readonly Workspace[] = [
  future('overview', 'Overview', '◱', 'not scheduled', 'A project dashboard needs readiness APIs that do not exist yet.'),
  available('sources', 'Sources', '▤'),
  future('requirements', 'Requirements', '❑', 'U3', 'The requirements workspace exists as an API only. U3 is not authorised.'),
  future('coverage', 'Coverage', '◴', 'U4', 'Frame coverage and the G1 preconditions exist as an API only. U4 is not authorised.'),
  future('reconciliation', 'Reconciliation', '⇄', 'U5', 'Conflicts, precedence and equivalence exist as an API only. U5 is not authorised.'),
  future('gate', 'Gate G1', '⛉', 'U5', 'Freeze, validate and sign exist as an API only. U5 is not authorised.'),
  future('specifications', 'Specifications', '❐', 'P3', 'Specifications are not built. P3 has not started and has no approved boundary.'),
  future('processes', 'Processes', '⌗', 'P3', 'Process inspection is not built. P3 has not started and has no approved boundary.'),
  future('decisions', 'Decisions', '⌥', 'P3', 'Decision tables are not built. P3 has not started.'),
  future('forms', 'Forms', '▭', 'P3', 'Forms are not built. P3 has not started.'),
  future('services', 'Services', '⇉', 'P3', 'Service interfaces are not built. P3 has not started.'),
  future('audit', 'Audit', '⌚', 'not scheduled', 'The retained record exists as an API only.'),
];

export function isAvailable(id: string): boolean {
  const w = WORKSPACES.find((x) => x.id === id);
  return w !== undefined && w.availability.kind === 'available';
}

export function availableWorkspaceIds(): readonly string[] {
  return WORKSPACES.filter((w) => w.availability.kind === 'available').map((w) => w.id);
}

/**
 * Why an entry cannot be opened, in the words shown to the user.
 *
 * Returns `undefined` for an available workspace. The caller must not invent a
 * reason of its own: an entry with no recorded reason is a defect in this table,
 * not something for a component to paper over.
 */
export function unavailableReason(id: string): string | undefined {
  const w = WORKSPACES.find((x) => x.id === id);
  if (w === undefined || w.availability.kind === 'available') return undefined;
  return `Not built — ${w.availability.slice}. ${w.availability.note}`;
}

/**
 * The short token for the collapsed rail chip.
 *
 * A slice name like `not scheduled` does not fit beside a label, and truncating
 * it silently would turn *"not scheduled"* into *"not sched…"*, which reads like
 * a defect. Long slice names get `⋯`; **the full reason is always in the entry's
 * accessible name and title**, so nothing is lost — only shortened where it is
 * decorative.
 */
export function sliceBadge(id: string): string | undefined {
  const w = WORKSPACES.find((x) => x.id === id);
  if (w === undefined || w.availability.kind === 'available') return undefined;
  const slice = w.availability.slice;
  return /^[A-Z]\d$/.test(slice) ? slice : '⋯';
}

/** The drift check, exposed so the test and the rail agree on one definition. */
export function navDrift(): { readonly displayedButUnbuilt: readonly string[]; readonly builtButUndisplayed: readonly string[] } {
  const shown = availableWorkspaceIds();
  const built = IMPLEMENTED_WORKSPACES as readonly string[];
  return {
    displayedButUnbuilt: shown.filter((id) => !built.includes(id)),
    builtButUndisplayed: built.filter((id) => !shown.includes(id)),
  };
}
