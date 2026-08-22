# Camunda 8 Integration

> **Status:** Approved (Phase 0) · **Version:** 1.0 · **Updated:** 2026-08-22
> **Related:** [ADR-0025](../adr/ADR-0025-camunda-version-profiles.md), [ADR-0026](../adr/ADR-0026-static-validation-first.md), [ADR-0018](../adr/ADR-0018-handoff-ownership-boundary.md)

Per Phase 0 decision 3: target **Camunda 8.x**, do not tightly couple to a specific minor
release, and make version-specific generation and validation rules configurable and versioned.

---

## 1. Version-agnostic core, versioned profiles

```
      ┌──────────────────────────────────────────────────────────────┐
      │  Process IR  —  CAMUNDA-VERSION-NEUTRAL                      │
      │  Region tree · nodes · variables · boundaries · references    │
      │  No zeebe: attributes. No BPMN element names. No FEEL dialect │
      └───────────────────────────┬──────────────────────────────────┘
                                  │  consults
                     ┌────────────▼─────────────┐
                     │ CAMUNDA TARGET PROFILE   │
                     │ (versioned data, not code)│
                     └────────────┬─────────────┘
             ┌────────────────────┼────────────────────┐
             ▼                    ▼                    ▼
       compiler-bpmn        compiler-dmn        validation L3
       (element names,      (DMN version,       (lint rules,
        zeebe: shapes)       expression lang)    supported constructs)
```

**Only the compilers and the L3 validation pack consult the profile.** The IR, the specification
layer, the requirements layer, traceability, and layout are all version-neutral. A new Camunda
minor release is therefore a new profile plus fixtures — not a code change through the stack.

## 2. Camunda target profile

```
CamundaTargetProfile {
  id                     "camunda-8x-<n>"           // opaque; not parsed for semantics
  displayName
  minorRange             declared applicability
  status                 supported | preview | deprecated

  bpmn {
    supportedElements[]                              // which constructs may be generated
    userTaskImplementation                           // profile-declared strategy
    extensionNamespace, extensionShapes              // zeebe: attribute shapes per element
    multiInstanceShape
    boundaryEventSupport { error, timer, message, escalation, signal }
    compensationSupport
  }
  dmn {
    dmnVersion, expressionLanguage
    supportedHitPolicies[]
    supportedBoxedExpressions[]
  }
  forms {
    formSchemaVersion
    supportedComponents[]
  }
  feel {
    builtins[], dateTimeSemantics, nullSemantics
  }
  validation {
    lintPackageVersion                               // Camunda's own compatibility lint, pinned
    lintRuleOverrides
  }
  connectors {
    templateSetRef                                   // bundled element templates for this profile
  }
  limits {
    maxNestingDepth, maxNodesPerDiagram              // feeds IR-17 / IR-18
  }
}
```

Profiles are **data**, stored in `packages/camunda-profiles`, versioned, and selected per
project (`ProjectSettings.camundaTargetProfileId`). Profile IDs are opaque strings; no code
parses a version number to infer behaviour, because that is how version coupling creeps back in.

### 2.1 Profile capability negotiation

Where a construct is available in some 8.x releases and not others, the profile declares it and
the pipeline reacts deterministically:

| Situation | Behaviour |
|---|---|
| IR uses a construct the profile does not support | **IR-19 fails.** A specification-level finding names the construct and the profile, and proposes an alternative from the pattern table |
| Profile offers two realisations of the same intent | The profile declares which one this profile uses; the compiler does not choose |
| A profile is `deprecated` | Projects on it are flagged; a migration report shows what would change under a newer profile |

## 3. Generation fidelity

| Mechanism | Purpose |
|---|---|
| Camunda's own model layer (`bpmn-moddle`, `dmn-moddle`, and the Zeebe extension moddle) | Output is byte-compatible with Camunda Modeler; artifact fidelity is not something we approximate |
| Profile-declared extension shapes | `zeebe:` attributes emitted exactly as the target release expects |
| Element templates as **data** | Official connector templates are imported and consumed by the compiler; the allow-list is admin-controlled; template-bound properties are generated, never free-typed. There is no template-authoring UI |
| Canonical serialisation | Stable hashes and reviewable diffs ([artifact-model.md](../20-domain/artifact-model.md) §3) |

## 4. Validation strategy — static first

Per [ADR-0026](../adr/ADR-0026-static-validation-first.md), and because sandbox availability is
**TBD**:

