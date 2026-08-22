# ADR-0009: Technology-Neutral Business Process Specification

> **Status:** Approved · **Date:** 2026-08-22 · **Reversibility:** Very hard
> **Related:** ADR-0002, ADR-0006, docs/20-domain/domain-model.md §6

## Context

Between approved requirements and generated BPMN there must be a human-approvable process
definition. The tempting shortcut is to make that layer a "draft BPMN" — same vocabulary, same
shapes, just editable.

That shortcut collapses two stages into one. A business owner would then be approving BPMN, which
they cannot meaningfully review, and the requirement "there must be a technology-neutral business
process specification" would be satisfied in name only.

## Decision

The Business Process Specification **MUST** be technology-neutral. Its vocabulary **MUST NOT**
contain BPMN concepts: no gateway, sequence flow, boundary event, lane, pool, event subprocess,
or diagram geometry.

It **MUST** express: steps with kinds (`manual`, `automated`, `decision`, `wait`, `subprocess`,
`notification`), actors, flows with conditions, decision points, exceptions, escalations,
integrations, SLAs, and KPIs.

The translation from this vocabulary to BPMN constructs **MUST** be a deterministic pattern
mapping (docs/30-generation/pattern-mapping.md), within which AI may choose and must justify, and
which AI **MUST NOT** extend.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| BPS as draft BPMN | Collapses stages 4 and 5; a business owner cannot meaningfully approve BPMN; defeats the stated design principle |
| No intermediate layer (requirements → BPMN directly) | Exactly the silent conversion the gates exist to prevent |
| BPMN-lite (a reduced BPMN vocabulary) | Still BPMN vocabulary; still unapprovable by a business owner; still couples the specification to one engine |

## Consequences

**Positive**

- A business owner can genuinely review and approve the process definition.
- The specification remains valid if the target engine ever changes; only the pattern mapping and
  compilers are engine-specific.
- Requirements-to-specification traceability is expressed in business terms, which is what the
  traceability matrix needs to be readable by an auditor.
- The structured region tree (ADR-0006) is derived from the mapping rather than authored, so
  neither humans nor AI can introduce unstructured control flow.

**Negative**

- Two models to keep coherent: the BPS and the IR.
- Architects accustomed to thinking in BPMN must express intent in a different vocabulary.
- Some BPMN capabilities have no BPS expression, and adding one requires extending both the BPS
  schema and the pattern table.

## Enforcement

- Schema review: the BPS schema is checked against a prohibited-term list (gateway, sequenceFlow,
  boundaryEvent, lane, pool, and their variants).
- The BPS editor has no diagram surface.
- The pattern table is versioned with the compiler; additions require fixtures per Camunda
  profile (docs/30-generation/pattern-mapping.md §8).
