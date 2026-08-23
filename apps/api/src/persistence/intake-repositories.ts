/**
 * SQL repository adapters for intake and evidence.
 *
 * ADR-0035: plain parameterised SQL. Every parameter is passed in the array —
 * never interpolated — and the checker rule `sql-injection-guard` fails the build
 * if that discipline slips.
 *
 * Kept in its own module rather than appended to `repositories.ts` so neither
 * file becomes the place where all persistence lives. Both are wired by the same
 * factory, so a transaction still spans them.
 *
 * The insert-only tables expose no update or delete method here, mirroring the
 * SQL constraints in migration 002 (invariants D1, D8). Immutability enforced in
 * one place only is immutability by convention.
 */

import type {
  AiInteraction,
  Classification,
  EvidenceItem,
  PageImage,
  ProvenanceAnchor,
  Source,
  SourceKind,
  SourceStatus,
  SourceUnit,
  SourceUnitType,
} from '@asdp/schemas';
import {
  NotFoundError,
  type AiInteractionRepository,
  type EvidenceRepository,
  type PageImageRepository,
  type SourceRepository,
  type SourceTextRecord,
  type SourceUnitRepository,
} from '../ports.ts';
import { UniqueViolationError, type Db } from './db.ts';

// ---------------------------------------------------------------------------
// Row mapping. Hand-written, because ADR-0035 chose plain SQL over an ORM.
// ---------------------------------------------------------------------------

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function optionalIso(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  return toIso(value);
}

function optionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  return String(value);
}

function mapSource(r: Record<string, unknown>): Source {
  const source: Source = {
    id: String(r.id),
    projectId: String(r.project_id),
    filename: String(r.filename),
    mimeType: String(r.mime_type),
    byteSize: Number(r.byte_size),
    sha256: String(r.sha256),
    blobRef: String(r.blob_ref),
    uploadedBy: String(r.uploaded_by),
    uploadedAt: toIso(r.uploaded_at),
    kind: String(r.kind) as SourceKind,
    authorityRank: Number(r.authority_rank),
    primaryLanguage: String(r.primary_language),
    direction: String(r.direction) as Source['direction'],
    languageRuns: (r.language_runs_json ?? []) as Source['languageRuns'],
    classification: String(r.classification) as Classification,
    status: String(r.status) as SourceStatus,
    textLength: Number(r.text_length),
    extractionMethod: String(r.extraction_method) as Source['extractionMethod'],
    visionPageCount: Number(r.vision_page_count),
  };

  // Optional fields are attached only when present, so `undefined` never
  // round-trips as the string "undefined" through JSON.
  const effectiveDate = optionalIso(r.effective_date);
  const supersedes = optionalString(r.supersedes_source_id);
  const parseError = optionalString(r.parse_error);
  const textSha = optionalString(r.text_sha256);
  const extractorVersion = optionalString(r.extractor_version);
  const arabicConfidence =
    r.arabic_reordering_confidence === null || r.arabic_reordering_confidence === undefined
      ? undefined
      : Number(r.arabic_reordering_confidence);

  return {
    ...source,
    ...(effectiveDate === undefined ? {} : { effectiveDate }),
    ...(supersedes === undefined ? {} : { supersedesSourceId: supersedes }),
    ...(parseError === undefined ? {} : { parseError }),
    ...(textSha === undefined ? {} : { textSha256: textSha }),
    ...(extractorVersion === undefined ? {} : { extractorVersion }),
    ...(arabicConfidence === undefined ? {} : { arabicReorderingConfidence: arabicConfidence }),
  };
}

function mapSourceUnit(r: Record<string, unknown>): SourceUnit {
  const depth = r.depth === null || r.depth === undefined ? undefined : Number(r.depth);
  const interaction = optionalString(r.ai_interaction_id);
  return {
    id: String(r.id),
    sourceId: String(r.source_id),
    projectId: String(r.project_id),
    ordinal: Number(r.ordinal),
    type: String(r.type) as SourceUnitType,
    text: r.text === null || r.text === undefined ? null : String(r.text),
    language: String(r.language),
    direction: String(r.direction) as SourceUnit['direction'],
    ...(depth === undefined ? {} : { depth }),
    anchor: r.anchor_json as ProvenanceAnchor,
    ...(interaction === undefined ? {} : { aiInteractionId: interaction }),
  };
}

