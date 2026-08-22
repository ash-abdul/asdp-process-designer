# Governance and Approval Gates

> **Status:** Approved (Phase 0) · **Version:** 1.0 · **Updated:** 2026-08-22
> **Related:** [ADR-0017](../adr/ADR-0017-approval-as-baseline-signature.md), [versioning-and-baselines.md](../20-domain/versioning-and-baselines.md), [identity-and-access.md](../10-architecture/identity-and-access.md)

Gates are the mechanism that prevents vague requirements from becoming executable BPMN. They
are state transitions on immutable baselines, enforced in the domain layer — not checkboxes.

---

## 1. The five gates

| Gate | Approves | Deterministic preconditions | Approver roles |
|---|---|---|---|
| **G0** Intake Sufficiency | Source inventory | *Advisory only.* Reports RAF slots with no plausible source coverage | Analyst acknowledges |
| **G1** Requirements Approved | Requirement-set baseline | 0 blocking flags · 0 unresolved conflicts · 0 unanswered blocking questions · all requirements at L4 · all required RAF slots non-`empty` · every LOW-confidence inferred requirement explicitly confirmed · all `blocked_by_policy` slots acknowledged · L0 clean | BusinessApprover (+ BusinessAnalyst) |
| **G2** BPS Approved | Specification baseline | **`L4-SPEC-001 … L4-SPEC-010` zero errors** — every specification element cites ≥1 approved requirement · 0 orphans · spec-level reachability · every decision point has a business rule · every automated step has an interface, every manual step a form, every decision a decision spec · every manual step names an actor · ≥1 trigger and ≥1 outcome · outcome exclusivity declared where flows can overlap · repetition and compensation details complete | BusinessApprover + ProcessArchitect |
| **G3** Design Validated | Design baseline | L0–L5 zero errors (incl. `L4-SPEC-010` and `L2-DMN-003a`) · all warnings waived with justification · all artifact dependencies resolved within the baseline · requirement realisation coverage ≥ threshold · no unconfirmed inference on an executable path · no `stale` artifact | TechnicalApprover (+ ProcessArchitect) |
| **G4** Release Approved | Release | G3 passed **on this exact baseline hash** · **`L4-TRACE-004` zero errors** (no unrealised approved requirement without explicit deferral) · **`L6-TEST-007` zero errors** (aggregate coverage ≥ profile threshold) · package builds · manifest complete · divergence report reviewed (second cycle onward) | BusinessApprover + TechnicalApprover |

Every blocking precondition above is a **rule with a stable ID**, so it appears in the validation
report, can be cited in a ticket or comment, is tracked across runs, and renders in the reviewer's
language ([validation-rule-catalog.md](../40-quality/validation-rule-catalog.md)). Domain invariants
D5 and D6 remain in force independently: the invariant makes the state unreachable, the rule makes it
explicable.

**Gate-scoped severity.** Two rules are tolerable at one gate and blocking at another:
`L4-SPEC-010` (specification data availability) is a warning at G2 and an error at G3;
`L4-TRACE-004` (unrealised approved requirement) is a warning at G3 and an error at G4. A waiver is
valid only at a gate where the rule is a warning
([validation-architecture.md](../40-quality/validation-architecture.md) §4.1).

G0 is deliberately advisory. Making intake completeness blocking would stall projects at the
moment users know least; reporting it early and revisiting it at G1 is more useful.

## 2. Gate mechanics

### 2.1 An approval is a signature over a hash

```
Approval {
  gateId, baselineId
  approver, roleAtApproval, decision: approve | reject
  comment
  signedBaselineHash              // the exact content approved
  validationRunId                 // the exact evidence relied upon
  at
}
```

If either the baseline hash or the validation run changes, the signature no longer matches and
**the gate reopens automatically**. There is no "re-approve without re-review" path, and no way
to approve content that was not the content reviewed
([ADR-0017](../adr/ADR-0017-approval-as-baseline-signature.md)).

### 2.2 Read-locks

Downstream stages are **structurally read-locked** until the upstream gate passes. Stage 4
(specification) cannot be entered without an approved requirement baseline; stages 5–7
(generation) cannot be entered without an approved specification baseline. This is what makes
"no silent conversion" a property of the system rather than a policy statement.

### 2.3 Change flows forward, visibly

Editing an approved upstream entity:

1. creates a new entity version with a mandatory change reason;
2. marks dependent downstream entities and artifacts `stale`;
3. computes and displays the **impact set** (deterministic graph traversal);
4. reopens the affected gate(s);
5. requires re-approval before generation or release can proceed.

Nothing is silently regenerated. Nothing stale can enter a baseline.

