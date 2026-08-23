# V3 — Multimodal and Structural Source Intake · PROPOSAL

> **Status:** **PROVISIONAL — awaiting approval. Nothing here is implemented.**
> **Version:** 1.0 · **Updated:** 2026-08-23
> **Supersedes:** the one-line V3 entry in [phase-2-plan.md](phase-2-plan.md) §3.5
> **Related:** **A3**, **A7**, **A8**, [ADR-0007](../adr/ADR-0007-epistemic-ladder.md),
> [ADR-0008](../adr/ADR-0008-resolvable-anchors.md),
> [ADR-0011](../adr/ADR-0011-computed-confidence.md),
> [ADR-0020](../adr/ADR-0020-ai-provider-abstraction.md),
> [ADR-0021](../adr/ADR-0021-data-classification-egress-policy.md),
> [ADR-0022](../adr/ADR-0022-capability-negotiation.md),
> [ADR-0031](../adr/ADR-0031-corpus-as-data.md)

---

## 0. What changed, and why this is a revision

The earlier V3 sketch said *"V3 depends on OD-1 … likely blocked regardless of V2-PDF"*. **That was
wrong, and decision A8 corrects it.**

A8 splits one dependency into two:

| | Dependency | State |
|---|---|---|
| **Development / MVP** | An approved live provider for non-sensitive or sanitised evidence | **Resolved.** Claude API, through the AI Provider Abstraction |
| **Enterprise / private deployment** | A private endpoint for classified material | **Still open (OD-1)** — a deployment and governance gate, not a development blocker |

So **V3 is developable now.** What remains gated is *which material may be analysed where*, and the
egress policy already enforces exactly that.

One sequencing fact this proposal does depend on, and it is not a decision: **scanned-PDF vision
needs V2-PDF's rasteriser.** V3 therefore covers **image sources** (screenshots, diagram images) and
**structural model files**. Scanned PDF pages join the same vision path the moment V2-PDF lands, with
no change to anything proposed here — because the `PageRasteriser` port already exists and the vision
path consumes `RasterisedPage`, not "a PDF".

---

## 1. Exact in-scope capabilities

| # | Capability | Notes |
|---|---|---|
| 1 | **Image source intake** — PNG, JPEG, WEBP, GIF, BMP admitted by magic bytes; dimensions read; stored immutably through BlobStore | The guard already recognises all five and refuses them by name; V3 turns refusal into admission |
| 2 | **`PageImage` schema and table** | Also the landing place for V2-PDF's rasterised pages. `sourceId`, `pageNo`, `blobRef`, `width`, `height`, `sha256` |
| 3 | **`VisionExtractor` port**, sitting beside `TextExtractor`, consuming an image and returning **cited** regions | An extractor produces *proposals*, never committed state |
| 4 | **Live Claude adapter transport** (**A8**), behind the existing `AiProvider` port, egress gate, routing and degradation ladder | The adapter, the port, the gate and the ladder all already exist; V3 wires one transport |
| 5 | **`image_region` provenance anchors** with a **new target-verification path** (§3) | The material decision — see **D1** |
| 6 | **Per-source-type confidence ceilings**, enforced as a pure function | See §4 |
| 7 | **Structural BPMN / DMN / Form import, strictly as evidence** | See §5. Deterministic XML parsing, **no AI** |
| 8 | **`L0-ING-007` wired to real vision data**; `L0-ING-003` extended to non-text anchors | The rules exist; V3 gives them real data |
| 9 | **Record/replay fixtures for every AI call**, so verification stays offline (**A7**) | See §6 |
| 10 | **AI-interaction audit**: every vision call recorded with provider, model, capabilities used, degradations, cost, and the classification that was permitted to leave | Feeds the AI-disclosure report later |

### Explicitly OUT of scope for V3

- **Semantic interpretation of diagrams into process structure.** V3 extracts *labelled regions and
  their text*. Turning a diagram into a process model is IR work and would breach
  [ADR-0005](../adr/ADR-0005-ir-first-compilation.md).
