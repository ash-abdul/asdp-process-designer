# ASDP Process Designer — Documentation Index

> **Status:** Phase 0 approved · Phase 1 complete · **Phase 2 V0–V7 all accepted; Phase 2 NOT closed — H4 blocks it** · **Version:** 2.7 · **Updated:** 2026-08-24
> **Current checkpoint:** [phase-2-status.md](60-plan/phase-2-status.md) §0

All documents are versioned specifications, not notes. Where a document and an ADR appear to
disagree, **the ADR wins** and the document is a defect.

---

## How to read this in order

**If you are approving the architecture** — read in this order:

1. [Product Charter](00-product/product-charter.md)
2. [Product Boundary](00-product/product-boundary.md)
3. [Architecture Overview](10-architecture/architecture-overview.md)
4. [AI Provider Abstraction](10-architecture/ai-provider-abstraction.md)
5. [Data Classification & AI Egress Policy](10-architecture/data-governance.md)
6. [Process IR](30-generation/process-ir.md)
7. [Open Decisions](60-plan/open-decisions.md)

**If you are implementing** — read the ADR index first, then the module map, then the spec
for the module you are building.

---

## 00 — Product

| Document | Purpose |
|---|---|
| [product-charter.md](00-product/product-charter.md) | What the product is, what it is for, what success means |
| [product-boundary.md](00-product/product-boundary.md) | What users can and cannot do; the editing boundary |
| [personas-and-journey.md](00-product/personas-and-journey.md) | Personas, stage-by-stage experience, the trace-to-change loop |
| [mvp-scope.md](00-product/mvp-scope.md) | In / out, with rationale per exclusion |

## 10 — Architecture

| Document | Purpose |
|---|---|
| [architecture-overview.md](10-architecture/architecture-overview.md) | System shape, layers, invariants |
| [module-map.md](10-architecture/module-map.md) | Modules, packages, dependency rules |
| [ai-provider-abstraction.md](10-architecture/ai-provider-abstraction.md) | Provider ports, capability negotiation, degradation ladder |
| [data-governance.md](10-architecture/data-governance.md) | Classification, egress policy, redaction, residency |
| [multilingual-architecture.md](10-architecture/multilingual-architecture.md) | Arabic/English, Unicode, bidi, RTL, bilingual traceability |
| [identity-and-access.md](10-architecture/identity-and-access.md) | Abstract OIDC/OAuth2, roles, authorisation model |
| [deployment-architecture.md](10-architecture/deployment-architecture.md) | Containers, Compose, K8s-readiness rules |
| [technology-stack.md](10-architecture/technology-stack.md) | Chosen technologies and rejected alternatives |

## 20 — Domain

| Document | Purpose |
|---|---|
| [domain-model.md](20-domain/domain-model.md) | Bounded contexts, entities, invariants |
| [requirement-analysis-frame.md](20-domain/requirement-analysis-frame.md) | RAF **v1.1** — 27 analysis slots + disjointness rules |
| [epistemic-model.md](20-domain/epistemic-model.md) | The four-level ladder L1–L4 |
| [provenance-and-anchoring.md](20-domain/provenance-and-anchoring.md) | Anchor types, resolution, Unicode-safe offsets |
| [traceability-model.md](20-domain/traceability-model.md) | The trace graph and required queries |
| [artifact-model.md](20-domain/artifact-model.md) | Artifact envelope, dependencies, canonicalisation |
| [versioning-and-baselines.md](20-domain/versioning-and-baselines.md) | Five version levels, baselines, releases |

## 30 — Generation

| Document | Purpose |
|---|---|
| [process-ir.md](30-generation/process-ir.md) | **The Process IR specification** — v1.1, structured region tree, 28 invariants |
| [generation-pipeline.md](30-generation/generation-pipeline.md) | Spec → IR → artifacts, stage by stage |
| [pattern-mapping.md](30-generation/pattern-mapping.md) | v2.0 — deterministic specification → IR table |
| [generation-directives.md](30-generation/generation-directives.md) | Directive vocabulary **v2** — 7 kinds |
| [layout-architecture.md](30-generation/layout-architecture.md) | v2.0 — **ecosystem-first** layout strategy, quality rules, golden corpus |
| [decision-generation.md](30-generation/decision-generation.md) | DecisionSpec → DMN |
| [form-generation.md](30-generation/form-generation.md) | FormSpec → Camunda Forms |

## 40 — Quality

