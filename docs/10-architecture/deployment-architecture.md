# Deployment Architecture

> **Status:** Approved (Phase 0) · **Version:** 1.0 · **Updated:** 2026-08-22
> **Related:** [ADR-0028](../adr/ADR-0028-containerised-compose-first.md), [data-governance.md](data-governance.md)

---

## 1. Requirement

Docker Compose for local development and the initial MVP development environment.
Containerised services. **No architectural assumption may prevent future Kubernetes
deployment.** Kubernetes itself is not required from day one.

## 2. Topology

```
┌────────────────────────────────────────────────────────────────────────┐
│ Reverse proxy / TLS terminator                                         │
│   · serves the built SPA as static assets                              │
│   · routes /api → api service                                          │
└──────────────────────────┬─────────────────────────────────────────────┘
                           │
      ┌────────────────────┼──────────────────────┐
      ▼                    ▼                      ▼
┌───────────┐      ┌───────────────┐     ┌──────────────────┐
│ api       │      │ worker        │     │ (dev only)       │
│ stateless │      │ stateless     │     │ oidc-dev         │
│ HTTP      │      │ job consumer  │     │ standards-        │
│           │      │ AI passes,    │     │ compliant IdP     │
│           │      │ validation,   │     │ container         │
│           │      │ generation,   │     └──────────────────┘
│           │      │ packaging     │
└─────┬─────┘      └───────┬───────┘
      │                    │
      └────────┬───────────┘
               ▼
   ┌──────────────────────┐   ┌──────────────────────┐   ┌────────────────────┐
   │ postgres             │   │ object store         │   │ (optional)         │
   │ + vector extension   │   │ S3-compatible        │   │ private-llm        │
   │ + ICU collation      │   │ (MinIO in dev)       │   │ endpoint container │
   └──────────────────────┘   └──────────────────────┘   └────────────────────┘
```

`api` and `worker` are the **same image with different entrypoints**. This keeps the domain
code identical across both and removes a whole class of drift.

## 3. Kubernetes-readiness rules (binding from day one)

These are cheap now and expensive later. Each is a review checklist item.

| # | Rule | Why |
|---|---|---|
| K1 | **Stateless services.** No in-process session state, no in-memory caches that affect correctness, no sticky sessions | Horizontal scaling and rolling restarts |
| K2 | **No local filesystem dependence.** All persistent bytes go to the object store; the container filesystem is ephemeral and may be read-only. Temp files are scoped to a single request/job and never shared | Pod rescheduling |
| K3 | **12-factor configuration.** All configuration from environment variables or mounted files; no baked-in environment values; secrets injected, never in the image | Secret managers, ConfigMaps |
| K4 | **Health and readiness endpoints** are distinct. Readiness reflects dependency reachability (DB, object store, queue); liveness reflects process health only | Probes and safe rollouts |
| K5 | **Graceful shutdown.** SIGTERM stops accepting new work, drains in-flight requests, and returns unfinished jobs to the queue with their idempotency key intact | Pod eviction |
| K6 | **Idempotent, resumable jobs.** Every job is safe to run twice; long AI passes checkpoint per sub-step so a restart does not repay full cost | Preemption, retries |
| K7 | **Database migrations run as a separate one-shot task**, never on service start-up | Multi-replica start-up races |
| K8 | **Structured JSON logs to stdout**; no log files. Correlation IDs propagate through jobs | Log aggregation |
| K9 | **OpenTelemetry traces and metrics** exported via OTLP to a configurable collector; no vendor agent baked in | Any backend |
| K10 | **No inter-service assumptions about co-location.** Service addresses are configuration; no `localhost` defaults in non-dev configuration | Service discovery |
| K11 | **Resource behaviour is bounded.** Explicit limits on upload size, page-rasterisation memory, concurrency per job type, and AI request budgets | Requests/limits, no OOM roulette |
| K12 | **Multi-replica safe.** All mutation paths use optimistic locking or advisory locks; no "leader" assumptions in the API. Any singleton work (scheduled sweeps) is queue-driven, not timer-in-process | Replica count > 1 |

## 4. Configuration domains

| Domain | Examples |
|---|---|
| Runtime | `PORT`, `NODE_ENV`, log level, concurrency |
| Datastore | Postgres URL, pool sizing, object-store endpoint and credentials |
| Identity | Issuer URL, client ID, audience, claim paths, role mapping ([identity-and-access.md](identity-and-access.md)) |
| AI | Provider entries, deployment classes, endpoints, credentials, capability descriptors, routing preferences, budgets |
| **Data governance** | Classification defaults, detector configuration, egress policy matrix, redaction requirements, residency constraints |
| Camunda | `camundaTargetVersion`, generation profile, validation rule pack version, connector allow-list |
| Localisation | Default UI locale, available locales, default requirement language |
| Limits | Max upload size, max pages, max sources per project, AI budget per project |

**Rule:** no code branches on environment name. Behaviour differences are expressed as
explicit configuration values, so that "works in dev, fails in prod" has one fewer cause.

## 5. Environments

| Environment | Purpose | Notes |
|---|---|---|
| `local` | Developer machine | Compose: api, worker, postgres, minio, oidc-dev, optional private-llm stub |
| `dev` (MVP environment) | Shared development and pilot | Compose on a single host. External AI provider permitted where policy allows |
| `test` | Evaluation and regression | Runs the golden corpora and provider conformance suites |
| `staging` / `production` | Not in Phase 0 scope | Kubernetes expected; readiness rules above make it a deployment exercise, not a re-architecture |

## 6. Data protection in deployment

| Concern | Rule |
|---|---|
| Encryption at rest | Database and object store encrypted; keys from the environment's key management |
| Encryption in transit | TLS everywhere, including to the database and object store |
| Network egress | The application container must not have unrestricted outbound access. Only configured provider endpoints and the IdP are reachable. This is a **defence in depth** measure behind the egress policy gate ([data-governance.md](data-governance.md)) |
| Backups | Encrypted; residency constraints inherited from classification |
| Source blobs | Never copied outside the enterprise boundary by the application |

## 7. Observability baseline

| Signal | Content |
|---|---|
| Traces | Request → command → job → AI invocation, with provider and model attributes |
| Metrics | Request latency, job duration by type, validation run duration, **AI cost and unit consumption per project and per provider**, cache-hit ratio, degradation counts, egress denials |
| Logs | Structured, correlated, with classification-aware redaction — **prompt content is never written to application logs**; it is written to the audited interaction store |
| Health | Liveness, readiness, and a dependency report endpoint for operators |

## 8. What is deliberately not built now

Kubernetes manifests and Helm charts, autoscaling policy, multi-region topology, blue/green
deployment tooling, and a service mesh. The readiness rules in §3 are the commitment; the
manifests are a later, mechanical exercise.
