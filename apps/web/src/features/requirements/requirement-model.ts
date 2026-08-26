/**
 * **Requirements** — the model behind the read-only workspace.
 *
 * U3-c, within the approved boundary
 * ([u3-proposal.md](../../../../../docs/60-plan/u3-proposal.md) §3.1). DOM-free,
 * so every rule below is testable under `node --test`.
 *
 * ## What this module refuses to do
 *
 * - **It does not re-order.** `listRequirements` returns `order by id asc` and
 *   that order is rendered unchanged. This matters more than it looks: the
 *   repository read is a **text** sort, so `REQ-10000` sorts before `REQ-9999`
 *   past the ten-thousandth requirement — the same class as limitations 80/81.
 *   Sorting correctly here would be a business rule in the browser, and it would
 *   hide a recorded defect behind a client-side patch. `web.test.ts` asserts this
 *   module contains no sort.
 * - **It does not decide anything.** Not the epistemic level (ADR-0007), not the
 *   confidence (ADR-0011), not whether an anchor resolved (ADR-0038), not whether
 *   an actor may act (ADR-0027). It formats what the server said.
 * - **It offers no write.** U3-c is read-only; accept, reject, revise and confirm
 *   are **U3-d/U3-e** and no helper here anticipates them.
 * - **It retrieves no history.** **G-e is deliberately unfilled**, so a
 *   predecessor is *named* and never fetched.
 */

/** The evidence link, as `listRequirements` spreads it onto a row. */
export interface EvidenceLink {
  readonly evidenceItemId: string;
  readonly contribution?: string;
}

/** The subset of `Requirement` this workspace renders. */
export interface RequirementRow {
  readonly id: string;
  readonly requirementSetId: string;
  readonly text: string;
  readonly originalAiText: string;
  readonly category: string;
  readonly rafSlot: string;
  readonly epistemicLevel: string;
  readonly derivation: string;
  readonly computedConfidence: number;
  readonly confidenceBand: string;
  readonly confidenceFunctionVersion: string;
  readonly humanConfirmationRequired: boolean;
  readonly version: number;
  readonly supersedesId?: string;
  readonly changeReason?: string;
  readonly inferenceRationale?: string;
  /** Set once a person has confirmed the inference — U3-d renders it. */
  readonly inferenceConfirmedBy?: string;
  readonly inferenceConfirmedAt?: string;
  readonly status: string;
  readonly generatedBy: string;
  readonly aiInteractionId?: string;
  readonly promptVersion?: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly capabilityTier?: string;
  readonly degradations: readonly string[];
  readonly framePass?: string;
  readonly classification: string;
  readonly language: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly evidence: readonly EvidenceLink[];
}

// ---------------------------------------------------------------------------
// The two empty states — the distinction the API draws and the UI must keep
// ---------------------------------------------------------------------------

/**
 * What a requirement list actually means when it is empty.
 *
 * **These are different facts about a project and they must not look alike.**
 * `listRequirements` omits `requirementSetId` when no population pass has ever
 * run, and returns it with `total: 0` when a pass ran and proposed nothing. One
 * says *"nobody has tried"*; the other says *"we tried and got none"* — and in
 * this build the second is almost always because **no AI provider is wired**, not
 * because the evidence supports nothing. Collapsing them into "no requirements"
 * is the same class of error as rendering `unranked` as rank 0.
 */
export type SetState =
  | { readonly kind: 'no_pass' }
  | { readonly kind: 'empty_set'; readonly requirementSetId: string }
  | { readonly kind: 'populated'; readonly requirementSetId: string; readonly total: number };

export function setStateOf(response: {
  readonly requirementSetId?: string;
  readonly requirements: readonly unknown[];
}): SetState {
  const id = response.requirementSetId;
  if (id === undefined) return { kind: 'no_pass' };
  if (response.requirements.length === 0) return { kind: 'empty_set', requirementSetId: id };
  return { kind: 'populated', requirementSetId: id, total: response.requirements.length };
}

// ---------------------------------------------------------------------------
// Confidence — Y21, and the number that must never be a percentage
// ---------------------------------------------------------------------------

/**
 * Confidence, as a **band with its function version**, never as a bare percentage.
 *
 * [ADR-0011](../../../../../docs/adr/ADR-0011-computed-confidence.md): the value
 * is computed by us, never reported by a provider. **Y21**: *"a bare 92% reads as
 * 92% correct, which nothing in this repository has ever measured."*
 *
 * So the band leads, the raw score is shown **only** beside the version of the
 * function that produced it — a number whose function is unknown cannot be
 * compared to another — and no `%` is ever emitted. `web.test.ts` asserts that
 * last part over the output rather than trusting it.
 */
