# ADR-0022: Provider Capability Negotiation and Degradation Ladder

> **Status:** Approved · **Date:** 2026-08-22 · **Reversibility:** Moderate
> **Related:** ADR-0020, ADR-0021, ADR-0008, docs/10-architecture/ai-provider-abstraction.md §6

## Context

Once providers are abstracted (ADR-0020) and routing is policy-driven (ADR-0021), the application
cannot assume any particular capability. A private endpoint may have a smaller context window, no
native citations, no schema-constrained output, no prompt caching, or no vision.

The naive response — degrade silently to whatever works — would quietly destroy the product's
guarantees. The opposite — require full capability — would make on-premise operation impossible.

## Decision

1. Every AI task **MUST** declare **REQUIRED** and **PREFERRED** capabilities.
2. The broker **MUST** refuse a task whose REQUIRED capabilities no eligible provider satisfies,
   naming the specific missing capability. It **MUST NOT** substitute a weaker approach silently.
3. Where a PREFERRED capability is missing, a **declared degradation** applies:

| Missing | Degradation | Cost |
|---|---|---|
| Native citations | Require verbatim quotes; **locate them deterministically** in normalised source text and mint anchors ourselves; unlocatable quotes are **rejected** | Extra pass; recall loss; **provenance integrity preserved** |
| Large context | Structure-aligned chunking → per-chunk extraction → deterministic merge → reconciliation over summarised outputs | Cross-document reasoning quality drops; confidence reduced |
| Schema-constrained output | Tool calling; else prompt-plus-validate with a bounded repair loop (max 3), then hard failure | Latency and cost; **never a relaxed schema** |
| Prompt caching | Recompute prefixes; use batch where available; merge compatible passes | Cost only |
| Document input | Deterministic pre-extraction to text and page images | Layout fidelity loss; anchors unaffected |
| **Vision** | **None. Task refused.** Sources marked `requires_vision_capability`; manual transcription offered | Explicit and visible |
| Deep reasoning | Decompose into smaller sub-tasks; raise the human-review requirement | More human review |

4. Degradation **MAY** reduce recall, raise cost, or increase required human review. It
   **MUST NOT** weaken a schema, drop the citation requirement, or produce an unanchored
   requirement.
5. Every degradation **MUST** be recorded on the proposal, **MUST** propagate into computed
   confidence (ADR-0011), and **MUST** be visible in the UI and in the release AI-disclosure
   report.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Require full capability everywhere | Makes on-premise operation impossible, defeating ADR-0021 |
| Degrade silently to whatever works | Destroys the guarantees invisibly — the worst possible outcome |
| Lowest-common-denominator design (assume minimal capability always) | Wastes real capability where it exists and lowers quality for every project |
| Per-provider task implementations | Combinatorial explosion; divergent behaviour; untestable |

## Consequences

**Positive**

- The traceability guarantee survives provider substitution: recall may drop, provenance integrity
  does not (ADR-0008).
- On-premise operation is genuinely supported, with honest quality reporting.
- Degradation is visible in the epistemic record, so a reviewer can see that a requirement was
  extracted under constrained conditions.
- Vision's lack of a fallback is stated rather than fudged, which surfaces the real scope
  consequence early (OD-1).

**Negative**

- The `post_hoc` citation locator is real, non-trivial machinery we own and must keep correct —
  including Arabic-tolerant matching.
- Chunked map-reduce reconciliation is materially weaker than whole-corpus reasoning, and this
  will show in evaluation results.
- Every rung needs its own tests, and the ladder must be exercised in CI against the reduced-
  capability adapter.

## Enforcement

- Task capability declarations live in the task registry and are validated at startup against
  loaded descriptors.
- The provider conformance suite runs each task with each capability disabled, asserting valid,
  anchored output or an explicit refusal.
- `AiResponse.degradations[]` is propagated to `Requirement.degradations[]` and into
  `confidenceFactors.degradationPenalty`.
- An unlocatable quote never produces an `EvidenceItem` (ADR-0008).
