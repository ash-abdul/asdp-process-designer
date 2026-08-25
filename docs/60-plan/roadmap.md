# Implementation Roadmap

> **Status:** Approved (Phase 0) · **Version:** 1.2 — **reconciliation note added 2026-08-25 and
> corrected the same day for UI enablement; §1 is unchanged** · **Updated:** 2026-08-25
> **Related:** [phase-0-tasks.md](phase-0-tasks.md), [mvp-scope.md](../00-product/mvp-scope.md),
> [phase-2-status.md](phase-2-status.md) §17, [phase-2-plan.md](phase-2-plan.md)

Durations are engineering estimates for a small focused team, not commitments.

> ## ⚠️ Read §0 before citing P0, P1 or P2 as delivered
>
> **§1 below is the ORIGINAL APPROVED PLAN and has not been edited.** What was actually built
> diverges from it, and **§0 is the reconciliation**. P1 and P2 must **not** be read as fully
> delivered product milestones.

---

## 0. Reconciliation — roadmap versus what was actually built (2026-08-25)

> **Version 1.1 adds this section and changes nothing else.** §1's phase table is preserved verbatim
> as the version 1.0 commitment, deliberately, so what was originally promised stays legible. This
> section records the divergence rather than editing it away.

### 0.1 Why a reconciliation was needed

Two numbering schemes run in parallel and had never been mapped:

| Scheme | Meaning |
|---|---|
| **P0 … P9** | This roadmap's phases — a **capability plan**, approved in Phase 0 |
| **Phase 0 / 1 / 2** | The **implementation phases actually executed** in this repository |

**Implementation Phase 2 spans roadmap P1 and P2**, and it is **CLOSED / ACCEPTED** — see
[phase-2-status.md](phase-2-status.md) §16. **Roadmap P1 and P2 are NOT closed**, and nothing in
this repository has ever claimed they were.

The divergence arose at a documented but unapproved step: [phase-2-plan.md](phase-2-plan.md) §5
replaced this roadmap's exit criteria with twelve *"consolidated current acceptance criteria"*.
That consolidation labels itself honestly — *"not presented as an approved original"* — but **none of
its twelve criteria is user-facing**, and the omission of this roadmap's user-facing commitments was
never recorded as a decision. It is **accidental divergence formalised by a silent consolidation**,
not an approved re-scoping.

### 0.2 What implementation Phase 2 genuinely delivered and had accepted

Multimodal intake (text, DOCX, images), resolvable anchoring in Arabic and English, the AI broker
with egress enforcement and a declared degradation ladder, evidence extraction, structured
requirement proposals, reconciliation and conflict precedence, the human review command surface, and
**gate G1 — reachable by any number of projects in one database and durable across an application
restart**. All of it **API-only**, verified, and accepted for **mechanics, governance and
traceability**.

### 0.3 What remains UNDELIVERED from P1 and P2

**None of the following was delivered, and none was ever formally re-scoped or deferred with a
trigger.** They are open commitments of this roadmap.

| Roadmap commitment | Phase | Actual status |
|---|---|---|
| **Source viewer with RTL-safe highlighting** | P1 | ~~**API only.** … **No rendering surface exists**~~ — **SUPERSEDED 2026-08-25. It renders.** `GET …/content`, `…/units` and `…/highlights` compute direction-aware segments server-side, and **U1** renders them in the browser with correct LTR and RTL behaviour ([phase-2-status.md](phase-2-status.md) §18). **U2** added source intake, inventory, authority ranking and L0 validation (§19). **P1 is not thereby closed** — see §0.4 |
| **Requirements workspace** | P2 | **API only.** The full review command surface exists. **No workspace exists** |
| **Coverage dashboard** | P2 | **API only.** `GET …/frame-coverage` and `…/g1/readiness` exist. **No dashboard exists** |
| **A real bilingual 40-page BRD + screenshots + legacy BPMN** (P1 exit) | P1 | **Not done.** Every corpus is synthetic |
| **"On a real BRD"** (P2 exit) | P2 | **Not done.** Every corpus is synthetic |
| **Degradation ladder exercised end to end against the private-endpoint adapter** (P2 exit) | P2 | **Partial.** The adapter exists with a deliberately reduced capability set and the ladder is exercised in CI; **all transports are injected stubs** |
| **`apps/web` React SPA** ([module-map.md](../10-architecture/module-map.md), [technology-stack.md](../10-architecture/technology-stack.md)) | — | ~~**Does not exist.** No frontend of any kind; the checker's `presentation` class has never been declared by any package~~ — **SUPERSEDED 2026-08-25. It exists**, created by **U1** ([phase-2-status.md](phase-2-status.md) §18) and extended by **U2** (§19). It is the first package to declare the checker's `presentation` class. The original statement is kept so the gap it recorded stays legible |

