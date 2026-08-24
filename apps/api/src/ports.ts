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
  CanonicalEntity,
  CanonicalEntityAlias,
  Conflict,
  ConflictParticipant,
  EntityCanonicalisation,
  ReconciliationRejection,
  RequirementRelation,
  SourceReconciliation,
  Approval,
  AuditEvent,
  Baseline,
  Classification,
  EvidenceItem,
  FramePopulation,
  Gate,
  GateCode,
  PageImage,
  OpenQuestion,
  PolicyAcknowledgement,
  Project,
  Requirement,
  RequirementEvidenceLink,
  RequirementFlag,
  RequirementRejection,
  RequirementSet,
  SlotPolicyBlock,
  Source,
  EvidenceExtraction,
  SourceProfile,
  SourceStatus,
  SourceUnit,
  ValidationRun,
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

/**
 * Persisted validation runs — INSERT-ONLY (invariant D8).
 *
 * The second limb of the ADR-0017 signature. An approval binds
 * `(baselineContentHash, validationRunId)`, so the run has to exist as a record:
 * without one, "what validation evidence did this approval rely on?" is
 * unanswerable and the validation-run reopening path can never fire.
 *
 * No update method, deliberately. Re-running validation produces a **new** run;
 * editing an old one would rewrite the evidence a signature already covered.
 */
export interface ValidationRunRepository {
  insert(run: ValidationRun): Promise<void>;
  get(id: string): Promise<ValidationRun | undefined>;
  /**
   * The most recent run over a requirement set for a gate.
   *
   * This is what `reopenIfInvalidated` compares a signature against: if the
   * latest run is not the run that was signed, the approval rests on superseded
   * evidence and the gate reopens by itself.
   */
  latestForSet(requirementSetId: string, gate: GateCode): Promise<ValidationRun | undefined>;
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
  readonly requirements: RequirementRepository;
  readonly reconciliation: ReconciliationRepository;
  readonly validationRuns: ValidationRunRepository;
}

/**
 * Canonical entities, conflict candidates and relations — INSERT-ONLY (V6).
 *
 * No update method and no delete method, and **no `setDecision`**: the only
 * mutation worth having here is the one **Q1** forbids V6 to make. A conflict is
 * decided by a human in V7, through a surface this port deliberately does not
 * offer — and migration 009 refuses a non-null `decision` on insert, so the
 * boundary survives a direct connection too.
 */
export interface ReconciliationRepository {
  insertCanonicalEntity(
    entity: CanonicalEntity,
    aliases: readonly CanonicalEntityAlias[],
  ): Promise<void>;
  canonicalEntitiesForSet(requirementSetId: string): Promise<readonly CanonicalEntity[]>;
  aliasesForSet(requirementSetId: string): Promise<readonly CanonicalEntityAlias[]>;

  insertConflict(conflict: Conflict, participants: readonly ConflictParticipant[]): Promise<void>;
  conflictsForSet(requirementSetId: string): Promise<readonly Conflict[]>;
  participantsForSet(requirementSetId: string): Promise<readonly ConflictParticipant[]>;

  /** V7: a human decides a conflict. The **only** path to a non-null `decision`. */
  decideConflict(
    conflictId: string,
    decision: { decision: string; decidedBy: string; decidedAt: string; rationale: string },
  ): Promise<void>;
  /** V7: a human confirms or rejects an AI-proposed equivalence (**U4**). */
  setEquivalenceVerdict(
    canonicalEntityId: string,
    verdict: { confirmedBy?: string; confirmedAt?: string; rejectedBy?: string; rejectedAt?: string },
  ): Promise<void>;

  insertRelation(relation: RequirementRelation): Promise<void>;
  relationsForProject(projectId: string): Promise<readonly RequirementRelation[]>;

  /** **J9** applied again: rejected candidates are retained in full. */
  insertRejection(rejection: ReconciliationRejection): Promise<void>;
  rejectionsForSet(requirementSetId: string): Promise<readonly ReconciliationRejection[]>;
}

/**
 * Requirement proposals — INSERT-ONLY (**J4**, ADR-0016, ADR-0032).
 *
 * There is no update method and no delete method, and that is the port's main
 * assertion: a corrected proposal is a NEW proposal, exactly as a corrected piece
 * of evidence is new evidence one level down. In particular there is **no
 * `setStatus`**, because the only statuses worth setting are the ones **J4**
 * forbids V5 to write.
 *
 * `insertProposal` takes the requirement, its evidence links and its flags
 * together, because a requirement without its links violates invariant D2 the
 * instant it exists and a partially written proposal is worse than none.
 */
export interface RequirementRepository {
  createSet(set: RequirementSet): Promise<void>;
  getSet(id: string): Promise<RequirementSet | undefined>;
  listSets(projectId: string): Promise<readonly RequirementSet[]>;
  /** The next `REQ-####` for a project, from the high-water mark (invariant D15). */
  nextRequirementNumber(projectId: string): Promise<number>;

