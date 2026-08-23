# ADR-0038: Target Verification versus Content Verification

> **Status:** **Approved** · **Date:** 2026-08-23 · **Reversibility:** Hard
> **Extends:** [ADR-0008](ADR-0008-resolvable-anchors.md) — it is not superseded; this record makes
> its resolution model explicit for anchors that have no ground-truth text.
> **Related:** [ADR-0007](ADR-0007-epistemic-ladder.md), [ADR-0011](ADR-0011-computed-confidence.md),
> [epistemic-model.md](../20-domain/epistemic-model.md),
> [provenance-and-anchoring.md](../20-domain/provenance-and-anchoring.md),
> [traceability-model.md](../20-domain/traceability-model.md)

## Context

V3 ingests screenshots and diagram images, whose content is read by a vision model. That breaks an
assumption every anchor in the system has relied on so far.

For a text source, [ADR-0008](ADR-0008-resolvable-anchors.md) verification is: slice the stored text
at the anchor's offsets, checksum it, compare to the recorded quote. This works because **the stored
text is ground truth independent of whatever produced the anchor.** A parser, an AI post-hoc quote
location, and a vendor citation are all checked against the same immovable thing.

**An image has no text layer.** The only text available is what the vision model reported. The
tempting design — store the vision transcript as the source's canonical text and resolve
`image_region` anchors against it — would verify **AI output against AI output**. The checksum would
always match. It would be a green light that means nothing, and it would be indistinguishable from
the real guarantee in every downstream report.

## Decision

**Provenance verification is two independent questions, and they must never be conflated.**

| | Question | Verifiable against |
|---|---|---|
| **Target verification** | Does the thing this anchor points at still exist, unchanged, and does the anchor address a real region of it? | The stored bytes — blob checksum, image identity and dimensions, page identity, rectangle bounds, element identity within a stored model file |
| **Content verification** | Is the recorded quote actually the content at that location? | Ground-truth text independent of the extractor |

1. **A deterministic textual source supports both.** `text_range`, `docx_block` and
   offset-bearing `pdf_region` anchors are verified on both axes, and only then does resolution
   report `resolved`.

2. **Visual evidence supports target verification only.** For an `image_region` anchor the system
   deterministically verifies: source/blob checksum, image identity, page identity where applicable,
   rectangle bounds, and continued existence of the target. **The AI-interpreted content within that
   region remains epistemically unverified** unless independently confirmed by a human.

3. **An AI-produced transcript is never treated as independent canonical truth.** It is not stored
   as the source's canonical text for the purpose of resolving anchors over that source.

4. **A distinct resolution state is introduced.** Resolution states become:

   | State | Meaning |
   |---|---|
   | `resolved` | Target verified **and** content verified |
   | **`content_unverified`** | **Target verified; the quoted content is an AI interpretation and is not independently verified** |
   | `drifted` | Content found at a small offset delta; repaired and flagged |
   | `broken` | Target missing or content not found — hard error |

   **`resolved` MUST NOT be reused for the visual case.** Reusing it would make a vision citation
   indistinguishable from a verified one wherever resolution status is reported, which is every
   overlay, every trace query and the AI-disclosure report.

5. **Structural model imports are content-verified.** `bpmn_element`, `dmn_rule` and `form_field`
   anchors resolve to `resolved`, because a deterministic parser read a structured file and the
   element identity is checkable against the stored bytes. They are `exact` precision.

### Naming

`content_unverified` was chosen over `target_verified` deliberately. Both are accurate, but the
state's job is to stop a consumer treating it as equivalent to full resolution, so the name states
**the limitation** rather than the reassurance. A reviewer reading `content_unverified` cannot
mistake it for a verification.

The name was checked for collision against the existing vocabularies it sits beside: resolution
states (`resolved`/`drifted`/`broken`), epistemic levels (`L0`–`L4`), and `Derivation`
(`extracted`/`interpreted`/`inferred`). It collides with none of them.

## Consistency with the approved epistemic model — verified, not assumed

This decision **introduces no new epistemic semantics.** Three checks were run against the approved
documents before writing it, and one corrected the reasoning that had been proposed for V3.

### 1. L1 is not restricted to deterministic parsers

[epistemic-model.md](../20-domain/epistemic-model.md) §1 defines L1 as *"a verbatim fact with a
resolvable anchor"*, created by *"**AI extraction or deterministic parser**"*.

