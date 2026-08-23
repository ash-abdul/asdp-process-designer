# CLAUDE.md — Operating Instructions

> Read this first, before any other document and before any change.
> Authoritative specifications live in `docs/`. Where this file and an ADR disagree, **the ADR wins**.

---

## 1. What this project is

**ASDP Process Designer** is a requirements-driven, AI-assisted process-engineering application. It
transforms business evidence — BRDs, SOPs, policies, spreadsheets, screenshots, diagrams, legacy
BPMN — into a governed, traceable, validated, **Camunda 8**-ready process application.

It is **not** a BPMN drawing tool and does not replace Camunda Modeler.

---

## 2. The core product boundary

This is the single most important constraint in the project. Violating it invalidates the
traceability guarantee, the correct-by-construction IR, and the divergence model.

**Users edit requirements and specifications. Users do not edit generated artifacts.**

| Editable — the source of truth | Not structurally editable in ASDP |
|---|---|
| Source requirements and evidence | BPMN tasks, gateways, sequence flows |
| Structured requirements (RAF) | DMN decision tables |
| Business Process Specification (BPS) | Form structures |
| DecisionSpec, FormSpec, ServiceInterface | Any generated artifact serialisation |
| Generation directives (closed vocabulary) | Layout geometry |

Generated BPMN, DMN and forms are **immutable outputs of a versioned generation process**. They are
reviewed, inspected, validated and handed off. Detailed technical refinement happens in Camunda,
*after* handoff — and ASDP never overwrites it.

There is **no override editor**. If a generated artifact is wrong, the requirement or specification
that produced it is wrong. Fix the input, regenerate.

Governed by [ADR-0001](docs/adr/ADR-0001-requirements-driven-product-boundary.md),
[ADR-0002](docs/adr/ADR-0002-spec-layer-editing.md),
[ADR-0003](docs/adr/ADR-0003-no-override-editor.md),
[ADR-0015](docs/adr/ADR-0015-read-only-viewers.md).

---

## 3. AI is propositional; deterministic services hold authority

**AI proposes. Deterministic code commits.**

The AI layer:

- **never** writes to the repository
- **never** emits artifact serialisations (no LLM-authored BPMN XML)
- **never** approves anything
- **never** holds authoritative state

AI produces *proposals* carrying provenance, confidence and any recorded degradations. Deterministic
services validate, gate and commit. Only humans approve, and approval is a signature over
`(baselineHash, validationRunId)` — so it invalidates automatically when either changes.

Every extracted or generated item is placed on the four-level epistemic ladder (L1 extracted fact →
L2 AI interpretation → L3 AI recommendation → L4 human-approved). These levels are never conflated.

Governed by [ADR-0004](docs/adr/ADR-0004-ai-proposes-code-commits.md),
[ADR-0005](docs/adr/ADR-0005-ir-first-compilation.md),
[ADR-0007](docs/adr/ADR-0007-epistemic-ladder.md),
[ADR-0017](docs/adr/ADR-0017-approval-as-baseline-signature.md).

---

## 4. The required generation pipeline

Nothing may skip a stage. There is no path from prose to BPMN that bypasses the IR.

```
Evidence
  → RAF / Structured Requirements        ── [G1 human approval]
    → Business Process Specification     ── [G2 human approval]
      → Process IR                          (correct by construction, 28 invariants)
        → deterministic compilers
          → Camunda artifacts (BPMN / DMN / Forms / interface contracts)
```

Two rules about this pipeline:

1. **No LLM ever produces the authoritative artifact.** The IR exists precisely so that generation
   is deterministic and verifiable.
2. **No silent conversion.** Vague or incomplete requirements cannot become executable BPMN. Gates
   block structurally, not by convention.

Every element traces back: `Evidence → Requirement → BPS element → IR element → artifact →
validation rule → test scenario`.

Governed by [ADR-0005](docs/adr/ADR-0005-ir-first-compilation.md),
[ADR-0006](docs/adr/ADR-0006-correct-by-construction-ir.md),
[ADR-0008](docs/adr/ADR-0008-resolvable-anchors.md),
[ADR-0009](docs/adr/ADR-0009-technology-neutral-bps.md).

---

## 5. Where the authoritative documentation lives

| Location | Contents |
|---|---|
| [docs/START-HERE.md](docs/START-HERE.md) | Orientation and reading order for a human |
| [docs/README.md](docs/README.md) | Documentation index — start here to find a spec |
| `docs/00-product/` | Charter, product boundary, personas, MVP scope |
| `docs/10-architecture/` | Architecture overview, module map, AI provider abstraction, data governance, multilingual, identity, deployment, stack |
| `docs/20-domain/` | Domain model, RAF, epistemic model, provenance & anchoring, traceability, artifacts, versioning |
| `docs/30-generation/` | Process IR, generation pipeline, pattern mapping, directives, decision/form generation, layout |
| `docs/40-quality/` | Validation architecture, rule catalogue, test scenarios, AI evaluation |
| `docs/50-governance/` | Gates G0–G4, Camunda integration, handoff & divergence, audit |
| `docs/60-plan/` | Roadmap, phase plans, phase status, open decisions |
| [docs/adr/](docs/adr/README.md) | **38 ADRs — the binding decisions.** ADR-0037 is the only one still `PROPOSED` |

