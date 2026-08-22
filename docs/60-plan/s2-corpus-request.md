# Spike S2 — Arabic PDF Corpus Request and Measurement Protocol

> **Status:** **AWAITING MATERIAL.** S2 cannot complete without the files described in §2.
> **Version:** 1.0 · **Updated:** 2026-08-23
> **Blocks:** PDF intake, and therefore [ADR-0037](../adr/ADR-0037-binary-document-extraction.md)
> **Related:** [phase-0-tasks.md](phase-0-tasks.md) §S2, [ADR-0031](../adr/ADR-0031-corpus-as-data.md),
> [open-decisions.md](open-decisions.md) OD-7, [provenance-and-anchoring.md](../20-domain/provenance-and-anchoring.md) §7

---

## 1. Why this document exists

S2 asks one question: **can Arabic PDF text be extracted with logical-order, exact-precision
anchors, and how much of that does the existing PDF ecosystem already give us?**

A first pass was run on **synthetic fixtures** and is recorded in
[ADR-0037](../adr/ADR-0037-binary-document-extraction.md) §2. It settled the library comparison —
licence, dependency profile, per-character geometry, and the fact that `pdfjs-dist` returns
display-order text — because those are properties of the libraries and hold regardless of input.

It did **not** settle the question above, for one reason stated plainly: the fixtures were authored
with a tool that does not shape Arabic, so they represent *badly produced* Arabic PDFs and nothing
else. **The exact-precision yield rate, which is S2's deciding number, does not exist yet.**

This document specifies exactly what material would produce it, and exactly what will be measured
against that material. It is written so that whoever sources the files does not have to read the
architecture to know what is wanted.

---

## 2. What we need

### 2.1 Minimum viable set — three files

Three files are enough to complete S2. More is better; fewer leaves a gap that will be named in the
result rather than hidden.

| # | File | Must contain | Why it is diagnostic |
|---|---|---|---|
| **S2-A** | **Arabic-only, digitally generated** | Arabic body text · **multi-line paragraphs** that wrap · a heading structure · Arabic-Indic **or** Western digits | The baseline. Establishes whether a well-produced Arabic PDF stores **logical** order at all. Every other result is interpreted relative to this one |
| **S2-B** | **Mixed Arabic/English, digitally generated** | Arabic paragraphs containing **embedded Latin runs** (a system name, an acronym, a URL) · at least one number inside an Arabic sentence · ideally one English paragraph and one Arabic paragraph adjacent | The bidi case. Embedded Latin inside Arabic is where reordering damage becomes visible and where naive repair provably fails. This is the file that decides whether `pdf_region` anchors are viable |
| **S2-C** | **A difficult / problematic PDF** — whatever you actually have that causes trouble | Any of: scanned or image-only pages · a PDF produced by an unusual or old tool · visual-order glyph runs · presentation forms · missing or broken `ToUnicode` maps · unusual font subsetting | The honest lower bound. If we only measure clean files we will report a yield rate the real world does not honour |

### 2.2 Valuable additions, if they exist

| # | File | Adds |
|---|---|---|
| **S2-D** | **A document containing Arabic tables** — *where practical* | Table-cell extraction and reading order. Tables carry business rules, and a table read in the wrong order silently reorders conditions. If a table-bearing file is hard to source, note it and we will report table behaviour as unmeasured rather than assumed |
| **S2-E** | **The same content as both PDF and DOCX** | The single most useful file in the set if it exists. DOCX gives ground truth for logical order, so PDF extraction can be scored against a known-correct answer instead of against human judgement |

### 2.3 Characteristics matrix

Coverage that matters, and which file is expected to carry it:

| Characteristic | S2-A | S2-B | S2-C | S2-D |
|---|---|---|---|---|
| Arabic-only text | **required** | — | if available | — |
| Mixed Arabic/English | — | **required** | if available | — |
| Multi-line wrapping paragraphs | **required** | **required** | — | — |
| Embedded Latin inside an Arabic sentence | — | **required** | — | — |
| Digits inside Arabic text | preferred | **required** | — | — |
| Headings / document structure | **required** | preferred | — | — |
| Tables | — | — | — | **required** |
| Digitally generated (not scanned) | **required** | **required** | — | preferred |
| Scanned / image-only pages | — | — | preferred | — |
| Diacritics (harakat) anywhere | preferred | preferred | — | — |

