# ADR-0006: Correct-by-Construction Process IR (Structured Region Tree)

> **Status:** Approved · **Date:** 2026-08-22 · **Reversibility:** Very hard
> **Related:** ADR-0005, ADR-0014, docs/30-generation/process-ir.md

## Context

Because no human can repair a generated artifact (ADR-0001), the generator must be conservative
and the output must be valid by construction rather than by inspection. Separately, the largest
product risk is unreadable layout (ADR-0014), and layout tractability depends directly on the
shape of the control-flow representation.

A conventional IR models control flow as an arbitrary directed graph of nodes and edges. That
permits dangling flows, unpaired gateways, unreachable nodes, deadlocking joins, and arbitrary
back-edges — every one of which then has to be detected after the fact.

## Decision

Control flow in the Process IR **MUST** be represented as a **nested tree of structured
regions** — `Sequence`, `Branch`, `Parallel`, `Loop`, `Activity`, `Subprocess`, `Terminate` —
and sequence flows **MUST** be derived from that tree, never authored independently.

The IR **MUST** enforce its full invariant set — **IR-1 … IR-28** as of IR v1.1
(docs/30-generation/process-ir.md §6) — before any compilation. A failing invariant produces a
**specification-level finding**, never a repaired IR and never an emitted artifact.

The **construct vocabulary is versioned separately from this decision.** IR v1.1 added event
handlers (event subprocesses), compensation, multiple triggers, and scope-local outcomes after review
found them absent. Extending the vocabulary does not weaken this ADR; representing unstructured
control flow would.

Unstructured control flow **MUST NOT** be representable.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Free node/edge graph with post-hoc validation | Every structural defect must be detected rather than prevented; layout becomes an arbitrary-graph problem; a compiler bug can emit an unreachable element |
| Graph IR with a "structured" validation profile | The permissive representation still exists, so the permissive path eventually gets used |
| BPMN-shaped IR (essentially a typed BPMN AST) | Inherits BPMN's permissiveness and couples the IR to one engine's vocabulary, defeating ADR-0025 |

## Consequences

**Positive**

- Dangling flows, unpaired gateways, unreachable nodes, deadlocking joins, missing defaults, and
  goto-style back-edges are **impossible to represent**.
- Layout becomes recursive composition of independently laid-out regions with declared entry and
  exit ports — the main mitigation for the layout risk (ADR-0014).
- Path enumeration for test coverage is tractable and complete
  (docs/40-quality/test-scenario-model.md §2).
- Local layout stability: a change in one region does not re-flow siblings, which keeps diffs
  reviewable.

**Negative**

- Genuinely unstructured processes cannot be represented. Accepted deliberately: such processes
  are also unreviewable, and the correct response is to restructure the specification.
- Some real-world "as-is" processes discovered during intake will not be expressible as-is; they
  are represented as evidence, not as a generated design.
- The compiler must sometimes emit a specification finding instead of an artifact, which is a
  worse user experience than silently producing something wrong — and is the right trade.

## Enforcement

- The IR type definition has no representation for a free-standing edge.
- Invariant checks run in `packages/process-ir` as pure functions, unit-tested with synthetic
  invalid IR to prove they would catch a compiler defect.
- Adding a construct requires the full extension process (docs/30-generation/pattern-mapping.md §8);
  the vocabulary may grow, the structural guarantee may not shrink.
- `L2-IR-001` makes any invariant violation a blocking validation error.
