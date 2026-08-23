/**
 * AI analysis commands (V4a).
 *
 * ADR-0034 N4: RBAC, audit and transactions live here, and this file imports no
 * framework package and no provider. The AI layer is reached through the
 * `SourceProfiler` port, so this module cannot know which provider answered — and
 * cannot be tempted to care.
 *
 * The order matters, and it is the same shape as intake's:
 *
 *   authorise   → the role may spend money and may cause egress
 *   load        → the source and its canonical text
 *   ASK         → through the port: classify, gate, negotiate, route, invoke
 *   RECORD      → the interaction, inside this unit of work
 *   audit       → what was sent outside, and why
 *
 * **The result is a PROPOSAL, never domain state** ([ADR-0004](../../../../docs/adr/ADR-0004-ai-proposes-code-commits.md)).
 * A profile does not become a requirement, a RAF item, evidence, or a BPS
 * element, and there is no code path by which it could: nothing here writes to
 * any of those tables, and `SourceProfile` has no field that would populate one.
 * That is decision **E3** made structural rather than remembered.
 */

import { planChunks, type Chunk } from '@asdp/ai';
import type { AiInteraction, EvidenceItem, SourceProfile } from '@asdp/schemas';
import { textOffsetsOf } from '@asdp/provenance';
import type { Actor, CommandContext } from '../commands.ts';
import { assertRole, ValidationError } from '../commands.ts';
import type { EvidenceExtractor, SourceProfiler, UnitOfWork } from '../ports.ts';
import {
  gateCandidate,
  scopesFor,
  unitForAnchor,
  type GateOutcome,
  type RejectionReason,
} from '../ai/extraction-gate.ts';

export interface AnalysisContext extends CommandContext {
  readonly uow: UnitOfWork;
  /**
   * The `PROFILE_SOURCE` port.
   *
   * Injected, so the composition root decides whether a provider exists at all
   * and whether it is live or replaying. Nothing in this module can reach a
   * network.
   */
  readonly profiler: SourceProfiler;
  /**
   * The `EXTRACT_EVIDENCE` port (V4b-core).
   *
   * Injected for the same reason the profiler is: the composition root decides
   * whether a provider exists and whether it is live or replaying, and nothing in
   * this module can reach a network.
   */
  readonly extractor: EvidenceExtractor;
  /**
   * Character budget for a single extraction call (**F4**).
   *
   * A property of the wired model's context window, so it is configuration rather
   * than a constant here.
   */
  readonly extractionChunkChars: number;
  readonly extractionOverlapChars: number;
}

export interface ProfileSourceInput {
  readonly projectId: string;
  readonly sourceId: string;
}

/** What the caller gets back. A proposal and its audit trail — nothing more. */
export type ProfileSourceResult =
  | {
      readonly kind: 'profiled';
      readonly profile: SourceProfile;
      readonly interactionId: string;
      readonly mode: 'live' | 'replay';
      readonly providerId: string;
      readonly modelId: string;
      readonly degradations: readonly string[];
      readonly capabilitiesUsed: readonly string[];
    }
  | {
      readonly kind: 'refused';
      readonly reason: string;
      readonly degradations: readonly string[];
      readonly options: readonly string[];
      /** Present when a provider was reached; the call is still recorded. */
      readonly interactionId?: string;
    };

/**
 * Profile a source — `PROFILE_SOURCE`.
 *
 * A refusal is a normal outcome, not an exception: the egress gate may forbid the
 * call, no eligible provider may exist, the source may be over the single-call
 * context limit (**E4** — chunking is V4b), or a response may be unusable. Each
 * comes back with named degradations and concrete options.
 *
 * **A refused call that still reached a provider is still recorded.** Under-recording
 * an interaction would hide egress, which is the one direction this must never
 * fail in (invariant I8).
 */