**No live model has ever been called, in any slice.** Every evaluation figure in this repository is a
synthetic corpus against an authored stub.

### 0.4 Status of the undelivered work

> **Corrected 2026-08-25.** When §0.3 was written, **every** item in it was unplanned with no
> approved boundary. **Two have since been delivered under approved boundaries** — the `apps/web`
> SPA and the source viewer, by **U1** and **U2** ([phase-2-status.md](phase-2-status.md) §18–§19).
> **The rest remain UNPLANNED · BOUNDARY NOT YET APPROVED.**

| Item | Status |
|---|---|
| **`apps/web` SPA** · **source viewer** | **DELIVERED and ACCEPTED** — U1 and U2, 2026-08-25, each on an approved boundary with its ADR recorded first ([ADR-0039](../adr/ADR-0039-react-presentation-layer.md), [ADR-0040](../adr/ADR-0040-browser-testing-pinned-browser.md)) |
| **Requirements workspace** · **coverage dashboard** | **Still API only.** They are **U3** and **U4**, and **neither is authorised** |
| **Real-BRD validation** · **the degradation ladder against a live private endpoint** | **Still not done.** Both need approved material; any live call additionally needs **H3** |

**Delivering two rendering surfaces does not close roadmap P1 or P2.** The remaining items have
**no approved implementation phase, no slice, no boundary and no schedule**. They are recorded here
so they are not lost, and **naming them here assigns no scope**. §11 of
[CLAUDE.md](../../CLAUDE.md) requires an approved boundary before any of them may begin.

Two constraints already apply to them and are **not** lifted by this reconciliation:

- **Live AI invocation is blocked by H3 / limitation 62.** [ADR-0032](../adr/ADR-0032-retain-everything.md)
  requires prompt and response payloads to be retained and migration 006 stores metadata only, so no
  live provider call is permitted. An unretained payload is unrecoverable.
- **Real-material validation additionally needs approved material** within the **E1** development
  egress ceiling.

### 0.5 What this reconciliation does NOT do

- It does **not** reopen P1 or P2.
- It does **not** invalidate implementation Phase 2's closure, which remains valid for its explicitly
  accepted scope — [phase-2-status.md](phase-2-status.md) §16.5 and §16.6.
- It does **not** create, approve or schedule any phase or slice.
- It does **not** edit §1. The original commitments stand as written.

---

## 1. Phases

