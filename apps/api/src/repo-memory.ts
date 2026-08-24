/**
 * In-memory repository adapter.
 *
 * The Phase 1 implementation of the repository ports. Insert-only and
 * append-only semantics are enforced here exactly as they will be in Postgres,
 * so the domain behaviour above the port is identical in both adapters.
 */

import type {
  AiInteraction,
  Approval,
  AuditEvent,
  Baseline,
  EvidenceItem,
  Gate,
  GateCode,
  PageImage,
  Project,
  CanonicalEntity,
  CanonicalEntityAlias,
  Conflict,
  ConflictParticipant,
  ReconciliationRejection,
  Requirement,
  RequirementEvidenceLink,
  RequirementRelation,
  RequirementFlag,
  RequirementRejection,
  RequirementSet,
  Source,
  SourceStatus,
  SourceUnit,
} from '@asdp/schemas';
import {
  ConcurrencyError,
  NotFoundError,
  type AiInteractionRepository,
  type ApprovalRepository,
  type AuditRepository,
  type BaselineRepository,
  type ReconciliationRepository,
  type RequirementRepository,
  type Clock,
  type DependencyProbe,
  type EvidenceRepository,
  type GateRepository,
  type HealthReport,
  type PageImageRepository,
  type IdGenerator,
  type ProjectRepository,
  type Repositories,
  type SourceRepository,
  type SourceTextRecord,
  type SourceUnitRepository,
  type Versioned,
} from './ports.ts';

class MemoryProjectRepository implements ProjectRepository {
  private readonly byId = new Map<string, Project>();
  private readonly byKey = new Map<string, string>();

  async create(project: Project): Promise<void> {
    if (this.byId.has(project.id)) throw new Error(`project ${project.id} already exists`);
    if (this.byKey.has(project.key)) throw new Error(`project key '${project.key}' already in use`);
    this.byId.set(project.id, project);
    this.byKey.set(project.key, project.id);
  }
  async get(id: string): Promise<Project | undefined> {
    return this.byId.get(id);
  }
  async getByKey(key: string): Promise<Project | undefined> {
    const id = this.byKey.get(key);
    return id === undefined ? undefined : this.byId.get(id);
  }
  async list(): Promise<readonly Project[]> {
    return [...this.byId.values()];
  }
}

class MemoryGateRepository implements GateRepository {
  private readonly gates = new Map<string, Versioned<Gate>>();

  private key(projectId: string, code: GateCode): string {
    return `${projectId}:${code}`;
  }

  async putAll(projectId: string, gates: readonly Gate[]): Promise<void> {
    for (const g of gates) {
      this.gates.set(this.key(projectId, g.code), { value: g, version: 1 });
    }
  }
  async get(projectId: string, code: GateCode): Promise<Versioned<Gate> | undefined> {
    return this.gates.get(this.key(projectId, code));
  }
  async list(projectId: string): Promise<readonly Gate[]> {
    return [...this.gates.entries()]
      .filter(([k]) => k.startsWith(`${projectId}:`))
      .map(([, v]) => v.value);
  }
  async update(projectId: string, gate: Gate, expectedVersion: number): Promise<void> {
    const k = this.key(projectId, gate.code);
    const current = this.gates.get(k);
    if (current === undefined) throw new NotFoundError(`gate ${gate.code} not found`);
    if (current.version !== expectedVersion) {
      throw new ConcurrencyError(
        `gate ${gate.code} was modified concurrently (expected v${expectedVersion}, found v${current.version})`,
      );
    }
    this.gates.set(k, { value: gate, version: current.version + 1 });
  }
}

/** Insert-only: no update or delete method exists (invariant D8). */
class MemoryBaselineRepository implements BaselineRepository {
  private readonly byId = new Map<string, Baseline>();

  async insert(baseline: Baseline): Promise<void> {
    if (this.byId.has(baseline.id)) {
      throw new Error(`baseline ${baseline.id} already exists; baselines are insert-only`);
    }
    this.byId.set(baseline.id, baseline);
  }
  async get(id: string): Promise<Baseline | undefined> {
    return this.byId.get(id);
  }
  async getByHash(projectId: string, contentHash: string): Promise<Baseline | undefined> {
    for (const b of this.byId.values()) {
      if (b.projectId === projectId && b.contentHash === contentHash) return b;
    }
    return undefined;
  }
  async list(projectId: string): Promise<readonly Baseline[]> {
    return [...this.byId.values()].filter((b) => b.projectId === projectId);
  }
}

