# UI Enablement (`apps/web`) — Boundary · ✅ APPROVED · **U1 AND U2 ACCEPTED**

> **Status: BOUNDARY APPROVED 2026-08-25. W1–W13 approved.**
> **U1 IS ACCEPTED** (`d4785c1`, 2026-08-25) — [phase-2-status.md](phase-2-status.md) §18.
> **U2 IS ACCEPTED** (`8f7d37b` + `c93e05b`, 2026-08-25) — §19, on its own approved boundary
> [u2-proposal.md](u2-proposal.md) (**X1–X10**) with
> [ADR-0040](../adr/ADR-0040-browser-testing-pinned-browser.md).
> **U3's BOUNDARY IS APPROVED — 2026-08-26** ([u3-proposal.md](u3-proposal.md), **Z1–Z14**),
> **not yet implemented**; **U4 and U5 remain NOT authorised.** W13 approved U1→U5 as a **sequence**,
> which is not authorisation; each boundary must be proposed and approved before it begins, per §11 of
> [CLAUDE.md](../../CLAUDE.md), as U1's, U2's and now U3's were.
> **The two U1 follow-ups (§18.1): F-U1-a is DISCHARGED** by
> [ADR-0040](../adr/ADR-0040-browser-testing-pinned-browser.md), taken before U2 rather than before
> U3; **F-U1-b STANDS permanently** — development header authentication is localhost-only and is
> never the production authentication solution.
> **F-U2-b is DISCHARGED** — it asked for a **UI/UX design foundation** before U3, and
> [ui-design-foundation-proposal.md](ui-design-foundation-proposal.md) was **APPROVED, implemented
> and ACCEPTED as D-U2.5 on 2026-08-25** ([phase-2-status.md](phase-2-status.md) §20.7). The label
> here read *"PROPOSED / NOT APPROVED"*, which was true when written and went stale at acceptance; it
> is corrected on 2026-08-26 rather than deleted.
> **React + Vite adoption is recorded in [ADR-0039](../adr/ADR-0039-react-presentation-layer.md)**,
> approved before any UI code was written.
> **Version:** 1.0 · **Approved:** 2026-08-25 · **Against commit:** `773c82c`
> **Addresses:** the undelivered P1/P2 user-facing commitments recorded in
> [roadmap.md](roadmap.md) §0.3 as **UNPLANNED / BOUNDARY NOT YET APPROVED**
> **Related:** [phase-2-status.md](phase-2-status.md) §16–§17,
> [technology-stack.md](../10-architecture/technology-stack.md),
> [module-map.md](../10-architecture/module-map.md),
> [ADR-0015](../adr/ADR-0015-read-only-viewers.md),
> [ADR-0027](../adr/ADR-0027-abstract-oidc-identity.md),
> [ADR-0023](../adr/ADR-0023-unicode-bilingual-architecture.md),
> [ADR-0038](../adr/ADR-0038-target-versus-content-verification.md),
> [provenance-and-anchoring.md](../20-domain/provenance-and-anchoring.md) §6

---

## 0. The approved decisions