| Phase | Wks | Content | Exit criterion |
|---|---|---|---|
| **P0** Foundations & spikes | 4 | Monorepo, CI with dependency-rule linting, containerised api/worker, OIDC, projects, RBAC, artifact repository with canonical hashing, gate state machine, audit log, **AI provider port + two adapters + null adapter**, evaluation harness skeleton, corpus registry. **Six spikes (§2)** | Governance spine works with zero AI; all six spikes resolved or their risks re-scoped |
| **P1** Multimodal intake | 5 | Ingest guard, classification, all MVP adapters, **Arabic-capable text pipeline**, anchoring with verification, rasterisation, source inventory, authority ranking, source viewer with RTL-safe highlighting, structural BPMN/DMN/Form import, L0 validation | A real bilingual 40-page BRD + screenshots + a legacy BPMN ingest; every unit highlights correctly in both directions |
| **P2** AI analysis & structured requirements | 6 | Analysis Frame v1, passes P0–P6, **egress policy gate**, provider routing and degradation ladder, evidence store, requirement model, epistemic ladder, computed confidence, clarification queue, conflict resolution, coverage dashboard, requirements workspace, **G1** | On a real BRD: cited requirements with resolvable anchors, real gaps and conflicts surfaced, G1 reachable only after genuine human resolution. Degradation ladder exercised end to end against the private-endpoint adapter |
| **P3** Specification Studio | 5 | Domain Model Registry (bilingual), BPS editor, DecisionSpec editor with completeness/overlap analysis, FormSpec editor, ServiceInterface editor, generation directives, P7 decomposition proposal, **`L4-SPEC-*` incremental validation**, traceability enforcement, **impact analysis engine**, **G2** | Approved requirements → reviewed specifications with zero `L4-SPEC-*` errors; impact analysis verified against hand-derived sets |
| **P4** IR, compilers, layout ⚠️ *riskiest* | 5–7 | Correct-by-construction IR with all **28 invariants** (incl. event handlers, compensation, multiple triggers, scope-local outcomes), pattern mapping, three compilers, Camunda target profile mechanism, **ecosystem auto-layout integration + bilingual label measurement + quality rules + golden-layout corpus**, directive application and rejection | Approved specifications → legible, statically-valid BPMN/DMN/Forms; layout within thresholds on the full golden corpus, including Arabic-labelled processes. Range reflects the S4 tier outcome |
| **P5** Viewer framework | 5 | Viewer shell, three renderers, four-part inspector, five overlays, compare view, outline / path table / decision matrix / variable-flow views, accessibility, RTL rendering, AI explanation | An architect new to a project can explain any element and its origin without asking anyone; full keyboard and screen-reader navigation |
| **P6** Interfaces & validation | 5 | Interface Registry, connector allow-list, **full L0–L6 rule packs**, cross-artifact dependency validation, variable contract alignment, waivers, **G3** | Zero-error validation on a complete design; every dependency resolved within the baseline |
| **P7** Tests, packaging, handoff | 4 | Path/rule enumeration, scenario authoring, coverage, package assembly, generated bilingual documentation, traceability matrix, **AI-disclosure report**, directive log, **G4**, handoff records, permanent freeze, A↔C comparison | Exported archive opens in Camunda Modeler and passes static validation; matrix traces every element to a source region |
| **P8** Divergence & second cycle | 4 | Observation re-import, **A↔B↔C classification**, divergence report with required dispositions, deviation log, requirements-v2 flow end to end | Requirements v2 → candidate → divergence report correctly classifies preserve / supersede / conflict per element; `camunda_only` changes provably never reverted |
| **P9** Hardening & pilot | 5 | Prompt evaluation in CI, provider drift detection, cost/cache dashboards, performance, optional sandbox dry-run adapter if a cluster appears, **real ASDP corpora introduced**, pilot on two real services | Two real services delivered end to end by actual analysts, not the build team |

**Total ≈ 50 weeks** to a pilot-ready MVP including second-cycle capability.
Core single-cycle MVP (P0–P7) ≈ 41 weeks.

The increase over the earlier estimate is attributable to three Phase 0 decisions, and is
deliberate: the provider abstraction with a working degradation ladder (~3 wks), the Arabic text
and RTL rendering pipeline (~3 wks), and the data-governance policy layer (~2 wks).

## 2. Phase 0 spikes

Detailed in [phase-0-tasks.md](phase-0-tasks.md). Summary:

| # | Spike | Risk addressed |
|---|---|---|
| **S1** | Read-only viewer shell: `bpmn-js` NavigatedViewer + overlays + inspector | Viewer integration effort; overlay API adequacy |
| **S2** | **Arabic PDF extraction — library-first**: measure the standard PDF stack before building custom reordering; anchor round-trip | The highest-uncertainty engineering task in the project |
| **S3** | **Arabic diagram-label rendering** in the BPMN viewer, and RTL layout viability | Whether native renderer text is adequate or an overlay text layer is required |
| **S4** | **Automatic layout — a measurement** of candidate ecosystem auto-layout tools on 6 processes incl. Arabic labels | The largest product risk: unrepairable bad layout. Determines which layout tier is needed |
| **S5** | **Provider abstraction**: one task, two adapters, degradation ladder incl. `post_hoc` citation location | Whether the abstraction holds without leaking vendor concepts |
| **S6** | **Egress policy gate**: transport-boundary assertion that restricted content cannot leave | Correctness of the central governance guarantee |

**Recommendation:** run a vertical slice **P0 → P2 → P4** on one real service before committing
P5–P8 scope. This tests the two hypotheses everything else depends on — that AI reads real
bilingual documents accurately with resolvable provenance, and that generation plus layout
produces artifacts an architect accepts *without being able to touch them*.

## 3. Sequencing dependencies

```
P0 ──▶ P1 ──▶ P2 ──▶ P3 ──▶ P4 ──▶ P5
                        │       │
                        └───────┴──▶ P6 ──▶ P7 ──▶ P8 ──▶ P9

S2 (Arabic PDF) gates P1.
S4 (layout) gates P4 — and if it fails, P4 scope must be re-planned before P3 completes.
S5/S6 (provider + egress) gate P2.
The evaluation harness (P0) gates any prompt work in P2.
```

