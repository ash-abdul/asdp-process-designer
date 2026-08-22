# Decision Generation — DecisionSpec to DMN

> **Status:** Approved (Phase 0) · **Version:** 1.0 · **Updated:** 2026-08-22
> **Related:** [ADR-0012](../adr/ADR-0012-deterministic-conflict-precedence.md), [product-boundary.md](../00-product/product-boundary.md), [process-ir.md](process-ir.md)

Per Phase 0 decision 7: **business users do not manipulate generated DMN structures or values.**
Decision intent, business rules, and rule values originate from requirements, structured
requirements, and the DecisionSpec. DMN is a generated, reviewable artifact; detailed DMN
editing belongs to Camunda tools after handoff.

---

## 1. Where decisions come from

Three origins, only one of which is AI-driven:

| Origin | Mechanism | Epistemic level |
|---|---|---|
| **Requirements** | `SpecDecisionPoint` + `BusinessRule` → AI proposes a `DecisionSpec` | L2/L3 until approved |
| **Spreadsheet rules matrices** | A detected decision-table range in an ingested spreadsheet is parsed **deterministically** into a candidate `DecisionSpec` with cell-level anchors | L1 evidence per cell |
| **Existing DMN files** | Parsed by `dmn-moddle`; decisions and rule rows extracted structurally, no AI | L1 evidence per rule row |

The second origin is a significant real-world capability. A rules matrix in Excel is the most
common actual source of decision logic in enterprise processes, and importing it deterministically
with **cell-level provenance** means a generated rule row can be traced to a specific spreadsheet
cell — which is exactly the audit question that gets asked.

## 2. Pipeline

```
BusinessRule + SpecDecisionPoint  (+ imported table, if any)
        │
        │  AI: PROPOSE_DECISION_SPEC — inputs, outputs, hit policy, rule rows in FEEL
        │      (schema-constrained proposal; rule-row-level review)
        ▼
   DecisionSpec  (human-editable — this is the editable decision surface)
        │
        │  DETERMINISTIC ANALYSIS — no AI:
        │    · input/output binding validity against the Domain Model Registry
        │    · FEEL parse of every cell
        │    · type conformance of every entry
        │    · hit-policy legality against the rule set
        │    · COMPLETENESS  — uncovered regions of the input space
        │    · OVERLAP       — rule pairs that can both fire
        │    · dead rules, subsumed rules, contradictory rules
        ▼
   compiler-dmn → DMN XML (DRD + decision tables)
        │
        ▼
   dmn-js Viewer  — READ-ONLY: DRD, decision tables, literal expressions,
                    with rule-row overlays for traceability and findings
```

## 3. Completeness and overlap analysis — exact, not AI

This is the highest-confidence quality signal the product can produce, and it is precisely what
humans get wrong in rule matrices.

| Analysis | Method |
|---|---|
| **Completeness** | Interval/partition decomposition over each input's domain (enumerations, numeric ranges, boolean, date ranges); the cross-product is checked for uncovered regions; each gap is reported as a concrete input combination |
| **Overlap** | Pairwise satisfiability of rule conditions; any pair that can both fire is reported. Illegal under `UNIQUE`; informational under `COLLECT`/`RULE_ORDER` |
| **Dead rules** | A rule whose condition is unsatisfiable given the input domains |
| **Subsumption** | A rule entirely covered by an earlier rule under an order-sensitive hit policy |
| **Contradiction** | Overlapping rules producing different outputs under `UNIQUE` or `ANY` |
| **Hit-policy legality** | `UNIQUE` with overlaps → error; `ANY` with differing outputs on overlap → error; `PRIORITY`/`OUTPUT_ORDER` without declared output ordering → error |

Results are **cached on the DecisionSpec** (`completenessReport`, `overlapReport`) and shown
**live while editing**, not only at validation time. A rule author needs to see the gap as they
create it.

Where the input domain is unbounded (free-text, arbitrary numbers with no declared range),
completeness is reported as *"cannot be proven complete — no default rule"* and the absence of a
default is raised as a finding. Honest partial analysis beats a false green.

