/**
 * API entrypoint.
 *
 * ADR-0028 K5: graceful shutdown — SIGTERM stops accepting new work, drains
 * in-flight requests, and exits. K1: stateless, so a replica may be replaced at
 * any time.
 */

import { loadConfig } from './config.ts';
import { listen } from './http.ts';
import {
  counterIdGenerator,
  createMemoryRepositories,
  memoryDependencyProbe,
  systemClock,
} from './repo-memory.ts';

async function main(): Promise<void> {
  const config = loadConfig(process.env);

  if (config.repository === 'postgres') {
    // The Postgres adapter is written when a container runtime is available;
    // failing loudly is better than silently falling back to memory.
    throw new Error(
      'ASDP_REPOSITORY=postgres is configured but the Postgres adapter is not implemented in Phase 1',
    );
  }

  const running = await listen({
    config,
    ctx: {
      repos: createMemoryRepositories(),
      clock: systemClock(),
      ids: counterIdGenerator(),
    },
    probe: memoryDependencyProbe(),
  });

  process.stdout.write(
    `${JSON.stringify({
      level: 'info',
      msg: 'listening',
      port: running.port,
      repository: config.repository,
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

    void running.close().then(() => {
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
