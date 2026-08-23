# Validation Rule Catalogue v1.2

> **Status:** Approved (Phase 0) · **Version:** 1.2 (rule pack `rp-1.2`) · **Updated:** 2026-08-22
> **Revision:** v1.2 adds the **`L4-SPEC-*` group** (10 rules, blocking G2), splits `L2-DMN-003`,
> upgrades `L2-FORM-003` and `L6-TEST-007` to ERROR, gate-scopes `L4-TRACE-004`, and adopts the
> `gates[]` / `severityByGate` model. `L5-LAYOUT-002/003` are **deliberately unchanged**, pending
> Spike S4 evidence.
> **Related:** [validation-architecture.md](validation-architecture.md)

**Severity principle:** **ERROR** blocks the applicable gate, no waiver possible · **WARNING** may
proceed only where policy permits and with an explicit, justified, approved acknowledgement ·
**INFO** informational only.

Rule IDs are stable, ASCII, and **never reused or renumbered**. `Gates` names the gates a rule
participates in; where severity differs by gate it is shown as `G3:W → G4:E`.

---

## L0 — Ingestion integrity

| ID | Sev | Gates | Check |
|---|---|---|---|
| `L0-ING-001` | E | G1 | Source parsed successfully; parse failure is not silently tolerated |
| `L0-ING-002` | E | G1 | Every `SourceUnit` anchor resolvable and its quote checksum verifies |
| `L0-ING-003` | E | G1 | Every `EvidenceItem` anchor resolvable (`anchorVerified = true`) |
| `L0-ING-004` | E | G1 | Extracted text is NFC-normalised and language-tagged |
| `L0-ING-005` | W | G1 | Page count or content length suggests truncation during extraction |
| `L0-ING-006` | E | G1 | Every source has a classification assigned |
| `L0-ING-007` | W | G1 | Scanned/vision-read pages recorded as such (confidence ceiling applies) |
| `L0-ING-008` | W | G1 | Arabic PDF extraction produced a low-confidence reordering result |
| `L0-ING-009` | E | G1 | An imported BPMN/DMN/Form file parses under the declared schema |
| `L0-ING-010` | I | G1 | A source has no `effectiveDate`, weakening conflict precedence |

## L1 — Schema and structural

| ID | Sev | Gates | Check |
|---|---|---|---|
| `L1-SCH-001` | E | all | Entity validates against its schema |
| `L1-SCH-002` | E | G3 | Generated BPMN validates against the BPMN schema |
| `L1-SCH-003` | E | G3 | Generated DMN validates against the DMN schema |
| `L1-SCH-004` | E | G3 | Generated form validates against the Camunda form schema |
| `L1-SCH-005` | E | all | All identifiers unique within the artifact |
| `L1-SCH-006` | E | all | All identifiers ASCII `NCName`-safe |
| `L1-SCH-007` | E | G3 | Canonical serialisation is stable (reserialise → identical hash) |
| `L1-SCH-008` | E | G3 | Process IR validates against the IR schema |

*`L1-SCH-002..004` should be unreachable given a correct compiler; a violation is reported as an
internal error.*

### `L1-REQ` — requirement proposals ★ new in V5 (decision **J6**)

| ID | Sev | Gates | Check |
|---|---|---|---|
| `L1-REQ-001` | E | G1 | Requirement cites ≥1 `EvidenceItem` (**D2**) |
| `L1-REQ-002` | E | G1 | Every cited evidence anchor still resolves ([ADR-0008](../adr/ADR-0008-resolvable-anchors.md)) |
| `L1-REQ-003` | E | G1 | Requirement classification ≥ the maximum over its cited evidence (**D10**) |
| `L1-REQ-004` | E | G1 | Requirement sits in the slot the v1.1 disjointness rules assign it |
| `L1-REQ-005` | I | G1 | Requirement rests only on `image_region` evidence — target-verified, never content-verified ([ADR-0038](../adr/ADR-0038-target-versus-content-verification.md)) |

**Why L1 and not a new layer.** L0 is *ingestion integrity* and a requirement is not an ingestion
artefact; L1 is *"Schema & structural"* at all gates, which is what these are — structural invariants
over an entity. An eighth layer would be a larger change than five rules justify.

**Why the family is only five.** Requirement *quality* signals — vague quantifier, actor unknown,
untestable, unverifiable — are **`RequirementFlag`s, not rules** (**J6**). §3 of
[requirement-analysis-frame.md](../20-domain/requirement-analysis-frame.md) derives the `ambiguities`
slot from flags, and G1's criterion is *"0 blocking **flags**"*, so blocking-ness belongs to the flag.