Documents in `docs/` are **versioned specifications, not notes.**

---

## 6. ADRs that matter most

Read these before changing anything structural:

| ADR | Why it is load-bearing |
|---|---|
| [0001](docs/adr/ADR-0001-requirements-driven-product-boundary.md) | The product boundary. Very hard to reverse |
| [0002](docs/adr/ADR-0002-spec-layer-editing.md) | Spec-layer editing, artifact-layer read-only |
| [0004](docs/adr/ADR-0004-ai-proposes-code-commits.md) | AI proposes, deterministic code commits |
| [0005](docs/adr/ADR-0005-ir-first-compilation.md) | AI never emits artifact serialisations |
| [0007](docs/adr/ADR-0007-epistemic-ladder.md) | The four-level ladder |
| [0008](docs/adr/ADR-0008-resolvable-anchors.md) | Anchors MUST resolve. Unresolvable = hard error |
| [0020](docs/adr/ADR-0020-ai-provider-abstraction.md) | Provider neutrality; no vendor concept may become load-bearing |
| [0021](docs/adr/ADR-0021-data-classification-egress-policy.md) | Not all source material may leave the enterprise |
| [0023](docs/adr/ADR-0023-unicode-bilingual-architecture.md) | Arabic/English from the data model up; **application-side match forms, never DB collation** |
| [0029](docs/adr/ADR-0029-modular-monolith.md) | Module boundaries and dependency rules |
| [0030](docs/adr/ADR-0030-typescript-end-to-end.md) | TypeScript, strict |
| [0034](docs/adr/ADR-0034-nestjs-application-layer.md) | NestJS is the **composition layer only** — conditions N1–N5 |
| [0035](docs/adr/ADR-0035-persistence-plain-sql-pglite.md) | Plain parameterised SQL; PGlite in dev, PostgreSQL in production. No ORM |
| [0036](docs/adr/ADR-0036-build-toolchain.md) | Compiled build; `erasableSyntaxOnly` retained outside `apps/api` |
| [0038](docs/adr/ADR-0038-target-versus-content-verification.md) | **Target vs content verification.** Visual evidence is `content_unverified`, never `resolved` — never conflate the two |

---

## 7. Handling architecture conflicts

Precedence, highest first:

1. An **approved ADR**
2. A specification document in `docs/`
3. Existing code

If a document contradicts an ADR, the **document is a defect** — fix the document, do not follow it.

If a required change contradicts an ADR:

1. **Stop.** Do not implement it and do not quietly work around it.
2. State the conflict explicitly, naming the ADR and the condition.
3. Propose either a new ADR (superseding the old one) or a different approach.
4. Wait for an explicit decision.

An approved ADR is **never edited to change its decision** — it is superseded by a new ADR.

Never silently change an architectural boundary. Never weaken an architecture-checker rule to make
a change pass; if a rule is wrong, say so and fix it deliberately with the reason recorded.

---

## 8. Before making any change

```bash
git status && git log --oneline -5
```

Always inspect the working tree and recent history first. Never begin work on a dirty tree without
first establishing what the uncommitted changes are.

Then:

1. Read the relevant `docs/` specification and any ADR it cites.
2. Determine whether the change affects an ADR. If it does, see §7.
3. Perform impact analysis — what traces through this change?
4. Implement.
5. Add or update tests.
6. Update the documentation in the same change.

### Adding a dependency

Approved decision **A4** governs this. A dependency is a decision, not an implementation detail.

- **Pin** the version. No ranges.
- Record it in the **dependency manifest**, with its **purpose**.
- **Avoid unnecessary dependencies.** Plain code over a small surface usually wins — that is why
  persistence is plain SQL rather than an ORM ([ADR-0035](docs/adr/ADR-0035-persistence-plain-sql-pglite.md)).
- **Preserve the architecture-checker constraints.** A dependency that requires weakening a rule is
  refused, not accommodated.
- **Raise any material framework or runtime dependency for review before adopting it.** NestJS went
  through [ADR-0034](docs/adr/ADR-0034-nestjs-application-layer.md); anything comparable does too.

---

## 9. Verification

```bash
npm run verify
```

This runs, in order: `build` → `check:arch` → `check:arch:selftest` → `check:docs` → `test`.

**Run the full suite before every commit.** A green partial run is not evidence.

