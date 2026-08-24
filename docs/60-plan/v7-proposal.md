# V7 — The Human Requirements Workspace and G1 · APPROVED BOUNDARY

> **Status: ✅ APPROVED 2026-08-23 — decisions U1–U10 all approved.** The boundary below is binding;
> the plan of record is [phase-2-plan.md](phase-2-plan.md) **§3.12**.
>
> **Two of the ten were already implemented and needed only to be used.** `transcript` is an existing
> `SourceKind`, so **U7** adds no kind; and `approveGate` in `@asdp/domain` already enforces
> `allowSelfApproval: false` by excluding content authors, so **U10** is wiring rather than building.
> **Version:** 1.0 · **Written:** 2026-08-23 · **Approved:** 2026-08-23
> **Related:** [phase-2-plan.md](phase-2-plan.md) §3.7, [v5-proposal.md](v5-proposal.md),
> [v6-proposal.md](v6-proposal.md), [phase-2-status.md](phase-2-status.md) §0,
> [governance-and-gates.md](../50-governance/governance-and-gates.md) §1–§3,
> [ADR-0017](../adr/ADR-0017-approval-as-baseline-signature.md),
> [ADR-0016](../adr/ADR-0016-immutable-content-addressed-artifacts.md),
> [ADR-0007](../adr/ADR-0007-epistemic-ladder.md),
> [ADR-0004](../adr/ADR-0004-ai-proposes-code-commits.md),
> [ADR-0012](../adr/ADR-0012-deterministic-conflict-precedence.md),
> [ADR-0011](../adr/ADR-0011-computed-confidence.md),
> [ADR-0015](../adr/ADR-0015-read-only-viewers.md),
> [ADR-0032](../adr/ADR-0032-retain-everything.md),
> [epistemic-model.md](../20-domain/epistemic-model.md) §1–§2,
> [domain-model.md](../20-domain/domain-model.md) §3–§4,
> [traceability-model.md](../20-domain/traceability-model.md),
> [requirement-analysis-frame.md](../20-domain/requirement-analysis-frame.md) §3

---

## 0. The principle

> **AI proposes. Deterministic logic validates. Humans review, clarify, decide conflicts and approve
> requirements. G1 is a signed baseline decision, not an AI action.**

V5 and V6 built everything **up to** the human. V7 is the human. It is the first slice whose primary
output is produced by a person rather than by a model, and the first that can move anything to **L4**
— which [epistemic-model.md](../20-domain/epistemic-model.md) §2 rule 1 says *"is ALWAYS an explicit
human act, recorded with actor, timestamp, and baseline"*.

**Phase 2 ends when G1 can be reached.** That is the measure this whole proposal is written against.

---

## 1. Purpose — what V7 adds

Today the system holds `draft` requirement proposals citing verified evidence, rule-raised quality
flags, undecided conflict candidates with precedence recommendations, and unconfirmed canonical
merges. **Nothing can be approved, and nothing can be resolved.** Every one of those is a record
waiting for a person who has no way to act.

```
draft proposals + flags + undecided conflicts + unconfirmed merges
  → REVIEW            a human reads, edits, accepts, rejects
    → CLARIFY         open questions asked and answered; answers become evidence
      → DECIDE        conflicts resolved; equivalences confirmed
        → APPROVE     requirements to L4
          → G1        a signature over (baselineHash, validationRunId)
```

**The machinery already exists and is unused.** `Baseline`, `BaselineMember`, `Approval`,
`freezeBaseline`, `evaluateGate` and `approveGate` all landed in **V0** with real SQL constraints and
optimistic concurrency. V7 does not build the gate — **it makes G1's preconditions computable and
gives the human the surface to satisfy them.**

---

## 2. The human requirements workspace

