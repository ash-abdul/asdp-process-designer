/**
 * `CANONICALISE_ENTITIES` and `RECONCILE_SOURCES` over the AI broker (V6).
 *
 * The fourth and fifth broker consumers, and the first whose subject is **other
 * AI output**. V5 asked a model to read evidence; these ask it to compare
 * propositions and say whether they mean the same thing or cannot both hold.
 *
 * **The prompts and the schemas are two halves of one boundary**, and here the
 * schemas carry more of it than usual:
 *
 *   - `EntityMergeCandidate` has **no canonical id, no classification and no
 *     confirmation** — all three are code's, and a model fills what it is given
 *   - `ReconciliationCandidate`'s classification enum **excludes
 *     `true_conflict`**, so the strongest claim in the taxonomy is unreachable
 *     rather than merely discouraged (**Q8**)
 *   - neither has a `resolution` field, because precedence is deterministic
 *     (**Q5**)
 *
 * **A7:** nothing here decides to go to the network. Live or replay is the
 * composition root's decision, recorded on the interaction as `mode`. **H3 keeps
 * V6 replay-only regardless.**
 */

import { invoke, type BrokerDeps } from '@asdp/ai';
import { EntityCanonicalisation, SourceReconciliation, type AiInteraction } from '@asdp/schemas';
import type {
  Canonicaliser,
  CanonicaliseOutcome,
  CanonicaliseRequest,
  Reconciler,
  ReconcileOutcome,
  ReconcileRequest,
} from '../ports.ts';
import { decodeStructured } from './broker-profiler.ts';

export const CANONICALISE_PROMPT_VERSION = 'canonicalise-entities@1';
export const RECONCILE_PROMPT_VERSION = 'reconcile-sources@1';
export const V6_TASK_VERSION = '1';

export interface BrokerReconcilerDeps {
  readonly broker: Omit<BrokerDeps, 'recordInteraction'>;
  readonly mode: 'live' | 'replay';
  readonly project: {
    readonly allowExternalProviders: boolean;
    readonly classificationCeiling: string;
  };
}

/**
 * The canonicalisation instruction.
 *
 * Three insistences, each against a named failure:
 *
 *   ONLY THESE       a merge naming a form it was not shown cannot be checked,
 *                    so it is discarded — say so, rather than spend the call
 *   NOT SIMILAR      similar names are not the same thing. The one failure this
 *                    slice cannot detect afterwards is an over-merge, because it
 *                    leaves nothing behind to notice
 *   BOTH LANGUAGES   an English-only canonical label makes an English concept,
 *                    which ADR-0023 exists to prevent
 */
export function canonicaliseInstruction(kind: string, surfaceForms: readonly string[]): string {
  return (
    `You are grouping SURFACE FORMS that refer to the SAME ${kind} in a business process.\n\n` +
    'Forms that are already identical after normalisation have been grouped for you. What is left ' +
    'is the harder case: synonyms, abbreviations, and the same participant named differently in ' +
    'Arabic and English.\n\n' +
    `Surface forms in this batch:\n${surfaceForms.map((s) => `- ${s}`).join('\n')}\n\n` +
    'Rules:\n' +
    '1. Use ONLY the surface forms listed above, copied exactly. A merge naming anything else is ' +
    'DISCARDED.\n' +
    '2. Merge ONLY forms that denote the SAME real thing. Similar names are not the same thing: ' +
    '"the reviewing officer" and "the senior reviewing officer" may be different roles. If you are ' +
    'not sure, DO NOT MERGE — say so in `limitations` instead.\n' +
    '3. Give every group a label in BOTH English and Arabic. If you cannot supply one, leave that ' +
    'label empty rather than guessing a translation.\n' +
    '4. State WHY the forms are the same in `reason`. A human will read it before confirming.\n' +
    '5. Do NOT invent forms, ids, classifications, or confirmations. You are proposing groups.'
  );
}

