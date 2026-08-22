# ADR-0023: Unicode-First, Bilingual (Arabic/English) Text Architecture

> **Status:** Approved · **Date:** 2026-08-22 · **Reversibility:** Very hard
> **Related:** ADR-0008, ADR-0024, docs/10-architecture/multilingual-architecture.md

## Context

Phase 0 decision 2: Arabic and English are both in scope, including mixed documents, RTL content,
bilingual traceability, and Unicode-safe extraction and storage. UX localisation may be phased,
but the data model, evidence model, source anchoring, text processing, and rendering architecture
must not assume English-only content.

The expensive parts are not translation. They are **offset arithmetic in bidirectional text** and
**identifier generation** — both of which are extremely costly to retrofit, because every stored
anchor and every generated ID would have to be reworked.

## Decision

The following are **binding from Phase 0** and **MUST NOT** be phased:

1. **One text package owns all normalisation.** No other component normalises text or computes an
   offset.
2. **Every stored string MUST be NFC, in logical order, language-tagged (BCP-47).** Visual order is
   never stored.
3. **Two forms are maintained:** a *stored form* (verbatim, diacritics and Tatweel preserved) and a
   derived *match form* (diacritics stripped; Alef/Yeh/Hamza/Teh-Marbuta folded; Tatweel removed;
   Arabic-Indic digits folded; Latin case-folded) with an offset map back to the stored form.
4. **Offsets MUST be Unicode code-point indices** over the NFC stored text — never UTF-16 code
   units, never grapheme clusters.
5. **Every anchor MUST store the verbatim quote, a span checksum, the language, and the base
   direction**; PDF anchors store a **list** of visual rectangles, because one logical range may
   wrap into several.
6. **Bidi control characters are counted in offsets**, never stripped.
7. **Arabic PDF extraction MUST reconstruct logical order** using a Unicode Bidirectional Algorithm
   implementation, and **MUST fold presentation forms and ligatures** to base letters.
8. **Storage MUST use UTF-8 with ICU collation** and language-aware search over the match form.
9. **Rendering MUST use per-node `dir` from detected direction, CSS logical properties only, and
   bidi-isolated composition.** Mixed-direction text is never string-concatenated.
10. **`LocalizedText` MUST support translations with provenance; a translation MUST NOT replace or
    shadow the original.** Evidence quotes are always shown in their source language.
11. **Layout MUST be measured with the actual label content and font that will be rendered**
    (ADR-0014).
12. **Glossary terms MUST be bilingual by construction.**

Phaseable: Arabic UI chrome, message-catalogue completeness, Arabic-first UX conventions,
RTL-optimised diagram conventions, per-user locale preferences.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| English-first, add Arabic later | The retrofit cost is in anchors and identifiers; every stored anchor and generated ID would need rework |
| Store visual order as extracted from PDFs | Renderer-dependent, unstable, and breaks every offset |
| UTF-16 offsets (the JavaScript default) | Silently wrong for non-BMP characters; the bug appears months later in one document |
| Grapheme-cluster offsets | Unstable across ICU versions |
| Translate everything to English on ingest | Destroys evidence fidelity; a quote must be verbatim in its source language |

## Consequences

**Positive**

- Bilingual traceability works end to end: an Arabic policy clause anchors to an English
  requirement with the original quote retained and highlightable.
- No retrofit cost later; the expensive decisions are made once, correctly.
- Search, deduplication, and `post_hoc` quote location all work across Arabic orthographic
  variation, which is what makes citation recovery viable on Arabic sources (ADR-0022).
- Canonicalisation stability: the same Arabic label yields one hash regardless of input
  normalisation form.

**Negative**

- Arabic PDF extraction is the highest-uncertainty engineering task in the project (Spike S2), with
  a documented fallback to page-image + vision.
- Diagram label rendering in the BPMN viewer is unverified (Spike S3).
- Every text-handling test needs bilingual and non-BMP fixtures.
- Layout must be measured per display language, adding complexity to the layout pass.

## Enforcement

- `packages/text` is the only normalisation owner; a dependency rule prevents others from
  duplicating it.
- CI fixtures: round-trip anchors, checksum sensitivity, bidi correctness, **non-BMP offsets** (the
  test that catches accidental UTF-16 arithmetic), normalisation invariance, tolerant quote
  location.
- `L0-ING-004` requires NFC and a language tag; `L5-I18N-001..003` cover translation completeness,
  identifier safety, and bidi composition.
- E2E tests assert RTL rendering of labels, highlights, and forms.
