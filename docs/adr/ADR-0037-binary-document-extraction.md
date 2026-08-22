# ADR-0037: Binary Document Extraction and Rasterisation Toolchain

> **Status:** **PROPOSED — HELD pending spike S2 completion on real material.** Nothing in this
> record is implemented, and the dependency in §3.1 **must not be added** until this ADR is approved.
> **Date:** 2026-08-23 · **Reversibility:** Moderate (confined behind two ports)
> **Gate:** approval was deliberately withheld on 2026-08-23 in favour of finishing S2 against
> representative Arabic PDFs first. The material and protocol required are specified in
> [s2-corpus-request.md](../60-plan/s2-corpus-request.md), which also **pre-registers the decision
> rule** (§6) — including an outcome under which the recommendation below changes materially.
> **Related:** ADR-0008, ADR-0021, ADR-0023, ADR-0028, ADR-0030, **A3**, **A4**
> **Evidence:** Spike **S2** — see §2. This is the spike
> [roadmap.md](../60-plan/roadmap.md) §2 names as *"the single highest-uncertainty engineering task
> in the project"*.

## Context

V2's approved boundary requires a `TextExtractor` and a `PageRasteriser` behind which PDF and DOCX
adapters extract canonical text with **resolvable anchors** and, where required, rasterise pages.

Three obligations constrain the choice, and they are not negotiable:

1. **[ADR-0023](ADR-0023-unicode-bilingual-architecture.md)**: stored text is NFC and in **logical
   order**. Anchors are code-point offsets over that text.
2. **[ADR-0008](ADR-0008-resolvable-anchors.md)**: every anchor must resolve, with a verified quote
   checksum. An unresolvable anchor is a hard error.
3. **`pdf_region` anchors carry a LIST of rectangles**, because one logical range wraps and splits
   across bidi runs ([provenance-and-anchoring.md](../20-domain/provenance-and-anchoring.md) §2).

Obligation 3 requires **per-character geometry**. Obligation 1 requires text in **logical order**,
not display order. Those two requirements, not raw extraction quality, decide the library.

**A4** additionally requires that a material runtime dependency be raised for review before adoption,
with pinned versions and a recorded purpose.

## Spike S2 — findings

Method per [phase-0-tasks.md](../60-plan/phase-0-tasks.md) §S2: **measure the standard stack before
building anything.**

### 2.1 What was measured

Three candidate libraries against five authored fixtures (English text layer; Arabic logical-order;
Arabic presentation-forms in visual order; mixed Arabic/English with Arabic-Indic digits; two-page
document).

| | `pdfjs-dist` 6.2.108 | `mupdf` 1.28.0 | `@embedpdf/pdfium` 2.15.0 |
|---|---|---|---|
| **Licence** | Apache-2.0 ✔ | **AGPL-3.0-or-later ✘** | **MIT ✔** |
| Runtime dependencies | none (native canvas **optional**) | none (WASM) | none (WASM) |
| Installed size | 34 MB | 14 MB | **7.2 MB** |
| Text ordering | **applies its own bidi pass → DISPLAY order ✘** | content-stream order | content/position order |
| **Per-character geometry** | **no — per-item only ✘** | yes (quads, via `walk()`) | **yes (`FPDFText_GetCharBox`) ✔** |
| Presentation-form folding | passthrough | passthrough | folds to base letters |
| Rasterisation | needs a **native** canvas | built in | **built in, verified headless ✔** |

### 2.2 The decisive finding — pdfjs returns display order

`getTextContent` applies pdf.js's own bidi algorithm and returns text in **display** order with a
`dir` hint. Measured on a fixture whose logical content is `"Page two: <arabic>"`:

```
extracted : ".لمع يموي لالخ ةيوهلا نم ققحتلا لامكإ بجي :Page two"
```

The Latin prefix has **moved to the end of the string**. That is a reordering, not a formatting
detail: code-point offsets over this string do not address the logical text, so anchors built on it
would be meaningless and match-form quote location would fail.

**Naive recovery does not work.** Reversing the string was tested directly:

```
reversed  : "owt egaP: يجب إكمال التحقق من الهوية خلال يومي عمل."
```

Reversal repairs the Arabic and **destroys the Latin**. Reversal is not an inverse of the bidi
algorithm for a line with more than one embedding level, and pdf.js does not expose the embedding
levels that would make inversion possible. Recovering logical order from pdf.js's output is
therefore not a small residual — it is not available at all through the public API.

### 2.3 Per-character geometry

`pdfjs-dist` exposes `transform`, `width` and `height` **per text item**, not per character. A quote
is almost always a sub-range of an item, so `pdf_region` rectangle lists cannot be built from it
headlessly. Both other candidates expose per-character boxes; PDFium's were verified returning real
coordinates.

### 2.4 Rasterisation

PDFium rendered a page to a BGRA bitmap **headlessly, with no native canvas dependency**, verified by
counting non-white pixels and writing an inspectable PNG. This removes the separate native-canvas
decision entirely: `@napi-rs/canvas` (prebuilt, MIT) or `canvas` (requires system Cairo and
compilation) are both unnecessary.

### 2.5 Honest limitation of this spike — the fixtures are not representative

The fixtures were authored with `pdf-lib` + `@pdf-lib/fontkit`, which **does not shape Arabic
correctly**. Rendering the output confirmed it: the Arabic appears unshaped and mis-ordered on the
page. The authored files therefore store Arabic in **visual order with unjoined letters**, i.e. they
are *badly produced* Arabic PDFs.

Consequently:

- The **hard case** — a real-world Arabic PDF storing visual-order glyphs and presentation forms — is
  characterised **well**. It is also the case
  [provenance-and-anchoring.md](../20-domain/provenance-and-anchoring.md) §7 already names.