So a cap on visual evidence **cannot** rest on the claim that "an AI read it, therefore it is an
interpretation". The V3 proposal's original reasoning was wrong on this point. What actually
disqualifies visual evidence from L1 is the **other** half of the definition: L1 requires a
*resolvable* anchor, and for an image only the target is resolvable. The content is not. The L1
precondition is therefore unmet — on the anchor, not on the author.

### 2. The cap is already in the approved specification

[provenance-and-anchoring.md](../20-domain/provenance-and-anchoring.md) §5 already states that
`page` and `document` precision are *"permitted only for L2/L3 content, **never for L1 evidence**"*.

`image_region` anchors are `page` precision by §5's own table. **The ceiling for visual evidence was
therefore already approved in Phase 0**; V3 implements it rather than inventing it.

### 3. Human confirmation does not promote L2 to L1

The promotion graph in epistemic-model.md §2 is `L1 → L2 → L4` and `L3 → L4`. **There is no
L2 → L1 transition, and none is created here.** Human element-wise confirmation of a diagram region
does not turn an interpretation into an extracted fact; it satisfies the confirmation requirement
that lets L2 content proceed toward L4, exactly as rule 6 of that section describes ("human edit of
L2/L3 content does not itself promote it").

### Resulting ceilings

| Evidence kind | Extraction | Ceiling | Grounded in |
|---|---|---|---|
| Text, Markdown, DOCX | Deterministic | **L1 attainable** | Verbatim + fully resolvable anchor |
| BPMN / DMN / Form import | Deterministic | **L1 attainable** | Same; `exact` precision |
| **Screenshot** | Vision | **L2** | `page` precision → never L1 (§5) |
| **Diagram image** | Vision | **L2**, plus element-wise human confirmation | §5, plus risk R5 |
| Scanned page | Vision | **L2** | §5. V2-PDF |

`anchorVerified` on `EvidenceItem` retains its meaning — *verification was performed and passed at
the level available for this anchor kind* — so invariants **D1** and **T1** hold unchanged for visual
evidence. What differs is the **resolution state**, which is where the distinction belongs.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| **Store the vision transcript as canonical text and resolve against it** | Verifies AI output against AI output. The checksum always matches, so the guarantee is vacuous while looking identical to the real one. This is the failure this ADR exists to prevent |
| Reuse `resolved` for visual evidence, and rely on `precision: page` to signal the difference | Precision is a confidence input, not a verification status. Every consumer that branches on resolution status would silently treat a vision citation as verified |
| Mark visual anchors `broken` | False. The target *is* verified, and `broken` triggers quarantine — it would make visual evidence unusable rather than appropriately qualified |
| Set `anchorVerified: false` for visual evidence | Violates invariant D1 and the SQL check constraint, and would mean "no verification happened" when verification did happen and passed |
| Cap visual evidence at L2 because "an AI read it" | Contradicts epistemic-model.md §1, which permits AI extraction to produce L1. The correct ground is the unresolvable content, not the author |

## Consequences

**Positive**

- A vision citation is **distinguishable from a verified one everywhere**, by a value a consumer must
  handle explicitly rather than by a convention someone must remember.
- The ceiling is derived from the approved specification, so no new epistemic meaning enters the
  system and the ladder stays four levels.
- One verification model covers text, images and structural imports, with the axis that differs made
  explicit rather than special-cased per adapter.
- Target verification is real work, not a formality: tampering with a stored image, or citing a
  rectangle outside its bounds, fails.

**Negative**

- Every consumer of resolution status must handle a fourth state. That is the point, but it is churn,
  and a consumer that ignores it degrades to treating visual evidence as unresolved rather than as
  verified — the safe direction, but still wrong.
- `content_unverified` is not a *failure*, so the reflex "anything other than resolved is a problem"
  is now incorrect. The validation rules state which states block which gate rather than leaving it
  to inference.
- Human confirmation of visual evidence becomes a real workflow obligation for diagram images, not an
  optional nicety.

## Enforcement

| Mechanism | Enforces |
|---|---|
| `ResolutionStatus` union in `@asdp/provenance` | A consumer cannot ignore the fourth state without a compile error where the union is exhausted |
| `contentVerifiability(anchorKind)` — a pure function | Which axis applies is derived from the anchor kind, never stored and never per-adapter |
| Target verification in the resolver | Blob checksum, bounds and element existence are checked, not assumed |
| Test: an `image_region` anchor **never** returns `resolved` | The distinction cannot regress into an equivalence |
| Test: tampered image bytes fail every anchor over them | Target verification is real |
| `ceilingFor(kind, extractionMethod)` — a pure function | The cap cannot drift from the source it describes, and cannot be edited (**D4**) |
