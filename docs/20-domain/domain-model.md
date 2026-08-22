# Domain Model

> **Status:** Approved (Phase 0) · **Version:** 1.0 · **Updated:** 2026-08-22
> **Related:** [traceability-model.md](traceability-model.md), [epistemic-model.md](epistemic-model.md), [artifact-model.md](artifact-model.md), [versioning-and-baselines.md](versioning-and-baselines.md)

Conceptual model. Field lists show load-bearing attributes only, not full schemas. Type
sketches are illustrative of shape and obligation, not of language syntax.

---

## 1. Bounded contexts

```
┌─ GOVERNANCE ────────────────────────────────────────────────────────────────┐
│ Organization · User · Membership · Project · ProjectSettings · StageState    │
│ Gate · Approval · Baseline · ChangeSet · Waiver · AuditEvent                 │
└─────────────────────────────────────────────────────────────────────────────┘
┌─ INTAKE & EVIDENCE ─────────────────────────────────────────────────────────┐
│ Source · SourceUnit · PageImage · InterviewSession · InterviewTurn           │
│ EvidenceItem                                                                │
└─────────────────────────────────────────────────────────────────────────────┘
┌─ REQUIREMENTS ──────────────────────────────────────────────────────────────┐
│ RequirementSet · Requirement · RequirementFlag · RequirementRelation        │
│ Conflict · OpenQuestion · RafCoverage                                       │
└─────────────────────────────────────────────────────────────────────────────┘
┌─ DOMAIN VOCABULARY ─────────────────────────────────────────────────────────┐
│ BusinessTerm · Actor · DataEntity · DataField · BusinessRule                │
│ BusinessEvent · NotificationSpec                                            │
└─────────────────────────────────────────────────────────────────────────────┘
┌─ SPECIFICATION  (the editable surface) ─────────────────────────────────────┐
│ ProcessSpec · SpecStep · SpecFlow · SpecDecisionPoint · SpecException        │
│ SpecEscalation · SpecIntegration · SpecKpi                                  │
│ DecisionSpec · FormSpec · ServiceInterface · GenerationDirective            │
└─────────────────────────────────────────────────────────────────────────────┘
┌─ GENERATION & ARTIFACTS  (read-only outputs) ───────────────────────────────┐
│ ProcessIR · Artifact · ArtifactVersion · ArtifactDependency                  │
└─────────────────────────────────────────────────────────────────────────────┘
┌─ QUALITY ───────────────────────────────────────────────────────────────────┐
│ ValidationRun · Finding · TestScenario · Coverage                            │
└─────────────────────────────────────────────────────────────────────────────┘
┌─ DELIVERY ──────────────────────────────────────────────────────────────────┐
│ Release · Handoff · CamundaObservation · DivergenceReport                   │
└─────────────────────────────────────────────────────────────────────────────┘
┌─ AI ────────────────────────────────────────────────────────────────────────┐
│ Proposal · AiInteraction · PromptVersion · ProviderRoutingRecord            │
└─────────────────────────────────────────────────────────────────────────────┘
```

The direction of dependency between contexts is strictly one-way, left to right in the
lifecycle: Intake → Evidence → Requirements → Specification → Generation → Quality → Delivery.
Governance and AI are cross-cutting. No downstream context is referenced by an upstream one.

---

## 2. Governance

```
Organization ── User ── Membership { role }

Project {
  key, name: LocalizedText, description
  classificationCeiling                  // max classification this project may hold
  defaultRequirementLanguage             // BCP-47; evidence keeps its own language
}

ProjectSettings {
  standardsProfileId
  gatePolicy                             // per-gate roles, quorum, self-approval, expiry
  camundaTargetProfileId                 // NOT a hard-coded version
  connectorAllowList[]
  aiRoutingOverrides, aiBudget
  allowExternalProviders  bool           // false ⇒ fully on-premise project
  classificationDefault
  strictness  strict | permissive        // strict is the default
}

StageState { stage, status, currentBaselineId, enteredAt }

Gate       { code: G0 | G1 | G2 | G3 | G4, policy, status }

Approval   { gateId, baselineId, approver, roleAtApproval, decision,
             comment, signedBaselineHash, validationRunId, at }

Baseline   { stage, contentHash, frozenAt, memberVersions[] }        // insert-only

ChangeSet  { title, rationale, status, memberVersionIds[], reviewers[] }

Waiver     { findingId, justification, approvedBy, expiresAt }

AuditEvent { actor, rolesAtTime, action, entityType, entityId,
             before, after, at }                                    // append-only
```