/**
 * The reconciliation instruction.
 *
 * The one place the taxonomy is explained to the model, and the one place the
 * *"textual difference is not conflict"* rule can be stated in the terms a model
 * will actually apply.
 */
export function reconcileInstruction(rafSlot: string, requirements: readonly string[]): string {
  return (
    'You are comparing business requirement PROPOSITIONS that came from different sources, to say ' +
    `how they relate. All of them sit in the analysis slot "${rafSlot}".\n\n` +
    `Propositions:\n${requirements.join('\n')}\n\n` +
    'For each PAIR worth reporting, choose exactly one classification:\n' +
    '- `equivalent`: different wording, same business content. "within 90 days" and "within three ' +
    'months" are equivalent.\n' +
    '- `complementary`: both true, same topic, adding different things. Two different required ' +
    'documents are complementary, NOT contradictory.\n' +
    '- `potentially_contradictory`: same topic, and both CANNOT hold as stated. "within 90 days" ' +
    'and "within 30 days" cannot both hold.\n\n' +
    'Rules:\n' +
    '1. Use ONLY the requirement ids listed above, exactly two per candidate.\n' +
    '2. DIFFERENT WORDING IS NOT A CONTRADICTION. Report `potentially_contradictory` only when the ' +
    'two statements genuinely cannot both be true.\n' +
    '3. EXPLAIN the relationship. Do NOT say which one is correct, which should win, or which ' +
    'takes precedence — that is decided elsewhere, and a candidate that proposes a resolution is ' +
    'DISCARDED.\n' +
    '4. If a pair is unrelated, omit it. Reporting everything is the same as reporting nothing.\n' +
    '5. If you cannot tell, say so in `limitations` rather than guessing.'
  );
}

export function createBrokerCanonicaliser(deps: BrokerReconcilerDeps): Canonicaliser {
  return {
    id: CANONICALISE_PROMPT_VERSION,

    async canonicalise(request: CanonicaliseRequest): Promise<CanonicaliseOutcome> {
      let captured: AiInteraction | undefined;

      const outcome = await invoke(
        {
          ...deps.broker,
          recordInteraction: async (interaction) => {
            captured = interaction;
          },
        },
        {
          projectId: request.projectId,
          taskType: 'CANONICALISE_ENTITIES',
          taskVersion: V6_TASK_VERSION,
          promptVersion: CANONICALISE_PROMPT_VERSION,
          systemInstruction: canonicaliseInstruction(request.kind, request.surfaceForms),
          content: [
            {
              kind: 'text',
              text: request.surfaceForms.join('\n'),
              classification: request.classification,
            },
          ],
          project: {
            allowExternalProviders: deps.project.allowExternalProviders,
            classificationCeiling: deps.project
              .classificationCeiling as CanonicaliseRequest['classification'],
          },
          languageHints: [...request.languageHints],
          mode: deps.mode,
          ...(request.correlationId === undefined ? {} : { correlationId: request.correlationId }),
          contextMode: 'full',
          outputSchema: EntityCanonicalisation,
        },
      );

      if (outcome.kind === 'refused') {
        return {
          kind: 'refused',
          reason: outcome.detail,
          degradations: (outcome.routing.plan?.degradations ?? []).map(String),
          options: [...outcome.options],
        };
      }

      const decoded = decodeStructured(outcome.proposal.payload);
      const parsed = decoded.ok ? EntityCanonicalisation.safeParse(decoded.value) : undefined;
      if (parsed?.success !== true) {
        return {
          kind: 'refused',
          reason:
            'the provider response was not usable canonicalisation output: ' +
            (decoded.ok ? 'schema mismatch' : decoded.reason),
          degradations: ['prompt_repair_loop'],
          options: ['retry this pass', 'rely on deterministic match-form grouping alone'],
          ...(captured === undefined ? {} : { interaction: captured }),
        };
      }

      if (captured === undefined) {
        // Invariant I8: an unrecorded AI call must never be reported as a success.
        return {
          kind: 'refused',
          reason:
            'the broker produced a proposal without an interaction record; refusing to report an ' +
            'unrecorded AI call as a success (invariant I8)',
          degradations: [],
          options: ['retry this pass'],
        };
      }

      return { kind: 'canonicalised', canonicalisation: parsed.data, interaction: captured };
    },
  };
}

