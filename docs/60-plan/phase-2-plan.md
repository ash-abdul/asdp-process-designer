# Phase 2 — Implementation Plan

> **Status:** V0–V1 complete · **V2 (DOCX) complete; V2-PDF blocked** · V3–V7 **provisional** · **Version:** 3.0 · **Updated:** 2026-08-23
> **Related:** [roadmap.md](roadmap.md), [phase-1-status.md](phase-1-status.md),
> [phase-2-status.md](phase-2-status.md), [open-decisions.md](open-decisions.md),
> [ADR-0034](../adr/ADR-0034-nestjs-application-layer.md),
> [ADR-0035](../adr/ADR-0035-persistence-plain-sql-pglite.md),
> [ADR-0036](../adr/ADR-0036-build-toolchain.md)

---

## 0. What is approved, and what is not

This document distinguishes three kinds of statement. **Do not collapse them.**

| Kind | Meaning | Where |
|---|---|---|
| **Approved** | Explicitly decided. Binding | §1, §2 (V0, V1), §4 (A1–A7), §6 |
| **Provisional** | The current planned capability sequence. **Not historically approved.** Requires approval before the slice begins, and may be refined or re-cut | §3.5 (V3–V7) |
| **Consolidated** | Derived from existing approved ADRs and roadmap documents, presented as the current criteria set. Every item is traceable to its source. **Not an original approved wording** | §5 |

The exact original V2–V7 slice boundaries and the exact original wording of the Phase 2 acceptance
criteria were never durably recorded. They are **not** reconstructed here as historical fact.
**V2's boundary was approved explicitly on 2026-08-23 and is recorded in §3.1.** §3.5 carries
capability names only for V3–V7, and §5 is derived from sources that do exist.

### Phase numbering

| Scheme | Meaning |
|---|---|
| **P0 … P9** | The [roadmap](roadmap.md) phases — a capability plan |
| **Phase 0 / 1 / 2** | Implementation phases actually executed in this repository |

**Implementation Phase 2 spans roadmap P1 and P2** — multimodal intake *and* AI analysis through to
structured requirements. It is the vertical slice the roadmap §2 recommends running before
committing later scope.

---

## 1. Objective — approved

**Produce structured, human-approved requirements from real business evidence, with resolvable
provenance on every statement, and reach gate G1.**

At the end of Phase 2 the application must be able to:

1. ingest real business evidence — text, documents, spreadsheets, images, legacy BPMN
2. anchor every extracted unit to the exact region it came from, in Arabic and English
3. run AI analysis passes that produce **cited** proposals, never uncited assertions
4. place every item on the epistemic ladder with computed confidence
5. surface genuine gaps, ambiguities and conflicts for human resolution
6. reach **G1** only after a human has actually resolved them

Phase 2 proves the first of the two hypotheses the product depends on: **that AI reads real
bilingual documents accurately, with provenance that resolves.** The second — that generation plus
layout yields artifacts an architect accepts without touching them — is Phase 3+.

**Phase 2 delivers no generation.** See §7.

---

## 2. Approved slices

### V0 — Phase 2 foundation ✅ **COMPLETE** (`8f2a665`)

Delivered:

- compiled TypeScript build toolchain ([ADR-0036](../adr/ADR-0036-build-toolchain.md))
- NestJS composition layer ([ADR-0034](../adr/ADR-0034-nestjs-application-layer.md))
- PGlite persistence ([ADR-0035](../adr/ADR-0035-persistence-plain-sql-pglite.md))
- governance migration
- repository implementations
- development BlobStore
- architecture and verification updates

Spike **S7** resolved: Prisma is not viable over PGlite; PGlite 0.5.6 is PostgreSQL 18.3 and passed
15 of 15 fidelity checks. See [phase-2-status.md](phase-2-status.md) for detail.

### V1 — Text intake and provenance end to end ✅ **COMPLETE** (`922761a`)

