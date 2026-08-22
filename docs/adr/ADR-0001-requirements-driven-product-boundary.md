# ADR-0001: Requirements-Driven Product Boundary

> **Status:** Approved · **Date:** 2026-08-22 · **Reversibility:** Very hard
> **Related:** ADR-0002, ADR-0003, ADR-0015, docs/00-product/product-boundary.md

## Context

The product could be positioned either as an AI-assisted BPMN authoring tool with requirements
features, or as a requirements-driven generator with a review surface. These lead to
fundamentally different architectures, and the choice cannot be deferred: it determines whether
generated artifacts need merge semantics, whether traceability can be guaranteed, and whether the
IR can be restricted.

Camunda already provides excellent modelling tools. Competing with them is both unwinnable and
beside the point. What Camunda does not provide is a governed path from unstructured business
input to a validated, traceable, executable process application.

## Decision

The ASDP Process Designer **MUST** be requirements-driven.

The primary user interaction is with requirement inputs, AI analysis, structured requirements,
questions and ambiguities, approvals, and generated process outputs.

Users **MUST NOT** structurally edit generated BPMN, DMN, or Camunda Forms — no adding or
removing tasks, no adding gateways, no connecting sequence flows, no configuring BPMN element
properties, and no repositioning elements as a design activity.

To change a generated process, the workflow **MUST** be: requirement change → AI re-analysis →
updated structured requirements → impact analysis → regeneration of affected artifacts.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Full authoring tool with requirements features | Unwinnable against Camunda Modeler; forces merge semantics for human edits; makes element-level traceability unenforceable; invalidates a restricted IR |
| Hybrid: generate then freely edit | The worst of both. Every artifact becomes partially traced; regeneration becomes a merge problem; the governance claim becomes unprovable |
| Generate once, never regenerate | Removes the product's core value on the second cycle, which is where requirement change lives |

## Consequences

**Positive**

- Element-level traceability becomes enforceable rather than aspirational — an orphan element can
  only be a compiler defect (ADR-0008, docs/20-domain/traceability-model.md).
- No merge semantics for human artifact edits are needed anywhere.
- The IR can be restricted so invalid output is unrepresentable (ADR-0006).
- Regeneration is a pure function of approved input.

**Negative**

- Bad layout cannot be repaired by hand, making layout safety-critical (ADR-0014).
- Users must learn to think in specifications; this is counter to a process architect's habits and
  requires deliberate onboarding.
- Legitimate shape preferences need a bounded mechanism (ADR-0013) or they become pressure to
  reverse this decision.

**Forecloses:** any future in which ASDP is also a modelling tool.

## Enforcement

- No artifact-mutating command exists in the codebase; an architecture test enumerates command
  handlers and asserts none targets an `ArtifactVersion`.
- Modelling modules of the rendering toolkits are not loaded (ADR-0015).
- `ArtifactVersion.generatedBy` has no `human` value (docs/20-domain/artifact-model.md §1.1).
- Feature requests are adjudicated against the boundary test cases in
  docs/00-product/product-boundary.md §7.
