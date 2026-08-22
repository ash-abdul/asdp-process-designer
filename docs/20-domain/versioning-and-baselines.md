# Versioning and Baselines

> **Status:** Approved (Phase 0) · **Version:** 1.0 · **Updated:** 2026-08-22
> **Related:** [ADR-0016](../adr/ADR-0016-immutable-content-addressed-artifacts.md), [ADR-0017](../adr/ADR-0017-approval-as-baseline-signature.md), [ADR-0018](../adr/ADR-0018-handoff-ownership-boundary.md), [handoff-and-divergence.md](../50-governance/handoff-and-divergence.md)

Five levels, each with a distinct job. The fifth is where the lifecycle-ownership decision
lives.

---

## 1. The five levels

| Level | Scheme | Unit of | Mutability |
|---|---|---|---|
| **Entity version** | monotonic integer + supersession chain | Requirements, specification elements | New version per change; old retained |
| **Artifact version** | monotonic integer per artifact + content hash | Generated artifacts, Process IR | Immutable |
| **Baseline** | content hash over the frozen member-version set | **Approval** | Immutable, insert-only |
| **Release** | semver | **Delivery** | Immutable once approved |
| **Handoff baseline** | a Release marked `handed_off` | **Ownership transfer** | **Frozen permanently — ASDP's authority ends** |

## 2. Entity versioning

- IDs are never reused or renumbered. `REQ-0042` is `REQ-0042` forever, including after
  rejection or supersession (D15).
- Every new version records a **mandatory `changeReason`**. A change with no stated reason
  cannot be saved — this is what makes the diff-centric review in
  [governance-and-gates.md](../50-governance/governance-and-gates.md) meaningful.
- Supersession is a chain (`supersedesId` / `supersededById`), not a flag, so history is
  navigable in both directions.
- Deletion is not offered. Entities are rejected or deprecated, and remain queryable.

## 3. Artifact versioning

- Every generation produces a new `ArtifactVersion`. Nothing is updated in place.
- The hash is computed over the **canonical** serialisation
  ([artifact-model.md](artifact-model.md) §3), so cosmetic reserialisation does not create a
  version.
- Each version records `compilerVersion`, `layoutEngineVersion`, `rulePackVersion`, and
  `camundaTargetProfileId`, so a past release is reproducible and explainable.
- **Regeneration is not patching.** A specification change regenerates whole artifacts; there
  is no partial-edit merge path, because there are no human edits to merge
  ([ADR-0002](../adr/ADR-0002-spec-layer-editing.md)). This is a significant simplification
  relative to any tool that permits artifact editing.

### 3.1 Selective regeneration

Regeneration is scoped by the impact set, not global:

```
specification change
  → impact analysis (graph traversal)
    → the set of artifacts whose inputs changed
      → regenerate ONLY those
        → semantic diff per artifact
          → review
```

Artifacts outside the impact set keep their existing version and hash. This keeps diffs small
and reviews honest.

## 4. Baselines

```
Baseline {
  stage                      // requirements | bps | design | release
  contentHash                // SHA-256 over the sorted set of member (artifactId, versionId,
                             // contentHash) triples plus the stage and RAF/profile versions
  frozenAt
  memberVersions[]           // the exact, complete set
}
```

- A baseline is the **unit of approval**. Gates approve baselines, never individual artifacts
  ([ADR-0017](../adr/ADR-0017-approval-as-baseline-signature.md)).
- Baselines are self-consistent: dependencies resolve **within** the baseline, never against
  "latest" ([artifact-model.md](artifact-model.md) §4).
- An `Approval` stores `signedBaselineHash` **and** the `validationRunId` that produced its
  evidence. If either changes, the signature no longer matches and the gate reopens
  automatically. There is no "re-approve without re-review" path.
- A baseline may not contain a `stale` artifact.

## 5. Change sets

```
ChangeSet { title, rationale, status, memberVersionIds[], reviewers[], comments[] }
```

A `ChangeSet` groups related edits across entities and artifacts into one reviewable unit with
one rationale — the domain's equivalent of a pull request. Approvers review a change set's
**diff**, not the whole document, which is what makes iterative governance survivable past the
second revision.