## 3. Gate policy — configuration, not code

```
gatePolicy:
  G1:
    requiredRoles:        [BusinessApprover]
    additionalRoles:      [BusinessAnalyst]
    quorum:               1
    allowSelfApproval:    false            # segregation of duties, default off
    approvalExpiryDays:   90
    strictness:           strict
  G2: { requiredRoles: [BusinessApprover, ProcessArchitect], quorum: 2, … }
  G3: { requiredRoles: [TechnicalApprover], … }
  G4: { requiredRoles: [BusinessApprover, TechnicalApprover], quorum: 2, … }
  fastPathCategories:     [typo, description_only, translation_added]
  permissiveOverride:
    allowed:              false            # requires PlatformAdmin; always audited
```

| Setting | Effect |
|---|---|
| `requiredRoles` / `quorum` | Who must sign, and how many |
| `allowSelfApproval` | Default `false`. The author of a requirement should not be its sole approver |
| `approvalExpiryDays` | An approval older than this is stale; the gate reopens |
| `strictness` | `strict` (default) blocks on all preconditions; `permissive` requires a `PlatformAdmin` override, which is itself audited |
| `fastPathCategories` | Categories of change that may be approved on a reduced review; still produce a version and are recorded as fast-pathed |

## 4. Diff-centric review

**The single most important usability decision in the governance model.** An approver reviewing
revision 2 sees only what changed, with each change's rationale and evidence — never the whole
document again.

| Review surface | Content |
|---|---|
| Change set diff | Per-entity field-level changes with mandatory change reasons |
| Requirement diff | Text, category, evidence added/removed, epistemic level transitions, confidence change |
| Specification diff | Steps, flows, decisions added/removed/changed |
| Artifact diff | **Semantic** diff, classified as structural / contract / cosmetic ([artifact-model.md](../20-domain/artifact-model.md) §5) |
| Findings delta | New / resolved / outstanding since the previous run, using stable finding IDs |
| Disclosure delta | Change in the count of elements resting on L2/L3 content |

Without this, approvers rubber-stamp by the third revision, and the entire governance model
becomes decorative.

## 5. Comment threads

Threads attach to any entity: requirement, open question, conflict, specification element,
artifact element, DMN rule row, form field, finding.

- Threads may be marked **blocking**; an unresolved blocking thread fails `L5-STD-004`.
- Threads are part of the audit record and are exported with the release.
- Threads are `LocalizedText`-aware, so an Arabic comment renders correctly in an
  English-primary project.

## 6. Waivers

```
Waiver { findingId, justification, approvedBy, approvedAt, expiresAt? }
```

- Only `warning` findings are waivable. `error` findings are never waivable.
- A waiver binds to a **specific finding ID on a specific baseline** and does not carry forward
  silently.
- Waivers appear in the release validation report and the handoff package.
- An expired waiver reopens G3.

## 7. Reopening and revision

Approved baselines are never edited. A change starts a new revision:

```
approved baseline vN
   → change set opened
     → entity versions created (each with a change reason)
       → affected artifacts regenerated (impact-scoped)
         → validation run
           → gate reopened → diff-centric review → approval
             → new baseline vN+1
```

The prior baseline, its approvals, and its validation run remain intact and queryable forever
([ADR-0032](../adr/ADR-0032-retain-everything.md)).

## 8. Governance reporting

| Report | Content |
|---|---|
| Gate history | Every transition, approver, baseline hash, validation run |
| Approval register | Who approved what, when, under which role, on which content |
| Waiver register | Outstanding and expired waivers with justifications |
| **AI-disclosure report** | Elements resting on L2/L3 · requirements from degraded or redacted extraction · `blocked_by_policy` slots · provider/model per content group |
| Directive log | Human shape decisions above the requirements layer, with rationale |
| Traceability matrix | The full chain, bilingual ([traceability-model.md](../20-domain/traceability-model.md) §6) |
| Divergence report | From the second cycle onward ([handoff-and-divergence.md](handoff-and-divergence.md)) |

All are generated deterministically and included in the release package, so an auditor can
answer their questions without access to the application.

## 9. What cannot be overridden

| Not overridable | By anyone |
|---|---|
| An `error`-severity finding | No waiver exists for errors |
| The absence of an artifact-editing command | No role unlocks it ([ADR-0003](../adr/ADR-0003-no-override-editor.md)) |
| An egress-policy denial | Policy must be changed by an admin, which is itself audited |
| The requirement that AI cannot set L4 | Structural |
| The freeze on a handed-off release | Structural |
| Traceability integrity rules `L4-TRACE-001/003/005` | Not profile-adjustable |
