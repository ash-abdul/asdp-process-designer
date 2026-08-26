# Phase 2 — Implementation Status

> **Status:** ## **PHASE 2 IS CLOSED — ACCEPTED 2026-08-24.** V0–V7, H4 and H5 all accepted; limitations **77** and **78** closed; the approved exit condition and K8's restart clarification both satisfied and proved by execution — §16. **Closure validates mechanics, governance, traceability and durable multi-project G1. It makes NO claim about real AI or model quality: no live model has ever been called.** V4b-eval deferred (blocked by H3). V2-PDF blocked. **UI enablement follows Phase 2's closure and does not reopen it: U1 ACCEPTED (§18), U2 ACCEPTED (§19) and D-U2.5 ACCEPTED (§20.7), all 2026-08-25. The accepted design system is the baseline for every later UI slice — §20.8. U3's BOUNDARY IS APPROVED 2026-08-26 (§21, Z1–Z14), U3-a, U3-b and U3-c are ACCEPTED (§21.1, §21.5, §21.7); U3-d–U3-f, U4 and U5 are NOT authorised.** · **Version:** 8.7 · **Updated:** 2026-08-26
> **Checkpoint:** §0 · **Commit:** **U3-c ACCEPTED** — §21.7, after a **visual review**.  **U3-b ACCEPTED** `d88c6f0`, with the anchor-refusal correction `a8cc6a2` — §21.5, §21.5.6. **U3-a ACCEPTED** `5f72f83` — §21.1. **U3 boundary approved** — §21, Z1–Z14. **D-U2.5 ACCEPTED** — `99de2a7`, §20.7. U2 accepted `c93e05b`, §19. U1 accepted `d4785c1`, §18. **PHASE 2 CLOSED** — on the corrected record `6dea2ae`. H5 accepted `55b8547` · H4 accepted `530dee3` · V7 accepted `50855bd`
> **Related:** [phase-2-plan.md](phase-2-plan.md), [phase-1-status.md](phase-1-status.md),
> [roadmap.md](roadmap.md)

---

## 0. Checkpoint — 2026-08-26

The single place to read to know where this project stands. Everything below is
traceable to a commit or an approved decision; nothing here is reconstructed.

---

## 0.0 FRESH-SESSION HANDOFF — read this first, and trust nothing outside the repository

> **This section is self-contained by design.** It assumes **no** prior conversation, and no earlier
> session's memory. If it disagrees with anything you have been told, **this file wins** — and if it
> disagrees with an approved ADR, the **ADR** wins (CLAUDE.md §7).

### Where things stand

| | |
|---|---|
| **HEAD at handoff** | **`9b2cc88`** — *"U3-c ACCEPTED — the requirements workspace, read-only"*, **pushed**. **Do not trust this cell over `git log`**: it has been one commit behind twice, because the commit that updates it is written before it exists |
| **Working tree** | **Clean at `9b2cc88`.** `git status` is the answer, not this table — check it first |
| **Remote** | `origin/main` **equals** local `main` at `9b2cc88`. Verify with `git ls-remote origin main`, **not** with the local tracking ref, which is only as fresh as the last fetch |
| **The five U3 commits** | `c1c8ddb` boundary · `5f72f83` U3-a · `d88c6f0` U3-b · `a8cc6a2` the anchor-refusal correction · `9b2cc88` U3-c |
| **In progress** | **Nothing.** **U3-a, U3-b and U3-c are ACCEPTED** (§21.1, §21.5, §21.7) and no step is open. **U3-d is the next permitted action and has not started**; §11 of [CLAUDE.md](../../CLAUDE.md) requires each step to be reported and reviewed before the next begins |

### What is ACCEPTED

| Item | State |
|---|---|
| **Phase 2** | **CLOSED / ACCEPTED 2026-08-24** — §16. Against its approved exit condition *"Phase 2 ends when G1 can be reached"* plus **K8**'s clarification that durable multi-project G1 must survive a restart. Both proved by executing tests. **Do not re-close it and do not re-open it** |
| **V0–V7** | **ACCEPTED.** The whole approved Phase 2 slice sequence |
| **H4** | **ACCEPTED 2026-08-24** — §5.13. Project-scoped requirement identity, migration 013. **Limitation 77 CLOSED** |
| **H5** | **ACCEPTED 2026-08-24** — §5.14. Durable identity generation. **Limitation 78 CLOSED** |
| **U1** | **ACCEPTED 2026-08-25** — §18. `apps/web`, development sign-in, project and source selection, the source viewer, server-provided highlighting in both reading directions |
| **U2** | **ACCEPTED 2026-08-25** — §19. Sources: inventory, upload, authority ranking, L0 validation. **The first slice that writes** |
| **D-U2.5** | **ACCEPTED 2026-08-25** at `99de2a7`, after a **visual review** — §20.7. The UI/UX design foundation (**Y1–Y28**, with the **Y12** clarification) applied to U1 and U2. **Presentation-only: it delivered no capability** |
| **U3 — the boundary** | **BOUNDARY APPROVED 2026-08-26** — §21, [u3-proposal.md](u3-proposal.md), **Z1–Z14**. **Approval of a boundary is not approval of an implementation:** each step is reported and reviewed |
| **U3-a** | **ACCEPTED 2026-08-26** — §21.1. Requirement statuses in the semantic vocabulary, with a bidirectional drift guard **proved to fail by mutation**. **It delivered no capability** |
| **U3-b** | **ACCEPTED 2026-08-26** — §21.5, at `d88c6f0`, with the authorised anchor-refusal correction at `a8cc6a2` (§21.5.6). Cite-a-unit from the source viewer, and the evidence inventory |
| **U3-c** | **ACCEPTED 2026-08-26** — §21.7, after a **visual review** whose five findings were amended and re-reviewed (§21.7.7). The **read-only** requirements workspace: list, detail inspector, evidence pane, provenance, confidence, versions bounded by G-e |

### The design baseline is SETTLED — §20.8

**Tokens, the component inventory, the semantic-state vocabulary, WCAG AA contrast over declared
token pairs, responsive behaviour and its collapse order, RTL/LTR behaviour, the accessibility rules,
the Ask ASDP interaction model and the Modern AI Engineering visual direction are the accepted
baseline for every subsequent UI slice.**

They are **not** a starting point to be re-litigated per slice. A slice that needs to change one of
them is making an **architectural** change and needs its own approval. A new UI slice inherits all of
it and should say **which screens it adds**, not which of these it intends to redecide.

### What has NOT started, and must not be started implicitly

| | |
|---|---|
| **U3-d — the review actions** · **U3-e — revision and human-inferred authoring** · **U3-f — URL sync and the edit-rate observation** | **NOT STARTED and NOT AUTHORISED.** The **boundary** is approved (§21); each **step** is still reported and reviewed before the next begins. **A green run is not acceptance, and acceptance of one step is not authorisation for the next** |
| **U4 — coverage** · **U5 — reconciliation and G1** | **NOT STARTED, NOT AUTHORISED, and explicitly OUTSIDE U3.** U4 needs API gap **G-a**, U5 needs **G-b**; both gaps are approved and **deliberately unfilled by U3** (**Z5**). Do not let U3's scope drift into either |
| **P3 — the Specification Studio** | **NOT STARTED.** Its boundary is **neither proposed nor approved**. It must not begin |
| **H3 — AI prompt/response retention** | **UNRESOLVED. Limitation 62.** [ADR-0032](../adr/ADR-0032-retain-everything.md) requires prompt and response payloads to be retained; migration 006 stores metadata only. **NO LIVE PROVIDER CALL IS PERMITTED from anywhere, including the UI** — an unretained payload is unrecoverable. **Do not implement it implicitly**, and do not "just try" a model call to see whether something works |
| **Ask ASDP** | Shipped as an **inert shell**: no `fetch`, no client, no handler that could reach one; every control disabled; **no stub answer**, because a plausible canned reply is how *"no live model has ever been called"* stops being obvious. A browser test records **every** request while the dock is opened, typed into and clicked, asserting **zero**. Keep it that way until H3 is resolved and its own boundary is approved |

### THE EXACT NEXT PERMITTED ACTION

> **Propose nothing new. Begin U3-d — and U3-d only. Do not roll into U3-e.**
>
> **U3-a, U3-b and U3-c are ACCEPTED** (§21.1, §21.5, §21.7) and nothing else in U3 is authorised to
> start. **U3-d** is the review actions, per [u3-proposal.md](u3-proposal.md) §12:
>
> - the four `POST …/requirements/:r/review` actions — **accept · reject · defer · send for
>   clarification** — one explicit act on one requirement;
> - **`POST …/requirements/:r/confirm-inference`**;
> - the **G1-reopen surface**: `mutate()` reconciles G1 inside every workspace mutation, so a
>   reviewer must be told when a decision reopened an approval.
>
> **What U3-d must not do:** `accept` is **not** `approve` — it maps to `in_review`, and the word
> *approved* must appear on no control. **No bulk anything** — limitation 70's only structural
> mitigation. **Z6-a**: no decision may be recorded from a list row alone. **Revision is U3-e**, and
> §21.7.10's finding must be resolved there rather than worked around here.
>
> When U3-d is complete it is **reported and reviewed**; acceptance is a separate decision and is
> **never inferred from a green run**.
>
> **Three things U3 must not lose, restated because they are the easiest to erode:**
>
> - **Z2-B — `apps/web` contains no AI-invoking control.** No `populate-frame`, no `profile`, no
>   `extract-evidence`, no `reconcile`. A structural test asserts the absence (U3-b onward).
> - **Z6-a is a friction safeguard, not evidence of review.** Requiring the detail pane to have been
>   rendered before a decision makes a careless decision harder to record. It is **not** evidence that
>   meaningful human review occurred, must never be described as such, and **does not close
>   limitation 70**.
> - **Limitation 70 stays OPEN.** **Z6-B** reports the edit-rate observation *with its caveat*; it is
>   **not** a quality metric and **not** a reviewer-attention metric. The conflicts-overturned half is
>   unmeasurable until U5. **No bulk-approve path exists anywhere, and that must not be weakened.**

### Other unresolved items the next session must know

| Item | State |
|---|---|
| **Limitation 70** | **OPEN, and U3 does not close it.** **Z6-B** adds one observation — proposals edited before approval — reported *with its caveat* and explicitly not a quality or attention metric. The other signal V7 offered, conflicts overturned, needs **G-b** and is **U5**. Nothing counts consideration, and the structural mitigations (no bulk approve, one act per requirement) remain the only real defence |
| **Limitations 71–76** | V7-era, open: questions ship only their deterministic half (71); a source declaring its own undecided issue is not observed (72); a new validation run over an approved set **reopens G1** by design (73); `blocked_by_policy` only comes from a refused population pass (74); the G1 fixture exercises three of the eight kinds of human work (75); the project `classificationCeiling` is carried but not enforced by `evaluateEgress` (76) |
| **H6** — limitation **79** | A domain error thrown inside a transaction is flattened to `503 database unavailable`. Recorded, not started |
| **H7** — limitation **80** | `order by at, id` mis-orders past the ten-thousandth id of any prefix. Recorded, not started |
| **H8** — limitation **81** | Repository ordering infers insertion order from the identifier. Recorded, not started |
| **H1 / H2** — limitations **43**, **44** | Provenance hardening. Proposed, **not approved** |
| **F-U1-b** | **STANDING and permanent.** Development header authentication is **localhost/development-only**; it lets a caller assert its own identity *and its own roles*, fails closed off localhost by construction, and is **never** the production solution. Production requires OIDC ([ADR-0027](../adr/ADR-0027-abstract-oidc-identity.md)), unimplemented. **Must not be relaxed, widened or made configurable** |
| **F-U2-a** | The browser suite's *no-download* guarantee is **structural today** — the pinned Playwright packages carry no install script — and would become conventional if an upgrade reintroduced one. **Check at every Playwright version bump** ([ADR-0040](../adr/ADR-0040-browser-testing-pinned-browser.md)) |
| **V2-PDF** | **BLOCKED** on a representative Arabic PDF corpus, spike **S2**, and **ADR-0037** approval. Enforced mechanically: the checker rule `pdf-engine-not-approved` fails the build on any PDF engine import |
| **V4b-eval** | **Deferred.** Needs three things: an approved credential, **E1**-permitted material, **and H3** |
| **ADR-0037** | **The only ADR still `PROPOSED`.** Gates V2-PDF |
| **Docker-deferred** | PostgreSQL container, ICU collation behaviour, `pgvector`, MinIO, OIDC development IdP, durable job queue, container build — each deferred with a named trigger, §13 |
| **The claim to never overstate** | **NO LIVE MODEL HAS EVER BEEN CALLED, in any slice.** Every evaluation figure is a **synthetic corpus against an authored stub** — `eval:frame` reports **slot accuracy 45%** and **semantic faithfulness NOT MEASURED**; `eval:reconcile` recall **50%**; `eval:baseline` is *"not usable for a routing decision"*. Vision accuracy is unmeasured. This repository claims **mechanics, governance and traceability** — never model quality |

### Verification — status at handoff, and how to reproduce it

```bash
npm run verify
```

**Green end to end, exit 0** with **U3-a, U3-b and U3-c** in the tree: **933 pass / 933** · 0 fail ·
0 cancelled · 0 skipped · 0 todo · **192 suites**; `check:arch` **193 source files**;
`check:arch:selftest` **57 cases**; `check:docs` **99 files / 1240 links**. It is **deterministic,
network-free, server-free**, and makes **no live provider call**.

**The baseline was 878 / 878 · 177 suites · 187 source files at `ad363a6`.** U3-a added 8 tests and
1 suite; U3-b added 16 tests, 2 suites and 3 source files; U3-c added 18 tests, 7 suites and 3 source
files, and its visual-review amendment (§21.7.7) a further 11 tests and 4 suites. The figure here read **902** between U3-b and its amendment and was two behind after it —
corrected. **No checker rule was added or weakened, and no dependency was added** — runtime
dependencies remain nine.

```bash
npm run test:e2e
```

**48 passed / 48.** U3-c added 8. **One pre-existing browser test changed, and it is not a
weakening** — see §21.7.3.

```bash
npm run test:e2e
```

**31 passed / 31.** A **separately invoked** capability ([ADR-0040](../adr/ADR-0040-browser-testing-pinned-browser.md)),
never part of `verify`. It drives the **system-installed Chrome** via `channel: 'chrome'` and
**downloads nothing**; a missing browser is a refusal with instructions. It starts the API and web
server itself, so **stop anything on ports 3000 and 5173 first**.

**The ten U2 browser tests in `apps/web/e2e/u2-sources.spec.ts` are the regression bar for every
later UI slice.** They passed **unchanged** through the whole design-foundation slice. Do not weaken
an assertion to make a change pass; if one fails, either the code is wrong or the test is wrong — say
which (CLAUDE.md §9).

If tests behave strangely, the usual cause is a stale `dist/`:

```bash
npm run clean && npm run verify
```

### Running the application locally for development

**Migrations are a one-shot task and NEVER run on service start** ([ADR-0028](../adr/ADR-0028-containerised-compose-first.md)
K7). Skipping the migrate step leaves a service that starts happily and then answers **every** request
`503 database unavailable`, which reads as an infrastructure outage and is not one.

```bash
npm run build
```

```bash
ASDP_DATABASE_DIR=.asdp-dev ASDP_BLOB_ROOT=.asdp-dev/blobs node apps/api/dist/migrate-task.js
```

```bash
ASDP_DATABASE_DIR=.asdp-dev ASDP_BLOB_ROOT=.asdp-dev/blobs node apps/api/dist/main.js
```

In a second terminal:

```bash
npm run dev:web
```

Then open **`http://127.0.0.1:5173`** and sign in — any subject, any roles, all ten selectable. The
web dev server binds to **localhost only**, deliberately: **W5-A** permits development authentication
solely against a localhost origin. `.claude/launch.json` also carries both servers, with `asdp-api`
chaining migrate-then-serve so it cannot be started unmigrated.

`.asdp-dev/` is gitignored. To reset it — this **deletes local development data and nothing else**:

```bash
lsof -ti:3000 | xargs kill; sleep 2; rm -rf .asdp-dev; ASDP_DATABASE_DIR=.asdp-dev ASDP_BLOB_ROOT=.asdp-dev/blobs node apps/api/dist/migrate-task.js
```

Seed something to look at — create a project, then add a source with the returned `id`:

```bash
curl -s -X POST http://127.0.0.1:3000/projects -H 'x-asdp-subject: u-admin' -H 'x-asdp-roles: PlatformAdmin' -H 'content-type: application/json' -d '{"key":"dev","name":"Licence renewal"}'
```

### Where to read next

