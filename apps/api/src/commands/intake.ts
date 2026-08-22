/**
 * Intake commands.
 *
 * ADR-0034 N4: RBAC, gate guards, audit and transactions live here, not in a
 * controller, and this file imports no framework package. The architecture
 * checker enforces both — `nest-domain-purity` for the framework, and
 * `http-independence` for transport.
 *
 * The pipeline, in order, and the order is the point:
 *
 *   guard      → refuse at the door, with a named reason
 *   deduplicate→ identical bytes are one source
 *   store      → immutable, content-addressed blob
 *   normalise  → NFC, logical order; the form every anchor resolves against
 *   extract    → parser-minted units with exact anchors
 *   VERIFY     → every anchor resolves, or nothing is persisted
 *   persist    → source + text + units + audit, atomically
 *
 * The VERIFY step is not a formality. ADR-0008 makes an unresolvable anchor a
 * hard error, so the only correct response to one is to refuse the write. A
 * stored anchor that does not resolve is worse than a rejected document, because
 * it looks like provenance.
 */

import {
  guardSource,
  hashBytes,
  highlightForAnchor,
  highlightForRange,
  selectExtractor,
  type ExtractionOutput,
  type RefusalCode,
  type TextExtractor,
} from '@asdp/ingestion';
import { assertAnchorResolvable, resolveTextAnchor, spanChecksum } from '@asdp/provenance';
import { codePointLength, sliceByCodePoints, baseDirection, normalise } from '@asdp/text';
import { evaluateL0Ingestion, summariseFindings } from '@asdp/validation';
import { classificationRank } from '@asdp/schemas';
import type {
  Classification,
  EvidenceItem,
  Finding,
  HighlightRange,
  ProvenanceAnchor,
  Source,
  SourceKind,
  SourceUnit,
} from '@asdp/schemas';
import type { Actor, CommandContext } from '../commands.ts';
import { assertRole, assertStageEnterable, ValidationError } from '../commands.ts';
import type { BlobStore, Repositories, UnitOfWork } from '../ports.ts';
import { contentAddressedKey } from '../blob/blob-store.ts';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/**
 * Intake needs two capabilities governance did not: blob storage and a
 * transaction boundary. Both arrive as ports, so this layer still knows nothing
 * about a filesystem or a driver.
 */
export interface IntakeContext extends CommandContext {
  readonly blobs: BlobStore;
  readonly uow: UnitOfWork;
  /** Maximum accepted source size, from configuration. */
  readonly maxSourceBytes: number;
  /**
   * The A3 `TextExtractor` registry.
   *
   * Injected rather than imported so the adapter set is a composition decision.
   * There is no PDF extractor in it: PDF intake is V2-PDF, blocked on spike S2
   * and ADR-0037.
   */
  readonly extractors: readonly TextExtractor[];
}

/** Raised when the guard refuses a source. Carries the code for the API. */
export class SourceRefusedError extends ValidationError {
  constructor(
    readonly code: RefusalCode,
    message: string,
    readonly detectedMimeType?: string,
  ) {
    super(message);
  }
}

/** Raised when an extracted anchor does not resolve. This is a defect, not input. */
export class AnchorVerificationError extends Error {}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function audit(
  repos: Repositories,
  ctx: IntakeContext,
  actor: Actor,
  event: {
    readonly projectId: string;
    readonly action: string;
    readonly entityType: string;
    readonly entityId?: string;
    readonly after?: unknown;
    readonly before?: unknown;
  },
): Promise<void> {
  await repos.audit.append({
    id: ctx.ids.next('aud'),
    at: ctx.clock.nowIso(),
    actor: actor.subject,
    rolesAtTime: [...actor.roles],
    tokenIssuer: actor.tokenIssuer,
    correlationId: ctx.correlationId,
    ...event,
  });
}

