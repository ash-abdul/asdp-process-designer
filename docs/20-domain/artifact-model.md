# Artifact Model

> **Status:** Approved (Phase 0) · **Version:** 1.0 · **Updated:** 2026-08-22
> **Related:** [ADR-0016](../adr/ADR-0016-immutable-content-addressed-artifacts.md), [versioning-and-baselines.md](versioning-and-baselines.md), [process-ir.md](../30-generation/process-ir.md)

A uniform envelope over heterogeneous payloads, so that versioning, hashing, diffing,
validation, dependency checking, and packaging are written **once** rather than per artifact
type.

---

## 1. Envelope

```
Artifact {
  id, projectId
  kind   bpmn | dmn | form | process_ir | service_interface | worker_spec
       | test_suite | requirements_doc | bps_doc | traceability_matrix
       | validation_report | ai_disclosure_report | element_template
       | package_manifest
  key                        // stable business key; doubles as the Camunda
                             // process / decision / form ID. ASCII, NCName-safe
  name: LocalizedText, description
  currentVersionId
  lifecycle  draft | in_review | approved | stale | deprecated
}

ArtifactVersion {
  artifactId, n                          // monotonic integer per artifact
  contentRef | contentJson               // blob for XML, JSONB for structured payloads
  contentHash                            // SHA-256 over the CANONICAL serialisation
  generatedBy   compiler | import        // NOTE: 'human' does not exist (D9)
  sourceIrVersionId                      // MANDATORY for compiled artifacts
  compilerVersion                        // reproducibility
  layoutEngineVersion?                   // BPMN only; layout is versioned like a compiler
  rulePackVersion                        // which validation pack it was checked against
  camundaTargetProfileId                 // which Camunda profile it targets
  parentVersionId, message, createdBy, createdAt
  validationSummary                      // cached result of the last run
}

ArtifactDependency {
  fromVersionId, toArtifactKey, kind, required
  resolvedVersionId?                     // resolved within a baseline
}
```

### 1.1 `generatedBy` has no `human` value

This is deliberate and load-bearing. There is no code path, command, or column value that can
represent a hand-authored artifact ([ADR-0002](../adr/ADR-0002-spec-layer-editing.md)).
`import` covers artifacts brought in from outside — legacy BPMN at intake, and Camunda
observations after handoff — and those are never treated as ASDP's own truth.

### 1.2 Recorded generator identity

`compilerVersion`, `layoutEngineVersion`, `rulePackVersion`, and `camundaTargetProfileId` are
stored on every version because a release must remain **explainable and reproducible** long
after the toolchain has moved on. "Why does the v1 package look different from what we generate
today?" must have a mechanical answer.

## 2. `process_ir` is a first-class artifact

Not a transient. It is:

- the target of AI proposals (`REFINE_IR`), so proposals are diffable against a stored baseline;
- the diff anchor for regeneration;
- the reason a BPMN artifact can be regenerated deterministically after a specification change;
- the object the layout engine consumes.

Versioning it is what makes "regenerate only what changed" possible without merge semantics
([process-ir.md](../30-generation/process-ir.md)).

## 3. Canonical serialisation

**Mandatory before hashing.** Without it, cosmetic reserialisation churns hashes, every diff
shows noise, and approvers stop reading them — which silently destroys the governance model.

| Artifact kind | Canonicalisation rules |
|---|---|
| BPMN / DMN (XML) | Fixed namespace prefixes; attributes sorted in a declared order; elements emitted in a declared document order; normalised whitespace and indentation; no trailing whitespace; LF line endings; UTF-8 without BOM; numeric formatting fixed (no locale, fixed decimal precision for geometry) |
| Camunda Form (JSON) | Object keys sorted; no insignificant whitespace; stable array ordering where semantically unordered; numbers in canonical form |
| Process IR (JSON) | Same JSON rules; region tree emitted in traversal order |
| Structured payloads (interfaces, test suites, manifests) | Same JSON rules |
| Generated documents (Markdown/CSV) | Fixed line endings; stable row ordering; UTF-8; **bidi-safe composition** for Arabic content |

Text inside artifacts is NFC-normalised
([ADR-0023](../adr/ADR-0023-unicode-bilingual-architecture.md)), so an Arabic label does not
produce two different hashes depending on the input document's normalisation form.

## 4. Dependency kinds

The cross-artifact validation surface
([validation-architecture.md](../40-quality/validation-architecture.md) L3/L4).

