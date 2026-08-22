# Personas and End-to-End Journey

> **Status:** Approved (Phase 0) · **Version:** 1.0 · **Updated:** 2026-08-22
> **Related:** [product-boundary.md](product-boundary.md), [governance-and-gates.md](../50-governance/governance-and-gates.md)

---

## 1. Personas

| Persona | Owns | Needs | Stages |
|---|---|---|---|
| **Business Analyst** — primary user, highest volume | Intake and requirement quality | Upload anything; see what AI understood *and where it came from*; answer clarification questions; resolve conflicts. No BPMN literacy required | 1–3 |
| **Process Architect / Process Engineer** — power user | Specifications | Structured BPS/Decision/Form/Interface editing; pattern reuse; standards conformance; generation directives; review of generated output | 4–8 |
| **Business / Process Owner** — approver | Business truth | Non-technical readable views; source-anchored evidence; diff-only review on revisions; confidence they are not signing AI guesses | Gates G1, G2 |
| **Camunda Developer / Integration Engineer** | Implementation, post-handoff refinement | Unambiguous job types, I/O contracts, error semantics, a package that opens and deploys; a way to feed Camunda-side changes back | 8, 11, post-handoff |
| **QA / Test Designer** | Verification | Path and rule coverage, scenario data, requirement→test mapping | 10 |
| **Compliance / Audit reviewer** — read-only | Evidence | Traceability matrix, provenance, approval records, AI-disclosure report | Cross-cutting |
| **Governance / Platform Admin** | Standards and policy | Naming conventions, connector allow-list, validation rule packs, gate policies, **AI provider routing and data-classification policy**, budgets | Cross-cutting |

Two notes that shape the UI:

- The **Compliance reviewer** is why traceability is a product feature rather than internal
  plumbing. Design the traceability explorer for this persona.
- The **Process Architect's role has changed** from the conventional one: they curate
  specifications and review generated output. They do not draw. Onboarding material must
  address this directly, because it is counter to their existing habits.

## 2. The trace-to-change loop

This is the defining interaction of the product. Every "this is wrong" observation routes to
a cause, and every cause routes to an approved change.

```
   User is reviewing a generated artifact and sees a problem
                          │
                          ▼
            Select element → Inspector opens
   ┌──────────────────────────────────────────────────────┐
   │ WHAT   this element is, in business language          │
   │ WHY    spec object → requirements → evidence quote →  │
   │        source page/cell/region (click to highlight)   │
   │ HOW    validation findings · dependencies · decisions │
   │ TRUST  epistemic level · confidence · which AI        │
   │        provider/model produced the upstream proposal  │
   └──────────────────────────┬───────────────────────────┘
                              ▼
                   [ Propose change ]
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
 REQUIREMENT is wrong    SPEC is wrong        SHAPE is wrong
        │                     │                     │
  edit / re-answer      edit the BPS step,    add a Generation
  a question /          DecisionSpec,         Directive
  add a source          FormSpec, or          (closed vocabulary)
        │               ServiceInterface            │
        ▼                     │                     │
  AI RE-ANALYSIS ────────────►┴─────────────────────┘
        │
        ▼
  IMPACT ANALYSIS (deterministic graph traversal, AI may narrate it)
  "affects 1 BPS step · 3 BPMN elements · 1 DMN rule row ·
   2 form fields · 1 interface · 4 test scenarios"
        │
        ▼
  RE-APPROVAL of affected requirements / specs (gate reopens)
        │
        ▼
  REGENERATION of affected artifacts only → side-by-side diff
        │
        ▼
  VALIDATION → review → new candidate version
```

## 3. Stage-by-stage journey

```
1  INTAKE
   Upload any mix of sources · source inventory with authority ranking ·
   source viewer with region highlighting · interactive Q&A ·
   existing BPMN/DMN/Forms imported structurally
   ─── G0 Intake Sufficiency (advisory, non-blocking) ───

2  AI REQUIREMENTS ANALYSIS
   Multi-pass pipeline (P0–P6). Visible progress, reviewable proposals — not a
   black box. Every pass records which provider and model produced it.

3  STRUCTURED REQUIREMENTS
   The main workspace. Requirement list · split-screen source highlighting ·
   clarification queue · conflict resolution · Analysis Frame coverage dashboard
   ─── G1 Requirements Approved (BLOCKING) ───

4  BUSINESS PROCESS SPECIFICATION
   Structured editor: outline, table, and dependency views. No diagram.
   Every element cites approved requirements.
   ─── G2 BPS Approved (BLOCKING — becomes the design baseline) ───

5–7 GENERATION AND REVIEW
   One action: "Generate process artifacts."
   Then REVIEW, not edit:
     · BPMN viewer with five overlays
     · DMN viewer (DRD + read-only decision tables, rule-row overlays)
     · Form preview — interactive, as an end user would see it
   Any problem → the trace-to-change loop above.

8  INTEGRATION & WORKER SPECIFICATIONS
   Structured editing of service contracts, errors, retries, idempotency.

9  VALIDATION
   Findings grouped by artifact and severity, each pinned to a viewable element,
   each naming the SPEC-LAYER change required to fix it.
   ─── G3 Design Validated (BLOCKING) ───

10 TEST SCENARIO DEFINITION
   Deterministic path and rule enumeration · AI-proposed data · coverage report

11 RELEASE AND HANDOFF
   Package preview ─── G4 Release Approved ─── → HANDOFF
   Release frozen permanently. ASDP's authority over it ends.

── later cycle ──
   Requirements v2 → re-analysis → new candidate →
   DIVERGENCE & IMPACT REPORT against the handed-off baseline and, where
   observed, against the current Camunda state → human review → new release
```

## 4. What "review" means, concretely

Because users cannot repair artifacts by hand, the review surface exists to answer questions
rather than enable actions. Every artifact view provides:

| Capability | Detail |
|---|---|
| **Navigate** | zoom, pan, fit, search element by name (Arabic or English), jump to element, keyboard traversal |
| **Inspect** | the four-part inspector (WHAT / WHY / HOW / TRUST) |
| **Overlay** | traceability density · epistemic level · validation findings · changed-since-version · directive-influenced |
| **Compare** | side-by-side against any prior version, with element-level change marks |
| **Explain** | AI-generated plain-language walkthrough, explicitly labelled as non-authoritative commentary |

Complementary **non-diagram views** are first-class, not extras
([ADR-0015](../adr/ADR-0015-read-only-viewers.md)) — they are required for accessibility, for
RTL content, and because several review questions are answered better by a table than a
diagram:

- **Process outline** — hierarchical text of the whole flow; screen-reader accessible;
  keyboard navigable; diffable
- **Path table** — every route from start to end, with conditions and covering scenarios
- **Decision matrix** — all rules across all decisions in one table
- **Variable flow table** — which element produces and consumes each process variable; the
  most common source of Camunda runtime defects, and something a diagram shows poorly
