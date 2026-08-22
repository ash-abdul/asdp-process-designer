# Module Map and Dependency Rules

> **Status:** Approved (Phase 0) · **Version:** 1.0 · **Updated:** 2026-08-22
> **Related:** [ADR-0029](../adr/ADR-0029-modular-monolith.md), [architecture-overview.md](architecture-overview.md)

---

## 1. Repository layout (planned)

Not yet created. This is the target structure for Phase 1.

```
asdp-process-designer/
├─ apps/
│  ├─ web/                                  React SPA
│  │  └─ src/
│  │     ├─ features/{projects,intake,analysis,requirements,domain-model,
│  │     │            spec-studio,interfaces,validation,traceability,
│  │     │            tests,releases,handoff,divergence,governance,admin}
│  │     ├─ viewers/{shell,bpmn,dmn,form,inspector,overlays,compare,outline}
│  │     ├─ source-viewer/{pdf,docx,sheet,image,model}
│  │     ├─ i18n/                           message catalogues, bidi utilities
│  │     └─ components/  lib/
│  └─ api/
│     └─ src/modules/{auth,projects,governance,intake,adapters,evidence,
│                     analysis,requirements,domain-model,spec,compiler,
│                     artifacts,interfaces,validation,traceability,tests,
│                     packaging,handoff,divergence,ai,audit,jobs,admin}
├─ packages/
│  ├─ schemas/          Zod schemas → types + JSON Schema for AI output contracts
│  ├─ domain/           entities, invariants, gate state machine            (pure)
│  ├─ text/             Unicode normalisation, match forms, bidi, offsets   (pure)
│  ├─ provenance/       anchor types, resolution, verification              (pure)
│  ├─ raf/              Requirement Analysis Frame schema + coverage        (pure)
│  ├─ ingestion/        source adapters                                     (I/O)
│  ├─ process-ir/       IR definition, invariants, diff, region tree        (pure)
│  ├─ compiler-bpmn/    IR → BPMN 2.0 + zeebe extensions                    (pure)
│  ├─ compiler-dmn/     DecisionSpec → DMN                                  (pure)
│  ├─ compiler-forms/   FormSpec → Camunda form JSON                        (pure)
│  ├─ layout/           layout invocation · bilingual label measurement ·
│  │                    bounded post-processing · quality metrics           (pure)
│  ├─ validation/       rule packs L0–L6, Camunda profiles                  (pure)
│  ├─ traceability/     trace graph, coverage, impact analysis              (pure)
│  ├─ diff/             semantic diff, three-way divergence classification  (pure)
│  ├─ packaging/        package assembly, manifest, doc generation          (pure)
│  ├─ ai/               task registry, broker, routing, degradation, adapters
│  ├─ camunda-profiles/ version feature matrices + rule pack selection      (pure)
│  └─ ui/               shared design system, bidi-safe primitives
├─ corpora/             evaluation corpora registry (see ADR-0031)
├─ prompts/             versioned prompt templates (reviewed like code)
├─ fixtures/            golden IR→artifact snapshots, golden layouts, AI recordings
├─ infra/               docker-compose, container definitions, migrations, seed
├─ docs/                this documentation set
└─ e2e/                 Playwright
```

## 2. Package classification

| Class | Packages | Constraints |
|---|---|---|
| **Pure** | `domain`, `text`, `provenance`, `raf`, `process-ir`, `compiler-*`, `layout`, `validation`, `traceability`, `diff`, `packaging`, `camunda-profiles` | No I/O of any kind: no DB, network, filesystem, clock, randomness, environment access. Deterministic given inputs. Snapshot-testable |
| **Contract** | `schemas` | No dependencies on anything but standard library. Consumed by web, api, and `ai` |
| **Adapter** | `ingestion`, `ai` | I/O permitted, but confined behind explicit ports |
| **Application** | `apps/api` | Orchestrates; owns transactions, guards, audit |
| **Presentation** | `apps/web`, `ui` | No domain logic; no direct provider or DB access |

## 3. Dependency rules (enforced in CI)

