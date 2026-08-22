/**
 * Generic private / self-hosted endpoint adapter.
 *
 * ai-provider-abstraction.md §8: the MVP must ship a second adapter with a
 * DELIBERATELY REDUCED default capability set, so every rung of the degradation
 * ladder is exercised in CI rather than assumed.
 *
 * The capability descriptor is configuration, because a private endpoint's
 * capabilities are an environment fact, not a code fact (OD-1).
 */

import type { AiRequest, AiResponse, ProviderDescriptor } from '@asdp/schemas';
import { assertTransportPermitted } from '../egress.ts';
import type { AiProvider, CostEstimate, ProviderHealth, TokenCount } from '../port.ts';

export interface PrivateEndpointConfig {
  readonly providerId: string;
  readonly displayName?: string;
  readonly endpointUrl: string;
  readonly modelId: string;
  readonly contextUnits: number;
  readonly maxOutputUnits: number;
  /** Declared capabilities, verified by the conformance probe. */
  readonly capabilities: ProviderDescriptor['models'][number]['capabilities'];
  readonly qualityTierByLanguage?: Record<string, 'A' | 'B' | 'C' | 'unknown'>;
  /**
   * Injected transport. Phase 1 supplies a stub; the HTTP implementation lands
   * with a real endpoint (OD-1).
   */
  readonly transport?: (request: AiRequest, modelId: string) => Promise<AiResponse>;
}

/**
 * Reduced default capability set: no native citations, small context, no
 * caching. This is what forces the `post_hoc` and `chunked_context` rungs to be
 * exercised.
 */
export const REDUCED_CAPABILITIES = ['schemaConstrainedOutput'] as const;

export function createPrivateEndpointProvider(config: PrivateEndpointConfig): AiProvider {
  const descriptor: ProviderDescriptor = {
    providerId: config.providerId,
    displayName: config.displayName ?? 'Private endpoint',
    deploymentClass: 'on_premise',
    enabled: true,
    models: [
      {
        modelId: config.modelId,
        displayName: config.modelId,
        contextUnits: config.contextUnits,
        maxOutputUnits: config.maxOutputUnits,
        capabilities: config.capabilities,
        costModel: {
          inputUnitCost: 0,
          cachedInputUnitCost: 0,
          outputUnitCost: 0,
          currency: 'USD',
        },
        qualityTierByLanguage: config.qualityTierByLanguage ?? {},
      },
    ],
    dataHandling: { retentionDays: 0, trainingOptOut: true, residencyRegion: 'on-premise' },
  };

  return {
    id: config.providerId,
    descriptor: () => descriptor,
    async health(): Promise<ProviderHealth> {
      if (config.transport === undefined) {
        return { ok: false, detail: 'no transport configured (Phase 1 stub)' };
      }
      return { ok: true };
    },
    async invoke(request: AiRequest, modelId: string): Promise<AiResponse> {
      // Defence in depth at the point of egress, not merely of intent.
      assertTransportPermitted(request.content, descriptor);
      if (config.transport === undefined) {
        throw new Error(
          `private endpoint '${config.providerId}' has no transport configured; ` +
            'set OD-1 (endpoint type and capabilities) before enabling it',
        );
      }
      return config.transport(request, modelId);
    },
    estimateCost(): CostEstimate {
      return { estimatedInputUnits: 0, estimatedOutputUnits: 0, estimatedCost: 0, currency: 'USD' };
    },
    async countTokens(text: string): Promise<TokenCount> {
      // Not provider-native, and flagged as such: a local estimate must never be
      // mistaken for an authoritative count (ADR-0020).
      return { units: Array.from(text).length, providerNative: false };
    },
  };
}
