# V6 — Canonicalisation, Conflict Candidates and Deterministic Precedence · APPROVED BOUNDARY

> **Status: ✅ APPROVED 2026-08-23 — decisions Q1–Q9 all approved.** The boundary below is binding;
> the plan of record is [phase-2-plan.md](phase-2-plan.md) **§3.11**.
>
> **The approved Q1–Q9 are lettered as the approver stated them**, and that differs from the
> numbering this document proposed: the approver's **Q1** absorbs "candidates only" *and* the SQL
> enforcement this document had split into Q5; the approver's **Q5** is *precedence is a
> recommendation*; the approver's **Q8** is the five-way classification this document set out in §3;
> the approver's **Q9** is coverage. §17 below is rewritten to the approved lettering so there is one
> numbering, not two.
> **Version:** 1.0 · **Written:** 2026-08-23 · **Approved:** 2026-08-23
> **Related:** [phase-2-plan.md](phase-2-plan.md) §3.7, [v5-proposal.md](v5-proposal.md),
> [phase-2-status.md](phase-2-status.md) §0 and §8,
> [ADR-0012](../adr/ADR-0012-deterministic-conflict-precedence.md),
> [ADR-0004](../adr/ADR-0004-ai-proposes-code-commits.md),
> [ADR-0007](../adr/ADR-0007-epistemic-ladder.md),
> [ADR-0010](../adr/ADR-0010-raf-deterministic-schema.md),
> [ADR-0011](../adr/ADR-0011-computed-confidence.md),
> [ADR-0016](../adr/ADR-0016-immutable-content-addressed-artifacts.md),
> [ADR-0023](../adr/ADR-0023-unicode-bilingual-architecture.md),
> [ADR-0032](../adr/ADR-0032-retain-everything.md),
> [domain-model.md](../20-domain/domain-model.md) §4–§5,
> [requirement-analysis-frame.md](../20-domain/requirement-analysis-frame.md) §3,
> [governance-and-gates.md](../50-governance/governance-and-gates.md) §1,
> [multilingual-architecture.md](../10-architecture/multilingual-architecture.md) §2

---

## 0. The principle this whole slice is built around

> **AI may detect and explain contradiction candidates. Deterministic code computes precedence. A
> human decides every true conflict.**

That is [ADR-0012](../adr/ADR-0012-deterministic-conflict-precedence.md), quoted rather than
paraphrased: *"AI **MAY** detect contradiction candidates and explain them"* · precedence **MUST** be
computed deterministically · *"a **human MUST decide** every conflict"* · unresolved conflicts **MUST**
block G1.

**V6 must not silently decide business truth**, and the largest risk in this slice is not that it
decides wrongly — it is that a *recommendation* is read as a *decision* because it is confident,
deterministic and well-explained. §11 and §19 are about that.

---

## 1. Purpose — what V6 adds beyond V5

V5 produces grounded requirement proposals, each citing verified evidence, each with
`crossSourceAgreement: 'silent'` — an honest record that **nothing has been compared**. It says so on
every proposal, and V5's coverage carries `conflictsDetected: null`.

Two documents can therefore say opposite things and the system will hold both without noticing.
That is correct for V5 and unacceptable at G1, which requires **0 unresolved conflicts**.

V6 makes comparison possible and records what it finds:

```
Requirement proposals (V5, uncompared)
  → CANONICALISE_ENTITIES   who/what is the same thing across sources?
    → conflict CANDIDATES   which propositions may contradict?
      → deterministic PRECEDENCE recommendation (ADR-0012 ordering)
        → Conflict records, UNDECIDED — a human decides in V7
```

**What V6 does not add: a decision.** Every `Conflict` it writes has `decision = null`.

---

## 2. `CANONICALISE_ENTITIES`

Comparison is impossible before naming is settled. "The reviewing officer", "the officer", "المراجع"
and "Review Officer" may be one actor or four; a conflict detector that cannot tell reports textual
difference as business disagreement, which is worse than reporting nothing.

The domain model already has the structures ([domain-model.md](../20-domain/domain-model.md) §5) and
V6 should use them rather than invent a parallel model: `BusinessTerm` carries **`synonyms[]`** and
**`mergedFromIds[]`**; `Actor`, `DataEntity`, `DataField`, `BusinessRule` and `BusinessEvent` each
carry `requirementIds[]`.

