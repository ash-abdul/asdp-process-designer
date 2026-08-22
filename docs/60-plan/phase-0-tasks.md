# Phase 0 — Task Breakdown and Spikes

> **Status:** Approved (Phase 0) · **Version:** 1.0 · **Updated:** 2026-08-22
> **Related:** [roadmap.md](roadmap.md), [open-decisions.md](open-decisions.md)

Phase 0 delivers a working governance spine with **zero AI in the critical path**, plus six
spikes that de-risk the phases after it. Target: 4 weeks.

**Nothing in Phase 0 requires a decision that is still open** — see
[open-decisions.md](open-decisions.md) for what is genuinely blocked and when.

---

## 1. Workstream A — Repository and CI

| # | Task | Done when |
|---|---|---|
| A1 | Monorepo skeleton per [module-map.md](../10-architecture/module-map.md) §1 | All package directories exist with stub exports |
| A2 | TypeScript project references, strict mode, shared config | `build` passes across all packages |
| A3 | **Dependency-rule linting** enforcing module-map §3 | A deliberate violation (e.g. `ai` importing `domain`) fails CI |
| A4 | Test runner for pure packages; snapshot infrastructure | A trivial golden-file test passes |
| A5 | **Architecture absence test** — no artifact-mutating command exists | Test enumerates command handlers and asserts none targets `ArtifactVersion` |
| A6 | Container image with `api` / `worker` entrypoints | Both start in Compose |
| A7 | Compose stack: api, worker, postgres (ICU + vector), object store, OIDC dev container | `docker compose up` yields a healthy stack |
| A8 | 12-factor config loader; **no environment-name branching** | Config schema validated at boot; missing required values fail fast |
| A9 | Health / readiness / dependency-report endpoints | Probes behave per [deployment-architecture.md](../10-architecture/deployment-architecture.md) K4 |
| A10 | Structured JSON logging + OpenTelemetry wiring | Traces visible end to end for one request |

## 2. Workstream B — Governance spine

| # | Task | Done when |
|---|---|---|
| B1 | Postgres schema + migrations for governance, artifact, and audit contexts | Migrations run as a one-shot task (K7) |
| B2 | OIDC authentication against the dev IdP; claims → role mapping from config | Login works; roles resolve from a configurable claim path; **no skip-auth mode exists** |
| B3 | Project, ProjectSettings, membership CRUD | Project creation and role assignment work |
| B4 | **Gate state machine** G0–G4 with read-locks | Attempting a downstream command before an upstream gate fails at the command layer, not the UI |
| B5 | **Baseline** creation, content hashing over member versions | Two identical baselines produce one hash; a single member change produces a different hash |
| B6 | **Approval as a signature over `(baselineHash, validationRunId)`** | Changing either invalidates the approval and reopens the gate |
| B7 | Append-only audit log with interceptor | Every command writes an event; no update/delete path exists |
| B8 | Artifact repository: `Artifact`, `ArtifactVersion`, `ArtifactDependency`, insert-only | Version creation works; mutation is impossible |
| B9 | **Canonical serialisation + hashing** for JSON and XML payloads | Reserialising a payload without semantic change yields an identical hash; NFC-equivalent Arabic text yields one hash |
| B10 | Job queue with idempotency keys, resumability, graceful drain | A killed worker resumes without duplicating work |
| B11 | **`Rule` / `Finding` / `ValidationRun` model in `packages/schemas`**, including `gates[]`, `severityByGate`, and message/fix-hint **keys** rather than formatted strings | Model matches [validation-architecture.md](../40-quality/validation-architecture.md) §4; a gate-scoped rule resolves to the correct severity per gate in a unit test |
| B12 | **Message catalogue mechanism** for rule packs — ICU format, named parameters, `en` + `ar`, bidi-safe interpolation, missing-translation fallback raising `L5-I18N-001` | A finding renders correctly in both languages, with an Arabic parameter inside an English message correctly isolated |

## 3. Workstream C — AI provider foundation (no analysis yet)

| # | Task | Done when |
|---|---|---|
| C1 | `AiProvider` port and neutral request/response types | No vendor concept appears in the port's signature |
| C2 | `ProviderDescriptor` and capability model | Descriptors load from config |
| C3 | **Egress policy gate** and classification model | Policy decisions computed and recorded; denial is a typed outcome, not an exception |
| C4 | Routing engine with preference order, capability filtering, and rejection reasons | `ProviderRoutingRecord` written for every decision |
| C5 | Degradation planner with the declared ladder | Each rung selectable and recorded |
| C6 | **Claude adapter** | One task round-trips with schema-valid output |
| C7 | **Private-endpoint adapter** with a deliberately reduced capability set | Same task round-trips via the degradation ladder |
| C8 | **Null adapter** | Application remains navigable and honest with no AI available |
| C9 | Provider conformance suite | Runs against all three adapters in CI |
| C10 | `AiInteraction` audit record written by the broker | No caller can bypass it |
| C11 | Cost and unit accounting via provider-native counting | No character-based estimation anywhere |

