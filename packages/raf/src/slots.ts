/**
 * Requirement Analysis Frame v1.1 — the 27 slots.
 *
 * ADR-0010: the analysis dimensions are a FIXED, VERSIONED SCHEMA OWNED BY CODE.
 * Code owns the slots; AI fills them; code measures what is empty. A model that
 * forgets to mention a gap cannot hide it, because the gap is the absence of a
 * slot value.
 */

export const RAF_VERSION = 'raf-1.1';

export type RafSlotKey =
  // A. Business context
  | 'businessObjective'
  | 'serviceDescription'
  | 'scopeAndExclusions'
  | 'successMeasures'
  | 'currentStateProcess'
  // B. Participants
  | 'actors'
  | 'responsibilities'
  // C. Process behaviour
  | 'trigger'
  | 'preconditions'
  | 'processSteps'
  | 'alternativePaths'
  | 'outcomes'
  // D. Decisions and rules
  | 'businessRules'
  | 'decisions'
  // E. Data
  | 'inputs'
  | 'outputs'
  | 'dataRequirements'
  // F. Interaction with the outside
  | 'integrations'
  | 'notifications'
  // G. Time, failure and recovery
  | 'slasAndTimers'
  | 'exceptions'
  | 'escalations'
  // H. Quality and control
  | 'nonFunctionalRequirements'
  | 'securityAndPrivacy'
  // I. Framing
  | 'dependencies'
  | 'assumptions'
  | 'constraints';

export type RafGroup =
  | 'business_context'
  | 'participants'
  | 'process_behaviour'
  | 'decisions_and_rules'
  | 'data'
  | 'external_interaction'
  | 'time_failure_recovery'
  | 'quality_and_control'
  | 'framing';

export interface RafSlotDefinition {
  readonly key: RafSlotKey;
  readonly group: RafGroup;
  /** Empty ⇒ G1 blocked (governance-and-gates.md §1). */
  readonly requiredForExecutability: boolean;
  /** The business question the slot answers, for the coverage dashboard. */
  readonly question: string;
  /** What downstream entity this slot populates. */
  readonly populates: readonly string[];
}

export const RAF_SLOTS: readonly RafSlotDefinition[] = [
  { key: 'businessObjective', group: 'business_context', requiredForExecutability: true,
    question: 'What outcome does this serve? Why is it worth doing?', populates: ['ProcessSpec.goal'] },
  { key: 'serviceDescription', group: 'business_context', requiredForExecutability: true,
    question: 'What is the service, in a paragraph a business owner would accept?', populates: ['ProcessSpec.description'] },
  { key: 'scopeAndExclusions', group: 'business_context', requiredForExecutability: false,
    question: 'What is explicitly NOT included?', populates: ['ProcessSpec.scope', 'Requirement(constraint)'] },
  { key: 'successMeasures', group: 'business_context', requiredForExecutability: false,
    question: 'How will we know it is working? Measured against what target?', populates: ['SpecKpi'] },
  { key: 'currentStateProcess', group: 'business_context', requiredForExecutability: false,
    question: 'How is this done today, if at all?', populates: [] },

  { key: 'actors', group: 'participants', requiredForExecutability: true,
    question: 'Which human roles, systems and external parties exist?', populates: ['Actor'] },
  { key: 'responsibilities', group: 'participants', requiredForExecutability: false,
    question: 'Who is accountable, responsible, consulted, informed — for which step?', populates: ['SpecStep.actorId'] },

  { key: 'trigger', group: 'process_behaviour', requiredForExecutability: true,
    question: 'What starts it? Can it start in more than one way?', populates: ['ProcessSpec.triggers'] },
  { key: 'preconditions', group: 'process_behaviour', requiredForExecutability: false,
    question: 'What must be true before it can start?', populates: ['ProcessSpec.preconditions'] },
  { key: 'processSteps', group: 'process_behaviour', requiredForExecutability: true,
    question: 'The primary path: what work, in what order, by whom?', populates: ['SpecStep', 'SpecFlow'] },
  { key: 'alternativePaths', group: 'process_behaviour', requiredForExecutability: false,
    question: 'Named legitimate deviations from the primary path', populates: ['SpecFlow'] },
  { key: 'outcomes', group: 'process_behaviour', requiredForExecutability: true,
    question: 'What business end states exist, including unsuccessful ones?', populates: ['ProcessSpec.outcomes'] },

  { key: 'businessRules', group: 'decisions_and_rules', requiredForExecutability: false,
    question: 'Which policies constrain or determine behaviour?', populates: ['BusinessRule'] },
  { key: 'decisions', group: 'decisions_and_rules', requiredForExecutability: false,
    question: 'Where is a determination made, on what inputs, with what results?', populates: ['SpecDecisionPoint', 'DecisionSpec'] },

  { key: 'inputs', group: 'data', requiredForExecutability: true,
    question: 'What information or documents enter?', populates: ['DataEntity', 'DataField'] },
  { key: 'outputs', group: 'data', requiredForExecutability: true,
    question: 'What information or documents are produced, and for whom?', populates: ['DataField', 'FormSpec'] },
  { key: 'dataRequirements', group: 'data', requiredForExecutability: true,
    question: 'What is created, read, updated, retained — and for how long?', populates: ['DataEntity', 'DataField'] },

  { key: 'integrations', group: 'external_interaction', requiredForExecutability: false,
    question: 'Which external systems, in which direction, synchronous or not?', populates: ['SpecIntegration', 'ServiceInterface'] },
  { key: 'notifications', group: 'external_interaction', requiredForExecutability: false,
    question: 'Who is told what, when, through which channel?', populates: ['NotificationSpec'] },

  { key: 'slasAndTimers', group: 'time_failure_recovery', requiredForExecutability: false,
    question: 'What time limits apply, measured how, from when?', populates: ['SpecStep.slaTarget'] },
  { key: 'exceptions', group: 'time_failure_recovery', requiredForExecutability: false,
    question: 'What can go wrong, and what happens then? Does anything need undoing?', populates: ['SpecException'] },
  { key: 'escalations', group: 'time_failure_recovery', requiredForExecutability: false,
    question: 'Who takes over, or is informed, when a limit is breached?', populates: ['SpecEscalation'] },

  { key: 'nonFunctionalRequirements', group: 'quality_and_control', requiredForExecutability: false,
    question: 'Volume, peak load, performance, availability, retention, auditability', populates: ['Requirement(nfr)'] },
  { key: 'securityAndPrivacy', group: 'quality_and_control', requiredForExecutability: false,
    question: 'Authentication, authorisation, confidentiality, personal data handling', populates: ['Requirement(security)'] },

  { key: 'dependencies', group: 'framing', requiredForExecutability: false,
    question: 'What must exist elsewhere for this to work?', populates: ['Requirement(dependency)'] },
  { key: 'assumptions', group: 'framing', requiredForExecutability: false,
    question: 'What are we taking as given, unverified?', populates: ['Requirement(assumption)'] },
  { key: 'constraints', group: 'framing', requiredForExecutability: false,
    question: 'What cannot change — and on whose authority?', populates: ['Requirement(constraint)', 'BusinessRule'] },
];