### 2.1 The three-way split

| Owner | What it owns |
|---|---|
| **Deterministic code** | **Match-form normalisation** — NFC, Arabic presentation-form folding, diacritic strip, Alef/Yeh/Teh-Marbuta folding, Tatweel removal, digit folding, case folding ([multilingual-architecture.md](../10-architecture/multilingual-architecture.md) §2, [ADR-0023](../adr/ADR-0023-unicode-bilingual-architecture.md)) · **exact-match merging** · merge **legality** · canonical ids · classification propagation · provenance to every surface form's requirement and evidence · **refusal to merge across incompatible kinds** |
| **AI (proposal only)** | **Candidate** merges that the match form cannot see: a synonym, an abbreviation, a cross-language equivalence, a role named two ways · a proposed canonical label in **both** languages · a stated **reason** per candidate |
| **Human (V7)** | **Confirmation of every AI-proposed merge.** A merge is a semantic claim about the business, and merging two genuinely distinct concepts is *silent* — the second one simply stops existing |

**The asymmetry that matters:** an exact match after folding is a fact about text and code may act on
it. Everything else is a claim about meaning and stays a proposal. `mergedFromIds[]` exists precisely
so a merge is reversible and auditable rather than destructive.

### 2.2 What V6 must refuse to merge automatically

- Entities of **different kinds** (`human_role` with `system`)
- Entities whose **classifications differ** — merging raises classification, and a silent rise hides
  which document the constraint came from
- Anything an AI proposed and no human has confirmed, **for the purpose of deciding a conflict**.
  An unconfirmed merge may *group* candidates for review; it may not *resolve* one.

---

## 3. Conflict candidates — and the taxonomy that keeps this honest

**Textual difference is not business conflict.** The single most damaging failure mode here is a
detector that flags "within 90 days" against "within three months" and asks a human to adjudicate an
identity.

Five outcomes, and only one of them is a conflict:

| Outcome | Definition | Who decides |
|---|---|---|
| **duplicate** | Identical normalised text **and** identical evidence set | **Deterministic** — already collapsed in V5 (**J2**) |
| **equivalent** | Different wording, same business content, after canonicalisation and normalisation (90 days ≡ three months; "the officer" ≡ "المراجع") | **AI proposes, code checks what it can, human confirms** |
| **complementary** | Both true, about the same topic, adding different things ("must supply ID" and "must supply a tenancy contract when the address changed") | AI proposes; **never a conflict** |
| **potentially contradictory** | Same topic, and both cannot hold as stated (90 days vs 30 days; approved-by-officer vs approved-by-manager) | **AI proposes a CANDIDATE with an explanation** |
| **true conflict** | A potentially-contradictory candidate a **human has confirmed is real** | **Human only — V7** |

**V6 produces candidates, never true conflicts.** A `Conflict` row written by V6 means *"these two
propositions may not both hold, here is why, here is what precedence would suggest"* — and nothing
more.

**Comparison scope.** Candidates are sought between requirement proposals **in the same RAF slot** or
in slots the disjointness rules pair, because two propositions in unrelated slots are not about the
same thing. Cross-slot comparison is a larger, noisier problem and is out of scope.

---

## 4. Precedence — [ADR-0012](../adr/ADR-0012-deterministic-conflict-precedence.md), and what it may never do

The ordering is **fixed by the ADR** and is not re-decided here:

1. **Declared source authority rank** — set by a human during intake, and the primary input
2. **Effective date** — more recent wins, where dates are known
3. **Specificity** — a specific clause outranks a general statement
4. **Epistemic level** — extracted outranks interpreted, which outranks inferred

| May | Must never |
|---|---|
| Compute an ordering over the participants | **Apply it.** No requirement is superseded, rejected, demoted or hidden by precedence |
| Produce a `proposedResolution` and a `precedenceRationale` naming which of the four steps decided it | Set `decision`, `decidedBy` or `decidedAt` |
| Report that the ordering is **undecidable** — equal authority, no dates, equal specificity | Break a tie arbitrarily. An arbitrary tie-break is the `matches[0]` mistake of provenance §4.4, one level up |
| Record that a source has **no `effectiveDate`**, which `L0-ING-010` already warns about | Infer a date from content |

