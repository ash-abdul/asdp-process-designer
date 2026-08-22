/**
 * In-memory repository adapter.
 *
 * The Phase 1 implementation of the repository ports. Insert-only and
 * append-only semantics are enforced here exactly as they will be in Postgres,
 * so the domain behaviour above the port is identical in both adapters.
 */

import type {
  Approval,
  AuditEvent,
  Baseline,
  Gate,
  GateCode,
  Project,
} from '@asdp/schemas';
import {
  ConcurrencyError,
  NotFoundError,
  type ApprovalRepository,
  type AuditRepository,
  type BaselineRepository,
  type Clock,
  type DependencyProbe,
  type GateRepository,
  type HealthReport,
  type IdGenerator,
  type ProjectRepository,
  type Repositories,
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

export function createMemoryRepositories(): Repositories {
  return {
    projects: new MemoryProjectRepository(),
    gates: new MemoryGateRepository(),
    baselines: new MemoryBaselineRepository(),
    approvals: new MemoryApprovalRepository(),
    audit: new MemoryAuditRepository(),
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
