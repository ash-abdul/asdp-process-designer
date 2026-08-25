# Phase 2 — Implementation Plan

> **Status:** **PHASE 2 CLOSED / ACCEPTED 2026-08-24** — [phase-2-status.md](phase-2-status.md) §16. V0–V7 accepted, plus hardening slices **H4** and **H5**. V4b-eval deferred (blocked by H3) · V2-PDF blocked · **Version:** 5.0 · **Updated:** 2026-08-24
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
| **Provisional** | The current planned capability sequence. **Not historically approved.** Requires approval before the slice begins, and may be refined or re-cut | §3.7 (V4–V7) |
| **Consolidated** | Derived from existing approved ADRs and roadmap documents, presented as the current criteria set. Every item is traceable to its source. **Not an original approved wording** | §5 |

The exact original V2–V7 slice boundaries and the exact original wording of the Phase 2 acceptance
criteria were never durably recorded. They are **not** reconstructed here as historical fact.
**The V2 and V3 boundaries were approved explicitly on 2026-08-23**, and are recorded in §3.1 and
§3.6. §3.7 carries capability names only for V4–V7, and §5 is derived from sources that do exist.

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

## 3. V2, V3, V4 and V4b — approved boundaries

The V2 boundary was **approved on 2026-08-23** and is recorded verbatim in §3.1. The **V3** boundary
was approved the same day and is in §3.6; the **V4** boundary — split into **V4a** and **V4b** — was
approved on the same day and is in §3.8. **V4b** — split into **V4b-core** and **V4b-eval** — was
approved on the same day and is in §3.9.

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

### 3.5 Retired — the one-line V3 entry

A single line describing V3 stood here before the boundary was proposed and approved. It was
replaced by **§3.6**, which is where the approved V3 boundary now lives. The heading is kept as a
marker rather than renumbered, because §3.6 is referenced by
[phase-2-status.md](phase-2-status.md) §0 and by [v3-proposal.md](v3-proposal.md), and a silent
renumber would turn two live references into wrong ones.

### 3.6 V3 — approved boundary ✅ **ACCEPTED 2026-08-23**

**Approved 2026-08-23** as an **evidence-ingestion slice only**, and implemented at commit
`dc2e683` and **accepted at `bea4041`**. Delivered state:
[phase-2-status.md](phase-2-status.md) §5; acceptance corrections: §5.9; checkpoint: §0. Full rationale and design in
[v3-proposal.md](v3-proposal.md); the governing decision on provenance is
[ADR-0038](../adr/ADR-0038-target-versus-content-verification.md).

**Three in-scope items are deferred to V4 by decision D6** — see below. The accepted V3 boundary is
therefore the intake, provenance, ceiling, import, egress, replay and audit work; **not** the first
requirements-analysis consumer of the AI broker.

**Acceptance was explicitly not held on limitations 43 and 44.** They are recorded as hardening
candidates **H1** and **H2** in [phase-2-status.md](phase-2-status.md) §5.12 — proposed, not
approved, and needing a boundary like any other slice.

#### In scope

PNG/JPEG/WEBP/GIF/BMP intake · `PageImage` schema and table · `VisionExtractor` port · Claude
vision transport **through the AI Provider Abstraction** · `image_region` provenance ·
image-specific confidence ceilings · screenshot and diagram-image intake · **structural BPMN/DMN/Form
import as evidence** · `L0-ING-007` wired to real visual evidence · AI-interaction audit ·
record/replay fixtures for **every** AI call · sanitised or synthetic images for development wherever
an external provider is called.

#### Out of scope

Semantic conversion of diagrams into process structure · RAF generation · business-requirement
interpretation · Process IR · BPMN/DMN/Form generation · **PDF support** · **spreadsheet support** ·
editing imported structural models.

#### The preserved rule

> **If deterministic extraction can produce the evidence, do not invoke AI.**

Not a performance preference: a deterministic reader is reproducible and its output is verifiable
against the stored bytes, and neither is true of a model.

#### Approved decisions D1–D6

| # | Decision | Outcome |
|---|---|---|
| **D1** | Non-text provenance | **Approved and implemented.** Target verification and content verification are separate axes; visual evidence supports only the first; a distinct resolution state `content_unverified` is introduced and `resolved` is **not** reused. Recorded as [ADR-0038](../adr/ADR-0038-target-versus-content-verification.md) |
| **D2** | Live AI transport | **Approved: plain `fetch`** behind the existing adapter boundary. The Anthropic SDK is **not** introduced for convenience. Provider-specific transport stays isolated so it can be replaced |
| **D3** | Structural import parsing | **Approved: reuse the existing deterministic XML tokeniser.** Imported content is evidence only, under the five absolutes in [v3-proposal.md](v3-proposal.md) §5 |
| **D4** | Confidence ceilings | **Approved as deterministic functions** of evidence kind and extraction method, **not** stored columns. Semantics verified against the epistemic ladder — see below |
| **D5** | Live AI in tests | **Approved.** A mechanical checker rule prevents live transport in normal tests and CI. Live evaluation stays explicitly invoked and outside pass/fail. **Enforcement clarified 2026-08-23:** the rule bars **network egress to a provider**, not the transport module — a test may construct the transport **only** with an injected fetch double, may not inject the real global `fetch`, may not read a provider API key and may not name a real provider endpoint. The decision is unchanged; the first implementation banned the factory outright, which also banned the offline shape test the transport exists to support and left the vendor surface untested. **A7** wants CI reproducible, not blind |
| **D6** | Deferral of V3 in-scope items 4, 9 and 10 to V4 | **Approved 2026-08-23 at the V3 acceptance review.** The live-transport **wiring** through the broker, **recorded** replay fixtures, and **persistence** of the AI-interaction record are broker-consumer and evaluation-fixture work. Each needs V4's first requirements-analysis consumer to be exercisable against anything real: wiring a consumer with no consumer tests the wiring against itself, and a recording cannot be captured before a call is made ([ADR-0031](../adr/ADR-0031-corpus-as-data.md)). Delivered state and the exact seam: [phase-2-status.md](phase-2-status.md) §5.10 |

