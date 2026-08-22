/**
 * @asdp/schemas — the single source of truth for entity shapes, API contracts
 * and AI output contracts.
 *
 * One schema, three consumers (ADR-0030): TypeScript types for the codebase,
 * OpenAPI for the HTTP surface, JSON Schema for AI output contracts. Schema
 * drift between them is eliminated by construction.
 *
 * CONTRACT package: depends on nothing but zod.
 */

export * from './primitives.ts';
export * from './validation.ts';
export * from './governance.ts';
export * from './intake.ts';
export * from './ai.ts';
