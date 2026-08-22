/**
 * Null provider.
 *
 * ai-provider-abstraction.md §8: required so that the application remains
 * navigable and HONEST with no AI available at all. It refuses every task and
 * declares no capabilities.
 */

import type { AiRequest, AiResponse, ProviderDescriptor } from '@asdp/schemas';
import type { AiProvider, CostEstimate, ProviderHealth, TokenCount } from '../port.ts';

export const NULL_PROVIDER_DESCRIPTOR: ProviderDescriptor = {
  providerId: 'null',
  displayName: 'No AI provider',
  deploymentClass: 'on_premise',
  enabled: true,
  models: [
    {
      modelId: 'none',
      displayName: 'none',
      contextUnits: 1,
      maxOutputUnits: 1,
      capabilities: [],
      costModel: { inputUnitCost: 0, cachedInputUnitCost: 0, outputUnitCost: 0, currency: 'USD' },
      qualityTierByLanguage: {},
    },
  ],
  dataHandling: { retentionDays: 0, trainingOptOut: true, residencyRegion: 'local' },
};

export function createNullProvider(): AiProvider {
  return {
    id: 'null',
    descriptor: () => NULL_PROVIDER_DESCRIPTOR,
    async health(): Promise<ProviderHealth> {
      return { ok: true, detail: 'null provider: no AI capability configured' };
    },
    async invoke(request: AiRequest): Promise<AiResponse> {
      throw new Error(
        `no AI provider is configured; task '${request.taskType}' cannot be run. ` +
          'Deterministic parsing and manual analysis remain available.',
      );
    },
    estimateCost(): CostEstimate {
      return { estimatedInputUnits: 0, estimatedOutputUnits: 0, estimatedCost: 0, currency: 'USD' };
    },
    async countTokens(): Promise<TokenCount> {
      return { units: 0, providerNative: false };
    },
  };
}