- **PDF intake and rasterisation** — V2-PDF, still blocked.
- **Spreadsheet ingestion** — a separate proposed capability.
- **AI requirements-analysis passes, RAF population, structured requirement generation** — V4/V5.
- **Process IR, BPMN/DMN/Form generation** — Phase 3+.
- **Any editing of an imported BPMN/DMN/Form.** Permanently excluded.

---

## 2. Which source types use vision

Vision is used for exactly one reason: **there is no text layer to read.** Everything with a text
layer stays deterministic.

| Source type | Path | AI used? | Why |
|---|---|---|---|
| Free text, Markdown, DOCX | Deterministic extraction (V1/V2) | **No** | A text layer exists and is logical-order |
| **Screenshot** | **Vision** | Yes | Pixels only |
| **Diagram image** | **Vision** | Yes | Pixels only |
| **BPMN / DMN / Form file** | **Deterministic XML parsing** | **No** | A structured model exists. Using AI here would be strictly worse — slower, non-reproducible, and unverifiable |
| Scanned PDF page | Vision, **via V2-PDF's rasteriser** | Yes | Deferred with V2-PDF |
| Digitally-generated PDF | Text-first, per-page fallback (**A3**) | Only on fallback pages | V2-PDF |

**The rule, stated once:** *if a deterministic reader can produce the content, no AI call is made.*
That is not a performance preference — a deterministic reader is reproducible and its output is
verifiable against the stored bytes, and neither is true of a model.

---

## 3. How `image_region` provenance works — and the problem it exposes

### 3.1 The problem

For text, [ADR-0008](../adr/ADR-0008-resolvable-anchors.md) verification is: slice the stored text at
the anchor's offsets, checksum it, compare. That works because the stored text is **ground truth
independent of the extractor**.

**An image has no text layer.** The only "text" available is what the vision model reported. So the
obvious design — store the vision transcript as the source's canonical text and resolve
`image_region` anchors against it — would verify **AI output against AI output**. The checksum would
always match. It would be a green light that means nothing, and it is the single worst outcome
available here, because it *looks* exactly like the guarantee we have for text.

This must not be built.

### 3.2 Proposed design — verify the target, not the transcript

An `image_region` anchor is verified by three checks over things the AI did not produce:

| Check | Verifies |
|---|---|
| **1. The `PageImage` exists** and its stored `sha256` matches the blob | The image being cited is the image that was ingested |
| **2. The `rect` lies within the image's `width`/`height`** | The citation points somewhere that exists |
| **3. `precision` is `page`, never `exact`** | Already mandated by [provenance-and-anchoring.md](../20-domain/provenance-and-anchoring.md) §5: `document`/`page` precision is permitted only for L2/L3 content, **never for L1 evidence** |

The `quote` is still recorded, because a human reviewing the highlight needs to see what the model
claimed to read. But it is recorded as **an AI claim, not a verified fact** — and the resolution
status reflects that honestly:

- a text anchor resolves to `resolved` / `drifted` / `broken`
- an image anchor resolves to a **new, distinct status** meaning *the target is intact and the quote
  is unverified* — **not** `resolved`

That naming matters more than it looks. Reusing `resolved` would make an image citation
indistinguishable from a verified text citation in every downstream report.

### 3.3 What the viewer does

`highlightForAnchor` gains an image path: the highlight is **the stored rectangle over the stored
page image**, exactly as provenance-and-anchoring.md §6 specifies. No text segmentation, no
`counterFlow` — those are text concepts. RTL matters only for the *label*, not the rectangle.

### 3.4 Element anchors get the same treatment

`bpmn_element`, `dmn_rule` and `form_field` anchors have the same shape of problem and the same
solution: verification is **"this element id exists in the stored file, whose checksum matches"**.
Their precision is `exact`, because a parser read a structured model — not a guess.

