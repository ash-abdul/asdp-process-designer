/**
 * SQL repository adapter for canonicalisation and conflict candidates (V6).
 *
 * ADR-0035: plain parameterised SQL, every parameter in the array, never
 * interpolated — the checker rule `sql-injection-guard` fails the build if that
 * discipline slips.
 *
 * **No update method, no delete method, and no `setDecision`.** The absence is
 * the design: the one mutation worth having here is the one **Q1** forbids V6 to
 * make. Migration 009 refuses a non-null `decision` on insert as well, so the
 * boundary holds against a direct connection rather than only against this layer.
 */

import type {
  CanonicalEntity,
  CanonicalEntityAlias,
  Classification,
  Conflict,
  ConflictParticipant,
  PrecedenceRationale,
  ReconciliationRejection,
  RequirementRelation,
} from '@asdp/schemas';
import type { ReconciliationRepository } from '../ports.ts';
import { UniqueViolationError, type Db } from './db.ts';

function str(value: unknown): string {
  return typeof value === 'string' ? value : String(value);
}

function optional(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : String(value);
}

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : str(value);
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function mapEntity(row: Record<string, unknown>): CanonicalEntity {
  return {
    id: str(row.id),
    projectId: str(row.project_id),
    requirementSetId: str(row.requirement_set_id),
    kind: str(row.kind) as CanonicalEntity['kind'],
    labelEn: str(row.label_en),
    labelAr: str(row.label_ar),
    matchForm: str(row.match_form),
    origin: str(row.origin) as CanonicalEntity['origin'],
    classification: str(row.classification) as Classification,
    mergedFromIds: strings(row.merged_from_ids),
    requirementIds: strings(row.requirement_ids),
    ...(optional(row.ai_interaction_id) === undefined
      ? {}
      : { aiInteractionId: str(row.ai_interaction_id) }),
    ...(optional(row.confirmed_by) === undefined ? {} : { confirmedBy: str(row.confirmed_by) }),
    ...(optional(row.confirmed_at) === undefined ? {} : { confirmedAt: iso(row.confirmed_at) }),
    createdAt: iso(row.created_at),
  };
}

function mapAlias(row: Record<string, unknown>): CanonicalEntityAlias {
  return {
    id: str(row.id),
    canonicalEntityId: str(row.canonical_entity_id),
    surfaceForm: str(row.surface_form),
    matchForm: str(row.match_form),
    language: str(row.language),
    origin: str(row.origin) as CanonicalEntityAlias['origin'],
    requirementId: str(row.requirement_id),
    ...(optional(row.ai_interaction_id) === undefined
      ? {}
      : { aiInteractionId: str(row.ai_interaction_id) }),
  };
}

function mapConflict(row: Record<string, unknown>): Conflict {
  const rationale = row.precedence_rationale_json;
  return {
    id: str(row.id),
    projectId: str(row.project_id),
    requirementSetId: str(row.requirement_set_id),
    topic: str(row.topic),
    rafSlot: str(row.raf_slot),
    classification: str(row.classification) as Conflict['classification'],
    explanation: str(row.explanation),
    detectedBy: str(row.detected_by),
    ...(optional(row.ai_interaction_id) === undefined
      ? {}
      : { aiInteractionId: str(row.ai_interaction_id) }),
    ...(optional(row.recommended_requirement_id) === undefined
      ? {}
      : { recommendedRequirementId: str(row.recommended_requirement_id) }),
    ...(optional(row.proposed_resolution) === undefined
      ? {}
      : { proposedResolution: str(row.proposed_resolution) }),
    ...(rationale === null || rationale === undefined
      ? {}
      : { precedenceRationale: rationale as PrecedenceRationale }),
    dataClassification: str(row.data_classification) as Classification,
    // decision / decidedBy / decidedAt are always null in V6 and are mapped only
    // so a V7 row read by this adapter is not silently truncated.
    ...(optional(row.decision) === undefined ? {} : { decision: str(row.decision) }),
    ...(optional(row.decided_by) === undefined ? {} : { decidedBy: str(row.decided_by) }),
    ...(optional(row.decided_at) === undefined ? {} : { decidedAt: iso(row.decided_at) }),
    createdAt: iso(row.created_at),
  };
}

function mapParticipant(row: Record<string, unknown>): ConflictParticipant {
  return {
    conflictId: str(row.conflict_id),
    role: str(row.role) as ConflictParticipant['role'],
    entityId: str(row.entity_id),
  };
}