function mapEvidenceItem(r: Record<string, unknown>): EvidenceItem {
  const unitId = optionalString(r.source_unit_id);
  const slotHint = optionalString(r.raf_slot_hint);
  const interaction = optionalString(r.ai_interaction_id);
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    sourceId: String(r.source_id),
    ...(unitId === undefined ? {} : { sourceUnitId: unitId }),
    anchor: r.anchor_json as ProvenanceAnchor,
    verbatimText: String(r.verbatim_text),
    language: String(r.language),
    ...(slotHint === undefined ? {} : { rafSlotHint: slotHint }),
    extractedBy: String(r.extracted_by) as EvidenceItem['extractedBy'],
    ...(interaction === undefined ? {} : { aiInteractionId: interaction }),
    citationMode: String(r.citation_mode) as EvidenceItem['citationMode'],
    anchorVerified: r.anchor_verified === true,
    ...(r.computed_confidence === null || r.computed_confidence === undefined
      ? {}
      : {
          computedConfidence: Number(r.computed_confidence),
          confidenceBand: String(r.confidence_band) as EvidenceItem['confidenceBand'],
          confidenceFunctionVersion: String(r.confidence_function_version),
        }),
    classification: String(r.classification) as Classification,
    createdBy: String(r.created_by),
    createdAt: toIso(r.created_at),
  };
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

class SqlSourceRepository implements SourceRepository {
  constructor(private readonly db: Db) {}

  async insert(source: Source, text: SourceTextRecord): Promise<void> {
    try {
      await this.db.query(
        `insert into source (id, project_id, filename, mime_type, byte_size, sha256, blob_ref,
                             uploaded_by, uploaded_at, kind, authority_rank, effective_date,
                             supersedes_source_id, primary_language, direction, language_runs_json,
                             classification, status, parse_error, text_length, text_sha256,
                             extractor_version, extraction_method, vision_page_count,
                             arabic_reordering_confidence)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,
                 $17,$18,$19,$20,$21,$22,$23,$24,$25)`,
        [
          source.id, source.projectId, source.filename, source.mimeType, source.byteSize,
          source.sha256, source.blobRef, source.uploadedBy, source.uploadedAt, source.kind,
          source.authorityRank, source.effectiveDate ?? null, source.supersedesSourceId ?? null,
          source.primaryLanguage, source.direction, JSON.stringify(source.languageRuns),
          source.classification, source.status, source.parseError ?? null, source.textLength,
          source.textSha256 ?? null, source.extractorVersion ?? null, source.extractionMethod,
          source.visionPageCount, source.arabicReorderingConfidence ?? null,
        ],
      );
    } catch (err) {
      if (err instanceof UniqueViolationError) {
        throw new UniqueViolationError(
          `a source with hash ${source.sha256.slice(0, 12)}… already exists in project ` +
            `${source.projectId}; identical bytes are ingested once`,
        );
      }
      throw err;
    }

    await this.db.query(
      `insert into source_text (source_id, text, sha256, code_point_length)
       values ($1,$2,$3,$4)`,
      [text.sourceId, text.text, text.sha256, text.codePointLength],
    );
  }

  async get(id: string): Promise<Source | undefined> {
    const r = await this.db.query('select * from source where id = $1', [id]);
    const row = r.rows[0];
    return row === undefined ? undefined : mapSource(row);
  }

  async getByHash(projectId: string, sha256: string): Promise<Source | undefined> {
    const r = await this.db.query(
      'select * from source where project_id = $1 and sha256 = $2',
      [projectId, sha256],
    );
    const row = r.rows[0];
    return row === undefined ? undefined : mapSource(row);
  }

  /**
   * Inventory order.
   *
   * Authority rank descending, so the most authoritative source is first — this
   * is the ordering a reviewer resolving a conflict needs. Ties break on upload
   * time then id, so the listing is deterministic. Ordering is by rank and
   * timestamp only, never by text: bilingual ordering uses application-side match
   * forms, because PGlite's collation is inert (ADR-0023, ADR-0035 §5).
   */
  async list(projectId: string): Promise<readonly Source[]> {
    const r = await this.db.query(
      `select * from source where project_id = $1
       order by authority_rank desc, uploaded_at asc, id asc`,
      [projectId],
    );
    return r.rows.map(mapSource);
  }