---

## 4. How confidence ceilings work

Existing machinery, which V3 uses rather than replaces:

- `computeConfidence` ([ADR-0011](../adr/ADR-0011-computed-confidence.md)) already takes
  `anchorPrecision` and weights `page` below `exact`, and already takes `degradations` and
  `providerCapabilityTier`. A vision-sourced item therefore *already* scores lower.
- `requiresHumanConfirmation` and `permittedOnExecutablePath` already exist.

What V3 adds is the **ceiling**, which is a different thing from a score: a cap on the epistemic
level content from a given source type may ever reach, regardless of how confident the model sounds.

| Source type | Ceiling | Consequence |
|---|---|---|
| Deterministic text (text, Markdown, DOCX) | **L1** attainable | A parser read it; it is an extracted fact |
| BPMN / DMN / Form import | **L1** attainable | Same — deterministic parse of a structured model |
| **Screenshot** | **L2** | An interpretation of pixels, never an extracted fact |
| **Diagram image** | **L2**, **plus element-wise human confirmation** | Risk R5: confident wrong extraction from diagrams is a named high risk |
| Scanned page via vision | **L2** | V2-PDF |

**Proposed implementation:** a pure function `ceilingFor(kind, extractionMethod)` in `@asdp/domain`,
**not** a stored column. A stored ceiling can drift from the source it describes and can be edited; a
function over facts already recorded cannot. V5 enforces it when requirements are built; V3's job is
to make it computable and to record the inputs (`extractedBy: 'ai'`, `aiInteractionId`,
`extractionMethod`, anchor precision).

**Diagram images additionally require element-wise confirmation**, which means a diagram's extracted
regions are individually confirmable by a human, and an unconfirmed region cannot support a
requirement. The confirmation *record* is V5's; V3 must make each region individually addressable so
that record has something to point at.

---

## 5. How structural BPMN/DMN/Form input is treated strictly as evidence

This is the part with the highest risk of quietly becoming something else, so the constraints are
stated as absolutes.

| Rule | Enforcement |
|---|---|
| An imported model file is a **`Source`**, with `SourceUnit`s. It is **never** an `ArtifactVersion` | The artifact repository has no ingest path; `mutatesArtifact` is permanently false on every command (invariant I3) |
| It is **never rendered as editable**. The viewer selects an element; it does not offer to change one | [ADR-0015](../adr/ADR-0015-read-only-viewers.md); there is no write endpoint and none is added |
| It is **never a starting point for generation**. Generation reads the IR, and the IR is built from an approved BPS — not from an imported file | [ADR-0005](../adr/ADR-0005-ir-first-compilation.md), [ADR-0001](../adr/ADR-0001-requirements-driven-product-boundary.md) |
| It is **not round-tripped**. ASDP does not re-emit an imported file | No serialiser outside `compiler-*` (checker rule `serialisation-leak`) |
| Element **ids from an imported file are never reused** as generated element ids | Generated ids are minted per [ADR-0024](../adr/ADR-0024-ascii-identifiers-unicode-names.md). Reuse would silently couple a generated artifact to a legacy one |

**What it is for:** an existing BPMN is a *statement about how the process runs today*. It is
evidence a requirement can cite — `"the current process escalates after 48h, per Legacy.bpmn
element Activity_0x9f2"` — and nothing more.

**Units produced:** one per meaningful element — tasks, gateways, events, sequence-flow conditions,
DMN decisions and rules, form fields — carrying the element's id, type and name. Names are often
Arabic, so the same NFC and direction handling applies as everywhere else.

**Parsing approach:** see **D3**. Recommendation is to reuse the V2 XML tokeniser, because evidence
needs ids, types and names — not a semantic model.

---

## 6. Which AI calls are live and which are replayed

**A7 is unchanged and is the controlling rule.**

