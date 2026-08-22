/**
 * Task capability requirements.
 *
 * ai-provider-abstraction.md §5. Each task declares REQUIRED and PREFERRED
 * capabilities. The broker refuses a task whose REQUIRED capabilities no
 * eligible provider satisfies — it never substitutes a weaker approach silently.
 *
 * The single most consequential entry: EXTRACT_EVIDENCE on images has `vision`
 * as REQUIRED, because vision is the one capability with NO degradation path
 * (ADR-0022). If no vision-capable provider is eligible, screenshots, diagram
 * images and scanned documents cannot be analysed at all — a scope consequence,
 * stated rather than fudged.
 */

import type { AiTaskType, Capability } from '@asdp/schemas';

export interface TaskSpec {
  readonly taskType: AiTaskType;
  readonly required: readonly Capability[];
  readonly preferred: readonly Capability[];
  /** Whether the task reads images rather than text. */
  readonly visual?: boolean;
  /** Tasks whose output is commentary only, never authoritative. */
  readonly commentaryOnly?: boolean;
}

export const TASK_SPECS: readonly TaskSpec[] = [
  { taskType: 'PROFILE_SOURCE', required: ['schemaConstrainedOutput'], preferred: [] },
  {
    taskType: 'EXTRACT_EVIDENCE',
    required: ['schemaConstrainedOutput'],
    preferred: ['nativeCitations', 'largeContext', 'promptCaching', 'documentInput'],
  },
  { taskType: 'CANONICALISE_ENTITIES', required: ['schemaConstrainedOutput'], preferred: [] },
  {
    taskType: 'POPULATE_FRAME',
    required: ['schemaConstrainedOutput'],
    preferred: ['largeContext', 'promptCaching'],
  },
  {
    taskType: 'RECONCILE_SOURCES',
    required: ['schemaConstrainedOutput'],
    preferred: ['largeContext', 'deepReasoning'],
  },
  {
    taskType: 'ANALYSE_QUALITY',
    required: ['schemaConstrainedOutput'],
    preferred: ['deepReasoning'],
  },
  { taskType: 'SYNTHESISE_QUESTIONS', required: ['schemaConstrainedOutput'], preferred: [] },
  {
    taskType: 'DECOMPOSE_PROCESS',
    required: ['schemaConstrainedOutput'],
    preferred: ['deepReasoning', 'largeContext'],
  },
  {
    taskType: 'PROPOSE_DECISION_SPEC',
    required: ['schemaConstrainedOutput'],
    preferred: ['deepReasoning'],
  },
  { taskType: 'PROPOSE_FORM_SPEC', required: ['schemaConstrainedOutput'], preferred: [] },
  { taskType: 'PROPOSE_INTERFACE_SPEC', required: ['schemaConstrainedOutput'], preferred: [] },
  { taskType: 'REFINE_IR', required: ['schemaConstrainedOutput'], preferred: ['deepReasoning'] },
  { taskType: 'PROPOSE_TEST_DATA', required: ['schemaConstrainedOutput'], preferred: [] },
  { taskType: 'TRANSLATE_TEXT', required: [], preferred: [] },
  { taskType: 'EXPLAIN_ELEMENT', required: [], preferred: [], commentaryOnly: true },
  { taskType: 'NARRATE_IMPACT', required: [], preferred: [], commentaryOnly: true },
  { taskType: 'NARRATE_DIVERGENCE', required: [], preferred: [], commentaryOnly: true },
  { taskType: 'DRAFT_DOCUMENTATION', required: [], preferred: [], commentaryOnly: true },
];

export function taskSpec(taskType: AiTaskType): TaskSpec {
  const found = TASK_SPECS.find((t) => t.taskType === taskType);
  if (found === undefined) throw new Error(`no task spec for ${taskType}`);
  return found;
}

/**
 * Required capabilities for a concrete invocation.
 *
 * Vision becomes REQUIRED when the content includes images — that is the
 * distinction between reading a BRD and reading a screenshot.
 */
export function requiredCapabilitiesFor(
  taskType: AiTaskType,
  hasVisualContent: boolean,
): readonly Capability[] {
  const spec = taskSpec(taskType);
  return hasVisualContent ? [...spec.required, 'vision'] : spec.required;
}
