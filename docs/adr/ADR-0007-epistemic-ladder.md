# ADR-0007: Four-Level Epistemic Ladder

> **Status:** Approved · **Date:** 2026-08-22 · **Reversibility:** Very hard
> **Related:** ADR-0004, ADR-0008, ADR-0011, docs/20-domain/epistemic-model.md

## Context

The product must clearly distinguish extracted facts from source material, AI interpretations,
AI-generated recommendations, and human-approved requirements. A boolean `isAiGenerated` flag
cannot express this, and a free-text provenance note cannot be enforced or counted.

The distinction also needs to *propagate*: a BPMN element whose requirement chain rests on
unconfirmed inference is a different risk from one that rests on a quoted policy clause, and a
reviewer must be able to see and count the difference.

## Decision

Content **MUST** carry an explicit epistemic level:

| Level | Meaning | Created by | Editable |
|---|---|---|---|
| **L0** Source | Original bytes | Upload | Never |
| **L1** Evidence | Verbatim fact with a resolvable anchor; no interpretation | AI extraction or parser | **Never** — only re-extracted |
| **L2** Interpretation | AI's reading of evidence: restated, normalised, classified | AI | By a human |
| **L3** Recommendation | AI-proposed content with **no direct source** | AI | By a human |
| **L4** Approved | Human-signed | **Human act only** | Only via a new version |

Rules:

1. Only a human-initiated command **MAY** set L4. AI **MUST NOT**.
2. L1 is immutable; correction means re-extraction.
3. L3 **MUST** carry an `inferenceRationale`.
4. Only L4 content **MAY** flow downstream past G1.
5. A LOW-confidence L3 requirement **MUST NOT** sit on an executable path.
6. Levels **MUST** be visually distinguishable without relying on colour, and **MUST** be
   **counted** in the release AI-disclosure report.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Boolean `aiGenerated` flag | Cannot distinguish "quoted a document" from "invented a plausible rule" — the distinction that matters most |
| Confidence score alone | Confidence and epistemic origin are orthogonal: a high-confidence inference is still an inference |
| Free-text provenance note | Not enforceable, not countable, not queryable |

## Consequences

**Positive**

- The four-way distinction is queryable, countable, and reportable, not merely displayed.
- "AI approved a requirement" is structurally impossible.
- Downstream propagation gives reviewers a number — "7 of 41 elements rest on AI inference" —
  which is actionable in a way scattered badges are not.
- Demotion on source supersession is automatic and visible.

**Negative**

- More user interaction: L3 content requires explicit confirmation separate from ordinary
  approval.
- Every UI surface must render level, which is real design work.
- Editing L2/L3 content does not promote it, which users will initially find surprising.

## Enforcement

- Domain invariants D2 (evidence or rationale required) and D3 (human-only L4).
- Validation rule `L4-TRACE-005`: no executable element resting solely on unconfirmed L3.
- The AI-disclosure report is a required release artifact
  (docs/50-governance/audit-and-compliance.md §3.1).