- The **good case** — a well-produced Arabic PDF storing logical order — is **not measured at all**,
  because no tool available here can author one and there is no real Arabic PDF corpus in the
  repository.
- The library comparison in §2.1 is **fixture-independent** and stands: licence, dependency profile,
  per-character geometry, and pdf.js's bidi pass are properties of the libraries.

**S2 therefore cannot yet state the exact-precision yield rate** that its success criterion 6
demands. That number requires real material, and this is **[OD-7](../60-plan/open-decisions.md)
(corpus availability) blocking exactly where the roadmap predicted S2 would need it.**

### 2.6 What completing S2 will add

The decision below is therefore **provisional on evidence that does not exist yet**. Completing S2
per [s2-corpus-request.md](../60-plan/s2-corpus-request.md) will produce: the per-file
exact-precision yield rate (criterion 6), the library-vs-ASDP split (criterion 7), rendered
rectangle images verifying that computed highlights sit over the right glyphs, and — importantly —
a re-run of the candidate comparison **on real files**, which may not reproduce what synthetic
fixtures showed.

Under the pre-registered decision rule, a yield below 50% would make page-image + vision the
**primary** Arabic path rather than a fallback, which would change this ADR's recommendation and
make OD-1 (a vision-capable endpoint) blocking for Arabic PDF support. That possibility is why
approval was withheld rather than granted with caveats.

## Decision (proposed)

1. **Adopt `@embedpdf/pdfium` (MIT, WASM, zero dependencies) as the PDF text-extraction and
   rasterisation engine**, pinned exactly, confined behind the `TextExtractor` and `PageRasteriser`
   ports so it is replaceable.
2. **Reject `mupdf` on licence grounds.** AGPL-3.0-or-later imposes network copyleft on a hosted
   service. It is technically strong and may be revisited only if a commercial Artifex licence is
   procured as an explicit decision.
3. **Reject `pdfjs-dist`** — not on licence or quality grounds, but because its public API returns
   display-order text and no per-character geometry, which are the two things the anchor model needs.
4. **No native dependency is added.** Rasterisation uses PDFium's own renderer.
5. **DOCX uses no new dependency.** A DOCX is a ZIP of XML; `node:zlib` provides raw inflate, and the
   provenance requirement means we need offsets into the document part anyway — which a converter
   such as `mammoth` would discard. A purpose-built reader is both smaller and the only thing that
   satisfies ADR-0008.
6. **Logical-order reconstruction is ASDP's residual, and it is bounded honestly.** Where a PDF
   stores visual order, the adapter **must not** guess. It marks the page
   `requiresVisionFallback` with a recorded confidence, which is exactly the A3 path and what
   `L0-ING-008` reports. Silent reordering is forbidden.
7. **The exact-precision yield rate stays open** until real or sanitised Arabic PDFs exist (OD-7).
   Until then the PDF adapter's Arabic behaviour is documented as *measured on synthetic fixtures
   only* and must not be reported as validated.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| `pdfjs-dist` + reverse the string when `dir === 'rtl'` | Proven wrong in §2.2: it destroys embedded Latin. It would produce anchors that resolve against corrupted text — the worst possible failure, because it looks like provenance |
| `pdfjs-dist` + read the operator list and map glyphs ourselves | That is reimplementing most of a PDF text engine, including font encodings and CMaps. Far larger than the problem |
| `mupdf` | AGPL-3.0. Not adoptable for a hosted enterprise product without a commercial licence |
| `@napi-rs/canvas` for rasterisation | Unnecessary once PDFium renders. A platform-specific native binary also cannot be verified in the container while Docker is unavailable |
| `mammoth` for DOCX | Converts to HTML and discards source offsets, so anchors could not be minted. Fails ADR-0008 |
| A ZIP library (`fflate`, `unzipit`) for DOCX | `node:zlib` already provides raw inflate; the residual is a ~100-line central-directory reader. A4 says avoid unnecessary dependencies |
| Defer PDF to its own slice, ship DOCX only in V2 | Viable, and worth considering if the approver would rather not adopt a WASM PDF engine on synthetic evidence. It would deliver DOCX with **zero** new dependencies |

## Consequences

**Positive**

- One engine covers extraction **and** rasterisation, so V2 adds **one** dependency rather than two
  or three, and none of them native.
- Per-character boxes make `pdf_region` rectangle lists a direct construction rather than an
  estimate — including for wrapped and bidi-split ranges.
- MIT licence, zero transitive dependencies, 7.2 MB.
- Confined behind two ports, so replacing the engine later is an adapter change.

**Negative**

- **A WASM binary blob** enters the runtime. It is not human-auditable, and `@embedpdf` is a smaller
  publisher than Mozilla — a supply-chain consideration that pinning mitigates but does not remove.
- The API is raw FFI (`malloc`, `HEAPU8`, manual `free`). The adapter must own that discipline; a
  leak or an out-of-bounds read is a real failure mode, so the adapter stays small and is tested for
  release of every allocation.
- PDFium's text ordering is position-derived, so **logical order is still not guaranteed** for
  visual-order source PDFs. Decision 6 is what keeps that honest rather than hidden.
- Arabic PDF behaviour remains **unvalidated against real material** (OD-7).

## Enforcement

| Mechanism | Enforces |
|---|---|
| `TextExtractor` / `PageRasteriser` ports | No adapter type reaches domain or command code (**A3**) |
| Checker rule `pdf-engine-confinement` *(to add)* | No `@embedpdf/pdfium` import outside the PDF adapter directory |
| Exact version pin + dependency manifest | **A4** |
| `L0-ING-007` / `L0-ING-008` | A vision-fallback page and a low-confidence reordering are **recorded**, never silent |
| Adapter test asserting every allocation is freed | The FFI discipline above |
