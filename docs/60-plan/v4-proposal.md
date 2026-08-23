# V4 — AI Analysis Passes · APPROVED BOUNDARY (V4a) and PROPOSED SEQUEL (V4b)

> **Status:** **V4a APPROVED 2026-08-23 and IMPLEMENTED** — delivered state in
> [phase-2-status.md](phase-2-status.md) §6, awaiting review. **V4b approved in shape, not in
> detail** — it does not begin until V4a is reviewed and accepted, and one recorded conflict (§6)
> must be resolved first.
> **Version:** 1.0 · **Updated:** 2026-08-23
> **Related:** [phase-2-plan.md](phase-2-plan.md) §3.8, [phase-2-status.md](phase-2-status.md) §0,
> [roadmap.md](roadmap.md) P2, [ai-provider-abstraction.md](../10-architecture/ai-provider-abstraction.md),
> [ai-evaluation-framework.md](../40-quality/ai-evaluation-framework.md),
> [ADR-0004](../adr/ADR-0004-ai-proposes-code-commits.md),
> [ADR-0007](../adr/ADR-0007-epistemic-ladder.md),
> [ADR-0011](../adr/ADR-0011-computed-confidence.md),
> [ADR-0020](../adr/ADR-0020-ai-provider-abstraction.md),
> [ADR-0021](../adr/ADR-0021-data-classification-egress-policy.md),
> [ADR-0022](../adr/ADR-0022-capability-negotiation.md),
> [ADR-0031](../adr/ADR-0031-corpus-as-data.md), **A7**, **A8**, **D6**

---

## 0. Why V4 is split

V4 is the first slice in which **AI actually reads a document in this product**. Five of the
register's high or critical risks land in it — R2 (rubber-stamp approval), R5 (confident wrong
extraction), R7 (provider leak), R8 (silent degradation), R9 (egress gap).

The split separates the part that is mostly plumbing from the part where epistemic decisions bite:

| Slice | Character | State |
|---|---|---|
| **V4a — AI Broker and Live-Path Foundation** | Wiring, persistence, one low-stakes pass, the governed live path, the first fixtures, the evaluation baseline | **APPROVED and IMPLEMENTED** — [phase-2-status.md](phase-2-status.md) §6 |
| **V4b — AI Evidence Extraction** | `EXTRACT_EVIDENCE`, post-hoc citation verification, provenance enforcement, confidence propagation | **Approved in shape only.** Needs V4a accepted, and §6 resolved |

V4a deliberately **makes no substantive requirements claim**. Its acceptance proves the *chain*, not
the *content*: source → broker → governed provider (live or replay) → structured response →
`ai_interaction` audit → deterministic replay.

It also discharges **D6**, the three items deferred from V3.

---

## 1. V4a — approved scope

| # | Item | Discharges |
|---|---|---|
| 1 | **Wire the real broker consumer** through the existing AI Provider Abstraction — for text and for the V3 vision path, which today reaches `createBrokerVisionExtractor` from nowhere | **D6 item 4**; limitation 41 |
| 2 | **`PROFILE_SOURCE`** as the first low-risk end-to-end pass | roadmap P2 |
| 3 | **`ai_interaction` persistence** — provider, model, capabilities used, prompt/template version, source classification, egress decision, degradation state, token and cost information where available, timestamps, correlation identifiers | **D6 item 10**; limitation 42; invariant I8 |
| 4 | **The explicitly invoked live-provider path.** `npm run verify`, automated tests and CI **must never** invoke a live provider | **A7**, **A8**; ADR-0031 rule 5 |
| 5 | **The first deterministic recorded/replay fixtures** through `@asdp/eval` | **D6 item 9**; limitation 32 |
| 6 | **Cost, prompt version and degradation metadata on every interaction** | ADR-0011, ADR-0022 |
| 7 | **All approved egress controls preserved** | ADR-0021, **A8** condition 4 |
| 8 | **An initial evaluation baseline** for the passes V4a implements — **E5** | ADR-0031; ai-evaluation-framework.md |

### Explicitly out of scope for V4a

