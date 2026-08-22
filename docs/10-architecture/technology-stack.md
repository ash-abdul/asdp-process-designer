# Technology Stack

> **Status:** Approved (Phase 0) · **Version:** 1.0 · **Updated:** 2026-08-22
> **Related:** [ADR-0030](../adr/ADR-0030-typescript-end-to-end.md), [ADR-0015](../adr/ADR-0015-read-only-viewers.md), [ADR-0014](../adr/ADR-0014-layout-safety-critical.md)

**Nothing here is installed.** This is the approved target stack for Phase 1.

---

## 1. Selections

### Frontend

| Concern | Choice | Rationale |
|---|---|---|
| Framework | React + TypeScript, Vite build | Required host for the Camunda `bpmn-io` rendering toolkits |
| **BPMN rendering** | `bpmn-js` **NavigatedViewer** | Pan/zoom/select only. Modelling modules are **not loaded**, so editing is absent rather than disabled ([ADR-0015](../adr/ADR-0015-read-only-viewers.md)) |
| **DMN rendering** | `dmn-js` **Viewer** | Read-only DRD, decision tables, literal expressions |
| **Form rendering** | `@bpmn-io/form-js-viewer` | Renders the form as an end user sees it — better for review than an editor |
| Overlays | `bpmn-js` overlay/marker APIs + custom canvas layers | Traceability, epistemic, validation, change, directive overlays |
| Server state | TanStack Query | Cache/invalidate around long jobs and SSE |
| Local state | Zustand | Viewer selection, overlay toggles, panel state |
| Styling | Tailwind with **logical properties only** + Radix primitives | Dense, form-heavy, accessible, RTL-safe ([multilingual-architecture.md](multilingual-architecture.md) §6) |
| PDF viewing | `pdfjs-dist` | Render + highlight overlays from logical→visual rectangle maps |
| i18n | Message catalogues + ICU message format; bidi-safe composition utilities | Phased UI localisation without architectural change |

Explicitly **not** included: `bpmn-js` modelling modules, `@bpmn-io/properties-panel`,
`bpmn-js-element-templates` UI, `dmn-js` editor modules, `@bpmn-io/form-js` editor. Their
absence is the boundary ([ADR-0002](../adr/ADR-0002-spec-layer-editing.md)).

### Backend

| Concern | Choice | Rationale |
|---|---|---|
| Runtime | Node LTS + TypeScript | Same language as the toolkits and the shared schema package |
| Framework | NestJS — **deferred in Phase 1**; HTTP built on Node built-ins with a typed router ([ADR-0033](../adr/ADR-0033-http-framework-deferral.md), *Proposed*) | Guards/interceptors map cleanly onto gate guards, RBAC, audit, idempotency. Its DI value cannot be exercised until the Postgres adapter exists, so adoption is deferred with every obligation implemented explicitly and tested |
| API style | REST + OpenAPI; SSE for long-running passes | Simple, tooling-rich, easy to secure |
| Validation/contracts | **Zod** as the single source of truth → TS types, OpenAPI, and JSON Schema for AI output contracts | One schema, three consumers |
| Database | PostgreSQL with **ICU collation** and a vector extension | Relational trace graph; JSONB payloads; bilingual collation ([ADR-0023](../adr/ADR-0023-unicode-bilingual-architecture.md)) |
| ORM/migrations | Prisma | Typed access, migration discipline |
| Object store | S3-compatible (MinIO in development) | Source blobs, page images, artifact payloads |
| Job queue | Postgres-backed queue | One fewer moving part; idempotent, resumable, transactional with domain writes |

### Generation and validation

| Concern | Choice | Rationale |
|---|---|---|
| BPMN/DMN model I/O | `bpmn-moddle`, `dmn-moddle`, `zeebe-bpmn-moddle` | Camunda's own model layer; guarantees artifact fidelity. Confined to `compiler-*` and `ingestion` |
| **Layout** | **Deferred pending Spike S4.** Default is an established BPMN-aware auto-layout capability from the bpmn.io / Camunda ecosystem; ASDP adds only bounded post-processing (chiefly bilingual label measurement) | ASDP does not build a layout engine. No library is pinned until S4 produces evidence ([ADR-0014](../adr/ADR-0014-layout-safety-critical.md) v2.0, [layout-architecture.md](../30-generation/layout-architecture.md)) |
| Camunda static validation | `bpmnlint` + Camunda's compatibility lint plugin, version-pinned per target profile | Camunda's own executability rules; do not reimplement ([camunda-integration.md](../50-governance/camunda-integration.md)) |
| FEEL | A FEEL parser/evaluator library | Design-time parse and type-check; L2 validation authority |
| Packaging | Zip assembly + templated Markdown documentation | |

### Document ingestion

