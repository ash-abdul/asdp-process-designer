# MVP Scope

> **Status:** Approved (Phase 0) · **Version:** 1.0 · **Updated:** 2026-08-22
> **Related:** [roadmap.md](../60-plan/roadmap.md), [product-boundary.md](product-boundary.md)

---

## 1. In scope

### Intake
- Free text, Markdown; Word (DOCX); PDF with text layer; scanned PDF; BRDs; SRS documents;
  SOPs; policy documents; spreadsheets (XLSX/CSV); tables inside documents; images;
  screenshots; process-diagram images; **existing BPMN**; **existing DMN**; Camunda `.form`
  files; interactive Q&A transcripts
- Arabic, English, and mixed-language sources
- Immutable source storage, deterministic parsing, provenance anchoring, source inventory,
  authority ranking, source viewer with region highlighting
- Structural (non-AI) extraction from existing BPMN/DMN/Form files

### AI analysis
- Passes P0–P7 ([generation-pipeline.md](../30-generation/generation-pipeline.md),
  [ai-provider-abstraction.md](../10-architecture/ai-provider-abstraction.md))
- Requirement Analysis Frame v1.1 (27 slots + disjointness rules) with deterministic coverage
  measurement
- Cross-source reconciliation, conflict detection, gap/ambiguity/untestability flags
- Open-question generation and clarification queue
- Computed confidence; four-level epistemic ladder
- **Provider abstraction with capability negotiation and degradation** — the MVP must run
  against at least two providers, one of which is a private/self-hosted endpoint stub

### Requirements
- Full requirement record with traceability fields
- Review workspace with split-screen source highlighting (LTR and RTL) — **NOT DELIVERED as at 2026-08-25: the review APIs exist, the workspace does not. UNPLANNED, no approved boundary** ([roadmap.md](../60-plan/roadmap.md) §0)
- Conflict resolution, coverage dashboard, version history, supersession — conflict resolution and version history **delivered as APIs**; the **coverage dashboard is NOT DELIVERED** (the `frame-coverage` API exists, the dashboard does not). **UNPLANNED, no approved boundary**

### Specification layer
- Domain Model Registry (bilingual glossary, actors, data entities/fields, business rules,
  events, notifications)
- Business Process Specification editor
- DecisionSpec editor with completeness/overlap analysis
- FormSpec editor
- ServiceInterface editor
- Generation Directives (vocabulary v1)

### Generation
- Correct-by-construction Process IR (v1.1 — 28 invariants)
- BPMN, DMN, Camunda Form compilers
- **Ecosystem BPMN auto-layout** integration + bilingual label measurement, with quality validation
  and golden-corpus regression. ASDP does not build a layout engine
- Camunda 8.x target profiles (version-configurable)

### Review
- One viewer shell, three renderers, four-part inspector, five overlays, compare view
- Outline, path table, decision matrix, variable-flow table
- AI explanation (non-authoritative)

### Quality
- Validation layers L0–L6 including layout-quality rules and cross-artifact dependency
  validation
- Waivers with justification and approver
- Test scenario definition: path and rule enumeration, AI-proposed data, coverage report

### Governance
- G0–G4 gates, diff-centric review, comment threads, signatures over baseline hashes,
  append-only audit log, AI-disclosure reporting
- Abstract OIDC/OAuth2 authentication; role mapping from claims

### Repository, release, handoff
- Immutable content-addressed versions, canonical serialisation, semantic diff, baselines,
  change sets
- Camunda-ready Process Application export
- Handoff record and permanent release freeze
- **A↔C** candidate-vs-baseline comparison always; **A↔B↔C** three-way comparison when the
  current Camunda state is re-uploaded as an observation

### Platform
- Containerised services, Docker Compose development and MVP environment
- Data classification and AI egress policy enforcement

---

## 2. Out of scope for the MVP

| Excluded | Rationale |
|---|---|
| Full BPMN editor | [ADR-0001](../adr/ADR-0001-requirements-driven-product-boundary.md) — permanent, not a phase decision |
| Full DMN editor | Same. Decision intent originates from requirements and DecisionSpec |
| Full form editor | Same. FormSpec is the editable surface |
| Any override/unlock editing of generated artifacts | [ADR-0003](../adr/ADR-0003-no-override-editor.md) — permanent |
| Production deployment automation | Explicit product constraint |
| Runtime process monitoring | Camunda Operate's job |
| Full worker implementation code generation | Contracts first; codegen without settled contracts produces waste. Stub scaffolding is post-MVP |
| Executable test generation and execution | Requires a cluster; scenario definitions are the MVP deliverable |
| Live deployment / dry-run validation | Sandbox availability is TBD ([ADR-0026](../adr/ADR-0026-static-validation-first.md)); the port exists, the adapter is deferred |
| Automated Camunda / Web Modeler API pull or push | Manual re-upload delivers the divergence capability at near-zero cost ([ADR-0019](../adr/ADR-0019-divergence-via-observation.md)) |
| Kubernetes deployment | Compose is sufficient for development and initial MVP; K8s-readiness rules apply from day one ([ADR-0028](../adr/ADR-0028-containerised-compose-first.md)) |
| Real-time collaborative co-editing | Per-artifact optimistic locking is adequate; CRDT is a project of its own |
| Multi-level process hierarchies beyond auto-extracted subprocesses | Single executable process per project in MVP |
| BPMN pools / collaboration diagrams | Not executable in Zeebe; would invite drawing-tool expectations |
| Custom connector template authoring | Camunda's templates are consumed as data; no authoring UI |
| Retrieval-augmented context for corpora above the negotiated provider context budget | Chunked map-reduce degradation covers it ([ADR-0022](../adr/ADR-0022-capability-negotiation.md)) |
| Full UX localisation (Arabic UI chrome) | Phased. The **data, evidence, anchoring, text-processing and rendering architecture** is bilingual from day one ([ADR-0023](../adr/ADR-0023-unicode-bilingual-architecture.md)) |
| Cross-project pattern library and reuse | Post-MVP |
| Runtime KPI feedback / Optimize integration | Requires production data |

---

## 3. Deliberately deferred but architecturally provided for

These are **not** built in the MVP, but the MVP must not make them expensive later. Each has
a named port or extension point.

| Capability | Extension point |
|---|---|
| Live Camunda deployment validation | `DeploymentValidator` port ([validation-architecture.md](../40-quality/validation-architecture.md)) |
| Automated Camunda state pull | `CamundaObservationSource` port ([handoff-and-divergence.md](../50-governance/handoff-and-divergence.md)) |
| Web Modeler / git push | `ArtifactPublisher` port |
| Worker code scaffolding | `ServiceInterface` contract schema is the generator input |
| Executable test generation | `TestScenario` model is engine-agnostic by design |
| Additional AI providers, incl. fully on-premise | `AiProvider` port + capability descriptor ([ADR-0020](../adr/ADR-0020-ai-provider-abstraction.md)) |
| Full Arabic UI | Message catalogues, logical-property CSS, `dir` propagation from day one |
| Kubernetes | 12-factor config, stateless services, externalised state, health probes |
| Additional Camunda 8.x minor versions | Versioned generation and validation profiles ([camunda-integration.md](../50-governance/camunda-integration.md)) |
