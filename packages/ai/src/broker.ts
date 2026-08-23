/**
 * The Proposal Broker — the single choke point.
 *
 * ADR-0004 (invariant I1): the AI layer has NO WRITE AUTHORITY. Every output is
 * materialised as a Proposal; a proposal becomes domain state solely through an
 * explicit human-initiated command executed by deterministic code elsewhere.
 *
 * This module cannot import @asdp/domain — the architecture checker fails the
 * build if it tries. That is what makes the guarantee structural rather than
 * cultural.
 *
 * ADR-0021 (invariant I9): no content reaches a provider without passing the
 * egress gate. There is no other path.
 */

import type {
  AiInteraction,
  AiRequest,
  AiResponse,
  AiTaskType,
  Capability,
  ContentPart,
  Proposal,
} from '@asdp/schemas';
import { classifyContent, type EgressPolicy, type ProjectEgressSettings } from './egress.ts';
import { route, type RoutingConfig, type RoutingRecord } from './routing.ts';
import { TaskRefusedError, type AiProvider } from './port.ts';
import { requiredCapabilitiesFor, taskSpec } from './tasks.ts';

export interface BrokerDeps {
  readonly providers: readonly AiProvider[];
  readonly policy: EgressPolicy;
  readonly routing: RoutingConfig;
  readonly clock: { nowIso(): string };
  readonly ids: { next(prefix: string): string };
  /** Persisted by the caller; the broker only produces the record. */
  readonly recordInteraction: (interaction: AiInteraction) => Promise<void>;
}

export interface BrokerInvocation {
  readonly projectId: string;
  readonly taskType: AiTaskType;
  readonly taskVersion: string;
  readonly promptVersion: string;
  readonly systemInstruction: string;
  readonly content: readonly ContentPart[];
  readonly project: ProjectEgressSettings;
  readonly languageHints?: readonly string[];
  readonly outputSchema?: unknown;
  /**
   * Whether the transport will actually call a provider, or replay a recording.
   *
   * Supplied by the caller because the broker cannot observe it. Defaults to
   * `replay`, which is the safe default: over-reporting a live call is harmless,
   * under-reporting one hides egress (**A7**).
   */
  readonly mode?: 'live' | 'replay';
  /** The source being read, when one is being read. */
  readonly sourceId?: string;

  // --- V4a ----------------------------------------------------------------
  /** Joins this interaction to the HTTP request and audit events around it. */
  readonly correlationId?: string;
  /**
   * Whether the caller assembled the whole source or a chunk of it (**E4**).
   *
   * Supplied by the caller because context assembly is the caller's act. It
   * defaults to `full`, and a caller that chunks without saying so is the silent
   * degradation E4 exists to forbid.
   */
  readonly contextMode?: 'full' | 'chunked';
  readonly chunkCount?: number;
  readonly chunkRanges?: readonly {
    readonly chunkId: string;
    readonly charStart: number;
    readonly charEnd: number;
  }[];
  readonly chunkStrategyVersion?: string;
}

export type BrokerOutcome =
  | {
      readonly kind: 'proposal';
      readonly proposal: Proposal;
      readonly interaction: AiInteraction;
      readonly routing: RoutingRecord;
    }
  | {
      readonly kind: 'refused';
      readonly routing: RoutingRecord;
      readonly detail: string;
      /** Concrete options for the user, per data-governance.md §3.1. */
      readonly options: readonly string[];
    };

/**
 * The nine-step flow from ai-provider-abstraction.md §2, in order.
 *
 * Every step is recorded, so "what exactly was sent outside, and why?" is
 * answerable from the interaction record alone.
 */
