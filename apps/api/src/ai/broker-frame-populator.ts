/**
 * `POPULATE_FRAME` over the AI broker (V5).
 *
 * The third broker consumer, and the first whose output is **not verbatim**.
 * V4b asked for quotes and could check every one against the source; this asks for
 * *propositions*, and no check can confirm that a proposition faithfully
 * represents the evidence it cites. Everything cautious about this module follows
 * from that.
 *
 * **The prompt is one half of the boundary and the schema is the other.**
 * `FramePopulation` has no field for an anchor, a quote, an offset, an epistemic
 * level, a derivation, a confidence, a conflict, a question, a priority or an
 * acceptance criterion — and the instruction forbids inventing any of them. Both
 * are needed: a model fills whatever fields it is given, and a schema alone will
 * not stop it asserting more than its evidence supports inside a field it does
 * have.
 *
 * **One call per pass** (**J7**). The caller owns the partition, so this port stays
 * a single request/response and a refusal degrades one pass rather than the run.
 *
 * **A7:** nothing here decides to go to the network. Live or replay is the
 * composition root's decision, recorded on the interaction as `mode`.
 */

import { invoke, type BrokerDeps } from '@asdp/ai';
import { FramePopulation, type AiInteraction } from '@asdp/schemas';
import type { FramePopulator, PopulateFrameOutcome, PopulateFrameRequest } from '../ports.ts';
import { decodeStructured } from './broker-profiler.ts';

export const FRAME_PROMPT_VERSION = 'populate-frame@1';
export const FRAME_TASK_VERSION = '1';

