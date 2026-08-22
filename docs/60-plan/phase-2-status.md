# Phase 2 — Implementation Status

> **Status:** **V0 and V1 complete and accepted. V2 approved: DOCX portion ready, PDF portion blocked on spike S2.** · **Version:** 2.2 · **Updated:** 2026-08-23
> **Working tree:** clean at the time of writing
> **Related:** [phase-2-plan.md](phase-2-plan.md), [phase-1-status.md](phase-1-status.md),
> [roadmap.md](roadmap.md)

---

## 1. Position

| | |
|---|---|
| Slices completed | **V0 — Foundation** · **V1 — Text intake and provenance end to end** |
| Next slice | **V2 — binary document intake** — boundary **APPROVED** 2026-08-23. **DOCX portion unblocked; PDF portion blocked** on spike S2 and [ADR-0037](../adr/ADR-0037-binary-document-extraction.md). A split into V2 / V2-PDF is **proposed** — [phase-2-plan.md](phase-2-plan.md) §3.4 |
| Tests | **415 pass · 0 fail · 0 skipped · 0 suppressed** (288 at V0) |
| Verification | build · `check:arch` (91 files) · checker self-test (24 cases) · `check:docs` (84 files, 592 links) — all clean |
| Durability | Verified by execution: sources, text, units and evidence survive a full service restart, **and anchors minted before the restart still resolve after it** |
| New ADRs | [ADR-0034](../adr/ADR-0034-nestjs-application-layer.md), [ADR-0035](../adr/ADR-0035-persistence-plain-sql-pglite.md), [ADR-0036](../adr/ADR-0036-build-toolchain.md) — all in V0. **V1 added no ADR: it required no new architectural decision** |
| Decisions | **A1–A7 all approved** — see [phase-2-plan.md](phase-2-plan.md) §4 |
| Slices V3–V7 | **Provisional.** Capability sequence only; each requires approval of its boundary before it begins — [phase-2-plan.md](phase-2-plan.md) §3.5 |

Packages: **ten** — six pure/contract (`schemas`, `text`, `provenance`, `raf`, `domain`,
`validation`), three adapters (`ingestion`, `ai`, `eval`), one application (`api`).

| Slice | Commit |
|---|---|
| V0 | `8f2a665` — *compiled toolchain, NestJS composition, PGlite persistence, BlobStore* |
| V1 | `922761a` — *text intake, provenance, source viewer, L0-ING rules* · **accepted** |

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

## 4. Accepted HTTP status posture

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

## 5. Known limitations

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

---

## 6. Docker-deferred infrastructure

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

## 7. Not started, by instruction

BPMN generation, DMN generation, form generation, Process IR compilation, layout, the
requirements-analysis passes, the Specification Studio, and any graphical process designer.

See [phase-2-plan.md](phase-2-plan.md) §7. The graphical designer is not merely deferred — it is
excluded permanently, because it would reverse
[ADR-0001](../adr/ADR-0001-requirements-driven-product-boundary.md).

---

## 8. Next step

### V2 — boundary approved, split proposed

The V2 boundary was approved on 2026-08-23 ([phase-2-plan.md](phase-2-plan.md) §3.1). Implementation
has **not** started.

Spike **S2** was run before implementation, as [roadmap.md](roadmap.md) §3 requires. It settled the
library comparison but **could not produce the deciding number** — the exact-precision yield rate for
Arabic — because the fixtures available were synthetic and badly produced. On 2026-08-23 the decision
was taken to **finish S2 against representative Arabic PDFs before implementing PDF support**, rather
than approve [ADR-0037](../adr/ADR-0037-binary-document-extraction.md) on synthetic evidence.

| Portion | State |
|---|---|
| **DOCX + the A3 abstractions** | **Ready to proceed.** No new dependency, no open decision. A DOCX stores logical order by construction, so the question S2 exists to answer does not arise |
| **PDF adapter, rasterisation, `pdf_region` anchors, `L0-ING-007`/`008`** | **BLOCKED** on S2 completion **and** ADR-0037 approval. `@embedpdf/pdfium` **is not added** |

### What is needed to unblock PDF

**2–3 representative Arabic PDFs.** The exact characteristics, sanitisation rules, success criteria,
measurement protocol, and a **pre-registered decision rule** are specified in
[s2-corpus-request.md](s2-corpus-request.md).

The sanitisation rule that matters most: **sanitisation must not repair the document.** Re-exporting
a file through Word produces a well-formed PDF and destroys the only property S2 measures. A
re-exported sample is worse than a missing one, because it yields a confident and wrong number.

### Proposed sequencing change

Because the material has no committed date, [phase-2-plan.md](phase-2-plan.md) §3.4 proposes
splitting the approved scope into **V2 (DOCX)** and **V2-PDF**. Nothing is added to or removed from
the approved scope; only the order changes. **Awaiting approval.**

**Do not implement PDF support or add the PDF runtime dependency until S2 is complete and ADR-0037 is
approved.**
