/**
 * Ports.
 *
 * Persistence sits behind a repository port so the Phase 1 in-memory adapter and
 * a later Postgres adapter are interchangeable (module-map.md §5). This is
 * ports-and-adapters, not a shortcut: the domain logic above these interfaces is
 * the same in both cases.
 */

import type {
  AiInteraction,
  Approval,
  AuditEvent,
  Baseline,
  Classification,
  EvidenceItem,
  Gate,
  GateCode,
  PageImage,
  Project,
  Source,
  EvidenceExtraction,
  SourceProfile,
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
 * Insert-only. An image is never edited: a corrected screenshot is a NEW source,
 * so anchors over the old bytes stay valid (provenance-and-anchoring.md §7).
 *
 * `get` returns the stored checksum and dimensions, which is what makes ADR-0038
 * target verification possible — without them a bounds check is vacuous.
 */
export interface PageImageRepository {
  insert(image: PageImage): Promise<void>;
  get(id: string): Promise<PageImage | undefined>;
  listForSource(sourceId: string): Promise<readonly PageImage[]>;
}

/**
 * AI interaction records — APPEND-ONLY (invariant I8, ADR-0032).
 *
 * There is no update and no delete. An interaction records what was sent outside
 * the enterprise and what came back; editing it would turn the AI-disclosure
 * report into a story. `setVerdict` is the single mutation the design allows,
 * because a human's verdict on a proposal genuinely arrives later.
 */
export interface AiInteractionRepository {
  insert(interaction: AiInteraction): Promise<void>;
  get(id: string): Promise<AiInteraction | undefined>;
  listForProject(projectId: string): Promise<readonly AiInteraction[]>;
  listForSource(sourceId: string): Promise<readonly AiInteraction[]>;
  setVerdict(id: string, verdict: AiInteraction['humanVerdict']): Promise<void>;
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
  readonly pageImages: PageImageRepository;
  readonly aiInteractions: AiInteractionRepository;
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

// ---------------------------------------------------------------------------
// AI analysis ports (V4a)
// ---------------------------------------------------------------------------

/**
 * The `SourceProfiler` port — `PROFILE_SOURCE`.
 *
 * A port rather than a direct broker call from the command layer, for the same
 * reason `VisionExtractor` is one: the command decides *whether* to ask and what
 * to do with the answer, while routing, the egress gate and the degradation
 * ladder are the application's business. It also means the command is testable
 * against a double with no provider anywhere near it.
 */
export interface ProfileSourceRequest {
  readonly projectId: string;
  readonly sourceId: string;
  /** Canonical text, already assembled by the caller. */
  readonly text: string;
  readonly classification: Classification;
  readonly languageHints: readonly string[];
  /** Joins the interaction to the HTTP request and the audit events. */
  readonly correlationId?: string;
}

/**
 * The outcome of a profiling attempt.
 *
 * A refusal is a first-class outcome, exactly as it is for vision: the egress
 * gate may forbid the call, no eligible provider may exist, or a provider may
 * fail. Each is correct behaviour that the caller must handle, not an exception.
 *
 * The interaction record travels with the outcome and is persisted **by the
 * caller**, inside the caller's unit of work — so the interaction and the audit
 * event commit together or not at all.
 */
export type ProfileSourceOutcome =
  | {
      readonly kind: 'profiled';
      readonly profile: SourceProfile;
      readonly interaction: AiInteraction;
    }
  | {
      readonly kind: 'refused';
      readonly reason: string;
      readonly degradations: readonly string[];
      readonly options: readonly string[];
      /** Present when a provider was reached and the response was unusable. */
      readonly interaction?: AiInteraction;
    };

export interface SourceProfiler {
  readonly id: string;
  profile(request: ProfileSourceRequest): Promise<ProfileSourceOutcome>;
}

/**
 * The `EvidenceExtractor` port — `EXTRACT_EVIDENCE` (V4b-core).
 *
 * One call per chunk, so the caller owns context assembly (**F4**) and the port
 * stays a single request/response. The extractor returns **candidates**, never
 * evidence: locating the quote, verifying the anchor and applying the persistence
 * gate are the command's job, because they are the part that must not depend on a
 * provider behaving well.
 */
export interface ExtractEvidenceRequest {
  readonly projectId: string;
  readonly sourceId: string;
  /** The chunk's text, already assembled. */
  readonly text: string;
  /** Chunk identity and original source range, for the interaction record (E4). */
  readonly chunk: {
    readonly chunkId: string;
    readonly charStart: number;
    readonly charEnd: number;
    readonly index: number;
    readonly total: number;
    readonly overlapChars: number;
    readonly strategyVersion: string;
  };
  /**
   * Unit ids present in this chunk, offered to the model as locators.
   *
   * A model may only cite a unit it was shown; anything else has no scope and is
   * treated as an absent hint (provenance §4.4).
   */
  readonly unitIds: readonly string[];
  readonly classification: Classification;
  readonly languageHints: readonly string[];
  readonly correlationId?: string;
}

export type ExtractEvidenceOutcome =
  | {
      readonly kind: 'extracted';
      readonly extraction: EvidenceExtraction;
      readonly interaction: AiInteraction;
    }
  | {
      readonly kind: 'refused';
      readonly reason: string;
      readonly degradations: readonly string[];
      readonly options: readonly string[];
      readonly interaction?: AiInteraction;
    };

export interface EvidenceExtractor {
  readonly id: string;
  extract(request: ExtractEvidenceRequest): Promise<ExtractEvidenceOutcome>;
}
