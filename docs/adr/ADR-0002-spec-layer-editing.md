# ADR-0002: Spec-Layer Editing, Artifact-Layer Read-Only

> **Status:** Approved · **Date:** 2026-08-22 · **Reversibility:** Very hard
> **Related:** ADR-0001, ADR-0003, ADR-0013, docs/00-product/product-boundary.md

## Context

ADR-0001 forbids editing generated artifacts. On its own that is merely restrictive: users have
real, legitimate needs to change what a process does, what a rule value is, and how a form is
laid out. Without a place to express those changes, the boundary would be unworkable and would be
reversed within a release.

The question is therefore not *whether* users can change things, but *where*.

## Decision

Every generated artifact family **MUST** have exactly one **editable specification counterpart**,
and every visual change a user could want **MUST** have exactly one spec-layer cause.

| Editable specification | Generated artifact |
|---|---|
| `ProcessSpec` + `SpecStep`/`SpecFlow`/`SpecDecisionPoint`/`SpecException`/`SpecEscalation`/`SpecIntegration` | BPMN |
| `DecisionSpec` (inputs, outputs, hit policy, **rule rows and values**) | DMN |
| `FormSpec` (fields, order, labels, grouping, validation) | Camunda Form |
| `ServiceInterface` (job type, mappings, errors, retries, idempotency) | BPMN `zeebe:` properties + contract file |
| `GenerationDirective` | Artifact structure and arrangement |

If a desired change has **no** spec-layer cause, that is a gap in the specification schema — a
product defect to be fixed by extending the schema. It is **never** grounds for opening an editor.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Read-only artifacts with no spec counterpart | Users could not change rule values or field order at all; the boundary would be reversed under pressure |
| Editable artifacts with change back-propagation | Requires inferring intent from a diagram edit; unreliable, and destroys the single-cause property |
| A single monolithic "design" object instead of four specs | Loses the ability to version, approve, and regenerate artifact families independently |

## Consequences

**Positive**

- The inspector can always name the exact cause of any element, which is what makes the
  trace-to-change loop work (docs/00-product/personas-and-journey.md §2).
- Rule-row and field-level traceability follow naturally, because the spec objects carry that
  granularity.
- Business users change rule values in business terms, not in DMN cells — which is what Phase 0
  decision 7 requires.
- Independent versioning and approval per artifact family.

**Negative**

- The Specification Studio, not the diagram, becomes the largest UI investment.
- Four editors must be built and kept coherent with each other.
- Some technical refinement remains impossible in ASDP by design; it belongs in Camunda after
  handoff (ADR-0018).

## Enforcement

- Command-layer absence: no endpoint, handler, or repository method mutates an artifact.
- Dependency rule: only `compiler-*` and `ingestion` may import the model-serialisation
  libraries.
- Every generated element carries a `compiled_to` trace edge to a specification element;
  validation rule `L4-TRACE-001` makes a missing edge an error, and `L4-TRACE-003` makes an
  orphan element an error.
