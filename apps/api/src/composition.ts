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
import type { Clock, IdGenerator, Repositories, UnitOfWork } from './ports.ts';
import type { Database } from './persistence/db.ts';
import { createPgliteDatabase } from './persistence/pglite-database.ts';
import { migrate } from './persistence/migrate.ts';
import { createSqlRepositories, withTransaction } from './persistence/repositories.ts';
import type { BlobStore } from './blob/blob-store.ts';
import {
  defaultExtractors,
  unavailableRasteriser,
  unavailableVisionExtractor,
  type PageRasteriser,
  type TextExtractor,
  type VisionExtractor,
} from '@asdp/ingestion';
import { createFilesystemBlobStore } from './blob/filesystem-blob-store.ts';
import { createMemoryRepositories, systemClock } from './repo-memory.ts';
import { durableIdGenerator } from '@asdp/domain';
import { randomBytes } from 'node:crypto';

export interface Adapters {
  readonly database?: Database;
  readonly repositories: Repositories;
  readonly blobStore: BlobStore;
  readonly unitOfWork: UnitOfWork;
  /** A3 TextExtractor registry. No PDF extractor: PDF intake is V2-PDF. */
  readonly extractors: readonly TextExtractor[];
  /** A3 PageRasteriser. Refuses in V2 — see `unavailableRasteriser`. */
  readonly pageRasteriser: PageRasteriser;
  /**
   * A3 VisionExtractor.
   *
   * The default REFUSES, because no provider is configured by default. Refusing
   * is not a degraded mode — it is the correct answer when nothing is wired, and
   * it is distinguishable from "the image contained no text".
   */
  readonly visionExtractor: VisionExtractor;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  close(): Promise<void>;
}

/**
 * A pass-through unit of work for the in-memory adapter.
 *
 * Honest about what it is: the in-memory repositories have no transaction to
 * join, so this runs the work directly and does NOT roll back. Tests that assert
 * rollback behaviour must run against PGlite, where the transaction is real.
 */
export function passThroughUnitOfWork(repositories: Repositories): UnitOfWork {
  return { run: (fn) => fn(repositories) };
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
  // H5 / M4: the durable generator, NOT `counterIdGenerator`.
  //
  // A counter in process memory restarts at zero while the database keeps every
  // row, so the first write after a restart re-mints an identifier that already
  // exists — any write, not just a duplicate one (limitation 78). Two instances
  // collide for the same reason. This generator remembers nothing across
  // processes, so there is nothing for a restart to forget.
  //
  // `counterIdGenerator` survives for tests, where deterministic `prj-0001`
  // identifiers are worth having; the architecture-checker rule
  // `durable-id-generator` is what keeps it from reaching production wiring again.
  const ids = durableIdGenerator(clock, randomBytes);

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
    const repositories = createMemoryRepositories();
    return {
      repositories,
      blobStore,
      unitOfWork: passThroughUnitOfWork(repositories),
      extractors: defaultExtractors(),
      pageRasteriser: unavailableRasteriser(),
      visionExtractor: unavailableVisionExtractor(),
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
    // A real transaction: the ingest of a source, its text and its units either
    // all commit or none do.
    unitOfWork: { run: (fn) => withTransaction(database, fn) },
    extractors: defaultExtractors(),
    pageRasteriser: unavailableRasteriser(),
    visionExtractor: unavailableVisionExtractor(),
    clock,
    ids,
    close: () => database.close(),
  };
}