export function confidenceOf(row: RequirementRow): {
  readonly band: string;
  readonly score: string;
  readonly functionVersion: string;
  readonly caution: string;
} {
  return {
    band: row.confidenceBand,
    // Fixed to two places so rows line up; still not a percentage.
    score: row.computedConfidence.toFixed(2),
    functionVersion: row.confidenceFunctionVersion,
    caution: 'Computed by this system, not reported by a provider. It is not a measure of accuracy.',
  };
}

// ---------------------------------------------------------------------------
// Versions — what the current row can honestly say, and no more
// ---------------------------------------------------------------------------

/**
 * The version facts, **bounded by G-e**.
 *
 * A predecessor is **named** from `supersedesId` and is **never fetched**: no API
 * returns a prior version, G-e is deliberately unfilled, and U3 provides no
 * version-history viewer. Saying *"version 1 exists"* while being unable to show
 * it is honest; implying it can be opened is not.
 *
 * `edited` comes from the **server's own facts** — a version past the first,
 * authored by a human — rather than from comparing strings. The text comparison
 * is reported separately as `textDiffersFromAi`, because the two can disagree:
 * a revision that restored the original wording is still a revision.
 */
export function versionOf(row: RequirementRow): {
  readonly version: number;
  readonly predecessor?: string;
  readonly changeReason?: string;
  readonly edited: boolean;
  readonly textDiffersFromAi: boolean;
  readonly historyAvailable: false;
} {
  return {
    version: row.version,
    ...(row.supersedesId === undefined ? {} : { predecessor: row.supersedesId }),
    ...(row.changeReason === undefined ? {} : { changeReason: row.changeReason }),
    edited: row.version > 1 && row.generatedBy === 'human',
    textDiffersFromAi: row.text !== row.originalAiText,
    // Not a capability that is switched off — one that does not exist. G-e.
    historyAvailable: false,
  };
}

// ---------------------------------------------------------------------------
// Derivation — and the one case that must shout rather than render blank
// ---------------------------------------------------------------------------

/**
 * How the proposition relates to its evidence, and what must accompany it.
 *
 * **An `inferred` requirement with no rationale is a defect, not a blank field.**
 * Invariant D2 requires one, and `addInferredRequirement` refuses without it — so
 * a row that arrives missing it means something wrote past the guard. Rendering an
 * empty space there would turn a broken invariant into a cosmetic gap.
 */
export function derivationOf(row: RequirementRow): {
  readonly derivation: string;
  readonly rationale?: string;
  readonly defect?: string;
} {
  if (row.derivation !== 'inferred') {
    return { derivation: row.derivation };
  }
  if (row.inferenceRationale === undefined || row.inferenceRationale.trim() === '') {
    return {
      derivation: row.derivation,
      defect:
        'This requirement is inferred and carries NO rationale. Invariant D2 requires one, so this ' +
        'row should not exist. Report it rather than reading past it.',
    };
  }
  return { derivation: row.derivation, rationale: row.inferenceRationale };
}

// ---------------------------------------------------------------------------
// Degradations, provenance
// ---------------------------------------------------------------------------

/**
 * Recorded degradations.
 *
 * An empty list means **none was recorded**, which is not the same claim as
 * *"the answer was not degraded"* — and the wording says the first
 * ([ADR-0022](../../../../../docs/adr/ADR-0022-capability-negotiation.md)).
 */
export function degradationsOf(row: RequirementRow): {
  readonly items: readonly string[];
  readonly summary: string;
} {
  return row.degradations.length === 0
    ? { items: [], summary: 'None recorded.' }
    : { items: row.degradations, summary: `${row.degradations.length} recorded` };
}

/**
 * The AI provenance a row carries, with **absent fields reported as absent**.
 *
 * A human-authored requirement has no interaction, no prompt version and no
 * model, and saying *"not stated"* is the truthful rendering. Blanks read as
 * missing data; *"not applicable — authored by a person"* reads as a fact.
 */
export function provenanceOf(row: RequirementRow): readonly {
  readonly label: string;
  readonly value?: string;
}[] {
  const human = row.generatedBy === 'human';
  const entry = (label: string, value: string | undefined): { label: string; value?: string } =>
    value === undefined ? { label } : { label, value };

  return [
    { label: 'Authored by', value: row.generatedBy },
    entry('AI interaction', human ? undefined : row.aiInteractionId),
    entry('Prompt version', human ? undefined : row.promptVersion),
    entry('Provider', human ? undefined : row.providerId),
    entry('Model', human ? undefined : row.modelId),
    entry('Capability tier', human ? undefined : row.capabilityTier),
    entry('Frame pass', row.framePass),
  ];
}

