/**
 * Response shapes, as zod schemas.
 *
 * Deliberately **permissive about fields this slice does not use** and strict
 * about the ones it does. A schema that demanded every field the server happens
 * to send would turn an additive backend change into a broken UI, which is the
 * opposite of what validation is for here.
 *
 * `@asdp/schemas` is imported for the shared vocabulary; U1 needs only a small
 * part of it, so the rest is described locally rather than re-exported wholesale.
 */

import { z } from 'zod';
import { HighlightRange } from '@asdp/schemas';

/**
 * A project, as the API returns it.
 *
 * `name` is a **bilingual label**, not a string — ADR-0023 is *"Arabic/English
 * from the data model up"*, and the display name therefore carries its own
 * language and direction. Rendering it needs both, so both are kept.
 */
export const BilingualLabel = z.object({
  primary: z.object({
    lang: z.string(),
    /**
     * **Either a plain string or a per-language record**, and the API returns
     * both: creating a project with a string `name` stores `"Debug project"`,
     * while an object name stores `{ en: 'Debug project' }`.
     *
     * U1 accepted only the record form, so a project created the other way made
     * the whole list fail validation. Found by U2's browser tests, which create
     * projects the string way.
     */
    text: z.union([z.string(), z.record(z.string(), z.string())]),
    direction: z.enum(['ltr', 'rtl', 'neutral']),
  }),
  translations: z.array(z.unknown()).optional(),
});

export const ProjectSummary = z.object({
  id: z.string(),
  key: z.string(),
  name: BilingualLabel.optional(),
  createdAt: z.string().optional(),
});
export type ProjectSummary = z.infer<typeof ProjectSummary>;

/** The label to show, with the direction it must be shown in. */
export function labelOf(project: ProjectSummary): { text: string; direction: 'ltr' | 'rtl' | 'neutral' } {
  const primary = project.name?.primary;
  if (primary === undefined) return { text: project.key, direction: 'ltr' };
  const text =
    typeof primary.text === 'string'
      ? primary.text
      : primary.text[primary.lang] ?? Object.values(primary.text)[0] ?? project.key;
  return { text: text === '' ? project.key : text, direction: primary.direction };
}

export const ProjectList = z.array(ProjectSummary);

export const SourceSummary = z.object({
  id: z.string(),
  filename: z.string(),
  kind: z.string().optional(),
  status: z.string().optional(),
  primaryLanguage: z.string().optional(),
  direction: z.enum(['ltr', 'rtl', 'neutral']).optional(),
  classification: z.string().optional(),
  textLength: z.number().optional(),
  authorityRank: z.number().optional(),
});
export type SourceSummary = z.infer<typeof SourceSummary>;

export const SourceList = z.object({
  total: z.number().optional(),
  sources: z.array(SourceSummary),
});

export const SourceUnitView = z.object({
  id: z.string(),
  ordinal: z.number().optional(),
  kind: z.string().optional(),
  text: z.string().optional(),
  direction: z.enum(['ltr', 'rtl', 'neutral']).optional(),
  language: z.string().optional(),
});

export const SourceContent = z.object({
  source: SourceSummary,
  text: z.string(),
  units: z.array(SourceUnitView),
});
export type SourceContent = z.infer<typeof SourceContent>;

/**
 * Highlights.
 *
 * The schema is the SERVER'S OWN — imported from `@asdp/schemas`, not restated.
 * Restating it is how a client contract drifts from the server's, and
 * [ADR-0039](../../../../docs/adr/ADR-0039-react-presentation-layer.md) §2 makes
 * `@asdp/schemas` importable precisely so it does not have to be.
 */
export const HighlightList = z.object({
  total: z.number().optional(),
  ranges: z.array(HighlightRange),
});
export type HighlightList = z.infer<typeof HighlightList>;

// ---------------------------------------------------------------------------
// U2 — sources, ingest, authority and validation
// ---------------------------------------------------------------------------

/**
 * The ingest response.
 *
 * `deduplicated` is the field U2 turns on: identical bytes are one source, and
 * the UI must report that as a duplicate rather than as an upload.
 */
export const IngestResponse = z.object({
  source: SourceSummary,
  unitCount: z.number().optional(),
  deduplicated: z.boolean().optional(),
});
export type IngestResponse = z.infer<typeof IngestResponse>;

/**
 * A validation finding.
 *
 * `severity` is the rule catalogue's (ADR-0026) and is carried through
 * unaltered — the UI groups by it and never reassigns it.
 */
export const FindingSchema = z.object({
  id: z.string().optional(),
  ruleId: z.string(),
  severity: z.string().optional(),
  message: z.string().optional(),
  entityId: z.string().optional(),
  entityType: z.string().optional(),
});

export const IntakeValidation = z.object({
  runId: z.string().optional(),
  findings: z.array(FindingSchema),
  summary: z.unknown().optional(),
});
export type IntakeValidation = z.infer<typeof IntakeValidation>;

export const RuleCatalogue = z.object({
  total: z.number().optional(),
  rules: z.array(
    z.object({
      id: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      severity: z.unknown().optional(),
    }),
  ),
});
export type RuleCatalogue = z.infer<typeof RuleCatalogue>;
