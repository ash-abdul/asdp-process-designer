# V4b — AI Evidence Extraction · APPROVED BOUNDARY (V4b-core) and DEFERRED SEQUEL (V4b-eval)

> **Status:** **V4b-core APPROVED 2026-08-23, IMPLEMENTED and ACCEPTED** — delivered state in
> [phase-2-status.md](phase-2-status.md) §7; the acceptance review, and the one acceptance criterion
> that did not hold until it was fixed, are in **§7.10**. **V4b-eval DEFERRED** until an approved
> credential and E1-permitted material exist — it is not blocked work, it is work whose inputs do not
> yet exist.
>
> **The V4b-core numbers measure the pipeline, not a model** — §7.8 of the status record.
> **Version:** 1.1 · **Updated:** 2026-08-23
> **Related:** [v4-proposal.md](v4-proposal.md), [phase-2-plan.md](phase-2-plan.md) §3.9,
> [phase-2-status.md](phase-2-status.md) §0,
> [provenance-and-anchoring.md](../20-domain/provenance-and-anchoring.md) **§4.4**,
> [ADR-0004](../adr/ADR-0004-ai-proposes-code-commits.md),
> [ADR-0007](../adr/ADR-0007-epistemic-ladder.md),
> [ADR-0008](../adr/ADR-0008-resolvable-anchors.md),
> [ADR-0011](../adr/ADR-0011-computed-confidence.md),
> [ADR-0022](../adr/ADR-0022-capability-negotiation.md),
> [ADR-0031](../adr/ADR-0031-corpus-as-data.md), **A7**, **A8**, **E1–E5**, **F1–F5**

---

## 0. Why V4b is split

V4a proved the chain. V4b is where AI output first becomes **evidence a requirement may later cite**,
so it is where the epistemic rules stop being documentation and start rejecting things.

The split follows the one dependency V4b cannot satisfy from inside the repository: **a live model
call needs a credential and permitted material.** Everything else can be built, tested and accepted
without one.

| Slice | Character | State |
|---|---|---|
| **V4b-core** | Extraction, citation verification, §4.4 enforcement, persistence gate, confidence, chunking, and evaluation against a **human-labelled synthetic gold set**. Fully replay-capable | **IMPLEMENTED**, awaiting review — [phase-2-status.md](phase-2-status.md) §7 |
| **V4b-eval** | First real provider capture, drift-checked recordings, evaluation against sanitised representative material, comparison against the core baseline | **DEFERRED** — needs a credential and an E1-permitted corpus |

**V4b-core is explicitly not blocked** by live credentials or corpus availability (**F3**). It is
completable and acceptable on its own, and its acceptance will claim mechanics and governance — not
real-world model quality.

---

## 1. V4b-core — approved scope

| # | Item |
|---|---|
| 1 | **`EXTRACT_EVIDENCE`** over V1/V2 textual `SourceUnit`s, through the broker wired in V4a |
| 2 | **Post-hoc citation verification** — the model returns a verbatim quote, *we* locate it and mint the anchor |
| 3 | **Provenance §4.4 enforced**, including the change described in §3 below |
| 4 | **The ambiguous-AI-evidence rejection path**, recorded and countable (**F2**) |
| 5 | **The E3 persistence gate** — four conditions, all of them, or nothing is written (**F5**) |
| 6 | **Confidence propagation** — computed, never provider-reported, with degradations carried in |
| 7 | **Deterministic structural chunking** with recorded ranges, overlap and declared degradation (**F4**) |
| 8 | **The degradation ladder exercised end to end** against a reduced-capability adapter |
| 9 | **Gold-set evaluation** on a synthetic, human-labelled corpus (**F1**) |
| 10 | **Precision, recall, unsupported/hallucinated-evidence rate, citation validity** |
| 11 | **Deterministic recorded/replay fixtures**, so CI stays offline (**A7**) |

### Out of scope — unchanged, and restated because this is where it would slip

RAF population / `POPULATE_FRAME` · structured business requirements · `RECONCILE_SOURCES` ·
conflict precedence · clarification-question generation · **the human approval workspace** · G1 ·
Process IR · BPMN/DMN/Form generation · PDF · spreadsheets · **H1/H2** hardening.

**And specifically: no analyst resolution workflow** (**F2**). A rejected extraction is recorded and
measurable; it is not queued for anyone, because a remediation queue is the later human requirements
workspace and building a piece of it here would be the beginning of that slice.

---

## 2. Approved decisions F1–F5

All five **approved 2026-08-23**.

### F1 — Gold set

An **initial human-controlled** gold set for V4b-core. It may use synthetic documents, provided:

- **expected `EvidenceItem`s are explicitly labelled** — not inferred at run time
- **ground truth is authored or reviewed by a human**
- **AI-generated expected output is never treated as authoritative ground truth**
- **every expected item carries its expected source location / provenance**
- **the corpus tier is recorded**