// ---------------------------------------------------------------------------
// Evidence chips
// ---------------------------------------------------------------------------

/**
 * Whether a requirement having no evidence is **legitimate or a defect**.
 *
 * The two cases look identical on screen and mean opposite things, which is
 * exactly why this is a function with a test rather than a condition inline in a
 * component.
 *
 * - **`inferred` with no evidence is CORRECT.** `addInferredRequirement` stores
 *   no links on purpose — the command says so: *"deliberately NOT
 *   `insertProposal`: that requires evidence links, and an inferred requirement
 *   has a rationale instead. The two paths are separate so neither can be used to
 *   bypass the other's rule."* Invariant D2 is satisfied by the **mandatory
 *   rationale**, not by a citation.
 * - **Any other derivation with no evidence IS a defect.** `insertProposal`
 *   refuses it at the repository boundary, so a row that arrives without links
 *   means something wrote past the guard.
 *
 * The first version of this workspace reported **both** as a D2 violation, which
 * told a reviewer that a perfectly legal inferred requirement should not exist.
 * Found by visual review, not by a test — the derivation and the evidence were
 * each covered separately and the combination was not.
 */
export function evidenceExpectationOf(
  row: RequirementRow,
  citedCount: number,
): { readonly kind: 'cited' } | { readonly kind: 'rationale_instead' } | { readonly kind: 'defect'; readonly detail: string } {
  if (citedCount > 0) return { kind: 'cited' };
  if (row.derivation === 'inferred') return { kind: 'rationale_instead' };
  return {
    kind: 'defect',
    detail:
      `This ${row.derivation} proposal cites NO evidence. Invariant D2 requires at least one for ` +
      'anything but an inferred requirement, so this row should not exist. Report it rather than ' +
      'reading past it.',
  };
}

/**
 * The evidence a requirement cites, resolved to the source it lives in.
 *
 * The link names only an `evidenceItemId`, so the source comes from the project's
 * evidence list — the read U3-b already added. **An unresolved link is shown as
 * unresolved**, never dropped: a citation the workspace cannot follow is exactly
 * what a reviewer needs to be told about (ADR-0008), and a quietly shortened chip
 * list would make a broken traceability edge invisible.
 */
export function chipsFor(
  row: RequirementRow,
  sourceOf: (evidenceItemId: string) => string | undefined,
): readonly {
  readonly evidenceItemId: string;
  readonly contribution: string;
  readonly sourceId?: string;
  readonly followable: boolean;
}[] {
  return row.evidence.map((link) => {
    const sourceId = sourceOf(link.evidenceItemId);
    return {
      evidenceItemId: link.evidenceItemId,
      // The API's own value when it gave one. `supporting` is not assumed.
      contribution: link.contribution ?? 'not stated',
      ...(sourceId === undefined ? {} : { sourceId }),
      followable: sourceId !== undefined,
    };
  });
}

/**
 * The confirmation state — **required** and **given** are different facts.
 *
 * `humanConfirmationRequired` is computed at write time and says a confirmation
 * is needed. `inferenceConfirmedBy` says one was recorded. `confirmInference`
 * deliberately does not clear the first — the requirement still required a
 * confirmation, and it now has one — so a UI that renders only the flag reports
 * *"undecided"* forever and makes a completed act invisible.
 *
 * Found at U3-d, when the confirm control produced no observable change.
 */
export function confirmationOf(row: RequirementRow): {
  readonly state: 'decided' | 'undecided';
  readonly detail: string;
} {
  if (row.inferenceConfirmedBy !== undefined) {
    return {
      state: 'decided',
      detail:
        `Confirmed by ${row.inferenceConfirmedBy}` +
        // A DATE, not a raw ISO instant. `.slice(0, 10)` is the convention the
        // project list already uses; the visual review caught
        // `2026-08-26T19:09:21.326Z` sitting in a human-readable field, which is
        // machine output leaking into the interface. The full instant stays on
        // the record — it is in the audit entry, which is where precision to the
        // millisecond actually matters.
        (row.inferenceConfirmedAt === undefined ? '' : ` on ${row.inferenceConfirmedAt.slice(0, 10)}`) +
        '.',
    };
  }
  if (row.humanConfirmationRequired) {
    return { state: 'undecided', detail: 'Required, and not yet confirmed.' };
  }
  return { state: 'decided', detail: 'No separate confirmation is required.' };
}
