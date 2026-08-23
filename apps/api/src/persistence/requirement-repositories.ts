/**
 * SQL repository adapter for requirement proposals (V5).
 *
 * ADR-0035: plain parameterised SQL. Every parameter is passed in the array —
 * never interpolated — and the checker rule `sql-injection-guard` fails the build
 * if that discipline slips.
 *
 * In its own module rather than appended to `intake-repositories.ts`, for the same
 * reason that file exists: no single file should become the place where all
 * persistence lives. The factory wires it alongside the others over the same
 * handle, so a transaction still spans intake and requirements.
 *
 * **No update method and no delete method anywhere in this file.** That is not an
 * omission to be filled in later: a requirement proposal is insert-only (**J4**,
 * ADR-0016, ADR-0032), and the only statuses worth updating are the ones V5 is
 * forbidden to write. Immutability enforced in one place only is immutability by
 * convention, so migration 008 carries the same rule in SQL.
 */

import type {
  Classification,
  Requirement,
  RequirementEvidenceLink,
  RequirementFlag,
  RequirementRejection,
  RequirementSet,
} from '@asdp/schemas';
import type { RequirementRepository } from '../ports.ts';
import { UniqueViolationError, type Db } from './db.ts';

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function str(value: unknown): string {
  return typeof value === 'string' ? value : String(value);
}

function optional(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : String(value);
}

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : str(value);
}

function mapSet(row: Record<string, unknown>): RequirementSet {
  return {
    id: str(row.id),
    projectId: str(row.project_id),
    version: Number(row.version),
    status: str(row.status) as RequirementSet['status'],
    rafVersion: str(row.raf_version),
    createdBy: str(row.created_by),
    createdAt: iso(row.created_at),
  };
}

function mapRequirement(row: Record<string, unknown>): Requirement {
  const degradations = Array.isArray(row.degradations) ? row.degradations.map(String) : [];
  return {
    id: str(row.id),
    requirementSetId: str(row.requirement_set_id),
    projectId: str(row.project_id),
    text: str(row.text),
    originalAiText: str(row.original_ai_text),
    category: str(row.category) as Requirement['category'],
    rafSlot: str(row.raf_slot),
    epistemicLevel: str(row.epistemic_level) as Requirement['epistemicLevel'],
    derivation: str(row.derivation) as Requirement['derivation'],
    computedConfidence: Number(row.computed_confidence),
    confidenceBand: str(row.confidence_band) as Requirement['confidenceBand'],
    confidenceFunctionVersion: str(row.confidence_function_version),
    humanConfirmationRequired: row.human_confirmation_required === true,
    status: str(row.status) as Requirement['status'],
    generatedBy: str(row.generated_by) as Requirement['generatedBy'],
    ...(optional(row.ai_interaction_id) === undefined
      ? {}
      : { aiInteractionId: str(row.ai_interaction_id) }),
    ...(optional(row.prompt_version) === undefined
      ? {}
      : { promptVersion: str(row.prompt_version) }),
    ...(optional(row.provider_id) === undefined ? {} : { providerId: str(row.provider_id) }),
    ...(optional(row.model_id) === undefined ? {} : { modelId: str(row.model_id) }),
    ...(optional(row.capability_tier) === undefined
      ? {}
      : { capabilityTier: str(row.capability_tier) }),
    degradations,
    ...(optional(row.frame_pass) === undefined ? {} : { framePass: str(row.frame_pass) }),
    classification: str(row.classification) as Classification,
    language: str(row.language),
    createdBy: str(row.created_by),
    createdAt: iso(row.created_at),
  };
}

function mapLink(row: Record<string, unknown>): RequirementEvidenceLink {
  return {
    requirementId: str(row.requirement_id),
    evidenceItemId: str(row.evidence_item_id),
    contribution: str(row.contribution) as RequirementEvidenceLink['contribution'],
  };
}

function mapFlag(row: Record<string, unknown>): RequirementFlag {
  return {
    id: str(row.id),
    requirementId: str(row.requirement_id),
    projectId: str(row.project_id),
    kind: str(row.kind) as RequirementFlag['kind'],
    severity: str(row.severity) as RequirementFlag['severity'],
    detail: str(row.detail),
    raisedBy: str(row.raised_by) as RequirementFlag['raisedBy'],
    createdAt: iso(row.created_at),
  };
}

