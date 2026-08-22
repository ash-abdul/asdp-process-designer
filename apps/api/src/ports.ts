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
  EvidenceItem,
  Gate,
  GateCode,
  Project,
  Source,
  SourceStatus,
  SourceUnit,
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

// ---------------------------------------------------------------------------
// Intake and evidence
// ---------------------------------------------------------------------------

/** The canonical NFC text of a source. Immutable once written. */
export interface SourceTextRecord {
  readonly sourceId: string;
  /** NFC, logical order. What every anchor resolves against. */
  readonly text: string;
  readonly sha256: string;
  /** Length in code points, not UTF-16 units. */
  readonly codePointLength: number;
}

/**
 * Sources.
 *
 * The content-identifying fields are write-once: there is no method that changes
 * `sha256`, `blobRef` or `byteSize`, because a corrected document is a NEW source
 * that supersedes the old one. Old anchors stay valid against the old bytes
 * (provenance-and-anchoring.md §7). Exactly two mutators exist, for the two
 * fields that legitimately change.
 */
export interface SourceRepository {
  /**
   * Insert a source together with its canonical text.
   *
   * One method rather than two, so a source can never exist without the text its
   * anchors resolve against — which would make every unit unverifiable.
   */
  insert(source: Source, text: SourceTextRecord): Promise<void>;
  get(id: string): Promise<Source | undefined>;
  /** Deduplication lookup: the same bytes are ingested once per project. */
  getByHash(projectId: string, sha256: string): Promise<Source | undefined>;
  /** Inventory order: authority rank descending, then upload time ascending. */
  list(projectId: string): Promise<readonly Source[]>;
  getText(sourceId: string): Promise<string | undefined>;
  /** Human-set authority ranking (ADR-0012). One of two mutable fields. */
  setAuthorityRank(sourceId: string, rank: number): Promise<void>;
  setStatus(sourceId: string, status: SourceStatus, parseError?: string): Promise<void>;
}

/** Insert-only. Units are re-extracted under a new extractor version, never edited. */
export interface SourceUnitRepository {
  insertAll(units: readonly SourceUnit[]): Promise<void>;
  get(id: string): Promise<SourceUnit | undefined>;
  listForSource(sourceId: string): Promise<readonly SourceUnit[]>;
  listForProject(projectId: string): Promise<readonly SourceUnit[]>;
}

/**
 * Insert-only (invariants D1 and D8). There is deliberately no update and no
 * delete: an EvidenceItem is immutable and is only ever re-extracted.
 */
export interface EvidenceRepository {
  insert(item: EvidenceItem): Promise<void>;
  get(id: string): Promise<EvidenceItem | undefined>;
  listForProject(projectId: string): Promise<readonly EvidenceItem[]>;
  listForSource(sourceId: string): Promise<readonly EvidenceItem[]>;
}

/**
 * A transactional unit of work.
 *
 * Ingesting a source writes four things — the source row, its canonical text, its
 * units and an audit event — and they are one act. Without atomicity a crash
 * between the source insert and the unit insert leaves a source whose text
 * exists but whose units do not, which reads downstream as a document that was
 * read and found to contain nothing.
 *
 * Expressed as a port rather than as a `Database` parameter so the command layer
 * stays free of driver and persistence types (ADR-0035 §4).
 */
export interface UnitOfWork {
  run<T>(fn: (repos: Repositories) => Promise<T>): Promise<T>;
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
  readonly sources: SourceRepository;
  readonly sourceUnits: SourceUnitRepository;
  readonly evidence: EvidenceRepository;
}

/** Blob storage lives in its own module; re-exported so the port set is one import. */
export type { BlobStore, BlobMetadata, PutBlobRequest } from './blob/blob-store.ts';

/** Dependency reachability, for the readiness probe (ADR-0028 K4). */
export interface HealthReport {
  readonly ok: boolean;
  readonly dependencies: readonly { readonly name: string; readonly ok: boolean; readonly detail?: string }[];
}

export interface DependencyProbe {
  check(): Promise<HealthReport>;
}
