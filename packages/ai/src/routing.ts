/**
 * Provider routing.
 *
 * ai-provider-abstraction.md §7. Routing is configuration — per environment, per
 * project, per task type — never code.
 *
 * The routing record is stored on the AiInteraction and is queryable: "why did
 * this requirement come from the on-premise model?" must always be answerable.
 */

import type {
  AiTaskType,
  Capability,
  Classification,
  ContentPart,
  ProviderDescriptor,
  QualityTier,
} from '@asdp/schemas';
import {
  classifyContent,
  evaluateEgress,
  hasVisualContent,
  type EgressPolicy,
  type ProjectEgressSettings,
} from './egress.ts';
import { planDegradation, type DegradationPlan } from './degradation.ts';
import { requiredCapabilitiesFor, taskSpec } from './tasks.ts';

export interface RoutingConfig {
  /** Preference order by provider id; earlier is preferred. */
  readonly defaultPreferenceOrder: readonly string[];
  readonly taskOverrides?: Readonly<Partial<Record<AiTaskType, readonly string[]>>>;
  /** Minimum measured quality tier per language, if the profile demands one. */
  readonly minimumQualityTier?: QualityTier;
}

export interface RejectedProvider {
  readonly providerId: string;
  readonly reason: string;
}

export interface RoutingRecord {
  readonly taskType: AiTaskType;
  readonly classification: Classification;
  readonly eligibleProviders: readonly string[];
  readonly rejectedProviders: readonly RejectedProvider[];
  readonly selectedProvider?: string;
  readonly selectedModel?: string;
  readonly capabilityTier: QualityTier;
  readonly plan?: DegradationPlan;
}

export type RoutingOutcome =
  | { readonly kind: 'routed'; readonly record: RoutingRecord }
  | { readonly kind: 'refused'; readonly record: RoutingRecord; readonly detail: string };

const TIER_ORDER: readonly QualityTier[] = ['C', 'unknown', 'B', 'A'];

function tierRank(t: QualityTier): number {
  return TIER_ORDER.indexOf(t);
}

function dominantLanguage(languageHints: readonly string[]): string {
  return languageHints[0] ?? 'en';
}

function modelCapabilities(descriptor: ProviderDescriptor, modelId: string): readonly Capability[] {
  return descriptor.models.find((m) => m.modelId === modelId)?.capabilities ?? [];
}

/**
 * Route a task.
 *
 * Order is fixed and auditable:
 *   1. classify content
 *   2. EGRESS POLICY GATE — which providers are eligible at all
 *   3. capability filter — which eligible providers satisfy REQUIRED
 *   4. rank by policy preference, then measured quality for the content
 *      language, then capability completeness, then cost
 *   5. plan degradation
 *
 * A refusal names the specific blocker. It is never a silent downgrade.
 */
export function route(
  taskType: AiTaskType,
  content: readonly ContentPart[],
  providers: readonly ProviderDescriptor[],
  policy: EgressPolicy,
  project: ProjectEgressSettings,
  config: RoutingConfig,
  languageHints: readonly string[] = [],
): RoutingOutcome {
  const classification = classifyContent(content);
  const visual = hasVisualContent(content);
  const required = requiredCapabilitiesFor(taskType, visual);
  const preferred = taskSpec(taskType).preferred;
  const language = dominantLanguage(languageHints);

  const rejected: RejectedProvider[] = [];
  const eligible: ProviderDescriptor[] = [];

  // 2. egress policy gate
  for (const p of providers) {
    if (!p.enabled) {
      rejected.push({ providerId: p.providerId, reason: 'provider disabled' });
      continue;
    }
    const decision = evaluateEgress(taskType, content, p, policy, project);
    if (!decision.allowed) {
      rejected.push({ providerId: p.providerId, reason: `${decision.reason}: ${decision.detail}` });
      continue;
    }
    eligible.push(p);
  }

  const baseRecord = {
    taskType,
    classification,
    eligibleProviders: eligible.map((p) => p.providerId),
    rejectedProviders: rejected,
    capabilityTier: 'unknown' as QualityTier,
  };

  if (eligible.length === 0) {
    return {
      kind: 'refused',
      record: baseRecord,
      detail:
        `no provider may receive ${classification} content for task '${taskType}'. ` +
        'Options: use an on-premise provider, redact and retry, reclassify with justification ' +
        '(if authorised), or proceed with deterministic parsing and manual analysis.',
    };
  }

  // 3. capability filter over (provider, model) pairs
  interface Candidate {
    readonly provider: ProviderDescriptor;
    readonly modelId: string;
    readonly capabilities: readonly Capability[];
    readonly tier: QualityTier;
    readonly cost: number;
    readonly preferenceIndex: number;
    readonly preferredMatches: number;
  }

  const preferenceOrder = config.taskOverrides?.[taskType] ?? config.defaultPreferenceOrder;
  const candidates: Candidate[] = [];

  for (const p of eligible) {
    for (const m of p.models) {
      const missing = required.filter((c) => !m.capabilities.includes(c));
      if (missing.length > 0) {
        rejected.push({
          providerId: `${p.providerId}/${m.modelId}`,
          reason: `missing required capability/capabilities: ${missing.join(', ')}`,
        });
        continue;
      }
      const tier = m.qualityTierByLanguage[language] ?? 'unknown';
      if (
        config.minimumQualityTier !== undefined &&
        tierRank(tier) < tierRank(config.minimumQualityTier)
      ) {
        rejected.push({
          providerId: `${p.providerId}/${m.modelId}`,
          reason: `measured quality tier '${tier}' for '${language}' is below the required '${config.minimumQualityTier}'`,
        });
        continue;
      }
      const idx = preferenceOrder.indexOf(p.providerId);
      candidates.push({
        provider: p,
        modelId: m.modelId,
        capabilities: m.capabilities,
        tier,
        cost: m.costModel.inputUnitCost + m.costModel.outputUnitCost,
        preferenceIndex: idx === -1 ? Number.MAX_SAFE_INTEGER : idx,
        preferredMatches: preferred.filter((c) => m.capabilities.includes(c)).length,
      });
    }
  }

  if (candidates.length === 0) {
    const missingVision = visual && required.includes('vision');
    return {
      kind: 'refused',
      record: { ...baseRecord, rejectedProviders: rejected },
      detail: missingVision
        ? `task '${taskType}' requires vision capability, which has NO degradation path. ` +
          'Affected sources are marked requires_vision_capability; offer manual transcription ' +
          'or an alternate provider.'
        : `no eligible provider satisfies the required capabilities for '${taskType}': ${required.join(', ')}`,
    };
  }

  // 4. rank
  candidates.sort(
    (a, b) =>
      a.preferenceIndex - b.preferenceIndex ||
      tierRank(b.tier) - tierRank(a.tier) ||
      b.preferredMatches - a.preferredMatches ||
      a.cost - b.cost,
  );

  const chosen = candidates[0] as Candidate;

  // 5. degradation plan
  const plan = planDegradation(required, preferred, chosen.capabilities);
  if (plan.refused) {
    return {
      kind: 'refused',
      record: { ...baseRecord, rejectedProviders: rejected, capabilityTier: chosen.tier, plan },
      detail: plan.refusalReason ?? 'task refused',
    };
  }

  return {
    kind: 'routed',
    record: {
      ...baseRecord,
      rejectedProviders: rejected,
      selectedProvider: chosen.provider.providerId,
      selectedModel: chosen.modelId,
      capabilityTier: chosen.tier,
      plan,
    },
  };
}
