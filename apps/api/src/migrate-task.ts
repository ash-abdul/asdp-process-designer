/**
 * Migration task entrypoint.
 *
 * ADR-0028 K7: migrations run as a separate one-shot task, never on service
 * start-up, so multiple replicas cannot race each other.
 *
 * Run: `node apps/api/dist/migrate-task.js`
 */

import { loadConfig } from './config.ts';
import { createPgliteDatabase } from './persistence/pglite-database.ts';
import { migrate } from './persistence/migrate.ts';

async function main(): Promise<void> {
  const config = loadConfig(process.env);

  if (config.repository === 'memory') {
    throw new Error('ASDP_REPOSITORY=memory has no schema to migrate');
  }
  if (config.repository === 'postgres') {
    throw new Error(
      'the PostgreSQL adapter is deferred until a container runtime is available (ADR-0035); ' +
        'the migrations themselves are already PostgreSQL-compatible',
    );
  }

  const database = await createPgliteDatabase({ dataDir: config.databaseDir });
  try {
    const result = await migrate(database);
    process.stdout.write(
      `${JSON.stringify({
        level: 'info',
        msg: 'migrations_complete',
        applied: result.applied,
        alreadyApplied: result.alreadyApplied.length,
      })}\n`,
    );
  } finally {
    await database.close();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${JSON.stringify({ level: 'error', msg: 'migration_failed', error: message })}\n`);
  process.exit(1);
});