  // --- addressing a requirement (H4, decision K4) --------------------------
  //
  // Every method that names a single requirement takes `projectId` FIRST.
  //
  // A requirement's identity is `(projectId, id)`; `REQ-0001` alone does not name
  // one, because two projects legitimately hold a `REQ-0001`. Passing the project
  // is therefore not a filter and not a permission check — it is half the key.
  //
  // The practical effect is that project ownership stopped being a convention the
  // command layer remembers to apply (it was checked at four call sites and could
  // be forgotten at a fifth) and became something the caller cannot express
  // wrongly without the compiler saying so.

  insertProposal(
    requirement: Requirement,
    evidence: readonly RequirementEvidenceLink[],
    flags: readonly RequirementFlag[],
  ): Promise<void>;

  get(projectId: string, id: string): Promise<Requirement | undefined>;
  listForSet(requirementSetId: string): Promise<readonly Requirement[]>;
  listForProject(projectId: string): Promise<readonly Requirement[]>;
  evidenceFor(projectId: string, requirementId: string): Promise<readonly RequirementEvidenceLink[]>;
  evidenceForSet(requirementSetId: string): Promise<readonly RequirementEvidenceLink[]>;
  flagsForSet(requirementSetId: string): Promise<readonly RequirementFlag[]>;

  /** **J9:** rejected proposals are retained in full, never summarised away. */
  insertRejection(rejection: RequirementRejection): Promise<void>;
  rejectionsForSet(requirementSetId: string): Promise<readonly RequirementRejection[]>;

  // --- the human workspace (V7) -------------------------------------------

  /**
   * Replace the current version of a requirement with a new one (**U2-a**).
   *
   * Not an update: the superseded version is **copied to history first**, and the
   * row that remains is a new version of the same id. An in-place edit would
   * silently change what a signed baseline hash covered, which is the one thing
   * [ADR-0017](../../../docs/adr/ADR-0017-approval-as-baseline-signature.md) exists
   * to prevent.
   *
   * Evidence links are **inherited** by the caller and passed in, so a revision
   * cannot sever provenance by omission.
   */
  reviseRequirement(
    next: Requirement,
    evidence: readonly RequirementEvidenceLink[],
  ): Promise<void>;

  /**
   * Insert a **human-originated inferred** requirement (**U8-a**).
   *
   * Deliberately separate from `insertProposal`, which requires evidence links: an
   * inferred requirement carries an `inferenceRationale` instead. Two paths so
   * neither can be used to bypass the other's rule — a proposal cannot arrive
   * without evidence, and an inference cannot arrive without a reason.
   */
  insertInferred(requirement: Requirement): Promise<void>;

  /** Move a requirement between review states. **Never to `approved`** — that is `approveRequirements`. */
  setReviewStatus(projectId: string, requirementId: string, status: Requirement['status']): Promise<void>;

  /**
   * The G1 approval transaction, and **the only path to `approved`** (**U1**).
   *
   * Takes the whole set at once because a baseline is approved as a set, never
   * requirement by requirement — a set of individually approved requirements may
   * be jointly invalid (ADR-0017's rejected alternative).
   */
  approveRequirements(
    projectId: string,
    requirementIds: readonly string[],
    approval: { approvedBy: string; approvedAt: string; baselineId: string },
  ): Promise<void>;

  /** Confirm a LOW-confidence inferred requirement — G1 precondition 6. */
  confirmInference(projectId: string, requirementId: string, by: string, at: string): Promise<void>;

  versionsFor(projectId: string, requirementId: string): Promise<readonly { version: number; text: string; changeReason?: string }[]>;

  resolveFlag(flagId: string, resolution: string, by: string, at: string): Promise<void>;
  flagsForProject(projectId: string): Promise<readonly RequirementFlag[]>;

  insertQuestion(question: OpenQuestion): Promise<void>;
  answerQuestion(
    id: string,
    answer: { answer: string; answeredBy: string; answeredAt: string; becameSourceUnitId?: string },
  ): Promise<void>;
  questionsForSet(requirementSetId: string): Promise<readonly OpenQuestion[]>;
  questionForCause(requirementSetId: string, causeKind: string, causeId: string): Promise<OpenQuestion | undefined>;

  acknowledgePolicySlot(ack: PolicyAcknowledgement): Promise<void>;
  policyAcknowledgementsForSet(requirementSetId: string): Promise<readonly PolicyAcknowledgement[]>;

