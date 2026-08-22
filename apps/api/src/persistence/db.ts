/**
 * The database port.
 *
 * ADR-0035: persistence stays behind an abstraction. Domain and command code
 * never sees SQL, a connection, or a driver type — this interface is the widest
 * thing they may know about, and they do not import it either.
 *
 * Deliberately minimal: query, exec, transaction. Everything the repositories
 * need, nothing that would leak a driver's shape into them.
 */

/** A row as returned by the driver: column name → value. */
export type Row = Record<string, unknown>;

export interface QueryResult<T extends Row = Row> {
  readonly rows: readonly T[];
  readonly affectedRows: number;
}

/**
 * A database handle. The same interface serves a pooled connection, a single
 * connection, and a transaction — so repositories are transaction-agnostic.
 */
export interface Db {
  /** Parameterised query. Parameters are ALWAYS passed separately (ADR-0035). */
  query<T extends Row = Row>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
  /** Multi-statement DDL. No parameters: used only by the migration runner. */
  exec(sql: string): Promise<void>;
}

export interface Database extends Db {
  /**
   * Run work in a transaction, rolling back on throw.
   *
   * Gate transitions need real atomicity — a baseline freeze, a gate update and
   * an audit append are one act (architecture-overview.md §4).
   */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  /** For the readiness probe (ADR-0028 K4). */
  ping(): Promise<boolean>;
  /** Identifies the engine, for the /meta endpoint and the audit record. */
  describe(): Promise<{ readonly engine: string; readonly version: string }>;
}

export class DatabaseError extends Error {}
export class UniqueViolationError extends DatabaseError {}
export class ForeignKeyViolationError extends DatabaseError {}
export class CheckViolationError extends DatabaseError {}

/**
 * Map a driver error to a domain-meaningful one.
 *
 * PostgreSQL SQLSTATE codes are stable and shared by PGlite, so this mapping is
 * portable across both adapters — which is part of what makes the container swap
 * a configuration change.
 */
export function mapDriverError(err: unknown): DatabaseError {
  const message = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string } | null)?.code;

  switch (code) {
    case '23505':
    case '23000':
      break;
    default:
      break;
  }

  // PGlite surfaces the SQLSTATE in `code` when available and otherwise only in
  // the message, so both are inspected.
  if (code === '23505' || /duplicate key value|unique constraint/i.test(message)) {
    return new UniqueViolationError(message);
  }
  if (code === '23503' || /violates foreign key constraint/i.test(message)) {
    return new ForeignKeyViolationError(message);
  }
  if (code === '23514' || /violates check constraint/i.test(message)) {
    return new CheckViolationError(message);
  }
  return new DatabaseError(message);
}