## 4. Workstream D — Text and provenance foundation

| # | Task | Done when |
|---|---|---|
| D1 | `packages/text`: NFC normalisation, Arabic folding, match form, offset maps | Unit tests pass on bilingual fixtures |
| D2 | `packages/provenance`: anchor types, resolution, verification | Round-trip and checksum-sensitivity tests pass |
| D3 | **Code-point offset arithmetic** with non-BMP fixtures | The UTF-16 mistake is caught by a test |
| D4 | Bidi-safe composition utilities in `packages/ui` | Mixed Arabic/English label renders correctly with isolation |
| D5 | ASCII identifier minting + transliteration/slug strategy | Deterministic, stable, collision-free on fixtures |

## 5. Workstream E — Evaluation foundation

| # | Task | Done when |
|---|---|---|
| E1 | Corpus registry, resolved by ID from a configured store | No corpus is assumed to be in-repo |
| E2 | One synthetic bilingual corpus | Registered and loadable |
| E3 | Recording / replay of AI responses | CI evaluation runs with no network access |
| E4 | Metrics: anchor resolution rate, hallucination rate | Computable on the synthetic corpus |
| E5 | Report format with **corpus tier stated prominently** | A synthetic-only metric cannot be mistaken for a validated one |

## 6. Workstream F — Documentation and decisions

| # | Task | Done when |
|---|---|---|
| F1 | This documentation set | Complete and approved |
| F2 | ADR-0001 … ADR-0032 | Approved |
| F3 | Analysis Frame v1 slot definitions | Approved |
| F4 | Process IR v1 with invariants | Approved |
| F5 | Generation Directive vocabulary v1 | Approved |
| F6 | Validation rule catalogue v1.2, incl. the `L4-SPEC-*` G2 group | Approved |
| F7 | Open-decision register with named blocking points | Approved |

---

## 7. The six spikes

Each spike has a **time box**, a **decision it informs**, and a **documented fallback**. A spike
that fails is a success if it changes the plan early.

### S1 — Read-only viewer shell (3 days)

Embed `bpmn-js` NavigatedViewer on a hand-written BPMN file. Add element selection, an
inspector panel, and two overlays (a marker and a badge). Verify keyboard navigation.

- **Informs:** P5 sizing; whether the overlay/marker APIs are sufficient.
- **Fallback:** a custom canvas overlay layer above the renderer.

### S2 — Arabic PDF extraction ⚠️ highest uncertainty (5 days) — **library-first**

**Purpose:** determine whether Arabic PDF text can be extracted with **logical-order,
exact-precision anchors**, and how much of that the existing PDF ecosystem already gives us.

**Method — measure before building.** The original plan specified a custom Unicode Bidirectional
Algorithm pipeline before establishing what mature PDF libraries already provide. Corrected:

1. Take three real-world-shaped Arabic PDFs: text-layer, mixed Arabic/English, scanned.
2. **First, measure what the standard PDF text-extraction stack produces unmodified** — its own bidi
   handling, presentation-form output, and per-glyph coordinates. Record the exact-precision yield
   rate.
3. Only then build the residual: presentation-form and ligature folding, logical-order
   reconstruction where the library does not provide it, word reassembly, and the logical-range ↔
   visual-rectangle map.
4. Verify anchor round-trip, checksum sensitivity, and highlight accuracy on all three.

**Success criteria**
1. All three fixtures processed end to end.
2. Anchor round-trip: `resolve(anchor)` returns text identical to the stored unit, for every unit.
3. Checksum sensitivity: a one-character mutation yields `DRIFTED`/`BROKEN`, never silent `RESOLVED`.
4. Highlight accuracy, including a wrapped RTL range producing multiple rectangles.
5. Tolerant quote location across diacritics, Alef/Yeh/Hamza variants, Tatweel, Arabic-Indic digits.
6. **A stated exact-precision yield rate per fixture** — the number that decides viability.
7. A written statement of how much was library-provided versus ASDP-implemented.

- **Informs:** P1 sizing; the viability of `pdf_region` anchors for Arabic.
- **Fallback (documented, not silent):** treat the page as an image; vision extraction with
  `image_region` anchors at `page` precision, with the confidence ceiling applied.
