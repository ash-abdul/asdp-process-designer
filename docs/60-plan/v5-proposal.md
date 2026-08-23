# V5 — Structured Requirement Proposals from Verified Evidence · ACCEPTED

> **Status: ✅ APPROVED, IMPLEMENTED and ACCEPTED 2026-08-23** — decisions **J1–J9** all approved.
> Delivered state: [phase-2-status.md](phase-2-status.md) **§8**; the acceptance review, and the one
> coverage gap it found and closed, are in **§8.11**. The plan of record is
> [phase-2-plan.md](phase-2-plan.md) **§3.10**.
>
> **This header said "PROPOSED — NOT APPROVED" until the acceptance commit**, because the approval
> commit updated §20 and the decision table and missed the header — a documentation defect found in
> the acceptance review and recorded rather than quietly corrected.
> **Version:** 1.0 · **Written:** 2026-08-23 · **Revised:** 2026-08-23 — J6 namespace settled,
> J7 regrouped to six passes, **J9 added** (rejected-proposal retention versus ADR-0032), J3 split
> into J3-a/J3-b, and §6 given a route for propositions that exceed their evidence
> **Related:** [phase-2-plan.md](phase-2-plan.md) §3.7, [phase-2-status.md](phase-2-status.md) §0,
> [v4b-proposal.md](v4b-proposal.md),
> [requirement-analysis-frame.md](../20-domain/requirement-analysis-frame.md),
> [domain-model.md](../20-domain/domain-model.md),
> [epistemic-model.md](../20-domain/epistemic-model.md),
> [provenance-and-anchoring.md](../20-domain/provenance-and-anchoring.md),
> [traceability-model.md](../20-domain/traceability-model.md),
> [governance-and-gates.md](../50-governance/governance-and-gates.md),
> [ai-evaluation-framework.md](../40-quality/ai-evaluation-framework.md),
> [validation-rule-catalog.md](../40-quality/validation-rule-catalog.md),
> [ADR-0004](../adr/ADR-0004-ai-proposes-code-commits.md),
> [ADR-0007](../adr/ADR-0007-epistemic-ladder.md),
> [ADR-0008](../adr/ADR-0008-resolvable-anchors.md),
> [ADR-0010](../adr/ADR-0010-raf-deterministic-schema.md),
> [ADR-0011](../adr/ADR-0011-computed-confidence.md), **A7**, **E1**, **F1–F5**

---

## 0. What the repository already says about V5, V6 and V7

Read first, because three parts of this proposal are constrained by it and one commonly-expected
inclusion is **assigned elsewhere**.

[phase-2-plan.md](phase-2-plan.md) §3.7 — **provisional**, capability names only:

| Slice | Capability |
|---|---|
| **V5** | Structured requirement model and epistemic handling |
| **V6** | **Conflicts, precedence and coverage** |
| **V7** | **Human requirements workspace and G1 approval** |

Three consequences, stated before the scope rather than buried in it:

1. **Human approval and G1 belong to V7.** [governance-and-gates.md](../50-governance/governance-and-gates.md)
   §1 requires, for G1: *all requirements at L4* · 0 blocking flags · 0 unresolved conflicts · 0
   unanswered blocking questions · all required RAF slots non-`empty`. None of that is reachable in
   V5, and V5 must not build part of it.
2. **Conflicts are V6 by the current sequence**, not V5 — see §8, which is a decision for the
   approver rather than a settled fact.
3. **Coverage is V6 by the current sequence**, not V5 — see §J3. This matters: the RAF coverage
   arithmetic already exists in code (`@asdp/raf`), so pulling it into V5 would be easy, which is
   exactly why it needs approving rather than assuming.

The sequence is explicitly **provisional** and its boundaries "may be re-cut". Re-cutting is a
decision, and §16 lists each re-cut this proposal asks for.

---

## 1. Purpose — what V5 adds beyond V4b

After V4b-core the system can state, with a verified anchor, **what a document says**. It cannot
state **what the business requires**. An `EvidenceItem` is a verbatim span with provenance; nothing
turns spans into propositions an analyst can review, count, or find gaps in.

The 27-slot Requirement Analysis Frame exists as a pure contract package — `RAF_SLOTS`,
`REQUIRED_SLOT_KEYS` and deterministic coverage arithmetic in `@asdp/raf` — and **nothing populates
it**. There is no `requirement` table and no `Requirement` schema anywhere in the codebase.

V5 closes exactly that gap:

```
EvidenceItem (L1, verbatim, anchored)
  → POPULATE_FRAME
    → Requirement PROPOSAL (L2, status draft, cites evidence, never approved)
```

**The core principle, restated as a boundary:** evidence is source-grounded information; a
requirement proposition is a *semantic interpretation* of that evidence; an AI proposition is never
automatically approved truth. [ADR-0007](../adr/ADR-0007-epistemic-ladder.md) and
[epistemic-model.md](../20-domain/epistemic-model.md) §2 rule 1 make L4 a human act, enforced by the
dependency rule that `packages/ai` cannot import a domain write path.

**What changes epistemically, and why this slice is harder than V4b.** V4b could verify its own
output completely: a quote either occurs in the source or it does not, and `locateQuote` decides.
V5's output is *not* verbatim, so no mechanical check can confirm that a proposition faithfully
represents the evidence it cites. That gap is the subject of §6, §13 and §18, and it is the single
most important thing about this slice.

---

## 2. Input eligibility — which `EvidenceItem`s may participate

Deterministic, checked at proposal time, never inherited from an earlier check.

| May participate | Must not participate |
|---|---|
| `anchorVerified = true` **and** the anchor **re-resolves as `resolved` now** — not `drifted`, not `broken` ([ADR-0008](../adr/ADR-0008-resolvable-anchors.md)) | Any evidence whose anchor no longer resolves |
| Evidence from any `extractedBy` — `parser`, `human`, or `ai` | Anything that was rejected by the V4b gate: it was never written, so it cannot be cited |
| Evidence whose source belongs to the project being analysed | Evidence from another project |
| Evidence carrying computed confidence where the schema requires it (AI-extracted evidence always does — migration 007) | — |

**Two eligibility rules that need naming because they are easy to get wrong:**

