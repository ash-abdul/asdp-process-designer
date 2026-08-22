/**
 * Adapter selection.
 *
 * Turns configuration into concrete adapters. The one place that knows which
 * implementation backs each port, so `main.ts` stays a lifecycle file and the
 * NestJS module stays wiring.
 *
 * ADR-0028: no code branches on environment NAME. It branches on explicit
 * configuration values, which is a different thing — the adapter is named in
 * configuration, not inferred from where we happen to be running.
 */

import type { Config } from './config.ts';
import type { Clock, IdGenerator, Repositories } from './ports.ts';
import type { Database } from './persistence/db.ts';
import { createPgliteDatabase } from './persistence/pglite-database.ts';
import { migrate } from './persistence/migrate.ts';
import { createSqlRepositories } from './persistence/repositories.ts';
import type { BlobStore } from './blob/blob-store.ts';
import { createFilesystemBlobStore } from './blob/filesystem-blob-store.ts';
import { counterIdGenerator, createMemoryRepositories, systemClock } from './repo-memory.ts';

export interface Adapters {
  readonly database?: Database;
  readonly repositories: Repositories;
  readonly blobStore: BlobStore;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  close(): Promise<void>;
}

export class UnsupportedAdapterError extends Error {}

/**
 * Build the adapter set.
 *
 * `runMigrations` is false by default: migrations are a one-shot task, never run
 * on service start (ADR-0028 K7). Tests pass true against a fresh in-memory
 * database, which is the point of an in-process engine.
 */
export async function createAdapters(
  config: Config,
  options: { readonly runMigrations?: boolean } = {},
): Promise<Adapters> {
  const clock = systemClock();
  const ids = counterIdGenerator();

  const blobStore =
    config.blobStore === 'filesystem'
      ? await createFilesystemBlobStore({
          rootDirectory: config.blobRoot as string,
          replicaCount: config.replicaCount,
        })
      : (() => {
          throw new UnsupportedAdapterError(
            'the S3 blob adapter is not implemented: it is deferred until a container runtime ' +
              'is available (infra/README.md). Use ASDP_BLOB_STORE=filesystem for development.',
          );
        })();

  if (config.repository === 'memory') {
    return {
      repositories: createMemoryRepositories(),
      blobStore,
      clock,
      ids,
      close: async () => undefined,
    };
  }

  if (config.repository === 'postgres') {
    throw new UnsupportedAdapterError(
      'the PostgreSQL adapter is not implemented: it is deferred until a container runtime is ' +
        'available (ADR-0035, infra/README.md). The SQL and migrations are already ' +
        'PostgreSQL-compatible, so this is an adapter, not a redesign.',
    );
  }

  const database = await createPgliteDatabase({ dataDir: config.databaseDir });
  if (options.runMigrations === true) await migrate(database);

  return {
    database,
    repositories: createSqlRepositories(database),
    blobStore,
    clock,
    ids,
    close: () => database.close(),
  };
}
