# ADR-0013: Generation Directives as the Only Shape Influence

> **Status:** Approved · **Date:** 2026-08-22 · **Reversibility:** Moderate
> **Revision:** v2.0 supersedes the original vocabulary. Review found that 6 of 16 directive kinds
> carried **business semantics** and one was misfiled; they have been moved into the specification
> layer or removed. Two were consolidated, two renamed to remove BPMN vocabulary, one added.
> **16 kinds → 7.**
> **Related:** ADR-0001, ADR-0002, ADR-0003, ADR-0009, docs/30-generation/generation-directives.md

## Context

Architects legitimately want to influence the *organisation* of generated artifacts without changing
business meaning: group steps into a stage, extract a reusable process, record a determination as a
rule table rather than a condition, set the reading order of a diagram.

Without a mechanism for this, pressure to open an artifact editor becomes irresistible and ADR-0003
fails within a release.

The original vocabulary over-reached. `parallelize`, `sequentialize`, `merge_steps`, `split_step`,
`prefer_boundary_event`, and `prefer_separate_path` all changed what the process *means* — whether
steps may run concurrently, what constitutes a step, whether a condition is a failure or a business
alternative. Expressing those as generation directives let business meaning change **after** G2
approval, outside the approved specification. That is a governance hole, not just a taxonomy
error. And `use_gateway_style` named a BPMN construct directly, which is the definition of the
hidden-editor failure mode.

## Decision

**A directive expresses how the process is organised and presented. It never expresses what the
process means, and it never names a BPMN construct.**

1. **No directive carries business semantics.** Anything that changes meaning is a specification
   edit, approved at G2. Six kinds were moved accordingly:
   - concurrency → `SpecFlow.kind`
   - step composition → editing the BPS
   - exception handling style and interruption → `SpecException.handlingStyle` / `interrupts`
   - outcome exclusivity and first-event resolution → `SpecDecisionPoint.outcomeExclusivity` /
     `resolution` (this replaces `use_gateway_style`, and removes the word "gateway" from all
     user-facing vocabulary)
2. **The vocabulary is 7 kinds**, classified as 5 *process-design semantic* and 2 *implementation
   preference*, with **zero** business-semantic entries.
3. Every directive remains **declarative, scoped to specification elements, rationale-bearing,
   validated, traceable, and reported** in the release directive log.
4. A directive that would produce invalid or unlayoutable output is **rejected with an explanation**
   — never silently ignored.
5. `pin_technical_identifier` is **permitted only on a project with a prior handoff**, since its
   sole legitimate purpose is continuity with something already deployed.
6. Adding a kind requires answering, in writing: *does it change what the process means?* (if yes,
   it belongs in the specification) and *does it name a BPMN construct?* (if yes, it does not belong
   in the product).
7. **Seven kinds is the target size, not a starting point.**

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Keep the original 16 kinds | Six let business meaning change after G2 approval, outside the approved specification |
| No shape influence at all | Architects have real needs; the boundary would be reversed under pressure |
| Free-form natural-language generation hints | Unvalidatable, unreproducible, and a prompt-injection surface into the generator |
| Coordinate-level layout overrides | Geometry editing by another name; breaks layout stability and regeneration |
| Unbounded vocabulary | Becomes an editor incrementally, with no single decision to point at |

## Consequences

**Positive**

- **Business meaning can now only change through an approved specification.** Six semantic levers
  moved from generation time to G2 review — strictly better governance than the original design.
- The concrete hidden-editor test — *does any BPMN construct name appear in the vocabulary?* — now
  passes.
- A smaller vocabulary is less to implement, document, validate, and explain.
- Architects retain real control over organisation, reuse, decision realisation, and reading order.

**Negative**

- The specification schema grew slightly (`SpecException.handlingStyle`, `interrupts`,
  `SpecDecisionPoint.outcomeExclusivity`, `resolution`, `SpecStep.repetition`,
  `SpecStep.compensationOf`), and those fields need editor support in P3.
- Users who wanted to "just group these two steps" now edit the specification instead, which is one
  step further from the diagram.
- `pin_technical_identifier` remains the closest the product comes to touching an artifact detail. It
  is retained because deployed-ID continuity is a real need, and it is narrowed to projects that
  actually have a prior handoff.

## Enforcement

- `kind` is a closed enum in `packages/schemas`; 7 values.
- Rejection conditions implemented in `packages/process-ir`, unit-tested per kind.
- A vocabulary review check: no directive name or parameter may contain a BPMN construct name.
- `pin_technical_identifier` creation requires an existing `Handoff` for the project.
- `L5-DIR-001` reports rejected directives; `L5-DIR-002` discloses directive-influenced elements.
- The directive log is a required release artifact.