| The reviewer can see | The reviewer can do |
|---|---|
| Every proposal with its RAF slot, computed confidence, epistemic level and derivation | **Accept**, **revise**, **reject**, or **send for clarification** |
| The evidence behind it — verbatim text, anchor, source, and the anchor's live resolution state | Follow the citation to the source viewer (read-only, ADR-0015) |
| Rule-raised flags: vague quantifier, actor unknown, untestable, single-source, visual-only | **Resolve** a flag with a stated resolution, or fix the requirement so it stops applying |
| Conflict candidates, their classification, their explanation, and the **precedence recommendation with its rationale** | **Decide** the conflict — accept, reject as a false positive, or choose a resolution — with a rationale |
| Unconfirmed canonical merges and what they would absorb | **Confirm** or **reject** the equivalence |
| Frame coverage: which required slots are `empty`, `weak` or `blocked_by_policy` | **Acknowledge** a policy-blocked slot; open a question against a gap |
| The G1 readiness panel: every precondition, met or not, each naming the rule that says so | **Request G1**, then **approve** or **reject** as an approver |

**Read-only where the product says read-only.** Generated artifacts do not exist yet, and V7 adds no
editor for any of them ([ADR-0015](../adr/ADR-0015-read-only-viewers.md), ADR-0003).

---

## 3. Requirement states and the transitions V7 permits

The domain model's enum, unchanged: `draft` · `needs_clarification` · `in_review` · `approved` ·
`rejected` · `superseded` · `deferred`.

```
draft ──▶ in_review ──▶ approved (L4)      approval is a human act, at G1
  │           │
  │           ├──▶ needs_clarification ──▶ in_review     an answered question returns it
  │           └──▶ rejected                               retained, never deleted
  └──▶ deferred                                           out of this baseline, not out of the record
approved ──▶ superseded          when a new version is approved
approved ──▶ stale               automatically, when a supporting source is superseded
```

**Two rules carried straight from [epistemic-model.md](../20-domain/epistemic-model.md) §2:**

- **Rule 1 — no AI-originated command may create or set L4.** V7 keeps that true by making approval
  reachable only through the gate command, under an approver role.
- **Rule 6 — a human edit does not itself promote.** *"Editing produces an edited proposal; approval
  is a separate act."* This prevents "I fixed the wording" from being mistaken for "I verified the
  substance", and it is the reason §4 looks the way it does.

**Proposed (U1):** `approved` is writable **only** by the G1 approval transaction, never by an edit,
an accept, or a status route — enforced in SQL as the V5 `draft`-only constraint was, by replacing it
with one that permits the wider set but still refuses `approved` outside the gate path.

---

## 4. The human editing model — **U2**, and it needs your decision

V5's requirements are **insert-only** ([ADR-0016](../adr/ADR-0016-immutable-content-addressed-artifacts.md),
J4), and `originalAiText` exists precisely so an edit is legible. Two coherent models:

| Option | Consequence |
|---|---|
| **U2-a (recommended)** — an edit creates a **new immutable version** of the requirement: same `REQ-####`, new `version`, `supersedesId` / `supersededById` chained, mandatory `changeReason` | Matches ADR-0016, the domain model's existing `version`/`supersedesId`/`changeReason` fields, and §2.3 of governance ("editing an approved upstream entity creates a new entity version with a mandatory change reason"). `originalAiText` stays on version 1 forever, so "what did the model actually say?" is answerable after any amount of editing |
| **U2-b** — edit `text` in place, retaining `originalAiText` | Simpler, and **wrong at the first amendment after approval**: a baseline freezes member *versions*, so an in-place edit would silently change what a signed hash covered. It also cannot answer "what did the reviewer change, and why?" |

**U2-b is not merely inferior — it breaks ADR-0017.** A baseline signature is over content; content
that can change under it is not a baseline. Recommending **U2-a**.

**Identifier discipline (D15) is unaffected:** `REQ-0007` stays `REQ-0007` across versions. The
version is what changes, and the pair `(id, version)` is what a baseline member names.

---

## 5. Conflict decisions

The `Conflict` entity already carries `decision`, `decidedBy`, `decidedAt`, `proposedResolution` and
`precedenceRationale`. V6 wrote the first two of those as **always null** and refused them in SQL.
V7 opens exactly that door, and no other.

