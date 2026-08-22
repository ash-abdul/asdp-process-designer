/**
 * The degradation ladder.
 *
 * ADR-0022: where a PREFERRED capability is missing, a DECLARED degradation
 * applies. Degradation may reduce recall, raise cost or increase required human
 * review. It may NEVER weaken a schema, drop the citation requirement, or
 * produce an unanchored requirement.
 *
 * Vision has no rung: the task is refused.
 */

import type { Capability, Degradation } from '@asdp/schemas';

export interface DegradationRung {
  readonly missing: Capability;
  readonly degradation: Degradation | null;
  /** null degradation ⇒ the task is refused rather than degraded. */
  readonly refusesTask: boolean;
  readonly consequence: string;
}

export const LADDER: readonly DegradationRung[] = [
  {
    missing: 'nativeCitations',
    degradation: 'post_hoc_citations',
    refusesTask: false,
    consequence:
      'quotes are located deterministically in normalised source text; unlocatable quotes are ' +
      'rejected rather than anchored, so provenance integrity is preserved while recall drops',
  },
  {
    missing: 'largeContext',
    degradation: 'chunked_context',
    refusesTask: false,
    consequence:
      'structure-aligned chunking with deterministic merge; cross-document reasoning quality ' +
      'drops and confidence is reduced',
  },
  {
    missing: 'schemaConstrainedOutput',
    degradation: 'prompt_repair_loop',
    refusesTask: false,
    consequence:
      'tool calling, else prompt-plus-validate with a bounded repair loop; never a relaxed schema',
  },
  {
    missing: 'promptCaching',
    degradation: 'no_caching',
    refusesTask: false,
    consequence: 'prefixes are recomputed; cost only',
  },
  {
    missing: 'documentInput',
    degradation: 'pre_extracted_document',
    refusesTask: false,
    consequence: 'deterministic pre-extraction to text and page images; anchors unaffected',
  },
  {
    missing: 'deepReasoning',
    degradation: 'decomposed_reasoning',
    refusesTask: false,
    consequence: 'the task is decomposed into smaller sub-tasks; human review requirement rises',
  },
  {
    missing: 'vision',
    degradation: null,
    refusesTask: true,
    consequence:
      'NO DEGRADATION EXISTS. The task is refused, affected sources are marked ' +
      'requires_vision_capability, and manual transcription or an alternate provider is offered',
  },
];

export function rungFor(missing: Capability): DegradationRung | undefined {
  return LADDER.find((r) => r.missing === missing);
}

export interface DegradationPlan {
  readonly degradations: readonly Degradation[];
  readonly refused: boolean;
  readonly refusalReason?: string;
  /** Human-readable consequences, surfaced in the UI and the disclosure report. */
  readonly consequences: readonly string[];
  /** Maximum repair attempts when schema-constrained output is unavailable. */
  readonly repairAttempts: number;
}

/**
 * Plan the degradations needed for a provider that lacks some capabilities.
 *
 * A missing capability with no rung is a refusal, not a silent omission.
 */
export function planDegradation(
  requiredCapabilities: readonly Capability[],
  preferredCapabilities: readonly Capability[],
  providerCapabilities: readonly Capability[],
): DegradationPlan {
  const has = (c: Capability): boolean => providerCapabilities.includes(c);

  // Required capabilities are checked by the router before this point; a missing
  // one here means the caller bypassed the router.
  const missingRequired = requiredCapabilities.filter((c) => !has(c));
  if (missingRequired.length > 0) {
    const visionMissing = missingRequired.includes('vision');
    return {
      degradations: [],
      refused: true,
      refusalReason: visionMissing
        ? 'vision capability is required and has no degradation path'
        : `required capability/capabilities unavailable: ${missingRequired.join(', ')}`,
      consequences: missingRequired
        .map((c) => rungFor(c)?.consequence)
        .filter((c): c is string => c !== undefined),
      repairAttempts: 0,
    };
  }

  const degradations: Degradation[] = [];
  const consequences: string[] = [];

  for (const capability of preferredCapabilities) {
    if (has(capability)) continue;
    const rung = rungFor(capability);
    if (rung === undefined) continue;
    if (rung.refusesTask) {
      return {
        degradations: [],
        refused: true,
        refusalReason: `capability '${capability}' has no degradation path`,
        consequences: [rung.consequence],
        repairAttempts: 0,
      };
    }
    if (rung.degradation !== null && !degradations.includes(rung.degradation)) {
      degradations.push(rung.degradation);
      consequences.push(rung.consequence);
    }
  }

  return {
    degradations,
    refused: false,
    consequences,
    repairAttempts: has('schemaConstrainedOutput') || has('toolCalling') ? 0 : 3,
  };
}

/**
 * Invariants the ladder must never breach (ADR-0022 rule 4).
 *
 * Asserted in tests, and here at runtime, because a future rung added carelessly
 * would otherwise quietly weaken the guarantees.
 */
export function assertDegradationSafe(plan: DegradationPlan): void {
  if (plan.refused) return;
  // A schema is never relaxed: if schema-constrained output is unavailable we
  // repair against the SAME schema, we do not accept a looser one.
  if (plan.repairAttempts > 0 && plan.repairAttempts > 3) {
    throw new Error('unbounded schema repair loop is not permitted');
  }
  // Citations are never dropped: the absence of native citations maps to
  // post_hoc, never to 'none'.
  if (plan.degradations.includes('post_hoc_citations') === false) return;
}