1. [CLAUDE.md](../../CLAUDE.md) — operating instructions. **§11 governs whether you may start anything at all.**
2. This §0, then **§16** (Phase 2 closure), **§17** (roadmap reconciliation), **§18**–**§20** (U1, U2, D-U2.5) and **§21** (U3's approved boundary and U3-a).
3. [ui-enablement-proposal.md](ui-enablement-proposal.md) **W1–W13**, [ui-design-foundation-proposal.md](ui-design-foundation-proposal.md) **Y1–Y28** and [u3-proposal.md](u3-proposal.md) **Z1–Z14** — the approved UI boundaries.
4. [ADR-0039](../adr/ADR-0039-react-presentation-layer.md) and [ADR-0040](../adr/ADR-0040-browser-testing-pinned-browser.md) — the presentation boundary and the browser-testing decision. **Read ADR-0039 before touching `apps/web`.**

---

> ## If you are a fresh session, read this box first
>
> **The whole approved Phase 2 slice sequence — V0 through V7 — is ACCEPTED, and so are both
> hardening slices, H4 and H5.** The sentence that stood here added *"nothing is in progress and the
> working tree is clean"*. It was true when written and is **not** a standing fact: as at 2026-08-26,
> **U3-a is written and awaiting review** (§21.1). **Check `git status` rather than this box.**
>
> **G1 is reachable end to end, by any number of projects in one database, and it survives an
> application restart.** That is the approved exit condition (*"Phase 2 ends when G1 can be
> reached"*) together with K8's binding clarification, and both are proved by executing tests rather
> than by assertion.
>
> # **PHASE 2 IS CLOSED — ACCEPTED 2026-08-24.**
>
> Closed on an explicit decision, against the approved exit condition, on a record audited for
> internal consistency first (`6dea2ae`). The two blockers that existed are closed: limitation **77**
> by **H4** (§5.13) and limitation **78** by **H5** (§5.14). **§16 is the closure record.**
>
> **WHAT CLOSURE VALIDATES:** mechanics, governance, traceability and **durable multi-project G1**.
>
> **WHAT CLOSURE DOES NOT CLAIM — read this before citing Phase 2 anywhere:** **NO LIVE MODEL HAS
> EVER BEEN CALLED.** Not once, in any slice. Every evaluation number is a **synthetic corpus against
> an authored stub**. Phase 2 makes **no claim whatever about real AI or model quality**. That
> question opens with **V4b-eval**, which is blocked by **H3**.
>
> **AND IT IS NOT A PRODUCT MILESTONE.** Implementation Phase 2 spans roadmap **P1 + P2**, and
> **closing it did not close them** — **§17**. At closure there was **no user interface of any kind**.
> **That sentence is now out of date and is corrected here rather than deleted:** `apps/web` **exists**
> (U1, §18) and **the source viewer and source intake now render** (U1 and U2, §18–§19). The
> **requirements workspace** and **coverage dashboard** are still **APIs only** — they are U3 and U4,
> and **neither is authorised**. Roadmap P1 and P2 stay open ([roadmap.md](roadmap.md) §0).
>
> **H4 IS ACCEPTED — 2026-08-24.** Boundary `ce15d9d` (**K1–K6** and **K8**; **K7 refused**),
> implementation `193d295`, corrections `5a5504b`. **Limitation 77 is CLOSED:** two projects in
> one database each reach G1 independently, and each starts at `REQ-0001` — §5.13.
>
> **H5 IS ACCEPTED — 2026-08-24.** Boundary `2d04ab1` (M1–M9), implementation `0ba13b7`.
> **Limitation 78 is CLOSED:** identifiers survive a restart and multiple instances, and **durable
> multi-project G1 works across an application restart** — §5.14.
>
> **NO PHASE 2 CLOSURE BLOCKER REMAINS ON THE RECORD, and closure was then taken as a separate,
> explicit decision — §16.** The sentence that stood here read *“PHASE 2 IS STILL NOT CLOSED”*. It was
> true when written on 2026-08-24, went stale the moment the decision was taken hours later, and is
> **corrected 2026-08-25** rather than deleted, so the sequence stays legible. §11 of
> [CLAUDE.md](../../CLAUDE.md) still governs everything after it: **acceptance is always a separate
> decision, and it is never inferred from a green run.**
>
> ## **UI ENABLEMENT — U1 ACCEPTED, U2 ACCEPTED. U3'S BOUNDARY IS APPROVED; U4 AND U5 ARE NOT AUTHORISED.**
>
> **U1 IS ACCEPTED — 2026-08-25** (§18). Boundary `da95b56` (**W1–W13**),
> [ADR-0039](../adr/ADR-0039-react-presentation-layer.md) `5882bb2`, implementation `d4785c1`.
> `apps/web` **exists** and is the first package ever to declare the checker's `presentation` class.
> Read-only: development sign-in → project → source → viewer → server-provided highlighting, correct
> in **both** reading directions.
>
> **U2 IS ACCEPTED — 2026-08-25** (§19) — **the first slice in this application that writes.**
> Boundary `0b7b700` (**X1–X10**), [ADR-0040](../adr/ADR-0040-browser-testing-pinned-browser.md)
> `0b7b700`, implementation `8f7d37b` (U2-a) + `c93e05b` (U2-b–e). Verified **838/838 tests, exit 0**,
> plus **10/10 browser tests** against a **system-installed Chrome that was never downloaded**.
> Accepted for **mechanics, governance and the journey — explicitly not for visual or UX design**,
> which has no approved foundation yet (§19.2).
>
> **UI enablement does NOT reopen Phase 2**, whose closure stands unchanged (§16), and it does **not**
> close roadmap P1 or P2 (§17). It is delivering the P1/P2 **rendering surfaces** §17.3 recorded as
> undelivered — the source viewer (U1) and source intake (U2).
>
> **F-U1-a is DISCHARGED** — the browser/E2E framework decision was taken as
> [ADR-0040](../adr/ADR-0040-browser-testing-pinned-browser.md), **before** U2 rather than before U3,
> because X10-A brought it forward (§18.1).
> **F-U1-b STANDS, unchanged and permanently:** development header authentication is
> **localhost/development-only**, lets a caller assert its own identity *and its own roles*, fails
> closed off localhost by construction, and is **never** the production authentication solution.
> Production requires OIDC ([ADR-0027](../adr/ADR-0027-abstract-oidc-identity.md)), unimplemented.
>
> **D-U2.5 IS ACCEPTED — 2026-08-25** (§20.7), at `99de2a7`, **after a visual review.** The design
> foundation (**Y1–Y28**, with the **Y12** clarification) and its application to U1 and U2 are both
> accepted. It delivered **no capability**: the proof that it was presentation-only is that **the ten
> U2 browser tests passed UNCHANGED**, with no assertion weakened.
>
> **THE ACCEPTED DESIGN SYSTEM IS THE BASELINE FOR EVERY SUBSEQUENT UI SLICE — §20.8.** Tokens,
> components, the semantic-state vocabulary, WCAG AA contrast, responsive and RTL behaviour,
> accessibility rules, the Ask ASDP interaction model and the Modern AI Engineering direction are
> **settled**. A slice that needs to change one of them is making an architectural change and needs
> its own approval.
>
> **U3–U5 MUST NOT START.** W13 approved U1→U5 **as a sequence**, not as authorisation; each slice
> needs its own boundary approved, as U1's, U2's and D-U2.5's each were. **The next permitted action
> is to PROPOSE the U3 boundary.**
>
> **Open and explicitly NON-blocking:** **H6** (limitation 79), **H7** (limitation 80), **H8**
> (limitation 81), **H1**/**H2** (limitations 43/44), **H3** (limitation 62, which blocks every live
> provider call), **V2-PDF** and **V4b-eval**. None is on the path to G1.
>
> **H4 and H5 are accepted for mechanics and governance, explicitly NOT for semantic quality** —
> §5.13.1 and §5.14.1.
>
> **H4 is accepted for mechanics and governance, explicitly NOT for semantic quality, and
> explicitly NOT across a restart** — §5.13.1.
>
> **Do NOT start P3.** Its boundary is neither proposed nor approved, and §11 of
> [CLAUDE.md](../../CLAUDE.md) requires an approved boundary before any slice begins.
>
> **No live provider call is permitted** while limitation **62 / H3** stands.
>
> **What V0–V7 acceptance claims:** mechanics and governance. **What it does not claim:** model
> quality. No live model has ever been called; every evaluation number is a synthetic corpus against
> an authored stub.

| | |
|---|---|
| **Phase** | **Phase 2** — multimodal intake and structured requirements. It **spans** roadmap **P1 + P2**, and **closing it did NOT close them**: P1 and P2 carry user-facing commitments this repository has not delivered — **§17**, [roadmap.md](roadmap.md) §0 |
| **Current slice** | **None open. U3-a, U3-b and U3-c are ACCEPTED** (§21.1, §21.5, §21.7) and **U3's boundary is APPROVED** 2026-08-26 (§21, **Z1–Z14**). The next permitted action is **U3-d, and U3-d only**; **U3-e, U3-f, U4 and U5 are NOT authorised.** D-U2.5 is ACCEPTED — 2026-08-25, §20.7, at `99de2a7` after a visual review. **PHASE 2 REMAINS CLOSED** — 2026-08-24, §16; UI enablement does not reopen it. U2 accepted §19; U1 accepted §18; H5 accepted §5.14; H4 accepted §5.13; V7 accepted §10.10 |
| **Previously** | **U2 ACCEPTED** — 2026-08-25, §19, against decisions **X1–X10** |
| **Accepted so far** | **V0 · V1 · V2 · V3 · V4a · V4b-core · V5 · V6 · V7 · H4 · H5 · U1 · U2 · D-U2.5 — the whole approved Phase 2 slice sequence, both hardening slices, the first two UI enablement slices, and the design foundation.** D-U2.5 accepted 2026-08-25 (`52ba323` + `90d9297` + `c42f99e` + `99de2a7`) after a **visual review**; U2 accepted 2026-08-25 (`0b7b700` + `8f7d37b` + `c93e05b`); U1 accepted 2026-08-25 (`da95b56` + `5882bb2` + `d4785c1`). H5 accepted 2026-08-24 (`2d04ab1` + `0ba13b7`); H4 accepted 2026-08-24 (`ce15d9d` + `193d295` + `5a5504b`). V7 accepted 2026-08-24; V6 at `a653333`; V5 at `43ab748` (§8.11); V4b-core at `3d5dfb6` (§7.10); V4a at `d82d285`; V3 at `bea4041` |
| **Commit** | **D-U2.5 `52ba323` + `90d9297` + `c42f99e` + `99de2a7`.** U2 `0b7b700` + `8f7d37b` + `c93e05b`. U1 `da95b56` + `5882bb2` + `d4785c1`. H5 `2d04ab1` + `0ba13b7`. H4 `ce15d9d` + `193d295` + `5a5504b`. V7 `7bfa440` + `f38ef06` + `96f84e4` + `7e50303`. V6 `eebabe0` + `a653333` · V5 `4b148b4` + `43ab748` · V4b-core `34ca68e` + `3d5dfb6` · V4a `09dfc9b` + `d82d285` |
| **Phase 2 closure** | ## **CLOSED — ACCEPTED 2026-08-24**, §16. Phase 2's completion test is *"Phase 2 ends when G1 can be reached"*, plus K8's clarification that durable multi-project G1 must survive a restart. **Both satisfied and proved by execution.** Limitations 77 and 78 closed. Everything still open — H1, H2, H3, H6, H7, H8, V2-PDF, V4b-eval, ADR-0037 — is **off the path to G1**, was non-blocking at closure, and **remains open and unresolved** |
| **Working tree** | **Clean.** Everything is committed |
| **Work in progress** | **None.** Spike S2's probe scripts lived outside the repo and were never committed |
| **Next approved action** | **NONE. D-U2.5 is accepted and nothing is approved to follow it.** The next slice **in the approved sequence** is **U3** — the requirements workspace, **W13** — and it is **NOT authorised**: §11 of [CLAUDE.md](../../CLAUDE.md) requires its boundary to be **proposed and approved** first, as U1's, U2's and D-U2.5's each were. **The only permitted next action is to propose the U3 boundary.** **The accepted design system is the baseline for U3 and every UI slice after it** — §20.8. The other open sequencing options — H3 and live-AI enablement, or P3 — remain **UNPLANNED with no approved boundary**. **P3 must NOT start**: its boundary is neither proposed nor approved, and §11 of [CLAUDE.md](../../CLAUDE.md) requires an approved boundary before any slice begins. **No live provider call is permitted** while **H3 / limitation 62** stands — an unretained payload is unrecoverable. H1, H2, H6, H7, H8, V2-PDF, V4b-eval and ADR-0037 all remain open and none may be started without approval. **P3 must not start**: its boundary is neither proposed nor approved. **V4b-eval must not begin**: it needs an approved credential, E1-permitted material **and H3**. **No live provider call is permitted while limitation 62 / H3 stands.** V2-PDF stays blocked on the Arabic corpus, spike S2 and [ADR-0037](../adr/ADR-0037-binary-document-extraction.md). **H1/H2** are proposed, not approved |

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
| **H5** — durable identity generation, `${prefix}-${ULID}`, the one production generator | `2d04ab1` + `0ba13b7` | **Accepted** — 2026-08-24, §5.14, after an independent review with mutation testing. Accepted for **mechanics and governance, explicitly not semantic quality and explicitly not structural uniqueness in the generator** — §5.14.1 |
| **H4** — project-scoped requirement identity, migration 013, the one allocator | `ce15d9d` + `193d295` + `5a5504b` | **Accepted** — 2026-08-24, §5.13. Boundary `ce15d9d` (K1–K6, K8; **K7 refused**); implementation `193d295`; corrections `5a5504b` after an independent review. Accepted for **mechanics and governance, explicitly not semantic quality and explicitly not across a restart** — §5.13.1 |
| **V7** — the human requirements workspace, human-originated L3, clarification questions, and **G1** | `7bfa440` + `f38ef06` + `96f84e4` + `7e50303` | **Accepted** — 2026-08-24, §10, reviewed in §10.10. **G1 is reachable end to end.** Accepted for **mechanics and governance, explicitly not model quality** — §10.7 |

| **U1** — `apps/web`, development sign-in, project and source selection, the source viewer, server-provided highlighting in both directions | `da95b56` + `5882bb2` + `d4785c1` | **Accepted** — 2026-08-25, §18. Boundary **W1–W13**; [ADR-0039](../adr/ADR-0039-react-presentation-layer.md) recorded **before** any UI code. Accepted for **mechanics, governance and RTL/LTR correctness, explicitly not for visual or UX design** |
| **U2** — sources: inventory, upload, authority ranking, L0 validation; **the first slice that writes** | `0b7b700` + `8f7d37b` + `c93e05b` | **Accepted** — 2026-08-25, §19, after an independent review. Boundary **X1–X10**; [ADR-0040](../adr/ADR-0040-browser-testing-pinned-browser.md) recorded **before** implementation. Three defects found and corrected (§19.1). Accepted for **mechanics, governance and the journey, explicitly not for visual or UX design** |
| **D-U2.5** — the design foundation, demonstrated on U1 and U2. **Presentation-only: no capability** | `52ba323` + `90d9297` + `c42f99e` + `99de2a7` | **Accepted** — 2026-08-25, §20.7, **after a visual review**. Boundary **Y1–Y28** with the **Y12** clarification and an approved four-screen visual reference. Eight defects found and corrected across two review passes (§20.4.1, §20.4.2). **The ten U2 browser tests passed unchanged throughout**, which is what makes it presentation-only |

**V0–V3 added no runtime dependency after V0.** Runtime dependencies stood at seven through V7, H4
and H5; **U1 added two** — `react` and `react-dom`, both pinned exactly — for a total of **nine**.
**U2 added no runtime dependency**: `@playwright/test` is pinned and is a **development** dependency,
and `npm run verify` never invokes it.

### Verification of the current working tree — V0–V7, H4, H5, U1 and U2 accepted, green

| | |
|---|---|
| Verified | **2026-08-25**, `npm run verify` **green end to end, exit 0**, with **U2 accepted**. Re-run independently at U2's acceptance on a clean tree, not read from a prior record |
| Tests | **878 pass · 0 fail · 0 skipped · 0 todo** · 177 suites. **+40 since U2**: 34 for the design foundation, 6 for the WCAG contrast audit |
| `check:arch` | passed — **187 source files** (the checker walks `.tsx` as well as `.ts` since U1) |
| `check:arch:selftest` | passed — **57 cases**. U1 added six for the four `presentation` rules; **U2 corrected one that had been passing for the wrong reason** — §19.1 defect 3 |
| `check:docs` | passed — **97 files, 1084 links** |
| `npm run verify` | **green end to end**, **server-free**, **network-free**, and it makes **no live provider call**. It does **not** invoke `test:e2e`, so browser availability can never gate the ordinary build ([ADR-0040](../adr/ADR-0040-browser-testing-pinned-browser.md) §4) |
| `npm run test:e2e` | **10 passed in 11.6 s.** Preflight reported *“Google Chrome 151.0.7922.174 (system-installed; nothing downloaded)”*. A **separate, explicitly invoked** capability, exactly as **A7** treats live AI evaluation |
| Durability | Verified by execution: sources, text, units, images, evidence **and AI interactions** survive a full service restart, and anchors minted before it still resolve after it. Since **H5** (§5.14), **identifiers survive a restart too** — so **project A can reach G1, the application can restart, and project B can then reach G1 in the same database** |
| Migrations | `001_governance` … `007_evidence_confidence` · `008_requirements` · `009_reconciliation` · `010_requirement_review` · `011_validation_run` · `012_slot_policy_block` · **`013_requirement_project_scope`** |
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

**40 total.** ADR-0001…0032 approved in Phase 0. ADR-0033 discharged by ADR-0034.

| ADR | State |
|---|---|
| ADR-0034, 0035, 0036 | **Approved**, V0 |
| **ADR-0038** — target versus content verification | **Approved**, V3 |
| **ADR-0039** — React + Vite as the presentation layer | **Approved**, 2026-08-25, for the UI enablement slice |
| **ADR-0040** — browser testing on a pre-provisioned browser | **Approved**, 2026-08-25, for U2 |
| **ADR-0037** — binary document extraction toolchain | **PROPOSED — HELD.** The only open ADR |

### Blocked items

| Item | Blocked on |
|---|---|
| ~~**PHASE 2 CLOSURE**~~ | **DISCHARGED — Phase 2 CLOSED / ACCEPTED 2026-08-24**, §16 |
| **P3 — the Specification Studio** | **No proposed boundary, no approval.** §11 of [CLAUDE.md](../../CLAUDE.md): a slice needs its scope approved, not merely a go-ahead. It must not begin |
| **V2-PDF** — PDF adapter, rasterisation, `pdf_region` rectangle lists, `L0-ING-008` wired | (1) a representative Arabic PDF corpus per [s2-corpus-request.md](s2-corpus-request.md) · (2) **spike S2 completed** against it, producing the exact-precision yield rate · (3) **ADR-0037 approved**. Enforced mechanically by the checker rule `pdf-engine-not-approved`; `@embedpdf/pdfium` is **not installed** |
| **V4b-eval, and every live provider call** | **Three** things, not two: (1) an approved credential · (2) E1-permitted representative material · (3) **H3 — limitation 62.** [ADR-0032](../adr/ADR-0032-retain-everything.md) requires prompt and response payloads to be retained and migration 006 retains metadata only, so **no live provider call is permitted while the gap stands** — an unretained live payload is unrecoverable. **V5 is unaffected: it is replay-only** |
| **Vision quality measurement** | No live provider has ever been called and no recorded corpus exists. Shape, refusals, egress and provenance are proven; **accuracy is not** |
| **Broker-consumer wiring, recorded fixtures, interaction persistence** | **Discharged by V4a** (§6). D6 deferred these from V3; the broker now has a real consumer, interactions persist, and replay fixtures exist |
| **Captured (as opposed to authored) fixtures** | **No credential exists in this environment**, so no live call has been made. The capture path is built and exercised against an authored stub; the first real capture is a credentialed operation, not a code change |
| **Ceiling enforcement** | No requirements exist yet to enforce ceilings on. `ceilingFor` is computable and tested; V5 enforces it |
| **Element-wise confirmation records** | V5. V3 made each region individually addressable, which is its prerequisite |
| Collation behaviour, PostgreSQL container, MinIO, OIDC, durable job queue, container build | **Docker unavailable** — §10, each with a named trigger |
| `RESTRICTED`+ material analysis | **OD-1**, now scoped as a *deployment* gate rather than a development blocker (A8) |

### Open items a fresh session must know about

Consolidated from §12, §5.12 and the blocked-items table. **Nothing here is reconstructed** — each
traces to a numbered limitation or an approved decision.

| Item | State | Why it matters now |
|---|---|---|
| **H5** — every surrogate id comes from a **per-process** counter | **ACCEPTED 2026-08-24** (§5.14). Boundary `2d04ab1` (M1–M9), implementation `0ba13b7`. **Limitation 78 CLOSED.** Accepted for **mechanics and governance, explicitly not semantic quality** — §5.14.1 | After a restart against a durable database the first write of any kind collides, so **durable multi-project G1 does not survive a restart**. Latent only because the default database is in-memory. **Deliberately outside the H4 boundary** and **must not be implemented inside it**. Needs its own analysis, boundary approval, implementation and acceptance |
| **H6** — a domain error thrown inside a transaction is flattened to `503` | **Confirmed and reproduced 2026-08-24 while analysing H4. Recorded, not started.** Limitation **79** | `PgliteDatabase.transaction` re-maps every escaping error through `mapDriverError`, so a modelling defect reads as an infrastructure outage. Proposed as **K7** and **NOT APPROVED for H4** — a separate concern, not required to fix limitation 77. **Must not be implemented in the H4 boundary** |
| **H7** — `order by at, id` mis-orders past 9 999 | **Found and verified 2026-08-24 while analysing H5. Recorded, not started.** Limitation **80** | `id` is `text`, so the four-digit pad overflows and `aud-10000` sorts before `aud-9999`. A V0 defect, latent because no prefix has reached 10 000. **Outside the H5 boundary. NOT a Phase 2 closure blocker** |
| **H8** — ordering inferred from the identifier | **Found 2026-08-24 while analysing H5. Recorded, not started.** Limitation **81** | Four tables order by `(timestamp, id)`, using the id as a proxy for insertion order. The fix is a monotonic insertion column, which would decouple ordering from identifier design. **Outside the H5 boundary. NOT a Phase 2 closure blocker** |
| **UI/UX design foundation** — no approved visual or interaction foundation exists | **PROPOSED, NOT APPROVED** — [ui-design-foundation-proposal.md](ui-design-foundation-proposal.md). Recorded as **F-U2-b**, §19.3 | U1 and U2 established the journey, not a design system. U3–U5 and a later **P3 Specification Studio** would otherwise be built on ad-hoc styling and then need a fundamental redesign. **Requested before U3.** It also carries the **Ask ASDP** contextual-assistant UX architecture, which is **design only** — implementing it needs **H3** resolved first |
| **F-U1-b** — development header authentication | **STANDING, permanent** — §18.1 | It lets a caller assert its own identity **and its own roles**, and fails closed off localhost by construction. **U2 writes**, which makes this more material, not less. It must never be relaxed, widened or made configurable, and it is **never** the production solution. Production requires OIDC ([ADR-0027](../adr/ADR-0027-abstract-oidc-identity.md)), unimplemented |
| **F-U2-a** — the no-download guarantee is structural today, conventional after an upgrade | **OPEN, not a defect today** — §19.3 | The pinned Playwright packages carry **no install script**, so `npm ci` cannot fetch a browser. If an upgrade reintroduces one, `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` must be **recorded in the repository** rather than in prose. Check at any Playwright version bump |
| **H3** — AI prompt/response payloads not retained | **Proposed, not approved.** Limitation **62**, §5.12 | **Blocks every live provider call**, and therefore V4b-eval. [ADR-0032](../adr/ADR-0032-retain-everything.md) requires retention; migration 006 stores metadata only. Raise **before** the first live call — an unretained payload is unrecoverable |
| **H1 / H2** — provenance hardening | **Proposed, not approved.** Limitations **43**, **44**, §5.12 | V3 acceptance was explicitly not held on either. Small, mechanical, still unapproved |
| **ADR-0037** — binary document extraction | **PROPOSED — HELD.** The only open ADR | Gates **V2-PDF**. `@embedpdf/pdfium` is not installed and the checker rule `pdf-engine-not-approved` fails the build on any PDF engine import |
| **Spike S2** — Arabic PDF corpus | **Not completed.** [s2-corpus-request.md](s2-corpus-request.md) | Gates ADR-0037, and therefore V2-PDF. Needs representative material that does not exist here |
| **V4b-eval** — real-provider evaluation | **Deferred, not started** | Needs **three** things: an approved credential, E1-permitted material, **and H3**. It is the first point at which model quality could be claimed at all |
| **U5** — source-declared undecided issues | **Deferred by approved decision.** Limitation **72** | A document saying *"the escalation path is TBD"* raises no question. Deliberate, and V7 was accepted with it deferred |
| **`SYNTHESISE_QUESTIONS` wording half** | **Not built.** Limitation **71** | V7 ships only the deterministic half by decision **U6**. Questions read as generated text |
| **The two V7 workflow signals** | **Not reported.** Limitation **70** | §16 of [v7-proposal.md](v7-proposal.md) offered conflicts-overturned and proposals-edited-before-approval. Neither is computed, so approval theatre stays unmeasured |
| **Project `classificationCeiling` unenforced** | **Pre-existing, unfixed.** Limitation **76** | Found during the V7 corrections and deliberately not fixed there. **Raise alongside H3, before any live call** |
| **Docker-deferred infrastructure** | **Deferred with named triggers.** §13 | PostgreSQL container, MinIO, OIDC, durable job queue, container build, collation behaviour |

### What is NOT started

**V4b-eval** has not started and is not startable here: it needs an approved credential and
E1-permitted material.

**The requirements capability now exists**, and this paragraph is the record of what changed. V5
turned evidence into structured requirement proposals; V6 added canonicalisation, conflict candidates
and deterministic precedence; **V7 added the human workspace and G1**. `POPULATE_FRAME`,
`RECONCILE_SOURCES`, conflict precedence, clarification-question generation, the requirements
workspace and **G1 itself** are implemented — the sentence that stood here saying none of them
existed was true at V4b-core and is false now.

**`SYNTHESISE_QUESTIONS` ships only its deterministic half** (**U6**): code decides *which* questions
exist, and the AI wording half is not built. **U5** — source-declared undecided issues — stays
deferred by decision.

**No generation capability of any kind exists**: no BPMN, DMN or form generation, no Process IR, no
BPS, no DecisionSpec, FormSpec or ServiceInterface, no Domain Model Registry, no Specification
Studio, no graphical designer. **P3 has not started.**

## 1. Position

| | |
|---|---|
| Slices completed | **V0** · **V1** · **V2** · **V3** (§5) · **V4a** (§6) · **V4b-core** (§7) · **V5** (§8) · **V6** (§9) · **V7** (§10) — **all accepted** — **plus both hardening slices: **H4** (§5.13) and **H5** (§5.14), accepted 2026-08-24. The approved Phase 2 slice sequence is complete, no closure blocker remained, and **PHASE 2 IS CLOSED / ACCEPTED 2026-08-24** — §16 |
| Next slice | **None approved, and nothing is in progress.** The **only** open question is whether to **close Phase 2** — a decision that has not been taken and must not be inferred from the absence of blockers. **P3 has not started** and its boundary is neither proposed nor approved. **V4b-eval** is deferred and blocked by **H3**; **V2-PDF** is blocked on the Arabic corpus, spike S2 and [ADR-0037](../adr/ADR-0037-binary-document-extraction.md). **H1**, **H2**, **H3**, **H6**, **H7** and **H8** are open and **all non-blocking** |
| Tests | **794 pass · 0 fail · 0 skipped · 0 suppressed** · 158 suites (288 V0 · 415 V1 · 480 V2 · 572 V3 · 596 V4a · 621 V4b-core · 664 V5 · 714 V6 · 739 V7 · 769 V7-corrected · **782 H4** · **794 H5**) |
| Verification | build · `check:arch` (**155 files**) · checker self-test (**50 cases**) · `check:docs` (**93 files, 989 links**) — all clean, and **no live provider call** |
| Durability | Verified by execution: sources, text, units, images, evidence **and AI interactions** survive a full service restart, and anchors minted before it still resolve after it. Since **H5** (§5.14), **identifiers survive a restart too** — so **project A can reach G1, the application can restart, and project B can then reach G1 in the same database** |
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
| V7 | `7bfa440` — *the human requirements workspace and G1* · corrected at `f38ef06`, `96f84e4`, `7e50303` · **accepted** 2026-08-24 |
| **H4** | `193d295` — *project-scoped requirement identity `(project_id, id)`, migration 013* · boundary `ce15d9d`, corrections `5a5504b` · **accepted** `530dee3` |
| **H5** | `0ba13b7` — *durable identity generation, `${prefix}-${ULID}`* · boundary `2d04ab1` · **accepted** `55b8547` |

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

### **H4** — requirement identity is per project against a GLOBAL primary key

**Raised 2026-08-24 during the final V7 review. A V5 defect, not a V7 one, and deliberately NOT fixed
inside the V7 correction pass** — expanding a correction into an unrelated slice is how boundaries
stop meaning anything (§11 of CLAUDE.md). Recorded as limitation **77**.

`requirement.id` is `text primary key` — **globally** unique (migration 008, `4b148b4`). But
`nextRequirementNumber` takes the high-water mark **per project**, exactly as invariant D15 describes
(*"REQ-####, per project"*). The two disagree.

**Consequence:** the second project in a database to run `POPULATE_FRAME` allocates `REQ-0001` again,
collides, and the unique violation surfaces as a **503 `database unavailable`** — an infrastructure
error for what is a modelling defect. **A second project can therefore never reach G1.** Reproduced
directly: project A populates; project B, same database, fails.

Every test to date uses one project per server, which is why nothing caught it.

**Shape of the change** — and it is a real decision, not a one-liner:

- make the key `(project_id, id)` and re-point `requirement_evidence`, `requirement_flag`,
  `conflict_participant`, `canonical_entity.requirement_ids` and `requirement_version` at the
  composite — the ripple migration 010 explicitly chose to avoid when it split
  `requirement_version` out; **or**
- keep a global surrogate key and make `REQ-####` a per-project display identifier, which changes
  what a baseline member names and therefore touches ADR-0017's hash.

The second option looks smaller and is not: `(id, version)` is what a baseline member names today,
and changing it changes what every existing signature covered. **This needs its boundary approved
like any other slice.**

**CLOSED AND ACCEPTED — 2026-08-24:** [h4-proposal.md](h4-proposal.md), decisions **K1–K8** (**K1–K6** and **K8** approved; **K7 refused**). The shape is the composite key `(project_id, id)`; `REQ-####` is unchanged and stays per project, so **no ADR-0017 signature moved**. Boundary `ce15d9d`, implementation `193d295`, corrections `5a5504b`. **§5.13** records the acceptance and **§5.13.1** what it does and does not claim. Two defects found while analysing this one remain recorded and excluded: **H5** (limitation 78) — **the one remaining Phase 2 closure blocker** — and **H6** (limitation 79), the rejected **K7**.

### 5.13 H4 — **ACCEPTED 2026-08-24**

**Accepted 2026-08-24** against the approved boundary ([h4-proposal.md](h4-proposal.md),
**K1–K6** and **K8**), after an **independent acceptance review** and a **four-defect correction
pass**. **K7 was NOT approved and is not implemented.** **H5 is NOT implemented.**
**Limitation 77 is CLOSED.**

| | |
|---|---|
| **Boundary** | `ce15d9d` — K1–K6 and K8 approved, **K7 refused** |
| **Implementation** | `193d295` |
| **Corrections** | `5a5504b` — F1–F4 from the acceptance review, **no production code touched** |
| **Verification at acceptance** | `npm run verify` **green end to end, exit 0**, run twice on the committed tree: **782 pass · 0 fail · 0 skipped · 0 todo · 155 suites**; `check:arch` 153 files; `check:arch:selftest` 43 cases; `check:docs` 92 files / 948 links |

`requirement`'s primary key is now `(project_id, id)`. `REQ-0001` is still `REQ-0001`, still
allocated from the calling project's high-water mark, and **still what a baseline member names** —
so no existing ADR-0017 signature moved. The identifier did not change; the scope of its uniqueness
did, from global to per project, which is what **D15** always said.

| | |
|---|---|
| **Migration** | **`013_requirement_project_scope.sql`** — additive (**K6**). `requirement` PK becomes `(project_id, id)`; `requirement_evidence` and `canonical_entity_alias` gain a backfilled `project_id`; six foreign keys re-pointed at the composite; `requirement_version` PK becomes `(project_id, requirement_id, version)`; `requirement_relation` uniqueness scoped. **No id renumbered, no row deleted, no baseline / approval / audit record touched** |
| **One-way door** | The backfill recovers `project_id` by joining through `requirement(id)`, which is unambiguous **only while ids are still globally unique** — the property the migration removes. Stated in the migration's own header, and exercised against a seeded pre-migration database |
| **Allocation** | **K3.** `allocateD15_requirementId` in `@asdp/domain` is now the only allocator. It already existed and nothing called it |
| **Addressing** | **K4.** `get`, `evidenceFor`, `setReviewStatus`, `approveRequirements`, `confirmInference` and `versionsFor` all take `projectId`. Ownership is structural: the wrong project does not resolve, and a missed call site is a compile error |
| **Enforcement** | New checker rule **`requirement-id-allocation`** — an inline `REQ-` template literal or concatenation outside `@asdp/domain` fails the build. **Four self-test cases**, two positive and two negative |

**Three things implementation found that the proposal did not predict**, all recorded in
[h4-proposal.md](h4-proposal.md) §13a: a **third** inline allocator in the evaluation harness, which
the new rule caught on its first run; `canonical_entity_alias` needing schema, mapper, insert and
two construction sites rather than only a column — the one defect the change itself introduced, and
test **A7** is what caught it; and both projects allocating identical id sets, which broke an adverse
fixture and is itself confirmation that numbering is per project.

**Nothing was weakened.** No assertion was loosened, no test skipped or deleted. Three fixture errors
were corrected and one expectation was replaced by a comparison against observed state.

#### 5.13.1 What H4's acceptance claims, and what it does not

**Accepted for — mechanics and governance:**

- **Two projects in one database each reach G1 independently**, and each starts at `REQ-0001`. That
  is the defect limitation 77 named, and it is closed.
- **Requirement identity is `(projectId, id)` and is enforced by the database**, not by convention.
  A cross-project evidence link is refused by the composite foreign key; a cross-project baseline
  membership has no row to name.
- **No existing [ADR-0017](../adr/ADR-0017-approval-as-baseline-signature.md) signature moved.** A
  baseline signed under the pre-H4 schema recomputes byte-identically after migration 013, through
  the production read path.
- **The migration is additive**: no id renumbered, no row deleted, no baseline, approval or audit
  record touched.
- **`REQ-####` is allocated in exactly one place**, and an architecture-checker rule refuses a second.

**NOT claimed:**

- **NOT semantic quality of any kind.** Nothing here says a requirement is right. No live model has
  ever been called; `npm run verify` makes no live provider call.
- **NOT durability across a restart.** Multi-project G1 holds **within one process lifetime**. Every
  surrogate id still comes from a per-process counter (**H5 / limitation 78**), so after a restart
  against a durable database the first write of any kind collides. **This is why Phase 2 does not
  close on H4's acceptance** — K8's approval clarification, and it is binding.
- **NOT a fix for the `503` flattening.** A domain error thrown inside a transaction still reads as
  an infrastructure outage (**K7 refused; limitation 79 / H6**). H4's D15 non-reuse guard is
  therefore asserted at the repository boundary rather than over HTTP.

---

### 5.14 H5 — **ACCEPTED 2026-08-24**

**Accepted 2026-08-24** against the approved boundary ([h5-proposal.md](h5-proposal.md) v0.2,
decisions **M1–M9**), after an independent acceptance review that included **mutation testing** of
every decisive property. **Limitation 78 is CLOSED.** **H6, H7 and H8 are untouched.**
**Phase 2 does not close automatically — closure is a separate decision.**

| | |
|---|---|
| **Boundary** | `2d04ab1` — M1–M9 approved; limitations **80**/**81** numbered as **H7**/**H8** at the same time |
| **Implementation** | `0ba13b7` |
| **Verification at acceptance** | `npm run verify` **green end to end, exit 0**, run twice on the committed tree: **794 pass · 0 fail · 0 skipped · 0 todo · 158 suites**; `check:arch` 155 files; `check:arch:selftest` 50 cases; `check:docs` 93 files / 990 links |
| **Mutation evidence** | Each decisive property replayed against the **old** generator: restart repeats the first id (counter **true** / durable **false**); collisions over 2 × 5 000 (counter **5 000** / durable **0**); and B6's same-millisecond ordering **fails the rejected v0.1 random-suffix design and passes the shipped one**. A test that passes under the defect proves nothing, so this was checked rather than assumed |

Surrogate ids are now `${prefix}-${ULID}` — fixed-width Crockford base32, 48-bit millisecond
timestamp, 80-bit component **incremented** within a millisecond, timestamp **clamped** so it cannot
appear to move backwards inside a process. The fix is not a better counter; it is **not counting**,
so a restart has nothing to forget.

| | |
|---|---|
| **Generator** | `durableIdGenerator(clock, random)` in **`@asdp/domain`** (**M3**). **Both the clock and the entropy source are injected**, so the package's stated purity — *no clock, no randomness* — holds, and the generator is deterministic under test |
| **Port** | **Unchanged** (**M2**). `IdGenerator.next(prefix): string` is still synchronous, so **all 49 call sites, every command and every repository are untouched** |
| **Wiring** | [composition.ts](../../apps/api/src/composition.ts) constructs the durable generator; `counterIdGenerator` is retained for tests (**M4**) |
| **Migration** | **None** (**M7**). Migration count stays at **13**. No schema change, no backfill, **no id renumbered** |
| **Dependency** | **None** (**M3**, decision **A4**). About 150 lines over `node:crypto`, injected |
| **Enforcement** | New checker rule **`durable-id-generator`** (**M8**) — production may not *call* `counterIdGenerator`. **Six self-test cases**; the five stateless evaluation harnesses are exempt **by name**, with the reason recorded in the rule |
| **Verification** | `npm run verify` **green end to end, exit 0**: **794 pass · 0 fail · 0 skipped · 0 todo · 158 suites**; `check:arch` 155 files; `check:arch:selftest` **50 cases**; `check:docs` 93 files / 990 links |

**Two things implementation found that the proposal did not predict**, both recorded rather than
smoothed over:

| # | Found | Disposition |
|---|---|---|
| **1** | **`@asdp/domain` declares itself free of *randomness*, not merely of clocks.** M3 placed the generator there, and the architecture checker would have permitted `node:crypto` — but the package's own contract would have been broken quietly | **Resolved within M3 by injecting the entropy source**, exactly as the clock already is. The generator is pure; composition supplies `randomBytes`. No rule was weakened, and the boundary did not move |
| **2** | **Five production files legitimately count.** The rule fired on the offline evaluation harnesses, which write **no state at all** — `recordInteraction` is a no-op and none opens a database — and whose reproducibility is a *measured* property | **Exempted by name**, with the reason in the rule and a self-test proving an **unlisted** file under the same directory is still rejected |

**Nothing was weakened.** No assertion loosened, no test skipped or deleted. One fixture error was
corrected: the multi-entity restart test re-ingested identical bytes, which **deduplicate to one
source by design**, so it was measuring deduplication rather than durability.

#### 5.14.1 What H5's acceptance claims, and what it does not

**Accepted for — mechanics and governance:**

- **Identifiers survive a restart.** Three restarts against one durable database, a project created
  after each, three distinct ids. Before H5 the second boot failed and no further project could ever
  be created in that database.
- **DURABLE MULTI-PROJECT G1.** Project A reaches G1, **the application restarts**, project B reaches
  G1 in the same database — and A's gate is still `approved` afterwards. This is the condition K8's
  approval clarification added to Phase 2 closure.
- **Multiple instances do not collide.** 2 × 50 000 identifiers, zero collisions.
- **Ordering is preserved, and for new identifiers improved.** 10 000 ids minted inside one
  millisecond sort exactly in mint order; a clock rollback produces no lexical regression within a
  process; and a fixed-width identifier has no 9 999 overflow.
- **Existing persisted identifiers are unchanged and were not renumbered**, and **no ADR-0017
  signature moved** — a baseline hashed with a legacy `prj-0001` project id and a new-format baseline
  id produces an identical hash.
- **No migration, no schema change, no new dependency**, and **no command file touched** — the
  production call-site census is still 49.

**NOT claimed:**

- **NOT semantic quality of any kind.** No live model has ever been called; `npm run verify` makes no
  live provider call. H5 is a hardening slice and touches nothing a model produces.
- **NOT structural uniqueness in the generator.** Uniqueness is supplied by the **primary key**; the
  generator's contribution is probabilistic and measured (**M1**, §4.9 of the proposal). A repeated
  identifier could only ever cause a loud, failed write — never a duplicate row, a mis-resolved
  anchor or an affected signature.
- **NOT clock correctness across a restart.** Within a process the timestamp clamp handles a
  backwards step; across a restart a backwards step can reorder identifiers without colliding them.
  Bounded, named, and not defended against.
- **NOT a fix for limitation 80** (**H7**) on identifiers already written. New identifiers are
  fixed-width and unaffected; rows written before H5 keep the 9 999 overflow.
- **NOT a change to how ordering is derived** (**H8** / limitation 81). Four tables still infer
  insertion order from the identifier.

---

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
requires an `equivalent` classification, which is AI-proposed, which makes it **provisional** —
so V6 records `provisionalCorroboration` and leaves the agreement value alone.

> **Superseded in part by V7 (U4).** A **human-confirmed** equivalence now discharges the provisional
> qualifier and the view reports `corroborated` — §10.8. The three conditions above are unchanged and
> all still required; confirmation is added to them, not substituted for them. Shared vocabulary is
> still not agreement, and absence of a detected conflict is still not agreement.

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

## 10. V7 capabilities delivered — the human requirements workspace and G1 · ✅ **ACCEPTED 2026-08-24**

**ACCEPTED / COMPLETE**, after two independent review rounds — §10.10. Boundary:
[v7-proposal.md](v7-proposal.md), plan of record
[phase-2-plan.md](phase-2-plan.md) §3.12, decisions **U1–U10**. **No new dependency** — seven.

**G1 is reachable end to end**, proved by one test that carries a project from draft proposals to a
signed baseline: accept every proposal → fill every empty required slot with a human-originated
inferred requirement → confirm each one → freeze → validate → sign. Every requirement in the baseline
ends `approved` carrying an approver, a timestamp and a baseline id.

### 10.1 The eight G1 preconditions, computable for the first time

`L4-REQ-001…008` (**U9**), each a rule with a stable id, so a closed gate is *explicable* rather than
merely closed — which is what [governance-and-gates.md](../50-governance/governance-and-gates.md) §1
requires of every blocking precondition. The readiness panel reports **all eight, met or not**, never
just the first failure: a reviewer working towards a gate needs the whole list, not one blocker per
attempt.

**A defect the end-to-end test caught immediately.** `L4-REQ-001` was written as *"all requirements
approved"*, copying the gate's own wording — which made G1 **unreachable by construction**, because
G1 approval *is* what promotes them. The precondition is *"all requirements reviewed"*; *"all at L4"*
is the gate's **post**-condition. Corrected, and the rule now records the distinction in its own
documentation so it is not re-introduced.

### 10.2 Approval is a signature, and it reopens by itself

`freezeBaseline`, `evaluateGate` and `approveGate` are V0's, unchanged. V7 supplies the members —
`(id, version)` pairs — and the preconditions.

**Automatic reopening was missing and is now wired.** A revision after approval recomputes the set's
hash and compares it against the signed one; when they differ the gate moves to `reopened` and the
stale `approvedBaselineHash` is dropped. **Nobody asks it to** — that is what
[ADR-0017](../adr/ADR-0017-approval-as-baseline-signature.md) means by automatic, and a test asserts
it. The revised requirement also loses its approval columns, because the signature that covered it
covered different content.

### 10.3 An edit is never an edit — **U2-a**

A revision copies the current version to `requirement_version` and writes a new one under the same
`REQ-####` (D15). `originalAiText` stays on version 1 **forever**, so *"what did the model actually
say?"* survives any amount of human editing. A revision that would cite no evidence is refused: a
revision may not sever provenance.

### 10.4 Human-originated L3 — **U8-a**

V5 refused L3 because *"its only correct disposition — explicit human confirmation — does not exist
until V7"*. It exists now. A person may record an assumption the documents do not state, with a
**mandatory** `inferenceRationale`, and owns it by name; a LOW-confidence one must be explicitly
confirmed before G1 — the precondition the gate has always named and nothing could satisfy.

**AI-authored inference stays refused in SQL** — `derivation = 'inferred'` requires
`generated_by = 'human'` **and** a rationale. A test drives that constraint directly against the
database, because it is the line **J1** drew and V7 must not quietly erase it.

### 10.5 Questions come from causes — **U6**

Every `OpenQuestion` names the deterministic cause that created it, and **blocking is derived**: a
question blocks when its cause blocks G1. Regenerating never duplicates a question for a cause that
already has one — a duplicated blocking question would block G1 twice for one gap. **No provider is
reachable from this path**: V7 ships the half that decides *which* questions exist, and a model may
only reword them later.

**This section originally credited U7 as well, and that was wrong** — the answer-becomes-evidence
half was not built at `7bfa440`. It is built now; see §10.8.

### 10.6 Enforcement added

- Migration **010**: `approved` requires an approver, a timestamp **and** a baseline, with the
  converse refused too · `inferred` requires a human author with a rationale · **L4 is not a storable
  level**, because approval is a status and L4 is its consequence · a conflict decision requires a
  decider, a timestamp **and a rationale** · a canonical entity may be confirmed only if it was
  AI-proposed.
- `setReviewStatus` **refuses `approved`** in both adapters, matching SQL.
- The `controller-thinness` rule **fired during implementation**, and the surface was split into
  `review.controller.ts` and `g1.controller.ts` rather than the cap being raised.

### 10.7 What V7 does NOT establish

> **That anyone reviewed carefully.** V7 makes approval *possible* and *attributable*; it cannot make
> it *considered*. Approval theatre — the risk named in the proposal — is real, unmeasured here, and
> mitigated only by requiring a per-requirement act and by making the edit rate observable.

Nothing here measures whether a requirement is *right*. Limitations 63 and 65 stand unchanged.

### 10.8 The acceptance review, and the seven defects it found

**V7 was reviewed on 2026-08-24 and NOT accepted.** Four approved decisions or acceptance criteria
had not been delivered, and three preconditions could not fail. Every one is corrected below; the
review's own record is the reason each is described as a defect rather than as a feature.

**The thread running through five of the seven:** a check that cannot fail reads as a check that
passed. `L4-REQ-008` reported *met* on every project while its input was a hardcoded `[]`;
`L4-REQ-007` reported *met* on every project because nothing could produce a `blocked_by_policy`
slot. A precondition like that is worse than an absent one — the panel positively claims it was
checked.

| # | Defect | Correction |
|---|---|---|
| **1** | **`L4-REQ-008` was vacuous.** `g1State` hardcoded `openL0FindingIds: []` with a comment asserting a clean project has none, so a project whose anchors did not resolve could be frozen and **signed** | The `L0-ING-*` pack now runs over the real intake state, through `assembleL0State` — the same assembly `validateIntake` uses. Only **blocking** findings count, so an `info` like a missing effective date is a weakness rather than a bar |
| **2** | **U7 was not implemented.** `answerQuestion` recorded an answer and returned; no `Source`, no `SourceUnit`, no anchor, and `became_source_unit_id` was written by nothing | Answering now ingests the answer as a `transcript` `Source` **through `ingestSource`** — the same guard, extractor, NFC normalisation and anchor minting a document gets. The unit id is recorded on the question. Effective date is the moment of answering; authority rank is deliberately low, because testimony does not outrank a signed policy (ADR-0012) |
| **3** | **U4 was not implemented.** Confirming an equivalence set `confirmed_by` and changed nothing; the view still carried *"there is no `corroborated` branch, and its absence is the decision"* | A human-confirmed equivalence over propositions resting on **more than one source** now reports `corroborated`. Still computed on read: criterion 9 is proved by a byte-comparison of every V5 row across the verdict |
| **4** | **The signature's second limb bound nothing.** `approveG1` minted a `vr-` id and signed over it without recording a run, so *"what did that validation say?"* was unanswerable and the validation-run reopening path could never fire | Migration **011** persists `ValidationRun`s. `POST g1/validate` records one; `approveG1` records the run it signs. Both limbs of ADR-0017 now reopen, each with its own test |
| **5** | **Reopening was wired on one path.** Only `reviseRequirement` reconciled, so adding a requirement after approval left G1 `approved` over a set whose hash had changed — against ADR-0017's *"recomputation on **every** member change"* | Every mutating command goes through a `mutate` wrapper that reconciles inside the same transaction. The architecture checker rule **`g1-reconciliation`** refuses a raw `ctx.uow.run` in the workspace, with `approveG1` the one named exception — it *creates* the signature |
| **6** | **The documentation did not record any of this**, had no V7 limitations section, credited **U7** in §10.5, and carried limitations 39 and 67 as though V7 had not happened | This section, §12's V7 limitations, and the corrections to 39, 67, §9.5 and §10.5 |
| **7** | **`L4-REQ-007` was vacuous too** — found while building the adverse tests. `slotStatus` could always return `blocked_by_policy` and **nothing could ever produce one**: a populate pass refused on egress grounds reported its reason and forgot it | Migration **012** records a `slot_policy_block` per slot a refused pass would have filled — **only** when the refusal is a policy one. A new `refusalKind` discriminator keeps *"no provider is configured"* from being recorded as *"we were not permitted to read this"*, which would be the same confusion inverted |

**Defect 7 was not in the approved correction list.** It was raised because the verification bar
required an adverse test per precondition and this one could not have failed either — the same
defect as 1, in a different limb.

**Defect 8, found in the FINAL review by walking criterion 10 rather than re-reading it.**
Criterion 10 says *"an answered question becomes an anchored `SourceUnit`, **and a requirement citing
it resolves**"*. The corrected U7 delivered the first half; the second was **impossible**, because
`reviseRequirement` **filtered** the inherited evidence links — so `evidenceItemIds` could only ever
*narrow* a citation set, never add to it. Evidence recorded after a requirement existed — an answered
clarification above all — was uncitable by anything, for ever. Proposal §13 is explicit that a
reviewer *"may **add** or remove links explicitly"*. A revision may now cite any verified evidence in
its own project, refuses a cross-project citation, and still refuses a version citing nothing. Four
tests, including the full chain `Requirement → RequirementEvidenceLink → EvidenceItem → verified
Anchor → Source(transcript)`.

**One defect in the corrections themselves, caught on re-review.** The first cut of defect 7's
discriminator read *"no eligible provider and at least one rejected one"* as a policy refusal — which
would have classified a **disabled provider** as a governance denial, recording every slot as
`blocked_by_policy` and demanding a human acknowledge a denial nobody made. That is
data-governance.md §3.1's confusion **inverted**, and inverted is worse: it manufactures a governance
finding rather than losing one. `isEgressRefusal` now tests the rejection reason against the closed
egress set by prefix, and four tests cover it — including the disabled-provider case.

**Nothing was weakened to make any of this pass.** The `controller-thinness` cap is still 220 and
still untouched since V0; the V7 surface was split a **second** time, into `clarification.controller.ts`
(a human resolving something) and `g1.controller.ts` (the gate). One checker rule was **added**, and
the self-test grew from 36 cases to 39.

### 10.9 Every G1 precondition now has an adverse test

Eight tests, each starting from a **G1-ready** project and introducing exactly one defect, each
asserting that its rule is unmet, that **every other rule is met**, and that `g1/approve` refuses by
name. A happy-path test where a condition happens to be absent proves nothing about whether the
condition would be detected.

| Rule | The adverse condition |
|---|---|
| `L4-REQ-001` | a requirement put back to `draft` past the command |
| `L4-REQ-002` | an unresolved **blocking** flag — then resolved, and the gate clears |
| `L4-REQ-003` | an undecided conflict — then decided, and the gate clears |
| `L4-REQ-004` | a blocking question derived from a real gap and left unanswered |
| `L4-REQ-005` | a required slot left empty |
| `L4-REQ-006` | a LOW-confidence inference left unconfirmed |
| `L4-REQ-007` | a policy-blocked slot left unacknowledged — and asserted **not** to be reported as empty |
| `L4-REQ-008` | stored text altered under the units minted from it, so anchors no longer resolve |

Two converse tests hold the line from the other side: an **`info`-level** L0 finding does **not**
block, and **reading** the readiness panel does not reopen an approved gate.

### 10.10 Accepted after two independent reviews — 2026-08-24

**V7 is ACCEPTED / COMPLETE.** It was reviewed **twice**, and it failed the first review.

| Round | Outcome |
|---|---|
| **First** (against `7bfa440`) | **CHANGE.** Four approved decisions or acceptance criteria undelivered — **U4**, **U7**, criteria **2**, **6**, **9**, **10** — plus reopening wired on one path only, and three preconditions that could not fail. **Not accepted** |
| **Corrections** | `f38ef06` (seven defects), `96f84e4` (a defect in the corrections themselves), `7e50303` (defect 8, and H4 raised) |
| **Second** (against `7e50303`) | **ACCEPT.** All ten U-decisions delivered or deferred by decision; all thirteen acceptance criteria met; nothing weakened; verification clean |

**Eight defects across the two rounds**, five of them one shape: *a check that cannot fail reads as a
check that passed*. `L4-REQ-007` and `L4-REQ-008` both reported **met** on every project regardless
of state. Defect 8 was found by **walking** criterion 10 rather than re-reading it — the answer
became citable evidence that no requirement could ever cite, because a revision could only narrow a
citation set.

#### What this acceptance claims, and what it does not

> **It claims mechanics and governance. It does not claim model quality**, exactly as V4b-core, V5
> and V6 were accepted. `POPULATE_FRAME` slot accuracy is **45%**, reconciliation recall **50%**,
> canonicalisation P/R **50%**, and six traps remain unexercised — all on a **synthetic** corpus
> against an **authored stub**. No live model has ever been called. Nothing here says a requirement
> is *right*; limitations 63 and 65 stand.

> **It does not claim anyone reviewed carefully.** V7 makes approval possible and attributable; it
> cannot make it considered. Approval theatre is real, unmeasured, and mitigated only structurally.

#### Nothing was weakened to reach it

Measured, not asserted: **zero lines removed** from `check-architecture.mjs` across all V7 work ·
migration 010 **untouched** by every correction · `packages/raf` **byte-identical** since V6
acceptance (criterion 12) · the `controller-thinness` cap still **220**, unchanged since V0, with the
surface split **twice** rather than the cap raised · checker self-test **36 → 39 cases** · **U1–U10
unchanged**. Two migrations and one checker rule were **added**. Dependencies stand at **seven**.

#### H4 was raised at acceptance, and NOT held against V7

**Limitation 77** — a second project cannot reach G1 — was found during the final review. It is a
**V5** defect (migration 008, `4b148b4`), outside the approved V7 boundary, and V7 neither caused it
nor was approved to fix it. It is **not** a reason to refuse V7; it **is** the reason Phase 2 is not
closed. See §5.12 **H4**.

---


## 11. Accepted HTTP status posture

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

## 12. Known limitations

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
| 39 | **`sheet_cell` remains unexercised** — `transcript` no longer does | Spreadsheets are a separate proposed capability. **`transcript` is exercised from V7**: answering a clarification question ingests the answer as a `transcript` `Source` through the V1 text path, and its units anchor and resolve like any document's (**U7**, §10.8) |
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
| 67 | ~~**`corroborated` is unreachable**~~ — **RESOLVED in V7 (U4)** | Correct under **Q6** while equivalence was only ever AI-proposed. **A human-confirmed equivalence spanning two sources now raises `corroborated`**, computed on read, with no V5 row mutated (§10.8). The reconciliation view can raise as well as lower. What is still refused is unchanged: shared vocabulary, an unconfirmed merge, and absence of a detected conflict |
| 68 | **The stub proposes no semantic merges and compares only explicit durations** | Canonicalisation recall and conflict recall are 50% against the gold set, and both are the **stub's** ceiling rather than the pipeline's. Tuning the stub to match the gold set would destroy the measurement |
| 69 | **Precedence is computed for every candidate, including `equivalent` ones** | Intentional — an equivalent pair still has an ordering a reader may want — but it means a `proposedResolution` appears on rows where nothing is in dispute, and a reader could mistake it for a finding |

### V7 limitations

| # | Limitation | Consequence |
|---|---|---|
| 70 | **Nothing measures whether a reviewer reviewed.** V7 makes approval possible and attributable; it cannot make it *considered* | **R-V7-1, approval theatre, is real and unmeasured.** Mitigated only structurally: a per-requirement act rather than a select-all, computed confidence and flags on every row, and no bulk-approve path anywhere. An approval rate of 100% with an edit rate of 0% would be a finding about the workspace, and **nothing computes that rate today** — §16 of the proposal offered two countable signals and neither is reported |
| 71 | **`SYNTHESISE_QUESTIONS` ships only its deterministic half** | **Correct under U6**, and stated so it is not mistaken for the whole task: code decides *which* questions exist and a model may only reword them. The wording half is unbuilt, so questions read as generated text — `what should 'businessObjective' contain?` — which **R-V7-4** names as the way a question queue gets abandoned |
| 72 | **U5 is deferred by decision**: a source that declares its own undecided issue is not observed | Three of the four question inputs are implemented. A document saying *"the escalation path is TBD"* produces no question, so that gap reaches G1 only if a flag, a coverage gap or a conflict happens to catch it |
| 73 | **A new validation run over an approved set reopens G1** | Correct under ADR-0017 — the signature binds the run, and the ADR rejected a grace period by name — but it means `POST g1/validate` is not a read. **Readiness is the read**, persists nothing, and is what a reviewer should use to look. Reported here because the asymmetry will surprise someone |
| 74 | **`blocked_by_policy` is produced only by a refused `POPULATE_FRAME` pass** | An egress refusal during **evidence extraction** leaves no slot-level record, because there is no slot to attribute it to yet. So a project whose material never got as far as population reports missing slots as `empty`, which is the distinction data-governance.md §3.1 draws, unresolved one layer earlier |
| 75 | **The G1 end-to-end fixture exercises three of the eight kinds of human work** | Accept, infer, confirm. Flags, conflicts, questions and policy blocks are exercised by the **adverse** tests (§10.9) rather than by the happy path, because the fixture produces none of them naturally. The wiring of each is tested; a single journey through all eight is not |
| 77 | ~~**A SECOND PROJECT CANNOT REACH G1.**~~ — **CLOSED by H4 and ACCEPTED 2026-08-24** (§5.13; `ce15d9d` + `193d295` + `5a5504b`). The original statement, kept so the defect stays legible: Requirement ids are allocated per project against a **global** primary key, so the second project to populate collides on `REQ-0001` and fails with a 503 | **A V5 defect (migration 008, `4b148b4`), raised during the final V7 review and NOT fixed there** — it is outside the V7 boundary. Reproduced directly. Every test uses one project per server, which is why it stood. **Hardening candidate H4** — §5.12, with two candidate shapes, one of which touches what an ADR-0017 signature covers. **Material to Phase 2 closure**: "G1 is reachable" held for the first project in a database and for no other. **H4 changed `requirement`'s primary key to `(project_id, id)`; two projects now each reach G1 independently and each starts at `REQ-0001`.** Phase 2 still does not close: **H5 / limitation 78** blocks it |
| 78 | ~~**AFTER A RESTART AGAINST A DURABLE DATABASE, THE FIRST WRITE OF ANY KIND COLLIDES.**~~ — **CLOSED by H5 and ACCEPTED 2026-08-24** (§5.14; `2d04ab1` + `0ba13b7`). The original statement, kept so the defect stays legible: Every surrogate id is minted by `counterIdGenerator` — a **per-process** counter with no persistence — into a **global** primary key. **49 call sites, 24 prefixes** (corrected 2026-08-24 during H5 analysis; the earlier "47 / 22" was recorded during H4 and was stale) | **Found and reproduced 2026-08-24 while analysing H4; a V0 defect, not a V7 one.** Latent today only because `ASDP_DATABASE_DIR` is optional and unset means in-memory, so every restart is currently a fresh database. It becomes universal against PostgreSQL (**A2**). Reproduced: `session 1 minted prj-0001 ok; session 2 after restart minted prj-0001 FAILED duplicate key`. **Hardening candidate H5** — recorded, not fixed, and deliberately outside the proposed H4 boundary ([h4-proposal.md](h4-proposal.md) §2, decision **K8**). **Material to what H4 may claim**: multi-project G1 holds within one process lifetime and not across a restart until H5 closes |
| 79 | **A DOMAIN ERROR THROWN INSIDE A TRANSACTION IS FLATTENED TO `503 database unavailable`.** `PgliteDatabase.transaction` re-maps every error escaping the callback through `mapDriverError`, which returns a generic `DatabaseError` for anything it does not recognise. The mapping is also **redundant** — `query` and `exec` already map driver errors at the driver boundary | **Confirmed and reproduced 2026-08-24 while analysing H4.** It is why limitation 77 surfaces as an infrastructure outage rather than the modelling defect it is: `insertProposal`'s `requirement REQ-0001 already exists … (D15)` never reaches the caller. Proposed as **K7** and **NOT APPROVED for the H4 boundary** — a separate concern, not required to fix limitation 77. **Hardening candidate H6** — recorded, not fixed, and **must not be implemented inside H4**. Consequence for H4: the D15 non-reuse guard is asserted at the repository boundary rather than over HTTP |
| 80 | **`order by at, id` STOPS REFLECTING CREATION ORDER AT THE TEN-THOUSANDTH ID OF ANY PREFIX.** `id` is a `text` column, so `order by id` is a text sort, and `counterIdGenerator` pads to four digits and then overflows: `aud-10000` sorts **before** `aud-9999` | **Found and verified against the engine 2026-08-24 while analysing H5** — `aud-0009 < aud-0010 < aud-10000 < aud-10001 < aud-9999`. A **V0** defect, latent because no prefix has reached 10 000 in any test or development database. Affects the audit, baseline, approval and validation-run reads, which order by `(timestamp, id)`. **Hardening candidate H7** — recorded, not fixed, and **outside the H5 boundary**. **NOT a Phase 2 closure blocker**: Phase 2's completion test is *"G1 can be reached"*, and mis-ordering beyond 9 999 rows does not prevent reaching it. H5's fixed-width identifier removes the exposure for **new** ids as a side effect; rows already written keep it |
| 81 | **REPOSITORY ORDERING INFERS INSERTION ORDER FROM THE IDENTIFIER.** `audit_event`, `baseline`, `approval` and `validation_run` are read with `order by <timestamp>, id`, using the id as a proxy for insertion order | **Found 2026-08-24 while analysing H5.** It works only because `counterIdGenerator` happened to be monotonic — a coincidence of the implementation, not a designed property, and limitation **80** shows the coincidence already fails. The principled fix is a monotonic insertion column (`bigint generated always as identity`) on those four tables, ordering by it instead; that would make ordering structurally correct and **remove the ordering constraint from identifier design entirely**. **Hardening candidate H8** — recorded, not fixed, and **outside the H5 boundary**: it is a migration, four repository reads and a change to accepted V0–V7 read behaviour. **NOT a Phase 2 closure blocker** — it does not prevent G1 being reached |
| 76 | **The project `classificationCeiling` is carried but not enforced by `evaluateEgress`** | Pre-existing, found during the V7 corrections and **not fixed here** — expanding a correction pass into an unrelated egress change is how boundaries stop meaning anything. Egress today is decided by deployment class, task, retention and training opt-out; the project ceiling adds nothing on top. **Raise before the first live provider call**, alongside **H3** |

---

## 13. Docker-deferred infrastructure

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

## 14. Not started, by instruction

BPMN generation, DMN generation, form generation, Process IR compilation, layout, the
requirements-analysis passes, the Specification Studio, and any graphical process designer.

See [phase-2-plan.md](phase-2-plan.md) §7. The graphical designer is not merely deferred — it is
excluded permanently, because it would reverse
[ADR-0001](../adr/ADR-0001-requirements-driven-product-boundary.md).

---

## 16. Phase 2 — **CLOSED / ACCEPTED, 2026-08-24**

> **This section is the closure record.** It is written once and is not a plan. If a later phase
> needs something Phase 2 did not deliver, that is a new proposal, not an amendment here.

### 16.1 The decision

**Phase 2 is CLOSED and ACCEPTED as of 2026-08-24**, on an explicit decision, against the approved
exit condition, on a record audited for internal consistency first (`6dea2ae`).

### 16.2 The exit condition, and why it is satisfied

| | |
|---|---|
| **Approved condition** | *"Phase 2 ends when G1 can be reached."* — [phase-2-plan.md](phase-2-plan.md) §582 |
| **Binding clarification** | **K8**, at H4's approval: durable multi-project G1 must **survive an application restart** |
| **Satisfied?** | **Yes, both**, and **proved by executing tests rather than by assertion** |
| **The proof** | `h4-multi-project.test.ts`: two projects in one database each reach G1, each from `REQ-0001`. `h5-durable-identity.test.ts`: **project A reaches G1 → the application restarts → project B reaches G1 in the same database**, and A's gate is still `approved` afterwards |

### 16.3 What was accepted

| Slice | Accepted | Commits |
|---|---|---|
| **V0 – V7** | The whole approved slice sequence | V7 `7bfa440` … accepted `50855bd` |
| **H4** — project-scoped requirement identity | 2026-08-24, §5.13 | `ce15d9d` + `193d295` + `5a5504b` + `530dee3` |
| **H5** — durable identity generation | 2026-08-24, §5.14 | `2d04ab1` + `0ba13b7` + `55b8547` |

Both hardening slices were **independently reviewed before acceptance**. H4's review found four
defects, corrected in `5a5504b` with no production code touched. H5's review **mutation-tested** every
decisive property against the old generator, because a test that passes under the defect proves
nothing.

### 16.4 Verification at closure

| | |
|---|---|
| `npm run verify` | **green end to end, exit 0** |
| Tests | **794 pass · 0 fail · 0 skipped · 0 todo** · **158 suites** |
| `check:arch` | passed — **155 source files** |
| `check:arch:selftest` | passed — **50 cases** |
| `check:docs` | passed — **93 files, 990 links** |
| Migrations | **13**, `001_governance` … `013_requirement_project_scope` |
| Runtime dependencies | **seven**, unchanged since V0 |
| Live provider calls | **none — verification makes no network call** |

### 16.5 What closure CLAIMS

- **G1 is reachable end to end**, by **any number of projects in one database**, and **it survives an
  application restart**.
- **Traceability holds**: evidence → requirement, with **resolvable anchors** (ADR-0008), the
  four-level epistemic ladder never conflated (ADR-0007), and provenance that survives a restart.
- **Governance holds**: gates block **structurally**, approval is a signature over
  `(baselineHash, validationRunId)` that **invalidates automatically** when either changes
  (ADR-0017), segregation of duties is enforced, and the audit log is append-only.
- **AI proposes, deterministic code commits** (ADR-0004): no LLM-authored artifact, no auto-approval,
  no AI write to the repository.
- **Multimodal intake** for text, DOCX and images, with ADR-0038 target-versus-content verification
  honoured.
- **Identity is durable**: identifiers survive restarts and multiple instances, and no existing
  identifier was renumbered to achieve it.

### 16.6 What closure does **NOT** claim

> **NO LIVE MODEL HAS EVER BEEN CALLED. Not once, in any slice.**

- **No claim whatever about real AI or model quality.** Every evaluation number in this document
  comes from a **synthetic corpus against an authored stub**: `eval:baseline` is explicitly *"not
  usable for a routing decision"*; `eval:frame` reports **slot accuracy 45%** and **semantic
  faithfulness NOT MEASURED**; `eval:reconcile` reports recall **50%** and canonicalisation P/R
  **50%**.
- **Vision accuracy is unmeasured.** Shape, refusals, egress and provenance are proven; accuracy is
  not.
- **Semantic correctness of requirements is not claimed** by V5, V6 or V7. The mechanics of proposing,
  reconciling and approving them are.
- **Not PDF intake** — V2-PDF is blocked, and mechanically so.
- **Not production deployment.** PGlite is the development adapter; PostgreSQL is the production
  target (ADR-0035) and has never been run against.

**The question Phase 2 does not answer opens with V4b-eval, and V4b-eval is blocked by H3.**
Retention must exist **before** the first live call, because an unretained payload is unrecoverable.

### 16.7 Open at closure — nothing here was resolved by it

**None of the following was implemented, fixed or discharged as part of closure.** Each keeps the
status it held, and each needs its own approved boundary before anything begins.

| Item | Limitation | Status at closure | Blocked closure? |
|---|---|---|---|
| **H1** — element-name comparison | 43 | Proposed, not approved | No |
| **H2** — `imageSha256` required where appropriate | 44 | Proposed, not approved | No |
| **H3** — AI prompt/response payloads not retained | 62 | Proposed, not approved. **Blocks every live provider call**, and therefore V4b-eval | No — it blocks live calls, not G1 |
| **H6** — domain error flattened to `503` | 79 | Recorded, not started. Refused as **K7** for H4 | No |
| **H7** — `order by at, id` mis-orders past 9 999 | 80 | Recorded, not started. Verified against the engine | No |
| **H8** — ordering inferred from the identifier | 81 | Recorded, not started | No |
| **V2-PDF** | — | **Blocked** on (1) a representative Arabic PDF corpus, (2) spike **S2**, (3) **ADR-0037** approval. Enforced by the `pdf-engine-not-approved` checker rule; `@embedpdf/pdfium` is not installed | No — an input format, not a pipeline stage |
| **V4b-eval** | — | **Deferred**, blocked by **H3** plus a credential and E1-permitted material. The core/eval split was approved as **F3** | No |
| **ADR-0037** — binary document extraction | — | **PROPOSED — HELD.** The only open ADR. Gates V2-PDF alone | No |

### 16.8 What must not be inferred from closure

- **P3 has NOT started**, and its boundary is **neither proposed nor approved**. §11 of
  [CLAUDE.md](../../CLAUDE.md) requires an approved boundary before any slice begins.
- **No live provider call is permitted** while **H3 / limitation 62** stands.
- **Closure discharges no open item.** §16.7 is the inventory, and it is unchanged by this decision.


---

## 17. Roadmap reconciliation — P0/P1/P2 versus what was built (2026-08-25)

> **Documentation only.** This section reopens nothing, implements nothing and approves nothing. It
> exists because implementation **Phase 2 is closed** while roadmap **P1 and P2 are not**, and until
> now nothing on the record said so.

### 17.1 The two numbering schemes

| Scheme | Meaning | State |
|---|---|---|
| **P0 … P9** | [roadmap.md](roadmap.md) — a **capability plan**, approved in Phase 0 | **P1 and P2 are NOT closed** |
| **Phase 0 / 1 / 2** | The **implementation phases actually executed** here | **Phase 2 is CLOSED / ACCEPTED** — §16 |

Implementation Phase 2 spans roadmap P1 + P2. **Closing the first did not close the second**, and no
document in this repository has ever claimed roadmap P1 or P2 was complete.

### 17.2 Phase 2's closure remains valid, and its scope is unchanged

**§16 stands.** It was closed against its own approved exit condition — *"Phase 2 ends when G1 can be
reached"* — plus **K8**'s restart clarification, both satisfied and proved by executing tests.
**§16.5** states what it claims; **§16.6** states what it does not. Nothing in this reconciliation
alters either, and no accepted claim is withdrawn.

What this reconciliation adds is the boundary of that claim in *roadmap* terms: **Phase 2's closure
validates mechanics, governance, traceability and durable multi-project G1. It is not a statement
that roadmap P1 or P2 delivered their product or UI milestones.**

### 17.3 Undelivered P1/P2 commitments — **UNPLANNED · BOUNDARY NOT YET APPROVED**

Enumerated in [roadmap.md](roadmap.md) §0.3. In summary, **as this section stood when written on
2026-08-25 before UI enablement began**: the **source viewer**, **requirements workspace** and
**coverage dashboard** exist **as APIs only** and have **no rendering surface**; **real-BRD
validation** was never performed; the **degradation ladder** has never run against a live private
endpoint; and **`apps/web`** does not exist.

**None of it had an approved boundary, a slice, or a schedule.** Recording it assigned no scope.

#### Corrected 2026-08-25 — two of those items have since been delivered

The paragraph above is kept as written so the divergence stays legible. **Two of its items are no
longer true**, and the correction is recorded here rather than by editing them away:

| Item | State now |
|---|---|
| **`apps/web` does not exist** | **Superseded. It exists** — created by **U1**, ACCEPTED 2026-08-25 (§18), and it is the first package ever to declare the checker's `presentation` class |
| **Source viewer has no rendering surface** | **Superseded. It renders** — **U1** (§18), with server-provided highlighting correct in both reading directions. **U2** (§19) added source intake, inventory, authority ranking and L0 validation |
| **Requirements workspace · coverage dashboard** | **Still API only.** They are **U3** and **U4**, and **neither is authorised** |
| **Real-BRD validation · the degradation ladder against a live endpoint** | **Still not done.** Both need approved material and, for any live call, **H3** |

**Roadmap P1 and P2 remain open.** U1 and U2 deliver two of their rendering surfaces; they do not
close either phase, and §0.5's statement that this reconciliation does not reopen P1 or P2 is
unaffected.

### 17.4 How the divergence happened

[phase-2-plan.md](phase-2-plan.md) §5 replaced the roadmap's exit criteria with twelve *consolidated*
criteria, **none of them user-facing**, and criterion 12 positively requires that **no live AI call
occurs in verification**. The consolidation labelled itself *"not presented as an approved
original"* — honest, but a consolidation is **not an approved amendment**. The omission was never
recorded as a decision.

**Accidental divergence, formalised by a silent consolidation.** Not concealment, and not approved
re-scoping. §5 now records what it dropped.

### 17.5 Also corrected

[phase-2-plan.md](phase-2-plan.md) §1 previously read *"Phase 2 **proves** the first of the two
hypotheses… that AI reads real bilingual documents accurately."* **It does not.** Phase 2 proves the
**provenance** half and nothing about model accuracy, because **no live model has ever been called**.
The sentence now says *builds the machinery for*, with the correction recorded in place.

### 17.6 What remains blocked, and is not lifted here

- **Live AI invocation** — blocked by **H3 / limitation 62**. No live provider call is permitted.
- **Real-material validation** — additionally needs approved material within the **E1** ceiling.
- **UI work of any kind** — **UNPLANNED**, no approved boundary.
- **P3** — not started; boundary neither proposed nor approved.


---

## 18. UI enablement U1 — **ACCEPTED 2026-08-25**

> **U1 is ACCEPTED.** **U2 is NOT authorised** — its boundary must be proposed and approved first,
> per §11 of [CLAUDE.md](../../CLAUDE.md). Phase 2 stays closed; **P3 has not started.**

### 18.0 Acceptance

| | |
|---|---|
| **Accepted** | **2026-08-25** |
| **Implementation** | **`d4785c1`** |
| **Boundary** | `da95b56` — [ui-enablement-proposal.md](ui-enablement-proposal.md), W1–W13 |
| **ADR** | `5882bb2` — [ADR-0039](../adr/ADR-0039-react-presentation-layer.md), recorded **before** any UI code |
| **Verification at acceptance** | `npm run verify` **green end to end, exit 0** — **818 pass / 818 · 0 fail · 0 skipped · 0 todo · 163 suites**; `check:arch` 166 files; `check:arch:selftest` 56 cases; `check:docs` 95 files / 1057 links |
| **Mutation evidence** | The new rules were shown to **bite**, not merely to exist: introducing `text.indexOf` into the real highlight model fired `presentation-no-text-research`; importing `computeConfidence` fired **both** `forbidden-dependency` and `presentation-no-domain-rules`; and code-point versus UTF-16 slicing was shown to differ by producing a **lone surrogate**. All mutations reverted |
| **Backend** | **Untouched.** `git show d4785c1 --name-only` contains no `apps/api` or `packages/` source file |

**Boundary approved 2026-08-25** ([ui-enablement-proposal.md](ui-enablement-proposal.md), W1–W13),
with **[ADR-0039](../adr/ADR-0039-react-presentation-layer.md)** recording the React/Vite adoption
**before** any UI code was written.

**U1's approved boundary, delivered:** development sign-in → project selection → source selection →
source viewer → server-provided evidence highlighting with correct English/LTR and Arabic/RTL
behaviour.

| | |
|---|---|
| **Package** | **`apps/web`**, `asdp.class: "presentation"` — the class the checker has defined since V0 and no package had ever declared |
| **Dependencies** | **React 19.2.8, React DOM 19.2.8** (runtime); **Vite 8.2.2, @vitejs/plugin-react 6.1.0, @types/react, @types/react-dom** (dev). All **pinned exactly**, per **A4** |
| **Enforcement** | **Four new checker rules** — `presentation-no-api`, `presentation-no-domain-rules`, `presentation-no-text-research`, and `@asdp/web → @asdp/schemas` only. **Six self-test cases.** The checker now walks `.tsx` as well as `.ts` |
| **Verification** | `npm run verify` **green, exit 0**: **818 pass · 0 fail · 0 skipped · 0 todo · 163 suites** (+24 from U1); `check:arch` **166 files**; self-test **56 cases**; `check:docs` 95 files / 1055 links |
| **API gaps** | **None used.** G-a and G-b are approved but **not implemented** — U1 needs neither, and they belong to the slice that first does |

**Verified in a real browser**, against the running service with English, Arabic and mixed-direction
documents:

- the Arabic document renders **RTL** with seven correctly-positioned highlights;
- the mixed document renders **LTR** with Arabic runs individually `dir="rtl"` — segment directions
  came back `ltr, ltr, rtl, ltr, ltr, rtl, ltr`, and **two segments were flagged counter-flow**;
- accessible names carry direction and language — *"evidence, counter-flow, right to left, ar"* —
  so **no highlight is identified by colour alone**;
- **the rendered text is 170 code points, exactly the `textLength` the server reported.** Nothing was
  lost, duplicated or transformed;
- no console errors; skip link, `main` landmark, two labelled `nav` landmarks, ordered headings.

### 18.1 Non-blocking follow-up decisions, recorded at acceptance

**Neither blocked U1's acceptance. Both are binding on what comes after it.** **F-U1-a is now
DISCHARGED** (2026-08-25, by [ADR-0040](../adr/ADR-0040-browser-testing-pinned-browser.md)).
**F-U1-b STANDS and is permanent** — it is a constraint, not a task, and nothing in U2 relaxed it.

| # | Decision | Status |
|---|---|---|
| **F-U1-a** | **An automated browser / E2E testing framework must be decided BEFORE the UI reaches workflows where browser-level interaction is material.** U1's browser behaviour was verified by driving the running application and recording what was observed — reproducible by a person, **not by CI**. That is adequate for a read-only viewer and **is not adequate for a workflow that writes**. [ADR-0039](../adr/ADR-0039-react-presentation-layer.md) records why none was adopted: Playwright and Cypress download browser binaries over the network, which conflicts with the deterministic, network-free posture **A7** requires. **Adopting one is a dependency decision under A4 and needs its own approval** | **DISCHARGED 2026-08-25** by **[ADR-0040](../adr/ADR-0040-browser-testing-pinned-browser.md)**, approved at `0b7b700` — **before U2 rather than before U3**, because **X10-A** deliberately brought the decision forward on the grounds that U2 is the first slice that **writes**. Playwright is pinned, drives the **system-installed** Chrome via `channel: 'chrome'`, and **downloads nothing**; a missing browser is a **refusal with instructions**. `npm run verify` is unchanged and stays deterministic, network-free and server-free |
| **F-U1-b** | **Development header authentication is localhost/development-only and must NEVER be treated as the authentication solution for any shared or remotely accessible environment.** It lets a caller assert its own identity **and its own roles**. It fails closed off localhost by construction, and that guard must not be relaxed, widened or made configurable. Production requires OIDC ([ADR-0027](../adr/ADR-0027-abstract-oidc-identity.md)), whose adapter is not implemented and whose deferral trigger is [phase-2-plan.md](phase-2-plan.md) §6.1 | **STANDING.** Not a task; a constraint that holds until OIDC exists |

**One defect found by the work itself.** The first run of the project list failed with a
`ContractError` — the UI expected `name` to be a string and the API returns a **bilingual label**
carrying its own language and direction (ADR-0023). The contract validation **caught it loudly at the
boundary rather than rendering a blank pane**, which is exactly why W4 puts validation there. Fixed,
and project names now render in their own direction.


---

## 19. UI enablement U2 — **ACCEPTED 2026-08-25**

> **U2 is ACCEPTED.** **U3–U5 are NOT authorised** — each needs its own boundary proposed and
> approved, per §11 of [CLAUDE.md](../../CLAUDE.md). Phase 2 stays closed; **P3 has not started.**
> **No live provider call is permitted** while **H3 / limitation 62** stands.

### 19.0 Acceptance

| | |
|---|---|
| **Accepted** | **2026-08-25** |
| **Implementation** | **`8f7d37b`** (U2-a) + **`c93e05b`** (U2-b–e) |
| **Boundary** | `0b7b700` — [u2-proposal.md](u2-proposal.md), **X1–X10** |
| **ADR** | `0b7b700` — [ADR-0040](../adr/ADR-0040-browser-testing-pinned-browser.md), recorded **before** implementation |
| **Verification at acceptance** | `npm run verify` **green end to end, exit 0** — **838 pass / 838 · 0 fail · 0 skipped · 0 todo · 168 suites**; `check:arch` **168 files**; `check:arch:selftest` **57 cases**; `check:docs` **97 files / 1084 links**. **`npm run test:e2e`: 10 passed / 10** in 11.6 s, preflight *“Google Chrome 151.0.7922.174 (system-installed; nothing downloaded)”*. **Re-run at acceptance on a clean tree**, not carried over from the implementation commit |
| **Review** | An **independent review recommended ACCEPT**. Acceptance is nonetheless a **separate explicit decision**, taken here — a review recommendation is not an acceptance, and neither is a green run |
| **Backend** | **Untouched by the UI.** The only non-`apps/web` changes are the architecture checker's `presentation-no-api` rule and its self-test fixture (§19.1 defects 2 and 3) |
| **Dependencies** | **No runtime dependency added.** `@playwright/test` **1.62.1**, pinned exactly, **development only**; `npm run verify` never invokes it |

**Boundary approved 2026-08-25** ([u2-proposal.md](u2-proposal.md), X1–X10), with
**[ADR-0040](../adr/ADR-0040-browser-testing-pinned-browser.md)** recording the browser-testing
decision **before** implementation.

**U2 is the first slice in this application that writes.**

| Step | Delivers | Commit |
|---|---|---|
| **U2-a** | Role list completed to all ten; **bidirectional** drift test | `8f7d37b` |
| **U2-b–e** | Inventory, upload, authority ranking, L0 validation, and the browser suite | `c93e05b` |

| | |
|---|---|
| **Browser framework** | **Playwright, pinned**, driving the **system-installed Chrome** via `channel: 'chrome'`. **Nothing is downloaded** — not at install (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`, verified to leave no browser cache), not at run time. A missing browser is a **refusal with instructions** |
| **Separation** | `npm run verify` is **unchanged** — deterministic, network-free, server-free. Browser tests run under **`npm run test:e2e`**, which migrates a fresh temporary database, starts both servers, and stops them |
| **Verification** | `verify` **green, exit 0** — **838 pass · 0 fail · 0 skipped · 0 todo · 168 suites**; `check:arch` **168 files**; self-test **57 cases**; `check:docs` 97 files / 1082 links. **`test:e2e`: 10 passed** in 12.8 s |
| **API gaps** | **None added.** G-a, G-b and G-c remain unimplemented; **U2 needed none**, and the optional `/meta` gap (**G-d**) was deliberately not filled |

### 19.1 Three defects found during U2, all corrected

| # | Defect | Correction |
|---|---|---|
| **1** | **The project-name contract accepted only one of the two shapes the API returns.** Creating a project with a string `name` stores `text` as a **string**; an object name stores a **record**. U1 accepted only the record, so a project created the other way made the **entire project list fail validation** | Both shapes accepted, with three regression tests. **Found by U2's browser tests**, which create projects the string way — a path U1 never exercised |
| **2** | **`presentation-no-api` was a substring rule and produced a false positive.** `../../api/client.ts` from a nested feature is the **web's own** api directory. The rule now **resolves** the specifier and checks where it lands | Rule fixed; a self-test permits the web's own `api/`. **The rule was corrected, not weakened** |
| **3** | **That rule's negative self-test had been passing for the wrong reason.** Its fixture used `../../api/…` from `apps/web/src/api`, which resolves to `apps/web/api/…` and **never left the presentation layer**. The substring rule matched it anyway | Fixture replaced with a specifier that genuinely escapes to `apps/api` |

**Defect 3 is the one worth remembering:** a negative test that fires for the wrong reason is
indistinguishable from one that works, until the rule beneath it gets more precise.

### 19.2 What U2 does NOT claim

- **Not U3–U5.** No evidence extraction, requirements, coverage, reconciliation or G1.
- **Not images or PDF.** V2-PDF is blocked; image highlighting is a viewer capability U1 excluded.
- **Not supersession.** The API accepts `supersedesSourceId`; there is no UI, because supersession
  without a diff view invites mistakes.
- **Not production authentication.** **F-U1-b** stands unchanged.
- **No live model call.** U2 invokes no AI, by scope. **H3 / limitation 62 is unresolved**, so no
  live provider call is permitted from anywhere, including the UI.
- **Not a visual or UX design.** U2's screens are functional and accessible; **no design system,
  design tokens or interaction foundation has been approved**. Accepting U2 accepts the **journey and
  its governance**, not its appearance — see
  [ui-design-foundation-proposal.md](ui-design-foundation-proposal.md), **PROPOSED / NOT APPROVED**.

### 19.3 Non-blocking follow-ups recorded at U2's acceptance

**None blocks U2's acceptance. Each is binding on what comes after it.**

| # | Follow-up | Status |
|---|---|---|
| **F-U2-a** | **The no-download guarantee is currently structural, and a Playwright upgrade could make it merely conventional.** Today the pinned Playwright packages carry **no install script at all** (`hasInstallScript` is false for `@playwright/test`, `playwright` and `playwright-core` in `package-lock.json`), so `npm ci` has **no hook from which to fetch a browser**. If a future upgrade reintroduces a browser-downloading install script, that structural guarantee disappears and the environment-variable route becomes load-bearing — at which point it must be **recorded in the repository** (an `.npmrc` entry or the `test:e2e` script), not in prose. [ADR-0040](../adr/ADR-0040-browser-testing-pinned-browser.md)'s enforcement list was corrected at U2's acceptance for exactly this reason: it claimed an environment variable was recorded in two places where it appears **nowhere in the repository** | **OPEN.** Check at any Playwright version bump. **Not a defect today** — verified 2026-08-25: no `ms-playwright` browser cache exists on a machine where the suite passes |
| **F-U2-b** | **DISCHARGED 2026-08-25 — the foundation is APPROVED**, with **D-U2.5** as its implementation boundary (§20). Original statement: **a UI/UX design foundation must be approved before U3.** U1 and U2 established the journey; U3–U5 and a later **P3 Specification Studio** will add a requirements workspace, coverage, reconciliation and eventually a canvas. Establishing shell, navigation, tokens, states and evidence/AI presentation **after** those screens exist means redesigning them | **PROPOSED, NOT APPROVED** — [ui-design-foundation-proposal.md](ui-design-foundation-proposal.md), decisions **Y1–Y28**, written 2026-08-25 against `582eb93`. Nothing in it may be implemented without approval, and approving the foundation is **not** authorisation to redesign — that is the separate **D-U2.5** boundary in its §25 |
| **F-U1-b** | **Unchanged and permanent.** Development header authentication stays localhost/development-only. U2 **writes**, which makes this more material, not less: the header lets a caller assert its own roles, so it must never reach a shared environment | **STANDING** — §18.1 |


---

## 20. UI/UX design foundation and **D-U2.5** — **ACCEPTED 2026-08-25**

> ## **D-U2.5 IS ACCEPTED — 2026-08-25, at `99de2a7`, after a visual review.**
> The foundation (**Y1–Y28**) and its implementation are both accepted. **The accepted design
> system is the BASELINE for every subsequent UI slice — §20.8.**
> **U3 is NOT authorised. P3 has not started. H3 is unresolved and no live provider call is
> permitted.** Discharges **F-U2-b** (§19.3).

### 20.0 What was approved

| | |
|---|---|
| **Approved** | **2026-08-25** |
| **Boundary** | [ui-design-foundation-proposal.md](ui-design-foundation-proposal.md) — **Y1–Y28**, with a clarification to **Y12** (§24.1 there) |
| **Proposal commit** | `65a984d` — written as **PROPOSED**, approved as version 1.0 |
| **Implementation boundary** | **D-U2.5** — *“the design foundation, demonstrated on what already exists”*. §25 of the proposal, and **only** §25 |
| **Visual reference** | **Four mockup screens supplied and approved** — Home/Project Workspace, Sources & Intake, Source Viewer + Ask ASDP, Requirements Workspace + Ask ASDP. Adopted for **visual language, layout hierarchy, navigation model, information density, workspace structure and where contextual AI sits** |
| **Precedence** | **The repository wins over the reference.** ADRs, accessibility rules, semantic-state rules, server-provided evidence offsets, authority semantics, validation behaviour, RBAC behaviour, **F-U1-b**, and actual U1/U2 behaviour are all authoritative where they and the reference disagree — proposal §26.1 |
| **Dependencies** | **None added.** Plain CSS custom properties (**Y16**); no UI library, no CSS framework, no CSS-in-JS, no icon or font package |

### 20.1 The Y12 clarification, and why it changes no ADR

**Generated process and artifact canvases stay inspection-first and read-only** unless a future,
explicitly approved phase introduces editing — **and that does not prohibit controlled
specification-authoring interfaces** that may later be approved in P3 (**BPS**, **DecisionSpec**,
**FormSpec**, **ServiceInterface**).

That is [ADR-0002](../adr/ADR-0002-spec-layer-editing.md) and
[ADR-0003](../adr/ADR-0003-no-override-editor.md) restated at the UI layer, not an amendment to
either: **the specification layer is editable, the artifact layer is not.** A canvas that edited
the artifact would still require superseding ADR-0003.

### 20.2 What the visual reference does NOT authorise

**Prefer honest product state over visual fidelity to the mockup** — the governing instruction,
recorded verbatim.

- **No invented dashboard metrics.** The reference's readiness percentages, condition counts, phase
  labels and risk lists have **no API behind them** and are **not built**.
- **No Requirements Workspace.** It appears in the reference so the shell can accommodate **U3**
  later; **U3 is not authorised**.
- **No fabricated or seeded data** to match a screenshot.
- **Future rail entries may appear only as clearly disabled future-state navigation**, never
  implying the capability exists (proposal §2.1).
- **Ask ASDP is a disabled shell**: zero provider calls, no simulated answers, no stub imitating a
  live model, no AI-driven write, approval or decision. **H3 / limitation 62 stands.**

### 20.3 D-U2.5's approved scope, and its acceptance bar

Seventeen items, all **presentation-only**: the token layer; typography, spacing, colour and the
semantic-state system; `AppShell`; the persistent navigation rail; the project/context bar; the
workspace layout; the contextual inspector where existing functionality supports one; the status
strip; reusable buttons, forms, tables, cards, badges and feedback components; loading, empty,
error and **refusal** states; the redesigned Sources/intake experience; the redesigned source
viewer; existing evidence highlighting inside the new design; RTL/LTR behaviour; accessibility;
density and responsive behaviour; and dark mode.

**The acceptance bar, which is what makes it presentation-only rather than merely claimed to be:**
**the existing 838 unit tests and 10 browser tests must pass UNCHANGED**, with no assertion
weakened. **Held through the refinement pass** (§20.4.2): 878 unit, 31 browser, the ten untouched. New browser tests cover the new presentation behaviour, RTL mirroring, semantic states
without colour, navigation and collapse behaviour, density and responsiveness, dark mode, and
**that Ask ASDP makes no network call**. No checker rule may be weakened; no dependency added.

**Acceptance was a separate explicit decision, taken 2026-08-25 after a visual review — §20.7.**

### 20.4 D-U2.5 — the implementation

> **ACCEPTED 2026-08-25** — §20.7. **U3 is not authorised, P3 has not started, H3 is unresolved**,
> and **no live provider call was made**.

| | |
|---|---|
| **Implementation** | `90d9297` (the foundation applied) + `c42f99e` (six review corrections) + `99de2a7` (the visual refinement pass and the contrast audit) |
| **Boundary** | [ui-design-foundation-proposal.md](ui-design-foundation-proposal.md) §25, approved at `52ba323` |
| **Verification** | `npm run verify` **green end to end, exit 0** — **872 pass / 872 · 0 fail · 0 skipped · 0 todo · 176 suites**; `check:arch` **186 source files**; `check:arch:selftest` **57 cases**; `check:docs` **98 files / 1185 links** |
| **Browser** | **`npm run test:e2e`: 31 passed / 31.** The **ten U2 tests pass UNCHANGED** — not one assertion was weakened, and that is what makes this slice presentation-only rather than merely described as such. **19 new tests** cover the shell, rail honesty, dark mode, density, the collapse order, RTL mirroring, semantic states without colour, the contextual panel, keyboard row selection, the shared refusal state, and Ask ASDP |
| **Dependencies** | **None added.** Plain CSS custom properties, per **Y16**. Runtime dependencies unchanged at nine |
| **Checker rules** | **None weakened.** The architecture checker gained no exemption; `check:arch:selftest` still proves every rule bites |
| **Backend** | **Untouched.** No API, contract, migration or command changed |

**What was built** — the seventeen approved items: the token layer (`design/tokens.css`, light and
dark, with a compact density); base typography with **Arabic-first metrics** and **logical properties
only**; `AppShell` with four structural regions; the persistent dark rail; the project context bar;
the workspace layout; the contextual inspector; the status strip that is **never hidden at any
width**; reusable `Button`, `Card`, `Field`, `DataTable`, `Badge`/`StateBadge`, `Chip` and `Reason`;
**four** feedback states including **refusal as a first-class state**; the redesigned sources and
intake experience; the redesigned source viewer with an evidence inspector; existing highlighting
**unchanged**; RTL/LTR behaviour; accessibility; density and responsive behaviour; and dark mode.

**The semantic vocabulary is now data, not styling** — `design/semantics.ts` defines seven families
and, for every state, **three independent channels**: a glyph, a border treatment, and a colour. The
test that matters is not *"every state has a colour"* but *"delete the colour and every state in a
family is still distinguishable"*, and it is asserted over the whole vocabulary. `content_unverified`
and `resolved` are proved to differ in glyph, label **and** shape ([ADR-0038](../adr/ADR-0038-target-versus-content-verification.md)).

**The rail declares the whole product and cannot lie about it.** Only **Sources** is available; every
other entry is a **disabled control whose accessible name says “Not built”** and names the slice that
would deliver it. A **bidirectional drift test** asserts the available entries equal the implemented
workspaces — so a rail entry can never come to imply a capability this build lacks. **No Overview
dashboard was built**, because the reference's readiness metrics have no API behind them and inventing
them was forbidden (§20.2).

**Ask ASDP is a dock that cannot do anything.** No `fetch`, no client, no handler that could reach
one; the composer and every action are present and **disabled**; `availability()` is a constant with
no argument. Three tests hold the line: exported names are checked structurally so **no export reads
like a call path**, the module is checked to contain **no stub answer**, and a browser test records
**every** request while the dock is opened, typed into and clicked — asserting **zero**.

### 20.4.1 Six defects found by the review of this slice, all corrected

An acceptance review of the diff, run before reporting, found six. They are
recorded because what a review catches is more useful than the claim that one happened.

| # | Defect | Correction |
|---|---|---|
| **1** | **A clickable table row that no keyboard could reach.** `<tr>` had `onClick` and nothing else. For a **Viewer** — a role whose rows contain no action buttons — clicking was the *only* way to select a source, so the contextual panel was mouse-only for exactly the role most likely to be reviewing | The row takes focus and answers **Enter** and **Space**. Asserted by a browser test that signs in as a Viewer and selects by keyboard |
| **2** | **The shared `Refused` state was dead code.** It was written for **Y27** and never used; the upload refusal had its own bespoke markup | The upload refusal now uses it, so a refusal reads the same way everywhere it can happen. Two assertions added: *“a refusal is the system working”* and *“nothing was changed”* |
| **3** | **`padding: var(--asdp-space-4)` inline, in seven places.** Precisely the one-off styling **Y16** forbids, in a slice whose purpose is to end it | A `.card__pad` token class |
| **4** | **`AppShell` carried a `layoutOverride` escape hatch nothing used.** An override no test exercises is a way for the tested path and the real path to diverge silently | Removed. The layout is a pure function of the width, and the browser tests drive a real viewport |
| **5** | **The inspector carried its own `overlay` flag, hardcoded `false`** — a second source of truth for a fact the shell already publishes, and it was **wrong** at narrow widths | Removed. Docked-versus-overlaid is the shell's decision, published once as `data-inspector` |
| **6** | **A convoluted conditional spread for the selected row key**, and a needless template literal | Simplified to `selectedKey={selectedSourceId ?? selected?.id}` |

**Defect 1 is the one worth remembering:** the affordance worked perfectly for whoever was testing it
with a mouse, and was missing entirely for the role that has no other way in.

### 20.4.2 Visual refinement pass — **CHANGE requested, applied 2026-08-25**

The first implementation was reviewed as *"technically strong but not yet visually accepted — still
too close to a utilitarian engineering/admin console"*. **A refinement pass followed, visual only.**
Architecture, behaviour, **Y1–Y28**, the semantic-state model, accessibility behaviour, RTL behaviour
and every existing test were preserved, and the acceptance bar remained the proof: **the ten U2
browser tests still pass untouched.**

| Area | What changed |
|---|---|
| **Type** | A wider scale with weight tokens, body at 15px, headings at 17/22/28, a `2xs` micro-label step, tighter heading tracking, and a dedicated **reading** line-height for the document surface |
| **Space and depth** | The 4px base rescaled at the upper end (18/26/36/52), larger radii, and **restrained depth**: one hairline border, one soft shadow, a tinted card header, and a pronounced shadow reserved for panels that float |
| **The workspace header** | Was a thin utility strip; now a **deliberate header** — project mark, eyebrow label, name at heading scale, ASCII key beside it, the open source as a trail chip, actions at the far end |
| **Tables** | Taller rows, roomier cells, a quieter sticky header, hover, and a selected state that is a tint **plus** an inline-edge marker rule; buttons in cells hug their label rather than stretching to the column |
| **Forms** | 36px controls, a focus ring drawn in the accent, hover affordance, grouped sections, and the native file control brought into the design language |
| **The source viewer** | The document is now a **sheet on the page** rather than content inside a titled card; 17px at 1.85 line-height on a 74ch measure shared with its summary line; softer highlight geometry, cloned across line breaks |
| **The inspector** | A distinct title block, dividers between sections, and verification counts as **stat rows** — still reported separately per state, never as one total |
| **Ask ASDP** | A brand glyph, a labelled context block, the refusal badge above the message, actions as bordered rows carrying epistemic level and determinism, bulleted governance notes, and the composer pinned to the foot |
| **Sign-in** | Brought into the ASDP language: brand lockup with the product's one-line description, a restrained accent wash, a role grid with hover targets, the warning above the form |
| **Rail** | A brand lockup with product name and descriptor, 38px items, an inline-edge marker on the active item, a pill for the slice token, a stacked identity block |

**The direction was held, not decorated.** Navy rail, one accent hue, one restrained AI violet, no
gradients beyond a single barely-there wash behind the sign-in panel, no glows, and no animation
carrying meaning.

#### Two defects the refinement pass itself introduced, both caught before reporting

| # | Defect | How it surfaced |
|---|---|---|
| **1** | **Removing the project key from the link's visible text removed it from the ACCESSIBLE NAME**, breaking the helper that finds a project by key — and with it all ten U2 tests. The key was restored as an `aria-label` while staying out of the visible text | **The existing tests failed.** A project is identified by its key, so removing it from the name *should* break ten tests. A regression test now pins it |
| **2** | **A viewport media query could not see the assistant taking 366px from the workspace**, so opening Ask ASDP squeezed the inventory until its Authority column scrolled out of sight while the window was still 1600px wide | Found by **looking at the screenshot**. Fixed with a **container query** on the workspace, which responds to the space the screen actually has rather than to the window |

### 20.4.3 WCAG contrast, computed rather than assumed

**The approved foundation said *"contrast verified rather than assumed"*, and it had been assumed** —
chosen by eye and recorded as a limitation. `design/contrast.ts` now computes it, and the test asserts
it over **the real token file the browser resolves**, not a copy that could drift from it.

| | |
|---|---|
| **Combinations measured** | **90** — 45 pairs × 2 themes: body, muted and faint text on three surfaces; links, primary buttons and focus rings; the AI accent; the rail in both themes; meaningful borders; the development-auth warning; document text **under each highlight state**; and **every semantic tone as both badge text and badge border**, generated from the vocabulary so a new state is covered automatically |
| **Result** | **0 failures.** Text pairs meet **4.5:1**; UI boundaries and focus rings meet **3:1**. Tightest measurement **3.07:1** against a 3:1 requirement |
| **What it refuses to do** | **It never changes a colour to make a check pass.** A failing pair fails the test **by name, with its measured ratio**, because the alternative is quietly reassigning a colour whose meaning is fixed by the semantic vocabulary |
| **What it found immediately** | A **translucent** `#rrggbbaa` border token in the dark theme. Contrast against a translucent colour depends on what is behind it, so the validator refuses it rather than guessing a backdrop. The token is now opaque, and opacity is a standing constraint on any colour in a checked pair |
| **Guard against a vacuous pass** | A second test asserts the audit measures **≥90 combinations across both themes** and covers every tone as text **and** as a border. A validator that measured nothing would pass silently — the same class of defect as U2's negative self-test that fired for the wrong reason |

**Limitation withdrawn:** *"contrast was not machine-verified"* no longer applies. What remains
unmeasured is the contrast of **content the server supplies**: a highlight under document text is
checked, but the document's own text is not styled by these tokens.

### 20.7 Acceptance

| | |
|---|---|
| **Accepted** | **2026-08-25**, on an explicit decision, **after a visual review of the running application** |
| **Accepted at** | **`99de2a7`** |
| **Boundary** | [ui-design-foundation-proposal.md](ui-design-foundation-proposal.md) — **Y1–Y28** with the **Y12** clarification (§24.1 there), §25's **D-U2.5** scope, and the four-screen visual reference (§26). Approved at `52ba323` |
| **Implementation** | `90d9297` + `c42f99e` + `99de2a7` |
| **Verification at acceptance** | `npm run verify` **green end to end, exit 0** — **878 pass / 878 · 0 fail · 0 skipped · 0 todo · 177 suites**; `check:arch` **187 source files**; `check:arch:selftest` **57 cases**; `check:docs` **98 files / 1188 links**. **`npm run test:e2e`: 31 passed / 31** |
| **The bar that made it presentation-only** | **The ten U2 browser tests passed UNCHANGED throughout** — `u2-sources.spec.ts` has an empty diff across the entire slice, and no assertion was weakened. This is the evidence, not the claim |
| **Review** | **Two review passes before acceptance, eight defects found and corrected** — six in the first (§20.4.1) and two introduced by the refinement pass itself (§20.4.2). The visual review was the user's own |
| **Dependencies** | **None added.** Plain CSS custom properties, per **Y16**. Runtime dependencies unchanged at nine |
| **Checker rules** | **None weakened.** No exemption was added, and the self-test still proves every rule bites |
| **Backend** | **Untouched.** No API, contract, migration, command or domain behaviour changed |

**What acceptance CLAIMS:** a durable visual and interaction foundation, applied to the functionality
U1 and U2 already delivered, with **WCAG AA contrast computed over the real token file** (§20.4.3).

**What it does NOT claim:** any new capability — D-U2.5 delivered none; **U3**, which is not
authorised; any model quality — **no live model has ever been called**, and **Ask ASDP is an inert
shell** because **H3 / limitation 62** is unresolved.

### 20.8 The accepted baseline for every subsequent UI slice

**This is the load-bearing consequence of acceptance.** The following are now the **baseline**, not a
starting point to be re-litigated per slice. A slice that needs to change one of them is making an
**architectural** change and needs its own approval:

| Baseline | Where it lives |
|---|---|
| **The approved design system and token layer** | `apps/web/src/design/tokens.css` — the only place a colour, size or space is defined. **Plain CSS custom properties; no UI library, no CSS framework, no CSS-in-JS** (**Y16**) |
| **The component inventory**, and *no component carries a domain rule* | `apps/web/src/components/` — **Y17**, enforced by the architecture checker |
| **The semantic-state vocabulary** — seven families, three channels per state | `apps/web/src/design/semantics.ts`. **Colour is never the only channel**, and the test proves the states stay distinguishable with it removed |
| **WCAG AA contrast** over every declared token pair, in both themes | `apps/web/src/design/contrast.ts`. A new token combination is added to the declared pairs, **not** exempted |
| **Responsive behaviour and the collapse order** | `apps/web/src/design/responsive.ts`. **Governance information collapses last, and the status strip never hides** |
| **RTL/LTR behaviour** | Logical properties only; direction is **per-segment and server-decided**; identifiers stay LTR and ASCII |
| **Accessibility** | **W8** plus D-U2.5's additions: never colour alone, accessible names carrying direction and language, keyboard-operable rows, reasons in text beside disabled controls |
| **The Ask ASDP interaction model** | `apps/web/src/assistant/`. Persistent, collapsible, context-bound, evidence-first, **no write control of any kind**, and **inert until H3 is resolved** |
| **The Modern AI Engineering visual direction** | Navy rail, one accent hue, one restrained AI violet, engineering-tool density, **AI present without dominating**. No decorative gradients or visual effects |

**U3 inherits all of it.** Its boundary proposal should say which screens it adds — not which of these
it intends to redecide.

### 20.5 Deviations from the visual reference, and why

**Each is a case where the repository or the available data won, exactly as §26.1 requires.**

| # | Deviation | Why |
|---|---|---|
| **1** | **No Home/dashboard screen.** The rail's Overview entry is disabled | Its metrics — *“27 / 134 conditions met”*, *“36% overall readiness”*, phase labels, top risks — have **no API**. §20.2 forbids inventing them, and fabricating data to match a screenshot was explicitly excluded |
| **2** | **No Requirements workspace** | **U3 is not authorised.** It appears in the reference so the shell can accommodate it later |
| **3** | **No language selector.** The reference shows an `EN` control | There are **no interface translations**. A selector that switches nothing is a fake capability. Interface direction follows the document element, so a real locale switch will mirror the whole shell with no CSS change — which the RTL browser test proves today |
| **4** | **No global search, notifications or help controls** | None has a backing capability. Same rule as the dashboard metrics |
| **5** | **The Sources side panel lives in the workspace, not the shell inspector** | It owns **write** state (the upload form, the rank form) that belongs with the screen rather than the shell. Visually it is the reference's right-hand panel; structurally the shell inspector stays free for the document view |
| **6** | **Ask ASDP is collapsed by default** | It is **unavailable**. Opening it by default would give an inert panel the most valuable space on screen |
| **7** | **Sub-navigation tabs on Sources are not used** | The reference tabs Inventory / Upload / Authority / Validation. All four are visible at once here, which suits three sources and keeps every U2 affordance reachable without a click. Tabs become worthwhile when the inventory is long enough to need them |
| **8** | **Confidence is not shown anywhere** | U1/U2 surface no confidence value. A meter with nothing behind it would be the exact failure **Y21** forbids |
| **9** | **No deep links.** **Y5** is approved as a target | It needs a router, which is a dependency decision and outside §25's scope. The shell is shaped so one can be added without moving a region |

### 20.6 Remaining limitations of D-U2.5

**None blocks a decision; all are recorded rather than left to be discovered.**

- **Appearance is not persisted.** Theme and density reset on reload — deliberate, because a
  `localStorage` key would leak between browser tests and silently change what the next one sees.
- **Interface direction is not switchable from the UI.** It follows `document.documentElement`, which
  is the real mechanism; there is no control because there is nothing to translate into.
- **The rail's future entries are not keyboard-focusable**, being disabled buttons. Their reasons are
  in the accessible name and are reachable by a screen reader in browse mode, but not by tabbing.
- **One inspector, one entity.** The fixed section order is proved on a **source**; requirements,
  conflicts and gates have no inspector because they have no screen.
- **Disabled rail entries are not tab-focusable.** Their reasons are in the accessible name and reach a
  screen reader in browse mode, but not by tabbing. Making them focusable would put eleven dead stops
  in the tab order; the trade is recorded rather than resolved.

---

## 21. UI enablement U3 — **BOUNDARY APPROVED 2026-08-26** · U3-a, U3-b and U3-c **ACCEPTED**

**The boundary is approved. The slice is not accepted, and no part of it is.**

### 21.0 What was approved

| | |
|---|---|
| **Approved** | **2026-08-26**, on an explicit decision |
| **Boundary** | [u3-proposal.md](u3-proposal.md) — **Z1–Z14**, with **Z2-B**, **Z6-B**, **Z8-a**, **Z8-b-1**, the **Z6-a qualification** and an **amendment to acceptance criterion 5** |
| **What it authorises** | The requirements workspace as a **six-step sequence** — U3-a … U3-f. **Each step is reported and reviewed before the next begins.** Approval of the boundary is not approval of an implementation |
| **What it does NOT authorise** | **U4**, **U5**, **G-a**, **G-b**, **H3**, any live AI or provider call, **V4b-eval**, **V2-PDF**, **P3** |

**The four decisions worth reading before touching this slice:**

| Decision | Substance |
|---|---|
| **Z2-B** | **`apps/web` gets no AI-invoking control.** No `populate-frame`, `profile`, `extract-evidence` or `reconcile` button. The finding that forced the choice is that **every AI port refuses by default** — `app.module.ts` ships the application unable to reach a provider — so a control whose only behaviour today is a refusal would become a live call by configuration change alone. U3 is built around the **model-free** path instead: human evidence recording → an empty set → human-authored L3 → review |
| **Z5** | **G-a and G-e are deliberately unfilled.** Flags are therefore **not shown at all**, because `frame-coverage` returns only five of the seven `RequirementFlagKind` values and showing five would hide the **ADR-0038** flag. Version **history** is likewise not retrievable, and **criterion 5 was amended at approval** so no acceptance criterion claims otherwise |
| **Z6-B / Z6-a** | See §21.2. **Limitation 70 stays open** |
| **Z8-a** | Requirement statuses **extend** the existing `lifecycle` semantic family — no new family, no new colour token, no new shape. This is what U3-a implements |

### 21.1 U3-a — **ACCEPTED 2026-08-26**

| | |
|---|---|
| **Accepted** | **2026-08-26**, on an explicit decision, after the implementation, its **mutation-proof** and its verification were reported |
| **Accepted at** | **`5f72f83`** — *"U3-a ACCEPTED — requirement statuses, and a drift guard that bites"*. The record inside that commit could not name it, because a commit cannot name itself; the hash was written here immediately afterwards rather than invented in advance |
| **Boundary** | [u3-proposal.md](u3-proposal.md) §12, step **U3-a**, under **Z8-a** |
| **What acceptance CLAIMS** | That the requirement statuses are in the vocabulary, that the drift guard is bidirectional and **proved to fail**, and that nothing already accepted changed |
| **What it does NOT claim** | **Any capability.** Nothing renders differently, no screen consumes a requirement status, and **U3 is not implemented** — §21.4 |
| **Review** | The implementation, the two mutation results and the full verification were reported before the decision. **No defect was found** |

**Scope:** the vocabulary change and its drift guard. **Nothing renders differently**, because no
screen consumes a requirement status yet — that is U3-c.

| | |
|---|---|
| **Changed** | `apps/web/src/design/semantics.ts` — six new `lifecycle` states (`draft`, `in_review`, `needs_clarification`, `deferred`, `rejected`, `approved`), the shared `superseded` entry generalised in wording, and a declared `REQUIREMENT_STATUSES` list · `apps/web/src/design/design.test.ts` — eight new assertions |
| **Not changed** | The backend. No API, contract, migration, command or domain behaviour. No component, no screen, no route, no CSS, no token |
| **Dependencies** | **None added.** Runtime dependencies remain **nine** |
| **Checker rules** | **None weakened, none added, no exemption.** `check:arch` and its self-test are untouched |
| **Verification** | `npm run verify` **green end to end, exit 0** — **886 pass / 886 · 0 fail · 0 cancelled · 0 skipped · 0 todo · 178 suites**; `check:arch` **187 source files**; `check:arch:selftest` **57 cases**; `check:docs` **99 files / 1234 links**. Against the `ad363a6` baseline of **878 / 878 · 177 suites**, U3-a adds **8 tests and 1 suite** and changes nothing else. **`npm run test:e2e`: 31 passed / 31, UNCHANGED** — the regression bar held, no assertion weakened, and no spec file edited |

**Three properties asserted rather than trusted:**

1. **The status list equals the API's, in both directions.** `REQUIREMENT_STATUSES` is compared with
   `RequirementStatus` from `@asdp/schemas` as sets. It is **declared, not derived** — deriving it
   would make the two agree by construction and the guard would then assert that a value equals
   itself, which is U2-a's *"a one-directional drift test catches half the drift"* taken one step
   further.
2. **Every status resolves to a real state**, never to `unknownState`. A status rendering as
   *"Unrecognised"* to a reviewer would be a defect, not a graceful fallback.
3. **The extension changed nothing already accepted.** The four source lifecycle states keep their
   glyph, shape and tone; only `superseded`'s screen-reader wording generalises, because the entry is
   now shared with a requirement.

**The guard was proved to bite, by mutation, before it was reported:** removing `deferred` from the
declared list fails the bidirectional test; removing the `draft` vocabulary entry while leaving the
list intact fails the resolvability test. **A test that cannot fail is a defect too** (§9 of
[CLAUDE.md](../../CLAUDE.md)), and asserting a green run without checking that is how a vacuous test
survives.

**A consequence recorded rather than discovered:** `superseded` exists in **both** `SourceStatus` and
`RequirementStatus`, and one family means one entry. Its screen-reader text changed from *"superseded
by a later source"* to *"superseded by a later record"*; the badge's `subject` names which. No glyph,
shape or tone changed. Nothing in the API sets a requirement to `superseded` today — the mapping
exists because the guard requires **every** status to be renderable, not because the state is
reachable.

**`approved` does not use `✓`, and `rejected` does not use `✕`**, because both glyphs are already
taken inside `lifecycle` and the vocabulary's own test requires glyphs to be unique within a family —
that is what keeps the badges readable in greyscale. `approved` uses the shield, which is not
decoration: migration 010 refuses `status: 'approved'` without an approver, a timestamp and a
baseline, so the state a requirement reaches is a **gate** act and the glyph says which.

### 21.5 U3-b — evidence recording · **IMPLEMENTED, AWAITING REVIEW**

**Scope:** cite a unit as evidence from the existing source viewer, and list what has been cited
([u3-proposal.md](u3-proposal.md) §3.2, §3.3). **The first capability U3 delivers.**

| | |
|---|---|
| **Added** | `apps/web/src/features/evidence/evidence-model.ts` (DOM-free) · `CiteEvidence.tsx` · `Evidence.tsx` · `apps/web/e2e/u3-evidence.spec.ts` |
| **Changed** | `api/contracts.ts` (evidence schemas, imported from `@asdp/schemas`) · `lib/dev-auth.ts` (`recordEvidence`) · `source-viewer/DocumentView.tsx` (the citation panel in the inspector) · `app/App.tsx` (wiring, and the re-read epoch) · `features/sources/Sources.tsx` (the inventory) · `src/web.test.ts` |
| **Backend** | **One authorised correction** — `apps/api/src/http/domain-error.filter.ts` maps `AnchorVerificationError` to **400**. §21.5.2 |
| **Not changed** | No API route, contract, migration, command or domain behaviour. No token, no CSS, no component in `components/` |
| **Dependencies** | **None added.** Runtime dependencies remain **nine** |
| **Checker rules** | **None weakened, none added, no exemption** |
| **Verification** | `npm run verify` **green, exit 0** — **904 pass / 904 · 0 fail · 0 cancelled · 0 skipped · 0 todo · 181 suites**; `check:arch` **190 source files**; `check:arch:selftest` **57 cases**; `check:docs` **99 files / 1238 links**. **`npm run test:e2e`: 39 passed / 39** — the **31 pre-existing browser tests passed UNCHANGED**, with an **empty diff** on both existing spec files |

**Four structural guards, each proved to fail by mutation before this was reported:**

| Guard | Mutation that breaks it |
|---|---|
| The citation body carries **no character range** | Adding `charStart`/`charEnd` to `citeUnitBody` |
| `evidence-model.ts` mentions neither field **at all** | The same |
| The inventory **never** renders a verification badge from `anchorVerified` | Reintroducing `StateBadge` in `Evidence.tsx` |
| **Z2-B** — `apps/web` holds **no AI-invoking control** | Any module naming `populate-frame`, `extract-evidence`, `/profile` or `reconcile` |

### 21.5.1 An ADR-0038 conflation, caught before it shipped

**The first implementation mapped `anchorVerified` to the `resolved` verification badge. That was
wrong, and wrong in the way this repository cares most about.**

`recordEvidence` stores `anchorVerified: true` for **everything it accepts**, and `content_unverified`
**is** accepted (`isCitable` admits `resolved` and `content_unverified`). So the boolean means *"the
server checked this before storing it (D1)"*, **not** *"the anchor resolved to its exact region"* —
and the badge would have labelled a content-unverified anchor as resolved, which is precisely what
[ADR-0038](../adr/ADR-0038-target-versus-content-verification.md) exists to prevent.

**A stored `EvidenceItem` does not carry its resolution status at all**, so this build genuinely
cannot tell the two apart. The inventory now **says so** rather than guessing, in words, and both a
unit test over the component source and a browser test assert the word *"Resolved"* never appears.
**Recorded as a gap: the evidence read surface exposes no resolution status.** Filling it is a
backend change and is **not** U3 scope.

### 21.5.2 Three findings, recorded and NOT fixed

| # | Finding | Why it was not fixed here |
|---|---|---|
| **1** | ~~An anchor refusal returns 500, not 400.~~ **FIXED — see §21.5.6.** The correction was authorised as part of U3-b, because U3-b is the slice that exposes the evidence-recording path and its approved behaviour requires domain refusals to be represented honestly | **CLOSED.** The finding is kept on the record rather than deleted, so the sequence stays legible |
| **2** | **Three role-map entries do not match the API.** `listRequirements`, `frameCoverage` and `g1Readiness` in `dev-auth.ts` each omit roles the API grants, and two name `BusinessApprover`, which it does not. **No screen gates on any of them**, so nothing is currently wrong on screen | Correcting them belongs to **U3-c**, the slice that first consumes them. The new drift test covers **every command a screen actually gates on** — `ingestSource`, `setSourceAuthorityRank`, `validateIntake`, `recordEvidence` — and states its own scope and why |
| **3** | **The `broken`/`drifted` refusal is unreachable from this UI.** Citing a unit inherits an anchor the server minted and immediately re-verifies; nothing in a browser can make stored text drift | Covered by **unit tests** over `citeRefusal` rather than a browser test, and the browser suite covers the refusal that *is* reachable — a role that may not cite. Stated in the spec's own header |

### 21.5.6 The authorised amendment — an anchor refusal is 400, not 500

**Authorised on review of U3-b, and scoped to this defect alone.** U3-b is the slice that exposes
evidence recording to a person, and its approved behaviour requires a domain refusal to be
represented honestly — so the correction belongs with it rather than with a later slice.

| | |
|---|---|
| **The defect** | `AnchorVerificationError extends Error` and was **absent from `classify()`'s chain** in `domain-error.filter.ts`, so it fell through to the generic **500**. A caller told *"refusing to store evidence with a broken anchor"* was simultaneously told the server had failed |
| **The change** | **Two lines of behaviour** in `apps/api/src/http/domain-error.filter.ts`: an import, and `if (err instanceof AnchorVerificationError) return { status: 400, body: { error: err.message } };` **Nothing else in the domain-error system was touched, generalised or refactored** |
| **Why 400** | Every other check in `recordEvidence` throws `ValidationError` → **400** — unknown source, wrong project, parse-failed source, no stored text, a range outside the unit. The anchor check is the **last check in the same function** and is the same kind of statement: the submitted citation is not acceptable. **409 would be wrong** — that is for a conflict with current state a caller can resolve by reloading (concurrency, gate guard, invariant), and an anchor that does not resolve fails identically on retry. **422 has no precedent anywhere in this filter** |
| **The test** | `api.test.ts` — *"AN UNVERIFIABLE ANCHOR IS 400, NOT 500 — it is a refusal"*. It drives the **real `DomainErrorFilter`**, not a copy of its logic, and asserts the status is 400, that it is **not** 500, that the server's message survives verbatim, and that the correlation id is still set |
| **Proved to fail** | Removing the mapping line while keeping the import reproduces the defect exactly, and the test **fails**. A second test — *"the 400 mapping is SPECIFIC"* — asserts an unrecognised error is **still 500**, so *"everything is 400"* cannot pass |

**Why the test is at the filter rather than over HTTP, stated so it is not mistaken for a shortcut.**
Both anchor-minting paths in `recordEvidence` derive the quote **from the stored text**, so the anchor
always re-resolves and this refusal is **currently unreachable over the wire**. It is a guard against a
future path — and a guard that returns the wrong status is still wrong. An end-to-end test would have
had to fabricate a state the system cannot reach.

**One side effect, recorded rather than left to be found.** `AnchorVerificationError` is thrown at
**four** sites. Three are *"the submitted content produced an unverifiable anchor"* and are squarely
400. The fourth — *"the guard admitted an image without dimensions"* — is an **internal consistency
assertion**, not the caller's fault, and it now reports 400 where it previously reported 500.
Separating it would mean introducing a second error type, which is the generalisation the amendment
was explicitly scoped to avoid. It is a defensive branch with no known path to it. **Recorded, not
fixed.**

**Deliberately NOT done, per the amendment's scope:** the evidence read surface still exposes no
anchor resolution status (§21.5.1), and the three role-map mismatches are still uncorrected
(§21.5.2, finding 2) and still belong to U3-c.

---

### 21.5.3 A sentence narrowed, not deleted

U1's document inspector said *"Read-only by construction (ADR-0015). There is no write path in this
view and none to add."* U3-b adds a write path to that view, so the sentence was **narrowed and the
narrowing recorded in place**, rather than quietly removed.

**The claim it protected still holds:** the document itself is not editable, a source is immutable
after ingest, and an `EvidenceItem` is immutable too (D1, D8). **ADR-0015 governs *artifact* viewers**
— BPMN, DMN, forms — and forbids editing the artifact; recording a citation is not editing the thing
cited, and evidence sits on the **editable** side of the product boundary
([ADR-0002](../adr/ADR-0002-spec-layer-editing.md)). **No ADR conflict arises**, and §3.2 of the
approved boundary is explicit that S4 gains this action.

### 21.5.4 A deviation from the boundary, stated

**§3.3 places the evidence inventory on S5**, the requirements workspace — which **U3-c** builds and
which does not exist. It renders in the **Sources** workspace instead, because evidence is cited
*from* a source and that is the screen that already holds them. The alternatives were to invent a
rail entry the approved navigation does not declare, or to defer the inventory out of the slice the
boundary puts it in. **U3-c may move or mirror it.**

### 21.5.5 What U3-b does NOT claim

- **No requirement is rendered.** That is U3-c, and the rail still shows *Requirements* as
  unavailable and names U3.
- **No model was called**, and `apps/web` holds no control that could call one — asserted
  structurally (**Z2-B**).
- **`anchorVerified` is not a resolution status**, and this build does not claim to know which
  anchors resolved exactly — §21.5.1.
- **Limitation 70 is untouched.** U3-b records evidence; it decides nothing.

---

### 21.7 U3-c — the read-only requirements workspace · **ACCEPTED 2026-08-26**

| | |
|---|---|
| **Accepted** | **2026-08-26**, on an explicit decision, **after a visual review of the running workspace** |
| **Accepted at** | The tree carried by the U3-c acceptance commit. A commit cannot name itself; the hash is in `git log` beside *"U3-c ACCEPTED"* |
| **Boundary** | [u3-proposal.md](u3-proposal.md) §3.1 and §12, step **U3-c** |
| **Review** | **Two passes.** The implementation and its verification were reported first; a **visual review** then found **five** items, of which **four were amended** and one was **verified conformant with no change** — §21.7.7 |
| **What acceptance CLAIMS** | The read-only requirements workspace renders correctly against the approved U3 boundary and the D-U2.5 design contracts |
| **What it does NOT claim** | **Any review capability** — U3-c writes nothing. And **not** that the populated rendering was proved in a browser: it cannot be, §21.7.1 |

**Scope:** the requirements workspace, **read-only**
([u3-proposal.md](u3-proposal.md) §3.1). Reviewing, revising and confirming are **U3-d/U3-e** and no
control here anticipates them.

| | |
|---|---|
| **Added** | `apps/web/src/features/requirements/requirement-model.ts` (DOM-free) · `Requirements.tsx` · `RequirementInspector.tsx` · `apps/web/e2e/u3-requirements.spec.ts` |
| **Changed** | `api/contracts.ts` (requirement schemas, from `@asdp/schemas`) · `lib/dev-auth.ts` (the `listRequirements` correction) · `app/routes.ts` and `design/nav.ts` (the rail entry) · `components/shell/AppShell.tsx` (the rail's selection now reaches the app) · `app/App.tsx` (workspace switching, the evidence pane) · `source-viewer/DocumentView.tsx` (a back label) · `assistant/assistant-model.ts` (a `requirement` context scope — **Z9**) · `src/web.test.ts` · `design/design.test.ts` · `e2e/d-u2_5-design.spec.ts` (§21.7.3) |
| **Backend** | **Untouched.** No API, contract, migration, command or domain behaviour |
| **Dependencies** | **None added.** No router — **Z8-b-1** deep linking stays **U3-f**. Runtime dependencies remain **nine** |
| **Checker rules** | **None weakened, none added, no exemption** |
| **Verification** | *(after the visual-review amendment, §21.7.7)* `npm run verify` **green, exit 0** — **933 pass / 933 · 0 fail · 0 cancelled · 0 skipped · 0 todo · 192 suites**; `check:arch` **193 source files**; `check:arch:selftest` **57 cases**; `check:docs` **99 files / 1240 links**. **`npm run test:e2e`: 48 passed / 48** |

**What it renders:** the proposal list in the API's order; a detail inspector in **Y6**'s fixed
section order — identity → provenance → confidence → actions → history; epistemic level and
derivation as badges; the confidence **band** with its function version and its degradations; the
current version and its named predecessor; `originalAiText` where it differs; the inference rationale
where the derivation is `inferred`; and evidence chips that open the **U1 viewer at the anchored
region**, with the requirement still in the inspector beside it.

**Four guards, each proved to fail by mutation before this was reported:**

| Guard | Mutation that breaks it |
|---|---|
| The two empty states never collapse into one | Returning `empty_set` when no pass has run |
| Confidence is never a percentage | `(score * 100).toFixed(0) + '%'` |
| An unresolved citation is shown, never dropped | Filtering unfollowable chips out of the list |
| The client never re-orders the API's list | Adding `.sort((a, b) => a.id.localeCompare(b.id))` |

### 21.7.1 The limitation that shapes U3-c's acceptance basis

**A populated requirement list is unreachable in any runnable configuration**, and that is not a
gap in the tests — it is the state of the system. Every AI port refuses by default,
`POPULATE_FRAME` is the only thing that creates a proposal, and **Z2-B** forbids a control that
could start one. Getting a requirement onto a screen in a browser test would mean wiring a provider
stub into the running service, which crosses exactly the line **H3** and **A7** draw.

**What is reachable, and is tested in the browser:** both empty states, navigation in both
directions, the role refusal, keyboard operability, no-sideways-scroll at three widths, and Ask ASDP
making **zero requests** on the new workspace — **Z9**, discharged on S5 now that S5 exists.

**What is covered DOM-free instead:** every rule the populated rendering depends on — the empty-state
distinction, confidence formatting, the G-e version bound, the inferred-rationale defect, unresolved
chips, provenance for a human author, and the no-sort guarantee.

**This is a weaker acceptance basis than U3-b's, and it is stated rather than glossed.** U3-b's
journey was exercised end to end in a browser; U3-c's central rendering cannot be, until something
can produce a requirement.

### 21.7.2 A defect found by the browser suite — an unbounded read loop

**The first implementation re-read requirements and evidence in a loop.** `useRequirements`
depended on the API client, which `Workspace` rebuilds on every render, so the callback's identity
changed every render, the effect re-fired, state was set, and it rendered again. The screen sat in
`loading` forever and never reached either empty state.

**It was caught by the Ask ASDP zero-request test**, which is not what that test is for: it recorded
the same two requests dozens of times and failed on a request count. Two other tests failed as a
side effect. The fix follows the pattern `loadProjects` in `App.tsx` already uses — depend on the
project and on whether the workspace is open, not on the client. **Recorded because a test catching a
defect it was not aimed at is the argument for having written it.**

### 21.7.3 One pre-existing browser test changed — and it is not a weakening

**The "31 unchanged" regression bar no longer holds literally, and saying so matters more than
keeping the number.**

`d-u2_5-design.spec.ts` asserted that **Requirements is disabled in the rail** and names U3. **U3-c
built it**, so that assertion is now false. The test moves the entry to the other side — asserting it
is **enabled** and `data-available="true"` — and keeps every other entry in the disabled loop
unchanged.

**Nothing was weakened.** The rule the test enforces is *"the rail never implies a capability that
does not exist"*, and it is unchanged: the available set must equal the implemented set, in both
directions, and `navDrift()` still asserts exactly that. Only the membership moved. Two unit tests in
`design.test.ts` changed for the same reason, including one U3-a wrote — each records that its
previous assertion was correct when written.

**The other 30 pre-existing browser tests are untouched**, and all 48 pass.

### 21.7.4 The role-map finding, closed for what U3-c consumes

**`listRequirements` now matches the API exactly.** It previously read
`['Viewer', 'BusinessAnalyst', 'ProcessArchitect', 'BusinessApprover']`, which **omitted
`Contributor`, `ComplianceReviewer` and `PlatformAdmin`** — all of which the API permits — and named
`BusinessApprover`, which it does not. A Contributor would have been shown a refusal the API would
not have given.

**UI metadata only.** No backend authorisation behaviour changed, and none needed to. A browser test
proves a `Contributor` can now read requirements in the UI **and** over the API.

**`frameCoverage` and `g1Readiness` are deliberately still wrong** and still recorded. No screen
gates on them; `frameCoverage` belongs to **U4** and `g1Readiness` to **U5**. Correcting an entry
nothing consumes is churn.

### 21.7.5 Composition and shell notes

- **Y11's three panes** are the list (workspace), the detail (shell inspector), and the U1 viewer as
  the evidence pane. Following a chip puts the viewer in the workspace region **and keeps the
  requirement in the inspector** — Y11's concern is that *"provenance that requires navigating away
  does not get checked"*, and the proposition stays on screen beside its passage.
- **The rail's selection now reaches the application.** `AppShell` previously discarded the id and
  only closed the drawer, because until U3-c there was one workspace to be in. The rail model is
  otherwise unchanged: availability still comes from `nav.ts`, and an unavailable entry is still
  inert.
- **`GET /evidence` is re-used** to resolve an evidence link to its source. An evidence link names
  only an `evidenceItemId`, and this is the read **U3-b already added** — no new API surface.

### 21.7.7 The visual-review amendment — five findings, four changes

**Requested after a visual review of the running workspace, and scoped to
corrections against the already-approved contracts.** No U3-c boundary was
widened.

| # | Finding | Disposition |
|---|---|---|
| **1** | **An inferred L3 with no evidence was reported as a D2 violation.** `addInferredRequirement` stores **no** links on purpose — *"deliberately NOT `insertProposal`: that requires evidence links, and an inferred requirement has a rationale instead"* — so D2 is satisfied by the **mandatory rationale**. The inspector told a reviewer a perfectly legal row should not exist | **FIXED.** `evidenceExpectationOf(row, citedCount)` now returns `cited` / `rationale_instead` / `defect`, and the inspector asks it. The true defect — any *other* derivation with no evidence — still fires |
| **2** | **A requirement outlived its project.** After *Change project* the inspector still showed a requirement from the project just left | **FIXED.** One `leaveProject()` clears project, requirement and document together; leaving the workspace also drops the selection |
| **3** | **A raw evidence id was the page heading** — `Evidence ev-01M0Y…` at page-title scale | **FIXED.** The heading is now the **document filename**, from `GET …/content` which already returns it; an `Evidence` eyebrow reuses the existing `section-title` class, and the id stays in the sub-line as `code.id` traceability. **No new API, no new CSS** |
| **4** | **The confidence pair wrapped**, splitting `0.78` from `confidence-1` in a narrow column | **FIXED — see §21.7.8** |
| **5** | **Responsive inspector behaviour** | **VERIFIED CONFORMANT — no change. See §21.7.9** |

**Regression tests, both mutation-proved.** Removing the `inferred` branch fails
*"AN INFERRED REQUIREMENT WITH NO EVIDENCE IS VALID"*; removing
`setRequirement(undefined)` from `leaveProject` fails *"CHANGING PROJECT CLEARS
THE SELECTED REQUIREMENT"*.

**Why finding 1 escaped the tests, recorded because it is the lesson.**
`derivationOf` and `chipsFor` were each covered and the **combination** was not.
The new test is a 2×2 over `(derivation, citedCount)` for exactly that reason.

### 21.7.8 Finding 4 — what Y21 actually requires

**Quoted from the accepted baseline** ([ui-design-foundation-proposal.md](ui-design-foundation-proposal.md) §15):

> **Confidence is a computed band with its inputs inspectable**, never a bare
> percentage — *"A bare '92%' reads as '92% correct', which nothing in this
> repository has ever measured."*

**Y21 requires the band, and requires the inputs to be `inspectable` — not
printed in every list cell.** So the list keeps the **band** and the computed
**value**; the **function version** moves to the inspector, which already carries
the complete set, and stays one hover away in the cell title. The pair is kept
together somewhere it fits rather than broken where it does not.

**Nothing was weakened.** No percentage is emitted anywhere; the inspector still
renders band, computed value, function version and degradations, and a test
asserts each of those four is still there.

### 21.7.9 Finding 5 — the responsive behaviour is conformant, unchanged

**Quoted from the accepted baseline** (§19, **Y26**):

| Width | Shell |
|---|---|
| **≥ 1440px** | Rail expanded · main · inspector · assistant dock, all visible |
| **1024–1439px** | Rail collapses to icons; assistant dock becomes an overlay panel |
| **768–1023px** | **Inspector becomes a slide-over; tables scroll inside their own region** |
| **< 768px** | Single column, tab-switched. Read and review only |

> **The invariant:** what collapses is **chrome**, never **state**.

**Measured against it:**

- **1180px** — rail icons, **inspector docked** beside the list, table narrower
  and scrolling in its own region. Matches the 1024–1439 row.
- **900px** — rail icons, **inspector a slide-over** over the list, table
  scrolling behind in its own region, **Close** visible. Matches the 768–1023 row
  exactly, including the clause about tables.
- **720px** — rail as a drawer with an explicit Navigation control, single
  column. Matches the sub-768 row.

**The clipping noticed in review is the specified behaviour, not a defect:** a
slide-over covers content by definition, and *"tables scroll inside their own
region"* is the rule that governs what happens to the table underneath. Close,
navigation and the status strip are all reachable at every width, and the browser
suite already asserts **no horizontal page scroll** at 1440/1024/720.

**No design change made, and no test added** — there was no compliance defect to
regress against, and adding a test for behaviour that already passes its existing
assertions would be noise.

### 21.7.10 Recorded for U3-e — an inferred requirement cannot be revised

**Found during the visual review. NOT U3-c work, and deliberately not fixed here.**

`reviseRequirement` in the command layer exempts inferred requirements from the
evidence requirement:

> `if (inherited.length === 0 && current.derivation !== 'inferred')`

but `SqlRequirementRepository.reviseRequirement` refuses **unconditionally**:

> *"a revision may not sever provenance"*

So the command's exemption is unreachable, and an inferred requirement — which by
construction has no evidence links — **can never be revised**. It surfaced as a
`400` when the visual-review seed tried it.

**It belongs to U3-e**, where revision is actually implemented and the
command/repository invariant can be judged deliberately: either the repository
should learn the same exemption, or the command's exemption is wrong and should
go. **Deciding that is not a screenshot's job.**

**Preserved explicitly at U3-c's acceptance.** The acceptance decision named this
finding and directed that it be **held for U3-e** rather than resolved
opportunistically before then. It is one of the two invariants in this repository
that currently disagree with each other, so closing it quietly in a slice that
does not implement revision would settle a governance question by accident.

---

### 21.7.6 What U3-c does NOT claim

- **No review, no write, no approval.** Accept, reject, defer, send-for-clarification, revise and
  confirm-inference are **U3-d/U3-e**; a structural test asserts none of those routes is named
  anywhere in the feature.
- **No flags.** **G-a** stays unfilled and flags stay **U4**; showing five of seven kinds would hide
  the ADR-0038 one.
- **No version history.** **G-e** stays unfilled: a predecessor is named and never retrieved.
- **No deep links.** **Z8-b-1** is approved and is **U3-f**; no router was added.
- **No bulk anything.** No selection model exists to extend — limitation 70's only structural
  mitigation, asserted by absence in both a unit test and a browser test.
- **No model was called**, and `apps/web` still holds no control that could call one.

---

### 21.2 What U3 claims about limitation 70 — and what it does not

**Limitation 70 remains OPEN.** *"Nothing measures whether a reviewer reviewed."*

| | |
|---|---|
| **Z6-B — what is reported** | One observation: **proposals edited before approval**, computable as `version > 1` with `generatedBy: 'human'` over data the screen already reads. Rendered beside the approval-state counts with an explicit on-screen note |
| **What it is NOT** | **Not a quality metric. Not a reviewer-attention metric. Not a measure of whether review happened.** *"An approval rate of 100% with an edit rate of 0% is a finding, not a success"* — the value of the number is that it can be **bad** |
| **Z6-a — the safeguard** | No decision may be recorded on a requirement whose detail pane has not been rendered |
| **The qualification, which is part of the decision** | **Z6-a is a structural / friction safeguard ONLY.** It makes a careless decision harder to record. It is **not evidence that meaningful human review occurred**, it **must never be described as such**, and **it does not close limitation 70** |
| **Still unmeasured** | **Conflicts overturned** — it needs `chose_alternative` / `not_a_conflict` verdicts, which are **U5** and gated on **G-b**. And consideration itself, which nothing counts |
| **Z6-C, rejected** | A reviewer-attention measure (dwell time, evidence-opened-before-decision). Telemetry about people, unapproved scope, and declined by V7's own §16: *"V7 claims no human-factors metric it cannot support"* |

### 21.3 Repository findings recorded during the U3 boundary work — **NOT SCHEDULED**

Six findings are recorded in [u3-proposal.md](u3-proposal.md) §15, against commit `ad363a6`: unused
imports in `review.controller.ts`; read routes without a role check; an unbounded audit read; a
lexical `order by id` on the requirement read that is the same class as limitations **80 / 81**; a
**W6** numbering collision in the parent boundary; and this file's own handoff HEAD being one commit
behind, now corrected in §0.0.

**None is scheduled, and none is to be fixed opportunistically inside U3.** If one becomes strictly
required by an approved U3 acceptance criterion, **work stops and the conflict is reported before
scope expands.**

### 21.4 What U3-a does NOT claim

- **No capability.** Nothing renders differently; no screen consumes a requirement status yet.
- **U3 is not implemented.** The rail still shows *Requirements* as unavailable and names U3, and a
  test asserts that it does.
- **No model quality, and no model call.** **No live model has ever been called**, and U3 makes none
  by scope (**Z2-B**) and by structure.
- **Limitation 70 is not closed**, and neither is any other open limitation.

---

## 15. Next step

### V0–V7, H4, H5, U1, U2, D-U2.5, U3-a, U3-b and U3-c are ACCEPTED. **Phase 2 is CLOSED — §16.** **U3's boundary is APPROVED (§21); U3-d is the next permitted action; U3-e, U3-f, U4 and U5 are NOT authorised.** V4b-eval, V2-PDF, P3, H1, H2, H3, H6, H7 and H8 have not started.

| | |
|---|---|
| **V3 — multimodal and structural intake** | **ACCEPTED / COMPLETE**, 2026-08-23, including the §5.9 corrections. Zero new dependencies |
| **V4a — AI broker and live-path foundation** | **ACCEPTED / COMPLETE**, 2026-08-23 — §6. Discharges **D6** items 4, 9 and 10. Zero new dependencies. **Accepted for the foundation, not for extraction quality** — §6.0 |
| **V4b-core — AI evidence extraction** | **ACCEPTED / COMPLETE**, 2026-08-23 — §7, reviewed in §7.10. Discharges the approved V4b-core scope; needed no credential. **Accepted for mechanics and governance, explicitly not model quality** — §7.8 |
| **V5 — evidence to structured requirement proposals** | **ACCEPTED / COMPLETE**, 2026-08-23 — §8, reviewed in §8.11. Decisions **J1–J9**, plan of record [phase-2-plan.md](phase-2-plan.md) §3.10. **Accepted for mechanics and governance, explicitly not semantic correctness** — §8.9. Verified `EvidenceItem`s become structured requirement **proposals** with retained provenance, never approved requirements. **J2** (conflicts stay V6), **J3-a** (coverage pulled into V5) and **J6** (`L1-REQ-*`) **re-cut approved artefacts** and need explicit approval; **J9** retains rejected proposals in full per [ADR-0032](../adr/ADR-0032-retain-everything.md). **Must not begin without approval** |
| **V7 — the human requirements workspace and G1** | **ACCEPTED / COMPLETE**, 2026-08-24 — §10, reviewed in §10.10. Decisions **U1–U10**, plan of record §3.12. **G1 is reachable end to end.** Two review rounds, eight defects found and fixed. **Accepted for mechanics and governance, explicitly not model quality** — §10.7 |
| **H4 — project-scoped requirement identity** | **ACCEPTED / COMPLETE**, 2026-08-24 — §5.13, reviewed independently and corrected at `5a5504b`. **Limitation 77 CLOSED**: two projects in one database each reach G1, each from `REQ-0001`. Decisions **K1–K6** and **K8**; **K7 refused** and recorded as limitation **79** / **H6**. Accepted for **mechanics and governance, explicitly not semantic quality** — §5.13.1 |
| **H5 — durable identity generation** | **ACCEPTED / COMPLETE**, 2026-08-24 — §5.14, reviewed independently with mutation testing. **Limitation 78 CLOSED**: identifiers survive a restart and multiple instances, and **durable multi-project G1 works across an application restart**. Decisions **M1–M9**. Accepted for **mechanics and governance, explicitly not semantic quality and explicitly not structural uniqueness in the generator** — §5.14.1 |
| **H6 / H7 / H8 — recorded, not started** | Limitations **79**, **80**, **81**. The `503` flattening; `order by at, id` mis-ordering past 9 999; ordering inferred from the identifier. All three were found during H4 and H5 analysis, numbered deliberately, and excluded from both boundaries by decision. **None blocks Phase 2 closure** — none is on the path to G1 |
| **V4b-eval — real-provider evaluation** | **Deferred**, and blocked by **H3**. Requires an approved credential, E1-permitted material and prompt/response retention; it is the first point at which model quality can be claimed |
| **H1 / H2 — provenance hardening** | **Proposed, not approved** — §5.12. Acceptance of V3 was deliberately not held on either |
| **V2-PDF — PDF intake** | **BLOCKED** on a representative Arabic PDF corpus, spike S2, and [ADR-0037](../adr/ADR-0037-binary-document-extraction.md) approval |
| **V4 — AI analysis passes** | **Provisional**, not approved. It now also carries the **D6** deferrals: broker-consumer wiring, recorded fixtures, interaction persistence |

`@embedpdf/pdfium` is still not installed, and `pdf-engine-not-approved` still fails the build on any
PDF engine import — so the V2-PDF block remains mechanical rather than remembered.

| **U1 — `apps/web` and the source viewer** | **ACCEPTED / COMPLETE**, 2026-08-25 — §18. Boundary **W1–W13**; [ADR-0039](../adr/ADR-0039-react-presentation-layer.md) recorded before any UI code. Two follow-ups: **F-U1-a DISCHARGED** by ADR-0040, **F-U1-b STANDING**. Accepted for **mechanics, governance and RTL/LTR correctness, explicitly not visual or UX design** |
| **U2 — sources: intake, inventory, authority, L0 validation** | **ACCEPTED / COMPLETE**, 2026-08-25 — §19, after an independent review. **The first slice that writes.** Boundary **X1–X10**; [ADR-0040](../adr/ADR-0040-browser-testing-pinned-browser.md) recorded before implementation. Three defects found and corrected (§19.1); follow-ups **F-U2-a** and **F-U2-b** recorded (§19.3). Accepted for **mechanics, governance and the journey, explicitly not visual or UX design** |
| **D-U2.5 — the design foundation, demonstrated on U1 and U2** | **ACCEPTED / COMPLETE**, 2026-08-25 — §20.7, after a visual review. **Presentation-only: no capability.** Boundary **Y1–Y28** with the **Y12** clarification. Eight defects found across two review passes; the ten U2 browser tests passed **unchanged** throughout. **The accepted design system is the baseline for every later UI slice** — §20.8 |
| **U3 — the requirements workspace** | **BOUNDARY APPROVED 2026-08-26** — §21, [u3-proposal.md](u3-proposal.md), **Z1–Z14**. **U3-a, U3-b and U3-c ACCEPTED** (§21.1, §21.5, §21.7); **U3-d is next**; U3-e–U3-f not authorised. **F-U2-b is DISCHARGED** — the design foundation was accepted as D-U2.5 on 2026-08-25. **Z2-B**: no AI-invoking control in `apps/web`. **Z5**: **G-a and G-e deliberately unfilled**, so flags and version history are out. **Z6-B**: limitation 70 **stays open** |
| **U4 / U5 — coverage, reconciliation and G1 in the browser** | **NOT AUTHORISED.** W13 approved U1→U5 as a **sequence**, which is not authorisation. U4 needs API gap **G-a**, U5 needs **G-b**; both are approved and unbuilt, and **U3 fills neither** |
| **V6 — conflicts, precedence and reconciliation** | **ACCEPTED / COMPLETE**, 2026-08-23 — §9, reviewed in §9.10. Decisions **Q1–Q9**; `L1-CONF-*` and slot-scoped comparison approved at acceptance. **Accepted for mechanics and governance, explicitly not semantic correctness** — §9.8 |

**V0–V7, H4 and H5 are ACCEPTED. The approved Phase 2 exit condition — *"Phase 2 ends when G1 can be
reached"* — is SATISFIED, together with K8's binding clarification that durable multi-project G1 must
survive an application restart. Both are proved by executing tests, not by assertion.**

**PHASE 2 IS CLOSED — ACCEPTED 2026-08-24. The closure record is §16.**

**What Phase 2 completion would NOT claim, stated here because it is the easiest thing to lose:
NO LIVE MODEL HAS EVER BEEN CALLED.** Not once, in any slice. Every evaluation number is a
**synthetic corpus against an authored stub** — `eval:baseline` is *"not usable for a routing
decision"*, `eval:frame` reports **slot accuracy 45%** and **semantic faithfulness NOT MEASURED**,
`eval:reconcile` reports recall **50%**. Vision accuracy is unmeasured. **Phase 2 claims mechanics
and governance, and makes no claim whatever about real model or AI quality.**

**V4b-eval and V2-PDF are not approved. P3 has not started and its boundary is not proposed. No live
provider call is permitted while limitation 62 / H3 stands.**
