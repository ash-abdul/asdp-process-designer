/**
 * PGlite database adapter — the development and CI implementation.
 *
 * ADR-0035: PGlite is PostgreSQL 18.3 compiled to WebAssembly. Spike S7 verified
 * 15 of 15 fidelity checks: enums, jsonb, arrays, check constraints, foreign
 * keys, transactions with rollback, byte-exact Arabic, bytea.
 *
 * This is the ONLY file permitted to import the driver (checker rule
 * `persistence-confinement`). The production PostgreSQL adapter implements the
 * same `Database` interface with the same SQL, so the swap is a connection
 * string rather than a redesign.
 */

import { PGlite } from '@electric-sql/pglite';
import {
  mapDriverError,
  type Database,
  type Db,
  type QueryResult,
  type Row,
} from './db.ts';

export interface PgliteOptions {
  /**
   * Data directory. Omit for an in-memory database — used by tests, where each
   * instance must be isolated.
   */
  readonly dataDir?: string;
}

function wrap(client: PGlite | { query: PGlite['query']; exec: PGlite['exec'] }): Db {
  return {
    async query<T extends Row = Row>(
      sql: string,
      params: readonly unknown[] = [],
    ): Promise<QueryResult<T>> {
      try {
        const result = await client.query<T>(sql, params as unknown[]);
        return {
          rows: result.rows as readonly T[],
          affectedRows: result.affectedRows ?? 0,
        };
      } catch (err) {
        throw mapDriverError(err);
      }
    },
    async exec(sql: string): Promise<void> {
      try {
        await client.exec(sql);
      } catch (err) {
        throw mapDriverError(err);
      }
    },
  };
}

export async function createPgliteDatabase(options: PgliteOptions = {}): Promise<Database> {
  const client = options.dataDir === undefined ? new PGlite() : new PGlite(options.dataDir);
  await client.waitReady;

  const base = wrap(client);

  return {
    query: base.query,
    exec: base.exec,

    async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
      try {
        return await client.transaction(async (tx) => fn(wrap(tx)));
      } catch (err) {
        throw mapDriverError(err);
      }
    },

    async ping(): Promise<boolean> {
      try {
        await client.query('select 1');
        return true;
      } catch {
        return false;
      }
    },

    async describe(): Promise<{ engine: string; version: string }> {
      const r = await client.query<{ version: string }>('select version() as version');
      const raw = r.rows[0]?.version ?? 'unknown';
      // "PostgreSQL 18.3 (PGlite 0.5.6) on wasm32-..." → engine and version.
      const match = /^PostgreSQL\s+([\d.]+)/.exec(raw);
      return {
        engine: raw.includes('PGlite') ? 'pglite' : 'postgres',
        version: match?.[1] ?? raw,
      };
    },

    async close(): Promise<void> {
      await client.close();
    },
  };
}