**Specificity is the one term needing a definition, and it must be deterministic to be usable.**
Proposed: a proposition is more specific than another when its evidence's anchor span is *contained
within* the other's enclosing structural unit, or when it carries a qualifying condition the other
does not (a `when`/`unless` clause, an enumerated case, a named exception). Where neither test
applies, specificity is **`undetermined`** and contributes nothing — it does not fall back to a
heuristic. This definition needs approval (**Q4**); the ordering itself does not.

---

## 5. The `Conflict` model — which fields V6 may fill

Using the entity as [domain-model.md](../20-domain/domain-model.md) §4 already defines it:

| Field | V6 | Why |
|---|---|---|
| `topic` | **AI-proposed, human-editable later** | A short label for what the disagreement is about |
| `participants[]` | **Deterministic** — requirement and evidence ids, never free text | The traceability chain has to hold through a conflict |
| `detectedBy` | **Deterministic** — the task, prompt version and interaction id | An undisclosable detection is not a detection |
| `proposedResolution` | **Deterministic, from precedence** | Computed, never AI-chosen (ADR-0012) |
| `precedenceRationale` | **Deterministic** — which of the four steps decided, and on what values | *"the AI decided the policy outweighed the email" is not an acceptable audit answer* |
| `decision` | **NULL. V7 only** | A human decides every conflict |
| `decidedBy` · `decidedAt` | **NULL. V7 only** | |

**Proposed: enforced in SQL** (**Q5**) — a check constraint refusing a non-null `decision` on insert,
exactly as V5's `requirement_status_draft_only` refuses a non-draft status. The V5 pattern, applied
to the field that matters here.

---

## 6. `RECONCILE_SOURCES`

Its role, stated as a limit rather than a capability: **it explains, it does not settle.**

`RECONCILE_SOURCES` takes a candidate set that canonicalisation has grouped and produces, per
candidate: what the disagreement is, which parts are genuinely incompatible versus differently
worded, and what a reader would need to know to decide. It **cites the requirement and evidence ids**
it is reasoning over, exactly as `POPULATE_FRAME` does, and its output is refused if it cites
anything it was not shown.

**It may not:** mark anything resolved · rank sources (that is precedence, and precedence is code) ·
create requirements · edit requirements · change any requirement's status or level.

---

## 7. `crossSourceAgreement` — when `silent` may change, and when it may not

V5 writes `silent` on every proposal. The rule V6 needs is the mirror of §4.4's rule about ambiguity:

| Value | Permitted when |
|---|---|
| **`silent`** | The proposition has **not been compared**, or comparison found nothing to compare it to. **The default, and it stays the default** |
| **`corroborated`** | The proposition is **equivalent** to another resting on evidence from a **different source**, and that equivalence is **human-confirmed** where it came from an AI merge |
| **`contradicted`** | An **unresolved conflict candidate** names this proposition |

**Absence of a conflict is not agreement.** A proposition nothing was compared against stays `silent`
— the honest value — and "no conflict found" must never become `corroborated`, because a detector that
found nothing and a corpus containing nothing to find are indistinguishable from the outside.

### 7.1 The immutability problem, which needs a decision

V5 requirements are **insert-only** ([ADR-0016](../adr/ADR-0016-immutable-content-addressed-artifacts.md),
**J4**), and `crossSourceAgreement` is a stored input to a **stored** confidence score. So V6 cannot
simply update it. Three options, and this needs approving (**Q6**):

| Option | Consequence |
|---|---|
| **Q6-a (recommended)** — leave the stored score untouched; compute a **reconciled confidence on read**, alongside it, from the stored factors plus the reconciliation state | Nothing is mutated, the original score stays auditable, and the reconciled view is derived — the same reasoning that made coverage compute-on-read in **J3-b** |
| **Q6-b** — write a new requirement **version** whose confidence reflects reconciliation | Faithful to the versioning model, but it makes every reconciliation pass mint a new set, and V6 would be building versioning machinery that belongs with baselines |
| **Q6-c** — make `crossSourceAgreement` mutable | **Refused.** It would put a mutable field inside an immutable row and make a stored confidence score unreproducible |

