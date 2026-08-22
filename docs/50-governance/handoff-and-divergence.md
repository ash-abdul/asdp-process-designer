# Handoff and Divergence

> **Status:** Approved (Phase 0) · **Version:** 1.0 · **Updated:** 2026-08-22
> **Related:** [ADR-0018](../adr/ADR-0018-handoff-ownership-boundary.md), [ADR-0019](../adr/ADR-0019-divergence-via-observation.md), [versioning-and-baselines.md](../20-domain/versioning-and-baselines.md)

Lifecycle ownership, stated as a mechanism.

---

## 1. The ownership boundary

```
        ASDP IS SOURCE OF TRUTH              │      CAMUNDA IS SOURCE OF TRUTH
                                             │
Requirements → Specifications → artifacts    │  technical refinement, connector tuning,
→ validation → candidate → G4 → HANDOFF ═════╪══▶ deployment, operations, monitoring
                                             │
  ASDP never writes to Camunda.              │   ASDP never overwrites Camunda.
  No write path exists in the codebase.      │   Regeneration produces a NEW candidate,
                                             │   never a patch to what was handed off.
```

## 2. Handoff

An explicit, recorded, one-way event.

```
Handoff {
  releaseId
  method             export_download | export_to_repo(future) | modeler_push(future)
  handedOffBy, handedOffAt
  recipient                        // team or individual taking ownership
  declaredEnvironment  dev | test | prod | unknown
  camundaTargetProfileId
  artifactHashes[]                 // exactly what left the building
  notes
}
```

On handoff:

1. the `Release` transitions to `handed_off` and is **frozen permanently** (invariant D12);
2. the `Handoff` record is written to the append-only audit log;
3. artifact hashes are recorded, so a later observation can be compared against precisely what
   was delivered;
4. ASDP retains the frozen baseline, all approvals, the traceability graph, and the validation
   run for that release, and never modifies them again.

## 3. Non-negotiable properties

| # | Property |
|---|---|
| H1 | **No write path to any Camunda cluster exists in the MVP codebase.** Not disabled, not permission-gated — absent |
| H2 | A `handed_off` release is immutable. No command, role, or migration alters it |
| H3 | Regeneration never patches. ASDP emits complete new artifacts; what reaches Camunda is a human decision |
| H4 | ASDP cannot know what happened in Camunda unless told. **The absence of that knowledge is reported loudly**, never implied away |
| H5 | An imported Camunda artifact can never become ASDP's design truth. It is observation input only |

## 4. Feedback intake — the observation

Camunda-side changes re-enter through the **normal intake pipeline**, which already parses BPMN,
DMN, and form files structurally with element-level provenance
([ADR-0019](../adr/ADR-0019-divergence-via-observation.md)).

```
CamundaObservation {
  handoffId
  observedAt, observedBy
  method   reupload | api_pull(future)
  sourceIds[]                      // the re-uploaded files, stored as ordinary Sources
  artifactSnapshots[]              // parsed, hashed
  notes                            // e.g. "as deployed to test on 2026-09-14"
}
```

Two secondary benefits of routing this through intake rather than a bespoke importer:

- the observation is **evidence**, so a Camunda-side change can be traced and cited;
- a Camunda-side change may reveal a **requirement change nobody documented** — which is itself
  a governance finding worth reporting.

## 5. Three-way comparison

```
   A = handed-off baseline vN       (what ASDP delivered — known exactly, by hash)
   B = current Camunda state        (optional: the observation)
   C = new ASDP candidate vN+1      (what the updated requirements now imply)
```

Element-by-element classification, computed deterministically in `packages/diff`:

| A vs B | A vs C | Class | Meaning | Default recommendation |
|---|---|---|---|---|
| = | ≠ | `asdp_only` | Only ASDP changed it | Safe: C supersedes |
| ≠ | B = C | `convergent` | Camunda already made this change | Note it; no action |
| ≠ | A = C | `camunda_only` | Engineers changed it; ASDP did not | **PRESERVE** — C must not revert it |
| ≠ | ≠, B ≠ C | `both_changed` | **CONFLICT** | Explicit human decision required |
| = | = | `unchanged` | — | — |