| Human action | Records |
|---|---|
| **Accept the recommendation** | `decision: 'accepted_recommendation'`, the recommended requirement id, decider, timestamp, rationale |
| **Choose the other participant** | `decision: 'chose_alternative'` — permitted, and **the rationale becomes mandatory**, because overriding a computed precedence is the case a future reader will most want explained |
| **Reject as a false positive** | `decision: 'not_a_conflict'` with a rationale. The candidate stays in the record ([ADR-0032](../adr/ADR-0032-retain-everything.md)); the classification becomes a labelled datum the V6 evaluation can consume |
| **Resolve by revising** | Edit one or both requirements (§4), which creates new versions and **reopens the conflict against them** |

**Proposed (U3):** deciding a conflict never mutates a requirement. A decision records *which
proposition the business chose*; changing the text is an edit, and an edit is a new version. Keeping
these separate is what stops "resolve" from silently becoming "rewrite".

**The false-positive path feeds V6's weakest metric.** Every `not_a_conflict` decision is a
human label on a candidate the detector raised — exactly the ground truth the false-conflict rate
needs, and it accrues from ordinary use rather than from a labelling exercise.

---

## 6. Entity equivalence confirmation

V6 writes AI-proposed canonical entities with `confirmed_by` / `confirmed_at` refused on insert.

| Human action | Effect |
|---|---|
| **Confirm** | `confirmedBy` / `confirmedAt` set. The merge becomes usable for reasoning; `mergedFromIds` still names what it absorbed, so it stays reversible |
| **Reject** | The proposed entity is marked rejected and retained. The absorbed entities were never removed, so nothing needs restoring — which is the whole point of V6's **Q3** shape |
| **Split a confirmed merge** | Recorded as a new decision reversing the earlier one. Never a deletion |

**Proposed (U4):** confirming an equivalence may **raise `crossSourceAgreement` to `corroborated`**
in the reconciliation view — the state V6 deliberately left unreachable. That is the missing half of
**Q6**: V6 could not claim corroboration because equivalence was AI-proposed and therefore
provisional; once a human confirms it, the provisional qualifier is discharged. **Still computed on
read** — no V5 row is mutated, ever.

---

## 7. Clarification questions — `SYNTHESISE_QUESTIONS`

The task is already in the vocabulary with no implementation. All four structural inputs now exist:

| Input | Source |
|---|---|
| **Ambiguities** | `RequirementFlag` records of the five ambiguity kinds — V5 |
| **Missing information** | `empty` / `weak` / `blocked_by_policy` slots from `computeFrameCoverage` — V5 |
| **Conflicts** | Undecided `Conflict` candidates — V6 |
| **Source-declared undecided issues** | Evidence a source itself marks open — needs an observation pass; see **U5** |

**The split V7 must keep:** the *question set* is **derived deterministically** from those four
inputs — a model that forgot a gap could otherwise hide it, which is the whole reason ADR-0010 owns
the frame in code. The *wording* of a question may be AI-proposed, because a well-phrased question
gets a better answer. **Code decides what is asked about; AI may help with how it is asked.**

**Proposed (U6):** an `OpenQuestion` may be created **only** where a deterministic input exists, and
every question stores the id of the flag, slot or conflict that caused it. A question with no cause
is refused.

---

## 8. Open questions

