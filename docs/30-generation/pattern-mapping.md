# Pattern Mapping — Specification to IR

> **Status:** Approved (Phase 0) · **Version:** 2.0 · **Updated:** 2026-08-22
> **Revision:** v2.0 aligns with Process IR v1.1 and Directive vocabulary v2. Adds mappings for
> event handlers, compensation, multiple triggers, scope-local outcomes, and repetition. Six
> decisions previously expressed as directives are now specification inputs to this table.
> **Related:** [process-ir.md](process-ir.md), [generation-directives.md](generation-directives.md), [ADR-0006](../adr/ADR-0006-correct-by-construction-ir.md)

The deterministic table that turns technology-neutral specification elements into IR constructs.
**AI chooses within this table; it never extends it.** A mapping the table does not contain does not
happen.

---

## 1. Step-kind mapping

| `SpecStep.kind` | Default IR construct | Conditional variants (AI may select, must justify) |
|---|---|---|
| `manual` | `HumanTask` + `formRef` | With `slaTarget` → attach an `Interruption{timeout}`. With `escalationId` → timeout interruption + escalation handler |
| `automated` | `AutomatedTask` + `interfaceRef` | If the integration is asynchronous with an awaited response → `AutomatedTask` followed by `AwaitMessage`. Connector template applied if declared |
| `decision` | `DecisionActivity` + `decisionRef` | If `decision_realisation = inline_condition` is permitted → `Branch{exclusive}` with an inline guard and no DMN call |
| `wait` | `AwaitTime` where a duration or date is specified | `AwaitMessage` if waiting for an external message; `AwaitSignal` for a broadcast; `Branch{first_event}` if the wait can end in more than one way |
| `notification` | `SendMessage` + `notificationRef` | `notification_realisation = within(previous\|next)` folds it into an adjacent task as a listener |
| `subprocess` | `Subprocess{embedded}` | `CallProcess` when the referenced ProcessSpec is independently released, or when `extract_reusable_process` applies |

### 1.1 Repetition — from the specification, not a directive

| `SpecStep.repetition` ★ | IR |
|---|---|
| `none` | Plain `Activity` |
| `per_item` | `Loop{for_each}` wrapping the activity; `collectionRef` from the declared collection field; `concurrency` from the specification |
| `until_condition` | `Loop{until}` with the declared condition |
| `while_condition` | `Loop{while}` with the declared condition |

### 1.2 Compensation — from the specification ★

| Specification | IR |
|---|---|
| `SpecStep.compensationOf = <stepId>` | The step becomes a `CompensationAction` node, paired to the compensated activity by a `Compensation` record. Trigger from the enclosing scope's failure outcome or interruption |
| Profile does not support compensation | **Rejected** with a named alternative: model the reversal as an explicit path in the failure handler |

## 2. Flow mapping

| Specification | IR |
|---|---|
| Linear `SpecFlow{sequence}` chain | `Sequence` region |
| Several `SpecFlow{conditional}` from one step | `Branch{exclusive}`; one case per flow; `defaultCase` from the unconditioned flow, or an explicit "no match" outcome |
| Several `SpecFlow{parallel}` from one step ★ | `Parallel`; one branch per flow. **This is now the only way to express concurrency** — it is a business statement, not a generation preference |
| `SpecDecisionPoint.outcomeExclusivity = multiple` ★ | `Branch{inclusive}`. **Never inferred** — the specification must declare it (IR-18) |
| `SpecDecisionPoint.resolution = first_event` ★ | `Branch{first_event}` with event-triggered cases |
| `SpecDecisionPoint.outcomes` | `Branch{exclusive}` + `decisionRef`; one case per outcome; `defaultCase` mandatory unless the DMN hit policy provably covers the input space |
| A flow returning to an earlier step | `Loop{while}` with the condition lifted from the flow. If no condition can be derived → **specification finding**, never an unstructured back-edge |

## 3. Exceptions, escalations, and scope events

| Specification | IR |
|---|---|
| `SpecException{handlingStyle: attached, interrupts: true}` ★ | `Interruption{error, interrupts: true}` on the node + handler region |
| `SpecException{handlingStyle: attached, interrupts: false}` ★ | `Interruption{error/message, interrupts: false}` — the activity continues |
| `SpecException{handlingStyle: separate_path}` ★ | A `Branch` case, **not** an interruption. Used where the condition is a business alternative rather than a failure |
| `SpecException` scoped to the whole process or a stage ★ | `EventHandler{error \| message}` on the process or the `Subprocess` region |
| `SpecException` that must end its stage but be handled by the caller ★ | `Outcome{scope: local, kind: error}` + `Interruption{error}` on the owning `Subprocess` |
| `SpecEscalation{afterDuration, interrupts: false}` | `Interruption{timeout, interrupts: false}` + escalation handler; the original work continues |
| `SpecEscalation{afterDuration, interrupts: true}` | `Interruption{timeout, interrupts: true}` + handler |
| A recurring reminder while a stage is open ★ | `EventHandler{timer, interrupts: false}` |
| Process-level failure outcome | `Outcome{kind: error}` with an explicit code from `errors[]` |

