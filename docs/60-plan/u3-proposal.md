# U3 — Requirements Workspace · ✅ BOUNDARY APPROVED · NOT YET IMPLEMENTED

> **Status: BOUNDARY APPROVED 2026-08-26. Z1–Z14 approved, with two amendments recorded below.**
> **NOT IMPLEMENTED.** Approval of a boundary is not approval of an implementation: **U3-a only**
> begins, and each later step is reported and reviewed before the next starts (§11 of
> [CLAUDE.md](../../CLAUDE.md)).
>
> **The approved dispositions:**
>
> | # | Disposition |
> |---|---|
> | **Z1** | **APPROVED** — purpose and the reviewer journey (§1) |
> | **Z2** | **APPROVED: Z2-B.** U3 includes **human evidence recording**. It exposes **no `populate-frame` control and no other AI-invoking control**, and the structural guarantee that **`apps/web` contains no AI-invoking control** is preserved and tested |
> | **Z3** | **APPROVED** — screens and per-screen actions, **unit-level evidence citation only** |
> | **Z4** | **APPROVED** — the API surface, all of it pre-existing |
> | **Z5** | **APPROVED** — **G-a is not filled** (flags are therefore not shown at all) and **G-e is not filled** |
> | **Z6** | **APPROVED: Z6-B.** The edit-rate observation is reported **with its caveat**, and is **not** a quality metric and **not** a reviewer-attention metric. **Limitation 70 remains OPEN** |
> | **Z6-a** | **APPROVED, with an explicit qualification:** requiring the detail pane to have been rendered before a decision is a **structural/friction safeguard only**. It **must not be described as evidence that meaningful human review occurred**, and it **does not close limitation 70** |
> | **Z7** | **APPROVED** — the six must-get-right behaviours |
> | **Z8-a** | **APPROVED** — requirement statuses **extend** the existing `lifecycle` family. No new family, no new colour token, no new shape |
> | **Z8-b** | **APPROVED: Z8-b-1.** Plain URL/`history` synchronisation. **No router dependency** |
> | **Z9** | **APPROVED** — Ask ASDP stays inert; `Selection` gains a `requirement` scope; the zero-request test is **extended to S5** |
> | **Z10** | **APPROVED** — the out-of-scope table |
> | **Z11** | **APPROVED** — the test matrix |
> | **Z12** | **APPROVED with an amendment to criterion 5** — see below |
> | **Z13** | **APPROVED** — the six-step slice shape |
> | **Z14** | **APPROVED** — no new ADR, subject to the three qualifications in §13 |
>
> **Amendment 1 — acceptance criterion 5, reconciled with Z5.** As proposed, criterion 5 said the
> previous version *"remains legible"*. **G-e is deliberately unfilled**, so no API returns a
> predecessor version and that claim could not be met. Criterion 5 now reads as §11 states it, and
> the body of this document was adjusted at approval — §3.1, §6.2 and §10 — so that **nothing here
> implies U3 provides historical-version retrieval.** The amendment is recorded rather than applied
> silently, because a criterion quietly weakened is worse than one openly narrowed.
>
> **Amendment 2 — the Z6-a qualification** is part of the approval, not a gloss on it, and is
> repeated wherever Z6-a is relied on (§5.1).
>
> **The §15.3 repository findings are RECORDED, NOT SCHEDULED.** None is to be fixed
> opportunistically inside U3. If one becomes strictly required by an approved acceptance criterion,
> **stop and report before expanding scope.**
>
> **Version:** 1.0 · **Written and approved:** 2026-08-26 · **Against commit:** `ad363a6`
> **Within:** the approved UI enablement boundary —
> [ui-enablement-proposal.md](ui-enablement-proposal.md) §15.1, slice **U3**
> **Follows:** **U1 ACCEPTED** ([phase-2-status.md](phase-2-status.md) §18), **U2 ACCEPTED** (§19),
> **D-U2.5 ACCEPTED** (§20.7)
> **Inherits without re-litigating:** the accepted design baseline — [phase-2-status.md](phase-2-status.md) §20.8
> **Related:** [ADR-0039](../adr/ADR-0039-react-presentation-layer.md),
> [ADR-0040](../adr/ADR-0040-browser-testing-pinned-browser.md),
> [ADR-0007](../adr/ADR-0007-epistemic-ladder.md),
> [ADR-0008](../adr/ADR-0008-resolvable-anchors.md),
> [ADR-0015](../adr/ADR-0015-read-only-viewers.md),
> [ADR-0017](../adr/ADR-0017-approval-as-baseline-signature.md),
> [ADR-0032](../adr/ADR-0032-retain-everything.md),
> [ADR-0038](../adr/ADR-0038-target-versus-content-verification.md)

---

## 0. Read this before anything else — the finding that shapes the slice

**A locally-running ASDP cannot produce a single requirement today.**

