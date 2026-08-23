# Provenance and Anchoring

> **Status:** Approved (Phase 0) · **Version:** 1.1 · **Updated:** 2026-08-23
> **Related:** [ADR-0008](../adr/ADR-0008-resolvable-anchors.md), [ADR-0023](../adr/ADR-0023-unicode-bilingual-architecture.md), [multilingual-architecture.md](../10-architecture/multilingual-architecture.md), [ADR-0038](../adr/ADR-0038-target-versus-content-verification.md)
> **Revision 1.1 (2026-08-23) — §4.2 changed materially.** Ambiguous multi-match quote location no
> longer makes an **AI-extracted** `EvidenceItem` eligible for downstream requirement analysis;
> precision demotion survives for general source citation only. See §4.4 for exactly what changed
> and why. Approved as decision **E2** — [phase-2-plan.md](../60-plan/phase-2-plan.md) §3.8.

An anchor is a machine-resolvable pointer into a source. If anchors are unreliable, the
product's central claim is false. Everything in this document exists to prevent that.

---

## 1. Absolute rules

| # | Rule |
|---|---|
| **A1** | An anchor MUST be resolvable: given the anchor and the stored source, the system MUST be able to return the exact region and render a highlight |
| **A2** | An unresolvable anchor is a **hard error** at validation layer L0. It is never stored silently, never downgraded to a document-level reference |
| **A3** | Offsets are **Unicode code-point indices over NFC-normalised, logical-order text**. Never UTF-16 code units. Never grapheme clusters. Never visual order |
| **A4** | Every anchor stores the **verbatim quote** and a **checksum of the anchored span**. Resolution verifies the quote; a mismatch is anchor drift and fails loudly |
| **A5** | Every anchor stores the **detected language and base direction** of its span |
| **A6** | Bidi control characters are **counted** in offsets, never stripped |
| **A7** | Anchors are computed against **unredacted** normalised text, so redaction never affects traceability |
| **A8** | Anchor precision is recorded and feeds confidence: exact span > sheet cell > page > document |

## 2. Anchor types

A discriminated union. New kinds may be added; existing kinds are never redefined.

```
ProvenanceAnchor =

  text_range    { charStart, charEnd }
                  // free text, Markdown, transcript bodies

  docx_block    { blockPath, runStart, runEnd }
                  // blockPath is a stable structural path, e.g. "body/3/table/2/tr/1/td/0/p/0"

  pdf_region    { page, rects[ {x,y,w,h} ], charStart?, charEnd? }
                  // rects is a LIST: one logical range may wrap into several rectangles,
                  // which is common in RTL and mixed-direction text

  image_region  { imageId, rect { x,y,w,h } }
                  // screenshots, diagram images, rasterised scanned pages

  sheet_cell    { sheet, a1Range }
                  // "Rules!B4:F27" — a decision-table candidate anchors as a range

  bpmn_element  { fileId, elementId }
                  // imported BPMN: element-level, deterministic, very high precision

  dmn_rule      { fileId, decisionId, ruleId? }
                  // imported DMN: decision or individual rule row

  form_field    { fileId, fieldId }

  transcript    { sessionId, turnId }
                  // an answered clarification question is evidence like any other

Common envelope on every anchor:
  { sourceId, kind, …kindFields,
    quote, quoteChecksum, language, direction,
    precision: exact | cell | page | document,
    extractorVersion }
```

`extractorVersion` matters: if the adapter that computed an anchor is upgraded, we can identify
which anchors were minted by which extractor and re-verify them selectively.

## 3. Resolution

```
resolve(anchor) :
  1. load the source's normalised text / page image / model file
  2. locate the region by anchor kind
  3. recompute the span checksum
  4. if checksum matches            → RESOLVED   (return region + rects for highlighting)
     if quote found at a small offset delta
                                     → DRIFTED   (repair the offset, record the repair,
                                                  flag for review)
     if quote not found              → BROKEN    (hard error; the dependent evidence is
                                                  quarantined and its requirements flagged)
```

Drift repair is bounded and recorded. It exists because re-parsing with an upgraded adapter can
shift offsets slightly; it must never become a general-purpose fuzzy-matching fallback that
hides real breakage.

## 4. Minting anchors — deterministic, never AI

The AI never computes an offset. Two paths only:

