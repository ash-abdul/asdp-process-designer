/**
 * The reconciliation gate — the single deterministic checkpoint for V6.
 *
 * Shared, deliberately, between the commands that persist canonical entities and
 * conflict candidates and the offline harness that measures them. The V4b and V5
 * arrangement, for the V4b and V5 reason: a gate that lived in the command would
 * leave the evaluation measuring a *reimplementation* of the rules, and the two
 * would drift — which is what makes an evaluation number worse than no number.
 *
 * ## What it refuses, and which decision each refusal implements
 *
 * | Refusal | Decision |
 * |---|---|
 * | A merge naming a surface form the pass was not shown | J8, applied again |
 * | A merge spanning entity kinds | **Q3** — a role and a system are not one thing |
 * | A merge spanning classifications | **Q3** + D10 — merging raises classification silently |
 * | A merge with fewer than two members | **Q3** — it merges nothing |
 * | A candidate naming a requirement the pass was not shown | J8 |
 * | A candidate spanning RAF slots | Comparison is slot-scoped |
 * | A candidate claiming `true_conflict` | **Q8** — only a human establishes one |
 * | A candidate proposing a *resolution* | **Q5** — precedence is code's |
 * | A candidate with fewer than two distinct participants | Nothing to compare |
 *
 * ## What it cannot do, stated here because it is the whole risk
 *
 * It cannot tell whether two propositions **really** contradict, or whether two
 * surface forms **really** mean the same thing. Both are semantic judgements, and
 * no arrangement of deterministic checks establishes either. Everything here is a
 * **defect detector**. That is why `true_conflict` is unreachable from this code
 * and why every AI-proposed merge stays unconfirmed.
 */

import { CLASSIFICATION_ORDER } from '@asdp/schemas';
import type {
  Classification,
  EntityMergeCandidate,
  ReconciliationCandidate,
  ReconciliationRejectionReason,
} from '@asdp/schemas';
import { canonicalMatchForm, type ObservedSurfaceForm } from './canonicalisation.ts';

// ---------------------------------------------------------------------------
// Merge candidates
// ---------------------------------------------------------------------------

export interface MergeGateInput {
  readonly candidate: EntityMergeCandidate;
  /** Surface forms this pass was shown, keyed by match form. */
  readonly shown: ReadonlyMap<string, ObservedSurfaceForm>;
}

export type MergeOutcome =
  | {
      readonly kind: 'accepted';
      /** The members, resolved to what was actually observed. */
      readonly members: readonly ObservedSurfaceForm[];
      readonly labelEn: string;
      readonly labelAr: string;
      readonly reason: string;
      /** Maximum over members — classification rises, never falls (D10). */
      readonly classification: Classification;
    }
  | {
      readonly kind: 'rejected';
      readonly reason: ReconciliationRejectionReason;
      readonly detail: string;
      /** **J9:** the candidate as proposed, retained rather than hashed. */
      readonly proposedPayload: string;
    };

function maxClassification(values: readonly string[]): Classification {
  let held: Classification = 'INTERNAL';
  let seen = false;
  for (const value of values) {
    const v = value as Classification;
    if (!seen || CLASSIFICATION_ORDER.indexOf(v) > CLASSIFICATION_ORDER.indexOf(held)) {
      held = v;
      seen = true;
    }
  }
  return held;
}