The domain model's entity: `{ rafSlot, question, whyItMatters, blocking, proposedAnswer,
affectedRequirementIds[], answer, answeredBy, answeredAt, becameSourceUnitId? }`.

| Concern | Position |
|---|---|
| **Creation** | Derived from a cause (**U6**); wording may be AI-proposed; `whyItMatters` states the cause in business terms |
| **Assignment** | **Proposed: none in V7.** A question is visible to anyone who may answer it. Assignment is workflow tooling, and adding it here starts a task-management product |
| **Blocking** | **Deterministic, not chosen:** a question is blocking when its cause blocks G1 — an empty *required* slot, a blocking flag, an unresolved conflict. Everything else is non-blocking |
| **Answer** | Recorded with actor and timestamp |
| **Evidence attachment** | **`becameSourceUnitId`** — the domain model's own mechanism. An answered question becomes a `SourceUnit` in an interview transcript, *"so a requirement derived from a human answer has provenance exactly as strong as one derived from a document"* |
| **Resolution** | Answering does not itself change a requirement. It supplies evidence; a human then revises or approves — §4, and epistemic rule 6 again |

**U7:** the interview-transcript source is a **new `Source` of kind `interview`**, ingested through
the existing V1 text path so its units are anchored and its evidence is verifiable like any other. No
new provenance mechanism, and no exception to ADR-0008.

---

## 9. L3 inferred requirements — **U8**, and this is the significant one

V5 refused L3 outright (**J1**), and the stated reason was precise: *"its only correct disposition —
explicit human confirmation — does not exist until V7."* **V7 is that slice.**

And G1's criteria already assume L3 exists: *"every LOW-confidence inferred requirement explicitly
confirmed"* is one of the preconditions in
[governance-and-gates.md](../50-governance/governance-and-gates.md) §1. A precondition about a thing
the system cannot represent is unreachable in the wrong way.

| Option | Consequence |
|---|---|
| **U8-a (recommended)** — V7 permits L3, **human-originated only**: a reviewer may add a requirement the evidence does not state, and must supply an `inferenceRationale` | The confirmation path exists, D2's rationale requirement is honoured, G1's precondition becomes meaningful, and **no AI-authored L3 is admitted** — the model still cannot fill a gap with a plausible default |
| **U8-b** — V7 also permits **AI-proposed** L3 with a rationale, requiring confirmation | Closer to the letter of the epistemic model, and it reopens exactly the failure J1 closed: a fluent, unfounded proposition that reads like a finding. The confirmation step is real, but reviewers confirm plausible text at scale |
| **U8-c** — L3 stays refused | Simplest, and it leaves a G1 precondition permanently vacuous while forcing genuine business assumptions to be recorded as something they are not |

Recommending **U8-a**. If approved, then: `inferenceRationale` **mandatory** (D2) · `derivation:
'inferred'` permitted for `generatedBy: 'human'` only · confidence computed with the existing
`inferred` extraction weight, so an L3 lands materially lower · **a LOW-confidence L3 requires
explicit confirmation before G1**, exactly as the gate says · and `L4-*` already forbids unconfirmed
inference on an executable path downstream.

---

## 10. G1 — making the existing criteria computable

The eight preconditions, and where each already comes from:

| # | Precondition | Source in V7 |
|---|---|---|
| 1 | **0 blocking flags** | `RequirementFlag` where `severity = 'blocking'` and unresolved — V5's records, V7's resolution path |
| 2 | **0 unresolved conflicts** | `Conflict` where `decision is null` — V6's records, V7's decision path |
| 3 | **0 unanswered blocking questions** | `OpenQuestion` where `blocking` and `answer is null` — new in V7 |
| 4 | **All requirements at L4** | Every requirement in the set `approved`, or explicitly `deferred` / `rejected` |
| 5 | **All required RAF slots non-`empty`** | `computeFrameCoverage().g1Blockers` — **V5's arithmetic, unchanged and imported** |
| 6 | **Every LOW-confidence inferred requirement explicitly confirmed** | **U8** |
| 7 | **All `blocked_by_policy` slots acknowledged** | `computeFrameCoverage().blockedByPolicy` + a new acknowledgement record |
| 8 | **L0 clean** | `evaluateL0Ingestion` — V1, unchanged |

**Proposed (U9):** each precondition is a **rule with a stable ID** in a new `L4-REQ-*` family, so it
appears in the validation report, can be cited in a ticket, and renders in the reviewer's language —
which §1 of governance requires of *"every blocking precondition"*. **L4** is the correct layer here
and not a stretch: its scope is *"Traceability, completeness and specification integrity"* at G2–G4,
and these are completeness checks over an approved set. **This namespace needs approval**, on the
same footing as J6 and Q8 before it.

---

## 11. Baseline and signature — ADR-0017, unchanged

```
freeze     → Baseline over (requirementId, version) members, contentHash = canonical hash
validate   → ValidationRun over the frozen set; its id is what the signature binds
approve    → Approval { gate: 'G1', baselineId, signedBaselineHash, validationRunId,
                        approver, roleAtApproval, decision, comment, at }