### 4.1 Parser-minted (preferred)

Deterministic adapters emit `SourceUnit`s with anchors during ingestion. Evidence extracted
from a unit inherits and narrows that unit's anchor. Precision is exact.

### 4.2 Quote-located (`post_hoc`)

When a provider has no native citation capability
([ai-provider-abstraction.md](../10-architecture/ai-provider-abstraction.md) §6), the task
schema **requires** a verbatim quote, and we locate it ourselves:

```
locateQuote(quote, source) :
  1. normalise the quote to MATCH form (Arabic folding, diacritic strip, digit fold)
  2. search the source's MATCH form
  3. map the match position back to STORED-form code-point offsets via the offset map
  4. if exactly one match      → mint an exact anchor
     if several matches        → mint the anchor only if a DETERMINISTIC locating hint
                                 supplied with the extraction (section, page, unit id,
                                 enclosing heading) resolves to exactly ONE occurrence.
                                 Otherwise the outcome depends on what the anchor is FOR:
                                   · general source citation → demote to page or document
                                     precision (§4.4)
                                   · AI-extracted EvidenceItem intended for downstream
                                     requirement analysis → REJECT (§4.4). Never select an
                                     occurrence arbitrarily
     if no match               → REJECT the item. It does not become evidence.
                                 It may be retained as an L2 interpretation with no anchor,
                                 or dropped, per task policy.
```

**A rejected quote never becomes L1 evidence.** This is the mechanism that preserves the
traceability guarantee across providers of differing capability: recall may drop, provenance
integrity does not.

### 4.4 Ambiguity, by what the anchor is for — **E2**

> **This is a material change to the rule as approved in Phase 0**, made on 2026-08-23 by decision
> **E2** and recorded rather than presented as though it had always been the rule. Version 1.0 of
> this document allowed an ambiguous multi-match quote to be **demoted** to `page` or `document`
> precision in every case. Demotion survives — but it no longer makes an **AI-extracted** item
> eligible to support a requirement.

**Two different questions were being answered by one rule.**

| Purpose | Ambiguous multi-match outcome |
|---|---|
| **General source citation** — pointing a reader at roughly where something is, for navigation, display, or an explicitly lower-precision reference | **Demotion is permitted**, exactly as before. The result is a `page`- or `document`-precision anchor, which §5 already caps at L2/L3 content and never L1 evidence |
| **An AI-extracted `EvidenceItem` intended to participate in downstream requirement analysis** | **REJECTED.** It does not become evidence for that purpose |

The three-case rule, stated once:

1. **Exactly one location** → accept the verified anchor.
2. **Several locations, but deterministic locating information supplied with the extraction
   uniquely identifies one occurrence** → accept the uniquely resolved anchor. "Deterministic" is
   the operative word: a section number, page, unit id or enclosing heading that a *parser* can
   check, not a model's assertion that it meant the third one.
3. **Several locations still possible** → **reject the AI-extracted `EvidenceItem` for downstream
   use.**

**Two things are forbidden outright:**

- **Never select an occurrence arbitrarily** — not the first, not the longest, not the nearest to a
  guess. An arbitrary pick produces a *confident* citation to a location nobody verified, which is
  worse than no citation because it survives review.
- **Never let document-level demotion make an ambiguous AI claim eligible for later requirement
  generation.** Demoting precision changes how strongly the anchor is *described*; it does not make
  the underlying location known. Using demotion as a route to keep an ambiguous claim alive would
  turn a precision label into a laundering step.

**Why the asymmetry is principled rather than convenient.** An anchor's job differs by consumer. A
reader following a `document`-precision citation knows they are being pointed at a document and will
look. A requirement generated from an ambiguous anchor inherits a false premise silently, and by
then the ambiguity is invisible: the requirement cites *an* anchor, and the anchor resolves. The
place to refuse is where the ambiguity is still visible.

**The cost is recall, and it is accepted.** Some true statements will not become evidence because
the system cannot say *where* they came from. That is the same trade the "no match → reject" rule
already makes, applied to a case Phase 0 treated more leniently.

**Implemented in V4b-core** (accepted 2026-08-23) — `locateQuote` and `mayBecomeEvidence` in
`@asdp/provenance`, and the shared persistence gate that every extraction passes through
([phase-2-status.md](../60-plan/phase-2-status.md) §7.2–§7.3). Three properties of that
implementation are part of the rule rather than of the code:

