# Phase 2 — Implementation Status

> **Status:** **V0–V3, V4a, V4b-core and V5 ACCEPTED. V4b-eval deferred (and blocked by H3). V2-PDF blocked on spike S2.** · **Version:** 4.8 · **Updated:** 2026-08-23
> **Checkpoint:** §0 · **Commit:** `34ca68e` — V4b-core implemented; **accepted** at `3d5dfb6` (V4a accepted at `d82d285`)
> **Related:** [phase-2-plan.md](phase-2-plan.md), [phase-1-status.md](phase-1-status.md),
> [roadmap.md](roadmap.md)

---

## 0. Checkpoint — 2026-08-23

The single place to read to know where this project stands. Everything below is
traceable to a commit or an approved decision; nothing here is reconstructed.

| | |
|---|---|
| **Phase** | **Phase 2** — multimodal intake and structured requirements (spans roadmap P1 + P2) |
| **Current slice** | **None in progress.** **V6 is ACCEPTED / COMPLETE** — reviewed 2026-08-23 against decisions **Q1–Q9**, with the two acceptance-time decisions approved and one latent defect fixed, §9.10 |
| **Accepted so far** | **V0 · V1 · V2 · V3 · V4a · V4b-core · V5 · V6.** V6 accepted at `a653333`; V5 accepted at `43ab748` (§8.11); V4b-core at `3d5dfb6` (§7.10); V4a at `d82d285`; V3 at `bea4041` |
| **Commit** | V6 `eebabe0` + `a653333`. V5 `4b148b4` + `43ab748` · V4b-core `34ca68e` + `3d5dfb6` · V4a `09dfc9b` + `d82d285` |
| **Working tree** | **Clean.** V6 is committed at `eebabe0` and accepted |
| **Work in progress** | **None.** V6 is accepted. Spike S2's probe scripts lived outside the repo and were never committed |
| **Next approved action** | **None. Nothing is approved to begin.** A **V7 boundary proposal** — the human requirements workspace and G1 — is prepared for review and is **NOT APPROVED**. **V4b-eval must not begin**: it needs an approved credential, E1-permitted material **and H3**. **No live provider call is permitted while limitation 62 stands.** V2-PDF stays blocked; **H1/H2** are proposed, not approved; **V7 has not started** |

### Completed slices

| Slice | Commit | State |
|---|---|---|
| **V0** — Foundation: compiled toolchain, NestJS composition, PGlite persistence, BlobStore | `8f2a665` | **Accepted** |
| **V1** — Text intake, resolvable provenance, source viewer, `L0-ING` rules | `922761a` | **Accepted** |
| **V2** — DOCX intake, A3 ports, ZIP/XML readers, `docx_block` anchors | `1bd8d8d` | **Accepted** |
| **V3** — Image intake, vision evidence, ADR-0038 verification, structural BPMN/DMN/Form import | `dc2e683` + `bea4041` | **Accepted** — 2026-08-23 |
| **V4a** — AI broker wiring, `PROFILE_SOURCE`, `ai_interaction` persistence, live path, fixtures, baseline | `09dfc9b` + `d82d285` | **Accepted** — 2026-08-23, §6 |
| **V4b-core** — `EXTRACT_EVIDENCE`, §4.4 enforcement, persistence gate, confidence, chunking, gold-set evaluation | `34ca68e` + `3d5dfb6` | **Accepted** — 2026-08-23, §7. Accepted for **mechanics and governance, explicitly not model quality** — §7.8 |
| **V6** — `CANONICALISE_ENTITIES`, `RECONCILE_SOURCES`, precedence engine, conflict candidates, `L1-CONF` | `eebabe0` + `a653333` | **Accepted** — 2026-08-23, §9. Accepted for **mechanics and governance, explicitly not semantic correctness** — §9.8 |
| **V5** — `POPULATE_FRAME`, six disjointness-closed passes, proposal gate, draft-only in SQL, RAF coverage, `L1-REQ` | `4b148b4` + `43ab748` | **Accepted** — 2026-08-23, §8. Accepted for **mechanics and governance, explicitly not semantic correctness** — §8.9 |

**V0–V3 added no runtime dependency after V0.** Dependencies stand at seven.

### Verification of the current working tree

| | |
|---|---|
| Tests | **714 pass · 0 fail · 0 skipped · 0 todo** · 140 suites |
| `check:arch` | passed — 146 source files |
| `check:arch:selftest` | passed — **36 cases** |
| `check:docs` | passed — 89 files, 801 links |
| `npm run verify` | **green end to end**, and it makes **no live provider call** |
| Durability | Verified by execution: sources, text, units, images, evidence **and AI interactions** survive a full service restart, and anchors minted before it still resolve after it |
| Migrations | `001_governance` · `002_intake` · `003_source_kind_docx` · `004_page_image` · `005_ai_attribution` · `006_ai_interaction` · `007_evidence_confidence` · **`008_requirements`** |
| `eval:baseline` | `PROFILE_SOURCE`, **synthetic** corpus: schema 100%, reproducibility 100%, label agreement 100%, **not usable for a routing decision** |
| `eval:extract` | `EXTRACT_EVIDENCE`, **synthetic** gold set: precision **100%**, recall **100%**, F1 **100%**, unsupported-accepted **0%**, hallucination **0%**, ambiguity rejections **2**, traps 2 rejected / 1 **not exercised**. **Mechanics, not model quality** |
| `eval:reconcile` | `CANONICALISE_ENTITIES` + `RECONCILE_SOURCES`, **synthetic** gold set: conflict precision **100%**, recall **50%**, false-conflict **0%**, canonicalisation P/R **50%**, over-merge **0%**, precedence **reproducible**, traps 2 held / 1 **not exercised**. **Mechanics, not model quality** |
| `eval:frame` | `POPULATE_FRAME`, **synthetic** gold set: precision **100%**, recall **88%**, F1 **93%**, **slot accuracy 45%**, ungrounded **0%**, traceability **100%**, non-draft **0**, traps 2 **not exercised**. **Semantic faithfulness NOT MEASURED** — §8.9 |

### Approved decisions

**A1–A8**, all binding — [phase-2-plan.md](phase-2-plan.md) §4.

| | |
|---|---|
| **A1** | NestJS as the composition layer (ADR-0034, N1–N5) |
| **A2** | PGlite in development; PostgreSQL the production target (ADR-0035) |
| **A3** | `TextExtractor` + `PageRasteriser`; text first, per-page confidence-driven vision fallback; page-level provenance preserved either way |
| **A4** | New dependencies with controls: pin, manifest, document, avoid, preserve checker rules, raise material ones |
| **A5** | Prisma spike-first → proved non-viable → plain parameterised SQL (ADR-0035) |
| **A6** | BlobStore port with a filesystem development adapter |
| **A7** | **No live AI calls in normal CI**; replay fixtures; live evaluation separately invoked |
| **A8** | Claude API as the **initial live provider** for development, through the abstraction, under five conditions |

**V3 decisions D1–D6**, all approved — [phase-2-plan.md](phase-2-plan.md) §3.6. D1 became
[ADR-0038](../adr/ADR-0038-target-versus-content-verification.md); D2 plain `fetch`; D3 reuse the XML
tokeniser; D4 ceilings as functions; D5 a checker rule barring real provider calls in tests;
**D6 defers V3 in-scope items 4, 9 and 10 to V4** — §5.10.

**V4b decisions F1–F5**, all approved 2026-08-23 — [phase-2-plan.md](phase-2-plan.md) §3.9 and
[v4b-proposal.md](v4b-proposal.md) §2. F1 human-controlled gold set (never AI ground truth); F2
rejections recorded but **no analyst workflow**; F3 the core/eval split so no credential blocks
V4b-core; F4 structural chunking first, size fallback with recorded overlap, never silent; F5 the
four-condition persistence gate.

**V4 decisions E1–E5**, all approved 2026-08-23 and implemented in V4a where they apply — [phase-2-plan.md](phase-2-plan.md) §3.8 and
[v4-proposal.md](v4-proposal.md) §2. E1 development egress ceiling (`INTERNAL` and below only, and
never `CONFIDENTIAL`+ to an external provider for development); **E2 resolved** — ambiguous
multi-match citations are rejected for AI-extracted evidence while demotion survives for general
source citation ([provenance-and-anchoring.md](../20-domain/provenance-and-anchoring.md) §4.4,
revision 1.1); E3 AI evidence stays AI-derived and never auto-approves; E4 chunking explicit, versioned
and never silent; E5 an evaluation baseline is part of success. **No ADR is required for V4a** —
v4-proposal.md §3 checks it item by item and names the four changes that would need one.

### ADRs

**38 total.** ADR-0001…0032 approved in Phase 0. ADR-0033 discharged by ADR-0034.

| ADR | State |
|---|---|
| ADR-0034, 0035, 0036 | **Approved**, V0 |
| **ADR-0038** — target versus content verification | **Approved**, V3 |
| **ADR-0037** — binary document extraction toolchain | **PROPOSED — HELD.** The only open ADR |

### Blocked items

| Item | Blocked on |
|---|---|
| **V2-PDF** — PDF adapter, rasterisation, `pdf_region` rectangle lists, `L0-ING-008` wired | (1) a representative Arabic PDF corpus per [s2-corpus-request.md](s2-corpus-request.md) · (2) **spike S2 completed** against it, producing the exact-precision yield rate · (3) **ADR-0037 approved**. Enforced mechanically by the checker rule `pdf-engine-not-approved`; `@embedpdf/pdfium` is **not installed** |
| **V4b-eval, and every live provider call** | **Three** things, not two: (1) an approved credential · (2) E1-permitted representative material · (3) **H3 — limitation 62.** [ADR-0032](../adr/ADR-0032-retain-everything.md) requires prompt and response payloads to be retained and migration 006 retains metadata only, so **no live provider call is permitted while the gap stands** — an unretained live payload is unrecoverable. **V5 is unaffected: it is replay-only** |
| **Vision quality measurement** | No live provider has ever been called and no recorded corpus exists. Shape, refusals, egress and provenance are proven; **accuracy is not** |
| **Broker-consumer wiring, recorded fixtures, interaction persistence** | **Discharged by V4a** (§6). D6 deferred these from V3; the broker now has a real consumer, interactions persist, and replay fixtures exist |
| **Captured (as opposed to authored) fixtures** | **No credential exists in this environment**, so no live call has been made. The capture path is built and exercised against an authored stub; the first real capture is a credentialed operation, not a code change |
| **Ceiling enforcement** | No requirements exist yet to enforce ceilings on. `ceilingFor` is computable and tested; V5 enforces it |
| **Element-wise confirmation records** | V5. V3 made each region individually addressable, which is its prerequisite |
| Collation behaviour, PostgreSQL container, MinIO, OIDC, durable job queue, container build | **Docker unavailable** — §10, each with a named trigger |
| `RESTRICTED`+ material analysis | **OD-1**, now scoped as a *deployment* gate rather than a development blocker (A8) |

### What is NOT started

**V4b-eval** has not started and is not startable here: it needs an approved credential and
E1-permitted material. **No requirements capability exists**: `EXTRACT_EVIDENCE` reports what a
document *says*, verbatim and anchored, and nothing turns that into a requirement. There is **no RAF
population, no `POPULATE_FRAME`, no `RECONCILE_SOURCES`, no conflict precedence, no
clarification-question generation, no requirements workspace and no G1** — the task names exist in
the vocabulary and have no implementation. **V5–V7** remain provisional — capability names only, each
needing its boundary approved, not merely a go-ahead; a **V5 proposal is under review and is not
approved**. **No generation capability of any kind exists**: no BPMN, DMN or form generation, no
Process IR, no Specification Studio, no graphical designer.

## 1. Position

| | |
|---|---|
| Slices completed | **V0** · **V1** · **V2** · **V3** (§5) · **V4a** (§6) · **V4b-core** (§7) · **V5** (§8) · **V6** (§9) — all accepted |
| Next slice | **None approved.** A **V7 boundary** — the human requirements workspace and G1 — is prepared for review and is not approved. **V4b-eval** is deferred: it needs an approved credential and E1-permitted material. **V2-PDF** stays blocked on spike S2 and [ADR-0037](../adr/ADR-0037-binary-document-extraction.md) |
| Tests | **714 pass · 0 fail · 0 skipped · 0 suppressed** (288 V0 · 415 V1 · 480 V2 · 572 V3 · 596 V4a · 621 V4b-core · 664 V5 · **714 V6**) |
| Verification | build · `check:arch` (135 files) · checker self-test (36 cases) · `check:docs` — all clean, and **no live provider call** |
| Durability | Verified by execution: sources, text, units and evidence survive a full service restart, **and anchors minted before the restart still resolve after it** |
| ADRs | ADR-0034/0035/0036 in V0. **V1 and V2 added none.** [ADR-0038](../adr/ADR-0038-target-versus-content-verification.md) **approved** for V3. [ADR-0037](../adr/ADR-0037-binary-document-extraction.md) remains **PROPOSED — HELD**, and no dependency from it is present |
| Decisions | **A1–A8 all approved** — see [phase-2-plan.md](phase-2-plan.md) §4. **A8** (2026-08-23) permits Claude API as the initial live provider through the abstraction. **V3 decisions D1–D6 approved**, D6 deferring three in-scope items to V4 (§5.10) |
| Dependencies added | **NONE in V1, V2 or V3.** Runtime dependencies stand at seven, unchanged since V0 |
| Slices V4–V7 | **Provisional.** Capability sequence only; each requires approval of its boundary before it begins — [phase-2-plan.md](phase-2-plan.md) §3.7 |

