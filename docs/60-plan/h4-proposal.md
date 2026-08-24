# H4 — Project-Scoped Requirement Identity · ✅ BOUNDARY APPROVED

> **Status: BOUNDARY APPROVED 2026-08-24. NOT YET IMPLEMENTED, NOT YET ACCEPTED.**
> **K1–K6 and K8 approved. K7 NOT APPROVED for this boundary.** The approved boundary below is
> binding: only what **K1–K6** and **K8** authorise may be built, per §11 of
> [CLAUDE.md](../../CLAUDE.md). Implementation does not confer acceptance — acceptance is a
> separate act, on the record, after verification.
>
> **K8 carries an approval clarification that changes Phase 2's exit condition.** **H5 /
> limitation 78 is now a blocker to Phase 2 closure**, because durable multi-project G1 must
> keep working after an application restart. **Phase 2 stays open after H4 is accepted**, until
> H5 is separately analysed, approved, implemented and accepted.
> **Version:** 1.0 · **Written:** 2026-08-24 · **Approved:** 2026-08-24 · **Against commit:** `e8c1309`
> **Closes:** limitation **77**, hardening candidate **H4** —
> [phase-2-status.md](phase-2-status.md) §5.12
> **Related:** [phase-2-status.md](phase-2-status.md) §0, [phase-2-plan.md](phase-2-plan.md),
> [v5-proposal.md](v5-proposal.md), [v7-proposal.md](v7-proposal.md),
> [ADR-0017](../adr/ADR-0017-approval-as-baseline-signature.md),
> [ADR-0035](../adr/ADR-0035-persistence-plain-sql-pglite.md),
> [ADR-0016](../adr/ADR-0016-immutable-content-addressed-artifacts.md),
> [ADR-0032](../adr/ADR-0032-retain-everything.md),
> [ADR-0008](../adr/ADR-0008-resolvable-anchors.md),
> [domain-model.md](../20-domain/domain-model.md) §3–§4,
> [traceability-model.md](../20-domain/traceability-model.md),
> [versioning-and-baselines.md](../20-domain/versioning-and-baselines.md)

---

## 1. The defect, reproduced against `e8c1309`

`requirement.id` is `text primary key` — **globally** unique (migration
`008_requirements.sql`, commit `4b148b4`). `nextRequirementNumber` takes the high-water mark **per
project**, which is what invariant **D15** requires: *"Requirement IDs are allocated from a
per-project monotonic sequence and are never reused"*
([domain-model.md](../20-domain/domain-model.md) §D15). The key and the allocator disagree.

Reproduced twice on 2026-08-24 against the current tree.

**At SQL level** — two projects, one database, migrations 001–012 applied:

```
project A REQ-0001: inserted
project B REQ-0001: FAILED -> duplicate key value violates unique constraint "requirement_pkey"
project B high-water mark: 0 => would allocate REQ-0001 again
```

**End to end over HTTP**, through the real application graph (replay provider over the authored
stub, one server, one database, two projects):

```
project A: create 201 · ingest 201 · extract 201 · POPULATE_FRAME 201  (REQ-0001 …)
project B: create 201 · ingest 201 · extract 201 · POPULATE_FRAME 503
                                                    {"error":"database unavailable","kind":"database"}
```

**A second project therefore cannot produce a single requirement, and so can never reach G1.** Every
test to date uses one project per server, which is why it stood.

### 1.1 Two further facts the reproduction established

Both are **new**, neither is recorded anywhere in the repository, and both are reported here because
they were found while analysing H4 — not because they belong in its boundary.

