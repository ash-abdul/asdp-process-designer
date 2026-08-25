# U2 — Sources: Intake, Inventory, Authority and L0 Validation · ✅ APPROVED · IMPLEMENTED · **ACCEPTED**

> **Status: BOUNDARY APPROVED 2026-08-25 (X1–X10) · IMPLEMENTED · ACCEPTED 2026-08-25.**
> **U2 IS ACCEPTED** — implementation `8f7d37b` (U2-a) + `c93e05b` (U2-b–e), recorded in
> [phase-2-status.md](phase-2-status.md) **§19**. Verified **838/838** tests, exit 0, and **10/10**
> browser tests. Three defects were found and corrected during the slice (§19.1), and two
> non-blocking follow-ups were recorded at acceptance (**F-U2-a**, **F-U2-b** — §19.3).
>
> **Document history, preserved deliberately:** this file was written as a **proposal** and its
> title carried *“⚠️ PROPOSED, NOT APPROVED”*. The body below is the **proposal as written**, still
> phrased as a proposal — *“proposed scope”*, *“recommendation”*, *“approve, amend or reject”* — and
> it is **not rewritten in hindsight**, so what was asked for stays distinguishable from what was
> decided. Only this status block records the decisions. The title label was corrected at
> acceptance, on 2026-08-25, because a document whose own status block said **APPROVED** while its
> heading said **NOT APPROVED** is a defect in the record.
> **X10 approved** — automated browser/E2E testing is introduced **before** U2 implementation, on a
> **pre-provisioned browser that is never downloaded**, recorded in
> **[ADR-0040](../adr/ADR-0040-browser-testing-pinned-browser.md)**.
> **X6 approved** — the U1 role-list defect is corrected as **U2-a, separately and first**, and the
> drift test must assert **equality in both directions** so a *missing* role fails verification as
> surely as an unknown one.
> **X1–X5 and X7–X9 approved as proposed**, including using the existing APIs **without** adding the
> optional `/meta` surface.
> **U3–U5 remain unauthorised**, and each needs its own boundary proposed and approved, per §11 of
> [CLAUDE.md](../../CLAUDE.md). **F-U2-b** additionally asks that a **UI/UX design foundation** be
> approved before U3 — `ui-design-foundation-proposal.md`,
> **PROPOSED / NOT APPROVED**.
> **Version:** 0.1 · **Written:** 2026-08-25 · **Against commit:** `63bbe47`
> **Within:** the approved UI enablement boundary —
> [ui-enablement-proposal.md](ui-enablement-proposal.md) §15.1, slice **U2**
> **Follows:** **U1, ACCEPTED** 2026-08-25 (`d4785c1`), [phase-2-status.md](phase-2-status.md) §18
> **Related:** [ADR-0039](../adr/ADR-0039-react-presentation-layer.md),
> [ADR-0021](../adr/ADR-0021-data-classification-egress-policy.md),
> [ADR-0012](../adr/ADR-0012-deterministic-conflict-precedence.md),
> [ADR-0026](../adr/ADR-0026-static-validation-first.md)

---

## 1. What U2 adds to the journey

U1 made an existing document readable. **U2 is the first slice in which the user puts something
into the system**, and the first that writes at all.

> **Before U2:** sources arrive by `curl`. The UI shows what is already there.
> **After U2:** an analyst uploads a document, sees it parsed, ranks its authority, and reads what
> L0 validation says about the project's evidence — then opens it in the U1 viewer.

Three capabilities, in the order a person uses them:

| | Capability | Why it is in U2 rather than later |
|---|---|---|
| **1** | **Ingest a document** — text or file, with kind and classification | Without it nothing can be demonstrated end to end without a terminal |
| **2** | **Authority ranking** | **ADR-0012** makes conflict precedence deterministic *from the human-set authority ranking*. Ranking is a **human judgement the system cannot infer**, and every later slice's conflict resolution depends on it having been made |
| **3** | **L0 intake validation** | `L0-ING-*` findings **block G1 structurally**. A reviewer who discovers them at the gate has already wasted the work |

