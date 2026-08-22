/**
 * Source intake and evidence contracts.
 *
 * domain-model.md §3. `EvidenceItem` is the ONLY bridge between raw sources and
 * requirements — nothing may skip it, which is what makes the traceability
 * guarantee structural rather than procedural.
 *
 * The anchor schema here is a zod mirror of `ProvenanceAnchor` in
 * `@asdp/provenance`. It is duplicated deliberately: `@asdp/schemas` is a
 * CONTRACT package and depends on nothing but zod (module-map.md §2), so it
 * cannot import the pure package. `@asdp/ingestion` holds a compile-time
 * assertion that the two shapes agree, so the duplication cannot drift silently.
 */

import { z } from 'zod';
import {
  Classification,
  EntityId,
  Sha256,
  TextDirection,
  Bcp47,
} from './primitives.ts';
// `CitationMode` is an AI-provider concept and is already the single definition
// in ai.ts; evidence carries it rather than redeclaring it.
import { CitationMode } from './ai.ts';

// ---------------------------------------------------------------------------
// Anchors (provenance-and-anchoring.md §2)
// ---------------------------------------------------------------------------

/** How precisely the anchor locates its content. Feeds computed confidence. */
export const AnchorPrecision = z.enum(['exact', 'cell', 'page', 'document']);
export type AnchorPrecision = z.infer<typeof AnchorPrecision>;

export const Rect = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});
export type Rect = z.infer<typeof Rect>;

/**
 * Anchor targets, by source kind. Additive: new kinds may be added, existing
 * kinds are never redefined.
 *
 * V1 mints `text_range` only. The other kinds are declared because the anchor
 * model is Phase 0 binding and must not be re-cut per slice (ADR-0008).
 */
export const AnchorTarget = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('text_range'),
    charStart: z.number().int().nonnegative(),
    charEnd: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal('docx_block'),
    blockPath: z.string(),
    runStart: z.number().int().nonnegative(),
    runEnd: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal('pdf_region'),
    page: z.number().int().positive(),
    /** A LIST: one logical range may wrap into several rectangles, which is
     *  common in RTL and mixed-direction text. Readonly so this schema's output
     *  type is bidirectionally assignable to the pure `AnchorTarget` — see the
     *  contract assertion in `@asdp/ingestion`. */
    rects: z.array(Rect).readonly(),
    charStart: z.number().int().nonnegative().optional(),
    charEnd: z.number().int().nonnegative().optional(),
  }),
  z.object({ kind: z.literal('image_region'), imageId: z.string(), rect: Rect }),
  z.object({ kind: z.literal('sheet_cell'), sheet: z.string(), a1Range: z.string() }),
  z.object({ kind: z.literal('bpmn_element'), fileId: z.string(), elementId: z.string() }),
  z.object({
    kind: z.literal('dmn_rule'),
    fileId: z.string(),
    decisionId: z.string(),
    ruleId: z.string().optional(),
  }),
  z.object({ kind: z.literal('form_field'), fileId: z.string(), fieldId: z.string() }),
  z.object({ kind: z.literal('transcript'), sessionId: z.string(), turnId: z.string() }),
]);
export type AnchorTarget = z.infer<typeof AnchorTarget>;

export const AnchorKind = z.enum([
  'text_range',
  'docx_block',
  'pdf_region',
  'image_region',
  'sheet_cell',
  'bpmn_element',
  'dmn_rule',
  'form_field',
  'transcript',
]);
export type AnchorKind = z.infer<typeof AnchorKind>;

/**
 * The anchor envelope.
 *
 * `quote` and `quoteChecksum` are not optional and not advisory: resolution
 * verifies the quote, and a mismatch is drift that fails loudly rather than a
 * discrepancy that is tolerated (ADR-0008, provenance-and-anchoring.md A4).
 */