## 4. Generated DMN scope

| In scope (MVP) | Out of scope (MVP) |
|---|---|
| Decision tables | Boxed expressions beyond literal expressions |
| Literal expressions | Business Knowledge Models (BKMs) |
| Single- and two-level DRDs | Deep DRD hierarchies |
| All standard hit policies | DMN-level iteration/looping |
| Input data elements bound to the Domain Model Registry | Free-typed inputs not bound to a data field |

## 5. Traceability granularity

Rule-row level, non-negotiable
([traceability-model.md](../20-domain/traceability-model.md) §4):

```
DMN rule row
  → DecisionSpec rule row
    → BusinessRule
      → Requirement
        → EvidenceItem (policy clause / spreadsheet cell / DMN import)
          → Source region (page + bbox / sheet cell / element+rule id)
```

In the viewer, selecting a rule row shows this chain, its epistemic level, its confidence, and
any findings targeting it.

## 6. FEEL handling

- Every input entry, output entry, and literal expression is **parsed at design time**.
  Unparseable FEEL is an L2 validation error, never a runtime surprise.
- Type checking against the bound `DataField` types is performed where statically decidable.
- FEEL identifiers are **ASCII** because `DataField.name` is ASCII
  ([ADR-0024](../adr/ADR-0024-ascii-identifiers-unicode-names.md)). Arabic labels appear in
  annotations and display names, never in expressions.
- Arabic text **values** inside FEEL string literals are fully supported and must round-trip
  through canonical serialisation unchanged (NFC).
- The FEEL dialect and available built-ins are selected by the **Camunda target profile**.

## 7. How a user changes a rule value

The interaction that Phase 0 decision 7 makes explicit:

```
Reviewer sees, in the read-only DMN viewer, that a threshold should be 7000, not 5000
  → selects the rule row → Inspector shows: DecisionSpec row → BusinessRule BR-014 →
    REQ-0087 → policy.pdf p.12
  → [ Propose change ]
      · if the policy says 7000 and we mis-extracted → correct REQ-0087 (an evidence
        or interpretation defect), re-approve, regenerate
      · if the policy changed → add the new policy version as a source, re-analyse,
        supersede REQ-0087, re-approve, regenerate
      · if the value is a specification-level parameter not fixed by policy → edit the
        DecisionSpec rule row directly, cite the requirement, re-approve, regenerate
  → completeness/overlap re-analysed automatically
  → semantic diff shows a single rule-row change
```

In all three cases the DMN itself is regenerated, never edited. The distinction between the
three cases is exactly the distinction the product exists to preserve: a wrong value can be a
mis-extraction, a policy change, or a design parameter, and these have different governance
consequences.

## 8. Decisions inlined instead of externalised

The pattern table permits a trivial decision to compile to an inline gateway condition rather
than a DMN call ([pattern-mapping.md](pattern-mapping.md) §1). Constraints:

- permitted only when the DecisionSpec has a single rule row, `UNIQUE` hit policy, no reuse by
  another process, and ≤2 outcomes;
- a standards profile may forbid it entirely, so that every decision remains externally
  auditable;
- the `decision_realisation` directive (`mode: rule_table | inline_condition`) lets an architect
  choose either way, with a recorded rationale
  ([generation-directives.md](generation-directives.md) §4).

## 9. Test obligations

1. Golden fixtures per Camunda target profile for every hit policy.
2. Completeness analysis correctness on a labelled fixture set with known gaps.
3. Overlap analysis correctness on known-overlapping fixtures, including numeric boundary cases
   (`<= 5000` vs `> 5000` vs `>= 5000`).
4. Spreadsheet → candidate DecisionSpec round-trip with cell-level anchor resolution.
5. Existing-DMN import producing rule-row-level evidence.
6. Arabic annotation and Arabic string-value round-trip through canonicalisation.
7. FEEL parse rejection surfaces as an L2 finding pinned to the exact cell.
