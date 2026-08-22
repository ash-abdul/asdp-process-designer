# ADR-0008: Resolvable Provenance Anchors Are Mandatory

> **Status:** Approved · **Date:** 2026-08-22 · **Reversibility:** Very hard
> **Related:** ADR-0007, ADR-0022, ADR-0023, docs/20-domain/provenance-and-anchoring.md

## Context

Traceability is a core product capability. The weakest possible implementation is a free-text
citation ("see the BRD, section 3"), which cannot be verified, cannot be highlighted, and rots
silently as documents change. The strongest is a machine-resolvable pointer that the system can
render as a highlight and re-verify at any time.

If anchors are unreliable, every claim the product makes about provenance is false — and it would
be false in a way nobody notices for months.

## Decision

Every `EvidenceItem` and every `SourceUnit` **MUST** carry a **resolvable** anchor.

An anchor **MUST**:

- resolve to an exact source region that the UI can render as a highlight;
- store offsets as **Unicode code-point indices over NFC-normalised, logical-order text** — never
  UTF-16 code units, never grapheme clusters, never visual order;
- store the **verbatim quote** and a **checksum of the anchored span**, verified on resolution;
- store the detected **language and base direction** of the span;
- record its **precision** (`exact` | `cell` | `page` | `document`), which feeds confidence.

An unresolvable anchor is a **hard error** at validation layer L0. It **MUST NOT** be stored
silently and **MUST NOT** be downgraded to a document-level reference to make it pass.

Where a provider cannot supply native citations, quotes **MUST** be located deterministically in
the normalised source text and an anchor minted from the match. **An unlocatable quote MUST NOT
become evidence.**

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Free-text citation | Unverifiable, unhighlightable, rots silently |
| Document-level attribution only | Cannot answer "which clause?", which is the question auditors actually ask |
| Trust provider-native citations without verification | A vendor citation is cheaper to obtain, not more trustworthy. It must be verified like any other |
| Fuzzy anchor matching as a general fallback | Hides real breakage behind plausible-looking highlights |

## Consequences

**Positive**

- Provenance is verifiable rather than asserted; the highlight either appears or the system fails
  loudly.
- Users detect extraction errors immediately, because they see the highlighted region.
- The traceability guarantee survives provider substitution: recall may drop on a weaker provider,
  provenance integrity does not (ADR-0022).
- Anchor drift after an adapter upgrade is detectable and repairable rather than silent.

**Negative**

- Adapter work is substantially harder, especially Arabic PDF extraction (Spike S2).
- Some AI-proposed content is discarded for want of a locatable quote, reducing recall.
- Every adapter needs round-trip, checksum-sensitivity, and non-BMP offset tests.

## Enforcement

- `EvidenceItem.anchorVerified` must be `true` to persist (domain invariant D1).
- Validation rules `L0-ING-002` and `L0-ING-003` are blocking errors.
- Per-adapter CI tests: anchor round-trip, checksum sensitivity, bidi correctness, non-BMP
  offsets, tolerant quote location, rejection of unlocatable quotes
  (docs/20-domain/provenance-and-anchoring.md §8).
- Anchor-resolution rate is an evaluation metric with a **target of 100%**; below that is a defect,
  not a score (docs/40-quality/ai-evaluation-framework.md §3.1).
