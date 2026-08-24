/**
 * L4-REQ — G1 readiness (V7, decision **U9**).
 *
 * ## Why these are rules at all
 *
 * [governance-and-gates.md](../../../docs/50-governance/governance-and-gates.md) §1
 * says it directly: *"Every blocking precondition above is a **rule with a stable
 * ID**, so it appears in the validation report, can be cited in a ticket or
 * comment, is tracked across runs, and renders in the reviewer's language."*
 *
 * A gate that fails with "not ready" tells a reviewer nothing. A gate that fails
 * with `L4-REQ-003` and a count tells them what to go and do.
 *
 * ## Why L4
 *
 * L4's scope is *"Traceability, completeness **and specification integrity**"*, and
 * these are completeness checks over a set that is about to be frozen and signed.
 * L0 is ingestion, L1 is structural-per-entity, L2/L3 are the IR and Camunda —
 * none of which is "is this requirement set ready to be approved?".
 *
 * ## The one thing these rules must not become
 *
 * **They do not decide anything.** They report whether the eight preconditions
 * hold. `evaluateGate` consumes the blocking finding ids and nothing else
 * (invariant I6: the Validation Engine is the sole authority on readiness, and
 * gates only query it).
 */

import {
  findingId,
  severityAt,
  type Finding,
  type GateCode,
  type RuleDefinition,
  type Severity,
  type TargetRef,
} from '@asdp/schemas';

function rule(
  id: string,
  severity: Severity,
  messageKey: string,
  fixHintKey: string,
  documentation: string,
): RuleDefinition {
  return {
    id,
    layer: 'L4',
    gates: ['G1'],
    severity,
    messageKey,
    fixHintKey,
    documentation,
    profileAdjustable: false,
  };
}

export const L4_REQUIREMENT_RULES: readonly RuleDefinition[] = [
  rule(
    'L4-REQ-001',
    'error',
    'l4.req.001.notAllReviewed',
    'l4.req.001.fix',
    'Every requirement in the set must have been REVIEWED — accepted into review, or explicitly ' +
      'deferred or rejected. A baseline containing an untouched draft is a baseline nobody read.\n\n' +
      'Note the precondition is "reviewed", not "approved": G1 APPROVAL IS WHAT PROMOTES THEM TO ' +
      'L4, so requiring them to be approved beforehand would make the gate unreachable by ' +
      'construction. "All requirements at L4" is G1\'s POST-condition; this is its pre-condition.',
  ),
  rule(
    'L4-REQ-002',
    'error',
    'l4.req.002.blockingFlagsOpen',
    'l4.req.002.fix',
    'No blocking RequirementFlag may remain unresolved. A blocking flag is the analysis layer ' +
      "saying this requirement is not usable as written; approving it anyway makes the flag " +
      'decorative.',
  ),
  rule(
    'L4-REQ-003',
    'error',
    'l4.req.003.conflictsUnresolved',
    'l4.req.003.fix',
    'No conflict candidate may remain undecided (ADR-0012: "a human MUST decide every conflict"). ' +
      'An undecided conflict means two approved requirements may contradict each other, which is ' +
      'exactly the state a requirements baseline exists to exclude.',
  ),
  rule(
    'L4-REQ-004',
    'error',
    'l4.req.004.blockingQuestionsUnanswered',
    'l4.req.004.fix',
    'No blocking clarification question may remain unanswered. A blocking question marks a gap ' +
      'that stops the requirement set being complete; approving around it approves a known unknown.',
  ),
  rule(
    'L4-REQ-005',
    'error',
    'l4.req.005.requiredSlotEmpty',
    'l4.req.005.fix',
    'Every RAF slot marked requiredForExecutability must be non-empty (ADR-0010). An empty ' +
      'required slot is a question the process cannot answer about itself, and it will surface at ' +
      'generation as an unbuildable element rather than as a missing requirement.',
  ),
  rule(
    'L4-REQ-006',
    'error',
    'l4.req.006.inferenceUnconfirmed',
    'l4.req.006.fix',
    'Every LOW-confidence inferred requirement must be explicitly confirmed by a human. An ' +
      'inferred requirement has no direct source (decision U8-a); at LOW confidence it is a ' +
      'judgement call that someone must own by name before it enters a signed baseline.',
  ),
  rule(
    'L4-REQ-007',
    'error',
    'l4.req.007.policySlotUnacknowledged',
    'l4.req.007.fix',
    'Every slot blocked by data-governance policy must be explicitly acknowledged. "We were not ' +
      'permitted to read this" is a fundamentally different finding from "the sources do not say" ' +
      '(data-governance.md §3.1), and approving without acknowledging it silently converts the ' +
      'first into the second.',
  ),
  rule(
    'L4-REQ-008',
    'error',
    'l4.req.008.ingestionNotClean',
    'l4.req.008.fix',
    'The L0 ingestion pack must be clean. If a source anchor does not resolve, every requirement ' +
      'downstream of it is unfounded — so L0 is a precondition of G1 rather than a parallel ' +
      'concern.',
  ),
];