#### Epistemic semantics — confirmed, and one correction

The mandated consistency check against
[epistemic-model.md](../20-domain/epistemic-model.md),
[provenance-and-anchoring.md](../20-domain/provenance-and-anchoring.md) and
[traceability-model.md](../20-domain/traceability-model.md) **changed the reasoning** behind the
ceilings, though not the ceilings themselves:

1. **L1 permits AI extraction.** epistemic-model.md §1 defines L1 as created by *"AI extraction or
   deterministic parser"*. So the cap **cannot** rest on "an AI read it". The V3 proposal's original
   reasoning was wrong on this point.
2. **What disqualifies visual evidence from L1 is the anchor, not the author.** L1 requires a
   *resolvable* anchor; for an image only the target resolves.
3. **The cap was already approved in Phase 0.** provenance-and-anchoring.md §5 states that `page`
   and `document` precision are *"permitted only for L2/L3 content, never for L1 evidence"*, and
   `image_region` is `page` precision. V3 implements an existing rule rather than inventing one.
4. **No L2 → L1 promotion exists or is created.** Human element-wise confirmation satisfies the
   confirmation requirement that lets L2 proceed toward L4; it does not turn an interpretation into
   an extracted fact.

**No new L-level meanings are introduced.** The ladder stays four levels.

#### Dependencies

**None.** `fetch` is built into Node 22 (**D2**); the XML tokeniser already exists (**D3**); image
dimensions are read from file headers with no library. Runtime dependencies remain at seven.

### 3.7 Provisional capability sequence — V4–V7



> **No slice remains provisional.** The current *planned* capability sequence, not a record of approved
> slice boundaries. Each requires **refinement and explicit approval before it begins**, and the
> boundaries may be re-cut. No implementation commitment is made here.
>
> **V4 is no longer provisional:** its boundary was approved on 2026-08-23 and is recorded in §3.8.
> **V5 is no longer provisional either:** its boundary was approved on 2026-08-23 with decisions
> **J1–J9** and is recorded in §3.10. **Nor is V6:** its boundary was approved on 2026-08-23 with
> decisions **Q1–Q9** and is recorded in §3.11. **Nor is V7:** its boundary was approved on
> 2026-08-23 with decisions **U1–U10** and is recorded in §3.12.

| Slice | Capability |
|---|---|
| **V4** | AI analysis passes — **split and no longer provisional**: **V4a accepted** (§3.8), **V4b-core accepted / V4b-eval deferred** (§3.9) |
| **V5** | Structured requirement model and epistemic handling — **boundary APPROVED 2026-08-23**, §3.10 |
| **V6** | Conflicts, precedence and coverage — ✅ **ACCEPTED 2026-08-23**, §3.11. **J2** confirmed conflict detection, `Conflict` records, `CANONICALISE_ENTITIES`, `RECONCILE_SOURCES` and deterministic precedence here |
| **V7** | Human requirements workspace and G1 approval — **boundary APPROVED 2026-08-23**, §3.12. **J4** confirmed no approval route exists before it, and **J1** deferred L3 to it |

**Two re-cuts of this sequence were approved with V5** and are recorded so the sequence is not read
as untouched: **J3-a** moves *deterministic RAF coverage arithmetic* from V6 into V5 (assessment of
the populated frame, explicitly not reconciliation), and **J6** adds the `L1-REQ-*` rule namespace to
the validation catalogue. Conflicts themselves did **not** move.

Detailed scope is deliberately **not** stated for V4–V7. The governing capability descriptions
already exist and should be read from their own documents rather than paraphrased here:

| For | Read |
|---|---|
| V2, V3 | [roadmap.md](roadmap.md) P1; [ADR-0021](../adr/ADR-0021-data-classification-egress-policy.md); **A3** (§4) |
| V4 | [roadmap.md](roadmap.md) P2; [ai-provider-abstraction.md](../10-architecture/ai-provider-abstraction.md); [ADR-0022](../adr/ADR-0022-capability-negotiation.md) |
| V5 | [requirement-analysis-frame.md](../20-domain/requirement-analysis-frame.md); [epistemic-model.md](../20-domain/epistemic-model.md); [ADR-0007](../adr/ADR-0007-epistemic-ladder.md), [ADR-0011](../adr/ADR-0011-computed-confidence.md) |
| V6 | [ADR-0012](../adr/ADR-0012-deterministic-conflict-precedence.md); [traceability-model.md](../20-domain/traceability-model.md) |
| V7 | [governance-and-gates.md](../50-governance/governance-and-gates.md); [ADR-0017](../adr/ADR-0017-approval-as-baseline-signature.md) |

