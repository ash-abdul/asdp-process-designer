/**
 * `PROFILE_SOURCE` over the AI broker — the first real broker consumer (V4a).
 *
 * This module is the thing V3 deferred by **D6**: until now the broker, the
 * egress gate, capability negotiation and the degradation ladder were wired only
 * in tests, and `createBrokerVisionExtractor` existed as a seam nothing called.
 * V4a gives the chain a caller.
 *
 * It lives in `apps/api` and not in a pure package because routing, egress and
 * degradation are application concerns — the same reason the vision extractor
 * does. The command layer sees a port (`SourceProfiler`) and never a provider.
 *
 * **The pass is deliberately the cheapest one in the vocabulary.** `PROFILE_SOURCE`
 * requires only schema-constrained output and makes no claim about requirements,
 * so a wrong answer costs nothing and cannot enter the requirements path. That is
 * exactly what makes it the right pass to prove the chain with.
 *
 * **A7:** nothing here decides to go to the network. Whether the wired transport
 * is live or a replay is the composition root's decision, and it is recorded on
 * the interaction as `mode` rather than inferred.
 */

import { invoke, type BrokerDeps } from '@asdp/ai';
import { SourceProfile, type AiInteraction } from '@asdp/schemas';
import type {
  ProfileSourceOutcome,
  ProfileSourceRequest,
  SourceProfiler,
} from '../ports.ts';

export const PROFILE_PROMPT_VERSION = 'profile-source@1';
export const PROFILE_TASK_VERSION = '1';

/**
 * How much text a single `full`-context profiling call may carry.
 *
 * **E4:** chunking is approved but its algorithm is V4b. Until then a source over
 * this limit is **refused by name** — never truncated — because a truncated read
 * reported as a full one is precisely the silent degradation E4 forbids. The
 * limit is deliberately conservative: profiling reads structure, and a profile
 * built from the first slice of a document would describe the slice.
 */
export const PROFILE_MAX_CONTEXT_CHARS = 120_000;

export interface BrokerProfilerDeps {
  /** Broker dependencies MINUS `recordInteraction`, which this module supplies. */
  readonly broker: Omit<BrokerDeps, 'recordInteraction'>;
  /** Whether the wired transport actually calls a provider. Recorded, not inferred. */
  readonly mode: 'live' | 'replay';
  readonly project: { readonly allowExternalProviders: boolean; readonly classificationCeiling: string };
}

/**
 * The instruction given to the model.
 *
 * Narrow on purpose, and negatively scoped: it asks what the document *is* and
 * forbids saying what it *requires*. A prompt inviting "list the requirements"
 * would produce the substantive claim V4a excludes, and the output schema would
 * not stop it — a model fills the fields it is given, so the fields and the
 * instruction have to agree.
 */
export function profileInstruction(): string {
  return (
    'You are profiling a business document so a human can decide how to use it. ' +
    'Report ONLY what kind of document it appears to be, the languages present, which structural ' +
    'features it contains, its section headings verbatim, and a one or two sentence summary of what ' +
    'the document is. ' +
    'Do NOT extract requirements, obligations, rules, process steps, decisions or data fields. ' +
    'Do NOT interpret intent, recommend anything, or infer what the business should do. ' +
    'If you cannot read part of the document, say so in `limitations` rather than guessing.'
  );
}

/**
 * Build a profiler over the AI broker.
 *
 * The interaction record is captured and returned rather than persisted here: the
 * caller owns the transaction, so the interaction and the audit event commit
 * together. `BrokerDeps.recordInteraction` says as much — *"persisted by the
 * caller; the broker only produces the record."*
 */