The first slice in which the Phase 1 provenance machinery gets a real consumer.

Scope:

- ingest guard
- type sniffing by magic bytes
- size limits
- SHA-256 deduplication
- immutable blob storage
- free-text and Markdown adapters
- `Source` / `SourceUnit` / `EvidenceItem` schemas
- migration `002`
- source inventory
- human-set authority ranking
- resolvable provenance anchors
- source-viewer API with highlight ranges, including RTL Arabic spans
- L0 ingestion validation rules

The L0 ingestion rules already exist as specification —
[`L0-ING-001` … `L0-ING-010`](../40-quality/validation-rule-catalog.md) — so V1 implements a
catalogued rule set rather than defining a new one. `L0-ING-002` and `L0-ING-003` (anchor
resolvability) are **errors** at G1; an unresolvable anchor is therefore a hard failure, not a
warning.

V1 required **no new decisions and no new dependencies**. Delivered as specified; see
[phase-2-status.md](phase-2-status.md) §3.

---

## 3. V2 — approved boundary, with a proposed revision

The V2 boundary was **approved on 2026-08-23** and is recorded verbatim in §3.1.

**§3.4 splits it** into **V2 (DOCX)** and **V2-PDF** — approved on 2026-08-23 as a sequencing
decision only. Nothing was removed from the approved capability: every item in §3.1 is still to be
built, and **V2-PDF remains part of Phase 2**.

### 3.1 In scope — as approved

| # | Item | Notes |
|---|---|---|
| 1 | **`TextExtractor` abstraction** | **A3** |
| 2 | **`PageRasteriser` abstraction** | **A3** |
| 3 | **PDF adapter** — extract textual content where reliably available; preserve page-level source structure; assess extraction quality/confidence **per page**; **mark** pages requiring vision fallback | **No vision model call is executed in V2** |
| 4 | **DOCX adapter** — extract canonical textual content; preserve meaningful document structure and provenance; create resolvable anchors back to the source | |
| 5 | **Page rasterisation** — rasterise PDF pages **when required by the extraction/provenance architecture**; store through BlobStore; add `PageImage` schema/table **where required** | |
| 6 | **Provenance** — `pdf_region` anchors with rectangle lists **where appropriate**; preserve page references; preserve source checksum/resolution guarantees; extracted canonical text stays traceable to the original binary document | |
| 7 | **Validation** — wire the applicable existing L0-ING rules, **including `L0-ING-005`, `L0-ING-007` and `L0-ING-008`**, to actual binary-document data. Unresolved or invalid provenance continues to follow the **approved catalogue severities** | |
| 8 | **Arabic/English** — preserve Unicode correctness; test Arabic and mixed Arabic/English PDF **and** DOCX content; **document extraction limitations where exact fidelity is not achievable** | |

### 3.2 Out of scope for V2

Live vision-model calls · image or diagram semantic interpretation · **spreadsheet ingestion** ·
BPMN/DMN structural import · AI requirements-analysis passes · RAF generation · structured
requirement generation · Process IR · BPMN/DMN/Form generation.

**Spreadsheet ingestion remains a separate proposed capability** and must not be folded into V2
unless a **demonstrated dependency** requires it. None has been demonstrated.

### 3.3 What is blocked, and what is not

| Portion | State |
|---|---|
| **PDF-specific work** — items 3, 5, most of 6, and `L0-ING-007`/`008` | **BLOCKED.** Requires spike S2 completed ([s2-corpus-request.md](s2-corpus-request.md)) and [ADR-0037](../adr/ADR-0037-binary-document-extraction.md) approved. `@embedpdf/pdfium` **must not be added** before then |
| **DOCX and the abstractions** — items 1, 2, 4, the DOCX half of 6, `L0-ING-005`, and item 8 for DOCX | **NOT blocked.** Needs no new dependency and no open decision |

