# ADR-0040: Browser Testing on a Pre-Provisioned Browser, Never a Downloaded One

> **Status:** **Approved** · **Date:** 2026-08-25 · **Reversibility:** Easy
> **Correction:** 2026-08-25 — the **Enforcement** section described mechanisms that are not the
> ones actually in force. **The decision is unchanged**; only the account of how it is enforced is
> corrected, and the original wording is quoted where it was wrong so the error stays legible.
> **Related:** [ADR-0039](ADR-0039-react-presentation-layer.md) — which deferred this decision and
> recorded why, [ADR-0036](ADR-0036-build-toolchain.md),
> [phase-2-plan.md](../60-plan/phase-2-plan.md) §4 decision **A7**,
> [phase-2-status.md](../60-plan/phase-2-status.md) §18.1 **F-U1-a**,
> [u2-proposal.md](../60-plan/u2-proposal.md) **X10**

## Context

[ADR-0039](ADR-0039-react-presentation-layer.md) deliberately did **not** adopt a browser test
runner, and recorded the reason: Playwright and Cypress download browser binaries over the network,
which conflicts with the deterministic, network-free verification posture that decision **A7** and
CLAUDE.md §9 require. U1's browser behaviour was therefore verified by driving the running
application and recording what was observed — reproducible by a person, **not by CI**.

That was adequate for U1, which is **read-only**. It stops being adequate at **U2**, which is the
first slice that **writes**: a regression in an upload form does not merely look wrong, it puts the
wrong thing in the database. Follow-up **F-U1-a**, recorded at U1's acceptance, made deciding this a
precondition of reaching such a workflow.

The objection in ADR-0039 was never to browser testing. It was to a test suite that **fetches a
browser**. A downloaded-at-test-time browser makes the build depend on a CDN, makes a green run
depend on a network, and makes the version under test a moving target — three properties this
repository has consistently refused, from pinned dependencies to replay fixtures to *"no live AI call
in verification"*.

## Decision

**Browser tests run against a browser that is already on the machine. The test run never downloads
one, and fails loudly rather than fetching.**

### 1. Playwright, pinned, and installing it cannot fetch a browser

`@playwright/test` is pinned exactly, as a **development** dependency.

**Installing the dependency does not fetch a browser either** — not merely the test run. The
*reason* is corrected here (2026-08-25): the pinned packages `@playwright/test`, `playwright` and
`playwright-core` **carry no install script at all** — `hasInstallScript` is false for each of them
in `package-lock.json`, and their published `package.json` files declare no `scripts`. **`npm ci`
therefore has no hook from which to download anything.** The guarantee is structural, not
conventional.