`EXTRACT_EVIDENCE` · post-hoc citation verification · RAF population / `POPULATE_FRAME` · structured
business requirements · `RECONCILE_SOURCES` · conflict precedence · clarification-question generation ·
G1 · Process IR · BPMN/DMN/Form generation · PDF · spreadsheets · the **H1/H2** hardening candidates
([phase-2-status.md](phase-2-status.md) §5.12).

**`PROFILE_SOURCE` output is commentary about a document, not a claim about requirements.** What kind
of document this appears to be, in what languages, with what structural features. A profile never
becomes evidence, never populates a slot, and never supports a requirement.

---

## 2. Approved decisions E1–E5

All five were **approved 2026-08-23**. They are recorded here and in
[phase-2-plan.md](phase-2-plan.md) §3.8, not left to the implementation.

### E1 — Live AI data

Live external-provider calls in V4 development may use **only**:

- **synthetic** evidence
- **sanitised** evidence
- **`PUBLIC` / `INTERNAL`** evidence where policy permits

**`CONFIDENTIAL`, `RESTRICTED` and `PROHIBITED` source material must not be sent to an external
provider merely for development.** A real enterprise or private-endpoint decision remains a
deployment and data-governance matter (**OD-1**).

This is **stricter than** [ADR-0021](../adr/ADR-0021-data-classification-egress-policy.md), not a
variation of it: the production policy already refuses `RESTRICTED` and above at the transport
boundary, and E1 lowers the development ceiling further, to `INTERNAL`. Enforced at the same
boundary, as a configured ceiling rather than a reviewer's discretion.

### E2 — Multi-match quotes

**Reject** an ambiguous multi-match citation unless a deterministic locating hint, or equivalent
source information, uniquely identifies the intended occurrence.

- **Never silently select one occurrence.**
- **Never weaken provenance integrity to raise extraction recall.**

**This applies from V4b.** V4a locates no quotes. See §6 — E2 as approved is *stricter* than
provenance-and-anchoring.md §4.2, which currently specifies precision demotion for this case, and the
two must be reconciled before V4b begins.

### E3 — AI-extracted evidence

An AI-extracted `EvidenceItem` may be persisted **automatically** only when all three hold:

1. its output validates against the required schema
2. its source anchor can be **independently verified**
3. provenance rules pass

And, unconditionally:

> **Persisted AI evidence remains explicitly AI-derived evidence.** It must **not** automatically
> become an approved requirement, an approved RAF item, or an approved BPS element. Human approval
> remains a later lifecycle gate.

Consistent with [ADR-0004](../adr/ADR-0004-ai-proposes-code-commits.md) (AI proposes, deterministic
code commits, only humans approve) and [ADR-0007](../adr/ADR-0007-epistemic-ladder.md) (L4 is a human
act). The attribution machinery that makes "explicitly AI-derived" true rather than aspirational
landed in V3 — [phase-2-status.md](phase-2-status.md) §5.8.

**V4a persists no evidence at all**, so E3 first has force in V4b.

### E4 — Chunking

**Approved** for sources exceeding provider context limits, with six requirements:

| # | Requirement |
|---|---|
| 1 | The chunking strategy is **deterministic and versioned** |
| 2 | `ai_interaction` records whether **full or chunked** context was used |
| 3 | **Chunk identifiers and source ranges are retained** |
| 4 | The degradation is **explicitly recorded** |
| 5 | **Confidence takes chunked-context degradation into account** |
| 6 | **Chunking is never silent** |

Requirements 4 and 5 are already approved machinery: `chunked_context` is in the `Degradation`
enum, and `computeConfidence` applies a declared **0.15** penalty for it (ADR-0022 §5, ADR-0011).

**V4a implements requirement 2 and 3's record** — the `contextMode`, chunk count and chunk ranges
columns — **and no chunking algorithm.** A source that exceeds the context limit in V4a is
**refused by name**, stating that chunked extraction arrives in V4b. A refusal is honest; a silent
truncation is the failure mode requirement 6 exists to prevent.

### E5 — Evaluation baseline

V4 must establish an initial evaluation baseline for the passes it implements.

