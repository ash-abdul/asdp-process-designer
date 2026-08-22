# ADR-0029: Modular Monolith with Enforced Package Boundaries

> **Status:** Approved · **Date:** 2026-08-22 · **Reversibility:** Moderate
> **Related:** ADR-0028, docs/10-architecture/module-map.md

## Context

The system has eighteen functional modules. The pipeline is a tightly coupled sequence in which a
single gate transition spans requirements, specifications, artifacts, validation, traceability, and
audit — and must be transactionally consistent.

Microservices would distribute that transaction across services, requiring sagas or eventual
consistency for an operation whose entire purpose is to be an atomic, provable act.

## Decision

The application **MUST** be a **modular monolith**: one primary deployable with hard internal
boundaries enforced by **package dependency rules checked in CI**.

Supporting containers (database, object store, worker) are separate from day one (ADR-0028), but
the domain is one codebase and one consistency boundary.

Packages are classified and constrained:

| Class | Constraint |
|---|---|
| **Pure** (`domain`, `text`, `provenance`, `raf`, `process-ir`, `compiler-*`, `layout`, `validation`, `traceability`, `diff`, `packaging`, `camunda-profiles`) | **No I/O of any kind** — no DB, network, filesystem, clock, or randomness. Deterministic and snapshot-testable |
| **Contract** (`schemas`) | Depends on nothing but the standard library |
| **Adapter** (`ingestion`, `ai`) | I/O behind explicit ports |
| **Application** (`apps/api`) | Owns transactions, guards, audit |
| **Presentation** (`apps/web`, `ui`) | No domain logic, no direct provider or database access |

Prohibited dependencies fail the build, including: `ai → domain`, pure packages → adapters, vendor
AI SDK outside `ai/adapters`, model-serialisation libraries outside `compiler-*` and `ingestion`,
and `web → domain`.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Microservices | Distributes a transaction whose atomicity is the product's core guarantee; adds operational cost for no benefit at this scale |
| Layered monolith without enforced boundaries | Boundaries erode; the AI write-authority prohibition (ADR-0004) becomes cultural rather than mechanical |
| Separate AI service | The `ai` package's isolation is already enforced by dependency rules; a network hop adds failure modes without adding isolation |
| Extract the compilers as a service | They are pure functions; a service boundary would only add latency |

## Consequences

**Positive**

- Gate transitions are single transactions, so the governance guarantee is straightforward to
  implement correctly.
- **Architectural invariants become mechanical.** ADR-0004, ADR-0005, ADR-0020, and ADR-0025 are all
  enforced by dependency rules rather than by review discipline.
- Pure packages are the majority of the correctness-critical code and are trivially testable.
- Later extraction of a module remains possible, because the boundary already exists.

**Negative**

- One deployable scales as a unit (mitigated: the worker scales independently).
- Dependency rules must be maintained and will occasionally block a convenient shortcut — which is
  the intended behaviour.
- The purity constraint on twelve packages requires discipline about clocks and randomness in
  particular.

## Enforcement

- Dependency-rule linting in CI with an explicit allow-list per package
  (docs/10-architecture/module-map.md §3).
- A deliberate violation is added as a CI self-test in Phase 0 to prove the rule fires.
- Purity is enforced by lint rules banning I/O, `Date.now`, and randomness in pure packages.