| # | Decision | Disposition |
|---|---|---|
| **W1** | Seven screens and the journey (§3) | **APPROVED as the target.** Only **S1**, a minimal **S2** and **S4** are built in U1 |
| **W2** | `apps/web` structure and the four import rules (§4) | **APPROVED** |
| **W3** | React + TypeScript + Vite | **APPROVED**, per the existing approved technology stack, with adoption and boundaries recorded in **[ADR-0039](../adr/ADR-0039-react-presentation-layer.md)** *before* implementation |
| **W4** | Plain typed `fetch` + React state (§6) | **APPROVED.** **No data-fetching or state-management library** without a demonstrated need and **separate approval** |
| **W5** | Authentication posture (§7) | **APPROVED: W5-A — development-only header authentication.** Must **fail closed outside localhost/development** and be **visibly identified as development authentication**. **NOT the production authentication architecture** |
| **W6** | RTL and bilingual behaviour (§8) | **APPROVED** |
| **W7** | Evidence highlighting rules (§9) | **APPROVED** |
| **W8** | Accessibility baseline (§10) | **APPROVED** |
| **W9** | Error, loading and empty states (§11) | **APPROVED** |
| **W10** | The three API gaps (§2.2) | **G-a APPROVED · G-b APPROVED · G-c DEFERRED** — hardcoded role mapping with an **automated drift test**. **G-a and G-b may be built only by the slice that first needs them; U1 needs neither** |
| **W11** | Acceptance criteria (§13) | **APPROVED** |
| **W12** | Required tests (§14) | **APPROVED** |
| **W13** | Slices and sequence, U1 → U5 (§15) | **APPROVED as a sequence.** U1 **accepted** 2026-08-25; U2 **accepted** 2026-08-25 on its own boundary ([u2-proposal.md](u2-proposal.md), X1–X10); **U3's boundary APPROVED 2026-08-26** on its own boundary ([u3-proposal.md](u3-proposal.md), Z1–Z14) and **not yet implemented**. **U4 and U5 are NOT authorised** |
| **W14** | Out of scope (§16) | Unchanged |

### 0.1 U1's approved acceptance boundary

> **Development sign-in → project selection → source selection → source viewer → server-provided
> evidence highlighting with correct English/LTR and Arabic/RTL behaviour.**

**Nothing else.** G-a and G-b are approved but **out of U1**, because U1 needs neither.

**As at 2026-08-26: U1 and U2 are accepted, each on its own boundary. U3's boundary is APPROVED
([u3-proposal.md](u3-proposal.md), Z1–Z14) and U3 is being implemented one approved step at a time,
starting with U3-a. U4 and U5 must not be implemented.**

---

## 1. What this is, and what it is not

**Objective: the smallest browser application that lets a real analyst do the work the accepted
backend already supports, end to end, up to and including G1 approval.**

The backend is a phase ahead of the product. Every API a reviewer needs exists, is tested and is
accepted; **no human can use any of it.** This slice closes that gap and nothing else.

**It does not reopen P1 or P2**, which stay closed. It does not start **P3**. It adds **no domain
logic**: every rule, every gate, every role check already lives in the API and stays there.

### 1.1 The governing constraint

> **The UI renders and requests. It never decides.**

[ADR-0027](../adr/ADR-0027-abstract-oidc-identity.md): *"authorisation is enforced by the API,
never the client."* [ADR-0015](../adr/ADR-0015-read-only-viewers.md): viewers are read-only, and
hiding an editor is not the same as not having one. Every affordance this UI hides is a **courtesy**,
not a control — the API refuses regardless, and a test asserts that it does.

---

## 2. The API surface, audited

**48 route handlers across 11 controllers** — not 44; the earlier figure de-duplicated identical
decorator strings such as `@Get(':projectId')`.

| Controller | Base | Routes |
|---|---|---|
| `projects` | `projects` | 10 |
| `clarification` | `projects/:projectId` | 6 |
| `evidence` | `projects/:projectId` | 5 |
| `review` | `projects/:projectId` | 5 |
| `health` | *(root)* | 4 |
| `sources` | `projects/:projectId/sources` | 4 |
| `analysis` · `requirements` · `g1` · `source-viewer` | | 3 each |
| `reconciliation` | `projects/:projectId` | 2 |

### 2.1 What is already sufficient

Everything the eleven requested capabilities need, **with three exceptions in §2.2**. In particular:

- **Project selection** — `GET /projects` exists. No gap.
- **Requirement → evidence → source navigation** — `GET /projects/:p/requirements` returns each
  requirement **spread whole** plus its `evidence` links; `GET …/evidence/:id` gives the anchor and
  `sourceId`; `GET …/sources/:s/highlights?evidenceId=…` returns the ranges. **The chain is
  complete.**
