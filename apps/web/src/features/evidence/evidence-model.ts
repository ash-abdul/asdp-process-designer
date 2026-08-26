/**
 * **Evidence** — the model behind citing a unit and listing what has been cited.
 *
 * U3-b, within the approved boundary
 * ([u3-proposal.md](../../../../../docs/60-plan/u3-proposal.md) §3.2, §3.3).
 * DOM-free on purpose: everything here is testable under `node --test`, and the
 * components above it only render what these functions return.
 *
 * ## The rule this module exists to make unbreakable
 *
 * **Unit-level citation only.** `POST /projects/:p/evidence` also accepts
 * `charStart` and `charEnd`, and U3 deliberately does not use them (**Z3**, §6 of
 * the boundary). Code-point offsets over NFC logical-order text, derived from a
 * bidirectional DOM selection, are exactly the class of bug ADR-0039 §5 and the
 * `presentation-no-text-research` checker rule exist to prevent: a wrong
 * highlight looks precisely like a right one.
 *
 * So `citeUnitBody` is the **only** body builder here, it takes a unit id, and
 * `web.test.ts` asserts that what it produces carries no character range. A
 * comment promising restraint is not a control.
 *
 * ## What it does NOT decide
 *
 * - **Whether an anchor resolves.** The server verifies before persisting and
 *   refuses a `broken` or `drifted` anchor
 *   ([ADR-0008](../../../../../docs/adr/ADR-0008-resolvable-anchors.md),
 *   [ADR-0038](../../../../../docs/adr/ADR-0038-target-versus-content-verification.md)).
 *   This module renders the refusal; it never predicts it.
 * - **Whether a role may cite.** `mayInvoke` disables the control as a courtesy;
 *   the API refuses regardless (ADR-0027, ADR-0039 §4).
 * - **Which units are citable.** Every unit is offered, and the server decides.
 *   Filtering here would be a business rule in the browser.
 */

import { ApiError } from '../../api/client.ts';

// ---------------------------------------------------------------------------
// Rows, as the API returns them
// ---------------------------------------------------------------------------

/** The subset of `EvidenceItem` this screen renders. Validation is the client's. */
export interface EvidenceRow {
  readonly id: string;
  readonly sourceId: string;
  readonly sourceUnitId?: string;
  readonly verbatimText: string;
  readonly language: string;
  readonly classification: string;
  readonly extractedBy: string;
  readonly anchorVerified: boolean;
  readonly anchor: {
    readonly precision: string;
    readonly direction: 'ltr' | 'rtl' | 'neutral';
    readonly target: { readonly kind: string };
  };
  readonly createdBy: string;
  readonly createdAt: string;
}

/** A unit, as `GET …/sources/:s/content` returns it. */
export interface UnitOption {
  readonly id: string;
  readonly ordinal?: number;
  readonly kind?: string;
  readonly text?: string;
  readonly direction?: 'ltr' | 'rtl' | 'neutral';
  readonly language?: string;
}

// ---------------------------------------------------------------------------
// Citing — unit level, and nothing else
// ---------------------------------------------------------------------------

/**
 * The body for `POST /projects/:p/evidence`.
 *
 * **Two fields, and there is no variant that adds a third.** Given a
 * `sourceUnitId` and no character range, `recordEvidence` inherits the unit's
 * anchor unchanged (provenance-and-anchoring.md §4.1) — the anchor the parser
 * minted and the server re-verifies, rather than one this browser guessed.
 */
export function citeUnitBody(sourceId: string, sourceUnitId: string): {
  readonly sourceId: string;
  readonly sourceUnitId: string;
} {
  return { sourceId, sourceUnitId };
}

/**
 * What a citation attempt is doing, and how it ended.
 *
 * `refused` is a **first-class outcome**, not an error state (**Y27**): the
 * server declining to store evidence on an unverifiable anchor is the system
 * working, and it must not read as a crash.
 */
export type CitePhase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'sending'; readonly unitId: string }
  | { readonly kind: 'recorded'; readonly evidenceId: string; readonly unitId: string }
  | {
      readonly kind: 'refused';
      readonly unitId: string;
      /** The server's own words. Never paraphrased, never invented. */
      readonly reason: string;
      readonly status?: number;
      /** True when the refusal is about the caller's role rather than the data. */
      readonly roleRefusal: boolean;
    };

/**
 * Turn a failed request into a refusal, **quoting the server**.
 *
 * The status vocabulary is preserved (CLAUDE.md §12): a 403 sends the user to
 * their permissions, anything else to their data. What it must never do is
 * summarise — `ApiError.message` is already the server's `error` field, and
 * replacing it with friendlier wording is how a precise refusal becomes a vague
 * one.
 *
 * **A note on the anchor refusal, recorded rather than smoothed over.**
 * `AnchorVerificationError` is not in the API's error-mapping chain, so a
 * refusal to store evidence on a `broken` or `drifted` anchor arrives as **500**
 * rather than 400. The message still comes through, so this renders it
 * faithfully — but the status is wrong at the source, and papering over it in the
 * client would hide a defect rather than report it.
 */