DOCX is unblocked for a structural reason rather than a convenient one: **a DOCX stores text in
logical order by construction**, so the question S2 exists to answer does not arise for it. There is
no ordering to reconstruct and no confidence to assess.

### 3.4 APPROVED — V2 split into V2 and V2-PDF

> **Approved 2026-08-23. Sequencing only.** Nothing is added to or removed from the approved scope;
> every item in §3.1 still gets built, and V2-PDF stays inside Phase 2.

**Rationale.** S2 needs 2–3 representative Arabic PDFs from outside the team. That has no committed
date, and the pre-registered decision rule in
[s2-corpus-request.md](s2-corpus-request.md) §6 includes an outcome — yield below 50% — under which
the PDF design changes materially. Building PDF intake before that number exists would risk building
the wrong thing; waiting to start *anything* would idle a slice that has no dependency on the answer.

| Slice | Scope | Dependencies | State |
|---|---|---|---|
| **V2 — Document intake (DOCX)** | `TextExtractor` port · `PageRasteriser` port *(port only, no implementation)* · DOCX adapter · `docx_block` anchors · guard admits OOXML · `L0-ING-005` wired to real documents · Arabic and mixed Arabic/English DOCX tested | **None added.** `node:zlib` provides inflate | ✅ **COMPLETE** — see [phase-2-status.md](phase-2-status.md) §4 |
| **V2-PDF — PDF intake** | PDF adapter · per-page confidence and vision-fallback marking · page rasterisation · `PageImage` schema and table · `pdf_region` anchors with rectangle lists · `L0-ING-007` and `L0-ING-008` wired · Arabic PDF limitations documented | S2 complete · ADR-0037 approved · one new runtime dependency | **Blocked** |

**Why the `PageRasteriser` port still lands in V2:** A3 approved the abstraction, and defining it
early keeps the DOCX adapter honest about where it sits. It gets no implementation, because nothing
can rasterise without a PDF engine and nothing consumes a page image until V3.

**One consequence, now handled:** the V1 ingest guard refused PDF with a message naming *"V2"* as
the slice that would parse it. That became untrue with the split, so V2 corrected it to **V2-PDF**
and a test asserts it. A stale refusal message is a small thing that tells a user something false.

### 3.5 Provisional capability sequence — V3–V7

> **PROVISIONAL.** The current *planned* capability sequence, not a record of approved slice
> boundaries. Each requires **refinement and explicit approval before it begins**, and the
> boundaries may be re-cut. No implementation commitment is made here.

| Slice | Capability |
|---|---|
| **V3** | Multimodal and structural source intake |
| **V4** | AI analysis passes |
| **V5** | Structured requirement model and epistemic handling |
| **V6** | Conflicts, precedence and coverage |
| **V7** | Human requirements workspace and G1 approval |

Detailed scope is deliberately **not** stated for V3–V7. The governing capability descriptions
already exist and should be read from their own documents rather than paraphrased here:

| For | Read |
|---|---|
| V2, V3 | [roadmap.md](roadmap.md) P1; [ADR-0021](../adr/ADR-0021-data-classification-egress-policy.md); **A3** (§4) |
| V4 | [roadmap.md](roadmap.md) P2; [ai-provider-abstraction.md](../10-architecture/ai-provider-abstraction.md); [ADR-0022](../adr/ADR-0022-capability-negotiation.md) |
| V5 | [requirement-analysis-frame.md](../20-domain/requirement-analysis-frame.md); [epistemic-model.md](../20-domain/epistemic-model.md); [ADR-0007](../adr/ADR-0007-epistemic-ladder.md), [ADR-0011](../adr/ADR-0011-computed-confidence.md) |
| V6 | [ADR-0012](../adr/ADR-0012-deterministic-conflict-precedence.md); [traceability-model.md](../20-domain/traceability-model.md) |
| V7 | [governance-and-gates.md](../50-governance/governance-and-gates.md); [ADR-0017](../adr/ADR-0017-approval-as-baseline-signature.md) |