/** Insert-only (invariant D8). */
class MemoryApprovalRepository implements ApprovalRepository {
  private readonly all: Approval[] = [];

  async insert(approval: Approval): Promise<void> {
    if (this.all.some((a) => a.id === approval.id)) {
      throw new Error(`approval ${approval.id} already exists; approvals are insert-only`);
    }
    this.all.push(approval);
  }
  async listForGate(projectId: string, gate: GateCode): Promise<readonly Approval[]> {
    return this.all.filter((a) => a.projectId === projectId && a.gate === gate);
  }
}

/** Append-only. No update path, no delete path, no purge (ADR-0032). */
class MemoryAuditRepository implements AuditRepository {
  private readonly events: AuditEvent[] = [];

  async append(event: AuditEvent): Promise<void> {
    this.events.push(event);
  }
  async list(projectId?: string): Promise<readonly AuditEvent[]> {
    return projectId === undefined
      ? [...this.events]
      : this.events.filter((e) => e.projectId === projectId);
  }
  async count(): Promise<number> {
    return this.events.length;
  }
}

/**
 * Sources. Content-identifying fields are write-once, as in SQL: the only
 * mutators are the two the port exposes.
 */
class MemorySourceRepository implements SourceRepository {
  private readonly byId = new Map<string, Source>();
  private readonly text = new Map<string, string>();

  async insert(source: Source, text: SourceTextRecord): Promise<void> {
    if (this.byId.has(source.id)) throw new Error(`source ${source.id} already exists`);
    for (const existing of this.byId.values()) {
      if (existing.projectId === source.projectId && existing.sha256 === source.sha256) {
        throw new Error(
          `a source with hash ${source.sha256.slice(0, 12)}… already exists in project ` +
            `${source.projectId}; identical bytes are ingested once`,
        );
      }
    }
    this.byId.set(source.id, source);
    this.text.set(text.sourceId, text.text);
  }
  async get(id: string): Promise<Source | undefined> {
    return this.byId.get(id);
  }
  async getByHash(projectId: string, sha256: string): Promise<Source | undefined> {
    for (const s of this.byId.values()) {
      if (s.projectId === projectId && s.sha256 === sha256) return s;
    }
    return undefined;
  }
  async list(projectId: string): Promise<readonly Source[]> {
    return [...this.byId.values()]
      .filter((s) => s.projectId === projectId)
      .sort(
        (a, b) =>
          b.authorityRank - a.authorityRank ||
          (a.uploadedAt < b.uploadedAt ? -1 : a.uploadedAt > b.uploadedAt ? 1 : 0) ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
  }
  async getText(sourceId: string): Promise<string | undefined> {
    return this.text.get(sourceId);
  }
  async setAuthorityRank(sourceId: string, rank: number): Promise<void> {
    const held = this.byId.get(sourceId);
    if (held === undefined) throw new NotFoundError(`unknown source ${sourceId}`);
    this.byId.set(sourceId, { ...held, authorityRank: rank });
  }
  async setStatus(sourceId: string, status: SourceStatus, parseError?: string): Promise<void> {
    const held = this.byId.get(sourceId);
    if (held === undefined) throw new NotFoundError(`unknown source ${sourceId}`);
    const next: Source = { ...held, status };
    if (parseError === undefined) delete (next as { parseError?: string }).parseError;
    else (next as { parseError?: string }).parseError = parseError;
    this.byId.set(sourceId, next);
  }
}

/** Insert-only: units are re-extracted under a new version, never edited. */
class MemorySourceUnitRepository implements SourceUnitRepository {
  private readonly byId = new Map<string, SourceUnit>();