*`L1-REQ-001`, `003`, `004` and `005` should be **unreachable**: the V5 proposal gate refuses those
writes, so a violation is an internal error rather than a user error. `L1-REQ-002` is genuinely
reachable — an anchor can drift after a proposal is written.*

## L2 — Semantic model

| ID | Sev | Gates | Check |
|---|---|---|---|
| `L2-IR-001` | E | G3 | All IR invariants **IR-1 … IR-28** hold ([process-ir.md](../30-generation/process-ir.md) §6) |
| `L2-IR-002` | E | G3 | Variable availability: no read of a possibly-undefined variable (IR-28) |
| `L2-IR-003` | E | G3 | Every path terminates in a declared outcome (IR-4) |
| `L2-IR-004` | E | G3 | No unreachable region or node |
| `L2-IR-005` | E | G3 | Every declared message, error, escalation and signal reference resolves; codes unique |
| `L2-IR-006` | E | G3 | `Branch{inclusive}` used only where the specification declares non-exclusive outcomes (IR-18) |
| `L2-IR-007` | E | G3 | A scope-local error outcome has a matching interruption on its owning subprocess, or satisfies the profile's propagation rules (IR-6) |
| `L2-IR-008` | W | G3 | A non-interrupting event handler writes a variable the main flow reads — a race condition (IR-27) |
| `L2-IR-009` | E | G3 | Every compensation pairing references an activity that can complete before its trigger, and an action node used by exactly one pairing |
| `L2-FEEL-001` | E | G3 | Every FEEL expression parses |
| `L2-FEEL-002` | E | G3 | FEEL expression types conform to bound data field types where statically decidable |
| `L2-FEEL-003` | W | G3 | FEEL expression references an identifier not in the variable set |
| `L2-DMN-001` | E | G3 | Decision inputs/outputs bind to registered data fields |
| `L2-DMN-002` | E | G3 | Hit policy is legal for the rule set |
| **`L2-DMN-003a`** ★ | **E** | G3 | **Decision table incomplete under hit policy `UNIQUE` or `FIRST` with no default rule** — an uncovered input is a guaranteed runtime failure |
| **`L2-DMN-003b`** ★ | W | G3 | Decision table incomplete under any other hit policy — an empty result may be legitimate |
| `L2-DMN-004` | E | G3 | Overlapping rules with differing outputs under `UNIQUE`/`ANY` |
| `L2-DMN-005` | W | G3 | Dead rule (unsatisfiable given input domains) |
| `L2-DMN-006` | W | G3 | Subsumed rule under an order-sensitive hit policy |
| `L2-DMN-007` | I | G3 | Completeness cannot be proven (unbounded input domain) and no default rule exists |
| `L2-FORM-001` | E | G3 | Every field key resolves to a registered data field |
| `L2-FORM-002` | E | G3 | Component is compatible with the bound field type |
| **`L2-FORM-003`** ★ | **E** *(was W)* | G3 | **Generated form field key not bound to the Domain Model Registry.** With no form editor, an unbound key can only originate in a `FormSpec` or compiler defect — it is not correctable by a business user within ASDP, and is the documented route by which variable-name mismatches reach production |
| `L2-FORM-004` | E | G3 | Field validation contradicts the data field's constraints |

## L3 — Camunda executability

| ID | Sev | Gates | Check |
|---|---|---|---|
| `L3-CAM-001` | E | G3 | Camunda static compatibility lint passes for the active target profile |
| `L3-CAM-002` | E | G3 | Every service task has a non-empty ASCII job type |
| `L3-CAM-003` | E | G3 | Every user task has exactly one linked form, present in the baseline |
| `L3-CAM-004` | E | G3 | Every business rule task has a resolvable decision reference with a declared result variable |
| `L3-CAM-005` | E | G3 | Every call activity resolves to a process key in the baseline |
| `L3-CAM-006` | E | G3 | Every construct used is supported by the active target profile |
| `L3-CAM-007` | E | G3 | Applied element templates exist, are allow-listed, and are correctly bound |
| `L3-CAM-008` | E | G3 | Message-based constructs declare a correlation key |
| `L3-CAM-009` | E | G3 | Timer expressions valid for the profile |
| `L3-CAM-010` | E | G3 | Error boundary/end events declare a non-empty error code |
| `L3-CAM-011` | W | G3 | Retry count is the profile default and was never explicitly specified |
| `L3-CAM-012` | E | G3 | IO mapping references only declared variables |
| `L3-CAM-013` | W | G3 | Multi-instance construct has no bounded collection reference |
| `L3-CAM-014` | I | G3 | Static validation only — not deployment-verified (present until a `DeploymentValidator` adapter exists) |

## L4-SPEC — Specification integrity ★ new in v1.2 · blocks **G2**