### 3.8 V4 — approved boundary (V4a, ✅ **ACCEPTED 2026-08-23**) and approved shape (V4b)

**Approved 2026-08-23.** V4 is **split**: **V4a — AI Broker and Live-Path Foundation** is approved,
implemented and **ACCEPTED** — delivered state in [phase-2-status.md](phase-2-status.md) §6, and the
scope of that acceptance in §6.0: **the foundation, explicitly not extraction quality**; **V4b — AI Evidence Extraction** is approved in shape only and does not begin
until V4a is reviewed and accepted. Full boundary, acceptance criteria and the recorded E2 conflict
are in [v4-proposal.md](v4-proposal.md).

V4a is the first slice in which AI reads a document in this product, and it **makes no substantive
requirements claim**: its acceptance proves the chain — source → broker → governed live/replay
provider → structured response → `ai_interaction` audit → deterministic replay.

| V4a in scope | Discharges |
|---|---|
| Wire the real broker consumer through the AI Provider Abstraction | **D6** item 4 |
| `PROFILE_SOURCE` as the first low-risk end-to-end pass | roadmap P2 |
| `ai_interaction` persistence — provider, model, capabilities used, prompt version, classification, egress decision, degradation state, tokens and cost, timestamps, correlation ids | **D6** item 10 |
| The explicitly invoked live path; **`npm run verify`, tests and CI never invoke a live provider** | **A7**, **A8** |
| The first deterministic recorded/replay fixtures through `@asdp/eval` | **D6** item 9 |
| Cost, prompt version and degradation metadata on every interaction | ADR-0011, ADR-0022 |
| All approved egress controls preserved | ADR-0021 |
| An initial evaluation baseline — **E5** | ADR-0031 |

**Out of scope for V4a:** `EXTRACT_EVIDENCE`, post-hoc citation verification, RAF population,
structured requirements, `RECONCILE_SOURCES`, conflict precedence, clarification questions, G1,
Process IR, generation, PDF, spreadsheets, and the **H1/H2** hardening candidates.

#### Approved decisions E1–E5

| # | Decision | Outcome |
|---|---|---|
| **E1** | Live AI data | **Approved.** Live external calls in development may use **only** synthetic, sanitised, or `PUBLIC`/`INTERNAL` evidence where policy permits. `CONFIDENTIAL`, `RESTRICTED` and `PROHIBITED` material must **not** go to an external provider merely for development. **Stricter than** [ADR-0021](../adr/ADR-0021-data-classification-egress-policy.md), enforced at the same transport boundary. A private-endpoint decision stays a deployment matter (**OD-1**) |
| **E2** | Multi-match quotes | **Approved, and RESOLVED 2026-08-23.** Reject unless deterministic locating information uniquely identifies the occurrence; never select one arbitrarily; never let document-level demotion make an ambiguous AI claim eligible for requirement generation. Resolved by distinguishing **general source citation** (demotion survives) from an **AI-extracted `EvidenceItem` intended for downstream requirement analysis** (rejected). [provenance-and-anchoring.md](../20-domain/provenance-and-anchoring.md) **§4.4, revision 1.1** records the specification change as a change. **Applies from V4b** — V4a locates no quotes |
| **E3** | AI-extracted evidence | **Approved.** Automatic persistence only when the output validates, the anchor is **independently verified**, and provenance rules pass. Persisted AI evidence stays **explicitly AI-derived** and never automatically becomes an approved requirement, RAF item or BPS element — human approval remains a later gate ([ADR-0004](../adr/ADR-0004-ai-proposes-code-commits.md), [ADR-0007](../adr/ADR-0007-epistemic-ladder.md)) |
| **E4** | Chunking | **Approved** for over-context sources, under six requirements: deterministic and versioned strategy · `ai_interaction` records full-versus-chunked · chunk ids and source ranges retained · degradation explicitly recorded · confidence accounts for it · **never silent**. `chunked_context` already carries a declared **0.15** confidence penalty. **V4a implements the record; the algorithm is V4b, and an over-context source is refused by name until then** |
| **E5** | Evaluation baseline | **Approved.** V4 is **not** successful merely because the call and the schema work. Measured where ground truth permits: extraction precision and recall, citation/provenance validity, schema validity, hallucinated-evidence rate, degradation behaviour, reproducibility from fixtures. Initial corpus is synthetic or sanitised with its limitations stated — already mechanical via `CorpusTier` weighting, `buildReport`'s tier requirement and ADR-0031 rule 4. For V4a's single pass the extraction metrics are reported **not-applicable**, not omitted |

**ADRs required for V4a: none.** Every item implements an approved decision; the item-by-item check
is in [v4-proposal.md](v4-proposal.md) §3, along with the four changes that *would* need one.

