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
  regionsToUnits,
  selectExtractor,
  type ExtractionOutput,
  type RefusalCode,
  type TextExtractor,
  type VisionExtractor,
} from '@asdp/ingestion';
import {
  assertAnchorResolvable,
  isCitable,
  resolveAnchor,
  resolveTextAnchor,
  spanChecksum,
  type ResolutionContext,
} from '@asdp/provenance';
import { codePointLength, sliceByCodePoints, baseDirection, normalise } from '@asdp/text';
import { evaluateL0Ingestion, summariseFindings } from '@asdp/validation';
import { modelElementIds } from '@asdp/ingestion';
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
  /**
   * The A3 `VisionExtractor`.
   *
   * A separate port from `TextExtractor` because reading pixels is a different
   * act: it calls a model, it is subject to the egress policy, and its output is
   * an interpretation. Keeping them apart is what stops "extract text" quietly
   * meaning "ask an AI".
   */
  readonly vision: VisionExtractor;
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
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/bmp':
      return 'bmp';
    case 'application/bpmn+xml':
      return 'bpmn';
    case 'application/dmn+xml':
      return 'dmn';
    case 'application/vnd.camunda.form+json':
      return 'form.json';
    default:
      return 'txt';
  }
}

/**
 * Build the resolution context for a source (ADR-0038).
 *
 * Which stored facts are needed depends on the anchor kind, so this assembles all
 * of them and lets the resolver pick. Loading eagerly is cheap — a source has one
 * text and at most a handful of images — and it keeps the branching in one place
 * rather than at every call site.
 */
async function resolutionContextFor(
  ctx: IntakeContext,
  source: Source,
  imageId?: string,
): Promise<ResolutionContext> {
  const text = await ctx.repos.sources.getText(source.id);
  const context: {
    storedText?: string;
    storedImage?: { imageId: string; sha256: string; width: number; height: number };
    storedModel?: { fileId: string; sha256: string; elementIds: ReadonlySet<string> };
    expectedSha256?: string;
  } = {};

  if (text !== undefined) context.storedText = text;

  if (imageId !== undefined) {
    const image = await ctx.repos.pageImages.get(imageId);
    if (image !== undefined) {
      context.storedImage = {
        imageId: image.id,
        sha256: image.sha256,
        width: image.width,
        height: image.height,
      };
      // Supplying the expected checksum is what turns "the image exists" into
      // "the image is unchanged" — the difference between a weak guarantee and
      // a real one.
      context.expectedSha256 = image.sha256;
    }
  }

  if (MODEL_MEDIA_TYPES.has(source.mimeType) && text !== undefined) {
    // Element ids are RECOMPUTED from the stored text every time, so tampering
    // with the file makes the cited element disappear and the anchor break. No
    // `expectedSha256` is set: comparing the stored checksum against itself would
    // always match, which is the vacuous check ADR-0038 exists to prevent.
    context.storedModel = {
      fileId: source.id,
      sha256: '',
      elementIds: modelElementIds(source.mimeType, text),
    };
  }

  return context;
}

