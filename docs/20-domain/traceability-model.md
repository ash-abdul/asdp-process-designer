# Traceability Model

> **Status:** Approved (Phase 0) · **Version:** 1.0 · **Updated:** 2026-08-22
> **Related:** [ADR-0008](../adr/ADR-0008-resolvable-anchors.md), [epistemic-model.md](epistemic-model.md), [provenance-and-anchoring.md](provenance-and-anchoring.md)

Traceability is a core product capability, not a reporting feature. This document specifies the
graph, the granularity commitments, and the queries the system must answer.

---

## 1. The chain

```
Source Material
  → Requirement
    → Process Step  (specification layer)
      → BPMN Element
      → DMN Decision (+ rule row)
      → Form (+ field)
      → Integration Specification
        → Validation / Test Scenario
```

Expanded to what is actually stored:

```
Source ──contains──▶ SourceUnit ──yields──▶ EvidenceItem
                                                │ supports
                                                ▼
                                          Requirement (L1→L4)
                                                │ realized_by
              ┌─────────────────────────────────┼─────────────────────────────┐
              ▼                                 ▼                             ▼
     SpecStep / SpecFlow /              DecisionSpec                      FormSpec
     SpecDecisionPoint /                 + rule row                        + field
     SpecException /                          │                               │
     SpecEscalation /                         │                               │
     SpecIntegration                          │                               │
              │                               │                               │
              │ realized_by                   │                               │
              ▼                               │                               │
      ServiceInterface                        │                               │
              │                               │                               │
              │ compiled_to      compiled_to  │                  compiled_to  │
              ▼                               ▼                               ▼
        BPMN element                  DMN decision                      Form field
        (task/gateway/event/flow)     + DMN rule row                          │
              │                               │                               │
              └───────────────┬───────────────┴───────────────────────────────┘
                              │ verified_by
                              ▼
                        TestScenario
                              ▲
                              │ covers
                        Finding / ValidationRun ──▶ (targets any node above)
```

Two edges are worth noting because they are easy to omit and expensive to add later:
`GenerationDirective ──influenced──▶ BPMN element` (so a shape decision is attributable to a
human, not to a requirement), and `Finding ──targets──▶ node` (so validation history is part of
the trace record rather than a separate log).

## 2. Edge model

One typed edge table, traversed in both directions.

```
TraceLink {
  fromType, fromId, toType, toId
  kind      contains | yields | supports | refines | conflicts | depends_on
          | realizes | compiled_to | influenced | verifies | targets
          | deviates_from | supersedes | translates
  createdBy  parser | compiler | ai_accepted | human
  rationale?              // required for `deviates_from` and `influenced`
  createdAt
}
```

Edges created by the **compiler** are authoritative and complete: the compiler emits a
`compiled_to` edge for every element it produces, at the granularity in §4. Edges suggested by
AI (`refines`, `depends_on`, `conflicts`) are proposals until accepted.

## 3. Requirement record — the traceability fields

The fields specified in the product brief, plus what the gates and reports require.

| Field | Type | Notes |
|---|---|---|
| `id` | `REQ-####` | Deterministic, never reused, never renumbered |
| `text` | `LocalizedText` | Primary language + translations, each with provenance |
| `originalAiText` | `LocalizedText?` | Pre-edit AI wording, retained for audit |
| `category` | enum | functional, business_rule, data, integration, nfr, security, constraint, assumption, dependency, sla, notification, role |
| `rafSlot` | enum | Which Analysis Frame slot it populates |
| **`evidence[]`** | list | `{ evidenceItemId, sourceId, anchor, verbatimText, sourceType, sourceSection, page, contribution }` |
| **`sourceType`** | enum | Derived from `Source.kind` — brd, sop, policy, spreadsheet, screenshot, diagram_image, bpmn, dmn, transcript, freetext … |
| **`sourceLocation`** | derived | Human-readable rendering of the anchor: "policy.pdf p.7 ¶3", "Rules!B4:F27", "screen-2.png region" |
| **`derivation`** | enum | `extracted` \| `interpreted` \| `inferred` — the extracted-vs-AI-inferred distinction |
| **`epistemicLevel`** | enum | L1 \| L2 \| L3 \| L4 |
| **`confidence`** | band | HIGH \| MEDIUM \| LOW — computed ([epistemic-model.md](epistemic-model.md) §4) |
| `confidenceFactors` | record | The seven inputs, stored so the band is explainable |
| **`humanConfirmationRequired`** | bool | Computed from level + confidence + policy |
| **`status`** | enum | draft, needs_clarification, in_review, approved, rejected, superseded, deferred |
| `approvedBy` / `approvedAt` / `approvalBaselineId` | | The approval that promoted it to L4 |
| **`version` / `supersedesId` / `supersededById` / `changeReason`** | | Full version history; change reason is mandatory |
| `inferenceRationale` | text | Mandatory when `derivation = inferred` |
| `generatedBy` | enum | ai \| human \| parser |
| `aiInteractionId` / `promptVersion` / `providerId` / `modelId` / `capabilityTier` / `degradations[]` | | Which AI, under which policy, produced this |
| `derivedFromRedactedInput` | bool | Recorded because redaction can hide magnitude-dependent implications |
| `classification` | enum | ≥ max of evidence and referenced data fields |