### Sequencing constraints that are structural, not planning choices

These follow from the architecture rather than from a slice plan, and hold however V2–V7 are cut:

```
V0 ──▶ V1 ──▶ ( V2 ──▶ V3 )
        │                │
        └───────▶ V4 ◀───┘        text analysis needs V1 only;
                  │               image evidence needs V3
                  ▼
                 V5 ──▶ V6 ──▶ V7
```

| Constraint | Why it is structural |
|---|---|
| Nothing is analysed before it can be anchored | [ADR-0008](../adr/ADR-0008-resolvable-anchors.md): provenance is a precondition, not an addition |
| Analysis consumes `SourceUnit`s, never raw blobs | The anchor is the unit of citation |
| Requirements are built from evidence, not from sources | [ADR-0007](../adr/ADR-0007-epistemic-ladder.md): L1 precedes L2 |
| Conflict precedence needs the authority ranking set in V1 | [ADR-0012](../adr/ADR-0012-deterministic-conflict-precedence.md): precedence derives from a human ranking |
| G1 cannot be reached while conflicts are unresolved | [governance-and-gates.md](../50-governance/governance-and-gates.md) |
| Rasterisation must exist before page images can be analysed | **A3** (§4) |

**Spike dependency:** **S2 (Arabic PDF) gates PDF intake.** A first pass ran on synthetic fixtures
([ADR-0037](../adr/ADR-0037-binary-document-extraction.md) §2) and could not produce the deciding
yield number; the material and protocol needed to finish it are specified in
[s2-corpus-request.md](s2-corpus-request.md). S2 does **not** gate DOCX (§3.3). S5/S6 (provider abstraction, egress
gate) were resolved in Phase 1 and gate V4.

---

## 4. Approved decisions A1–A7

All seven are **approved and binding**.

### A1 — NestJS · **Approved**

Adopt NestJS as the Phase 2 application/API composition layer.

- Domain and application logic remain **framework-independent**.
- NestJS controllers **parse, delegate and map**, and **must not contain business logic**.

Recorded as [ADR-0034](../adr/ADR-0034-nestjs-application-layer.md), conditions N1–N5. Enforced by
the `nest-confinement`, `nest-domain-purity` and `controller-thinness` checker rules, and by
`erasableSyntaxOnly` outside `apps/api`.

### A2 — PGlite · **Approved**

Use PGlite as the **development** persistence adapter while Docker/PostgreSQL is unavailable.

- **PostgreSQL remains the production persistence target.**
- Persistence remains **behind repository/adapter abstractions**.

Recorded as [ADR-0035](../adr/ADR-0035-persistence-plain-sql-pglite.md).

### A3 — PDF rasterisation and extraction fallback · **Approved**

Use:

- a **`TextExtractor` abstraction**
- a **`PageRasteriser` abstraction**
- **text extraction first**
- **confidence/quality-driven, per-page fallback to vision**

**Do not send every PDF page to vision unnecessarily.**

**Page-level provenance is preserved regardless** of whether the evidence came from direct text
extraction or from vision.

This is the operative decision for V2/V3 and is consistent with
[ADR-0022](../adr/ADR-0022-capability-negotiation.md) (declared degradation, never silent) and with
rules `L0-ING-007` and `L0-ING-008`, which require vision-read pages and low-confidence Arabic
reordering to be **recorded as such**.

### A4 — New dependencies · **Approved with controls**

| Control |
|---|
| **Pin** dependency versions |
| Maintain a **dependency manifest** |
| **Document** significant dependencies and their purpose |
| **Avoid unnecessary** dependencies |
| **Preserve architecture-checker constraints** |
| **Raise material framework/runtime dependencies for review** |

A material framework or runtime dependency is not an implementation detail — it is a decision, and it
goes through review before adoption, as NestJS did under A1.

### A5 — Prisma / PGlite · **Approved as a spike-first decision**

