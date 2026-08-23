/**
 * AI provider contracts.
 *
 * ADR-0020: no component outside the provider layer may reference a vendor SDK,
 * model identifier or vendor-specific request shape. Every concept below is
 * deliberately neutral — see ai-provider-abstraction.md §3.1 for what each
 * replaces and why.
 */

import { z } from 'zod';
import { Classification, EntityId } from './primitives.ts';

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

/** The provider-agnostic task registry (ai-provider-abstraction.md §2). */
export const AiTaskType = z.enum([
  'PROFILE_SOURCE',
  'EXTRACT_EVIDENCE',
  'CANONICALISE_ENTITIES',
  'POPULATE_FRAME',
  'RECONCILE_SOURCES',
  'ANALYSE_QUALITY',
  'SYNTHESISE_QUESTIONS',
  'DECOMPOSE_PROCESS',
  'PROPOSE_DECISION_SPEC',
  'PROPOSE_FORM_SPEC',
  'PROPOSE_INTERFACE_SPEC',
  'REFINE_IR',
  'PROPOSE_TEST_DATA',
  'TRANSLATE_TEXT',
  'EXPLAIN_ELEMENT',
  'NARRATE_IMPACT',
  'NARRATE_DIVERGENCE',
  'DRAFT_DOCUMENTATION',
]);
export type AiTaskType = z.infer<typeof AiTaskType>;

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

export const Capability = z.enum([
  'vision',
  'documentInput',
  'nativeCitations',
  'schemaConstrainedOutput',
  'toolCalling',
  'strictToolSchemas',
  'promptCaching',
  'batchProcessing',
  'streaming',
  'deepReasoning',
  'largeContext',
]);
export type Capability = z.infer<typeof Capability>;

export const QualityTier = z.enum(['A', 'B', 'C', 'unknown']);
export type QualityTier = z.infer<typeof QualityTier>;

/** Where the provider runs. The primary routing discriminator (ADR-0021). */
export const DeploymentClass = z.enum(['external_hosted', 'vpc', 'on_premise']);
export type DeploymentClass = z.infer<typeof DeploymentClass>;

export const ModelDescriptor = z.object({
  modelId: z.string(),
  displayName: z.string(),
  /** Usable input budget, in provider-native units. */
  contextUnits: z.number().int().positive(),
  maxOutputUnits: z.number().int().positive(),
  capabilities: z.array(Capability).default([]),
  costModel: z.object({
    inputUnitCost: z.number().nonnegative(),
    cachedInputUnitCost: z.number().nonnegative(),
    outputUnitCost: z.number().nonnegative(),
    currency: z.string().default('USD'),
  }),
  /** MEASURED by our own harness, never taken from vendor claims. */
  qualityTierByLanguage: z.record(z.string(), QualityTier).default({}),
});
export type ModelDescriptor = z.infer<typeof ModelDescriptor>;

export const ProviderDescriptor = z.object({
  providerId: z.string().min(1),
  displayName: z.string(),
  deploymentClass: DeploymentClass,
  models: z.array(ModelDescriptor).min(1),
  dataHandling: z.object({
    retentionDays: z.number().int().nonnegative(),
    trainingOptOut: z.boolean(),
    residencyRegion: z.string().default('unknown'),
  }),
  enabled: z.boolean().default(true),
});
export type ProviderDescriptor = z.infer<typeof ProviderDescriptor>;

// ---------------------------------------------------------------------------
// Requests and responses — provider-neutral
// ---------------------------------------------------------------------------

/** Neutral, because vendors differ in name, shape and availability. */
export const ReasoningTier = z.enum(['minimal', 'standard', 'deep']);
export const DeterminismTier = z.enum(['deterministic', 'balanced', 'creative']);
export const CitationMode = z.enum(['none', 'native', 'post_hoc']);
export const OutputMode = z.enum(['schema', 'tool', 'text']);

export const ContentPart = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: z.string(), classification: Classification }),
  z.object({
    kind: z.literal('image'),
    mediaType: z.string(),
    dataRef: z.string(),
    classification: Classification,
  }),
  z.object({
    kind: z.literal('document'),
    mediaType: z.string(),
    dataRef: z.string(),
    classification: Classification,
  }),
]);
export type ContentPart = z.infer<typeof ContentPart>;