| Context | AI calls | Enforcement |
|---|---|---|
| `npm run verify`, `npm test`, CI | **NONE.** Every AI interaction is a recorded fixture replayed through `@asdp/eval` | Proposed new checker rule (**D5**) plus the null/replay adapter being the only one wired in tests |
| **Explicitly triggered live evaluation** — a separate script, off by default, requiring an API key and an explicit flag | Live Claude API calls | Never part of pass/fail. A provider outage or a model revision cannot turn the build red |
| Development by a person | Live, at their discretion, subject to egress policy | The egress gate applies identically to development and production — it is not a mode |

**Recording discipline** ([ADR-0031](../adr/ADR-0031-corpus-as-data.md) rules 5–6): every live call
is recorded, recordings inherit their corpus classification, and a recording is what CI replays. The
first live run against a corpus is therefore also the act that makes that corpus testable offline.

---

## 7. What data may leave the environment during development

This is governed, not discretionary. The egress gate built in Phase 1 enforces it **at the transport
boundary**, and Spike S6 already asserted that a `RESTRICTED` payload cannot reach an external
adapter.

| Classification | May reach Claude API in development? |
|---|---|
| `PUBLIC` | Yes |
| `INTERNAL` | Yes |
| `CONFIDENTIAL` | **Only with redaction**, per [data-governance.md](../10-architecture/data-governance.md) |
| `RESTRICTED` | **Never.** Requires a private endpoint — this is OD-1, and it is a deployment gate |
| `PROHIBITED` | **Never leaves under any configuration** |

Additional conditions that hold during V3 development:

- A project with `allowExternalProviders: false` reaches **no external provider**, whatever is
  configured. A fully on-premise project stays on-premise.
- **The classification of a request is the maximum over its content items** — never an average, never
  the classification of the "main" document (ADR-0021 rule 3). An image inherits its source's
  classification and may raise it, never lower it.
- **V3 development uses sanitised or synthetic images only.** Screenshots of real systems commonly
  contain personal data, and a screenshot cannot be redacted by a text rule — the pixels carry it.
  This is the image-specific half of OD-7, and it should be stated to whoever supplies material.
- External providers require **training opt-out**; recordings inherit classification and are stored
  accordingly.

---

## 8. Acceptance criteria

V3 is complete when all twelve hold. Each is a test.

| # | Criterion |
|---|---|
| 1 | **Image intake**: PNG/JPEG/WEBP/GIF/BMP admitted by magic bytes, dimensions read, bytes stored immutably and content-addressed. A corrupt or truncated image is **refused by name**, never partially read |
| 2 | **`PageImage`** persisted with a checksum, and the checksum is **re-verified** on every anchor resolution |
| 3 | **No AI call is made for any source a deterministic reader can handle.** Asserted, not assumed: a test ingests text, Markdown, DOCX and BPMN with a provider that **throws if invoked** |
| 4 | **An image anchor never reports `resolved`.** It reports target-intact-quote-unverified, and a text anchor's status is unreachable for it. This is the criterion that keeps a vision citation distinguishable from a verified one |
| 5 | **Tampering is detected**: replacing the stored image bytes makes every anchor over it fail; a `rect` outside the image bounds is refused at write time |
| 6 | **Ceilings hold**: `ceilingFor` returns L2 for screenshot and diagram_image, L1 for deterministic sources, and a diagram region is individually addressable for confirmation |
| 7 | **Egress**: a `RESTRICTED` image cannot reach an external provider, asserted **at the transport boundary**, on the real vision path. A project with `allowExternalProviders: false` reaches no external provider |
| 8 | **Capability negotiation**: a provider without vision is **refused for a vision task with a named degradation**, never silently downgraded. `L0-ING-007` fires when a source is vision-read |
| 9 | **`npm run verify` makes zero network calls**, with vision exercised entirely through recorded fixtures |
| 10 | **Structural import is evidence only**: BPMN/DMN/Form units are addressable and citable; no command mutates them; no endpoint edits them; no imported element id appears as a generated id |
| 11 | **Arabic**: Arabic element names in an imported BPMN and Arabic labels in a vision result round-trip NFC-exact with correct direction; a diagram's Arabic region highlights over the right rectangle |
| 12 | **AI-interaction audit**: every vision call records provider, model, capabilities used, degradations, cost, and the classification permitted to leave — enough for the disclosure report to be **computed**, not estimated |

