/**
 * Shared primitives.
 *
 * @asdp/schemas is the single source of truth for entity shapes, API contracts
 * and AI output contracts (technology-stack.md). Zod schemas derive TypeScript
 * types; JSON Schema for AI output contracts is derived from the same source.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Identifiers (domain-model.md §9)
// ---------------------------------------------------------------------------

/** ASCII NCName-safe technical identifier (ADR-0024). */
export const NcName = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_.-]*$/, 'must be an ASCII NCName');

/** Per-project monotonic requirement id. Never reused (invariant D15). */
export const RequirementId = z.string().regex(/^REQ-\d{4,}$/);
export const BusinessRuleId = z.string().regex(/^BR-\d{3,}$/);
export const OpenQuestionId = z.string().regex(/^Q-\d{3,}$/);
export const ConflictId = z.string().regex(/^CF-\d{3,}$/);

/** SHA-256 hex digest. */
export const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);

/** Opaque entity identifier. */
export const EntityId = z.string().min(1).max(200);

// ---------------------------------------------------------------------------
// Localised text (ADR-0023 rule 10)
// ---------------------------------------------------------------------------

export const Bcp47 = z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$|^und$/);

export const TextDirection = z.enum(['ltr', 'rtl', 'neutral']);

/**
 * A translation never replaces or shadows the original: evidence quotes are
 * always shown in their source language (ADR-0023 rule 10).
 */
export const LocalizedText = z.object({
  primary: z.object({
    lang: Bcp47,
    text: z.string(),
    direction: TextDirection,
  }),
  translations: z
    .array(
      z.object({
        lang: Bcp47,
        text: z.string(),
        direction: TextDirection,
        producedBy: z.enum(['human', 'ai']),
        aiInteractionId: EntityId.optional(),
        reviewedBy: EntityId.optional(),
      }),
    )
    .default([]),
});
export type LocalizedText = z.infer<typeof LocalizedText>;

/** Convenience constructor for single-language text. */
export function localised(text: string, lang = 'en', direction: 'ltr' | 'rtl' = 'ltr'): LocalizedText {
  return { primary: { lang, text, direction }, translations: [] };
}

// ---------------------------------------------------------------------------
// Data classification (ADR-0021)
// ---------------------------------------------------------------------------

/**
 * Ordered. The classification of a request is the MAXIMUM over its content
 * items — never an average, never the classification of the "main" document.
 */
export const CLASSIFICATION_ORDER = [
  'PUBLIC',
  'INTERNAL',
  'CONFIDENTIAL',
  'RESTRICTED',
  'PROHIBITED',
] as const;

export const Classification = z.enum(CLASSIFICATION_ORDER);
export type Classification = z.infer<typeof Classification>;

export function classificationRank(c: Classification): number {
  return CLASSIFICATION_ORDER.indexOf(c);
}

/** Maximum over a set. Classification only ever rises (ADR-0021 rule 3). */
export function maxClassification(cs: readonly Classification[]): Classification {
  let worst: Classification = 'PUBLIC';
  for (const c of cs) {
    if (classificationRank(c) > classificationRank(worst)) worst = c;
  }
  return worst;
}

// ---------------------------------------------------------------------------
// Epistemic ladder (ADR-0007)
// ---------------------------------------------------------------------------

export const EpistemicLevel = z.enum(['L1', 'L2', 'L3', 'L4']);
export type EpistemicLevel = z.infer<typeof EpistemicLevel>;

export const Derivation = z.enum(['extracted', 'interpreted', 'inferred']);
export type Derivation = z.infer<typeof Derivation>;

export const ConfidenceBand = z.enum(['HIGH', 'MEDIUM', 'LOW']);
export type ConfidenceBand = z.infer<typeof ConfidenceBand>;

// ---------------------------------------------------------------------------
// Gates (governance-and-gates.md)
// ---------------------------------------------------------------------------

export const GateCode = z.enum(['G0', 'G1', 'G2', 'G3', 'G4']);
export type GateCode = z.infer<typeof GateCode>;

export const GATE_ORDER = ['G0', 'G1', 'G2', 'G3', 'G4'] as const;

export const Stage = z.enum([
  'intake',
  'analysis',
  'requirements',
  'specification',
  'generation',
  'validation',
  'testing',
  'release',
]);
export type Stage = z.infer<typeof Stage>;

// ---------------------------------------------------------------------------
// Roles (identity-and-access.md §4)
// ---------------------------------------------------------------------------

export const Role = z.enum([
  'Viewer',
  'Contributor',
  'BusinessAnalyst',
  'ProcessArchitect',
  'BusinessApprover',
  'TechnicalApprover',
  'CamundaDeveloper',
  'TestDesigner',
  'ComplianceReviewer',
  'PlatformAdmin',
]);
export type Role = z.infer<typeof Role>;