| # | Fact | Evidence |
|---|---|---|
| **F-a** | **The D15 message is destroyed before it reaches the caller.** `insertProposal` catches `UniqueViolationError` and rethrows `requirement REQ-0001 already exists; requirement ids are never reused (D15)`. `PgliteDatabase.transaction` then re-maps **every** error escaping the callback through `mapDriverError`, which flattens anything unrecognised to a generic `DatabaseError` → **HTTP 503 `database unavailable`**. The mapping is also **redundant**: `query` and `exec` already map driver errors at the driver boundary | [pglite-database.ts:66](../../apps/api/src/persistence/pglite-database.ts) versus [pglite-database.ts:36](../../apps/api/src/persistence/pglite-database.ts) and [requirement-repositories.ts:277](../../apps/api/src/persistence/requirement-repositories.ts) |
| **F-b** | **The access log records the same request as 500 while the response body is 503.** This is limitation **52** (§6.7), previously recorded and unfixed, now confirmed on a second path | Probe output: `{"level":"error","msg":"http_request",…,"status":500}` alongside a `503` response |

---

## 2. A second defect in the same family — **H5**, found during this analysis, NOT in this boundary

Every surrogate id in the system is minted by `counterIdGenerator` — a **per-process** counter with
no persistence — and written into a **global** primary key. `composition.ts:78` wires it for the
PGlite adapter, not only for tests.

Reproduced on 2026-08-24 against a **persistent** `dataDir`:

```
session 1:                  minted prj-0001 for alpha — ok
session 2 (after restart):  minted prj-0001 for beta  — FAILED
                            -> duplicate key value violates unique constraint "project_pkey"
```

This affects **47 call sites** across 11 prefixes (`prj`, `src`, `su`, `ev`, `img`, `aud`, `bl`,
`ap`, `rqs`, `rej`, `rfl`, `cen`, `cal`, `cfl`, `rel`, `rrj`, `oq`, `pak`, `vr`, `bsl`, `apr`, `spb`)
— in effect, **the first write of any kind after a restart collides** against a durable database.
It does not bite today only because `ASDP_DATABASE_DIR` is optional and unset means in-memory, so
every restart is currently a fresh database. It becomes universal the moment PostgreSQL is the
target (**A2**, [ADR-0035](../adr/ADR-0035-persistence-plain-sql-pglite.md)).

**Why it is named here and not fixed here.** It is a different defect with a different cause: H4 is
*wrong key scope*, H5 is *wrong allocator lifetime*. It also matters to how H4 is decided —
see **K2** — because one of the two candidate shapes for H4 would introduce a new surrogate
allocator and inherit H5 by construction.

**Proposed: record H5 as a new limitation and a new hardening candidate, and decide it separately
(decision K8).** Folding it in would roughly double this boundary and is exactly the expansion §11
of [CLAUDE.md](../../CLAUDE.md) exists to prevent.

> **What this means for the sentence "multiple projects can independently reach G1":** after H4 it is
> true **within one process lifetime**. It is not true **across a restart against a durable
> database** until H5 is also closed. That distinction must be stated in the checkpoint when H4 is
> accepted, or the record will overclaim.

---

## 3. The candidate shapes, evaluated

§5.12 records two. A third and a fourth are named here so the rejection is on the record rather than
assumed.

### 3.1 Option A — composite key `(project_id, id)` · **RECOMMENDED**

`requirement`'s primary key becomes `(project_id, id)`. `REQ-0007` stays `REQ-0007`, and stays the
requirement's only identity. Every foreign key into `requirement` is re-pointed at the composite.