[`apps/api/src/http/app.module.ts`](../../apps/api/src/http/app.module.ts) is explicit: *"The default
REFUSES: the application ships unable to reach a provider."* `main.ts` wires only `config`,
`database`, `blobStore`, `clock` and `ids`, so every AI port falls through to its refusing default:

| Port | Default | Consequence |
|---|---|---|
| `SOURCE_PROFILER` | `unavailableSourceProfiler()` | `POST sources/:s/profile` refuses |
| `EVIDENCE_EXTRACTOR` | `unavailableEvidenceExtractor()` | `POST sources/:s/extract-evidence` refuses |
| `FRAME_POPULATOR` | `unavailableFramePopulator()` | `POST populate-frame` proposes nothing |
| `CANONICALISER` · `RECONCILER` | refusing | `POST reconcile` refuses |

`unavailableFramePopulator` returns `refusalKind: 'unavailable'`, degradation
`no_provider_configured`, and the honest sentence *"This is a configuration gap, not a statement that
the evidence supports nothing."*

**This is correct behaviour, not a defect** — it is decision **A7** and the **H3** block working as
designed. But it means a U3 scoped only as *"review the requirements the AI proposed"* would ship a
screen that is permanently empty in every environment this project can legally run.

Three facts make a fully model-free journey possible, and each was verified against the code:

1. **`POST /projects/:p/evidence` (`recordEvidence`) is human, not AI.** Given a `sourceUnitId` it
   inherits the unit's anchor, verifies it (ADR-0038) and stores an `EvidenceItem`. The U1 viewer
   already lists units, so *"select a unit → cite it as evidence"* is a one-click action over data
   already on screen.
2. **`POST /populate-frame` creates the `RequirementSet` even when the populator refuses.**
   `createSet` runs unconditionally in the final transaction. It requires at least one *eligible*
   (resolving) evidence item, then produces an empty `draft` set with the refusal recorded.
3. **`POST /requirements/inferred` (`addInferredRequirement`) is human-authored L3** — *"Human-originated
   L3 (U8-a). There is no AI route to this."* It needs a `requirementSetId`, a `rafSlot`, a category
   and a mandatory `inferenceRationale`.

So the chain **source → human evidence → empty set → human requirement → review → revise → confirm**
is complete, deterministic, and touches no provider.

---

## 1. Purpose and the reviewer journey — **Z1** ✅ APPROVED

> **Before U3:** requirements exist as an API. No human has ever seen one rendered.
> **After U3:** a reviewer reads a proposal beside the evidence it rests on, and records a decision
> about it — one requirement at a time.

U3 is the first slice where **a person decides something**. U1 read. U2 wrote evidence *inputs*. U3
writes **judgements**, and each one is attributable, versioned, and capable of reopening G1.

| # | Step | Route | Screen |
|---|---|---|---|
| 1 | Sign in, pick a project, open a source | — | S1/S2/S4 *(U1)* |
| 2 | Read the document, select a unit, **cite it as evidence** | `POST …/evidence` | S4 *(extended)* |
| 3 | See the evidence inventory for the project | `GET …/evidence` | S5 |
| 4 | **Open the requirements workspace** | `GET …/requirements` | **S5 (new)** |
| 5 | Read a requirement with its epistemic level, derivation, computed confidence band, degradations and provenance | *(same read)* | S5 inspector |
| 6 | Click an evidence chip → **the source scrolls to the anchored region** | `GET …/sources/:s/highlights?evidenceId=` | S5 evidence pane |
| 7 | **Decide:** accept · reject · defer · send for clarification | `POST …/requirements/:r/review` | S5 |
| 8 | **Revise** — a new version with a mandatory change reason | `POST …/requirements/:r/revise` | S5 |
| 9 | **Add a human-inferred requirement**, with its mandatory rationale | `POST …/requirements/inferred` | S5 |
| 10 | **Confirm a LOW-confidence inference** | `POST …/requirements/:r/confirm-inference` | S5 |
| 11 | See that a revision **reopened G1**, stated rather than discovered | `GET …/gates` | Status strip |

Step 11 matters more than it looks. `mutate()` in `apps/api/src/commands/review.ts` reconciles G1
inside **every** workspace mutation. A reviewer who revises an approved requirement silently
invalidates an approval. **Y11** already requires that reopening be legible rather than surprising;
U3 is where that becomes real.

---

## 2. How a requirement reaches the screen — **Z2** ✅ APPROVED AS **Z2-B**

**Approved: Z2-B.** U3 includes human evidence recording. It does **not** expose `populate-frame`,
and it exposes **no other AI-invoking control**. The `RequirementSet` is created out of band and the
step stays documented in the fresh-session handoff.

The reason is not squeamishness about a button. It is that *"the UI contains no control that can
reach a provider"* is a **property a test can prove and a reviewer can trust**, and the alternative
traded that property for the removal of a single documented command. H3 is unresolved; a control
whose only current behaviour is a refusal becomes a live call by configuration change alone.

