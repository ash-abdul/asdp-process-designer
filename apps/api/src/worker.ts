/**
 * Worker entrypoint.
 *
 * Same image as the API, different entrypoint (ADR-0028), so domain code cannot
 * drift between them.
 *
 * Phase 1 scope: the process lifecycle, health reporting and graceful drain. The
 * job queue itself arrives with the Postgres adapter, since queue durability is
 * the whole point and an in-memory queue would teach us nothing.
 */

import { loadConfig } from './config.ts';

async function main(): Promise<void> {
  const config = loadConfig(process.env);

  process.stdout.write(
    `${JSON.stringify({
      level: 'info',
      msg: 'worker_started',
      repository: config.repository,
      note: 'Phase 1: no job types registered yet',
    })}\n`,
  );

  let draining = false;
  const drain = (signal: string): void => {
    if (draining) return;
    draining = true;
    process.stdout.write(
      `${JSON.stringify({ level: 'info', msg: 'worker_draining', signal })}\n`,
    );
    // K5/K6: stop accepting new work, return unfinished jobs to the queue with
    // their idempotency keys intact. With no queue yet, this is a clean exit.
    process.exit(0);
  };

  process.on('SIGTERM', () => drain('SIGTERM'));
  process.on('SIGINT', () => drain('SIGINT'));

  // Keep the process alive without a busy loop.
  await new Promise<void>(() => {
    /* resolved only by drain() calling process.exit */
  });
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(
    `${JSON.stringify({ level: 'error', msg: 'worker_startup_failed', error: message })}\n`,
  );
  process.exit(1);
});
