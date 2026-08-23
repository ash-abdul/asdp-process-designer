/**
 * `EXTRACT_EVIDENCE` over the AI broker (V4b-core).
 *
 * The second broker consumer, and the first one whose output can become evidence
 * a requirement will later cite. Everything cautious about this module follows
 * from that: it asks for **verbatim quotes and locators**, never offsets, and it
 * hands back **candidates** for the command to gate.
 *
 * **The prompt is the first half of the boundary and the schema is the second.**
 * `EvidenceExtraction` has no field for an obligation, a rule, a process step or
 * a decision, and the instruction forbids producing one. Both are needed: a model
 * fills whatever fields it is given, and a schema alone would not stop it
 * *paraphrasing* into the quote field.
 *
 * **A7:** nothing here decides to go to the network. Live or replay is the
 * composition root's decision, recorded on the interaction as `mode`.
 */

import { invoke, type BrokerDeps } from '@asdp/ai';
import { EvidenceExtraction, type AiInteraction } from '@asdp/schemas';
import type {
  EvidenceExtractor,
  ExtractEvidenceOutcome,
  ExtractEvidenceRequest,
} from '../ports.ts';
import { decodeStructured } from './broker-profiler.ts';

export const EXTRACT_PROMPT_VERSION = 'extract-evidence@1';
export const EXTRACT_TASK_VERSION = '1';

export interface BrokerExtractorDeps {
  readonly broker: Omit<BrokerDeps, 'recordInteraction'>;
  readonly mode: 'live' | 'replay';
  readonly project: {
    readonly allowExternalProviders: boolean;
    readonly classificationCeiling: string;
  };
}

/**
 * The instruction given to the model.
 *
 * Three things it insists on, each because of a specific failure mode:
 *
 *   VERBATIM      a paraphrase cannot be located in the source, so it cannot be
 *                 anchored, so it is rejected — the model is told this so it does
 *                 not spend the call producing unusable items
 *   LOCATOR       a repeated sentence is unciteable without one (§4.4), and the
 *                 unit ids offered are the only ones that resolve
 *   NO ANALYSIS   what the document *requires* is a requirement; extracting it
 *                 here would put an unreviewed claim into the requirements path
 */
export function extractInstruction(unitIds: readonly string[]): string {
  return (
    'You are extracting EVIDENCE from a business document. Return the sentences or clauses that ' +
    'state something a business analyst would need to know: obligations, conditions, timeframes, ' +
    'actors, thresholds, or exceptions AS THEY ARE WRITTEN.\n\n' +
    'Rules:\n' +
    '1. Each `quote` MUST be copied VERBATIM from the supplied text, character for character. Do ' +
    'not paraphrase, translate, summarise, correct, or join separated sentences. A quote that ' +
    'cannot be found in the text exactly will be discarded.\n' +
    '2. Set `locator.unitId` to the unit the quote came from, using ONLY these ids: ' +
    `${unitIds.join(', ')}. A quote that appears more than once and has no usable locator will be ` +
    'discarded, so supply the locator.\n' +
    '3. Do NOT write requirements, rules, decisions, process steps, or recommendations of your own. ' +
    'Do NOT infer intent. You are quoting, not analysing.\n' +
    '4. If a passage is unclear or unreadable, say so in `limitations` rather than guessing.'
  );
}

/**
 * Build an extractor over the AI broker.
 *
 * The interaction record is captured and returned rather than persisted, so the
 * caller's unit of work owns the write — the interaction and the evidence commit
 * together or not at all.
 */
export function createBrokerEvidenceExtractor(deps: BrokerExtractorDeps): EvidenceExtractor {
  return {
    id: EXTRACT_PROMPT_VERSION,

    async extract(request: ExtractEvidenceRequest): Promise<ExtractEvidenceOutcome> {
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
          taskType: 'EXTRACT_EVIDENCE',
          taskVersion: EXTRACT_TASK_VERSION,
          promptVersion: EXTRACT_PROMPT_VERSION,
          systemInstruction: extractInstruction(request.unitIds),
          content: [{ kind: 'text', text: request.text, classification: request.classification }],
          project: {
            allowExternalProviders: deps.project.allowExternalProviders,
            classificationCeiling: deps.project
              .classificationCeiling as ExtractEvidenceRequest['classification'],
          },
          languageHints: [...request.languageHints],
          mode: deps.mode,
          sourceId: request.sourceId,
          ...(request.correlationId === undefined
            ? {}
            : { correlationId: request.correlationId }),
          // E4 rules 2 and 3: what the provider actually saw, stated on the record.
          // One chunk of many is `chunked` even if this particular chunk is whole —
          // the model saw a part, and that is the fact confidence must account for.
          contextMode: request.chunk.total > 1 ? 'chunked' : 'full',
          // E4 rules 4 and 5: the SPLIT declares itself, independently of whether
          // the provider's capabilities would also have forced one. A record
          // saying `chunked` with no `chunked_context` degradation would
          // contradict itself, and the confidence would ignore the split.
          ...(request.chunk.total > 1 ? { declaredDegradations: ['chunked_context' as const] } : {}),
          ...(request.chunk.total > 1
            ? {
                chunkCount: request.chunk.total,
                chunkRanges: [
                  {
                    chunkId: request.chunk.chunkId,
                    charStart: request.chunk.charStart,
                    charEnd: request.chunk.charEnd,
                  },
                ],
                chunkStrategyVersion: request.chunk.strategyVersion,
              }
            : {}),
          outputSchema: EvidenceExtraction,
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
      if (!decoded.ok) {
        return {
          kind: 'refused',
          reason: `the provider response was not usable structured output: ${decoded.reason}`,
          degradations: ['prompt_repair_loop'],
          options: ['retry the pass', 'extract evidence manually from the source viewer'],
          ...(captured === undefined ? {} : { interaction: captured }),
        };
      }

      const parsed = EvidenceExtraction.safeParse(decoded.value);
      if (!parsed.success) {
        return {
          kind: 'refused',
          reason:
            'the provider response did not match the required extraction schema: ' +
            parsed.error.message.slice(0, 300),
          degradations: ['prompt_repair_loop'],
          options: ['retry the pass', 'extract evidence manually from the source viewer'],
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
          options: ['retry the pass'],
        };
      }

      return { kind: 'extracted', extraction: parsed.data, interaction: captured };
    },
  };
}

/**
 * An extractor that refuses, for builds with no provider configured.
 *
 * The default in the composition root. The application ships unable to extract,
 * and wiring a provider is a deliberate act — the same posture as vision and
 * profiling.
 */
export function unavailableEvidenceExtractor(reason?: string): EvidenceExtractor {
  return {
    id: 'unavailable@v4b',
    extract: async () => ({
      kind: 'refused',
      reason:
        reason ??
        'no AI provider is configured in this build, so no evidence can be extracted. This is a ' +
          'configuration gap, not a statement that the document contains nothing.',
      degradations: ['no_provider_configured'],
      options: [
        'configure a provider through the AI Provider Abstraction (A8 permits Claude API for permitted material)',
        'record evidence by hand from the source viewer — the manual path is unchanged',
      ],
    }),
  };
}