**Dependencies added: none.** Runtime dependencies stay at seven.

### 3.9 V4b — approved boundary (V4b-core, ✅ **ACCEPTED 2026-08-23**) and deferred sequel (V4b-eval)

**Approved 2026-08-23.** V4b is **split** on its one external dependency: **V4b-core** is approved,
**implemented and accepted** — delivered state in [phase-2-status.md](phase-2-status.md) §7 and the
acceptance review in §7.10 — and needed **no credential**; **V4b-eval** is deferred until an approved
credential and **E1**-permitted material exist. Full boundary, decisions **F1–F5**, acceptance
criteria and the one behaviour change are in [v4b-proposal.md](v4b-proposal.md).

**V4b-core must not be blocked** on credentials or corpus availability (**F3**).

| V4b-core in scope |
|---|
| `EXTRACT_EVIDENCE` over V1/V2 textual `SourceUnit`s |
| Post-hoc citation verification |
| **Provenance §4.4 enforced**, including the `locateQuote` behaviour change (v4b-proposal.md §3) |
| The ambiguous-AI-evidence **rejection path**, recorded and countable |
| The **E3 persistence gate** — four conditions, all of them |
| **Confidence propagation** with degradations carried in |
| **Deterministic structural chunking** with recorded ranges, ids, overlap and declared degradation |
| The **degradation ladder** exercised end to end |
| **Gold-set evaluation** on a synthetic, human-labelled corpus |
| **Precision, recall, unsupported/hallucinated-evidence rate, citation validity** |
| Deterministic recorded/replay fixtures |

**Out of scope for V4b (both halves):** RAF population / `POPULATE_FRAME` · structured business
requirements · `RECONCILE_SOURCES` · conflict precedence · clarification-question generation · **the
human approval workspace** · G1 · Process IR · BPMN/DMN/Form generation · PDF · spreadsheets ·
**H1/H2**. In particular **no analyst resolution workflow** — a rejected extraction is recorded and
measurable, never queued (**F2**).

#### Approved decisions F1–F5

| # | Decision | Outcome |
|---|---|---|
| **F1** | Gold set | **Approved: initial human-controlled gold set.** Synthetic documents permitted, but expected `EvidenceItem`s must be **explicitly labelled**, ground truth **authored or reviewed by a human**, **AI-generated expected output is never authoritative**, every expected item carries its **expected source location**, and the **corpus tier is recorded**. V4b-eval adds analyst-labelled sanitised real material. **No real-world quality claim from the synthetic tier** |
| **F2** | Ambiguous extraction rejection | **Approved.** No analyst resolution workflow in V4b. A rejected item is **not persisted** as usable evidence; the **reason is recorded** in the AI-interaction/evaluation audit; enough is retained to **measure recall loss and diagnose**; the event is **never silently discarded**. A user-facing remediation queue belongs to the later human requirements workspace |
| **F3** | Live provider capture | **Approved: split.** V4b-core is fully replay-capable, needs **no credential**, keeps CI deterministic, and **is acceptable without a live provider**. V4b-eval carries real capture, real fixtures and model-quality evaluation, and requires an approved credential and **E1**-permitted corpus. **V4b-core is not blocked on either** |
| **F4** | Chunking | **Approved: structural first** — `SourceUnit`, section, heading-defined block, or other deterministic structure. **Only** when a single structural unit exceeds the provider limit may it be split by size, and then with deterministic **versioned** splitting, **controlled overlap**, recorded **source ranges**, **chunk ids** and **overlap**, declared `chunked_context`, and the degradation **propagated into confidence**. **Never chunk silently** |
| **F5** | AI evidence persistence | **Approved.** Automatic persistence only when the output **validates**, the citation **resolves uniquely** under §4.4, the anchor **verifies independently**, and applicable rules **pass**. Persisted items stay `extractedBy: 'ai'` with `aiInteractionId` and remain **AI-derived evidence** — never automatically RAF items, approved requirements, BPS elements or process design decisions. Those transitions belong to later analysis and review gates |

**ADRs required for V4b-core: none.** v4b-proposal.md §3 checks it item by item and names the one
**behaviour change** to Phase-1 code — `locateQuote` currently selects the *first* of several matches
when a hint is merely present, which §4.4 forbids outright.

**Dependencies added: none.** Runtime dependencies stay at seven.

### 3.10 V5 — approved boundary ✅ **APPROVED 2026-08-23**

**Approved 2026-08-23** with decisions **J1–J9**. Full boundary, rationale, data model, AI task
design, evaluation design and risks: [v5-proposal.md](v5-proposal.md) v0.2.

V5 is the first slice in which AI output stops being verbatim. V4b could verify its own output
completely — a quote is in the source or it is not. **V5 cannot**, and every decision below follows
from that.

```
EvidenceItem (L1, verbatim, anchored)
  → POPULATE_FRAME (six disjointness-closed passes)
    → Requirement PROPOSAL (L2, status draft, cites evidence, never approved)
      → RAF slot population · RequirementFlags · deterministic coverage
```