function mapRelation(row: Record<string, unknown>): RequirementRelation {
  return {
    id: str(row.id),
    projectId: str(row.project_id),
    fromId: str(row.from_id),
    toId: str(row.to_id),
    kind: str(row.kind) as RequirementRelation['kind'],
    detectedBy: str(row.detected_by),
    ...(optional(row.ai_interaction_id) === undefined
      ? {}
      : { aiInteractionId: str(row.ai_interaction_id) }),
    createdAt: iso(row.created_at),
  };
}

function mapRejection(row: Record<string, unknown>): ReconciliationRejection {
  return {
    id: str(row.id),
    projectId: str(row.project_id),
    requirementSetId: str(row.requirement_set_id),
    task: str(row.task) as ReconciliationRejection['task'],
    reason: str(row.reason) as ReconciliationRejection['reason'],
    detail: str(row.detail),
    proposedPayload: str(row.proposed_payload),
    ...(optional(row.ai_interaction_id) === undefined
      ? {}
      : { aiInteractionId: str(row.ai_interaction_id) }),
    classification: str(row.classification) as Classification,
    createdAt: iso(row.created_at),
  };
}

class SqlReconciliationRepository implements ReconciliationRepository {
  constructor(private readonly db: Db) {}

  async insertCanonicalEntity(
    entity: CanonicalEntity,
    aliases: readonly CanonicalEntityAlias[],
  ): Promise<void> {
    if (aliases.length === 0) {
      // An entity with no aliases records that something was canonicalised while
      // losing what was canonicalised — the traceability half of Q3, gone.
      throw new Error(
        `canonical entity ${entity.id} has no aliases; a merge that loses its surface forms is ` +
          'irreversible in practice however many ids it retains',
      );
    }
    await this.db.query(
      `insert into canonical_entity (id, project_id, requirement_set_id, kind, label_en, label_ar,
                                     match_form, origin, classification, merged_from_ids,
                                     requirement_ids, ai_interaction_id, confirmed_by, confirmed_at,
                                     created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        entity.id, entity.projectId, entity.requirementSetId, entity.kind, entity.labelEn,
        entity.labelAr, entity.matchForm, entity.origin, entity.classification,
        entity.mergedFromIds, entity.requirementIds, entity.aiInteractionId ?? null,
        entity.confirmedBy ?? null, entity.confirmedAt ?? null, entity.createdAt,
      ],
    );
    for (const alias of aliases) {
      await this.db.query(
        `insert into canonical_entity_alias (id, canonical_entity_id, surface_form, match_form,
                                             language, origin, requirement_id, ai_interaction_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          alias.id, alias.canonicalEntityId, alias.surfaceForm, alias.matchForm, alias.language,
          alias.origin, alias.requirementId, alias.aiInteractionId ?? null,
        ],
      );
    }
  }

  async canonicalEntitiesForSet(requirementSetId: string): Promise<readonly CanonicalEntity[]> {
    const r = await this.db.query(
      'select * from canonical_entity where requirement_set_id = $1 order by kind asc, match_form asc',
      [requirementSetId],
    );
    return r.rows.map(mapEntity);
  }

  async aliasesForSet(requirementSetId: string): Promise<readonly CanonicalEntityAlias[]> {
    const r = await this.db.query(
      `select a.* from canonical_entity_alias a
         join canonical_entity e on e.id = a.canonical_entity_id
        where e.requirement_set_id = $1
        order by a.canonical_entity_id asc, a.surface_form asc`,
      [requirementSetId],
    );
    return r.rows.map(mapAlias);
  }

  async insertConflict(
    conflict: Conflict,
    participants: readonly ConflictParticipant[],
  ): Promise<void> {
    if (participants.length < 2) {
      throw new Error(
        `conflict ${conflict.id} has ${participants.length} participant(s); a comparison needs two`,
      );
    }
    await this.db.query(
      `insert into conflict (id, project_id, requirement_set_id, topic, raf_slot, classification,
                             explanation, detected_by, ai_interaction_id,
                             recommended_requirement_id, proposed_resolution,
                             precedence_rationale_json, data_classification,
                             decision, decided_by, decided_at, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,$17)`,
      [
        conflict.id, conflict.projectId, conflict.requirementSetId, conflict.topic,
        conflict.rafSlot, conflict.classification, conflict.explanation, conflict.detectedBy,
        conflict.aiInteractionId ?? null, conflict.recommendedRequirementId ?? null,
        conflict.proposedResolution ?? null,
        conflict.precedenceRationale === undefined
          ? null
          : JSON.stringify(conflict.precedenceRationale),
        conflict.dataClassification,
        // Q1: always null from V6. Passed explicitly rather than omitted, so the
        // intent is visible at the call site as well as in the constraint.
        null, null, null,
        conflict.createdAt,
      ],
    );
    for (const participant of participants) {
      await this.db.query(
        'insert into conflict_participant (conflict_id, role, entity_id) values ($1,$2,$3)',
        [participant.conflictId, participant.role, participant.entityId],
      );
    }
  }

  async conflictsForSet(requirementSetId: string): Promise<readonly Conflict[]> {
    const r = await this.db.query(
      'select * from conflict where requirement_set_id = $1 order by raf_slot asc, id asc',
      [requirementSetId],
    );
    return r.rows.map(mapConflict);
  }

  async participantsForSet(requirementSetId: string): Promise<readonly ConflictParticipant[]> {
    const r = await this.db.query(
      `select p.* from conflict_participant p
         join conflict c on c.id = p.conflict_id
        where c.requirement_set_id = $1
        order by p.conflict_id asc, p.entity_id asc`,
      [requirementSetId],
    );
    return r.rows.map(mapParticipant);
  }

  /**
   * A human decides a conflict — V7, and **the only path to a non-null decision**.
   *
   * Migration 010 requires a decider, a timestamp **and a rationale** together, so
   * a decision cannot be recorded without the answer to "why?". ADR-0012 needs the
   * decision to be defensible in audit, and "the analyst chose the SOP" is not one.
   */
  async decideConflict(
    conflictId: string,
    decision: { decision: string; decidedBy: string; decidedAt: string; rationale: string },
  ): Promise<void> {
    await this.db.query(
      `update conflict
          set decision = $2, decided_by = $3, decided_at = $4, decision_rationale = $5
        where id = $1`,
      [conflictId, decision.decision, decision.decidedBy, decision.decidedAt, decision.rationale],
    );
  }

  /**
   * A human confirms or rejects an AI-proposed equivalence — **U4**.
   *
   * Migration 010 refuses confirmation of a `deterministic` entity: exact
   * match-form equality is a fact about text, so there is nothing to confirm, and
   * offering it would invite confirmation of something that was never a judgement.
   */
  async setEquivalenceVerdict(
    canonicalEntityId: string,
    verdict: { confirmedBy?: string; confirmedAt?: string; rejectedBy?: string; rejectedAt?: string },
  ): Promise<void> {
    await this.db.query(
      `update canonical_entity
          set confirmed_by = $2, confirmed_at = $3, rejected_by = $4, rejected_at = $5
        where id = $1`,
      [
        canonicalEntityId, verdict.confirmedBy ?? null, verdict.confirmedAt ?? null,
        verdict.rejectedBy ?? null, verdict.rejectedAt ?? null,
      ],
    );
  }

  async insertRelation(relation: RequirementRelation): Promise<void> {
    try {
      await this.db.query(
        `insert into requirement_relation (id, project_id, from_id, to_id, kind, detected_by,
                                           ai_interaction_id, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          relation.id, relation.projectId, relation.fromId, relation.toId, relation.kind,
          relation.detectedBy, relation.aiInteractionId ?? null, relation.createdAt,
        ],
      );
    } catch (err) {
      // The same relation observed twice is not an error: it is the same fact.
      if (err instanceof UniqueViolationError) return;
      throw err;
    }
  }

  async relationsForProject(projectId: string): Promise<readonly RequirementRelation[]> {
    const r = await this.db.query(
      'select * from requirement_relation where project_id = $1 order by from_id asc, to_id asc',
      [projectId],
    );
    return r.rows.map(mapRelation);
  }

  async insertRejection(rejection: ReconciliationRejection): Promise<void> {
    await this.db.query(
      `insert into reconciliation_rejection (id, project_id, requirement_set_id, task, reason,
                                             detail, proposed_payload, ai_interaction_id,
                                             classification, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        rejection.id, rejection.projectId, rejection.requirementSetId, rejection.task,
        rejection.reason, rejection.detail, rejection.proposedPayload,
        rejection.aiInteractionId ?? null, rejection.classification, rejection.createdAt,
      ],
    );
  }

  async rejectionsForSet(requirementSetId: string): Promise<readonly ReconciliationRejection[]> {
    const r = await this.db.query(
      'select * from reconciliation_rejection where requirement_set_id = $1 order by created_at asc, id asc',
      [requirementSetId],
    );
    return r.rows.map(mapRejection);
  }
}

export function createSqlReconciliationRepositories(db: Db): {
  readonly reconciliation: ReconciliationRepository;
} {
  return { reconciliation: new SqlReconciliationRepository(db) };
}
