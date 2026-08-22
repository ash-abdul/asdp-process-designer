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
import { AppModule, type AppDependencies } from './app.module.ts';
import { CorrelationInterceptor } from './correlation.interceptor.ts';
import { DomainErrorFilter } from './domain-error.filter.ts';

export interface RunningApp {
  readonly app: INestApplication;
  readonly port: number;
  close(): Promise<void>;
}

export async function createApplication(deps: AppDependencies): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule.forRoot(deps), {
    logger: deps.config.logLevel === 'debug' ? ['error', 'warn', 'log'] : ['error'],
    bodyParser: true,
  });

  // Bounded request bodies (ADR-0028 K11).
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