An `Approval` binds a signature to an exact `Baseline.contentHash` **and** to the
`ValidationRun` that produced the evidence for it. If either changes, the approval no longer
matches and the gate reopens automatically
([ADR-0017](../adr/ADR-0017-approval-as-baseline-signature.md)).

---

## 3. Intake and evidence

```
Source {
  projectId, filename, mimeType, byteSize, sha256, blobRef, uploadedBy
  kind          brd | srs | sop | policy | spreadsheet | screenshot | diagram_image
              | bpmn | dmn | form | email | transcript | freetext | other
  authorityRank int                      // human-set; drives conflict precedence
  effectiveDate, supersedesSourceId?
  primaryLanguage, languageRuns[]        // bilingual documents are normal
  classification                         // PUBLIC … PROHIBITED
  status        parsing | parsed | parse_failed | superseded
  aiProfile?                             // AI-produced kind hint / summary (a Proposal)
}

SourceUnit {
  sourceId, ordinal
  type      heading | paragraph | listItem | tableCell | image | sheetRange
          | bpmnElement | dmnRule | formField | transcriptTurn
  text                                   // NFC, logical order; null for pure-image units
  language, direction
  anchor    ProvenanceAnchor             // see provenance-and-anchoring.md
}

PageImage { sourceId, pageNo, blobRef, width, height }

InterviewSession ── InterviewTurn { question, answer, answeredBy,
                                    respondingToQuestionId? }

EvidenceItem {                           // IMMUTABLE — never edited, only re-extracted
  sourceId, anchor, verbatimText, language
  rafSlotHint
  extractedBy     parser | ai
  aiInteractionId?
  citationMode    native | post_hoc | none
  anchorVerified  bool                   // MUST be true to persist (D1)
  classification                         // inherited from source; may be raised
  createdAt
}
```

`EvidenceItem` is the **only** bridge between raw sources and requirements. Nothing may skip
it. This is what makes the traceability guarantee structural rather than procedural.

---

## 4. Requirements

Full field semantics in [traceability-model.md](traceability-model.md) §3 and
[epistemic-model.md](epistemic-model.md).

```
RequirementSet { projectId, version, status, rafVersion }

Requirement {
  id  REQ-####                           // deterministic; never reused, never renumbered
  requirementSetId
  text: LocalizedText, originalAiText?   // pre-edit AI text retained for audit
  category   functional | business_rule | data | integration | nfr | security
           | constraint | assumption | dependency | sla | notification | role
  rafSlot                                // which Analysis Frame slot it populates
  priority   must | should | could | wont
  acceptanceCriteria[]                   // required for testability (L6)

  // ── provenance ───────────────────────────────────────────────────────────
  epistemicLevel  L1 | L2 | L3 | L4
  derivation      extracted | interpreted | inferred
  evidence[]      { evidenceItemId, contribution }
  inferenceRationale?                    // REQUIRED when derivation = inferred
  confidence      HIGH | MEDIUM | LOW
  confidenceFactors { extractionMode, evidenceCount, sourceAuthority,
                      crossSourceAgreement, anchorPrecision,
                      providerCapabilityTier, degradationPenalty }
  humanConfirmationRequired  bool        // computed from level + confidence + policy

  // ── lifecycle ────────────────────────────────────────────────────────────
  status  draft | needs_clarification | in_review | approved | rejected
        | superseded | deferred
  approvedBy, approvedAt, approvalBaselineId
  version, supersedesId, supersededById, changeReason

  // ── AI work provenance ───────────────────────────────────────────────────
  generatedBy  ai | human | parser
  aiInteractionId?, promptVersion?
  providerId?, modelId?, capabilityTier?, degradations[]
  derivedFromRedactedInput  bool
  classification
}

RequirementFlag     { requirementId, kind, severity: blocking | warning | info,
                      detail, raisedBy: ai | human | rule,
                      resolution, resolvedBy, resolvedAt }

RequirementRelation { fromId, toId, kind: refines | conflicts | depends_on | duplicates }

Conflict            { topic, participants[requirementId | evidenceItemId],
                      detectedBy, proposedResolution, precedenceRationale,
                      decision, decidedBy, decidedAt }

OpenQuestion        { rafSlot, question: LocalizedText, whyItMatters,
                      blocking, proposedAnswer, affectedRequirementIds[],
                      answer, answeredBy, answeredAt, becameSourceUnitId? }

RafCoverage         { requirementSetId, slot, itemCount, evidenceCount,
                      confidenceBand, requiredForExecutability,
                      status: empty | weak | adequate | blocked_by_policy }
```