export const AiRequest = z.object({
  taskType: AiTaskType,
  taskVersion: z.string(),
  systemInstruction: z.string(),
  content: z.array(ContentPart).min(1),
  outputContract: z.object({
    mode: OutputMode,
    /** JSON Schema derived from a Zod schema. */
    schema: z.unknown().optional(),
  }),
  citationMode: CitationMode.default('none'),
  determinism: DeterminismTier.default('deterministic'),
  reasoningTier: ReasoningTier.default('standard'),
  budget: z
    .object({
      maxOutputUnits: z.number().int().positive(),
      maxLatencyMs: z.number().int().positive(),
    })
    .optional(),
  cacheHints: z.object({ stablePrefixBoundary: z.number().int().nonnegative().optional() }).optional(),
  languageHints: z.array(z.string()).default([]),
});
export type AiRequest = z.infer<typeof AiRequest>;

/** What we did when a preferred capability was unavailable (ADR-0022). */
export const Degradation = z.enum([
  'post_hoc_citations',
  'chunked_context',
  'prompt_repair_loop',
  'no_caching',
  'pre_extracted_document',
  'decomposed_reasoning',
]);
export type Degradation = z.infer<typeof Degradation>;

export const AiUsage = z.object({
  inputUnits: z.number().int().nonnegative(),
  cachedInputUnits: z.number().int().nonnegative().default(0),
  outputUnits: z.number().int().nonnegative(),
  costEstimate: z.number().nonnegative().default(0),
  latencyMs: z.number().int().nonnegative().default(0),
});
export type AiUsage = z.infer<typeof AiUsage>;

export const AiResponse = z.object({
  outputs: z.array(z.unknown()),
  citations: z
    .array(z.object({ quote: z.string(), sourceRef: z.string(), hintPage: z.number().int().optional() }))
    .default([]),
  usage: AiUsage,
  providerMeta: z.object({
    providerId: z.string(),
    modelId: z.string(),
    capabilityTier: QualityTier.default('unknown'),
    requestId: z.string().optional(),
  }),
  degradations: z.array(Degradation).default([]),
});
export type AiResponse = z.infer<typeof AiResponse>;

// ---------------------------------------------------------------------------
// Proposals (ADR-0004)
// ---------------------------------------------------------------------------

/**
 * The AI layer's ONLY output. A proposal becomes domain state solely through an
 * explicit human-initiated command executed by deterministic code.
 */
export const ProposalStatus = z.enum(['pending', 'accepted', 'edited', 'rejected', 'superseded']);

export const Proposal = z.object({
  id: EntityId,
  projectId: EntityId,
  taskType: AiTaskType,
  payload: z.unknown(),
  rationale: z.string(),
  citedEvidenceIds: z.array(EntityId).default([]),
  confidenceSignals: z.record(z.string(), z.unknown()).default({}),
  status: ProposalStatus.default('pending'),
  reviewedBy: EntityId.optional(),
  reviewedAt: z.string().optional(),
  aiInteractionId: EntityId,
  createdAt: z.string(),
});
export type Proposal = z.infer<typeof Proposal>;

/** Full audit record for every AI call, written by the broker (invariant I8). */
export const AiInteraction = z.object({
  id: EntityId,
  projectId: EntityId,
  at: z.string(),
  taskType: AiTaskType,
  taskVersion: z.string(),
  promptVersion: z.string(),
  providerId: z.string(),
  modelId: z.string(),
  deploymentClass: DeploymentClass,
  capabilityTier: QualityTier,
  routing: z.object({
    contentClassification: Classification,
    eligibleProviders: z.array(z.string()),
    rejectedProviders: z.array(z.object({ providerId: z.string(), reason: z.string() })),
    selectedProvider: z.string(),
    degradations: z.array(Degradation),
  }),
  redaction: z
    .object({ applied: z.boolean(), detectorIds: z.array(z.string()), spanCount: z.number().int() })
    .optional(),
  usage: AiUsage,
  proposalId: EntityId.optional(),
  humanVerdict: z.enum(['accepted', 'edited', 'rejected', 'pending']).default('pending'),

  // --- added in V3 --------------------------------------------------------
  /**
   * Whether the provider was actually called, or a recording was replayed.
   *
   * **A7** requires normal CI to be entirely `replay`, so this is what makes that
   * auditable rather than asserted. A recording replayed is still an AI
   * interaction for disclosure purposes — the content still rests on a model's
   * reading — so it is recorded, not skipped.
   */
  mode: z.enum(['live', 'replay']).default('replay'),
  /** The source this interaction read, when it read one. */
  sourceId: EntityId.optional(),
});
export type AiInteraction = z.infer<typeof AiInteraction>;
