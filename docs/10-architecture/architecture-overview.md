# Architecture Overview

> **Status:** Approved (Phase 0) · **Version:** 1.0 · **Updated:** 2026-08-22
> **Related:** [ADR-0029](../adr/ADR-0029-modular-monolith.md), [module-map.md](module-map.md), [ADR-0004](../adr/ADR-0004-ai-proposes-code-commits.md)

---

## 1. Shape

**Modular monolith, containerised, single primary deployable, hard internal boundaries, one
transactional consistency domain (the artifact repository).**

The pipeline is tightly coupled by nature — a gate transition spans requirements,
specifications, artifacts, validation, and audit in one consistent act. Microservices would
add distributed-transaction failure modes and buy nothing at this scale. Module boundaries are
enforced by package dependency rules so that later extraction remains possible
([ADR-0029](../adr/ADR-0029-modular-monolith.md)).

Supporting containers are separate from day one — database, object store, and the worker that
runs long AI and validation jobs — so that horizontal scaling and a future Kubernetes topology
require no re-architecture ([ADR-0028](../adr/ADR-0028-containerised-compose-first.md)).

```
┌──────────────────────────────── Browser (SPA) ─────────────────────────────────┐
│  ╔════════════ EDITABLE SURFACES ═════════════╗  ╔═════ READ-ONLY ══════════╗  │
│  ║ Intake · Analysis review · Requirements     ║  ║ Artifact Viewer Framework║  │
│  ║ Domain Model Registry                       ║  ║  · BPMN renderer         ║  │
│  ║ ── SPECIFICATION STUDIO ──                  ║  ║  · DMN renderer          ║  │
│  ║    BPS · DecisionSpec · FormSpec ·          ║  ║  · Form preview          ║  │
│  ║    ServiceInterface · Generation Directives ║  ║  · Inspector · Overlays  ║  │
│  ╚═════════════════════════════════════════════╝  ║  · Compare · Outline     ║  │
│  Validation · Traceability explorer · Approvals   ╚══════════════════════════╝  │
│  Releases & handoff · Divergence · Admin & policy                               │
└────────────────────────────────────┬───────────────────────────────────────────┘
                        REST/JSON + SSE (streaming AI passes)
┌────────────────────────────────────▼───────────────────────────────────────────┐
│                          API / Application Layer                              │
│    command handlers · GATE GUARDS · RBAC · audit interceptor · idempotency     │
│    ⚠ No command exists that mutates a generated artifact.                      │
└─┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬───────┘
  │      │      │      │      │      │      │      │      │      │      │
┌─▼────┐┌▼─────┐┌▼─────┐┌▼────┐┌▼────┐┌▼────┐┌▼────┐┌▼────┐┌▼────┐┌▼────┐┌▼──────┐
│Intake││Evid- ││Requi-││Spec ││ IR  ││Lay- ││Vali-││Trace││Test ││Pack-││Handoff│
│Adapt.││ence  ││rement││Layer││Comp.││out  ││dation││abil.││Scen.││aging││& Div. │
└──────┘└──────┘└──────┘└─────┘└─────┘└─────┘└─────┘└─────┘└─────┘└─────┘└───────┘
        PURE PACKAGES (no I/O): domain · raf · provenance · text · process-ir ·
        compilers · layout · validation · traceability · diff · packaging
                                     │
        ┌────────────────────────────▼─────────────────────────────┐
        │  AI ORCHESTRATION — Proposal Broker                      │
        │  task registry · context assembly · capability negotiation│
        │  · EGRESS POLICY GATE · provider routing · degradation    │
        │  · schema enforcement · cost metering · full audit        │
        │  ── emits Proposals ONLY; holds no write authority ──     │
        └────────────────────────────┬─────────────────────────────┘
                                     │  AiProvider port
                 ┌───────────────────┼───────────────────┐
                 ▼                   ▼                   ▼
        ┌────────────────┐  ┌────────────────┐  ┌────────────────┐
        │ Claude adapter │  │ Private/self-  │  │ Other approved │
        │                │  │ hosted adapter │  │ provider       │
        └────────────────┘  └────────────────┘  └────────────────┘
┌───────────────────────────────────────────────────────────────────────────────┐
│ Postgres (domain · evidence · trace graph · audit · vectors)                   │
│ Object store (source blobs · page images · artifact payloads)                  │
│ Job queue (long AI passes · validation runs · packaging) — idempotent, resumable│
└───────────────────────────────────────────────────────────────────────────────┘
```

## 2. Architectural invariants

These are the architecture. Everything else is detail. Each is enforced structurally, not by
convention.