The two rejected options are kept on the record so the choice stays legible:

| | Option | Disposition |
|---|---|---|
| **Z2-A** | Expose population as a labelled operator action reporting its refusal | **NOT APPROVED.** It puts one control in the UI that becomes a live provider call the moment a provider is wired |
| **Z2-B** | Human evidence recording; **no AI-invoking control at all** | ✅ **APPROVED** |
| **Z2-C** | Review-only; no evidence recording either | **NOT APPROVED.** The screen would be unreachable without a developer |

> **Fixed under this approval:** U3 exposes **no** `profile`, **no** `extract-evidence`, **no**
> `populate-frame` and **no** `reconcile` control, and a structural test asserts their absence from
> `apps/web` (§10).

---

## 3. Screens and the actions on each — **Z3** ✅ APPROVED

### 3.1 S5 — Requirements workspace *(new)*

The **Y11** three-pane composition, inherited as approved: list (main) → detail (inspector) → **the
U1 viewer as the evidence pane**.

| Pane | Contents | Actions |
|---|---|---|
| **List** | `REQ-####`, text, category, RAF slot, epistemic level, derivation, confidence **band** (never a bare number), version, status, `generatedBy`, degradation count | Select one row. **No select-all. No multi-select. No bulk action of any kind** |
| **Detail (inspector)** | The fixed **Y6** section order: identity → provenance → confidence → actions → history. Provenance shows `aiInteractionId`, `promptVersion`, `providerId`, `modelId`, `framePass`, `degradations[]` | Accept · Reject · Defer · Send for clarification · Revise · Confirm inference |
| **Evidence pane** | The U1 viewer, scrolled to the anchor, using **server-computed** offsets | Click a chip to move the anchor. **Read-only** (ADR-0015) |

**The "history" section is the current row's own fields, and nothing more** — `version`,
`supersedesId`, `changeReason`, and `originalAiText` where it differs from `text`. **G-e is
unfilled**, so no predecessor version can be retrieved or displayed: the section states *that* a
predecessor exists and names it, and says plainly that U3 does not retrieve it.

Three states the list must render distinctly, because the API distinguishes them:

- **`status`** — the seven `RequirementStatus` values. **`approved` is never reachable from this
  screen**; the API has no route to it and U3 must not imply one.
- **`derivation`** — `extracted` / `interpreted` / `inferred`. An `inferred` requirement shows its
  `inferenceRationale` **always**, not behind a disclosure.
- **`humanConfirmationRequired`** — computed at write time and, until now, consumed by nothing. U3 is
  the first reader.

### 3.2 S4 — Source viewer *(extended)*

| Action | Route | Note |
|---|---|---|
| **Cite this unit as evidence** | `POST …/evidence` `{ sourceId, sourceUnitId }` | The anchor is inherited from the unit and re-verified server-side. A `broken` or `drifted` anchor is **refused by the API** and the refusal is rendered verbatim |
| **Narrow to a character range** | `{ charStart, charEnd }` | **OUT of U3** — §6. Offsets are code points over NFC text, and a UI that mints them from a DOM selection is the highest-risk thing in this slice |

### 3.3 S5 — Evidence inventory *(new, small)*

`GET …/evidence` — id, source, anchor precision, verification state, classification, language. It
exists so a reviewer can see what a requirement *could* cite before revising it.

### 3.4 Navigation

`apps/web/src/app/routes.ts` gains `'requirements'` in `IMPLEMENTED_WORKSPACES`, and
`apps/web/src/design/nav.ts` flips that entry from `future(…, 'U3', …)` to `available`. The existing
bidirectional `navDrift()` test then enforces the pair; that mechanism needs no change.

---

## 4. APIs used — **Z4** ✅ APPROVED

**Every route below already exists.** U3 adds no backend capability.

| Purpose | Route | Method | Roles required |
|---|---|---|---|
| Requirement list + evidence links | `/projects/:p/requirements?setId=` | `GET` | Viewer, Contributor, BA, PA, ComplianceReviewer, PlatformAdmin |
| Record evidence | `/projects/:p/evidence` | `POST` | **BusinessAnalyst, ProcessArchitect** |
| Evidence list / one item | `/projects/:p/evidence[/:id]` | `GET` | *(authenticated; no role check — §15.3 finding 2)* |
| Review a requirement | `…/requirements/:r/review` | `POST` | BA, PA |
| Revise | `…/requirements/:r/revise` | `POST` | BA, PA |
| Add human-inferred | `…/requirements/inferred` | `POST` | BA, PA |
| Confirm inference | `…/requirements/:r/confirm-inference` | `POST` | BA, PA |
| Highlights for an evidence item | `…/sources/:s/highlights?evidenceId=` | `GET` | *(U1, unchanged)* |
| AI interaction disclosure log | `…/ai-interactions` | `GET` | Viewer + |
| Gate state, to show a reopen | `/projects/:p/gates` | `GET` | *(authenticated)* |

