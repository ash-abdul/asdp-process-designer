/**
 * Ports.
 *
 * Persistence sits behind a repository port so the Phase 1 in-memory adapter and
 * a later Postgres adapter are interchangeable (module-map.md §5). This is
 * ports-and-adapters, not a shortcut: the domain logic above these interfaces is
 * the same in both cases.
 */

import type {
  Approval,
  AuditEvent,
  Baseline,
  Gate,
  GateCode,
  Project,
} from '@asdp/schemas';

/** Optimistic-concurrency token. */
export interface Versioned<T> {
  readonly value: T;
  readonly version: number;
}

export class ConcurrencyError extends Error {}
export class NotFoundError extends Error {}

export interface ProjectRepository {
  create(project: Project): Promise<void>;
  get(id: string): Promise<Project | undefined>;
  getByKey(key: string): Promise<Project | undefined>;
  list(): Promise<readonly Project[]>;
}

export interface GateRepository {
  putAll(projectId: string, gates: readonly Gate[]): Promise<void>;
  get(projectId: string, code: GateCode): Promise<Versioned<Gate> | undefined>;
  list(projectId: string): Promise<readonly Gate[]>;
  /** Optimistic update: fails with ConcurrencyError on a version mismatch. */
  update(projectId: string, gate: Gate, expectedVersion: number): Promise<void>;
}

/** Insert-only (invariant D8). There is deliberately no update or delete. */
export interface BaselineRepository {
  insert(baseline: Baseline): Promise<void>;
  get(id: string): Promise<Baseline | undefined>;
  getByHash(projectId: string, contentHash: string): Promise<Baseline | undefined>;
  list(projectId: string): Promise<readonly Baseline[]>;
}

/** Insert-only (invariant D8). */
export interface ApprovalRepository {
  insert(approval: Approval): Promise<void>;
  listForGate(projectId: string, gate: GateCode): Promise<readonly Approval[]>;
}

/** Append-only (audit-and-compliance.md §1). No update path, no delete path. */
export interface AuditRepository {
  append(event: AuditEvent): Promise<void>;
  list(projectId?: string): Promise<readonly AuditEvent[]>;
  count(): Promise<number>;
}

export interface Clock {
  nowIso(): string;
}

export interface IdGenerator {
  next(prefix: string): string;
}

export interface Repositories {
  readonly projects: ProjectRepository;
  readonly gates: GateRepository;
  readonly baselines: BaselineRepository;
  readonly approvals: ApprovalRepository;
  readonly audit: AuditRepository;
}

/** Dependency reachability, for the readiness probe (ADR-0028 K4). */
export interface HealthReport {
  readonly ok: boolean;
  readonly dependencies: readonly { readonly name: string; readonly ok: boolean; readonly detail?: string }[];
}

export interface DependencyProbe {
  check(): Promise<HealthReport>;
}