| # | Invariant | Enforcement |
|---|---|---|
| **I1** | **The AI has no write authority.** It produces `Proposal` records; a human acceptance triggers a deterministic command that writes | The `ai` package cannot import domain write paths — dependency lint fails the build ([ADR-0004](../adr/ADR-0004-ai-proposes-code-commits.md)) |
| **I2** | **The AI never emits artifact serialisations.** It emits validated Process IR or specification objects; pure compilers produce BPMN/DMN/Form output | Compilers are the only code that imports the moddle/serialisation libraries ([ADR-0005](../adr/ADR-0005-ir-first-compilation.md)) |
| **I3** | **No command mutates a generated artifact.** No such endpoint, handler, or repository method exists | Command registry review; absence test in CI ([ADR-0002](../adr/ADR-0002-spec-layer-editing.md)) |
| **I4** | **Nothing exists downstream without provenance.** A requirement requires evidence or an explicit inference rationale; a spec element requires a requirement citation; an artifact element requires a spec source reference | Domain invariants + validation layer L4 ([ADR-0008](../adr/ADR-0008-resolvable-anchors.md)) |
| **I5** | **Artifacts are immutable and content-addressed.** Every save is a new version; baselines are frozen version sets | Insert-only tables; canonical serialisation before hashing ([ADR-0016](../adr/ADR-0016-immutable-content-addressed-artifacts.md)) |
| **I6** | **The Validation Engine is the sole authority on readiness.** Gates query it; the UI only renders it | Gate guards call validation; no UI-side gating logic ([ADR-0017](../adr/ADR-0017-approval-as-baseline-signature.md)) |
| **I7** | **Layout is deterministic and versioned.** Geometry is computed, never authored | `layoutEngineVersion` on every artifact version ([ADR-0014](../adr/ADR-0014-layout-safety-critical.md)) |
| **I8** | **Every AI interaction is fully logged** — provider, model, capability tier, prompt version, tokens, cost, latency, proposal, human verdict | `AiInteraction` written by the broker, not by callers ([audit-and-compliance.md](../50-governance/audit-and-compliance.md)) |
| **I9** | **No content reaches an AI provider without passing the egress policy gate** | Single choke point in the broker; providers are unreachable from elsewhere ([ADR-0021](../adr/ADR-0021-data-classification-egress-policy.md)) |
| **I10** | **All text is Unicode-normalised and language-tagged at the boundary.** No component may assume English or LTR | `text` package owns normalisation; anchors are code-point based ([ADR-0023](../adr/ADR-0023-unicode-bilingual-architecture.md)) |

## 3. Layering and dependency direction

```
        apps/web  ──────────────┐
                                ├──▶  packages/schemas  ◀── shared contract
        apps/api  ──────────────┘
             │
             ├──▶ adapters & infrastructure (DB, object store, queue, providers)
             │
             └──▶ PURE PACKAGES
                    domain · raf · provenance · text · process-ir ·
                    compiler-bpmn · compiler-dmn · compiler-forms ·
                    layout · validation · traceability · diff · packaging

        packages/ai ──▶ schemas, raf, text     (and NOTHING else)
```

Pure packages have no database, network, filesystem, clock, or randomness access. They are
unit-testable in isolation and snapshot-locked. This is what makes the correctness claims in
[validation-architecture.md](../40-quality/validation-architecture.md) and
[process-ir.md](../30-generation/process-ir.md) testable rather than aspirational.

## 4. Request/response patterns

| Pattern | Used for |
|---|---|
| Synchronous command | Everything transactional: edits, approvals, gate transitions, releases |
| Job + SSE progress | AI passes, full validation runs, generation, packaging, divergence analysis |
| Idempotency keys | All commands; required because AI passes are retried and expensive |
| Optimistic locking | Per-artifact and per-specification editing (`version` precondition) |
| Content-hash preconditions | Approvals and gate transitions — a signature binds to an exact baseline hash |

## 5. Failure and degradation posture

| Failure | Behaviour |
|---|---|
| AI provider unavailable | Pass fails visibly with a retry action; no silent fallback to a lower-capability provider unless the routing policy explicitly permits it, and the substitution is recorded on the proposal |
| Provider lacks a required capability | Documented degradation ladder ([ADR-0022](../adr/ADR-0022-capability-negotiation.md)); the resulting confidence is reduced and the degradation is visible on every affected requirement |
| Egress policy forbids sending content | Pass is refused, not degraded silently; the user is told which classification blocked it and what the options are |
| Source cannot be parsed | Ingest fails with a specific reason; the source is retained; manual transcription is offered |
| Anchor cannot be resolved | Hard error at L0 validation; never stored silently |
| Layout quality below threshold | Validation finding with a recommended directive or subprocess extraction; generation still completes so the finding is inspectable |
| Camunda state unknown at divergence time | Reported loudly as an incomplete comparison; never presented as complete |

## 6. What is deliberately absent

- Any write path to a Camunda cluster ([ADR-0018](../adr/ADR-0018-handoff-ownership-boundary.md))
- Any artifact-mutating command (I3)
- Any direct provider SDK usage outside a provider adapter (I9)
- Any English-only or LTR-only assumption in storage, anchoring, or rendering (I10)
- Any vendor-specific identity SDK ([ADR-0027](../adr/ADR-0027-abstract-oidc-identity.md))