**Deliberately not consumed by U3:** `populate-frame`, `sources/:s/profile`,
`sources/:s/extract-evidence`, `reconcile`, `reconciliation`, `frame-coverage`, `g1/readiness`,
`g1/validate`, `g1/approve`, `questions/*`, `conflicts/:c/decide`, `canonical-entities/:e/verdict`,
`policy-acknowledgements`, `baselines`, `gates/:g/evaluate|approve`, `requirement-flags/:f/resolve`.

### 4.1 API gaps — **Z5** ✅ APPROVED: **G-a and G-e are NOT filled by U3**

| # | Gap | Disposition |
|---|---|---|
| **G-a** | **`single_source` and `content_unverified_evidence` flags are returned by no endpoint.** `frame-coverage` returns `ambiguities`, filtered to five of the seven `RequirementFlagKind` values | **NOT FILLED — and therefore flags are not shown at all** (§9). Showing five of seven kinds would hide the **ADR-0038** flag, which is the one most worth surfacing. **G-a belongs to U4** |
| **G-e** *(identified during this proposal)* | **There is no route to a requirement's version history.** Predecessors are copied to `requirement_version`; `listForSet` reads only current rows | **NOT FILLED.** The current row carries `version`, `supersedesId`, `changeReason` and `originalAiText`, which is enough to say *that* an edit happened and *what the model originally said*. **U3 therefore provides no historical-version retrieval, and no acceptance criterion claims otherwise** |
| **G-b, G-c, G-d** | Reconciliation entities · the RBAC registry · `maxSourceBytes` | **Not needed.** G-b is U5; G-c stays deferred under the existing bidirectional drift test; G-d was recommended against in U2 and nothing has changed |

---

## 5. Limitation 70 and R-V7-1 — approval theatre — **Z6** ✅ APPROVED AS **Z6-B**

> *"Nothing measures whether a reviewer reviewed."* — limitation 70. **It remains OPEN, and U3 does
> not close it.**

### 5.1 The structural mitigations, preserved and strengthened

**Not new scope.** Properties the slice must have, each testable.

| Mitigation | Status in U3 |
|---|---|
| **No bulk-approve path anywhere** | **Preserved absolutely.** No select-all, no multi-select, no *"accept all visible"*, no keyboard shortcut acting on more than the focused row. **Y18** already forbids it, and D-U2.5's `DataTable` has no selection model to widen |
| **A decision is one explicit act on one requirement** | Each action posts one requirement id. There is no batching layer, and none may be added |
| **Confidence and its inputs are on every row** | `confidenceBand` with `confidenceFunctionVersion` and `degradations[]`, never a bare percentage — **Y21** |
| **The epistemic level is permanent, not a review state** | L2 stays L2 after `accept`. `accept` moves `status` to `in_review`, and the UI says *"ready to be approved"*, never *"approved"* |
| **`approved` is unreachable** | The API has no route to it; U3 renders the state and offers no control that could produce it |
| **A revision reopens G1, visibly** | Surfaced from `GET /gates` after every mutation, using the existing `gate:reopened` semantic state |

**Z6-a — approved, with its qualification.** The workspace contains **no control and no keyboard path
that records a decision on a requirement whose detail pane has not been rendered**. No decision from
a list row alone.

> **The qualification is part of the decision, not a caveat on it.** Z6-a is a **structural/friction
> safeguard only**. It makes a decision harder to record without the evidence on screen. It is **not
> evidence that meaningful human review occurred**, it must never be described as such anywhere in
> this repository or in the product, and **it does not close limitation 70.**

### 5.2 The two countable signals — **Z6-B approved**

§16 of [v7-proposal.md](v7-proposal.md) offered two; [phase-2-status.md](phase-2-status.md) §12
records that **neither is computed**.

| Signal | Computable in U3? | Disposition |
|---|---|---|
| **Proposals edited before approval** | **Yes**, from data U3 already reads: `version > 1` with `generatedBy: 'human'` over the set `GET /requirements` returns. No new endpoint, no new domain logic | ✅ **REPORTED, with its caveat** |
| **Conflicts overturned by a human** | **No.** It needs `chose_alternative` / `not_a_conflict` verdicts, which are **U5** and gated on **G-b** | **Out of U3 by construction. Remains unmeasured** |

The edit-rate observation renders as a plain observed count beside the approval-state counts — e.g.
*"12 requirements · 9 accepted · 1 edited before acceptance"* — **with an explicit on-screen note
that it is an observation and not a quality measure.** **Y8** requires *"no count without its
undecided partner"* and §4 of the design foundation forbids vanity metrics: *"an approval rate of
100% with an edit rate of 0% is a finding, not a success."*