### 2.4 Size and shape

- **2–15 pages each.** Long enough to include wrapping and multiple paragraphs; short enough to
  inspect by hand when a measurement disagrees with expectation.
- **Real documents preferred over constructed ones.** A constructed sample inherits the biases of
  whoever constructed it — which is exactly how the synthetic pass went wrong.
- **PDF only** for S2 (plus the optional DOCX twin in S2-E).

### 2.5 What we do NOT need

- Not a large corpus. Three files answer the question; a hundred would not answer it better.
- Not labelled or annotated data. S2 is a deterministic extraction measurement, **not** an AI
  evaluation. Gold sets belong to V4.
- Not anything a person is uncomfortable sharing. See §3.

---

## 3. Sanitisation — and the one rule that matters

Real requirement material is classified and cannot be committed to this repository
([ADR-0031](../adr/ADR-0031-corpus-as-data.md)). Sanitisation is expected.

**The rule that matters: sanitisation must not repair the document.**

A sanitiser who opens the file in Word, replaces names, and re-exports has produced a **new,
well-formed PDF** — and destroyed the only property S2 is measuring. The extraction characteristics
live in how the bytes were produced, not in the words.

| Do | Do not |
|---|---|
| Replace personal names, account numbers, and identifiers **in place**, keeping the same script, direction, and roughly the same length | Re-export, re-print, "Save as PDF", or round-trip through another tool |
| Replace an organisation name with another Arabic organisation name of similar length | Replace Arabic text with English, or with `XXXX` |
| Delete whole pages that cannot be sanitised | Flatten, re-compress, or run through an optimiser |
| Keep the original `Producer` and `Creator` metadata if at all possible | Strip metadata (it tells us what produced the file, which predicts the failure mode) |

**If a file cannot be sanitised without re-exporting it, send the un-sanitised file under whatever
handling restriction applies instead, or send nothing for that slot and say so.** A re-exported
sample is worse than a missing one, because it will produce a confident and wrong yield rate.

### 3.1 Metadata to send with each file

One line each, and it genuinely changes the analysis:

1. **How it was produced** — Word, InDesign, LaTeX, a scanner, a web-to-PDF tool, unknown.
2. **Whether it was sanitised**, and if so how.
3. **Classification** under [data-governance.md](../10-architecture/data-governance.md) —
   `PUBLIC` … `RESTRICTED`.
4. **Whether it is known to be problematic**, and in what way, if you already know.

### 3.2 Handling

- Files go in **`corpora/local/`**, which is **git-ignored** and never committed.
- They are registered by ID through the existing corpus registry in `@asdp/eval`, with tier
  `sanitised` or `representative`, per ADR-0031.
- **S2 makes no AI calls whatsoever.** It is deterministic library measurement, so no content leaves
  the machine and the ADR-0021 egress question does not arise for S2. It will arise in V4; it does
  not arise here.

---

## 4. S2 success criteria

Restated from [phase-0-tasks.md](phase-0-tasks.md) §S2, made measurable. S2 is complete when all
seven are answered — **including where the answer is "no"**.

| # | Criterion | Pass condition |
|---|---|---|
| **1** | All fixtures processed end to end | Every file yields pages, text and units, or a recorded reason why not |
| **2** | **Anchor round-trip** | For every unit, `resolve(anchor)` returns text identical to the stored unit text. Reported as a **percentage per file**, not pass/fail |
| **3** | **Checksum sensitivity** | A one-character mutation of the stored text yields `DRIFTED` or `BROKEN`, **never** a silent `RESOLVED`. This must be 100%; anything less is a defect, not a yield |
| **4** | **Highlight accuracy** | A wrapped RTL range produces **multiple rectangles** that tile the range, and a mixed-direction range splits at the direction boundary |
| **5** | **Tolerant quote location** | A quote differing from the source only by diacritics, Alef/Yeh/Hamza variants, Tatweel, or digit form is still located |
| **6** | **A stated exact-precision yield rate per file** | **The deciding number.** The share of extracted units carrying an `exact`-precision, logical-order, resolvable anchor |
| **7** | **A written library-vs-ASDP split** | What the library provided unmodified, versus what ASDP had to implement |

---

## 5. Measurements to be run