> **V4 is not successful merely because the provider call and the schema work.**

Measured where ground truth permits: extraction precision · extraction recall · citation/provenance
validity · schema validity · unsupported or hallucinated evidence rate · degradation behaviour ·
reproducibility from recorded fixtures.

The initial corpus is **synthetic or sanitised**, and its limitations are stated wherever a number
is. This is already mechanical rather than editorial: `CorpusTier` weights `synthetic` at **0.25**,
`buildReport` **fails** if a tier is absent, and `mayAcceptChange` refuses to accept a prompt change
on synthetic evidence alone once any higher-tier corpus is registered (ADR-0031 rule 4).

**Applied to V4a's single pass**, the measurable set is: schema validity · reproducibility from
fixtures · degradation behaviour · profile agreement against corpus labels. **Extraction precision,
recall, citation validity and hallucination rate are `EXTRACT_EVIDENCE` metrics and are reported as
not-applicable in V4a, then measured in V4b** — recorded that way rather than omitted, so the gap is
visible in the baseline itself.

---

## 3. ADRs required

**None for V4a.** Every element implements an already-approved decision, and the check was run item
by item rather than assumed:

| V4a item | Governed by | New decision? |
|---|---|---|
| Broker consumer wiring | ADR-0020, ADR-0022, **A8** | No — the port, gate, ladder and routing all exist and are tested |
| `PROFILE_SOURCE` | Task vocabulary and its declared capabilities already exist in `TASK_SPECS` | No |
| `ai_interaction` persistence | Invariant I8 (*"written by the broker"*), ADR-0032 (retain everything), ADR-0035 (plain SQL) | No — implementing an existing contract. Adding fields to `AiInteraction` is ordinary slice work, as V3 did with `mode`/`sourceId` |
| Live path, explicitly invoked | **A7**, **A8**, ADR-0031 rule 5 — which already defines `record` and `verify` modes | No |
| **E1** development egress ceiling | ADR-0021 | No — **stricter** than the approved policy. A relaxation would need one |
| Fixtures and corpus | ADR-0031 | No |
| Cost / prompt / degradation metadata | ADR-0011, ADR-0022 | No |

**What *would* require an ADR**, recorded so the boundary is not rediscovered later:

1. Letting anything above **`INTERNAL`** reach an external provider — that is **OD-1**, a deployment
   and governance decision, and E1 exists precisely to avoid drifting into it.
2. Changing what CI means by `replay_only` — that touches **A7** directly.
3. Any resolution of §6 that **weakens** provenance-and-anchoring.md §4.2 rather than tightening it.
4. If V4b's rejection path turns out to need a new evidence or resolution state, that is an ADR on
   the [ADR-0038](../adr/ADR-0038-target-versus-content-verification.md) pattern.

---

## 4. V4a acceptance criteria

Acceptance proves the chain, and each criterion is exercisable rather than asserted.

| # | Criterion | How it is demonstrated |
|---|---|---|
| 1 | **A source is profiled end to end through the broker** — classification, egress gate, capability negotiation, routing, degradation planning, schema-enforced invocation | An end-to-end test over the HTTP surface, with the broker wired as it is in the application |
| 2 | **Every interaction is persisted** with provider, model, capabilities used, prompt version, classification, egress decision, degradation state, usage and cost, timestamps and correlation id | Read back from PostgreSQL-compatible storage after a restart; insert-only, enforced in SQL |
| 3 | **Replay is deterministic.** The same source and prompt version replay to a byte-identical response, and a recording miss in `replay_only` mode is an **error**, never a network call | Two runs compared; a miss asserted to throw `RecordingMissError` |
| 4 | **`npm run verify`, tests and CI make no live call** | The `no-live-ai-in-tests` rule (V3), plus a new confinement rule keeping the live path unreachable from application and test code |
| 5 | **The live path exists, is explicitly invoked, and enforces E1** | An egress assertion at the transport boundary refusing anything above `INTERNAL` in development, tested with a stub provider |
| 6 | **Degradation is never silent**: a reduced-capability provider produces named degradations on the interaction record, and an over-context source is **refused by name** | Tests against the reduced-capability adapter and an oversized source |
| 7 | **An evaluation baseline is produced and its corpus tier is stated**, with V4b's metrics reported as not-applicable rather than omitted | A baseline report generated offline from fixtures |
| 8 | **`PROFILE_SOURCE` output is propositional.** It is stored as a proposal against an interaction, never as domain state, and no requirement, RAF item or BPS element is created | Asserted structurally: no such write path exists |
| 9 | **Verification stays complete and deterministic** — build, `check:arch`, self-test, `check:docs`, tests, nothing skipped or suppressed | `npm run verify` |

