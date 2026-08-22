# Requirement Analysis Frame (RAF) v1.1

> **Status:** Approved (Phase 0) · **Version:** 1.1 (RAF schema version `raf-1.1`) · **Updated:** 2026-08-22
> **Revision:** v1.1 supersedes v1.0. Merged 2 overlapping slots, added 3 missing slots, added
> **disjointness rules** to eliminate coverage double-counting, and made source provenance
> explicit at slot level.
> **Related:** [ADR-0010](../adr/ADR-0010-raf-deterministic-schema.md), [traceability-model.md](traceability-model.md)

The RAF turns "analyse the requirements" into a fixed schema with slots. **Code owns the slots;
AI fills them; code measures what is empty.** Gap analysis is therefore arithmetic over a known
schema — reproducible, explainable to an auditor, and immune to the model simply not mentioning
something.

---

## 1. What changed in v1.1

| Change | Reason |
|---|---|
| **Merged** `complianceAndPolicyBasis` into `constraints` as a required `constraintKind` attribute | The two overlapped; a regulatory constraint fitted both, producing either a false gap or false adequacy |
| **Merged** `openIssuesFromSources` into the derived `openQuestions` as `origin: source_declared` | It was a source of the same output, not a separate dimension |
| **Added** `scopeAndExclusions` | BRDs routinely state "out of scope: X". Previously lost or mis-filed under constraints |
| **Added** `successMeasures` | **`SpecKpi` had no upstream slot** — a BPS element type with no analysis source. That was a traceability hole |
| **Added** `currentStateProcess` | An imported legacy BPMN or diagram had nowhere to live as "the process today" as distinct from "the process required". This broke the modernisation use case |
| **Split** `outputs` (data produced) from `outcomes` (business end states) | They populate different things: `DataField` vs `ProcessSpec.outcomes` |
| **Added disjointness rules** (§4) for the four previously overlapping pairs | Coverage arithmetic counted items twice or left a paired slot falsely empty |
| **Added** `sourceInventory` to every slot value | Makes source provenance visible per slot, not only per requirement |

Net: 25 → **27 core slots**, with the ambiguity removed.

---

## 2. Slot catalogue

`Req` = required for executability: an empty required slot blocks G1.

### A. Business context — *why does this service exist, and what is it?*

| # | Slot | Business question | Req | Populates |
|---|---|---|---|---|
| 1 | `businessObjective` | What outcome does this serve? Why is it worth doing? | ✔ | `ProcessSpec.goal` |
| 2 | `serviceDescription` | What is the service, in a paragraph a business owner would accept? | ✔ | `ProcessSpec.description` |
| 3 | `scopeAndExclusions` | What is explicitly **not** included? | | `ProcessSpec.scope`, `Requirement(constraint)` |
| 4 | `successMeasures` | How will we know it is working? What is measured, and against what target? | | **`SpecKpi`** |
| 5 | `currentStateProcess` | How is this done today, if at all? | | Evidence-only; informs decomposition. **Never generated from** |

### B. Participants — *who is involved?*

| # | Slot | Business question | Req | Populates |
|---|---|---|---|---|
| 6 | `actors` | Which human roles, systems, and external parties exist? | ✔ | `Actor` |
| 7 | `responsibilities` | Who is accountable, responsible, consulted, informed — for **which** step or decision? | | `SpecStep.actorId`, RACI report |

### C. Process behaviour — *what happens, in what order?*

| # | Slot | Business question | Req | Populates |
|---|---|---|---|---|
| 8 | `trigger` | What starts it? Can it be started in more than one way? | ✔ | `ProcessSpec.triggers[]`, `BusinessEvent(start)` |
| 9 | `preconditions` | What must be true before it can start? | | `ProcessSpec.preconditions` |
| 10 | `processSteps` | The **primary** path: what work, in what order, by whom | ✔ | `SpecStep`, `SpecFlow` |
| 11 | `alternativePaths` | Named legitimate deviations from the primary path | | `SpecFlow(conditional)`, `SpecStep` |
| 12 | `outcomes` | What business end states exist, including unsuccessful ones? | ✔ | `ProcessSpec.outcomes`, IR `outcomes[]` |