All of it runs in a scratchpad against a pinned candidate library. **No dependency enters the
repository until [ADR-0037](../adr/ADR-0037-binary-document-extraction.md) is approved.**

### 5.1 Per file, per page

| Measurement | Output |
|---|---|
| **M1 · Storage order** | Is the extracted text **logical** or **visual** order? Determined by locating a known Latin run inside an Arabic line and checking whether its characters remain in reading order. This is the test that exposed `pdfjs-dist`, and it is the first thing run |
| **M2 · Presentation forms** | Count of code points in Arabic Presentation Forms-A/B. A non-zero count means `@asdp/text.foldPresentationForms` is required, and tells us how much |
| **M3 · NFC conformance** | Is the extracted text already NFC? Count of code points that change under normalisation |
| **M4 · Per-character geometry** | Are per-character boxes available for every character? Coverage percentage. Anything below 100% bounds `pdf_region` precision |
| **M5 · Round-trip yield** | Criterion 2, per file |
| **M6 · Exact-precision yield** | **Criterion 6.** Units with an exact, logical-order, resolvable anchor ÷ total units |
| **M7 · Rectangle correctness** | For a wrapped RTL range and a mixed-direction range: number of rectangles produced, whether they tile the logical range, and whether they visually cover the right glyphs on the rasterised page |
| **M8 · Reading order** | Do paragraphs and (where present) table cells come out in document order? |
| **M9 · Text-layer presence** | Which pages have no extractable text at all, i.e. which pages `L0-ING-007` would mark for vision fallback |
| **M10 · Confidence signal** | Which observable signals correlate with bad extraction, so the per-page confidence score A3 requires is derived from evidence rather than invented |

### 5.2 Cross-checks

- **M11 · Ground truth against DOCX** — if S2-E exists, score PDF extraction against the DOCX
  extraction of the same content, which is logical order by construction.
- **M12 · Visual verification** — rasterise each page, paint the computed rectangles for a sample of
  ranges, and **look at the images**. A rectangle list can tile a logical range perfectly and still
  sit over the wrong glyphs; only rendering catches that.
- **M13 · Candidate comparison** — run M1–M10 for both `@embedpdf/pdfium` and `pdfjs-dist` on the
  real files, so the ADR-0037 recommendation is tested against real material and not only against
  synthetic fixtures.

### 5.3 Deliverable

An S2 completion report and an ADR-0037 revision, containing: the yield table per file, the
library-vs-ASDP split, the rendered rectangle images, and a recommendation that may differ from the
current proposal.

---

## 6. Pre-registered decision rule

Recorded **before** the data arrives, so the outcome is not rationalised after the fact. The
threshold applies to **M6 on the digitally generated files (S2-A, S2-B)**; S2-C sets the lower bound
and is reported separately rather than averaged in.

| Exact-precision yield | Conclusion | Consequence |
|---|---|---|
| **≥ 95%** | PDF text extraction is viable for Arabic | Proceed as ADR-0037 proposes. `pdf_region` exact anchors are the primary path; vision is a genuine exception |
| **80 – 95%** | Viable **with per-page fallback** | Proceed, and A3's per-page confidence marking becomes load-bearing rather than precautionary. Expect a visible share of pages routed to vision in V3 |
| **50 – 80%** | Marginal | Escalate. Options: restrict `exact` precision to verified pages and demote the rest to `page`; or make page-image + vision the **primary** Arabic path. This is a scope decision, not a technical one |
| **< 50%** | **Not viable** | Arabic PDF text extraction is abandoned as a primary path. Page-image + vision becomes primary for Arabic, which makes OD-1 (a vision-capable endpoint) **blocking for Arabic PDF support** — a scope consequence that must be surfaced immediately, per [open-decisions.md](open-decisions.md) §4.1 |

**Criterion 3 is not a yield and has no threshold.** If a one-character mutation ever resolves
silently, that is a defect to fix before anything else is measured.

---

## 7. If the material does not arrive

S2 stays open and PDF intake stays blocked. It does **not** block the rest of V2 — see the revised
boundary in [phase-2-plan.md](phase-2-plan.md) §3, under which DOCX proceeds independently with no
new dependency.

Escalation point, from [open-decisions.md](open-decisions.md) OD-7: **if nothing real is available
by V4**, prompt work would begin on synthetic material only, and that is the point at which the
problem compounds rather than merely persists.
