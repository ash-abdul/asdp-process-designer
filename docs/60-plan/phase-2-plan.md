# Phase 2 — Implementation Plan

> **Status:** Approved · **Version:** 1.0 · **Updated:** 2026-08-22
> **Related:** [roadmap.md](roadmap.md), [phase-1-status.md](phase-1-status.md),
> [phase-2-status.md](phase-2-status.md), [open-decisions.md](open-decisions.md),
> [ADR-0034](../adr/ADR-0034-nestjs-application-layer.md),
> [ADR-0035](../adr/ADR-0035-persistence-plain-sql-pglite.md),
> [ADR-0036](../adr/ADR-0036-build-toolchain.md)

---

## 0. Provenance of this record, and what needs confirmation

This document was written **after** Phase 2 V0 was implemented, to make the approved plan durable
in the repository rather than only in a planning session. Its content is drawn from the V0 commit
record (`8f2a665`), the three Phase 2 ADRs, and the roadmap.

**Confirmed from the repository:**

- the V0 slice scope, and that it is complete
- the V1 slice scope
- approvals **A2**, **A5** and **A6** (each cited in an ADR or in the V0 commit)
- the Docker-deferred set
- the out-of-scope set

**Reconstructed, and requiring confirmation** — marked ⚠ throughout:

- the V2–V7 slice boundaries, derived from the roadmap P1/P2 capability lists
- the wording of the 12 acceptance criteria
- approvals **A1**, **A3**, **A4** and **A7**

Correct anything marked ⚠ rather than treating it as settled. Once confirmed, delete this section
and the markers.

### A note on phase numbering

Two numbering schemes coexist and must not be confused.

| Scheme | Meaning |
|---|---|
| **P0 … P9** | The [roadmap](roadmap.md) phases — a capability plan |
| **Phase 0 / 1 / 2** | Implementation phases actually executed in this repository |

**Implementation Phase 2 spans roadmap P1 and P2**: multimodal intake *and* AI analysis through to
structured requirements. It is the vertical slice the roadmap §2 recommends running before
committing later scope.

---

## 1. Objective

**Produce structured, human-approved requirements from real business evidence, with resolvable
provenance on every statement, and reach gate G1.**

Concretely, at the end of Phase 2 the application must be able to:

1. ingest real business evidence — text, documents, spreadsheets, images, legacy BPMN
2. anchor every extracted unit to the exact region it came from, in Arabic and English
3. run AI analysis passes that produce **cited** proposals, never uncited assertions
4. place every item on the epistemic ladder with computed confidence
5. surface genuine gaps, ambiguities and conflicts for human resolution
6. reach **G1** only after a human has actually resolved them

Phase 2 proves the first of the two hypotheses the whole product depends on: **that AI reads real
bilingual documents accurately, with provenance that resolves.** (The second — that generation plus
layout yields artifacts an architect accepts without touching them — is Phase 3+.)

Phase 2 delivers **no generation**. See §7.

---

## 2. Vertical slices V0–V7

Each slice is a working vertical increment: schema → persistence → command → HTTP → tests. No slice
is a horizontal layer.

### V0 — Foundation ✅ complete

Durable state, a composition layer able to carry ~32 endpoints, and a blob store.

- Compiled build toolchain: `tsc -b`, project references, decorators confined to `apps/api`
  ([ADR-0036](../adr/ADR-0036-build-toolchain.md))
- NestJS as the composition layer, conditions N1–N5
  ([ADR-0034](../adr/ADR-0034-nestjs-application-layer.md))
- PGlite persistence, plain parameterised SQL, forward-only migrations
  ([ADR-0035](../adr/ADR-0035-persistence-plain-sql-pglite.md))
- BlobStore port with a guarded filesystem development adapter, content-addressed keys
- Optimistic concurrency on gate updates; readiness probe reporting applied migrations
- Spike **S7** resolved: Prisma not viable over PGlite; PGlite is PostgreSQL 18.3, 15/15 fidelity

