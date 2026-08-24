/**
 * Deterministic conflict precedence — [ADR-0012](../../../docs/adr/ADR-0012-deterministic-conflict-precedence.md).
 *
 * The ADR is quoted rather than paraphrased, because the whole value of this
 * module is that it does exactly what was decided and nothing else:
 *
 * > AI **MAY** detect contradiction candidates and explain them. Precedence
 * > **MUST** be computed deterministically, in this order: declared source
 * > authority rank → effective date → specificity → epistemic level. The computed
 * > outcome is a **proposal with a stated rationale**. A **human MUST decide**
 * > every conflict.
 *
 * ## What this function returns, and what it deliberately is not
 *
 * A **recommendation with a rationale naming the step that produced it** — never
 * a decision, and nothing here writes, suppresses, supersedes or reorders
 * anything. Decision **Q5**: precedence recommends; V7 decides.
 *
 * ## Why an undecidable outcome is a first-class result
 *
 * Equal authority, no dates, `undetermined` specificity and equal epistemic level
 * is a real state, and the honest answer is *"precedence cannot separate these"*.
 * Breaking that tie — by id, by order, by anything — would be the `matches[0]`
 * mistake of provenance §4.4 one level up: an arbitrary pick wearing a
 * deterministic rationale as cover, which survives review precisely because it
 * looks computed. **Decision Q4 forbids it, and so does this module.**
 *
 * ## Versioned, because a rationale must be reproducible
 *
 * The function version travels with every recommendation. A rationale whose
 * function is unknown cannot be compared to another, and ADR-0012 exists to make
 * precedence reproducible and defensible in audit.
 */

/** Bump on ANY behaviour change. A recorded rationale names the version that produced it. */
export const PRECEDENCE_FUNCTION_VERSION = 'precedence-1';

/**
 * Specificity, as decision **Q4** constrains it.
 *
 * Three values, and the third is the point: `undetermined` is what the engine
 * says when no objectively testable structure supports a comparison. There is no
 * heuristic fallback.
 */
export type Specificity = 'more_specific' | 'less_specific' | 'undetermined';

/** Which ADR-0012 step produced the recommendation, or why none could. */
export type PrecedenceStep =
  | 'source_authority'
  | 'effective_date'
  | 'specificity'
  | 'epistemic_level'
  | 'undecidable';

/**
 * One side of a precedence comparison.
 *
 * Deliberately plain data rather than a `Requirement`: this is a pure function of
 * four declared facts, and narrowing the input is what stops it quietly depending
 * on something it has no business reading.
 */
export interface PrecedenceParticipant {
  readonly requirementId: string;
  readonly sourceId: string;
  /**
   * Declared source authority rank — **set by a human during intake**, and the
   * ADR's primary input. LOWER IS STRONGER: rank 0 outranks rank 3, matching
   * `authorityWeight` in `confidence.ts` where rank 0 is the highest authority.
   */
  readonly sourceAuthorityRank: number;
  /** ISO date, or undefined where the source declares none (`L0-ING-010`). */
  readonly effectiveDate?: string;
  readonly epistemicLevel: 'L1' | 'L2' | 'L3' | 'L4';
}

export interface PrecedenceInput {
  readonly a: PrecedenceParticipant;
  readonly b: PrecedenceParticipant;
  /**
   * Specificity of **a relative to b**, computed by the caller from structure.
   *
   * Passed in rather than derived here because the evidence required to judge it
   * — anchor spans, enclosing units, qualifying conditions — is not a property of
   * the participants above. `undetermined` when nothing testable applies.
   */
  readonly specificity: Specificity;
}

export interface PrecedenceRecommendation {
  /** The participant precedence favours, or undefined when it cannot separate them. */
  readonly recommendedRequirementId?: string;
  /** The step that produced the recommendation. `undecidable` when none could. */
  readonly decidedByStep: PrecedenceStep;
  /**
   * The facts the step compared, in the order the ADR states them.
   *
   * Retained in full because *"the AI decided the policy outweighed the email" is
   * not an acceptable audit answer* — and neither is "precedence said so". A
   * reader must be able to see which values were compared and why one won.
   */
  readonly steps: readonly {
    readonly step: PrecedenceStep;
    readonly outcome: 'a' | 'b' | 'tie' | 'not_comparable';
    readonly detail: string;
  }[];
  /** One-line human-readable rationale, built from the deciding step. */
  readonly rationale: string;
  readonly functionVersion: string;
  /**
   * True when no step could separate the participants.
   *
   * A human then has **no computed starting point**, which is worth saying rather
   * than hiding behind an arbitrary winner. `L1-CONF-005` reports it.
   */
  readonly undecidable: boolean;
}

const LEVEL_STRENGTH: Readonly<Record<PrecedenceParticipant['epistemicLevel'], number>> = {
  // ADR-0012 step 4: "extracted evidence outranks interpretation, which outranks
  // inference". L4 is human-approved and outranks all of them.
  L4: 4,
  L1: 3,
  L2: 2,
  L3: 1,
};