The G2 gate approves the technology-neutral Business Process Specification. These conditions were
previously enforced only as domain invariants D5/D6, with no rule identity — absent from the
validation report, uncitable, untrackable, untranslatable. Every rule below names the
**specification-level** remediation, because that is the only kind available.

| ID | Sev | Gates | Check | Remediation |
|---|---|---|---|---|
| `L4-SPEC-001` | E | G2 | Every specification element (`SpecStep`, `SpecFlow`, `SpecDecisionPoint`, `SpecException`, `SpecEscalation`, `SpecIntegration`, `SpecKpi`) cites ≥1 **approved** requirement | Cite an approved requirement, or remove the element. If the requirement is real but unapproved, return to G1 |
| `L4-SPEC-002` | E | G2 | Zero orphan specification elements — none unreferenced by any flow, decision outcome, or handler | Connect the element into the flow, or remove it |
| `L4-SPEC-003` | E | G2 | Specification-level reachability: every step is reachable from a declared trigger, and every step reaches a declared outcome | Add the missing flow, or remove the unreachable step |
| `L4-SPEC-004` | E | G2 | Every `SpecDecisionPoint` references a `BusinessRule` | Add the business rule; if none exists, the decision may be a simple conditional flow instead |
| `L4-SPEC-005` | E | G2 | Every `automated` step has a `ServiceInterface`; every `manual` step has a `FormSpec`; every `decision` step has a `DecisionSpec` | Create the missing specification in the Specification Studio |
| `L4-SPEC-006` | E | G2 | Every `manual` step names an actor | Assign an actor from the Domain Model Registry |
| `L4-SPEC-007` | E | G2 | The `ProcessSpec` declares ≥1 trigger and ≥1 outcome | Declare how the process starts and how it ends |
| `L4-SPEC-008` | E | G2 | Where two or more conditional flows from one step can be simultaneously true, `SpecDecisionPoint.outcomeExclusivity` is explicitly declared | Declare `exclusive` or `multiple`. It is **never** inferred — concurrent outcomes are a business statement |
| `L4-SPEC-009` | E | G2 | `SpecStep.repetition` declares its collection field or condition; `compensationOf` references an existing step that can complete before the compensation trigger | Complete the repetition detail, or correct the compensation pairing |
| **`L4-SPEC-010`** | **G2:W → G3:E** | G2, G3 | **Specification-level data availability:** every input field a step reads is produced by an upstream step or a trigger | Add the producing step, or correct the field references. A warning at G2 because the specification may still be under construction; an error at G3 because it is the precursor of IR-28 and of a runtime incident |

## L4-TRACE — Traceability and completeness

| ID | Sev | Gates | Check |
|---|---|---|---|
| `L4-TRACE-001` | E | G3 | Every generated artifact element has a `compiled_to` edge to a specification element (T4) |
| `L4-TRACE-002` | E | G3 | Every specification element cites ≥1 approved requirement (mirrors `L4-SPEC-001` at artifact level) |
| `L4-TRACE-003` | E | G3 | **Zero orphan elements.** A non-zero count indicates a compiler defect |
| **`L4-TRACE-004`** ★ | **G3:W → G4:E** | G3, G4 | **Approved requirement with no realisation and no explicit deferral.** Work-in-progress at G3; at G4 it means shipping a release that does not implement something a business owner approved. Resolved by realising it, or marking it `deferred` with a reason |
| `L4-TRACE-005` | E | G3 | No executable element rests solely on unconfirmed L3 inference |
| `L4-TRACE-006` | W | G3 | Requirement realisation coverage below the profile threshold |
| `L4-TRACE-007` | E | G3 | Every DMN rule row traces to a business rule and a requirement |
| `L4-TRACE-008` | E | G3 | Every form field traces to a requirement |
| `L4-TRACE-009` | W | G3 | Orphan artifact (form/decision referenced by nothing) |
| `L4-TRACE-010` | I | G3 | Requirements derived from redacted or degraded extraction (disclosure) |
| `L4-TRACE-011` | W | G3 | Requirement whose supporting source has been superseded |

## L5 — Governance and standards

