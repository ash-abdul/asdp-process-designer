# H5 — Durable Identity Generation · ✅ BOUNDARY APPROVED

> **Status: BOUNDARY APPROVED 2026-08-24. NOT YET IMPLEMENTED, NOT YET ACCEPTED.**
> **M1–M9 approved**, including the revised **M1** and **M9** of version 0.2. The approved boundary
> below is binding: only what M1–M9 authorise may be built, per §11 of
> [CLAUDE.md](../../CLAUDE.md). Implementation does not confer acceptance — acceptance is a separate
> act, on the record, after verification and an independent review.
>
> **The two findings of §14 were given durable numbers at approval:** limitation **80** /
> candidate **H7** (the 9 999 ordering overflow) and limitation **81** / candidate **H8** (ordering
> inferred from the identifier). **Neither is a Phase 2 closure blocker** — the durable analysis does
> not justify it — and **neither may be addressed inside H5**.
> **Version:** 0.2 · **Written:** 2026-08-24 · **Revised:** 2026-08-24 · **Against commit:** `530dee3`
> **Revision 0.2** answers a review challenge: v0.1 rejected UUIDv4 on ordering grounds while
> describing a construction with the same defect. **§4.8 is new and is the heart of this
> document; M1 and M9 changed.** See §15.
> **Closes:** limitation **78**, hardening candidate **H5** —
> [phase-2-status.md](phase-2-status.md) §0, §12
> **Related:** [h4-proposal.md](h4-proposal.md) (**K8** made this a closure blocker),
> [phase-2-plan.md](phase-2-plan.md),
> [ADR-0017](../adr/ADR-0017-approval-as-baseline-signature.md),
> [ADR-0035](../adr/ADR-0035-persistence-plain-sql-pglite.md),
> [ADR-0016](../adr/ADR-0016-immutable-content-addressed-artifacts.md),
> [ADR-0032](../adr/ADR-0032-retain-everything.md),
> [ADR-0028](../adr/ADR-0028-containerised-compose-first.md),
> [domain-model.md](../20-domain/domain-model.md) §D15

---

## 1. The defect, reproduced against `530dee3`

Every surrogate identifier in the system is minted by `counterIdGenerator`
([repo-memory.ts:816](../../apps/api/src/repo-memory.ts)):

```ts
export function counterIdGenerator(): IdGenerator {
  const counters = new Map<string, number>();
  return { next: (prefix) => `${prefix}-${String((counters.get(prefix) ?? 0) + 1).padStart(4, '0')}` };
}
```

The counter lives in **process memory**. It is wired into production composition at
[composition.ts:78](../../apps/api/src/composition.ts). A restart resets every counter to zero while
the database keeps every row, so the first write after a restart re-mints an identifier that already
exists.

**Reproduced directly at `530dee3`, against a durable `dataDir`:**

```
session 1        : created prj-0001
session 1        : projects now = prj-0001/first-project
session 2 RESTART: FAILED -> Error: project id or key already exists: prj-0001 / second-project
session 2 RESTART: projects now = prj-0001/first-project
```

The second session cannot create a project. Not a project with a duplicate key — **any** project.
The same holds for every other entity class: the first write of any kind after a restart collides.

**It is latent today for exactly one reason.** `ASDP_DATABASE_DIR` is optional, and unset means
in-memory PGlite, so every restart currently starts from an empty database. It becomes universal the
moment the database is durable — which is decision **A2** and
[ADR-0035](../adr/ADR-0035-persistence-plain-sql-pglite.md): **PostgreSQL is the production target.**

### 1.1 Why this is a Phase 2 closure blocker

Phase 2's completion test is *"Phase 2 ends when G1 can be reached"*. **H4** made G1 reachable by any
number of projects **within one process lifetime**. **K8's approval clarification** made durable
multi-project G1 — surviving a restart — a condition of closure. H5 is the gap between the two, and
the checkpoint records it as **the only remaining blocker**.

---

## 2. What the census actually shows

**The checkpoint says "47 call sites, 22 prefixes". The correct figures at `530dee3` are 49 call
sites and 24 distinct prefixes.** The earlier numbers were recorded during H4's analysis and are
stale. §11 proposes correcting them.

| File | Call sites |
|---|---|
| `apps/api/src/commands/review.ts` | 19 |
| `apps/api/src/commands/reconciliation.ts` | 8 |
| `apps/api/src/commands/intake.ts` | 7 |
| `apps/api/src/commands/requirements.ts` | 6 |
| `apps/api/src/commands.ts` | 4 |
| `apps/api/src/commands/analysis.ts` | 3 |
| `packages/ai/src/broker.ts` | 2 |
| **Total** | **49**, none of them in a test |

Prefixes, by frequency: `aud` (19), `vr` (3), `su` `rej` `ev` `cen` `cal` (2 each), and
`ai` `ap` `apr` `bl` `bsl` `cfl` `img` `oq` `pak` `prj` `prop` `rel` `rfl` `rqs` `rrj` `spb` `src`
(1 each).

### 2.1 The id classes are NOT alike — four of them, and only one is broken

This is the part a single-generator assumption would get wrong.