Prisma was gated on a spike proving compatibility with PGlite. **Spike S7 proved Prisma is not
viable with PGlite** — no driver adapter exists, official or community.

The **implemented** decision is therefore:

- **plain parameterised SQL**
- **explicit PostgreSQL-compatible migrations**
- **persistence abstraction retained**
- **PGlite development adapter**
- **PostgreSQL production target**

Recorded as [ADR-0035](../adr/ADR-0035-persistence-plain-sql-pglite.md). Enforced by the
`sql-injection-guard` and `persistence-confinement` checker rules.

### A6 — Development BlobStore · **Approved**

Use the **BlobStore port with a filesystem-backed local development adapter**.

**Domain and application logic must not depend directly on filesystem paths.** MinIO remains the
deployed target.

### A7 — Live AI in CI · **Approved: NO live AI calls in normal CI**

- Normal CI uses **deterministic recorded/replay fixtures**.
- **Live AI evaluation is a separate, explicitly triggered capability**, and is **not** part of
  normal deterministic CI pass/fail.

This makes CI reproducible and provider-independent, and it means a provider outage or a model
revision can never turn the build red. It is consistent with
[ADR-0031](../adr/ADR-0031-corpus-as-data.md) and with the Phase 1 evaluation harness, which
computes metrics from recordings with no network.

---

## 5. Consolidated current acceptance criteria

> **Consolidated, not historical.** The original wording of the Phase 2 acceptance criteria is not
> recoverable from repository evidence, so it is not reproduced. The set below is **derived from
> existing approved ADRs, the validation rule catalogue, and the roadmap**, and every criterion
> names its source. It is the current criteria set; it is not presented as an approved original.