  async insertAll(units: readonly SourceUnit[]): Promise<void> {
    for (const unit of units) {
      if (this.byId.has(unit.id)) {
        throw new Error(`source unit ${unit.id} already exists; units are insert-only`);
      }
      this.byId.set(unit.id, unit);
    }
  }
  async get(id: string): Promise<SourceUnit | undefined> {
    return this.byId.get(id);
  }
  async listForSource(sourceId: string): Promise<readonly SourceUnit[]> {
    return [...this.byId.values()]
      .filter((u) => u.sourceId === sourceId)
      .sort((a, b) => a.ordinal - b.ordinal);
  }
  async listForProject(projectId: string): Promise<readonly SourceUnit[]> {
    return [...this.byId.values()]
      .filter((u) => u.projectId === projectId)
      .sort(
        (a, b) =>
          (a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0) ||
          a.ordinal - b.ordinal,
      );
  }
}

/** Insert-only. A corrected image is a NEW source, never an edit. */
class MemoryPageImageRepository implements PageImageRepository {
  private readonly byId = new Map<string, PageImage>();

  async insert(image: PageImage): Promise<void> {
    if (this.byId.has(image.id)) {
      throw new Error(`page image ${image.id} already exists; images are insert-only`);
    }
    for (const held of this.byId.values()) {
      if (held.sourceId === image.sourceId && held.pageNo === image.pageNo) {
        throw new Error(
          `page ${image.pageNo} of source ${image.sourceId} already exists; images are insert-only`,
        );
      }
    }
    this.byId.set(image.id, image);
  }
  async get(id: string): Promise<PageImage | undefined> {
    return this.byId.get(id);
  }
  async listForSource(sourceId: string): Promise<readonly PageImage[]> {
    return [...this.byId.values()]
      .filter((i) => i.sourceId === sourceId)
      .sort((a, b) => a.pageNo - b.pageNo);
  }
}

/** Insert-only (invariants D1, D8). No update, no delete. */
class MemoryEvidenceRepository implements EvidenceRepository {
  private readonly byId = new Map<string, EvidenceItem>();