| V5 in scope |
|---|
| `POPULATE_FRAME` in **six disjointness-closed passes** through the V4a broker, replay-capable |
| `RequirementSet` · `Requirement` · `RequirementEvidenceLink` · `RequirementFlag` — migration `008_requirements` |
| The **shared proposal gate**: four conditions, used identically by the command and the evaluation |
| Deterministic evidence eligibility, slot legality and **disjointness** enforcement |
| Full traceability, re-verified at write time: proposal → link → evidence → verified anchor → source |
| Computed confidence, epistemic level and derivation — **never model-reported** |
| Deterministic duplicate collapse (identical normalised text **and** identical evidence set) |
| **RAF coverage computed on read** (**J3-a**, **J3-b**) |
| `L1-REQ-*` — five structural rules; quality signals stay `RequirementFlag`s (**J6**) |
| Rejection records retaining the **proposed text** and reason (**J9**, [ADR-0032](../adr/ADR-0032-retain-everything.md)) |
| Human-controlled **synthetic** gold set and an offline evaluation harness |

**Out of scope for V5:** L3 inferred requirements · conflict detection and `Conflict` records ·
`CANONICALISE_ENTITIES` · `RECONCILE_SOURCES` · precedence · clarification-question generation ·
`SYNTHESISE_QUESTIONS` · clarification queue · the human review workspace · G1 · requirement
approval · baselines and signatures · Process IR · BPMN/DMN/Form generation · graphical editing ·
V4b-eval · live provider evaluation · V2-PDF · spreadsheets · **H1**, **H2**, **H3**.

#### Approved decisions J1–J9

| # | Decision | Outcome |
|---|---|---|
| **J1** | Epistemic level | **Approved: grounded L2 only. No L3 inferred requirements.** A tightening beyond [epistemic-model.md](../20-domain/epistemic-model.md) §1, which permits L3 with a rationale — recorded as a choice, not as compliance. Each "beyond the evidence" case gets a **named destination** and none is silently discarded: no cited evidence → **reject**; model uncertainty → **pass limitation**; grounded but vague / actor-unknown / untestable / unverifiable → **persist with `RequirementFlag`s**; evidence states an assumption → **`assumptions` slot**; model invents its own assumption or best practice → **reject as L3** |
| **J2** | Conflicts | **Approved: J2-a — conflicts stay V6 entirely.** V5 must **not** claim that propositions agree merely because no check ran; `crossSourceAgreement` stays **`silent`**. Deterministic collapse of identical normalised text **with** an identical evidence set is **deduplication, not conflict resolution**. [ADR-0012](../adr/ADR-0012-deterministic-conflict-precedence.md) would *permit* AI detection earlier; sequencing and the canonicalisation dependency argue against it |
| **J3-a** | RAF coverage | **Approved for V5.** Populated and empty slots, evidence counts, confidence bands, required-for-executability status and the existing deterministic outputs. `FrameCoverage` has **no `conflicts` field**, so coverage cannot smuggle in reconciliation. **A re-cut of §3.7** |
| **J3-b** | Coverage persistence | **Approved: compute on read.** **No `raf_coverage` table in V5.** A persisted snapshot belongs with a future baseline / G1 |
| **J4** | Persistence state | **Approved: `draft` only, enforced in SQL.** No V5 route may produce `approved`, `in_review`, `needs_clarification`, **L4**, an approval baseline or an approval signature |
| **J5** | Shared gate | **Approved.** One deterministic proposal gate, shared by the production command path and the evaluation path. The validation logic is not duplicated |
| **J6** | Validation namespace | **Approved: `L1-REQ-*`, five structural rules, and no eighth validation layer.** Quality signals — vague quantifier, actor unknown, untestable — stay **`RequirementFlag`s**, because RAF §3 derives `ambiguities` from flags and G1's criterion is "0 blocking **flags**". **A catalogue addition** |
| **J7** | AI decomposition | **Approved: six disjointness-closed passes** — P1 Context & framing · P2 Participants & behaviour · P3 Outcomes & data · P4 Rules & decisions · P5 Time, failure & external · P6 Quality & control. All 27 slots in exactly one pass; every disjointness pair inside one pass; **`RafGroup` is not redefined**; grouping is prompting configuration with no persisted representation; six calls per evidence batch is acceptable; retries, evaluation and interaction records are **per pass**; CI stays replay-only |
| **J8** | AI versus deterministic ownership | **Approved.** AI proposes **semantic content and evidence references only**. Code owns RAF vocabulary, slot legality, identifiers, requirement numbering, evidence eligibility, schema validation, epistemic level, derivation, confidence, provenance linkage, classification propagation, disjointness, deduplication, persistence, coverage arithmetic, versioning, validation and audit. **The model must not invent RAF slots or authoritative state** |
| **J9** | Rejected-proposal retention | **Approved: retain the rejected proposal text and reason** in the append-only record, as [ADR-0032](../adr/ADR-0032-retain-everything.md) requires for "rejected proposals and rejected requirements". **This does not change V4b F2** — a rejected *source quote* stays checksum-only, because that is unanchored source content and this is model-authored text |