- **Precision is not eligibility, and eligibility is not precision.** A `page`-precision anchor from
  the vision path is eligible; it simply produces a weaker proposal, because anchor precision is a
  `computeConfidence` input. What is *ineligible* is an anchor that does not resolve.
  [provenance-and-anchoring.md](../20-domain/provenance-and-anchoring.md) §5 already distinguishes
  imprecise ("we know roughly where") from ambiguous ("we do not know which"); V4b's gate means no
  ambiguous item exists to cite.
- **`content_unverified` visual evidence stays `content_unverified`.**
  [ADR-0038](../adr/ADR-0038-target-versus-content-verification.md) forbids conflating target
  verification with content verification. A proposal resting only on such evidence is eligible, and
  is flagged, and can never be silently treated as though its content had been verified.

---

## 3. RAF / `POPULATE_FRAME` — the existing specification is authoritative

No replacement model is proposed. V5 uses
[requirement-analysis-frame.md](../20-domain/requirement-analysis-frame.md) v1.1 as written:

- the **27 slots** in nine groups, `RAF_VERSION = 'raf-1.1'`, owned by code ([ADR-0010](../adr/ADR-0010-raf-deterministic-schema.md))
- the **four derived slots** — `missingInformation`, `ambiguities`, `conflicts`, `openQuestions` —
  **computed, never AI-filled** (§3 of that document)
- the **v1.1 disjointness rules** (§4) for the four overlapping pairs
- the **`RafSlotValue` slot record** and its status determination (§5, §5.1)
- **provenance is structural, not a slot** (§6) — there is deliberately no `provenance` slot,
  because a slot could be empty and provenance cannot be

**The division of labour, which is the whole of ADR-0010:** the model proposes *which slot*; code
decides *whether that slot is legal for that item*. A model that forgets to mention a gap cannot
hide it, because the gap is the absence of a slot value — not a statement the model was asked to
make.

---

## 4. Structured propositions — which RAF slots V5 populates

All 27 slots are **legal targets**; V5 adds no slot and excludes none by name. What differs is how a
slot is filled, and three of the four derived slots are not filled by this slice at all.

| RAF slot (existing key) | V5 |
|---|---|
| `businessObjective` · `serviceDescription` · `scopeAndExclusions` · `successMeasures` · `currentStateProcess` | **AI-proposed from cited evidence** |
| `actors` · `responsibilities` | **AI-proposed**, subject to the `actors ↔ responsibilities` disjointness rule |
| `trigger` · `preconditions` · `processSteps` · `alternativePaths` · `outcomes` | **AI-proposed**, subject to the `processSteps ↔ alternativePaths` and `outcomes ↔ outputs` rules |
| `businessRules` · `decisions` | **AI-proposed.** A rule is stated, **not compiled** — no DMN, no expression, no hit policy |
| `inputs` · `outputs` · `dataRequirements` | **AI-proposed** |
| `integrations` · `notifications` | **AI-proposed** as business statements, not interface contracts |
| `slasAndTimers` · `exceptions` · `escalations` | **AI-proposed**, subject to the `exceptions ↔ escalations` rule |
| `nonFunctionalRequirements` · `securityAndPrivacy` | **AI-proposed** |
| `dependencies` · `constraints` | **AI-proposed** |
| `assumptions` | **AI-proposed only where evidence states an assumption** — see §6 |
| **`missingInformation`** (derived) | **Computed** — but only if coverage is in scope (**J3**); otherwise **not produced in V5** |
| **`ambiguities`** (derived) | **Computed** from rule-raised `RequirementFlag`s — §9 |
| **`conflicts`** (derived) | **Not produced in V5** unless **J2** is approved — §8 |
| **`openQuestions`** (derived) | **Not produced in V5** — §9 |

The user-facing list in the request maps onto existing slot keys exactly; where a requested name has
no RAF key it is not invented:

*obligations* → `businessRules` or `responsibilities` by the disjointness rules · *process behavior*
→ `processSteps` + `alternativePaths` · *ambiguities / missing information* → derived slots, not
authored ones.

---

## 5. Traceability

The required chain, from [traceability-model.md](../20-domain/traceability-model.md) and RAF §6, at
three levels — **all three required**:

```
Requirement PROPOSAL
  → evidence[] { evidenceItemId, contribution }     ← requirement level
    → EvidenceItem.anchor (verified, resolvable)    ← evidence level
      → Source (bytes, classification, authority)   ← source level
        [ → slot sourceInventory[] ]                ← slot level, v1.1
```

**A proposal mints no anchor of its own.** It inherits its evidence items' anchors, so there is no
second place for a location claim to be wrong. This is deliberate and it is the main structural
benefit of doing extraction first: V4b already proved the anchors, and V5 cannot weaken them.

**No ungrounded proposition becomes authoritative state.** Domain invariant **D2** — an L1/L2
requirement MUST reference ≥1 `EvidenceItem`; an L3 requirement MUST carry an `inferenceRationale` —
is enforced in V5 by the gate (§13) *and* by SQL, not by convention.

---

## 6. Fact versus inference

| Kind | `derivation` | `epistemicLevel` | How V5 represents it |
|---|---|---|---|
| **Directly supported** — a restatement of one evidence item, meaning unchanged | `extracted` | **L1**-derived, recorded as **L2** proposal | Cites exactly one evidence item |
| **Interpreted** — normalised, classified, or synthesised from several items | `interpreted` | **L2** | Cites every evidence item it rests on |
| **Inferred** — proposed with no direct source (gap-fill, best practice, default) | `inferred` | **L3** | **Proposed: not produced in V5** — decision **J1** |
| **Assumption** | `extracted` / `interpreted` | L2 | `assumptions` slot, **only where evidence states one**. An assumption the model supplies itself is an L3 inference by definition, and is excluded with L3 |
| **Ambiguity** | — | — | A `RequirementFlag`, **rule-raised**, on a proposal that exists. Not a proposal of its own |
| **Missing information** | — | — | The **absence** of proposals in a slot, surfaced by coverage arithmetic. Never a record the model creates |
| **Unsupported claim** | — | — | **Rejected at the gate with a closed reason code, never persisted**, and counted — the V4b posture applied to propositions |

