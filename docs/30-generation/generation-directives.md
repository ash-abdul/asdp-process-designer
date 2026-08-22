# Generation Directives — Vocabulary v2

> **Status:** Approved (Phase 0) · **Version:** 2.0 (vocabulary `gd-2`) · **Updated:** 2026-08-22
> **Revision:** v2.0 supersedes v1.0. **16 kinds → 7.** Six carried business semantics and were
> moved into the specification layer; one was misfiled; two were consolidated; two were renamed to
> remove BPMN vocabulary; one was added.
> **Related:** [ADR-0013](../adr/ADR-0013-generation-directives.md), [product-boundary.md](../00-product/product-boundary.md), [layout-architecture.md](layout-architecture.md)

Directives are the **only** mechanism by which a human influences the shape of a generated artifact
without editing it. They exist so that legitimate shape preferences do not become pressure to open
an editor.

---

## 1. The v2 principle

> **A directive expresses how the process should be *organised and presented*. It never expresses
> what the process *means*, and it never names a BPMN element.**

Anything that changes business meaning belongs in the specification, where it is approved at G2.
Anything that names a gateway, a boundary event, or a flow is BPMN mechanics and does not belong in
a directive at all.

**Consequence: after v2, no directive carries business semantics.** That is the headline change.

## 2. What moved, and where

| v1 directive | Verdict | Now expressed as |
|---|---|---|
| `parallelize` | **Moved — business semantic** | `SpecFlow.kind = parallel`. Whether steps *may* run concurrently is a business constraint, not a drawing preference |
| `sequentialize` | **Moved — business semantic** | `SpecFlow.kind = sequence` with explicit order |
| `merge_steps` | **Moved — specification concern** | Edit the BPS: what constitutes a step is what the business owner approved |
| `split_step` | **Moved — specification concern** | Edit the BPS |
| `prefer_boundary_event` | **Moved — business semantic** | `SpecException.handlingStyle = attached` + `interrupts`. The distinction between "the service failed" and "the customer declined" is business meaning |
| `prefer_separate_path` | **Moved — business semantic** | `SpecException.handlingStyle = separate_path` |
| `use_gateway_style` | **Removed — BPMN mechanics** | Redesigned: the real question is *"can more than one outcome apply at once?"* → `SpecDecisionPoint.outcomeExclusivity = exclusive \| multiple`; and *"whichever event happens first decides"* → `SpecDecisionPoint.resolution = first_event`. The word "gateway" no longer appears in any user-facing vocabulary |
| `emphasise` | **Removed — misfiled** | A review annotation, not a generation input. Moved to comment threads / review flags |
| `override_element_name` | **Removed** | If the generated name should differ from the specification name, the specification name is wrong. Adding a *translation* is a `LocalizedText` edit, not a directive |
| `externalise_decision` + `inline_decision` | **Consolidated** | One directive, `decision_realisation`, with a parameter |
| `collapse_notification_into_task` | **Renamed** | `notification_realisation`, with a parameter |
| `layout_hint` | **Renamed** | `presentation_hint` — it influences reading order and arrangement, never coordinates |
| `override_technical_id` | **Renamed and narrowed** | `pin_technical_identifier`, permitted only for continuity with an already-handed-off process |
| — | **Added** | `keep_separate` — the inverse of grouping, needed because automatic subprocess extraction is triggered by layout thresholds and a reviewer must be able to prevent it |
| `group_into_subprocess`, `extract_call_activity` | **Kept** (second renamed to `extract_reusable_process`) | Genuine process-design decisions |

## 3. Record

```
GenerationDirective {
  id, projectId
  scope { processSpecId | specStepIds[] | specDecisionPointId }
  kind                                  // one of the 7 below
  parameters                            // kind-specific, schema-validated
  rationale                             // REQUIRED — a recorded human design decision
  status  active | superseded | rejected_by_validation
  rejectionReason?
  createdBy, createdAt
}
```

## 4. Vocabulary v2 — 7 kinds

### Process-design semantic (5)

*Decisions about how the process is organised for comprehension and reuse. They do not change what
the process does.*