`RafCoverage.status = blocked_by_policy` is important: a slot empty because data governance
forbade reading the relevant document must never be reported as a gap in the source material
([data-governance.md](../10-architecture/data-governance.md) §3.1).

An answered `OpenQuestion` becomes a `SourceUnit` in the interview transcript
(`becameSourceUnitId`), so a requirement derived from a human answer has provenance exactly as
strong as one derived from a document.

---

## 5. Domain vocabulary

The shared, bilingual vocabulary that all downstream layers reference. Built during analysis,
reused by every specification and every generated artifact.

```
BusinessTerm     { termEn, termAr, definition: LocalizedText, synonyms[],
                   mergedFromIds[], requirementIds[] }

Actor            { name: LocalizedText, kind: human_role | system | external_party,
                   description, candidateGroupExpr, requirementIds[] }

DataEntity       { name: LocalizedText, description, requirementIds[] }

DataField        { entityId,
                   name         (ASCII)          // FEEL/variable-safe identifier
                   displayName: LocalizedText    // Arabic/English label
                   type, required, constraints,
                   piiFlag, classification, retention, requirementIds[] }

BusinessRule     { code BR-###, statement: LocalizedText,
                   kind: decision | constraint | derivation, requirementIds[] }

BusinessEvent    { name: LocalizedText,
                   kind: start | message | timer | error | signal | escalation,
                   trigger, requirementIds[] }

NotificationSpec { trigger, channel, recipients[actorId], template: LocalizedText,
                   requirementIds[] }
```

The `DataField.name` / `displayName` split is the single most consequential detail in this
section. ASCII identifiers keep FEEL expressions, job types, connector configuration, worker
code, and logs safe; Unicode display names keep Arabic labels intact
([ADR-0024](../adr/ADR-0024-ascii-identifiers-unicode-names.md)).

---

## 6. Specification layer — the editable process surface

Deliberately contains **no BPMN vocabulary**: no "gateway", "sequence flow", "boundary event",
"lane", "pool" ([ADR-0009](../adr/ADR-0009-technology-neutral-bps.md)). A business owner must
be able to approve this without knowing BPMN, and the same specification must remain valid if
the target engine ever changes.

```
ProcessSpec {
  key, name: LocalizedText, goal, scope
  scopeExclusions[]                      // ★ from RAF slot scopeAndExclusions
  triggers[] {                           // ★ plural — a process may start in several ways
    kind      manual_submission | message | scheduled | signal
    detail, formRef?, eventRef
  }
  preconditions[], outcomes[]
  ownerActorId, version, status
}

SpecStep {
  processSpecId, seq, name: LocalizedText, description
  kind   manual | automated | decision | wait | subprocess | notification
  actorId
  inputFieldIds[], outputFieldIds[]
  slaTarget?, escalationId?
  repetition       none | per_item | until_condition | while_condition   // ★
  repetitionDetail { collectionFieldId?, condition?, concurrency? }      // ★
  compensationOf?  stepId                // ★ this step undoes that step's effect
  businessRuleIds[]
  requirementIds[]                       // ≥1 required (D5)
}

SpecFlow          { fromStepId, toStepId, condition,
                    kind: sequence | conditional | parallel, requirementIds[] }
                    // ★ `parallel` is now the ONLY way to express concurrency;
                    //    it is a business statement approved at G2

SpecDecisionPoint { name: LocalizedText, businessRuleId, inputFieldIds[],
                    outcomes[] { label: LocalizedText, targetStepId },
                    outcomeExclusivity  exclusive | multiple,          // ★
                    resolution          rule_based | first_event,      // ★
                    requirementIds[] }

SpecException     { stepId | processSpecId,        // ★ may be scoped to a stage or the process
                    condition, handling,
                    handlingStyle  attached | separate_path,           // ★
                    interrupts     bool,                               // ★
                    compensationStepId?,                               // ★
                    requirementIds[] }

SpecEscalation    { stepId, afterDuration, toActorId, action,
                    interrupts bool,                                   // ★
                    recurring  bool,                                   // ★ periodic reminder
                    requirementIds[] }

SpecIntegration   { stepId, systemName, direction, dataContract,
                    syncOrAsync, requirementIds[] }

SpecKpi           { name: LocalizedText, definition, target, requirementIds[] }
                    // ★ now sourced from RAF slot successMeasures
```

