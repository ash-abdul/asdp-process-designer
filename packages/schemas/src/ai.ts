/**
 * AI provider contracts.
 *
 * ADR-0020: no component outside the provider layer may reference a vendor SDK,
 * model identifier or vendor-specific request shape. Every concept below is
 * deliberately neutral — see ai-provider-abstraction.md §3.1 for what each
 * replaces and why.
 */

import { z } from 'zod';
import { Bcp47, Classification, EntityId } from './primitives.ts';

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

  // --- added in V4a -------------------------------------------------------
  /**
   * Capabilities the selected provider actually offered for this task.
   *
   * Recorded rather than derived from the provider id, because a descriptor
   * changes when a provider is reconfigured and an interaction is immutable
   * history. "Which capabilities did this answer rest on?" must be answerable
   * from the record alone (ADR-0022).
   */
  capabilitiesUsed: z.array(Capability).default([]),
  /**
   * The egress decision this call was permitted under.
   *
   * `refused` interactions are not recorded here — a refusal produces no
   * interaction — so this is `permitted` in practice. It is stored anyway
   * because a disclosure report that has to *infer* that egress was evaluated
   * is not an audit ([ADR-0021](../../../docs/adr/ADR-0021-data-classification-egress-policy.md)).
   */
  egressDecision: z.enum(['permitted', 'refused']).default('permitted'),
  /** Why, when a decision needs explaining — a ceiling, a deployment class. */
  egressReason: z.string().optional(),
  /**
   * Whether the provider saw the whole source or a chunk of it (**E4**).
   *
   * `full` is not a safe default to assume, which is why it is stored: a chunked
   * extraction that reads as full is exactly the silent degradation E4 forbids.
   */
  contextMode: z.enum(['full', 'chunked']).default('full'),
  /** Chunk count when `contextMode` is `chunked`. */
  chunkCount: z.number().int().positive().optional(),
  /**
   * Which part of the source this call saw, as code-point ranges (**E4** rule 3).
   *
   * Retained so a proposal derived from chunk 3 of 7 can be traced to the text
   * that produced it rather than to the whole document.
   */
  chunkRanges: z
    .array(z.object({ chunkId: z.string(), charStart: z.number().int().nonnegative(), charEnd: z.number().int().nonnegative() }))
    .default([]),
  /**
   * The request correlation id, so one interaction joins the HTTP call, the audit
   * events and the logs that surround it.
   */
  correlationId: z.string().optional(),
  /** The deterministic chunking strategy version, when one was applied (**E4** rule 1). */
  chunkStrategyVersion: z.string().optional(),
});
export type AiInteraction = z.infer<typeof AiInteraction>;

// ---------------------------------------------------------------------------
// PROFILE_SOURCE output contract (V4a)
// ---------------------------------------------------------------------------

/**
 * What a `PROFILE_SOURCE` pass may report.
 *
 * **Commentary about a document, never a claim about requirements.** The schema
 * is deliberately narrow, because the schema is the boundary: a field for
 * "obligations found" or "process steps" would invite exactly the substantive
 * claim V4a excludes, and a model will fill any field it is given.
 *
 * Nothing here becomes evidence, populates a RAF slot, or supports a
 * requirement. A profile answers "what kind of document is this, and what does it
 * appear to contain" — which is the cheapest, lowest-consequence question in the
 * task vocabulary, and therefore the right one to prove the chain with.
 */
export const SourceProfile = z.object({
  /**
   * The business role the document appears to play.
   *
   * A HINT, never a commitment: the source's `kind` is set by the human who
   * uploaded it, and this never overwrites it.
   */
  documentKind: z.enum(['brd', 'sop', 'policy', 'form', 'diagram', 'correspondence', 'other', 'unclear']),
  /** BCP-47 tags the model observed, in order of prominence. */
  languages: z.array(Bcp47).default([]),
  /** Structural features observed. Presence only — never their content. */
  observed: z
    .object({
      hasNumberedSections: z.boolean().default(false),
      hasTables: z.boolean().default(false),
      hasDecisionLogic: z.boolean().default(false),
      hasFormFields: z.boolean().default(false),
      hasProcessNarrative: z.boolean().default(false),
    })
    .default({
      hasNumberedSections: false,
      hasTables: false,
      hasDecisionLogic: false,
      hasFormFields: false,
      hasProcessNarrative: false,
    }),
  /** Section headings as they appear, verbatim. Navigation, not analysis. */
  sectionHeadings: z.array(z.string()).max(200).default([]),
  /** One or two sentences on what the document is. No requirement claims. */
  summary: z.string().max(1000),
  /** What the model could not read or was unsure about. Never silent. */
  limitations: z.array(z.string()).default([]),
});
export type SourceProfile = z.infer<typeof SourceProfile>;