const MODEL_MEDIA_TYPES = new Set([
  'application/bpmn+xml',
  'application/dmn+xml',
  'application/vnd.camunda.form+json',
]);

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

  // --- image family: store a PageImage, then read it by vision ------------
  // A separate branch because an image has no text layer, so there is nothing for
  // a TextExtractor to read. The image is stored FIRST and its checksum and
  // dimensions recorded, because ADR-0038 target verification depends on all
  // three — an anchor minted before the image was recorded would be unverifiable.
  if (guarded.family === 'image') {
    return ingestImageSource(ctx, actor, input, project, guarded, blobKey, classification, sourceId);
  }

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
    // Every anchor is verified against what is about to be stored, before
    // anything is written. A failure here is an adapter defect, and the response
    // is to refuse the write rather than to store a unit whose provenance cannot
    // be demonstrated (ADR-0008).
    //
    // Which axis applies depends on the anchor kind (ADR-0038): a text anchor is
    // resolved against the canonical text, an element anchor against the element
    // ids present in the stored file. Using the text resolver for both would fail
    // every model import, because an element anchor carries no offsets.
    // For a model file the substantive check is ELEMENT EXISTENCE, and the
    // element ids are recomputed from the stored text on every resolution — so
    // tampering with the file makes the cited element vanish. No checksum
    // comparison is passed, because comparing a stored value against itself is
    // the vacuous check ADR-0038 exists to prevent.
    const verificationModel = MODEL_MEDIA_TYPES.has(guarded.mimeType)
      ? {
          fileId: sourceId,
          sha256: '',
          elementIds: modelElementIds(guarded.mimeType, extraction.canonicalText),
        }
      : undefined;

    for (const unit of units) {
      const resolution = resolveAnchor(unit.anchor, {
        storedText: extraction.canonicalText,
        ...(verificationModel === undefined ? {} : { storedModel: verificationModel }),
      });
      if (!isCitable(resolution.status)) {
        throw new AnchorVerificationError(
          `unit ${unit.ordinal} of '${input.filename}' produced an unverifiable anchor: ` +
            `${resolution.detail ?? 'unknown reason'}`,
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
// Image ingest
// ---------------------------------------------------------------------------

/**
 * Ingest an image source: store the page image, then read it by vision.
 *
 * Order matters. The `PageImage` — with its checksum and dimensions — is written
 * before any anchor is minted, because ADR-0038 target verification checks a
 * cited rectangle against those dimensions. Minting first would produce anchors
 * nothing could verify.
 *
 * A vision refusal is **not** a failure of the source. The image is stored, the
 * source is `parsed`, and it simply has no units yet — which is honest: the bytes
 * are held and readable, and the reading was declined. Recording it as
 * `parse_failed` would say the document was unreadable, which is a different and
 * false claim.
 */
async function ingestImageSource(
  ctx: IntakeContext,
  actor: Actor,
  input: IngestSourceInput,
  project: { settings: { classificationDefault: Classification; classificationCeiling: Classification } },
  guarded: Extract<ReturnType<typeof guardSource>, { accepted: true }>,
  blobKey: string,
  classification: Classification,
  sourceId: string,
): Promise<IngestSourceResult> {
  const info = guarded.imageInfo;
  if (info === undefined) {
    throw new AnchorVerificationError(
      'the guard admitted an image without dimensions; provenance bounds would be unverifiable',
    );
  }
  void project;

  const imageId = ctx.ids.next('img');
  const kind = input.kind ?? guarded.kind;

  const pageImage = {
    id: imageId,
    projectId: input.projectId,
    sourceId,
    pageNo: 1,
    blobRef: blobKey,
    sha256: guarded.sha256,
    width: info.width,
    height: info.height,
    mediaType: info.mediaType,
    byteSize: guarded.byteSize,
    createdAt: ctx.clock.nowIso(),
  };

  // --- vision -----------------------------------------------------------
  const outcome = await ctx.vision.extract({
    sourceId,
    imageId,
    data: input.data,
    mediaType: info.mediaType,
    width: info.width,
    height: info.height,
    sha256: guarded.sha256,
    kind,
  });

  const limitations: string[] = [];
  let units: SourceUnit[] = [];
  let interactionId: string | undefined;

  if (outcome.kind === 'refused') {
    limitations.push(`vision extraction was refused: ${outcome.reason}`);
    for (const degradation of outcome.degradations) {
      limitations.push(`degradation recorded: ${degradation}`);
    }
  } else {
    interactionId = outcome.interactionId;
    const converted = regionsToUnits(
      {
        sourceId, imageId, data: input.data, mediaType: info.mediaType,
        width: info.width, height: info.height, sha256: guarded.sha256, kind,
      },
      outcome.result,
      `vision@1`,
    );
    units = converted.units.map((unit) => ({
      id: ctx.ids.next('su'),
      sourceId,
      projectId: input.projectId,
      ordinal: unit.ordinal,
      type: unit.type,
      text: unit.text,
      language: unit.language,
      direction: unit.direction,
      anchor: unit.anchor,
      // The interaction that READ this region, carried onto the unit so evidence
      // cited from it can be attributed to a model rather than to a parser
      // (ADR-0004, ADR-0007). Migration 005 enforces its presence in SQL.
      aiInteractionId: outcome.interactionId,
    }));
    if (converted.dropped > 0) {
      // Dropped, not clamped: a clamped rectangle is a different claim from the
      // one the model made, and correcting it silently would hide the fact that
      // the model reported a region that does not exist.
      limitations.push(
        `${converted.dropped} reported region(s) were dropped for lying outside the image bounds ` +
          'or carrying no text; they were not clamped, because a clamped rectangle is a different claim',
      );
    }
    limitations.push(...outcome.result.limitations);
  }

  // --- VERIFY, against the stored image ---------------------------------
  const storedImage = {
    imageId,
    sha256: pageImage.sha256,
    width: pageImage.width,
    height: pageImage.height,
  };
  for (const unit of units) {
    const resolution = resolveAnchor(unit.anchor, { storedImage, expectedSha256: pageImage.sha256 });
    if (!isCitable(resolution.status)) {
      throw new AnchorVerificationError(
        `region ${unit.ordinal} of '${input.filename}' produced an unverifiable anchor: ` +
          `${resolution.detail ?? 'unknown reason'}`,
      );
    }
  }

  const source: Source = {
    id: sourceId,
    projectId: input.projectId,
    filename: input.filename,
    mimeType: info.mediaType,
    byteSize: guarded.byteSize,
    sha256: guarded.sha256,
    blobRef: blobKey,
    uploadedBy: actor.subject,
    uploadedAt: ctx.clock.nowIso(),
    kind,
    authorityRank: input.authorityRank ?? 0,
    ...(input.effectiveDate === undefined ? {} : { effectiveDate: input.effectiveDate }),
    ...(input.supersedesSourceId === undefined ? {} : { supersedesSourceId: input.supersedesSourceId }),
    // An image has no text, so there is no language to detect from content. The
    // vision result's regions carry their own language tags; the source-level
    // value stays undetermined rather than guessed.
    primaryLanguage: 'und',
    direction: 'neutral',
    languageRuns: [],
    classification,
    status: 'parsed',
    textLength: 0,
    extractorVersion: 'vision@1',
    // `vision`, and the page count is 1 — so `L0-ING-007` can verify that a
    // vision read was RECORDED as such rather than passing as a text read.
    extractionMethod: 'vision',
    visionPageCount: 1,
  };

  return ctx.uow.run(async (repos) => {
    // An image source stores an empty canonical text: there is no text layer, and
    // the vision transcript is deliberately NOT stored as canonical truth
    // (ADR-0038) — resolving AI output against AI output would be vacuous.
    await repos.sources.insert(source, {
      sourceId,
      text: '',
      sha256: hashBytes(new TextEncoder().encode('')),
      codePointLength: 0,
    });
    await repos.pageImages.insert(pageImage);
    if (units.length > 0) await repos.sourceUnits.insertAll(units);

    await audit(repos, ctx, actor, {
      projectId: input.projectId,
      action: outcome.kind === 'refused' ? 'source.visionRefused' : 'source.ingested',
      entityType: 'Source',
      entityId: sourceId,
      after: {
        filename: source.filename,
        mimeType: source.mimeType,
        kind: source.kind,
        sha256: source.sha256,
        classification: source.classification,
        imageId,
        width: info.width,
        height: info.height,
        extractionMethod: 'vision',
        unitCount: units.length,
        aiInteractionId: interactionId,
        limitations,
        detection: guarded.detection,
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
 * **Attribution follows the cited content, not the slice.** Text, DOCX and
 * structural-model units are read by a deterministic parser, so evidence over
 * them is `extractedBy: 'parser'` with `citationMode: 'none'`. An `image_region`
 * unit was read by a vision model, so evidence over it is `extractedBy: 'ai'`,
 * names the interaction that produced it, and is `citationMode: 'native'` —
 * provenance-and-anchoring.md §4.3, because the region rectangle is a
 * page-precision citation the provider returned itself.
 *
 * Recording `parser` for vision-read content was the V3 defect this repairs. It
 * made the AI-disclosure report uncomputable (ADR-0004) and erased the audit
 * trail behind the L1/L2 distinction (ADR-0007) at the one point it matters.
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
  /** The interaction that produced the cited content, when a model produced it. */
  let unitInteractionId: string | undefined;

  if (input.sourceUnitId !== undefined) {
    const unit = await ctx.repos.sourceUnits.get(input.sourceUnitId);
    if (unit === undefined) throw new ValidationError(`unknown source unit ${input.sourceUnitId}`);
    if (unit.sourceId !== input.sourceId) {
      throw new ValidationError(
        `unit ${input.sourceUnitId} does not belong to source ${input.sourceId}`,
      );
    }
    unitId = unit.id;
    unitInteractionId = unit.aiInteractionId;

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

  // VERIFY before persisting (ADR-0038).
  //
  // `broken` and `drifted` are both refused: within one extractor version, drift
  // means the stored text and the anchor disagree, which is a defect rather than
  // version skew. `content_unverified` is ACCEPTED — the target is sound, and the
  // epistemic ceiling, not the anchor, is what limits what such evidence may
  // support.
  const verificationContext = await resolutionContextFor(
    ctx,
    source,
    anchor.target.kind === 'image_region' ? anchor.target.imageId : undefined,
  );
  const resolution = resolveAnchor(anchor, verificationContext);
  if (!isCitable(resolution.status)) {
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

  // --- attribution ------------------------------------------------------
  //
  // Derived from the ANCHOR KIND, not from the slice and not from the caller: an
  // `image_region` quote is a vision model's reading, and no argument a caller
  // supplies can make it parser-extracted. Refusing when the interaction is
  // missing is deliberate — an unattributable AI extraction would satisfy the
  // schema while making the disclosure report a guess, and migration 005 would
  // reject the row anyway.
  const visionRead = anchor.target.kind === 'image_region';
  if (visionRead && unitInteractionId === undefined) {
    throw new ValidationError(
      `unit ${unitId ?? '(none)'} is anchored to an image region but names no AI interaction, ` +
        'so the evidence could not be attributed; vision-read evidence must record the ' +
        'interaction that produced it (ADR-0004)',
    );
  }
  const attribution = visionRead
    ? {
        extractedBy: 'ai' as const,
        // The provider returned the region itself, which is a native
        // page-precision citation (provenance-and-anchoring.md §4.3).
        citationMode: 'native' as const,
        aiInteractionId: unitInteractionId as string,
      }
    : { extractedBy: 'parser' as const, citationMode: 'none' as const };

  const item: EvidenceItem = {
    id: ctx.ids.next('ev'),
    projectId: input.projectId,
    sourceId: input.sourceId,
    ...(unitId === undefined ? {} : { sourceUnitId: unitId }),
    anchor,
    verbatimText: anchor.quote,
    language: anchor.language,
    ...(input.rafSlotHint === undefined ? {} : { rafSlotHint: input.rafSlotHint }),
    ...attribution,
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
        // Recorded on the event, not only on the row: the AI-disclosure report is
        // computed from what happened, and an audit trail that omits WHO read the
        // content cannot answer "which requirements rest on a model's reading".
        anchorKind: item.anchor.target.kind,
        extractedBy: item.extractedBy,
        citationMode: item.citationMode,
        aiInteractionId: item.aiInteractionId,
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
    return [await highlightFor(ctx, source, item.anchor, text)];
  }

  if (query.unitId !== undefined) {
    const unit = units.find((u) => u.id === query.unitId);
    if (unit === undefined) {
      throw new ValidationError(`unknown unit ${query.unitId} in source ${source.id}`);
    }
    return [await highlightFor(ctx, source, unit.anchor, text)];
  }

  if (query.charStart !== undefined && query.charEnd !== undefined) {
    return [highlightForRange(source.id, text, query.charStart, query.charEnd)];
  }

  // No selector: every unit, which is what the viewer needs to paint a document
  // outline over the text in one request.
  return Promise.all(units.map((unit) => highlightFor(ctx, source, unit.anchor, text)));
}

/**
 * Highlight one anchor, choosing the path by anchor kind (ADR-0038).
 *
 * A text anchor paints direction-homogeneous segments. An `image_region` anchor
 * paints a **rectangle over stored pixels** and comes back
 * `content_unverified` — never `resolved` — so the viewer can render a vision
 * citation differently from a verified one.
 */
async function highlightFor(
  ctx: IntakeContext,
  source: Source,
  anchor: ProvenanceAnchor,
  text: string,
): Promise<HighlightRange> {
  if (anchor.target.kind === 'image_region') {
    const imageId = anchor.target.imageId;
    const context = await resolutionContextFor(ctx, source, imageId);
    const resolution = resolveAnchor(anchor, context);
    return {
      sourceId: source.id,
      // An image highlight has no text extent. Zeroes rather than fabricated
      // offsets: a viewer that reads them gets nothing, not something wrong.
      start: 0,
      end: 0,
      baseDirection: anchor.direction,
      segments: [],
      resolution: resolution.status,
      ...(resolution.detail === undefined ? {} : { detail: resolution.detail }),
      imageId,
      imageRect: anchor.target.rect,
    };
  }

  if (
    anchor.target.kind === 'bpmn_element' ||
    anchor.target.kind === 'dmn_rule' ||
    anchor.target.kind === 'form_field'
  ) {
    const context = await resolutionContextFor(ctx, source);
    const resolution = resolveAnchor(anchor, context);
    return {
      sourceId: source.id,
      start: 0,
      end: 0,
      baseDirection: anchor.direction,
      segments: [],
      resolution: resolution.status,
      ...(resolution.detail === undefined ? {} : { detail: resolution.detail }),
    };
  }

  return highlightForAnchor(anchor, text);
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
  const imagesById = new Map<
    string,
    { imageId: string; sha256: string; width: number; height: number }
  >();
  const modelsBySourceId = new Map<
    string,
    { fileId: string; sha256: string; elementIds: ReadonlySet<string> }
  >();
  for (const source of sources) {
    const text = await ctx.repos.sources.getText(source.id);
    if (text !== undefined) textBySourceId.set(source.id, text);
    // Images are loaded so ADR-0038 target verification can run inside the rule
    // pack: without the checksum and dimensions, an image anchor could not be
    // checked at all and `L0-ING-002` would silently skip it.
    // Element ids are recomputed from the stored text, so a tampered model file
    // makes its cited elements vanish and the anchors break.
    if (MODEL_MEDIA_TYPES.has(source.mimeType) && text !== undefined) {
      modelsBySourceId.set(source.id, {
        fileId: source.id,
        sha256: '',
        elementIds: modelElementIds(source.mimeType, text),
      });
    }
    for (const image of await ctx.repos.pageImages.listForSource(source.id)) {
      imagesById.set(image.id, {
        imageId: image.id,
        sha256: image.sha256,
        width: image.width,
        height: image.height,
      });
    }
  }

  const runId = ctx.ids.next('vr');
  const findings = evaluateL0Ingestion(
    { sources, units, evidence, textBySourceId, imagesById, modelsBySourceId },
    runId,
  );

  return { runId, findings, summary: summariseFindings(findings, 'G1') };
}