**ADRs required for V5: none.** J1, J4, J5, J7 and J8 implement ADR-0004, 0007, 0008, 0010, 0011 and
0016 as written; J9 implements ADR-0032. Three things would need an ADR and all three are refused:
letting a requirement exist with no evidence and no inference rationale, letting the model own slot
assignment unchecked, and creating an approved requirement without a human signature.

**Dependencies added: none.** Runtime dependencies stay at **seven**.

#### The acceptance review, 2026-08-24 — V7 corrected, NOT yet accepted

V7 was implemented at `7bfa440` and **reviewed against this boundary**. It was **not accepted**: four
of U1–U10 and criteria 2, 6, 9 and 10 had not been delivered, and **three preconditions could not
fail** — `L4-REQ-007` and `L4-REQ-008` reported *met* on every project regardless of state.

All seven defects are corrected — the full record is
[phase-2-status.md](phase-2-status.md) §10.8. In summary: **U7** now ingests an answer as a
`transcript` `Source` through the V1 path; **U4** now raises `corroborated` on a human-confirmed
equivalence, computed on read; `ValidationRun`s are **persisted** (migration 011) so both limbs of the
ADR-0017 signature reopen; reopening is **centralised** in a `mutate` wrapper enforced by a new
`g1-reconciliation` checker rule; the real `L0-ING-*` pack feeds `L4-REQ-008`; and a refused
`POPULATE_FRAME` pass now **records** a `slot_policy_block` (migration 012) so `L4-REQ-007` can fire.

**Nothing was weakened.** No checker rule was relaxed, no SQL invariant dropped, no U-decision
re-cut. The `controller-thinness` cap is unchanged at 220 and the surface was split again instead.
**Two migrations and one checker rule were added; U1–U10 are unchanged.**

#### ✅ ACCEPTED 2026-08-24

**V7 is ACCEPTED / COMPLETE**, after a **second** independent review against this boundary at
`7e50303`. All ten U-decisions are delivered or deferred by decision (**U5**), and all thirteen
acceptance criteria in [v7-proposal.md](v7-proposal.md) §20 are met — including **2**, **6**, **9**
and **10**, which the first review found unmet.

The second review found and fixed one further defect (**8**): a revision could only ever *narrow* a
citation set, so the evidence an answered question produces was uncitable by any requirement —
criterion 10's *"a requirement citing it resolves"* was impossible. Record: [phase-2-status.md](phase-2-status.md) §10.8 and §10.10.

**Accepted for mechanics and governance, explicitly not model quality**, on the same footing as
V4b-core, V5 and V6.

**Nothing was weakened.** No checker rule relaxed, no SQL invariant dropped, no U-decision re-cut;
`packages/raf` is byte-identical since V6 (criterion 12) and the `controller-thinness` cap is
unchanged at 220. Two migrations and one checker rule were added; dependencies stand at **seven**.

**Phase 2 is NOT closed.** **H4 / limitation 77** — a V5 defect outside this boundary — means G1 is
reachable for the first project in a database and for no other. It was raised at acceptance and not
held against V7. V5 needs no credential, no
corpus and no Docker.

#### H3 is a live-call blocker, not a V5 blocker

Limitation **62** — `ai_interaction` retains metadata only, while
[ADR-0032](../adr/ADR-0032-retain-everything.md) requires prompt and response payloads — is a **real
architectural compliance gap**, pre-existing from V4a.

| | |
|---|---|
| **Blocks** | The **first real live-provider call**, and therefore **V4b-eval** |
| **Does not block** | V5, which is **replay-only** and makes no live call |
| **Scope** | **H3 is not V5 work.** If resolving it becomes technically necessary to preserve an approved invariant, **stop and raise it** rather than expanding scope silently |

**No live provider call is permitted while this gap remains unresolved.**

### 3.11 V6 — approved boundary ✅ **ACCEPTED 2026-08-23**

**Approved 2026-08-23** with decisions **Q1–Q9**. Full boundary, taxonomy, data model, AI task design,
evaluation and risks: [v6-proposal.md](v6-proposal.md) v1.0.

V5 writes `crossSourceAgreement: 'silent'` on every proposal — an honest record that **nothing has
been compared**. Two documents can therefore say opposite things and the system holds both without
noticing. That is correct for V5 and unacceptable at G1, which requires **0 unresolved conflicts**.

```
Requirement proposals (V5, uncompared)
  → CANONICALISE_ENTITIES   who/what is the same thing across sources?
    → cross-source comparison and conflict CANDIDATES
      → deterministic PRECEDENCE recommendation (ADR-0012 ordering)
        → reconciliation view — every Conflict UNDECIDED
```

> **AI may detect and explain contradiction candidates. Deterministic code computes precedence. A
> human decides every true conflict.** — [ADR-0012](../adr/ADR-0012-deterministic-conflict-precedence.md),
> quoted rather than paraphrased. **V6 must not silently decide business truth.**