  async getText(sourceId: string): Promise<string | undefined> {
    const r = await this.db.query<{ text: string }>(
      'select text from source_text where source_id = $1',
      [sourceId],
    );
    const row = r.rows[0];
    return row === undefined ? undefined : row.text;
  }

  async setAuthorityRank(sourceId: string, rank: number): Promise<void> {
    const r = await this.db.query(
      'update source set authority_rank = $2 where id = $1',
      [sourceId, rank],
    );
    if (r.affectedRows === 0) throw new NotFoundError(`unknown source ${sourceId}`);
  }

  async setStatus(sourceId: string, status: SourceStatus, parseError?: string): Promise<void> {
    const r = await this.db.query(
      'update source set status = $2, parse_error = $3 where id = $1',
      [sourceId, status, parseError ?? null],
    );
    if (r.affectedRows === 0) throw new NotFoundError(`unknown source ${sourceId}`);
  }
}

// ---------------------------------------------------------------------------
// Source units — INSERT-ONLY
// ---------------------------------------------------------------------------

class SqlSourceUnitRepository implements SourceUnitRepository {
  constructor(private readonly db: Db) {}

  async insertAll(units: readonly SourceUnit[]): Promise<void> {
    // One statement per unit rather than a constructed multi-row VALUES list:
    // building that list means interpolating placeholders into SQL, which the
    // `sql-injection-guard` rule forbids for good reason. Units are inserted
    // inside the ingest transaction, so this is one round trip's worth of work
    // either way for the document sizes V1 accepts.
    for (const unit of units) {
      await this.db.query(
        `insert into source_unit (id, source_id, project_id, ordinal, type, text,
                                  language, direction, depth, anchor_json, ai_interaction_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,
        [
          unit.id, unit.sourceId, unit.projectId, unit.ordinal, unit.type, unit.text,
          unit.language, unit.direction, unit.depth ?? null, JSON.stringify(unit.anchor),
          unit.aiInteractionId ?? null,
        ],
      );
    }
  }

  async get(id: string): Promise<SourceUnit | undefined> {
    const r = await this.db.query('select * from source_unit where id = $1', [id]);
    const row = r.rows[0];
    return row === undefined ? undefined : mapSourceUnit(row);
  }

  async listForSource(sourceId: string): Promise<readonly SourceUnit[]> {
    const r = await this.db.query(
      'select * from source_unit where source_id = $1 order by ordinal asc',
      [sourceId],
    );
    return r.rows.map(mapSourceUnit);
  }

  async listForProject(projectId: string): Promise<readonly SourceUnit[]> {
    const r = await this.db.query(
      'select * from source_unit where project_id = $1 order by source_id asc, ordinal asc',
      [projectId],
    );
    return r.rows.map(mapSourceUnit);
  }
}

// ---------------------------------------------------------------------------
// Page images — INSERT-ONLY
// ---------------------------------------------------------------------------

function mapPageImage(r: Record<string, unknown>): PageImage {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    sourceId: String(r.source_id),
    pageNo: Number(r.page_no),
    blobRef: String(r.blob_ref),
    sha256: String(r.sha256),
    width: Number(r.width),
    height: Number(r.height),
    mediaType: String(r.media_type),
    byteSize: Number(r.byte_size),
    createdAt: toIso(r.created_at),
  };
}

class SqlPageImageRepository implements PageImageRepository {
  constructor(private readonly db: Db) {}

  async insert(image: PageImage): Promise<void> {
    try {
      await this.db.query(
        `insert into page_image (id, project_id, source_id, page_no, blob_ref, sha256,
                                 width, height, media_type, byte_size, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          image.id, image.projectId, image.sourceId, image.pageNo, image.blobRef,
          image.sha256, image.width, image.height, image.mediaType, image.byteSize,
          image.createdAt,
        ],
      );
    } catch (err) {
      if (err instanceof UniqueViolationError) {
        throw new Error(
          `page ${image.pageNo} of source ${image.sourceId} already exists; images are insert-only`,
        );
      }
      throw err;
    }
  }

