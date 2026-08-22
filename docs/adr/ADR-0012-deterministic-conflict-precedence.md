# ADR-0012: Deterministic Conflict Precedence

> **Status:** Approved · **Date:** 2026-08-22 · **Reversibility:** Moderate
> **Related:** ADR-0004, ADR-0010, docs/20-domain/domain-model.md §4

## Context

Real BRDs, SOPs, policies, spreadsheets, and legacy models contradict each other routinely. The
product must detect contradictions and help resolve them. Detection is a reasoning task suited to
AI; *resolution* is a governance decision that must be reproducible and defensible — "the AI
decided the policy outweighed the email" is not an acceptable audit answer.

## Decision

AI **MAY** detect contradiction candidates and explain them.

Precedence **MUST** be computed deterministically, in this order:

1. **Declared source authority rank** — set by a human during intake, and the primary input.
2. **Effective date** — more recent wins, where dates are known.
3. **Specificity** — a specific clause outranks a general statement.
4. **Epistemic level** — extracted evidence outranks interpretation, which outranks inference.

The computed outcome is a **proposal with a stated rationale**. A **human MUST decide** every
conflict. Unresolved conflicts **MUST** block G1.

The rationale, the decision, the decider, and the timestamp **MUST** be retained and exported.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| AI resolves conflicts | Not reproducible, not defensible in audit, and hides a governance decision inside a model call |
| Always require human resolution with no proposal | Wastes the useful part of AI assistance; analysts face raw contradictions with no suggested basis |
| Recency-only precedence | A recent email should not override a signed policy |
| Authority-only precedence | Ignores that a newer version of the same authority supersedes an older one |

## Consequences

**Positive**

- Resolutions are explainable and reproducible: "resolved in favour of policy-v3 because it
  outranks the SOP in declared authority and is more recent."
- Conflict provenance is exportable for audit — which sources disagreed, and on whose authority it
  was resolved.
- Human authority ranking during intake becomes a meaningful, low-effort governance act.

**Negative**

- Requires humans to rank sources during intake; an unranked corpus weakens precedence to
  date-and-specificity only.
- Sources without effective dates weaken the second criterion; `L0-ING-010` reports this.
- Conflicts blocking G1 can stall a project — which is the intended behaviour when sources
  genuinely disagree.

## Enforcement

- Precedence computation is a pure function in `packages/domain`.
- `Conflict.decision` requires an authenticated human actor.
- G1 precondition: zero unresolved conflicts (domain invariant D4).
- Conflict provenance is a required column set in the traceability export.
