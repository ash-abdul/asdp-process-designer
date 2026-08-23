/**
 * The requirement-proposal gate — **J5**, and the four conditions in one place.
 *
 * Shared, deliberately, between the command that persists proposals and the
 * offline harness that measures them. The V4b arrangement and the V4b reason: a
 * gate that lived in the command would leave the evaluation measuring a
 * *reimplementation* of the rules, and the two would drift — which is what makes
 * an evaluation number worse than no number.
 *
 * ## The four conditions
 *
 *   1. structured output validates      — checked upstream, per pass
 *   2. every cited evidence id RESOLVES — exists, in this batch, in this project,
 *                                         anchorVerified, and its anchor
 *                                         RE-RESOLVES right now
 *   3. the slot assignment is LEGAL     — one of the 27, offered by this pass, and
 *                                         surviving the v1.1 disjointness rules
 *   4. derivation rules pass            — at least one evidence item (D2),
 *                                         classification at or above the maximum
 *                                         over that evidence (D10), never
 *                                         `inferred` (J1)
 *
 * All four, or nothing is written.
 *
 * ## What this gate CANNOT do, stated here because it is easy to forget
 *
 * It cannot tell whether the proposition is a **faithful reading** of the evidence
 * it cites. V4b's gate could verify its own subject completely — a quote is in the
 * source or it is not. This one cannot, and no arrangement of deterministic checks
 * would change that. Everything here is a **defect detector**; none of it is
 * evidence of semantic correctness. That is the central V5 risk, and the reason
 * human review before L4 is not optional.
 */

import { computeConfidence, type ConfidenceResult } from '@asdp/domain';
import { isCitable, resolveAnchor } from '@asdp/provenance';
import { RAF_SLOT_KEYS, resolveDisjointSlot, slotDefinition, type RafSlotKey } from '@asdp/raf';
import { CLASSIFICATION_ORDER } from '@asdp/schemas';
import type {
  AnchorPrecision,
  Classification,
  Degradation,
  EvidenceItem,
  ProposalRejectionReason,
  QualityTier,
  RequirementDerivation,
  RequirementProposal,
} from '@asdp/schemas';

/**
 * An evidence item as the gate needs to see it.
 *
 * The stored text travels with the item because condition 2 re-resolves the
 * anchor, and an anchor is only resolvable against the text it was minted over.
 * Assembled by the caller, which is what lets the harness run the identical rules
 * with no database in sight.
 */
export interface EligibleEvidence {
  readonly item: EvidenceItem;
  /** The canonical text of the item's source. */
  readonly storedText: string;
  readonly sourceAuthorityRank: number;
  readonly sourceKind: string;
  readonly sourcePrimaryLanguage: string;
}

export interface ProposalGateInput {
  readonly proposal: RequirementProposal;
  /** The evidence batch this pass was shown, by id. Anything else is not cited. */
  readonly batch: ReadonlyMap<string, EligibleEvidence>;
  /** Slots this pass offered. A slot outside it was never on the table. */
  readonly passSlots: readonly string[];
  readonly passId: string;
  /** Signals for computed confidence (ADR-0011). */
  readonly confidenceInputs: {
    readonly providerCapabilityTier: QualityTier;
    readonly degradations: readonly Degradation[];
  };
}

export interface AcceptedProposal {
  readonly kind: 'accepted';
  readonly slot: RafSlotKey;
  readonly text: string;
  readonly derivation: RequirementDerivation;
  readonly epistemicLevel: 'L1' | 'L2';
  readonly confidence: ConfidenceResult;
  readonly humanConfirmationRequired: boolean;
  readonly classification: Classification;
  readonly language: string;
  /** Cited items in the model's order; the contribution label is ours. */
  readonly evidence: readonly {
    readonly evidenceItemId: string;
    readonly contribution: 'primary' | 'supporting';
  }[];
}

export interface RejectedProposal {
  readonly kind: 'rejected';
  readonly reason: ProposalRejectionReason;
  readonly detail: string;
  /** **J9:** the model's text, retained rather than hashed. */
  readonly proposedText: string;
  readonly proposedSlot?: string;
  readonly citedEvidenceIds: readonly string[];
  /**
   * The classification the record is stored under.
   *
   * The maximum over whatever evidence *did* resolve, and `INTERNAL` when none
   * did — never `PUBLIC` by default, because a proposition about a document we
   * could not identify is not evidence that the document was public.
   */
  readonly classification: Classification;
}