---

## 8. The RAF `conflicts` derived slot

[requirement-analysis-frame.md](../20-domain/requirement-analysis-frame.md) §3 already specifies it:
*"`conflicts` — Aggregation of unresolved `Conflict` records"*. V6 implements exactly that
aggregation — **derived, never AI-asserted**, in the same way V5 derives `ambiguities` from flags.

Because V6 writes only undecided conflicts, **every conflict it records is "unresolved" by
construction**, and therefore every one of them blocks G1 until a human decides it. That is correct
and it will look like a regression the first time a project sees it: a frame that was quiet becomes
a frame with open conflicts. Naming that in advance is part of the proposal (§19).

---

## 9. Coverage — enriched, not changed

**V6 must not touch `computeFrameCoverage` or `slotStatus`.** The RAF's status determination (§5.1)
takes item count, evidence count, distinct source count, confidence band and epistemic mix — **not
conflicts** — and V5 wired it exactly as specified.

V6 therefore adds a **conflict view alongside** coverage rather than inside it: per slot, the number
of unresolved conflict candidates touching it, computed on read from `Conflict` records. Slot status
keeps its existing meaning; a slot can be `adequate` and carry conflicts, and those are different
facts that should stay separately legible.

**No V5 coverage logic is duplicated or reimplemented** — the arithmetic is imported, not copied,
which is the J5 principle applied to a second consumer.

---

## 10. Clarification questions — proposed: **still not V6**

After V6, all four structural inputs to `openQuestions` exist for the first time: ambiguities (V5
flags), missing information (V5 coverage), **conflicts (V6)**, and source-declared undecided issues.
So the question can now be asked properly, which is exactly why it deserves a decision rather than a
default (**Q7**).

| Option | Argument |
|---|---|
| **Q7-a (recommended)** — questions stay **V7** | `OpenQuestion` carries `answer`, `answeredBy`, `answeredAt` and **`becameSourceUnitId`** — an answered question becomes a `SourceUnit` in an interview transcript. That is an *intake* act inside a *workspace*, and V7 owns both. Generating questions with no answering path repeats the L3 objection: a record whose only correct disposition does not exist |
| **Q7-b** — V6 generates question **proposals**, unanswered and unqueued | All inputs exist, and V7 would then build only workflow. The cost: `SYNTHESISE_QUESTIONS` output has no consumer for a whole slice, and a question list built before conflicts are *decided* will be rewritten once they are |

**A tension I should name rather than hide:** Q7-a's argument ("no disposition exists yet") is the
same argument that would exclude undecided `Conflict` records — and V6 creates those deliberately.
The difference is that conflicts are V6's *subject* and G1 explicitly requires them counted, whereas
questions are an aggregation over V6's output plus V5's, and aggregators are best built after their
inputs stop moving. That is a judgement, not a rule, and it is yours to overturn.

---

## 11. The human decision boundary

**V7 owns the workspace and G1.** V6 prepares and recommends; it does not decide, and it does not
build the surface on which deciding happens.

| V6 may | V6 must not |
|---|---|
| Write `Conflict` records with `decision = null` | Write any value into `decision`, `decidedBy`, `decidedAt` |
| Compute and record a precedence recommendation | Apply it to anything |
| Mark canonical merges as **proposed** | Treat an unconfirmed merge as settled when deciding a candidate |
| Report unresolved conflicts, including to G1's precondition check | Evaluate, approve or unblock G1 |
| Offer read-only views of candidates and recommendations | Offer accept/reject/resolve routes — a test must assert they 404, as V5's does |

---

## 12. Data model

### 12.1 New tables — migration `009_reconciliation`