- **Server-computed highlighting** — the highlights endpoint accepts `evidenceId`, `unitId`, or an
  explicit `start`/`end`, and with **no selector returns every unit**, so a whole document paints in
  one request. Each range carries `direction`, `language` and `precision`; an anchor that no longer
  resolves returns **`resolution: 'broken'` with no segments**.
- **AI / provenance / confidence / degradation** — `listRequirements` spreads the whole
  `Requirement`, so `epistemicLevel`, `derivation`, `computedConfidence`, `confidenceBand`,
  `confidenceFunctionVersion`, `humanConfirmationRequired`, `generatedBy`, `aiInteractionId`,
  `promptVersion`, `providerId`, `modelId`, `degradations[]` and `framePass` are all present.
  `GET …/ai-interactions` gives the disclosure log.
- **G1** — `GET …/g1/readiness` returns **all eight preconditions, met or not**, each with
  `ruleId`, `met` and `detail`, plus `blockingFindingIds`.

### 2.2 Three minimal API gaps — **identified for approval, NOT filled here**

> **No backend change is proposed by this document.** Each gap is stated with its smallest possible
> fix so the decision is yours. **W10** covers them.

| # | Gap | Why it blocks a requested capability | Smallest fix |
|---|---|---|---|
| **G-a** | **Two flag kinds are unlistable.** `GET …/frame-coverage` returns `ambiguities`, filtered to five of the seven `RequirementFlagKind` values. **`single_source` and `content_unverified_evidence` are returned by no endpoint**, yet `POST …/requirement-flags/:flagId/resolve` exists to resolve them | "Clarification questions and flags" is a requested capability. A flag the UI cannot enumerate cannot be resolved. `content_unverified_evidence` is the **ADR-0038** flag — arguably the one most worth surfacing | One read route, `GET …/requirement-flags`, over the existing `flagsForSet`. **No new domain logic** |
| **G-b** | **Unconfirmed merges are a count, not a list.** `GET …/reconciliation` returns `canonicalEntities: number` and `unconfirmedMerges: number`, yet `POST …/canonical-entities/:entityId/verdict` needs an **id** | Equivalence confirmation is a **G1 precondition** (U4). The UI can see that merges are unconfirmed and can never say which | Return the entity list, or add `GET …/canonical-entities`, over the existing `canonicalEntitiesForSet` |
| **G-c** | **The RBAC registry is not exposed.** `COMMANDS` in `commands.ts` is a machine-readable map of command → `requiredRoles`, and no route serves it | Without it the UI must **hardcode** role rules, which then drift from the API silently — the same failure mode as H4's duplicated allocator | One read route returning `COMMANDS`. It is **not** an authorisation surface: the API still refuses. Alternatively **W5b**, hardcode and test the drift |

**None of the three is a defect in the accepted backend.** Each is a read surface no consumer needed
until there was a consumer.

---

## 3. Proposed screens and journey — **W1**

Seven screens. The journey is the one the personas document already describes, in order.

| # | Screen | Purpose |
|---|---|---|
| **S1** | **Project picker** | Choose or create a project; see gate states |
| **S2** | **Project shell** | Persistent chrome: project context, stage, gate badges, identity, language toggle |
| **S3** | **Sources** | Inventory, upload, authority ranking, per-source parse state |
| **S4** | **Source viewer** | Document text with server-computed highlights, unit list, RTL/LTR correct |
| **S5** | **Requirements workspace** | The centre of gravity. List + detail, review actions, revision, evidence pane linking to **S4** |
| **S6** | **Reconciliation** | Conflicts with precedence rationale; decisions; equivalence confirmation |
| **S7** | **Coverage & G1** | RAF coverage, the eight preconditions, questions, flags, and approval |

**The journey:** pick a project → ingest sources and rank authority → extract evidence → populate
the frame → review requirements against their evidence → resolve flags, answer questions, decide
conflicts, confirm merges → watch coverage and readiness turn green → **approve G1**.

---

## 4. Frontend architecture — **W2**

Per the **already-approved** [technology-stack.md](../10-architecture/technology-stack.md)
(*"React + TypeScript, Vite build"*) and [module-map.md](../10-architecture/module-map.md)
(`apps/web`, React SPA).

