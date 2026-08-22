# Generation Pipeline

> **Status:** Approved (Phase 0) · **Version:** 1.0 · **Updated:** 2026-08-22
> **Related:** [process-ir.md](process-ir.md), [ai-provider-abstraction.md](../10-architecture/ai-provider-abstraction.md), [requirement-analysis-frame.md](../20-domain/requirement-analysis-frame.md)

The full pipeline from raw source to Camunda-ready package, pass by pass, with the AI/
deterministic split marked at every step.

---

## 1. Overview

```
STAGE 1  INTAKE            deterministic parse → anchors → classification
STAGE 2  ANALYSIS          P0–P6, AI proposals + deterministic frame arithmetic
         ══ G1 ══
STAGE 3  SPECIFICATION     P7 proposal + human editing
         ══ G2 ══
STAGE 4  IR CONSTRUCTION   deterministic mapping + AI refinement + invariant check
STAGE 5  COMPILATION       deterministic: BPMN, DMN, Forms, contracts
STAGE 6  LAYOUT            deterministic geometry + quality metrics
STAGE 7  VALIDATION        L0–L6
         ══ G3 ══
STAGE 8  TEST SCENARIOS    deterministic enumeration + AI data proposal
STAGE 9  PACKAGING         deterministic assembly
         ══ G4 ══ → HANDOFF
```

## 2. Stage 1 — Intake (deterministic)

| Step | Owner | Detail |
|---|---|---|
| Ingest guard | Code | Magic-byte type sniffing, size limits, malware scan, SHA-256 dedupe, immutable blob store |
| Classification | Code + human | Uploader-declared, project default, deterministic detectors ([data-governance.md](../10-architecture/data-governance.md)) |
| Adapter parse | Code | Per source type; produces `SourceUnit`s with anchors and `PageImage`s |
| Text normalisation | Code | NFC, Arabic folding, logical order, language segmentation ([multilingual-architecture.md](../10-architecture/multilingual-architecture.md)) |
| Anchor minting | Code | Resolvable anchors; L0 validation rejects unresolvable ones |
| Structural model import | Code | BPMN/DMN/Form files parsed by moddle — **no AI**, element-level precision |
| Source profiling | **AI** (`PROFILE_SOURCE`) | Kind hint, effective date, summary — a proposal, not a fact |
| Authority ranking | Human | Orders sources; the deterministic input to conflict precedence |

**G0 — Intake Sufficiency (advisory):** reports which RAF slots have no plausible source
coverage. Non-blocking; acknowledged, not approved.

## 3. Stage 2 — AI requirements analysis

Every pass: context assembled by code → egress policy gate → provider routing → schema-
constrained invocation → deterministic post-processing → `Proposal`. Passes are individually
re-runnable and cached by (prompt version, model, input hash), so answering one question does
not re-run extraction.

| Pass | Task | AI role | Deterministic role |
|---|---|---|---|
| **P0** | `PROFILE_SOURCE` | Classify each source | Type sniffing, hashing, dedupe |
| **P1** | `EXTRACT_EVIDENCE` | Verbatim extraction with citations. **Inference forbidden** | Anchor verification; `post_hoc` quote location; rejection of unlocatable quotes |
| **P2** | `CANONICALISE_ENTITIES` | Adjudicate proposed merges of actors, terms, data fields | Near-duplicate detection (match form + similarity); uniqueness; human confirms merges |
| **P3** | `POPULATE_FRAME` | Fill the 27 RAF slots from evidence | Slot schema; **disjointness rules**; per-slot coverage arithmetic; required-slot enforcement |
| **P4** | `RECONCILE_SOURCES` | Detect contradiction candidates and explain them | **Precedence resolution** from authority rank → effective date → specificity; human decides |
| **P5** | `ANALYSE_QUALITY` | Ambiguity, vagueness, untestability, incompleteness | Rule-based checks: vague quantifiers, unnamed actors, missing acceptance criteria, unmeasurable SLAs |
| **P6** | `SYNTHESISE_QUESTIONS` | Draft clarification questions with rationale | Blocking classification; queue routing; gate coupling |

Derived analysis outputs — missing information, ambiguities, conflicts, open questions — are
**computed by code** from the structured pass outputs, never asserted by the model
([requirement-analysis-frame.md](../20-domain/requirement-analysis-frame.md) §2).

### 3.1 Context strategy

Where the routed provider has sufficient context, the **whole corpus** is supplied with a
cacheable stable prefix. Where it does not, the declared degradation applies: structure-aligned
chunking → per-chunk extraction → deterministic merge → reconciliation over summarised chunk
outputs, with the degradation recorded and confidence reduced
([ADR-0022](../adr/ADR-0022-capability-negotiation.md)).

**G1 — Requirements Approved (blocking):** zero blocking flags, zero unresolved conflicts, zero
unanswered blocking questions, all requirements at L4, all required RAF slots non-`empty`, every
LOW-confidence inferred requirement explicitly confirmed, `blocked_by_policy` slots
acknowledged.

## 4. Stage 3 — Specification