**Where a proposition that exceeds its evidence actually goes.** Excluding L3 must not become a
route to silently discarding what the model noticed, so V5 gives each case a named destination —
none of which is a `Requirement` row:

| Case | Destination |
|---|---|
| The model proposes something with **no cited evidence** | **Rejected** at the gate, reason `no_evidence_cited`, counted, and retained per **J9** |
| The model says it **cannot tell** from the evidence | Its `limitations[]`, recorded on the pass result and the audit event. Not domain state, because it is a statement about the read, not about the business |
| The proposition is grounded but **imprecise, untestable, or actor-less** | A **`RequirementFlag`** on the grounded proposal (`raisedBy: 'rule'`), which RAF §3 aggregates into the `ambiguities` derived slot |
| The **evidence itself states an assumption** | The `assumptions` slot, as an ordinary grounded proposal |
| The model wants to supply an assumption **of its own** | **Refused.** That is L3 by definition, and admitting it here creates a record whose only correct disposition — explicit human confirmation ([epistemic-model.md](../20-domain/epistemic-model.md) §1) — does not exist until V7 |

**The case this table cannot cover** is a proposition that cites real evidence and overstates it.
No destination catches that, because no mechanical check detects it — §18, **R-V5-1**.

**On L3.** [epistemic-model.md](../20-domain/epistemic-model.md) §1 **permits** L3 with an
`inferenceRationale`, so excluding it from V5 is a **slice-scope tightening, not a spec requirement**
— stated plainly so the approver is choosing rather than ratifying. The argument for excluding it:
L3 is where a fluent model is most persuasive and least checkable, the epistemic model already
requires explicit confirmation to promote it, and that confirmation flow is V7. Admitting L3 in V5
would create records whose only correct disposition does not exist yet. It can be added in a later
slice without retracting anything; the reverse is not true.

---

## 7. Confidence and epistemic state

Computed by `computeConfidence` ([ADR-0011](../adr/ADR-0011-computed-confidence.md)), never
provider-reported, stored with its **function version** — the migration-007 pattern, for the same
reason: a score whose function is unknown cannot be compared to another.

**Weakest-link inputs, because a proposal is no stronger than the least of what it rests on:**

| Factor | Value for a proposal |
|---|---|
| `extractionMode` | the proposal's `derivation` |
| `evidenceCount` | number of cited evidence items |
| `sourceAuthorityRank` | the **weakest** contributing source (highest rank number) |
| `anchorPrecision` | the **weakest** cited anchor's precision |
| `crossSourceAgreement` | **`silent`** — nothing has been compared; reconciliation is V6 |
| `providerCapabilityTier`, `degradations` | from the `POPULATE_FRAME` interaction, including `chunked_context` |

Slot-level `confidenceBand` is weakest-link over its items, which the existing `@asdp/raf`
arithmetic already does.

**The AI cannot raise its own output.** Three independent mechanisms, none of them a convention:

1. `packages/ai` cannot import a domain write path — architecture-checker rule, plus the compiler.
2. `status` is **`draft` only**, proposed as a SQL check constraint on insert (**J4**). There is no
   code path to `approved`, `in_review` or `needs_clarification` in V5.
3. `epistemicLevel` and `derivation` are **computed from evidence linkage**, not read from the model's
   output. The `FramePopulation` schema has no field for either (§12).

---

## 8. Conflicts — the one place this proposal disagrees with the stated expectation

**The expectation in the request:** V5 may detect and record potential conflicts; full
`RECONCILE_SOURCES` and precedence resolution remain V6.

**What the repository says:** [phase-2-plan.md](phase-2-plan.md) §3.7 assigns **"Conflicts,
precedence and coverage"** to **V6**. `RECONCILE_SOURCES` exists in the task vocabulary
(`packages/ai/src/tasks.ts`) with no implementation. `Conflict` exists in
[domain-model.md](../20-domain/domain-model.md) with `topic`, `participants[]`, `detectedBy`,
`proposedResolution`, `precedenceRationale`, `decision`, `decidedBy`, `decidedAt`. RAF §3 derives the
`conflicts` slot from **unresolved `Conflict` records**, and G1 requires **0 unresolved conflicts**.

So detection and resolution are not separated by the specifications — they are two ends of one
record, and a `Conflict` with no route to `decision` is a record with no correct disposition, which
is the same objection raised against L3 in §6.

**[ADR-0012](../adr/ADR-0012-deterministic-conflict-precedence.md) checked directly**, because it is
the binding decision here and it is more permissive than the slice plan: *"AI **MAY** detect
contradiction candidates and explain them"*, precedence **MUST** be computed deterministically from
authority rank → effective date → specificity → epistemic level, *"a **human MUST decide** every
conflict"*, and unresolved conflicts **MUST** block G1. So AI detection in V5 would **not** violate
ADR-0012 — the ADR permits it and assigns it to no slice. What argues against it is the plan's
sequencing and the canonicalisation dependency below, not the ADR.

**Recommendation — decision J2, and it is genuinely the approver's call:**

| Option | What it means |
|---|---|
| **J2-a (recommended)** — conflicts stay V6 entirely | V5 records no `Conflict`. Two contradictory evidence items produce two proposals, `crossSourceAgreement` stays `silent`, and nothing claims they agree. The honest position while nothing has been compared |
| **J2-b** — V5 detects and records `Conflict` with `decision = null` | Matches the stated expectation. Requires the `conflict` table, a detection pass, and accepting that unresolved conflicts accumulate with no resolution path until V6 — and that **G1 is blocked by them by definition**, which is correct but will look like a regression |

Either is defensible. **J2-a is recommended** because conflict *detection* without entity
canonicalisation (`CANONICALISE_ENTITIES`, also unimplemented) reports textual disagreement rather
than business disagreement — "within 90 days" versus "within three months" is not a conflict, and
"the officer approves" versus "the manager approves" may not be either. A detector that cannot tell
those apart produces confident non-conflicts, and a non-conflict that a human must dismiss is worse
than no detector.

**One deterministic thing V5 does regardless, and it is not conflict detection:** two proposals with
identical normalised text citing the identical evidence set are collapsed as a **duplicate**.

---

## 9. Clarification questions

