/**
 * What this build can actually show — **the honest half of the navigation**.
 *
 * The rail declares the whole product ([ui-design-foundation-proposal.md]
 * §2.1), and most of it does not exist. This module is the **single source of
 * truth for what is implemented**, and `nav.ts` is the single source of truth
 * for what is *displayed*. A test asserts the two agree **in both directions**.
 *
 * That direction matters, and it is U2-a's lesson applied to navigation: a
 * one-directional check catches half the drift. Here it would let a rail entry
 * claim a capability that does not exist — which is precisely the failure the
 * approved boundary forbids (*"prefer honest product state over visual
 * fidelity"*).
 */

/** A workspace this build renders. Adding one here without adding it to `nav.ts` fails verification. */
export type WorkspaceId = 'sources' | 'requirements';

export const IMPLEMENTED_WORKSPACES: readonly WorkspaceId[] = ['sources', 'requirements'];

export function isImplemented(id: string): id is WorkspaceId {
  return (IMPLEMENTED_WORKSPACES as readonly string[]).includes(id);
}