The `separate_path` case remains the most important distinction in this section: conflating "the
customer declined" with "the service call failed" produces processes that are wrong in production
and unreviewable on paper. In v2 that distinction is **declared in the specification and approved at
G2**, rather than chosen at generation time.

## 4. Triggers and outcomes ★

| Specification | IR |
|---|---|
| `ProcessSpec.triggers[]` — human submission | `Trigger{manual_submission}` + start `formRef` |
| — inbound message or event | `Trigger{message}` + a `messages[]` declaration with a correlation key |
| — schedule | `Trigger{scheduled}` |
| — broadcast condition | `Trigger{signal}` + a `signals[]` declaration |
| **Multiple declared triggers** | Multiple `triggers[]` entries. Previously impossible |
| `ProcessSpec.outcomes[]` | One `outcomes[]` entry per business end state, with `label` |
| An outcome describing failure | `Outcome{kind: error}`, code derived deterministically from the outcome key |
| An outcome that ends only a stage | `Outcome{scope: local, ownerRegionId}` |

## 5. Data mapping

| Specification | IR |
|---|---|
| `SpecStep.inputFieldIds` | `variables[].consumedBy += node`; input mapping entries |
| `SpecStep.outputFieldIds` | `variables[].producedBy += node`; output mapping entries |
| `DataField.type` | `variables[].type` |
| `DataField.name` (ASCII) | `variables[].name` — already ASCII by domain invariant D7 |
| `DataField.classification` | Propagated to `variables[].classification`; drives PII rules in L5 |
| `FormSpec` fields | Variables consumed and produced by the corresponding `HumanTask` |
| `DecisionSpec` inputs/outputs | Variables consumed by / produced by the `DecisionActivity`, with `resultVariable` |
| A collection driving repetition | `Loop{for_each}.collectionRef` |

Variable availability (IR-28) is computed from these edges. A specification that reads a field never
written on some path fails the invariant check and produces a specification finding.

## 6. Naming rules (deterministic)

| Target | Rule |
|---|---|
| Element ID | `<TypePrefix>_<ascii-slug>_<n>` — e.g. `Activity_verify_identity_1` |
| Slug source | English name if present; else glossary English term; else transliteration; else ordinal ([OD-4](../60-plan/open-decisions.md)) |
| Display name | The specification element's `LocalizedText`, unchanged |
| Job type | `ServiceInterface.jobType`, validated ASCII, `<domain>.<action>` per the standards profile |
| Decision / form key | ASCII slug of the spec object key + discriminator |
| Error, escalation, signal codes | `UPPER_SNAKE` from the specification key, declared once in `errors[]` / `escalations[]` / `signals[]` |

IDs are minted by code and are **stable across regeneration** for unchanged specification elements —
derived from element identity, never from position. Without this, every regeneration would present
every element as new and diff-based review would be worthless.
`pin_technical_identifier` overrides an ID for deployed continuity only.

## 7. Constructs the mapping deliberately never produces

| Never produced | Why |
|---|---|
| Script tasks | No engine-side scripting in generated processes; logic belongs in DMN or a worker |
| Inline business-rule logic | Decisions are externalised so they are traceable at rule-row level |
| Pools / lanes / collaboration | Not executable in Zeebe; band ordering is a presentation hint only |
| Ad-hoc subprocesses | Not deterministically validatable |
| Complex gateways | Semantics too easily misread by reviewers |
| Unstructured back-edges | Prohibited by the region tree |
| Terminate end events | Only via an explicit `Outcome{kind: terminated}` with a stated rationale |
| Link events | Restructure as nesting |

## 8. Extending the table

The mapping table is **versioned with the compiler**. Adding a mapping requires: a row here; an IR
construct with invariants; compiler support; golden fixtures **per Camunda target profile**;
validation rules for the new construct; a layout strategy; and an inspector description template so
the construct is explainable to a reviewer.

That list is deliberately demanding. Uncontrolled growth of the construct vocabulary is how a
generator becomes unmaintainable and its output unreviewable.
