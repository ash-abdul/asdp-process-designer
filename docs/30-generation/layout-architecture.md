# Automatic Layout Strategy

> **Status:** Approved (Phase 0) · **Version:** 2.0 · **Updated:** 2026-08-22
> **Revision:** v2.0 supersedes v1.0. v1.0 specified building a custom layout engine on a
> general-purpose graph library **before measuring what the BPMN ecosystem already provides**. That
> was premature. v2.0 makes ecosystem tooling the default, custom logic the measured residual, and
> commits to no library until Spike S4 produces evidence.
> **Related:** [ADR-0014](../adr/ADR-0014-layout-safety-critical.md), [process-ir.md](process-ir.md)

---

## 1. ASDP's responsibility, stated precisely

| ASDP **is** responsible for | ASDP is **not** responsible for |
|---|---|
| Generating **semantically correct** BPMN | Being a graphical BPMN modelling product |
| Producing a **usable automatic visual layout** | Producing best-in-class diagram aesthetics |
| **Rendering** the generated process | Interactive layout editing |
| **Zoom, pan, selection, inspection, traceability overlays** | Manual repositioning of any kind |
| Measuring whether the layout is good enough to review | Competing with Camunda Modeler's layout capability |

**The objective is a diagram a reviewer can read, not a diagram a designer would draw.** That
distinction sets the acceptance bar, and it is much lower than "build a layout engine".

## 2. Why layout still matters more here than elsewhere

Users cannot reposition elements ([ADR-0001](../adr/ADR-0001-requirements-driven-product-boundary.md)).
If a generated diagram is unreadable there is no recourse — no dragging, no cleanup. So layout
**quality must be measured and gated**, even though the layout **engine** should be borrowed rather
than built.

The v1.0 error was conflating those two things: the *discipline* (versioning, metrics, a golden
corpus) is genuinely necessary; the *engine* was not ours to write.

## 3. Selected approach: ecosystem-first, three tiers

```
TIER 1 — ESTABLISHED BPMN AUTO-LAYOUT  (the default)
   A proven, BPMN-aware auto-layout capability from the bpmn.io / Camunda ecosystem,
   consuming the BPMN we generate and producing its diagram interchange.
        │
        │  measure against the quality metrics (§5)
        ▼
TIER 2 — ASDP POST-PROCESSING  (only where Tier 1 measurably falls short)
   A narrow, bounded pass over the produced diagram interchange. Boundaries in §6.
        │
        │  measure again
        ▼
TIER 3 — REGION-GUIDED COMPOSITION  (fallback, only if Tiers 1–2 fail)
   Use the IR region tree to lay out each region with the ecosystem tool independently,
   then compose the region boxes. Still no custom low-level layout algorithm.
```

**No library is selected in this document.** Spike S4 (§8) produces the evidence; the selection is
then recorded as an amendment here and in `technology-stack.md`. A pinned choice today would be a
guess dressed as a decision.

### 3.1 Why Tier 1 is likely to be sufficient

Simple layered BPMN layout performs well on **well-structured input**, and the IR *guarantees*
well-structured input:

- control flow is a **nested region tree**, so there are no arbitrary cross-branch edges
  ([process-ir.md](process-ir.md) §3);
- **IR-24** bounds nesting depth to the profile maximum;
- region size is bounded, and exceeding it produces a **subprocess-extraction proposal at the
  specification level** rather than a bigger diagram;
- the pattern table excludes constructs that lay out poorly and read ambiguously — complex
  gateways, ad-hoc subprocesses, unstructured back-edges
  ([pattern-mapping.md](pattern-mapping.md) §7).

In other words: **the IR has already done most of the work that a bespoke layout engine would
otherwise have to do.** The remaining problem is much closer to the case existing tools handle well.

### 3.2 Camunda's own tooling — why it cannot be Tier 1 alone

Layout inside Camunda Modeler and Web Modeler is excellent, and where an engineer opens the handed-off
package in Modeler they get it. But it is applied by a **user, after handoff**, in a tool we do not
drive. ASDP needs a layout at **design time**, in its own read-only viewer, before G3 and G4 — so it
cannot depend on a post-handoff action.

Two consequences we accept deliberately:

- **We do not need to match Modeler's layout quality.** The generated diagram must be reviewable in
  ASDP; final aesthetic polish can legitimately happen in Camunda after handoff, where a person can
  invoke it in one click.
- **`HANDOFF.md` will state this explicitly**, so a receiving engineer knows that re-laying-out the
  diagram in Modeler is expected and harmless — and that doing so is a *cosmetic* divergence, which
  the divergence classifier already treats as such
  ([handoff-and-divergence.md](../50-governance/handoff-and-divergence.md)).

## 4. Fallback strategy

| If | Then | Recorded as |
|---|---|---|
| Tier 1 meets the metrics on the golden corpus | Adopt it. No ASDP layout code beyond invocation and measurement | The expected outcome |
| Tier 1 fails specific metrics on specific shapes | Add **Tier 2** post-processing for those shapes only, scoped per §6 | An amendment naming the shapes and the passes |
| Tier 1 fails broadly across shapes | **Tier 3**: region-guided composition, still delegating per-region layout to the ecosystem tool | An amendment; adds ~2–3 weeks to P4 |
| Tiers 1–3 all fail the metrics | **Escalate before writing a custom engine.** The options are a stricter IR (smaller regions, lower extraction thresholds), a revised review model leaning on the non-diagram views, or — explicitly your decision, not ours — reconsidering the read-only boundary | A decision request, not a code change |

**Writing a general-purpose layout algorithm is not on this ladder.** If we reach the bottom of it,
the problem is upstream of layout.

## 5. Layout quality is measured, not assumed