// ---------------------------------------------------------------------------
// EXTRACT_EVIDENCE output contract (V4b-core)
// ---------------------------------------------------------------------------

/**
 * One candidate evidence item, as a provider returns it.
 *
 * **A quote and a locating hint — never an offset.** The AI never computes an
 * offset (provenance-and-anchoring.md §4): we locate the quote ourselves and mint
 * the anchor, so a model that misremembers a position cannot produce a confident
 * citation to the wrong place.
 *
 * The hint's job is to **disambiguate a repeated quote**, and only a hint that a
 * parser can resolve against stored structure counts — §4.4. `unitId` is the
 * strongest, because it names something the ingestion adapter created.
 */
export const EvidenceCandidate = z.object({
  /** Verbatim, as it appears in the source. Located, then verified. */
  quote: z.string().min(1),
  /**
   * Where the model says this came from. Presence licenses nothing (§4.4).
   *
   * `unitId` must be one of the unit ids supplied in the prompt; anything else is
   * treated as absent rather than trusted.
   */
  locator: z
    .object({
      unitId: z.string().optional(),
      section: z.string().optional(),
      heading: z.string().optional(),
      page: z.number().int().positive().optional(),
    })
    .optional(),
  /** RAF slot this may be a candidate for. A hint, never a commitment. */
  rafSlotHint: z.string().max(120).optional(),
  /** Model self-rating. Weighted low and never the band by itself (ADR-0011). */
  modelSelfRating: z.number().min(0).max(1).optional(),
});
export type EvidenceCandidate = z.infer<typeof EvidenceCandidate>;

/**
 * The `EXTRACT_EVIDENCE` result.
 *
 * Deliberately a flat list of quotes. There is no field for an obligation, a
 * rule, a process step or a decision, because V4b extracts **evidence**, and
 * turning evidence into a requirement is V5's work behind a human gate — a schema
 * that offered those fields would be filled in, and the boundary would be gone.
 */
export const EvidenceExtraction = z.object({
  items: z.array(EvidenceCandidate).default([]),
  /** What the model could not read, or chose not to report. Never silent. */
  limitations: z.array(z.string()).default([]),
});
export type EvidenceExtraction = z.infer<typeof EvidenceExtraction>;

// ---------------------------------------------------------------------------
// POPULATE_FRAME output contract (V5)
// ---------------------------------------------------------------------------

/**
 * One proposed requirement, as the model returns it.
 *
 * **Four fields, and the absences are the design** (**J8**). There is no field for
 * an anchor, a quote, an offset, an epistemic level, a derivation, a confidence, a
 * conflict, a question, a priority or an acceptance criterion — because a model
 * fills whatever fields it is given, and every one of those is owned by code.
 *
 * `evidenceItemIds` is what makes this a proposal rather than an assertion: the
 * model must say what it is reading from, using only ids it was shown, and a
 * proposal citing nothing is rejected as the L3 inference it is (**J1**).
 */
export const RequirementProposal = z.object({
  /** One of the slots this pass offered. Legality is re-checked by code (**J8**). */
  slot: z.string().min(1),
  /** The proposition, in the language of its evidence. */
  text: z.string().min(1),
  category: z.enum([
    'functional',
    'business_rule',
    'data',
    'integration',
    'nfr',
    'security',
    'constraint',
    'assumption',
    'dependency',
    'sla',
    'notification',
    'role',
  ]),
  /** Ids from THIS batch. At least one, or the proposal is refused. */
  evidenceItemIds: z.array(z.string()).default([]),
  /** Model self-rating. Weighted low and never the band by itself (ADR-0011). */
  modelSelfRating: z.number().min(0).max(1).optional(),
});
export type RequirementProposal = z.infer<typeof RequirementProposal>;

/**
 * The `POPULATE_FRAME` result for one pass over one evidence batch.
 *
 * `limitations` is where "I cannot tell from this evidence" goes (**J1**). It is
 * recorded on the pass result and the audit event and becomes no domain state,
 * because it is a statement about the reading rather than about the business — and
 * because a model that must choose between guessing and staying silent should have
 * somewhere to be silent.
 */
export const FramePopulation = z.object({
  items: z.array(RequirementProposal).default([]),
  limitations: z.array(z.string()).default([]),
});
export type FramePopulation = z.infer<typeof FramePopulation>;