### What V4a acceptance will *not* prove

- **Real vision or profiling quality.** No live provider has been called in this environment, and no
  credentials exist here. The first recordings are **authored synthetic fixtures**, not captured
  model output; the capture path is exercised with a stub. This limitation is recorded, and the
  first real capture is a credentialed operation, not a code change.
- **Extraction accuracy.** There is no extraction in V4a.

---

## 5. Dependencies

**None.** Runtime dependencies stay at **seven**, unchanged since V0:

| Need | Met by |
|---|---|
| HTTP to a provider | `fetch`, built into Node 22 — the V3 transport (**D2**) |
| Record / replay / drift | `@asdp/eval`, which already has `createReplayProvider`, `RecordingStore`, `ReplayMode` and drift reporting |
| Metrics | `@asdp/eval` `metrics.ts` — including `hallucinationRate` and `anchorResolutionRate` as **defect detectors**, not scores |
| Corpus tiers and the anti-over-fitting rule | `@asdp/eval` `corpus.ts` |
| Persistence | Plain parameterised SQL, forward-only migration (ADR-0035) |
| Filesystem recording and corpus stores | New code in `@asdp/eval` (class `adapter`, so filesystem access is permitted) |

---

## 6. RECORDED CONFLICT — E2 versus provenance-and-anchoring.md §4.2

**This must be resolved before V4b begins. It does not block V4a**, which locates no quotes.

| Source | Says |
|---|---|
| **E2** (approved 2026-08-23) | **Reject** an ambiguous multi-match citation unless a hint uniquely identifies the occurrence |
| [provenance-and-anchoring.md](../20-domain/provenance-and-anchoring.md) §4.2 (Phase 0 specification) | *"if several matches → mint the anchor only if the model also supplied a locating hint (section/page); else **demote to page or document precision**"* |

Both refuse to guess an occurrence, so neither is unsafe. They differ in what happens to the item:
E2 **drops** it; §4.2 **retains it at lower precision**, which by §5 caps it at L2/L3 and so cannot
become L1 evidence.

Per [CLAUDE.md](../../CLAUDE.md) §7 this is raised rather than silently resolved, and it is a
*specification* conflict rather than an ADR conflict — E2 is stricter, so nothing approved is being
weakened. Two admissible resolutions:

1. **E2 supersedes §4.2 for this case** → update provenance-and-anchoring.md in the V4b change, with
   the reason recorded. Recall drops; provenance integrity is unchanged.
2. **E2 governs claims of exact-precision extraction; §4.2's demotion path stays available for
   explicitly lower-precision retention** → no specification change, and the item survives as an L2
   interpretation that can never be mistaken for verbatim evidence.

**Resolution 2 appears to be closer to both intents** — it satisfies "never silently select one
occurrence" and "never weaken provenance integrity for recall" while keeping the L2 retention the
epistemic model already provides. It is **not** decided here.

---

## 7. V4b — proposed sequel, not started

Begins only after V4a is reviewed and accepted, and §6 is resolved.

**In scope:** `EXTRACT_EVIDENCE` · post-hoc citation verification · provenance enforcement ·
the degradation ladder exercised end to end · confidence propagation · evaluation against the
recorded corpus.

**Still out of scope:** RAF population / `POPULATE_FRAME` · structured business requirements ·
`RECONCILE_SOURCES` · conflict precedence · clarification-question generation · G1 approval ·
Process IR · BPMN / DMN / Form generation.
