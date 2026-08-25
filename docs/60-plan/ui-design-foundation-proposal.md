# ASDP UI/UX Design Foundation — Boundary · ✅ **APPROVED**

> ## **STATUS: APPROVED 2026-08-25. Y1–Y28 approved, with one clarification to Y12 (§24.1).**
> **D-U2.5 is APPROVED as the implementation boundary** — §25, and **only** §25. It is
> **presentation-only**: it delivers no capability, and **U3 is still not authorised.**
> **A visual reference was supplied and approved** — four mockup screens, §26. The reference
> governs **visual language, layout hierarchy, navigation model, information density, workspace
> structure and where contextual AI sits**. It is **not** authorisation for the data or
> functionality it depicts, and **the repository's architecture, ADRs, accessibility rules,
> semantic-state rules and actual application behaviour remain authoritative wherever they and
> the reference disagree** (§26.1).
> **Ask ASDP stays a disabled shell.** **H3 / limitation 62 is unresolved**, so: zero provider
> calls, no simulated answers, no stub imitating a live model, and no AI-driven write, approval or
> decision.
> **Version:** 1.0 · **Written:** 2026-08-25 as a proposal · **Approved:** 2026-08-25 ·
> **Against commit:** `582eb93` (U2 accepted) · **Approved at:** `65a984d`
> **Requested by:** **F-U2-b**, recorded at U2's acceptance —
> [phase-2-status.md](phase-2-status.md) §19.3
> **Decisions:** **Y1–Y28**, all **APPROVED** (§24)
> **Scope:** a **design foundation**, not a slice. It proposes **no capability, no API, no
> dependency and no AI implementation.**
> **Blocked by construction:** the **Ask ASDP** assistant (§16) is **design only**. Implementing it
> requires **H3 / limitation 62** resolved first, and **no live provider call is permitted** until
> then ([ADR-0032](../adr/ADR-0032-retain-everything.md)).
> **Within:** [ui-enablement-proposal.md](ui-enablement-proposal.md) (**W1–W13**, approved) and
> [ADR-0039](../adr/ADR-0039-react-presentation-layer.md)'s presentation boundary. **It amends
> neither.**
> **Related:** [ADR-0001](../adr/ADR-0001-requirements-driven-product-boundary.md),
> [ADR-0003](../adr/ADR-0003-no-override-editor.md),
> [ADR-0007](../adr/ADR-0007-epistemic-ladder.md),
> [ADR-0008](../adr/ADR-0008-resolvable-anchors.md),
> [ADR-0011](../adr/ADR-0011-computed-confidence.md),
> [ADR-0015](../adr/ADR-0015-read-only-viewers.md),
> [ADR-0017](../adr/ADR-0017-approval-as-baseline-signature.md),
> [ADR-0023](../adr/ADR-0023-unicode-bilingual-architecture.md),
> [ADR-0038](../adr/ADR-0038-target-versus-content-verification.md),
> [personas-and-journey.md](../00-product/personas-and-journey.md),
> [epistemic-model.md](../20-domain/epistemic-model.md),
> [provenance-and-anchoring.md](../20-domain/provenance-and-anchoring.md)

---

## 0. What this is, and what it is not

> **Read §24.1 and §26 before implementing anything.** They carry the two things the approval
> changed: the Y12 clarification, and what the visual reference does and does not authorise.

**This is the durable visual and interaction foundation** that U1 and U2 were accepted *without* —
both were accepted explicitly **not** for visual or UX design ([phase-2-status.md](phase-2-status.md)
§18, §19.2), because no foundation existed to accept them against.

| It **is** | It is **not** |
|---|---|
| A shell, navigation and layout architecture that U3–U5 and a later **P3 Specification Studio** can grow into without redesign | A slice. It delivers no capability |
| A token system, component inventory and state vocabulary | A component library adoption. **No new dependency is proposed** |
| A specification of how **evidence, provenance, the epistemic ladder, confidence and refusals** are presented | An AI implementation. **§16 is design only**; H3 blocks the rest |
| A redesign proposal for the **existing U1/U2 screens**, as the first demonstration (§20) | Approval to redesign them. §22 proposes the smallest boundary that would |

**Nothing in this document is approved.** Where it states a preference it is a **recommendation**;
where it records something already binding it says so and cites the ADR.

### 0.1 Why it is needed before U3, not after

U1 and U2 delivered two screens. U3–U5 add a requirements workspace, coverage, questions,
reconciliation and **G1 approval**; a later P3 adds specifications and a process canvas. That is
roughly a fivefold increase in surface, and every one of those screens has to present the same five
things consistently: **what is a fact, what is a machine's opinion, what a human approved, what
blocks a gate, and where the evidence is.**

Deciding that after the screens exist means changing all of them. **The cost of the foundation is
lowest now and rises monotonically.**

### 0.2 The durability test this document must pass

> **Could U3, U4, U5 and a read-only P3 specification/process workspace be built on this foundation
> without changing the shell, the tokens, the state vocabulary or the evidence and AI presentation
> rules?**

Every section below is written to answer *yes*, and §23 records where the answer is **uncertain** —
which is the more useful half.

---

## 1. The design direction — **Y1**

**Modern Enterprise Workspace + Engineering Studio + Contextual Governed AI Assistant.**

| Strand | What it means here | What it must never mean |
|---|---|---|
| **Modern Enterprise Workspace** | Dense, keyboard-navigable, information-first. Persistent project context. Tables and inspectors, not cards-as-decoration. Bilingual and RTL-correct as a baseline property, not a mode | Consumer-app whitespace that pushes governance information below the fold |
| **Engineering Studio** | The precision register of a technical tool: monospaced identifiers, exact counts, visible rule ids, inspectable provenance, states that distinguish *undecided* from *decided* | **A drawing tool.** ASDP is not a BPMN editor ([ADR-0001](../adr/ADR-0001-requirements-driven-product-boundary.md)); *“studio”* describes the **rigour**, never a canvas the user may edit. Scope creep toward Camunda Modeler is named risk **R11** |
| **Contextual Governed AI Assistant** | An assistant that always knows what the user is looking at, answers **with evidence and navigable references**, and is visibly incapable of approving anything | A chatbot. It never authors artifacts, never commits, never approves, and never answers without provenance |

**Y1 — the design direction is adopted as stated, including its three prohibitions.** The
prohibitions are the load-bearing half: a direction without them is a mood board.

### 1.1 The single hardest visual problem in this product

> **Four kinds of thing will sit next to each other on the same screen, and they must never be
> mistaken for one another.**

| | Kind | Example |
|---|---|---|
| **L1** | An extracted fact | *“the document says X”*, anchored to a resolvable region |
| **L2** | A machine's interpretation | *“X means the process starts on invoice receipt”* |
| **L3** | A machine's recommendation | *“consider adding an escalation path”* |
| **L4** | A human's approved decision | *“this requirement is approved”* — a signature over `(baselineHash, validationRunId)` |

