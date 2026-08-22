/**
 * The AiProvider port.
 *
 * ADR-0020: provider adapters are the ONLY code permitted to reference a vendor
 * SDK, model identifier or vendor-specific request shape. Every concept in the
 * request model is deliberately neutral.
 *
 * The architecture checker enforces both halves: no vendor SDK outside
 * `packages/ai/src/adapters`, and no import of @asdp/domain from anywhere in
 * this package (invariant I1 — the AI layer has no write authority).
 */

import type {
  AiRequest,
  AiResponse,
  AiTaskType,
  Capability,
  ProviderDescriptor,
} from '@asdp/schemas';

export interface CostEstimate {
  readonly estimatedInputUnits: number;
  readonly estimatedOutputUnits: number;
  readonly estimatedCost: number;
  readonly currency: string;
}

export interface TokenCount {
  readonly units: number;
  /** True when counted by the provider, false when estimated locally. */
  readonly providerNative: boolean;
}

export interface ProviderHealth {
  readonly ok: boolean;
  readonly detail?: string;
}

/**
 * A provider adapter.
 *
 * `countTokens` must be provider-native where available: Arabic tokenises very
 * differently from English, so a character heuristic would be wrong in exactly
 * the case that matters (ADR-0020).
 */
export interface AiProvider {
  readonly id: string;
  descriptor(): ProviderDescriptor;
  health(): Promise<ProviderHealth>;
  invoke(request: AiRequest, modelId: string): Promise<AiResponse>;
  estimateCost(request: AiRequest, modelId: string): CostEstimate;
  countTokens(text: string, modelId: string): Promise<TokenCount>;
}

/** Raised when a task cannot be run at all, rather than degraded silently. */
export class TaskRefusedError extends Error {
  readonly taskType: AiTaskType;
  readonly missingCapabilities: readonly Capability[];
  readonly kind: 'capability' | 'policy' | 'no_provider';

  constructor(
    message: string,
    taskType: AiTaskType,
    kind: 'capability' | 'policy' | 'no_provider',
    missingCapabilities: readonly Capability[] = [],
  ) {
    super(message);
    this.name = 'TaskRefusedError';
    this.taskType = taskType;
    this.kind = kind;
    this.missingCapabilities = missingCapabilities;
  }
}
