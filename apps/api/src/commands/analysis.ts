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

import type { AiInteraction, SourceProfile } from '@asdp/schemas';
import type { Actor, CommandContext } from '../commands.ts';
import { assertRole, ValidationError } from '../commands.ts';
import type { SourceProfiler, UnitOfWork } from '../ports.ts';

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
