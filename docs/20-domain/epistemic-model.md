# Epistemic Model — The Four-Level Ladder

> **Status:** Approved (Phase 0) · **Version:** 1.0 · **Updated:** 2026-08-22
> **Related:** [ADR-0007](../adr/ADR-0007-epistemic-ladder.md), [ADR-0011](../adr/ADR-0011-computed-confidence.md), [traceability-model.md](traceability-model.md)

The product must always distinguish extracted fact, AI interpretation, AI recommendation, and
human-approved requirement. This document formalises that as a ladder with mechanical
promotion rules.

---

## 1. The ladder

| Level | Name | Definition | Created by | Editable | Flows past G1 |
|---|---|---|---|---|---|
| **L0** | **Source** | Original bytes as uploaded | Upload | Never | — |
| **L1** | **Evidence** | A verbatim fact with a resolvable anchor. No interpretation, no restatement, no normalisation of meaning | AI extraction or deterministic parser | **Never** — only re-extracted | Only via L4 |
| **L2** | **Interpretation** | The AI's reading of evidence: restated, normalised, classified, or combined | AI | Yes, by a human | Only via L4 |
| **L3** | **Recommendation** | AI-proposed content with **no direct source** — inferred gap-fill, best practice, industry default | AI | Yes, by a human | Only via L4, **with explicit confirmation** |
| **L4** | **Approved Requirement** | Human-signed | **Human act only** | Only by creating a new version | Yes — **only L4 flows downstream** |

## 2. Promotion and demotion rules

```
L1 ──┐
     ├──▶ L2 ──┐
L3 ──┘         ├──▶ L4        promotion to L4 is ALWAYS an explicit human act,
               │              recorded with actor, timestamp, and baseline
    (direct) ──┘

L4 ──▶ superseded    when a new version is approved
L4 ──▶ stale         automatically, when a supporting source is superseded
L2/L3 ──▶ rejected   human act; retained, never deleted
```

**Mechanical rules:**

1. **No AI-originated command may create or set L4.** This is enforced by the dependency rule
   that `packages/ai` cannot import a domain write path
   ([module-map.md](../10-architecture/module-map.md) §3), and by domain invariant D3.
2. **L1 is immutable.** Correcting evidence means re-extracting it, which creates new evidence
   and leaves the old record in place. An "edited fact" is a contradiction in terms.
3. **L3 requires an `inferenceRationale`.** A recommendation with no stated reasoning cannot be
   persisted (invariant D2).
4. **A LOW-confidence L3 requirement may never sit on an executable path.** Validation layer
   L4 raises an error, not a warning, when an artifact element traces only to unconfirmed
   inference.
5. **Demotion is automatic and visible.** If a source is superseded, requirements derived from
   it are flagged for revalidation rather than silently invalidated or silently kept.
6. **Human edit of L2/L3 content does not itself promote it.** Editing produces an edited
   proposal; approval is a separate act. This prevents "I fixed the wording" from being
   mistaken for "I verified the substance".

## 3. Visual and reporting treatment

| Requirement | Rule |
|---|---|
| Distinguishable without colour alone | Badge + icon + text label, not colour coding. Accessibility and print/export both require it |
| Visible everywhere the entity appears | Requirement lists, specification editors, artifact inspector, overlays, diffs, exports |
| Propagated downstream | A BPMN element whose requirement chain includes unconfirmed L3 content is marked in the epistemic overlay |
| Counted, not just shown | The release **AI-disclosure report** states how many design elements rest on L2 interpretation and how many on L3 inference, and lists them |

The counting matters more than the marking. A reviewer approving a release needs a number:
"7 of 41 elements rest on AI inference with no direct source" is actionable; a scattering of
badges is not.

## 4. Confidence — computed, not self-reported

Model self-assessment is one weak signal among several. Confidence is a **deterministic
function** in `packages/domain`, versioned, and explainable in the UI
([ADR-0011](../adr/ADR-0011-computed-confidence.md)).

```
confidence = f(
  extractionMode          extracted 1.0 | interpreted 0.6 | inferred 0.3
  evidenceCount           0, 1, 2, 3+
  sourceAuthorityRank     the highest-authority supporting source
  crossSourceAgreement    corroborated | silent | contradicted
  anchorPrecision         exact span > sheet cell > page > document > none
  providerCapabilityTier  measured quality tier for the content's language
  degradationPenalty      per degradation applied during extraction
) → band: HIGH | MEDIUM | LOW
```

Two inputs come from the AI provider layer and exist because of the provider abstraction:

- **`providerCapabilityTier`** — a requirement extracted by a lower-tier on-premise model is
  legitimately less confident than one extracted at full capability. Policy-driven routing must
  not be invisible in the epistemic record.
- **`degradationPenalty`** — chunked map-reduce extraction, `post_hoc` citation resolution, or
  redacted input each reduce confidence by a declared amount.

The UI must always be able to explain a band in one sentence, for example:
*"MEDIUM — interpreted from a single medium-authority source, no corroboration, extracted by
the on-premise model at tier B."*

## 5. Gate coupling

| Condition | Effect |
|---|---|
| Any requirement below L4 in the set | G1 blocked (D4) |
| Any LOW-confidence requirement | Requires explicit human confirmation before G1 |
| Any L3 requirement | Requires explicit confirmation, recorded separately from ordinary approval |
| Any unconfirmed L3 on an executable path | G3 blocked by validation rule `L4-TRACE-005` |
| Redacted-input or degraded-extraction provenance | Not blocking, but surfaced in the G1 review summary and the release report |

## 6. Worked example

```
L0  policy.pdf, page 7                     (uploaded, immutable)

L1  EvidenceItem
    verbatim: "يجب إتمام التحقق من الهوية خلال ثلاثة أيام عمل"
    anchor:   pdf_region { page 7, bbox[…], codepoints 1204–1257 }
    language: ar   citationMode: native   anchorVerified: true

L2  Interpretation → Requirement REQ-0031 (draft)
    text.primary (en): "Identity verification must complete within 3 business days."
    text.translations: [ar original retained]
    derivation: interpreted   confidence: HIGH
    evidence: [the L1 item]

L3  Recommendation → Requirement REQ-0032 (draft)
    text: "If verification exceeds 3 business days, escalate to the Compliance Officer."
    derivation: inferred
    inferenceRationale: "The source states a deadline but no consequence. An SLA without
                         an escalation path is unenforceable; escalation target inferred
                         from the RACI table in sop-v2.docx §4."
    confidence: LOW   humanConfirmationRequired: true

L4  Business Owner reviews both.
    REQ-0031 → approved as written.
    REQ-0032 → edited (target changed to "Operations Supervisor") then approved,
               with the edit and the original AI text both retained.

    Only now may either requirement produce a SpecStep or SpecEscalation.
```

The escalation task that eventually appears in the generated BPMN is therefore traceable to
REQ-0032, which is traceable to an explicit human confirmation of an AI inference, which is
traceable to the absence of a consequence clause on page 7 of a policy document. That full
chain — including the fact that a human had to supply the answer — is what the audit trail
must contain.
