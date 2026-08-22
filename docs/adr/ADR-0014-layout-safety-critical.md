# ADR-0014: Layout Quality Is Safety-Critical; the Layout Engine Is Not Ours to Build

> **Status:** Approved · **Date:** 2026-08-22 · **Reversibility:** Moderate
> **Revision:** v2.0 supersedes the original decision. The original conflated two things: layout
> *quality discipline* (genuinely necessary) and building a layout *engine* (premature and outside
> our remit). v2.0 keeps the discipline and delegates the engine.
> **Related:** ADR-0001, ADR-0006, docs/30-generation/layout-architecture.md

## Context

Users cannot reposition elements (ADR-0001). If a generated diagram is unreadable there is no
recourse, so layout quality must be measured and gated.

The original version of this ADR then took an unjustified step: it specified building a custom
region-tree layout composer on a general-purpose graph library, **before measuring what the
bpmn.io / Camunda ecosystem already provides**. ASDP's remit is to generate semantically correct
BPMN and render it for review — not to become a graphical BPMN layout product. Recreating a
capability the ecosystem already ships is waste.

Two facts change the calculus in the ecosystem's favour:

1. **The IR guarantees well-structured input.** Control flow is a nested region tree with bounded
   nesting depth (IR-24) and bounded region size, and the pattern table excludes constructs that lay
   out badly. Simple layered BPMN layout performs well on exactly this kind of input, so the IR has
   already absorbed most of the difficulty a bespoke engine would have addressed.
2. **The acceptance bar is "reviewable", not "beautiful".** Final aesthetic polish can legitimately
   happen in Camunda Modeler after handoff, in one click, by a person. ASDP needs a diagram good
   enough to review at G3/G4.

## Decision

**Layout quality remains safety-critical. The layout engine is delegated to the ecosystem.**

1. **Tier 1 (default):** use an established, BPMN-aware auto-layout capability from the
   bpmn.io / Camunda ecosystem, consuming the BPMN we generate.
2. **Tier 2 (bounded):** ASDP-specific post-processing **only where Tier 1 measurably falls short**,
   confined to the permitted passes in `layout-architecture.md` §6 — chiefly **label measurement and
   node sizing with the shipped font and the displayed language**, which is mandatory in every tier
   because no general tool knows our font stack or display-language setting.
3. **Tier 3 (fallback):** region-guided composition — lay out each IR region with the ecosystem tool
   independently and compose the region boxes. Still no custom low-level layout algorithm.
4. **Writing a general-purpose layout algorithm is not on the ladder.** If Tiers 1–3 fail, the
   problem is upstream and the response is a decision request, not code.
5. **No library is selected until Spike S4 produces evidence.** The spike is restructured as a
   *measurement* of candidate ecosystem tools against the quality metrics, not as an implementation.
6. **The quality discipline is retained in full**, independent of tier: versioned
   `layoutEngineVersion`; determinism; local stability; cosmetic classification of geometry-only
   diffs; measured metrics producing L5 findings with **label collisions and node overlaps as
   blocking errors**; and the mandatory ≥20-process golden-layout corpus in CI.
7. **Input constraint over algorithm sophistication.** IR-24 and region-size limits redirect
   complexity into specification-level decomposition (`group_into_subprocess`), which is the only
   lever the user has and usually the better answer.

## Alternatives considered

| Alternative | Verdict |
|---|---|
| **Established BPMN auto-layout from the ecosystem** | **Selected as Tier 1.** BPMN-aware by design, maintained outside our codebase, zero build cost. Risk: historically simpler on nested scopes, attached events, and dense branching — which is exactly what S4 measures |
| **Custom composer on a general-purpose graph library** | **Rejected as the default; retained as Tier 3 in region-guided form.** General-purpose layout is not BPMN-aware, so BPMN semantics must be re-imposed by us; and it is a component we would own forever |
| **Camunda Modeler / Web Modeler layout** | **Not available to us as a design-time capability.** It is applied by a user in a tool we do not drive, after handoff. It cannot satisfy a pre-G3 review requirement — but it *is* the right place for final polish, and `HANDOFF.md` says so |
| **Treat layout as a pure library concern with no metrics** | Rejected. Guarantees eventual unreadable output with no detection |
| **Allow manual repositioning** | Rejected. Reverses ADR-0001 at the most tempting point and reintroduces geometry merge on regeneration |

## Consequences

**Positive**

- Removes several weeks of P4 work if Tier 1 suffices, and removes a component we would otherwise
  maintain indefinitely.
- Stays inside ASDP's remit: generate correct BPMN, lay it out usably, render it, overlay
  traceability.
- The quality gate is unchanged, so the risk that motivated the original ADR is still controlled.
- Divergence handling already classifies a Modeler re-layout as *cosmetic*, so post-handoff
  beautification is harmless by design.

**Negative**

- Diagram aesthetics will be merely adequate, not excellent. Accepted — the bar is reviewability.
- We depend on an external tool's behaviour for a gated property, so the golden corpus must detect
  regressions when that tool is upgraded. Handled by pinning and CI.
- Tier selection is deferred to S4, so P4 sizing carries a bounded unknown (0 to ~3 weeks).
- Label measurement remains ours in every tier, because bilingual sizing is not a general tool's
  concern.

## Enforcement

- `layoutEngineVersion` on every BPMN artifact version, recording the ecosystem tool version and the
  ASDP post-processing version.
- Golden-layout corpus in CI; metric regressions fail the build; rendered images for human review.
- `L5-LAYOUT-001 … 008`, two blocking.
- An architecture review check that Tier 2 contains only the permitted passes; anything else
  requires an amendment to `layout-architecture.md` §6.
- Spike S4 must deliver a written tool comparison before any layout code is written.