| Source type | Library/approach |
|---|---|
| DOCX | A DOCX structure parser producing heading tree, paragraphs, tables, embedded images |
| PDF text + coordinates | `pdfjs-dist` |
| PDF page rasterisation | A native PDF rasteriser (MuPDF/PDFium family) via a container-safe binding |
| **Bidi reordering** | A Unicode Bidirectional Algorithm implementation, used for Arabic PDF logical-order reconstruction |
| Unicode normalisation | Platform `Intl`/ICU plus explicit Arabic folding rules in `packages/text` |
| Spreadsheets | A sheet parser exposing typed cells and A1 ranges |
| Images | An image normalisation library (resize, format, EXIF strip) |
| BPMN/DMN/Form files | `bpmn-moddle` / `dmn-moddle` / JSON parse — **deterministic, no AI** |
| Exotic formats | Optional Apache Tika sidecar container, if breadth demands it |

### AI

| Concern | Choice |
|---|---|
| Abstraction | Own `AiProvider` port; adapters per provider ([ADR-0020](../adr/ADR-0020-ai-provider-abstraction.md)) |
| MVP adapters | Claude adapter (external hosted) · generic private-endpoint adapter · null adapter |
| Output contracts | Zod-derived JSON Schema, enforced via schema-constrained output or tool calling per provider capability |
| Provenance | Native citations where available; deterministic `post_hoc` quote location otherwise |
| Token accounting | Provider-native counting only — **never** a character heuristic |
| Prompts | Versioned templates in `prompts/`, reviewed like code, referenced by hash in the audit log |

### Quality

| Concern | Choice |
|---|---|
| Unit/pure tests | A fast TS test runner over the pure packages, with golden-file snapshots for every compiler and for layout |
| E2E | Playwright, including canvas interaction and RTL rendering assertions |
| AI evaluation | Own harness over versioned corpora with per-language gold sets ([ai-evaluation-framework.md](../40-quality/ai-evaluation-framework.md)) |
| Provider conformance | Own suite run against every adapter |
| Architecture tests | Dependency-rule linting (module-map §3), plus an "absence test" asserting no artifact-mutating command exists |

### Platform

| Concern | Choice |
|---|---|
| Containers | Docker; single image, two entrypoints (`api`, `worker`) |
| Local/MVP orchestration | Docker Compose |
| Observability | OpenTelemetry via OTLP; structured JSON logs to stdout |
| Identity (dev) | A standards-compliant OIDC container |

## 2. Rejected alternatives

| Rejected | Why |
|---|---|
| Java/Spring backend | Splits the language for no gain; Camunda integration in the MVP is file-based, not engine-embedded |
| Microservices | Premature; the pipeline is one consistency domain and every gate transition spans modules |
| Document database as the primary store | The trace graph is inherently relational and is queried in both directions |
| **Direct vendor AI SDK usage in application code** | Violates [ADR-0020](../adr/ADR-0020-ai-provider-abstraction.md); a governance decision would become a rewrite |
| Character-count-based token estimation | Arabic tokenises very differently from English; budgeting would be wrong in exactly the case that matters |
| A separate OCR engine as the primary path | Vision reading avoids OCR-error cascades. A local OCR engine remains a fallback for air-gapped or vision-less providers |
| Building our own BPMN renderer | `bpmn-js` viewer fidelity matters more than control |
| **Building our own BPMN layout engine** | Outside ASDP's remit and a component we would own indefinitely. The IR's region tree already guarantees the well-structured input on which existing BPMN auto-layout performs well. Ecosystem-first, with bounded post-processing ([ADR-0014](../adr/ADR-0014-layout-safety-critical.md) v2.0) |
| Pinning a layout library before measuring it | S4 is a measurement, not an implementation; a choice made now would be a guess |
| Git as the primary datastore | Loses relational trace queries; git remains an export target only |
| Retrieval-augmented context as the default | Whole-corpus context is more accurate where the provider supports it; chunked map-reduce is the documented degradation, not the default |
| Vendor identity SDK | Violates [ADR-0027](../adr/ADR-0027-abstract-oidc-identity.md) |
| A "skip auth" development mode | Source of a recurring class of production defects |

## 3. Version pinning policy

- Exact versions pinned in the lockfile; no floating ranges for anything in the generation or
  validation path.
- `bpmn-moddle`, `dmn-moddle`, `zeebe-bpmn-moddle`, the Camunda lint plugin, the selected auto-layout
  capability, and the FEEL parser are **generation-critical**: upgrades require the golden-corpus
  suite to pass and a recorded compiler/layout version bump
  ([artifact-model.md](../20-domain/artifact-model.md)).
- Camunda-related library versions are selected by the active **Camunda target profile**, not
  globally ([camunda-integration.md](../50-governance/camunda-integration.md)).
