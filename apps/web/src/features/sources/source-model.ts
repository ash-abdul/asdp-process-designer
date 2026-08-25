/**
 * Sources: the rules, DOM-free.
 *
 * Everything in U2 that carries a judgement lives here so it is testable under
 * `node --test`. [ADR-0040](../../../../../docs/adr/ADR-0040-browser-testing-pinned-browser.md) §5:
 * a browser test that fails should mean *the wiring is wrong*, not *the
 * arithmetic is wrong*.
 *
 * Four distinctions this module exists to keep, each one a place where a
 * plausible-looking UI would be wrong:
 *
 * 1. **A duplicate is not an upload.** Identical bytes are one source, and a UI
 *    that reports "uploaded" tells the user they added something they did not.
 * 2. **A parse failure is a STATE, not an error.** The source was recorded; it
 *    could not be parsed. It stays visible, with its reason, because it is
 *    evidence that something was tried.
 * 3. **`unranked` is not rank 0.** Rank 0 means *nobody has decided*, not
 *    *lowest authority*. Rendering them alike makes an undecided judgement look
 *    decided — the same class of error as ADR-0038's `content_unverified`
 *    versus `resolved`.
 * 4. **Severity belongs to the rule catalogue**, never to the UI.
 */

import type { Classification } from '@asdp/schemas';

/** Where a source sits in the intake lifecycle, as the API reports it. */
export type SourceStatus = 'parsing' | 'parsed' | 'parse_failed' | 'superseded';

export interface SourceRow {
  readonly id: string;
  readonly filename: string;
  readonly kind?: string;
  readonly status?: string;
  readonly classification?: string;
  readonly direction?: 'ltr' | 'rtl' | 'neutral';
  readonly primaryLanguage?: string;
  readonly authorityRank?: number;
  readonly textLength?: number;
  readonly parseError?: string;
}

// ---------------------------------------------------------------------------
// Authority — distinction 3
// ---------------------------------------------------------------------------

/**
 * How a source's authority should be presented.
 *
 * `unranked` is its own state. The API surfaces `unranked` as a separate count
 * for exactly this reason, and the UI must not flatten it into "0".
 */
export type AuthorityState =
  | { readonly kind: 'unranked'; readonly label: string }
  | { readonly kind: 'ranked'; readonly rank: number; readonly label: string };

export function authorityOf(source: SourceRow): AuthorityState {
  const rank = source.authorityRank;
  if (rank === undefined || rank === 0) {
    return { kind: 'unranked', label: 'Unranked — nobody has decided yet' };
  }
  return { kind: 'ranked', rank, label: `Rank ${rank}` };
}

/** A rank a human may set. Zero is not offered: it means "undecided". */
export function isSettableRank(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 100;
}

/**
 * Inventory order: **highest authority first**, which is the order a reviewer
 * resolving a conflict needs (ADR-0012). Unranked sources sort last — they are
 * not low authority, they are undecided, and they belong where they will be
 * noticed rather than interleaved.
 */
export function inventoryOrder(sources: readonly SourceRow[]): readonly SourceRow[] {
  return [...sources].sort((a, b) => {
    const ra = authorityOf(a);
    const rb = authorityOf(b);
    if (ra.kind !== rb.kind) return ra.kind === 'ranked' ? -1 : 1;
    if (ra.kind === 'ranked' && rb.kind === 'ranked' && ra.rank !== rb.rank) return rb.rank - ra.rank;
    return a.filename.localeCompare(b.filename);
  });
}

// ---------------------------------------------------------------------------
// Parse state — distinction 2
// ---------------------------------------------------------------------------

export interface ParseState {
  readonly tone: 'ok' | 'pending' | 'failed' | 'superseded';
  readonly label: string;
  readonly detail?: string;
}

export function parseStateOf(source: SourceRow): ParseState {
  switch (source.status) {
    case 'parsed':
      return { tone: 'ok', label: 'Parsed' };
    case 'parsing':
      return { tone: 'pending', label: 'Parsing…' };
    case 'superseded':
      return { tone: 'superseded', label: 'Superseded' };
    case 'parse_failed':
      return {
        tone: 'failed',
        label: 'Could not be parsed',
        // The source EXISTS. This is a state, not a disappearance.
        detail: source.parseError ?? 'The parser did not say why.',
      };
    default:
      return { tone: 'pending', label: source.status ?? 'Unknown' };
  }
}