**U2 stays inside the sources domain.** It does not touch evidence extraction, requirements,
coverage, reconciliation or G1 — those are U3–U5.

---

## 2. Proposed scope — **X1**

### 2.1 In scope

| Screen | Change |
|---|---|
| **S3 — Sources** *(new)* | Inventory as a real screen: filename, kind, classification, direction, status, authority rank, size, and **parse errors surfaced by name**. Ordered by authority rank descending, as the API returns it |
| **S3 — upload** | Paste text **or** choose a file. `kind` and `classification` selected explicitly. **Deduplication reported, never hidden** — identical bytes are one source, and the user is told so |
| **S3 — authority** | Set and change a rank, **with the justification the API accepts**. `unranked` is shown as a distinct state, not as rank 0 |
| **S3 — validation** | Run intake validation; render findings by `ruleId` and severity, with **blocking findings distinguished from warnings and info**; link each finding to its source |
| **S2 — shell** | The source list becomes navigable from the shell rather than a pane bolted to the viewer |
| **Role list** | **Completed to all ten roles** — see §5.2, which is a defect U2 must fix |

### 2.2 Out of scope — **X2**

| Out | Belongs to |
|---|---|
| Evidence extraction, `PROFILE_SOURCE`, `POPULATE_FRAME` | **U3+**. They are AI-invoking, and U2 must not be the slice that quietly starts calling models |
| Requirements, coverage, reconciliation, G1 | U3, U4, U5 |
| **Image and PDF sources** | Images: the API accepts them, but rendering an `image_region` highlight is a viewer capability U1 deliberately excluded. **PDF: V2-PDF is blocked** |
| Source supersession (`supersedesSourceId`) | Accepted by the API; **no UI**, because supersession without a diff view invites mistakes |
| Multipart upload | See **G-d**, §4 |
| **Anything in P3, P4, P5** | Unchanged from the parent boundary |

---

## 3. APIs used — **X3**

**Every one already exists.** U2 adds no capability the backend lacks.

| Purpose | Route | Method |
|---|---|---|
| Inventory | `/projects/:p/sources` | `GET` |
| One source | `/projects/:p/sources/:s` | `GET` |
| Ingest | `/projects/:p/sources` | `POST` — `{ filename, text }` **or** `{ filename, contentBase64 }`, plus optional `kind`, `classification`, `authorityRank`, `effectiveDate` |
| Authority | `/projects/:p/sources/:s/authority` | `PUT` — `{ authorityRank, justification? }` |
| Validate | `/projects/:p/intake/validate` | `POST` → `{ runId, findings, summary }` |
| Rule catalogue | `/projects/:p/intake/rules` | `GET` — so findings render **with their catalogued meaning**, not just an id |
| Viewer hand-off | `…/content`, `…/units`, `…/highlights` | `GET` — **unchanged from U1** |

**The inventory response already carries what the screen needs**: `total`, `unranked`,
`parseFailed`, and `sources` ordered by rank.

---

## 4. API gaps — **X4**

> **U2 needs no new route.** One optional gap is identified and **recommended against**.

| # | Gap | Assessment |
|---|---|---|
| **G-d** | **`GET /meta` does not expose `maxSourceBytes`.** The UI cannot tell a user the size limit before they choose a 12 MB file; it can only let the upload be refused | **Recommend NOT filling it.** The server refuses by name with a clear message and U2 renders that honestly. Adding a limits endpoint to save one round trip is a convenience, and **A4** prefers not adding surface for convenience. Revisit if real use shows it matters |
| **G-a**, **G-b** | Approved at the parent boundary | **Still not needed.** U2 touches neither flags nor canonical entities. They belong to **U4** and **U5** |

**Base64, not multipart.** `POST /sources` accepts `contentBase64`, and the config already sets the
JSON body limit above the source limit *because base64 inflates*. A 10 MB file becomes ~13.3 MB of
JSON, which the existing limits accommodate. **Adding a multipart route to save that overhead is a
backend change U2 does not need**, and is noted here only so the choice is visible rather than
implicit.