## 4. Risk register

| # | Risk | Sev | Mitigation | Phase |
|---|---|---|---|---|
| R1 | **Provenance drift** — anchors that do not resolve or resolve wrongly | Critical | L0 hard errors; quote + checksum verification; per-adapter round-trip tests; visible highlighting so users detect errors immediately | P1 |
| R2 | **Rubber-stamp approval** — humans approve AI output unread | Critical | Diff-centric review; L3 content marked and counted; AI-disclosure report; blocking questions; segregation of duties; **edit-rate monitoring where 100% raw acceptance is a warning** | P2, P9 |
| R3 | **Unrepairable bad layout** | Critical | S4 as a **measurement of ecosystem tooling**, not an implementation; the IR region tree guarantees well-structured input; quality validation with two blocking rules; golden corpus in CI; subprocess-extraction escalation. ASDP builds no layout engine ([ADR-0014](../adr/ADR-0014-layout-safety-critical.md) v2.0) | P0, P4 |
| R4 | **Arabic PDF extraction unreliable** | High | S2; documented fallback to page-image + vision with `image_region` anchors; never a silent degradation | P0, P1 |
| R5 | **Confident wrong extraction**, especially from diagram images | High | Citation-or-flag; computed confidence; per-source-type confidence ceilings; diagram images capped at L2 with element-wise confirmation | P2 |
| R6 | **Cross-source reconciliation is genuinely hard** | High | Deterministic precedence from human authority ranking; conflicts block G1; human always decides | P2 |
| R7 | **Provider abstraction leaks** — a vendor concept becomes load-bearing | High | S5; dependency-rule linting; conformance suite per adapter; two adapters from P0 | P0, P2 |
| R8 | **Degradation quietly reduces quality** | High | Degradations recorded on every proposal, propagated into confidence, surfaced in the UI and the disclosure report | P2 |
| R9 | **Egress policy gap** | High | S6; transport-boundary assertions in CI; no provider reachable outside the broker | P0, P2 |
| R10 | **Camunda 8.x churn** | High | Version-agnostic IR; profiles as data; pinned lint per profile; golden fixtures per profile; opt-in migration | P4 |
| R11 | **Scope creep toward becoming Camunda Modeler** | High | Explicit non-goal; boundary test cases in [product-boundary.md](../00-product/product-boundary.md) §7; every request adjudicated against them | All |
| R12 | **Bilingual retrofit cost** if any of the Unicode/anchor/identifier rules are skipped | High | Those rules are Phase 0 binding, not phased ([multilingual-architecture.md](../10-architecture/multilingual-architecture.md) §9) | P0, P1 |
| R13 | **Analysis Frame rigidity** — some service does not fit the 27 slots | Medium | Versioned and extensible frame; profile slots; `unclassified` bucket with review flag, never silent loss | P2 |
| R14 | **Synthetic-corpus over-fitting** | Medium | Corpus tiers; synthetic-only metrics labelled and down-weighted; held-out corpora; full prompt-history re-run when real material arrives | P0, P9 |
| R15 | **Directive vocabulary creep** into a de-facto editor | Medium | Closed vocabulary; high bar for additions; periodic review of the vocabulary size | All |
| R16 | **Gate rigidity** drives users around the tool | Medium | Configurable strictness, justified waivers, fast paths, clear impact diffs, advisory G0 | P2, P9 |
| R17 | **Prompt regression** — improving one pass degrades another | Medium | Versioned prompts; recorded-fixture evaluation in CI; acceptance-rate monitoring per version | P2 onward |
| R18 | **No sandbox ever materialises** | Medium | Static validation is sufficient for G3; the L3 qualifier is honest; the port is ready if a cluster appears | P9 |
| R19 | **Cost of whole-corpus context** at scale | Low–Med | Caching where supported; batch where supported; per-project budgets and alerts; chunked degradation available | P2 |

## 5. Post-MVP

| Phase | Content |
|---|---|
| **P10** | Sandbox `DeploymentValidator` adapter; automated `CamundaObservationSource`; git / Web Modeler publishing; worker stub scaffolding from interface contracts |
| **P11** | Executable test generation; sandbox scenario execution; coverage from real runs |
| **P12** | Full Arabic UI localisation; RTL-optimised diagram conventions |
| **P13** | Cross-project pattern library and reuse; multi-process hierarchies |
| **P14** | Runtime KPI feedback against `SpecKpi`; process-improvement backlog generation |
