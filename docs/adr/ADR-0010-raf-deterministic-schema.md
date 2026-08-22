# ADR-0010: Requirement Analysis Frame as a Deterministic Schema

> **Status:** Approved · **Date:** 2026-08-22 · **Reversibility:** Hard
> **Related:** ADR-0004, ADR-0011, docs/20-domain/requirement-analysis-frame.md

## Context

The AI requirements analysis must identify business objective, actors, triggers, preconditions,
inputs, outputs, steps, rules, decisions, exceptions, alternative flows, SLAs, escalations,
integrations, data requirements, notifications, roles, dependencies, assumptions, constraints,
NFRs, security requirements, missing information, ambiguities, conflicts, and open questions.

If that list lives only in a prompt, then a model that forgets to mention something has
successfully hidden a gap, and "what is missing?" becomes an AI opinion — unreproducible and
unauditable.

## Decision

The analysis dimensions **MUST** be a **fixed, versioned schema owned by code**: the Requirement
Analysis Frame (RAF), **27 slots in v1.1** (`raf-1.1`), each with a disjointness rule where it
adjoins another slot.

- Code owns the slots; AI fills them; **code measures what is empty**.
- Slot status (`empty` | `weak` | `adequate` | `blocked_by_policy`) **MUST** be computed
  deterministically from item count, evidence count, distinct source count, confidence band, and
  epistemic mix.
- `missingInformation`, `ambiguities`, `conflicts`, and `openQuestions` **MUST** be **derived by
  code**, never asserted by the model.
- Slots marked `requiredForExecutability` and left `empty` **MUST** block G1.
- Content matching no slot goes to `unclassified` with a review flag; it **MUST NOT** be dropped.
- A slot left empty because data governance forbade analysis **MUST** be reported as
  `blocked_by_policy`, never as `empty`.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Dimensions listed in the prompt only | An omission by the model is indistinguishable from an absence in the sources |
| AI-generated gap report | Unreproducible; not comparable across providers; unauditable |
| Free-form requirement categories | No basis for coverage arithmetic, and no basis for a gate precondition |

## Consequences

**Positive**

- **Reproducibility:** the same corpus analysed twice yields the same coverage report even if the
  prose differs.
- **Provider independence:** a weaker or on-premise model fills the same slots, so coverage is
  comparable across providers — which is what makes routing decisions measurable (ADR-0020).
- **Auditability:** "how do you know something was missing?" has a mechanical answer.
- Gate preconditions can reference coverage directly.

**Negative**

- Frame rigidity: some service may not fit the 27 slots. Mitigated by versioning, profile-specific
  slots, and the `unclassified` bucket.
- Changing the frame requires a version bump and affects comparability across projects.

## Enforcement

- The frame lives in `packages/raf` as a pure package; coverage is a pure function.
- `RequirementSet.rafVersion` is recorded, so an old release stays explainable.
- G1 preconditions query `RafCoverage`, not an AI output.
- `L5-AI-001` reports `blocked_by_policy` slots as a disclosure item.