| Class | Members | Durable today? | Treatment |
|---|---|---|---|
| **1 — Domain identifiers under D15** | `REQ-####` | **YES.** Allocated from the project's **database** high-water mark (`nextRequirementNumber`), not from the counter. H4 routed it through `allocateD15_requirementId` | **OUT OF SCOPE. Must not change.** It is the model the rest should follow, and the only id class with a SQL format constraint (`requirement_id_format`, migration 008) |
| **2 — Ordering-sensitive surrogates** | `aud`, `vr`, `bl`/`bsl`, `ap`/`apr` | No | Read with `order by <timestamp>, id` — the id is the **tiebreaker within one timestamp**. Whatever replaces the counter must preserve that ordering or the audit log's sequence becomes arbitrary within a millisecond |
| **3 — Opaque surrogates** | the remaining 18 prefixes | No | Pure primary keys. Nothing reads them for meaning |
| **4 — Hash-visible** | `prj` | No | **`projectId` is an input to `computeBaselineHash`** ([baseline.ts:39](../../packages/domain/src/baseline.ts)). The baseline id and approval id are **not**. So an existing project's id may never change — but a *new* project's id format is free, because each baseline hashes the project id it actually has |

**Class 2 is the finding that constrains the design.** `order by at, id` appears in the audit,
baseline, approval and validation-run reads. Two audit events written microseconds apart can share a
millisecond; the id is then the only thing deciding their order, and
[api.test.ts:451](../../apps/api/src/api.test.ts) asserts an exact four-event audit sequence.

### 2.2 Two prefixes per table — a finding, not a defect

