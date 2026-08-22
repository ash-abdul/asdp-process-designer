# ADR-0011: Computed Confidence, Not Model Self-Report

> **Status:** Approved · **Date:** 2026-08-22 · **Reversibility:** Moderate
> **Related:** ADR-0007, ADR-0020, ADR-0022, docs/20-domain/epistemic-model.md §4

## Context

Requirements must carry a confidence level. The easy implementation is to ask the model how
confident it is. Model self-assessment is weakly calibrated, varies between providers, and is not
comparable across them — which matters acutely here, because provider routing is policy-driven
(ADR-0021) and the same content may be analysed by different models in different projects.

## Decision

Confidence **MUST** be computed by a deterministic, versioned function in `packages/domain` over
these inputs:

```
extractionMode          extracted 1.0 | interpreted 0.6 | inferred 0.3
evidenceCount           0, 1, 2, 3+
sourceAuthorityRank     highest-authority supporting source
crossSourceAgreement    corroborated | silent | contradicted
anchorPrecision         exact > cell > page > document
providerCapabilityTier  MEASURED quality tier for the content's language
degradationPenalty      per degradation applied during extraction
                        → band: HIGH | MEDIUM | LOW
```

Model self-rating **MAY** be one input, weighted low. It **MUST NOT** be the band.

The UI **MUST** be able to explain any band in one sentence naming its dominant factors.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Model self-reported confidence | Poorly calibrated; not comparable across providers; would make a policy-driven provider switch look like a content change |
| Binary trusted/untrusted | Loses the gradation that gate policy and review prioritisation need |
| Confidence assigned by humans only | Does not scale to hundreds of requirements, and is exactly the tedium the product should remove |

## Consequences

**Positive**

- Comparable across providers, prompts, and time.
- Explainable: *"MEDIUM — interpreted from a single medium-authority source, no corroboration,
  extracted by the on-premise model at tier B."*
- **Policy-driven routing becomes visible in the epistemic record.** A requirement extracted by a
  lower-tier on-premise model is legitimately less confident, and the record says so rather than
  hiding it.
- Degradation (chunked context, `post_hoc` citations, redacted input) is reflected rather than
  invisible.

**Negative**

- Requires measured per-language provider quality tiers, which makes the evaluation harness
  mandatory infrastructure (ADR-0031).
- The weighting function needs calibration and will be adjusted; it is versioned so historical
  bands remain interpretable.

## Enforcement

- `confidenceFactors` is stored alongside the band, so the band is always reconstructible and
  explainable.
- The function is a pure, versioned function with unit tests over a fixture matrix.
- `L5-AI-002` warns when a requirement was produced by a provider below the profile's minimum
  quality tier for its language.
- Gate policy references bands, not raw model output.