  /**
   * Record that data-governance policy prevented a slot from being analysed.
   *
   * Written by the populate pass when the egress gate refuses, so that
   * `blocked_by_policy` survives to the next read. Without it a refused pass came
   * back as an `empty` slot and *"we were not permitted to read this"* silently
   * became *"the sources do not say"* — the one distinction data-governance.md
   * §3.1 exists to preserve, and the reason `L4-REQ-007` could never fire.
   */
  recordSlotPolicyBlock(block: SlotPolicyBlock): Promise<void>;
  slotPolicyBlocksForSet(requirementSetId: string): Promise<readonly SlotPolicyBlock[]>;
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

/**
 * The `FramePopulator` port — `POPULATE_FRAME` (V5).
 *
 * One call per pass, so the caller owns the partition (**J7**) and the port stays
 * a single request/response. The populator returns **proposals**, never
 * requirements: checking the citations, applying the gate, computing confidence
 * and deciding what is written are the command's job, because they are the part
 * that must not depend on a provider behaving well.
 */
export interface PopulateFrameRequest {
  readonly projectId: string;
  readonly passId: string;
  readonly passTitle: string;
  /** The slot catalogue for this pass, rendered from `@asdp/raf`. */
  readonly slotBrief: string;
  /** The evidence this pass may cite. Ids and verbatim text only. */
  readonly evidence: readonly { readonly evidenceItemId: string; readonly verbatimText: string }[];
  /** Batch identity, for the interaction record (E4). */
  readonly batch: {
    readonly batchId: string;
    readonly index: number;
    readonly total: number;
    readonly strategyVersion: string;
  };
  readonly classification: Classification;
  readonly languageHints: readonly string[];
  readonly correlationId?: string;
}

export type PopulateFrameOutcome =
  | {
      readonly kind: 'populated';
      readonly population: FramePopulation;
      readonly interaction: AiInteraction;
    }
  | {
      readonly kind: 'refused';
      readonly reason: string;
      /**
       * **Why** it was refused, and it is not decoration.
       *
       * A `policy` refusal means the egress gate would not let this content
       * leave — *"we were not permitted to read this"*, which is recorded as a
       * `blocked_by_policy` slot and must be acknowledged at G1 (`L4-REQ-007`).
       *
       * `unavailable` and `malformed` are **not** that. No provider being wired,
       * or a provider answering with nonsense, says nothing about data
       * governance, and recording either as a policy block would put a claim on
       * the record that nobody made — the precise confusion data-governance.md
       * §3.1 exists to prevent, inverted.
       */
      readonly refusalKind: 'policy' | 'unavailable' | 'malformed';
      readonly degradations: readonly string[];
      readonly options: readonly string[];
      readonly interaction?: AiInteraction;
    };

export interface FramePopulator {
  readonly id: string;
  populate(request: PopulateFrameRequest): Promise<PopulateFrameOutcome>;
}

/**
 * The `CANONICALISE_ENTITIES` port (V6).
 *
 * One call per entity **kind**, so the caller owns the partition and a refusal
 * degrades one kind rather than the run. The canonicaliser returns **merge
 * candidates**, never merges: checking membership, kind, classification and
 * legality is the command's job, because it is the part that must not depend on a
 * provider behaving well.
 */
export interface CanonicaliseRequest {
  readonly projectId: string;
  readonly kind: string;
  /** Surface forms this pass may group. Anything else is not groupable. */
  readonly surfaceForms: readonly string[];
  readonly classification: Classification;
  readonly languageHints: readonly string[];
  readonly correlationId?: string;
}

export type CanonicaliseOutcome =
  | {
      readonly kind: 'canonicalised';
      readonly canonicalisation: EntityCanonicalisation;
      readonly interaction: AiInteraction;
    }
  | {
      readonly kind: 'refused';
      readonly reason: string;
      readonly degradations: readonly string[];
      readonly options: readonly string[];
      readonly interaction?: AiInteraction;
    };

export interface Canonicaliser {
  readonly id: string;
  canonicalise(request: CanonicaliseRequest): Promise<CanonicaliseOutcome>;
}

/**
 * The `RECONCILE_SOURCES` port (V6).
 *
 * One call per RAF slot. It **explains, it does not settle**: precedence is
 * computed deterministically by the command, and a human decides.
 */
export interface ReconcileRequest {
  readonly projectId: string;
  readonly rafSlot: string;
  readonly requirements: readonly { readonly requirementId: string; readonly text: string }[];
  readonly classification: Classification;
  readonly languageHints: readonly string[];
  readonly correlationId?: string;
}

export type ReconcileOutcome =
  | {
      readonly kind: 'reconciled';
      readonly reconciliation: SourceReconciliation;
      readonly interaction: AiInteraction;
    }
  | {
      readonly kind: 'refused';
      readonly reason: string;
      readonly degradations: readonly string[];
      readonly options: readonly string[];
      readonly interaction?: AiInteraction;
    };

export interface Reconciler {
  readonly id: string;
  reconcile(request: ReconcileRequest): Promise<ReconcileOutcome>;
}
