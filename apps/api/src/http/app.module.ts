/**
 * Composition root.
 *
 * ADR-0034 N1: NestJS is used as the HTTP and application composition layer.
 * This file is wiring — it contains no logic.
 *
 * ADR-0034 N2: every injected value is a plain interface from `ports.ts`, the
 * persistence adapter, or the blob adapter. No domain service is decorated, and
 * no domain type is a NestJS provider class.
 */

import { Module, type DynamicModule } from '@nestjs/common';
import type { Config } from '../config.ts';
import type {
  Clock,
  DependencyProbe,
  HealthReport,
  IdGenerator,
  Repositories,
  UnitOfWork,
} from '../ports.ts';
import type { Database } from '../persistence/db.ts';
import { createSqlRepositories, withTransaction } from '../persistence/repositories.ts';
import { appliedMigrations } from '../persistence/migrate.ts';
import type { BlobStore } from '../blob/blob-store.ts';
import { HealthController } from './health.controller.ts';
import { ProjectsController } from './projects.controller.ts';
import { SourcesController } from './sources.controller.ts';
import { SourceViewerController } from './source-viewer.controller.ts';
import { EvidenceController } from './evidence.controller.ts';
import { ActorGuard } from './actor.guard.ts';
import { CorrelationInterceptor } from './correlation.interceptor.ts';
import {
  BLOB_STORE,
  CLOCK,
  CONFIG,
  DATABASE,
  DEPENDENCY_PROBE,
  ID_GENERATOR,
  REPOSITORIES,
  UNIT_OF_WORK,
} from './tokens.ts';

export interface AppDependencies {
  readonly config: Config;
  readonly database: Database;
  readonly blobStore: BlobStore;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  /** Overrides the derived repository set — used by tests. */
  readonly repositories?: Repositories;
  /** Overrides the derived transaction boundary — used by tests. */
  readonly unitOfWork?: UnitOfWork;
}

/**
 * Readiness probe over the real dependencies (ADR-0028 K4).
 *
 * Reports the applied migration count too, because a service connected to an
 * un-migrated database is reachable but not ready.
 */
function createProbe(database: Database, blobStore: BlobStore): DependencyProbe {
  return {
    async check(): Promise<HealthReport> {
      const dependencies: { name: string; ok: boolean; detail?: string }[] = [];

      const dbOk = await database.ping();
      let detail: string | undefined;
      if (dbOk) {
        const described = await database.describe();
        const migrations = await appliedMigrations(database);
        detail = `${described.engine} ${described.version}, ${migrations.length} migration(s) applied`;
      }
      dependencies.push({ name: 'database', ok: dbOk, detail });

      const blobOk = await blobStore.ping();
      dependencies.push({ name: `blobStore(${blobStore.kind})`, ok: blobOk });

      return { ok: dependencies.every((d) => d.ok), dependencies };
    },
  };
}

@Module({})
export class AppModule {
  /**
   * Build the module from explicit dependencies.
   *
   * Constructed rather than auto-discovered so tests compose the same graph with
   * substituted adapters — the composition root stays a single, readable place.
   */
  static forRoot(deps: AppDependencies): DynamicModule {
    const repositories = deps.repositories ?? createSqlRepositories(deps.database);
    // When repositories are substituted, the transaction must be substituted too,
    // or the unit of work would commit against a different set than the one the
    // controllers read from.
    const unitOfWork: UnitOfWork =
      deps.unitOfWork ??
      (deps.repositories === undefined
        ? { run: (fn) => withTransaction(deps.database, fn) }
        : { run: (fn) => fn(repositories) });

    return {
      module: AppModule,
      controllers: [
        HealthController,
        ProjectsController,
        // Order matters: the viewer's routes are more specific than
        // SourcesController's `:sourceId`, so they are registered first.
        SourceViewerController,
        SourcesController,
        EvidenceController,
      ],
      providers: [
        { provide: CONFIG, useValue: deps.config },
        { provide: DATABASE, useValue: deps.database },
        { provide: REPOSITORIES, useValue: repositories },
        { provide: UNIT_OF_WORK, useValue: unitOfWork },
        { provide: BLOB_STORE, useValue: deps.blobStore },
        { provide: CLOCK, useValue: deps.clock },
        { provide: ID_GENERATOR, useValue: deps.ids },
        { provide: DEPENDENCY_PROBE, useValue: createProbe(deps.database, deps.blobStore) },
        ActorGuard,
        CorrelationInterceptor,
      ],
    };
  }
}