| | |
|---|---|
| **Requirement identity** | **Unchanged.** One identity, exactly as [domain-model.md](../20-domain/domain-model.md) §3, [traceability-model.md](../20-domain/traceability-model.md) and [versioning-and-baselines.md](../20-domain/versioning-and-baselines.md) already describe it |
| **D15** | **Satisfied, not amended.** The code moves to match the specification rather than the specification moving to match the code |
| **ADR-0017 signatures** | **Preserved by construction.** A baseline member is `{artifactId: r.id, versionId: '${r.id}@${r.version}', contentHash: textContentHash(r.text)}` ([review.ts:1145](../../apps/api/src/commands/review.ts)). None of the three inputs changes, so no existing signed hash moves |
| **API surface** | **Unchanged.** Every requirement route is already nested under `:projectId` — `POST /projects/:projectId/requirements/:requirementId/review` and the rest. The composite key is the shape the HTTP layer already has |
| **Ownership checking** | **Becomes structural.** Four call sites in [review.ts](../../apps/api/src/commands/review.ts) currently check `requirement.projectId !== input.projectId` by convention. Under a composite key the wrong project simply does not resolve |
| **New allocator** | **None.** Does not touch, depend on, or inherit **H5** |
| **Cost** | The widest SQL change of the four: 1 primary key, 6 foreign keys, 2 new columns, 2 further key/unique redefinitions, and a port-signature change from `get(id)` to `get(projectId, id)` |

### 3.2 Option B — global surrogate key, `REQ-####` as a display identifier · **NOT RECOMMENDED**

`requirement.id` becomes an opaque surrogate; `REQ-####` becomes a separate column unique per
`(project_id, number)`. Foreign keys are untouched.

It **looks** smaller and is not, for four reasons — the first of which §5.12 already names:

1. **It changes what a baseline member names.** `artifactId` and `versionId` are built from `r.id`.
   If `r.id` becomes the surrogate, **every existing ADR-0017 signature covers a hash that can no
   longer be recomputed**. The hash *can* be held stable by deliberately mapping `artifactId` to the
   display id instead — but that turns a construction guarantee into a convention, and the
   convention is invisible: any later code reaching for `r.id` in a citation or trace string
   silently moves the hash. That is precisely the failure mode
   [ADR-0017](../adr/ADR-0017-approval-as-baseline-signature.md) exists to make impossible.
2. **It inherits H5.** The surrogate has to come from somewhere. `ctx.ids.next('req')` is the
   existing allocator and it is per-process — so on a durable database Option B is **broken on
   restart by construction** unless H5 is closed first. Deriving the surrogate instead (for example
   `${projectId}/REQ-0001`) is Option A with string concatenation standing in for a real key, and it
   makes every join and every parse brittle.
3. **It gives a requirement two identities.** One for foreign keys, one for humans, hashes,
   citations and every document in `docs/20-domain/`. Someone will use the wrong one.
4. **It requires the documentation to change.** [domain-model.md](../20-domain/domain-model.md)
   §D15 and line 156, [traceability-model.md](../20-domain/traceability-model.md) §89 and
   [versioning-and-baselines.md](../20-domain/versioning-and-baselines.md) §23 all state that
   `REQ-####` **is** the identifier. Under Option B they become false and must be rewritten. Under
   Option A they stay true unchanged. §10 of [CLAUDE.md](../../CLAUDE.md) treats a document that
   contradicts the code as a defect; a change that creates that contradiction deliberately needs a
   much stronger reason than key ergonomics.

### 3.3 Option C — allocate `REQ-####` from a **global** sequence · **REJECTED**

One line: change `nextRequirementNumber` to take the high-water mark across all projects. No
migration at all.

**Rejected.** It directly contradicts invariant **D15** (*"a per-project monotonic sequence"*), and
it leaks: project B's first requirement would be numbered `REQ-0042` because forty-one requirements
exist in projects its analysts cannot see. It would require amending D15 and three domain documents
to make a cross-tenant information leak into the specification. It is the cheapest option and the
worst one.

### 3.4 Option D — a project-key prefix inside the id, e.g. `ACME-REQ-0001` · **REJECTED**

Changes what a baseline member names (same defect as Option B §1), changes every identifier already
written, and binds a mutable `project.key` into an immutable identifier. Rejected on
[ADR-0016](../adr/ADR-0016-immutable-content-addressed-artifacts.md) grounds alone.

---

## 4. The approved decisions **K1–K8**

**Option A was recommended and is approved.** It is not the smallest diff; it is the smallest
**boundary** — the one that closes the defect without changing what a requirement is, what a
signature covers, or what any approved document says.

