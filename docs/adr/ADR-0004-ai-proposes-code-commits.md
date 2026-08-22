# ADR-0004: AI Proposes, Deterministic Code Commits

> **Status:** Approved · **Date:** 2026-08-22 · **Reversibility:** Very hard
> **Related:** ADR-0005, ADR-0007, ADR-0020, docs/10-architecture/architecture-overview.md

## Context

The product's binding principle is that AI assists with understanding, reasoning, analysis, and
artifact generation, while deterministic application logic controls governance, validation, state,
traceability, lifecycle, approval gates, artifact relationships, versioning, and packaging.

Stated as a principle, this is a preference. It has to become a property of the code, or it will
erode the first time an agentic shortcut looks convenient.

## Decision

The AI layer **MUST NOT** have write authority over domain state.

Every AI output **MUST** be materialised as a `Proposal` — structured payload, rationale, cited
evidence, confidence, provider provenance. A proposal becomes domain state only through an
explicit **human-initiated** command executed by deterministic code.

AI **MUST NOT**: allocate identifiers, set approval state, promote a requirement to approved,
compute an impact set, compute coverage, decide a validation verdict, resolve a conflict, create a
baseline, produce a release, or write to any repository.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Agentic AI writing domain state with post-hoc review | Review of already-committed state is not review; it is auditing under time pressure. Governance becomes theatre |
| AI writes low-risk fields only | "Low-risk" is not a stable category, and the exception list grows monotonically |
| Trust boundaries by prompt instruction | Prompt instructions are not enforcement |

## Consequences

**Positive**

- Every piece of AI-derived content has a recorded human verdict (accepted / edited / rejected),
  which is both the audit record and the primary quality metric.
- The "AI approved something" failure mode is structurally impossible.
- Proposal edit-rate becomes measurable, which is how prompts improve
  (docs/40-quality/ai-evaluation-framework.md §3.3).

**Negative**

- More user interaction than a fully automated flow. This is the point.
- Every AI task needs a proposal shape, a diff view, and an acceptance command.
- Proposal storage grows; retained regardless (ADR-0032).

## Enforcement

- **Dependency rule:** `packages/ai` may import only `schemas`, `raf`, and `text`. It cannot
  reach `domain` or any repository. A deliberate violation fails CI.
- `Proposal` records may be created only by the AI broker; applying one is a separate command
  requiring an authenticated human actor (domain invariant D14).
- `AiInteraction` records are written by the broker itself, so no caller can bypass logging.
- Domain invariant D3: only a human-initiated command may set `epistemicLevel = L4`.
