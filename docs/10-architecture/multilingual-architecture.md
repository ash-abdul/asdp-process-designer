# Multilingual Architecture — Arabic and English

> **Status:** Approved (Phase 0) · **Version:** 1.0 · **Updated:** 2026-08-22
> **Related:** [ADR-0023](../adr/ADR-0023-unicode-bilingual-architecture.md), [ADR-0024](../adr/ADR-0024-ascii-identifiers-unicode-names.md), [provenance-and-anchoring.md](../20-domain/provenance-and-anchoring.md)

---

## 1. Requirement

Arabic and English are both in scope, including mixed-language documents and RTL content. UX
localisation may be phased, but the **data model, evidence model, source anchoring, text
processing, and rendering architecture MUST NOT assume English-only content**.

This is a from-day-one architectural constraint because the expensive parts — offset
arithmetic in bidirectional text, and identifier generation — are extremely costly to
retrofit.

## 2. Text normalisation — the `text` package

One pure package owns all text handling. No other component performs normalisation, and no
other component may compute an offset.

### 2.1 The canonical pipeline

```
raw bytes
  → encoding detection (declared → BOM → heuristic; UTF-8 assumed on tie)
  → decode to Unicode
  → NFC normalisation                      ← the ONE canonical form we store
  → Arabic presentation-form folding       ← U+FE70–U+FEFF → base letters
  → ligature decomposition                 ← e.g. U+FEFB (lam-alef) → لا
  → Tatweel (U+0640) handling: preserved in stored text, ignored for matching
  → bidi control-character inventory       ← recorded, not stripped
  → LOGICAL-ORDER guarantee                ← never store visual order
  → language segmentation (per run, BCP-47)
  → normalised text + offset map back to the raw source
```

**Every stored string is NFC, in logical order, language-tagged.** This is invariant I10 in
[architecture-overview.md](architecture-overview.md).

### 2.2 Matching vs. storage

Two forms are maintained for every text run:

| Form | Purpose | Rules |
|---|---|---|
| **Stored form** | Display, quoting, evidence text | NFC, logical order, diacritics and Tatweel preserved verbatim |
| **Match form** | Deduplication, quote location, search | Additionally: Arabic diacritics (harakat U+064B–U+0652) stripped; Alef variants (أ إ آ ٱ) folded to ا; Yeh variants (ي ى ئ) folded; Teh Marbuta (ة) folded to ه for search only; Hamza normalised; Tatweel removed; Arabic-Indic digits (٠-٩) folded to ASCII; case-folded for Latin |

The match form is **derived, never stored as truth**, and an offset map back to the stored
form is maintained so a match in the match form yields an anchor into the stored form. This
matters because AI providers return quotes that may differ from the source in exactly these
respects, and `post_hoc` citation resolution
([ai-provider-abstraction.md](ai-provider-abstraction.md) §6) depends on tolerant matching
that still produces an exact anchor.

## 3. Anchoring in bidirectional text

This is the single most failure-prone area. Rules are absolute:

| Rule | Reason |
|---|---|
| Offsets are **Unicode code-point indices over the NFC-normalised stored text** | UTF-16 code-unit offsets break on non-BMP characters; grapheme-cluster indices are unstable across ICU versions |
| Offsets are **never** derived from visual order | Visual order depends on the renderer, the surrounding text, and the paragraph direction |
| Every anchor stores the **verbatim quote plus a checksum of the anchored span** | Anchor drift becomes detectable rather than silent; resolution verifies the quote and fails loudly on mismatch |
| Every anchor stores the **detected language and base direction** of its span | Required for correct highlighting and for `<bdi>` isolation |
| PDF anchors store a **bounding-box list**, not a single box | An RTL span that wraps produces multiple visual rectangles for one logical range |
| Bidi control characters are counted in offsets | Stripping them silently shifts every subsequent offset |

### 3.1 PDF extraction is a known hard problem

Arabic PDF text extraction commonly yields: glyphs in **visual** order; **presentation forms**
rather than base letters; **decomposed or ligated** clusters; and reversed digit runs. The
adapter must therefore, deterministically:

1. extract glyph runs with per-glyph coordinates;
2. detect run direction from Unicode bidi properties, not from coordinates;
3. reorder to **logical** order using a Unicode Bidirectional Algorithm implementation;
4. fold presentation forms and ligatures to base letters;
5. reassemble words and record, for every logical character range, its visual rectangles.

**This is Spike S2 in [phase-0-tasks.md](../60-plan/phase-0-tasks.md) and it is a genuine
technical risk.** If a given PDF cannot be extracted reliably, the documented fallback is to
treat the page as an image and use vision extraction, with anchors as image regions — which
is why `image_region` anchors are first-class and not a second-class citizen.

## 4. Storage

| Concern | Decision |
|---|---|
| Encoding | UTF-8 everywhere; database, object store, APIs, exports |
| Database collation | ICU collation with an explicitly configured locale; never a byte-order default. Arabic and English sort correctly and predictably |
| Search | Language-aware indexing: separate analysis configuration per language, with the match form used for tokenisation |
| Language tags | BCP-47 on every human-authored or extracted text field (`ar`, `en`, `ar-AE`, `und` when undetermined) |
| Mixed-language fields | A field may carry `primaryLanguage` plus a run inventory; multi-language values use a `LocalizedText` shape (below) |
| Comparison and dedup | Always on the match form; never on raw bytes |

### 4.1 `LocalizedText` (conceptual)