| # | Criterion | Traces to |
|---|---|---|
| 1 | **Every anchor resolves.** Given an anchor and the stored source, the exact region is returned and the quote checksum verifies. Offsets are Unicode code-point indices over NFC, logical-order text. Unresolvable = **hard error** | [ADR-0008](../adr/ADR-0008-resolvable-anchors.md); [provenance-and-anchoring.md](../20-domain/provenance-and-anchoring.md) A1, A3, A4, A7; `L0-ING-002`, `L0-ING-003` |
| 2 | **No requirement without provenance.** Every requirement cites evidence or is explicitly marked as inference. There is no third case | [ADR-0004](../adr/ADR-0004-ai-proposes-code-commits.md); [traceability-model.md](../20-domain/traceability-model.md) |
| 3 | **Epistemic level and computed confidence** are carried on every item. Confidence is **computed**, never provider-reported. Per-source-type ceilings apply | [ADR-0007](../adr/ADR-0007-epistemic-ladder.md), [ADR-0011](../adr/ADR-0011-computed-confidence.md); [epistemic-model.md](../20-domain/epistemic-model.md) |
| 4 | **Bilingual correctness.** Arabic and English round-trip byte-exact; highlighting correct in both reading directions including mixed and non-BMP text; ordering and comparison use **application-side match forms**, never database collation | [ADR-0023](../adr/ADR-0023-unicode-bilingual-architecture.md), [ADR-0024](../adr/ADR-0024-ascii-identifiers-unicode-names.md); [ADR-0035](../adr/ADR-0035-persistence-plain-sql-pglite.md) §5; `L0-ING-004` |
| 5 | **Egress is enforced at the transport boundary.** A `RESTRICTED` payload cannot reach an external adapter, asserted at the boundary rather than by policy review. Every source carries a classification | [ADR-0021](../adr/ADR-0021-data-classification-egress-policy.md); [data-governance.md](../10-architecture/data-governance.md); `L0-ING-006` |
| 6 | **Provider neutrality holds, and degradation is declared.** No vendor concept is load-bearing; every degradation is recorded on the proposal and propagated into confidence. No silent degradation | [ADR-0020](../adr/ADR-0020-ai-provider-abstraction.md), [ADR-0022](../adr/ADR-0022-capability-negotiation.md); checker rule `vendor-sdk-leak` |
| 7 | **Vision has no silent fallback.** Text extraction runs first with per-page, quality-driven fallback to vision; vision-read pages are recorded as such; page-level provenance survives either path. If no vision capability exists, image evidence is **refused with a named degradation** | **A3** (§4); [ADR-0022](../adr/ADR-0022-capability-negotiation.md); [open-decisions.md](open-decisions.md) OD-1; `L0-ING-007`, `L0-ING-008` |
| 8 | **Conflict precedence is deterministic**, derived from the human-set authority ranking, and unresolved conflicts **block G1**. The human always decides | [ADR-0012](../adr/ADR-0012-deterministic-conflict-precedence.md); [governance-and-gates.md](../50-governance/governance-and-gates.md); `L0-ING-010` |
| 9 | **Approval integrity.** Only humans approve; approval is a signature over `(baselineHash, validationRunId)` and is invalidated automatically when either changes | [ADR-0007](../adr/ADR-0007-epistemic-ladder.md), [ADR-0017](../adr/ADR-0017-approval-as-baseline-signature.md) |
| 10 | **L0 blocking semantics hold.** `L0-ING-001 … L0-ING-010` are implemented with their catalogued severities; an ERROR blocks G1 structurally, not by convention | [ADR-0026](../adr/ADR-0026-static-validation-first.md); [validation-architecture.md](../40-quality/validation-architecture.md); [validation-rule-catalog.md](../40-quality/validation-rule-catalog.md) |
| 11 | **Durability and immutability.** State survives a full restart; stored evidence is immutable and content-addressed; evidence and audit tables are insert-only/append-only, enforced in SQL as well as in code | [ADR-0016](../adr/ADR-0016-immutable-content-addressed-artifacts.md), [ADR-0032](../adr/ADR-0032-retain-everything.md), [ADR-0035](../adr/ADR-0035-persistence-plain-sql-pglite.md) §7 |
| 12 | **Verification is deterministic and complete.** Build, `check:arch`, checker self-test, `check:docs` and tests all pass with **no skipped or suppressed tests**, and **no live AI call occurs in normal CI** | **A7** (§4); [ADR-0036](../adr/ADR-0036-build-toolchain.md); [ADR-0031](../adr/ADR-0031-corpus-as-data.md); [phase-0-tasks.md](phase-0-tasks.md) A3/A5 |

Criteria 1–4 and 10–12 are exercisable from V1. Criteria 5–9 become exercisable from V4 onward.

---

## 6. Standing decisions carried into Phase 2 — approved

### 6.1 Docker-deferred items

Docker is unavailable. Each item is deferred **with a named trigger**, not dropped
([infra/README.md](../../infra/README.md);
[ADR-0035](../adr/ADR-0035-persistence-plain-sql-pglite.md) §Decision 6).

| Deferred | Trigger to revisit |
|---|---|
| PostgreSQL container; the PGlite → PostgreSQL adapter swap | Docker availability |
| **ICU collation behaviour** — accepted in DDL by PGlite but **inert**; Alef variants do not sort adjacently | Docker availability |
| `pgvector` for near-duplicate detection | Docker availability |
| Image build, layer caching, Compose start-up ordering and health gating | Docker availability |
| MinIO object store; bucket bootstrapping | Docker availability |
| OIDC development identity provider; Keycloak realm import | Docker + the IdP decision |
| Durable job queue | PostgreSQL availability |

The collation gap **independently confirms**
[ADR-0023](../adr/ADR-0023-unicode-bilingual-architecture.md): bilingual ordering and comparison use
application-side match forms from `@asdp/text`. The migrations declare no collation at all, and a
test asserts it.

### 6.2 AI provider decision

- **Provider-neutral by construction** ([ADR-0020](../adr/ADR-0020-ai-provider-abstraction.md)). No
  vendor concept may become load-bearing; enforced by the `vendor-sdk-leak` checker rule.