```
apps/web/
├─ index.html · vite.config.ts · package.json   (asdp.class: "presentation")
└─ src/
   ├─ main.tsx  app/{router,shell,providers}
   ├─ api/            generated-free typed client over @asdp/schemas
   ├─ features/{projects,sources,requirements,reconciliation,coverage,g1}
   ├─ source-viewer/  text renderer + highlight painter
   ├─ i18n/           message catalogues, direction handling
   └─ components/ lib/
```

**Four rules, each proposed as enforceable by the architecture checker (W9):**

1. **`apps/web` may import `@asdp/schemas` and nothing else from `packages/`.** Types and validation
   only. It must never reach `@asdp/domain`, `@asdp/validation`, `@asdp/ai` or `@asdp/ingestion` —
   pulling a rule engine into the browser is how the client starts deciding.
2. **No `apps/api` import.** The contract is HTTP.
3. **No business rule in the browser.** No re-implementation of gate logic, role logic, confidence,
   precedence or readiness. If a screen needs a verdict, it asks.
4. **No text re-search for highlights.** Offsets come from the server. This is the rule
   `source-viewer.controller.ts` already states in prose.

---

## 5. API-to-screen mapping — **W3**

| Screen | Reads | Writes |
|---|---|---|
| **S1** | `GET /projects` · `GET /projects/:p/gates` | `POST /projects` |
| **S2** | `GET /projects/:p` · `…/gates` · `GET /meta` · `…/stages/:stage/enterable` | — |
| **S3** | `GET …/sources` · `…/sources/:s` · `GET …/intake/rules` | `POST …/sources` · `PUT …/sources/:s/authority` · `POST …/intake/validate` |
| **S4** | `GET …/sources/:s/content` · `…/units` · `…/highlights` | — *(read-only, ADR-0015)* |
| **S5** | `GET …/requirements` · `…/evidence/:id` · `…/ai-interactions` | `POST …/requirements/:r/review` · `…/revise` · `…/inferred` · `…/confirm-inference` |
| **S6** | `GET …/reconciliation` **+ G-b** | `POST …/reconcile` · `…/conflicts/:c/decide` · `…/canonical-entities/:e/verdict` |
| **S7** | `GET …/frame-coverage` · `…/g1/readiness` · `…/questions` · `GET …/audit` **+ G-a** | `POST …/questions/generate` · `…/questions/:q/answer` · `…/requirement-flags/:f/resolve` · `…/policy-acknowledgements` · `…/g1/validate` · `…/g1/approve` |

**Not consumed by this slice:** `POST …/sources/:s/profile`, `POST …/sources/:s/extract-evidence`,
`POST …/populate-frame`, `POST …/evidence`, `POST …/baselines`, `POST …/gates/:g/evaluate|approve`
(the generic pair; **G1 uses its own**), `health/*`. Several are AI-invoking and are proposed as
**operator actions on S3** behind an explicit confirmation — **W6**.

---

## 6. State and data fetching — **W4**

**Proposed: a small typed fetch layer plus React state. No data-fetching library, no state library.**

Decision **A4** governs dependencies, and this application is **request/response with almost no
client-side cache coherence problem**: every mutation is followed by a re-read of a small resource,
and the server is the only authority. TanStack Query and Redux both solve problems this UI does not
yet have.

- Typed client per resource, validating responses with **`@asdp/schemas`** so a contract drift is a
  loud client-side error rather than a blank pane.
- **Refetch after every mutation.** No optimistic updates for anything a gate depends on — a
  requirement that *looks* approved and is not is exactly the confusion ADR-0017 exists to prevent.
- **`ConcurrencyError` (409) is a first-class outcome**, not a generic failure: reload and show what
  changed.
- Revisit the decision if and when a screen genuinely needs cross-screen cache invalidation. **W4b**
  records that a library may be proposed later **as its own dependency decision**, not smuggled in.

---

## 7. Authentication and authorisation — **W5** ⚠️ *the decision that matters most*