| Available now | Deferred |
|---|---|
| Camunda's static compatibility lint, pinned per profile | Live deploy-and-discard dry run |
| Own profile-construct rules | Real deployment rejection capture |
| FEEL parse and static type check | Runtime behaviour verification |
| Element-template conformance | Connector credential/connectivity checks |
| Cross-artifact dependency resolution | Scenario execution against an engine |

L3 findings carry the qualifier *"validated statically; not deployment-verified"*
(`L3-CAM-014`) until a `DeploymentValidator` adapter exists. Overstating the guarantee would be
worse than lacking it.

### 4.1 The `DeploymentValidator` port

```
DeploymentValidator {
  validate(packageRef, profile) → { accepted, rejections[], engineVersion, at }
}
```

Constraints when an adapter is eventually built:

- targets an **isolated sandbox cluster only**, declared as such in configuration;
- deploy-and-discard; no process instances started;
- **no write path to any non-sandbox environment may exist in the codebase**
  ([ADR-0018](../adr/ADR-0018-handoff-ownership-boundary.md));
- result recorded on the `ValidationRun`, upgrading L3 from static to verified;
- absence of the adapter must never block a gate — it changes the *qualifier* on L3, not its
  ability to pass.

## 5. Handoff, not deployment

ASDP produces a **package**. It does not deploy.

```
package/
├─ manifest.json          asdpVersion · projectId · baselineHash · camundaTargetProfileId
│                         · artifact inventory + hashes · approvals · pinned versions
├─ bpmn/                  <process-key>.bpmn
├─ dmn/                   <decision-key>.dmn
├─ forms/                 <form-key>.form
├─ element-templates/     templates referenced by the models
├─ interfaces/            <job-type>.contract.json  (I/O schema, errors, retries,
│                         idempotency, auth mode, endpoint reference)
├─ tests/                 scenarios/ · coverage-report.md · README.md
├─ docs/
│  ├─ requirements.md              approved SRS (bilingual where available)
│  ├─ business-process-spec.md     approved BPS
│  ├─ traceability-matrix.csv      REQ → spec → element/rule/field → test, with sources
│  ├─ ai-disclosure.md             what rests on inference · degraded/redacted extraction
│  │                               · blocked_by_policy slots · provider per content group
│  ├─ directive-log.md             human shape decisions with rationale
│  ├─ validation-report.md         findings, waivers, and the static-validation qualifier
│  ├─ deviations.md                documented divergence (second cycle onward)
│  └─ HANDOFF.md                   ownership transfer statement + feedback instructions
└─ CHANGELOG.md
```

The `bpmn/ dmn/ forms/ element-templates/` layout follows the Camunda Modeler project
convention, so the archive opens directly in Desktop Modeler with no restructuring.

## 6. `HANDOFF.md` — the ownership statement

Included in every package, and deliberately explicit:

- ASDP was the source of truth for this design **up to this release**.
- **Camunda is now the source of truth** for technical refinement of these artifacts.
- ASDP will never overwrite changes made in Camunda.
- If requirements change, ASDP will produce a **new candidate** and a divergence report; it will
  not patch what was handed off.
- To have Camunda-side changes recognised in the next cycle, **re-upload the current artifacts**
  into ASDP as an observation ([handoff-and-divergence.md](handoff-and-divergence.md)).

## 7. Deferred integrations

| Capability | Port | Phase |
|---|---|---|
| Sandbox deployment dry run | `DeploymentValidator` | When a sandbox exists |
| Automated Camunda state pull | `CamundaObservationSource` | Post-MVP |
| Web Modeler / git push | `ArtifactPublisher` | Post-MVP |
| Worker code scaffolding | Generator over `ServiceInterface` contracts | Post-MVP |
| Executable test generation | Generator over `TestScenario` | Post-MVP |
| Runtime KPI feedback vs. `SpecKpi` | Analytics integration | Post-MVP |

Each has a named port so that adding it is an adapter, not a redesign.

## 8. Profile lifecycle

1. A new Camunda 8.x release appears.
2. A new profile is authored as **data**: constructs, extension shapes, FEEL built-ins, lint
   version, template set, limits.
3. Golden fixtures are generated for the new profile and reviewed.
4. The profile is marked `preview`, then `supported`.
5. Projects opt in per project. **No project is migrated automatically.**
6. A migration report shows, per project, what would change under the new profile — including
   whether the change is `major` in process-contract terms.

This is the mechanism by which Camunda's release cadence stops being a threat to the product.