| V6 in scope |
|---|
| `CANONICALISE_ENTITIES` per entity kind, through the V4a broker, replay-only |
| Deterministic match-form merging; AI merge **candidates** that stay candidates (**Q3**) |
| Cross-source comparison and the five-way classification (**Q8**) |
| `RECONCILE_SOURCES` per candidate group — explains, never settles |
| Deterministic **precedence engine**: authority → effective date → specificity → epistemic level |
| `Conflict` + participants + `requirement_relation`, **all with `decision = null`** (**Q1**) |
| Reconciliation-aware **compute-on-read** agreement and confidence view (**Q6**) |
| The RAF `conflicts` derived slot, and a conflict view **alongside** unchanged coverage (**Q9**) |
| `L1-CONF-*` validation, rejection retention, read-only routes |
| Human-controlled **synthetic** gold set and offline evaluation harness |

**Out of scope for V6:** human conflict decisions · human requirement approval · the clarification
queue and `SYNTHESISE_QUESTIONS` (**Q7**) · **G1** · baselines and signatures · the **P3 Domain Model
Registry** (**Q2**) · BPS · Process IR · BPMN/DMN/Form generation · graphical editing · **V4b-eval** ·
live provider evaluation · **V2-PDF** · spreadsheets · **H1**, **H2**, **H3**.

#### Approved decisions Q1–Q9

Recorded in full in [v6-proposal.md](v6-proposal.md) §17. In brief:

| # | Decision | Outcome |
|---|---|---|
| **Q1** | Conflict decision state | **Candidates only.** `decision = null` always, **enforced in SQL**, no route that resolves one. Human decisions are **V7** |
| **Q2** | Canonicalisation scope | **Reconciliation only.** Not the P3 Domain Model Registry; promotion into one is a future explicit architecture decision |
| **Q3** | Merge safety | **Conservative.** Exact match-form equality may auto-merge; semantic equivalence stays an **AI candidate**; no irreversible merge; `mergedFromIds[]` and traceability preserved; over-merge and missed-equivalence **measured** |
| **Q4** | Specificity | **Deterministic or `undetermined`.** No heuristic fallback, no arbitrary tie-break |
| **Q5** | Precedence | **A recommendation.** May persist the recommended participant, `proposedResolution`, `precedenceRationale` and the deciding step. **Must not** apply it, suppress a requirement, rewrite the set, resolve a conflict, or decide |
| **Q6** | Reconciliation-aware confidence | **Compute-on-read.** V5 rows and their stored confidence are never mutated. **Absence of detected conflict is not agreement**; where human confirmation would be needed the state stays **provisional** |
| **Q7** | Clarification questions | **V7.** V6 supplies the structural inputs only — no queue, assignment, resolution or interaction workflow |
| **Q8** | Classification | **Five outcomes:** `duplicate` · `equivalent` · `complementary` · `potentially_contradictory` · `true_conflict`. AI may propose the middle three; **AI must never establish `true_conflict`**. Canonicalisation runs **before** classification |
| **Q9** | Coverage | **V5's implementation unchanged.** Conflict views sit alongside it; `computeFrameCoverage`, `slotStatus` and `RafGroup` are not touched — **proved by diff** at acceptance |

**Two items the approved list does not cover**, recorded as implementation choices rather than
approved decisions, and both raised at acceptance: **comparison scope** (confined to a RAF slot and
its disjointness partner) and the **`L1-CONF-*` validation namespace** (on the **J6** precedent, since
rule IDs are permanent).

**ADRs required for V6: none.** Q1, Q4 and Q5 implement ADR-0012 as written; Q3 and Q6 implement
ADR-0016 and ADR-0023; Q2 stays inside the existing module map. Three things would need one and all
three are refused: AI resolving a conflict, precedence applying itself, and a stored confidence input
becoming mutable.

**Dependencies added: none.** Runtime dependencies stay at **seven**.

#### H3 still blocks every live call

V6 is **replay-only** — implementation, tests and evaluation alike. Limitation **62** / **H3** is
unresolved, so **no live provider call is permitted**, and V6 does not depend on resolving it.

### 3.12 V7 — approved boundary ✅ **ACCEPTED 2026-08-24**

**Approved 2026-08-23** with decisions **U1–U10**. Full boundary, workflow, data model, G1 criteria,
evaluation and risks: [v7-proposal.md](v7-proposal.md) v1.0.

V5 and V6 built everything **up to** the human. V7 is the human — the first slice whose primary
output is produced by a person, and the first that can move anything to **L4**, which
[epistemic-model.md](../20-domain/epistemic-model.md) §2 rule 1 says *"is ALWAYS an explicit human
act, recorded with actor, timestamp, and baseline"*.

**Phase 2 ends when G1 can be reached.**

```
draft proposals + flags + undecided conflicts + unconfirmed merges
  → REVIEW → CLARIFY → DECIDE → APPROVE (L4) → G1 signature over (baselineHash, validationRunId)
```

**The gate machinery already exists and has been unused since V0.** `Baseline`, `BaselineMember`,
`Approval`, `freezeBaseline`, `evaluateGate` and `approveGate` landed with real SQL constraints,
optimistic concurrency, quorum and **segregation of duties**. V7 does not build G1 — it makes the
eight preconditions computable and gives the human a surface to satisfy them.