export function gateMerge(input: MergeGateInput): MergeOutcome {
  const candidate = input.candidate;
  const payload = JSON.stringify(candidate);

  const reject = (
    reason: ReconciliationRejectionReason,
    detail: string,
  ): MergeOutcome => ({ kind: 'rejected', reason, detail, proposedPayload: payload });

  const members: ObservedSurfaceForm[] = [];
  for (const surfaceForm of candidate.surfaceForms) {
    const observed = input.shown.get(canonicalMatchForm(surfaceForm));
    if (observed === undefined) {
      // The model named something it was not shown. Treated as a citation failure
      // rather than trusted — the same posture as an unknown evidence id in V5.
      return reject(
        'surface_form_not_in_batch',
        `the merge names '${surfaceForm}', which was not among the surface forms this pass was shown`,
      );
    }
    members.push(observed);
  }

  const distinct = new Set(members.map((m) => canonicalMatchForm(m.surfaceForm)));
  if (distinct.size < 2) {
    // A "merge" of one thing changes nothing, and accepting it would inflate the
    // canonicalisation count with entries that merged nothing.
    return reject(
      'merge_degenerate',
      `the merge has ${distinct.size} distinct surface form(s); a merge of fewer than two merges nothing`,
    );
  }

  const kinds = new Set(members.map((m) => m.kind));
  if (kinds.size > 1) {
    // Q3. A human role and a system are not the same thing however similar their
    // names, and this is the over-merge that would do the most damage.
    return reject(
      'merge_across_kinds',
      `the merge spans entity kinds (${[...kinds].join(', ')}); kinds are never merged`,
    );
  }

  const classifications = new Set(members.map((m) => m.classification));
  if (classifications.size > 1) {
    // Merging raises classification, and a silent rise hides which document the
    // constraint came from (D10, ADR-0021).
    return reject(
      'merge_across_classifications',
      `the merge spans classifications (${[...classifications].join(', ')}); merging would raise ` +
        'one silently and hide which document the constraint came from',
    );
  }

  return {
    kind: 'accepted',
    members,
    labelEn: candidate.labelEn,
    labelAr: candidate.labelAr,
    reason: candidate.reason,
    classification: maxClassification(members.map((m) => m.classification)),
  };
}

// ---------------------------------------------------------------------------
// Reconciliation candidates
// ---------------------------------------------------------------------------

/** A requirement as the gate needs to see it. */
export interface ComparableRequirement {
  readonly requirementId: string;
  readonly rafSlot: string;
  readonly text: string;
  readonly classification: Classification;
  readonly sourceId: string;
  readonly sourceAuthorityRank: number;
  readonly effectiveDate?: string;
  readonly epistemicLevel: 'L1' | 'L2' | 'L3' | 'L4';
  /** Evidence ids the requirement cites, for the participant links. */
  readonly evidenceItemIds: readonly string[];
}

export interface CandidateGateInput {
  readonly candidate: ReconciliationCandidate;
  /** Requirements this pass was shown, by id. */
  readonly shown: ReadonlyMap<string, ComparableRequirement>;
}

export type CandidateOutcome =
  | {
      readonly kind: 'accepted';
      readonly a: ComparableRequirement;
      readonly b: ComparableRequirement;
      readonly classification: ReconciliationCandidate['classification'];
      readonly topic: string;
      readonly explanation: string;
      readonly rafSlot: string;
      readonly dataClassification: Classification;
    }
  | {
      readonly kind: 'rejected';
      readonly reason: ReconciliationRejectionReason;
      readonly detail: string;
      readonly proposedPayload: string;
    };

/**
 * Words that mean the model wrote a *resolution* rather than an explanation.
 *
 * **Q5:** precedence is deterministic and belongs to code. The schema already
 * gives the model no `resolution` field, so this catches the case where it puts
 * one in the explanation instead — which is the form the boundary would actually
 * be crossed in.
 */
const RESOLUTION_LANGUAGE =
  /\b(?:should be resolved by|the correct one is|we should adopt|takes precedence|overrides|supersedes|is authoritative|use the)\b/i;

