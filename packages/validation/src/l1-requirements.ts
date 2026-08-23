/**
 * L1-REQ — structural integrity of requirement proposals (V5, decision **J6**).
 *
 * ## Why L1, and why not a new layer
 *
 * [validation-architecture.md](../../../docs/40-quality/validation-architecture.md)
 * §3 defines **seven layers**. L0 is *ingestion integrity* — "sources parsed,
 * anchors resolvable, text normalised, classification assigned" — and a
 * requirement is not an ingestion artefact, so stretching L0 to cover it would
 * make the layer's name mean less. L1 is *"Schema & structural"* and gates
 * *"All"*, which is exactly what these are: structural invariants over an entity
 * (**D2**, **D10**, **D15**, slot legality). An eighth layer would be a larger
 * change than five rules justify.
 *
 * ## Why only five
 *
 * Requirement *quality* signals — vague quantifier, actor unknown, untestable —
 * are **not** here, and that is decision **J6** rather than an omission. RAF §3
 * derives the `ambiguities` slot from `RequirementFlag` records, and G1's criterion
 * is "0 blocking **flags**". Blocking-ness belongs to the flag; the catalogue keeps
 * the structural checks.
 *
 * ## Why four of them should never fire
 *
 * The proposal gate refuses those writes, so a violation here means the gate was
 * bypassed or is wrong. That is the established pattern rather than a weakness:
 * validation-architecture.md §3 says structurally unreachable rules "remain
 * implemented as defence against compiler defects, and a violation is reported as
 * an internal error, not a user error". `L1-REQ-002` is the exception — an anchor
 * can drift *after* the proposal is written, and nothing in the gate can prevent
 * that happening tomorrow.
 */