| ID | Sev | Gates | Check |
|---|---|---|---|
| `L5-STD-001` | W | G3 | Element naming violates the standards profile convention |
| `L5-STD-002` | E | G3 | Connector used is not on the allow-list |
| `L5-STD-003` | W | G3 | Required documentation field empty on a generated artifact |
| `L5-STD-004` | E | G3 | Unresolved blocking comment thread |
| `L5-STD-005` | E | G3 | Expired waiver present |
| `L5-STD-006` | W | G3 | Job type does not follow the profile's naming convention |
| `L5-PII-001` | E | G3 | PII-flagged data field has no declared handling |
| `L5-PII-002` | W | G3 | PII-flagged field rendered in a form without a masking or consent rule |
| `L5-PII-003` | W | G3 | PII-flagged field written to a process variable with a broader scope than required |
| `L5-LAYOUT-001` | W | G3 | Edge crossings per node above threshold |
| `L5-LAYOUT-002` | **E** | G3 | Label collision — diagram not reviewable. **Unchanged in v1.2, pending Spike S4** |
| `L5-LAYOUT-003` | **E** | G3 | Node overlap. **Unchanged in v1.2, pending Spike S4** |
| `L5-LAYOUT-004` | W | G3 | Edge-length variance above threshold |
| `L5-LAYOUT-005` | W | G3 | Backward edge outside a reserved channel |
| `L5-LAYOUT-006` | W | G3 | Nodes per visual band above threshold |
| `L5-LAYOUT-007` | W | G3 | Diagram aspect ratio outside the acceptable range |
| `L5-LAYOUT-008` | W | G3 | Total nodes in one diagram above threshold — propose subprocess extraction |
| `L5-I18N-001` | W | G3 | Missing translation for the project display language on a generated label **or a rule message** |
| `L5-I18N-002` | E | G3 | Non-ASCII character in a technical identifier, job type, or FEEL identifier |
| `L5-I18N-003` | W | G3 | Mixed-direction label composed without bidi isolation |
| `L5-DIR-001` | W | G3 | Generation directive rejected during IR construction |
| `L5-DIR-002` | I | G3 | Directive-influenced elements present (disclosure of human shape decisions) |
| `L5-DIR-003` | E | G3 | `pin_technical_identifier` used on a project with no prior handoff |
| `L5-AI-001` | I | G3 | Analysis Frame slot `blocked_by_policy` — governance prevented analysis |
| `L5-AI-002` | W | G3 | Requirement produced by a provider below the profile's minimum quality tier for its language |

## L6 — Testability

| ID | Sev | Gates | Check |
|---|---|---|---|
| `L6-TEST-001` | W | G4 | Path with no covering scenario |
| `L6-TEST-002` | W | G4 | DMN rule row with no covering scenario |
| `L6-TEST-003` | W | G4 | Approved requirement with no verifying scenario |
| `L6-TEST-004` | W | G4 | Exception or escalation path with no covering scenario |
| `L6-TEST-005` | E | G4 | Scenario references an element or rule row absent from the baseline |
| `L6-TEST-006` | W | G4 | Scenario has no expected outputs (unverifiable) |
| **`L6-TEST-007`** ★ | **E** *(was W)* | G4 | **Aggregate coverage below the profile threshold for G4.** One clean gate condition instead of hundreds of individual blocking findings. The threshold is set in the standards profile — the rule only enforces the bar you set |

---

## Tally

| Severity | Count |
|---|---|
| ERROR | 72 |
| WARNING | 33 |
| INFO | 7 |
| Gate-scoped (`L4-SPEC-010`, `L4-TRACE-004`) | 2 |
| **Total** | **114** |

By layer: L0 = 10 · **L1 = 13** (8 SCH + **5 REQ**) · L2 = 24 · L3 = 14 · **L4 = 21** (10 SPEC + 11
TRACE) · L5 = 25 · L6 = 7.

**Implemented in code today: 15** — the ten `L0-ING` rules (V1) and the five `L1-REQ` rules (V5).
The rest are catalogued and not yet implemented, because each arrives with the slice that creates the
content it judges.

## Notes on catalogue growth

- Rule IDs are **never reused or renumbered**. A retired rule is marked `deprecated` and keeps its
  ID, so historical findings and waivers remain interpretable.
- Every new rule requires: a catalogue entry, positive and negative fixtures, a documented rationale,
  a **specification-level** remediation, and **message plus fix-hint entries in both catalogue
  languages** ([validation-architecture.md](validation-architecture.md) §5).
- Severity may be adjusted per standards profile, but ERROR rules guarding structural integrity —
  `L1-*`, `L2-IR-*`, **`L4-SPEC-001…009`**, `L4-TRACE-001/003/005`, `L5-I18N-002` — are **not**
  profile-adjustable.
- Gate-scoped severity is the exception, not the pattern. Two rules use it; adding a third requires a
  stated reason.

## Deliberately deferred

| Item | Status | Revisit |
|---|---|---|
| `L5-LAYOUT-002` label collision · `L5-LAYOUT-003` node overlap — proposal to downgrade to WARNING at G3, ERROR at G4 | **Not applied. Both remain ERROR at G3** | After **Spike S4**, which will show how often these actually fire with ecosystem layout tooling. The argument for downgrading (one collision should not stall design validation) and against (validating a design nobody can read is meaningless) both depend on frequency data we do not yet have. Encoding a guess in a gate is worse than waiting |
