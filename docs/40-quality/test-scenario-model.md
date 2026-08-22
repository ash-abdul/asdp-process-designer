# Test Scenario Model

> **Status:** Approved (Phase 0) · **Version:** 1.0 · **Updated:** 2026-08-22
> **Related:** [validation-architecture.md](validation-architecture.md), [process-ir.md](../30-generation/process-ir.md)

The MVP defines scenarios; it does not execute them. Scenario definitions are engine-agnostic
by design so that generating executable tests later is a mechanical step.

---

## 1. Model

```
TestScenario {
  id, projectId, baselineId
  name: LocalizedText, description
  kind      happy | alternate | exception | escalation | boundary
          | rule_coverage | sla | data_variant
  given {
    startPayload           // process variables at start, typed
    startForm?             // start-form values
    actorContext?          // who initiates
    externalState?         // preconditions in external systems (documented, not mocked)
  }
  when[] {                 // ordered interactions
    step      nodeId
    action    complete_task | send_message | fire_timer | fail_job | throw_error
    payload   // form values, message content, error code
    actor?
  }
  then {
    expectedRoute[]        // ordered element IDs the instance should traverse
    expectedOutcome        // which declared end
    expectedOutputs        // process variables at completion, typed
    expectedDecisions[]    // { decisionId, expectedRuleSeq[], expectedOutput }
    expectedNotifications[]
    expectedSlaBehaviour?  // e.g. escalation fires after N
  }
  coverage {
    coveredElementIds[]
    coveredRuleRows[]      // { decisionId, ruleSeq }
    coveredFormFields[]
    coveredRequirementIds[]
    coveredPaths[]
  }
  origin   enumerated | ai_proposed | human_authored
  status   draft | approved
}
```

## 2. Derivation — deterministic first, AI second

| Step | Owner |
|---|---|
| **Path enumeration** over the region tree: happy path, every branch case, every default, every loop (zero/one/many), every exception, every escalation | **Code** |
| **Rule-row enumeration** per decision, including boundary values derived from input domains | **Code** |
| **Coverage skeleton** — the minimal set of scenarios needed to cover all paths and rows | **Code** |
| **Realistic data** for each skeleton slot: plausible values, edge cases, invalid inputs | **AI** (`PROPOSE_TEST_DATA`) |
| Review, edit, extend, approve | Human |
| **Coverage measurement** against the skeleton | **Code** |

Path enumeration over a structured region tree is tractable and complete — another benefit of
the IR's shape ([ADR-0006](../adr/ADR-0006-correct-by-construction-ir.md)). Loops are enumerated
at bounded iteration counts (0, 1, n) rather than exhaustively.

**AI proposes data, never coverage.** Coverage is arithmetic; if an AI decided what "covered"
meant, the L6 gate would be meaningless.

## 3. Coverage definitions

| Coverage | Definition | Gate |
|---|---|---|
| **Path** | Every enumerated path traversed by ≥1 approved scenario | G4 threshold |
| **Rule row** | Every DMN rule row fired by ≥1 scenario | G4 threshold |
| **Requirement** | Every approved requirement verified by ≥1 scenario | G4 threshold |
| **Exception** | Every exception and escalation path exercised | G4 threshold |
| **Form field** | Every form field populated in ≥1 scenario | Informational |
| **Boundary** | Every numeric/date boundary in a decision exercised on both sides | Informational |

Thresholds are set per standards profile. Uncovered items produce L6 findings naming the
specific path or rule row.

## 4. Bilingual test data

- Scenario names and descriptions are `LocalizedText`.
- **Data values must include Arabic content** where the corresponding data field accepts free
  text. A process tested only with ASCII names will fail on the first real Arabic applicant.
- Boundary cases must include: Arabic text with diacritics, mixed Arabic/English strings,
  Arabic-Indic digit input, and RTL text in fields that appear in generated documents.
- This is a **required** property of the AI data proposal, expressed in the task schema, not a
  suggestion.

## 5. Export format

Scenarios export as engine-agnostic JSON in the package under `tests/scenarios/`, with a README
describing how to realise them as Camunda process tests. The export deliberately avoids any test
framework's shape so that the eventual generator has a clean input.

```
tests/
├─ scenarios/
│  ├─ SC-001-happy-path.json
│  ├─ SC-002-rejected-eligibility.json
│  ├─ SC-003-sla-escalation.json
│  └─ …
├─ coverage-report.md          # what is covered, what is not, and why
└─ README.md                   # how to realise these as executable tests
```

## 6. What the MVP does not do

| Not in MVP | Note |
|---|---|
| Executable test generation | The scenario model is the generator's input; deferred by design |
| Test execution against an engine | Requires a cluster; the `DeploymentValidator` port is the eventual home |
| Simulation of external systems | `externalState` is documented, not mocked |
| Performance or load scenarios | Out of scope |
| Coverage measured from real runs | Post-MVP, alongside sandbox execution |

## 7. Test obligations

1. Path enumeration completeness on fixture region trees with known path counts.
2. Rule-row enumeration matches the DecisionSpec row count, including default rules.
3. Coverage arithmetic correctness against hand-verified fixtures.
4. Scenario references validate within the baseline (`L6-TEST-005`).
5. AI-proposed data conforms to declared data field types and constraints, and **includes Arabic
   content** where the field accepts free text.
6. Export round-trip: an exported scenario re-imports to an identical model.
