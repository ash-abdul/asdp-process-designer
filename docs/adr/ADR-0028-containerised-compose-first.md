# ADR-0028: Containerised Services, Compose First, Kubernetes-Ready

> **Status:** Approved · **Date:** 2026-08-22 · **Reversibility:** Easy
> **Related:** docs/10-architecture/deployment-architecture.md

## Context

Phase 0 decision 8: use Docker Compose for local development and the initial MVP development
environment; build containerised services; avoid architectural assumptions that prevent future
Kubernetes deployment; Kubernetes itself is not required from day one.

The risk is not choosing Compose. The risk is that "we'll make it K8s-ready later" turns out to
mean in-process state, local filesystem dependence, baked-in configuration, and timer-driven
singletons — each cheap to avoid now and expensive to remove later.

## Decision

Services **MUST** be containerised, orchestrated by Docker Compose for development and the initial
MVP environment, and **MUST** obey twelve Kubernetes-readiness rules from day one:

| # | Rule |
|---|---|
| K1 | Stateless services — no in-process session state, no correctness-affecting in-memory caches, no sticky sessions |
| K2 | No local filesystem dependence — all persistent bytes to the object store; container filesystem ephemeral and possibly read-only |
| K3 | 12-factor configuration — environment or mounted files; secrets injected, never baked |
| K4 | Distinct health and readiness endpoints |
| K5 | Graceful shutdown — drain in-flight work, return unfinished jobs with idempotency keys intact |
| K6 | Idempotent, resumable jobs with per-sub-step checkpointing |
| K7 | Migrations as a separate one-shot task, never on service start |
| K8 | Structured JSON logs to stdout with propagated correlation IDs |
| K9 | OpenTelemetry via OTLP; no vendor agent baked in |
| K10 | No co-location assumptions; service addresses are configuration |
| K11 | Bounded resource behaviour — explicit limits on upload size, rasterisation memory, job concurrency, AI budgets |
| K12 | Multi-replica safe — optimistic locking or advisory locks; no in-process leader or timer singletons |

`api` and `worker` **MUST** be the same image with different entrypoints.

**No code may branch on environment name.** Behavioural differences are explicit configuration
values.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Kubernetes from day one | Unnecessary operational overhead for development and initial MVP |
| Non-containerised local development | Diverges from the eventual deployment model, and hides K1–K12 violations |
| Separate images for api and worker | Duplicated domain code and version drift between them |
| Defer the readiness rules | Each is cheap now and expensive later; deferring them is how "K8s-ready" becomes untrue |

## Consequences

**Positive**

- A future Kubernetes deployment is a manifest-writing exercise, not a re-architecture.
- Horizontal scaling of the worker is available immediately, which matters because AI passes are
  the slowest operations in the system.
- Restart safety and preemption safety come for free from K5/K6.
- Bounded resource behaviour prevents a large PDF from taking down the service.

**Negative**

- Slightly more up-front discipline: object store instead of local files, queue-driven scheduling
  instead of in-process timers.
- Local development requires a multi-container stack.
- Some conveniences (local temp caches, in-process schedulers) are unavailable.

## Enforcement

- Code review checklist maps to K1–K12.
- An architecture test asserts no filesystem writes outside a request-scoped temporary directory.
- Configuration schema validated at boot; missing required values fail fast.
- An architecture test asserts no branching on an environment-name variable.
- Migrations run as a distinct Compose service, not as part of `api` start-up.