/**
 * Resolve the classification for a new source.
 *
 * ADR-0021 rule 3: classification only ever rises. A caller may raise a source
 * above the project default but never lower it, and never above the project's
 * ceiling — a project configured to hold nothing above CONFIDENTIAL must not
 * acquire RESTRICTED content by an upload parameter.
 */
export function resolveClassification(
  requested: Classification | undefined,
  projectDefault: Classification,
  ceiling: Classification,
): Classification {
  const chosen =
    requested !== undefined && classificationRank(requested) > classificationRank(projectDefault)
      ? requested
      : projectDefault;

  if (classificationRank(chosen) > classificationRank(ceiling)) {
    throw new ValidationError(
      `classification ${chosen} exceeds the project ceiling ${ceiling}; raise the ceiling ` +
        'deliberately rather than as a side effect of an upload',
    );
  }
  return chosen;
}

/** File extension for the blob key, so a stored blob is recognisable on sight. */
function extensionFor(mediaType: string): string {
  switch (mediaType) {
    case 'text/markdown':
      return 'md';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return 'docx';
    default:
      return 'txt';
  }
}

// ---------------------------------------------------------------------------
// ingestSource
// ---------------------------------------------------------------------------

export interface IngestSourceInput {
  readonly projectId: string;
  readonly filename: string;
  readonly data: Uint8Array;
  /** Recorded for the audit trail. Never used to admit the file. */
  readonly declaredMimeType?: string;
  readonly classification?: Classification;
  /** Human classification of the document's role. Defaults to the sniffed kind. */
  readonly kind?: SourceKind;
  readonly authorityRank?: number;
  readonly effectiveDate?: string;
  readonly supersedesSourceId?: string;
}

export interface IngestSourceResult {
  readonly source: Source;
  readonly units: readonly SourceUnit[];
  /** True when identical bytes were already present and nothing new was written. */
  readonly deduplicated: boolean;
}