export type ProposalOutcome = AcceptedProposal | RejectedProposal;

const DEFAULT_REJECTION_CLASSIFICATION: Classification = 'INTERNAL';

const PRECISION_ORDER: readonly AnchorPrecision[] = ['document', 'page', 'cell', 'exact'];

function maxClassification(values: readonly Classification[]): Classification | undefined {
  let held: Classification | undefined;
  for (const value of values) {
    if (
      held === undefined ||
      CLASSIFICATION_ORDER.indexOf(value) > CLASSIFICATION_ORDER.indexOf(held)
    ) {
      held = value;
    }
  }
  return held;
}

/**
 * Apply the gate to one proposal.
 *
 * Pure: no I/O, no clock, no persistence, no ids. The caller decides what to do
 * with the outcome — which is exactly what makes the evaluation able to run the
 * identical rules offline.
 */
export function gateProposal(input: ProposalGateInput): ProposalOutcome {
  const proposal = input.proposal;
  const cited = [...new Set(proposal.evidenceItemIds)];

  const reject = (
    reason: ProposalRejectionReason,
    detail: string,
    classification?: Classification,
  ): RejectedProposal => ({
    kind: 'rejected',
    reason,
    detail,
    proposedText: proposal.text,
    ...(proposal.slot.trim() === '' ? {} : { proposedSlot: proposal.slot }),
    citedEvidenceIds: cited,
    classification: classification ?? DEFAULT_REJECTION_CLASSIFICATION,
  });

  if (proposal.text.trim().length === 0) {
    return reject('empty_text', 'the proposal carried no text after trimming');
  }

  // --- condition 4a: at least one cited evidence item (D2, J1) ------------
  //
  // This is the L3 refusal in its operative form. A proposition with no evidence
  // is an inference however it is worded, and J1 refuses inference in V5 — so it
  // is checked before anything else about the evidence.
  if (cited.length === 0) {
    return reject(
      'no_evidence_cited',
      'the proposal cites no evidence; a proposition with no source is an L3 inference, and V5 ' +
        'persists grounded proposals only (J1)',
    );
  }

  // --- condition 2: every cited id resolves -------------------------------
  const resolvedEvidence: EligibleEvidence[] = [];
  for (const id of cited) {
    const held = input.batch.get(id);
    if (held === undefined) {
      // The model named something it was not shown. Treated as a citation
      // failure rather than trusted, exactly as an unknown unit locator was in
      // V4b.
      return reject(
        'evidence_not_in_batch',
        `the proposal cites '${id}', which was not in the evidence batch this pass was shown`,
      );
    }
    resolvedEvidence.push(held);
  }

  const evidenceClassifications = resolvedEvidence.map((e) => e.item.classification);
  const requiredClassification =
    maxClassification(evidenceClassifications) ?? DEFAULT_REJECTION_CLASSIFICATION;

  for (const held of resolvedEvidence) {
    if (!held.item.anchorVerified) {
      return reject(
        'anchor_unresolved',
        `evidence ${held.item.id} is not anchor-verified, so it may not support a requirement (D1)`,
        requiredClassification,
      );
    }
    // Re-resolved NOW, not trusted from write time. An anchor that drifted since
    // extraction must not become the foundation of a requirement (ADR-0008), and
    // the only way to know is to ask the same resolver every reader asks.
    const resolution = resolveAnchor(held.item.anchor, { storedText: held.storedText });
    if (!isCitable(resolution.status) || resolution.status !== 'resolved') {
      return reject(
        'anchor_unresolved',
        `the anchor of evidence ${held.item.id} did not re-resolve (${resolution.status}); a ` +
          'requirement may not rest on a citation that no longer points anywhere',
        requiredClassification,
      );
    }
  }

  // --- condition 3: the slot must be legal --------------------------------
  if (!(RAF_SLOT_KEYS as readonly string[]).includes(proposal.slot)) {
    return reject(
      'slot_not_in_pass',
      `'${proposal.slot}' is not one of the ${RAF_SLOT_KEYS.length} RAF slots; the frame is owned ` +
        'by code and a model may not extend it (ADR-0010, J8)',
      requiredClassification,
    );
  }
  if (!input.passSlots.includes(proposal.slot)) {
    return reject(
      'slot_not_in_pass',
      `'${proposal.slot}' is a RAF slot but was not offered by pass ${input.passId}; a proposal ` +
        'for a slot the pass did not ask about would be assigned without its disjointness partner ' +
        'in view',
      requiredClassification,
    );
  }

  // The disjointness rules are applied by CODE, not by the prompt (J8). The model
  // is told what they are so it can assign well; this is what decides.
  const disjoint = resolveDisjointSlot([proposal.slot as RafSlotKey]);
  if (disjoint.slot !== proposal.slot) {
    return reject(
      'disjointness_violation',
      `'${proposal.slot}' resolves to '${disjoint.slot}' under the v1.1 disjointness rules`,
      requiredClassification,
    );
  }

  // --- condition 4b: classification monotonicity (D10) --------------------
  //
  // Derived rather than proposed, so this cannot fail on a model's say-so. It is
  // checked because the derivation could be wrong, and a requirement classified
  // below its evidence is a governance failure that reads as a normal row.
  const classification = requiredClassification;

  // --- derivation, level and confidence: COMPUTED (J8) --------------------
  //
  // Read from the evidence linkage, never from the model's output — which has no
  // field for any of them.
  const derivation: RequirementDerivation =
    resolvedEvidence.length === 1 ? 'extracted' : 'interpreted';
  // A proposal is an interpretation even when it restates one item: assigning it
  // to a slot and rewording it IS the interpretation. L1 is reserved for the
  // verbatim evidence beneath it (epistemic-model.md §1).
  const epistemicLevel = 'L2' as const;

  const weakestAuthority = Math.max(...resolvedEvidence.map((e) => e.sourceAuthorityRank));
  const weakestPrecision = resolvedEvidence
    .map((e) => e.item.anchor.precision)
    .reduce<AnchorPrecision>(
      (weakest, p) => (PRECISION_ORDER.indexOf(p) < PRECISION_ORDER.indexOf(weakest) ? p : weakest),
      'exact',
    );

  const confidence = computeConfidence({
    extractionMode: derivation,
    evidenceCount: resolvedEvidence.length,
    // Weakest link: a proposal is no stronger than the least of what it rests on.
    sourceAuthorityRank: weakestAuthority,
    // J2: nothing has been compared, and reconciliation is V6. `silent` is the
    // honest value — NOT a claim that the sources agree.
    crossSourceAgreement: 'silent',
    anchorPrecision: weakestPrecision,
    providerCapabilityTier: input.confidenceInputs.providerCapabilityTier,
    degradations: [...input.confidenceInputs.degradations],
    ...(proposal.modelSelfRating === undefined ? {} : { modelSelfRating: proposal.modelSelfRating }),
  });

  const required = slotDefinition(proposal.slot as RafSlotKey).requiredForExecutability;
  // Computed, and deliberately conservative: everything V5 writes is an unreviewed
  // AI proposition, and anything at LOW confidence or in a slot an executable
  // process cannot do without needs a human before it is relied on.
  const humanConfirmationRequired = confidence.band === 'LOW' || required;

  const language = resolvedEvidence[0]?.item.language ?? 'und';

  return {
    kind: 'accepted',
    slot: proposal.slot as RafSlotKey,
    text: proposal.text.trim(),
    derivation,
    epistemicLevel,
    confidence,
    humanConfirmationRequired,
    classification,
    language,
    evidence: cited.map((id, index) => ({
      evidenceItemId: id,
      // Deterministic: the first cited item is primary. A model ranking its own
      // citations would be an unverifiable judgement presented as structure.
      contribution: index === 0 ? ('primary' as const) : ('supporting' as const),
    })),
  };
}

// ---------------------------------------------------------------------------
// Deduplication — J2, and it is NOT conflict resolution
// ---------------------------------------------------------------------------

/**
 * The key two proposals must share to be the same proposal.
 *
 * Normalised text **and** an identical evidence set. Both halves matter: the same
 * text on different evidence is two propositions from two places, which is exactly
 * what **J2** requires V5 to preserve rather than collapse. Deciding between them
 * is reconciliation, and reconciliation is V6.
 */
export function duplicateKey(
  slot: string,
  text: string,
  evidenceIds: readonly string[],
): string {
  const normalisedText = text.trim().replace(/\s+/g, ' ').toLowerCase();
  const evidence = [...new Set(evidenceIds)].sort().join(',');
  return `${slot} ${normalisedText} ${evidence}`;
}