export function gateCandidate(input: CandidateGateInput): CandidateOutcome {
  const candidate = input.candidate;
  const payload = JSON.stringify(candidate);

  const reject = (
    reason: ReconciliationRejectionReason,
    detail: string,
  ): CandidateOutcome => ({ kind: 'rejected', reason, detail, proposedPayload: payload });

  // Q8: the schema's enum already excludes `true_conflict`, so a value outside
  // the permitted three arrives only from a response that bypassed validation.
  // Checked anyway: the claim is that AI cannot establish a true conflict, and a
  // claim worth making is worth checking twice.
  const permitted = ['equivalent', 'complementary', 'potentially_contradictory'];
  if (!permitted.includes(candidate.classification)) {
    return candidate.classification === ('true_conflict' as never)
      ? reject(
          'true_conflict_proposed_by_ai',
          'the model claimed a true conflict; only a human may establish one (Q8, ADR-0012)',
        )
      : reject(
          'classification_not_permitted',
          `'${candidate.classification}' is not a classification a model may propose`,
        );
  }

  const ids = [...new Set(candidate.requirementIds)];
  if (ids.length !== 2) {
    return reject(
      'degenerate_candidate',
      `the candidate names ${ids.length} distinct requirement(s); a comparison needs exactly two`,
    );
  }

  const resolved: ComparableRequirement[] = [];
  for (const id of ids) {
    const held = input.shown.get(id);
    if (held === undefined) {
      return reject(
        'requirement_not_in_batch',
        `the candidate names '${id}', which was not among the requirements this pass was shown`,
      );
    }
    resolved.push(held);
  }

  const [a, b] = resolved as [ComparableRequirement, ComparableRequirement];
  if (a.rafSlot !== b.rafSlot) {
    // Two propositions in unrelated slots are not about the same thing, and
    // comparing them inflates the false-conflict rate this slice can least afford.
    return reject(
      'cross_slot_candidate',
      `the candidate spans RAF slots ('${a.rafSlot}' and '${b.rafSlot}'); comparison is slot-scoped`,
    );
  }

  if (RESOLUTION_LANGUAGE.test(candidate.explanation)) {
    // Q5. The model is explaining, not adjudicating — and a fluent recommendation
    // in an explanation field is exactly how the boundary would erode.
    return reject(
      'resolution_proposed_by_ai',
      'the explanation proposes a resolution; precedence is computed deterministically and a ' +
        'human decides (Q5, ADR-0012)',
    );
  }

  return {
    kind: 'accepted',
    a,
    b,
    classification: candidate.classification,
    topic: candidate.topic,
    explanation: candidate.explanation,
    rafSlot: a.rafSlot,
    dataClassification: maxClassification([a.classification, b.classification]),
  };
}

// ---------------------------------------------------------------------------
// Specificity — Q4
// ---------------------------------------------------------------------------

/** A qualifying condition, in both scripts. Structure a parser can check. */
const QUALIFIER =
  /\b(?:if|unless|when|where|except|provided that|in the case of|for)\b|إذا|ما لم|عندما|باستثناء/i;

/**
 * Determine specificity deterministically, or say `undetermined` — **Q4**.
 *
 * Two objectively testable tests, and **no heuristic fallback**:
 *
 *   1. **Narrower evidence scope.** One proposition's evidence set is a strict
 *      subset of the other's: it rests on strictly less, which is a structural
 *      fact rather than a reading.
 *   2. **An explicit qualifying condition** one carries and the other does not.
 *
 * Where neither applies — or where they disagree — the answer is `undetermined`,
 * and precedence moves on. Guessing here would produce a *confident* ordering
 * nobody verified, which is the `matches[0]` mistake of provenance §4.4 one level
 * up: it survives review precisely because it looks computed.
 */
export function determineSpecificity(
  a: ComparableRequirement,
  b: ComparableRequirement,
): 'more_specific' | 'less_specific' | 'undetermined' {
  const aEvidence = new Set(a.evidenceItemIds);
  const bEvidence = new Set(b.evidenceItemIds);

  const aSubset =
    aEvidence.size > 0 && aEvidence.size < bEvidence.size && [...aEvidence].every((id) => bEvidence.has(id));
  const bSubset =
    bEvidence.size > 0 && bEvidence.size < aEvidence.size && [...bEvidence].every((id) => aEvidence.has(id));

  const aQualified = QUALIFIER.test(a.text);
  const bQualified = QUALIFIER.test(b.text);

  const scopeSays = aSubset ? 'more_specific' : bSubset ? 'less_specific' : undefined;
  const qualifierSays =
    aQualified && !bQualified ? 'more_specific' : bQualified && !aQualified ? 'less_specific' : undefined;

  if (scopeSays !== undefined && qualifierSays !== undefined && scopeSays !== qualifierSays) {
    // The two tests disagree. Picking one would be a heuristic, which Q4 forbids.
    return 'undetermined';
  }
  return scopeSays ?? qualifierSays ?? 'undetermined';
}