### D. Decisions and rules — *what determines behaviour?*

| # | Slot | Business question | Req | Populates |
|---|---|---|---|---|
| 13 | `businessRules` | Which policies constrain or determine behaviour? | | `BusinessRule` |
| 14 | `decisions` | Where is a determination made, on what inputs, with what possible results? | | `SpecDecisionPoint`, `DecisionSpec` |

### E. Data — *what information moves?*

| # | Slot | Business question | Req | Populates |
|---|---|---|---|---|
| 15 | `inputs` | What information or documents enter? | ✔ | `DataEntity`, `DataField` |
| 16 | `outputs` | What information or documents are produced, and for whom? | ✔ | `DataField`, `FormSpec` |
| 17 | `dataRequirements` | What is created, read, updated, retained — and for how long? | ✔ | `DataEntity`, `DataField` |

### F. Interaction with the outside — *who else is involved?*

| # | Slot | Business question | Req | Populates |
|---|---|---|---|---|
| 18 | `integrations` | Which external systems, in which direction, synchronous or not? | | `SpecIntegration`, `ServiceInterface` |
| 19 | `notifications` | Who is told what, when, through which channel? | | `NotificationSpec` |

### G. Time, failure, and recovery

| # | Slot | Business question | Req | Populates |
|---|---|---|---|---|
| 20 | `slasAndTimers` | What time limits apply, measured how, from when? | | `SpecStep.slaTarget`, IR `AwaitTime` |
| 21 | `exceptions` | What can go wrong, and what happens then? Does anything need undoing? | | `SpecException`, compensation |
| 22 | `escalations` | Who takes over, or is informed, when a limit or threshold is breached? | | `SpecEscalation` |

### H. Quality and control

| # | Slot | Business question | Req | Populates |
|---|---|---|---|---|
| 23 | `nonFunctionalRequirements` | Volume, peak load, performance, availability, retention, auditability | | `Requirement(nfr)` |
| 24 | `securityAndPrivacy` | Authentication, authorisation, confidentiality, personal data handling | | `Requirement(security)`, `DataField.classification` |

### I. Framing

| # | Slot | Business question | Req | Populates |
|---|---|---|---|---|
| 25 | `dependencies` | What must exist elsewhere for this to work? | | `Requirement(dependency)` |
| 26 | `assumptions` | What are we taking as given, unverified? | | `Requirement(assumption)` |
| 27 | `constraints` | What cannot change — and on whose authority? | | `Requirement(constraint)`, `BusinessRule` |

`constraints` carries a required attribute:
`constraintKind: legal | regulatory | policy | contractual | technical | organisational`.
When the kind is `legal`, `regulatory`, `policy`, or `contractual`, a **citation to the mandating
instrument is required** — this is the merged `complianceAndPolicyBasis`, and it is the field an
auditor asks about.

---

## 3. Derived slots — computed, never AI-filled

| Derived slot | Computation |
|---|---|
| `missingInformation` | Slots that are `empty`, `weak`, or `blocked_by_policy`, weighted by `requiredForExecutability` |
| `ambiguities` | Aggregation of `RequirementFlag` where kind ∈ {ambiguous, vague_quantifier, actor_unknown, untestable, unverifiable} |
| `conflicts` | Aggregation of unresolved `Conflict` records |
| `openQuestions` | Generated from the three above, **plus** issues the sources themselves declare undecided (`origin: source_declared`) |

This is the structural point: **the four things the AI is asked to identify — missing information,
ambiguities, conflicts, open questions — are computed by code from the AI's structured output, not
asserted by the AI.** A model that forgets to mention a gap cannot hide it, because the gap is the
absence of a slot value.

---

## 4. Disjointness rules — new in v1.1