Packages: **ten** — six pure/contract (`schemas`, `text`, `provenance`, `raf`, `domain`,
`validation`), three adapters (`ingestion`, `ai`, `eval`), one application (`api`).

| Slice | Commit |
|---|---|
| V0 | `8f2a665` — *compiled toolchain, NestJS composition, PGlite persistence, BlobStore* |
| V1 | `922761a` — *text intake, provenance, source viewer, L0-ING rules* · **accepted** |
| V2 | `1bd8d8d` — *DOCX intake, A3 ports, ZIP/XML readers, `docx_block` anchors* · **accepted** |
| V3 | `dc2e683` — *image intake, vision, ADR-0038 verification, structural import* · **accepted** at `bea4041` |
| V4a | `09dfc9b` — *AI broker wiring, `PROFILE_SOURCE`, `ai_interaction`, live path* · **accepted** at `d82d285` |
| V4b-core | `34ca68e` — *`EXTRACT_EVIDENCE`, §4.4 enforcement, persistence gate* · **accepted** at `3d5dfb6` |
| V5 | `4b148b4` — *`POPULATE_FRAME`, proposal gate, draft-only in SQL, RAF coverage* · **accepted** at `43ab748` |
| V6 | `eebabe0` — *canonicalisation, conflict candidates, deterministic precedence* · **accepted** at `a653333` |

---

## 2. V0 capabilities delivered

### 2.1 Compiled build toolchain — [ADR-0036](../adr/ADR-0036-build-toolchain.md)

- `tsc -b` over a solution file with **project references**, so dependency order is derived rather
  than maintained by hand. A missing reference is a compile error.
- `rewriteRelativeImportExtensions`, so **no source import was edited** to adopt the build step.
- Decorators enabled in **`apps/api` only**. `erasableSyntaxOnly` **retained** for every pure and
  contract package, which makes ADR-0034 N5 a **compile-time guarantee** rather than a review
  obligation.
- Tests run against emitted JavaScript in `dist/`.
- The Dockerfile becomes a proper three-stage build and **no longer runs production on an
  experimental Node flag** — a latent Phase 1 risk, now removed.

### 2.2 NestJS composition layer — [ADR-0034](../adr/ADR-0034-nestjs-application-layer.md)

Adopted under binding conditions **N1–N5**. It discharges the [ADR-0033](../adr/ADR-0033-http-framework-deferral.md)
**C5 route-budget tripwire, which fired exactly as designed** when Phase 2 planning showed ~32
endpoints pending against a 13-route baseline. The enforcement mechanism produced the decision.

- Controllers **parse, delegate and map** — nothing else.
- **RBAC, gate guards, audit and transactions remain in the command layer**, which imports no
  framework package.
- Pure packages import no NestJS package, enforced twice: by the checker and by the compiler.

### 2.3 PGlite persistence — [ADR-0035](../adr/ADR-0035-persistence-plain-sql-pglite.md)

Phase 2 is the first phase needing **durable** state, because human review spans sessions.

- **PGlite 0.5.6 = PostgreSQL 18.3** compiled to WebAssembly. Spike **S7**: 15 of 15 fidelity checks
  passed — enums, `jsonb`, `text[]`, `char(n)`, check constraints, foreign keys, transactions with
  rollback, byte-exact Arabic, `bytea`.
- **Prisma is not adopted.** No PGlite driver adapter exists, official or community; building one
  would mean owning a database driver.
- Plain parameterised SQL, hand-written **forward-only** migrations. Migration `001_governance.sql`
  creates **7 tables** with real constraints.
- **Drift-refusing migration runner**; readiness probe reports engine, version and applied migration
  count.
- **Insert-only / append-only enforced in SQL**, not only in code.
- **Optimistic concurrency on gate updates**, enforced in the `UPDATE` predicate.
- Transactional rollback verified by test.

### 2.4 BlobStore

- BlobStore port with a **filesystem development adapter**, guarded by explicit selection, a
  multi-replica refusal, and traversal-safe keys.
- **Content-addressed keys**, so identical sources deduplicate for free.

### 2.5 Enforcement added

- **Seven new architecture checker rules** for ADR-0034/0035: `nest-confinement`,
  `nest-domain-purity`, `controller-thinness`, `persistence-confinement`, `sql-injection-guard`.
- The ADR-0033 **C2 `framework-creep` rule reconciled**: NestJS idioms are permitted in the
  composition layer, while building a *second* framework remains forbidden.
- The retired `route-budget` rule is discharged — the tripwire served its purpose.
- Checker self-test grew to **22 cases**.
- An **asset-copy build stage**, added because `tsc` emits no `.sql` — found by a test failure, not
  by review.

---

## 3. V1 capabilities delivered

**Text intake and provenance, end to end.** The first slice in which the Phase 1 provenance
machinery has a real consumer: an anchor is minted by an adapter, stored as `jsonb`, read back, and
resolved against text that made the same round trip.

### 3.1 Ingest guard

Nothing enters the system without passing through it.

- **Content type by magic bytes**, never by the client's claim. Twelve signatures recognised — PDF,
  ZIP/OOXML, legacy OLE, PNG, JPEG, GIF, BMP, RIFF, gzip, ELF, Windows executable.