Retained from v1.0 unchanged, because this is the part that was right. Metrics produce validation
findings (layer L5), which turns "unreadable diagram" from a subjective complaint into a detectable
defect with a named remedy.

| Metric | Default threshold | Finding | Severity |
|---|---|---|---|
| Label collisions | 0 | `L5-LAYOUT-002` | **Error** |
| Node overlaps | 0 | `L5-LAYOUT-003` | **Error** |
| Edge crossings per node | ≤ 0.15 | `L5-LAYOUT-001` | Warning |
| Longest edge ÷ median edge | ≤ 6 | `L5-LAYOUT-004` | Warning |
| Backward edges outside reserved channels | 0 | `L5-LAYOUT-005` | Warning |
| Nodes per visual band | ≤ 12 | `L5-LAYOUT-006` | Warning |
| Diagram aspect ratio | 1:1 – 5:1 | `L5-LAYOUT-007` | Warning |
| Total nodes in one diagram | ≤ 40 | `L5-LAYOUT-008` | Warning |

Thresholds are configurable per standards profile. Most findings recommend a **specification-level**
action — usually `group_into_subprocess` — rather than a layout adjustment, because that is the only
lever the user has and usually the better answer anyway.

**The metrics are proxies.** The real acceptance criterion is criterion 6 in §8: a process engineer
who did not build the tool declares the diagram reviewable.

## 6. Boundaries of ASDP-specific layout logic

Hard limits on what Tier 2 may contain. Anything outside this list is out of scope and requires an
amendment to this document.

**Permitted (Tier 2):**

| Pass | Purpose |
|---|---|
| **Label measurement and node sizing** | Measure the label with the **actual shipped font and the language that will be displayed**, and size the node accordingly. Arabic and English metrics differ materially, and a layout computed on English metrics will collide on Arabic labels. **This pass is mandatory regardless of tier** — no general BPMN layout tool knows our font stack or display-language setting |
| **Attached-element placement adjustment** | Choose the attachment side of an interruption or the placement of its handler, where the tool's default overlaps or reads backwards |
| **Reading-direction application** | Apply `presentation_hint.readingDirection` and `orientation` |
| **Band ordering** | Apply `presentation_hint.bandOrder` — a vertical ordering convention for readability, **not** BPMN lanes |
| **Overlap resolution of last resort** | Separate overlapping shapes where the tool has produced a collision, by minimal displacement only |
| **Determinism normalisation** | Round and canonicalise coordinates so identical input yields an identical hash ([artifact-model.md](../20-domain/artifact-model.md) §3) |

**Forbidden:**

- any general-purpose graph-layout algorithm of our own;
- edge routing beyond what the ecosystem tool produces, except the minimal displacement above;
- aesthetic optimisation (symmetry, alignment beautification, edge-bundling);
- anything user-invocable — Tier 2 is compiler-internal, never an interactive feature;
- any code path that accepts coordinates from a user or from an AI proposal.

## 7. Retained discipline (independent of tier)

These survive from v1.0 and apply whichever tier is selected:

1. **Versioned.** `layoutEngineVersion` on every BPMN artifact version, identifying the ecosystem
   tool version plus the ASDP post-processing version. A past release stays reproducible.
2. **Deterministic.** Same IR + same versions → identical geometry → identical hash. Asserted in CI.
3. **Locally stable.** A change confined to one region must not re-flow unrelated regions, or diff
   review is worthless. Tier 3 provides this structurally; under Tier 1 it is **measured** on the
   golden corpus and is one of the criteria that could force Tier 3.
4. **Cosmetic classification.** Geometry-only differences (from a tool upgrade) are classified
   `cosmetic` in the semantic diff and never shown to an approver as a process change.
5. **Golden-layout corpus in CI.** ≥20 representative processes with approved reference layouts;
   metric regressions fail the build; rendered images produced on every change so a human can see a
   regression the metrics miss. **This remains the single highest-value test asset in the project.**
6. **Constrain the input, not the algorithm.** IR-24 and region-size limits do the heavy lifting;
   layout complexity is redirected into specification-level decomposition.

## 8. Spike S4 — still required, restructured as a measurement

**Purpose:** determine which tier is necessary, and whether generated diagrams are legible without
any manual repositioning. **Not** to build a layout engine.

**Method**
1. Hand-author six IR documents: linear · multi-branch · parallel + loop · exception-heavy (with
   interruptions and an event handler) · wide/dense · Arabic-labelled.
2. Compile them to BPMN with the real compiler.
3. **Run the candidate ecosystem auto-layout tools on the output**, unmodified. Record metrics per
   tool per fixture.
4. Add the mandatory label-measurement pass (§6) and re-measure.
5. Only then, identify which specific fixtures and metrics still fail, and what minimal Tier 2 pass
   would address them.

**Success criteria**
1. All six fixtures rendered by at least one ecosystem tool.
2. **Zero label collisions and zero node overlaps** on all six, after the label-measurement pass.
3. Edge crossings per node ≤ 0.15; nodes per band ≤ 12; aspect ratio within range.
4. Interruption handlers placed on a readable side; the event handler distinguishable from main
   flow.
5. Arabic labels sized with the shipped font: no truncation, no collision, correct direction.
6. **A process engineer who did not build the tool declares each diagram reviewable.**
7. Local stability: changing one branch does not re-flow unrelated regions.
8. Determinism: two runs produce identical geometry.

**Deliverable:** a written comparison of the candidate tools against criteria 1–8, a recommended
tier, and — if Tier 2 is needed — the specific passes required. The library selection is recorded
only after this spike.

**Time box:** 5 days. A spike that concludes "Tier 1 is sufficient, and here is the evidence" is the
best possible outcome and eliminates several weeks of P4 work.