**Approved 2026-08-24. K1–K6 and K8 approved; K7 NOT APPROVED for this boundary.** The
`Disposition` column is the decision of record; the `Rationale` column is why it was proposed.

| # | Decision | Disposition | Rationale |
|---|---|---|---|
| **K1** | **`requirement`'s primary key becomes `(project_id, id)`.** `REQ-####` remains the requirement's single identity and remains per-project monotonic under **D15** | **APPROVED** | One identity. The specification does not move |
| **K2** | **No new surrogate identifier is introduced, and no new id allocator is introduced** | **APPROVED** | Keeps **H5** out of this boundary rather than inheriting it |
| **K3** | **Allocation is routed through the existing `allocateD15_requirementId` in `@asdp/domain`.** The two inline `REQ-${String(n).padStart(4,'0')}` sites — [requirements.ts:425](../../apps/api/src/commands/requirements.ts) and [review.ts:466](../../apps/api/src/commands/review.ts) — are replaced by calls to it | **APPROVED** | The domain package already exports the allocator and the non-reuse assertion, and nothing calls them. A duplicated allocator is how the key and the allocator drifted apart in the first place |
| **K4** | **`RequirementRepository` methods that address a requirement take `projectId` explicitly**: `get(projectId, id)`, `evidenceFor(projectId, requirementId)`, and the V7 write paths | **APPROVED** | Makes ownership structural rather than a convention repeated at four call sites |
| **K5** | **The ADR-0017 baseline-member mapping is not changed, and a test asserts that it has not.** `artifactId`, `versionId` and `contentHash` keep their current construction | **APPROVED** | The guarantee that existing signatures still verify must be *tested*, not asserted in prose |
| **K6** | **Migration `013_requirement_project_scope.sql` backfills `project_id` on the two child tables that lack it, by join, and is additive to data** | **APPROVED** | No row is deleted, no id is renumbered. **D15**, [ADR-0016](../adr/ADR-0016-immutable-content-addressed-artifacts.md) and [ADR-0032](../adr/ADR-0032-retain-everything.md) are untouched |
| **K7** | **`PgliteDatabase.transaction` stops re-mapping errors that are not driver errors** (fact **F-a**) | **NOT APPROVED for H4.** A separate concern, not required to fix limitation 77. **Recorded separately as limitation 79 / candidate H6** and explicitly **not implemented in this boundary** | Was proposed as small and in-family. The approval is that smallness is not a reason to carry an unrelated status-code change inside a boundary — §12 of [CLAUDE.md](../../CLAUDE.md) governs status codes, and F-a is a defect in its own right |
| **K8** | **H5 is recorded as a new numbered limitation and a new hardening candidate, and is NOT implemented in this slice** | **APPROVED WITH CLARIFICATION.** Recording approved; keeping it out of H4 approved. **The clarification: H5 is a BLOCKER to Phase 2 closure**, because durable multi-project G1 must survive an application restart. **Phase 2 remains open after H4 is accepted**, until H5 is separately analysed, approved, implemented and accepted | Naming the residue is the difference between a closed defect and a concealed one. The clarification goes further than the proposal did: the proposal treated the restart caveat as something to *state*; the approval makes it something that *blocks* |

---

## 5. Scope

### 5.1 In scope