### V1 — Text intake and provenance end to end ▶ approved next

The first slice where the Phase 1 provenance machinery gets a real consumer.

- **Ingest guard**: type sniffing by magic bytes, size limits, SHA-256 dedupe, immutable blob storage
- **Free-text and Markdown adapter** producing `SourceUnit`s with verified, resolvable anchors
- New schemas `Source`, `SourceUnit`, `EvidenceItem`, plus migration `002`
- **Source inventory** with human-set **authority ranking** — the deterministic input to conflict
  precedence
- **Source viewer API** returning highlight ranges, including RTL Arabic spans
- **L0 validation rules** `L0-ING-001 … L0-ING-010`, with an unresolvable anchor as a hard error

No new decisions, no new dependencies.

### V2 — Binary document intake ⚠

- PDF, DOCX and spreadsheet adapters
- Page rasterisation and page-image storage
- Data classification applied at ingest ([ADR-0021](../adr/ADR-0021-data-classification-egress-policy.md))
- Arabic PDF extraction measured against spike **S2**'s findings, with the documented fallback to
  page-image + vision — never a silent degradation

### V3 — Multimodal and structural intake ⚠

- Screenshots, diagram images and scanned pages, with `image_region` anchors
- Structural import of legacy BPMN, DMN and forms as *evidence*, not as editable artifacts
- Per-source-type confidence ceilings: diagram images capped at L2 with element-wise confirmation

### V4 — Analysis passes and the evidence store ⚠

- Analysis Frame v1; passes **P0–P6**
- **Egress policy gate live** on the real analysis path ([ADR-0021](../adr/ADR-0021-data-classification-egress-policy.md))
- Provider routing and the **degradation ladder** recorded on every proposal
- Evidence store: citations, quotes, checksums, anchor references

### V5 — Requirement model and epistemics ⚠

- Requirement model over RAF v1.1's 27 slots
- Epistemic ladder L1–L4 enforced on every item
- **Computed confidence** — never provider-reported
- **Clarification queue**: blocking questions that must be answered by a human

### V6 — Conflict resolution and coverage ⚠

- Cross-source conflict detection
- **Deterministic precedence** derived from the human authority ranking set in V1
- Coverage dashboard over the RAF slots
- Conflicts **block G1**; the human always decides

### V7 — Requirements workspace and G1 ⚠

- Requirements workspace: diff-centric review, L3 content marked and counted
- **G1 gate** reachable only after genuine human resolution
- AI-disclosure reporting; edit-rate monitoring where 100% raw acceptance is a **warning**
- Evaluation harness run over the corpus with no network

---

## 3. Dependencies between slices

```
V0 ──▶ V1 ──▶ V2 ──▶ V3
        │              │
        └──────▶ V4 ◀──┘        V4 needs anchored units (V1);
                 │              image evidence needs V3
                 ▼
                V5 ──▶ V6 ──▶ V7
```

| Dependency | Reason |
|---|---|
| V1 → everything | Nothing can be analysed before it can be anchored |
| V2 → V3 | Rasterisation must exist before page images can be analysed |
| V1 → V4 | Analysis consumes `SourceUnit`s; it does not consume raw blobs |
| V3 → V4 (partial) | Only the *image* evidence path depends on V3. Text analysis does not |
| V4 → V5 | Requirements are built from evidence, not from sources |
| V1 → V6 | Authority ranking is set in V1 and consumed in V6 |
| V6 → V7 | G1 cannot be reached while conflicts are unresolved |

**Spike dependency:** S2 (Arabic PDF) gates V2. S5/S6 (provider abstraction, egress gate) were
resolved in Phase 1 and gate V4.

---

## 4. Acceptance criteria ⚠

Phase 2 is complete when all twelve hold. Each is a test, not a judgement.