**The blunt finding:** `authMode: 'oidc'` **throws 503 — the OIDC adapter is not implemented**
(`actor.guard.ts`). The only working mode is `headers`, where the caller supplies `x-asdp-subject`
and `x-asdp-roles`.

**A browser cannot safely send those headers.** The client would be asserting its own identity *and
its own roles*. Anyone could grant themselves `PlatformAdmin` with dev-tools. That is not a UI
problem to design around — it is a property of header auth.

Three options, and this proposal recommends the first:

| | Option | Assessment |
|---|---|---|
| **W5-A** ✅ | **Development-only header auth, refused in production by configuration.** The UI collects subject and roles at a dev sign-in screen and sends them. The build refuses to start against a non-local origin, and the screen is permanently, visibly labelled | **Honest and small.** Ships a usable app now; hides nothing. It is the same posture `headers` mode already takes for the API |
| **W5-B** | **Implement OIDC first** | Correct, and **out of this boundary**: it is backend work, and §6.1 defers the IdP with the trigger *"Docker + the IdP decision"* — neither has happened |
| **W5-C** | **Add a session-holding BFF** | New backend, new deployment component, new attack surface. Larger than the UI it serves |

**Authorisation in the UI is affordance only.** Roles come from the identity the user signed in with;
buttons the role cannot use are disabled with the reason shown. **The API is the authority** — and an
acceptance test asserts a disabled affordance still returns **403** when invoked directly.

---

## 8. RTL and bilingual behaviour — **W6**

[ADR-0023](../adr/ADR-0023-unicode-bilingual-architecture.md) is *"Arabic/English from the data model
up"*, and the backend already carries `direction` on sources, units and every highlight range.

- **Direction is data, never guessed.** The UI sets `dir` from the server's `direction` field. It
  never sniffs text.
- **Per-element direction**, not per-page: an Arabic quote inside an English document renders `rtl`
  inside an `ltr` container, and the reverse.
- **Isolation at every boundary** — `dir="auto"` is not sufficient; mixed content uses explicit
  isolation so a neutral character cannot reorder a surrounding label.
- **Offsets are code points over NFC logical-order text.** The renderer maps them to DOM ranges
  without normalising, re-searching or trimming. This is criterion 4 of `phase-2-plan.md` §5,
  rendered rather than merely computed.
- **UI chrome localisation** is **out of scope** — English chrome, bilingual *content*. Full Arabic
  UI localisation is roadmap **P12**.

---

## 9. Evidence highlighting rules — **W7**

Five rules, all derived from
[provenance-and-anchoring.md](../20-domain/provenance-and-anchoring.md) §6 and ADR-0038.

1. **The server computes; the client paints.** Ranges arrive with offsets, direction and precision.
2. **Never re-search rendered text** to locate a highlight. Doing so reintroduces every
   normalisation and direction bug the pipeline exists to eliminate.
3. **`resolution: 'broken'` renders as broken** — visibly, in place, with the reason. It must never
   fall back to a best-guess highlight, and never silently disappear.
4. **`precision` is shown.** `exact` and a degraded precision must not look identical.
5. **ADR-0038 is honoured in the UI**: a `content_unverified` structural anchor is labelled
   *unverified*, never *resolved*. **Conflating the two in a pixel is the same defect as conflating
   them in a column.**

---

## 10. Accessibility baseline — **W8**

Not a polish item: roadmap **P5** already commits to *"full keyboard and screen-reader navigation"*,
and starting below that baseline makes it unreachable later.

- **WCAG 2.2 AA** as the target; keyboard operability for **every** action, no mouse-only path.
- Visible focus; logical order in **both** directions.
- Highlights carry an accessible name — *"evidence ev-…, exact, Arabic"* — not colour alone.
- Confidence and epistemic level never encoded **by colour alone**.
- Live regions for async outcomes, so a refused action is announced rather than merely rendered.
- `lang` and `dir` correct on every element that switches language.

---

## 11. Error, loading and empty states — **W9**