export async function profileSource(
  ctx: AnalysisContext,
  actor: Actor,
  input: ProfileSourceInput,
): Promise<ProfileSourceResult> {
  assertRole(actor, 'profileSource');

  const source = await ctx.repos.sources.get(input.sourceId);
  if (source === undefined) throw new ValidationError(`unknown source ${input.sourceId}`);
  if (source.projectId !== input.projectId) {
    throw new ValidationError(
      `source ${input.sourceId} does not belong to project ${input.projectId}`,
    );
  }
  if (source.status === 'parse_failed') {
    throw new ValidationError(
      `source ${input.sourceId} failed to parse, so there is no text to profile`,
    );
  }

  const text = await ctx.repos.sources.getText(input.sourceId);
  if (text === undefined) {
    throw new ValidationError(`source ${input.sourceId} has no stored text`);
  }

  const outcome = await ctx.profiler.profile({
    projectId: input.projectId,
    sourceId: input.sourceId,
    text,
    classification: source.classification,
    // The source's detected language, so the pass is not read as English by
    // default. `und` is passed through rather than guessed at.
    languageHints: [source.primaryLanguage],
    correlationId: ctx.correlationId,
  });

  // Present on both outcomes: a refusal that reached a provider is still recorded,
  // because under-recording an interaction hides egress (invariant I8).
  const interaction: AiInteraction | undefined = outcome.interaction;

  return ctx.uow.run(async (repos) => {
    if (interaction !== undefined) {
      await repos.aiInteractions.insert(interaction);
    }

    await repos.audit.append({
      id: ctx.ids.next('aud'),
      at: ctx.clock.nowIso(),
      actor: actor.subject,
      rolesAtTime: [...actor.roles],
      tokenIssuer: actor.tokenIssuer,
      correlationId: ctx.correlationId,
      projectId: input.projectId,
      action: outcome.kind === 'profiled' ? 'source.profiled' : 'source.profileRefused',
      entityType: 'Source',
      entityId: input.sourceId,
      after: auditPayload(input.sourceId, outcome.kind, interaction, outcome),
    });

    if (outcome.kind === 'refused') {
      return {
        kind: 'refused' as const,
        reason: outcome.reason,
        degradations: outcome.degradations,
        options: outcome.options,
        ...(interaction === undefined ? {} : { interactionId: interaction.id }),
      };
    }

    return {
      kind: 'profiled' as const,
      profile: outcome.profile,
      interactionId: outcome.interaction.id,
      mode: outcome.interaction.mode,
      providerId: outcome.interaction.providerId,
      modelId: outcome.interaction.modelId,
      degradations: [...outcome.interaction.routing.degradations],
      capabilitiesUsed: [...outcome.interaction.capabilitiesUsed],
    };
  });
}

/**
 * The audit payload.
 *
 * Deliberately answers the AI-disclosure question directly — what left, to whom,
 * under what classification, with what degradation and at what cost — rather than
 * leaving a reader to join it against the interaction table. The interaction row
 * is the record; the audit event is the trail that leads to it.
 */
function auditPayload(
  sourceId: string,
  kind: 'profiled' | 'refused',
  interaction: AiInteraction | undefined,
  outcome: { readonly kind: string; readonly reason?: string },
): Record<string, unknown> {
  if (interaction === undefined) {
    return {
      sourceId,
      outcome: kind,
      // No interaction means no provider was reached — the gate or the context
      // limit refused before any egress. Worth stating, not inferring.
      providerReached: false,
      reason: outcome.reason,
    };
  }
  return {
    sourceId,
    outcome: kind,
    providerReached: true,
    aiInteractionId: interaction.id,
    taskType: interaction.taskType,
    promptVersion: interaction.promptVersion,
    providerId: interaction.providerId,
    modelId: interaction.modelId,
    deploymentClass: interaction.deploymentClass,
    mode: interaction.mode,
    contentClassification: interaction.routing.contentClassification,
    egressDecision: interaction.egressDecision,
    capabilitiesUsed: interaction.capabilitiesUsed,
    degradations: interaction.routing.degradations,
    contextMode: interaction.contextMode,
    costEstimate: interaction.usage.costEstimate,
    ...(outcome.reason === undefined ? {} : { reason: outcome.reason }),
  };
}