---

## 9. Material architecture decisions requiring approval

Five. **D1 is the one that genuinely matters**; the rest are smaller but should not be decided
silently.

### D1 — How non-text anchors are verified · **NEEDS AN ADR**

Extends [ADR-0008](../adr/ADR-0008-resolvable-anchors.md)'s resolution model with **target
verification** for anchors that have no ground-truth text: `image_region`, `bpmn_element`,
`dmn_rule`, `form_field`.

**Proposal:** verify what the AI did not produce — blob checksum, bounds, element existence — and
introduce a **distinct resolution status** for "target intact, quote unverified". Never reuse
`resolved`.

**Why it needs approval:** it is a change to the meaning of anchor resolution, which is the
foundation of the traceability guarantee. The alternative — storing the vision transcript as
canonical text and resolving against it — is **rejected** as a vacuous guarantee, and rejecting it
should be recorded rather than assumed.

### D2 — Live Claude transport: SDK or `fetch` · **Recommendation, low risk**

The adapter exists with an injected transport; V3 supplies one.

| Option | Assessment |
|---|---|
| **Plain `fetch`** *(recommended)* | Built into Node 22. **Zero dependency.** We control retry, timeout and error mapping, all of which the broker already models. The `vendor-sdk-leak` rule stays trivially satisfied |
| `@anthropic-ai/sdk` | Convenient, but a vendor SDK — permitted only under `packages/ai/src/adapters`, and it is a material dependency under **A4** |

Recommending `fetch`: the request shape is small, and the port already normalises everything a vendor
SDK would abstract.

### D3 — BPMN/DMN/Form parsing: reuse the XML tokeniser or add `bpmn-moddle` · **Recommendation**

| Option | Assessment |
|---|---|
| **Reuse the V2 XML tokeniser** *(recommended)* | Zero dependency. Evidence needs element ids, types and names — not a semantic model. The tokeniser is already tested, checks balance, and has no XXE surface |
| `bpmn-moddle` | Permitted in `ingestion` by the checker, and correct if we ever needed a *model*. For evidence it is a dependency bought for capability we deliberately do not want |

The second option would also blur the boundary: a full BPMN model in the intake layer is the first
step toward treating an import as an artifact.

### D4 — Where the epistemic ceiling lives · **Recommendation**

A **pure function** over `(kind, extractionMethod)` in `@asdp/domain`, not a stored column. A stored
ceiling can drift from the source it describes and can be edited; a function over already-recorded
facts cannot.

### D5 — A checker rule forbidding live AI in tests · **Recommendation**

**A7** is currently a convention. Proposed: a rule failing the build if a test file constructs a live
transport or reads an API key. Consistent with how every other load-bearing rule in this project is
held — mechanically, not culturally.

---

## 10. Sequencing and what V3 does *not* unblock

```
V2 (DOCX) ✅ ──▶ V3 (images + structural)        ← this proposal
                      │
V2-PDF ⛔ ────────────┴──▶ scanned-PDF vision     ← same path, needs the rasteriser
```

- V3 does **not** unblock V2-PDF. That still needs the Arabic PDF corpus, spike S2, and ADR-0037.
- V3 does **not** resolve OD-1. Classified material still needs a private endpoint before it can be
  analysed at all — a deployment gate.
- V3 does **not** begin AI requirements analysis. It produces **evidence**, not requirements. RAF
  population is V4/V5, and the boundary matters: V3 answers *"what does this image say?"*, not
  *"what does the business require?"*

**Do not begin V3 until this boundary is approved.**