| Command | Purpose |
|---|---|
| `npm run build` | `tsc -b` over project references, then asset copy |
| `npm run check:arch` | Dependency and boundary rules |
| `npm run check:arch:selftest` | Proves each rule actually fires |
| `npm run check:docs` | Link integrity, ADR references, superseded names |
| `npm test` | `node:test` over emitted JavaScript in `dist/` |
| `npm run clean` | Clears `dist/` — the fix for a stale build |

Tests run against **compiled output**, so a stale `dist/` is the one failure mode to watch for.
`npm run verify` sequences the build correctly.

### Never suppress a failing test

Do not skip it, comment it out, mark it pending, loosen its assertion, or delete it to get a green
run. A failing test is information.

When a test fails, exactly one of two things is true — determine which, and say which:

- **The code is wrong** → fix the code.
- **The test is wrong** → fix the test, and state explicitly why the previous assertion was wrong.

Three Phase 1 defects were found by tests rather than by review, including one test that passed
*vacuously*. Treat a test that cannot fail as a defect too.

Report results faithfully. If something fails, show the output. If a step was skipped, say so.

### No live AI calls in verification

Approved decision **A7**. Normal verification and CI use **deterministic recorded/replay fixtures**
and make **no live model call**. Live AI evaluation is a **separate, explicitly triggered
capability** and is never part of normal pass/fail.

Do not add a test, a check, or a CI step that calls a model over the network. A provider outage or a
model revision must never be able to turn the build red.

---

## 10. Documentation stays synchronised with code

Documentation and implementation are updated in the **same change**, never in a follow-up.

- New capability → update the relevant `docs/` specification.
- New architectural decision → new ADR, added to [docs/adr/README.md](docs/adr/README.md).
- Phase progress → update `docs/60-plan/phase-*-status.md`.
- New document → add it to the index table in [docs/README.md](docs/README.md).

`npm run check:docs` enforces link integrity and ADR-index completeness. It does not enforce that
prose is *true* — that is your obligation.

### Never present reconstructed information as authoritative

If a decision cannot be recovered from repository evidence — an ADR, a commit, a specification — do
**not** write it down as though it were approved. Reconstruction from plausible sources is not
recovery.

Instead, distinguish explicitly:

| Label | Meaning |
|---|---|
| **Approved** | Traceable to an ADR, a commit, or an explicit decision on the record |
| **Provisional** | The current plan. Not approved. Requires approval before it is acted on |
| **Consolidated** | Derived from approved sources, presented as current, with each item traced to its source |

An invented detail that reads as settled is worse than an acknowledged gap, because the gap invites
a question and the invention does not. When something is unrecoverable, say so and ask.

---

## 11. Do not start a phase or slice without approval

**Explicit approval is required before beginning any new phase or vertical slice.** This is not a
formality; scope creep toward becoming Camunda Modeler is a named critical risk (R11).

- Work only the slice that has been approved.
- When it is complete, **report and stop.** Do not roll into the next slice.
- If the next step seems obvious, propose it and wait.
- Out-of-scope work that seems necessary → raise it, do not do it.

**A provisional slice needs its scope approved, not just a go-ahead.** V0 and V1 are approved with
their scope stated. **V2–V7 are provisional** — capability names only, deliberately without detailed
scope, because the original boundaries were never durably recorded. Before starting one of those,
propose the boundary and get it approved; do not infer scope from the capability name.

**Start every session by reading the checkpoint:**
[docs/60-plan/phase-2-status.md](docs/60-plan/phase-2-status.md) **§0** — phase, current slice,
commit, approved decisions, blocked items, open ADRs, next approved action and work in progress, in
one place. It is the durable record; a conversation is not.
The slice definitions, the approved decisions **A1–A7**, and the consolidated acceptance criteria
are in [docs/60-plan/phase-2-plan.md](docs/60-plan/phase-2-plan.md).

---

## 12. HTTP status semantics

Settled posture, implemented in V1 — do not change it without an ADR:

| Status | Meaning |
|---|---|
| **401** | Unauthenticated, or invalid authentication, where authentication applies |
| **403** | Authenticated but not authorised |
| **404** | Unknown route, or resource not found |
| **503** | The service cannot perform the authentication mechanism it is configured to require |

An unknown route returns **404 before authentication** — NestJS routes before guards, and route
names are not treated as secrets. Known protected routes continue to reject anonymous callers.
This supersedes the Phase 1 behaviour, which returned 403 before route resolution.

Keep 401 and 403 distinct. A caller who gets 403 goes looking for a permissions problem; one who
gets 401 goes looking for a credentials problem. Returning the wrong one sends them to the wrong
place. Absent or unusable credentials are **always** 401, never 403 — Phase 1 returned 403 for
both, and V1 corrected it.

---

## 13. The one-sentence model

> ASDP Process Designer turns evidence-backed, human-approved business requirements into governed,
> traceable, validated Camunda process artifacts — without asking business users to author BPMN.