| Table | Notes |
|---|---|
| `canonical_entity` | id, project, `kind` (`term`/`actor`/`data_entity`/`business_rule`/`business_event`), `label_en`, `label_ar`, classification, `origin` (`deterministic` \| `ai_proposed`), `confirmed_by`/`confirmed_at` (**null in V6**) |
| `canonical_entity_alias` | canonical id, surface form, **match form**, language, `origin`, `ai_interaction_id`, and the requirement/evidence it was observed in |
| `conflict` | id, project, requirement-set, `topic`, `detected_by`, `ai_interaction_id`, `proposed_resolution`, `precedence_rationale` (jsonb: which step decided, on what values), `candidate_kind` (the §3 taxonomy), **`decision` / `decided_by` / `decided_at` — nullable, and refused on insert (Q5)** |
| `conflict_participant` | conflict id → `requirement_id` \| `evidence_item_id`, plus the role it plays |
| `requirement_relation` | `from_id`, `to_id`, `kind` — `refines` \| `conflicts` \| `depends_on` \| `duplicates`, as the domain model already defines |

All **insert-only**, all with AI-provenance columns where an AI proposed them, all retaining rejected
candidates in full — **J9's rule applied again**, because ADR-0032 names rejected proposals and a
rejected merge candidate is one.

### 12.2 What V6 does **not** add

**No Domain Model Registry.** [module-map.md](../10-architecture/module-map.md) M6 and roadmap **P3**
own the bilingual glossary as a *product surface*. V6's canonical entities are **scoped to
reconciliation** — enough to compare propositions, not a registry anyone edits. If the approver wants
these rows to *become* the Registry, that is a re-cut of P3 and needs its own decision (**Q2**).

**No baseline, no signature, no approval, no `RafCoverage` table** — unchanged from V5.

---

## 13. AI task design

Both tasks already exist in the vocabulary (`packages/ai/src/tasks.ts`) with no implementation, and
V6 adds no new task type.

