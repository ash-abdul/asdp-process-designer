# Product Boundary — The Editing Line

> **Status:** Approved (Phase 0) · **Version:** 1.0 · **Updated:** 2026-08-22
> **Related:** [ADR-0001](../adr/ADR-0001-requirements-driven-product-boundary.md), [ADR-0002](../adr/ADR-0002-spec-layer-editing.md), [ADR-0003](../adr/ADR-0003-no-override-editor.md), [ADR-0013](../adr/ADR-0013-generation-directives.md)

This document defines exactly what a user can change. It is the most frequently challenged
part of the design, so the reasoning is recorded alongside the rule.

---

## 1. The rule

> **Users edit specifications. The system generates artifacts. Nothing else can write an
> artifact, and no user interface exists for editing one.**

## 2. Editable surfaces

| Surface | Capability | Notes |
|---|---|---|
| Sources | Upload, view, annotate, rank authority, supersede | Bytes are immutable once stored |
| Requirements | Create, edit, answer questions, resolve conflicts, approve | Primary work surface |
| Domain Model Registry | Glossary, actors, data entities/fields, business rules, events, notifications | Shared vocabulary |
| **Business Process Specification** | Full structured editing: steps, flows, decision points, exceptions, escalations, SLAs, integrations, KPIs | **The editable process surface.** Technology-neutral; contains no BPMN vocabulary |
| **DecisionSpec** | Inputs, outputs, hit policy, rule rows, rule values, annotations | The editable decision surface |
| **FormSpec** | Field selection, order, labels, help text, grouping, validation | The editable form surface |
| **ServiceInterface** | Job type, I/O mappings, error codes, retries, backoff, timeout, idempotency, auth mode | The editable interface surface |
| **Generation Directives** | Add/remove directives from a closed vocabulary | The only influence on artifact *shape* |
| Test scenarios | Author, edit, parameterise | |
| Governance | Approve, reject, comment, waive, release, hand off | Role-gated |

## 3. Read-only surfaces

Generated artifacts — BPMN, DMN, Camunda Forms, contract files, generated documentation —
are **view-only**. Users may navigate, select, inspect, trace, compare versions, and read
validation findings.

Specifically **not** provided:

- adding, removing, renaming, or duplicating BPMN elements
- adding gateways or events
- drawing or rerouting sequence flows
- configuring BPMN element properties (including `zeebe:` extension properties)
- repositioning or resizing elements as a design activity
- editing DMN decision-table cells, rows, columns, or hit policy directly on the artifact
- dragging, adding, or removing form components on the artifact
- any "unlock and edit" affordance, for any role

There is no endpoint to call. The absence is enforced at the command layer, not the UI
([ADR-0002](../adr/ADR-0002-spec-layer-editing.md)).

## 4. Why: the spec-layer counterpart rule

Every visual change a user could want has **exactly one spec-layer cause**:

| The user wants to… | They actually change… | Which regenerates… |
|---|---|---|
| Remove a task | the BPS step | BPMN |
| Add an approval step | a requirement, then the BPS step | BPMN + form |
| Change who does a task | the BPS step's actor | BPMN + form assignment |
| Change a branching condition | the BPS flow condition or DecisionSpec | BPMN + DMN |
| Change a rule value | the DecisionSpec rule row | DMN |
| Reorder form fields | the FormSpec | form |
| Change a retry count | the ServiceInterface | BPMN `zeebe:taskDefinition` |
| Run two steps concurrently | `SpecFlow.kind = parallel` (a business statement) | BPMN |
| Group steps into a stage | a `group_into_subprocess` directive | BPMN |
| Reorder the visual band order | a `presentation_hint` directive | BPMN diagram interchange |

If a user wants a change that has **no** spec-layer cause, that is a gap in the specification
schema — a product defect to be fixed by extending the schema, never a reason to open an
editor.

## 5. Why there is no override editor

An audited, admin-only "emergency edit" was considered and rejected
([ADR-0003](../adr/ADR-0003-no-override-editor.md)):

1. It becomes the path of least resistance within weeks.
2. A hand-edited artifact has no spec-layer cause, so its elements become permanent
   traceability orphans — which breaks the S1 success criterion and the orphan-count
   self-check on our own compiler.
3. Regeneration then requires merge semantics for human diagram edits, reintroducing the
   entire round-trip problem the boundary was drawn to eliminate.
4. It quietly converts ASDP into a worse Camunda Modeler.

**The sanctioned escape hatch is the lifecycle, not a backdoor:** hand off earlier and
complete refinement in Camunda, where that work belongs and is recorded as divergence
([handoff-and-divergence.md](../50-governance/handoff-and-divergence.md)).

## 6. Consequences accepted

| Consequence | Mitigation |
|---|---|
| Bad layout cannot be fixed by hand | Layout is treated as safety-critical: dedicated engine, quality validation, golden-corpus CI ([ADR-0014](../adr/ADR-0014-layout-safety-critical.md)) |
| Bad generation cannot be worked around locally | The IR is correct-by-construction; generation is conservative; directives cover legitimate shape variation |
| Users must learn to think in specifications | The trace-to-change loop makes the causal path explicit from any element ([personas-and-journey.md](personas-and-journey.md)) |
| Some technical refinement is impossible in ASDP | By design. It belongs in Camunda after handoff |

## 7. Boundary test cases

Use these to adjudicate future feature requests.

| Request | Verdict |
|---|---|
| "Let me nudge this task 40px left, the label overlaps" | **Reject.** A label collision is a blocking validation finding; fix layout quality or add a `presentation_hint` directive |
| "Let me change this rule threshold from 5000 to 7000" | **Allow** — in the DecisionSpec rule row, not the DMN cell |
| "Let me delete this gateway, it is redundant" | **Reject.** Change the BPS flow structure; the gateway is derived |
| "Let me set retries to 5 on this service task" | **Allow** — in the ServiceInterface |
| "Let me rename this task to match our terminology" | **Allow** — in the BPS step name and/or glossary |
| "Let me wrap these four steps in a subprocess" | **Allow** — via a `group_into_subprocess` directive |
| "Let me add a `zeebe:header` for the worker" | **Allow** — in the ServiceInterface, which compiles to headers |
| "Let me export, edit in Modeler, and re-import as the ASDP truth" | **Reject as ASDP truth.** Re-import is allowed only as a `CamundaObservation` for divergence analysis |
