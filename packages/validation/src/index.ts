/**
 * @asdp/validation — rule packs L0–L6.
 *
 * PURE package. A rule is a function from state to findings: it cannot read a
 * database, call a provider, or mutate what it judges. That is what makes a
 * validation run reproducible, and a finding id stable across runs
 * (validation-architecture.md §4).
 *
 * V1 implements the L0 ingestion pack. V5 adds `L1-REQ-*` for requirement
 * proposals (**J6**) and V6 adds `L1-CONF-*` for conflict candidates. The rest of
 * L1–L6 arrive with the slices that create the content they judge.
 */

import { blocksGate, type Finding, type GateCode, type RuleDefinition } from '@asdp/schemas';

export {
  type IntakeState,
  L0_INGESTION_RULES,
  ARABIC_REORDERING_CONFIDENCE_FLOOR,
  MIN_UNIT_COVERAGE,
  evaluateL0Ingestion,
} from './l0-ingestion.ts';

export {
  type RequirementUnderTest,
  type RequirementsState,
  L1_REQUIREMENT_RULES,
  evaluateL1Requirements,
} from './l1-requirements.ts';

export {
  type ConflictUnderTest,
  type ConflictsState,
  L1_CONFLICT_RULES,
  evaluateL1Conflicts,
} from './l1-conflicts.ts';

import { L0_INGESTION_RULES } from './l0-ingestion.ts';
import { L1_REQUIREMENT_RULES } from './l1-requirements.ts';
import { L1_CONFLICT_RULES } from './l1-conflicts.ts';

/** Every rule the pack currently contains, for the rule-catalogue endpoint. */
export function allRules(): readonly RuleDefinition[] {
  return [...L0_INGESTION_RULES, ...L1_REQUIREMENT_RULES, ...L1_CONFLICT_RULES];
}

export interface FindingSummary {
  readonly total: number;
  readonly errors: number;
  readonly warnings: number;
  readonly infos: number;
  /** Findings that block the given gate. Emptiness is the gate precondition. */
  readonly blocking: readonly string[];
}

/**
 * Summarise a run for a gate.
 *
 * `blocking` is the list the gate evaluation consumes (invariant I6): a gate is
 * evaluated against finding IDs, not against a count, so the reason a gate is
 * closed is always nameable.
 */
export function summariseFindings(
  findings: readonly Finding[],
  gate: GateCode,
): FindingSummary {
  let errors = 0;
  let warnings = 0;
  let infos = 0;
  const blocking: string[] = [];

  for (const f of findings) {
    const severity = f.severityAtGate[gate];
    if (severity === 'error') errors++;
    else if (severity === 'warning') warnings++;
    else if (severity === 'info') infos++;
    if (blocksGate(f, gate)) blocking.push(f.id);
  }

  return { total: findings.length, errors, warnings, infos, blocking };
}
