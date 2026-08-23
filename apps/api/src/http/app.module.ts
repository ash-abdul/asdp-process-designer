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
  EvidenceExtractor,
  HealthReport,
  IdGenerator,
  Repositories,
  SourceProfiler,
  UnitOfWork,
} from '../ports.ts';
import type { Database } from '../persistence/db.ts';
import { createSqlRepositories, withTransaction } from '../persistence/repositories.ts';
import { appliedMigrations } from '../persistence/migrate.ts';
import type { BlobStore } from '../blob/blob-store.ts';
import {
  defaultExtractors,
  unavailableRasteriser,
  unavailableVisionExtractor,
  type PageRasteriser,
  type TextExtractor,
  type VisionExtractor,
} from '@asdp/ingestion';
import { HealthController } from './health.controller.ts';
import { ProjectsController } from './projects.controller.ts';
import { SourcesController } from './sources.controller.ts';
import { SourceViewerController } from './source-viewer.controller.ts';
import { EvidenceController } from './evidence.controller.ts';
import { AnalysisController } from './analysis.controller.ts';
import { unavailableSourceProfiler } from '../ai/broker-profiler.ts';
import { unavailableEvidenceExtractor } from '../ai/broker-extractor.ts';
import { ActorGuard } from './actor.guard.ts';
import { CorrelationInterceptor } from './correlation.interceptor.ts';
import {
  BLOB_STORE,
  CLOCK,
  CONFIG,
  DATABASE,
  DEPENDENCY_PROBE,
  ID_GENERATOR,
  EXTRACTORS,
  PAGE_RASTERISER,
  VISION_EXTRACTOR,
  SOURCE_PROFILER,
  EVIDENCE_EXTRACTOR,
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
  /** Overrides the extractor registry — used by tests. */
  readonly extractors?: readonly TextExtractor[];
  readonly pageRasteriser?: PageRasteriser;
  /** Overrides the vision extractor — used by tests with recorded fixtures. */
  readonly visionExtractor?: VisionExtractor;
  /**
   * Overrides the `PROFILE_SOURCE` profiler (V4a).
   *
   * The default REFUSES: the application ships unable to reach a provider, and
   * wiring one is a deliberate configuration act rather than a fallback.
   */
  readonly sourceProfiler?: SourceProfiler;
  /**
   * Overrides the `EXTRACT_EVIDENCE` extractor (V4b-core).
   *
   * The default REFUSES, for the same reason every other AI port's does: the
   * application ships unable to reach a provider.
   */
  readonly evidenceExtractor?: EvidenceExtractor;
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
        // More specific than SourcesController's `:sourceId`, so registered first.
        AnalysisController,
        SourcesController,
        EvidenceController,
      ],
      providers: [
        { provide: CONFIG, useValue: deps.config },
        { provide: DATABASE, useValue: deps.database },
        { provide: REPOSITORIES, useValue: repositories },
        { provide: UNIT_OF_WORK, useValue: unitOfWork },
        { provide: EXTRACTORS, useValue: deps.extractors ?? defaultExtractors() },
        { provide: PAGE_RASTERISER, useValue: deps.pageRasteriser ?? unavailableRasteriser() },
        { provide: VISION_EXTRACTOR, useValue: deps.visionExtractor ?? unavailableVisionExtractor() },
        { provide: SOURCE_PROFILER, useValue: deps.sourceProfiler ?? unavailableSourceProfiler() },
        {
          provide: EVIDENCE_EXTRACTOR,
          useValue: deps.evidenceExtractor ?? unavailableEvidenceExtractor(),
        },
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