**What this is not, stated so it cannot drift:** it is **not** a quality metric, **not** a
reviewer-attention metric, and **not** a measure of whether review happened. It closes **no part of
limitation 70**, which stays open with **both** halves outstanding — the conflicts-overturned half
until U5, and the underlying question permanently, because nothing counts consideration.

**Z6-C — a reviewer-attention measure** (dwell time, evidence-opened-before-decision) was **NOT
APPROVED**. It is telemetry about people, it is unapproved scope, and V7's own §16 already declined
it: *"V7 claims no human-factors metric it cannot support."*

---

## 6. What U3 must get right — **Z7** ✅ APPROVED

Six behaviours where a plausible-looking UI would be wrong.

1. **`accept` is not `approve`.** `review.ts` is explicit: accepting means *"I have read this and it
   is ready to be approved"*. A button labelled **Approve** on this screen would be a lie about the
   epistemic ladder, and the word must not appear on any control in S5.
2. **A revision is a new version, never an edit.** The form is *"Revise"*, and the change reason is
   **mandatory** because governance §2.3 requires it. The UI states that the predecessor version was
   **recorded and retained server-side**, and names it by `supersedesId` — **without claiming to
   display it, because G-e is unfilled and U3 retrieves no historical version.**
3. **A revision may not sever provenance.** Evidence links inherit unless narrowed; a version citing
   nothing is refused (invariant D2) — except for an `inferred` requirement. The UI renders that
   refusal from the server and must not pre-validate it in the browser.
4. **`originalAiText` is the model's wording and must stay legible after any amount of editing.**
   Where it differs from `text`, both are shown, labelled. It is on the current row, so this needs no
   history endpoint.
5. **An unresolvable anchor is a hard error, never a soft highlight.** ADR-0008 and **Y20**,
   inherited from U1 unchanged. `resolution: 'broken'` renders as broken in place;
   `content_unverified` renders as *unverified*, **never** as *resolved* (ADR-0038).
6. **A human-inferred requirement is not a shortcut.** **R-V7-3** names L3 as a back door. The
   rationale field is mandatory, the epistemic badge is L3 and stays L3, and the form must not sit
   next to *"Accept"* as though the two were peers.

**And one thing U3 must not do:** mint character offsets from a browser text selection.
`recordEvidence` accepts `charStart`/`charEnd`, but code-point offsets over NFC logical-order text
derived from a bidirectional DOM selection are precisely the class of bug ADR-0039 §5 and the
`presentation-no-text-research` checker rule exist to prevent. **Unit-level citation only in U3.**

---

## 7. Design inheritance — **Z8** ✅ APPROVED

**U3 redecides nothing in [phase-2-status.md](phase-2-status.md) §20.8.** It inherits the tokens, the
component inventory, the contrast method, the responsive collapse order, the RTL rules, the
accessibility rules and the visual direction as the accepted baseline. What follows is only what U3
adds *within* that baseline.

| Baseline element | What U3 adds | A change to the baseline? |
|---|---|---|
| **Semantic vocabulary** (`semantics.ts`) | The `lifecycle` family holds **source** states only. The seven `RequirementStatus` values are absent. U3 adds them **inside the existing family**, with the three mandatory channels | **No — extension, not redefinition.** **Z8-a approved:** no new family, no new colour token, no new shape |
| **Epistemic badges** | Already complete: L1–L4 exist. U3 is their first real consumer | No |
| **Confidence** | D-U2.5 deviation 8 records *"confidence is not shown anywhere"* because U1/U2 had none. **U3 is the first slice with a value behind it** — rendered as a band with its function version, per **Y21** | No — it fills a recorded gap |
| **Inspector** | D-U2.5 limitation: *"the fixed section order is proved on a source; requirements have no inspector because they have no screen."* U3 proves the same order on a requirement | No — it discharges a recorded limitation |
| **Deep links (Y5)** | D-U2.5 deviation 9: *"No deep links. It needs a router, which is a dependency decision."* | **Z8-b-1 approved:** plain `URLSearchParams` + `history.pushState`. **No dependency** |
| **Y11 three-pane composition** | Implemented as approved | No |

### 7.1 A consequence of Z8-a, recorded rather than discovered

`superseded` already exists in the `lifecycle` family with source-specific screen-reader text
(*"superseded by a later source"*). `RequirementStatus` also contains `superseded`, so the two share
one entry. Under Z8-a the entry is **generalised in wording** so it is true of both, and the badge's
`subject` names which record it describes. **No glyph, shape or tone changes**, and the state stays
one state.

Nothing in the API sets a requirement to `superseded` today — `reviseRequirement` returns the new
version to `in_review`, and predecessors move to `requirement_version` rather than being marked. The
mapping exists because the drift guard requires **every** `RequirementStatus` to be renderable, not
because the state is reachable.

---

## 8. Ask ASDP — unchanged, and re-proved — **Z9** ✅ APPROVED