---

## 5. Roles and permissions — **X5**

### 5.1 What the API requires

| Command | Required roles |
|---|---|
| `ingestSource` | **`Contributor`**, `BusinessAnalyst`, `ProcessArchitect` |
| `setSourceAuthorityRank` | `BusinessAnalyst`, `ProcessArchitect` |
| `validateIntake` | `Viewer`, `Contributor`, `BusinessAnalyst`, `ProcessArchitect`, and others |

**Authority ranking is deliberately narrower than ingest.** A `Contributor` may add evidence and may
**not** decide how authoritative it is — which is exactly right, because **ADR-0012** derives
conflict precedence from that ranking, and it is a governance judgement rather than a clerical one.
**The UI must reflect that difference and must not blur it.**

### 5.2 A defect U1 left, which U2 must fix — **X6**

**`Role` in `@asdp/schemas` defines TEN roles. U1's `ROLES` constant lists FIVE.**

Missing: `Contributor`, `TechnicalApprover`, `CamundaDeveloper`, `TestDesigner`,
`ComplianceReviewer`.

This bites immediately in U2: **`ingestSource` permits `Contributor`, and a Contributor cannot sign
in through the UI at all.**

**U1's drift test did not catch it, and that is the more important half of the finding.** It asserts
*every role the UI names is a role the API defines* — true, because five is a subset of ten. It never
asserted the converse. **A one-directional drift test is a test that catches half the drift**, and
this is the half it missed.

**Proposed:** complete the list from `Role`, and **strengthen the drift test to assert set equality
in both directions.**

### 5.3 Affordances remain a courtesy

Unchanged from **ADR-0039** §4: the UI disables what a role cannot do and **names the missing role**.
**The API refuses regardless**, and an acceptance test asserts a disabled affordance still returns
**403** when invoked directly.

---

## 6. What U2 must get right — **X7**

Four behaviours where a plausible-looking UI would be wrong:

1. **Deduplication is reported, not hidden.** `POST /sources` returns `deduplicated: true` and the
   **existing** source's id when identical bytes are re-ingested. A UI that silently shows "uploaded"
   would tell the user they added something they did not. It must say *"identical to an existing
   source"* and link to it.
2. **A parse failure is a state, not an error.** `status: 'parse_failed'` with `parseError` is a
   **successfully recorded** source that could not be parsed. It stays in the inventory, visibly, with
   its reason — it is evidence that something was tried.
3. **`unranked` is not rank 0.** The inventory reports `unranked` separately because rank 0 means
   *"nobody has decided"*, not *"lowest authority"*. Rendering them identically would make an
   undecided judgement look like a decided one — the same class of error as ADR-0038's
   `content_unverified` versus `resolved`.
4. **Severity is the rule catalogue's, never the UI's.** `L0-ING-*` severities come from
   `GET /intake/rules` and **ADR-0026**. The UI must not re-colour a warning as an error because it
   looks serious.

---

## 7. Acceptance criteria — **X8**

| # | Criterion |
|---|---|
| **1** | **A person can upload a document in a browser and see it in the inventory**, without curl |
| **2** | Both paths work: pasted text **and** a chosen file via base64 |
| **3** | **Re-uploading identical bytes reports deduplication** and links to the existing source; it never reads as a new upload |
| **4** | A refused upload — too large, unsupported type, undecodable — renders **the server's reason**, by name |
| **5** | A `parse_failed` source appears in the inventory with its `parseError`, and is not hidden |
| **6** | Authority rank can be set and changed with a justification; **`unranked` renders distinctly from rank 0**; the inventory reorders |
| **7** | Intake validation renders **every** finding with `ruleId`, catalogued description and severity, **blocking distinguished from warning and info** |
| **8** | A `Contributor` can sign in, **can** upload, and **cannot** set authority rank — the control disabled, the missing role named, **and the API returns 403 when called directly** |
| **9** | Every action is **keyboard-reachable**; findings and refusals are announced through a live region |
| **10** | An **Arabic-named, RTL** document uploads, lists and opens correctly, and its name renders in its own direction |
| **11** | Opening any source from the inventory reaches the **U1 viewer with highlights intact** — no regression |
| **12** | **No business rule is duplicated in the browser**; `npm run verify` stays green and **backend test counts are unchanged** |