V4b-eval later adds **sanitised representative real documents labelled or reviewed by an analyst**.

> **No real-world model-quality claim may be made from the synthetic tier.** Already mechanical:
> `TIER_WEIGHT` weights `synthetic` at **0.25**, `buildReport` refuses a report with no tier, and
> ADR-0031 rule 4 blocks accepting a prompt change on synthetic evidence alone once a higher tier
> exists.

**Why the "no AI ground truth" rule matters more than it looks:** a gold set generated by the same
class of model being measured turns evaluation into agreement-with-itself. The numbers would go up
and mean less. Every expected item in V4b-core is authored by hand and reviewed as data.

### F2 — Ambiguous extraction rejection

**No analyst resolution workflow in V4b.** When an AI-extracted item is rejected because its citation
remains ambiguous:

| Requirement | How it is met |
|---|---|
| **Do not persist it as a usable `EvidenceItem`** | The persistence gate refuses it; no row is written |
| **Record the rejection reason** in the AI-interaction / evaluation audit | An append-only audit event per extraction pass, carrying per-item reason codes |
| **Retain enough to measure recall loss and diagnose** | Reason code, match count, whether a hint was supplied and whether it resolved, the unit scope, and the quote **checksum** |
| **Never silently discard the event** | A rejection is counted in the pass result, the audit event and the evaluation report |

**One stated implementation choice, not a decision request:** the persisted audit record carries the
quote's **checksum, not its verbatim text**. A rejected item never became evidence, and the audit
store is not a content store — copying unanchored source text into audit records would spread
classified content into rows with different handling. Full quotes appear only in the **offline
evaluation report** over the synthetic corpus, which is where diagnosis actually happens.

### F3 — Live provider capture

| | V4b-core | V4b-eval |
|---|---|---|
| Replay-capable | **Fully** | n/a |
| Credential | **None required** | **Required**, approved |
| CI | **Deterministic** | Outside CI (**A7**) |
| Acceptable without a live provider | **Yes** | No — that is its subject |

**V4b-core must not be blocked on external credentials or corpus availability.**

### F4 — Chunking

**Structural chunking is the primary strategy.** Preferred boundaries, in order: `SourceUnit` ·
section · heading-defined block · other deterministic document structure.

**Only when a single structural unit itself exceeds the provider limit** may it be split by size, and
then:

- deterministic and **versioned** splitting
- **controlled overlap** where necessary, so evidence spanning a boundary is not lost
- **original source ranges recorded**
- **chunk ids recorded**
- **overlap recorded**
- **`chunked_context` declared** as a degradation
- **the degradation propagated into confidence**

**Never chunk silently.**

Structural-first is not a preference for tidiness: a chunk that respects unit boundaries cannot split
a quote that a unit contains, so the common case never needs overlap at all. Overlap exists for the
one case structure cannot help with.

### F5 — AI evidence persistence

Persist automatically **only when all four hold**:

1. structured output **validates**
2. the citation **resolves uniquely** under provenance §4.4
3. the anchor **verifies independently**
4. applicable provenance/validation rules **pass**

Persisted items remain explicitly `extractedBy: 'ai'` **with `aiInteractionId`** — the attribution
machinery and its SQL constraints landed in V3 ([phase-2-status.md](phase-2-status.md) §5.8), so this
is enforced by the database and not only by the command.

**They remain AI-derived evidence.** They must **not** automatically become RAF items, approved
requirements, BPS elements, or process design decisions. Those transitions belong to later
analysis and review gates ([ADR-0004](../adr/ADR-0004-ai-proposes-code-commits.md),
[ADR-0007](../adr/ADR-0007-epistemic-ladder.md): L4 is a human act).

---

## 3. Material architecture decisions — and the one behaviour change

**No new ADR is required**, and no approved decision is contradicted. But V4b-core **changes the
behaviour of Phase-1 code**, and that is worth stating plainly before it happens rather than
discovering it in a diff.

### `locateQuote` currently does the one thing §4.4 forbids

`packages/provenance/src/locate.ts`, written in Phase 1, implements the **pre-revision** rule. When a
quote matches several locations:

```
if (req.hint !== undefined && (hint.page ?? hint.section)) {
  const m = matches[0]!;                      // ← the FIRST match, arbitrarily
  return { status: 'ambiguous', anchor: build(m, 'page') };
}
```

It accepts the *presence* of a hint as licence to **pick the first occurrence** and demote precision.
`mayBecomeEvidence` then returns `true` for it. Under
[provenance-and-anchoring.md](../20-domain/provenance-and-anchoring.md) **§4.4** that is exactly the
forbidden combination: an arbitrary selection, made eligible by demotion.

**V4b-core changes it:**