- **This remains the single highest-uncertainty engineering task in the project.**

### S3 — Arabic diagram labels and RTL layout (3 days)

Render a BPMN diagram with Arabic element names in the viewer. Assess text shaping, wrapping,
label placement, and truncation. Trial an `rtl` flow direction.

- **Informs:** [OD-5](open-decisions.md); layout label-metric strategy.
- **Fallback:** render labels in an overlay text layer we control rather than via the renderer's
  native text.

### S4 — Automatic layout ⚠️ largest product risk (5 days) — **a measurement, not an implementation**

**Purpose:** determine **which tier** of the layout strategy is necessary, and whether generated
diagrams are legible with no manual repositioning. **Not** to build a layout engine
([ADR-0014](../adr/ADR-0014-layout-safety-critical.md) v2.0).

**Method**
1. Hand-author six IR documents: linear · multi-branch · parallel + loop · exception-heavy (with
   interruptions **and** an event handler) · wide/dense · Arabic-labelled.
2. Compile them to BPMN with the real compiler.
3. **Run the candidate ecosystem BPMN auto-layout capabilities on the output, unmodified.** Record
   every quality metric per tool per fixture.
4. Add the mandatory bilingual **label-measurement and node-sizing** pass — the one pass no general
   tool can provide, since it depends on our font stack and display language — and re-measure.
5. Identify which specific fixtures and metrics still fail, and the minimal Tier 2 post-processing
   that would address them.

**Success criteria**
1. All six fixtures rendered by at least one ecosystem tool.
2. **Zero label collisions and zero node overlaps** on all six, after the label-measurement pass.
3. Edge crossings per node ≤ 0.15; nodes per band ≤ 12; aspect ratio within range.
4. Interruption handlers on a readable side; event handler visually distinguishable from main flow.
5. Arabic labels sized with the shipped font: no truncation, no collision, correct direction.
6. **A process engineer who did not build the tool declares each diagram reviewable.** The metrics
   are proxies; this is the real criterion.
7. Local stability: changing one branch does not re-flow unrelated regions.
8. Determinism: two runs produce identical geometry.

**Deliverable:** a written comparison of candidate tools against criteria 1–8, a recommended tier,
and the specific Tier 2 passes required if any. **The library selection is recorded only after this
spike** — nothing is pinned beforehand.

- **Informs:** P4 sizing (bounded unknown, 0 to ~3 weeks) and whether the read-only boundary is
  viable.
- **Best outcome:** "Tier 1 is sufficient, here is the evidence" — which removes several weeks of
  P4 work and a component we would otherwise maintain indefinitely.
- **If Tiers 1–3 all fail:** escalate to you before writing any custom layout algorithm. The options
  are a stricter IR, a review model leaning more on the non-diagram views, or reconsidering the
  boundary — **not** a manual editor by default.

### S5 — Provider abstraction and degradation (4 days)

Implement `EXTRACT_EVIDENCE` end to end against both adapters. Exercise every rung of the
degradation ladder, especially `post_hoc` quote location with Arabic folding.

- **Informs:** P2 sizing; whether the neutral request model leaks.
- **Fallback:** if a capability cannot be abstracted cleanly, declare it a **required**
  capability rather than degrading it, and record the consequence for on-premise-only projects.

### S6 — Egress policy enforcement (2 days)

Assert, at the HTTP transport boundary, that a `RESTRICTED`-classified payload never reaches the
external adapter, that a `PROHIBITED` source produces no interaction at all, and that redaction
token maps never appear in an outbound payload.

- **Informs:** confidence in the central governance guarantee.
- **Fallback:** none. This must work; it is a correctness requirement, not a design option.

---

## 8. Phase 0 exit criteria

1. `docker compose up` yields a healthy stack; login works via standards-based OIDC.
2. A project can be created, a gate opened, a baseline hashed, and an approval signed and
   invalidated by a content change.
3. Dependency-rule linting and the artifact-mutation absence test both fail on deliberate
   violations.
4. An AI task round-trips through **two** adapters, with the degradation ladder exercised and
   recorded.
5. A `RESTRICTED` payload provably cannot leave, asserted at the transport boundary.
6. Anchor round-trip, checksum sensitivity, and non-BMP offset tests pass on bilingual fixtures.
7. The evaluation harness computes anchor-resolution and hallucination metrics on the synthetic
   corpus and labels the report as `synthetic`.
8. All six spikes have written outcomes, and any that failed have a re-scoped plan.
9. ADR-0001 … ADR-0032 approved.
10. The open-decision register shows nothing blocking P1.