export interface BrokerFramePopulatorDeps {
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
 * Four insistences, each against a specific failure mode:
 *
 *   CITE          a proposition with no evidence is an L3 inference, and V5
 *                 refuses inference (J1) — the model is told so it does not spend
 *                 the call producing items that will be discarded
 *   NO INVENTION  the failure this slice cannot detect mechanically is a fluent
 *                 overstatement of real evidence; saying so in the prompt is the
 *                 only place it can be addressed at all
 *   SLOTS         the frame is owned by code (ADR-0010) and a proposed slot is
 *                 re-checked; a slot outside this pass is refused
 *   NO DESIGN     a gateway, an expression or a form field is process design, and
 *                 design happens after human approval, not here
 */
export function frameInstruction(passTitle: string, slotBrief: string): string {
  return (
    `You are structuring EVIDENCE into business requirement PROPOSALS for one part of a fixed ` +
    `analysis frame: "${passTitle}".\n\n` +
    'You are given evidence items, each with an id and the exact text of the source. Propose ' +
    'requirement statements that the evidence supports, and assign each to one of the slots ' +
    'below.\n\n' +
    `Slots available in this pass:\n${slotBrief}\n\n` +
    'Rules:\n' +
    '1. Every proposal MUST list the evidence ids it rests on in `evidenceItemIds`, using ONLY ' +
    'the ids supplied. A proposal citing no evidence, or citing an id you were not given, is ' +
    'DISCARDED.\n' +
    '2. Do NOT state anything the cited evidence does not support. Do not fill a gap with a ' +
    'sensible default, an industry best practice, or an assumption of your own. If the evidence ' +
    'does not say, leave the slot unfilled and explain in `limitations`.\n' +
    '3. Use ONLY the slot names listed above. Do not invent slots, and do not propose for a slot ' +
    'that is not in this pass.\n' +
    '4. Do NOT design a process. No gateways, no expressions, no BPMN, DMN or form concepts, no ' +
    'priorities, no acceptance criteria. You are structuring what the evidence says.\n' +
    '5. Write each proposal in the language of the evidence it rests on.'
  );
}

/** One evidence item as the model sees it: an id and the text. Nothing else. */
export interface FrameEvidenceLine {
  readonly evidenceItemId: string;
  readonly verbatimText: string;
}

/**
 * Render the batch for the prompt.
 *
 * Ids and verbatim text only. The model is deliberately **not** given anchors,
 * offsets, source names or classifications: it has no use for them, and every one
 * of them is something it could then repeat back as though it had verified it.
 */
export function renderEvidenceBatch(lines: readonly FrameEvidenceLine[]): string {
  return lines.map((l) => `[${l.evidenceItemId}] ${l.verbatimText}`).join('\n');
}

export function createBrokerFramePopulator(deps: BrokerFramePopulatorDeps): FramePopulator {
  return {
    id: FRAME_PROMPT_VERSION,

    async populate(request: PopulateFrameRequest): Promise<PopulateFrameOutcome> {
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
          taskType: 'POPULATE_FRAME',
          taskVersion: FRAME_TASK_VERSION,
          promptVersion: FRAME_PROMPT_VERSION,
          systemInstruction: frameInstruction(request.passTitle, request.slotBrief),
          content: [
            {
              kind: 'text',
              text: renderEvidenceBatch(request.evidence),
              classification: request.classification,
            },
          ],
          project: {
            allowExternalProviders: deps.project.allowExternalProviders,
            classificationCeiling: deps.project
              .classificationCeiling as PopulateFrameRequest['classification'],
          },
          languageHints: [...request.languageHints],
          mode: deps.mode,
          ...(request.correlationId === undefined ? {} : { correlationId: request.correlationId }),
          // E4 rules 2 and 3: what the provider actually saw. A batch that is one
          // of several is `chunked` even when this batch is whole, because the
          // model saw a part — and that is the fact confidence must account for.
          contextMode: request.batch.total > 1 ? 'chunked' : 'full',
          // E4 rules 4 and 5: the split declares itself rather than relying on the
          // capability ladder to name it. A record saying `chunked` with no
          // `chunked_context` degradation would contradict itself, and the
          // confidence would ignore the split. The V4b-core defect, not repeated.
          ...(request.batch.total > 1
            ? { declaredDegradations: ['chunked_context' as const] }
            : {}),
          ...(request.batch.total > 1
            ? {
                chunkCount: request.batch.total,
                chunkStrategyVersion: request.batch.strategyVersion,
              }
            : {}),
          outputSchema: FramePopulation,
        },
      );

      if (outcome.kind === 'refused') {
        // A refusal with NO eligible provider and at least one rejected one is
        // the egress gate speaking: the content may not leave. A refusal for any
        // other reason — nothing wired, everything failed — is not a statement
        // about data governance and must not be recorded as one.
        const gated =
          outcome.routing.eligibleProviders.length === 0 &&
          outcome.routing.rejectedProviders.length > 0;
        return {
          kind: 'refused',
          reason: outcome.detail,
          refusalKind: gated ? 'policy' : 'unavailable',
          degradations: (outcome.routing.plan?.degradations ?? []).map(String),
          options: [...outcome.options],
        };
      }

      const decoded = decodeStructured(outcome.proposal.payload);
      if (!decoded.ok) {
        return {
          kind: 'refused',
          reason: `the provider response was not usable structured output: ${decoded.reason}`,
          refusalKind: 'malformed',
          degradations: ['prompt_repair_loop'],
          options: ['retry this pass', 'record requirements by hand from the evidence list'],
          ...(captured === undefined ? {} : { interaction: captured }),
        };
      }

      const parsed = FramePopulation.safeParse(decoded.value);
      if (!parsed.success) {
        return {
          kind: 'refused',
          reason:
            'the provider response did not match the required frame-population schema: ' +
            parsed.error.message.slice(0, 300),
          refusalKind: 'malformed',
          degradations: ['prompt_repair_loop'],
          options: ['retry this pass', 'record requirements by hand from the evidence list'],
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
          refusalKind: 'malformed',
          degradations: [],
          options: ['retry this pass'],
        };
      }

      return { kind: 'populated', population: parsed.data, interaction: captured };
    },
  };
}

/**
 * A populator that refuses, for builds with no provider configured.
 *
 * The default in the composition root. The application ships unable to populate
 * the frame, and wiring a provider is a deliberate act — the same posture as
 * vision, profiling and extraction.
 */
export function unavailableFramePopulator(reason?: string): FramePopulator {
  return {
    id: 'unavailable@v5',
    populate: async () => ({
      kind: 'refused',
      reason:
        reason ??
        'no AI provider is configured in this build, so no requirement proposals can be made. ' +
          'This is a configuration gap, not a statement that the evidence supports nothing.',
      // NOT a policy block: nothing was denied, nothing was wired.
      refusalKind: 'unavailable',
      degradations: ['no_provider_configured'],
      options: [
        'configure a provider through the AI Provider Abstraction (A8 permits Claude API for permitted material)',
        'read the evidence list directly — every item is anchored and citable without this pass',
      ],
    }),
  };
}