function mapRejection(row: Record<string, unknown>): RequirementRejection {
  return {
    id: str(row.id),
    projectId: str(row.project_id),
    requirementSetId: str(row.requirement_set_id),
    reason: str(row.reason) as RequirementRejection['reason'],
    detail: str(row.detail),
    proposedText: str(row.proposed_text),
    ...(optional(row.proposed_slot) === undefined ? {} : { proposedSlot: str(row.proposed_slot) }),
    citedEvidenceIds: Array.isArray(row.cited_evidence_ids)
      ? row.cited_evidence_ids.map(String)
      : [],
    framePass: str(row.frame_pass),
    ...(optional(row.ai_interaction_id) === undefined
      ? {}
      : { aiInteractionId: str(row.ai_interaction_id) }),
    classification: str(row.classification) as Classification,
    createdAt: iso(row.created_at),
  };
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

class SqlRequirementRepository implements RequirementRepository {
  constructor(private readonly db: Db) {}

  async createSet(set: RequirementSet): Promise<void> {
    try {
      await this.db.query(
        `insert into requirement_set (id, project_id, version, status, raf_version,
                                      created_by, created_at)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [set.id, set.projectId, set.version, set.status, set.rafVersion, set.createdBy, set.createdAt],
      );
    } catch (err) {
      if (err instanceof UniqueViolationError) {
        throw new Error(
          `requirement set version ${set.version} already exists for project ${set.projectId}; ` +
            'sets are insert-only and versions are never reused',
        );
      }
      throw err;
    }
  }

  async getSet(id: string): Promise<RequirementSet | undefined> {
    const r = await this.db.query('select * from requirement_set where id = $1', [id]);
    const row = r.rows[0];
    return row === undefined ? undefined : mapSet(row);
  }

  async listSets(projectId: string): Promise<readonly RequirementSet[]> {
    const r = await this.db.query(
      'select * from requirement_set where project_id = $1 order by version desc',
      [projectId],
    );
    return r.rows.map(mapSet);
  }

  /**
   * The next `REQ-####` for a project.
   *
   * Read from the **high-water mark across the project**, not from a per-set
   * count: invariant D15 says identifiers are never reused, even after rejection,
   * so numbering must not restart when a new set begins. Read inside the caller's
   * transaction, which is what makes two concurrent passes allocate different
   * numbers rather than the same one.
   */
  async nextRequirementNumber(projectId: string): Promise<number> {
    const r = await this.db.query(
      `select coalesce(max(cast(substring(id from 5) as integer)), 0) as high
         from requirement where project_id = $1`,
      [projectId],
    );
    const row = r.rows[0];
    return (row === undefined ? 0 : Number(row.high)) + 1;
  }

  /**
   * Write a proposal, its evidence links and its flags as one act.
   *
   * One method rather than three, for the reason `SourceRepository.insert` takes
   * a source and its text together: a requirement without its links violates
   * invariant **D2** the instant it exists, and a partially written proposal is
   * worse than none because it looks complete.
   */
  async insertProposal(
    requirement: Requirement,
    evidence: readonly RequirementEvidenceLink[],
    flags: readonly RequirementFlag[],
  ): Promise<void> {
    if (evidence.length === 0) {
      // Belt and braces with the gate: a requirement with no evidence is exactly
      // what D2 forbids, and the check constraint cannot see a child table.
      throw new Error(
        `requirement ${requirement.id} cites no evidence; invariant D2 forbids persisting it`,
      );
    }

    try {
      await this.db.query(
        `insert into requirement (id, requirement_set_id, project_id, text, original_ai_text,
                                  category, raf_slot, epistemic_level, derivation,
                                  computed_confidence, confidence_band, confidence_function_version,
                                  human_confirmation_required, status, generated_by,
                                  ai_interaction_id, prompt_version, provider_id, model_id,
                                  capability_tier, degradations, frame_pass, classification,
                                  language, created_by, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
                 $23,$24,$25,$26)`,
        [
          requirement.id, requirement.requirementSetId, requirement.projectId, requirement.text,
          requirement.originalAiText, requirement.category, requirement.rafSlot,
          requirement.epistemicLevel, requirement.derivation, requirement.computedConfidence,
          requirement.confidenceBand, requirement.confidenceFunctionVersion,
          requirement.humanConfirmationRequired, requirement.status, requirement.generatedBy,
          requirement.aiInteractionId ?? null, requirement.promptVersion ?? null,
          requirement.providerId ?? null, requirement.modelId ?? null,
          requirement.capabilityTier ?? null, requirement.degradations,
          requirement.framePass ?? null, requirement.classification, requirement.language,
          requirement.createdBy, requirement.createdAt,
        ],
      );
    } catch (err) {
      if (err instanceof UniqueViolationError) {
        throw new Error(
          `requirement ${requirement.id} already exists; requirement ids are never reused (D15)`,
        );
      }
      throw err;
    }

    for (const link of evidence) {
      await this.db.query(
        `insert into requirement_evidence (requirement_id, evidence_item_id, contribution)
         values ($1,$2,$3)`,
        [link.requirementId, link.evidenceItemId, link.contribution],
      );
    }

    for (const flag of flags) {
      await this.db.query(
        `insert into requirement_flag (id, requirement_id, project_id, kind, severity, detail,
                                       raised_by, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          flag.id, flag.requirementId, flag.projectId, flag.kind, flag.severity, flag.detail,
          flag.raisedBy, flag.createdAt,
        ],
      );
    }
  }

  async get(id: string): Promise<Requirement | undefined> {
    const r = await this.db.query('select * from requirement where id = $1', [id]);
    const row = r.rows[0];
    return row === undefined ? undefined : mapRequirement(row);
  }

  async listForSet(requirementSetId: string): Promise<readonly Requirement[]> {
    const r = await this.db.query(
      'select * from requirement where requirement_set_id = $1 order by id asc',
      [requirementSetId],
    );
    return r.rows.map(mapRequirement);
  }

  async listForProject(projectId: string): Promise<readonly Requirement[]> {
    const r = await this.db.query(
      'select * from requirement where project_id = $1 order by id asc',
      [projectId],
    );
    return r.rows.map(mapRequirement);
  }

  async evidenceFor(requirementId: string): Promise<readonly RequirementEvidenceLink[]> {
    const r = await this.db.query(
      `select * from requirement_evidence where requirement_id = $1
        order by contribution asc, evidence_item_id asc`,
      [requirementId],
    );
    return r.rows.map(mapLink);
  }

  async evidenceForSet(requirementSetId: string): Promise<readonly RequirementEvidenceLink[]> {
    const r = await this.db.query(
      `select re.* from requirement_evidence re
         join requirement r on r.id = re.requirement_id
        where r.requirement_set_id = $1
        order by re.requirement_id asc, re.evidence_item_id asc`,
      [requirementSetId],
    );
    return r.rows.map(mapLink);
  }

  async flagsForSet(requirementSetId: string): Promise<readonly RequirementFlag[]> {
    const r = await this.db.query(
      `select f.* from requirement_flag f
         join requirement r on r.id = f.requirement_id
        where r.requirement_set_id = $1
        order by f.requirement_id asc, f.id asc`,
      [requirementSetId],
    );
    return r.rows.map(mapFlag);
  }

  async insertRejection(rejection: RequirementRejection): Promise<void> {
    await this.db.query(
      `insert into requirement_rejection (id, project_id, requirement_set_id, reason, detail,
                                          proposed_text, proposed_slot, cited_evidence_ids,
                                          frame_pass, ai_interaction_id, classification, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        rejection.id, rejection.projectId, rejection.requirementSetId, rejection.reason,
        rejection.detail, rejection.proposedText, rejection.proposedSlot ?? null,
        rejection.citedEvidenceIds, rejection.framePass, rejection.aiInteractionId ?? null,
        rejection.classification, rejection.createdAt,
      ],
    );
  }

  async rejectionsForSet(requirementSetId: string): Promise<readonly RequirementRejection[]> {
    const r = await this.db.query(
      'select * from requirement_rejection where requirement_set_id = $1 order by created_at asc, id asc',
      [requirementSetId],
    );
    return r.rows.map(mapRejection);
  }
}

export function createSqlRequirementRepositories(db: Db): {
  readonly requirements: RequirementRepository;
} {
  return { requirements: new SqlRequirementRepository(db) };
}