| V7 in scope |
|---|
| Requirement review: accept · **revise as a new immutable version** · reject · defer (**U2-a**) |
| Flag resolution, with a stated resolution |
| **Conflict decisions** — accept, choose the alternative, or reject as a false positive, always with a decider, a timestamp and a rationale (**U3**) |
| **Equivalence confirmation**, which may then enable corroboration **computed on read** (**U4**) |
| **`OpenQuestion`s from deterministic causes** (**U6**), answered, the answer becoming an interview `SourceUnit` (**U7**) |
| **Human-originated L3** with a mandatory `inferenceRationale` (**U8-a**) |
| `blocked_by_policy` slot acknowledgement |
| **`L4-REQ-*`** — the eight G1 preconditions, each a rule with a stable id (**U9**) |
| **G1**: freeze → validate → evaluate → approve, reusing V0's machinery unchanged (**U1**, **U10**) |

**Out of scope for V7:** BPS · DecisionSpec · FormSpec · ServiceInterface · Process IR ·
BPMN/DMN/Form generation · the viewer framework · the **P3** Specification Studio and Domain Model
Registry · graphical editing · **V4b-eval** · live provider work · **V2-PDF** · spreadsheets ·
**H1**, **H2**, **H3**.

#### Approved decisions U1–U10

| # | Decision | Outcome |
|---|---|---|
| **U1** | Approval and L4 | **Only through the G1 approval transaction**, enforced in SQL. No edit, accept or status route may set `approved` |
| **U2** | Editing model | **New immutable version** (U2-a): same `REQ-####`, new version, supersession chain, mandatory `changeReason`. In-place editing is **refused** — a signature over content that can change afterwards is not a signature (ADR-0017) |
| **U3** | Conflict decisions | **Never rewrite a requirement.** A decision records which proposition the business chose; changing text is an edit, and an edit is a new version |
| **U4** | Corroboration | A **human-confirmed** equivalence may raise `crossSourceAgreement` to `corroborated` — the half of **Q6** V6 could not claim. **Still computed on read**; no V5 row is mutated |
| **U5** | Source-declared undecided issues | **Deferred.** Three of the four question inputs are enough to make G1 reachable |
| **U6** | Clarification questions | **A deterministic cause is required**; AI may word a question, never choose one. A question with no cause is refused |
| **U7** | Answered questions | Become a `SourceUnit` in an **interview `Source`** through the existing V1 text path. `transcript` is an existing `SourceKind`; no new kind, no new provenance mechanism |
| **U8** | L3 inferred requirements | **Permitted, human-originated only**, with a mandatory `inferenceRationale` (U8-a). **No AI-authored L3** — that would reopen what **J1** closed. A LOW-confidence L3 must be explicitly confirmed before G1 |
| **U9** | G1 readiness rules | **`L4-REQ-*`**, one stable id per precondition, so every blocking precondition is nameable in a report — which governance §1 requires |
| **U10** | Self-approval | **Disabled**, and not per-project configurable in V7. Already enforced by `approveGate` |

**ADRs required for V7: none.** U1, U8 and U10 implement ADR-0007, ADR-0017 and the epistemic model
as written; U2-a implements ADR-0016; U4 completes Q6 in its own terms. Three things would need one
and all three are refused: an AI-signed approval, an approval that survives a content change, and an
in-place edit of an approved requirement.

**Dependencies added: none.** Runtime dependencies stay at **seven**.

#### H3 still blocks every live call

V7 is **replay-only**. Its one AI touchpoint — question *wording* — replays, and the deterministic
question **set** needs no provider at all. Limitation **62** / **H3** is unresolved, so **no live
provider call is permitted**.

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

## 4. Approved decisions A1–A8

All eight are **approved and binding**.

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

### A8 — Live AI provider for development · **Approved**

**Claude API may be used as the initial live AI provider** for development and the MVP, under five
conditions:

| # | Condition |
|---|---|
| 1 | Accessed **only through the existing AI Provider Abstraction** ([ADR-0020](../adr/ADR-0020-ai-provider-abstraction.md)). No vendor concept becomes load-bearing, and the `vendor-sdk-leak` checker rule stays in force |
| 2 | **Capability negotiation remains in place** ([ADR-0022](../adr/ADR-0022-capability-negotiation.md)). A capability is asked for, not assumed |
| 3 | The architecture **continues to support future private/enterprise endpoints**. The generic private-endpoint adapter stays, and stays tested |
| 4 | **Source egress still obeys the approved data-governance policy** ([ADR-0021](../adr/ADR-0021-data-classification-egress-policy.md)), enforced at the transport boundary |
| 5 | **A7 is unchanged**: normal CI and `npm run verify` make **no live call**. Live evaluation stays a separately triggered capability |

### The distinction this draws

**OD-1 no longer blocks development.** It was recorded as blocking "P2 completion", which conflated
two different dependencies:

| | Dependency | Status |
|---|---|---|
| **Development / MVP** | An approved live provider for non-sensitive or sanitised evidence | **Resolved by A8** — Claude API, through the abstraction |
| **Enterprise / private deployment** | A private endpoint for classified material | **Still open (OD-1)** — a *deployment and governance* dependency, not a development blocker |

A private enterprise endpoint remains required before classified material can be analysed at all.
That is a deployment gate, and the egress policy is what keeps the two apart: restricted content
cannot reach an external provider regardless of which adapter is configured.

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