- A refusal **names the format and the slice that will parse it** ("content is PDF … parsing for
  this format arrives in V2"), rather than saying "unsupported".
- **Strict UTF-8 decode** (`fatal: true`). A lenient decode would substitute U+FFFD and store
  corrupted text that still hashes and still anchors.
- UTF-16 is **refused, not transcoded**: a lossy conversion would corrupt anchors without corrupting
  the text visibly. NUL-bearing "text" is refused as binary.
- **Size limit** from `ASDP_MAX_SOURCE_BYTES` (default 10 MiB). There is no unlimited value.
- **SHA-256 of the raw bytes**, computed even for a refusal so a rejection is attributable.
- A refused source creates **no row** — there is nothing to anchor — but **is audited**, because
  "what did we reject and why" is an audit question.

### 3.2 Deterministic text adapters

- **Free text**: blank lines separate paragraphs, and everything is a paragraph. It does not guess
  at headings or lists, because plain text carries no markup and a guess would be an
  interpretation — L2 work, not intake work.
- **Markdown**: ATX headings with depth, paragraphs, list items with depth, fenced code blocks,
  block quotes, thematic breaks. YAML front matter is **skipped**, so `title: Draft` never becomes
  citable evidence.
- Where a marker is stripped (headings, list items) the anchor spans **the content only**, so a
  unit's text equals the slice at its own offsets — which is what makes round-trip resolution a
  real test rather than a tautology.
- CRLF and LF input produce **identical units**, so the same document on two platforms does not
  anchor differently.
- `extractorVersion` is recorded on every anchor (`freetext@1`, `markdown@1`), for selective
  re-verification.

### 3.3 Provenance

- Anchors are **parser-minted**: deterministic, `exact` precision, never AI-computed.
- Every anchor is **verified before persistence**. An unresolvable anchor means the write is
  refused and the source is recorded `parse_failed` with a reason — never stored silently
  ([ADR-0008](../adr/ADR-0008-resolvable-anchors.md)).
- All offsets are **Unicode code-point indices over NFC, logical-order text**. Verified against a
  supplementary-plane fixture, which is the test that catches accidental UTF-16 arithmetic.
- Evidence inherits a unit's anchor or **narrows within it**; a range outside the unit is refused.
- `anchorVerified` is enforced three times over: in the command, in both repository adapters, and by
  a SQL `check` constraint — so it holds against a direct database connection.

### 3.4 Source inventory and authority ranking

- Ordered by **authority rank descending**, the order a reviewer resolving a conflict needs.
- Rank 0 means **not yet ranked** — a different fact from "ranked lowest" — and the inventory
  reports the unranked count.
- A rank change is **audited with its justification**, because "why does the policy outrank the SOP"
  is a question a reviewer will ask later.
- A `Contributor` may upload but **may not rank**: gathering material is not an analytical act;
  setting the deterministic input to conflict precedence ([ADR-0012](../adr/ADR-0012-deterministic-conflict-precedence.md)) is.

### 3.5 Source viewer

- Highlight ranges are computed **server-side** from the stored anchor and stored text. The client
  never re-searches rendered text — that would reintroduce every normalisation and direction bug the
  pipeline exists to eliminate (provenance-and-anchoring.md §6).
- A logical range paints **several segments** when it crosses a direction boundary, and the segments
  **tile** the range exactly: a gap would leave characters unhighlighted inside a highlighted quote.
- Segments running against the base direction are marked `counterFlow`, so an Arabic span containing
  a Latin term or a number renders correctly.
- A **broken anchor highlights nothing and says why**, rather than painting a confident highlight
  over the wrong text.

### 3.6 L0 ingestion validation

`L0-ING-001` … `L0-ING-010` implemented with the severities and gate assignment from
[validation-rule-catalog.md](../40-quality/validation-rule-catalog.md) — the catalogue is the
authority, and the pack does not re-decide them. Six errors, three warnings, one informational, all
at G1.

- `L0-ING-002` fires on a **drifted** anchor as well as a broken one: within one extractor version
  the text and units are written together, so any disagreement is a defect, not the version skew
  bounded drift repair exists to absorb.
- `L0-ING-007` and `L0-ING-008` are implemented against real fields (`extractionMethod`,
  `visionPageCount`, `arabicReorderingConfidence`) rather than stubbed. V1 only ever writes
  `extractionMethod: 'text'`; the V2/V3 adapters populate the rest under **A3**.
- `summary.blocking` names the findings that close G1 — a gate is closed by named findings, never by
  a count (invariant I6).
- Findings are **sorted**, so two runs over the same state produce the same list and a diff is
  meaningful. Finding ids are deterministic across runs.

### 3.7 Schemas, tables and enforcement

- New schemas: `Source`, `SourceUnit`, `EvidenceItem`, plus `ProvenanceAnchor`, `HighlightRange` and
  `HighlightSegment` as API contracts.
- The zod anchor and the pure `ProvenanceAnchor` type are held **bidirectionally assignable** by a
  compile-time assertion in `@asdp/ingestion`, so the necessary duplication cannot drift silently.
- Migration `002_intake.sql`: four tables, three of them insert-only in SQL.
- Two new checker rules' worth of coverage: `http-independence` now applies to a **directory** rather
  than a file list, so it cannot be outgrown by the next command file someone adds.

---

## 4. V2 capabilities delivered — DOCX document intake

**Binary document intake for Word documents, with no new dependency.** The PDF portion of the
approved V2 boundary is a separate slice (§9) and is not built.

### 4.1 The A3 abstractions

- **`TextExtractor` port**, implemented three times: free text, Markdown, DOCX. V1's
  `extractUnits` dispatcher became a registry, so the next adapter plugs in rather than extending a
  `switch`.
- **`PageRasteriser` port — defined, deliberately not implemented.** The V2 binding is
  `unavailableRasteriser()`, which **refuses by name with a reason**. Registered rather than left
  absent, so a caller reaching for rasterisation gets an explanation instead of `undefined`, and the
  refusal is visible in the composition root.
- `PageDescriptor` carries `confidence` and `requiresVisionFallback` **now**, so the PDF adapter
  will add values rather than a schema. A DOCX reports **no pages**: pagination is a rendering
  property, and a DOCX has none until it is laid out.
- **No PDF extractor exists**, and a test asserts that no registered extractor claims
  `application/pdf`.

### 4.2 ZIP and XML readers — zero dependencies

- **ZIP reader** on `node:zlib` raw inflate: central directory, local headers, stored and deflate.
  ~150 lines.
- **Refuses rather than guesses.** ZIP64, encryption, spanned archives and unknown compression
  methods are rejected by name. A partially-understood archive would yield partial text, and partial
  text with confident anchors is the failure mode intake exists to prevent.
- **XML tokeniser**, ~140 lines. No DTD processing and no external entity resolution, so there is
  **no XXE surface** — a DOCX is untrusted input.
- It **checks element balance**. Found by a failing test: the tokeniser claimed to refuse malformed
  markup but accepted `<w:body><w:p>`, which would have produced blocks from a truncated document.
  An unknown entity is an error too, because leaving `&nbsp;` in the text would put a literal
  seven-character string into a quote and its checksum.

### 4.3 DOCX adapter

- Paragraphs, ATX-equivalent **headings with depth**, **list items with indent level**, **table
  cells in row-major order**, tabs and line breaks.
- **Tracked changes: insertions accepted, deletions dropped.** A deletion is not evidence of a
  requirement. Field instruction codes (`w:instrText`) are dropped as machinery, not content.
- **Canonical text is assembled by the adapter**, one block per line — a DOCX has no linear text to
  store, so the extractor defines it. Offsets are taken against exactly the string that gets
  persisted, so an anchor and the stored text cannot be out of step.
- An empty paragraph produces **no unit but keeps its line**, because dropping it would shift every
  later offset.
- **Limitations are reported, not buried**: footnotes, endnotes, comments, headers, footers and
  embedded images are named in the response when the document contains them, and merged table cells
  are declared as not reconstructed. The person citing the document is the one who needs to know
  what was dropped.

### 4.4 Provenance — `docx_block` anchors

`docx_block` previously carried only `blockPath` + `runStart`/`runEnd`, which the resolver could not
verify at all — it returned `broken` for the kind. A DOCX anchor would have been unverifiable, and
`L0-ING-002` would have had nothing to check.

- The target now also carries **optional `charStart`/`charEnd`**, following the precedent
  `pdf_region` already set. The block address stays the primary identity; the offsets make it
  **checkable**.
- `textOffsetsOf` replaces the per-kind check, and **both** the resolver and the highlighter use it —
  so they cannot disagree about which anchors are verifiable.
- Consequence: a DOCX unit round-trips, highlights, and is citable as evidence through exactly the
  same path as a text unit. No second provenance mechanism was introduced.

### 4.5 Arabic and mixed Arabic/English

**A DOCX stores text in logical order by construction** — `w:t` holds characters in reading order,
and the renderer applies bidi at display time. That is the structural reason DOCX was unblocked
while PDF waits: the question spike S2 exists to answer does not arise here.

Verified end to end, through `jsonb` and back:

- Arabic round-trips **byte-exactly**; blocks are tagged `ar` / `rtl`.
- **An embedded Latin run inside Arabic keeps its reading order** — `SADAD` and `30` are not
  reversed. This is the assertion that failed for every PDF library measured in S2.
- A mixed range paints **several tiling segments** with `counterFlow` marked.
- NFC and NFD input produce **identical canonical text and identical anchors**, on a fixture that
  genuinely decomposes.
- Non-BMP characters do not shift offsets — asserted against a surrogate-pair fixture.

### 4.6 Validation

- `L0-ING-005` now runs against **real binary-document data**: a DOCX whose document part fails to
  parse is recorded `parse_failed` with a reason, `L0-ING-001` reports it, and it **blocks G1**.
- `L0-ING-007` and `L0-ING-008` remain implemented but **unexercised by real data**, because both
  concern vision extraction and Arabic PDF reordering. Wiring them to actual data is V2-PDF.
- A clean DOCX source passes L0 with **nothing blocking**.

### 4.7 Guard and messaging

- **OOXML admitted by looking inside the archive**, not by extension: a DOCX named `.txt` is still
  admitted, and content still decides.
- **XLSX is refused by name**, stating that spreadsheet ingestion is a separate proposed capability.
  PPTX is refused. A ZIP with no recognised OOXML part is refused and says what it found.
- **The PDF refusal message now names `V2-PDF`.** V1 told users PDF *"arrives in V2"*, which the
  sequencing change made untrue. Corrected, and asserted by a test — a stale message tells a user
  something false.

### 4.8 Enforcement added

- Checker rule **`pdf-engine-not-approved`**: importing `@embedpdf/pdfium`, `pdfjs-dist`, `mupdf`,
  `pdf-lib`, `@napi-rs/canvas` or `canvas` **anywhere** fails the build. Adding a PDF engine while
  ADR-0037 is unapproved is not a judgement call, so it is not left to review. Two self-test cases
  cover it.
- When ADR-0037 is approved this becomes a *confinement* rule naming the PDF adapter directory,
  rather than a prohibition.

## 5. V3 capabilities delivered — multimodal and structural intake

**ACCEPTED 2026-08-23.** **Image intake read by vision, and structural model files read by a parser,
both landing as evidence with resolvable targets.** Delivered at `dc2e683`, plus the acceptance
corrections of §5.9 at `bea4041`. **No new dependency:** `fetch` is built into Node 22 (**D2**), the XML tokeniser
already existed (**D3**), and image dimensions are read from file headers.

The V3 boundary is [phase-2-plan.md](phase-2-plan.md) §3.6; the design record is
[v3-proposal.md](v3-proposal.md); the governing provenance decision is
[ADR-0038](../adr/ADR-0038-target-versus-content-verification.md). Three in-scope items are
**deliberately deferred to V4** — §5.10, decision **D6**.

### 5.1 Image intake

- **PNG, JPEG, WEBP, GIF and BMP admitted by magic bytes**, never by filename. The guard checked
  these formats before V3 in order to *refuse* them by name; V3 turns the refusal into admission.
- **Dimensions are read from file headers with no dependency** — PNG `IHDR`, the GIF logical screen
  descriptor, the BMP DIB header, all three WEBP sub-formats, and a walk of the JPEG segment chain
  to the start-of-frame marker.
- Dimensions are **not metadata**: ADR-0038 target verification checks that a cited rectangle lies
  within the image bounds, so without real width and height that check is unenforceable. A zero
  dimension or an unreadable header is therefore **refused** (`unreadable_image`), never defaulted.
- A RIFF file that is not WEBP still falls through to the existing RIFF refusal.

### 5.2 `PageImage` — storage and identity

- Migration **`004_page_image`**: one row per stored image, `unique (source_id, page_no)`,
  **insert-only**, checksum constrained to lowercase hex, and **dimensions constrained positive**,
  because a zero would make every bounds check vacuously true.
- Bytes are stored through the **content-addressed BlobStore**; the row records `blobRef`, `sha256`,
  `width`, `height`, `mediaType` and `byteSize`.
- Also the landing place for V2-PDF's rasterised pages, so the vision path does not care whether an
  upload or a rasteriser produced the image.

### 5.3 Vision extraction

- **`VisionExtractor` is a separate port from `TextExtractor`**, deliberately: reading pixels calls a
  model, is subject to the egress policy, and yields an interpretation. Keeping them apart is what
  stops "extract the text" quietly meaning "ask an AI".
- The **preserved rule is asserted, not assumed**: text, Markdown, DOCX and BPMN are all ingested in
  a test whose vision extractor **throws if it is ever called**.
- The prompt asks for **regions and verbatim text and forbids interpretation** — no summarising, no
  translation, no inferring intent, no describing process behaviour. A prompt inviting "describe the
  process" would produce exactly the content [ADR-0005](../adr/ADR-0005-ir-first-compilation.md)
  excludes.
- **A refusal is a first-class outcome**, not an exception: it carries named degradations and
  concrete options (data-governance.md §3.1). The default binding **refuses**, because an empty
  region list is indistinguishable from "the image contained no text", and those are different facts.
- A refused read leaves the source **`parsed` with no units**, not `parse_failed` — the bytes are
  held and readable; the reading was declined.
- **Out-of-bounds or blank regions are dropped and reported, never clamped.** A clamped rectangle is
  a different claim from the one the model made.

### 5.4 Provenance — ADR-0038, target versus content

The material decision of the slice, and the part that most needed to be right.

- Verification is **two independent axes**. A deterministic textual source answers both, and only
  then is an anchor `resolved`. **An image answers only the target axis**, because the only text
  available is what the model reported.
- The rejected design is recorded because it is the tempting one: storing the vision transcript as
  canonical text and resolving image anchors against it would verify **AI output against AI output**,
  so the checksum would always match — a green light that means nothing while looking identical to
  the real guarantee.
- Resolution now has **four states**. `content_unverified` means *target verified, interpreted
  content not*. `resolved` is **never** reused for the visual case, and the union is exhaustive, so a
  consumer cannot ignore the fourth state without a compile error.
- `image_region` anchors are **`page` precision, never `exact`**.
- **Two vacuous checks were found by tests and fixed.** Image verification had compared the stored
  checksum against itself; the fix records the checksum **on the anchor at mint time**, so two
  independent records exist. Model-file verification had done the same and was **removed rather than
  repaired**, because element ids are recomputed from the stored bytes on every resolution.
- `isCitable` treats `content_unverified` as **citable**: the target is sound, and the epistemic
  ceiling — not the anchor — is what limits what such evidence may support.
- Highlights carry `imageId` and `imageRect` for a visual citation and come back
  `content_unverified`, so a viewer can render a vision citation differently from a verified one.

### 5.5 Epistemic ceilings — **D4**

- `ceilingFor` and `permittedByCeiling` are **pure, total functions** of evidence kind and extraction
  method — never stored columns, because a stored ceiling can drift from what it describes and can
  be edited.
- Screenshot → **L2**. Diagram image → **L2 plus element-wise human confirmation** (risk R5). Text,
  DOCX and structural-model imports → **L1 attainable**. An unrecognised kind read by vision is
  capped conservatively rather than falling through to L1.
- The **reasoning was corrected** during the mandated consistency check, though the ceilings were
  not: `epistemic-model.md` §1 defines L1 as created by *"AI extraction or deterministic parser"*, so
  the cap cannot rest on "an AI read it". What disqualifies visual evidence is the **anchor** — L1
  requires a resolvable anchor, and for an image only the target resolves. And the cap was already
  approved in Phase 0: `provenance-and-anchoring.md` §5 permits `page` precision only for L2/L3
  content, never for L1 evidence.
- **No new epistemic meaning enters the system.** The ladder stays four levels, and no L2 → L1
  promotion exists or is created. `permittedByCeiling` always permits L4, because L4 is a human act:
  a person may approve a requirement resting on an interpretation.

### 5.6 Structural BPMN / DMN / Form import — **D3**, evidence only

- Recognised **from content, not extension**: a `.bpmn` file that is really a note is read as text; a
  `.xml` file carrying the BPMN namespace is read as BPMN.
- Parsed with the **existing deterministic XML tokeniser**; Camunda forms use `JSON.parse`. **No AI
  is involved**, because a structured model already exists and using a model here would be strictly
  worse — slower, non-reproducible, unverifiable.
- **Diagram geometry is not evidence**: `BPMNShape` and `BPMNEdge` are excluded. Layout is never
  evidence of a requirement.
- **An unnamed element produces no unit and the omission is reported.** A synthesised label would put
  text into a quote that appears nowhere in the source, and its checksum would then verify against
  something no one wrote.
- Element anchors resolve to `resolved` at `exact` precision, and the five absolutes are recorded
  where the reading happens: never an `ArtifactVersion`, never editable, never the starting point for
  generation, ids never reused, never a bypass of the requirements path. **No edit route exists** —
  `PUT`/`PATCH`/`DELETE` return 404.

### 5.7 Live transport — **D2** — and the A7/D5 boundary

- **Plain `fetch` behind the existing adapter boundary.** The Anthropic SDK is not introduced:
  `fetch` is built into Node 22, and the `AiProvider` port already normalises everything an SDK would
  abstract, so vendor types would be a second, vendor-shaped model of the same concepts —
  precisely what [ADR-0020](../adr/ADR-0020-ai-provider-abstraction.md) exists to prevent.
- **One file is the entire vendor surface.** Replacing the provider means writing a sibling of it and
  changing configuration.
- The API version is **pinned**; a truncated response is reported as the **named degradation**
  `chunked_context` rather than accepted as a shorter document; an image part carries a **reference**,
  so the transport **refuses** rather than sending a request with the image silently omitted.
- **No live call has ever been made, and normal CI makes none.** The checker rule
  `no-live-ai-in-tests` enforces it mechanically rather than by convention.

### 5.8 AI attribution of vision-read evidence

- Evidence attribution is derived from the **anchor kind**, so it cannot drift per slice or be chosen
  by a caller. An `image_region` citation is `extractedBy: 'ai'`, names the interaction that produced
  it, and is `citationMode: 'native'` (`provenance-and-anchoring.md` §4.3 — the provider returned the
  region itself). Text, DOCX and model-file citations stay `parser` / `none`.
- The interaction id is carried **on the `SourceUnit`**, because the unit is what evidence cites and
  from V2-PDF onward one source carries a call per page.
- Migration **`005_ai_attribution`** enforces both halves in SQL: a vision unit must name its
  interaction, and image-anchored evidence cannot be labelled `parser`. Combined with migration 002's
  `evidence_ai_interaction_present`, an AI-extracted row cannot exist without naming its interaction,
  so the **AI-disclosure report is computable rather than estimated**
  ([ADR-0004](../adr/ADR-0004-ai-proposes-code-commits.md)).
- The `evidence.recorded` audit event records the anchor kind, `extractedBy`, `citationMode` and the
  interaction id, so "which requirements rest on a model's reading" is answerable from the audit
  trail and not only from the row.

### 5.9 Acceptance corrections

Three corrections were required by the V3 implementation review and applied before acceptance. All
three are committed; acceptance followed them.

| # | Correction |
|---|---|
| 1 | **This section, §5, was missing entirely.** `dc2e683` renumbered §5–§9 to make room for it and never wrote it, while [phase-2-plan.md](phase-2-plan.md) §3.6 and [v3-proposal.md](v3-proposal.md) both pointed a reader here. The durable record had a hole exactly where a fresh session would look |
| 2 | **`no-live-ai-in-tests` was refined.** It had banned the transport *factory* outright, which also banned the offline shape test the transport's injectable `fetchImpl` exists for — leaving the entire vendor surface untested, which is the opposite of what **A7** wants. It now bans **network egress**: a test may construct the transport **only** with an injected fetch double, may not inject the real global `fetch`, may not read a provider API key, and may not name a real provider endpoint. Six self-test cases cover it, including one proving the rule does **not** fire on a legitimate injected double, and the transport now has **12 offline tests** |
| 3 | **`extractedBy` for vision-read evidence was a defect, and is fixed** — §5.8. Every `EvidenceItem` had been written as `extractedBy: 'parser'` with no interaction id, including citations over vision-read regions. It made the AI-disclosure report uncomputable and erased the audit trail behind the L1/L2 distinction at the one point it matters |

### 5.10 Deliberately deferred to V4 — decision **D6**

**Approved 2026-08-23 at the V3 acceptance review.** Three items from the V3 in-scope list are
**broker-consumer and evaluation-fixture work**, and they land with V4's first requirements-analysis
consumer of the broker rather than in an intake slice. This is recorded, not implied.

| V3 item | State at acceptance | Why V4 |
|---|---|---|
| **4 — live transport wired through broker, egress gate, routing, degradation ladder** | The transport exists and is tested offline; `createBrokerVisionExtractor` exists and joins vision to the broker, but **is referenced by nothing** — the composition root wires the refusing extractor. It is the V4 seam | Wiring a broker consumer without a consumer to feed means testing the wiring against itself. V4 brings the first real consumer |
| **9 — record/replay fixtures for every AI call** | End-to-end tests use **scripted stand-ins**, not recordings through `@asdp/eval` | A recording is made by capturing a real call ([ADR-0031](../adr/ADR-0031-corpus-as-data.md)). No live call has been made and no corpus exists, so there is nothing to capture yet |
| **10 — AI-interaction audit with provider, model, capabilities, degradations, cost, classification** | `AiInteraction` carries `mode` and `sourceId`; the broker emits the record; **there is no `ai_interaction` table** and the intake audit event carries only the interaction id and limitations | Persisting an interaction record is only meaningful once interactions are actually produced through the broker — the same dependency as item 4 |

**What V3 is accepted as delivering** is therefore: image intake · the `VisionExtractor` and
provider-transport **foundation** · `image_region` provenance · target-verified /
`content_unverified` semantics · confidence ceilings · structural BPMN/DMN/Form import as evidence ·
egress controls at the transport boundary · deterministic replay-based verification · audit records.
**V3 does not deliver the first business requirements-analysis consumer of the AI broker.** That
begins in V4.

### 5.11 Enforcement added

- Checker rule **`no-live-ai-in-tests`** (**A7** / **D5**), refined as described in §5.9. Self-test
  grew to **32 cases**.
- Migration **004** constrains image dimensions positive; migration **005** constrains AI attribution
  in both directions. Both are enforced in SQL, so the guarantees survive a direct connection.
- `ResolutionStatus` is an exhaustive union, so the fourth state cannot be ignored silently.
- `contentVerifiability(anchorKind)` derives which axis applies from the kind — never stored, never
  per-adapter.

### 5.12 Hardening candidates — **H1** and **H2**, proposed, not approved

**V3 acceptance was explicitly not held on these** (decision of 2026-08-23). Both are recorded
limitations — §7 items **43** and **44** — and both are small, mechanical closures rather than new
capability. They are candidates for a **small hardening slice**, and like any slice that slice needs
its boundary approved before it begins.

| # | Candidate | What it closes | Shape of the change |
|---|---|---|---|
| **H1** | **Strengthen element-name comparison where appropriate** | Limitation **43**. Element-anchor resolution checks that the cited element id is present in the reparsed file; it does not compare the recorded quote to the element's current name. [ADR-0038](../adr/ADR-0038-target-versus-content-verification.md) §5 grounds content verification for structural imports in that name being checkable, so today the implementation is weaker than the ADR states | Carry element **names** alongside ids in `StoredModel`, and compare the anchor's quote to the current name during resolution. *"Where appropriate"* matters: an expression-bearing element and a renamed-but-identical element are different cases, and a renamed element is arguably `drifted` rather than `broken`. That judgement is what the slice has to settle — it is not a one-line change |
| **H3** | **Retain AI prompt and response payloads** | Limitation **62**. [ADR-0032](../adr/ADR-0032-retain-everything.md) requires it and migration 006 does not do it; `proposal_id` dangles against a store that was never built. Not a V4a defect that was hidden — it was never recorded either way, which is the part worth fixing | Add payload storage with classification-based access control, most likely a `ai_proposal` table or a BlobStore reference keyed by `proposal_id`, plus the read path that enforces classification. *"Where appropriate"* is doing real work: payloads may carry `CONFIDENTIAL` content, so the store and its access control are the decision, not the column. **Raise before the first live provider call**, because that is when an unretained payload becomes unrecoverable |
| **H2** | **Make `imageSha256` required where appropriate** | Limitation **44**. The field is optional, so an image anchor minted without it falls back to comparing the stored row against itself — the vacuous check §5.4 exists to prevent. No current code path mints such an anchor, so this is latent rather than live | Require it on newly minted `image_region` anchors, or refuse an image anchor that lacks it at verification time. *"Where appropriate"* matters here too: the field must stay optional in the **schema** so anchors already stored remain readable, so the guarantee belongs at the mint and verify boundaries rather than in the type |

**Limitation 45** (no API exposes page images) is **not** part of this: it is viewer work, not a
provenance weakness, and the rectangles are already verified numerically.

---

## 6. V4a capabilities delivered — AI broker and live-path foundation

**Complete, awaiting review.** Boundary: [phase-2-plan.md](phase-2-plan.md) §3.8 and
[v4-proposal.md](v4-proposal.md). Decisions **E1–E5**. **No new dependency** — runtime dependencies
stay at **seven**.

**What V4a claims is the chain, not the content:** source → broker → governed provider → structured
response → `ai_interaction` audit → deterministic replay. It makes **no substantive requirements
claim**, and `PROFILE_SOURCE` structurally cannot: the schema has no field for an obligation, a rule
or a process step, and the prompt forbids reporting one.

### 6.0 THE SCOPE OF THIS ACCEPTANCE — recorded at acceptance

> **V4a is accepted specifically for the AI broker and live-path foundation. The acceptance is NOT
> evidence of AI extraction quality.** Stated here, in the record a fresh session reads, because a
> green suite and a 100% baseline are exactly the kind of numbers that get quoted later as though
> they measured something they did not.

| | |
|---|---|
| **The current recordings use the synthetic stub** | Every fixture in `corpora/synthetic/recordings/` was produced by the **authored stub provider**, `synthetic-stub`. None was captured from a model |
| **No live external model has yet been evaluated** | No credential exists in this environment and no live provider has ever been called, in this slice or any earlier one |
| **What the current baseline proves** | **Schema** conformance · **governance** — the egress gate, the development ceiling, capability negotiation, degradation naming · **replay** determinism · **integration** — the chain from source through the broker to a persisted, auditable interaction |
| **What it does NOT establish** | **Model accuracy. Precision. Recall.** No number in the baseline is a measurement of a model, and `usableForRoutingDecision` is **false** by construction on a `synthetic` tier |

Every artefact carries this rather than relying on the reader remembering it: the provider id in each
recording and key hash, the corpus tier on every report, the four extraction metrics listed as
not-applicable with reasons, and limitation **46**.

### 6.1 The broker has a real consumer — **D6** item 4 discharged

- `PROFILE_SOURCE` runs through the **real** broker: classification, egress gate, capability
  negotiation, routing, degradation planning, schema-enforced invocation. What tests substitute is
  the *provider*, and they substitute it with a **replay provider over recordings**, which is what
  **A7** says CI must use.
- The command layer reaches AI through a **`SourceProfiler` port**, so it cannot know which provider
  answered. Routing and egress stay application concerns (ADR-0034 N4).
- **The default build refuses.** `unavailableSourceProfiler` is wired unless a provider is configured
  — a configuration gap stated as one, never a claim about the document.
- Capabilities recorded are the ones the **answer rested on**: the task's required plus preferred set
  intersected with what the *selected model* declares, not the provider's whole list (ADR-0022).

### 6.2 Three defects the wiring found

Wiring a consumer is how these surfaced; none was reachable while the seam was unused.

| # | Defect | Consequence had it shipped |
|---|---|---|
| 1 | **`createReplayProvider` renamed the provider.** It returned `id: '<inner>+replay'` while `descriptor().providerId` stayed the inner id. `route` selects by descriptor and `invoke` looks up by `id`, so a replay-wrapped provider **could never be found** — every brokered call refused with *"router selected an unknown provider"* | Replay-backed CI would have been impossible. The whole A7 posture rests on this wrapper working behind the broker |
| 2 | **V3's vision extractor validated the wrong thing.** It parsed `proposal.payload` — the outputs **list** — against an object schema, so it could only ever refuse | Every vision read would have failed as a schema error once the seam was wired. Fixed with the shared `decodeStructured`, so both consumers decode identically |
| 3 | **A replay-wrapped provider reported `capabilityTier` from the wrapper**, unaffected by this change but confirmed by test | — |

Defects 1 and 2 are exactly what limitation 41 predicted: an unwired seam is untested by
construction, and "it compiles" is not evidence.

### 6.3 `ai_interaction` persistence — **D6** item 10 discharged

Migration **`006_ai_interaction`**, **append-only** (invariant I8, ADR-0032), with `human_verdict`
as the single mutable column and a closed vocabulary constraining it.

One row answers *"what was sent outside, to whom, and why?"*: provider, model, deployment class,
**capabilities used**, prompt and task version, content classification, **egress decision** and
reason, degradation state, **context mode** with chunk count and ranges (**E4**), live-versus-replay
`mode`, source id, **correlation id**, tokens, cached tokens, cost and latency, timestamps, and the
proposal it produced.

Two constraints carry the guarantee rather than the code:

- **`RESTRICTED` or `PROHIBITED` content cannot be recorded against an externally hosted provider.**
  If such a row could exist, the egress guarantee would rest entirely on the code being correct.
- A **chunked** read must state its chunk count (**E4** rules 2–3).

The interaction is written **inside the command's unit of work**, so it commits with its audit event
or not at all — the broker produces the record and the caller persists it, exactly as `BrokerDeps`
always said.

### 6.4 The live path — explicitly invoked, and confined

- `npm run ai:capture` is the **only** path to a provider. `npm run eval:baseline` is offline.
- **New checker rule `live-path-confinement`**, in two halves: **nothing may import** the live
  entrypoint, and **nothing outside it may construct** a live transport. Together they make "normal
  verification cannot reach a provider" a property of the build rather than a habit. Four self-test
  cases, including one proving the live path itself is permitted.
- **E1 is enforced at the boundary** by `assertDevelopmentCeiling`, a second gate stricter than the
  production one: `CONFIDENTIAL` may go to an external provider under
  [ADR-0021](../adr/ADR-0021-data-classification-egress-policy.md), and **may not** go merely for
  development. On-premise providers are unaffected — nothing leaves.
- `--mode=verify` compares a live response against its recording and reports **drift**, which is the
  ADR-0031 mechanism for catching a silently updated hosted model.

### 6.5 Fixtures and the evaluation baseline — **D6** item 9, **E5**

- Filesystem `RecordingStore` and `CorpusStore` adapters, so a recording outlives the process. A
  recording is addressed by a **key hash** over corpus, task, prompt version, provider, model and
  request, so a changed prompt **misses** rather than silently replaying a stale answer — and in
  `replay_only` a miss is an **error**, never a network call.
- A synthetic corpus of three authored documents — English, Arabic, and mixed — with `sourceKind` as
  the label agreement is scored against.
- `npm run eval:baseline` measures **schema validity, reproducibility, degradation behaviour and
  label agreement**, and **names** the four metrics it cannot produce
  (`extractionPrecision`, `extractionRecall`, `citationProvenanceValidity`,
  `hallucinatedEvidenceRate`) with the reason for each. An omitted metric reads as "fine"; a named
  gap reads as a gap.
- **Reproducibility below 100% is a defect, not a score**, and the runner exits non-zero on one.
- Every number is stamped with its corpus tier. `synthetic` is weighted **0.25** and
  `usableForRoutingDecision` is **false**.

**The recordings are AUTHORED, not captured.** No credential exists in this environment, so no live
call has been made. Running the real capture path against a deterministic stub proves the chain and
makes CI reproducible; it says nothing about model quality, and the provider id `synthetic-stub`
carries that into every report that quotes it.

### 6.6 What V4a deliberately does not do

- **No extraction.** No `EXTRACT_EVIDENCE`, no quote location, no anchors minted from AI output.
- **No promotion path.** A profile is a proposal: no route turns one into a requirement, a RAF item,
  a BPS element or evidence, and a test asserts the absence (**E3**).
- **No chunking algorithm.** An over-context source is **refused by name** with the
  `chunked_context` degradation stated, never truncated (**E4** rule 6). The record's chunk columns
  exist so V4b adds an algorithm rather than a schema.
- **No quality claim.** See §6.5.

### 6.7 A defect found and NOT fixed

**The access log misreports every domain error as a 500.**
`apps/api/src/http/correlation.interceptor.ts` reads `err.status` when logging a failed request, and
a domain error (`AuthorizationError`, `ValidationError`) carries no `status` property — so it logs
**500** while `DomainErrorFilter` correctly returns **403** or **400** to the caller. The HTTP
contract is right; the log is wrong.

Found by a V4a test asserting a `Viewer` is refused. It is **pre-existing** (V1-era), affects every
domain error on every route, and is **outside the approved V4a boundary**, so it was raised rather
than fixed ([CLAUDE.md](../../CLAUDE.md) §11). Consequence while it stands: with
`ASDP_LOG_LEVEL=error` a 403 is logged at error level, and a real server fault is
indistinguishable from an authorisation refusal in the log.

---

## 7. V4b-core capabilities delivered — AI evidence extraction

**Complete, awaiting review.** Boundary: [v4b-proposal.md](v4b-proposal.md) and
[phase-2-plan.md](phase-2-plan.md) §3.9. Decisions **F1–F5**. **No new dependency** — runtime
dependencies stay at **seven**.

This is the first slice in which AI output becomes **evidence a requirement may later cite**, so it
is the first slice where the epistemic rules reject things. What it claims is that **what should be
rejected is rejected**, and that the refusal is recorded. It claims nothing about model quality —
§7.8.

### 7.1 `EXTRACT_EVIDENCE`, end to end

- Runs through the broker wired in V4a: classification, egress gate, capability negotiation,
  routing, degradation planning, schema-enforced invocation, one call per chunk.
- The model returns **verbatim quotes and locators, never offsets**. We locate the quote and mint the
  anchor, so a model that misremembers a position cannot produce a confident citation to the wrong
  place (provenance-and-anchoring.md §4).
- The prompt and the schema agree, deliberately: `EvidenceExtraction` has **no field** for an
  obligation, a rule, a process step or a decision, and the instruction forbids producing one. Either
  alone would leak — a model fills the fields it is given, and a schema does not stop paraphrase.
- Persisted items are `extractedBy: 'ai'` with `citationMode: 'post_hoc'`, their interaction named,
  and computed confidence attached.

### 7.2 Provenance §4.4 enforced — and the behaviour change it required

`locateQuote` had implemented the **pre-revision** rule: when a quote matched several locations and a
hint was merely *present*, it selected `matches[0]` — the first occurrence, arbitrarily — demoted
precision to `page`, and `mayBecomeEvidence` accepted it. That is the exact combination §4.4 forbids.

| Case | Behaviour |
|---|---|
| **1 — one location** | Accept the verified anchor |
| **2 — several locations, deterministic locator resolves one** | Accept, at **`exact`** precision: the hint *selected among* candidates that were each exact, it did not approximate |
| **3 — several locations remain** | **Reject.** No occurrence is chosen, and no precision makes it eligible |

- A hint is **applied**, not counted: `unitId` and `heading` resolve to code-point ranges over stored
  structure, and only a scope containing exactly one candidate accepts. `page` and `section` are
  carried for the record and resolve nothing on their own — a model asserting "section 3" is a claim,
  not a verification.
- `mayBecomeEvidence` is now a **type guard** returning false for `ambiguous` at any precision, so a
  caller cannot reach for an anchor the ambiguous case has no business handing out.
- The ambiguous case still offers a **`citationOnlyAnchor`** over the enclosing scope, because §4.4
  keeps demotion for navigation and display. The field is named for what it licenses.
- **Two existing tests were rewritten**, and the reason is recorded in the test itself: they asserted
  the old rule, and were correct against v1.0 of the specification and wrong against revision 1.1.

### 7.3 The persistence gate — **F5**

Four conditions, all of them, in one shared module:

1. structured output **validates** — schema-checked per extraction
2. the citation **resolves uniquely** — §4.4
3. the anchor **verifies independently** — re-resolved against the stored text through the same
   resolver every downstream consumer uses
4. provenance rules **pass** — `resolved`, not `drifted`, not `broken`

The gate is deliberately **shared with the evaluation harness**. If it lived in the command, the
evaluation would measure a reimplementation of the rules rather than the rules, and the two would
drift — which is what makes an evaluation number worse than no number.

### 7.4 Rejections are recorded, countable, and not queued — **F2**

- Reason codes are a **closed set**: `empty_quote`, `quote_not_found`, `ambiguous_citation`,
  `anchor_unverified`. A closed set can be counted; free text cannot.
- Each rejection records the reason, the **match count**, whether a hint was **applied**, and the
  quote's **checksum** — enough to measure recall loss and diagnose, on the pass result and in an
  append-only audit event.
- **The checksum, not the quote.** A rejected item never became evidence, and the audit store is not
  a content store; copying unanchored source text into audit rows would spread classified content
  into records with different handling. Verbatim quotes appear only in the offline evaluation report
  over the synthetic corpus, which is where diagnosis happens.
- **No remediation queue exists**, and a test asserts the absence. A user-facing confirmation flow is
  the later human requirements workspace, and building part of it here would start that slice.

### 7.5 Structural chunking — **F4**

- **Structural first**: whole `SourceUnit`s packed greedily to the budget, so a chunk **cannot split
  a quote a unit contains** and the common case needs no overlap at all.
- **Size fallback only for a single over-budget unit**, with controlled overlap, and a split unit
  never shares a chunk with its neighbours.
- Every chunk records its **id** and its **original source range**, so a proposal from chunk 3 of 7
  traces to the text that produced it. The strategy is **versioned** (`structural-1`), so a recording
  keyed on a different strategy misses rather than replaying wrongly.
- Candidates are gated against the **whole source text**, not the chunk: an anchor must be valid in
  the document, and it also means an overlap-duplicated quote is ambiguous exactly once rather than
  accidentally unique per chunk.
- **A defect the tests caught:** the split originally relied on the capability ladder to name
  `chunked_context`, so a large-context provider would have produced an interaction saying
  `contextMode: 'chunked'` with **no** degradation — a record contradicting itself, and a confidence
  ignoring the split. The broker now accepts **caller-declared degradations**, and the extractor
  declares the split itself (**E4** rules 4 and 5).

### 7.6 Confidence propagation

- Computed by `computeConfidence`, never provider-reported (ADR-0011), and stored with its **function
  version** — a score whose function is unknown cannot be compared to another.
- Migration **`007_evidence_confidence`** adds the three columns and constrains them: a band from a
  closed set, a score in range, all-three-or-none, and **AI-extracted evidence must carry one**.
- The declared `chunked_context` penalty of **0.15** is demonstrably applied: a test compares the
  same document read whole and read in chunks by a large-context provider, and the chunked read is
  strictly less confident.
- **A consequence worth naming:** the new constraint failed three V3 tests, because the vision
  evidence path wrote `extractedBy: 'ai'` with no confidence. The constraint was right and the path
  was inconsistent, so `recordEvidence` now computes confidence for vision evidence too — as
  **`interpreted`** at `page` precision, which lands materially below a text extraction and reaches
  the same conclusion the L2 ceiling reaches by another route (ADR-0038).

### 7.7 Gold-set evaluation — **F1**

`npm run eval:extract` runs the **real** path offline: the real ingestion adapter, the real chunk
planner, the real broker over a **replay** provider, and the real gate.

| Metric | Result |
|---|---|
| Precision · recall · F1 | **100% · 100% · 100%** (7 true positives, 0 false positives, 0 false negatives) |
| Candidates → accepted | 10 → 7 |
| Rejections | `ambiguous_citation`: **2** |
| Unsupported-accepted rate | **0%** — an accepted item absent from its document would be a defect, not a rare event |
| Hallucination rate · anchor resolution | **0%** · **100%** — both are defect detectors, not scores |
| Precision distribution | `exact`: 7 |
| Traps | **2 rejected as required**, **1 not exercised** |
| Corpus tier | **`synthetic`** · `usableForRoutingDecision`: **false** |

- The gold set is **hand-authored and human-reviewed**, and the harness **refuses to run** on a gold
  set that declares any other provenance (**F1**). A gold set generated by the same class of model
  being measured turns evaluation into agreement-with-itself.
- Every expected item names its **expected location**, so a citation to the right sentence in the
  wrong place fails rather than passes.
- The three §4.4 cases are each represented: unique, repeated-but-disambiguated-by-unit, and
  repeated-inside-one-unit.
- **A trap the pass never produced is reported as `notExercised`, never as a pass.** The authored stub
  can only quote text it was given, so the fabrication trap is unexercisable there — it is covered by
  unit test instead, and the report says so rather than counting an absence as evidence.
- **The gold set caught a mistake in itself.** The first trap asserted that a clause repeated across
  two *sections* must be rejected; the stub supplied a verified unit locator, so §4.4 case 2
  legitimately accepted it. The trap was mis-specified, not the code — it was rewritten to repeat a
  clause **inside one unit**, which is the case no locator can resolve.

### 7.8 What V4b-core does NOT establish

> **These numbers measure the pipeline, not a model.** The provider is the authored stub, the corpus
> is synthetic, and the gold set is hand-written. Precision and recall here mean *the extraction
> pipeline agreed with labelled expectations*; they do not mean a model reads real documents well.

**Real model accuracy, precision and recall remain unmeasured**, and V4b-eval is where that changes.
`usableForRoutingDecision` is false on every report, `TIER_WEIGHT` weights `synthetic` at 0.25, and
ADR-0031 rule 4 refuses to accept a prompt change on synthetic evidence alone once a higher tier
exists.

### 7.9 Enforcement added

- Migration **007**: confidence columns with four constraints, including **AI evidence must carry
  computed confidence**.
- `mayBecomeEvidence` as a **type guard**, so the ambiguous case cannot be dereferenced by accident.
- **Caller-declared degradations** on the broker, so a caller-caused degradation cannot be omitted
  from the record.
- The gold-set **provenance check** — the harness refuses non-human ground truth.

### 7.10 Accepted after independent review — and the defect the review found

V4b-core was reviewed against [v4b-proposal.md](v4b-proposal.md) §1 and §4 item by item on
2026-08-23 and **accepted**. Eleven of the twelve acceptance criteria held as written. **Criterion 3
— "no arbitrary occurrence is ever selected" — did not**, in one narrow case, and the fix is part of
the acceptance commit.

**The defect.** `scopesFor` mapped heading text to a code-point range with **first-wins**: when a
document repeated a heading verbatim, the map kept the *first* one. A candidate whose only locator
was that heading therefore received a scope containing exactly one occurrence of a quote that
appeared once under each identical heading, and was accepted at **`exact`** precision — pointing at
the first occurrence. That is the arbitrary pick §4.4 forbids, made eligible by a hint that did not
actually identify anything, which is the same shape as the pre-revision `matches[0]` behaviour V4b-core
was written to remove.

The function's own comment stated the correct rule — *"A document repeating a heading verbatim cannot
be disambiguated by it, so it must not appear to be"* — and the code did the opposite. **The comment
was right.**

**The fix.** A heading text that occurs more than once now resolves to **no scope at all** and is
removed from the map, so the candidate falls through to the ambiguous rejection with its match count
recorded. `unitId` is unaffected: unit ids are unique by construction, and the extraction prompt asks
for `unitId` rather than a heading, which is why this was reachable only through a schema-permitted
locator the prompt does not request.

**Reachability, stated plainly.** No test, no corpus document and no gold-set item exercised it, and
the authored stub supplies `unitId`, so nothing in the delivered numbers changes. It was live rather
than latent — a real provider returning a heading locator on a document with two identically-titled
sections would have produced a confident citation to a location nobody verified.

A regression test asserts both halves — the repeated heading resolves nothing, the unique heading
still resolves — and it was **confirmed to fail against the unfixed code** before being accepted as
evidence. Tests: **621 pass · 0 fail · 0 skipped**.

**No decision was made in fixing it.** §4.4 already says a locator must uniquely identify one
occurrence; a heading naming two sections does not. This is an implementation correction inside the
slice under review, not a change of boundary — and the recall cost is recorded as limitation **61**.

---

## 8. V5 capabilities delivered — structured requirement proposals

**Complete, awaiting review.** Boundary: [v5-proposal.md](v5-proposal.md) and
[phase-2-plan.md](phase-2-plan.md) §3.10. Decisions **J1–J9**. **No new dependency** — runtime
dependencies stay at **seven**.

V5 is the first slice whose AI output is **not verbatim**. V4b could verify its own output
completely — a quote is in the source or it is not. V5 cannot, and §8.9 says so before any number in
this section is read.

### 8.1 `POPULATE_FRAME`, end to end

- Runs through the broker wired in V4a: classification, egress gate, capability negotiation, routing,
  degradation planning, schema-enforced invocation, **one call per pass**.
- The model receives **evidence ids and verbatim text** — no anchors, no offsets, no source names, no
  classifications. It has no use for them, and each is something it could otherwise repeat back as
  though it had verified it.
- The model returns a proposition, a slot, a category and **the evidence ids it rests on**. It
  returns nothing else, because `FramePopulation` has no other field.
- Persisted proposals are `status: 'draft'`, `generatedBy: 'ai'` with their interaction named,
  `epistemicLevel: 'L2'`, and carry computed confidence with its function version.

### 8.2 Six disjointness-closed passes — **J7**

The partition is decided by a **fact about the frame**, not by taste: `DISJOINTNESS_RULES` pairs
`outcomes` with `outputs`, and those live in *different* RAF groups. A group-shaped partition would
ask one call for `outcomes` and another for `outputs`, and a model that cannot see both at once will
legitimately offer the same item to each.

| Pass | Slots | Closes |
|---|---|---|
| **P1** Context & framing | 8 | — |
| **P2** Participants & behaviour | 6 | `actors ↔ responsibilities`, `processSteps ↔ alternativePaths` |
| **P3** Outcomes & data | 4 | **`outcomes ↔ outputs`** — the cross-group pair |
| **P4** Rules & decisions | 2 | — |
| **P5** Time, failure & external | 5 | `exceptions ↔ escalations` |
| **P6** Quality & control | 2 | — |

**27 slots, each in exactly one pass; all four pairs inside a single call.** `RafGroup` is
**unchanged** — a pass is prompting configuration with no persisted structure, which is what makes
regrouping later a configuration change rather than a migration. A test asserts the partition against
the frame, because a partition that silently drifted would drop a slot from every pass, and an empty
slot reads as *"the documents do not say"* — the most misleading thing this system can report.

### 8.3 The proposal gate — **J5**

Four conditions, all of them, in one shared module used by **both** the command and the evaluation:

1. structured output **validates**
2. every cited evidence id **resolves** — in the batch, anchor-verified, and the anchor **re-resolved
   now** through the same resolver every reader uses
3. the slot is **legal** — one of the 27, offered by this pass, and surviving the disjointness rules
4. **derivation rules pass** — ≥1 evidence item (**D2**), classification ≥ the maximum over that
   evidence (**D10**), never `inferred` (**J1**)

Closed rejection reason set, nine codes, because a closed set can be counted and free text cannot.

### 8.4 Nothing V5 writes can look approved — **J4**

Enforced in SQL by migration **008**, not by the command:

- `requirement_status_draft_only` — `status` **must** be `draft`
- `requirement_level_valid` — `L1` or `L2` only; **L4 is unwritable**, and L4 is a human act
- `requirement_derivation_valid` — `extracted` or `interpreted`; **`inferred` is unwritable** (J1)
- `requirement_ai_interaction_present` — AI-generated proposals must name their interaction
- confidence is **not null**, in range, banded, and carries its function version

Tests reach **past the command** and assert the database refuses `approved`, `L4` and `inferred`,
because a claim about SQL proved through the command proves nothing. There is no approve route, no
status route, no edit route and no delete route, and a test asserts eight plausible paths 404.

### 8.5 Everything ungrounded is refused, and refused loudly — **J1**, **J9**

- A proposal citing **no evidence** is rejected as the L3 inference it is, whatever its wording.
- A proposal citing an id it was **not shown** is rejected rather than trusted.
- A cited anchor that **no longer resolves** rejects the proposal (ADR-0008).
- Every rejection is **retained in full — the text, not a checksum** (**J9**), in
  `requirement_rejection` and in the append-only audit event.

**J9 is not a reversal of V4b's F2.** F2 keeps a checksum because a rejected *quote* is unanchored
source content; this is model-authored text, and [ADR-0032](../adr/ADR-0032-retain-everything.md)
names *"rejected proposals and rejected requirements"* explicitly. With limitation **62** outstanding —
no prompt or response payload is retained anywhere — a checksum here would mean a rejected proposal is
retained **nowhere**.

### 8.6 Quality signals are flags, not catalogue rules — **J6**

`vague_quantifier`, `actor_unknown`, `untestable`, plus the provenance-shaped `single_source` and
`content_unverified_evidence`. Rule-raised (`raisedBy: 'rule'`), never model-raised: a model grading
its own output grades it well.

A grounded-but-vague proposal is **persisted with its flags**, not discarded — **J1** in its exact
wording. The validation catalogue gains **`L1-REQ-001…005`**, five *structural* rules, and **no eighth
validation layer**.

### 8.7 Coverage, computed on read — **J3-a**, **J3-b**

`computeFrameCoverage` from `@asdp/raf`, which had existed unused since Phase 0. **No `raf_coverage`
table**: proposals are insert-only, so a stored snapshot goes stale on the next insert, and freezing
one is a **baseline** act that belongs to V7. A test asserts the table does not exist.

`FrameCoverage` has **no `conflicts` field**, so coverage cannot smuggle in reconciliation — which is
the mechanical reason **J3-a** is assessment of the populated frame rather than a piece of V6.

### 8.8 Deduplication is not conflict resolution — **J2**

Identical normalised text **and** an identical evidence set collapse to one proposal. Identical text
on **different** evidence stays two proposals, deliberately: deciding between them is reconciliation,
and reconciliation is V6. `crossSourceAgreement` is **`silent`** on every proposal — not a claim that
the sources agree, but a record that nothing has been compared.

### 8.9 What V5 does NOT establish

> **A proposition can cite real evidence, resolve every anchor, pass every deterministic check, and
> still misrepresent what that evidence says — and it will read *better* than a correct one.** No
> arrangement of mechanical checks detects that. Every number below is a **defect detector**, not a
> quality score.

`npm run eval:frame` runs the **real** path offline — real ingestion, real extraction gate, real batch
planner, real broker over a **replay** provider, **real proposal gate**:

| Metric | Result |
|---|---|
| Proposal precision · recall · F1 | **100% · 88% · 93%** (7 true positives, 0 false positives, 1 false negative) |
| **Slot assignment accuracy** | **45%** (11 scored) — the stub matches marker words; a human labelled the slots |
| Ungrounded-accepted rate | **0%** — impossible by construction, therefore measured |
| Traceability completeness | **100%** · citations checked: 22 |
| Unresolved-citation rate | **0%** |
| Non-draft written | **0** |
| Cross-slot duplicates | **4** — measured, not collapsed (limitation 66) |
| Flags raised | `single_source`: 11 · `actor_unknown`: 4 |
| Coverage | 6 required slots empty and named as G1 blockers · `conflictsDetected: null` |
| Traps | **2 not exercised** — reported as absences, never as passes |
| Corpus tier | **`synthetic`** · `usableForRoutingDecision`: **false** |
| `semanticFaithfulness` | **NOT MEASURED**, and the report says so in a named field |

**The 45% is the most honest number in this section.** The gold set is human-labelled and the stub
matches marker words, so they disagree — which is exactly what a non-vacuous metric looks like. It
measures the stub, not a model. **Recall is bounded by the extractor**, not by the frame: the one
missed proposition rests on a sentence V4b's stub never extracted, because it contains no obligation
marker.

### 8.10 Enforcement added

- Migration **008**: four insert-only tables with the constraints above, including the `draft`-only
  and no-`inferred` rules in SQL.
- The **partition self-check**, asserted by test against the frame itself.
- The **`L1-REQ`** rule family, with positive and negative fixtures per rule.
- The gate **shared** with the evaluation, so the numbers measure the rules rather than a copy.

### 8.11 Accepted after independent review

V5 was reviewed against [v5-proposal.md](v5-proposal.md), [phase-2-plan.md](phase-2-plan.md) §3.10 and
decisions **J1–J9**, item by item, on 2026-08-23 and **accepted**.

**Every decision held as implemented.** The partition matches the approved six passes and was checked
against the frame itself; `packages/raf` is **untouched** since the boundary commit, so `RafGroup` was
demonstrably not redefined; `crossSourceAgreement` is `'silent'` at all three call sites and there is
no code path that could set `'agree'`; `gateProposal` is defined once and imported by **both** the
command and the evaluation harness; the model-owned schema carries exactly five fields — `slot`,
`text`, `category`, `evidenceItemIds`, `modelSelfRating` — and nothing else; and V4b's
`extraction-gate.ts` and `packages/provenance` are **byte-identical** to the boundary commit, so **F2
is unchanged** and a rejected source quote is still retained as a checksum only.

**One gap was found, and it was a gap in coverage rather than in behaviour.** Two approved **J1**
cases — an assumption *the evidence states* being permitted in the `assumptions` slot, and an
assumption *the model invents* being rejected — behaved correctly under direct execution but **no test
protected either**. The authored stub has no marker that maps to `assumptions`, so neither path could
be reached by the corpus, and the distinction they protect is the whole of J1: an assumption a
document states is evidence like any other, while one the model supplies is an L3 inference. Two
tests were added in the acceptance commit. Tests: **664 pass · 0 fail · 0 skipped**.

**What this acceptance claims, and what it does not.** It claims that what should be refused is
refused, that nothing written can look approved, and that every proposal traces to evidence whose
anchor resolved at write time. **It claims nothing about whether a proposition faithfully represents
the evidence it cites** — §8.9, and limitation 63.

---

## 9. V6 capabilities delivered — canonicalisation, conflict candidates, precedence

**Complete, awaiting review.** Boundary: [v6-proposal.md](v6-proposal.md) and
[phase-2-plan.md](phase-2-plan.md) §3.11. Decisions **Q1–Q9**. **No new dependency** — runtime
dependencies stay at **seven**.

V5 wrote `crossSourceAgreement: 'silent'` on every proposal, an honest record that **nothing had been
compared**. V6 compares. What it claims is that **what should stay undecided stays undecided**, and
that no distinct concept is silently merged away. It claims nothing about whether a detected
contradiction is real — §9.8.

### 9.1 `CANONICALISE_ENTITIES` — deterministic first, AI second

- **Exact match-form equality is settled by code before the model is asked**, so the call only ever
  concerns the equivalence folding cannot see. Grouping never crosses `kind`.
- The AI pass proposes **candidates**, and they stay candidates: an AI-proposed merge is a
  **separate, unconfirmed entity** recording which deterministic entities it *would* absorb in
  `mergedFromIds`. **The originals are not removed** — which is what makes the merge reversible and
  what stops a suggestion silently eliminating a business concept (**Q3**).
- `confirmed_by` / `confirmed_at` are refused on insert by migration 009: confirmation is a V7 act.

### 9.2 The five-way classification — **Q8**

`duplicate` · `equivalent` · `complementary` · `potentially_contradictory` · `true_conflict`.

**`true_conflict` is unreachable from V6 by three independent mechanisms**: the AI output schema's
enum excludes it, the gate rejects it with a named reason, and migration 009's check constraint omits
it from the permitted values. Only a human establishes one.

### 9.3 Deterministic precedence — **Q4**, **Q5**

- `computePrecedence` in `@asdp/domain`: authority → effective date → specificity → epistemic level,
  **versioned** (`precedence-1`), pure, and byte-identical across runs.
- **A missing effective date is `not_comparable`** — neither a win nor a loss — so a source with no
  date falls through to the next step rather than losing by default. `L0-ING-010`'s warning becomes a
  live consequence here, reported by `L1-CONF-007`.
- **No tie is ever broken.** Equal authority, equal or incomparable dates, `undetermined` specificity
  and equal level produce `undecidable: true` and no recommendation. Breaking that tie would be the
  `matches[0]` mistake of provenance §4.4 one level up — an arbitrary pick that survives review
  because it looks computed.
- **Specificity is deterministic or `undetermined`**: a strict subset of evidence, or an explicit
  qualifying condition. When the two tests disagree the answer is `undetermined`, not a guess.
- The recommendation is stored as `proposedResolution` with a `precedenceRationale` naming **which
  step decided, on what values**. Nothing applies it, and a test asserts every proposal is unchanged
  after a reconciliation pass.

### 9.4 Conflict candidates are undecided — **Q1**

`decision`, `decidedBy` and `decidedAt` are refused on insert by `conflict_v6_undecided`. There is no
`setDecision` on the port, no decide/resolve/accept/apply route, and a test asserts each returns 404.
Three mechanisms, one invariant.

### 9.5 The reconciliation view — **Q6**, and a defect the tests caught

Computed on read. V5 rows and their stored confidence are **never mutated**; the derived value sits
beside the stored one.

**`corroborated` is unreachable in V6, and that is the correct answer.** An earlier implementation
raised it when a *deterministic canonical entity* tied two propositions resting on different sources
— and a test caught it. That is shared **vocabulary**, not agreement about content: both fixtures name
"the reviewing officer" while stating three days and ten days, so they share an actor *and contradict
each other*. Treating a shared name as corroboration is "absence of detected conflict becomes
agreement" wearing a canonical entity as cover, which is exactly what **Q6** forbids. Corroboration
now requires an `equivalent` classification, which is AI-proposed, which makes it **provisional** —
so V6 records `provisionalCorroboration` and leaves the agreement value alone.

### 9.6 Coverage is untouched — **Q9**

`computeFrameCoverage`, `slotStatus` and `RafGroup` are not reimplemented, not redefined and not
called differently. Conflicts appear in a view **alongside** coverage. Proved by diff at review.

### 9.7 `L1-CONF-*` — seven structural rules

`L1-CONF-001` participants resolve · `002` AI detection is attributed · `003` a recommendation carries
its rationale · `004` **no decision without a human** · `005` undecidable precedence warns · `006` an
unconfirmed merge was used · `007` a contributing source has no effective date.

**No eighth validation layer.** The catalogue is 22 rules across **two** layers: 10 `L0-ING`, 5
`L1-REQ`, 7 `L1-CONF`. **The namespace was not in the approved Q-list** and is implemented on the
**J6** precedent — flagged for confirmation at acceptance, because rule IDs are permanent.

### 9.8 What V6 does NOT establish

> **Whether a detected contradiction is real, and whether two surface forms denote the same business
> concept, are semantic judgements.** No deterministic check settles either, and the evaluation
> reports both as `notMeasured` rather than substituting a number.

`eval:reconcile` over the synthetic corpus: conflict precision **100%**, recall **50%**, false-conflict
**0%**, canonicalisation precision/recall **50%**, over-merge **0%**, precedence **reproducible**,
traps **2 held / 1 not exercised**, tier `synthetic`, `usableForRoutingDecision` **false**.

**The 50% recall and 50% canonicalisation figures are the stub's ceiling, and they are reported rather
than tuned away.** The authored stub compares explicit durations by a marker table and proposes no
semantic merges at all, so it cannot find the fee equivalence (`k2`) or the cross-language actor pair
(`c2`). Making those numbers look better would mean teaching the stub the answers, which is the one
thing that would destroy the measurement.

**A metric defect was found and fixed during implementation.** The first over-merge rate scored *any*
deterministic group the gold set did not list — so merging "the applicant" with "the applicant"
counted as an over-merge, and the harness reported 33%. An over-merge is **folding-driven**: the
denominator is now groups whose members differ by more than case and whitespace, which is the only
place aggressive folding (Teh Marbuta, Alef, diacritics) can do damage.

### 9.9 Enforcement added

- Migration **009**: five tables, all insert-only, with `conflict_v6_undecided`,
  `canonical_entity_v6_unconfirmed`, a classification check omitting `true_conflict`, and
  `conflict_recommendation_explained`.
- The **shared reconciliation gate**, used identically by the command and the harness (**J5**).
- **Rejected candidates retained in full** — **J9** applied to merges and conflict candidates alike.

### 9.10 Accepted after independent review — and the two decisions it settled

Reviewed against [v6-proposal.md](v6-proposal.md), decisions **Q1–Q9**, ADR-0012/0016/0023, the
domain model, the RAF, the epistemic model and the accepted V5 implementation on 2026-08-23, and
**accepted**.

**Four claims were checked by diff or execution rather than by reading:**

| Claim | How |
|---|---|
| **Q9** — V5 coverage untouched | `packages/raf` is **byte-identical** to the V5 acceptance commit `43ab748` |
| **Q6** — V5 rows immutable | `commands/requirements.ts` and `ai/proposal-gate.ts` are byte-identical, and **there is no `UPDATE` statement anywhere in non-test code** |
| **Q8** — `true_conflict` unreachable | Executed: the output schema **refuses** it, the gate rejects it by name, and migration 009 omits it from the permitted values |
| **J5** — one shared implementation | The gate, the canonicaliser and `computePrecedence` are each defined once and imported by **both** the command and the harness |

**The two acceptance-time decisions were approved.** `L1-CONF-*` stays as the permanent namespace,
with no eighth validation layer; comparison stays confined to a RAF slot and its disjointness
partner, recorded as limitation **66** with a named trigger for revisiting it.

**One latent defect was found and fixed.** `L1-CONF-005` — precedence undecidable — fired whether or
not a human had decided the conflict. A **WARNING requires a waiver** to pass a gate
([validation-architecture.md](../40-quality/validation-architecture.md) §1), so in V7 every
human-decided undecidable conflict would have demanded a waiver justifying a condition the human had
already handled: nagging that teaches reviewers to waive without reading. It now fires only while the
conflict is undecided. **Latent in V6, which writes no decided conflicts, and live the moment V7
exists** — a predicate change, not an ID or severity change, so nothing was renumbered. Tests: **714
pass · 0 fail · 0 skipped**.

**What this acceptance claims:** that what should stay undecided stays undecided, that no distinct
concept is silently merged away, and that precedence recommends without ever applying itself.
**What it does not claim:** that any detected contradiction is real, or that two surface forms denote
the same business concept — both reported as `notMeasured`, §9.8.

---

## 10. Accepted HTTP status posture

**Settled, and now fully implemented.**

| Status | Meaning |
|---|---|
| **401** | Unauthenticated, or invalid authentication, where authentication applies |
| **403** | Authenticated but not authorised |
| **404** | Unknown route, or resource not found |

### The 404 change (V0)

An unknown route returns **404 before authentication**, because NestJS routes before guards.
Phase 1 returned **403** before route resolution, concealing whether a route existed.

### The 401 correction (V1)

V0 documented this table but the code did not implement it: the guard returned **403** for absent or
unusable credentials, conflating "we do not know who you are" with "we know who you are and you may
not do this". V1 corrects it.

| Condition | Before | Now |
|---|---|---|
| No `x-asdp-subject` | 403 | **401** |
| Subject with no roles | 403 | **401** |
| Authenticated, wrong role | 403 | 403 — unchanged |
| `ASDP_AUTH_MODE=oidc` with no adapter | 403 | **503** — nothing is wrong with the caller's credentials; the service is configured to require a mechanism it cannot perform |

The 401/403 distinction is not cosmetic: a caller who receives 403 goes looking for a permissions
problem, and one who receives 401 goes looking for a credentials problem. Reporting the wrong one
sends them to the wrong place.

**The 404 behaviour is accepted.** Route names are not secrets in a documented API, and restoring
the Phase 1 ordering would mean fighting the composition layer that
[ADR-0034](../adr/ADR-0034-nestjs-application-layer.md) N1 exists to establish. The Phase 1
behaviour **must not be restored**.

**Known protected routes continue to reject anonymous callers, unchanged.** That guarantee is
untouched by this change and is covered by test.

This supersedes [phase-1-status.md](phase-1-status.md) §6 item 3, which recorded the older
behaviour as correct.

---

## 11. Known limitations

| # | Limitation | Consequence |
|---|---|---|
| 1 | **All AI provider transports are injected stubs.** No live model call has ever been made | Shape, capabilities, routing, degradation and egress guards are tested; *quality* is not measured. Blocked on **OD-1**. Note this is now also **policy, not only an environment constraint**: under **A7** normal CI makes no live AI call, and live evaluation is a separately triggered capability |
| 2 | **ICU collation is inert in PGlite.** It is accepted in DDL but has no effect on ordering — Alef variants do not sort adjacently | DDL portability holds; collation *behaviour* is unverified until a real server runs. Bilingual ordering uses application-side match forms from `@asdp/text`, which is what [ADR-0023](../adr/ADR-0023-unicode-bilingual-architecture.md) already mandated |
| 3 | **No OIDC adapter.** `ASDP_AUTH_MODE=oidc` **rejects** requests rather than trusting them | Correct failure mode, but no real identity provider is exercised |
| 4 | **No durable job queue.** Durability is the point, so an in-memory queue would teach nothing | Deferred to the PostgreSQL container |
| 5 | **Filesystem blob adapter is development-only**, and refuses multi-replica operation | MinIO remains the deployed target |
| 6 | **Test files are emitted into `dist/`** alongside production code | Acceptable for a private monorepo |
| 7 | **A stale `dist/` is a new failure mode** | `npm run verify` sequences the build correctly; `npm run clean` is the fix |
| 8 | **No generation capability of any kind exists** | By instruction. See [phase-2-plan.md](phase-2-plan.md) §7 |
| 9 | **`pgvector` unverified** | Near-duplicate detection is not yet exercisable |
| 10 | **npm workspaces used, not pnpm** — `pnpm` is unavailable | Functionally equivalent; `module-map.md` §1 still says pnpm |

### V1 limitations

| # | Limitation | Consequence |
|---|---|---|
| 11 | **Only UTF-8 free text and Markdown are parsed.** Every other format is refused by name | Deliberate: the V1 boundary. PDF, DOCX and spreadsheets arrive in V2; images in V3 |
| 12 | **UTF-16 sources are refused**, not transcoded | A lossy conversion would corrupt anchors invisibly. The user re-saves as UTF-8 |
| 13 | **Markdown is a block segmenter, not CommonMark.** Setext headings read as paragraphs; table rows become paragraphs rather than per-cell units; a list item is one line, so lazy continuations become their own units | Adequate for requirements documents. Per-cell units arrive with the spreadsheet work in V2 |
| 14 | **The canonical text is stored in a database column**, not a blob | Fine at the V1 size limit. A blob-backed text path will be needed when V2 admits large documents |
| 15 | **Validation runs are not persisted.** `validateIntake` returns findings and a run id, but writes no `validation_run` row | Consistent with the current gate design, which takes finding ids as input. Run storage arrives with G1 in V7 |
| 16 | **Evidence is parser-extracted only** — `extractedBy: 'parser'`, `citationMode: 'none'` | There is no AI in this slice. The AI path adds a value, not a column |
| 17 | **`extractionMethod` is always `'text'`**; `visionPageCount` is always 0 | The fields exist so `L0-ING-007` and `L0-ING-008` are real rules rather than stubs. **A3** populates them in V2/V3 |
| 18 | **Uploads are JSON (`text` or `contentBase64`), not multipart** | Multipart would be a new dependency, and **A4** says avoid unnecessary ones. Base64 costs 4/3 in transport size |
| 19 | **`bounded drift repair` is unreachable in practice today** | With one version of each adapter, any drift is a defect, so `L0-ING-002` treats it as one. The mechanism matters when a second extractor version exists |
| 20 | **The in-memory adapter's unit of work does not roll back** | Stated plainly in `passThroughUnitOfWork`. Rollback is tested against PGlite, where the transaction is real |

### V2 limitations

| # | Limitation | Consequence |
|---|---|---|
| 21 | **No PDF support.** A PDF is refused by name at the guard | V2-PDF, blocked on S2 and ADR-0037 |
| 22 | **No rasterisation.** The `PageRasteriser` port exists and its only binding refuses | Nothing consumes a page image until V3's vision path exists |
| 23 | **Headings are recognised only from English `Heading N` style ids.** A localised style name (`Titre 1`, `عنوان 1`) reads as a paragraph | Not guessed at. A misread heading would restructure the document silently. Style-name mapping is a configuration question, not an extraction one |
| 24 | **Setext-equivalent and outline-numbered headings are not detected**; only paragraph styles are | Same reasoning as above |
| 25 | **Merged table cells are not reconstructed, and table structure is not modelled.** Cells are units in row-major order | Declared in the response `limitations`. `sheet_cell`-style range anchoring belongs with spreadsheet work |
| 26 | **Footnotes, endnotes, comments, headers, footers and embedded images are not extracted** | Each is reported in `limitations` when present, so nothing goes missing silently |
| 27 | **ZIP64, encrypted and spanned archives are refused** | A document over the 10 MiB limit would be refused by size first anyway |
| 28 | **`L0-ING-007` and `L0-ING-008` are still unexercised by real data** | Both concern vision and Arabic PDF reordering. Wiring them to real data is V2-PDF |
| 29 | **A DOCX reports no pages**, so page-level provenance is untested against a paginated format | Correct for DOCX — pagination is a rendering property. First exercised in V2-PDF |
| 30 | **The `docx` source kind is format-shaped, not role-shaped** | Follows the V1 `freetext`/`markdown` precedent. A caller who knows the business role should pass `brd`, `sop` or `policy`. The modelling tension is inherited, not introduced |

### V3 limitations

| # | Limitation | Consequence |
|---|---|---|
| 31 | **No live provider has ever been called.** The vendor transport is covered by **12 offline tests** against an injected `fetch` double — request shape, header and temperature mapping, image resolution, four refusal paths, usage and degradation mapping — and every end-to-end test drives a scripted stand-in | **A7** requires this of CI. Shape, refusals and egress are proven; real vision **quality is unmeasured**, because measuring it requires a live call. *(This limitation previously claimed the transport was tested when it had no test at all — see §5.9 correction 2.)* |
| 32 | **No recorded corpus of real vision responses exists yet** | Replay fixtures are **scripted, not captured**. The first live run against a corpus is what makes that corpus testable offline (ADR-0031). Deferred to V4 by **D6** (§5.10), because there is nothing to capture until a call is made |
| 33 | **Region coordinates are trusted as reported**, then bounds-checked | A model can report a plausible rectangle over the wrong glyphs. Bounds checking catches impossible rectangles, not wrong ones — which is why the L2 ceiling and element-wise confirmation exist |
| 34 | **No visual verification of rendered highlights.** Rectangles are checked numerically, not by rendering | A rectangle can tile a range perfectly and still sit over the wrong pixels. Deferred with V2-PDF's M12, which needs a rasteriser |
| 35 | **One image per source** (`pageNo: 1`). Multi-page images are not modelled | The table supports many; V2-PDF's rasteriser is what will produce them |
| 36 | **Element-wise confirmation is computable but not recorded.** `ceilingFor` reports the obligation; there is no confirmation entity yet | V5 work. V3's job was to make each region individually addressable, which it does |
| 37 | **Ceilings are not yet enforced anywhere**, because no requirements exist to enforce them on | V5. The function and its tests exist so V5 enforces rather than invents |
| 38 | **BPMN import reads names and expressions only** — not lanes' membership, not message flows' endpoints, not full attribute sets | Sufficient for evidence. A fuller model would blur the evidence-only boundary |
| 39 | **`sheet_cell` and `transcript` anchor kinds remain unexercised** | Spreadsheets are a separate proposed capability; interview transcripts arrive with the clarification queue |
| 40 | **An image source stores an empty canonical text** | Deliberate (ADR-0038): the vision transcript is not canonical truth. It means the source viewer has no text to show for an image — only regions |
| 41 | **The broker vision path is not wired into the application.** `createBrokerVisionExtractor` joins vision to the broker, the egress gate, capability negotiation and the interaction record, but **nothing references it**: the composition root wires the refusing extractor, and end-to-end tests inject a scripted stand-in | **Deferred to V4 by D6** (§5.10), not an oversight. It means the egress gate is proven on the Phase 1 harness rather than on V3's own vision path. As composed today the application cannot perform a vision read at all — it refuses, by name, with options |
| 42 | **There is no `ai_interaction` table.** The broker produces the record and the caller is expected to persist it; the intake audit event carries the interaction id, the anchor kind and the attribution, but not the provider, model, capabilities or cost | **Deferred to V4 by D6** (§5.10). Attribution and disclosure are computable today (§5.8); the full per-call record lands with the first broker consumer |
| 43 | **Element-anchor verification checks identity, not the recorded name.** [ADR-0038](../adr/ADR-0038-target-versus-content-verification.md) §5 grounds content verification for structural imports in the element's name being checkable against the stored bytes; the resolver checks that the **element id is present** in the reparsed file and does not compare the quote to the element's current name | An in-place edit that changes a label while keeping ids would resolve `resolved` with a stale quote. Not vacuous — ids are recomputed from the stored bytes every time, so a tampered or truncated file makes cited elements vanish — but **weaker than the ADR states**. Sources are insert-only, so the path requires direct database tampering. An independent expectation is available and unused (`source.textSha256` versus a rehash of the stored text). **Hardening candidate H1** — §5.12 |
| 44 | **`image_region.imageSha256` is optional.** Every anchor V3 mints sets it, but when it is absent verification falls back to the caller-supplied expectation, which in production is read from the same `page_image` row being verified — the vacuous comparison §5.4 fixed | Latent rather than live: no code path mints an image anchor without it. Making the field required, or refusing an image anchor that lacks it, would close the hole mechanically. **Hardening candidate H2** — §5.12 |
| 45 | **No API exposes page images** — no metadata route and no bytes route | A highlight returns `imageId` and `imageRect`, so a client is told *where* the citation is but cannot fetch the image to paint it on. Visual highlighting is therefore not renderable end to end yet. The rectangles are verified numerically, which is what provenance requires; rendering them is viewer work |

### V4a limitations

| # | Limitation | Consequence |
|---|---|---|
| 46 | **No live external model has ever been evaluated, and no credential exists in this environment.** The capture path is built, confined and exercised against the **authored stub**; every recording in the repository is stub-produced | The chain is proven — schema, governance, replay, integration. **Model accuracy, precision and recall are NOT established**, and V4a's acceptance explicitly does not assert them (§6.0). Every fixture and baseline number carries provider id `synthetic-stub` and corpus tier `synthetic`, so the limitation travels with the numbers rather than being a footnote |
| 47 | **The baseline corpus is three authored documents** | Enough to exercise English, Arabic and mixed text through the chain. It is not a sample of anything: `usableForRoutingDecision` is **false** and ADR-0031 rule 4 refuses to accept a prompt change on synthetic evidence once any higher-tier corpus exists |
| 48 | **`PROFILE_SOURCE` output is never used by anything** | Deliberate. It is a proposal, and V4a builds no consumer for it — the pass exists to prove the chain at the lowest possible stakes. A profile that fed a decision would be a substantive claim |
| 49 | **No chunking algorithm.** An over-context source is refused by name (**E4**) | A large document cannot be profiled at all until V4b. Refusing is the honest failure: a profile of the first 120k characters would describe a fragment while reporting `contextMode: full` |
| 50 | **Cost is recorded as the provider reports it, and the stub reports zero** | A cost dashboard built on this today would read zero. The column and the plumbing are real; the numbers arrive with a real provider |
| 51 | **`AiInteraction.egressDecision` is always `permitted` in practice** | A refusal produces no interaction, because nothing was sent. The column exists so a disclosure report does not have to *infer* that egress was evaluated, and a future refusal-recording change has somewhere to write |
| 52 | **The access log misreports domain errors as 500** — §6.7. **Still unfixed, deliberately** | Pre-existing, raised rather than fixed because it is outside the V4a boundary. A 403 is logged at error level and a real fault is indistinguishable from an authorisation refusal |

### V4b-core limitations

| # | Limitation | Consequence |
|---|---|---|
| 53 | **Extraction quality is measured against a hand-authored synthetic gold set, using the authored stub.** Precision, recall and F1 are 100% — of the *pipeline against labelled expectations* | **No model has been measured.** These numbers say the gate accepts what it should and rejects what it must, reproducibly. They say nothing about how well a real model reads a real document, and `usableForRoutingDecision` is false on every report |
| 54 | **The fabrication trap is not exercised by the corpus.** The authored stub can only quote text it was given | Covered by unit test instead, and the report says `notExercised` rather than counting an absence as a pass. A stub that fabricated would be rigged, which is worse |
| 55 | **The gold set is two documents and seven expected items** | Enough to represent all three §4.4 cases and both trap classes. It is not a sample of anything, and ADR-0031 rule 4 blocks accepting a prompt change on it alone once a higher tier exists |
| 56 | **`locateQuote` matching is whitespace-collapsed and match-folded** | A quote differing from the source only in diacritics, Alef form, digit form or line breaking still resolves, which is deliberate (providers reproduce text imperfectly). It also means a quote could in principle match a span that differs from it in exactly those ways — the anchor is over the *stored* text, so the stored span is what a reviewer sees |
| 57 | **Only `unitId` and `heading` locators resolve.** `page` and `section` are recorded and resolve nothing | Correct for V4b-core: a text source has no pages, and `section` names a heading a model may spell differently. `page` becomes resolvable with V2-PDF |
| 58 | **Sentence-level granularity comes from the provider, not the system** | The stub splits on sentence terminators; a real model may return clauses or paragraphs. The gate does not require a particular granularity, so extraction granularity is a *prompt* property and will need measuring against real output in V4b-eval |
| 59 | **Per-pass deduplication is by quote checksum within one source** | Two identical sentences in different sources are two evidence items, correctly. But the same quote extracted twice in one pass collapses to one item, so a document that genuinely states the same obligation in two places yields one citation — the second is reachable only by a manual record |
| 60 | **`crossSourceAgreement` is always `silent`** | Cross-source reconciliation is V6. Confidence therefore never reflects corroboration or contradiction, which is honest rather than neutral: nothing has been compared |
| 62 | **AI prompt and response payloads are not retained anywhere in the domain.** [ADR-0032](../adr/ADR-0032-retain-everything.md) requires retaining "all AI interactions, **including prompt and response payloads**, subject to classification-based access control". Migration `006_ai_interaction` retains **metadata only** — no prompt column, no response column, and a `proposal_id` that references nothing, because no proposal store exists | **A recorded contradiction with an approved ADR**, found while reviewing the V5 boundary on 2026-08-23, **pre-existing from V4a and left unfixed** because expanding an accepted slice to fix unrelated scope is how boundaries stop meaning anything. Recorded fixtures in `@asdp/eval` hold request/response for *replay*, but that is the evaluation corpus, not the domain, and a live call in production writes no payload at all. Today the effect is limited — every interaction is a replay of a fixture that still exists — and it becomes material the moment a live provider is used. **Hardening candidate H3** — §5.12, and the direct reason V5 decision **J9** retains rejected proposal text rather than a checksum |
| 61 | **A repeated heading resolves to no scope at all** — §7.10 | Deliberate, and it costs recall: a quote repeated under two identically-titled sections is rejected as ambiguous even though a reader could tell the sections apart by their position. The alternative was accepting the first occurrence, which is the pick §4.4 forbids. `unitId` resolves it whenever the provider supplies one, and the prompt asks for `unitId` |

### V5 limitations

| # | Limitation | Consequence |
|---|---|---|
| 63 | **Semantic faithfulness is not measured, and cannot be measured here** | The central V5 risk. A proposition may cite real evidence, resolve every anchor, pass every check and still misrepresent what the evidence says. Measuring it needs human labels over representative material; the report carries a named `notMeasured.semanticFaithfulness` field rather than a number. **Human review before L4 is not optional, and V5 changes nothing about that** |
| 64 | **Slot assignment accuracy is 45% against the human-labelled gold set** | It measures the **authored stub's marker table**, not a model. Reported rather than tuned away: a stub adjusted until it agreed with the gold set would turn the metric into a measurement of the tuning |
| 65 | **Recall is bounded by the extractor, not by the frame** | The one missed gold proposition rests on a sentence V4b's stub never extracted, because it contains no obligation marker. V5 can only structure evidence that exists, so an extraction gap reads downstream as a requirements gap |
| 66 | **The same proposition may be proposed into two different slots by two passes** | Four occurrences in the baseline. **Measured, not collapsed:** collapsing would mean choosing a slot on pass order, which is the arbitrary pick §4.4 taught this codebase to refuse. It does inflate per-slot item counts in coverage, and that is the cost of not guessing |
| 67 | **`L1-REQ` message keys have no bilingual message catalogue** | The rule catalogue requires messages and fix hints in both languages. **No message catalogue file exists anywhere in the repository** — the `L0-ING` keys have the same gap, so this is pre-existing rather than introduced. Findings carry keys and parameters; rendering them is UI work no slice has done |
| 68 | **`humanConfirmationRequired` is computed and consumed by nothing** | Deliberate. It records a decision made with the evidence in hand so V7's workspace reads one rather than reconstructing it. Nothing in V5 acts on it, because acting on it would be the workspace |
| 69 | **Evidence batches are counted in items, not tokens** | A batch of 40 evidence items is assumed to fit. With a real provider and long items it might not, and the refusal would be a context error rather than a clean split. The batch size is configuration (`ASDP_FRAME_EVIDENCE_PER_BATCH`), so the fix is a setting until a real model makes the right number knowable |
| 70 | **One proposal per pass per batch is recorded as one interaction** | Six passes over one batch produce six interactions, which is correct and also means the disclosure log grows six times faster per population run than per extraction run. Nothing is hidden; it is simply more rows |

### V6 limitations

| # | Limitation | Consequence |
|---|---|---|
| 64 | **Canonicalisation covers ACTORS only** | A scope choice, not a design limit: actors are what conflicts most often turn on, and one kind proves the chain. The tables and the AI contract are already kind-agnostic, so terms, data entities, rules and events reuse the machinery unchanged. Missed surface forms are counted as missed equivalence |
| 65 | **Surface-form observation is a shallow pattern list, not entity recognition** | Deliberate (**A4**: avoid unnecessary dependencies). It generates candidates; it does not understand. A clever extractor would invite someone to read its output as understanding, and the evaluation measures what it misses |
| 66 | **Comparison is confined to a RAF slot** and its disjointness partner | Cross-slot contradictions are not detected. Widening it would raise recall at a direct cost to the false-conflict rate, which is the metric this slice can least afford to inflate. **Not in the approved Q-list** — raised at acceptance |
| 67 | **`corroborated` is unreachable, so no proposition is ever recorded as corroborated in V6** | Correct under **Q6** — equivalence is AI-proposed and therefore provisional — but it means the reconciliation view can only ever *lower* confidence in practice. Raising it needs V7 confirmation |
| 68 | **The stub proposes no semantic merges and compares only explicit durations** | Canonicalisation recall and conflict recall are 50% against the gold set, and both are the **stub's** ceiling rather than the pipeline's. Tuning the stub to match the gold set would destroy the measurement |
| 69 | **Precedence is computed for every candidate, including `equivalent` ones** | Intentional — an equivalent pair still has an ordering a reader may want — but it means a `proposedResolution` appears on rows where nothing is in dispute, and a reader could mistake it for a finding |

---

## 12. Docker-deferred infrastructure

Docker remains unavailable. Each item below is deferred **with a named trigger**, not dropped
([infra/README.md](../../infra/README.md)).

| Deferred | Trigger |
|---|---|
| PostgreSQL container, and the PGlite → PostgreSQL adapter swap | Docker availability |
| **ICU collation initialisation and behaviour** | Docker availability |
| `pgvector` | Docker availability |
| Image build and layer caching | Docker availability |
| Compose start-up ordering and health gating | Docker availability |
| MinIO object store and bucket bootstrapping | Docker availability |
| OIDC development identity provider; Keycloak realm import (`infra/oidc-realm/` not yet authored) | Docker + the IdP decision |
| Durable job queue | PostgreSQL availability |

Because migrations are plain PostgreSQL-compatible `.sql` files — the same files a container will
run — the swap is expected to be a connection-string change rather than a rewrite. That expectation
is **untested** until Docker exists.

---

## 13. Not started, by instruction

BPMN generation, DMN generation, form generation, Process IR compilation, layout, the
requirements-analysis passes, the Specification Studio, and any graphical process designer.

See [phase-2-plan.md](phase-2-plan.md) §7. The graphical designer is not merely deferred — it is
excluded permanently, because it would reverse
[ADR-0001](../adr/ADR-0001-requirements-driven-product-boundary.md).

---

## 14. Next step

### V3, V4a, V4b-core, V5 and V6 are ACCEPTED. V4b-eval, V2-PDF, V7 and H1/H2/H3 have not started.

| | |
|---|---|
| **V3 — multimodal and structural intake** | **ACCEPTED / COMPLETE**, 2026-08-23, including the §5.9 corrections. Zero new dependencies |
| **V4a — AI broker and live-path foundation** | **ACCEPTED / COMPLETE**, 2026-08-23 — §6. Discharges **D6** items 4, 9 and 10. Zero new dependencies. **Accepted for the foundation, not for extraction quality** — §6.0 |
| **V4b-core — AI evidence extraction** | **ACCEPTED / COMPLETE**, 2026-08-23 — §7, reviewed in §7.10. Discharges the approved V4b-core scope; needed no credential. **Accepted for mechanics and governance, explicitly not model quality** — §7.8 |
| **V5 — evidence to structured requirement proposals** | **ACCEPTED / COMPLETE**, 2026-08-23 — §8, reviewed in §8.11. Decisions **J1–J9**, plan of record [phase-2-plan.md](phase-2-plan.md) §3.10. **Accepted for mechanics and governance, explicitly not semantic correctness** — §8.9. Verified `EvidenceItem`s become structured requirement **proposals** with retained provenance, never approved requirements. **J2** (conflicts stay V6), **J3-a** (coverage pulled into V5) and **J6** (`L1-REQ-*`) **re-cut approved artefacts** and need explicit approval; **J9** retains rejected proposals in full per [ADR-0032](../adr/ADR-0032-retain-everything.md). **Must not begin without approval** |
| **V4b-eval — real-provider evaluation** | **Deferred.** Requires an approved credential and E1-permitted material; it is the first point at which model quality can be claimed |
| **H1 / H2 — provenance hardening** | **Proposed, not approved** — §5.12. Acceptance of V3 was deliberately not held on either |
| **V2-PDF — PDF intake** | **BLOCKED** on a representative Arabic PDF corpus, spike S2, and [ADR-0037](../adr/ADR-0037-binary-document-extraction.md) approval |
| **V4 — AI analysis passes** | **Provisional**, not approved. It now also carries the **D6** deferrals: broker-consumer wiring, recorded fixtures, interaction persistence |

`@embedpdf/pdfium` is still not installed, and `pdf-engine-not-approved` still fails the build on any
PDF engine import — so the V2-PDF block remains mechanical rather than remembered.

| **V6 — conflicts, precedence and reconciliation** | **ACCEPTED / COMPLETE**, 2026-08-23 — §9, reviewed in §9.10. Decisions **Q1–Q9**; `L1-CONF-*` and slot-scoped comparison approved at acceptance. **Accepted for mechanics and governance, explicitly not semantic correctness** — §9.8 |

**V4b-eval, V2-PDF and V7 are not approved. No live provider call is permitted while limitation 62 / H3 stands.**