| Document | Purpose |
|---|---|
| [validation-architecture.md](40-quality/validation-architecture.md) | v2.0 — layers L0–L6, `gates[]` / `severityByGate`, localised messages, waivers |
| [validation-rule-catalog.md](40-quality/validation-rule-catalog.md) | v1.2 — 109 rules with stable IDs, incl. the `L4-SPEC-*` G2 group |
| [test-scenario-model.md](40-quality/test-scenario-model.md) | Scenario derivation and coverage |
| [ai-evaluation-framework.md](40-quality/ai-evaluation-framework.md) | Corpora, gold sets, metrics, provider parity |

## 50 — Governance

| Document | Purpose |
|---|---|
| [governance-and-gates.md](50-governance/governance-and-gates.md) | G0–G4, approval mechanics, waivers, RBAC |
| [camunda-integration.md](50-governance/camunda-integration.md) | Camunda 8.x profiles, generation & validation targeting |
| [handoff-and-divergence.md](50-governance/handoff-and-divergence.md) | Ownership boundary, three-way comparison |
| [audit-and-compliance.md](50-governance/audit-and-compliance.md) | Audit log, AI disclosure, retention |

## 60 — Plan

| Document | Purpose |
|---|---|
| [roadmap.md](60-plan/roadmap.md) | Phases P0–P9 with exit criteria |
| [phase-0-tasks.md](60-plan/phase-0-tasks.md) | Phase 0 breakdown and the six spikes |
| [phase-1-status.md](60-plan/phase-1-status.md) | Phase 1 implementation status, defects found, deferrals |
| [phase-2-plan.md](60-plan/phase-2-plan.md) | Phase 2 objective, slices V0–V7, approved V2 boundary, acceptance criteria |
| [phase-2-status.md](60-plan/phase-2-status.md) | Phase 2 implementation status — **V0–V7 accepted; Phase 2 not closed (H4 / limitation 77)**; V4b-eval deferred; V2-PDF blocked |
| [v3-proposal.md](60-plan/v3-proposal.md) | V3 design record — multimodal and structural intake. **Approved, implemented and accepted** |
| [v4-proposal.md](60-plan/v4-proposal.md) | V4 boundary — **V4a accepted**; V4b split out to its own record. Decisions **E1–E5**, with **E2 resolved** |
| [v4b-proposal.md](60-plan/v4b-proposal.md) | V4b boundary — **V4b-core approved, implemented and ACCEPTED**, **V4b-eval deferred** pending a credential and permitted material. Decisions **F1–F5** |
| [v5-proposal.md](60-plan/v5-proposal.md) | V5 boundary — verified evidence into structured requirement **proposals** / RAF population. **APPROVED, implemented and ACCEPTED 2026-08-23.** Decisions **J1–J9** |
| [v6-proposal.md](60-plan/v6-proposal.md) | V6 boundary — canonicalisation, conflict **candidates**, deterministic precedence, reconciliation. **APPROVED, implemented and ACCEPTED 2026-08-23.** Decisions **Q1–Q9** |
| [v7-proposal.md](60-plan/v7-proposal.md) | V7 boundary — the human requirements workspace and **G1**. **APPROVED 2026-08-23; implemented and ACCEPTED 2026-08-24.** Decisions **U1–U10** |
| [h4-proposal.md](60-plan/h4-proposal.md) | **H4 boundary — project-scoped requirement identity.** Closed limitation **77**: a second project in the same database could not reach G1. **APPROVED, implemented and ACCEPTED 2026-08-24.** Decisions **K1–K8** — K1–K6 and K8 approved, **K7 refused** |
| [s2-corpus-request.md](60-plan/s2-corpus-request.md) | Spike S2 — Arabic PDF corpus request, success criteria, measurement protocol, pre-registered decision rule |
| [open-decisions.md](60-plan/open-decisions.md) | What genuinely blocks implementation |

## ADRs

[**ADR Index**](adr/README.md) — 38 decisions: ADR-0001 … ADR-0032 approved in Phase 0;
[ADR-0033](adr/ADR-0033-http-framework-deferral.md) raised during Phase 1 and now **discharged** by
[ADR-0034](adr/ADR-0034-nestjs-application-layer.md); ADR-0034, ADR-0035 and ADR-0036 added in
Phase 2 V0; [ADR-0037](adr/ADR-0037-binary-document-extraction.md) **proposed** in V2 planning and
**awaiting approval**; [ADR-0038](adr/ADR-0038-target-versus-content-verification.md) **approved** for V3.

---

## Document conventions

- **Status** values: `Draft` · `Approved (Phase 0)` · `Superseded`.
- Requirement-style obligations use **MUST / MUST NOT / SHOULD / MAY** in the RFC 2119 sense.
- Every architectural claim that constrains implementation is traceable to an ADR.
- Code fences containing type sketches are **conceptual**, not source. They are illustrative
  of shape and obligation, not of syntax or language.