export function createBrokerReconciler(deps: BrokerReconcilerDeps): Reconciler {
  return {
    id: RECONCILE_PROMPT_VERSION,

    async reconcile(request: ReconcileRequest): Promise<ReconcileOutcome> {
      let captured: AiInteraction | undefined;

      const rendered = request.requirements.map((r) => `[${r.requirementId}] ${r.text}`);

      const outcome = await invoke(
        {
          ...deps.broker,
          recordInteraction: async (interaction) => {
            captured = interaction;
          },
        },
        {
          projectId: request.projectId,
          taskType: 'RECONCILE_SOURCES',
          taskVersion: V6_TASK_VERSION,
          promptVersion: RECONCILE_PROMPT_VERSION,
          systemInstruction: reconcileInstruction(request.rafSlot, rendered),
          content: [
            { kind: 'text', text: rendered.join('\n'), classification: request.classification },
          ],
          project: {
            allowExternalProviders: deps.project.allowExternalProviders,
            classificationCeiling: deps.project
              .classificationCeiling as ReconcileRequest['classification'],
          },
          languageHints: [...request.languageHints],
          mode: deps.mode,
          ...(request.correlationId === undefined ? {} : { correlationId: request.correlationId }),
          contextMode: 'full',
          outputSchema: SourceReconciliation,
        },
      );

      if (outcome.kind === 'refused') {
        return {
          kind: 'refused',
          reason: outcome.detail,
          degradations: (outcome.routing.plan?.degradations ?? []).map(String),
          options: [...outcome.options],
        };
      }

      const decoded = decodeStructured(outcome.proposal.payload);
      const parsed = decoded.ok ? SourceReconciliation.safeParse(decoded.value) : undefined;
      if (parsed?.success !== true) {
        return {
          kind: 'refused',
          reason:
            'the provider response was not usable reconciliation output: ' +
            (decoded.ok ? 'schema mismatch' : decoded.reason),
          degradations: ['prompt_repair_loop'],
          options: ['retry this slot', 'review the propositions by hand'],
          ...(captured === undefined ? {} : { interaction: captured }),
        };
      }

      if (captured === undefined) {
        return {
          kind: 'refused',
          reason:
            'the broker produced a proposal without an interaction record; refusing to report an ' +
            'unrecorded AI call as a success (invariant I8)',
          degradations: [],
          options: ['retry this slot'],
        };
      }

      return { kind: 'reconciled', reconciliation: parsed.data, interaction: captured };
    },
  };
}

/** Ports that refuse, for builds with no provider configured. The default. */
export function unavailableCanonicaliser(): Canonicaliser {
  return {
    id: 'unavailable@v6',
    canonicalise: async () => ({
      kind: 'refused',
      reason:
        'no AI provider is configured in this build, so no merge candidates can be proposed. ' +
        'Deterministic match-form grouping still runs — it needs no provider.',
      degradations: ['no_provider_configured'],
      options: [
        'configure a provider through the AI Provider Abstraction',
        'rely on deterministic grouping, which merges only exact match-form equality',
      ],
    }),
  };
}

export function unavailableReconciler(): Reconciler {
  return {
    id: 'unavailable@v6',
    reconcile: async () => ({
      kind: 'refused',
      reason:
        'no AI provider is configured in this build, so no conflict candidates can be proposed. ' +
        'This is a configuration gap, not a statement that the sources agree.',
      degradations: ['no_provider_configured'],
      options: [
        'configure a provider through the AI Provider Abstraction',
        'compare the propositions by hand — every one is anchored and citable',
      ],
    }),
  };
}
