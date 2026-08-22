/**
 * Corpus registry.
 *
 * ADR-0031: a corpus is a REGISTERED DATASET resolved by id from a configured
 * store, never in-repo fixtures. The harness must not assume a corpus is present
 * in the repository — that property is what lets real ASDP corpora arrive later
 * as a data-loading exercise rather than a redesign.
 *
 * Evaluation invocations pass through the SAME egress gate as production, so a
 * restricted corpus can be measured on an on-premise provider without violating
 * policy.
 */

import type { Classification } from '@asdp/schemas';

/**
 * Corpus tier. Governs how much a metric measured on it may be trusted, and
 * whether it can justify a routing decision.
 */
export type CorpusTier = 'synthetic' | 'sanitised' | 'representative' | 'real';

export const TIER_ORDER: readonly CorpusTier[] = ['synthetic', 'sanitised', 'representative', 'real'];

export function tierRank(t: CorpusTier): number {
  return TIER_ORDER.indexOf(t);
}

/** Weight in a composite quality score. Synthetic is deliberately down-weighted. */
export const TIER_WEIGHT: Readonly<Record<CorpusTier, number>> = {
  synthetic: 0.25,
  sanitised: 0.75,
  representative: 1.0,
  real: 1.0,
};

export interface CorpusDocument {
  readonly documentId: string;
  readonly sourceKind: string;
  readonly language: string;
  readonly pageCount?: number;
  readonly provenance: string;
}

export interface CorpusDescriptor {
  readonly id: string;
  readonly name: string;
  readonly tier: CorpusTier;
  /** Governs which providers may be evaluated on it, via the egress gate. */
  readonly classification: Classification;
  readonly languages: readonly string[];
  readonly documents: readonly CorpusDocument[];
  readonly goldSetRef?: string;
  /** Held-out corpora are NEVER used for prompt iteration. */
  readonly heldOut: boolean;
  readonly notes?: string;
}

/**
 * Resolves corpora by id from a configured store.
 *
 * There is deliberately no in-repo corpus path: the store is injected, so the
 * harness behaves identically whether the corpus is a synthetic fixture or real
 * material in an enterprise store.
 */
export interface CorpusStore {
  list(): Promise<readonly CorpusDescriptor[]>;
  get(id: string): Promise<CorpusDescriptor | undefined>;
  /** Document text, resolved lazily so restricted content is not held in memory. */
  readDocument(corpusId: string, documentId: string): Promise<string>;
}

export class CorpusNotFoundError extends Error {}

export interface CorpusRegistry {
  resolve(id: string): Promise<CorpusDescriptor>;
  list(): Promise<readonly CorpusDescriptor[]>;
  readDocument(corpusId: string, documentId: string): Promise<string>;
  /** Highest tier registered — drives the anti-over-fitting rule. */
  highestRegisteredTier(): Promise<CorpusTier>;
}

export function createCorpusRegistry(store: CorpusStore): CorpusRegistry {
  return {
    async resolve(id: string): Promise<CorpusDescriptor> {
      const found = await store.get(id);
      if (found === undefined) {
        throw new CorpusNotFoundError(
          `corpus '${id}' is not registered; register it in the configured store (ADR-0031)`,
        );
      }
      return found;
    },
    list: () => store.list(),
    readDocument: (corpusId, documentId) => store.readDocument(corpusId, documentId),
    async highestRegisteredTier(): Promise<CorpusTier> {
      const all = await store.list();
      let highest: CorpusTier = 'synthetic';
      for (const c of all) {
        if (tierRank(c.tier) > tierRank(highest)) highest = c.tier;
      }
      return highest;
    },
  };
}

/**
 * The anti-over-fitting rule (ADR-0031 rule 4).
 *
 * Once any sanitised or representative corpus exists, a prompt or schema change
 * may NOT be accepted on synthetic evidence alone. This is the mechanism behind
 * Phase 0 decision 6: "do not optimise the requirements-analysis model
 * exclusively around synthetic test documents."
 */
export function mayAcceptChange(
  evidenceTiers: readonly CorpusTier[],
  highestRegisteredTier: CorpusTier,
): { readonly allowed: boolean; readonly reason?: string } {
  const bestEvidence = evidenceTiers.reduce<CorpusTier>(
    (best, t) => (tierRank(t) > tierRank(best) ? t : best),
    'synthetic',
  );

  if (tierRank(highestRegisteredTier) > tierRank('synthetic') && bestEvidence === 'synthetic') {
    return {
      allowed: false,
      reason:
        `a '${highestRegisteredTier}' corpus is registered, so a change may not be accepted on ` +
        'synthetic evidence alone (ADR-0031 rule 4)',
    };
  }
  return { allowed: true };
}

/** A held-out corpus may only be used for final measurement. */
export function assertNotHeldOut(corpus: CorpusDescriptor, purpose: 'iteration' | 'measurement'): void {
  if (corpus.heldOut && purpose === 'iteration') {
    throw new Error(
      `corpus '${corpus.id}' is held out and must not be used for prompt iteration (ADR-0031 rule 4)`,
    );
  }
}