  async insert(item: EvidenceItem): Promise<void> {
    if (this.byId.has(item.id)) {
      throw new Error(`evidence ${item.id} already exists; evidence is insert-only`);
    }
    // Invariant D1, mirrored from the SQL check constraint: an unverified anchor
    // is not persistable in either adapter.
    if (!item.anchorVerified) {
      throw new Error(
        `evidence ${item.id} has anchorVerified=false; invariant D1 requires a verified anchor`,
      );
    }
    this.byId.set(item.id, item);
  }
  async get(id: string): Promise<EvidenceItem | undefined> {
    return this.byId.get(id);
  }
  async listForProject(projectId: string): Promise<readonly EvidenceItem[]> {
    return [...this.byId.values()]
      .filter((e) => e.projectId === projectId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  }
  async listForSource(sourceId: string): Promise<readonly EvidenceItem[]> {
    return [...this.byId.values()]
      .filter((e) => e.sourceId === sourceId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  }
}


/** Append-only, like its SQL counterpart: no update, no delete (invariant I8). */
class MemoryAiInteractionRepository implements AiInteractionRepository {
  private readonly byId = new Map<string, AiInteraction>();

  async insert(interaction: AiInteraction): Promise<void> {
    if (this.byId.has(interaction.id)) {
      throw new Error(`ai interaction ${interaction.id} already exists; interactions are append-only`);
    }
    this.byId.set(interaction.id, interaction);
  }
  async get(id: string): Promise<AiInteraction | undefined> {
    return this.byId.get(id);
  }
  async listForProject(projectId: string): Promise<readonly AiInteraction[]> {
    return [...this.byId.values()]
      .filter((i) => i.projectId === projectId)
      .sort((a, b) => (a.at === b.at ? a.id.localeCompare(b.id) : a.at.localeCompare(b.at)));
  }
  async listForSource(sourceId: string): Promise<readonly AiInteraction[]> {
    return [...this.byId.values()]
      .filter((i) => i.sourceId === sourceId)
      .sort((a, b) => (a.at === b.at ? a.id.localeCompare(b.id) : a.at.localeCompare(b.at)));
  }
  async setVerdict(id: string, verdict: AiInteraction['humanVerdict']): Promise<void> {
    const held = this.byId.get(id);
    if (held !== undefined) this.byId.set(id, { ...held, humanVerdict: verdict });
  }
}

/**
 * Requirement proposals — INSERT-ONLY, exactly as in SQL (**J4**).
 *
 * No update method and no delete method, so the in-memory adapter cannot do
 * something the database would refuse. An adapter that were more permissive than
 * its SQL counterpart would let a test prove a behaviour production cannot have.
 */
class MemoryRequirementRepository implements RequirementRepository {
  private readonly sets = new Map<string, RequirementSet>();
  private readonly requirements = new Map<string, Requirement>();
  private readonly links: RequirementEvidenceLink[] = [];
  private readonly flags: RequirementFlag[] = [];
  private readonly rejections: RequirementRejection[] = [];

  async createSet(set: RequirementSet): Promise<void> {
    if (this.sets.has(set.id)) throw new Error(`requirement set ${set.id} already exists`);
    this.sets.set(set.id, set);
  }
  async getSet(id: string): Promise<RequirementSet | undefined> {
    return this.sets.get(id);
  }
  async listSets(projectId: string): Promise<readonly RequirementSet[]> {
    return [...this.sets.values()]
      .filter((s) => s.projectId === projectId)
      .sort((a, b) => b.version - a.version);
  }
  async nextRequirementNumber(projectId: string): Promise<number> {
    // The project-wide high-water mark, not a per-set count: identifiers are
    // never reused, even after rejection (invariant D15).
    const high = [...this.requirements.values()]
      .filter((r) => r.projectId === projectId)
      .reduce((max, r) => Math.max(max, Number(r.id.slice(4))), 0);
    return high + 1;
  }

  async insertProposal(
    requirement: Requirement,
    evidence: readonly RequirementEvidenceLink[],
    flags: readonly RequirementFlag[],
  ): Promise<void> {
    if (evidence.length === 0) {
      throw new Error(
        `requirement ${requirement.id} cites no evidence; invariant D2 forbids persisting it`,
      );
    }
    if (this.requirements.has(requirement.id)) {
      throw new Error(`requirement ${requirement.id} already exists; ids are never reused (D15)`);
    }
    this.requirements.set(requirement.id, requirement);
    this.links.push(...evidence);
    this.flags.push(...flags);
  }

  async get(id: string): Promise<Requirement | undefined> {
    return this.requirements.get(id);
  }
  async listForSet(requirementSetId: string): Promise<readonly Requirement[]> {
    return [...this.requirements.values()]
      .filter((r) => r.requirementSetId === requirementSetId)
      .sort((a, b) => a.id.localeCompare(b.id));
  }
  async listForProject(projectId: string): Promise<readonly Requirement[]> {
    return [...this.requirements.values()]
      .filter((r) => r.projectId === projectId)
      .sort((a, b) => a.id.localeCompare(b.id));
  }
  async evidenceFor(requirementId: string): Promise<readonly RequirementEvidenceLink[]> {
    return this.links.filter((l) => l.requirementId === requirementId);
  }
  async evidenceForSet(requirementSetId: string): Promise<readonly RequirementEvidenceLink[]> {
    const ids = new Set((await this.listForSet(requirementSetId)).map((r) => r.id));
    return this.links.filter((l) => ids.has(l.requirementId));
  }
  async flagsForSet(requirementSetId: string): Promise<readonly RequirementFlag[]> {
    const ids = new Set((await this.listForSet(requirementSetId)).map((r) => r.id));
    return this.flags.filter((f) => ids.has(f.requirementId));
  }
  async insertRejection(rejection: RequirementRejection): Promise<void> {
    this.rejections.push(rejection);
  }
  async rejectionsForSet(requirementSetId: string): Promise<readonly RequirementRejection[]> {
    return this.rejections.filter((r) => r.requirementSetId === requirementSetId);
  }
}

/**
 * Canonicalisation and conflicts — INSERT-ONLY, exactly as in SQL (**Q1**).
 *
 * No update, no delete, and **no `setDecision`**. An in-memory adapter more
 * permissive than its SQL counterpart would let a test prove a behaviour
 * production cannot have.
 */
class MemoryReconciliationRepository implements ReconciliationRepository {
  private readonly entities: CanonicalEntity[] = [];
  private readonly aliases: CanonicalEntityAlias[] = [];
  private readonly conflicts: Conflict[] = [];
  private readonly participants: ConflictParticipant[] = [];
  private readonly relations: RequirementRelation[] = [];
  private readonly rejections: ReconciliationRejection[] = [];

  async insertCanonicalEntity(
    entity: CanonicalEntity,
    aliases: readonly CanonicalEntityAlias[],
  ): Promise<void> {
    if (aliases.length === 0) {
      throw new Error(`canonical entity ${entity.id} has no aliases`);
    }
    this.entities.push(entity);
    this.aliases.push(...aliases);
  }
  async canonicalEntitiesForSet(requirementSetId: string): Promise<readonly CanonicalEntity[]> {
    return this.entities.filter((e) => e.requirementSetId === requirementSetId);
  }
  async aliasesForSet(requirementSetId: string): Promise<readonly CanonicalEntityAlias[]> {
    const ids = new Set(
      this.entities.filter((e) => e.requirementSetId === requirementSetId).map((e) => e.id),
    );
    return this.aliases.filter((a) => ids.has(a.canonicalEntityId));
  }

  async insertConflict(
    conflict: Conflict,
    participants: readonly ConflictParticipant[],
  ): Promise<void> {
    if (conflict.decision !== undefined) {
      // Q1, in the adapter as well as in SQL: V6 cannot write a decided conflict.
      throw new Error(`conflict ${conflict.id} carries a decision; V6 writes candidates only (Q1)`);
    }
    this.conflicts.push(conflict);
    this.participants.push(...participants);
  }
  async conflictsForSet(requirementSetId: string): Promise<readonly Conflict[]> {
    return this.conflicts.filter((c) => c.requirementSetId === requirementSetId);
  }
  async participantsForSet(requirementSetId: string): Promise<readonly ConflictParticipant[]> {
    const ids = new Set(
      this.conflicts.filter((c) => c.requirementSetId === requirementSetId).map((c) => c.id),
    );
    return this.participants.filter((p) => ids.has(p.conflictId));
  }

  async insertRelation(relation: RequirementRelation): Promise<void> {
    const held = this.relations.some(
      (r) => r.fromId === relation.fromId && r.toId === relation.toId && r.kind === relation.kind,
    );
    if (!held) this.relations.push(relation);
  }
  async relationsForProject(projectId: string): Promise<readonly RequirementRelation[]> {
    return this.relations.filter((r) => r.projectId === projectId);
  }

  async insertRejection(rejection: ReconciliationRejection): Promise<void> {
    this.rejections.push(rejection);
  }
  async rejectionsForSet(requirementSetId: string): Promise<readonly ReconciliationRejection[]> {
    return this.rejections.filter((r) => r.requirementSetId === requirementSetId);
  }
}

export function createMemoryRepositories(): Repositories {
  return {
    projects: new MemoryProjectRepository(),
    gates: new MemoryGateRepository(),
    baselines: new MemoryBaselineRepository(),
    approvals: new MemoryApprovalRepository(),
    audit: new MemoryAuditRepository(),
    sources: new MemorySourceRepository(),
    sourceUnits: new MemorySourceUnitRepository(),
    evidence: new MemoryEvidenceRepository(),
    pageImages: new MemoryPageImageRepository(),
    aiInteractions: new MemoryAiInteractionRepository(),
    requirements: new MemoryRequirementRepository(),
    reconciliation: new MemoryReconciliationRepository(),
  };
}

/**
 * System clock. Lives in the application layer, never in a pure package — the
 * architecture checker forbids clock access there.
 */
export function systemClock(): Clock {
  return { nowIso: () => new Date().toISOString() };
}

/** Deterministic-per-process id generator. */
export function counterIdGenerator(): IdGenerator {
  const counters = new Map<string, number>();
  return {
    next(prefix: string): string {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-${String(n).padStart(4, '0')}`;
    },
  };
}

/** Readiness probe for the in-memory adapter: always reachable. */
export function memoryDependencyProbe(): DependencyProbe {
  return {
    async check(): Promise<HealthReport> {
      return { ok: true, dependencies: [{ name: 'repository(memory)', ok: true }] };
    },
  };
}