```

**No new mechanism.** `Baseline`, `BaselineMember`, `Approval`, `freezeBaseline` and `approveGate`
exist from V0 with SQL constraints and optimistic concurrency; V7 supplies the members and the
preconditions. If either the hash or the validation run changes, **the gate reopens automatically** —
that is ADR-0017's whole point and it needs no code here beyond using it correctly.

**Read-locks (§2.2 of governance):** V7 must establish that nothing downstream can be entered without
an approved requirement baseline. Nothing downstream exists yet, so this is a **guard to write now
and a property to keep**, not a feature.

---

## 12. Segregation of duties

Gate policy is **configuration, not code** (ADR-0017), and it already defaults correctly:
`G1.requiredRoles: [BusinessApprover]`, `allowSelfApproval: false`.

| Act | Roles |
|---|---|
| Author / revise a requirement | `BusinessAnalyst`, `ProcessArchitect` |
| Resolve a flag, answer a question | `BusinessAnalyst`, `ProcessArchitect` |
| **Decide a conflict** | `BusinessAnalyst`, `ProcessArchitect` — an analysis act, recorded with the decider |
| **Confirm an equivalence** | `BusinessAnalyst`, `ProcessArchitect` |
| **Request G1** | `BusinessAnalyst` |
| **Approve G1** | **`BusinessApprover`** — and **self-approval stays off**, so the person who authored cannot be the person who approves |
| Read everything | `Viewer`, `ComplianceReviewer`, and the rest |

**U10:** self-approval remains **off by default** and is not made configurable-per-project in V7.
Making it switchable is a governance decision, not a workspace feature.

---

## 13. Traceability, unchanged and extended

Every approved requirement must still trace:

```
Requirement (id, version) → RequirementEvidenceLink → EvidenceItem → verified anchor → Source
```

**A human revision must not sever provenance.** Proposed: a new version **inherits** its predecessor's
evidence links, and the reviewer may add or remove links explicitly — but **a version with zero links
cannot be saved**, exactly as V5's D2 gate refuses one. An answered question adds a link to the
interview `SourceUnit` (**U7**), so a human-answered requirement is anchored like any other.

**Human-authored L3 (U8-a) is the one exception, and it is a stated one:** it has an
`inferenceRationale` instead of evidence, which is why D2 names the two alternatives and why L3 sits
below L2 in precedence.

---

## 14. AI's role in V7

| AI may | AI must never |
|---|---|
| Explain a conflict or a flag in business terms | **Approve** anything |
| **Suggest** a revision, which a human accepts or edits | **Resolve** a conflict |
| **Word** a clarification question whose cause code determined | **Decide** what is asked about |
| Summarise a requirement set for a reviewer | **Confirm** an equivalence or an L3 |
| | **Sign** G1, or alter a baseline |

**Structurally, not by policy:** `packages/ai` cannot import a domain write path
([module-map.md](../10-architecture/module-map.md) §3), and every approval route will be role-gated
and human-attributed.

---

## 15. Validation

**New:** `L4-REQ-*` — the eight G1 preconditions (**U9**), each with a stable ID, both catalogue
languages, positive and negative fixtures.

**Extended:** `L1-REQ-*` gains rules for the new states — an approved requirement must cite evidence
or carry an inference rationale; a superseded requirement must name its successor; a version chain
must not fork.

**Unchanged:** `L0-ING-*`, and `L1-CONF-*` — whose `L1-CONF-005` was already corrected during V6
acceptance so it stops firing once a human decides.

---

## 16. Evaluation

V7 is the first slice whose subject is **a workflow**, so the evaluation shape changes.

**Deterministic, and measurable offline:** every G1 precondition computes correctly on a fixture set
(complete, and each one short by exactly one thing) · a baseline hash is stable and reproducible · a
changed hash or validation run **reopens** the gate · state transitions refuse every illegal move ·
a revision preserves provenance · self-approval is refused.

**Human-workflow, and honestly measurable only in part:** time-to-first-approval and
questions-per-project are usage telemetry, not quality. **Proposed: V7 claims no human-factors
metric it cannot support**, and reports instead the two things that matter and are countable —
**how many conflicts a human overturned** (V6's false-conflict ground truth) and **how many AI
proposals were edited before approval** (a real signal about V5's output quality, available for the
first time).

**No live provider call** while H3 stands. `SYNTHESISE_QUESTIONS` wording is replay-only, and the
deterministic question *set* needs no provider at all.

---

## 17. UI and API scope — the minimum for Phase 2

**In:** requirement list and detail with evidence · flag resolution · conflict decision · equivalence
confirmation · question list, answer, and transcript ingestion · coverage and G1 readiness panel ·
freeze, validate, request, approve, reject.

**Out — and this is the line that keeps V7 from becoming P3:** no BPS editor · no DecisionSpec,
FormSpec or ServiceInterface authoring · no Process IR · no BPMN/DMN/form generation or viewer
framework · no Domain Model Registry · no graphical anything. **If a screen would still make sense
after generation exists, it is probably P3's.**

---

## 18. Out of scope

BPS · DecisionSpec · FormSpec · ServiceInterface · Process IR · BPMN/DMN/Form generation · the viewer
framework · the P3 Specification Studio and Domain Model Registry · **V4b-eval** · live provider work
until **H3** is resolved · **V2-PDF** · spreadsheets · **H1**, **H2**, **H3**.

---

## 19. Material decisions requiring approval

| # | Decision | Recommendation |
|---|---|---|
| **U1** | `approved` writable **only** by the G1 approval transaction, enforced in SQL | **Approve.** The V5 `draft`-only pattern, moved to where it now belongs |
| **U2** | Editing model: **new immutable version** versus in-place edit | **U2-a — new version.** U2-b breaks ADR-0017: a signature over content that can change is not a signature |
| **U3** | Deciding a conflict never mutates a requirement | **Approve.** It stops "resolve" silently becoming "rewrite" |
| **U4** | A **human-confirmed** equivalence may raise `crossSourceAgreement` to `corroborated`, still computed on read | **Approve.** The missing half of Q6: confirmation discharges the provisional qualifier |
| **U5** | Whether **source-declared undecided issues** are observed in V7 or deferred | **Defer to a later slice**, and say so: it needs an evidence-observation pass, and three of the four question inputs are enough to make G1 reachable |
| **U6** | An `OpenQuestion` requires a **deterministic cause**; AI may word it, never choose it | **Approve.** ADR-0010's principle applied to questions |
| **U7** | An answered question becomes a `SourceUnit` in an **interview `Source`**, ingested through the V1 text path | **Approve.** The domain model's own mechanism; no new provenance path |
| **U8** | **L3 inferred requirements** | **U8-a — human-originated only.** It makes G1's own precondition meaningful without reopening what J1 closed |
| **U9** | `L4-REQ-*` as the G1 precondition rule namespace | **Approve** — but it is a **permanent ID namespace**, so it needs saying out loud, as J6 and Q8 did |
| **U10** | Self-approval stays **off**, not per-project configurable | **Approve** |

**ADR implications.** On this reading **no new ADR is required**: U1, U8 and U10 implement ADR-0007,
ADR-0017 and the epistemic model as written; U2-a implements ADR-0016; U4 completes Q6 within its own
terms. **Three things would need one, and all three are refused:** an AI-signed approval; an approval
that survives a content change; and an in-place edit of an approved requirement.

**U2, U5, U8 and U9 are re-cuts or additions** to approved artefacts and need explicit approval even
though none is an ADR.

---

## 20. Acceptance criteria — all tied to G1 reachability

| # | Criterion | Demonstrated by |
|---|---|---|
| 1 | A fixture project can be taken **from draft proposals to an approved G1 baseline** end to end | One end-to-end test, and it is the criterion that matters |
| 2 | **Each of the eight G1 preconditions blocks independently** — eight fixtures, each short by exactly one thing | A test per precondition, each naming its `L4-REQ` rule |
| 3 | **`approved` is unreachable outside the gate transaction**, proved against the database | SQL constraint test, in the V5/V6 style |
| 4 | An edit creates a **new version** with a mandatory change reason; the predecessor and `originalAiText` survive | Version-chain tests |
| 5 | **A revision never severs provenance** — a version with zero evidence links and no inference rationale cannot be saved | Test per case |
| 6 | Changing the baseline hash **or** the validation run **reopens** G1 automatically | Two tests, one per input (ADR-0017) |
| 7 | **Self-approval is refused** | Test |
| 8 | A conflict decision records decider, timestamp and rationale, and **overriding precedence requires one** | Tests |
| 9 | A confirmed equivalence raises corroboration **only** after confirmation, and still **computes on read** | Test asserting no V5 row changed |
| 10 | An answered question becomes an anchored `SourceUnit`, and a requirement citing it resolves | End-to-end test |
| 11 | **Human-originated L3 requires a rationale**, and a LOW-confidence L3 blocks G1 until confirmed | Tests |
| 12 | `computeFrameCoverage`, `slotStatus` and `RafGroup` **unchanged** — proved by diff, as V5 and V6 were | Byte-identical `packages/raf` |
| 13 | **CI makes no live call**; verification complete, nothing skipped or loosened | `npm run verify` |

---

## 21. Dependencies

**None new.** Runtime dependencies stay at **seven**.

| Need | Met by |
|---|---|
| Baselines, approvals, gates, optimistic concurrency | **V0** — built, constrained, and unused since |
| Requirement proposals, flags, coverage arithmetic | **V5**, accepted |
| Conflict candidates, precedence, canonical entities | **V6**, accepted |
| Anchored interview transcripts | **V1** text intake, unchanged |
| Validation engine and catalogue | `@asdp/validation` |
| Replay fixtures, corpora, metrics | `@asdp/eval` |

**No credential, no corpus, no Docker.** **H3 still blocks every live provider call**, so V7's one AI
touchpoint — question *wording* — is replay-only, and the deterministic question set needs no
provider at all.

---

## 22. Risks

**R-V7-1 — approval theatre.** A reviewer facing forty plausible proposals approves them in a batch,
and the epistemic ladder becomes a formality. *Mitigations:* show computed confidence and flags on
every row; require an explicit act per requirement rather than a select-all; surface *what changed*
since the last review; and measure the edit rate, because an approval rate of 100% with an edit rate
of 0% is a finding about the workspace, not about the requirements.

**R-V7-2 — the workspace becoming the product.** Assignment, notifications, comment threads and
dashboards are all one step away, and none of them is Phase 2. *Mitigation:* §17's line — if a screen
would still make sense after generation exists, it is P3's.

**R-V7-3 — L3 as a back door (U8).** Even human-originated, an inferred requirement is one a document
does not support. *Mitigations:* mandatory rationale; lower computed confidence by construction;
explicit confirmation for LOW-confidence ones at G1; and `L4-*` already blocks unconfirmed inference
on an executable path downstream.

**R-V7-4 — questions that nobody can answer.** A generated question set that is long, generic or
duplicative is abandoned exactly as a noisy conflict queue would be. *Mitigations:* every question
needs a deterministic cause (**U6**); blocking is derived rather than asserted; and a question whose
cause is resolved closes itself.

**R-V7-5 — a signature over a moving target.** The one failure ADR-0017 exists to prevent.
*Mitigation:* bind the signature to `(baselineHash, validationRunId)` and test both reopening paths —
criterion 6 is not optional.

---

## 23. Status

**✅ APPROVED 2026-08-23. Decisions U1–U10 all approved**, with the approver's conditions carried into
the plan of record ([phase-2-plan.md](phase-2-plan.md) §3.12):

1. **Approval and L4 only through G1** (**U1**), enforced in SQL.
2. **Human edits create immutable new versions** (**U2-a**) — an in-place edit would break ADR-0017.
3. **A conflict decision never rewrites a requirement** (**U3**).
4. **Human-confirmed equivalence may enable corroboration, computed on read** (**U4**).
5. **Source-declared undecided-issue detection stays deferred** (**U5**).
6. **A clarification question requires a deterministic cause; AI may only word it** (**U6**).
7. **An answered question becomes an interview `SourceUnit`** through the existing intake and
   provenance path (**U7**).
8. **L3 only when human-originated, with a mandatory inference rationale** (**U8-a**).
9. **`L4-REQ-*`** for the G1 readiness rules (**U9**).
10. **Self-approval stays disabled** (**U10**).

**ADRs required: none. Dependencies added: none** — seven, unchanged. **H3 remains unresolved: V7 is
replay-only and makes no live provider call.**
