/**
 * L1-CONF — structural integrity of conflict candidates (V6).
 *
 * ## Namespace, and a flag rather than a silent choice
 *
 * `L1-CONF-*` follows the reasoning approved for **J6** in V5: L1 is *"Schema &
 * structural"* at all gates, these are structural invariants over an entity, and
 * an eighth validation layer would be a larger change than seven rules justify.
 *
 * **The namespace was NOT in the approved Q1–Q9 list.** It is implemented on the
 * J6 precedent and raised at acceptance, because rule IDs are permanent and are
 * never renumbered — choosing one quietly would be the kind of decision that is
 * cheap now and expensive forever.
 *
 * ## The rule that carries the slice
 *
 * `L1-CONF-004` checks, after the fact, the thing migration 009 refuses on
 * insert: **no conflict has a decision unless a human set it**. Two mechanisms for
 * one invariant is not redundancy here — the SQL constraint protects the write
 * path, and this protects a database that was written to by something else.
 */

import {
  CLASSIFICATION_ORDER,
  findingId,
  severityAt,
  type Classification,
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
    layer: 'L1',
    gates: ['G1'],
    severity,
    messageKey,
    fixHintKey,
    documentation,
    profileAdjustable: false,
  };
}

export const L1_CONFLICT_RULES: readonly RuleDefinition[] = [
  rule(
    'L1-CONF-001',
    'error',
    'l1.conf.001.participantUnresolved',
    'l1.conf.001.fix',
    'Every conflict participant must resolve to an existing requirement or evidence item. A ' +
      'conflict naming something that does not exist cannot be decided, and it blocks G1 while ' +
      'being undecidable — the worst of both.',
  ),
  rule(
    'L1-CONF-002',
    'error',
    'l1.conf.002.detectionUnattributed',
    'l1.conf.002.fix',
    'A conflict detected by an AI pass must name its aiInteractionId. An undisclosable detection ' +
      'is not a detection: a reader cannot tell what was sent, to which provider, under what ' +
      'classification (invariant I8, ADR-0032).',
  ),
  rule(
    'L1-CONF-003',
    'error',
    'l1.conf.003.recommendationUnexplained',
    'l1.conf.003.fix',
    'A conflict carrying a precedence recommendation must carry a rationale naming which ADR-0012 ' +
      'step produced it. A recommendation with no rationale is a verdict, and "precedence said so" ' +
      'is not an acceptable audit answer.',
  ),
  rule(
    'L1-CONF-004',
    'error',
    'l1.conf.004.decidedWithoutHuman',
    'l1.conf.004.fix',
    'No conflict may carry a decision unless a human set it (decision Q1, ADR-0012: "a human MUST ' +
      'decide every conflict"). Migration 009 refuses this on insert; this rule catches a database ' +
      'written to by something other than the command path.',
  ),
  rule(
    'L1-CONF-005',
    'warning',
    'l1.conf.005.precedenceUndecidable',
    'l1.conf.005.fix',
    'Precedence could not separate the participants: equal authority, no comparable dates, ' +
      'undetermined specificity and equal epistemic level. A warning rather than an error — the ' +
      'conflict is real and decidable by a human, who simply has no computed starting point. ' +
      'Decision Q4 forbids breaking the tie arbitrarily.',
  ),
  rule(
    'L1-CONF-006',
    'info',
    'l1.conf.006.unconfirmedMergeUsed',
    'l1.conf.006.fix',
    'A canonical merge used while grouping this candidate is AI-proposed and unconfirmed. ' +
      'Informational: an unconfirmed merge may group candidates for review, but it may not resolve ' +
      'one, and a reader should know the grouping rests on an unverified equivalence.',
  ),
  rule(
    'L1-CONF-007',
    'warning',
    'l1.conf.007.participantSourceUndated',
    'l1.conf.007.fix',
    'A source contributing to this conflict declares no effective date, so ADR-0012 step 2 cannot ' +
      'be evaluated and precedence is weaker than it could be. This is the live consequence of ' +
      'L0-ING-010, which warns about the missing date at intake.',
  ),
];

