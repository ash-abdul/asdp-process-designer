/**
 * @asdp/api — public surface for testing and embedding.
 */

export { loadConfig, ConfigError, type Config } from './config.ts';
export { createApp, listen, type AppDeps, type RunningServer } from './http.ts';
export {
  COMMANDS,
  commandDescriptor,
  assertRole,
  createProject,
  freezeProjectBaseline,
  evaluateProjectGate,
  approveProjectGate,
  assertStageEnterable,
  reconcileGates,
  projectBaselineHash,
  AuthorizationError,
  GateGuardError,
  ValidationError,
  type Actor,
  type CommandContext,
  type CommandDescriptor,
} from './commands.ts';
export {
  createMemoryRepositories,
  systemClock,
  counterIdGenerator,
  memoryDependencyProbe,
} from './repo-memory.ts';
export {
  ConcurrencyError,
  NotFoundError,
  type Repositories,
  type Clock,
  type IdGenerator,
  type DependencyProbe,
  type HealthReport,
} from './ports.ts';
