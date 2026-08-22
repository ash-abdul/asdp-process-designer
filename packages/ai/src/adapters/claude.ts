/**
 * Claude adapter.
 *
 * The ONLY place in the codebase permitted to know about this vendor
 * (ADR-0020); the architecture checker enforces that. Note that no vendor SDK is
 * imported in Phase 1: the transport is injected, so the adapter's shape,
 * capability declaration and egress guard are all testable without a network
 * call or a dependency.
 *
 * Model identifiers live in configuration, never in code, so a model change is
 * not a code change.
 */

import type { AiRequest, AiResponse, ProviderDescriptor } from '@asdp/schemas';
import { assertTransportPermitted } from '../egress.ts';
import type { AiProvider, CostEstimate, ProviderHealth, TokenCount } from '../port.ts';

export interface ClaudeAdapterConfig {
  readonly providerId?: string;
  /** Model entries from configuration. */
  readonly models: readonly {
    readonly modelId: string;
    readonly displayName: string;
    readonly contextUnits: number;
    readonly maxOutputUnits: number;
    readonly capabilities: ProviderDescriptor['models'][number]['capabilities'];
    readonly inputUnitCost: number;
    readonly cachedInputUnitCost: number;
    readonly outputUnitCost: number;
    readonly qualityTierByLanguage?: Record<string, 'A' | 'B' | 'C' | 'unknown'>;
  }[];
  readonly retentionDays: number;
  readonly trainingOptOut: boolean;
  readonly residencyRegion?: string;
  /** Injected transport; the SDK call lands here. */
  readonly transport?: (request: AiRequest, modelId: string) => Promise<AiResponse>;
  readonly tokenCounter?: (text: string, modelId: string) => Promise<number>;
}

export function createClaudeProvider(config: ClaudeAdapterConfig): AiProvider {
  const providerId = config.providerId ?? 'claude-hosted';

  const descriptor: ProviderDescriptor = {
    providerId,
    displayName: 'Claude API',
    deploymentClass: 'external_hosted',
    enabled: true,
    models: config.models.map((m) => ({
      modelId: m.modelId,
      displayName: m.displayName,
      contextUnits: m.contextUnits,
      maxOutputUnits: m.maxOutputUnits,
      capabilities: m.capabilities,
      costModel: {
        inputUnitCost: m.inputUnitCost,
        cachedInputUnitCost: m.cachedInputUnitCost,
        outputUnitCost: m.outputUnitCost,
        currency: 'USD',
      },
      qualityTierByLanguage: m.qualityTierByLanguage ?? {},
    })),
    dataHandling: {
      retentionDays: config.retentionDays,
      trainingOptOut: config.trainingOptOut,
      residencyRegion: config.residencyRegion ?? 'unknown',
    },
  };

  return {
    id: providerId,
    descriptor: () => descriptor,
    async health(): Promise<ProviderHealth> {
      if (config.transport === undefined) {
        return { ok: false, detail: 'no transport configured (Phase 1: SDK call not wired)' };
      }
      return { ok: true };
    },
    async invoke(request: AiRequest, modelId: string): Promise<AiResponse> {
      // THE TRANSPORT BOUNDARY. Restricted content must not get past this line,
      // even if a caller bypassed the broker (Spike S6).
      assertTransportPermitted(request.content, descriptor);

      if (config.transport === undefined) {
        throw new Error(
          `Claude adapter has no transport configured; wire the SDK before enabling '${providerId}'`,
        );
      }
      return config.transport(request, modelId);
    },
    estimateCost(request: AiRequest, modelId: string): CostEstimate {
      const model = config.models.find((m) => m.modelId === modelId);
      if (model === undefined) {
        return { estimatedInputUnits: 0, estimatedOutputUnits: 0, estimatedCost: 0, currency: 'USD' };
      }
      const chars = request.content.reduce(
        (n, part) => n + (part.kind === 'text' ? Array.from(part.text).length : 0),
        0,
      );
      // A coarse pre-flight estimate only; actual accounting uses reported usage.
      const estimatedInputUnits = Math.ceil(chars / 3);
      const estimatedOutputUnits = request.budget?.maxOutputUnits ?? 1024;
      return {
        estimatedInputUnits,
        estimatedOutputUnits,
        estimatedCost:
          (estimatedInputUnits * model.inputUnitCost + estimatedOutputUnits * model.outputUnitCost) /
          1_000_000,
        currency: 'USD',
      };
    },
    async countTokens(text: string, modelId: string): Promise<TokenCount> {
      if (config.tokenCounter !== undefined) {
        return { units: await config.tokenCounter(text, modelId), providerNative: true };
      }
      // Flagged as non-native. Arabic tokenises very differently from English, so
      // an estimate must never be presented as authoritative (ADR-0020 §3.1).
      return { units: Math.ceil(Array.from(text).length / 3), providerNative: false };
    },
  };
}
