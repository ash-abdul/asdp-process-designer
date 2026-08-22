/**
 * Application bootstrap.
 *
 * Separated from `main.ts` so tests build the same application on an ephemeral
 * port with substituted adapters — the composition under test is the composition
 * that ships.
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule, type AppDependencies } from './app.module.ts';
import { CorrelationInterceptor } from './correlation.interceptor.ts';
import { DomainErrorFilter } from './domain-error.filter.ts';

/**
 * JSON body limit.
 *
 * A source arrives base64-encoded inside a JSON body, and base64 inflates by
 * 4/3, so the transport limit must exceed the content limit or the ingest guard
 * would never see an at-the-limit file — the body parser would reject it first
 * with a less useful error. 64 KiB of slack covers the surrounding envelope.
 */
export function jsonBodyLimit(maxSourceBytes: number): number {
  return Math.ceil((maxSourceBytes * 4) / 3) + 64 * 1024;
}

export interface RunningApp {
  readonly app: INestApplication;
  readonly port: number;
  close(): Promise<void>;
}

export async function createApplication(deps: AppDependencies): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(deps), {
    logger: deps.config.logLevel === 'debug' ? ['error', 'warn', 'log'] : ['error'],
    bodyParser: true,
  });

  // Bounded request bodies (ADR-0028 K11). Set explicitly rather than left at the
  // framework default, which is 100 KB and would reject every real source.
  const limit = jsonBodyLimit(deps.config.maxSourceBytes);
  app.useBodyParser('json', { limit });

  app.useGlobalFilters(new DomainErrorFilter());
  app.useGlobalInterceptors(new CorrelationInterceptor(deps.config));
  app.enableShutdownHooks();

  return app;
}

/** Start listening. `port = 0` binds an ephemeral port, which tests rely on. */
export async function listen(deps: AppDependencies, port = deps.config.port): Promise<RunningApp> {
  const app = await createApplication(deps);
  await app.listen(port, '0.0.0.0');

  const url = await app.getUrl();
  const bound = Number(new URL(url.replace('[::1]', '127.0.0.1')).port);

  return {
    app,
    port: Number.isFinite(bound) && bound > 0 ? bound : port,
    close: () => app.close(),
  };
}
