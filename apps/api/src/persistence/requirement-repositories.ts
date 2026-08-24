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
 * ## What V7 changed, and what it did not
 *
 * V5 had no update method at all, because the only statuses worth updating were
 * the ones it was forbidden to write. V7 adds exactly four kinds of mutation, each
 * corresponding to a human act, and **not one of them edits requirement text in
 * place**: a revision copies the old version to history and writes a new one
 * (**U2-a**), a review moves status between the review states, the G1 transaction
 * writes the approval columns (**U1**), and a flag or an inference is marked
 * resolved or confirmed.
 *
 * There is still **no delete**, and still no route to `approved` outside
 * `approveRequirements`. Migration 010 carries both rules in SQL, so neither
 * depends on this file being read carefully.
 */

import type {
  Classification,
  OpenQuestion,
  PolicyAcknowledgement,
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
    version: row.version === undefined || row.version === null ? 1 : Number(row.version),
    ...(optional(row.supersedes_id) === undefined ? {} : { supersedesId: str(row.supersedes_id) }),
    ...(optional(row.superseded_by_id) === undefined
      ? {}
      : { supersededById: str(row.superseded_by_id) }),
    ...(optional(row.change_reason) === undefined ? {} : { changeReason: str(row.change_reason) }),
    ...(optional(row.inference_rationale) === undefined
      ? {}
      : { inferenceRationale: str(row.inference_rationale) }),
    ...(optional(row.approved_by) === undefined ? {} : { approvedBy: str(row.approved_by) }),
    ...(optional(row.approved_at) === undefined ? {} : { approvedAt: iso(row.approved_at) }),
    ...(optional(row.approval_baseline_id) === undefined
      ? {}
      : { approvalBaselineId: str(row.approval_baseline_id) }),
    ...(optional(row.inference_confirmed_by) === undefined
      ? {}
      : { inferenceConfirmedBy: str(row.inference_confirmed_by) }),
    ...(optional(row.inference_confirmed_at) === undefined
      ? {}
      : { inferenceConfirmedAt: iso(row.inference_confirmed_at) }),
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
    ...(optional(row.resolution) === undefined ? {} : { resolution: str(row.resolution) }),
    ...(optional(row.resolved_by) === undefined ? {} : { resolvedBy: str(row.resolved_by) }),
    ...(optional(row.resolved_at) === undefined ? {} : { resolvedAt: iso(row.resolved_at) }),
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

  // -------------------------------------------------------------------------
  // The human workspace (V7)
  // -------------------------------------------------------------------------

  async reviseRequirement(
    next: Requirement,
    evidence: readonly RequirementEvidenceLink[],
  ): Promise<void> {
    if (evidence.length === 0) {
      // A revision that dropped its citations would sever provenance silently,
      // which is worse than refusing the edit (invariant D2).
      throw new Error(
        `requirement ${next.id} version ${next.version} cites no evidence; a revision may not ` +
          'sever provenance',
      );
    }

    // History FIRST. If this fails, nothing has changed; if the update failed
    // after it, the worst case is a duplicated history row, not a lost version.
    await this.db.query(
      `insert into requirement_version (requirement_id, version, requirement_set_id, project_id,
                                        text, original_ai_text, category, raf_slot, epistemic_level,
                                        derivation, status, change_reason, inference_rationale,
                                        classification, language, created_by, created_at,
                                        superseded_at, superseded_by)
       select id, version, requirement_set_id, project_id, text, original_ai_text, category,
              raf_slot, epistemic_level, derivation, status, change_reason, inference_rationale,
              classification, language, created_by, created_at, $2, $3
         from requirement where id = $1`,
      [next.id, next.createdAt, next.createdBy],
    );

    await this.db.query(
      `update requirement
          set text = $2, category = $3, raf_slot = $4, epistemic_level = $5, derivation = $6,
              computed_confidence = $7, confidence_band = $8, confidence_function_version = $9,
              human_confirmation_required = $10, status = $11, version = $12, supersedes_id = $13,
              change_reason = $14, inference_rationale = $15, generated_by = $16,
              classification = $17, language = $18,
              -- A NEW VERSION IS NOT APPROVED. Clearing the signature columns is
              -- what makes ADR-0017 hold in practice: the previous approval
              -- covered the previous content, and revising means the gate must be
              -- satisfied again rather than inherited.
              approved_by = null, approved_at = null, approval_baseline_id = null
        where id = $1`,
      [
        next.id, next.text, next.category, next.rafSlot, next.epistemicLevel, next.derivation,
        next.computedConfidence, next.confidenceBand, next.confidenceFunctionVersion,
        next.humanConfirmationRequired, next.status, next.version, next.supersedesId ?? null,
        next.changeReason ?? null, next.inferenceRationale ?? null, next.generatedBy,
        next.classification, next.language,
      ],
    );

    // Links are replaced wholesale from what the caller inherited, so the set is
    // always exactly what the reviewer saw.
    await this.db.query('delete from requirement_evidence where requirement_id = $1', [next.id]);
    for (const link of evidence) {
      await this.db.query(
        `insert into requirement_evidence (requirement_id, evidence_item_id, contribution)
         values ($1,$2,$3)`,
        [link.requirementId, link.evidenceItemId, link.contribution],
      );
    }
  }

  async insertInferred(requirement: Requirement): Promise<void> {
    // No evidence links, by design: migration 010 requires generated_by = 'human'
    // AND a rationale for any `inferred` row, so the absence of evidence is paid
    // for by a stated reason rather than passing unnoticed.
    await this.db.query(
      `insert into requirement (id, requirement_set_id, project_id, text, original_ai_text,
                                category, raf_slot, epistemic_level, derivation,
                                computed_confidence, confidence_band, confidence_function_version,
                                human_confirmation_required, status, version, inference_rationale,
                                generated_by, degradations, classification, language,
                                created_by, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
      [
        requirement.id, requirement.requirementSetId, requirement.projectId, requirement.text,
        requirement.originalAiText, requirement.category, requirement.rafSlot,
        requirement.epistemicLevel, requirement.derivation, requirement.computedConfidence,
        requirement.confidenceBand, requirement.confidenceFunctionVersion,
        requirement.humanConfirmationRequired, requirement.status, requirement.version,
        requirement.inferenceRationale ?? null, requirement.generatedBy, requirement.degradations,
        requirement.classification, requirement.language, requirement.createdBy,
        requirement.createdAt,
      ],
    );
  }

  async setReviewStatus(requirementId: string, status: Requirement['status']): Promise<void> {
    if (status === 'approved') {
      // U1, in the adapter as well as in SQL. Approval is a gate transaction, and
      // routing it through a status setter is exactly how that boundary erodes.
      throw new Error(
        `status 'approved' is reachable only through the G1 approval transaction (U1); ` +
          `refusing to set it on ${requirementId}`,
      );
    }
    await this.db.query('update requirement set status = $2 where id = $1', [requirementId, status]);
  }

  async approveRequirements(
    requirementIds: readonly string[],
    approval: { approvedBy: string; approvedAt: string; baselineId: string },
  ): Promise<void> {
    for (const id of requirementIds) {
      await this.db.query(
        `update requirement
            set status = 'approved', approved_by = $2, approved_at = $3, approval_baseline_id = $4
          where id = $1`,
        [id, approval.approvedBy, approval.approvedAt, approval.baselineId],
      );
    }
  }

  async confirmInference(requirementId: string, by: string, at: string): Promise<void> {
    await this.db.query(
      'update requirement set inference_confirmed_by = $2, inference_confirmed_at = $3 where id = $1',
      [requirementId, by, at],
    );
  }

  async versionsFor(
    requirementId: string,
  ): Promise<readonly { version: number; text: string; changeReason?: string }[]> {
    const r = await this.db.query(
      'select version, text, change_reason from requirement_version where requirement_id = $1 order by version asc',
      [requirementId],
    );
    return r.rows.map((row) => ({
      version: Number(row.version),
      text: str(row.text),
      ...(optional(row.change_reason) === undefined ? {} : { changeReason: str(row.change_reason) }),
    }));
  }

  async resolveFlag(flagId: string, resolution: string, by: string, at: string): Promise<void> {
    await this.db.query(
      'update requirement_flag set resolution = $2, resolved_by = $3, resolved_at = $4 where id = $1',
      [flagId, resolution, by, at],
    );
  }

  async flagsForProject(projectId: string): Promise<readonly RequirementFlag[]> {
    const r = await this.db.query(
      'select * from requirement_flag where project_id = $1 order by requirement_id asc, id asc',
      [projectId],
    );
    return r.rows.map(mapFlag);
  }

  async insertQuestion(question: OpenQuestion): Promise<void> {
    await this.db.query(
      `insert into open_question (id, project_id, requirement_set_id, cause_kind, cause_id,
                                  raf_slot, question, why_it_matters, blocking, ai_interaction_id,
                                  created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        question.id, question.projectId, question.requirementSetId, question.causeKind,
        question.causeId, question.rafSlot ?? null, question.question, question.whyItMatters,
        question.blocking, question.aiInteractionId ?? null, question.createdAt,
      ],
    );
  }

  async answerQuestion(
    id: string,
    answer: { answer: string; answeredBy: string; answeredAt: string; becameSourceUnitId?: string },
  ): Promise<void> {
    await this.db.query(
      `update open_question
          set answer = $2, answered_by = $3, answered_at = $4, became_source_unit_id = $5
        where id = $1`,
      [id, answer.answer, answer.answeredBy, answer.answeredAt, answer.becameSourceUnitId ?? null],
    );
  }

  async questionsForSet(requirementSetId: string): Promise<readonly OpenQuestion[]> {
    const r = await this.db.query(
      'select * from open_question where requirement_set_id = $1 order by blocking desc, id asc',
      [requirementSetId],
    );
    return r.rows.map(mapQuestion);
  }

  async questionForCause(
    requirementSetId: string,
    causeKind: string,
    causeId: string,
  ): Promise<OpenQuestion | undefined> {
    const r = await this.db.query(
      'select * from open_question where requirement_set_id = $1 and cause_kind = $2 and cause_id = $3',
      [requirementSetId, causeKind, causeId],
    );
    const row = r.rows[0];
    return row === undefined ? undefined : mapQuestion(row);
  }

  async acknowledgePolicySlot(ack: PolicyAcknowledgement): Promise<void> {
    await this.db.query(
      `insert into policy_acknowledgement (id, project_id, requirement_set_id, raf_slot,
                                           acknowledged_by, acknowledged_at, rationale)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        ack.id, ack.projectId, ack.requirementSetId, ack.rafSlot, ack.acknowledgedBy,
        ack.acknowledgedAt, ack.rationale,
      ],
    );
  }

  async policyAcknowledgementsForSet(
    requirementSetId: string,
  ): Promise<readonly PolicyAcknowledgement[]> {
    const r = await this.db.query(
      'select * from policy_acknowledgement where requirement_set_id = $1 order by raf_slot asc',
      [requirementSetId],
    );
    return r.rows.map((row) => ({
      id: str(row.id),
      projectId: str(row.project_id),
      requirementSetId: str(row.requirement_set_id),
      rafSlot: str(row.raf_slot),
      acknowledgedBy: str(row.acknowledged_by),
      acknowledgedAt: iso(row.acknowledged_at),
      rationale: str(row.rationale),
    }));
  }
}

function mapQuestion(row: Record<string, unknown>): OpenQuestion {
  return {
    id: str(row.id),
    projectId: str(row.project_id),
    requirementSetId: str(row.requirement_set_id),
    causeKind: str(row.cause_kind) as OpenQuestion['causeKind'],
    causeId: str(row.cause_id),
    ...(optional(row.raf_slot) === undefined ? {} : { rafSlot: str(row.raf_slot) }),
    question: str(row.question),
    whyItMatters: str(row.why_it_matters),
    blocking: row.blocking === true,
    ...(optional(row.ai_interaction_id) === undefined
      ? {}
      : { aiInteractionId: str(row.ai_interaction_id) }),
    ...(optional(row.answer) === undefined ? {} : { answer: str(row.answer) }),
    ...(optional(row.answered_by) === undefined ? {} : { answeredBy: str(row.answered_by) }),
    ...(optional(row.answered_at) === undefined ? {} : { answeredAt: iso(row.answered_at) }),
    ...(optional(row.became_source_unit_id) === undefined
      ? {}
      : { becameSourceUnitId: str(row.became_source_unit_id) }),
    createdAt: iso(row.created_at),
  };
}

export function createSqlRequirementRepositories(db: Db): {
  readonly requirements: RequirementRepository;
} {
  return { requirements: new SqlRequirementRepository(db) };
}