- **A hint is *applied*, not counted.** Only `unitId` and an enclosing heading resolve, because only
  those can be checked against stored structure. `page` and `section` are recorded and disambiguate
  nothing on their own.
- **A locator that names two places resolves nothing.** A heading occurring more than once in a
  document does not identify a section, so it yields no scope at all and the candidate is rejected —
  keeping the first would be the arbitrary pick this section forbids, wearing a hint as cover
  ([phase-2-status.md](../60-plan/phase-2-status.md) §7.10).
- **Demotion is available and inert for this purpose.** The ambiguous outcome still offers a
  page-precision anchor for navigation and display; `mayBecomeEvidence` returns false for it at any
  precision.

### 4.3 Native citations

Where a provider returns span or page citations natively, they are **normalised into our anchor
model and then verified exactly like any other anchor** (§3). A vendor citation is trusted no
more than a located quote; it is simply cheaper to obtain.

## 5. Precision and confidence

| Precision | Typical origin | Confidence contribution |
|---|---|---|
| `exact` | Parser-minted; single-match quote location; BPMN/DMN element | Highest |
| `cell` | Spreadsheet range | High |
| `page` | Scanned page via vision; ambiguous quote with a page hint | Medium |
| `document` | Provider gave only document-level attribution | Low — permitted only for L2/L3 content, never for L1 evidence |

**Precision is a description, not a permission (§4.4).** A `page`- or `document`-precision anchor
records that the location is imprecise; it does not license an AI-extracted item whose location is
*ambiguous* to support a requirement. Those are different defects: imprecise means "we know roughly
where"; ambiguous means "we do not know which".

## 6. Highlighting

The source viewer renders highlights from a **logical-range → visual-rectangle map** produced
by the adapter. Consequences:

- One logical range may paint several rectangles (wrapping, bidi runs).
- A highlight must never be reconstructed by re-searching the rendered text in the browser —
  that reintroduces every normalisation and direction bug the pipeline exists to eliminate.
- For `image_region` anchors, the highlight is the stored rectangle over the page image.
- For `bpmn_element` / `dmn_rule` anchors, "highlighting" means selecting the element or row in
  the read-only viewer of the imported artifact.

## 7. Known hard cases

| Case | Handling |
|---|---|
| Arabic PDF with visual-order glyphs and presentation forms | Deterministic reordering and folding in the adapter (**Spike S2**). If unreliable for a document, fall back to page-image + vision with `image_region` anchors |
| Scanned document with no text layer | Rasterise; vision extraction; `image_region` anchors at `page` precision |
| Diagram image | Vision extraction; `image_region` anchors; capped at L2, element-wise human confirmation required |
| Merged cells and multi-row headers in spreadsheets | Anchor the full merged range; record the header interpretation as L2 |
| DOCX with tracked changes or comments | Parse the accepted text; comments become separate units; revision marks recorded |
| Quote spanning a page or block boundary | Anchor as a list of contiguous sub-ranges under one logical anchor |
| Duplicate identical text in one document | Requires a locating hint, else precision is demoted (§4.2) |
| Source re-uploaded with edits | A **new** `Source` that supersedes the old one. Old anchors remain valid against the old bytes; dependent requirements are flagged for revalidation |

## 8. Test obligations

CI assertions, per adapter:

1. **Round-trip:** for every `SourceUnit`, `resolve(anchor)` returns text equal to the unit's
   stored text.
2. **Checksum sensitivity:** mutating one character of the stored text turns the anchor
   `DRIFTED` or `BROKEN`, never silently `RESOLVED`.
3. **Bidi correctness:** for a mixed Arabic/English fixture, anchors resolve to the correct
   logical spans and produce the expected number of visual rectangles.
4. **Normalisation invariance:** the same logical content in NFC and NFD input yields identical
   anchors and identical stored text.
5. **Non-BMP safety:** a fixture containing supplementary-plane characters produces correct
   code-point offsets (this is the test that catches accidental UTF-16 arithmetic).
6. **Quote location:** the `post_hoc` locator finds quotes that differ from the source only by
   diacritics, Alef/Yeh variants, Tatweel, or digit form.
7. **Rejection:** an unlocatable quote never produces an `EvidenceItem`.