The API's status vocabulary is settled (CLAUDE.md §12) and the UI must not blur it:

| Status | UI behaviour |
|---|---|
| **401** | Sign-in required — a **credentials** problem |
| **403** | Role refusal — name the missing role. **Never** presented as "not found" |
| **404** | Not found |
| **409** | Concurrency — reload and show what changed |
| **503** | Service cannot perform its configured auth, or the database is unavailable. **Never** rendered as a validation error |

**A known limitation the UI must not paper over:** **H6 / limitation 79** flattens a domain error
thrown inside a transaction into `503 database unavailable`. The UI shows the 503 honestly and links
to the audit log. **Cosmetically rewriting it in the client would hide a recorded defect.**

**Empty states carry the reason, never a blank pane** — *"no requirements yet: run POPULATE_FRAME"*,
*"no evidence: extract first"*. **Loading:** skeletons for lists, never a spinner over an
already-rendered document.

---

## 12. Security considerations — **W10**

- **No secret in the browser. Ever.** No provider key, no database credential.
- **No AI call from the client.** The browser never talks to a provider; the broker and its egress
  gate are server-side and stay there.
- **Classification is displayed, not enforced, client-side.** `RESTRICTED` content is labelled; the
  egress gate remains the control.
- **Rendered source text is untrusted input.** An ingested document may contain markup or script;
  the viewer renders it as **text**, never as HTML. This is the single highest-risk item in the slice.
- **Strict CSP**, no inline script, no `eval`.
- **Nothing sensitive in URLs** — ids only, never quoted content.
- Header-auth mode is **development-only** and must fail closed off localhost (**W5-A**).

---

## 13. Acceptance criteria — **W11**

| # | Criterion |
|---|---|
| **1** | **A person can take a project from empty to G1 approved in a browser**, without curl, without dev-tools |
| **2** | Every requirement shows epistemic level, derivation, computed confidence **with its band**, `generatedBy`, and any degradations |
| **3** | Selecting a requirement's evidence opens the source at the **correct region**, correct in **both** directions |
| **4** | A **broken** anchor renders as broken, in place, with its reason — and never as a highlight |
| **5** | All **eight** G1 preconditions render with `ruleId`, met state and detail — never just the first failure |
| **6** | Approval is refused in the UI **and** by the API when the actor lacks the role, and the UI names the missing role |
| **7** | An Arabic document and a mixed Arabic/English document both render and highlight correctly |
| **8** | **Every action is keyboard-reachable**; highlights are announced by a screen reader |
| **9** | **No business rule is duplicated in the browser** — asserted by the checker rule, not by review |
| **10** | The UI makes **no direct provider call** and holds **no secret** |
| **11** | `npm run verify` stays green, and **backend test counts are unchanged** |

---

## 14. Required tests — **W12**

| Layer | Coverage |
|---|---|
| **Unit** | Highlight offset → DOM range mapping, including **non-BMP** characters and RTL runs. Direction resolution. Confidence and epistemic formatting. Status-to-message mapping |
| **Integration** *(no browser)* | Typed client against **recorded fixtures**, validated with `@asdp/schemas`. A contract drift must fail loudly |
| **Browser** | The **journey**: project → source → evidence → requirement → flag → conflict → readiness → approve. Plus an RTL document, a broken anchor, and a 403 affordance |
| **Accessibility** | Automated axe pass on every screen; **manual** keyboard traversal of the journey |
| **Architecture** | New checker rules: `apps/web` imports only `@asdp/schemas` from `packages/`; no `apps/api` import; **no domain-rule symbol** in `apps/web`. Each with self-test cases, per the existing convention |

**A7 holds unchanged: no test may make a live provider call.** Browser tests run against the API with
stub providers, exactly as the backend suite does.

---

## 15. Slices and sequence — **W13**

**Five slices. Each is independently demonstrable, and the first exists to validate the architecture
before any workspace is built.**

### 15.1 The first demonstrable vertical slice — **U1: "one document, correctly highlighted"**