Four slot pairs previously overlapped, so an item assigned to one left the other falsely empty, or
was assigned to both and inflated coverage. Assignment is now deterministic:

| Pair | Rule |
|---|---|
| `actors` ↔ `responsibilities` | `actors` records **that a participant exists** (identity, kind, group expression). `responsibilities` records **an accountability relation** between a participant and a specific step or decision. A statement naming a participant with no duty attached goes to `actors` only |
| `processSteps` ↔ `alternativePaths` | `processSteps` holds the **primary path plus every step reachable on any path**. `alternativePaths` holds only the **named deviation and its entry condition**. Steps are never duplicated into `alternativePaths` |
| `exceptions` ↔ `escalations` | `exceptions` = something **went wrong** and must be handled. `escalations` = a **time limit or threshold** was reached and responsibility transfers or someone is informed. A timeout that transfers responsibility is an escalation; a failed integration call is an exception |
| `outcomes` ↔ `outputs` | `outcomes` = **business end states** ("approved", "rejected", "withdrawn"). `outputs` = **information or documents produced**. A produced document is never an outcome |

A frame item that genuinely satisfies both members of a pair is assigned to the **first** slot in
each row above, and cross-referenced rather than duplicated. Coverage arithmetic counts an item
once.

---

## 5. Slot record

```
RafSlotValue {
  requirementSetId, slot                 // one of the 27
  items[] { requirementId }
  evidenceCount                          // distinct evidence items across those requirements
  distinctSourceCount
  sourceInventory[] {                    // ★ v1.1 — provenance visible per slot
    sourceId, sourceKind, primaryLanguage,
    authorityRank, itemCount
  }
  confidenceBand                         // weakest-link over items
  epistemicMix { l1, l2, l3, l4 counts }
  status  empty | weak | adequate | blocked_by_policy
  blockedReason?                         // classification + provider that was denied
}
```

`sourceInventory` answers, per slot: *which documents told us this, in which language, at what
authority?* Previously that required traversing every requirement in the slot. It is also what
makes the coverage dashboard answer "our SLA information comes only from one low-authority email"
at a glance.

### 5.1 Status determination (deterministic, unchanged from v1.0)

```
status =
  blocked_by_policy   if an egress denial prevented analysis of the sources that
                      would populate this slot
  empty               if items.length == 0
  weak                if items.length > 0 AND (
                          evidenceCount == 0                     // all inferred
                       OR distinctSourceCount == 1 AND requiredForExecutability
                       OR confidenceBand == LOW
                       OR epistemicMix.l3 > epistemicMix.l1 + epistemicMix.l2 )
  adequate            otherwise
```

`blocked_by_policy` takes precedence over `empty` and is rendered differently: "we were not
permitted to read this" is a fundamentally different finding from "the sources do not say"
([data-governance.md](../10-architecture/data-governance.md) §3.1).

---

## 6. Source provenance

Provenance is **structural, not a slot**. It is carried at three levels, and all three are
required:

| Level | Mechanism |
|---|---|
| **Evidence** | Every `EvidenceItem` has a verified, resolvable anchor with verbatim quote, checksum, language, direction, and precision ([provenance-and-anchoring.md](provenance-and-anchoring.md)) |
| **Requirement** | `evidence[]`, `sourceType`, `sourceLocation`, `derivation`, `epistemicLevel`, `confidence`, and AI-work provenance (provider, model, capability tier, degradations) |
| **Slot** | `sourceInventory[]` — which sources contributed, in which language, at what authority ★ v1.1 |

There is deliberately no `provenance` slot: making provenance a slot would imply it could be
empty. It cannot — a requirement with no evidence and no inference rationale cannot be persisted
(domain invariant D2).

---

## 7. Coverage dashboard semantics

Per slot: status, item count, evidence count, distinct sources, **source inventory**, confidence
band, epistemic mix, and — where not `adequate` — the specific generated question that would
resolve it.