// ---------------------------------------------------------------------------
// Upload — distinction 1
// ---------------------------------------------------------------------------

export type UploadPhase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'sending' }
  | { readonly kind: 'created'; readonly sourceId: string; readonly unitCount: number }
  | { readonly kind: 'deduplicated'; readonly sourceId: string }
  | { readonly kind: 'refused'; readonly reason: string };

/** The API's ingest response, narrowed to what the outcome depends on. */
export interface IngestResult {
  readonly source: { readonly id: string };
  readonly unitCount?: number;
  readonly deduplicated?: boolean;
}

/**
 * Turn an ingest response into an outcome.
 *
 * `deduplicated: true` is reported **as a duplicate**, naming the existing
 * source. It is not a failure and it is not an upload.
 */
export function outcomeOf(result: IngestResult): UploadPhase {
  if (result.deduplicated === true) {
    return { kind: 'deduplicated', sourceId: result.source.id };
  }
  return { kind: 'created', sourceId: result.source.id, unitCount: result.unitCount ?? 0 };
}

/** Base64 for arbitrary bytes, chunked so a large file cannot blow the stack. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** The ingest body. Text and bytes are mutually exclusive, as the API requires. */
export function ingestBody(input: {
  filename: string;
  text?: string;
  bytes?: Uint8Array;
  kind?: string;
  classification?: Classification;
}): Record<string, unknown> {
  if (input.text === undefined && input.bytes === undefined) {
    throw new Error('an upload needs either text or bytes');
  }
  if (input.text !== undefined && input.bytes !== undefined) {
    throw new Error('text and bytes are mutually exclusive');
  }
  return {
    filename: input.filename,
    ...(input.text === undefined ? {} : { text: input.text }),
    ...(input.bytes === undefined ? {} : { contentBase64: bytesToBase64(input.bytes) }),
    ...(input.kind === undefined || input.kind === '' ? {} : { kind: input.kind }),
    ...(input.classification === undefined ? {} : { classification: input.classification }),
  };
}

// ---------------------------------------------------------------------------
// Validation findings — distinction 4
// ---------------------------------------------------------------------------

export interface Finding {
  readonly id?: string;
  readonly ruleId: string;
  readonly severity?: string;
  readonly message?: string;
  readonly entityId?: string;
  readonly entityType?: string;
}

export interface RuleDescriptor {
  readonly id: string;
  readonly description?: string;
  readonly title?: string;
}

/** Findings grouped by severity, blocking first. Severity is the SERVER's. */
export function groupBySeverity(
  findings: readonly Finding[],
): readonly { readonly severity: string; readonly findings: readonly Finding[] }[] {
  const order = ['error', 'blocking', 'warning', 'info'];
  const groups = new Map<string, Finding[]>();
  for (const f of findings) {
    const key = f.severity ?? 'unknown';
    const list = groups.get(key) ?? [];
    list.push(f);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .sort((a, b) => {
      const ia = order.indexOf(a[0]);
      const ib = order.indexOf(b[0]);
      return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib);
    })
    .map(([severity, list]) => ({ severity, findings: list }));
}

/**
 * The catalogued meaning of a rule, so a finding renders as more than an id.
 *
 * Returns `undefined` when the catalogue does not know the rule. **It does not
 * invent a description** — an unknown rule is shown by id, which is honest.
 */
export function describeRule(
  ruleId: string,
  catalogue: readonly RuleDescriptor[],
): string | undefined {
  const rule = catalogue.find((r) => r.id === ruleId);
  return rule?.description ?? rule?.title;
}

/** Whether a set of findings blocks G1. The SEVERITY decides, never the UI. */
export function blocksGate(findings: readonly Finding[]): boolean {
  return findings.some((f) => f.severity === 'error' || f.severity === 'blocking');
}
