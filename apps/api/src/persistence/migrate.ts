/**
 * Migration runner.
 *
 * ADR-0035: hand-written, forward-only, PostgreSQL-compatible `.sql` files
 * applied in filename order. The same files a container runs.
 *
 * ADR-0028 K7: migrations run as a one-shot task, never on service start. The
 * exception is tests, which call `migrate` directly against a fresh in-memory
 * database — that is the point of an in-process engine.
 */

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import type { Database } from './db.ts';

const MIGRATIONS_TABLE = `
  create table if not exists schema_migration (
    filename     text primary key,
    checksum     char(64) not null,
    applied_at   timestamptz not null default now()
  );
`;

export interface AppliedMigration {
  readonly filename: string;
  readonly checksum: string;
}

export interface MigrationResult {
  readonly applied: readonly string[];
  readonly alreadyApplied: readonly string[];
}

export class MigrationDriftError extends Error {}

/** Directory holding the `.sql` files, resolved relative to this module. */
export function migrationsDirectory(): string {
  return join(dirname(fileURLToPath(import.meta.url)), 'migrations');
}

function checksum(sql: string): string {
  // Normalised so a line-ending change does not read as drift.
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

/**
 * Apply pending migrations.
 *
 * Each file is applied inside a transaction, so a failure leaves the database at
 * the previous version rather than half-migrated. A file whose checksum differs
 * from the recorded one is **drift** and is refused: editing an applied migration
 * is how environments silently diverge.
 */
export async function migrate(db: Database, dir = migrationsDirectory()): Promise<MigrationResult> {
  await db.exec(MIGRATIONS_TABLE);

  const recorded = await db.query<{ filename: string; checksum: string }>(
    'select filename, checksum from schema_migration',
  );
  const recordedByName = new Map(recorded.rows.map((r) => [r.filename, r.checksum]));

  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

  const applied: string[] = [];
  const alreadyApplied: string[] = [];

  for (const filename of files) {
    const sql = await readFile(join(dir, filename), 'utf8');
    const sum = checksum(sql);
    const previous = recordedByName.get(filename);

    if (previous !== undefined) {
      if (previous !== sum) {
        throw new MigrationDriftError(
          `migration '${filename}' has changed since it was applied ` +
            `(recorded ${previous.slice(0, 12)}…, found ${sum.slice(0, 12)}…). ` +
            'Applied migrations are immutable; add a new migration instead.',
        );
      }
      alreadyApplied.push(filename);
      continue;
    }

    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query(
        'insert into schema_migration (filename, checksum, applied_at) values ($1, $2, now())',
        [filename, sum],
      );
    });
    applied.push(filename);
  }

  return { applied, alreadyApplied };
}

/** Currently applied migrations, for the readiness report. */
export async function appliedMigrations(db: Database): Promise<readonly AppliedMigration[]> {
  await db.exec(MIGRATIONS_TABLE);
  const r = await db.query<{ filename: string; checksum: string }>(
    'select filename, checksum from schema_migration order by filename',
  );
  return r.rows.map((row) => ({ filename: row.filename, checksum: row.checksum }));
}