export function citeRefusal(unitId: string, error: unknown): CitePhase {
  if (error instanceof ApiError) {
    return {
      kind: 'refused',
      unitId,
      reason: error.message,
      status: error.status,
      roleRefusal: error.status === 403,
    };
  }
  return {
    kind: 'refused',
    unitId,
    reason: error instanceof Error ? error.message : 'the request failed, and no reason was given',
    roleRefusal: false,
  };
}

// ---------------------------------------------------------------------------
// Rendering helpers — presentation only
// ---------------------------------------------------------------------------

/** How long a quote may be before a list truncates it. Display only. */
export const QUOTE_PREVIEW = 90;

/**
 * Shorten for a list, **visibly**.
 *
 * The ellipsis matters: a silently cut quote reads as the whole quote, and an
 * evidence item is a verbatim citation. The full text stays available in the
 * row's title and accessible name.
 */
export function preview(text: string, max: number = QUOTE_PREVIEW): string {
  const points = [...text.trim().replace(/\s+/g, ' ')];
  return points.length <= max ? points.join('') : `${points.slice(0, max).join('')}…`;
}

/**
 * The label for one unit in the picker.
 *
 * A unit with no recorded text **says so** rather than rendering blank. An empty
 * option in a list of citations is the one case where a blank looks like a bug
 * and a defect looks like a blank.
 */
export function unitOptionLabel(unit: UnitOption): string {
  const position = unit.ordinal === undefined ? unit.id : `${unit.ordinal}`;
  const body =
    unit.text === undefined || unit.text.trim().length === 0
      ? 'no text recorded for this unit'
      : preview(unit.text, 60);
  return `${position} · ${body}`;
}

/**
 * The anchor, described in words.
 *
 * **`verified` is `anchorVerified`, and it is NOT a resolution status.**
 * `recordEvidence` stores `anchorVerified: true` for everything it accepts, and
 * `content_unverified` anchors are accepted — so the boolean says *"the server
 * checked this before storing it"*, not *"it resolved exactly"*. A stored
 * `EvidenceItem` does not carry its resolution status at all.
 *
 * Callers must therefore **not** map this to the `resolved` verification badge.
 * Doing so would show a content-unverified anchor as resolved, which is the
 * conflation ADR-0038 exists to prevent, and `web.test.ts` asserts the inventory
 * never claims it.
 */
export function anchorSummary(row: EvidenceRow): {
  readonly precision: string;
  readonly target: string;
  readonly direction: 'ltr' | 'rtl' | 'neutral';
  readonly verified: boolean;
} {
  return {
    precision: row.anchor.precision,
    target: row.anchor.target.kind,
    direction: row.anchor.direction,
    verified: row.anchorVerified,
  };
}

/**
 * How the evidence came to exist.
 *
 * `parser` and `ai` are the server's two values (`ExtractedBy`). U3-b can only
 * produce `parser` items, because it invokes no model — **Z2-B** — and an `ai`
 * item in this list would mean something wired a provider. The wording is chosen
 * so the difference is legible rather than decorative.
 */
export function originOf(row: EvidenceRow): { readonly label: string; readonly detail: string } {
  if (row.extractedBy === 'ai') {
    return {
      label: 'AI-extracted',
      detail: 'Extracted by a model. Nothing in this build can produce one — no provider is wired.',
    };
  }
  if (row.extractedBy === 'parser') {
    return { label: 'Parser-anchored', detail: 'Anchored by the parser and cited by a person.' };
  }
  // Not defaulted to something benign: a value this build does not know is
  // exactly the case where rendering "parser" would be a lie.
  return { label: `Unrecognised: ${row.extractedBy}`, detail: 'The server reported a value this build does not know.' };
}

/**
 * Group evidence by the source it cites, preserving the API's order within each.
 *
 * Grouping is presentation. **No re-sorting inside a group**, because the order
 * the API returned is the only order this client is entitled to assert — and
 * inventing one would be a rule in the browser.
 */
export function bySource(rows: readonly EvidenceRow[]): readonly {
  readonly sourceId: string;
  readonly rows: readonly EvidenceRow[];
}[] {
  const order: string[] = [];
  const groups = new Map<string, EvidenceRow[]>();
  for (const row of rows) {
    const existing = groups.get(row.sourceId);
    if (existing === undefined) {
      order.push(row.sourceId);
      groups.set(row.sourceId, [row]);
    } else {
      existing.push(row);
    }
  }
  return order.map((sourceId) => ({ sourceId, rows: groups.get(sourceId) ?? [] }));
}