export async function ingestSource(
  ctx: IntakeContext,
  actor: Actor,
  input: IngestSourceInput,
): Promise<IngestSourceResult> {
  assertRole(actor, 'ingestSource');

  const project = await ctx.repos.projects.get(input.projectId);
  if (project === undefined) throw new ValidationError(`unknown project ${input.projectId}`);

  // Intake has no prerequisite gate today, but the guard is called rather than
  // assumed: if the stage table ever changes, intake is protected by the same
  // mechanism as every other stage instead of being the one that forgot.
  await assertStageEnterable(ctx, input.projectId, 'intake');

  if (input.authorityRank !== undefined) assertAuthorityRank(input.authorityRank);

  // --- guard -------------------------------------------------------------
  const guarded = guardSource(input.data, {
    filename: input.filename,
    maxBytes: ctx.maxSourceBytes,
    ...(input.declaredMimeType === undefined ? {} : { declaredMimeType: input.declaredMimeType }),
  });

  if (!guarded.accepted) {
    // Refused at the door, so no Source row is created: there is nothing to
    // anchor and a row would imply a document the system holds. The refusal is
    // audited, because "what did we reject and why" is an audit question.
    await audit(ctx.repos, ctx, actor, {
      projectId: input.projectId,
      action: 'source.refused',
      entityType: 'Source',
      after: {
        filename: input.filename,
        sha256: guarded.sha256,
        byteSize: guarded.byteSize,
        code: guarded.code,
        detectedMimeType: guarded.detectedMimeType,
        reason: guarded.reason,
      },
    });
    throw new SourceRefusedError(guarded.code, guarded.reason, guarded.detectedMimeType);
  }

  // --- deduplicate -------------------------------------------------------
  const existing = await ctx.repos.sources.getByHash(input.projectId, guarded.sha256);
  if (existing !== undefined) {
    await audit(ctx.repos, ctx, actor, {
      projectId: input.projectId,
      action: 'source.deduplicated',
      entityType: 'Source',
      entityId: existing.id,
      after: { filename: input.filename, sha256: guarded.sha256, existingSourceId: existing.id },
    });
    return {
      source: existing,
      units: await ctx.repos.sourceUnits.listForSource(existing.id),
      deduplicated: true,
    };
  }

  const classification = resolveClassification(
    input.classification,
    project.settings.classificationDefault,
    project.settings.classificationCeiling,
  );

  // --- store the immutable bytes ----------------------------------------
  // Content-addressed, so an identical upload in another project reuses the same
  // blob and a re-upload is idempotent by construction (ADR-0016).
  const blobKey = contentAddressedKey('sources', guarded.sha256, extensionFor(guarded.mimeType));
  await ctx.blobs.put({
    key: blobKey,
    data: input.data,
    contentType: guarded.mimeType,
  });

  const sourceId = ctx.ids.next('src');

  // --- extract -----------------------------------------------------------
  // The extractor owns normalisation, because the canonical text differs by
  // format: for text it is the normalised file, for a DOCX it is assembled from
  // the document part. Either way the text returned here is what gets stored, so
  // an anchor's offsets and the stored text can never be out of step.
  let units: SourceUnit[] = [];
  let extraction: ExtractionOutput | undefined;
  let parseError: string | undefined;

  try {
    const extractor = selectExtractor(ctx.extractors, guarded.mimeType);
    extraction = extractor.extract({
      sourceId,
      data: input.data,
      mediaType: guarded.mimeType,
      filename: input.filename,
      ...(guarded.rawText === undefined ? {} : { decodedText: guarded.rawText }),
    });

    units = extraction.units.map((unit) => ({
      id: ctx.ids.next('su'),
      sourceId,
      projectId: input.projectId,
      ordinal: unit.ordinal,
      type: unit.type,
      text: unit.text,
      language: unit.language,
      direction: unit.direction,
      ...(unit.depth === undefined ? {} : { depth: unit.depth }),
      anchor: unit.anchor,
    }));

    // --- VERIFY --------------------------------------------------------
    // Every anchor is resolved against the text that is about to be stored,
    // before anything is written. A failure here is an adapter defect, and the
    // response is to refuse the write rather than to store a unit whose
    // provenance cannot be demonstrated (ADR-0008).
    for (const unit of units) {
      try {
        assertAnchorResolvable(unit.anchor, extraction.canonicalText);
      } catch (err) {
        throw new AnchorVerificationError(
          `unit ${unit.ordinal} of '${input.filename}' produced an unresolvable anchor: ` +
            `${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  } catch (err) {
    // A parse or verification failure IS recorded, as `parse_failed` with a
    // reason, so `L0-ING-001` can report it. This is the difference between a
    // document we refused to admit and one we admitted and could not read.
    parseError = err instanceof Error ? err.message : String(err);
    units = [];
    extraction = undefined;
  }

  // A failed extraction still needs a canonical text to store, so the source row
  // and its text stay one-to-one. Empty is honest: nothing was read.
  const canonicalText = extraction?.canonicalText ?? '';
  const normalised = normalise(canonicalText);

  const source: Source = {
    id: sourceId,
    projectId: input.projectId,
    filename: input.filename,
    mimeType: guarded.mimeType,
    byteSize: guarded.byteSize,
    sha256: guarded.sha256,
    blobRef: blobKey,
    uploadedBy: actor.subject,
    uploadedAt: ctx.clock.nowIso(),
    kind: input.kind ?? guarded.kind,
    authorityRank: input.authorityRank ?? 0,
    ...(input.effectiveDate === undefined ? {} : { effectiveDate: input.effectiveDate }),
    ...(input.supersedesSourceId === undefined
      ? {}
      : { supersedesSourceId: input.supersedesSourceId }),
    primaryLanguage: normalised.primaryLanguage,
    direction: normalised.direction,
    languageRuns: normalised.runs.map((run) => ({
      start: run.start,
      end: run.end,
      language: run.language,
      direction: run.direction,
    })),
    classification,
    status: parseError === undefined ? 'parsed' : 'parse_failed',
    ...(parseError === undefined ? {} : { parseError }),
    textLength: normalised.length,
    textSha256: hashBytes(new TextEncoder().encode(normalised.text)),
    ...(extraction === undefined ? {} : { extractorVersion: extraction.extractorVersion }),
    // V1 reads text directly. A3's vision path populates these in V2/V3.
    extractionMethod: 'text',
    visionPageCount: 0,
  };

  // --- persist, atomically ----------------------------------------------
  return ctx.uow.run(async (repos) => {
    await repos.sources.insert(source, {
      sourceId,
      text: normalised.text,
      sha256: source.textSha256 as string,
      codePointLength: normalised.length,
    });
    if (units.length > 0) await repos.sourceUnits.insertAll(units);

    await audit(repos, ctx, actor, {
      projectId: input.projectId,
      action: parseError === undefined ? 'source.ingested' : 'source.parse_failed',
      entityType: 'Source',
      entityId: sourceId,
      after: {
        filename: source.filename,
        mimeType: source.mimeType,
        kind: source.kind,
        sha256: source.sha256,
        byteSize: source.byteSize,
        blobRef: source.blobRef,
        classification: source.classification,
        primaryLanguage: source.primaryLanguage,
        direction: source.direction,
        textLength: source.textLength,
        unitCount: units.length,
        extractorVersion: source.extractorVersion,
        detection: guarded.detection,
        declaredMimeType: input.declaredMimeType,
        parseError,
      },
    });

    return { source, units, deduplicated: false };
  });
}

// ---------------------------------------------------------------------------
// setSourceAuthorityRank
// ---------------------------------------------------------------------------

function assertAuthorityRank(rank: number): void {
  if (!Number.isInteger(rank) || rank < 0 || rank > 1000) {
    throw new ValidationError(`authority rank must be an integer 0–1000, got ${rank}`);
  }
}

export interface SetAuthorityRankInput {
  readonly projectId: string;
  readonly sourceId: string;
  readonly authorityRank: number;
  /** Why this source outranks another. Recorded, because precedence is a judgement. */
  readonly justification?: string;
}

/**
 * Set a source's authority rank.
 *
 * This is the human input to deterministic conflict precedence (ADR-0012). The
 * AI never sets it: if it did, precedence would be an AI judgement wearing a
 * deterministic costume. The change is audited with its justification, because
 * "why does the policy outrank the SOP" is a question a reviewer will ask later.
 */
export async function setSourceAuthorityRank(
  ctx: IntakeContext,
  actor: Actor,
  input: SetAuthorityRankInput,
): Promise<Source> {
  assertRole(actor, 'setSourceAuthorityRank');
  assertAuthorityRank(input.authorityRank);

  const source = await ctx.repos.sources.get(input.sourceId);
  if (source === undefined) throw new ValidationError(`unknown source ${input.sourceId}`);
  if (source.projectId !== input.projectId) {
    throw new ValidationError(
      `source ${input.sourceId} does not belong to project ${input.projectId}`,
    );
  }

  return ctx.uow.run(async (repos) => {
    await repos.sources.setAuthorityRank(input.sourceId, input.authorityRank);
    await audit(repos, ctx, actor, {
      projectId: input.projectId,
      action: 'source.authorityRankSet',
      entityType: 'Source',
      entityId: input.sourceId,
      before: { authorityRank: source.authorityRank },
      after: { authorityRank: input.authorityRank, justification: input.justification },
    });
    return { ...source, authorityRank: input.authorityRank };
  });
}

// ---------------------------------------------------------------------------
// recordEvidence
// ---------------------------------------------------------------------------

export interface RecordEvidenceInput {
  readonly projectId: string;
  readonly sourceId: string;
  /** Record the whole of a unit. Mutually exclusive with an explicit range. */
  readonly sourceUnitId?: string;
  /** Narrow to an explicit code-point range within the source. */
  readonly charStart?: number;
  readonly charEnd?: number;
  readonly rafSlotHint?: string;
  readonly classification?: Classification;
}

/**
 * Record an EvidenceItem.
 *
 * V1 evidence is always parser-extracted: `extractedBy: 'parser'` and
 * `citationMode: 'none'`, because there is no AI in this slice. AI-extracted
 * evidence with native or post-hoc citation arrives in V4, and the fields exist
 * now so that path adds a value rather than a column.
 *
 * The anchor is minted and then VERIFIED before persistence. `anchorVerified` is
 * therefore always true on a stored item — which is exactly what invariant D1
 * requires, and what the SQL check constraint enforces independently.
 */
export async function recordEvidence(
  ctx: IntakeContext,
  actor: Actor,
  input: RecordEvidenceInput,
): Promise<EvidenceItem> {
  assertRole(actor, 'recordEvidence');

  const source = await ctx.repos.sources.get(input.sourceId);
  if (source === undefined) throw new ValidationError(`unknown source ${input.sourceId}`);
  if (source.projectId !== input.projectId) {
    throw new ValidationError(
      `source ${input.sourceId} does not belong to project ${input.projectId}`,
    );
  }
  if (source.status === 'parse_failed') {
    throw new ValidationError(
      `source ${input.sourceId} failed to parse, so it has no verifiable content to cite`,
    );
  }

  const text = await ctx.repos.sources.getText(input.sourceId);
  if (text === undefined) {
    throw new ValidationError(`source ${input.sourceId} has no stored text`);
  }

  let anchor: ProvenanceAnchor;
  let unitId: string | undefined;

  if (input.sourceUnitId !== undefined) {
    const unit = await ctx.repos.sourceUnits.get(input.sourceUnitId);
    if (unit === undefined) throw new ValidationError(`unknown source unit ${input.sourceUnitId}`);
    if (unit.sourceId !== input.sourceId) {
      throw new ValidationError(
        `unit ${input.sourceUnitId} does not belong to source ${input.sourceId}`,
      );
    }
    unitId = unit.id;

    if (input.charStart === undefined && input.charEnd === undefined) {
      // Inherit the unit's anchor unchanged (provenance-and-anchoring.md §4.1).
      anchor = unit.anchor;
    } else {
      // Narrow within the unit. The narrowed range must lie inside it, or the
      // evidence would cite a span the unit does not cover.
      anchor = narrowedAnchor(source.id, text, unit, input.charStart, input.charEnd);
    }
  } else {
    if (input.charStart === undefined || input.charEnd === undefined) {
      throw new ValidationError(
        'either sourceUnitId, or both charStart and charEnd, must be supplied',
      );
    }
    anchor = mintRangeAnchor(source, text, input.charStart, input.charEnd);
  }

  // VERIFY before persisting. A broken anchor is refused; a drifted one is too,
  // because within one extractor version drift means the stored text and the
  // anchor disagree, which is a defect rather than version skew.
  const resolution = resolveTextAnchor(anchor, text);
  if (resolution.status !== 'resolved') {
    throw new AnchorVerificationError(
      `refusing to store evidence with a ${resolution.status} anchor: ` +
        `${resolution.detail ?? 'unknown reason'}`,
    );
  }

  const classification = resolveClassification(
    input.classification,
    source.classification,
    'PROHIBITED',
  );

  const item: EvidenceItem = {
    id: ctx.ids.next('ev'),
    projectId: input.projectId,
    sourceId: input.sourceId,
    ...(unitId === undefined ? {} : { sourceUnitId: unitId }),
    anchor,
    verbatimText: anchor.quote,
    language: anchor.language,
    ...(input.rafSlotHint === undefined ? {} : { rafSlotHint: input.rafSlotHint }),
    extractedBy: 'parser',
    citationMode: 'none',
    anchorVerified: true,
    classification,
    createdBy: actor.subject,
    createdAt: ctx.clock.nowIso(),
  };

  return ctx.uow.run(async (repos) => {
    await repos.evidence.insert(item);
    await audit(repos, ctx, actor, {
      projectId: input.projectId,
      action: 'evidence.recorded',
      entityType: 'EvidenceItem',
      entityId: item.id,
      after: {
        sourceId: item.sourceId,
        sourceUnitId: item.sourceUnitId,
        precision: item.anchor.precision,
        language: item.language,
        classification: item.classification,
        quoteChecksum: item.anchor.quoteChecksum,
        rafSlotHint: item.rafSlotHint,
      },
    });
    return item;
  });
}

/** Mint an anchor over an explicit range, bounds-checked against the text. */
function mintRangeAnchor(
  source: Source,
  text: string,
  charStart: number,
  charEnd: number,
): ProvenanceAnchor {
  const length = codePointLength(text);
  if (!Number.isInteger(charStart) || !Number.isInteger(charEnd)) {
    throw new ValidationError('charStart and charEnd must be integers');
  }
  if (charStart < 0 || charEnd > length || charEnd <= charStart) {
    throw new ValidationError(
      `range ${charStart}..${charEnd} is not a non-empty range within ${length} code points`,
    );
  }

  const quote = sliceByCodePoints(text, charStart, charEnd);
  const described = normalise(quote);
  return {
    sourceId: source.id,
    target: { kind: 'text_range', charStart, charEnd },
    quote,
    quoteChecksum: spanChecksum(quote),
    language: described.primaryLanguage === 'und' ? source.primaryLanguage : described.primaryLanguage,
    direction: baseDirection(quote) === 'neutral' ? source.direction : baseDirection(quote),
    precision: 'exact',
    extractorVersion: source.extractorVersion ?? 'manual@1',
  };
}

/** Narrow a unit's anchor, refusing anything outside the unit's own span. */
function narrowedAnchor(
  sourceId: string,
  text: string,
  unit: SourceUnit,
  charStart: number | undefined,
  charEnd: number | undefined,
): ProvenanceAnchor {
  if (unit.anchor.target.kind !== 'text_range') {
    throw new ValidationError(
      `unit ${unit.id} is not anchored to a text range, so it cannot be narrowed by offsets`,
    );
  }
  const from = charStart ?? unit.anchor.target.charStart;
  const to = charEnd ?? unit.anchor.target.charEnd;
  if (from < unit.anchor.target.charStart || to > unit.anchor.target.charEnd || to <= from) {
    throw new ValidationError(
      `range ${from}..${to} is not a non-empty range inside unit ${unit.id} ` +
        `(${unit.anchor.target.charStart}..${unit.anchor.target.charEnd})`,
    );
  }

  const quote = sliceByCodePoints(text, from, to);
  return {
    sourceId,
    target: { kind: 'text_range', charStart: from, charEnd: to },
    quote,
    quoteChecksum: spanChecksum(quote),
    language: unit.language,
    direction: baseDirection(quote) === 'neutral' ? unit.direction : baseDirection(quote),
    precision: 'exact',
    extractorVersion: unit.anchor.extractorVersion,
  };
}

// ---------------------------------------------------------------------------
// Source viewer
// ---------------------------------------------------------------------------

export interface SourceViewerContent {
  readonly source: Source;
  readonly text: string;
  readonly units: readonly SourceUnit[];
}

/** Source text plus units, for the viewer. Read-only by construction. */
export async function readSourceForViewer(
  ctx: IntakeContext,
  projectId: string,
  sourceId: string,
): Promise<SourceViewerContent> {
  const source = await ctx.repos.sources.get(sourceId);
  if (source === undefined) throw new ValidationError(`unknown source ${sourceId}`);
  if (source.projectId !== projectId) {
    throw new ValidationError(`source ${sourceId} does not belong to project ${projectId}`);
  }
  const text = await ctx.repos.sources.getText(sourceId);
  if (text === undefined) throw new ValidationError(`source ${sourceId} has no stored text`);
  return { source, text, units: await ctx.repos.sourceUnits.listForSource(sourceId) };
}

export interface HighlightQuery {
  readonly projectId: string;
  readonly sourceId: string;
  readonly unitId?: string;
  readonly evidenceId?: string;
  readonly charStart?: number;
  readonly charEnd?: number;
}

/**
 * Highlight ranges for the source viewer.
 *
 * Computed server-side from the stored anchor and the stored text, never by the
 * client re-searching rendered text (provenance-and-anchoring.md §6). A unit or
 * evidence highlight resolves its anchor first, so a broken anchor produces an
 * empty highlight with a reason rather than a confident highlight over the wrong
 * span.
 */
export async function readHighlights(
  ctx: IntakeContext,
  query: HighlightQuery,
): Promise<readonly HighlightRange[]> {
  const { source, text, units } = await readSourceForViewer(
    ctx,
    query.projectId,
    query.sourceId,
  );

  if (query.evidenceId !== undefined) {
    const item = await ctx.repos.evidence.get(query.evidenceId);
    if (item === undefined) throw new ValidationError(`unknown evidence ${query.evidenceId}`);
    if (item.sourceId !== source.id) {
      throw new ValidationError(
        `evidence ${query.evidenceId} does not cite source ${source.id}`,
      );
    }
    return [highlightForAnchor(item.anchor, text)];
  }

  if (query.unitId !== undefined) {
    const unit = units.find((u) => u.id === query.unitId);
    if (unit === undefined) {
      throw new ValidationError(`unknown unit ${query.unitId} in source ${source.id}`);
    }
    return [highlightForAnchor(unit.anchor, text)];
  }

  if (query.charStart !== undefined && query.charEnd !== undefined) {
    return [highlightForRange(source.id, text, query.charStart, query.charEnd)];
  }

  // No selector: every unit, which is what the viewer needs to paint a document
  // outline over the text in one request.
  return units.map((unit) => highlightForAnchor(unit.anchor, text));
}

// ---------------------------------------------------------------------------
// validateIntake
// ---------------------------------------------------------------------------

export interface IntakeValidationResult {
  /** Not persisted in V1: validation-run storage arrives with G1 in V7. */
  readonly runId: string;
  readonly findings: readonly Finding[];
  readonly summary: ReturnType<typeof summariseFindings>;
}

/**
 * Run the L0 ingestion rule pack over a project's intake state.
 *
 * The rules are pure, so this command's only job is to assemble the state and
 * hand it over. `blocking` in the summary is the list G1 evaluation consumes
 * (invariant I6): a gate is closed by named findings, never by a count.
 */
export async function validateIntake(
  ctx: IntakeContext,
  actor: Actor,
  projectId: string,
): Promise<IntakeValidationResult> {
  assertRole(actor, 'validateIntake');

  const project = await ctx.repos.projects.get(projectId);
  if (project === undefined) throw new ValidationError(`unknown project ${projectId}`);

  const sources = await ctx.repos.sources.list(projectId);
  const units = await ctx.repos.sourceUnits.listForProject(projectId);
  const evidence = await ctx.repos.evidence.listForProject(projectId);

  const textBySourceId = new Map<string, string>();
  for (const source of sources) {
    const text = await ctx.repos.sources.getText(source.id);
    if (text !== undefined) textBySourceId.set(source.id, text);
  }

  const runId = ctx.ids.next('vr');
  const findings = evaluateL0Ingestion({ sources, units, evidence, textBySourceId }, runId);

  return { runId, findings, summary: summariseFindings(findings, 'G1') };
}
