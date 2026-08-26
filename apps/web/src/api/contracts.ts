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
import { EvidenceItem, HighlightRange, Requirement } from '@asdp/schemas';

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

/**
 * The label to show, with the direction **and the language** it must be shown in.
 *
 * The language is the API's own `primary.lang`, carried through so the rendered
 * element can declare `lang` as well as `dir`. Both matter: `dir` decides layout,
 * `lang` decides font selection and how a screen reader pronounces it — and U1
 * already set the precedent that an accessible name carries both.
 */
export function labelOf(project: ProjectSummary): {
  text: string;
  direction: 'ltr' | 'rtl' | 'neutral';
  language?: string;
} {
  const primary = project.name?.primary;
  if (primary === undefined) return { text: project.key, direction: 'ltr' };
  const text =
    typeof primary.text === 'string'
      ? primary.text
      : primary.text[primary.lang] ?? Object.values(primary.text)[0] ?? project.key;
  return {
    text: text === '' ? project.key : text,
    direction: primary.direction,
    ...(primary.lang === '' ? {} : { language: primary.lang }),
  };
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

// ---------------------------------------------------------------------------
// U3-b — evidence
// ---------------------------------------------------------------------------

/**
 * Evidence, validated against **the server's own schema**.
 *
 * `EvidenceItem` is imported rather than restated, for the same reason
 * `HighlightRange` is: a locally re-described contract is a contract that drifts
 * silently, and [ADR-0039](../../../../docs/adr/ADR-0039-react-presentation-layer.md)
 * §2 makes `@asdp/schemas` importable precisely so it need not be.
 *
 * It is the stricter choice, deliberately. An evidence item carries an anchor,
 * and an anchor whose shape the client has guessed at is the beginning of a
 * client that guesses at offsets.
 */
export const RecordedEvidence = EvidenceItem;
export type RecordedEvidence = z.infer<typeof EvidenceItem>;

export const EvidenceList = z.object({
  total: z.number().optional(),
  evidence: z.array(EvidenceItem),
});
export type EvidenceList = z.infer<typeof EvidenceList>;

// ---------------------------------------------------------------------------
// U3-c — requirements
// ---------------------------------------------------------------------------

/**
 * A requirement, with the evidence it cites.
 *
 * `Requirement` is the **server's own schema**, imported rather than restated,
 * for the same reason `EvidenceItem` and `HighlightRange` are. The evidence link
 * is described locally because `listRequirements` spreads it onto the row rather
 * than returning it as a named entity.
 */
export const RequirementWithEvidence = Requirement.extend({
  evidence: z
    .array(
      z.object({
        evidenceItemId: z.string(),
        contribution: z.string().optional(),
      }),
    )
    .default([]),
});
export type RequirementWithEvidence = z.infer<typeof RequirementWithEvidence>;

/**
 * The list response.
 *
 * **`requirementSetId` is optional, and its absence is meaningful** — the API
 * omits it when no population pass has ever run, and returns it with `total: 0`
 * when a pass ran and proposed nothing. Those are different facts about a
 * project and the workspace renders them differently, so the schema must not
 * flatten them into one empty list.
 */
export const RequirementList = z.object({
  requirementSetId: z.string().optional(),
  total: z.number().optional(),
  requirements: z.array(RequirementWithEvidence),
});
export type RequirementList = z.infer<typeof RequirementList>;