★ = added in the Phase 0 corrections. These fields exist because six decisions previously expressed
as **generation directives** carried business semantics and were moved into the specification, where
they are approved at G2 rather than applied at generation time
([ADR-0013](../adr/ADR-0013-generation-directives.md) v2.0). The word "gateway" appears nowhere in
this schema, by design ([ADR-0009](../adr/ADR-0009-technology-neutral-bps.md)).

### 6.1 Artifact-shaped specifications

Each generated artifact family has exactly one editable specification counterpart
([ADR-0002](../adr/ADR-0002-spec-layer-editing.md)).

```
DecisionSpec {
  processSpecId, decisionPointId, businessRuleIds[], name: LocalizedText
  inputs[]  { dataFieldRef, typeRef, allowedValues? }
  outputs[] { dataFieldRef, typeRef }
  hitPolicy UNIQUE | FIRST | PRIORITY | ANY | COLLECT | RULE_ORDER | OUTPUT_ORDER
  rules[]   { seq, inputEntries[], outputEntries[], annotation: LocalizedText,
              businessRuleId, requirementIds[] }      // rule-ROW-level traceability
  completenessReport, overlapReport                   // computed by exact algorithm
}

FormSpec {
  specStepId, boundEntityId, title: LocalizedText
  sections[] { title: LocalizedText, order,
               fields[] { dataFieldRef, component, label: LocalizedText,
                          helpText: LocalizedText, order, required, validation,
                          readOnly, requirementIds[] } }               // FIELD-level
}

ServiceInterface {
  specStepId
  jobType (ASCII)
  implType connector | custom_worker
  connectorTemplateId?
  inputMappings[], outputMappings[]
  errorCodes[], retries, backoff, timeout
  idempotencyKeyExpr, authMode, endpointRef
  requirementIds[]
}

GenerationDirective {                    // the ONLY influence on artifact shape
  scope { processSpecId | specStepIds[] | specFlowIds[] }
  kind, parameters
  rationale                              // REQUIRED — this is a recorded design decision
  status active | superseded | rejected_by_validation
  createdBy, createdAt
}
```

Vocabulary and semantics for `GenerationDirective.kind` are specified in
[generation-directives.md](../30-generation/generation-directives.md).

---

## 7. Generation, quality and delivery (summary)

Detailed elsewhere; listed here for context completeness.

| Entity | Specified in |
|---|---|
| `ProcessIR` | [process-ir.md](../30-generation/process-ir.md) |
| `Artifact`, `ArtifactVersion`, `ArtifactDependency` | [artifact-model.md](artifact-model.md) |
| `ValidationRun`, `Finding` | [validation-architecture.md](../40-quality/validation-architecture.md) |
| `TestScenario`, `Coverage` | [test-scenario-model.md](../40-quality/test-scenario-model.md) |
| `Release`, `Handoff`, `CamundaObservation`, `DivergenceReport` | [handoff-and-divergence.md](../50-governance/handoff-and-divergence.md) |
| `Proposal`, `AiInteraction`, `PromptVersion`, `ProviderRoutingRecord` | [ai-provider-abstraction.md](../10-architecture/ai-provider-abstraction.md), [audit-and-compliance.md](../50-governance/audit-and-compliance.md) |

---

## 8. Domain invariants