The original text of this clause read *“It is installed with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`”*.
That variable **was** used at the original install, belt-and-braces, but it is **not** what enforces
the property and it is **not recorded anywhere in this repository**. See **Enforcement** below and
follow-up **F-U2-a** in [phase-2-status.md](../60-plan/phase-2-status.md) §19.3.

### 2. The browser is the system's, addressed by channel

Tests use Playwright's `channel: 'chrome'`, which drives the **already-installed Google Chrome**.
Nothing is downloaded at any point: not at install, not at first run, not at test time.

This is a stronger guarantee than pre-provisioning a Playwright-managed browser, which still leaves a
provisioning step that fetches. Here there is no such step.

### 3. A missing browser is a REFUSAL with instructions, never a download

A preflight check runs before the suite. If no usable browser is present it **fails with the reason
and what to do about it**. It must never fall back to fetching one, and no flag may be added that
lets it.

### 4. Browser tests are a SEPARATE, EXPLICITLY INVOKED capability

`npm run verify` is unchanged: build → `check:arch` → `check:arch:selftest` → `check:docs` → `test`.
It remains **deterministic, network-free and server-free**, and its test counts stay comparable
across slices.

Browser tests run under `npm run test:e2e`, which starts the API and the web server, runs the suite,
and stops them. This mirrors how **A7** already treats live AI evaluation: a real capability, invoked
on purpose, never able to turn the ordinary build red.

### 5. What browser tests are FOR, and what they are not

**For:** the user journeys and the refusal paths — that a document uploads, that a duplicate is
reported as a duplicate, that a refused upload shows the server's reason, that a role without
permission sees a disabled control **and gets a 403 if it calls anyway**.

**Not for:** logic that can be tested without a DOM. Everything carrying a rule stays in a DOM-free
module tested under `node --test`, and that is not relaxed because a browser is now available. A
browser test that fails should mean *the wiring is wrong*, not *the arithmetic is wrong*.

## Alternatives considered

**Playwright-managed browsers, pre-provisioned.** The option X10 proposed. Rejected in favour of
`channel: 'chrome'` because it still requires a fetching provisioning step; using the system browser
removes the fetch entirely.

**Cypress.** Same download objection, a heavier runtime, and no advantage here.

**jsdom.** No real layout and **no bidirectional text rendering** — which is precisely what these
tests exist to check. It would give confidence about the thing least in doubt.

**Continue without browser tests.** Rejected by F-U1-a, and by the fact that U2 writes.

## Consequences

**Positive.** The material journeys become CI-checkable. `verify` keeps its properties exactly. No
new network dependency of any kind.

**Negative.** Browser tests depend on a browser this repository does not control, so a Chrome upgrade
can change behaviour under the suite. That is the price of not fetching one, and it is visible: the
preflight reports the browser version it found.

**What this forecloses.** A verification path that downloads anything. A green build that depends on
a CDN being reachable.

## Enforcement

> **Corrected 2026-08-25.** The first bullet of this section previously read: *“`PLAYWRIGHT_SKIP_
> BROWSER_DOWNLOAD=1` is recorded in the dependency manifest and in the E2E script.”* **That was not
> true.** The variable appears **nowhere in this repository** — not in the `test:e2e` script, not in
> the preflight, and there is no `.npmrc`; nor does a dependency-manifest **file** exist (**A4**'s
> manifest control has only ever been satisfied by prose in the status document). The **decision and
> the property both hold** — verified by execution — but they are enforced by the four mechanisms
> below, which is what this section now states. Recorded as **F-U2-a**
> ([phase-2-status.md](../60-plan/phase-2-status.md) §19.3): a stated enforcement that nothing
> implements is indistinguishable from one that works, until the thing it claims to prevent happens.

What actually enforces *“nothing is downloaded”*, strongest first:

1. **The pinned Playwright packages carry no install script.** `hasInstallScript` is false for
   `@playwright/test`, `playwright` and `playwright-core` in `package-lock.json`. A fresh `npm ci`
   has no hook from which to fetch a browser. **This is the load-bearing mechanism**, and it is
   structural — it does not depend on an environment variable being remembered.
2. **`channel: 'chrome'` addresses the system browser.** There is no Playwright-managed browser to
   provision, so there is nothing to fetch at run time either.
3. **The preflight refuses rather than fetches**, and its failure names the fix. It must never gain
   a fallback that downloads, and no flag may be added that lets it.
4. **`npm run verify` does not invoke `test:e2e`**, so browser availability can never gate the
   ordinary build.

**Verified by execution, 2026-08-25:** the suite passes 10/10 on a machine with **no**
`~/Library/Caches/ms-playwright` browser cache at all, and the preflight reports the system Chrome
it found.

**The watch item, recorded rather than assumed away.** Mechanism 1 is a property of the *pinned
version*, not a policy. If a future Playwright upgrade reintroduces a browser-downloading install
script, the structural guarantee disappears and the environment-variable route becomes
load-bearing — at which point it must be **recorded in the repository** (an `.npmrc` entry, or the
`test:e2e` script itself), not in prose. **Check this at every Playwright version bump.** Mechanisms
2, 3 and 4 are unaffected by any upgrade.