**The constraint is preserved exactly.** Ask ASDP stays an inert shell: no `fetch`, no client, no
handler that could reach one, every control disabled, **no stub answer**, and `availability()` remains
a constant returning a single-member union.

U3 changes exactly one thing about it, and it is not a capability:

- **`Selection` gains a requirement scope.** `ContextScope` becomes
  `'none' | 'project' | 'source' | 'requirement'`, so the dock states *"Answers would be scoped to
  REQ-0007 in project dev"* rather than falling back to the project. **This is context binding, which
  Y22 already requires; it is not an answer.**

**The zero-request test is extended, not reused.** `d-u2_5-design.spec.ts` proves zero requests from
the **Sources** screen. U3 adds an equivalent assertion **on the requirements workspace with a
requirement selected** — the screen where the two `deterministic` future actions (*Show supporting
evidence*, *Why is G1 blocked?*) are most tempting to wire up. Both stay disabled and labelled.

---

## 9. Explicitly out of scope — **Z10** ✅ APPROVED

| Out of scope | Belongs to | Enforced by |
|---|---|---|
| **U4 — frame coverage, the 27 RAF slots, the eight G1 preconditions, questions, flags** | **U4**, needs **G-a** | No `frame-coverage`, `g1/readiness` or `questions/*` call in `apps/web` |
| **U5 — reconciliation, conflicts, precedence, equivalence confirmation** | **U5**, needs **G-b** | No `reconciliation`, `conflicts/*` or `canonical-entities/*` call |
| **G1 approval, validation runs, baseline freeze** | **U5** | No `g1/approve`, `g1/validate` or `baselines` call. The API has no route from S5 to `approved` |
| **H3 — AI prompt/response retention** | **Unresolved, limitation 62** | Not touched. No migration, no schema change |
| **Any live AI or provider call, from anywhere** | **Blocked** | **Z2-B:** `apps/web` holds no AI-invoking control, and a structural test asserts it |
| **P3 — Specification Studio, BPS/DecisionSpec/FormSpec** | **P3**, no approved boundary | Rail entries stay `future` |
| **`profile`, `extract-evidence`, `populate-frame`, `reconcile` controls** | AI-invoking | Absent from the client |
| **Character-range evidence citation** | A later decision | Unit-level only (§6) |
| **Requirement version-history retrieval or viewer** | Not scheduled — **G-e**, deliberately unfilled | Current row's `version` / `supersedesId` / `changeReason` / `originalAiText` only |
| **Flag display and flag resolution** | **U4** | Showing five of seven kinds would hide the ADR-0038 flag. Better absent than partial |
| **Bulk anything** | **Never** — limitation 70's only structural mitigation | No selection model exists to extend |
| **Full Arabic UI localisation** | **P12** | Unchanged: English chrome, bilingual content |
| **V2-PDF, V4b-eval** | Blocked | Untouched |

---

## 10. Required tests — **Z11** ✅ APPROVED

| Layer | Coverage |
|---|---|
| **Unit** (`apps/web/src/web.test.ts`, `apps/web/src/design/design.test.ts`) | The review-action state machine (idle → sending → applied / refused) for all four actions · the revise form's mandatory-change-reason rule as a **form** rule, not a domain rule · the inferred-requirement form's mandatory rationale · `text` vs `originalAiText` difference detection · confidence-band formatting that **cannot** emit a bare percentage · the edit-rate count and its caveat *(Z6-B)* · requirement-status → semantic-state mapping, including an **unrecognised** status falling through to `unknownState` rather than a benign default · URL parse/serialise round-trip *(Z8-b-1)* |
| **Drift** | Extend the existing bidirectional guards: every `RequirementStatus` in `@asdp/schemas` has a `semantics.ts` entry **and** every requirement status the UI declares is a real `RequirementStatus` · every U3 command named by the UI exists in `COMMANDS` with matching `requiredRoles` · `navDrift()` stays empty with `requirements` now available |
| **Integration** *(no browser)* | The typed client against **recorded fixtures** for each U3 route, validated with `@asdp/schemas`: a requirement with degradations · an `inferred` requirement with its rationale · a version-2 requirement whose `originalAiText` differs from its `text` · a `403` from `reviewRequirement` for a `Viewer` · a `409` concurrency outcome · the evidence-refusal path for a broken anchor |
| **Architecture** | The four ADR-0039 rules keep passing with **no new exemption**. `presentation-no-domain-rules` must still bite, and the self-test cases stay unchanged |
| **Structural absence** *(new, in the U2-a / assistant tradition)* | No module under `apps/web/src` references `populate-frame`, `extract-evidence`, `profile` or `reconcile` — the **Z2-B** guarantee proved by inspection, not by comment |
| **Browser / E2E** (`apps/web/e2e/u3-requirements.spec.ts`) | 1. Cite a unit as evidence and see it in the inventory · 2. Open the workspace and see a requirement with level, band and provenance · 3. Click an evidence chip → the viewer scrolls to the **anchored region**, highlight intact · 4. Accept → status becomes `in_review`, **and the word "approved" appears nowhere** · 5. Revise → version 2 with its change reason, the predecessor **named** by `supersedesId`, `originalAiText` still shown, **and G1 shown as reopened** · 6. **There is no select-all and no bulk control** — asserted by absence over the whole workspace · 7. A `Viewer` sees every decision control disabled with the missing role named, **and the API returns 403 when called directly** · 8. An Arabic requirement renders RTL with its identifier still LTR · 9. Every action keyboard-reachable; outcomes announced through a live region · 10. **Ask ASDP makes zero requests from the requirements workspace with a requirement selected**, and offers no simulated answer |
| **Regression bar** | **The ten U2 browser tests and all D-U2.5 browser tests must pass unchanged.** No assertion weakened. That was D-U2.5's bar and it stays the bar |
| **Accessibility** | Automated axe pass on S5 in both directions and both themes; manual keyboard traversal of the full journey |

