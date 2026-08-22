# ADR-0017: Gate Approval as a Signature over a Baseline Hash

> **Status:** Approved · **Date:** 2026-08-22 · **Reversibility:** Hard
> **Related:** ADR-0016, docs/50-governance/governance-and-gates.md

## Context

There must be human review and approval gates between major stages, and the system must not
silently convert vague requirements into executable BPMN. A gate implemented as a status field and
a button records that someone clicked, not what they approved — and it cannot detect that the
content changed afterwards.

## Decision

An approval **MUST** be a signature over **`(baselineContentHash, validationRunId)`**.

- A gate approves an immutable **baseline** — a frozen set of member versions — never an
  individual artifact.
- The `Approval` record stores the signed baseline hash, the validation run relied upon, the
  approver, the role held at that moment, and the timestamp.
- If **either** the baseline hash or the validation run changes, the signature no longer matches
  and **the gate reopens automatically**. There is no re-approve-without-re-review path.
- Downstream stages **MUST** be structurally read-locked until the upstream gate passes.
- Gate policy (required roles, quorum, self-approval, expiry, strictness) **MUST** be
  configuration, not code. Self-approval defaults to **off**.
- Dependencies **MUST** resolve within the baseline, never against "latest".

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Status field plus a button | Records the click, not the content. Cannot detect post-approval change |
| Per-artifact approval | Loses cross-artifact consistency; a set of individually approved artifacts may be jointly invalid |
| Approval with a grace period for minor edits | "Minor" is not definable; this is precisely the silent-conversion hole the gates exist to close |
| Approval without a validation-run binding | An approver could approve content whose validation evidence has since changed |

## Consequences

**Positive**

- "What exactly was approved?" is answerable by hash, forever.
- Post-approval change cannot go unnoticed; reopening is automatic, not procedural.
- Read-locks make "no silent conversion" a property of the system rather than a policy statement.
- Baselines are self-consistent and therefore meaningfully deployable sets.

**Negative**

- More re-approval cycles than a looser model. Mitigated by **diff-centric review** — without it,
  this decision would make governance intolerable by the third revision.
- Baseline computation and hashing must be correct and fast.
- Fast paths for trivial changes must be configured deliberately, or trivial edits will feel
  punitive.

## Enforcement

- Gate guards at the command layer, not the UI.
- `Approval.signedBaselineHash` and `validationRunId` are required fields.
- Baseline hash recomputation on every member change; mismatch reopens the gate.
- Gate preconditions query the Validation Engine, which is the sole authority on readiness.
