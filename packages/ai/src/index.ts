/**
 * @asdp/ai — the AI provider abstraction and proposal broker.
 *
 * ADAPTER package. May import only @asdp/schemas, @asdp/raf and @asdp/text
 * (module-map.md §3). It CANNOT reach @asdp/domain or any repository: the AI
 * layer has no write authority (ADR-0004, invariant I1), and the architecture
 * checker fails the build if that is violated.
 */

export {
  type AiProvider,
  type CostEstimate,
  type ProviderHealth,
  type TokenCount,
  TaskRefusedError,
} from './port.ts';

export {
  TASK_SPECS,
  type TaskSpec,
  taskSpec,
  requiredCapabilitiesFor,
} from './tasks.ts';

export {
  DEFAULT_EGRESS_POLICY,
  EgressViolationError,
  type EgressPolicy,
  type EgressDecision,
  type ProjectEgressSettings,
  classifyContent,
  hasVisualContent,
  evaluateEgress,
  assertTransportPermitted,
  assertDevelopmentCeiling,
} from './egress.ts';

export {
  LADDER,
  type DegradationRung,
  type DegradationPlan,
  rungFor,
  planDegradation,
  assertDegradationSafe,
} from './degradation.ts';

export {
  type RoutingConfig,
  type RoutingRecord,
  type RoutingOutcome,
  type RejectedProvider,
  route,
} from './routing.ts';

export {
  type BrokerDeps,
  type BrokerInvocation,
  type BrokerOutcome,
  invoke,
  previewClassification,
} from './broker.ts';

export { createNullProvider, NULL_PROVIDER_DESCRIPTOR } from './adapters/null-provider.ts';
export {
  createPrivateEndpointProvider,
  REDUCED_CAPABILITIES,
  type PrivateEndpointConfig,
} from './adapters/private-endpoint.ts';
export { createClaudeProvider, type ClaudeAdapterConfig } from './adapters/claude.ts';
export {
  createClaudeTransport,
  ClaudeTransportError,
  type ClaudeTransportConfig,
} from './adapters/claude-transport.ts';

export {
  CHUNK_STRATEGY_VERSION,
  planChunks,
  type Chunk,
  type ChunkPlan,
  type ChunkOptions,
  type ChunkableUnit,
} from './chunking.ts';