// ---------------------------------------------------------------------------
// Reading the interaction log
// ---------------------------------------------------------------------------

export interface ListAiInteractionsInput {
  readonly projectId: string;
  readonly sourceId?: string;
}

/**
 * The AI-disclosure log.
 *
 * Read-only and deliberately wide in its permitted roles: "what was sent outside
 * the enterprise, and why?" is a compliance question, and an audit a reviewer
 * cannot read is not an audit.
 */
export async function listAiInteractions(
  ctx: CommandContext,
  actor: Actor,
  input: ListAiInteractionsInput,
): Promise<readonly AiInteraction[]> {
  assertRole(actor, 'listAiInteractions');

  const project = await ctx.repos.projects.get(input.projectId);
  if (project === undefined) throw new ValidationError(`unknown project ${input.projectId}`);

  if (input.sourceId !== undefined) {
    const forSource = await ctx.repos.aiInteractions.listForSource(input.sourceId);
    // Filtered rather than trusted: a source id from a caller must not be able to
    // read another project's interactions.
    return forSource.filter((i) => i.projectId === input.projectId);
  }
  return ctx.repos.aiInteractions.listForProject(input.projectId);
}

// ---------------------------------------------------------------------------
// EXTRACT_EVIDENCE — V4b-core
// ---------------------------------------------------------------------------

export interface ExtractEvidenceInput {
  readonly projectId: string;
  readonly sourceId: string;
}

/** One rejected candidate, recorded so recall loss is measurable (**F2**). */
export interface ExtractionRejection {
  readonly reason: RejectionReason;
  readonly detail: string;
  readonly matchCount?: number;
  readonly hintApplied: boolean;
  /** Checksum, never the quote — see the gate's note on why. */
  readonly quoteChecksum: string;
  readonly chunkId: string;
}

export interface ExtractEvidenceResult {
  readonly sourceId: string;
  /** Evidence actually written. Every item is anchored, verified and attributed. */
  readonly accepted: readonly EvidenceItem[];
  /** Everything refused, with its reason. Never silently dropped (**F2**). */
  readonly rejected: readonly ExtractionRejection[];
  readonly rejectionCounts: Readonly<Record<string, number>>;
  readonly interactionIds: readonly string[];
  readonly chunking: {
    readonly strategyVersion: string;
    readonly chunks: number;
    readonly chunked: boolean;
    readonly splitAnyUnit: boolean;
    readonly overlapChars: number;
  };
  readonly degradations: readonly string[];
  /** Provider refusals, per chunk. A refusal is an outcome, not an exception. */
  readonly refusals: readonly string[];
  readonly limitations: readonly string[];
}

/**
 * Extract evidence from a source — `EXTRACT_EVIDENCE`.
 *
 * The order is the whole design:
 *
 *   authorise  → the role may spend money and cause egress
 *   assemble   → STRUCTURAL chunks over SourceUnits (F4), never a blind slice
 *   ASK        → one call per chunk, through the broker
 *   GATE       → §4.4 uniqueness, independent verification, computed confidence
 *   persist    → only what passed all four conditions (F5)
 *   record     → interactions, rejections and counts, in one unit of work
 *
 * **A rejected candidate is data, not an error.** The pass completes, reports what
 * it refused and why, and the counts feed recall-loss measurement (**F2**). There
 * is deliberately no queue and no remediation workflow: that is the later human
 * requirements workspace.
 */