[ADR-0007](../adr/ADR-0007-epistemic-ladder.md) forbids conflating them. **A design that renders them
in one uniform style silently breaks the product's central guarantee**, and it breaks it in the way
that is hardest to notice: everything still looks right.

The same class of error appears twice more in what already exists, and the design must handle both:
**`content_unverified` must never look like `resolved`**
([ADR-0038](../adr/ADR-0038-target-versus-content-verification.md)), and **`unranked` must never look
like rank 0** (U2's third distinction — *“rank 0 means nobody has decided”*).

**Y2 — the epistemic ladder, verification state and decidedness are FIRST-CLASS VISUAL PRIMITIVES**,
specified once in the token layer and reused everywhere, never re-invented per screen.

---

## 2. Application shell, navigation and project context — **Y3**

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│  TOP BAR   ASDP · [project selector ▾] · gate status chip · identity · dev-auth ⚠  │
├────┬──────────────────────────────────────────────┬───────────────┬────────────────┤
│ R  │  MAIN WORKSPACE                              │  INSPECTOR    │  ASK ASDP      │
│ A  │                                              │  (contextual) │  (collapsible) │
│ I  │  the list, table, viewer or canvas            │               │                │
│ L  │  for the selected workspace                   │  what is      │  governed      │
│    │                                              │  selected,    │  contextual    │
│ ▸  │                                              │  in depth     │  assistant     │
│    │                                              │               │                │
├────┴──────────────────────────────────────────────┴───────────────┴────────────────┤
│  STATUS STRIP   validation run · last refresh · classification ceiling · counts    │
└────────────────────────────────────────────────────────────────────────────────────┘
```

**Y3 — a four-region shell: rail, main, inspector, assistant dock, over a persistent project
context bar and a status strip.** Regions are **structural**; screens choose their content, never
their existence.

### 2.1 The rail — workspaces, in journey order

| Rail item | State today | Slice |
|---|---|---|
| **Overview** — project dashboard, gate readiness | proposed | with the foundation |
| **Sources** — intake, inventory, authority, L0 validation, viewer | **exists** (U1, U2) | accepted |
| **Requirements** — the RAF workspace, review, questions, flags | API only | **U3** |
| **Coverage** — frame coverage, the eight G1 preconditions | API only | **U4** |
| **Reconciliation** — conflicts, precedence, equivalence | API only | **U5** |
| **Gate G1** — freeze, validate, sign | API only | **U5** |
| **Specifications** *(later)* — BPS, DecisionSpec, FormSpec | not built | P3 |
| **Process** *(later)* — read-only IR / BPMN inspection | not built | P3 |
| **Audit** — the retained record ([ADR-0032](../adr/ADR-0032-retain-everything.md)) | API only | unscheduled |

**The rail is declared in full from the start, with unbuilt items visibly unavailable and labelled
with the slice that would deliver them.** This is deliberate: it makes the product's shape legible,
it makes *“not authorised yet”* an explicit UI state rather than an absence, and it prevents the
navigation being re-cut at every slice. It is the shell equivalent of recording a limitation rather
than leaving a gap.

### 2.2 Project context is global, explicit and impossible to lose — **Y4**

Every read and every write in this application is **project-scoped** — H4 made that structural in the
database (`(project_id, id)`), and identifiers restart at `REQ-0001` per project.

**Y4 — the selected project is shown in the top bar at all times, is part of every URL, and switching
it is an explicit act that re-scopes the whole shell.** A screen may never be ambiguous about which
project it is showing, and no view may silently span projects. Project names are **bilingual labels**
carrying their own language and direction — U1's first defect was assuming a plain string, and the
contract now accepts both shapes the API returns.

### 2.3 Deep-linkability

**Y5 — every selectable thing has a URL**: project, source, source region, requirement, conflict,
finding, gate run. Provenance that cannot be linked to cannot be cited in a review, and the whole
product is a traceability argument.

---

## 3. Main workspace and contextual inspector — **Y6**

**Y6 — one pattern, everywhere: a primary collection in the main region, a contextual inspector for
the selection.**

| | Main | Inspector |
|---|---|---|
| **Holds** | The collection: table, list, viewer, or canvas | Exactly one selected entity, in depth |
| **Answers** | *“what is here, and what needs attention?”* | *“what is this, where did it come from, what state is it in, what may I do?”* |
| **Editing** | Never edits generated artifacts | **Spec-layer edits only** ([ADR-0002](../adr/ADR-0002-spec-layer-editing.md)); artifact-layer panes are **read-only by construction** ([ADR-0015](../adr/ADR-0015-read-only-viewers.md)) |

The inspector has a **fixed section order**, so a reviewer learns one shape and reuses it:

1. **Identity** — id (monospace, ASCII, [ADR-0024](../adr/ADR-0024-ascii-identifiers-unicode-names.md)), name (bilingual, own direction)
2. **Epistemic level** — L1 / L2 / L3 / L4, always present, never inferred
3. **State** — validation, conflict, decidedness, verification
4. **Evidence and provenance** — anchors, navigable (§14)
5. **Confidence** — computed, with its inputs ([ADR-0011](../adr/ADR-0011-computed-confidence.md))
6. **Actions** — permitted, refused-with-reason, or absent
7. **History** — the retained record

**Y7 — the inspector never becomes an editor for generated artifacts, and no inspector section may be
made editable by a later slice without a new ADR.** [ADR-0003](../adr/ADR-0003-no-override-editor.md)
is the boundary; an inspector with a *“fix this”* field is exactly how an override editor arrives
without anyone deciding to build one.

---

## 4. Dashboard patterns — **Y8**

**Y8 — dashboards are gate-first and drill-through. Every number is a link to the list behind it, and
no number is presented without its undecided counterpart.**

| Pattern | Rule |
|---|---|
| **Gate readiness panel** | The **five D4 blocker categories** — blocking flags, unresolved conflicts, unanswered blocking questions, requirements not yet at L4, empty required slots — always **all five**, met or not. Never only the first failure |
| **Counts with a decidedness partner** | `12 ranked · 3 unranked`, never `12`. `40 approved · 6 draft · 2 blocked_by_policy`, never a single percentage |
| **No vanity metrics** | An approval rate of 100% with an edit rate of 0% is a **finding**, not a success. Limitation 70 (*“nothing measures whether a reviewer reviewed”*) is real and unmeasured; a dashboard must not imply otherwise |
| **Every tile drills through** | A count with no list behind it is a claim the user cannot check |
| **Freshness is explicit** | Validation findings belong to a **run**. A stale run must say so — a new run over an approved set **reopens G1** ([ADR-0017](../adr/ADR-0017-approval-as-baseline-signature.md), limitation 73) |

---

## 5. Source, intake and viewer experience — **Y9**

This is the one area where an accepted implementation already exists (U1, U2), so the proposal here
is mostly **preservation plus presentation**.

**Y9 — the four distinctions U2 established are promoted from screen behaviour to foundation rules:**

| # | Distinction | Foundation rule |
|---|---|---|
| **1** | A **duplicate is not an upload** | Outcome states are named and visually distinct: `created`, `deduplicated`, `refused`. **Never a generic success toast** |
| **2** | A **parse failure is a state, not a disappearance** | `parse_failed` rows stay visible, with the reason. Evidence that something was tried is evidence |
| **3** | **Unranked is not rank 0** | The `unranked` token is a **distinct visual state**, sorted last — *not lowest* — and rank 0 is never settable |
| **4** | **Severity belongs to the rule catalogue** | The UI groups and renders severity; it never assigns or re-maps it ([ADR-0026](../adr/ADR-0026-static-validation-first.md)) |

**The viewer keeps U1's hard-won property exactly:** highlight geometry is **server-computed**, the
client **never re-searches rendered text** for a quote (`presentation-no-text-research` enforces it),
segment direction is per-segment, counter-flow segments are marked, and the rendered text length
equals the `textLength` the server reported. **Y10 — none of this may be traded for a visual
refinement.**

---

## 6. The future requirements workspace — U3–U5 — **Y11**

Design only. **U3–U5 are not authorised.**

**Y11 — the requirements workspace is a three-pane composition of the same shell:** requirement list
(main) → requirement detail (inspector) → **the U1 viewer as the evidence pane**, so that clicking an
evidence chip scrolls the source to the anchored region rather than opening a second screen. Provenance
that requires navigating away does not get checked.

| Surface | Contents | Constraint |
|---|---|---|
| **Requirement list** | Id, name, epistemic level, coverage, flags, confidence | Per-requirement review, **no select-all and no bulk approve** — limitation 70's only structural mitigation |
| **Requirement detail** | RAF slots, each with its own state: filled, `empty`, `blocked_by_policy` | `empty` and `blocked_by_policy` are **different states** and must look different (limitation 74) |
| **Evidence pane** | The U1 viewer, anchored | An anchor that does not resolve is a **hard error**, never a soft highlight ([ADR-0008](../adr/ADR-0008-resolvable-anchors.md)) |
| **Questions** | The clarification queue | Questions are **deterministically chosen**, and today read as generated text (limitation 71). The design must not dress that up as polished prose it is not |
| **Conflicts** | Candidates, precedence, the deciding authority ranking | Precedence is **deterministic** ([ADR-0012](../adr/ADR-0012-deterministic-conflict-precedence.md)); the UI shows *why* a source won, which is the authority ranking a human set in U2 |
| **G1** | The five blockers, the freeze, the signature | Approval is a **signature over `(baselineHash, validationRunId)`** and **invalidates automatically**. The design must make reopening legible rather than surprising |

---

## 7. The future engineering / canvas workspace — P3 — **Y12**

Design only. **P3 has not started and has no approved boundary.**

**Y12 — the process/specification workspace is an INSPECTION surface, not an editor.** Concretely,
and these are the constraints that keep it from becoming Camunda Modeler:

- **No element creation, no dragging, no connecting, no palette.** Pan, zoom, select, inspect, trace.
- **Selecting a node selects a specification**, and the inspector shows the **BPS element and the
  requirement that produced it** — the canvas is a *view onto the spec*, and the spec is what a user
  may change ([ADR-0002](../adr/ADR-0002-spec-layer-editing.md)).
- **Layout is generated and not user-editable.** Layout is safety-critical
  ([ADR-0014](../adr/ADR-0014-layout-safety-critical.md)); a user-nudged diagram is a divergence with
  no requirement behind it.
- **Read-only styling is visible, not merely enforced** — a canvas that *looks* editable will be
  reported as broken when it refuses.
- **Divergence is displayed, never resolved by drawing** ([ADR-0019](../adr/ADR-0019-divergence-via-observation.md)).

**A canvas library is NOT proposed here.** It is a material dependency decision under **A4** and would
need its own ADR at the time P3 is scoped.

---

## 8. Typography — **Y13**

**Y13 — one type scale, three families, and metrics chosen for Arabic first.**

| Role | Family | Why |
|---|---|---|
| **UI / Latin** | A system UI stack (`-apple-system, Segoe UI, …`) | No web-font dependency; **A4** avoidance holds |
| **Arabic** | A system Arabic stack (`Geeza Pro, Segoe UI Arabic, Noto Naskh Arabic, …`) | Arabic set in a Latin-first face with Latin metrics is the single most common way a bilingual product looks careless |
| **Identifiers / code** | A monospace stack | Ids are ASCII by invariant (**D7**, [ADR-0024](../adr/ADR-0024-ascii-identifiers-unicode-names.md)) and must be visually separable from names |

**Rules.** Line height is set for the **taller** of the two scripts, so Arabic diacritics are never
clipped — a single shared `line-height` tuned to Latin is the defect this prevents. Font size never
carries meaning alone. Identifiers are **never** italicised (it deforms Arabic and misleads on
Latin). No text is transformed to uppercase in Arabic contexts, where it is meaningless.

**Scale (proposed):** `12 · 13 · 14 · 16 · 20 · 24 · 32`, with `14` the body default at comfortable
density and `13` at compact. Seven steps, no ad-hoc sizes.

---

## 9. Colour — **Y14**

**Y14 — the palette is SEMANTIC ONLY. There is no decorative colour, and colour never carries meaning
alone.**

| Family | Meaning | Never used for |
|---|---|---|
| **Neutral** (9 steps) | Surfaces, borders, text | Status |
| **Accent** (1 hue) | Selection, focus, primary action | Status |
| **Severity** | `error` · `warning` · `info` — **the rule catalogue's severities, nothing else** | Anything the catalogue did not classify |
| **Epistemic** | L1 · L2 · L3 · L4 — four distinguishable treatments | Severity |
| **Verification** | `resolved` vs `content_unverified` — **visibly different, not shades of one colour** | Confidence |
| **Decidedness** | decided vs **undecided** (`unranked`, `empty`, unanswered) | Severity |

**Every one of those six carries a non-colour channel too** — a glyph, a border treatment, a label,
or a pattern — because [ADR-0038](../adr/ADR-0038-target-versus-content-verification.md)'s and
U2's distinctions must survive greyscale, colour-blindness and a projector. U1 already set this
precedent: *“no highlight is identified by colour alone”*.

**Light and dark are both first-class**, defined as token sets, with contrast verified rather than
assumed.

---

## 10. Spacing, grid and density — **Y15**

**Y15 — a 4px base spacing scale (`4 · 8 · 12 · 16 · 24 · 32 · 48`), logical properties only, and two
densities.**

- **Logical properties throughout** — `padding-inline-start`, `margin-inline-end`, `inset-inline`.
  **`left` and `right` are forbidden** in layout CSS; they are the mechanism by which an RTL layout
  breaks in a way nobody notices in an English screenshot.
- **Two densities: comfortable and compact.** Compact is for tables a reviewer scans all day; it
  changes spacing and body size, **never** information.
- **The shell is a grid; the panes are flex.** Inspector and assistant dock have min/max inline sizes
  and are resizable, with the sizes persisted per user.

---

## 11. Design tokens and the component inventory — **Y16, Y17**

**Y16 — the design system is plain CSS custom properties plus small React components. No UI component
library, no CSS framework, no CSS-in-JS.** This follows **W4**'s posture exactly (*“no data-fetching
or state-management library without a demonstrated need and separate approval”*) and **A4**'s
*“avoid unnecessary dependencies”*. **Adopting any of them later is a dependency decision needing its
own approval.**

Token families: `--asdp-color-*`, `--asdp-space-*`, `--asdp-text-*`, `--asdp-radius-*`,
`--asdp-border-*`, `--asdp-shadow-*`, `--asdp-motion-*`, plus the six semantic families of **Y14**.
Tokens are defined once, in one file, in **both** light and dark sets.

**Y17 — the component inventory is fixed and small, and NO COMPONENT MAY CARRY A DOMAIN RULE.**

| Group | Components |
|---|---|
| **Shell** | `AppShell`, `Rail`, `ProjectBar`, `Inspector`, `AssistantDock`, `StatusStrip` |
| **Data** | `DataTable`, `Row`, `Cell`, `CountTile`, `DrillLink`, `EmptyState` |
| **Semantics** | `EpistemicBadge`, `SeverityBadge`, `VerificationBadge`, `DecidednessBadge`, `ConfidenceMeter`, `StateChip` |
| **Provenance** | `EvidenceChip`, `AnchorLink`, `HighlightLayer`, `ProvenanceList` |
| **Input** | `Field`, `Select`, `FileField`, `RankField`, `Button`, `ActionMenu`, `ConfirmDialog` |
| **Feedback** | `Loading`, `ErrorState`, `RefusalState`, `Toast`, `ValidationSummary` |
| **Assistant** | `AskPanel`, `AnswerCard`, `EvidenceReferenceList`, `ContextChip` (**design only**) |

The rule restated, because it is what
[ADR-0039](../adr/ADR-0039-react-presentation-layer.md) enforces mechanically: a component **renders
a decision it was given**. `SeverityBadge` renders a severity; it never computes one.
`ConfidenceMeter` renders a computed confidence; importing `computeConfidence` fires **two** checker
rules. `HighlightLayer` renders server-computed geometry; it never searches text.

---

## 12. Tables, cards, forms, buttons and actions — **Y18**

**Y18 — the table is the primary surface; cards are for summary tiles only; every action states its
own permission and its own reversibility.**

| Surface | Rules |
|---|---|
| **Tables** | Server-provided order is the **meaningful** order (highest authority first, [ADR-0012](../adr/ADR-0012-deterministic-conflict-precedence.md)). Client re-sorting is permitted but must be visibly *the user's* sort. **Undecided cells render as the undecided token, never as blank or zero.** Row selection drives the inspector. Sticky header, keyboard row navigation, no horizontal body scroll on the page — the table scrolls inside its own region |
| **Cards** | Summary and drill-through only. **No card carries information that exists nowhere else** |
| **Forms** | Spec-layer only. Labels always visible (never placeholder-as-label). Validation messages come from the **server's** rules where a server rule exists, quoted, with the rule id. A field the user may not set is **absent or disabled with a reason** — never silently ignored |
| **Buttons** | One primary per view. Destructive and irreversible actions are **confirmed** and name what will happen. **Approval is per-item; there is no bulk approve anywhere, by design** |
| **Permission-aware actions** | A control the current role may not use is **disabled with the reason**, and the API refuses independently. U2 tests exactly this: *“a Viewer sees ingest and ranking DISABLED, and the API refuses anyway.”* **The UI is a courtesy; the server is the authority** |

---

## 13. Semantic status, validation and conflict states — **Y19**

**Y19 — one state vocabulary, defined once, reused by every screen.**

| Dimension | Values | Source of truth |
|---|---|---|
| **Validation severity** | `error` · `warning` · `info` | The **rule catalogue** ([ADR-0026](../adr/ADR-0026-static-validation-first.md)). Rendered with its **rule id visible** |
| **Lifecycle** | `parsing` · `parsed` · `parse_failed` · `superseded` | The API |
| **Decidedness** | decided · **undecided** (`unranked`, `empty`, unanswered) | Computed by the server; **never flattened to a zero** |
| **Verification** | `resolved` · **`content_unverified`** | [ADR-0038](../adr/ADR-0038-target-versus-content-verification.md). **These must never be styled alike** |
| **Conflict** | candidate · unresolved · resolved-by-precedence · resolved-by-human | [ADR-0012](../adr/ADR-0012-deterministic-conflict-precedence.md) |
| **Gate** | not ready · ready · approved · **reopened** | [ADR-0017](../adr/ADR-0017-approval-as-baseline-signature.md) |
| **Policy** | permitted · `blocked_by_policy` | [ADR-0021](../adr/ADR-0021-data-classification-egress-policy.md) |

**A finding is never shown without its rule id.** That is what makes it checkable against the
catalogue, and it is the difference between a validation tool and an opinion.

---

## 14. Evidence and provenance presentation — **Y20**

**Y20 — provenance is a first-class UI object, not a tooltip.**

| Rule | Why |
|---|---|
| **Every derived claim shows its evidence, or says it has none** | Traceability is the product |
| **Every evidence reference is navigable** to the anchored region in the source viewer | An anchor nobody follows is an anchor nobody checks |
| **Highlight geometry is server-computed**, per-segment, with counter-flow marked | U1's guarantee; the client re-searching text is a **checker violation** |
| **An unresolvable anchor is a hard error**, displayed as one | [ADR-0008](../adr/ADR-0008-resolvable-anchors.md) — silence here is the worst outcome |
| **`content_unverified` is labelled as such, in words** | [ADR-0038](../adr/ADR-0038-target-versus-content-verification.md). *“The target exists”* is not *“the content says what we claim”* |
| **Provenance survives every view** | Requirement, conflict, coverage gap, and an assistant answer all cite the same anchors in the same component |

---

## 15. AI-generated content and confidence — **Y21**

**Y21 — AI-derived content is always visually distinct from human-approved content, and confidence is
never presented as accuracy.**

| Rule | Reason |
|---|---|
| **AI-derived content carries its epistemic level (L2 / L3) permanently** — not until reviewed, but as a property | [ADR-0007](../adr/ADR-0007-epistemic-ladder.md). Promotion to L4 is a **human act**, and it changes the badge |
| **Confidence is a computed band with its inputs inspectable**, never a bare percentage | [ADR-0011](../adr/ADR-0011-computed-confidence.md). A bare *“92%”* reads as *“92% correct”*, which **nothing in this repository has ever measured** |
| **Recorded degradations are shown** | A degraded answer that looks identical to a full one is a lie of omission ([ADR-0022](../adr/ADR-0022-capability-negotiation.md)) |
| **A refusal is displayed, with its reason and its policy** | `blocked_by_policy` is information, not an error |
| **No AI content is ever pre-selected, pre-approved, or defaulted to accepted** | [ADR-0004](../adr/ADR-0004-ai-proposes-code-commits.md) |
| **The words used are honest** | *“Proposed”*, *“suggested”*, *“extracted”* — never *“found”*, *“determined”* or *“validated”* for an L2/L3 item |

**The banner fact this UI must never obscure:** **no live model has ever been called in this
repository.** Every figure is a synthetic corpus against an authored stub — `eval:frame` reports
**slot accuracy 45%** and **semantic faithfulness not measured**. A confident-looking AI surface over
that would be the most misleading thing this product could ship.

---

## 16. **Ask ASDP** — the governed contextual assistant — **Y22**

> **DESIGN ONLY. NOT IMPLEMENTED, NOT APPROVED, AND NOT IMPLEMENTABLE YET.**
> **H3 / limitation 62 is unresolved**: [ADR-0032](../adr/ADR-0032-retain-everything.md) requires
> prompt and response payloads to be retained, migration 006 stores metadata only, and **no live
> provider call is permitted** until that gap closes. An unretained payload is unrecoverable.
> **This section proposes UX architecture, not a capability.**

**Y22 — Ask ASDP is a persistent but collapsible dock, and it is a GOVERNED assistant: context-bound,
evidence-first, and structurally incapable of committing anything.**

### 16.1 What makes it governed rather than a chatbot

| Property | Consequence in the UI |
|---|---|
| **Context-bound** | It always shows **what it is answering about** — a `ContextChip` naming the project and the selected source, requirement, conflict, specification, process element or decision. **No hidden context.** If nothing is selected, it says so rather than guessing |
| **Evidence-first** | Every answer is an `AnswerCard`: **claim → evidence → navigable references → epistemic level → confidence → degradations**. An answer with no evidence **says it has none**; it is not silently rendered as fact |
| **Non-committal by construction** | It has **no approve, no edit, no write control of any kind.** It may *navigate* the user to where a decision is made. It never makes one — [ADR-0004](../adr/ADR-0004-ai-proposes-code-commits.md) |
| **L2/L3 at best** | Answers are badged like any other AI content, with the same components. An assistant answer is **never** L1 and **never** L4 |
| **Egress-aware** | The **classification** of the material in context is visible, and a question that would exceed the permitted ceiling is **refused visibly** rather than quietly narrowed ([ADR-0021](../adr/ADR-0021-data-classification-egress-policy.md)) |
| **Retained** | Every interaction is part of the record ([ADR-0032](../adr/ADR-0032-retain-everything.md)) — which is exactly why **H3 must close first** |
| **Deterministic where it can be** | *“Why is G1 blocked?”* has a **computed** answer today (the five D4 blockers). The assistant must present the deterministic answer **as deterministic**, and never re-narrate it as an opinion |

### 16.2 The interactions, and what each is made of

| Interaction | Deterministic input that already exists | Assistant's added value | Level |
|---|---|---|---|
| **Explain this** | The selected entity, its provenance, its state | Prose over facts already on screen | L2 |
| **Show supporting evidence** | Anchors, highlights | **None — this is a navigation action.** It should be answerable **without a model at all** | **L1** |
| **Identify conflicts** | Conflict candidates, precedence, authority ranking | Explaining *why* precedence resolved as it did | L2 |
| **Explain why G1 is blocked** | The **five D4 blockers**, computed | Ordering the work, linking each blocker to its item | **L1 facts, L3 advice** |
| **Summarise outstanding issues** | Findings, flags, questions, gaps | Grouping and prioritising | L2 |
| **Explain impact of a change** | The traceability graph | Reading the graph aloud | L2 / L3 |
| **Explain specifications, processes, decisions** *(later, P3)* | BPS, IR, DMN | Explaining a generated artifact **without offering to edit it** | L2 |

**Y23 — “Show supporting evidence” and “Why is G1 blocked” must be answerable deterministically,
without a model.** They are the two most-used answers and the two most damaging to fabricate. Design
them as **deterministic queries with an optional AI narration layer** — never as prompts.

### 16.3 The answer contract

```
┌─ ASK ASDP ─────────────────────────────── [context: PRJ-0007 · REQ-0042] ─┐
│  Q  Why is G1 blocked?                                                    │
│                                                                           │
│  ▣ DETERMINISTIC · computed from the current validation run               │
│    5 preconditions evaluated · 2 blocking                                  │
│    • 3 requirement(s) not yet approved to L4      → open list             │
│    • 1 unresolved conflict                        → open conflict         │
│                                                                           │
│  ◈ L3 · RECOMMENDATION · confidence: computed (inputs ▾)                  │
│    Resolving the conflict first is likely to change two of the three      │
│    unapproved requirements.                                               │
│    Evidence: SRC-0003 §4.2 ↗   SRC-0011 §1 ↗   (2 references)             │
│                                                                           │
│  ⚠ This is a recommendation, not an approval. Approval is yours.          │
└───────────────────────────────────────────────────────────────────────────┘
```

**Y24 — the dock is collapsible, never modal, and never blocks the workspace.** It is a panel with
persisted width, collapsible to a rail button that shows whether an answer is waiting. It does not
pop up unprompted, and it does not interrupt.

---

## 17. Accessibility — extends **W8**

**W8 is approved and unchanged.** This foundation adds:

- **Never colour alone.** Every semantic family has a second channel (§9).
- **Accessible names carry direction and language**, as U1 already does — *“evidence, counter-flow,
  right to left, ar”*.
- **Keyboard-first**: skip link, landmarks, ordered headings, visible focus, full table navigation,
  the inspector and dock reachable and dismissable, no keyboard trap.
- **Screen-reader semantics for state**: severity, epistemic level, decidedness and verification are
  in the accessible name, not implied by styling.
- **Reduced motion respected**; no meaning conveyed by animation.
- **Contrast verified**, in light and dark, for every token pair actually used.
- **Refusals and errors are announced**, not merely rendered.

---

## 18. Arabic / English, RTL / LTR — **Y25**

**Y25 — direction is a property of content, resolved per segment, and the layout is direction-agnostic
by construction.**

| Rule | Detail |
|---|---|
| **Logical CSS only** | No `left`/`right` in layout. The shell mirrors wholesale by setting `dir` |
| **Per-segment direction** | A mixed document is `dir="ltr"` with Arabic runs individually `dir="rtl"`, exactly as U1 does. **Counter-flow segments are marked**, not silently reflowed |
| **Server decides direction** | The API returns `direction: ltr / rtl / neutral` per label, per unit, per segment. **The client never guesses from characters** |
| **Identifiers stay LTR and ASCII** | **D7** / [ADR-0024](../adr/ADR-0024-ascii-identifiers-unicode-names.md). `REQ-0042` is not mirrored, ever, in either layout |
| **What mirrors** | Layout, navigation, progress direction, chevrons, alignment |
| **What must NOT mirror** | Identifiers, code, numbers-as-data, media controls, and **the source viewer's text geometry**, which the server already computed for the document's own direction |
| **Sorting and matching are application-side** | [ADR-0023](../adr/ADR-0023-unicode-bilingual-architecture.md) mandates match forms from `@asdp/text`, **never DB collation** — and collation is inert in PGlite anyway (limitation 2) |
| **Both directions are tested** | U1's precedent: an English document, an Arabic document, **and a mixed one**. RTL is not a checkbox at the end |

---

## 19. Responsive behaviour — **Y26**

**Y26 — three breakpoints, and a fixed collapse order that never drops governance information.**

| Width | Shell |
|---|---|
| **≥ 1440px** | Rail expanded · main · inspector · assistant dock, all visible |
| **1024–1439px** | Rail collapses to icons; assistant dock becomes an overlay panel |
| **768–1023px** | Inspector becomes a slide-over; tables scroll inside their own region |
| **< 768px** | Single column, tab-switched. **Read and review only** — this is not a phone product, and pretending otherwise invites approving a requirement on a bus |

**The invariant:** what collapses is **chrome**, never **state**. Severity, epistemic level,
decidedness, verification and refusal reasons are the **last** things to be hidden, never the first.

---

## 20. Loading, error, empty and refusal — **Y27**

**Y27 — four distinct states, and REFUSAL IS A FIRST-CLASS STATE, not an error.**

| State | Rule |
|---|---|
| **Loading** | Skeletons that match the eventual layout. Never a spinner where a count will be. Long operations report what they are doing |
| **Empty** | Says *why* it is empty and what would fill it. **Distinguishes “none” from “none yet decided”** |
| **Error** | Shows what failed, the correlation id, and what the user can do. **A contract violation fails loudly at the boundary** — U1's first defect rendered a `ContractError` rather than a blank pane, which is why W4 puts validation there |
| **Refusal** | **The server's own reason, quoted, with its rule id or policy.** A permission refusal, an egress refusal and a duplicate are **three different outcomes** and must read differently. A refusal is the system working |

---

## 21. Redesigning U1 and U2 as the first demonstration — **Y28**

**Design only. Not authorised.** The point of demonstrating on existing screens is that their
behaviour is already accepted and browser-tested, so **any behavioural change is visible as a test
failure** — a rare chance to change appearance with a real safety net.

| Screen | Redesign | Behaviour that must not change |
|---|---|---|
| **Shell** *(new)* | Introduce rail + project bar + inspector + status strip; move dev-auth warning into the project bar, **more prominent, not less** | The dev-auth warning stays unmissable — U2's first browser test asserts it |
| **Sign-in** | Becomes a framed panel; role selection becomes a labelled multi-select | **All ten roles** remain selectable — U2-a's bidirectional drift test |
| **Project list** | Becomes a `DataTable` with bilingual names in their own direction | Both `name` shapes still accepted (U2 defect 1) |
| **Source inventory** | `DataTable`: kind, direction, parse state, authority, classification. `unranked` as a **distinct** token, sorted last | Order stays highest-authority-first, unranked last; rank 0 unsettable |
| **Upload** | `FileField` + classification + kind, with the three outcomes as distinct `StateChip`s | Duplicate reported **as a duplicate**; refusal quotes the server |
| **L0 validation** | `ValidationSummary` grouped by severity, rule ids monospace and visible | Severity still the catalogue's, never reassigned |
| **Source viewer** | Reading-optimised measure, `HighlightLayer` restyled, counter-flow marked more legibly, evidence list in the inspector | **Server-computed geometry, no text research, per-segment direction, rendered length == `textLength`** |
| **Ask ASDP** | The dock **appears, collapsed, disabled**, with an honest empty state: *“Not available — awaiting H3”* | It makes **no call**. Nothing is implemented behind it |

**Y28 — the redesign is a presentation-only change, and its acceptance test is that the existing 10
browser tests and 838 unit tests pass UNCHANGED**, plus new tests for the shell, tokens and
RTL mirroring. If a redesign needs a test changed, that is a **behaviour** change and it needs saying
out loud.

---

## 22. What this proposal does NOT do

- **It does not start U3, U4, U5 or P3.** None is authorised.
- **It does not implement the assistant** or make any provider call. **H3 stands.**
- **It does not add a dependency.** No component library, no canvas library, no icon package, no web
  font. Each would be a separate **A4** decision.
- **It does not touch the backend**, any API, or any contract.
- **It does not amend W1–W13 or X1–X10**, and it does not weaken any checker rule. If the design
  needed a `presentation-*` rule relaxed, **the design would be wrong** — U2's defect 2 corrected such
  a rule by making it *more* precise, not by loosening it.
- **It does not claim design validation.** Nothing here has been tested with a user. There are no
  users yet.

---

## 23. Risks, stated rather than assumed away

| # | Risk | Mitigation proposed |
|---|---|---|
| **R-D1** | **A design system built before U3–U5 exist is a guess.** Some of it will be wrong | Ship it **on U1/U2 first** (§21), where behaviour is already tested. Treat the token layer as stable and the component layer as revisable |
| **R-D2** | **Six semantic colour families is a lot to keep distinguishable**, especially in dark mode and for colour-blind users | The **second channel** is mandatory (§9), which makes colour a redundancy rather than the carrier |
| **R-D3** | **The Engineering Studio register invites a canvas**, and a canvas invites editing — **R11** | **Y12**'s prohibitions are explicit and pre-committed, *before* anyone builds a canvas |
| **R-D4** | **An assistant dock makes the product feel AI-driven**, which is the opposite of what it is | The dock is collapsed by default, never modal, has no write control, and every answer is badged and evidenced |
| **R-D5** | **A polished AI surface over unmeasured model quality misleads** | **Y21**: no bare percentages, degradations shown, honest verbs, and the *no-live-model* fact never obscured |
| **R-D6** | **Redesigning accepted screens can silently regress them** | **Y28**: the existing tests must pass **unchanged** |
| **R-D7** | **Two densities and two directions and two themes is a large test matrix** | Browser tests already exist ([ADR-0040](../adr/ADR-0040-browser-testing-pinned-browser.md)); the matrix is sampled deliberately, and what is **not** covered is recorded rather than implied |

---

## 24. The decisions requested — **Y1–Y28**

| # | Decision | Disposition sought |
|---|---|---|
| **Y1** | The three-strand design direction **and its three prohibitions** (§1) | **APPROVED** |
| **Y2** | Epistemic level, verification state and decidedness are **first-class visual primitives** (§1.1) | **APPROVED** |
| **Y3** | The **four-region shell** (§2) | **APPROVED** |
| **Y4** | Global, explicit, unlosable **project context** (§2.2) | **APPROVED** |
| **Y5** | **Everything is deep-linkable** (§2.3) | **APPROVED** |
| **Y6** | **Main + contextual inspector**, with a fixed inspector section order (§3) | **APPROVED** |
| **Y7** | The inspector **never becomes an artifact editor**; making a section editable needs a new ADR (§3) | **APPROVED** |
| **Y8** | **Gate-first, drill-through dashboards**; no count without its undecided partner (§4) | **APPROVED** |
| **Y9** | U2's **four distinctions promoted to foundation rules** (§5) | **APPROVED** |
| **Y10** | U1's **server-computed highlighting guarantee is not tradeable** for visual refinement (§5) | **APPROVED** |
| **Y11** | The **requirements workspace** three-pane composition, no bulk approve (§6) | **APPROVED as a target**, explicitly **not** authorisation for U3 |
| **Y12** | The **process/spec workspace is inspection-only**, with five explicit prohibitions (§7) | **APPROVED as a constraint on P3, as clarified in §24.1** |
| **Y13** | **Typography**: three families, Arabic-first metrics, seven-step scale (§8) | **APPROVED** |
| **Y14** | **Semantic-only colour**, six families, **every one with a second channel** (§9) | **APPROVED** |
| **Y15** | **4px spacing scale, logical properties only, two densities** (§10) | **APPROVED** |
| **Y16** | **Plain CSS custom properties. No UI library, no CSS framework, no CSS-in-JS** (§11) | **APPROVED as proposed: plain CSS custom properties for this slice.** No UI library, no CSS framework, no CSS-in-JS |
| **Y17** | The **component inventory**, and *no component carries a domain rule* (§11) | **APPROVED** |
| **Y18** | **Tables primary**, cards summary-only, permission-aware actions, **no bulk approve** (§12) | **APPROVED** |
| **Y19** | **One state vocabulary**, seven dimensions, rule ids always visible (§13) | **APPROVED** |
| **Y20** | **Provenance is a first-class UI object**; unresolvable anchors are hard errors (§14) | **APPROVED** |
| **Y21** | **AI content always distinct; confidence never presented as accuracy** (§15) | **APPROVED** |
| **Y22** | **Ask ASDP as a governed contextual assistant** — dock, context binding, answer contract, seven governance properties (§16) | **APPROVED as UX architecture only.** Implementation needs **H3** and its own boundary |
| **Y23** | *Show supporting evidence* and *Why is G1 blocked* are **deterministic, model-free** answers with optional narration (§16.2) | **APPROVED** |
| **Y24** | The dock is **collapsible, never modal, never unprompted** (§16.3) | **APPROVED** |
| **Y25** | **Direction is per-segment and server-decided**; explicit mirror / do-not-mirror lists (§18) | **APPROVED** |
| **Y26** | **Three breakpoints**, fixed collapse order, **governance information collapses last** (§19) | **APPROVED** |
| **Y27** | **Four states, refusal first-class**, quoting the server (§20) | **APPROVED** |
| **Y28** | The **U1/U2 redesign is presentation-only**, and the existing tests must pass **unchanged** (§21) | **APPROVED** |

**All of Y1–Y28 are APPROVED**, and **D-U2.5 (§25) is approved with them** — so the foundation may
now be applied to the functionality U1 and U2 already deliver, **and to nothing else.**

### 24.1 The one clarification — **Y12**

**Y12 as approved:**

> **Generated process and artifact canvases remain inspection-first and read-only** unless a
> future, **explicitly approved** phase introduces editing. **This must not be read as prohibiting
> controlled specification-authoring interfaces** that may later be approved in **P3** — including
> **BPS**, **DecisionSpec**, **FormSpec** and **ServiceInterface** editors.

**This clarification amends no ADR; it aligns Y12 with two that already existed.** The distinction
it draws is exactly the product boundary:

| Layer | Editable? | Governed by |
|---|---|---|
| **Specification layer** — BPS, DecisionSpec, FormSpec, ServiceInterface, requirements, directives | **Yes**, and authoring interfaces for it are legitimate future work | [ADR-0002](../adr/ADR-0002-spec-layer-editing.md) |
| **Artifact layer** — generated BPMN, DMN, forms, layout geometry, serialisations | **No.** Inspection only, and **no override editor** | [ADR-0003](../adr/ADR-0003-no-override-editor.md), [ADR-0015](../adr/ADR-0015-read-only-viewers.md), [ADR-0014](../adr/ADR-0014-layout-safety-critical.md) |

So §7's five prohibitions stand **for the canvas** — no element creation, no dragging, no
connecting, no palette, no user-editable layout — while a future P3 **spec editor** is not
foreclosed by them. **The canvas is a view onto a specification; the specification is the thing a
user may change.** Any such editor still needs its own approved boundary, and a canvas that
*edited the artifact* would still require superseding
[ADR-0003](../adr/ADR-0003-no-override-editor.md).

### 24.2 What the approval explicitly preserves

Restated because these are the items that would be quietly lost first:

- **The four-way visual distinction** between extracted evidence (L1), machine interpretation
  (L2), machine recommendation (L3) and human-approved decision (L4) — **Y2**, **Y21**.
- **Every semantic colour carries a non-colour cue** — **Y14**. Testable, and tested.
- **AI-generated content is always distinguishable** — **Y21**.
- **Confidence is never represented as accuracy** — **Y21**.
- **Ask ASDP is a governed contextual assistant, not a generic chatbot** — **Y22**.
- **“Show supporting evidence” and “Why is G1 blocked?” are deterministic queries first**, with
  optional AI narration later — **Y23**.
- **Plain CSS custom properties for this slice** — **Y16**.
- **Reusable tokens and components instead of one-off styling** — **Y16**, **Y17**.
- **The Requirements Workspace is a design target only.** Its appearance in the visual reference is
  **not** authorisation for U3 — **Y11**, §26.2.

---

## 25. The implementation boundary — **D-U2.5** · **APPROVED · IMPLEMENTED · AWAITING ACCEPTANCE**

> **Approved 2026-08-25** at `52ba323`. **Implemented** in the commit that follows it, and
> **NOT ACCEPTED** — acceptance needs a visual review and an explicit decision. The implementation
> record, its verification, its deviations from the visual reference and its remaining limitations
> are in [phase-2-status.md](phase-2-status.md) **§20.4–§20.6**.


**Proposed name: D-U2.5 — “the design foundation, demonstrated on what already exists”.** Deliberately
**not** U3: it delivers **no new capability**, so it cannot be confused with progress on the journey.

### 25.1 In scope — the smallest thing that proves the foundation

| # | Item |
|---|---|
| **1** | **The token layer** — one CSS file: colour (light + dark), type, space, radius, border, motion, and the six semantic families |
| **2** | **The shell** — `AppShell`, `Rail`, `ProjectBar`, `Inspector`, `StatusStrip`, with the full rail declared and unbuilt items visibly unavailable |
| **3** | **The semantic components** — `EpistemicBadge`, `SeverityBadge`, `VerificationBadge`, `DecidednessBadge`, `StateChip`, each DOM-free in its logic and unit-tested |
| **4** | **`DataTable`** plus the four feedback states (`Loading`, `EmptyState`, `ErrorState`, `RefusalState`) |
| **5** | **Re-skin U1 and U2 onto the above** — sign-in, project list, source inventory, upload, L0 validation, source viewer. **Behaviour byte-for-byte unchanged** |
| **6** | **The Ask ASDP dock as a collapsed, disabled shell** with an honest *“awaiting H3”* empty state and **no call path of any kind** |
| **7** | **Tests** — new unit tests for tokens/components; **the existing 838 and 10 pass unchanged**; new browser tests for RTL mirroring, dark mode, compact density and the collapse order |

### 25.2 Out of scope, explicitly

U3/U4/U5 screens · any P3 surface · any canvas · **any assistant behaviour** · any new dependency ·
any API change · any backend change · any new checker-rule relaxation · icon or font packages ·
supersession UI · image or PDF viewing.

### 25.3 Acceptance criteria

1. `npm run verify` **green, exit 0**, with the existing **838 tests passing unchanged**.
2. `npm run test:e2e` **green**, with the existing **10 browser tests passing unchanged** — the proof
   that the redesign was presentation-only.
3. New browser tests demonstrate **RTL mirroring**, **dark mode**, **compact density** and the
   **responsive collapse order**, each in a real browser.
4. **No new dependency**; `package.json` runtime dependencies unchanged at nine.
5. **No checker rule relaxed**; `check:arch:selftest` still proves every rule bites.
6. Every semantic state is demonstrated to be distinguishable **without colour**.
7. The **Ask ASDP dock makes no network call** — asserted by a test, not by inspection.
8. Documentation updated in the same change: this document moves to **APPROVED**, and
   [phase-2-status.md](phase-2-status.md) records the slice.

### 25.4 What must be decided before it may begin

1. **Y1–Y28** approved, amended or rejected — §24.
2. **Y16** in particular: plain CSS, or a library. A library is a **material dependency decision**
   under **A4** and would need an ADR first.
3. **Whether D-U2.5 runs before U3 at all**, or whether U3 proceeds first and the redesign follows.
   **The recommendation is before**, for the reason in §0.1: the cost only rises.

---

## 26. The approved visual reference

**Four mockup screens were supplied with the approval and are adopted as the visual and UX
reference for the *“Modern AI Engineering”* expression of the approved direction (Y1):**

| # | Screen | Role in the reference |
|---|---|---|
| **1** | **Home / Project Workspace** | Dashboard composition, card and metric hierarchy, activity and risk panels, where Ask ASDP sits when nothing is selected |
| **2** | **Sources & Intake** | Workspace table density, filters, tabbed sub-navigation, upload as a right-side panel |
| **3** | **Source Viewer + Ask ASDP** | Document surface, evidence-and-context inspector, assistant with evidence references and confidence |
| **4** | **Requirements Workspace + Ask ASDP** | **Future** composition: list → detail → assistant, and the shape U3 must fit without redesign |

**The visual language adopted:** dark/navy persistent navigation rail; light, high-density
professional workspace; restrained blue/violet AI accents; strong information hierarchy; clean
enterprise typography and spacing; a contextual project bar; structured cards, tables and work
panels; semantic badges; a contextual right-side inspector where appropriate; a persistent,
collapsible Ask ASDP location; **engineering-tool density rather than a generic SaaS dashboard**;
and **AI visually present without dominating the application.**

### 26.1 Precedence — the reference is a reference, not an authority

> **Where the visual reference and this repository disagree, the repository wins.** The reference
> governs **visual language, layout hierarchy, navigation model, information density, workspace
> structure and the placement of contextual AI**. It does **not** govern behaviour, data, or
> semantics.

Authoritative over the reference, without exception: the **approved ADRs**; the
**accessibility requirements** (§17, **W8**); the **semantic-state rules** (§13); **server-provided
evidence offsets**, **authority semantics**, **validation behaviour**, **RBAC behaviour** and the
**development-authentication restriction** (**F-U1-b**); and **actual application behaviour** as
U1 and U2 deliver it.

**Fidelity is never a reason to sacrifice semantic correctness.** Where the reference and
accessibility, RTL, responsiveness or the available data pull apart, **the implementation
diverges and records why.**

### 26.2 What the reference does NOT authorise

**The screens depict a finished product. Most of it does not exist, and D-U2.5 must not pretend it
does.**

| Depicted | Reality | Rule for D-U2.5 |
|---|---|---|
| Dashboard metrics — *“27 / 134 conditions met”*, *“36% overall readiness”*, phase labels, top risks | **No API supports these** as depicted | **Do not invent them, and do not fabricate data to match the screenshot.** A metric with no API behind it is not built |
| **Requirements Workspace** (screen 4) | **API only. U3 is not authorised** | **Not implemented.** It exists in the reference so today's shell and components can accommodate U3 later |
| Specifications · Processes · Decisions · Forms · Services · Reports | Do not exist | May appear **only** as clearly disabled future-state navigation, per §2.1, **never** implying the capability exists |
| Ask ASDP answering questions, with evidence and confidence | **H3 unresolved** | **A disabled shell only.** Zero provider calls, no simulated answers, no stub imitating live AI |
| Sample data — universities, policy manuals, requirement ids, activity feeds | Illustrative | **No sample or seeded data ships.** The UI shows what the API returns, including empty |

**The governing instruction, recorded verbatim because it settles every fidelity argument:**
**prefer honest product state over visual fidelity to the mockup.**

> **This document is APPROVED, and D-U2.5 (§25) is approved with it. U3 is NOT authorised, P3 has
> not started, H3 is unresolved, and no live provider call is permitted.**