| # | Kind | Plain meaning | Parameters | Rejected when |
|---|---|---|---|---|
| 1 | **`group_into_subprocess`** | Treat these steps as one named stage, so a reader can collapse them and so failures can be handled for the group | `name: LocalizedText` | Steps are not contiguous in the region tree; grouping would break a branch/merge pair; nesting would exceed the profile limit (IR-24) |
| 2 | **`keep_separate`** ★new | Do **not** group these steps, even if automatic extraction would | `specStepIds[]` | — (advisory; recorded if it causes a layout finding to persist) |
| 3 | **`extract_reusable_process`** | This stage exists in its own right and is used elsewhere — release it as a separate process | `targetProcessKey` | The extracted set reads or writes variables in a way that cannot be expressed as an input/output mapping |
| 4 | **`decision_realisation`** | Record this determination as a **rule table** (auditable, reusable) or as a **simple condition** (lighter, inline) | `mode: rule_table \| inline_condition` | `inline_condition` requested where the DecisionSpec has more than one rule row, a non-`UNIQUE` hit policy, or is referenced by another process; or where the standards profile requires every decision to be externally auditable |
| 5 | **`notification_realisation`** | Send this notification as **its own step** or as **part of an adjacent step** | `mode: own_step \| within(previous\|next)` | `within` requested where the notification has its own SLA, its own actor, or is referenced by a test scenario as a distinct step |

### Implementation preference (2)

*Preferences about presentation and technical continuity. No effect on process meaning.*

| # | Kind | Plain meaning | Parameters | Notes |
|---|---|---|---|---|
| 6 | **`presentation_hint`** | How the diagram should read | `bandOrder: actorRef[]` · `orientation: horizontal \| vertical` · `keepVisuallyAdjacent: specStepIds[]` · `readingDirection: ltr \| rtl` | **Advisory input to the layout tool.** Never coordinates, never sizes. A hint the layout tool cannot honour is reported, not forced |
| 7 | **`pin_technical_identifier`** | Keep this element's technical identifier stable, because something already deployed depends on it | `specStepId`, `id` (ASCII, validated) | **Permitted only when the project has a prior handoff.** Rejected on a first-cycle project. Validated for ASCII/NCName safety and uniqueness. Appears in the release directive log as an explicit continuity decision |

### Business semantic (0)

**Deliberately empty.** Anything that changes business meaning is a specification edit, approved at
G2, not a generation directive.

## 5. Hidden-BPMN-editor risk assessment

| Directive | Risk | Control |
|---|---|---|
| `pin_technical_identifier` | **Highest remaining** | Restricted to projects with a prior handoff; single-value; validated; logged in the release. It exists for one real need — an already-deployed process, a worker, or an operational query depending on an ID |
| `presentation_hint.keepVisuallyAdjacent` | Moderate | Advisory only; the layout tool may decline; no coordinates expressible |
| `decision_realisation: inline_condition` | Low | Constrained by DecisionSpec shape and forbiddable by standards profile |
| Everything else | Low | Named in business or process-organisation language; no BPMN element is nameable through the vocabulary |

**The word "gateway" no longer appears anywhere in the directive vocabulary.** Nor do "boundary
event", "sequence flow", "sub-process element", or any `zeebe:` attribute. That is the concrete test
of whether this is an editor in disguise, and v2 passes it.

## 6. Validation

Directives are validated at three points, and are **never silently ignored** — silent ignoring is
how users lose trust in a declarative mechanism and start demanding an editor.

1. **On creation** — schema, scope resolvability, parameter sanity, and the
   `pin_technical_identifier` prior-handoff precondition.
2. **During IR construction** — the "rejected when" conditions in §4. A rejected directive receives
   `status = rejected_by_validation` with a reason; the IR is built without it; the user is told
   why.
3. **In L5 governance validation** — a standards profile may forbid specific kinds (for example
   disallowing `decision_realisation: inline_condition`).

## 7. Interaction with regeneration

- Directives are **inputs** to generation and live in the specification baseline, approved at G2.
- Regeneration re-applies all `active` directives.
- If a specification change invalidates a directive's scope, it becomes `superseded` with a notice —
  never a silent no-op.
- Directive-influenced elements are marked in the **directive overlay**, so a reviewer can
  distinguish "this is a stage because the requirements imply it" from "this is a stage because an
  architect decided so, for this stated reason".

## 8. Reporting

Every release package includes a **directive log**: kind, scope, parameters, rationale, author,
affected elements. It is the record of human design decisions taken above the requirements layer,
and it belongs in the handoff alongside the traceability matrix — a Camunda engineer reading the
delivered process deserves to know which structure came from policy and which from an architect's
judgement.

## 9. Extending the vocabulary

Adding a kind requires: an entry here with rejection conditions; a schema; IR-construction support;
validation rules; a layout strategy if it affects arrangement; an inspector description template;
and golden fixtures.

Before adding one, two questions must be answered in writing:

1. **Does it change what the process means?** If yes, it belongs in the specification.
2. **Does it name a BPMN construct?** If yes, it does not belong in the product.

**The vocabulary must stay small.** Seven kinds is the target size, not a starting point. A large
directive vocabulary is an editor with extra steps.