| # | Criterion |
|---|---|
| 1 | **Ingest guard**: type determined by magic bytes not extension; size limits enforced; SHA-256 dedupe; the stored blob is immutable |
| 2 | **Every anchor resolves.** Given an anchor and the stored source, the exact region is returned and the quote checksum verifies. An unresolvable anchor is a **hard L0 error**, never a warning |
| 3 | **Bilingual fidelity**: Arabic and English round-trip byte-exact; highlighting is correct in both reading directions, including mixed and non-BMP text |
| 4 | **Durability**: all Phase 2 state survives a full service restart; every gate transition is transactional and rolls back cleanly |
| 5 | **Egress**: a `RESTRICTED` payload cannot reach an external adapter, asserted **at the transport boundary**, on the real analysis path |
| 6 | **Degradations are recorded** on every proposal and propagated into computed confidence; no degradation is silent |
| 7 | **No requirement without provenance.** Every requirement cites evidence or is explicitly marked as inference. There is no third case |
| 8 | **Conflicts block G1**, and precedence is deterministic, derived from the human-set authority ranking |
| 9 | **G1 is reachable only after genuine human resolution** of blocking questions — not by dismissing the queue |
| 10 | **Evaluation metrics** are computed offline from recordings, with no network access |
| 11 | **Verification clean**: build, `check:arch`, checker self-test, `check:docs` and tests all pass, with **no skipped or suppressed tests** |
| 12 | **Vision has no silent fallback.** If the configured provider lacks vision, image evidence is **refused with a named degradation**, never downgraded quietly |

---

## 5. Approved decisions A1–A7

| # | Decision | Source |
|---|---|---|
| **A1** ⚠ | **NestJS adopted** as the HTTP and application composition layer from V0, under binding conditions N1–N5. Discharges the ADR-0033 C5 route-budget tripwire | Reconstructed from [ADR-0034](../adr/ADR-0034-nestjs-application-layer.md) |
| **A2** | **PGlite approved as the *development* adapter.** PostgreSQL remains the production target, and switching later **must not require domain-model redesign** | Cited in [ADR-0035](../adr/ADR-0035-persistence-plain-sql-pglite.md) §Context |
| **A3** ⚠ | *Not recoverable from the repository.* Plausibly the compiled build toolchain ([ADR-0036](../adr/ADR-0036-build-toolchain.md)) — **confirm** | — |
| **A4** ⚠ | *Not recoverable from the repository* — **confirm** | — |
| **A5** | **Prisma must not become an architectural dependency** until compatibility with PGlite is proven; a materially different approach must be recorded in an ADR. Spike S7 found no PGlite driver adapter exists, so Prisma was **not adopted** | Cited in [ADR-0035](../adr/ADR-0035-persistence-plain-sql-pglite.md) §Context |
| **A6** | **BlobStore port with a filesystem development adapter**, guarded by explicit selection, a multi-replica refusal, and traversal-safe keys. MinIO remains the deployed target | Cited in the V0 commit `8f2a665` |
| **A7** ⚠ | *Not recoverable from the repository* — **confirm** | — |

---

## 6. Standing decisions carried into Phase 2

### 6.1 Docker-deferred items

Docker is unavailable in the development environment. These are **deferred with a named trigger**,
not dropped ([infra/README.md](../../infra/README.md),
[ADR-0035](../adr/ADR-0035-persistence-plain-sql-pglite.md) §Decision 6):

| Deferred | Trigger to revisit |
|---|---|
| PostgreSQL container; the PGlite → PostgreSQL swap | Docker availability |
| **ICU collation behaviour** — accepted in DDL by PGlite but **inert**; Alef variants do not sort adjacently | Docker availability |
| `pgvector` for near-duplicate detection | Docker availability |
| Image build, layer caching, Compose start-up ordering and health gating | Docker availability |
| MinIO object store; bucket bootstrapping | Docker availability |
| OIDC development identity provider; Keycloak realm import | Docker + the IdP decision (OD-1 in identity terms) |
| Durable job queue | PostgreSQL availability |