import { isCitable, resolveAnchor } from '@asdp/provenance';
import {
  CLASSIFICATION_ORDER,
  findingId,
  severityAt,
  type Classification,
  type EvidenceItem,
  type Finding,
  type GateCode,
  type RequirementEvidenceLink,
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

export const L1_REQUIREMENT_RULES: readonly RuleDefinition[] = [
  rule(
    'L1-REQ-001',
    'error',
    'l1.req.001.noEvidence',
    'l1.req.001.fix',
    'Every requirement must cite at least one EvidenceItem (invariant D2). A requirement with no ' +
      'evidence is an inference however it is worded, and V5 persists grounded proposals only ' +
      '(decision J1). Unreachable through the proposal gate, which refuses the write; a violation ' +
      'here is an internal defect rather than a user error.',
  ),
  rule(
    'L1-REQ-002',
    'error',
    'l1.req.002.evidenceAnchorUnresolved',
    'l1.req.002.fix',
    'Every anchor cited by a requirement must still resolve (ADR-0008). This is the one rule in ' +
      'the family that is genuinely reachable: the gate verifies anchors at write time, and an ' +
      'anchor can drift afterwards. A requirement resting on a citation that no longer points ' +
      'anywhere is unfounded, and it is unfounded silently.',
  ),
  rule(
    'L1-REQ-003',
    'error',
    'l1.req.003.classificationBelowEvidence',
    'l1.req.003.fix',
    "A requirement's classification must be at least the maximum classification of the evidence " +
      'it cites (invariant D10). Classification may rise, never fall: a proposition derived from ' +
      'CONFIDENTIAL material is CONFIDENTIAL, whatever the wording suggests.',
  ),
  rule(
    'L1-REQ-004',
    'error',
    'l1.req.004.disjointnessViolated',
    'l1.req.004.fix',
    'A requirement must sit in the slot the v1.1 disjointness rules assign it. An item assigned ' +
      'to the wrong member of a pair leaves the other slot falsely empty, or is counted twice and ' +
      'inflates coverage — and coverage is what G1 is evaluated against.',
  ),
  rule(
    'L1-REQ-005',
    'info',
    'l1.req.005.contentUnverifiedEvidenceOnly',
    'l1.req.005.fix',
    'A requirement resting only on image-region evidence is target-verified but never ' +
      'content-verified (ADR-0038). Informational rather than an error: it is a legitimate ' +
      'requirement, and the disclosure exists so nobody later mistakes a reading of a picture for ' +
      'a reading of text.',
  ),
];

/**
 * A requirement as this pack needs to see it.
 *
 * Deliberately not the full `Requirement`: a rule is a function from state to
 * findings, and narrowing the input is what stops a rule quietly depending on a
 * field it has no business reading.
 */
export interface RequirementUnderTest {
  readonly id: string;
  readonly projectId: string;
  readonly rafSlot: string;
  readonly classification: string;
  /** The slot the disjointness rules resolve this item to, computed by the caller. */
  readonly resolvedSlot: string;
}

export interface RequirementsState {
  readonly requirements: readonly RequirementUnderTest[];
  readonly links: readonly RequirementEvidenceLink[];
  readonly evidenceById: ReadonlyMap<string, EvidenceItem>;
  /** Canonical text per source, so anchors can be re-resolved. */
  readonly textBySource: ReadonlyMap<string, string>;
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
  const held = L1_REQUIREMENT_RULES.find((r) => r.id === ruleId);
  if (held === undefined) throw new Error(`unknown L1-REQ rule ${ruleId}`);
  return held;
}

function finding(
  runId: string,
  ruleId: string,
  requirementId: string,
  params: Record<string, string | number>,
): Finding {
  const definition = definitionOf(ruleId);
  const target: TargetRef = { requirementId };
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
 * Evaluate the L1-REQ pack.
 *
 * Deterministic in output and in ORDER: findings come out sorted by rule then by
 * requirement id, so two runs over the same state produce the same list and a
 * diff between runs means something changed in the state rather than in a map's
 * iteration order.
 */
export function evaluateL1Requirements(
  state: RequirementsState,
  runId: string,
): readonly Finding[] {
  const findings: Finding[] = [];

  const linksByRequirement = new Map<string, RequirementEvidenceLink[]>();
  for (const link of state.links) {
    const list = linksByRequirement.get(link.requirementId) ?? [];
    list.push(link);
    linksByRequirement.set(link.requirementId, list);
  }

  for (const requirement of state.requirements) {
    const links = linksByRequirement.get(requirement.id) ?? [];

    // --- L1-REQ-001: cites evidence (D2) ---------------------------------
    if (links.length === 0) {
      findings.push(
        finding(runId, 'L1-REQ-001', requirement.id, { requirementId: requirement.id }),
      );
      // Nothing further can be said about a requirement with no citations: every
      // remaining rule is about the evidence it cites.
      continue;
    }

    const cited = links.flatMap((l) => {
      const item = state.evidenceById.get(l.evidenceItemId);
      return item === undefined ? [] : [item];
    });

    // A cited id with no evidence row is the same defect as an unresolvable
    // anchor, reported by the same rule: the citation leads nowhere.
    for (const link of links) {
      if (!state.evidenceById.has(link.evidenceItemId)) {
        findings.push(
          finding(runId, 'L1-REQ-002', requirement.id, {
            evidenceItemId: link.evidenceItemId,
            reason: 'the cited evidence does not exist',
          }),
        );
      }
    }

    // --- L1-REQ-002: every cited anchor still resolves (ADR-0008) --------
    for (const item of cited) {
      const storedText = state.textBySource.get(item.sourceId);
      if (storedText === undefined) {
        findings.push(
          finding(runId, 'L1-REQ-002', requirement.id, {
            evidenceItemId: item.id,
            reason: `source ${item.sourceId} has no stored text, so the anchor cannot be verified`,
          }),
        );
        continue;
      }
      const resolution = resolveAnchor(item.anchor, { storedText });
      if (!isCitable(resolution.status) || resolution.status !== 'resolved') {
        findings.push(
          finding(runId, 'L1-REQ-002', requirement.id, {
            evidenceItemId: item.id,
            reason: `the anchor no longer resolves (${resolution.status})`,
          }),
        );
      }
    }

    // --- L1-REQ-003: classification monotonicity (D10) -------------------
    const highest = cited.reduce(
      (max, item) =>
        CLASSIFICATION_ORDER.indexOf(item.classification) > CLASSIFICATION_ORDER.indexOf(max)
          ? item.classification
          : max,
      (cited[0]?.classification ?? 'PUBLIC') as Classification,
    );
    if (
      cited.length > 0 &&
      CLASSIFICATION_ORDER.indexOf(requirement.classification as Classification) <
        CLASSIFICATION_ORDER.indexOf(highest)
    ) {
      findings.push(
        finding(runId, 'L1-REQ-003', requirement.id, {
          requirementClassification: requirement.classification,
          evidenceClassification: highest,
        }),
      );
    }

    // --- L1-REQ-004: disjointness ----------------------------------------
    if (requirement.resolvedSlot !== requirement.rafSlot) {
      findings.push(
        finding(runId, 'L1-REQ-004', requirement.id, {
          assignedSlot: requirement.rafSlot,
          resolvedSlot: requirement.resolvedSlot,
        }),
      );
    }

    // --- L1-REQ-005: visual-only evidence (ADR-0038) ---------------------
    if (cited.length > 0 && cited.every((item) => item.anchor.target.kind === 'image_region')) {
      findings.push(finding(runId, 'L1-REQ-005', requirement.id, { requirementId: requirement.id }));
    }
  }

  return findings.sort((a, b) =>
    a.ruleId === b.ruleId ? a.id.localeCompare(b.id) : a.ruleId.localeCompare(b.ruleId),
  );
}