export function createBrokerSourceProfiler(deps: BrokerProfilerDeps): SourceProfiler {
  return {
    id: PROFILE_PROMPT_VERSION,

    async profile(request: ProfileSourceRequest): Promise<ProfileSourceOutcome> {
      if (request.text.trim().length === 0) {
        return {
          kind: 'refused',
          reason:
            'the source has no canonical text to profile; an image source is read by the vision ' +
            'path and a failed parse has nothing to read',
          degradations: [],
          options: ['profile a source with extracted text', 'check why extraction produced no text'],
        };
      }

      // E4: refuse by name rather than truncate. A profile of the first 120k
      // characters of a 400k-character document is a profile of a fragment, and
      // reporting it as `full` context would be a false record.
      if (request.text.length > PROFILE_MAX_CONTEXT_CHARS) {
        return {
          kind: 'refused',
          reason:
            `the source is ${request.text.length} characters, over the ${PROFILE_MAX_CONTEXT_CHARS} ` +
            'character single-call limit. Chunked context is approved (E4) but arrives in V4b; ' +
            'truncating here would report a fragment as a full read',
          degradations: ['chunked_context'],
          options: [
            'wait for V4b, which reads over-context sources in deterministic chunks',
            'split the document into smaller sources',
          ],
        };
      }

      let captured: AiInteraction | undefined;

      const outcome = await invoke(
        {
          ...deps.broker,
          // Captured, not persisted: the caller's unit of work owns the write.
          recordInteraction: async (interaction) => {
            captured = interaction;
          },
        },
        {
          projectId: request.projectId,
          taskType: 'PROFILE_SOURCE',
          taskVersion: PROFILE_TASK_VERSION,
          promptVersion: PROFILE_PROMPT_VERSION,
          systemInstruction: profileInstruction(),
          content: [
            { kind: 'text', text: request.text, classification: request.classification },
          ],
          project: {
            allowExternalProviders: deps.project.allowExternalProviders,
            classificationCeiling: deps.project
              .classificationCeiling as ProfileSourceRequest['classification'],
          },
          languageHints: [...request.languageHints],
          mode: deps.mode,
          sourceId: request.sourceId,
          ...(request.correlationId === undefined ? {} : { correlationId: request.correlationId }),
          // E4 rule 2: stated, not assumed.
          contextMode: 'full',
          outputSchema: SourceProfile,
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
          // ADR-0022: a repair loop is a degradation, and it is named.
          degradations: ['prompt_repair_loop'],
          options: ['retry the pass', 'profile the document manually'],
          ...(captured === undefined ? {} : { interaction: captured }),
        };
      }

      const parsed = SourceProfile.safeParse(decoded.value);
      if (!parsed.success) {
        return {
          kind: 'refused',
          reason:
            'the provider response did not match the required profile schema: ' +
            parsed.error.message.slice(0, 300),
          degradations: ['prompt_repair_loop'],
          options: ['retry the pass', 'profile the document manually'],
          ...(captured === undefined ? {} : { interaction: captured }),
        };
      }

      if (captured === undefined) {
        // The broker records before returning a proposal, so this cannot happen
        // — and if it ever did, an unrecorded AI call must not be reported as a
        // success (invariant I8).
        return {
          kind: 'refused',
          reason: 'the broker produced a proposal without an interaction record; refusing to ' +
            'report an unrecorded AI call as a success (invariant I8)',
          degradations: [],
          options: ['retry the pass'],
        };
      }

      return { kind: 'profiled', profile: parsed.data, interaction: captured };
    },
  };
}

/**
 * Decode a provider's structured output.
 *
 * `AiResponse.outputs` is a list of raw outputs — the transport does not
 * interpret the payload — so a schema-constrained task gets JSON text back and
 * someone has to parse it. Doing it here, once, is what stops each consumer
 * inventing its own tolerance.
 *
 * **Strict on purpose.** A fenced code block or a chatty preamble is *not*
 * silently stripped: that is a repair, and a repair is a declared degradation
 * (`prompt_repair_loop`), not a convenience. The caller reports it as one.
 *
 * V3's unwired vision extractor validated `proposal.payload` — the outputs
 * *array* — directly against an object schema, so it could only ever have
 * refused. Nothing caught it because nothing called it; this is the shared fix.
 */
export function decodeStructured(
  payload: unknown,
): { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly reason: string } {
  const outputs = Array.isArray(payload) ? payload : [payload];
  const first = outputs[0];

  if (first === undefined) return { ok: false, reason: 'the response carried no output' };
  if (typeof first === 'object' && first !== null) return { ok: true, value: first };
  if (typeof first !== 'string') {
    return { ok: false, reason: `expected an object or JSON text, got ${typeof first}` };
  }
  if (first.trim().length === 0) return { ok: false, reason: 'the response was empty' };

  try {
    return { ok: true, value: JSON.parse(first) };
  } catch (err) {
    return {
      ok: false,
      reason: `the response was not valid JSON (${err instanceof Error ? err.message : String(err)})`,
    };
  }
}

/**
 * A `SourceProfiler` that refuses, for builds with no provider configured.
 *
 * Refusing is the correct answer when nothing is wired — not a degraded mode —
 * and it is distinguishable from "the document could not be characterised". The
 * default in the composition root, exactly as `unavailableVisionExtractor` is:
 * **the application ships unable to call a provider**, and wiring one is a
 * deliberate configuration act.
 */
export function unavailableSourceProfiler(reason?: string): SourceProfiler {
  return {
    id: 'unavailable@v4a',
    profile: async () => ({
      kind: 'refused',
      reason:
        reason ??
        'no AI provider is configured in this build, so no source can be profiled. This is a ' +
          'configuration gap, not a statement about the document.',
      degradations: ['no_provider_configured'],
      options: [
        'configure a provider through the AI Provider Abstraction (A8 permits Claude API for permitted material)',
        'read the document yourself — profiling is commentary, and nothing downstream requires it',
      ],
    }),
  };
}