---

## 8. Required tests — **X9**

| Layer | Coverage |
|---|---|
| **Unit** | Base64 encoding of a chosen file including **non-ASCII filenames**; the upload-form state machine (idle → sending → deduplicated / created / refused); finding grouping by severity; rank validation and the unranked/rank-0 distinction; refusal-to-message mapping for each documented failure |
| **Drift** | **Role set equality in BOTH directions** (§5.2). Plus: every command the UI names exists in `COMMANDS`, and every **role** `COMMANDS` requires for a U2 command is selectable in the UI |
| **Integration** | The typed client against recorded fixtures for each route, validated with `@asdp/schemas`, including the **`deduplicated: true`** response and a **`parse_failed`** source |
| **Browser** | See **X10** below |
| **Accessibility** | Automated axe pass on S3; manual keyboard traversal of upload → rank → validate |
| **Architecture** | The four ADR-0039 rules continue to pass; **no new exemption** |

### 8.1 The browser-testing decision comes due — **X10**

**F-U1-a** ([phase-2-status.md](phase-2-status.md) §18.1) says an automated browser/E2E framework
must be decided **before the UI reaches workflows where browser-level interaction is material**.

**U2 is arguably that point and U3 certainly is.** U1 was read-only, so driving it by hand and
recording what was seen was adequate. **U2 writes.** A regression in the upload form is a regression
that puts the wrong thing in the database.

Two honest options:

| | Option | Assessment |
|---|---|---|
| **X10-A** | **Decide the framework now, before U2 is built** | Cleanest. It is a dependency decision under **A4**, and ADR-0039 already records why none was adopted: Playwright and Cypress download browser binaries over the network, against **A7**'s deterministic posture. That objection needs answering — most likely by a pinned, pre-provisioned browser and a CI step that never fetches at test time |
| **X10-B** | **Build U2 with the U1 approach**, and decide before U3 | Acceptable **only if** the state machine and refusal mapping stay DOM-free and unit-tested, so what is untested by CI is the rendering and not the logic |

**Recommendation: X10-A.** U2 is the first writing slice, and deferring is easier to justify now and
harder to justify at every point after.

---

## 9. Slice shape and sequence

| Step | Delivers |
|---|---|
| **U2-a** | Role list completed; drift test made bidirectional (§5.2). Small, and it unblocks a `Contributor` signing in |
| **U2-b** | S3 inventory as a real screen: kinds, classifications, statuses, parse errors, rank ordering |
| **U2-c** | Upload — text and file — with deduplication and refusals rendered honestly |
| **U2-d** | Authority ranking with justification, and the unranked distinction |
| **U2-e** | Intake validation against the rule catalogue, with severity from **ADR-0026** |

**U2-a is worth doing first and separately**: it is a correction to an accepted slice, and merging it
into a feature commit would bury it.

---

## 10. Is an ADR required?

**No.** [ADR-0039](../adr/ADR-0039-react-presentation-layer.md) already governs the presentation
layer, and U2 adds no new architectural relationship — same package, same import rules, same
authorisation posture, no new backend surface.

**Unless X10-A is approved**, in which case adopting a browser test runner is a **dependency
decision under A4** and should be recorded as its own ADR, exactly as React was in ADR-0039.

---

## 11. Status and what happens next

**PROPOSED. NOT APPROVED. NOT IMPLEMENTED.**

1. **Approve, amend or reject X1–X10** — in particular **X10** (browser testing, now due) and **X6**
   (the role-list defect and the one-directional drift test).
2. On approval, this document's status changes and **U2 only** begins.
3. **U3–U5 remain unauthorised.**
4. **H3 and live AI remain blocked.** U2 invokes no model, by scope.
5. **P3 must not begin.**