## 4. Granularity commitments

These are acceptance criteria, not aspirations.

| Artifact | Traced at |
|---|---|
| BPMN | **Individual element** — task, gateway, event, sequence flow, boundary event, subprocess |
| DMN | **Decision and individual rule row** |
| Camunda Form | **Individual field** |
| Integration spec | **Individual input/output mapping and error code** |
| Test scenario | Scenario ↔ covered path elements and covered rule rows |
| Validation finding | Finding ↔ the exact element or rule row it targets |
| Generation directive | Directive ↔ every element whose shape it influenced |

Rule-row and field granularity are the expensive commitments and the valuable ones: "which
clause of which policy set this threshold to 5000?" is the question that justifies the product.

## 5. Required queries

The graph must answer each of these directly, without scanning artifacts.

### Backward — "why does this exist?"

| Query | Consumer |
|---|---|
| Element → spec object → requirements → evidence quotes → source region | Artifact inspector (the core review interaction) |
| DMN rule row → business rule → requirement → policy clause | Compliance review |
| Form field → data field → requirement | Form review |
| Generated element → directive + author + rationale | "Why is this a subprocess?" |

### Forward — "what does this affect?"

| Query | Consumer |
|---|---|
| Requirement → all spec objects, artifact elements, rule rows, fields, interfaces, test scenarios | **Impact analysis** — the trace-to-change loop |
| Source → all requirements → all downstream artifacts | Source supersession impact |
| Data field → all forms, decisions, mappings, scenarios | Data model change impact |
| Business rule → all decision rows and steps | Policy change impact |

### Coverage and integrity

| Query | Gate / report |
|---|---|
| Approved requirements with no realisation | G3 precondition (L4 validation) |
| Artifact elements with no requirement (orphans) | **Must be zero.** With no editor, an orphan means a compiler defect — a self-check on our own code |
| Elements resting only on unconfirmed L3 inference | G3 blocking rule; AI-disclosure report |
| Requirements with no verifying test scenario | G4 precondition (L6 validation) |
| Requirements with `blocked_by_policy` provenance | AI-disclosure report |
| Sources a given release ultimately depends on | Release manifest |
| Conflict provenance: which sources disagreed, and on whose authority it was resolved | Audit |
| Requirements derived from redacted or degraded extraction | Release AI-disclosure report |

Impact sets are computed by **graph traversal only**. AI may narrate an impact set; it may
never compute one ([ADR-0004](../adr/ADR-0004-ai-proposes-code-commits.md)).

## 6. Traceability matrix export

One CSV/XLSX per release, bilingual where both forms exist:

```
requirement_id · requirement_text_primary · requirement_language · requirement_text_translation
category · raf_slot · epistemic_level · derivation · confidence
source_file · source_type · source_location · evidence_quote · evidence_language
spec_object_type · spec_object_id · spec_object_name
artifact_kind · artifact_key · element_id · element_name · element_type
dmn_decision_id · dmn_rule_seq
form_id · form_field_key
interface_job_type
test_scenario_ids · covered
validation_findings · waivers
approved_by · approved_at · baseline_hash
ai_provider · ai_model · capability_tier · degradations · redacted_input
```

The matrix is generated deterministically from the graph. It is the artifact an auditor reads,
so it must be complete enough to answer their questions without access to the application.

## 7. Integrity rules

| # | Rule |
|---|---|
| **T1** | Every `EvidenceItem` MUST have a verified anchor (D1) |
| **T2** | Every requirement MUST have evidence or an inference rationale (D2) |
| **T3** | Every specification element MUST cite ≥1 approved requirement (D5) |
| **T4** | Every generated artifact element MUST carry a `compiled_to` edge from a specification element. **Zero exceptions** |
| **T5** | Every `deviates_from` and `influenced` edge MUST carry a rationale |
| **T6** | Trace edges are append-only; superseded edges are marked, never deleted |
| **T7** | A translation is an edge (`translates`), never a replacement of the original |
| **T8** | Orphan count and unrealised-requirement count are computed on every validation run and reported, not merely available on request |