**A7 holds unchanged: no test may make a live provider call.**

---

## 11. Acceptance criteria — **Z12** ✅ APPROVED, criterion 5 amended

| # | Criterion |
|---|---|
| **1** | A reviewer can open a requirement in a browser and read its **text, category, RAF slot, epistemic level, derivation, computed confidence band with its function version, `generatedBy`, and every recorded degradation** |
| **2** | Clicking an evidence chip opens the **U1 viewer at the anchored region**, correct in both reading directions, with the highlight server-computed |
| **3** | A **broken** anchor renders as broken, in place, with its reason — and never as a highlight |
| **4** | All four review actions work and are attributable; **`accept` renders as `in_review`**, and the word *approved* appears on no control in the workspace |
| **5** | **(AMENDED)** A revision creates **version 2** with a **mandatory change reason**; the current requirement **identifies its version and its predecessor** (`version`, `supersedesId`), and **`originalAiText` remains visible where applicable**. **U3 does not provide a complete version-history viewer**, and retrieves no predecessor version — **G-e is deliberately unfilled** |
| **6** | **A revision that invalidates an approval shows G1 as reopened**, stated on screen rather than discovered later |
| **7** | A human-inferred requirement can be added with its **mandatory rationale**, is badged **L3**, and can be **explicitly confirmed** |
| **8** | A unit can be **cited as evidence** from the viewer; a refused anchor renders **the server's reason**, verbatim |
| **9** | **There is no bulk-approve path, no select-all and no multi-select anywhere** — proved by a browser test asserting absence |
| **10** | A `Viewer` sees every decision control disabled with the missing role named, **and the API returns 403 when invoked directly** |
| **11** | **Ask ASDP remains inert on the new screen**: zero requests with a requirement selected, no stub answer, every control disabled |
| **12** | **`apps/web` contains no AI-invoking control** — proved structurally (**Z2-B**) |
| **13** | An Arabic requirement and a mixed Arabic/English one render correctly; identifiers stay LTR |
| **14** | Every action is keyboard-reachable; outcomes are announced through a live region |
| **15** | **No business rule is duplicated in the browser** — asserted by the checker, no new exemption |
| **16** | `npm run verify` green end to end, exit 0, **backend test counts unchanged**; `npm run test:e2e` green with the existing **31 tests passing unchanged** |
| **17** | **No dependency added** |

---

## 12. Slice shape — **Z13** ✅ APPROVED

**Each step is reported and reviewed before the next begins. A green run is not acceptance.**

| Step | Delivers | Why separable |
|---|---|---|
| **U3-a** | `semantics.ts` requirement statuses + the bidirectional drift test | A vocabulary change to an accepted file. Merging it into a feature commit would bury it — U2-a's lesson |
| **U3-b** | Evidence: cite-a-unit from the viewer, plus the evidence inventory | Small, and it makes everything after it reachable |
| **U3-c** | S5 read-only: list, detail inspector, evidence pane wired to the U1 viewer | The largest piece, reviewable before anything writes |
| **U3-d** | The four review actions and `confirm-inference`, with the G1-reopen surface | The first decisions |
| **U3-e** | Revise, and the human-inferred requirement form | The two that create versions |
| **U3-f** | URL sync (**Z8-b-1**) and the edit-rate observation (**Z6-B**) | Both approved; both independent of the journey above |

---

## 13. Is an ADR required? — **Z14** ✅ APPROVED: no new ADR

On the same ground as U2: [ADR-0039](../adr/ADR-0039-react-presentation-layer.md) governs the
presentation layer, and U3 adds no new architectural relationship — same package, same import rules,
same authorisation posture, no new backend surface, no weakened checker rule.

Three qualifications, recorded:

- **Z8-b-2 (a router) was not approved**, so no dependency decision arises. If one is ever proposed
  it is a material **A4** decision and needs its own ADR, as React did.
