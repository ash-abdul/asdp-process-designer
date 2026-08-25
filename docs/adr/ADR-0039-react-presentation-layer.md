# ADR-0039: React + Vite as the Presentation Layer, and Its Boundary

> **Status:** **Approved** · **Date:** 2026-08-25 · **Reversibility:** Moderate
> **Related:** [ADR-0034](ADR-0034-nestjs-application-layer.md) — the same shape of decision one
> layer up, [ADR-0015](ADR-0015-read-only-viewers.md), [ADR-0027](ADR-0027-abstract-oidc-identity.md),
> [ADR-0023](ADR-0023-unicode-bilingual-architecture.md),
> [ADR-0001](ADR-0001-requirements-driven-product-boundary.md),
> [ADR-0003](ADR-0003-no-override-editor.md),
> [technology-stack.md](../10-architecture/technology-stack.md),
> [module-map.md](../10-architecture/module-map.md),
> [ui-enablement-proposal.md](../60-plan/ui-enablement-proposal.md)

## Context

The backend is a phase ahead of the product. Every API a reviewer needs exists, is tested and is
accepted, and **no human can use any of it**. `apps/web` appears in the approved
[module map](../10-architecture/module-map.md) and React + Vite in the approved
[technology stack](../10-architecture/technology-stack.md); the architecture checker has defined a
`presentation` class since V0 and **no package has ever declared it**.

Adopting a UI framework is a decision of the same weight as adopting NestJS, which got
[ADR-0034](ADR-0034-nestjs-application-layer.md). The stack document names React, but naming a
framework in a stack table is not the same as recording what it may and may not touch. The risk is
identical to the one ADR-0034 addresses: a framework that starts as a rendering layer and ends up
holding domain logic.

There is a second, product-specific risk. This application's central guarantee is that **an anchor
resolves to the exact region it came from, in either reading direction**. A browser is where that
guarantee is most easily broken, and the break is silent: a client that re-searches rendered text for
a quote will find *something* most of the time, and will highlight the wrong span the rest of the
time — in exactly the bidirectional and normalisation cases the pipeline exists to eliminate.

## Decision

**React + TypeScript, built by Vite, is the presentation layer. It renders and requests. It never
decides.**

### 1. `apps/web` is `presentation`-class, and the class is enforced

Its `package.json` declares `asdp.class: "presentation"` and the architecture checker enforces the
class rather than merely accepting the string.

### 2. It may import `@asdp/schemas` and nothing else from the workspace

Types and runtime validation only. It may **not** import `@asdp/domain`, `@asdp/validation`,
`@asdp/raf`, `@asdp/ai`, `@asdp/ingestion`, `@asdp/provenance`, `@asdp/text`, `@asdp/eval` or
`apps/api`.

Pulling a rule engine into the browser is how the client starts deciding. `@asdp/validation` in
particular would let a screen compute its own verdict on gate readiness, and the first time that
answer disagreed with the server's, the user would be shown a lie.

### 3. No business rule is re-implemented in the browser

No gate logic, role logic, confidence computation, precedence, readiness or invariant. **If a screen
needs a verdict, it asks the API.**

### 4. Authorisation is the API's, always

[ADR-0027](ADR-0027-abstract-oidc-identity.md) already says authorisation is enforced by the API and
never the client. Affordances the UI hides are a **courtesy**, not a control: the API refuses
regardless, and a test asserts that it does.

### 5. Evidence highlighting uses server-computed offsets, and the client never re-searches text

The server returns ranges with `charStart`/`charEnd` as **code-point offsets over NFC, logical-order
text**, plus `direction`, `language` and `precision`. The client maps offsets to DOM ranges. It must
never search rendered text for a quote, normalise before mapping, or trim.

**An anchor whose `resolution` is `broken` renders as broken, visibly and in place.** It must never
fall back to a best-guess highlight and never silently disappear.

### 6. Development authentication is development-only and fails closed

The only working `authMode` is `headers`, in which the caller supplies its own subject and roles. A
browser doing that is asserting its own authorisation, which is forgeable by anyone with dev-tools.
It is therefore permitted **only against a localhost/development origin**, must **refuse to operate
otherwise**, and must be **visibly identified as development authentication** wherever it is used.

**This is not the production authentication architecture.** Production requires OIDC
([ADR-0027](ADR-0027-abstract-oidc-identity.md)), whose adapter is not implemented and whose
deferral trigger is recorded in [phase-2-plan.md](../60-plan/phase-2-plan.md) §6.1.

### 7. The product boundary is unchanged

[ADR-0001](ADR-0001-requirements-driven-product-boundary.md) and
[ADR-0003](ADR-0003-no-override-editor.md) stand. The UI lets users edit **requirements and
specifications**. It renders generated artifacts read-only, per
[ADR-0015](ADR-0015-read-only-viewers.md), and there is no override editor and no graphical designer.

## Alternatives considered

**A server-rendered UI, no framework.** Fewer dependencies and a real option for U1 alone. Rejected
because the artifact viewers of roadmap P5 require `bpmn-js`, which is a browser library needing a
component host — the stack document already records this. Choosing a non-React path now would mean
rewriting at P5.

**A different framework.** Not evaluated on merit: React is already the approved stack, and
re-opening that would be a change to an approved architecture document rather than a decision this
record is entitled to make.

**Adding a data-fetching or state library** (TanStack Query, Redux). Deferred. This UI is
request/response with almost no cache-coherence problem, and **A4** prefers plain code over a small
surface. A library may be proposed later **as its own dependency decision**.

**A browser test runner** (Playwright, Cypress). **Deliberately not adopted here.** Both download
browser binaries over the network, which conflicts with the deterministic, network-free verification
posture that **A7** and CLAUDE.md §9 require. Adopting one is a separate dependency decision. Until
then, browser behaviour is verified by driving the running application and recording what was seen,
and **all logic that can be tested without a DOM is placed in DOM-free modules and tested under
`node --test`**.

## Consequences

**Positive.** The accepted backend becomes usable by a person. The presentation class stops being
theoretical. The highlight contract is recorded where it can be enforced, not just described.

**Negative.** Three runtime dependencies enter the repository (React, React DOM, Vite as a build
tool). Vite's dev server and `tsc -b` are two build paths over one source tree.

**What this forecloses.** A browser that computes anything the server owns. A client-side
authorisation model. A highlight derived from searching rendered text.

## Enforcement

Mechanical, not cultural. Four architecture-checker rules, each with self-test cases:

| Rule | Refuses |
|---|---|
| `presentation-deps` | any workspace import from `apps/web` other than `@asdp/schemas` |
| `presentation-no-api` | any import of `apps/api` from `apps/web` |
| `presentation-no-domain-rules` | domain-rule symbols appearing in `apps/web` — `evaluateGate`, `freezeBaseline`, `computeConfidence`, `computePrecedence`, `computeFrameCoverage`, `evaluateL1*`, `assertD*`, `allocateD15_requirementId` |
| `presentation-no-text-research` | `indexOf`/`search`/`match` applied to rendered source text in the highlight path, and any import of a text-normalisation helper into it |

The `asdp.class` declaration is checked by the existing `package-classification` rule.