/**
 * The state G1 readiness is computed from.
 *
 * Deliberately counts and ids rather than entities: a rule is a function from
 * state to findings, and handing it the whole database would let it quietly grow
 * a dependency on something it has no business reading.
 */
export interface G1State {
  readonly projectId: string;
  readonly requirementSetId: string;
  /**
   * Requirements still `draft` or `needs_clarification` — i.e. **not yet reviewed**.
   *
   * Not "not approved": approval is what G1 does, and demanding it beforehand
   * would make the gate unreachable.
   */
  readonly unapprovedRequirementIds: readonly string[];
  /** Unresolved flags whose severity is `blocking`. */
  readonly openBlockingFlagIds: readonly string[];
  /** Conflicts with `decision is null`. */
  readonly undecidedConflictIds: readonly string[];
  /** Blocking questions with no answer. */
  readonly unansweredBlockingQuestionIds: readonly string[];
  /** Required RAF slots reported `empty` by `computeFrameCoverage`. */
  readonly emptyRequiredSlots: readonly string[];
  /** LOW-confidence inferred requirements with no explicit confirmation. */
  readonly unconfirmedInferenceIds: readonly string[];
  /** `blocked_by_policy` slots with no acknowledgement. */
  readonly unacknowledgedPolicySlots: readonly string[];
  /** Blocking L0 finding ids from `evaluateL0Ingestion`. */
  readonly openL0FindingIds: readonly string[];
}

function severityByGate(definition: RuleDefinition): Record<GateCode, Severity> {
  const out: Partial<Record<GateCode, Severity>> = {};
  for (const gate of definition.gates) {
    const s = severityAt(definition, gate);
    if (s !== undefined) out[gate] = s;
  }
  return out as Record<GateCode, Severity>;
}

function definitionOf(ruleId: string): RuleDefinition {
  const held = L4_REQUIREMENT_RULES.find((r) => r.id === ruleId);
  if (held === undefined) throw new Error(`unknown L4-REQ rule ${ruleId}`);
  return held;
}

function finding(
  runId: string,
  ruleId: string,
  requirementSetId: string,
  params: Record<string, string | number>,
): Finding {
  const definition = definitionOf(ruleId);
  // The target is the SET, not an individual requirement: these are completeness
  // properties of the thing being frozen, and a per-requirement finding would
  // report the same gap once per row.
  const target: TargetRef = { artifactKey: `requirementSet:${requirementSetId}` };
  return {
    id: findingId(ruleId, target),
    runId,
    ruleId,
    layer: 'L4',
    severityAtGate: severityByGate(definition),
    targetRef: target,
    messageKey: definition.messageKey,
    messageParams: params,
    fixHintKey: definition.fixHintKey,
    fixHintParams: {},
  };
}

/**
 * Evaluate G1 readiness.
 *
 * **Every precondition blocks independently**, which is what makes the readiness
 * panel useful: a reviewer sees all eight, not the first one to fail. Deterministic
 * in output and in order.
 */
export function evaluateG1Readiness(state: G1State, runId: string): readonly Finding[] {
  const findings: Finding[] = [];
  const set = state.requirementSetId;

  if (state.unapprovedRequirementIds.length > 0) {
    findings.push(
      finding(runId, 'L4-REQ-001', set, {
        count: state.unapprovedRequirementIds.length,
        examples: state.unapprovedRequirementIds.slice(0, 5).join(', '),
      }),
    );
  }
  if (state.openBlockingFlagIds.length > 0) {
    findings.push(finding(runId, 'L4-REQ-002', set, { count: state.openBlockingFlagIds.length }));
  }
  if (state.undecidedConflictIds.length > 0) {
    findings.push(finding(runId, 'L4-REQ-003', set, { count: state.undecidedConflictIds.length }));
  }
  if (state.unansweredBlockingQuestionIds.length > 0) {
    findings.push(
      finding(runId, 'L4-REQ-004', set, { count: state.unansweredBlockingQuestionIds.length }),
    );
  }
  if (state.emptyRequiredSlots.length > 0) {
    findings.push(
      finding(runId, 'L4-REQ-005', set, {
        count: state.emptyRequiredSlots.length,
        slots: state.emptyRequiredSlots.join(', '),
      }),
    );
  }
  if (state.unconfirmedInferenceIds.length > 0) {
    findings.push(
      finding(runId, 'L4-REQ-006', set, { count: state.unconfirmedInferenceIds.length }),
    );
  }
  if (state.unacknowledgedPolicySlots.length > 0) {
    findings.push(
      finding(runId, 'L4-REQ-007', set, {
        count: state.unacknowledgedPolicySlots.length,
        slots: state.unacknowledgedPolicySlots.join(', '),
      }),
    );
  }
  if (state.openL0FindingIds.length > 0) {
    findings.push(finding(runId, 'L4-REQ-008', set, { count: state.openL0FindingIds.length }));
  }

  return findings.sort((a, b) => a.ruleId.localeCompare(b.ruleId));
}
