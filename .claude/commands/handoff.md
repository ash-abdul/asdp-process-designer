---
description: Close a session safely — make the repository the handoff, then emit the prompt to resume in a new session.
---

# `/handoff` — end this session so the next one needs no memory of it

Run this **before disconnecting**. Its job is not to summarise the conversation.
Its job is to make **the repository** true, so the next session can start from
nothing but `git` and `docs/`.

> **The governing idea:** a conversation is not a record. §0.0 of
> [phase-2-status.md](../../docs/60-plan/phase-2-status.md) is, and this command
> exists to leave it accurate.

---

## Step 1 — Establish the truth. Do not assume any of it.

Run these and read the output. **Never carry a number over from earlier in the
conversation** — re-measure it.

```bash
git status --short && git log --oneline -8
git rev-parse HEAD && git ls-remote origin main
```

`git ls-remote`, **not** the local tracking ref: the tracking ref is only as
fresh as the last fetch, and "up to date with origin/main" can be a lie.

```bash
npm run verify
```

Capture the **exact** figures: tests, suites, pass/fail/skipped/todo,
`check:arch` source-file count, `check:arch:selftest` cases, `check:docs`
files/links, and the exit code.

**`npm run test:e2e` is separate.** If it was run this session, record the count.
If it was not, **say it was not** — never quote a stale browser figure. It needs
ports 3000 and 5173 free.

---

## Step 2 — Make §0.0 true

Update **[docs/60-plan/phase-2-status.md](../../docs/60-plan/phase-2-status.md)
§0.0** so a reader with no context is not misled. Every row must be re-checked,
not assumed:

- **Where things stand** — HEAD, working tree, remote, what is in progress.
- **What is ACCEPTED** — and only what an explicit decision accepted. **A green
  run is never acceptance.**
- **What has NOT started, and must not be started implicitly.**
- **THE EXACT NEXT PERMITTED ACTION** — one action, named, with what it must not
  roll into.
- **Unresolved limitations and standing constraints.**
- **Verification** — the figures from Step 1, with the commands to reproduce them.

Also update the header status line, the version number, `§0`'s *Current slice*,
and `§15`'s heading if the slice state changed.

### The trap this command exists to remember

**The "HEAD at handoff" cell has been wrong twice**, for a structural reason: the
commit that updates it is written *before* that commit exists, so it is one
behind the moment it lands. Either write the pre-commit HEAD and say the handoff
commit follows it, or point the reader at `git log` and list the slice's commits
by hash — those do not go stale.

### Two rules from CLAUDE.md that bind this step

- **§10** — never present reconstructed information as authoritative. If a
  decision cannot be recovered from an ADR, a commit or a specification, label it
  **Provisional** or say it is unrecoverable and **ask**. An invented detail that
  reads as settled is worse than an acknowledged gap.
- **Correct stale sentences in place, with the reason** — do not silently delete
  them. The sequence has to stay legible.

---

## Step 3 — Make the work durable

| Tree state | Do this |
|---|---|
| **Dirty** | List every modified and untracked path with a one-line description of what it is. Then **ask** whether to commit. **Never commit without explicit authorisation** |
| **Clean, ahead of origin** | Report how many commits are unpushed and **ask** whether to push |
| **Clean, equal to origin** | Say so, and confirm it against `git ls-remote` |

Uncommitted work survives a disconnect on disk but is invisible to a fresh
session reading `git log` — say that plainly if the tree is dirty.

---

## Step 4 — Emit the resume prompt

Give a **copyable block** the user can paste into the next session. It must be
self-contained and must not reference this conversation. Shape:

```
Resume work on the ASDP Process Designer repository at /Users/akotb/my-app.

Read CLAUDE.md, then docs/60-plan/phase-2-status.md §0.0 — the fresh-session
handoff — and treat the repository as the only source of truth. Do not rely on
any prior conversation.

Confirm from the repository itself: current HEAD, that the working tree is
clean, and that local main equals origin/main (use `git ls-remote origin main`,
not the local tracking ref). Confirm that <the accepted items> are accepted.

Run `npm run verify` and report the result.

Then tell me the exact next permitted action and any blocker, per §0.0.

Do not start <the next action> until I approve it explicitly, even though §0.0
names it as next. Do not implement <the unauthorised list>. Do not make any
live AI/provider call. Do not modify code or documentation. Report and stop.
```

Fill the placeholders from Step 1 and Step 2 — **never from memory**.

---

## Step 5 — Say what will NOT survive

Be explicit, because these look durable and are not:

- **The scratchpad** — fixture seeds, screenshot scripts, capture output. Say
  what was there and whether it needs rebuilding. Some of it is *deliberately*
  outside the repository (anything that must never become product behaviour);
  say which, and why it stays out.
- **Running servers and temp databases** — stop anything on ports 3000 and 5173,
  and say that development data in `.asdp-dev/` or a temp dir is not part of the
  handoff.
- **Screenshots and any visual-review evidence** delivered in-conversation.

---

## What this command must never do

- **Never commit or push without explicit authorisation in this session.**
- **Never start, continue or "just finish" a slice.** §11 of
  [CLAUDE.md](../../CLAUDE.md) governs; this command closes a session, it does
  not advance work.
- **Never make a live AI or provider call**, and never quote a model-quality
  figure. **No live model has ever been called in this repository.**
- **Never soften a blocker or an open limitation** to make the handoff read
  cleanly. The unresolved items are the most valuable part of it.
- **Never report a test figure that was not measured in this session.**