export const RAF_SLOT_KEYS: readonly RafSlotKey[] = RAF_SLOTS.map((s) => s.key);

export const REQUIRED_SLOT_KEYS: readonly RafSlotKey[] = RAF_SLOTS.filter(
  (s) => s.requiredForExecutability,
).map((s) => s.key);

export function slotDefinition(key: RafSlotKey): RafSlotDefinition {
  const found = RAF_SLOTS.find((s) => s.key === key);
  if (found === undefined) throw new Error(`unknown RAF slot: ${key}`);
  return found;
}

/**
 * Disjointness rules — new in v1.1.
 *
 * Four slot pairs previously overlapped, so an item assigned to one left the
 * other falsely empty, or was assigned to both and inflated coverage. An item
 * that satisfies both members is assigned to the FIRST slot in each pair and
 * cross-referenced rather than duplicated.
 */
export interface DisjointnessRule {
  readonly primary: RafSlotKey;
  readonly secondary: RafSlotKey;
  readonly rule: string;
}

export const DISJOINTNESS_RULES: readonly DisjointnessRule[] = [
  {
    primary: 'actors',
    secondary: 'responsibilities',
    rule:
      "'actors' records that a participant exists. 'responsibilities' records an accountability " +
      'relation between a participant and a specific step or decision. A statement naming a ' +
      "participant with no duty attached goes to 'actors' only.",
  },
  {
    primary: 'processSteps',
    secondary: 'alternativePaths',
    rule:
      "'processSteps' holds the primary path plus every step reachable on any path. " +
      "'alternativePaths' holds only the named deviation and its entry condition. Steps are " +
      'never duplicated into alternativePaths.',
  },
  {
    primary: 'exceptions',
    secondary: 'escalations',
    rule:
      "'exceptions' = something went wrong and must be handled. 'escalations' = a time limit or " +
      'threshold was reached and responsibility transfers. A timeout that transfers ' +
      'responsibility is an escalation; a failed integration call is an exception.',
  },
  {
    primary: 'outcomes',
    secondary: 'outputs',
    rule:
      "'outcomes' = business end states (approved, rejected, withdrawn). 'outputs' = information " +
      'or documents produced. A produced document is never an outcome.',
  },
];

/**
 * Resolve which slot an item belongs to when it appears to satisfy both members
 * of a disjoint pair. Returns the primary, so coverage counts the item once.
 */
export function resolveDisjointSlot(
  candidates: readonly RafSlotKey[],
): { slot: RafSlotKey; crossReference?: RafSlotKey; rule?: string } {
  for (const dr of DISJOINTNESS_RULES) {
    if (candidates.includes(dr.primary) && candidates.includes(dr.secondary)) {
      return { slot: dr.primary, crossReference: dr.secondary, rule: dr.rule };
    }
  }
  const first = candidates[0];
  if (first === undefined) throw new Error('no candidate slots supplied');
  return { slot: first };
}
