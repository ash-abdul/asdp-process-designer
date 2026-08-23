/**
 * The six `POPULATE_FRAME` passes — **J7**.
 *
 * ## Why six, and why these six
 *
 * The obvious partition is the RAF's own nine groups. It is wrong, and the reason
 * is a fact about the frame rather than a matter of taste: `DISJOINTNESS_RULES`
 * pairs **`outcomes` with `outputs`**, and those two live in *different* RAF groups
 * (`process_behaviour` and `data`). A group-shaped partition would ask one call for
 * `outcomes` and a different call for `outputs`, and a model that cannot see both
 * slots at once will legitimately offer the same item to each. The disjointness
 * rule then rejects work that need never have been proposed.
 *
 * So the partition is **disjointness-closed**: every pair sits inside one call.
 *
 * ## What a pass is not
 *
 * A pass is **prompting configuration**. `RafGroup` is untouched — the coverage
 * dashboard still reports by group — and no table stores a pass as structure. The
 * only place it is persisted is `requirement.frame_pass`, as provenance, and
 * nothing reads it to decide anything. That is what makes regrouping later a
 * configuration change rather than a migration.
 *
 * ## Why not one pass, and why not twenty-seven
 *
 * One prompt carrying 27 slot definitions invites a model to put everything in
 * `processSteps`. Twenty-seven passes spend a whole call to decide nothing and
 * split slots that must be told apart. Six is where per-pass measurement, retry
 * isolation and disjointness closure all hold at once.
 */

import { DISJOINTNESS_RULES, RAF_SLOT_KEYS, slotDefinition, type RafSlotKey } from '@asdp/raf';

export interface FramePass {
  /** Stable id. Recorded on the proposal and on every interaction. */
  readonly id: string;
  readonly title: string;
  readonly slots: readonly RafSlotKey[];
}

/** Bump on any change to the partition, so a recording keyed on it misses rather than replaying wrongly. */
export const FRAME_PASS_VERSION = 'frame-passes-1';

export const FRAME_PASSES: readonly FramePass[] = [
  {
    id: 'P1',
    title: 'Context & framing',
    slots: [
      'businessObjective',
      'serviceDescription',
      'scopeAndExclusions',
      'successMeasures',
      'currentStateProcess',
      'dependencies',
      'assumptions',
      'constraints',
    ],
  },
  {
    id: 'P2',
    title: 'Participants & behaviour',
    // Closes actors <-> responsibilities and processSteps <-> alternativePaths.
    slots: ['actors', 'responsibilities', 'trigger', 'preconditions', 'processSteps', 'alternativePaths'],
  },
  {
    id: 'P3',
    title: 'Outcomes & data',
    // Closes outcomes <-> outputs — the pair that crosses two RAF groups, and the
    // whole reason this partition is not group-shaped.
    slots: ['outcomes', 'inputs', 'outputs', 'dataRequirements'],
  },
  { id: 'P4', title: 'Rules & decisions', slots: ['businessRules', 'decisions'] },
  {
    id: 'P5',
    title: 'Time, failure & external',
    // Closes exceptions <-> escalations.
    slots: ['slasAndTimers', 'exceptions', 'escalations', 'integrations', 'notifications'],
  },
  { id: 'P6', title: 'Quality & control', slots: ['nonFunctionalRequirements', 'securityAndPrivacy'] },
];

/** The pass a slot belongs to, or undefined if the partition has a hole. */
export function passForSlot(slot: string): FramePass | undefined {
  return FRAME_PASSES.find((p) => (p.slots as readonly string[]).includes(slot));
}

export interface PartitionProblem {
  readonly kind: 'missing_slot' | 'duplicate_slot' | 'split_disjointness_pair' | 'unknown_slot';
  readonly detail: string;
}

/**
 * Check the partition against the frame itself.
 *
 * Exported rather than kept private because it is asserted by test: a partition
 * that silently drifted from the frame would drop a slot from every population
 * pass, and an empty slot reads as "the documents do not say" — the single most
 * misleading thing this system can report.
 */
export function partitionProblems(): readonly PartitionProblem[] {
  const problems: PartitionProblem[] = [];
  const seen = new Map<string, number>();

  for (const pass of FRAME_PASSES) {
    for (const slot of pass.slots) {
      seen.set(slot, (seen.get(slot) ?? 0) + 1);
      if (!(RAF_SLOT_KEYS as readonly string[]).includes(slot)) {
        problems.push({ kind: 'unknown_slot', detail: `${pass.id} names '${slot}', which is not a RAF slot` });
      }
    }
  }

  for (const key of RAF_SLOT_KEYS) {
    const count = seen.get(key) ?? 0;
    if (count === 0) {
      problems.push({ kind: 'missing_slot', detail: `no pass covers '${key}'` });
    } else if (count > 1) {
      problems.push({ kind: 'duplicate_slot', detail: `'${key}' appears in ${count} passes` });
    }
  }

  for (const dr of DISJOINTNESS_RULES) {
    const a = passForSlot(dr.primary);
    const b = passForSlot(dr.secondary);
    if (a === undefined || b === undefined || a.id !== b.id) {
      problems.push({
        kind: 'split_disjointness_pair',
        detail:
          `'${dr.primary}' and '${dr.secondary}' are a disjointness pair but sit in ` +
          `${a?.id ?? 'nothing'} and ${b?.id ?? 'nothing'}; a model cannot apply a rule it cannot see`,
      });
    }
  }

  return problems;
}

/**
 * The slot catalogue text handed to the model for one pass.
 *
 * The `question` on each slot is the RAF's own — the one the coverage dashboard
 * asks — so the model is answering the question the frame poses rather than a
 * paraphrase of it invented here.
 */
export function slotBriefFor(pass: FramePass): string {
  const lines = pass.slots.map((key) => {
    const def = slotDefinition(key);
    return `- ${key}${def.requiredForExecutability ? ' (required)' : ''}: ${def.question}`;
  });

  const pairs = DISJOINTNESS_RULES.filter(
    (dr) =>
      (pass.slots as readonly string[]).includes(dr.primary) &&
      (pass.slots as readonly string[]).includes(dr.secondary),
  ).map((dr) => `- ${dr.primary} vs ${dr.secondary}: ${dr.rule}`);

  return pairs.length === 0
    ? lines.join('\n')
    : `${lines.join('\n')}\n\nTelling adjacent slots apart:\n${pairs.join('\n')}`;
}