/**
 * Compute a precedence recommendation.
 *
 * Pure: no clock, no I/O, no randomness. Same inputs, byte-identical output,
 * every time — which is the property the evaluation asserts at 100%, because
 * anything less makes a recorded rationale unreproducible.
 */
export function computePrecedence(input: PrecedenceInput): PrecedenceRecommendation {
  const { a, b } = input;
  const steps: {
    step: PrecedenceStep;
    outcome: 'a' | 'b' | 'tie' | 'not_comparable';
    detail: string;
  }[] = [];

  // --- step 1: declared source authority rank ----------------------------
  //
  // The ADR's primary input, and the only one a human set deliberately.
  if (a.sourceAuthorityRank !== b.sourceAuthorityRank) {
    const winner = a.sourceAuthorityRank < b.sourceAuthorityRank ? 'a' : 'b';
    steps.push({
      step: 'source_authority',
      outcome: winner,
      detail: `authority rank ${a.sourceAuthorityRank} versus ${b.sourceAuthorityRank}; lower is stronger`,
    });
    return finish(input, steps, winner, 'source_authority');
  }
  steps.push({
    step: 'source_authority',
    outcome: 'tie',
    detail: `both sources are rank ${a.sourceAuthorityRank}`,
  });

  // --- step 2: effective date --------------------------------------------
  //
  // "More recent wins, WHERE DATES ARE KNOWN". A missing date is not a loss and
  // not a win: it makes the step not comparable, which is why L0-ING-010 warns
  // about a source with no effective date and why L1-CONF-007 repeats it here.
  if (a.effectiveDate !== undefined && b.effectiveDate !== undefined) {
    if (a.effectiveDate !== b.effectiveDate) {
      const winner = a.effectiveDate > b.effectiveDate ? 'a' : 'b';
      steps.push({
        step: 'effective_date',
        outcome: winner,
        detail: `effective ${a.effectiveDate} versus ${b.effectiveDate}; more recent wins`,
      });
      return finish(input, steps, winner, 'effective_date');
    }
    steps.push({
      step: 'effective_date',
      outcome: 'tie',
      detail: `both effective ${a.effectiveDate}`,
    });
  } else {
    steps.push({
      step: 'effective_date',
      outcome: 'not_comparable',
      detail:
        'at least one source declares no effective date, so recency cannot be compared ' +
        '(L0-ING-010 warns about this at intake)',
    });
  }

  // --- step 3: specificity -----------------------------------------------
  //
  // Q4: deterministic or `undetermined`. NO HEURISTIC FALLBACK.
  if (input.specificity === 'more_specific' || input.specificity === 'less_specific') {
    const winner = input.specificity === 'more_specific' ? 'a' : 'b';
    steps.push({
      step: 'specificity',
      outcome: winner,
      detail: 'a specific clause outranks a general statement, established from document structure',
    });
    return finish(input, steps, winner, 'specificity');
  }
  steps.push({
    step: 'specificity',
    outcome: 'not_comparable',
    detail:
      'specificity is undetermined: no objectively testable structure separates them, and Q4 ' +
      'forbids a heuristic fallback',
  });

  // --- step 4: epistemic level -------------------------------------------
  const levelA = LEVEL_STRENGTH[a.epistemicLevel];
  const levelB = LEVEL_STRENGTH[b.epistemicLevel];
  if (levelA !== levelB) {
    const winner = levelA > levelB ? 'a' : 'b';
    steps.push({
      step: 'epistemic_level',
      outcome: winner,
      detail: `${a.epistemicLevel} versus ${b.epistemicLevel}; extracted outranks interpreted, which outranks inferred`,
    });
    return finish(input, steps, winner, 'epistemic_level');
  }
  steps.push({
    step: 'epistemic_level',
    outcome: 'tie',
    detail: `both are ${a.epistemicLevel}`,
  });

  // --- undecidable --------------------------------------------------------
  //
  // Every step tied or was not comparable. NO TIE IS BROKEN (Q4).
  return {
    decidedByStep: 'undecidable',
    steps,
    rationale:
      'precedence cannot separate these: equal authority, no comparable dates or equal dates, ' +
      'undetermined specificity, and equal epistemic level. A human has no computed starting point',
    functionVersion: PRECEDENCE_FUNCTION_VERSION,
    undecidable: true,
  };
}

function finish(
  input: PrecedenceInput,
  steps: readonly {
    step: PrecedenceStep;
    outcome: 'a' | 'b' | 'tie' | 'not_comparable';
    detail: string;
  }[],
  winner: 'a' | 'b',
  step: PrecedenceStep,
): PrecedenceRecommendation {
  const chosen = winner === 'a' ? input.a : input.b;
  const other = winner === 'a' ? input.b : input.a;
  const last = steps[steps.length - 1];
  return {
    recommendedRequirementId: chosen.requirementId,
    decidedByStep: step,
    steps,
    rationale:
      `${chosen.requirementId} is favoured over ${other.requirementId} at the ` +
      `${step.replace(/_/g, ' ')} step: ${last?.detail ?? ''}`,
    functionVersion: PRECEDENCE_FUNCTION_VERSION,
    undecidable: false,
  };
}