| Before | After |
|---|---|
| A hint's *presence* permits an anchor | A hint must be **applied** — used to filter the candidate matches — and the anchor is minted only if **exactly one** survives |
| Ambiguous + anchor → may become evidence | Ambiguous → **never** becomes AI-extracted evidence, regardless of precision |
| Hints are `page` / `section` | Hints extend to **`unitId`** and **enclosing heading**, which a parser can actually verify against stored structure |

This is the implementation of an approved decision (**E2**, spec §4.4), not a new decision. It is
recorded here because it **narrows an existing function's contract**, and any caller relying on the
old leniency should fail loudly rather than quietly.

### Everything else implements existing decisions

| Item | Governed by |
|---|---|
| `EXTRACT_EVIDENCE` task, capabilities, degradation | Task vocabulary + ADR-0022; both exist |
| Persistence gate, `extractedBy: 'ai'`, interaction id | **F5**, E3, ADR-0004/0007; SQL constraints exist from V3 |
| Confidence propagation | ADR-0011; `computeConfidence` and the 0.15 `chunked_context` penalty exist |
| Chunking | **F4**, E4; the `contextMode` / `chunkRanges` columns exist from V4a |
| Gold set, tiers, replay | **F1**, ADR-0031; corpus and recording machinery exist from V4a |

**What would need an ADR:** letting an ambiguous citation support a requirement by any route;
allowing AI-generated ground truth into a gold set; or making CI depend on a live call. All three are
refused by the decisions above, which is why none is a decision left open here.

---

## 4. V4b-core acceptance criteria

| # | Criterion | Demonstrated by |
|---|---|---|
| 1 | **Evidence is extracted end to end** through the broker from real `SourceUnit`s, and every persisted item is anchored and verified | End-to-end tests over the HTTP surface |
| 2 | **A unique match is accepted; an ambiguous one is REJECTED** — and a supplied hint is *applied*, not merely present | Tests for all three §4.4 cases, including a hint that fails to disambiguate |
| 3 | **No arbitrary occurrence is ever selected**, and demotion never makes an ambiguous AI claim eligible | A test asserting the old first-match behaviour is gone |
| 4 | **Rejections are recorded and countable** — reason code, match count, hint outcome, checksum — and never silently dropped | Audit assertions + a rejection count in the pass result |
| 5 | **The persistence gate holds all four conditions**, and a failure of any one writes nothing | Tests per condition |
| 6 | **Persisted AI evidence is `extractedBy: 'ai'` with its interaction named**, and no route promotes it | Tests + the V3 SQL constraints |
| 7 | **Confidence is computed and carries degradations**, including `chunked_context` | Unit tests over the recorded factors |
| 8 | **Chunking is structural, deterministic, versioned, and recorded** — ranges, ids, overlap, degradation | Tests including an oversized single unit forcing the size fallback |
| 9 | **The degradation ladder runs end to end** against a reduced-capability adapter | Test asserting named degradations on the interaction |
| 10 | **Gold-set evaluation reports precision, recall, hallucination rate and citation validity**, with the corpus tier stated and no real-world claim | `npm run eval:extract` offline |
| 11 | **CI makes no live call**; fixtures are recorded and replay is deterministic | `npm run verify` + the confinement rules |
| 12 | **Verification is complete** — nothing skipped, loosened or suppressed | `npm run verify` |

### What V4b-core acceptance will NOT prove

**Real model quality.** The gold set is synthetic and human-authored; the provider is the authored
stub. Precision and recall will measure *the extraction pipeline against labelled expectations*, not
a model against reality. That claim requires **V4b-eval**, and the tier weighting says so on every
report.

---

## 5. Dependencies

**None new.** Runtime dependencies stay at **seven**.

| Need | Met by |
|---|---|
| Quote location | `locateQuote` in `@asdp/provenance` (behaviour narrowed per §3) |
| Confidence | `computeConfidence` in `@asdp/domain` |
| Precision / recall / hallucination | `computeExtractionQuality`, `computeProvenanceMetrics`, `buildReport` in `@asdp/eval` |
| Corpus, gold set, recordings | `@asdp/eval` corpus + recording machinery, filesystem stores from V4a |
| Interaction record with chunk fields | Migration 006 from V4a |
| Attribution constraints | Migration 005 from V3 |

**V4b-eval's dependencies are external and have no committed date:** an approved credential and
E1-permitted material. That is precisely why the split exists.

---

## 6. V4b-eval — deferred scope

Not started, and not startable here.

- **First real provider capture** through the confined live path, under **E1**
- **Drift-checked live recordings** (`--mode=verify`), so a silently updated hosted model is caught
- **Evaluation against sanitised representative real material**, labelled or reviewed by an analyst
- **Comparison of real-model results against the V4b-core baseline** — the first moment this project
  can say anything about model quality at all

Requires: an approved credential · E1-permitted material · an analyst-labelled gold set at
`sanitised` tier or better.