```
LocalizedText {
  primary        { lang, text, direction }        // the authoritative value
  translations[] { lang, text, direction,
                   producedBy: human | ai,
                   aiInteractionId?, reviewedBy? } // NEVER replaces primary
  runs[]         { start, end, lang, direction }   // for mixed content
}
```

Translation is an AI task with full provenance. **A translation never overwrites or shadows
the original**, and evidence quotes are always shown in their original language, optionally
accompanied by a translation that is visibly marked as such.

## 5. Identifiers vs. display names

Technical identifiers MUST be ASCII; display names MUST preserve Unicode
([ADR-0024](../adr/ADR-0024-ascii-identifiers-unicode-names.md)).

| Thing | Rule |
|---|---|
| BPMN/DMN element IDs, process keys, decision keys, form IDs | ASCII `NCName`-safe: `[A-Za-z_][A-Za-z0-9_.-]*`. Generated by deterministic slug + transliteration + numeric discriminator |
| Process variable names, FEEL identifiers, job types | **ASCII only.** Arabic variable names would work in some places and fail in others across FEEL, connectors, worker code, and logging — an unacceptable class of latent runtime defect |
| Element and field display names (`name`, labels, documentation) | Full Unicode, language-tagged, RTL-safe |
| Glossary terms | Bilingual by construction: `termAr`, `termEn`, synonyms in both |

Transliteration is deterministic and reversible-by-lookup, not phonetic guesswork: the
generated ID is a slug plus a stable discriminator, and the mapping ID→display name is stored.
A step named `التحقق من الهوية` yields something like `Task_verify_identity_1` **only** if an
English name or glossary translation exists; otherwise it yields a stable transliterated or
sequential ID such as `Task_altahaqquq_min_alhawiya_1` or `Task_0007`, with the Arabic name
carried as the display name. Which of these is chosen is
[Open Decision OD-4](../60-plan/open-decisions.md).

## 6. Rendering

| Concern | Rule |
|---|---|
| Direction | `dir` is set per text node from detected direction, never inherited from the UI locale. Mixed content uses `<bdi>` or `unicode-bidi: isolate` |
| Layout | CSS **logical properties** only (`margin-inline-start`, not `margin-left`); no physical directional assumptions in any component |
| Concatenation | **Never** string-concatenate mixed-direction text with punctuation or numbers. All composition goes through a bidi-safe formatter that inserts isolates |
| Numbers and dates | Locale-aware formatting; Arabic-Indic digit display is a user preference, stored data is ASCII digits |
| Source viewer | Highlight overlays are computed from the logical-range → visual-rectangle map, so a single logical range may paint several rectangles |
| Diagram labels | BPMN labels may be Arabic. Renderer RTL behaviour must be verified — **Spike S3**. If label rendering is inadequate, the mitigation is to render labels via an overlay layer we control rather than the renderer's native text |
| Fonts | A bundled font stack with full Arabic coverage; no reliance on system fonts |
| Exported documents | Traceability matrices, reports, and generated Markdown must be bidi-safe: RTL cells in tables, isolates around mixed runs |

## 7. AI and language

| Concern | Decision |
|---|---|
| Token accounting | Arabic tokenises very differently from English on most tokenisers — often materially more units per character. Context budgeting MUST use provider-native counting, never a character heuristic ([ai-provider-abstraction.md](ai-provider-abstraction.md) §3.1) |
| Quality measurement | Per-language quality tiers are measured by our own evaluation harness on parallel Arabic/English gold corpora, and drive routing |
| Prompting | System instructions are English (stable, cache-friendly); content is passed in its original language and models are instructed to **quote evidence verbatim in the source language** |
| Requirement language | A requirement records its authoring language. A project may standardise requirement text in one language while evidence remains in another — this is normal and must be first-class |
| Mixed-document handling | Language segmentation runs before extraction so per-run language is known and quality expectations can differ within one document |
| Chunking | Chunk boundaries respect document structure and never split a bidirectional run mid-sequence |

## 8. Bilingual traceability

The traceability chain must survive language boundaries end to end:

```
Arabic policy PDF (page 7, RTL span, ar)
   → EvidenceItem  { verbatim Arabic quote, anchor with visual rectangles, lang: ar }
     → Requirement { primary: English statement (project standard),
                     translations: [ar draft],
                     evidence: [the Arabic quote] }
       → SpecStep  { name: LocalizedText{ en, ar } }
         → BPMN element { id: ASCII, name: display language per user preference }
```

Requirements are:

- **displayed in the user's preferred language** where a translation exists, always marked
  when shown in translation;
- **always presented alongside the original evidence quote in its source language**;
- **searchable in both languages** via the match form;
- **exported bilingually** where both forms exist — the traceability matrix carries source
  language, quote, and requirement text.

## 9. Phasing

| Now (Phase 0 → MVP) | Later |
|---|---|
| Unicode-safe storage, NFC, ICU collation | Full Arabic UI chrome |
| Code-point anchors with quote + checksum verification | Arabic-first UX conventions and layouts |
| Bidi-safe rendering primitives, logical CSS properties, `<bdi>` composition | Complete message catalogue translation |
| Arabic PDF extraction pipeline (S2) and diagram-label rendering (S3) | Arabic-language help and onboarding |
| Bilingual glossary, `LocalizedText`, translation-with-provenance | RTL-optimised diagram layout conventions |
| Per-language AI quality measurement and routing | Locale-specific number/date preferences per user |

**What must not be phased:** anything in §2, §3, §4, and §5. Those are the retrofit-expensive
parts, and they are the reason this document exists in Phase 0.