| Area | Change |
|---|---|
| **Migration 013** | `requirement` PK → `(project_id, id)`. `requirement_evidence` and `canonical_entity_alias` gain `project_id` (backfilled by join) and composite foreign keys. `requirement_flag`, `conflict`, `requirement_relation` and `requirement_version` already carry `project_id` and only need their keys and foreign keys redefined |
| **`requirement_version`** | Primary key `(requirement_id, version)` → `(project_id, requirement_id, version)`. Two projects each revising their own `REQ-0001` to v2 collide today |
| **`requirement_relation`** | `unique (from_id, to_id, kind)` → `unique (project_id, from_id, to_id, kind)` |
| **`@asdp/domain`** | `allocateD15_requirementId` and `assertD15_notReused` become the only allocation path (**K3**) |
| **`RequirementRepository` port** | `projectId` added to the addressing methods (**K4**), in `ports.ts`, `requirement-repositories.ts` and `repo-memory.ts` |
| **Commands** | `requirements.ts` and `review.ts` updated for the new signatures; the four conventional ownership checks kept as belt-and-braces, not removed |
| **Architecture checker** | One new rule (§10) |
| **Documentation** | [phase-2-status.md](phase-2-status.md) §0, §5.12, §12; this document's status line; [phase-2-plan.md](phase-2-plan.md); [docs/README.md](../README.md) |

### 5.2 Explicitly out of scope

