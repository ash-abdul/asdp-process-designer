/**
 * API entrypoint.
 *
 * ADR-0028 K5: graceful shutdown — SIGTERM stops accepting new work, drains
 * in-flight requests, and exits. NestJS shutdown hooks handle the draining;
 * this file owns the lifecycle and the exit code.
 *
 * ADR-0036: runs compiled JavaScript from `dist/`. No experimental Node flag.
 */

import 'reflect-metadata';
import { loadConfig } from './config.ts';
import { createAdapters } from './composition.ts';
import { listen } from './http/bootstrap.ts';

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const adapters = await createAdapters(config);

  if (adapters.database === undefined) {
    throw new Error(
      `ASDP_REPOSITORY=${config.repository} provides no database; the HTTP service requires one`,
    );
  }

  const running = await listen({
    config,
    database: adapters.database,
    blobStore: adapters.blobStore,
    clock: adapters.clock,
    ids: adapters.ids,
    repositories: adapters.repositories,
  });

  process.stdout.write(
    `${JSON.stringify({
      level: 'info',
      msg: 'listening',
      port: running.port,
      framework: 'nestjs',
      repository: config.repository,
      blobStore: config.blobStore,
      authMode: config.authMode,
    })}\n`,
  );

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stdout.write(`${JSON.stringify({ level: 'info', msg: 'shutdown_started', signal })}\n`);

    const forced = setTimeout(() => {
      process.stdout.write(`${JSON.stringify({ level: 'warn', msg: 'shutdown_forced' })}\n`);
      process.exit(1);
    }, config.shutdownGraceMs);
    forced.unref();

    void running
      .close()
      .then(() => adapters.close())
      .then(() => {
        clearTimeout(forced);
        process.stdout.write(`${JSON.stringify({ level: 'info', msg: 'shutdown_complete' })}\n`);
        process.exit(0);
      });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${JSON.stringify({ level: 'error', msg: 'startup_failed', error: message })}\n`);
  process.exit(1);
});