export async function extractEvidence(
  ctx: AnalysisContext,
  actor: Actor,
  input: ExtractEvidenceInput,
): Promise<ExtractEvidenceResult> {
  assertRole(actor, 'extractEvidence');

  const source = await ctx.repos.sources.get(input.sourceId);
  if (source === undefined) throw new ValidationError(`unknown source ${input.sourceId}`);
  if (source.projectId !== input.projectId) {
    throw new ValidationError(
      `source ${input.sourceId} does not belong to project ${input.projectId}`,
    );
  }
  if (source.status === 'parse_failed') {
    throw new ValidationError(
      `source ${input.sourceId} failed to parse, so there is no text to extract from`,
    );
  }

  const text = await ctx.repos.sources.getText(input.sourceId);
  if (text === undefined || text.trim().length === 0) {
    throw new ValidationError(
      `source ${input.sourceId} has no canonical text; an image source is read by the vision path`,
    );
  }

  const units = await ctx.repos.sourceUnits.listForSource(input.sourceId);
  if (units.length === 0) {
    throw new ValidationError(
      `source ${input.sourceId} has no units to extract from; extraction cites units, not raw text`,
    );
  }

  // --- F4: structural chunking ------------------------------------------
  //
  // Boundaries come from the units the ingestion adapter produced, so a chunk can
  // never split a quote that a unit contains. Only a single over-budget unit is
  // sliced by size, and then with overlap.
  const chunkable = units.flatMap((unit) => {
    const offsets = textOffsetsOf(unit.anchor.target as never);
    if (offsets === null || unit.text === null) return [];
    return [{ id: unit.id, charStart: offsets.start, charEnd: offsets.end, text: unit.text }];
  });
  if (chunkable.length === 0) {
    throw new ValidationError(
      `source ${input.sourceId} has no text-anchored units; only textual sources are extracted in ` +
        'V4b-core',
    );
  }

  const plan = planChunks(chunkable, {
    maxChars: ctx.extractionChunkChars,
    overlapChars: ctx.extractionOverlapChars,
  });

  const scopes = scopesFor(units);
  const accepted: EvidenceItem[] = [];
  const rejected: ExtractionRejection[] = [];
  const interactions: AiInteraction[] = [];
  const refusals: string[] = [];
  const limitations: string[] = [];
  const degradations = new Set<string>();

  for (const [index, chunk] of plan.chunks.entries()) {
    const outcome = await ctx.extractor.extract({
      projectId: input.projectId,
      sourceId: input.sourceId,
      text: chunk.text,
      chunk: {
        chunkId: chunk.chunkId,
        charStart: chunk.charStart,
        charEnd: chunk.charEnd,
        index,
        total: plan.chunks.length,
        overlapChars: chunk.overlapChars,
        strategyVersion: plan.strategyVersion,
      },
      unitIds: chunk.unitIds,
      classification: source.classification,
      languageHints: [source.primaryLanguage],
      correlationId: ctx.correlationId,
    });

    if (outcome.interaction !== undefined) interactions.push(outcome.interaction);

    if (outcome.kind === 'refused') {
      refusals.push(`${chunk.chunkId}: ${outcome.reason}`);
      for (const d of outcome.degradations) degradations.add(d);
      continue;
    }

    for (const d of outcome.interaction.routing.degradations) degradations.add(d);
    limitations.push(...outcome.extraction.limitations);

    for (const candidate of outcome.extraction.items) {
      const gated: GateOutcome = gateCandidate({
        sourceId: input.sourceId,
        // Gated against the WHOLE source text, not the chunk: the anchor must be
        // valid in the document, and a chunk-relative offset would be a different
        // claim. It also means an overlap-duplicated quote is ambiguous exactly
        // once rather than accidentally unique per chunk.
        storedText: text,
        candidate,
        scopesByUnitId: scopes.byUnitId,
        scopesByHeading: scopes.byHeading,
        extractorVersion: ctx.extractor.id,
        confidenceInputs: {
          sourceAuthorityRank: source.authorityRank,
          providerCapabilityTier: outcome.interaction.capabilityTier,
          degradations: outcome.interaction.routing.degradations,
        },
      });

      if (gated.kind === 'rejected') {
        rejected.push({
          reason: gated.reason,
          detail: gated.detail,
          ...(gated.matchCount === undefined ? {} : { matchCount: gated.matchCount }),
          hintApplied: gated.hintApplied,
          quoteChecksum: gated.quoteChecksum,
          chunkId: chunk.chunkId,
        });
        continue;
      }

      // Deduplicate within the pass. Overlap between chunks can offer the same
      // quote twice, and two identical evidence items would double-count in every
      // downstream measure.
      if (accepted.some((held) => held.anchor.quoteChecksum === gated.anchor.quoteChecksum)) {
        continue;
      }

      const unitId = unitForAnchor(units, gated.anchor);
      accepted.push({
        id: ctx.ids.next('ev'),
        projectId: input.projectId,
        sourceId: input.sourceId,
        ...(unitId === undefined ? {} : { sourceUnitId: unitId }),
        anchor: gated.anchor,
        verbatimText: gated.anchor.quote,
        language: gated.anchor.language,
        ...(candidate.rafSlotHint === undefined ? {} : { rafSlotHint: candidate.rafSlotHint }),
        // F5: AI-derived, and it says so. Migration 005 enforces the pairing.
        extractedBy: 'ai',
        aiInteractionId: outcome.interaction.id,
        // We located the quote ourselves, which is what `post_hoc` means
        // (provenance-and-anchoring.md §4.2).
        citationMode: 'post_hoc',
        anchorVerified: true,
        classification: source.classification,
        computedConfidence: gated.confidence.score,
        confidenceBand: gated.confidence.band,
        confidenceFunctionVersion: gated.confidence.version,
        createdBy: actor.subject,
        createdAt: ctx.clock.nowIso(),
      });
    }
  }

  const rejectionCounts: Record<string, number> = {};
  for (const r of rejected) rejectionCounts[r.reason] = (rejectionCounts[r.reason] ?? 0) + 1;

  return ctx.uow.run(async (repos) => {
    for (const interaction of interactions) await repos.aiInteractions.insert(interaction);
    for (const item of accepted) await repos.evidence.insert(item);

    await repos.audit.append({
      id: ctx.ids.next('aud'),
      at: ctx.clock.nowIso(),
      actor: actor.subject,
      rolesAtTime: [...actor.roles],
      tokenIssuer: actor.tokenIssuer,
      correlationId: ctx.correlationId,
      projectId: input.projectId,
      action: 'evidence.extracted',
      entityType: 'Source',
      entityId: input.sourceId,
      after: {
        sourceId: input.sourceId,
        acceptedCount: accepted.length,
        acceptedIds: accepted.map((a) => a.id),
        // F2: the rejections, with enough to count recall loss and diagnose —
        // reason, match count, whether a hint was applied, and the quote's
        // checksum. Not the quote: a rejected item never became evidence, and the
        // audit store is not a content store.
        rejectedCount: rejected.length,
        rejectionCounts,
        rejections: rejected,
        aiInteractionIds: interactions.map((i) => i.id),
        chunkStrategyVersion: plan.strategyVersion,
        chunkCount: plan.chunks.length,
        chunked: plan.chunked,
        splitAnyUnit: plan.splitAnyUnit,
        overlapChars: plan.overlapChars,
        degradations: [...degradations],
        refusals,
        confidenceBands: accepted.map((a) => a.confidenceBand),
      },
    });

    return {
      sourceId: input.sourceId,
      accepted,
      rejected,
      rejectionCounts,
      interactionIds: interactions.map((i) => i.id),
      chunking: {
        strategyVersion: plan.strategyVersion,
        chunks: plan.chunks.length,
        chunked: plan.chunked,
        splitAnyUnit: plan.splitAnyUnit,
        overlapChars: plan.overlapChars,
      },
      degradations: [...degradations],
      refusals,
      limitations,
    };
  });
}