The collation gap **independently confirms** [ADR-0023](../adr/ADR-0023-unicode-bilingual-architecture.md):
bilingual ordering and comparison use **application-side match forms** from `@asdp/text`, never
database collation. The migrations declare no collation at all, and a test asserts it.

### 6.2 AI provider decision

- **Provider-neutral by construction** ([ADR-0020](../adr/ADR-0020-ai-provider-abstraction.md)). No
  vendor concept may become load-bearing; enforced by the `vendor-sdk-leak` checker rule.
- **Three adapters exist** — external, generic private-endpoint, and null — each behind the
  `AiProvider` port with capability negotiation
  ([ADR-0022](../adr/ADR-0022-capability-negotiation.md)).
- **All transports are still injected stubs.** Shape, capabilities, routing, degradation and egress
  guards are tested without any network call.
- **Live transport selection remains OD-1** — which private/enterprise endpoint will be available.
  It blocks Phase 2 *completion measurement*, not Phase 2 implementation.
- Claude API is **one adapter**, never the architecture.

### 6.3 Multimodal and vision requirement

Multimodal intake is a **headline capability**, not an enhancement: screenshots, diagram images,
scanned documents and process diagrams are primary evidence types.

**Vision is the one capability with no degradation path.** It cannot be synthesised from a
text-only model. Therefore:

- if the configured provider lacks vision, image evidence is **refused with a named degradation**
- it is **never** silently downgraded, and never partially analysed as if complete
- a fully air-gapped environment with no vision-capable model is a **scope consequence** — it
  removes a headline capability, and that must be visible, not discovered later (OD-1, and
  [open-decisions.md](open-decisions.md) §4.1)

Diagram-image extraction is capped at **L2** with element-wise human confirmation, because
confident wrong extraction from diagrams is a named high risk (R5).

### 6.4 Corpus and evaluation approach

- **Corpus is data, not code** ([ADR-0031](../adr/ADR-0031-corpus-as-data.md)).
- Phase 2 proceeds on **synthetic and clearly-labelled representative corpora**. Synthetic-only
  metrics are labelled as such and down-weighted.
- **Real or sanitised ASDP material is required eventually** (OD-7). Phase 2 is the point at which
  prompt work starts compounding, so if nothing real is available by V4, **escalate** rather than
  tune against synthetic material.
- The evaluation harness runs **record/replay with no network**, so metrics are reproducible and
  provider-independent.
- Provenance metrics are treated as **defect detectors**, not scores: an anchor that does not
  resolve is a bug, not a low number.
- Over-fitting to synthetic material is a named risk (R14); the mitigation is a full prompt-history
  re-run when real material arrives.

---

## 7. Explicitly out of scope for Phase 2

These are **not started**, by instruction. Attempting any of them is scope creep against the named
critical risk R11 — drifting toward becoming Camunda Modeler.

| Out of scope | Belongs to |
|---|---|
| **BPMN generation** | Phase 3+ (roadmap P4) |
| **DMN generation** | Phase 3+ (roadmap P4) |
| **Form generation** | Phase 3+ (roadmap P4) |
| **Process IR compilation** | Phase 3+ (roadmap P4) |
| **A graphical process designer** | **Never** — it reverses [ADR-0001](../adr/ADR-0001-requirements-driven-product-boundary.md) and [ADR-0003](../adr/ADR-0003-no-override-editor.md) |

Also out of scope for Phase 2: the Specification Studio and BPS editor (roadmap P3), the viewer
framework (P5), interface registry and full L0–L6 rule packs (P6), packaging and handoff (P7),
divergence (P8).

Structural import of legacy BPMN/DMN in V3 is **intake of evidence**, not generation and not
editing. The imported file is never rendered as an editable artifact.

---

## 8. Working rule

**No slice begins without explicit approval.** When a slice completes, report and stop. See
[CLAUDE.md](../../CLAUDE.md) §11 and the current state in [phase-2-status.md](phase-2-status.md).