- **Three adapters exist** — external, generic private-endpoint, and null — each behind the
  `AiProvider` port with capability negotiation
  ([ADR-0022](../adr/ADR-0022-capability-negotiation.md)).
- **All transports are still injected stubs.** Shape, capabilities, routing, degradation and egress
  guards are tested without any network call.
- **Normal CI makes no live AI call** (**A7**). Live evaluation is separately triggered.
- **Live transport selection remains OD-1.** It blocks Phase 2 *quality measurement*, not Phase 2
  implementation.
- Claude API is **one adapter**, never the architecture.

### 6.3 Multimodal and vision requirement

Multimodal intake is a **headline capability**, not an enhancement: screenshots, diagram images,
scanned documents and process diagrams are primary evidence types.

**Vision is the one capability with no degradation path** — it cannot be synthesised from a
text-only model. Therefore:

- extraction is **text-first**, with per-page quality-driven fallback to vision (**A3**)
- vision is **not** applied to every page indiscriminately (**A3**)
- **page-level provenance is preserved on either path** (**A3**)
- vision-read pages are **recorded as such**, and a confidence ceiling applies (`L0-ING-007`)
- if the configured provider lacks vision, image evidence is **refused with a named degradation**,
  never silently downgraded
- a fully air-gapped environment with no vision-capable model is a **scope consequence** — it
  removes a headline capability, and that must be visible early (OD-1;
  [open-decisions.md](open-decisions.md) §4.1)

Diagram-image extraction is capped at **L2** with element-wise human confirmation, because confident
wrong extraction from diagrams is a named high risk (R5).

### 6.4 Corpus and evaluation approach

- **Corpus is data, not code** ([ADR-0031](../adr/ADR-0031-corpus-as-data.md)).
- Phase 2 proceeds on **synthetic and clearly-labelled representative corpora**. Synthetic-only
  metrics are labelled and down-weighted.
- **Real or sanitised ASDP material is required eventually** (OD-7). Phase 2 is where prompt work
  starts compounding, so if nothing real is available by V4, **escalate** rather than tune against
  synthetic material.
- The evaluation harness runs **record/replay with no network**, so metrics are reproducible. This
  is the mechanism by which **A7** holds.
- Provenance metrics are **defect detectors**, not scores: an anchor that does not resolve is a bug,
  not a low number.
- Over-fitting to synthetic material is a named risk (R14); the mitigation is a full prompt-history
  re-run when real material arrives.

---

## 7. Explicitly out of scope for Phase 2 — approved

**Not started, by instruction.** Attempting any of these is scope creep against named critical risk
R11 — drifting toward becoming Camunda Modeler.

| Out of scope | Belongs to |
|---|---|
| **BPMN generation** | Phase 3+ (roadmap P4) |
| **DMN generation** | Phase 3+ (roadmap P4) |
| **Form generation** | Phase 3+ (roadmap P4) |
| **Process IR compilation** | Phase 3+ (roadmap P4) |
| **Graphical process designer** | **Never** — it reverses [ADR-0001](../adr/ADR-0001-requirements-driven-product-boundary.md) and [ADR-0003](../adr/ADR-0003-no-override-editor.md) |

Also out of scope for Phase 2: the Specification Studio and BPS editor (roadmap P3), the viewer
framework (P5), the interface registry and full L0–L6 rule packs (P6), packaging and handoff (P7),
divergence (P8).

Structural import of legacy BPMN/DMN in V3 is **intake of evidence** — not generation, and not
editing. An imported file is never rendered as an editable artifact.

---

## 8. Working rule

**No slice begins without explicit approval**, and for V2–V7 that includes approving the slice
boundary itself, not only the go-ahead. When a slice completes, report and stop.

See [CLAUDE.md](../../CLAUDE.md) §11 and the current state in
[phase-2-status.md](phase-2-status.md).