`bl` (from [commands.ts:264](../../apps/api/src/commands.ts), the Phase 1 governance spine) and
`bsl` (from [review.ts:1489](../../apps/api/src/commands/review.ts), V7's G1) both write to
`baseline`. `ap` and `apr` both write to `approval`. **Any per-table allocation scheme would silently
rename one of each pair.** The design must therefore be **per prefix, not per table.** Renaming is
out of scope for H5 and is not proposed.

---

## 3. What constrains the design — established by inspection, not assumed

| # | Finding | Consequence |
|---|---|---|
| **C1** | **`EntityId = z.string().min(1).max(200)`** ([primitives.ts:30](../../packages/schemas/src/primitives.ts)) — no format constraint | Any id shape up to 200 characters validates |
| **C2** | **The only SQL id-format constraint in the schema is `requirement_id_format`** on `REQ-####` — and requirement ids do not come from the counter | No migration is needed to permit a new surrogate format |
| **C3** | **No specification documents the surrogate format.** `docs/` pins only D15, which governs requirement ids | Changing the surrogate shape is **not** a specification change |
| **C4** | **No test asserts a generated id's shape.** The 246 `'src-1'`-style literals in tests are **fixtures the tests supply themselves**, which bypass the generator entirely | The format may change without touching a test assertion |
| **C5** | **No generated id feeds an ADR-0017 hash**, except `projectId` as a value | Existing signatures cannot move, provided no existing id is renumbered |
| **C6** | **Exactly one place parses a number out of an id** — [repo-memory.ts:428](../../apps/api/src/repo-memory.ts), and it is `REQ-####` (class 1) | Nothing else depends on the numeric suffix |
| **C7** | **`ASDP_REPLICA_COUNT` already exists** in config, with an A6 guard refusing a filesystem blob store behind replicas | Multi-instance is a **modelled** deployment, not a hypothetical |
| **C8** | **Replay determinism does not depend on ids.** `recordingKeyHash` covers `corpusId, taskType, promptVersion, providerId, modelId, inputHash` ([recording.ts:42](../../packages/eval/src/recording.ts)); the `ai-####` id is assigned after the provider call | **A7** replay fixtures survive an id-format change |
| **C9** | **The engine supports every relevant primitive.** Verified against PGlite 0.5.6 = PostgreSQL 18.3: sequences, `nextval`, `setval`, `gen_random_uuid()`, identity columns, `on conflict … returning`, advisory locks | No option is blocked by the engine, in dev or in production |

---

## 4. Candidate approaches

### 4.1 Option A — one database sequence per prefix

`create sequence id_seq_aud;` … and `select 'aud-'||lpad(nextval('id_seq_aud')::text,4,'0')`.

**For:** durable, structurally collision-free across instances, preserves the exact format,
non-transactional so no contention.
**Against:** `IdGenerator.next()` is **synchronous** and called at **49 sites inside command
bodies**. Making it async touches every command — by far the largest blast radius of any option — and
adds a database round-trip per identifier, inside transactions that already hold row locks. Needs a
migration creating 24 sequences and seeding each from its table's current maximum.

### 4.2 Option B — a single `id_sequence` counter table

`insert … on conflict (name) do update set next_value = next_value + 1 returning next_value`.

**For:** durable, structurally collision-free, one migration, seeding is data rather than DDL.
**Against:** same async problem as A, **plus** a hot row per prefix. `aud` is written by every
command; under replicas that serialises writes on one row. Strictly worse than A on concurrency.

### 4.3 Option C — UUIDv4 (fresh randomness, no time ordering)

**For:** durable, no coordination, stays synchronous, one function changed.
**Against:** **destroys the ordering the code depends on.** Measured, not argued — §4.8. **Rejected.**

### 4.4 Option D — a **monotonic** time-ordered identifier, prefix retained · **RECOMMENDED**

`${prefix}-${ULID}` — 48-bit millisecond timestamp then 80 bits, Crockford base32, lexicographically
sortable. `aud-01K3PSGXVQ7YB4WQ2M0RN8T3ZF`.

**The 80 bits are NOT redrawn on every call.** Within one millisecond the previous value is
**incremented by one**, and the clock is **guarded** so it can never appear to move backwards inside a
process. This is what makes creation order survive, and v0.1 of this document failed to say so — see
§4.8 and §15.

**For:**
- **Durable by construction** — nothing is remembered between processes, so nothing can be forgotten.
- **Multi-instance safe with no coordination**, which is what makes it the smallest option.
- **Stays synchronous.** `IdGenerator.next(prefix): string` is unchanged, so **all 49 call sites, the
  port and every repository are untouched.**
- **Preserves creation order within a millisecond** — the property §4.8 shows the code actually uses.
- **Preserves the prefix**, so ids stay greppable in logs and audit rows.
- **No migration, no schema change, no new startup dependency, no new failure mode.**
- **No dependency** — about forty lines over `node:crypto`, which decision **A4** prefers to a package.

**Against:**
- Collision-freedom in the *generator* is probabilistic. §4.9 shows why this is the wrong thing to
  worry about: uniqueness is already structural, because every one of these ids is a **primary key**.
- Ids become 26 characters longer and are not human-countable.
- Ordering **across instances** follows wall-clock. No generator fixes that without coordination, and
  §4.8 shows a database sequence does not fix it either.

### 4.5 Option E — seed the in-memory counter from the database at boot

Read `max(id)` per table at startup, resume counting.

**For:** preserves the format exactly, stays synchronous, no dependency.
**Against:** **fails the multi-instance requirement outright.** Two instances seed from the same
maximum and then collide on every write. It also requires parsing the numeric suffix out of ids,
which C6 shows the codebase deliberately does in only one place. **Rejected.**

### 4.6 Option F — hi-lo block allocation

Each process reserves a block of N ids per prefix from a durable sequence at boot, then hands them
out synchronously from memory.

**For:** durable, structurally collision-free, **synchronous**, preserves the format exactly, no
call-site changes.
**Against:** a real coordination step — a startup handshake against the database for each of 24
prefixes, a registry of prefixes to pre-warm, a checker rule to keep the registry honest, an
exhaustion path when a block runs out mid-request (which is async again), and gaps on every restart.
This is the **runner-up**: it is what to choose if structural collision-freedom is required, and it
costs a migration, a registry, a checker rule and a new startup failure mode to get it.

### 4.7 Summary

| | A sequences | B counter table | C UUIDv4 | **D monotonic** | E boot-seed | F hi-lo |
|---|---|---|---|---|---|---|
| Durable across restart | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Multi-instance safe | ✅ structural | ✅ structural | ✅ probabilistic | ✅ probabilistic | ❌ | ✅ structural |
| **Same-millisecond order** | ✅ | ✅ | **❌ measured** | **✅ measured** | ✅ | ⚠️ within a block |
| Stays synchronous | ❌ 49 sites | ❌ 49 sites | ✅ | ✅ | ✅ | ✅ |
| Migration needed | ✅ 24 sequences | ✅ 1 table | ❌ | ❌ | ❌ | ✅ |
| New startup dependency | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Preserves `prefix-NNNN` | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| **Blast radius** | **largest** | large | smallest | **smallest** | small | medium |

### 4.8 The ordering question, settled by measurement

**v0.1 rejected UUIDv4 because the id is the `order by at, id` tiebreaker, then proposed a
construction with a fresh random suffix — which has exactly the same defect.** The challenge was
correct. This section resolves it with evidence rather than argument.

#### 4.8.1 First: is intra-millisecond ordering real, or theoretical?

**It is the normal case, not an edge case.** Running the exact governance sequence
`createProject → freezeBaseline → evaluateGate → approveGate` that
[api.test.ts:451](../../apps/api/src/api.test.ts) asserts, and measuring how often adjacent audit
events share a millisecond:

| Path | Runs | Adjacent pairs | Share a millisecond |
|---|---|---|---|
| **Memory repositories** — what `api.test.ts` uses | 200 | 600 | **597 (99.5%)** |
| **SQL repositories** — the production path | 40 | 120 | **18 (15.0%)** |

`at` is written from `nowIso()`, which has millisecond precision. On the memory path the four events
are **almost always in one millisecond**, so `order by at, id` degenerates to `order by id` and
**the identifier is doing all of the ordering work.**

#### 4.8.2 The three constructions, measured

1000 ids minted inside a single frozen millisecond, then sorted and compared to mint order; and
2 independent generators × 50 000 ids each:

| | Sorts in mint order (1000 ids, one ms) | Collisions (2 × 50 000) | Later id sorts later after a 5 ms clock rollback |
|---|---|---|---|
| **(1) Random suffix** — v0.1 as written | **❌ false** | 0 | ❌ |
| **(2) Monotonic** — increment within the millisecond | **✅ true** | 0 | ❌ |
| **(2b) Monotonic + clock guard** — **RECOMMENDED** | **✅ true** | 0 | **✅ true** |
| **(3) Sequence-backed** | ✅ true | structural | ✅ true |

**(1) is disqualified.** With 99.5% of adjacent audit pairs sharing a millisecond, a random suffix
orders those four events arbitrarily, and
[api.test.ts:451](../../apps/api/src/api.test.ts)'s `deepEqual` on the exact action sequence would
fail almost every run. That is an **accepted V0–V7 behaviour**, so v0.1's construction violated its
own compatibility requirement.

**(2b) is what M1 now specifies.** Within a millisecond the 80-bit component is incremented rather
than redrawn, so ids from one process are strictly increasing; and the timestamp is clamped so it can
never appear to move backwards inside a process, which (2) does not do.

#### 4.8.3 The finding that changes the frame: **the existing format is ALREADY mis-ordered**

`id` is a `text` column, so `order by id` is a **text** sort. Verified against the real engine:

```
SQL text order : aud-0009  <  aud-0010  <  aud-10000  <  aud-10001  <  aud-9999
mint order     : aud-0009  <  aud-0010  <  aud-9999   <  aud-10000  <  aud-10001
correct?       : false
```

`counterIdGenerator` pads to four digits and then overflows: `aud-10000` is five characters and sorts
**before** `aud-9999`. **The current system's `order by at, id` stops reflecting creation order at the
ten-thousandth id of any prefix** — and `aud` is written by every audited command.

Two consequences:

- **"Preserve existing ordering semantics" is a weaker requirement than it looks.** The existing
  semantics are correct only below 10 000 per prefix. A fixed-width, lexicographically sortable id is
  **strictly better** than what is there now, not merely equivalent.
- **This is a live latent defect at `530dee3`, independent of H5.** It is not in this boundary and is
  not fixed here. **§14 raises it for a limitation number.**

#### 4.8.4 Multiple instances

| | Ordering across instances |
|---|---|
| (1), (2), (2b) | Wall-clock. Two replicas interleave by timestamp; skew reorders within the skew window |
| (3) sequence | **Also not creation order.** A sequence orders by *allocation*, and two instances allocate independently of when their events occur. Instance A can hold `aud-0100` and write it after instance B writes `aud-0101` |

**No option gives cross-instance creation order without coordinating on time or on writes.** A
sequence looks stronger here and is not. What `order by at, id` means across instances is
"timestamp order, ties broken deterministically" — and all of (2b) and (3) deliver that.

#### 4.8.5 Should the ordering dependency itself be changed instead?

**Architecturally, yes — and deliberately not in this slice.**

`order by at, id` uses the identifier as a **proxy for insertion order**. That works only because
`counterIdGenerator` happened to be monotonic; it is a coincidence of the implementation, not a
designed property, and §4.8.3 shows the coincidence already fails past 9999. The principled fix is to
stop inferring order from the identifier at all: give the ordering-sensitive tables a
**monotonic insertion column** (`bigint generated always as identity`) and order by it.

| | |
|---|---|
| **For** | Structurally correct, immune to clock skew and rollback, immune to id format entirely. **It would remove the ordering constraint from H5 completely** — after it, even a plain random id would be acceptable |
| **Against** | A migration adding a column to `audit_event`, `baseline`, `approval` and `validation_run`; repository read changes on four tables; and it changes an **accepted V0–V7 read behaviour**. That is a different slice with a different risk profile |

**Recommendation: record it as a separate hardening candidate, do not do it here.** Encoding
monotonicity into the identifier (M1) is the smaller move and leaves that door open — if the
insertion-column change is made later, M1 costs nothing and stops mattering. **§14 raises it.**

### 4.9 Does this project require *structural* uniqueness for surrogate ids?

**The framing in v0.1 was wrong, and correcting it removes most of the force of the question.**

**Uniqueness is already structural.** Every one of these identifiers is a **`text primary key`**. The
database refuses a duplicate regardless of what the generator does. The generator cannot create a
duplicate row; it can only cause a **failed write**.

So the real question is not *"can two ids collide?"* but *"how likely is a spurious write failure,
and is it silent?"*

| | |
|---|---|
| **Failure mode** | A unique violation on insert. The request fails loudly. **Traceability is never silently corrupted, no anchor is mis-resolved, no signature is affected** |
| **Probability, (2b)** | Within one process, collisions are impossible — the counter increments. Across processes, two would have to draw 80-bit seeds that overlap **within the same millisecond**: ≈ 2⁻⁸⁰ per millisecond per prefix pair, ~10⁻¹⁴ over a year of continuous operation |
| **Comparison** | Orders of magnitude below undetected ECC memory error or silent disk corruption — failure modes this system already accepts without comment |
| **Measured** | 100 000 ids across 2 instances: **0 collisions** (§4.8.2). §10 **T3** makes this a standing test rather than a claim |

**Conclusion: an explicitly documented probabilistic guarantee is acceptable here**, because the
*durable* guarantee — no duplicate row, ever — is provided by the primary key and not by the
generator. This is the same reasoning the project already applies to content hashes: SHA-256 is
relied upon everywhere in ADR-0016 and ADR-0017 without anyone requiring structural collision
impossibility.

**Where it would NOT be acceptable:** if a surrogate id were ever used as a *content* identifier that
two writers could legitimately derive independently, or if duplicates could persist silently. Neither
is true, and **M8**'s checker rule plus the primary keys keep it that way.

---

---

## 5. The approved decisions **M1–M9**

**APPROVED 2026-08-24: Option D, in its monotonic + clock-guarded form (§4.8.2 variant 2b).** It is the only option that
satisfies all seven required guarantees — **including same-millisecond creation order, which §4.8
shows the code genuinely depends on** — while changing one function and no call site, no schema, no
port and no specification.

**M1 and M9 changed in revision 0.2.** v0.1 specified a fresh random suffix, which measurement
disqualified (§4.8.2).

| # | Decision | Rationale |
|---|---|---|
| **M1** | **Surrogate ids become `${prefix}-${ULID}`, MONOTONIC WITHIN A PROCESS** — 48-bit millisecond timestamp then 80 bits, Crockford base32, fixed width, lexicographically sortable. **Within one millisecond the 80-bit component is INCREMENTED, not redrawn**, and the timestamp is **clamped so it can never appear to move backwards inside a process** (§4.8.2, variant 2b) | Durable because nothing is remembered; multi-instance safe without coordination; and **creation order survives within a millisecond, which §4.8.1 measures at 99.5% of adjacent audit pairs on the path `api.test.ts` uses.** A fresh random suffix — v0.1's wording — fails this and would break an accepted V0–V7 test |
| **M2** | **The `IdGenerator` port is UNCHANGED** — `next(prefix: string): string`, synchronous | All 49 call sites, every command and every repository stay exactly as they are. This is what makes the boundary small |
| **M3** | **The generator lives in `@asdp/domain`** as `durableIdGenerator()`, over `node:crypto`. **No dependency is added** (**A4**) | It is pure computation with no I/O — the same package that already owns `allocateD15_requirementId` |
| **M4** | **`counterIdGenerator` is RETAINED for tests and the in-memory adapter, and REMOVED from production composition.** [composition.ts:78](../../apps/api/src/composition.ts) wires `durableIdGenerator()` | Test determinism is preserved exactly — no existing test changes — while production stops depending on process memory. **The fidelity risk this creates is answered by M5** |
| **M5** | **The H5 acceptance tests use the PRODUCTION generator against a durable database**, not the counter | An adapter more permissive than production would let a test prove a behaviour production cannot have. This is the same discipline `repo-memory.ts` already states for repositories |
| **M6** | **`REQ-####` is untouched.** Class 1 keeps `allocateD15_requirementId` and the per-project database high-water mark | D15 governs it, migration 008 constrains its format, and H4 accepted it. It is already durable |
| **M7** | **No migration, no schema change, no backfill, and NO EXISTING ID IS RENUMBERED** | Old and new ids coexist: both are opaque strings, both satisfy `EntityId`, and every foreign key references a value rather than a shape |
| **M8** | **One new architecture-checker rule**: `counterIdGenerator` may not be imported outside tests and `repo-memory.ts` | The defect was a test-shaped generator reaching production wiring. A rule is what stops it returning, exactly as `requirement-id-allocation` does for K3 |
| **M9** | **The generator takes the injected `Clock`, is stateful within a process, and is NOT reentrant across processes.** Its state is `(lastMs, last80Bits)` — held only to guarantee ordering, **never** to guarantee uniqueness, so losing it on restart costs nothing. Randomness exhaustion inside one millisecond (2⁸⁰ ids) **throws rather than wrapping** | Ordering is a measured property (§4.8), so it is tested rather than assumed. Keeping the state ordering-only is what distinguishes this from `counterIdGenerator`, whose state *was* load-bearing for uniqueness — which is precisely the defect |

### 5.1 In scope

| Area | Change |
|---|---|
| **`@asdp/domain`** | `durableIdGenerator(clock)` — new, ~40 lines: base32 encode, timestamp clamp, 80-bit increment |
| **`apps/api/src/composition.ts`** | One line: production wires `durableIdGenerator` |
| **`apps/api/src/repo-memory.ts`** | `counterIdGenerator` retained, documented as test-only |
| **Architecture checker** | One new rule (**M8**) plus self-test cases |
| **Tests** | New `h5-durable-identity.test.ts` — restart, concurrency, ordering, uniqueness (§10) |
| **Documentation** | [phase-2-status.md](phase-2-status.md) §0, §12, a new §5.14; this document; [docs/README.md](../README.md) |

### 5.2 Explicitly out of scope

- **H6 / limitation 79** — the `503` flattening. Untouched.
- **The `bl`/`bsl` and `ap`/`apr` prefix duplication** (§2.2). Recorded, not renamed.
- **`REQ-####`** and anything else D15 governs (**M6**).
- **Renaming, renumbering or backfilling any existing identifier** (**M7**).
- **Phase 2 closure.** A separate act, after acceptance.
- **P3.** Not proposed, not approved, must not begin.

---

## 6. Database and migration implications

**None. There is no migration.**

That is the single largest difference between Option D and every structural alternative, and it is
worth stating precisely rather than as an absence:

| Question | Answer |
|---|---|
| Does any column need widening? | **No.** Every surrogate id column is `text`. A 30-character id fits where a 9-character one did |
| Does any constraint reject the new format? | **No** (**C1**, **C2**). The only id-format check is on `REQ-####`, which does not change |
| Do existing rows change? | **No.** Not one row is read, rewritten, renumbered or deleted |
| Do old and new ids coexist? | **Yes.** `prj-0001` and `prj-01K3PS…` are both valid `EntityId`s and both work as foreign-key targets. A database written before H5 keeps working, and new writes simply look different |
| Is anything lost on rollback? | **No.** Reverting the composition line restores the old generator; ids already written stay valid under it, because the counter never re-mints an id that a *durable* generator produced — it re-mints its own |
| PostgreSQL vs PGlite | **Identical.** The generator performs no I/O, so there is no engine-specific behaviour to diverge. This is the one option with nothing for PGlite to be unfaithful about |

---

## 7. Domain, repository and API impact

| Layer | Impact |
|---|---|
| **`IdGenerator` port** | **None** (**M2**) |
| **49 call sites** | **None.** `ctx.ids.next('aud')` is unchanged at every one |
| **Repositories** | **None.** No signature, no SQL, no mapper |
| **Commands** | **None** |
| **HTTP API** | **Shape unchanged; values longer.** Ids are already opaque strings in every response. A client that treats an id as opaque is unaffected; one that parses `prj-0001` was already relying on something no specification promised (**C3**) |
| **`@asdp/domain`** | One new exported function |
| **`@asdp/schemas`** | **None** (**C1**) |
| **Traceability** | **Preserved.** Anchors carry `sourceId` as an opaque string ([anchor.ts:75](../../packages/provenance/src/anchor.ts)); the chain `Evidence → Requirement → BPS → IR → artifact` references values, never formats |

---

## 8. Backward compatibility, concurrency and failure behaviour

### 8.1 Backward compatibility

- **Existing persisted ids remain valid and are never renumbered** (**M7**).
- **Existing ADR-0017 baselines and signatures remain valid.** No generated id is a hash input except
  `projectId` as a value (**C5**), and no existing project's id changes. A baseline frozen before H5
  rehashes byte-identically after it — §9, criterion **B4**.
- **Accepted V0–V7 and H4 behaviour is unchanged.** No test changes (**C4**, **M4**), no command
  changes, no schema changes.
- **A7 replay fixtures keep replaying**, because no id is in the recording key (**C8**).

### 8.2 Concurrency and multi-instance

- **Within one process:** the monotonic guard (**M9**) guarantees two ids minted in the same
  millisecond sort in mint order.
- **Across instances:** no shared state, no coordination, no contention. Two replicas cannot collide
  except by an 80-bit CSPRNG repetition within one millisecond.
- **Ordering across instances** follows wall-clock, so events from two replicas interleave by their
  timestamps. This is what `order by at, id` already means; the id tiebreaker only ever ordered
  events *within* one timestamp.
- **No hot row, no sequence, no lock**, so identifier allocation adds nothing to write contention —
  which Option B would have added to every audited command.

### 8.3 Failure behaviour

| Failure | Behaviour |
|---|---|
| Database unavailable | **Identifier generation is unaffected** — it performs no I/O. The write fails on its own merits, as today |
| Process restart | **Nothing to restore.** The next id is later than the last because time moved forward |
| Clock steps backwards (NTP correction) | **Within a process: fully handled.** The timestamp clamp (**M1**) means a backwards step cannot produce a backwards id — measured in §4.8.2, where variant (2) fails this and (2b) passes. **Across a restart: not defended against.** A process that starts after a backwards step can mint an id sorting before one written by the previous process. It **cannot collide** — 80 independent bits — and the effect is bounded by the step. **A known, accepted limit; acceptance should say so.** Note that a database sequence would survive this, and that §4.8.5's insertion-column change would remove the exposure entirely** |
| Two instances, same millisecond | Independent CSPRNG draws; collision probability negligible and measured, not asserted (§10, **T6**) |
| CSPRNG unavailable | `node:crypto` throws; the request fails loudly rather than producing a weak id |

---

## 9. Required ADR decisions

**No new ADR is required.** Checked item by item:

| Question | Answer |
|---|---|
| Does it contradict an approved ADR? | **No.** [ADR-0017](../adr/ADR-0017-approval-as-baseline-signature.md) is preserved — no hash input changes. [ADR-0035](../adr/ADR-0035-persistence-plain-sql-pglite.md) is satisfied — no SQL at all. [ADR-0016](../adr/ADR-0016-immutable-content-addressed-artifacts.md) and [ADR-0032](../adr/ADR-0032-retain-everything.md) are untouched: nothing is deleted or renumbered. [ADR-0008](../adr/ADR-0008-resolvable-anchors.md) is untouched: anchors carry ids as opaque values |
| Does it change a domain invariant? | **No.** **D15** governs requirement ids, which are out of scope (**M6**). No invariant speaks to surrogate identifiers |
| Does it change a documented format? | **No** (**C3**). No specification documents the surrogate shape |
| Does it change the product boundary? | **No.** [ADR-0001](../adr/ADR-0001-requirements-driven-product-boundary.md) is untouched |
| Does it add a dependency? | **No** (**M3**, decision **A4**) |
| Does it change HTTP status semantics? | **No.** §12 of [CLAUDE.md](../../CLAUDE.md) is untouched |

**On the structural-versus-probabilistic question** — raised in v0.1 as the one judgement needing an
explicit yes/no — **§4.9 reframes it and largely dissolves it.** Uniqueness is **already structural**:
every one of these ids is a `text primary key`, so the database, not the generator, is what makes a
duplicate row impossible. The generator only affects the probability of a **spurious, loud write
failure** — never silent corruption, never a mis-resolved anchor, never an affected signature. At
≈2⁻⁸⁰ per millisecond that probability sits far below failure modes this system already accepts
without comment, and **T3** measures it rather than asserting it.

**If a structural guarantee in the generator itself is still required**, Option F (§4.6) is the
answer, and it costs a migration, a prefix registry, a checker rule and a new startup failure mode.
That remains a legitimate call, but §4.9 is the reason this proposal no longer treats it as finely
balanced.

---

## 10. Acceptance criteria and required tests

### 10.1 Measurable acceptance criteria

| # | Criterion | Measurement |
|---|---|---|
| **B1** | **Ids cannot be reused after a restart.** A durable database survives *n* restarts and every write succeeds | Restart a server against one `dataDir` **three** times, creating a project each time. Three projects, three distinct ids |
| **B2** | **Multiple instances cannot collide.** Two generators running concurrently produce disjoint id sets | 2 generators × 10 000 ids each: **0 collisions** |
| **B3** | **Existing persisted ids remain valid and are not renumbered** | A database seeded with `prj-0001`-style ids is read, written and extended after H5; the old rows are byte-identical and still resolve |
| **B4** | **ADR-0017 baselines and signatures remain valid** | A baseline frozen with counter-format ids rehashes **byte-identically** under the new generator |
| **B5** | **G1 IS REACHABLE ACROSS A RESTART** — the criterion Phase 2 closure rests on | Project A reaches G1; restart; project B reaches G1 in the same database |
| **B6** | **Class-2 ordering is preserved, and is BETTER than today's** | 1000 ids minted in one frozen millisecond sort **exactly** in mint order; and a fixed-width id has no 9999 overflow (§4.8.3) |
| **B7** | **Accepted V0–V7 and H4 behaviour is unchanged** | The full suite is green with **no test modified** |
| **B8** | **No migration, no schema change** | `migrations/` is unchanged; migration count stays at 13 |
| **B9** | **`counterIdGenerator` is unreachable from production** | The new checker rule fires, with self-test cases |

### 10.2 Required tests

| # | Test | Proves |
|---|---|---|
| **T1** | **THREE restarts against one durable database, a project created after each** | **B1**. The defect. Nothing else proves it closed |
| **T2** | **G1 reached by project A, restart, G1 reached by project B** | **B5**, and the Phase 2 closure condition itself |
| **T3** | **Two concurrent generators, 50 000 ids each, zero collisions** | **B2**, multi-instance safety, measured not asserted (§4.9) |
| **T4** | **A pre-H5 database (counter-format ids) is read and extended** | **B3**, backward compatibility with real persisted data |
| **T5** | **Baseline hash stability across the generator change** | **B4**. The most important test, because its failure is silent |
| **T6** | **10 000 ids minted inside ONE frozen millisecond sort exactly in mint order, and are unique** | **B6**, **M1**'s increment. This is the test v0.1's construction would have failed |
| **T7** | **A fake clock stepping backwards still produces increasing ids within a process** | **M1**'s timestamp clamp. Variant (2) fails this test and (2b) passes it, which is why M1 names the clamp |
| **T8** | **Every id validates as `EntityId` and round-trips through SQL** | **C1**, and that a 30-character id fits every column |
| **T9** | **Restart durability for a NON-project entity** (source, evidence, audit) | That B1 is a property of the generator, not of one table |
| **T10** | **The checker rule fires**, with permit and reject self-test cases | **B9** |
| **T11** | **`REQ-####` is still allocated by the domain allocator and is unchanged** | **M6**, that class 1 was not disturbed |

**All tests use the production generator against a durable database** (**M5**).

---

## 11. Does closing H5 close Phase 2?

**Per the durable checkpoint at `530dee3`: yes — H5 is the last blocker.**

> **Phase 2 closure** — *"NOT CLOSED. Exactly ONE blocker remains: H5 / limitation 78."*

Phase 2's completion test is *"Phase 2 ends when G1 can be reached"*. H4 made G1 reachable by any
number of projects within one process lifetime; H5 is what makes it survive a restart. **Criterion
B5 is therefore the closure condition itself**, which is why it is an acceptance criterion here
rather than a nice-to-have.

**Three things closure would still require, and none is a defect:**

1. **H5 accepted** — implementation is not acceptance.
2. **The reviewer's judgement that the deferred items do not block.** The checkpoint records
   **V2-PDF** (blocked on the Arabic corpus, spike S2 and ADR-0037) and **V4b-eval** (blocked on a
   credential, E1-permitted material and **H3 / limitation 62**) as deferred rather than blocking,
   because neither is on the path to G1. That is a standing decision, but closure should restate it
   rather than inherit it silently.
3. **H6 / limitation 79 remains open and does not block** — recorded, unscheduled.

**This proposal does not close Phase 2 and must not be read as doing so.**

### 11.1 A correction this analysis found in the durable record

Two statements in [phase-2-status.md](phase-2-status.md) are stale and should be corrected:

- **§0 still carries the paragraph "PHASE 2 NOW HAS TWO BLOCKERS, NOT ONE"**, written when H4's
  boundary was approved. H4 is now accepted and the checkpoint elsewhere correctly says exactly one
  blocker remains. The paragraph contradicts the row above it.
- **Limitation 78 records "47 call sites, 22 prefixes".** The correct figures at `530dee3` are
  **49 call sites and 24 prefixes** (§2).

**Both were corrected on 2026-08-24 with explicit authorisation**, in the same change that added
revision 0.2 of this document. Neither correction implies H5 is approved or implemented — the
checkpoint continues to record H5 as an open blocker with no approved boundary.

---

## 12. What this proposal does NOT claim

- **It does not claim structural uniqueness in the GENERATOR.** M1 is probabilistic there; §4.9
  explains why the primary key already supplies the structural guarantee, and **T3** measures the
  residual. If that reasoning is rejected, Option F is the answer and the boundary grows.
- **It does not claim clock correctness across a restart.** Within a process the clamp handles it
  (§4.8.2); across a restart a backwards step can reorder ids without colliding them (§8.3).
  Bounded, named, not defended against.
- **It does not fix the pre-existing 9999 ordering defect** for ids already written (§14).
- **It does not claim anything about semantic quality**, which no hardening slice touches.
- **It does not claim Phase 2 is closeable today.** §11 sets out what remains.

---

## 13. Status and what happens next

**APPROVED 2026-08-24.** M1–M9 approved as written in version 0.2, including the revised M1
construction and the revised M9 statement that generator state is ordering-only. §4.9's conclusion —
that a documented probabilistic guarantee in the generator is acceptable because the primary key
supplies the structural one — was accepted.

1. **Implement H5 to this boundary and no further.** **H6** and the newly numbered **H7** / **H8**
   are out, by decision.
2. **Run full verification and perform an independent acceptance review** against the approved
   acceptance criteria (§10.1) and the criteria stated at approval. Implementation is not acceptance.
3. **Acceptance is a separate act**, on the record, and is not automatic.
4. **Phase 2 does NOT close automatically on H5's acceptance.** Closure is a separate decision with
   §11's three conditions restated.
5. **P3 must not begin.** Its boundary is neither proposed nor approved.

**Nothing is implemented. H6 is untouched. P3 must not begin.**

---

## 14. Two findings this analysis produced, raised for a number

Neither is in this boundary. Both are recorded here rather than acted on.

| Finding | Detail |
|---|---|
| **The existing id format is already mis-ordered past 9999** | `id` is `text`, so `order by id` is a text sort, and `counterIdGenerator` overflows its four-digit pad: `aud-10000` sorts **before** `aud-9999`. Verified against the engine (§4.8.3). **`order by at, id` therefore stops reflecting creation order at the ten-thousandth id of any prefix, today, at `530dee3`** — independent of H5, and not fixed by it. H5's fixed-width id removes the exposure for *new* ids as a side effect, but rows already written keep it |
| **Ordering is inferred from the identifier at all** | `order by at, id` treats the id as a proxy for insertion order — a coincidence of the counter, not a designed property (§4.8.5). The principled fix is a monotonic insertion column on `audit_event`, `baseline`, `approval` and `validation_run`. It would make ordering structurally correct and **remove the ordering constraint from identifier design entirely**. It is a migration plus four repository reads plus a change to accepted V0–V7 read behaviour — **a separate slice, not this one** |

**NUMBERED AT APPROVAL, 2026-08-24:**

| Finding | Number | Candidate | Closure blocker? |
|---|---|---|---|
| The 9 999 ordering overflow | limitation **80** | **H7** | **No.** Phase 2's completion test is *"G1 can be reached"*, and mis-ordering beyond 9 999 rows does not prevent reaching it |
| Ordering inferred from the identifier | limitation **81** | **H8** | **No.** It does not prevent G1 being reached |

Both are recorded in [phase-2-status.md](phase-2-status.md) §0 and §12. **Neither may be addressed
inside H5**, and neither expands this boundary.

---

## 15. Revision history

| Version | Change |
|---|---|
| **0.1** | Initial proposal. Rejected UUIDv4 on ordering grounds, then specified a **fresh random suffix** — which has the same defect. **M9 claimed a monotonic guard the construction did not provide.** Internally inconsistent |
| **0.2** | **APPROVED 2026-08-24.** Corrected after a review challenge. §4.8 added: intra-millisecond ties measured at **99.5%** on the path `api.test.ts` uses, the three constructions measured side by side, and the discovery that **the existing format is already mis-ordered past 9999**. §4.9 added: uniqueness is already structural via the primary key, so the probabilistic question is about spurious write failures rather than corruption. **M1 now specifies increment-within-millisecond plus a timestamp clamp; M9 now states that generator state is ordering-only and never load-bearing for uniqueness.** T3, T6, T7 tightened. §14 raises two findings for numbering |

---