export const ProvenanceAnchor = z.object({
  sourceId: EntityId,
  target: AnchorTarget,
  /** Verbatim quote of the anchored span, in its source language. */
  quote: z.string(),
  /** Checksum of the anchored span, so drift is detectable rather than silent. */
  quoteChecksum: z.string().regex(/^[0-9a-f]{32}$/),
  language: Bcp47,
  direction: TextDirection,
  precision: AnchorPrecision,
  /** Which adapter version minted this anchor, for selective re-verification. */
  extractorVersion: z.string().min(1),
});
export type ProvenanceAnchor = z.infer<typeof ProvenanceAnchor>;

// ---------------------------------------------------------------------------
// Source (domain-model.md §3)
// ---------------------------------------------------------------------------

export const SourceKind = z.enum([
  'brd',
  'srs',
  'sop',
  'policy',
  'spreadsheet',
  'screenshot',
  'diagram_image',
  'bpmn',
  'dmn',
  'form',
  'email',
  'transcript',
  'freetext',
  'markdown',
  'other',
]);
export type SourceKind = z.infer<typeof SourceKind>;

export const SourceStatus = z.enum(['parsing', 'parsed', 'parse_failed', 'superseded']);
export type SourceStatus = z.infer<typeof SourceStatus>;

/**
 * Human-set authority ranking (domain-model.md §3).
 *
 * The deterministic input to conflict precedence (ADR-0012): when two sources
 * disagree, the higher rank wins and the resolution is reproducible. A HUMAN sets
 * it — the AI never does, because precedence would then be an AI judgement
 * wearing a deterministic costume.
 *
 * Higher is more authoritative. 0 means "not yet ranked", which is deliberately
 * distinguishable from "ranked lowest" (`L0-ING-010` reports it).
 */
export const AuthorityRank = z.number().int().min(0).max(1000);

/** A language run over the source's normalised text, in code-point offsets. */
export const LanguageRun = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  language: Bcp47,
  direction: TextDirection,
});
export type LanguageRun = z.infer<typeof LanguageRun>;

export const Source = z.object({
  id: EntityId,
  projectId: EntityId,
  filename: z.string().min(1).max(512),
  /** Determined by content sniffing, never by the client's claim. */
  mimeType: z.string().min(1).max(200),
  byteSize: z.number().int().nonnegative(),
  /** SHA-256 of the RAW bytes. Also the deduplication key within a project. */
  sha256: Sha256,
  /** Opaque BlobStore key. Never a filesystem path (A6). */
  blobRef: z.string().min(1),
  uploadedBy: EntityId,
  uploadedAt: z.string(),
  kind: SourceKind,
  authorityRank: AuthorityRank.default(0),
  effectiveDate: z.string().optional(),
  supersedesSourceId: EntityId.optional(),
  primaryLanguage: Bcp47,
  direction: TextDirection,
  languageRuns: z.array(LanguageRun).default([]),
  classification: Classification,
  status: SourceStatus,
  /** Present when status is `parse_failed`, so failure is never silent (L0-ING-001). */
  parseError: z.string().optional(),
  /** Length of the normalised text in CODE POINTS, not UTF-16 units. */
  textLength: z.number().int().nonnegative().default(0),
  /** SHA-256 of the normalised text. Distinct from `sha256` after normalisation. */
  textSha256: Sha256.optional(),
  /** Adapter that produced the units, for selective re-verification. */
  extractorVersion: z.string().optional(),

  // --- extraction provenance ----------------------------------------------
  // These three fields exist so the catalogued rules `L0-ING-007` and
  // `L0-ING-008` are implementable as written rather than as stubs. V1 only ever
  // writes `extractionMethod: 'text'`; the vision and Arabic-reordering values
  // are populated by the V2/V3 adapters under decision A3. Recording the method
  // is what stops vision-extracted content escaping its confidence ceiling
  // (risk R5) by being indistinguishable from a direct text read.
  /** How the text was obtained. `text` is the only value V1 produces. */
  extractionMethod: z.enum(['text', 'vision', 'mixed']).default('text'),
  /** Pages read by vision rather than by direct extraction. */
  visionPageCount: z.number().int().nonnegative().default(0),
  /** Confidence of Arabic logical-order reconstruction, when one was performed. */
  arabicReorderingConfidence: z.number().min(0).max(1).optional(),
});
export type Source = z.infer<typeof Source>;

