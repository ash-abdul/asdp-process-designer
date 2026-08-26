---
description: Start a session — re-establish state from the repository alone, then report the exact next permitted action and stop.
---

# `/resume` — pick the project up from the repository, not from memory

Run this **first** in a new session. It is the mirror of
[`/handoff`](handoff.md): that one leaves the repository true, this one reads it
back and refuses to act on anything else.

> **Treat the repository as the only source of truth.** Any recollection,
> summary or context that disagrees with `git` and `docs/` is wrong. If you were
> handed a prompt describing the state, **verify every claim in it** — do not
> accept it.

---

## Step 1 — Read the governing documents, in this order

1. **[CLAUDE.md](../../CLAUDE.md)** — the operating instructions. **§11 governs
   whether you may start anything at all**, and the answer is usually no.
2. **[docs/60-plan/phase-2-status.md](../../docs/60-plan/phase-2-status.md) §0.0**
   — the fresh-session handoff. Then §0.
3. Whatever §0.0's *"Where to read next"* points at.

---

## Step 2 — Verify the state. Do not take §0.0's word for it.

§0.0 is written by the previous session and **can be stale** — its HEAD cell has
been one commit behind more than once, structurally. Re-measure:

```bash
git status --short && git log --oneline -8
git rev-parse HEAD && git ls-remote origin main
```

`git ls-remote`, **not** the local tracking ref.

```bash
npm run verify
```

Do **not** run `npm run test:e2e` unless asked — it needs ports 3000 and 5173
free and starts its own servers.

**Report each of these as measured, not as quoted:**

- current HEAD, and whether it matches what §0.0 claims;
- whether the working tree is clean, and if not, exactly what is uncommitted;
- whether local `main` equals `origin/main`, verified against the remote;
- the `verify` result with its exact figures and exit code.

**If anything disagrees with §0.0, say so explicitly and treat the repository as
correct.** A stale handoff is a finding worth reporting, not a nuisance to
smooth over.

---

## Step 3 — Report, and stop

State plainly:

- **What is accepted** — traceable to a commit or an explicit decision on the
  record. Nothing else counts as accepted.
- **What is in progress**, if anything, and whether it is committed.
- **THE EXACT NEXT PERMITTED ACTION**, quoted from §0.0 — one action.
- **Every blocker and open limitation** that bears on it.

Then **stop**. Do not begin the next action, however obvious it looks. §11:
explicit approval is required before beginning any phase or slice, a provisional
slice needs its **scope** approved rather than just a go-ahead, and *"if the next
step seems obvious, propose it and wait."*

---

## The standing constraints, restated because they are the easiest to lose

- **NO LIVE MODEL HAS EVER BEEN CALLED, in any slice.** Every evaluation figure
  in this repository is a synthetic corpus against an authored stub. Never quote
  one as a model-quality result, and never make a provider call — **H3 /
  limitation 62** blocks it from anywhere, including the UI.
- **`apps/web` contains no AI-invoking control** (**Z2-B**), and **Ask ASDP is an
  inert shell** with no fetch, no client and no stub answer. Keep it that way.
- **A green run is not acceptance.** Acceptance is always a separate, explicit
  decision.
- **Never weaken a checker rule or a test assertion** to make a change pass. A
  failing test is information: either the code is wrong or the test is wrong —
  determine which, and say which.
- **F-U1-b stands permanently:** development header authentication is
  localhost-only and is never the production solution.

---

## What this command must never do

- **Never start the next slice**, even when §0.0 names it and the path is clear.
- **Never commit or push.**
- **Never modify code or documentation** — `/resume` reads and reports.
- **Never report a figure it did not measure this session.**
