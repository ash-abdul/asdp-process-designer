/**
 * @asdp/api — public surface for testing and embedding.
 */

export { loadConfig, ConfigError, type Config } from './config.ts';

export {
  createAdapters,
  UnsupportedAdapterError,
  type Adapters,
} from './composition.ts';

export {
  createApplication,
  listen,
  type RunningApp,
} from './http/bootstrap.ts';
export { AppModule, type AppDependencies } from './http/app.module.ts';

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
  type BlobStore,
  type BlobMetadata,
  type PutBlobRequest,
} from './ports.ts';

// Persistence (ADR-0035)
export {
  type Database,
  type Db,
  type QueryResult,
  type Row,
  DatabaseError,
  UniqueViolationError,
  ForeignKeyViolationError,
  CheckViolationError,
  mapDriverError,
} from './persistence/db.ts';
export { createPgliteDatabase, type PgliteOptions } from './persistence/pglite-database.ts';
export {
  migrate,
  appliedMigrations,
  migrationsDirectory,
  MigrationDriftError,
  type MigrationResult,
} from './persistence/migrate.ts';
export { createSqlRepositories, withTransaction } from './persistence/repositories.ts';

// Blob storage (A6)
export {
  assertValidBlobKey,
  contentAddressedKey,
  BlobKeyError,
  BlobNotFoundError,
} from './blob/blob-store.ts';
export {
  createFilesystemBlobStore,
  UnsafeBlobStoreConfiguration,
  type FilesystemBlobStoreOptions,
} from './blob/filesystem-blob-store.ts';