Fast-path categories (typo, description-only, translation added) are configurable per standards
profile, are recorded as such, and still produce a version.

## 6. Releases

```
Release {
  semver
  baselineId
  archiveRef, manifest
  validationRunId
  aiDisclosureReport
  divergenceReportId?          // present from the second cycle onward
  approvals[]
  state  candidate | approved | handed_off | superseded
  frozenAt?
  releasedAt
}
```

**Semver semantics** — defined in process-contract terms, not code terms:

| Bump | Meaning |
|---|---|
| `major` | Incompatible process contract change: a process variable removed or retyped, a job type removed or renamed, a form or decision key removed, a message/correlation change, an incompatible start-event change |
| `minor` | Additive and backward-compatible: new steps, new optional variables, new decisions or forms, new error handling |
| `patch` | No executable change: documentation, labels, translations, annotations, cosmetic layout |

The bump is **proposed deterministically** by comparing artifact contracts between baselines,
and confirmed by a human. A tool that lets a human declare `patch` for a variable rename is a
tool that produces broken deployments.

## 7. The handoff boundary

```
        ASDP IS SOURCE OF TRUTH            │      CAMUNDA IS SOURCE OF TRUTH
                                           │
Requirements → Specs → artifacts →         │  technical refinement, connector tuning,
validation → candidate → G4 → HANDOFF ═════╪══▶ deployment, operations
                                           │
   ASDP never writes to Camunda.           │   ASDP never overwrites Camunda.
   (No write path exists in the codebase.) │   Regeneration produces a NEW candidate,
                                           │   never a patch to what was handed off.
```

On handoff:

- the `Release` transitions to `handed_off` and is **frozen permanently** (D12);
- a `Handoff` record captures recipient, environment, Camunda target profile, artifact hashes,
  and notes;
- ASDP retains the frozen baseline, hashes, traceability, and audit trail for that release, and
  never modifies them again.

## 8. Second and later cycles

```
   A = handed-off baseline vN        (what ASDP delivered — known exactly)
   B = current Camunda state         (optional: re-uploaded as a CamundaObservation)
   C = new ASDP candidate vN+1       (what the updated requirements now imply)

   Element-by-element classification:
     A=B, A≠C          → asdp_only      → safe: C supersedes
     A≠B, B=C          → convergent     → Camunda already did this; note it
     A≠B, A=C          → camunda_only   → PRESERVE: C must not revert this
     A≠B, A≠C, B≠C     → both_changed   → CONFLICT: explicit human decision required
     A=B=C             → unchanged
```

If **B is unknown**, the comparison degrades to A↔C and **says so prominently**. A two-way diff
presented as complete would be actively dangerous
([ADR-0019](../adr/ADR-0019-divergence-via-observation.md)).

The output is a `DivergenceReport` reviewed by a human, followed by a new release and handoff.
Full specification in [handoff-and-divergence.md](../50-governance/handoff-and-divergence.md).

## 9. Pinned versions recorded per release

Recorded in the release manifest so that a release is explainable and reproducible:

| Pinned | Why |
|---|---|
| RAF version | Coverage arithmetic differs between frame versions |
| Prompt versions per AI task | Why a requirement was extracted the way it was |
| **Provider and model per AI interaction** | Which provider produced which content, under which policy |
| Compiler versions | Artifact shape |
| Layout engine version | Geometry |
| Validation rule pack version | What "valid" meant at the time |
| Camunda target profile | Which Camunda 8.x semantics were targeted |
| Standards profile | Naming and governance rules in force |

## 10. Retention

**Retain everything, indefinitely** ([ADR-0032](../adr/ADR-0032-retain-everything.md)):
sources, evidence, all versions, all baselines, all releases, all AI interactions, and the full
audit log. Superseded sources are retained and marked, never deleted.

A governed design tool that garbage-collects its own audit trail has no reason to exist.
Retention limits, if ever required, will be a policy layer over an intact record — not a
deletion path built into the domain.
