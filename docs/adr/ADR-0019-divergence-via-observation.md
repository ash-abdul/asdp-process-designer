# ADR-0019: Three-Way Divergence via Observation Re-Import

> **Status:** Approved · **Date:** 2026-08-22 · **Reversibility:** Easy
> **Related:** ADR-0018, docs/50-governance/handoff-and-divergence.md

## Context

When requirements change after a handoff, ASDP produces a new candidate. To avoid reverting
legitimate Camunda-side engineering work (ADR-0018), the system must be able to compare three
states: what was handed off, what Camunda has now, and what the new requirements imply.

ASDP has no read access to Camunda in the MVP. The question is how to obtain the middle state.

## Decision

Camunda-side state **MUST** enter ASDP as a **`CamundaObservation`** through the **normal intake
pipeline** — a process engineer re-uploads the current `.bpmn` / `.dmn` / `.form` files, which are
parsed structurally with element-level provenance.

Comparison **MUST** be three-way and classified deterministically per element, at the granularity
of BPMN element, DMN rule row, form field, and interface mapping:

| A vs B | A vs C | Class | Meaning |
|---|---|---|---|
| = | ≠ | `asdp_only` | Safe: the candidate supersedes |
| ≠ | B=C | `convergent` | Camunda already made this change |
| ≠ | A=C | `camunda_only` | **Preserve** — the candidate must not revert it |
| ≠ | ≠, B≠C | `both_changed` | **Conflict** — human decision required |
| = | = | `unchanged` | — |

Every `both_changed` finding **MUST** have a recorded human disposition before G4 passes.

Where no observation exists, the comparison **MUST** degrade to A↔C and **MUST** state prominently
that Camunda-side changes cannot be detected and may be silently reverted.

An imported observation **MUST NOT** become ASDP's design truth. It is observation input only.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Wait for a Camunda API integration before offering divergence | Delays the entire second-cycle capability for a convenience |
| Two-way comparison only (A↔C) | Silently reverts engineering work; the failure ADR-0018 exists to prevent |
| Automatically promote Camunda changes into specifications | Infers business intent from a technical edit; unreliable and unauditable |
| Treat re-imported artifacts as the new ASDP baseline | Reverses the generation model and destroys traceability |

## Consequences

**Positive**

- Delivers the full divergence capability for near-zero incremental cost, by reusing the intake
  pipeline that already parses BPMN and DMN structurally.
- The observation is **evidence**, so a Camunda-side change is traceable and citable.
- A Camunda-side change may reveal an undocumented requirement change — itself a governance
  finding worth surfacing.
- Automating the fetch later is a convenience, not a new capability.

**Negative**

- Depends on a human remembering to upload. Mitigated by making the missing-observation warning
  prominent and by prompting at candidate creation.
- The observation may be stale relative to the live cluster; `CamundaObservation.notes` records
  what it represents ("as deployed to test on …").
- No continuous divergence monitoring in the MVP.

## Enforcement

- `DivergenceReport.completeness` is `full` or `asdp_only_comparison`; the latter carries the
  required warning text.
- G4 is blocked while any `both_changed` finding lacks a `humanDecision`.
- Classification is a pure function in `packages/diff` with fixture triples covering all five
  classes.
- A regression test asserts that a `camunda_only` element is never reverted by a candidate that
  did not change it.