| Step | Owner |
|---|---|
| **P7** `DECOMPOSE_PROCESS` — propose ProcessSpec: steps, flows, decision points, exceptions, escalations, integrations, SLAs, KPIs | **AI proposal** |
| `PROPOSE_DECISION_SPEC`, `PROPOSE_FORM_SPEC`, `PROPOSE_INTERFACE_SPEC` | **AI proposal** |
| Review, edit, extend, reject in the Specification Studio | Human |
| **`L4-SPEC-001 … 010` evaluated incrementally on every save** — requirement citation, orphans, spec-level reachability, completeness, actor assignment, triggers and outcomes, outcome exclusivity, repetition and compensation detail, data availability | Code |
| Generation directives | Human, from a closed vocabulary |

P7 consumes **only approved (L4) requirements**. This is the structural expression of "no silent
conversion of vague requirements into executable BPMN".

**G2 — BPS Approved (blocking):** zero `L4-SPEC-*` errors — every specification element cites ≥1
approved requirement, zero orphans, spec-level reachability holds, every decision point has a
business rule, every automated step has an interface, every manual step has a form and an actor,
every decision has a decision spec, ≥1 trigger and ≥1 outcome are declared, outcome exclusivity is
declared where flows can overlap, and repetition/compensation details are complete.

## 5. Stage 4 — IR construction

```
1. deterministic pattern mapping   (pattern-mapping.md)      → IR draft
2. directive application            (generation-directives.md) → IR draft'
3. AI refinement  REFINE_IR         schema-constrained proposal → IR candidate
4. human acceptance of the refinement diff
5. IR INVARIANT CHECK  IR-1 … IR-28                          → blocking
6. store as Artifact{kind: process_ir}
```

If the invariant check fails, the failure is reported as a **specification-level finding** with
the offending elements named and a proposed restructuring. The pipeline never emits an artifact
from an invalid IR, and never silently repairs one.

## 6. Stage 5 — Compilation (fully deterministic)

| Compiler | Input | Output |
|---|---|---|
| `compiler-bpmn` | IR + Camunda target profile | BPMN 2.0 XML with `zeebe:` extensions |
| `compiler-dmn` | DecisionSpec + profile | DMN XML (DRD + decision tables) |
| `compiler-forms` | FormSpec + profile | Camunda form JSON |
| `packaging` (contracts) | ServiceInterface | Per-job-type contract files |

Deterministic in the strict sense: same inputs → byte-identical canonical output → identical
hash, verified in CI ([artifact-model.md](../20-domain/artifact-model.md) §9).

Also emitted by the compilers, not by a later scan: a `compiled_to` trace edge for **every**
element produced, at the granularity in
[traceability-model.md](../20-domain/traceability-model.md) §4.

## 7. Stage 6 — Layout (deterministic)

An established BPMN-aware auto-layout capability from the ecosystem produces the geometry; ASDP adds
only bounded post-processing — chiefly **bilingual label measurement and node sizing**, which no
general tool can provide because it depends on our font stack and display language. Quality metrics
then produce findings. Specified in [layout-architecture.md](layout-architecture.md).

Layout never changes semantics. A layout-tool upgrade produces a **cosmetic** diff and is reported as
such. ASDP builds no layout engine
([ADR-0014](../adr/ADR-0014-layout-safety-critical.md) v2.0).

## 8. Stage 7 — Validation

Layers L0–L6 ([validation-architecture.md](../40-quality/validation-architecture.md)),
including cross-artifact dependency resolution within the baseline and layout-quality rules.
Errors block; warnings require justified waivers.

**G3 — Design Validated (blocking).**

## 9. Stage 8 — Test scenarios

| Step | Owner |
|---|---|
| Path enumeration over the region tree; DMN rule enumeration | Code |
| Coverage skeleton (which paths and rows need scenarios) | Code |
| `PROPOSE_TEST_DATA` — realistic values, boundary and edge cases | **AI proposal** |
| Scenario authoring and acceptance | Human |
| Coverage measurement | Code |

## 10. Stage 9 — Packaging

Deterministic assembly of the Camunda-ready package: artifacts, element templates, interface
contracts, scenarios, generated documentation, traceability matrix, validation report,
**AI-disclosure report**, deviations, and a manifest pinning every version recorded in
[versioning-and-baselines.md](../20-domain/versioning-and-baselines.md) §9.

**G4 — Release Approved** → handoff, freeze, ownership transfer.

## 11. Regeneration path

```
specification change
  → deterministic impact analysis (graph traversal)
    → the affected artifact set ONLY
      → re-run stages 4–7 for those artifacts
        → semantic diff per artifact (structural / contract / cosmetic)
          → review → new candidate version
```

There is no merge step, because there are no human artifact edits to merge. This is the
simplification that the product boundary buys
([ADR-0002](../adr/ADR-0002-spec-layer-editing.md)).

## 12. Where AI touches the pipeline — summary

| Stage | AI involvement |
|---|---|
| 1 Intake | Source profiling only; all parsing and anchoring deterministic |
| 2 Analysis | **Heavy** — P1–P6, all as proposals |
| 3 Specification | **Heavy** — P7 and the three spec proposals, all as proposals |
| 4 IR | **Bounded** — schema-constrained refinement within the pattern table |
| 5 Compilation | **None** |
| 6 Layout | **None** |
| 7 Validation | **None** (may narrate a finding; never decides one) |
| 8 Test scenarios | Data proposal only; enumeration and coverage deterministic |
| 9 Packaging | Draft documentation prose only |

The pipeline's AI involvement decreases monotonically as it approaches executable output. That
gradient is the architecture.