  async get(id: string): Promise<PageImage | undefined> {
    const r = await this.db.query('select * from page_image where id = $1', [id]);
    const row = r.rows[0];
    return row === undefined ? undefined : mapPageImage(row);
  }

  async listForSource(sourceId: string): Promise<readonly PageImage[]> {
    const r = await this.db.query(
      'select * from page_image where source_id = $1 order by page_no asc',
      [sourceId],
    );
    return r.rows.map(mapPageImage);
  }
}

// ---------------------------------------------------------------------------
// Evidence — INSERT-ONLY (D1, D8)
// ---------------------------------------------------------------------------

class SqlEvidenceRepository implements EvidenceRepository {
  constructor(private readonly db: Db) {}

  async insert(item: EvidenceItem): Promise<void> {
    try {
      await this.db.query(
        `insert into evidence_item (id, project_id, source_id, source_unit_id, anchor_json,
                                    verbatim_text, language, raf_slot_hint, extracted_by,
                                    ai_interaction_id, citation_mode, anchor_verified,
                                    classification, created_by, created_at,
                                    computed_confidence, confidence_band,
                                    confidence_function_version)
         values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [
          item.id, item.projectId, item.sourceId, item.sourceUnitId ?? null,
          JSON.stringify(item.anchor), item.verbatimText, item.language,
          item.rafSlotHint ?? null, item.extractedBy, item.aiInteractionId ?? null,
          item.citationMode, item.anchorVerified, item.classification,
          item.createdBy, item.createdAt,
          item.computedConfidence ?? null, item.confidenceBand ?? null,
          item.confidenceFunctionVersion ?? null,
        ],
      );
    } catch (err) {
      if (err instanceof UniqueViolationError) {
        throw new Error(`evidence ${item.id} already exists; evidence is insert-only`);
      }
      throw err;
    }
  }

  async get(id: string): Promise<EvidenceItem | undefined> {
    const r = await this.db.query('select * from evidence_item where id = $1', [id]);
    const row = r.rows[0];
    return row === undefined ? undefined : mapEvidenceItem(row);
  }

  async listForProject(projectId: string): Promise<readonly EvidenceItem[]> {
    const r = await this.db.query(
      'select * from evidence_item where project_id = $1 order by created_at asc, id asc',
      [projectId],
    );
    return r.rows.map(mapEvidenceItem);
  }

  async listForSource(sourceId: string): Promise<readonly EvidenceItem[]> {
    const r = await this.db.query(
      'select * from evidence_item where source_id = $1 order by created_at asc, id asc',
      [sourceId],
    );
    return r.rows.map(mapEvidenceItem);
  }
}


// ---------------------------------------------------------------------------
// AI interactions — APPEND-ONLY (invariant I8)
// ---------------------------------------------------------------------------

function mapAiInteraction(r: Record<string, unknown>): AiInteraction {
  const sourceId = optionalString(r.source_id);
  const correlationId = optionalString(r.correlation_id);
  const proposalId = optionalString(r.proposal_id);
  const egressReason = optionalString(r.egress_reason);
  const chunkStrategyVersion = optionalString(r.chunk_strategy_version);
  const chunkCount = r.chunk_count === null || r.chunk_count === undefined ? undefined : Number(r.chunk_count);
  const routing = r.routing_json as AiInteraction['routing'];
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    at: toIso(r.at),
    taskType: String(r.task_type) as AiInteraction['taskType'],
    taskVersion: String(r.task_version),
    promptVersion: String(r.prompt_version),
    providerId: String(r.provider_id),
    modelId: String(r.model_id),
    deploymentClass: String(r.deployment_class) as AiInteraction['deploymentClass'],
    capabilityTier: String(r.capability_tier) as AiInteraction['capabilityTier'],
    capabilitiesUsed: (r.capabilities_used as AiInteraction['capabilitiesUsed']) ?? [],
    routing,
    usage: {
      inputUnits: Number(r.input_units),
      cachedInputUnits: Number(r.cached_input_units),
      outputUnits: Number(r.output_units),
      costEstimate: Number(r.cost_estimate),
      latencyMs: Number(r.latency_ms),
    },
    egressDecision: String(r.egress_decision) as AiInteraction['egressDecision'],
    ...(egressReason === undefined ? {} : { egressReason }),
    contextMode: String(r.context_mode) as AiInteraction['contextMode'],
    ...(chunkCount === undefined ? {} : { chunkCount }),
    chunkRanges: (r.chunk_ranges_json as AiInteraction['chunkRanges']) ?? [],
    ...(chunkStrategyVersion === undefined ? {} : { chunkStrategyVersion }),
    mode: String(r.mode) as AiInteraction['mode'],
    ...(sourceId === undefined ? {} : { sourceId }),
    ...(correlationId === undefined ? {} : { correlationId }),
    ...(proposalId === undefined ? {} : { proposalId }),
    humanVerdict: String(r.human_verdict) as AiInteraction['humanVerdict'],
  };
}

/**
 * Append-only. No update, no delete — `setVerdict` is the one mutation, because a
 * human verdict on a proposal genuinely arrives after the call.
 */
class SqlAiInteractionRepository implements AiInteractionRepository {
  constructor(private readonly db: Db) {}

  async insert(interaction: AiInteraction): Promise<void> {
    await this.db.query(
      `insert into ai_interaction (id, project_id, at, task_type, task_version, prompt_version,
                                   provider_id, model_id, deployment_class, capability_tier,
                                   capabilities_used, routing_json, content_classification,
                                   egress_decision, egress_reason, context_mode, chunk_count,
                                   chunk_ranges_json, chunk_strategy_version, mode, source_id,
                                   correlation_id, input_units, cached_input_units, output_units,
                                   cost_estimate, latency_ms, proposal_id, human_verdict)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,$17,$18::jsonb,$19,
               $20,$21,$22,$23,$24,$25,$26,$27,$28,$29)`,
      [
        interaction.id, interaction.projectId, interaction.at, interaction.taskType,
        interaction.taskVersion, interaction.promptVersion, interaction.providerId,
        interaction.modelId, interaction.deploymentClass, interaction.capabilityTier,
        interaction.capabilitiesUsed, JSON.stringify(interaction.routing),
        interaction.routing.contentClassification, interaction.egressDecision,
        interaction.egressReason ?? null, interaction.contextMode, interaction.chunkCount ?? null,
        JSON.stringify(interaction.chunkRanges), interaction.chunkStrategyVersion ?? null,
        interaction.mode, interaction.sourceId ?? null, interaction.correlationId ?? null,
        interaction.usage.inputUnits, interaction.usage.cachedInputUnits,
        interaction.usage.outputUnits, interaction.usage.costEstimate, interaction.usage.latencyMs,
        interaction.proposalId ?? null, interaction.humanVerdict,
      ],
    );
  }

  async get(id: string): Promise<AiInteraction | undefined> {
    const r = await this.db.query('select * from ai_interaction where id = $1', [id]);
    const row = r.rows[0];
    return row === undefined ? undefined : mapAiInteraction(row);
  }

  async listForProject(projectId: string): Promise<readonly AiInteraction[]> {
    const r = await this.db.query(
      'select * from ai_interaction where project_id = $1 order by at asc, id asc',
      [projectId],
    );
    return r.rows.map(mapAiInteraction);
  }

  async listForSource(sourceId: string): Promise<readonly AiInteraction[]> {
    const r = await this.db.query(
      'select * from ai_interaction where source_id = $1 order by at asc, id asc',
      [sourceId],
    );
    return r.rows.map(mapAiInteraction);
  }

  async setVerdict(id: string, verdict: AiInteraction['humanVerdict']): Promise<void> {
    await this.db.query('update ai_interaction set human_verdict = $2 where id = $1', [id, verdict]);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSqlIntakeRepositories(db: Db): {
  readonly sources: SourceRepository;
  readonly sourceUnits: SourceUnitRepository;
  readonly evidence: EvidenceRepository;
  readonly pageImages: PageImageRepository;
  readonly aiInteractions: AiInteractionRepository;
} {
  return {
    sources: new SqlSourceRepository(db),
    sourceUnits: new SqlSourceUnitRepository(db),
    evidence: new SqlEvidenceRepository(db),
    pageImages: new SqlPageImageRepository(db),
    aiInteractions: new SqlAiInteractionRepository(db),
  };
}