Comparison operates on the **semantic** diff, not text, and at the granularity of
[traceability-model.md](../20-domain/traceability-model.md) §4 — BPMN element, DMN rule row,
form field, interface mapping.

### 5.1 The `camunda_only` case is the important one

This is the case the whole mechanism exists for. A `camunda_only` change is legitimate
engineering work — a tuned retry, a connector configuration, an added technical error handler —
and the product's promise is that regeneration will not silently destroy it. The divergence
report names each such element and requires the human to decide: carry it forward as a
specification change, accept losing it, or hand off with a documented deviation.

### 5.2 When B is unknown

If no observation exists, the comparison degrades to **A↔C only**, and the report states
prominently:

> *"Camunda-side changes cannot be detected: no observation of the current Camunda state has
> been provided for this handoff. Changes made in Camunda since handoff may be silently
> reverted by this candidate."*

A two-way diff presented as complete would be actively dangerous. This warning is a required
element of the report, not a footnote.

## 6. The divergence report

```
DivergenceReport {
  baseHandoffId
  observationId?                   // absent ⇒ incomplete comparison, flagged
  candidateReleaseId
  requirementChanges[]             // what changed upstream and why (change reasons)
  elementFindings[] {
    elementRef, artifactKind, changeClass
    asdpChange?, camundaChange?
    recommendation
    humanDecision?  { disposition: supersede | preserve | merge_into_spec | defer,
                      rationale, decidedBy, decidedAt }
  }
  summary { asdpOnly, camundaOnly, convergent, bothChanged, unchanged, unknown }
  completeness  full | asdp_only_comparison
  generatedAt
}
```

- Every `both_changed` finding requires a `humanDecision` before G4 can pass.
- `preserve` and `merge_into_spec` dispositions create follow-up work: preserving a Camunda-side
  change means either promoting it into the specification (so future candidates keep it) or
  recording it as a permanent deviation.
- Unresolved deviations are listed in `docs/deviations.md` in the next package, so the receiving
  engineer knows what ASDP is knowingly not modelling.

AI may **narrate** a divergence report (`NARRATE_DIVERGENCE`); it never computes the
classification.

## 7. The second-cycle flow

```
Requirements v2 (new sources, changed policy, answered questions)
  → AI re-analysis (impact-scoped where possible)
    → requirement diff → G1 re-approval of the changed set
      → specification diff → G2 re-approval
        → impact-scoped regeneration → candidate vN+1
          → [ optional: upload current Camunda artifacts as an observation ]
            → DIVERGENCE & IMPACT REPORT
              → human dispositions on every conflict
                → validation → G3
                  → G4 (divergence report reviewed)
                    → new HANDOFF
```

## 8. MVP scope

| In MVP | Deferred |
|---|---|
| Handoff records, permanent release freeze | Automated Camunda state pull (`CamundaObservationSource`) |
| **A↔C** comparison, always | Git / Web Modeler push (`ArtifactPublisher`) |
| **A↔B↔C** comparison when an observation is uploaded | Continuous divergence monitoring |
| Divergence report with required human dispositions | Automatic promotion of Camunda changes into specifications |
| Deviation log carried into the next package | Deployment-state awareness (which environment runs which version) |

Manual re-upload is unglamorous, costs almost nothing on top of the intake pipeline we are
already building, and delivers the entire capability. Automating the fetch is a convenience, not
a capability.

## 9. Test obligations

1. Classification correctness on fixture triples covering all five classes.
2. `camunda_only` elements are never reverted by a candidate that did not change them.
3. A missing observation produces `completeness: asdp_only_comparison` **and** the prominent
   warning.
4. A `handed_off` release cannot be mutated by any command (absence test).
5. An uploaded observation is stored as a `Source` with element-level anchors.
6. G4 is blocked while any `both_changed` finding lacks a `humanDecision`.