Enforced in `packages/domain` — not in the UI, and not in database constraints alone. Each is
unit-tested in isolation.

Several invariants are **also** expressed as validation rules with stable IDs, so the same condition
is both unreachable and explicable: the invariant prevents the state, the rule reports it in the
validation report, in a citable form, in the reviewer's language
([validation-architecture.md](../40-quality/validation-architecture.md) §8).

| # | Invariant | Rationale |
|---|---|---|
| **D1** | `EvidenceItem` is immutable and MUST have a verified, resolvable anchor | Traceability is verifiable, not asserted ([ADR-0008](../adr/ADR-0008-resolvable-anchors.md)) |
| **D2** | A `Requirement` at L1/L2 MUST reference ≥1 `EvidenceItem`; at L3 it MUST carry an `inferenceRationale` | No unsourced content without disclosure |
| **D3** | Only a human-initiated command may set `epistemicLevel = L4` | AI cannot approve ([ADR-0007](../adr/ADR-0007-epistemic-ladder.md)) |
| **D4** | G1 is blocked while any blocking flag, unresolved `Conflict`, unanswered blocking `OpenQuestion`, or non-L4 requirement exists in the set | No silent conversion of vague requirements |
| **D5** | Every `SpecStep`, `SpecFlow`, `SpecDecisionPoint`, `SpecException`, `SpecEscalation`, `SpecIntegration`, `SpecKpi` MUST cite ≥1 **approved** requirement, or G2 is blocked. Also reported as `L4-SPEC-001` | Specification is derived, not invented |
| **D6** | `SpecStep.kind = automated` requires a `ServiceInterface`; `manual` requires a `FormSpec` and an actor; `decision` requires a `DecisionSpec` — or **G2** is blocked. Also reported as `L4-SPEC-005` / `L4-SPEC-006` | Completeness before generation |
| **D7** | `DataField.name`, `ServiceInterface.jobType`, and all generated artifact identifiers MUST be ASCII-safe | Runtime safety across FEEL, connectors, workers, logs |
| **D8** | `Baseline`, `Approval`, `Release`, `Handoff`, `AuditEvent`, `EvidenceItem` are insert-only | Immutability of the governance record |
| **D9** | No command mutates an `ArtifactVersion`; artifacts are produced only by compilers | The product boundary ([ADR-0002](../adr/ADR-0002-spec-layer-editing.md)) |
| **D10** | A `Requirement`'s classification is ≥ the maximum classification of its evidence and referenced data fields | Classification can only rise ([data-governance.md](../10-architecture/data-governance.md)) |
| **D11** | Editing an approved upstream entity marks dependent downstream entities `stale` and reopens the affected gate | Change flows forward, visibly |
| **D12** | A `Release` in state `handed_off` is frozen — no command may alter it or its member versions | Camunda owns it now ([ADR-0018](../adr/ADR-0018-handoff-ownership-boundary.md)) |
| **D13** | Every persisted text value is NFC-normalised and language-tagged | Bilingual correctness ([ADR-0023](../adr/ADR-0023-unicode-bilingual-architecture.md)) |
| **D14** | A `Proposal` may be created only by the AI broker, and applied only by an explicit human-initiated command | AI has no write authority ([ADR-0004](../adr/ADR-0004-ai-proposes-code-commits.md)) |
| **D15** | Requirement IDs are allocated from a per-project monotonic sequence and are never reused, even after deletion or rejection | Stable citation across releases |

---

## 9. Identifier conventions

| Entity | Format | Notes |
|---|---|---|
| Requirement | `REQ-0001` | Per project, monotonic, never reused |
| Business rule | `BR-001` | Per project |
| Open question | `Q-001` | Per project |
| Conflict | `CF-001` | Per project |
| Validation finding | `<ruleId>@<targetRef>` | Deterministic, so a finding is stable across runs |
| Artifact | `<kind>:<key>` | Key doubles as the Camunda process/decision/form ID |
| Generated element | ASCII `NCName` slug + discriminator | e.g. `Activity_verify_identity_1` |
| Baseline / version | content hash (SHA-256 over canonical form) | Not a sequence number |
| Release | semver | `major` = incompatible process contract change |