// ---------------------------------------------------------------------------
// SourceUnit
// ---------------------------------------------------------------------------

export const SourceUnitType = z.enum([
  'heading',
  'paragraph',
  'listItem',
  'tableCell',
  'codeBlock',
  'blockQuote',
  'image',
  'sheetRange',
  'bpmnElement',
  'dmnRule',
  'formField',
  'transcriptTurn',
]);
export type SourceUnitType = z.infer<typeof SourceUnitType>;

export const SourceUnit = z.object({
  id: EntityId,
  sourceId: EntityId,
  projectId: EntityId,
  /** Position within the source. Dense and stable for one extractor version. */
  ordinal: z.number().int().nonnegative(),
  type: SourceUnitType,
  /** NFC, logical order. Null for pure-image units. */
  text: z.string().nullable(),
  language: Bcp47,
  direction: TextDirection,
  /** Heading depth for `heading`, list depth for `listItem`. */
  depth: z.number().int().nonnegative().optional(),
  anchor: ProvenanceAnchor,
});
export type SourceUnit = z.infer<typeof SourceUnit>;

// ---------------------------------------------------------------------------
// EvidenceItem
// ---------------------------------------------------------------------------

export const ExtractedBy = z.enum(['parser', 'ai']);
export type ExtractedBy = z.infer<typeof ExtractedBy>;

/**
 * IMMUTABLE — never edited, only re-extracted (invariant D1, D8).
 *
 * `anchorVerified` MUST be true to persist. The repository port exposes no update
 * or delete method, and migration 002 grants no update path, so this holds even
 * against a direct connection.
 */
export const EvidenceItem = z.object({
  id: EntityId,
  projectId: EntityId,
  sourceId: EntityId,
  /** The unit this evidence was drawn from, when parser-minted. */
  sourceUnitId: EntityId.optional(),
  anchor: ProvenanceAnchor,
  verbatimText: z.string().min(1),
  language: Bcp47,
  /** RAF slot this evidence is a candidate for. A hint, never a commitment. */
  rafSlotHint: z.string().optional(),
  extractedBy: ExtractedBy,
  aiInteractionId: EntityId.optional(),
  citationMode: CitationMode,
  /** MUST be true to persist (D1). */
  anchorVerified: z.boolean(),
  /** Inherited from the source; may be raised, never lowered (ADR-0021 rule 3). */
  classification: Classification,
  createdBy: EntityId,
  createdAt: z.string(),
});
export type EvidenceItem = z.infer<typeof EvidenceItem>;

// ---------------------------------------------------------------------------
// Source viewer contracts (provenance-and-anchoring.md §6)
// ---------------------------------------------------------------------------

/**
 * One painted segment of a highlight.
 *
 * A logical range may paint SEVERAL segments, because a range crossing a
 * direction boundary is visually discontiguous. The viewer must never
 * reconstruct a highlight by re-searching rendered text — that reintroduces
 * every normalisation and direction bug the pipeline exists to eliminate.
 */
export const HighlightSegment = z.object({
  /** Code-point offsets into the source's normalised text. */
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  text: z.string(),
  language: Bcp47,
  direction: TextDirection,
  /** True when this segment's direction differs from the source's base direction. */
  counterFlow: z.boolean(),
});
export type HighlightSegment = z.infer<typeof HighlightSegment>;

export const HighlightRange = z.object({
  sourceId: EntityId,
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  /** Base direction the viewer should apply to the containing block. */
  baseDirection: TextDirection,
  segments: z.array(HighlightSegment),
  /** Resolution outcome of the anchor that produced this range. */
  resolution: z.enum(['resolved', 'drifted', 'broken']),
  /** Present when the anchor drifted or broke, so the viewer can say so. */
  detail: z.string().optional(),
});
export type HighlightRange = z.infer<typeof HighlightRange>;
