/**
 * The `VisionExtractor` implementation — the only place vision meets the AI layer.
 *
 * It lives in `apps/api` and not in `@asdp/ingestion` because the dependency rules
 * forbid intake importing `@asdp/ai`, and rightly: routing, the egress gate and
 * the degradation ladder are application concerns. Intake declares the *shape* of
 * the request; the application decides whether it may be made, by whom, and what
 * to do when it cannot.
 *
 * Everything load-bearing here is Phase 1 machinery being used for the first time:
 * the broker, the egress gate, capability negotiation and the degradation ladder
 * all already existed and were tested against stubs. V3 gives them real content.
 *
 * **A7 / D5:** whether the underlying transport is live or a replay is the
 * composition root's decision, recorded on the interaction as `mode`. Nothing in
 * this file chooses to go to the network.
 */

import { invoke, type BrokerDeps } from '@asdp/ai';
import { VisionResult, type Classification, type ProjectSettings } from '@asdp/schemas';
import type { VisionExtractor, VisionInput, VisionOutcome } from '@asdp/ingestion';

export const VISION_EXTRACTOR_VERSION = 'vision@1';

/** Media types this extractor will read. Images only — never a document. */
const SUPPORTED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp']);

export interface BrokerVisionDeps {
  readonly broker: BrokerDeps;
  /** Whether the wired transport actually calls a provider. Recorded, not inferred. */
  readonly mode: 'live' | 'replay';
  /** Store the image bytes so the request can reference them, and return the ref. */
  readonly stageImage: (input: VisionInput) => Promise<string>;
  /** Project egress settings, so `allowExternalProviders: false` is honoured. */
  readonly project: ProjectSettings;
  readonly classification: Classification;
}

/**
 * The instruction given to the model.
 *
 * Deliberately narrow. It asks for **regions and their verbatim text** and
 * explicitly forbids interpretation, because V3 is an evidence-ingestion slice:
 * turning a diagram into process structure is IR work and would breach ADR-0005.
 * A prompt that invited "describe the process" would produce exactly the content
 * the boundary excludes.
 */
function instructionFor(kind: string): string {
  const shared =
    'Report only what is legibly present. Return each text region with its bounding rectangle in ' +
    'pixel coordinates of the supplied image, the verbatim text, and its language. Do NOT ' +
    'interpret, summarise, translate, infer intent, or describe process behaviour. If a region is ' +
    'illegible, omit it rather than guessing.';

  return kind === 'diagram_image'
    ? `You are reading a process diagram image as EVIDENCE. ${shared} Report node and edge labels ` +
        'as separate regions. Do not infer the process structure or the meaning of the diagram.'
    : `You are reading a screenshot as EVIDENCE. ${shared}`;
}

/**
 * Build a vision extractor over the AI broker.
 *
 * Refusals are returned, not thrown, for every case the approved rules make
 * legitimate: classification forbids egress, no provider has vision, or the
 * project is on-premise only. Each carries named degradations and concrete
 * options, per data-governance.md §3.1 — the caller is told what it could do
 * instead, rather than just that something failed.
 */
export function createBrokerVisionExtractor(
  deps: (input: VisionInput) => BrokerVisionDeps,
): VisionExtractor {
  return {
    id: VISION_EXTRACTOR_VERSION,
    supports: (mediaType) => SUPPORTED.has(mediaType),

    async extract(input: VisionInput): Promise<VisionOutcome> {
      const d = deps(input);
      const dataRef = await d.stageImage(input);

      const outcome = await invoke(d.broker, {
        projectId: '',
        taskType: 'EXTRACT_EVIDENCE',
        taskVersion: '1',
        promptVersion: `vision-regions@1`,
        systemInstruction: instructionFor(input.kind),
        content: [
          {
            kind: 'image',
            mediaType: input.mediaType,
            dataRef,
            classification: d.classification,
          },
        ],
        project: {
          allowExternalProviders: d.project.allowExternalProviders,
          classificationCeiling: d.project.classificationCeiling,
        },
        ...(input.languageHints === undefined ? {} : { languageHints: [...input.languageHints] }),
        mode: d.mode,
        sourceId: input.sourceId,
        outputSchema: VisionResult,
      });

      if (outcome.kind === 'refused') {
        return {
          kind: 'refused',
          reason: outcome.detail,
          degradations: (outcome.routing.plan?.degradations ?? []).map(String),
          options: [...outcome.options],
        };
      }

      // The broker returns a PROPOSAL, never domain state (ADR-0004). Parsing it
      // against the schema here is what stops a malformed model response becoming
      // a malformed unit: a region without a rectangle is not evidence.
      const parsed = VisionResult.safeParse(outcome.proposal.payload);
      if (!parsed.success) {
        return {
          kind: 'refused',
          reason:
            'the vision response did not match the required region schema, so no region could be ' +
            `anchored: ${parsed.error.message.slice(0, 300)}`,
          degradations: ['prompt_repair_loop'],
          options: [
            'retry the extraction',
            'describe the image content manually as free-text evidence',
          ],
        };
      }

      return {
        kind: 'extracted',
        result: parsed.data,
        interactionId: outcome.interaction.id,
      };
    },
  };
}