| Kind | From → To | Checked |
|---|---|---|
| `bpmn→form` | user task `zeebe:formDefinition` → form key | Existence; exactly one form per user task |
| `bpmn→dmn` | `zeebe:calledDecision` → decision id | Existence; result variable name and type consistency |
| `bpmn→process` | `zeebe:calledElement` → process key | Existence; no cycles |
| `bpmn→service_interface` | job type → interface | Existence; every service task has one |
| `bpmn→element_template` | applied template id | Template present and allow-listed |
| `dmn→data_field` | decision input/output → data field | Existence; type compatibility |
| `form→data_field` | field key → data field | Existence; component/type compatibility |
| `test→bpmn_element` | scenario path → element | Existence within the same baseline |
| `test→dmn_rule` | scenario coverage → rule row | Existence |
| `*→requirement` | any element → requirement | Approved requirement exists (T3/T4) |
| `*→spec_element` | any generated element → spec object | Present for every element, no exceptions (T4) |

Dependencies are resolved **within a baseline**, never against "latest". This is what makes a
baseline a self-consistent, deployable set rather than a snapshot of moving parts.

## 5. Semantic diff, not text diff

Text-diffing XML is unreviewable, and unreviewable diffs are how approvers stop reviewing.
Every artifact kind has a semantic differ in `packages/diff`.

| Kind | Diff unit | Change classes |
|---|---|---|
| BPMN | Element | added, removed, renamed, retyped, re-propertied, re-routed, moved (geometry only) |
| DMN | Decision, and **rule row** | added, removed, reordered, input changed, output changed, annotation changed, hit policy changed |
| Form | Field | added, removed, reordered, relabelled, revalidated, rebound |
| Process IR | Node, edge, region | structural changes distinguished from cosmetic ones |
| Service interface | Mapping, error code | added, removed, changed |
| Requirements / specs | Field | per-field change with change reason |

Diffs distinguish **structural** from **cosmetic** change explicitly. A geometry-only change
(layout engine upgrade) must never be presented to an approver as a process change, and a
renamed label must never be presented as a new element.

## 6. Staleness

```
lifecycle transitions:
  draft ──generated──▶ in_review ──approved(gate)──▶ approved
  approved ──upstream change──▶ stale
  stale ──regenerated + re-approved──▶ approved
  any ──superseded by a new key or removal──▶ deprecated
```

When an approved upstream entity changes, dependent artifacts become `stale` with a computed
impact set ([traceability-model.md](traceability-model.md) §5). Nothing is silently
regenerated, and nothing stale can enter a release
([versioning-and-baselines.md](versioning-and-baselines.md)).

## 7. Imported artifacts

Imports are first-class but epistemically distinct.

| Import context | Stored as | Treated as |
|---|---|---|
| Legacy BPMN/DMN/Form at intake | `Source` (parsed structurally) **and** `Artifact{generatedBy: import}` for viewing | Evidence at very high precision; never ASDP's design truth |
| Camunda state re-uploaded after handoff | `Source` + `CamundaObservation` | Observation input to divergence analysis only ([handoff-and-divergence.md](../50-governance/handoff-and-divergence.md)) |

An imported artifact can never be promoted to be the project's generated artifact. To adopt
something seen in an import, the corresponding requirement or specification must be changed and
the artifact regenerated — which is the same rule as everywhere else.

## 8. Storage

| Payload | Location |
|---|---|
| BPMN/DMN XML, generated documents, packages | Object store, referenced by `contentRef` |
| Process IR, form JSON, interfaces, test suites, manifests | Postgres JSONB (`contentJson`) — queryable |
| Content hashes, dependencies, lifecycle, generator identity | Postgres, indexed |
| Page images, source blobs | Object store |

Rule: anything the application needs to **query** lives in Postgres; anything it only needs to
**serve or hash** lives in the object store. Nothing needed for correctness lives on a container
filesystem ([deployment-architecture.md](../10-architecture/deployment-architecture.md) K2).

## 9. Test obligations

1. **Determinism:** compiling the same IR twice, in different processes, yields byte-identical
   canonical output and therefore an identical hash.
2. **Canonical stability:** parsing and reserialising a generated artifact without semantic
   change does not alter its hash.
3. **Unicode stability:** the same Arabic label supplied as NFC and NFD yields one hash.
4. **Golden files:** every compiler has snapshot fixtures per Camunda target profile; changes
   require an explicit snapshot update and a version bump.
5. **Dependency completeness:** every generated element has a `compiled_to` edge (T4) —
   asserted by the compiler's own output, not by a later scan.
6. **Absence test:** no command, handler, or repository method mutates an `ArtifactVersion`
   ([architecture-overview.md](../10-architecture/architecture-overview.md) I3).