export async function invoke(deps: BrokerDeps, call: BrokerInvocation): Promise<BrokerOutcome> {
  // 1–4: classify, egress gate, capability filter, routing decision.
  const descriptors = deps.providers.map((p) => p.descriptor());
  const outcome = route(
    call.taskType,
    call.content,
    descriptors,
    deps.policy,
    call.project,
    deps.routing,
    call.languageHints ?? [],
  );

  if (outcome.kind === 'refused') {
    return {
      kind: 'refused',
      routing: outcome.record,
      detail: outcome.detail,
      options: refusalOptions(outcome.record, outcome.detail),
    };
  }

  const record = outcome.record;
  const provider = deps.providers.find((p) => p.id === record.selectedProvider);
  if (provider === undefined || record.selectedModel === undefined) {
    throw new TaskRefusedError(
      `router selected an unknown provider '${String(record.selectedProvider)}'`,
      call.taskType,
      'no_provider',
    );
  }

  // 5–6: degradation plan (already computed by the router) and context assembly.
  const plan = record.plan;
  const request: AiRequest = {
    taskType: call.taskType,
    taskVersion: call.taskVersion,
    systemInstruction: call.systemInstruction,
    content: [...call.content],
    outputContract: {
      mode: plan !== undefined && plan.repairAttempts > 0 ? 'text' : 'schema',
      schema: call.outputSchema,
    },
    // Citations are NEVER dropped: absent native support, we require quotes and
    // locate them ourselves (ADR-0022).
    citationMode: plan?.degradations.includes('post_hoc_citations') === true ? 'post_hoc' : 'native',
    determinism: 'deterministic',
    reasoningTier: 'standard',
    languageHints: [...(call.languageHints ?? [])],
  };

  // 7: invoke through the port.
  const started = deps.clock.nowIso();
  let response: AiResponse;
  try {
    response = await provider.invoke(request, record.selectedModel);
  } catch (err) {
    // A provider failure is visible, never a silent fallback to a
    // lower-capability provider (architecture-overview.md §5).
    const message = err instanceof Error ? err.message : String(err);
    return {
      kind: 'refused',
      routing: record,
      detail: `provider '${provider.id}' failed: ${message}`,
      options: [
        'retry the pass',
        'select a different provider in the routing configuration',
        'proceed with deterministic parsing and manual analysis',
      ],
    };
  }

  // 8–9: record the interaction and emit a PROPOSAL. Never domain state.
  const interaction: AiInteraction = {
    id: deps.ids.next('ai'),
    projectId: call.projectId,
    at: started,
    taskType: call.taskType,
    taskVersion: call.taskVersion,
    promptVersion: call.promptVersion,
    providerId: provider.id,
    modelId: record.selectedModel,
    // The broker does not know whether the transport was live or a replay — the
    // adapter does. It reports what the invocation told it, defaulting to
    // `replay` because that is the safe assumption: over-reporting a live call
    // is harmless, under-reporting one hides egress (A7).
    mode: call.mode ?? 'replay',
    ...(call.sourceId === undefined ? {} : { sourceId: call.sourceId }),
    deploymentClass: provider.descriptor().deploymentClass,
    capabilityTier: record.capabilityTier,
    routing: {
      contentClassification: record.classification,
      eligibleProviders: [...record.eligibleProviders],
      rejectedProviders: record.rejectedProviders.map((r) => ({
        providerId: r.providerId,
        reason: r.reason,
      })),
      selectedProvider: provider.id,
      degradations: [...(plan?.degradations ?? [])],
    },
    usage: response.usage,
    humanVerdict: 'pending',

    // --- V4a: what this answer actually rested on ------------------------
    //
    // Recorded rather than derivable. A provider descriptor changes when a
    // provider is reconfigured, and an interaction is immutable history — so
    // "which capabilities did this answer use?" has to be answered from the row.
    capabilitiesUsed: capabilitiesUsedFor(
      call,
      // Capabilities belong to the MODEL, not the provider: two models behind one
      // provider can differ on vision or context size, and the record must name
      // what the model that answered could do.
      provider.descriptor().models.find((m) => m.modelId === record.selectedModel)?.capabilities ?? [],
    ),
    // Reaching this line means the egress gate permitted the call: a refusal
    // returns above, before any provider is contacted. Stored anyway, because a
    // disclosure report that must INFER that egress was evaluated is not an audit.
    egressDecision: 'permitted',
    egressReason:
      `classification ${record.classification} permitted to a ` +
      `${provider.descriptor().deploymentClass} provider`,
    // E4: full is not a safe assumption, so it is stated. Chunking itself is V4b;
    // an over-context source is refused by name until then, never truncated.
    contextMode: call.contextMode ?? 'full',
    ...(call.chunkCount === undefined ? {} : { chunkCount: call.chunkCount }),
    chunkRanges: [...(call.chunkRanges ?? [])],
    ...(call.chunkStrategyVersion === undefined
      ? {}
      : { chunkStrategyVersion: call.chunkStrategyVersion }),
    ...(call.correlationId === undefined ? {} : { correlationId: call.correlationId }),
  };

  const proposal: Proposal = {
    id: deps.ids.next('prop'),
    projectId: call.projectId,
    taskType: call.taskType,
    payload: response.outputs,
    rationale: `produced by ${provider.id}/${record.selectedModel}`,
    citedEvidenceIds: [],
    confidenceSignals: {
      capabilityTier: record.capabilityTier,
      degradations: plan?.degradations ?? [],
      citationMode: request.citationMode,
      citationCount: response.citations.length,
    },
    status: 'pending',
    aiInteractionId: interaction.id,
    createdAt: started,
  };

  const withProposal: AiInteraction = { ...interaction, proposalId: proposal.id };
  await deps.recordInteraction(withProposal);

  return { kind: 'proposal', proposal, interaction: withProposal, routing: record };
}

/**
 * Capabilities this call actually rested on.
 *
 * The intersection of what the task asked for — required plus preferred — with
 * what the selected provider declares. Not the provider's whole capability list:
 * that would record what the provider *can* do rather than what this answer
 * *used*, and the disclosure report needs the second.
 */
function capabilitiesUsedFor(
  call: BrokerInvocation,
  declared: readonly Capability[],
): Capability[] {
  const spec = taskSpec(call.taskType);
  const hasVisual = call.content.some((c) => c.kind === 'image');
  const wanted = new Set<Capability>([
    ...requiredCapabilitiesFor(call.taskType, hasVisual),
    ...spec.preferred,
  ]);
  return declared.filter((c) => wanted.has(c));
}

/** Concrete options offered on refusal, rather than a bare error. */
function refusalOptions(record: RoutingRecord, detail: string): readonly string[] {
  const options: string[] = [];
  if (record.classification === 'PROHIBITED') {
    options.push('process this source with deterministic parsing only; no AI analysis is permitted');
    return options;
  }
  if (/vision/i.test(detail)) {
    options.push('supply a manual transcription of the image');
    options.push('enable a vision-capable provider for this project');
    return options;
  }
  options.push('route this task to an on-premise provider');
  options.push('redact the content and retry');
  options.push('reclassify the source with justification (requires authorisation)');
  options.push('proceed with deterministic parsing and manual analysis');
  return options;
}

/** Classification of a prospective payload, for pre-flight display. */
export function previewClassification(content: readonly ContentPart[]): string {
  return classifyContent(content);
}