```
apps/web        → schemas, ui                                    ✔
apps/api        → schemas, domain, raf, provenance, text,
                  process-ir, compiler-*, layout, validation,
                  traceability, diff, packaging, camunda-profiles,
                  ingestion, ai                                  ✔
packages/ai     → schemas, raf, text                             ✔  ONLY these
pure packages   → schemas, and other pure packages               ✔
─────────────────────────────────────────────────────────────────────
packages/ai     → domain, apps/api, any repository               ✘  BLOCKED (I1)
pure packages   → ingestion, ai, apps/*                          ✘  BLOCKED
anything        → a vendor AI SDK, outside packages/ai/adapters   ✘  BLOCKED (I9)
anything        → bpmn-moddle/dmn-moddle, outside compiler-* and
                  ingestion                                       ✘  BLOCKED (I2)
apps/web        → domain, compiler-*, validation internals        ✘  BLOCKED
```

Violations fail the build. These rules are how architectural invariants I1, I2, and I9
([architecture-overview.md](architecture-overview.md) §2) become mechanical rather than
cultural.

## 4. Module responsibilities

| Module | Owns | Does not own |
|---|---|---|
| **M1 Project & Governance** | Projects, RBAC, gate state machine, approvals, waivers, audit | Validation logic (it queries it) |
| **M2 Source Intake & Ingestion** | Upload guard, adapters, parsing, rasterisation, anchoring, inventory, authority ranking, classification at ingest | Semantic reading |
| **M3 Evidence Store** | Immutable evidence items, anchor verification | Interpretation |
| **M4 Requirements Analysis Engine** | Pass orchestration, frame population, reconciliation, quality flags, question synthesis | Provider selection (delegates to the broker), approval |
| **M5 Requirements Workspace** | Requirement CRUD, review UI, coverage dashboard, conflict resolution | Gate decisions |
| **M6 Domain Model Registry** | Bilingual glossary, actors, data entities/fields, business rules, events, notifications | Process structure |
| **M7 Specification Studio** | BPS, DecisionSpec, FormSpec, ServiceInterface, Generation Directives | Artifact content |
| **M8 Process IR & Compilers** | IR construction and invariants, artifact serialisation | Layout geometry, validation verdicts |
| **M9 Artifact Viewer Framework** | Viewer shell, renderers, inspector, overlays, compare, non-diagram views | Any mutation |
| **M10 Layout** | Invoking the ecosystem auto-layout capability, bilingual label measurement, bounded post-processing, layout quality metrics | Artifact semantics; **any general-purpose layout algorithm of our own** ([ADR-0014](../adr/ADR-0014-layout-safety-critical.md) v2.0) |
| **M11 Interface Registry** | Service/worker contracts, connector allow-list resolution | Worker code |
| **M12 Validation Engine** | Rule packs L0–L6, findings, waiver evaluation, dependency graph validation | Fixing anything |
| **M13 Traceability Service** | Trace graph, coverage, impact analysis, AI-disclosure computation | Narration (that is an AI task) |
| **M14 Test Scenario Manager** | Path/rule enumeration, scenarios, coverage | Execution |
| **M15 Artifact Repository & Versioning** | Immutable versions, canonical hashing, semantic diff, baselines, change sets | Content semantics |
| **M16 Handoff & Divergence** | Release freeze, handoff records, observations, three-way classification, divergence reports | Writing to Camunda (does not exist) |
| **M17 Packaging & Export** | Package assembly, manifest, generated documentation | Delivery mechanism beyond export |
| **M18 AI Orchestration** | Task registry, context assembly, classification, **egress gate**, routing, degradation, schema enforcement, cost metering, interaction audit | Any write to domain state |

## 5. Ports (interfaces with deferred or swappable implementations)

Named now so that MVP omissions are cheap to fill later.

| Port | MVP implementation | Deferred implementations |
|---|---|---|
| `AiProvider` | Claude adapter · private-endpoint adapter · null adapter | Additional approved providers |
| `IdentityProvider` | Generic OIDC/OAuth2 | Any enterprise IdP |
| `BlobStore` | S3-compatible | Enterprise object storage |
| `JobQueue` | Postgres-backed | Redis/Kafka-backed |
| `DeploymentValidator` | **Not implemented** (static validation only) | Camunda sandbox dry-run |
| `CamundaObservationSource` | Manual re-upload | Camunda / Web Modeler API pull |
| `ArtifactPublisher` | Local package download | Git push, Web Modeler push |
| `ConnectorTemplateSource` | Bundled template files | Registry / marketplace sync |
| `SensitiveDataDetector` | Deterministic pattern set (bilingual) | Enterprise DLP integration |
| `Tokeniser` | Provider-native counting | Local tokeniser per provider |