- **H5** — the per-process id allocator (**K8**). Recorded as limitation **78**, not built.
  **It blocks Phase 2 closure** (K8's approval clarification), so Phase 2 stays open after H4.
- **K7 / fact F-a** — the transaction error re-mapping that flattens a domain error to `503`.
  **NOT APPROVED for this boundary.** Recorded as limitation **79** / candidate **H6**, not built.
- **H1, H2, H3** — unrelated hardening candidates, still proposed and unapproved.
- **Limitation 52** — the access log misreporting domain errors as 500. Confirmed again by fact
  **F-b**; still not this slice.
- **Limitation 76** — the unenforced project `classificationCeiling`. Raise with H3.
- **`conflict_participant`**, **`canonical_entity.requirement_ids`**, **`open_question.cause_id`** —
  none is a foreign key and each is already scoped by its parent row's `project_id`. They need
  **code-level** resolution changes (join through the parent's project), not schema changes.
- **Phase 2 closure.** A separate act, after acceptance.
- **P3.** Not proposed, not approved, must not begin.

---

## 6. Migration impact

### 6.1 The ripple, enumerated

Six foreign keys reference `requirement(id)`. Two of their tables lack `project_id`; four already
have it.

| Table | Column(s) | Has `project_id`? | Change |
|---|---|---|---|
| `requirement_evidence` | `requirement_id` | **No** | Add column, backfill, PK → `(project_id, requirement_id, evidence_item_id)`, composite FK |
| `canonical_entity_alias` | `requirement_id` | **No** | Add column, backfill, composite FK |
| `requirement_flag` | `requirement_id` | Yes | Composite FK only |
| `conflict` | `recommended_requirement_id` | Yes | Composite FK only |
| `requirement_relation` | `from_id`, `to_id` | Yes | Two composite FKs, and the unique constraint |
| `requirement_version` | `requirement_id` | Yes (no FK) | PK → `(project_id, requirement_id, version)` |

### 6.2 Existing data

**The backfill is total and unambiguous, and it is only safe while it is.** `requirement.id` is
globally unique *today*, so `project_id` for every child row is recoverable by a single join. The
moment a duplicate `REQ-0001` exists in the database — which is precisely what this change permits —
the backfill becomes ambiguous.

> **Migration 013 is a one-way door and must run before any duplicate id exists.** It is safe at
> `e8c1309` and stays safe until the change itself lands.

No row is deleted. No id is renumbered. No existing baseline, approval or audit row is touched.
`ADR-0016`, `ADR-0032` and **D15** are all preserved.

### 6.3 PGlite and PostgreSQL

Migrations are plain PostgreSQL-compatible `.sql` files (**A2**,
[ADR-0035](../adr/ADR-0035-persistence-plain-sql-pglite.md)). Composite primary keys and composite
foreign keys are standard SQL; the arithmetic is that `alter table … drop constraint … add
constraint` must be spelled explicitly, which is what this codebase already does. **This is
untested against a real PostgreSQL server, as everything here is, until Docker exists** (§13 of
[phase-2-status.md](phase-2-status.md)).

---

## 7. ADR-0017 — what a signature covers, before and after

A baseline member today ([review.ts:1145](../../apps/api/src/commands/review.ts), and identically at
`review.ts:1479`):

```
artifactId:  r.id                      // "REQ-0007"
versionId:   `${r.id}@${r.version}`    // "REQ-0007@2"
contentHash: textContentHash(r.text)
```

Under **K1** none of the three changes: `r.id` is still `REQ-0007`. `requirementSetHash` therefore
returns the same digest for the same content, and **every existing approval signature continues to
verify against the set it signed**.

`baseline_member`'s own primary key is `(baseline_id, artifact_id)`, and `baseline.project_id`
already scopes it — so two projects each holding a `REQ-0001` produce members in two different
baselines and never collide.

**K5** requires this to be proved by a test that freezes a set, applies migration 013, and
recomputes the hash — not asserted in prose.

---

## 8. Acceptance criteria — **APPROVED**

H4 is complete when **all** of the following hold. Criteria **A1–A10** are the approved minimum
stated at approval on 2026-08-24 and are binding; **9**–**11** are the proposal's additional
criteria, retained.

### 8.1 The approved minimum — A1–A10

| # | H4 acceptance must prove |
|---|---|
| **A1** | Two projects in the **same database** can each create their own `REQ-0001` |
| **A2** | Both can **independently reach G1** |
| **A3** | Requirement lookups are **structurally** project-scoped |
| **A4** | **No cross-project evidence linkage** is possible |
| **A5** | **No cross-project baseline membership** is possible |
| **A6** | Independent **revision / version histories** work for identical `REQ` numbers |
| **A7** | **Reconciliation / conflict references** resolve within the correct project |
| **A8** | The migration **preserves all existing requirement IDs** |
| **A9** | **Pre-H4 ADR-0017 baseline hashes and signatures remain unchanged** |
| **A10** | **All existing V0–V7 tests remain green** |

### 8.2 Retained proposal criteria

| # | Criterion |
|---|---|
| **1** | **Two projects in one database each reach G1 `approved`, independently, in one server lifetime.** The end-to-end proof, and the criterion Phase 2 closure rests on |
| **2** | Both projects' first requirement is `REQ-0001`. Numbering is per project and restarts at 1 for each — **D15** as written |
| **3** | `POPULATE_FRAME` for the second project returns **201**, not 503 |
| **4** | A baseline frozen before migration 013 and rehashed after it produces the **identical** `contentHash`, and an approval signed before it still verifies (**K5**) |
| **5** | Every existing V0–V7 test passes **unchanged in its assertions**. No test is skipped, loosened or deleted (§9 of [CLAUDE.md](../../CLAUDE.md)). Signature changes to test *helpers* are permitted; changes to what a test asserts are not |
| **6** | Addressing a requirement under the wrong `projectId` returns **404**, and does so because the composite key does not resolve — not only because a convention check fired |
| **7** | Requirement allocation goes through `allocateD15_requirementId`; no inline `REQ-` template literal remains outside `@asdp/domain` (**K3**), and the architecture checker enforces it (§9) |
| **8** | `npm run verify` is green end to end on a clean tree, with **no live provider call** (**A7**) |
| **9** | The checkpoint states what is closed **and what is not** — H5, and the restart caveat on the multi-project claim (**K8**) |

---

## 9. Required tests

Existing helpers make most of this small: [review.test.ts](../../apps/api/src/review.test.ts)
already has `projectWithProposals` and `projectWithEvidenceOnly`, and a `projectSequence` counter
that exists specifically because two projects can be created inside one millisecond.

| # | Test | Why it must exist |
|---|---|---|
| **T1** | **Two projects, one database, both to G1 `approved`.** `projectWithProposals` twice, `makeReady` twice, `approveG1` twice | The defect. Nothing else proves it closed |
| **T2** | **Both projects' first requirement is `REQ-0001`**, and each project's second is `REQ-0002` | D15 as written, not merely "no collision" |
| **T3** | **The V7 workspace acts are project-scoped**: accept, revise, add-inferred, confirm-inference, resolve-flag and answer-question, each performed on project B's `REQ-0001` while project A's `REQ-0001` exists — and each leaves project A's row untouched | The composite key's real risk is a write landing on the wrong project's row. Six acts, six assertions |
| **T4** | **A requirement addressed under the wrong project returns 404**, both for reads and for every write path | Criterion 6 |
| **T5** | **Baseline-hash stability across the migration** — freeze, migrate, rehash, compare; and an approval signed pre-migration still verifies | **K5**. The single most important test here, because it is the one whose failure would be silent |
| **T6** | **Revision history is project-scoped**: both projects revise their own `REQ-0001` to v2, and `requirement_version` holds two independent histories | The `requirement_version` PK change, which is easy to overlook |
| **T7** | **Reconciliation is project-scoped**: `canonical_entity_alias` and `conflict_participant` in project B resolve to project B's requirements while project A holds the same ids | The non-FK id stores (§5.2), which schema changes alone do not fix |
| **T8** | **Cross-project citation is still refused** — the existing V7 test at [review.test.ts:629](../../apps/api/src/review.test.ts), unchanged in its assertion, and its explanatory comment about the global primary key updated | Criterion 5, and the comment is now wrong |
| **T9** | **Migration 013 backfills correctly** against a database seeded with pre-migration rows, including child rows in all six tables | The one-way door of §6.2 |
| **T10** | **D15 non-reuse is still refused** — a reused id inside one project is rejected and the requirement is not written. **Asserted at the repository boundary, not over HTTP**, because **K7 is NOT APPROVED**: the transaction wrapper still flattens the D15 message to `503 database unavailable` at the HTTP layer (limitation **79** / **H6**) | The invariant must still be covered. Testing it below the flattening layer is how it stays coverable without carrying K7's status-code change into this boundary |
| **T11** | **Architecture-checker self-test case** for the new rule (§9), proving it fires | §9 of [CLAUDE.md](../../CLAUDE.md): a rule that cannot fire is not a rule |

**Test count moves from 769 to roughly 785–790.** Self-test cases move from 39 to 40.

---

## 10. Proposed enforcement

One new architecture-checker rule, in the pattern every slice has followed:

> **`requirement-id-allocation`** — a `REQ-` template literal or string-concatenated requirement
> identifier outside `packages/domain/src/invariants.ts` is a build failure.

This is what stops the third inline allocator from appearing. It does **not** attempt to enforce the
key scope itself — SQL shape is not something the checker reads — which is why criteria **1**, **2**
and **6** are tests rather than rules.

---

## 11. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| **R-H4-1** | **A silent hash change.** If any part of the baseline-member construction moves, every existing G1 signature is invalidated and the gate reopens against itself | **High** | **K5** and **T5**. The mapping is not changed, and a test proves the digest is byte-identical across the migration |
| **R-H4-2** | **A write lands on the wrong project's row.** The composite key's characteristic failure: a query updated for the new key in five places and missed in a sixth | **High** | **T3**, six acts each asserted not to touch the neighbouring project; **K4** makes `projectId` a required argument so a missed site fails to compile rather than at runtime |
| **R-H4-3** | **The backfill runs too late.** Migration 013 is only unambiguous while ids are globally unique (§6.2) | **Medium** | Stated in the migration's own header comment, and **T9** exercises the seeded case |
| **R-H4-4** | **Boundary creep into H5.** H5 is adjacent, real, and tempting to fix while the file is open | **Medium** | **K2** and **K8**: no new allocator, and H5 recorded rather than built. The same discipline that kept H4 out of V7 |
| **R-H4-5** | **Overclaiming at acceptance.** "Multiple projects can reach G1" is true within a process lifetime and false across a restart until H5 closes | **Medium** | **RESOLVED BY APPROVAL, not by mitigation.** K8's clarification makes **H5 a blocker to Phase 2 closure**, so the claim cannot be banked: Phase 2 stays open after H4 until H5 is separately analysed, approved, implemented and accepted. The acceptance report states the restart caveat explicitly |
| **R-H4-6** | **A test loosened to pass.** 769 tests, port signatures changing under all of them | **Medium** | Criterion **5**: helper signatures may change, assertions may not. §9 of [CLAUDE.md](../../CLAUDE.md) |
| **R-H4-7** | **PostgreSQL divergence.** Composite keys are standard, but nothing here has ever run against a real server | **Low, deferred** | Unchanged from every other migration; §13 of [phase-2-status.md](phase-2-status.md) |

---

## 12. Is an ADR required?

**No — for Option A.** Checked item by item against §7 of [CLAUDE.md](../../CLAUDE.md):

| Consideration | Finding |
|---|---|
| Does it contradict an approved ADR? | **No.** [ADR-0017](../adr/ADR-0017-approval-as-baseline-signature.md) is preserved by construction (§7). [ADR-0035](../adr/ADR-0035-persistence-plain-sql-pglite.md) is satisfied — plain parameterised SQL, no ORM. [ADR-0016](../adr/ADR-0016-immutable-content-addressed-artifacts.md) and [ADR-0032](../adr/ADR-0032-retain-everything.md) are untouched: nothing is deleted or renumbered. [ADR-0008](../adr/ADR-0008-resolvable-anchors.md) is untouched: no anchor names a requirement |
| Does it change a domain invariant? | **No.** **D15** *would be implemented* for the first time, not amended |
| Does it change the product boundary? | **No.** [ADR-0001](../adr/ADR-0001-requirements-driven-product-boundary.md) is untouched |
| Does it change a module boundary or dependency rule? | **No.** [ADR-0029](../adr/ADR-0029-modular-monolith.md) is untouched, and no dependency is added (**A4**) |
| Does it change documented behaviour? | **No.** This was the one open question, and **K7 was NOT APPROVED**, so no status-code behaviour changes in this boundary. §12 of [CLAUDE.md](../../CLAUDE.md) is untouched. The 503 flattening stands, recorded as limitation **79** / **H6** |
| Does it require a documentation change? | **Corrections only** — the status document's limitation 77, §5.12 and §0, plus the now-wrong explanatory comment at [review.test.ts:637](../../apps/api/src/review.test.ts). No specification statement becomes false |

**Option B would need one**, which is a further argument against it: it changes what a requirement's
identifier *is*, and three approved domain documents say what it is today.

---

## 13. What this proposal does NOT claim

- It does **not** claim that multi-project operation is exercised anywhere beyond G1. Nothing past
  G1 exists.
- It does **not** claim tenancy isolation. A composite key stops accidental collision and accidental
  cross-project addressing; it is not an authorisation boundary, and role checks remain what they
  were.
- It does **not** claim the system is durable across restarts. **H5** (§2) says otherwise, and
  **K8** requires that to be recorded rather than glossed.
- It does **not** claim anything about model quality. Nothing here touches AI, and the V0–V7
  acceptance scope — *mechanics and governance, explicitly not model quality* — is unchanged.

---

## 14. Status and what happens next

**Approved 2026-08-24.** K1–K6 and K8 approved; **K7 NOT APPROVED**; K8 carries the clarification that
**H5 blocks Phase 2 closure**.

1. **Implement H4 to this boundary and no further.** K7 and H5 are out, by decision.
2. **Run full verification and produce an acceptance report** against criteria **A1–A10** (§8.1) and
   the retained criteria (§8.2). Implementation is not acceptance.
3. **Acceptance is a separate act**, on the record, and is not automatic.
4. **Phase 2 does NOT close on H4's acceptance.** It stays open until **H5** is separately analysed,
   approved, implemented and accepted — K8's approval clarification.
5. **P3 must not begin.** Its boundary is neither proposed nor approved.