/** A conflict as this pack needs to see it. */
export interface ConflictUnderTest {
  readonly id: string;
  readonly projectId: string;
  readonly detectedByAi: boolean;
  readonly aiInteractionId?: string;
  readonly hasRecommendation: boolean;
  readonly hasRationale: boolean;
  readonly precedenceUndecidable: boolean;
  readonly decision?: string;
  readonly decidedBy?: string;
  /** Participant ids, with the role each plays. */
  readonly participants: readonly { readonly role: string; readonly entityId: string }[];
  /** True when any canonical entity used to group this candidate is unconfirmed. */
  readonly usedUnconfirmedMerge: boolean;
  /** Sources contributing to the conflict that declare no effective date. */
  readonly undatedSourceIds: readonly string[];
}

export interface ConflictsState {
  readonly conflicts: readonly ConflictUnderTest[];
  /** Ids that exist: requirement ids and evidence ids. */
  readonly knownRequirementIds: ReadonlySet<string>;
  readonly knownEvidenceIds: ReadonlySet<string>;
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
  const held = L1_CONFLICT_RULES.find((r) => r.id === ruleId);
  if (held === undefined) throw new Error(`unknown L1-CONF rule ${ruleId}`);
  return held;
}

function finding(
  runId: string,
  ruleId: string,
  conflictId: string,
  params: Record<string, string | number>,
): Finding {
  const definition = definitionOf(ruleId);
  // A conflict is not one of TargetRef's named entities, so it is addressed by
  // `artifactKey` — the general slot — rather than by inventing a field. Finding
  // ids stay deterministic either way, which is what the id contract requires.
  const target: TargetRef = { artifactKey: `conflict:${conflictId}` };
  return {
    id: findingId(ruleId, target),
    runId,
    ruleId,
    layer: 'L1',
    severityAtGate: severityByGate(definition),
    targetRef: target,
    messageKey: definition.messageKey,
    messageParams: params,
    fixHintKey: definition.fixHintKey,
    fixHintParams: {},
  };
}

/**
 * Evaluate the L1-CONF pack.
 *
 * Deterministic in output and in ORDER, so two runs over the same state produce
 * the same list and a diff between runs means the state changed.
 */
export function evaluateL1Conflicts(state: ConflictsState, runId: string): readonly Finding[] {
  const findings: Finding[] = [];

  for (const conflict of state.conflicts) {
    // --- L1-CONF-004 first: a decided conflict is the gravest defect here ---
    if (conflict.decision !== undefined || conflict.decidedBy !== undefined) {
      findings.push(
        finding(runId, 'L1-CONF-004', conflict.id, {
          decision: conflict.decision ?? '(unset)',
          decidedBy: conflict.decidedBy ?? '(unset)',
        }),
      );
    }

    for (const participant of conflict.participants) {
      const known =
        participant.role === 'requirement'
          ? state.knownRequirementIds.has(participant.entityId)
          : state.knownEvidenceIds.has(participant.entityId);
      if (!known) {
        findings.push(
          finding(runId, 'L1-CONF-001', conflict.id, {
            entityId: participant.entityId,
            role: participant.role,
          }),
        );
      }
    }

    if (
      conflict.detectedByAi &&
      (conflict.aiInteractionId === undefined || conflict.aiInteractionId === '')
    ) {
      findings.push(finding(runId, 'L1-CONF-002', conflict.id, { conflictId: conflict.id }));
    }

    if (conflict.hasRecommendation && !conflict.hasRationale) {
      findings.push(finding(runId, 'L1-CONF-003', conflict.id, { conflictId: conflict.id }));
    }

    if (conflict.precedenceUndecidable) {
      findings.push(finding(runId, 'L1-CONF-005', conflict.id, { conflictId: conflict.id }));
    }

    if (conflict.usedUnconfirmedMerge) {
      findings.push(finding(runId, 'L1-CONF-006', conflict.id, { conflictId: conflict.id }));
    }

    if (conflict.undatedSourceIds.length > 0) {
      findings.push(
        finding(runId, 'L1-CONF-007', conflict.id, {
          sourceIds: conflict.undatedSourceIds.join(', '),
        }),
      );
    }
  }

  return findings.sort((a, b) =>
    a.ruleId === b.ruleId ? a.id.localeCompare(b.id) : a.ruleId.localeCompare(b.ruleId),
  );
}

/** Exported for the conflict classification check used by the command layer. */
export function highestClassification(values: readonly Classification[]): Classification {
  return values.reduce<Classification>(
    (max, v) => (CLASSIFICATION_ORDER.indexOf(v) > CLASSIFICATION_ORDER.indexOf(max) ? v : max),
    'PUBLIC',
  );
}