- **Z2-A was not approved**, so the UI acquires no control capable of reaching a provider. Had it
  been, that would have needed a named standing follow-up at minimum.
- **Z6-B changes nothing architectural.** Counting rows the screen already holds is presentation, not
  a domain rule.

---

## 14. Blockers and assumptions

### 14.1 Blockers

**None blocks the approved boundary.** One shapes it decisively:

- **No AI provider is wired in any runnable configuration**, by design (§0). Under **Z2-B** this is
  not a blocker — it is the reason the slice is scoped around the human path.
- **H3 / limitation 62 remains unresolved.** No live provider call is permitted from anywhere. U3
  makes none.
- **G-a is unbuilt**, which is why §9 excludes flags rather than showing five of seven kinds.

### 14.2 Assumptions, now settled by approval

1. That **U3 may include human evidence recording** (`POST /evidence`). U2 §2.2 deferred *"evidence
   extraction"* to *"U3+"* while describing it as AI-invoking; `recordEvidence` is **not**
   AI-invoking and was never explicitly assigned. **Settled by Z2-B.**
2. That extending `semantics.ts` with requirement statuses is inheritance, not redecision. **Settled
   by Z8-a**, with the `superseded` consequence recorded in §7.1.
3. That a `RequirementSet` created by a refused population pass — an empty `draft` set — is an
   acceptable starting state. It is what the code produces, and the screen will legitimately show
   *"0 requirements"* until one is added by hand.

---

## 15. Repository findings — **RECORDED, NOT SCHEDULED**

Found while preparing this boundary, against commit `ad363a6`. **None is U3 work.** None is to be
fixed opportunistically inside U3, and if one unexpectedly becomes strictly required by an approved
acceptance criterion, **work stops and the conflict is reported before scope expands.**

| # | Finding | Assessment |
|---|---|---|
| **1** | **Seven unused imports in `apps/api/src/http/review.controller.ts`** — `acknowledgePolicySlot`, `answerQuestion`, `approveG1`, `confirmEquivalence`, `decideConflict`, `g1Readiness`, `generateQuestions` are imported and never referenced. They survive because `noUnusedLocals` is set nowhere; `tsconfig.base.json` sets `strict: true` only. Almost certainly residue from the controller split that file's own header describes | Cosmetic, zero functional impact. **Hygiene, not a U3 concern** |
| **2** | **`GET /projects/:p/evidence` and `GET …/evidence/:id` have no `assertRole` call** — they read straight from the repository behind `ActorGuard` alone. `GET :projectId/gates`, `…/audit` and `…/baselines` are the same | Consistent with `listRequirements` being `Viewer`-readable, so probably intended — **but unstated**, while reads elsewhere go through a `COMMANDS` descriptor. Worth a deliberate answer before U4 adds more reads |
| **3** | **`GET /projects/:p/audit` is unbounded and unpaginated** — the full audit list for a project, no filter, no limit | Fine at today's volumes. It will not stay fine |
| **4** | **`listForSet` orders by `order by id asc` on a `text` column**, so `REQ-10000` sorts before `REQ-9999` — the **same class as limitations 80 / 81 (H7 / H8)**, which name the audit, baseline, approval and validation-run reads but **not** this one | Latent; no project approaches 10 000 requirements. **U3 must not "fix" it client-side** — reordering in the browser would be a business rule in the browser. A candidate addition to limitation 80's scope |
| **5** | **A numbering inconsistency in the parent boundary.** [ui-enablement-proposal.md](ui-enablement-proposal.md) §5 says AI-invoking routes are *"proposed as operator actions on S3 behind an explicit confirmation — **W6**"*, but §0's decision table assigns **W6** to *"RTL and bilingual behaviour"*. No approved decision covers operator actions | Directly relevant: **Z2-A had no prior approval to lean on**, which is part of why Z2-B was taken |
| **6** | **§0.0's *"HEAD at handoff `e9ad1b2`"* is one commit behind actual HEAD `ad363a6`** — because `ad363a6` is the commit that added §0.0 | Self-referential and benign |

---

## 16. Status

**BOUNDARY APPROVED 2026-08-26. NOT IMPLEMENTED.**

1. **Z1–Z14 are approved**, with Z2-B, Z6-B, Z8-a, Z8-b-1, the **Z6-a qualification** and the
   **criterion 5 amendment**.
2. **U3-a only begins.** It is completed, verified and **reported for review**; **U3-b does not follow
   automatically**.
3. **U4 and U5 remain unauthorised**, and neither **G-a** nor **G-b** is built by U3.
4. **H3 and live AI remain blocked.** U3 invokes no model, by scope and by structure.
5. **V4b-eval, V2-PDF and P3 remain unauthorised.** P3's boundary is neither proposed nor approved.
6. **Limitation 70 remains OPEN.** Nothing in U3 closes it.