| Condition | Effect |
|---|---|
| Any `requiredForExecutability` slot is `empty` | **G1 blocked** |
| Any `requiredForExecutability` slot is `weak` | G1 requires explicit acknowledgement with justification |
| Any slot is `blocked_by_policy` | G1 requires explicit acknowledgement; recorded in the release AI-disclosure report |
| Non-required slots `empty` | Informational only |

Required slots: `businessObjective`, `serviceDescription`, `actors`, `trigger`, `processSteps`,
`outcomes`, `inputs`, `outputs`, `dataRequirements`. Nine of twenty-seven — deliberately the
minimum set without which an executable process cannot be generated at all.

---

## 8. Source-type coverage

| Source type | Slots typically populated | Notes |
|---|---|---|
| Free text | Any | Char-range anchors; the analyst's own framing |
| BRD / SRS | Most of A, C, D, E, H, I | Requirement-table detection; existing REQ-IDs honoured; `scopeAndExclusions` is usually explicit here |
| SOP | C, F, G, B | Clause-path anchors; strongest source for steps and responsibilities |
| Policy / regulation | 27 `constraints` (with `constraintKind`), 13 `businessRules`, 24 | The citation requirement on regulatory constraints exists for these |
| PDF / Word | Any | English routine; Arabic depends on Spike S2 |
| Spreadsheet | 13, 14, 17 | Decision-table detection feeds `DecisionSpec` with **cell-level** anchors |
| Image / screenshot | 15, 16, 17 | Vision extraction, `image_region` anchors, capped at L2. Screenshot→form reconciliation |
| Process diagram (image) | **5 `currentStateProcess`**, 10, 11 | Capped at L2, element-wise confirmation mandatory. v1.1 gives it a proper home |
| Existing BPMN / DMN | **5 `currentStateProcess`**, 10, 13, 14 | Deterministic parse, element/rule-row anchors, no AI, very high precision |
| Interview transcript | Any | An answered question is evidence like any other |
| Arabic / English mixed | Any | Per-run language segmentation; quotes retained verbatim in source language; `sourceInventory` records language per source |

The `currentStateProcess` slot is what makes diagram and legacy-model import genuinely useful: as-is
content is captured and traceable **without being mistaken for a requirement**, and the
decomposition pass can be told to treat it as context rather than instruction.

---

## 9. Bilingual behaviour

- Slot **names and definitions** are localised for display; slot **keys** are ASCII and stable.
- Slot values are requirements carrying their own `LocalizedText`; evidence keeps its source
  language.
- Prompts are English (stable, cache-friendly) and instruct the model to quote evidence **verbatim
  in the source language**.
- Coverage arithmetic is language-independent by construction — it counts requirements and
  evidence, not words.
- `sourceInventory` records `primaryLanguage` per contributing source, so "all our SLA evidence is
  Arabic and unverified by an Arabic speaker" is visible.

---

## 10. Versioning and extensibility

- The RAF is versioned (`raf-1.1`). A `RequirementSet` records the version it was analysed under.
- Slots may be **added** in a new version. Existing slots are never renamed or repurposed; merged
  slots are recorded in the version history above so old sets remain interpretable.
- A standards profile may mark additional slots required, or add **profile-specific slots** in a
  namespace that cannot collide with core slots.
- Content matching no slot goes to `unclassified` with a review flag. It is **never dropped** — an
  unmatched requirement signals that the frame needs extending.

---

## 11. Why owning the frame in code matters

1. **Reproducibility** — the same corpus analysed twice yields the same coverage report, even if
   the prose differs.
2. **Provider independence** — a weaker or on-premise model fills the same slots, so coverage is
   comparable across providers, which is what makes routing decisions measurable
   ([ADR-0020](../adr/ADR-0020-ai-provider-abstraction.md)).
3. **Auditability** — "how do you know something was missing?" has a mechanical answer: the slot
   was empty, here is the question we asked about it, and here is who answered.