**Proposed: V5 records gaps and ambiguities structurally; it does not generate questions.**

Grounds, from the specifications rather than from preference:

- RAF §3 derives `openQuestions` from `ambiguities`, `missingInformation` **and `conflicts`**, plus
  source-declared undecided issues. If conflicts are V6 (§8), a V5 question list is structurally
  incomplete while presenting itself as the list — the failure mode the whole derived-slot design
  exists to prevent.
- RAF §7 ties the generated question to the **coverage dashboard** ("where not `adequate`, the
  specific generated question that would resolve it"), and coverage is V6 by the sequence.
- `SYNTHESISE_QUESTIONS` exists in the task vocabulary, unimplemented.
- The **clarification queue** is a workspace capability; [roadmap.md](roadmap.md) P2 lists it beside
  the requirements workspace, and V7 owns that.

What V5 **does** produce, so V6 has real inputs rather than a rewrite:

- **`RequirementFlag` records, rule-raised** (`raisedBy: 'rule'`), for the ambiguity kinds RAF §3
  already names: `ambiguous`, `vague_quantifier`, `actor_unknown`, `untestable`, `unverifiable`
- **Slot emptiness**, observable by counting proposals per slot — a fact about the data, not a
  generated artefact

**No human interaction workflow of any kind**: no queue, no assignment, no resolution, no
notification. The V4b posture toward rejected evidence, applied again.

---

## 10. Human approval

**Confirmed against the governance design, and it matches the stated position.**

[governance-and-gates.md](../50-governance/governance-and-gates.md) §1 defines **G1 — Requirements
Approved** over a *requirement-set baseline*, requiring 0 blocking flags, 0 unresolved conflicts, 0
unanswered blocking questions, **all requirements at L4**, all required RAF slots non-`empty`, every
LOW-confidence inferred requirement explicitly confirmed, all `blocked_by_policy` slots acknowledged,
L0 clean — approved by a **BusinessApprover**. [ADR-0017](../adr/ADR-0017-approval-as-baseline-signature.md)
makes approval a signature over `(baselineHash, validationRunId)`.

**V5 produces structured proposals only.** No approval, no baseline, no signature, no G1 evaluation,
no workspace. All of it is V7 by the provisional sequence, and none of it is partially built here.

---

## 11. Data model

### 11.1 New schemas — `@asdp/schemas`

`RequirementSet` · `Requirement` · `RequirementEvidenceLink` · `RequirementFlag`, following
[domain-model.md](../20-domain/domain-model.md) exactly, **restricted to the fields V5 populates**.
Fields the domain model defines but V5 does not set (`priority`, `acceptanceCriteria`,
`approvedBy`/`approvedAt`/`approvalBaselineId`, `supersedesId`/`supersededById`) are **omitted from
the V5 schema rather than added and left null**, so a later slice adds them deliberately.

Plus the AI output contract `FramePopulation` — with **no field** for an anchor, quote, offset,
epistemic level, derivation, confidence, conflict, question, priority or acceptance criterion. The
V4b lesson, restated: *a model fills whatever fields it is given, and a schema alone does not stop
paraphrase.* Both halves — schema and instruction — are needed.

### 11.2 Migration `008_requirements`

Four tables, **insert-only** ([ADR-0016](../adr/ADR-0016-immutable-content-addressed-artifacts.md)), plain
parameterised SQL ([ADR-0035](../adr/ADR-0035-persistence-plain-sql-pglite.md)):

| Table | Notes |
|---|---|
| `requirement_set` | `project_id`, `version`, `status`, `raf_version` (`raf-1.1`) |
| `requirement` | `REQ-####` from a **per-project monotonic sequence, never reused** (D15) |
| `requirement_evidence` | `requirement_id` → `evidence_item_id`, `contribution`. FK to `evidence_item` |
| `requirement_flag` | `kind`, `severity`, `detail`, `raised_by`, nullable resolution columns |

**Constraints that do real work**, in the migration-005/007 tradition of enforcing an epistemic rule
in SQL rather than in a command:

- `status = 'draft'` on insert — **J4**
- `raf_slot` in the closed 27
- `derivation <> 'inferred'` — **J1**
- an AI-generated requirement must carry `ai_interaction_id` **and** computed confidence **and** the
  confidence function version
- classification not below the maximum over cited evidence (**D10**)
- at least one `requirement_evidence` row — enforced at commit within the unit of work, since a
  row-level check cannot see a child table

### 11.3 Immutability, provenance and versioning

| | |
|---|---|
| **Immutable** | Everything V5 writes. Insert-only; no update path exists. A corrected proposal is a **new** proposal, and the old one remains — the L1-immutability principle applied one level up |
| **Mutable later** | `status` and the flag-resolution columns, by **V7**, through commands V5 does not build |
| **Provenance** | `requirement_evidence` → `evidence_item` → anchor → source. Verified at write time, re-verifiable at read time |
| **AI provenance** | `ai_interaction_id`, `prompt_version`, `provider_id`, `model_id`, `capability_tier`, `degradations`, `derived_from_redacted_input` — the disclosure fields the domain model already names |
| **Versioning** | `requirement_set.version` and `raf_version`. A `RequirementSet` is the unit a future baseline is taken over ([versioning-and-baselines.md](../20-domain/versioning-and-baselines.md)); V5 takes no baseline |

### 11.4 What V5 does **not** add

No `conflict` table (unless **J2-b**) · no `open_question` table · no `requirement_relation` table.

**On `RafCoverage`** — [domain-model.md](../20-domain/domain-model.md) §3 **does** name it as an
entity (`requirementSetId`, `slot`, `itemCount`, `evidenceCount`, `confidenceBand`,
`requiredForExecutability`, `status`), so *not* creating the table is a deliberate deferral rather
than an oversight, and it is decision **J3-b**:

| Option | Consequence |
|---|---|
| **J3-b-i (recommended)** — compute on read, no table | No staleness question. Proposals are insert-only, so a stored snapshot goes out of date the moment the next proposal lands, and a stale coverage row is worse than none |
| **J3-b-ii** — persist a `raf_coverage` snapshot per set | Needed eventually, because a coverage snapshot is part of what a G1 **baseline** freezes ([ADR-0017](../adr/ADR-0017-approval-as-baseline-signature.md)) — but V5 takes no baseline, so it would be a table with no consumer |

---

## 12. AI task design — focused passes, not one prompt

**One AI task, invoked once per *pass* per evidence batch — six passes, not nine, and not
twenty-seven.**

**The partition is chosen by disjointness closure, not by tidiness.** `DISJOINTNESS_RULES` in
`@asdp/raf` names four pairs, and one of them — `outcomes ↔ outputs` — **crosses** the RAF groups
`process_behaviour` and `data`. A partition that followed the nine RAF groups literally would split
that pair across two calls, and a model asked for `outcomes` in one call and `outputs` in another
will legitimately offer the same item twice. So each pass is a **disjointness-closed** set of slots:

| Pass | Slots | Closes |
|---|---|---|
| **P1 Context & framing** | `businessObjective` `serviceDescription` `scopeAndExclusions` `successMeasures` `currentStateProcess` `dependencies` `assumptions` `constraints` | — |
| **P2 Participants & behaviour** | `actors` `responsibilities` `trigger` `preconditions` `processSteps` `alternativePaths` | `actors ↔ responsibilities`, `processSteps ↔ alternativePaths` |
| **P3 Outcomes & data** | `outcomes` `inputs` `outputs` `dataRequirements` | **`outcomes ↔ outputs`** — the cross-group pair |
| **P4 Rules & decisions** | `businessRules` `decisions` | — |
| **P5 Time, failure & external** | `slasAndTimers` `exceptions` `escalations` `integrations` `notifications` | `exceptions ↔ escalations` |
| **P6 Quality & control** | `nonFunctionalRequirements` `securityAndPrivacy` | — |

**27 slots, each in exactly one pass. All four disjointness pairs inside a single call.**

**The RAF groups are not redefined.** `RafGroup` stays exactly as `@asdp/raf` declares it, and the
coverage dashboard still reports by group. A *pass* is a prompting partition and nothing more — it
has no representation in the data model, which is why regrouping later is configuration rather than
a migration.

**Why not one prompt, and why not twenty-seven:**

- one prompt carrying 27 slot definitions invites the model to dump everything into `processSteps`,
  and the disjointness rules then reject work that need never have been proposed
- per-pass calls give **per-pass precision and recall**, so "good at actors, poor at exceptions" is
  measurable rather than averaged away
- a refusal degrades **one pass**, and retry is per-pass rather than per-document
- each call is separately recorded and separately replayable, so a proposal traces to *its* interaction
- but a pass per slot would fragment for no gain: a two-slot pass costs a whole call to decide
  nothing, and slots that must be told apart would be split across calls, which is the failure the
  partition exists to prevent

**Cost:** **six calls per evidence batch**, not one and not nine, plus chunking within a batch where
the evidence exceeds the budget. Mitigated by `promptCaching` where the provider offers it — already
a negotiated capability. The partition is **configuration**, so a coarser one can be measured against
this one rather than argued about.

**Task:** `POPULATE_FRAME` — already in the task vocabulary with `schemaConstrainedOutput` required
and `largeContext` / `promptCaching` preferred. No new task type is introduced.

**Input per call:** the slot group's definitions and questions · a batch of **eligible evidence
items** as `{ evidenceItemId, verbatimText, sourceId, unitId }`.

**Output per call — `FramePopulation`:**

```
items[] {
  slot            one of this group's slot keys
  text            the proposition, in the evidence's language
  category        functional | business_rule | data | integration | nfr | security
                | constraint | assumption | dependency | sla | notification | role
  evidenceItemIds ids from THIS batch, at least one
  modelSelfRating optional, weighted low, never the band by itself
}
limitations[]     free text; recorded, never structural
```

**Instruction, three insistences, each against a named failure mode:**

1. **CITE** — every proposition names the evidence ids it rests on, from the supplied list only. An
   id not in the batch is treated as absent, not trusted.
2. **NO INVENTION** — do not propose anything the cited evidence does not support; say so in
   `limitations` instead. A proposition with no support is discarded.
3. **NO DESIGN** — no process structure, no gateway, no expression, no BPMN/DMN/form concept, no
   priority, no acceptance criterion. You are structuring what the evidence says, not designing a
   process.

**Chunking** follows **F4** unchanged, over *evidence items* rather than text: structural boundaries
first (source, then unit ordinal), deterministic, versioned (`frame-1`), never silent, with
`chunked_context` declared and carried into confidence.

**Deliberately not implemented in V5:** `RECONCILE_SOURCES` · `CANONICALISE_ENTITIES` ·
`ANALYSE_QUALITY` · `SYNTHESISE_QUESTIONS` · `DECOMPOSE_PROCESS` and everything after it.

---

## 13. Deterministic validation — the gate

**Four conditions, all of them, or nothing is written**, in **one shared module used by both the
command and the evaluation harness** — the V4b-core arrangement, for the reason V4b-core recorded:
if the gate lived in the command, the evaluation would measure a reimplementation of the rules rather
than the rules, and the two would drift.

| # | Condition |
|---|---|
| 1 | **Structured output validates** against `FramePopulation` |
| 2 | **Every cited evidence id resolves**: exists, belongs to this project, was in the supplied batch, `anchorVerified`, and its anchor **re-resolves as `resolved` now** |
| 3 | **Slot assignment is legal**: one of the 27, in the group that was asked for, and surviving the **v1.1 disjointness rules** |
| 4 | **Derivation rules pass**: ≥1 cited evidence item (**D2**) · classification ≥ max over cited evidence (**D10**) · `derivation <> 'inferred'` (**J1**) · text non-empty and language-tagged |

**Closed rejection reason set**, so rejections can be counted rather than read: `no_evidence_cited`,
`evidence_not_in_batch`, `evidence_not_found`, `anchor_unresolved`, `slot_not_in_group`,
`disjointness_violation`, `classification_violation`, `empty_text`, `inferred_derivation`.

**Rejections are recorded and countable, and no remediation workflow is built** — **F2** applied
again. What is retained per rejection: reason code, slot, pass, chunk id, cited evidence ids, and the
**proposed text itself** — see **J9**, which is a change from V4b's checksum-only posture and is
argued there rather than assumed here.

**Computed after the gate, never taken from the model:** `epistemicLevel` · `derivation` ·
`confidence` + factors + function version · `classification` · `humanConfirmationRequired` ·
`generatedBy` and the AI-provenance fields · every `RequirementFlag`.

### 13.1 Validation rules — namespace `L1-REQ-*`, and **no eighth layer**

[validation-architecture.md](../40-quality/validation-architecture.md) §3 defines **seven layers**
and their scopes; [validation-rule-catalog.md](../40-quality/validation-rule-catalog.md) has **no
requirement-quality family**. Choosing where V5's rules live is decision **J6**, and it is permanent
— IDs are never reused or renumbered.

**Three candidates, and why one wins:**

| Candidate | Verdict |
|---|---|
| Extend **`L0-ING-*`** | **No.** L0's scope is *ingestion integrity* — "sources parsed, anchors resolvable, text normalised, classification assigned". A requirement is not an ingestion artefact, and stretching a layer's meaning to avoid naming a new family is how layer names stop meaning anything |
| A **new eighth layer** | **No.** "Seven layers" is a stated architectural structure referenced across the quality documents, and the by-layer tally in the catalogue depends on it. An eighth layer is a bigger change than these rules justify |
| **`L1-REQ-*`** | **Recommended.** L1's scope is *"Schema & structural"* and its gates are *"All"*. V5's persisted-state rules are exactly structural invariants over an entity — evidence linkage (**D2**), classification monotonicity (**D10**), identifier discipline (**D15**), slot legality — which is what L1 already covers for every other entity |

**And a distinction that shrinks the family considerably.** Requirement *quality* signals — vague
quantifier, actor unknown, untestable — are **not** catalogue rules. RAF §3 derives the `ambiguities`
slot from **`RequirementFlag`** records, and `RequirementFlag` already carries
`severity: blocking | warning | info` and `raisedBy: ai | human | rule`. G1's criterion is
*"0 blocking flags"* — **flags, not rules**. So V5 raises flags for quality signals and reserves
catalogue IDs only for structural checks over persisted state.

| Proposed ID | Sev | Check |
|---|---|---|
| `L1-REQ-001` | E | A requirement cites no evidence (**D2**) |
| `L1-REQ-002` | E | A cited evidence anchor no longer resolves |
| `L1-REQ-003` | E | Classification below the maximum over cited evidence (**D10**) |
| `L1-REQ-004` | E | A disjointness pair is violated in persisted state |
| `L1-REQ-005` | I | A proposal rests only on `content_unverified` visual evidence ([ADR-0038](../adr/ADR-0038-target-versus-content-verification.md)) |

**Five rules, and four of them should be unreachable**, because the gate refuses those writes. That
is the established pattern rather than a weakness: validation-architecture.md §3 says structurally
unreachable rules "remain implemented as defence against compiler defects, and a violation is
reported as an **internal error**, not a user error". `L1-REQ-002` is the one genuinely reachable
rule, since an anchor can drift after the proposal is written.

Each rule still owes the catalogue's growth obligations: an entry, positive **and negative**
fixtures, a documented rationale, a specification-level remediation, and messages plus fix hints in
**both** catalogue languages.

---

## 14. Evaluation

`npm run eval:frame`, offline, over a **hand-authored, human-reviewed synthetic corpus**. **F1
applies unchanged** — the harness refuses a gold set that does not declare human authorship, every
expected item carries its expected location, and AI-generated expected output is never ground truth.
The run uses the real ingestion adapter, the real chunk planner, the real broker over a **replay**
provider, and **the real gate**. **A7**: no live call, ever, in CI.

**Metrics, using the vocabulary already approved in
[ai-evaluation-framework.md](../40-quality/ai-evaluation-framework.md) §3.1 rather than new names:**

| Requested | Approved metric | Definition in V5 |
|---|---|---|
| RAF field precision/recall | **Slot assignment accuracy** | Correct RAF slot / all assigned, per group and overall |
| — | **Proposal precision / recall / F1** | Against hand-labelled expected propositions, matched on cited-evidence set plus normalised text |
| Traceability completeness | **Anchor resolution rate** | Cited anchors that resolve. **Target 100% — below 100% is a defect, not a score** |
| Unsupported proposition rate | **Hallucination rate** | Persisted proposals a human labeller marks as unsupported by their cited evidence. **Target 0** |
| Groundedness | *(partly unmeasurable — see below)* | Mechanical part: every proposal cites resolving evidence. Semantic part: human labelling only |
| Evidence coverage | **Evidence utilisation** | Share of eligible evidence items cited by ≥1 proposal — a **recall-loss diagnostic**, not a target: not every sentence is a requirement |
| Ambiguity detection | **Ambiguity agreement** | Overlap between rule-raised flags and human-marked ambiguity spans |
| Reproducibility | **Reproducibility** | Same corpus + same recordings → byte-identical proposals, ids aside |

Plus **traps**, each of which must be rejected, and each reported as `notExercised` rather than as a
pass if the provider never produced it: a proposal citing a nonexistent evidence id · one citing a
drifted anchor · one asserting a requirement no cited evidence supports · one violating a disjointness
pair · one at a lower classification than its evidence.

**The honest limit, and it is the most important sentence in this section.** V4b could verify its own
output completely — a quote is in the source or it is not. **V5 cannot.** Whether a proposition
faithfully represents the evidence it cites is a semantic judgement, so the **unsupported-proposition
rate is measurable only against human labels**, and only over the corpus that has them. Everything
mechanical — citation validity, anchor resolution, slot legality, classification monotonicity — is a
*defect detector*, not a quality score. **Acceptance would claim mechanics and governance, explicitly
not model quality**, with tier `synthetic` and `usableForRoutingDecision: false` on every report, as
V4b-core's acceptance did.

---

## 15. In scope / out of scope

### In scope

1. `POPULATE_FRAME` per RAF slot group, through the V4a broker, replay-capable
2. `RequirementSet` / `Requirement` / `RequirementEvidenceLink` / `RequirementFlag` persistence — migration `008`
3. The four-condition proposal gate, **shared** by command and evaluation
4. Deterministic slot legality and v1.1 disjointness enforcement
5. Full traceability: proposal → evidence → anchor → source, re-verified at write time
6. Computed confidence, epistemic level and derivation — never model-asserted
7. Deterministic chunking over evidence (`frame-1`), F4 conditions unchanged
8. The new validation rule family (**J6**), self-tested like every other rule
9. Rejection recording with a closed reason set — no remediation workflow
10. Gold-set evaluation per §14
11. Read-only HTTP views: proposals by set, by slot, by evidence item

### Out of scope — restated because this is where it would slip

Human approval workspace · **G1** · baselines and signatures · `RECONCILE_SOURCES` · precedence
resolution · conflict records (unless **J2-b**) · `CANONICALISE_ENTITIES` · `SYNTHESISE_QUESTIONS`
and any clarification queue · coverage dashboard (unless **J3**) · requirement editing or any mutation
path · `RequirementRelation` · BPS · Process IR · BPMN / DMN / form generation · layout · graphical
editing · **V4b-eval** · **V2-PDF** · spreadsheet intake · **H1/H2**.

---

## 16. Material decisions requiring approval

| | Decision | Recommendation |
|---|---|---|
| **J1** | **No L3 / `inferred` propositions in V5.** Every proposal cites ≥1 evidence item | **Approve.** A tightening beyond the epistemic model, not a requirement of it (§6). Reversible later; the reverse is not |
| **J2** | **Conflicts: V6 (a) or detect-and-record in V5 (b)?** The plan assigns conflicts to V6; the stated expectation is (b) | **J2-a recommended** (§8). This is a re-cut of the provisional sequence either way, and genuinely the approver's call |
| **J3-a** | **Coverage arithmetic: V5 or V6?** The plan assigns coverage to V6; `computeFrameCoverage` already exists in `@asdp/raf`, unused | **Approve for V5.** It needs **no conflict input** — `FrameCoverage` has no `conflicts` field — so it is assessment of the populated frame, not reconciliation. A re-cut, and it must be approved rather than assumed |
| **J3-b** | **`RafCoverage`: compute on read, or persist a snapshot?** The domain model names it an entity | **Compute on read (J3-b-i).** A stored snapshot goes stale on the next insert; freezing one is a **baseline** act, and V5 takes no baseline — §11.4 |
| **J4** | **Proposals are `draft` only, enforced by SQL check constraint** | **Approve.** The boundary you named, made structural rather than remembered |
| **J5** | **A four-condition gate shared by command and evaluation** | **Approve.** The V4b arrangement, for the reason V4b recorded |
| **J6** | **Validation rule namespace** for structured requirement quality | **`L1-REQ-*`, five rules, no eighth layer** — §13.1. Quality signals become `RequirementFlag`s, not catalogue rules, because G1's criterion is "0 blocking **flags**" |
| **J7** | **How many AI passes** over the 27 slots | **Six disjointness-closed passes** — §12. Not one (invites slot dumping), not nine (splits `outcomes ↔ outputs` across calls), not twenty-seven |
| **J8** | **The model proposes a slot; code decides legality.** Disjointness is code-owned | **Approve.** This is ADR-0010 restated, listed because it is the line most easily eroded |
| **J9** | **Rejected proposals: retain the text, or only a checksum?** | **Retain the text.** [ADR-0032](../adr/ADR-0032-retain-everything.md) requires retaining "the complete append-only audit log, **including rejected proposals and rejected requirements**" — V5's exact subject, and a case that did not exist in V4b. See below |

**Would any of this need an ADR?** On this reading, **no** — J1, J4, J5, J7 and J8 implement
ADR-0004, 0007, 0008, 0010, 0011 and 0016 as written, and the domain model already specifies the
entities. **Three things would need one, and all three are refused above:** letting a requirement
exist with no evidence and no inference rationale; letting the model own slot assignment unchecked;
and creating an approved requirement without a human signature.

**J3-a and J6 were re-cuts or additions to approved artefacts** — the provisional slice sequence and
the validation rule catalogue — and were **approved as such** on 2026-08-23; both are recorded in
[phase-2-plan.md](phase-2-plan.md) §3.7 and §3.10 so the sequence is not read as untouched. **J2 was
approved as J2-a, so conflicts did not move**: they remain V6 in full.

### 16.1 J9 in full, and a pre-existing gap it uncovered

V4b's **F2** retains a rejected item's **checksum, not its text**, because a rejected *quote* is
unanchored **source** content and the audit store is not a content store. **That argument does not
transfer to V5**, for two reasons: a rejected proposal is **model-authored text**, not a copied
source span; and [ADR-0032](../adr/ADR-0032-retain-everything.md) names *"rejected proposals and
rejected requirements"* explicitly — a category that did not exist before this slice. So **J9 is not
a reversal of F2**; F2 governs quotes and continues to.

**The gap.** ADR-0032 also requires retaining *"all AI interactions, including prompt and response
payloads, subject to classification-based access control"*. Migration `006_ai_interaction` retains
**metadata only** — no prompt column, no response column, and a `proposal_id` that references
nothing, because no proposal store exists. **Prompt and response payloads are not retained anywhere
in the domain today.** Recorded fixtures in `@asdp/eval` hold request/response for *replay*, but that
is the evaluation corpus, not the domain, and a live call in production writes no payload at all.

This is **pre-existing, from V4a, and out of V5's boundary** — it is recorded rather than fixed here,
as [phase-2-status.md](phase-2-status.md) limitation **62** and hardening candidate **H3**. Its
consequence for V5 is direct: with no payload store to fall back on, a checksum-only rejection record
would mean a rejected proposal is retained **nowhere**, which contradicts ADR-0032 outright.

| Option | Verdict |
|---|---|
| **J9-a (recommended)** — V5's rejection record carries the full proposed text, classified at the evidence batch's classification and read under the same controls | Satisfies ADR-0032 for V5's own output without touching an accepted slice's schema |
| **J9-b** — add payload retention to `ai_interaction` first | Correct eventually, and it closes the gap generally — but it is **H3**, not V5, and making V5 depend on it blocks this slice on unrelated work |
| **J9-c** — checksum only, as V4b | **Refused.** It would put a recorded contradiction with ADR-0032 into the slice that creates the very category the ADR names |

---

## 17. Acceptance criteria

Measurable, in the twelve-criterion shape V4b-core was accepted against.

| # | Criterion | Demonstrated by |
|---|---|---|
| 1 | Proposals are produced end to end from real stored `EvidenceItem`s through the broker, and **every persisted proposal cites ≥1 evidence item whose anchor resolves** | End-to-end tests over the HTTP surface |
| 2 | **Ineligible evidence cannot be cited**: unresolved, drifted, broken, or another project's | A test per case |
| 3 | **The gate holds all four conditions**, and a failure of any one writes nothing | A test per condition |
| 4 | **Rejections are recorded, countable and retained in full** — closed reason code, slot, pass, cited ids and the proposed text (**J9**, [ADR-0032](../adr/ADR-0032-retain-everything.md)) — and never silently dropped | Audit assertions + a rejection count in the pass result |
| 5 | **No proposal is ever `approved`**, and no route promotes one. `status = 'draft'` enforced in SQL | Tests + the check constraint |
| 6 | **Epistemic level, derivation, confidence and classification are computed**, never taken from model output | Tests asserting the schema has no such field and the values are derived |
| 7 | **Slot legality and disjointness are enforced**; an illegal or cross-group assignment is rejected | A test per disjointness pair |
| 8 | **Confidence is weakest-link and carries degradations**, including `chunked_context` | Unit tests over the recorded factors |
| 9 | **Chunking is structural, deterministic, versioned and recorded**; never silent | Tests including an oversized batch |
| 10 | **Gold-set evaluation reports slot assignment accuracy, proposal precision/recall, hallucination rate, anchor resolution rate, ambiguity agreement and evidence utilisation**, with the corpus tier stated and **no real-world claim** | `npm run eval:frame` offline |
| 11 | **CI makes no live call**; replay is deterministic and reproducible | `npm run verify` + the confinement rules |
| 12 | **Verification is complete** — nothing skipped, loosened or suppressed | `npm run verify` |

**What V5 acceptance will NOT prove:** that propositions are *semantically faithful* to their
evidence. That needs human labelling on representative material, which is V4b-eval's dependency set
(a credential and E1-permitted corpus) applied to a second task.

---

## 18. Risks and limitations

**R-V5-1 — the central new risk: fluent, well-cited, wrong.** V5 is the first slice whose output is
**not verifiable against the source by construction**. A proposition can cite real evidence, resolve
every anchor, pass every mechanical check, and still misrepresent what the evidence says — and it
will read *better* than a correct one, because fluency and correctness are uncorrelated. Every V4b
defence (verbatim quotes, locatable citations, rejected fabrications) stops working here.
*Mitigation:* per-proposition evidence linkage so a reviewer sees the source beside the claim; L3
exclusion; measurement against human labels only; and an acceptance claim that stops at mechanics.
*Residual risk: material, and it does not go away in V5.*

**R-V5-2 — slot assignment is a semantic judgement dressed as a category.** The disjointness rules
make assignment deterministic *given* the item's meaning, which is exactly what is uncertain.
*Mitigation:* per-group measurement, so a systematically mis-assigned group is visible rather than
averaged away.

**R-V5-3 — empty required slots will look like a system failure.** With L3 excluded (**J1**),
`businessObjective` and `assumptions` will often be empty on real material, because documents rarely
state them. That is a **document** finding, not a system fault, and the coverage vocabulary
(`empty` / `weak` / `blocked_by_policy`) exists to say so — but only if **J3** puts coverage in V5.

**R-V5-4 — scope creep toward the workspace.** Rejections, flags and empty slots all invite a queue,
an assignment, a resolution. Named risk **R11** in another form. *Mitigation:* the V4b remedy — a test
asserting the absence of those routes.

**R-V5-5 — evaluation over-fitting to a synthetic corpus.** Same as V4b, one level more dangerous,
because a synthetic document written by the same hand that labels it may be *structured* the way the
prompt expects. *Mitigation:* `TIER_WEIGHT` at 0.25, `usableForRoutingDecision: false`, ADR-0031 rule
4, and the framework's §1.1 guard against synthetic over-fitting.

**R-V5-6 — nine calls per batch.** A real cost increase with a real benefit; if measurement shows the
per-group split does not improve accuracy, the grouping is configuration and can be coarsened without
a code change.

---

## 19. Dependencies

**None new. Runtime dependencies stay at seven.**

| Need | Met by |
|---|---|
| Broker, routing, egress gate, degradation ladder, replay | `@asdp/ai` + V4a wiring |
| The gate pattern, chunker, rejection recording | V4b-core (`extraction-gate.ts`, `chunking.ts`) |
| The 27 slots, disjointness, coverage arithmetic | `@asdp/raf` — **exists, currently unused** |
| Computed confidence | `computeConfidence` in `@asdp/domain` |
| Corpus, gold sets, recordings, metrics, reports | `@asdp/eval` |
| Validation rule engine, catalogue, self-test | `@asdp/validation` |
| Verified evidence to analyse | **V4b-core, accepted** |

**No external dependency and no credential.** V5 is completable and acceptable offline, exactly as
V4b-core was (**F3**'s reasoning, applied again). It does **not** depend on V4b-eval, V2-PDF,
ADR-0037, spike S2, or Docker.

---

## 20. Status

**✅ APPROVED 2026-08-23. Decisions J1–J9 all approved**, with three approver-set conditions carried
into the plan of record ([phase-2-plan.md](phase-2-plan.md) §3.10):

1. **No V5 route** may produce `approved`, `in_review`, `needs_clarification`, **L4**, an approval
   baseline or an approval signature — enforced in SQL (**J4**).
2. **V5 must not claim that propositions agree** merely because no conflict check ran.
   `crossSourceAgreement` stays `silent`; deterministic collapse of identical text with an identical
   evidence set is **deduplication, not conflict resolution** (**J2**).
3. **H3 blocks the first live-provider call and V4b-eval, not V5.** V5 is replay-only. If resolving
   H3 becomes technically necessary to preserve an approved invariant, **stop and raise it** rather
   than expanding scope silently.

**ADRs required: none.** **Dependencies added: none** — seven, unchanged.