> **Sign in (dev) → pick a project → open a source → see its text with server-computed highlights,
> correct in Arabic and English.**

**Why this one.** It is the smallest thing that exercises **every** architectural risk at once —
auth, typed client, schema validation, routing, shell, **and the hardest rendering problem in the
product**: code-point offsets mapped onto a bidirectional DOM. If the highlight model is wrong, it is
wrong here, in a slice small enough to throw away.

It needs **no new API**. It writes nothing. It is read-only, so it cannot corrupt an accepted
backend, and it can be reviewed by an analyst rather than a developer.

| Slice | Delivers | Needs a gap closed? |
|---|---|---|
| **U1** | Shell, dev sign-in, project picker, source viewer with highlights | No |
| **U2** | Sources: inventory, upload, authority ranking, intake validation | No |
| **U3** | Requirements workspace: list, detail, evidence pane linked to U1, review + revise | No |
| **U4** | Coverage, the eight preconditions, questions, flags | **G-a** |
| **U5** | Reconciliation, conflict decisions, equivalence confirmation, **G1 approval** | **G-b** |

**G-c** (the RBAC registry) affects U1 onward; **W5b** may defer it by hardcoding with a drift test.

---

## 16. Explicitly out of scope — **W14**

| Out of scope | Belongs to |
|---|---|
| **Specification Studio, BPS / DecisionSpec / FormSpec editors** | **P3** — not started, no approved boundary |
| **BPMN / DMN / Form generation, Process IR** | **P4** |
| **Artifact viewer framework** — `bpmn-js` renderers, inspector, overlays, compare | **P5** |
| **Any graphical process designer** | **Never** — reverses ADR-0001 and ADR-0003 |
| **Full Arabic UI localisation** | **P12** |
| **OIDC implementation** | Deferred, §6.1 — trigger *"Docker + the IdP decision"* |
| **H3 and live AI enablement** | Blocked; **not touched by this slice** |
| **Real-BRD validation** | Needs approved material within the **E1** ceiling |
| **Filling API gaps G-a/G-b/G-c** | **Approval required — W10.** Not assumed by this document |
| **PDF rendering** | V2-PDF is blocked |

---

## 17. Is an ADR required?

| Question | Answer |
|---|---|
| Does it contradict an approved ADR? | **No.** ADR-0015 (read-only viewers), ADR-0027 (API-enforced authorisation), ADR-0023 (bilingual) and ADR-0001/0003 (no editor) are all **honoured and strengthened** by §4's rules |
| Does it add an architectural layer? | **It populates one that is already approved.** `apps/web` is in [module-map.md](../10-architecture/module-map.md); React + Vite is in [technology-stack.md](../10-architecture/technology-stack.md); the checker already defines a `presentation` class **no package has ever declared** |
| Does it add dependencies? | **Yes — React, React DOM, Vite, and a browser test runner.** Decision **A4** applies: pin, manifest, purpose, and *"raise any material framework dependency for review"*. **That is decision W3, and it is a material one** |
| Does it change the product boundary? | **No.** ADR-0001 is untouched: users still edit requirements, never artifacts |

**No new ADR is proposed**, on the ground that the presentation layer and its framework are already
approved architecture. **If you consider adopting React in practice a decision deserving its own
record — as NestJS got ADR-0034 — that is a reasonable position and W3 is where to say so.**

---

## 18. Status and what happens next

**PROPOSED. NOT APPROVED. NOT IMPLEMENTED.** `apps/web` does not exist.

1. **Approve, amend or reject W1–W14** — in particular **W5** (auth posture), **W3** (the React
   dependency, and whether it needs an ADR) and **W10** (the three API gaps).
2. On approval, this document's status changes, the decisions are recorded, and **U1 only** begins.
3. **U1 is reviewed before U2 starts.** The point of a first vertical slice is that it can be
   rejected cheaply.
4. **P3 must not begin.** Its boundary is neither proposed nor approved.
5. **H3 and live AI remain blocked** and are untouched by this slice.