| Task | Input | Output contract | Refused if |
|---|---|---|---|
| **`CANONICALISE_ENTITIES`** | Surface forms observed in requirement proposals, with the ids they came from | Candidate merge groups: member surface-form ids, a proposed bilingual label, a stated reason, a self-rating | It names a surface form it was not shown · it proposes a merge across kinds · it invents a label with no member |
| **`RECONCILE_SOURCES`** | A grouped candidate set: the requirement propositions, their evidence text, canonical entities | Per candidate: the §3 taxonomy outcome, an explanation, the ids it reasoned over | It cites ids it was not shown · it proposes a *resolution* (precedence is code's) · it returns a decision |

**Focused passes, as in V5 (J7):** canonicalisation runs per entity **kind**, and reconciliation runs
per **candidate group**, so a refusal degrades one group rather than the run and each is separately
recorded, replayable and measurable. **A7 applies unchanged: CI replays, and never calls.**

---

## 14. Deterministic validation

Proposed namespace **`L1-CONF-*`**, in **L1** for the reason **J6** put `L1-REQ` there — L1 is
*"Schema & structural"* at all gates, and these are structural invariants over entities. **No new
validation layer**, again.

| Proposed ID | Sev | Check |
|---|---|---|
| `L1-CONF-001` | E | Every conflict participant resolves to an existing requirement or evidence item |
| `L1-CONF-002` | E | A conflict written by an AI-detection pass names its `ai_interaction_id` |
| `L1-CONF-003` | E | A conflict carrying `proposedResolution` carries a `precedenceRationale` naming which ADR-0012 step decided |
| `L1-CONF-004` | E | **No conflict has a `decision` unless a human set it** — the V6 invariant, checked after the fact as well as in SQL |
| `L1-CONF-005` | W | A conflict whose precedence is **undecidable** (equal authority, no dates, equal specificity) — a human has no computed starting point |
| `L1-CONF-006` | I | A canonical merge used while grouping a candidate is **AI-proposed and unconfirmed** |
| `L1-CONF-007` | W | A source contributing to a conflict has **no `effectiveDate`**, weakening precedence — the live consequence of `L0-ING-010` |

Quality-shaped signals stay **flags**, not rules, exactly as **J6** settled.

---

## 15. Evaluation

`npm run eval:reconcile`, offline, replay, **sharing the production gate** (**J5** again), over a
**human-authored** gold set (**F1** unchanged).

| Metric | Definition | Note |
|---|---|---|
| **Canonicalisation F1** | Merge decisions vs. gold merge sets | The name and definition already exist in [ai-evaluation-framework.md](../40-quality/ai-evaluation-framework.md) §3.1 |
| **Conflict detection precision / recall** | Against labelled contradictions | Also already specified |
| **False-conflict rate** | Candidates a human labels *equivalent* or *complementary* / all candidates | **The metric that matters most.** A noisy detector is abandoned, and an abandoned detector blocks G1 forever |
| **Missed-conflict rate** | Labelled contradictions not raised / all labelled | The failure that reaches production |
| **Over-merge rate** | Merges a human labels *distinct* / all merges | §19's second risk, measured |
| **Precedence reproducibility** | Same inputs → byte-identical rationale, across runs | **Target 100%.** Below it is a defect: ADR-0012 exists to make precedence reproducible |
| **Traceability completeness** | Conflicts whose every participant resolves | Target 100% — a defect detector |
| **Unsupported-resolution rate** | Recommendations citing evidence that does not support them | Target 0 |

**And the same limit as V5, restated because it does not go away:** whether a candidate is *really* a
business contradiction is a **semantic judgement**. Synthetic mechanics are defect detectors;
real-world detection quality needs analyst-labelled material and is **V4b-eval's dependency set
applied to a third task**. The report must carry a `notMeasured` field, as V5's does.

---

## 16. Scope

**In:** `CANONICALISE_ENTITIES` per kind · deterministic match-form merging · AI merge candidates ·
candidate detection with the §3 taxonomy · `RECONCILE_SOURCES` per group · deterministic ADR-0012
precedence with rationale · `Conflict` + participants + `requirement_relation`, all undecided ·
`crossSourceAgreement` transitions per §7 · the RAF `conflicts` derived slot · a conflict view
alongside coverage · `L1-CONF-*` · rejection retention · read-only views · a human-authored synthetic
gold set and harness.

**Out:** human conflict resolution · `decision`/`decidedBy`/`decidedAt` · the requirements workspace ·
**G1** · approval · baselines and signatures · the Domain Model Registry as a product surface ·
clarification questions and `SYNTHESISE_QUESTIONS` (unless **Q7-b**) · Process IR · BPMN/DMN/Form
generation · graphical editing · **V4b-eval** · live AI · **V2-PDF** · spreadsheets · **H1**, **H2**,
**H3**.

---

## 17. Approved decisions Q1–Q9

All nine **approved 2026-08-23**, in the approver's lettering.

| # | Decision | Outcome |
|---|---|---|
| **Q1** | Conflict decision state | **Approved: candidates only.** Every V6-created `Conflict` has `decision = null`, there is **no V6 route** that marks one decided or resolved, and it is **enforced in SQL** — the V5 `draft`-only pattern applied where it matters here. Human decisions remain **V7** |
| **Q2** | Canonicalisation scope | **Approved: reconciliation only.** V6's canonical entities are **not** the P3 Domain Model Registry. Existing structures — `BusinessTerm`, `synonyms[]`, `mergedFromIds[]`, `requirementIds[]` — are used where appropriate. Promotion into a Registry is a **future explicit architecture decision** |
| **Q3** | Canonical merge safety | **Approved: conservative.** Exact deterministic match-form equality **may auto-merge**; non-exact semantic equivalence is an **AI candidate only**; no irreversible semantic merge; `mergedFromIds[]` preserved; traceability back to every original term preserved; **over-merge and missed-equivalence rates measured**. An AI suggestion must never silently eliminate a distinct business concept |
| **Q4** | Specificity | **Approved: deterministic or `undetermined`.** Permitted only where objectively testable structure supports it — narrower source/anchor scope, an explicit qualifying condition, other existing deterministic structure. **No heuristic fallback. No arbitrary tie-break** |
| **Q5** | Precedence is a **recommendation** | **Approved.** Code computes the ADR-0012 order (authority → effective date → specificity → epistemic level) and may persist the recommended participant, `proposedResolution`, `precedenceRationale` and **which step produced it**. It **must not** apply it, delete or suppress a requirement, rewrite the set, mark a conflict resolved, or make a human decision |
| **Q6** | Reconciliation-aware confidence | **Approved: compute-on-read.** Accepted V5 rows and their stored confidence are **never mutated**. Both views are preserved — the original stored confidence and a reconciliation-aware derived view. `crossSourceAgreement` **must not** become `corroborated` merely because no conflict was found: **absence of detected conflict is not agreement.** Where V7 human confirmation would be needed, the V6 state stays **provisional** rather than manufacturing corroboration |
| **Q7** | Clarification questions | **Approved: `SYNTHESISE_QUESTIONS` and the human workflow stay V7.** V6 provides the structural inputs — unresolved conflict candidates, V5 ambiguity flags, missing RAF information, source-declared undecided issues where already represented. **No queue, assignment, resolution or interaction workflow in V6** |
| **Q8** | Cross-source classification | **Approved: five distinct outcomes** — `duplicate`, `equivalent`, `complementary`, `potentially_contradictory`, `true_conflict`. **AI may propose** `equivalent`, `complementary` and `potentially_contradictory`. **AI must never establish `true_conflict` as human-settled truth.** Textual difference alone is not conflict, and canonicalisation/context analysis runs **before** classification |
| **Q9** | Coverage | **Approved: V5's implementation is unchanged.** V6 may add reconciliation/conflict views **alongside** coverage. `computeFrameCoverage`, `slotStatus`, `RafGroup` and V5 coverage semantics are **not** reimplemented or redefined, **proved by diff** at acceptance |

### 17.1 One implementation choice the approved list does not cover

**Comparison scope.** This document proposed confining candidate detection to **within a RAF slot**
(and its disjointness partner). That did not appear in the approved Q-list, so it is recorded here as
an **implementation choice, not an approved decision**, and it is reversible: cross-slot comparison
would widen recall at a direct cost to the false-conflict rate, which is the metric this slice can
least afford to inflate (§19, R-V6-1). Raised at acceptance rather than left implicit.

**The validation namespace is in the same position.** This document proposed **`L1-CONF-*`** with no
new validation layer, following the reasoning the approver accepted for **J6** in V5. It is not in the
approved Q-list either. It is implemented on the J6 precedent and **flagged for confirmation at
acceptance**, because rule IDs are permanent and are never renumbered.

**ADR implications.** **No new ADR is required**: Q1, Q4 and Q5 implement ADR-0012 as written; Q3 and
Q6 implement ADR-0016 and ADR-0023; Q2 stays inside the existing module map. **Three things would need
one, and all three are refused:** letting AI resolve a conflict; letting precedence apply itself; and
making a stored confidence input mutable.

---

## 18. Acceptance criteria

| # | Criterion | Demonstrated by |
|---|---|---|
| 1 | Canonicalisation merges **only** on exact match-form equality; every other merge is `ai_proposed` and unconfirmed | Tests per case, including Arabic/English surface forms |
| 2 | A merge across entity kinds or classifications is **refused** | A test per refusal |
| 3 | Every conflict candidate carries **resolving participants**, its detection interaction and its taxonomy outcome | End-to-end tests |
| 4 | **No conflict can be written with a `decision`** — proved against the database, not the command | SQL constraint test, in the V5 style |
| 5 | Precedence is **deterministic and reproducible**, and names which ADR-0012 step decided | Byte-identical rationale across runs |
| 6 | An **undecidable** precedence is reported as undecidable, never tie-broken | A test with equal authority, no dates, equal specificity |
| 7 | `crossSourceAgreement` becomes `corroborated` **only** on human-confirmed equivalence across distinct sources; **never** from "no conflict found" | A test asserting a compared-and-quiet proposition stays `silent` |
| 8 | The RAF `conflicts` slot aggregates **unresolved** conflicts, derived not asserted | Coverage tests |
| 9 | `computeFrameCoverage` and `slotStatus` are **unchanged** — proved by diff, as V5's `RafGroup` claim was | Byte-identical `packages/raf` |
| 10 | **No resolve/accept/reject route exists** | A test asserting 404 on each |
| 11 | Rejected merge and reconciliation candidates are **retained in full** | J9 applied again |
| 12 | `eval:reconcile` reports canonicalisation F1, conflict precision/recall, false-conflict, missed-conflict, over-merge, precedence reproducibility, with tier stated and a `notMeasured` field | Offline run |
| 13 | **CI makes no live call**; verification is complete, nothing skipped or loosened | `npm run verify` |

---

## 19. Risks

**R-V6-1 — false conflicts, and the abandonment they cause.** A detector that flags equivalences as
contradictions produces a queue nobody trusts, and an untrusted queue is abandoned — after which
unresolved conflicts block G1 permanently. *Mitigations:* the five-outcome taxonomy so "different
wording" has somewhere to go that is not "conflict"; canonicalisation **before** detection;
comparison confined to a slot; and false-conflict rate as a first-class metric rather than a
by-product.

**R-V6-2 — over-normalisation, which is silent.** Merging two genuinely distinct concepts does not
produce an error; the second concept simply stops existing, and every requirement that mentioned it
now appears to mention the first. *Mitigations:* deterministic merging only on exact match-form
equality; every semantic merge unconfirmed until a human says so; `mergedFromIds[]` so a merge is
reversible; over-merge rate measured. **This is the risk most likely to do lasting damage**, because
unlike a false conflict it produces no queue to notice.

**R-V6-3 — a recommendation read as a decision.** `proposedResolution` will be deterministic,
explained and usually right, which is exactly what makes it dangerous. *Mitigations:* `decision` null
and refused in SQL; the field named `proposedResolution`; `precedenceRationale` stating *which step*
decided so a reader sees the reasoning rather than a verdict; no route that applies it.

**R-V6-4 — Arabic/English canonicalisation.** The match form folds Alef, Yeh, Teh Marbuta, diacritics
and Tatweel — deliberately aggressive for search, and **aggressive folding merges more than it
should**. Teh Marbuta folding in particular is specified *"for search only"*. Cross-language
equivalence ("الموظف" ≡ "the officer") is a semantic claim no folding establishes. *Mitigations:* the
match form is used for **candidate generation, never for automatic merging across languages**;
bilingual labels required on every canonical entity; and the gold set must contain Arabic, English
and mixed material, or the metric measures English.

**R-V6-5 — conflicts arriving all at once.** The first project to run V6 sees a quiet frame become a
frame with open conflicts blocking G1. That is correct behaviour and it will read as a regression.
*Mitigation:* say so in advance, in the release note and in the status record.

**R-V6-6 — semantic judgement, again.** Whether two propositions really contradict is not mechanically
decidable, exactly as whether a proposition faithfully represents its evidence is not (limitation 63).
Every mechanical metric in §15 is a defect detector. *Mitigation:* the same one V5 uses — say it on
every report, and keep the human decision mandatory.

---

## 20. Dependencies

**None new. Runtime dependencies stay at seven.**

| Need | Met by |
|---|---|
| Match-form normalisation, Arabic folding, offset maps | `@asdp/text` — exists |
| Broker, routing, egress gate, replay | `@asdp/ai` + V4a |
| The shared-gate pattern, rejection retention, focused passes | V5 (`proposal-gate.ts`, `frame-passes.ts`) |
| Requirement proposals to compare | **V5, accepted** |
| Source authority rank and effective date | V1 intake — both exist, and `L0-ING-010` already warns when a date is missing |
| RAF coverage arithmetic | `@asdp/raf` — **imported, not reimplemented** |
| Corpus, gold sets, recordings, metrics | `@asdp/eval` |

**No credential, no corpus procurement, no Docker.** V6 is completable and acceptable offline, as V5
and V4b-core were. It does **not** depend on V4b-eval, H3, V2-PDF or ADR-0037 — but **H3 still blocks
any live provider call**, so V6 is replay-only for the same reason V5 was.

---

## 21. Status

**✅ APPROVED 2026-08-23. Decisions Q1–Q9 all approved**, with the approver's conditions carried into
the plan of record ([phase-2-plan.md](phase-2-plan.md) §3.11):

1. **`decision = null` on every V6 conflict**, enforced in SQL, with no route that resolves one (Q1).
2. **Absence of detected conflict is not agreement** (Q6). Where human confirmation would be needed,
   the state stays **provisional** rather than manufacturing corroboration.
3. **Precedence recommends; it never applies** (Q5).
4. **H3 remains a hard blocker on any live provider call**, so V6 is **replay-only** — implementation,
   tests and evaluation alike.

**ADRs required: none. Dependencies added: none** — seven, unchanged.
