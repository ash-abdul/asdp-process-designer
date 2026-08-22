# ADR-0035: Plain Parameterised SQL over PGlite in Development; PostgreSQL in Production

> **Status:** **Approved with conditions** · **Date:** 2026-08-22 · **Reversibility:** Easy
> **Related:** ADR-0016, ADR-0023, ADR-0028, ADR-0029, docs/10-architecture/technology-stack.md
> **Evidence:** Spike S7 — see §2

## Context

Phase 2 is the first phase needing durable state: human review spans sessions, so an in-memory
repository cannot support it. Docker is unavailable, so a PostgreSQL container cannot run.

Two approvals framed the decision. **A2** approved PGlite as the *development* adapter, with
PostgreSQL remaining the production target and the requirement that switching later must not require
domain-model redesign. **A5** ruled that Prisma must not become an architectural dependency until
compatibility with PGlite is proven, and that a materially different approach must be recorded here.

`technology-stack.md` names Prisma as the ORM.

## Spike S7 findings

**Prisma:** there is **no PGlite driver adapter**, official or community. Prisma publishes adapters
for `pg`, Neon, PlanetScale, D1 and libSQL; none targets PGlite. Prisma cannot target PGlite without
building and maintaining a driver adapter ourselves — which is a project, not a configuration.

**PGlite fidelity — 15 of 15 checks passed.** PGlite 0.5.6 is **PostgreSQL 18.3** compiled to
WebAssembly, and everything the domain needs behaves as real PostgreSQL:

| Verified | Result |
|---|---|
| DDL: enums, `jsonb`, `text[]`, `char(n)`, check constraints, foreign keys, indexes | ✔ |
| Parameterised queries; `jsonb` and array round-trip as objects and arrays | ✔ |
| Constraint enforcement: check, primary key, foreign key, enum | ✔ all reject correctly |
| **Transactions with rollback** — required for gate transitions | ✔ |
| Arabic text round-trips byte-exact | ✔ |
| `bytea` round-trip | ✔ |

**One honest gap.** An ICU collation can be **created**, and a column-level `COLLATE` is accepted in
DDL — but it has **no effect on ordering**: Alef variants (`أحمد` / `احمد`) do not sort adjacently, and
results are identical to default byte ordering. DDL portability therefore holds, while collation
*behaviour* remains unverified until a real server runs.

## Decision

1. **Prisma is NOT adopted.** Persistence uses **plain parameterised SQL** with **hand-written,
   forward-only migrations**.
2. **PGlite is the development and CI adapter**; **PostgreSQL remains the production target**. This
   changes no production architecture.
3. All SQL **MUST be PostgreSQL-compatible** and must avoid PGlite-specific behaviour. Migrations are
   plain `.sql` files applied in order — the same files a container will run.
4. Persistence stays **behind the repository ports**. Domain and command code never sees SQL, a
   connection, or a driver type.
5. **Bilingual ordering and comparison MUST use application-side match forms** from `@asdp/text`, not
   database collation. This was already ADR-0023's mandate; S7 confirms it is also the only thing that
   works today.
6. Collation-dependent behaviour is **Docker-deferred** and recorded as such.
7. **Insert-only and append-only semantics are enforced in SQL**, not only in code: no `UPDATE` or
   `DELETE` grant path for `evidence_item`, `audit_event`, `baseline`, `approval`, `release`.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| **Prisma with a hand-built PGlite driver adapter** | We would own and maintain a database driver adapter — far larger than the problem it solves |
| Prisma against a remote hosted Postgres | Reintroduces an external dependency for local development and CI, and cannot run offline |
| Drizzle ORM | Viable, and would work over PGlite — but it is a new dependency and a new architectural commitment when plain SQL over a 20-table schema is sufficient and maximally portable |
| SQLite | Not PostgreSQL. Different `jsonb`, no enums, weaker types — exactly the domain-model divergence A2 forbids |
| Defer persistence entirely | Human review cannot work without durable state |

## Consequences

**Positive**

- **Maximum portability**: plain SQL is the most portable artifact available, so the container swap is
  a connection-string change.
- The production adapter is **real code exercised in CI**, not an unwritten deferral.
- Genuine PostgreSQL semantics — constraints and transactions — behind the ports from day one.
- No ORM abstraction to fight when expressing insert-only tables and content-addressed rows.

**Negative**

- No generated types: row mapping is hand-written and must be covered by tests.
- No migration tooling: migrations are ordered `.sql` files with a recorded applied-version table.
- Query construction is manual, so parameterisation discipline is a review obligation — enforced by a
  checker rule banning string interpolation into SQL.
- Collation behaviour, and any `pgvector` use, remain unverified until Docker.

**If the schema grows past roughly 40 tables, or generated types become the bottleneck, revisit
Drizzle in a new ADR.** Plain SQL is right for this size; it will not be right forever.

## Enforcement

| Mechanism | Enforces |
|---|---|
| Checker rule `sql-injection-guard` | No template-literal or concatenated interpolation into SQL outside a parameter array |
| Checker rule `persistence-confinement` | No `@electric-sql/pglite` import outside the persistence adapter |
| Repository port interfaces | Insert-only repositories expose no update or delete method |
| Migration test | Every migration applies to an empty database and is idempotent in sequence |
| Portability test | Migrations contain no PGlite-specific syntax (grep-level guard against known divergences) |
