# ADR-0030: TypeScript End-to-End

> **Status:** Approved · **Date:** 2026-08-22 · **Reversibility:** Very hard
> **Related:** ADR-0015, ADR-0029, docs/10-architecture/technology-stack.md

## Context

The application must embed Camunda's `bpmn-io` rendering toolkits, which are browser JavaScript
libraries with no equivalent in other ecosystems. It must also share a single schema definition
across three consumers: the frontend, the backend, and AI output contracts.

The alternative shape — a Java or .NET backend with a JavaScript frontend — is common and would be
defensible if the backend needed engine-embedded Camunda integration. It does not: MVP integration
is file-based (ADR-0026).

## Decision

The application **MUST** be TypeScript end to end: SPA, API, worker, and all shared packages.

A single schema package (`packages/schemas`) **MUST** be the source of truth for entity shapes,
API contracts, and **AI output contracts**, generating TypeScript types, OpenAPI definitions, and
JSON Schema from one definition.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Java/Spring backend + TS frontend | Splits the language for no gain; duplicates every schema; the `bpmn-io` toolkits remain JS-only regardless |
| .NET backend + TS frontend | Same |
| Python backend | Same, plus weaker typing guarantees for a domain built on invariants |
| Rust for the pure packages | Attractive for compiler determinism, but the interop cost across twelve pure packages outweighs the benefit |

## Consequences

**Positive**

- One schema, three consumers. Schema drift between the API, the UI, and AI output contracts —
  a large class of bug — is eliminated by construction.
- The rendering toolkits are used natively.
- Pure packages are shared verbatim between server and browser, so validation and diff logic can
  run in either place without reimplementation.
- One toolchain, one test runner, one dependency graph.

**Negative**

- Node's ecosystem discipline requires care: exact version pinning for generation-critical
  libraries (docs/10-architecture/technology-stack.md §3).
- CPU-bound work (page rasterisation, large-corpus text processing, layout) needs deliberate
  attention to worker concurrency and memory bounds.
- Some enterprise integration libraries are more mature in Java; none is required for the MVP.
- Strict-mode discipline and lint rules are essential in place of a stronger type system.

## Enforcement

- One TypeScript configuration base with `strict` enabled; no per-package relaxation.
- `packages/schemas` is the only place entity shapes are declared; duplicated shape definitions are
  a review rejection.
- Generation-critical dependencies are exact-pinned, and upgrades require the golden-corpus suite
  to pass with a recorded compiler or layout version bump.
