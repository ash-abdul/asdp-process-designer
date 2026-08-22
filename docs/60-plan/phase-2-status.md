# Phase 2 — Implementation Status

> **Status:** **V0 complete. V1 not started.** · **Updated:** 2026-08-22
> **Commit:** `8f2a665` — *Phase 2 V0: compiled toolchain, NestJS composition, PGlite persistence, BlobStore*
> **Working tree:** clean at the time of writing
> **Related:** [phase-2-plan.md](phase-2-plan.md), [phase-1-status.md](phase-1-status.md),
> [roadmap.md](roadmap.md)

---

## 1. Position

| | |
|---|---|
| Phase 2 slice completed | **V0 — Foundation** |
| Commit | `8f2a665` |
| Next slice | **V1 — text intake and provenance end to end** — *approved, not started* |
| Tests | **288 pass · 0 fail · 0 skipped · 0 suppressed** |
| Verification | build · `check:arch` (72 files) · checker self-test (22 cases) · `check:docs` (79 files, 413 links) — all clean |
| Durability | Verified by execution: state survives a full service restart |
| New ADRs | [ADR-0034](../adr/ADR-0034-nestjs-application-layer.md), [ADR-0035](../adr/ADR-0035-persistence-plain-sql-pglite.md), [ADR-0036](../adr/ADR-0036-build-toolchain.md) |

Packages: eight — five pure/contract (`schemas`, `text`, `provenance`, `raf`, `domain`), two
adapters (`ai`, `eval`), one application (`api`).

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

## 3. Accepted HTTP status posture

**Settled. Recorded here because it is a behaviour change from Phase 1.**

| Status | Meaning |
|---|---|
| **401** | Unauthenticated, or invalid authentication, where authentication applies |
| **403** | Authenticated but not authorised |
| **404** | Unknown route, or resource not found |

An unknown route now returns **404 before authentication**, because NestJS routes before guards.
Phase 1 returned **403** before route resolution, concealing whether a route existed.

**The 404 behaviour is accepted.** Route names are not secrets in a documented API, and restoring
the Phase 1 ordering would mean fighting the composition layer that
[ADR-0034](../adr/ADR-0034-nestjs-application-layer.md) N1 exists to establish. The Phase 1
behaviour **must not be restored**.

**Known protected routes continue to reject anonymous callers, unchanged.** That guarantee is
untouched by this change and is covered by test.

This supersedes [phase-1-status.md](phase-1-status.md) §6 item 3, which recorded the older
behaviour as correct.

---

## 4. Known limitations

| # | Limitation | Consequence |
|---|---|---|
| 1 | **All AI provider transports are injected stubs.** No live model call has ever been made | Shape, capabilities, routing, degradation and egress guards are tested; *quality* is not measured. Blocked on **OD-1** |
| 2 | **ICU collation is inert in PGlite.** It is accepted in DDL but has no effect on ordering — Alef variants do not sort adjacently | DDL portability holds; collation *behaviour* is unverified until a real server runs. Bilingual ordering uses application-side match forms from `@asdp/text`, which is what [ADR-0023](../adr/ADR-0023-unicode-bilingual-architecture.md) already mandated |
| 3 | **No OIDC adapter.** `ASDP_AUTH_MODE=oidc` **rejects** requests rather than trusting them | Correct failure mode, but no real identity provider is exercised |
| 4 | **No durable job queue.** Durability is the point, so an in-memory queue would teach nothing | Deferred to the PostgreSQL container |
| 5 | **Filesystem blob adapter is development-only**, and refuses multi-replica operation | MinIO remains the deployed target |
| 6 | **Test files are emitted into `dist/`** alongside production code | Acceptable for a private monorepo |
| 7 | **A stale `dist/` is a new failure mode** | `npm run verify` sequences the build correctly; `npm run clean` is the fix |
| 8 | **No generation capability of any kind exists** | By instruction. See [phase-2-plan.md](phase-2-plan.md) §7 |
| 9 | **`pgvector` unverified** | Near-duplicate detection is not yet exercisable |
| 10 | **npm workspaces used, not pnpm** — `pnpm` is unavailable | Functionally equivalent; `module-map.md` §1 still says pnpm |

---

## 5. Docker-deferred infrastructure

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

## 6. Not started, by instruction

BPMN generation, DMN generation, form generation, Process IR compilation, layout, the
requirements-analysis passes, the Specification Studio, and any graphical process designer.

See [phase-2-plan.md](phase-2-plan.md) §7. The graphical designer is not merely deferred — it is
excluded permanently, because it would reverse
[ADR-0001](../adr/ADR-0001-requirements-driven-product-boundary.md).

---

## 7. Approved next step

### V1 — text intake and provenance end to end

The first slice in which the Phase 1 provenance machinery gets a real consumer.

| Deliverable |
|---|
| **Ingest guard** — type sniffing by magic bytes, size limits, SHA-256 dedupe, immutable blob storage |
| **Free-text and Markdown adapter** producing `SourceUnit`s with verified, resolvable anchors |
| New schemas `Source`, `SourceUnit`, `EvidenceItem`, plus migration `002` |
| **Source inventory** with human-set **authority ranking** — the deterministic input to conflict precedence |
| **Source viewer API** returning highlight ranges, including RTL Arabic spans |
| **L0 validation rules** `L0-ING-001 … L0-ING-010`; an unresolvable anchor is a **hard error** |

**No new decisions and no new dependencies are required.**

**V1 has not started.** Per [CLAUDE.md](../../CLAUDE.md) §11, it does not begin without explicit
approval.
