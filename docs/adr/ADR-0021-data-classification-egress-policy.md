# ADR-0021: Data Classification and AI Egress Policy

> **Status:** Approved · **Date:** 2026-08-22 · **Reversibility:** Hard
> **Related:** ADR-0020, ADR-0022, docs/10-architecture/data-governance.md

## Context

Phase 0 decision 1: do not assume all uploaded source material is allowed to leave the enterprise
environment, and allow future data-governance policies to determine which content may be sent to
which AI provider.

Requirement documents routinely contain personal data, commercial terms, and policy material whose
handling is constrained. A tool that reads whatever it is given and sends it wherever it is
configured is not deployable in that setting.

## Decision

1. Every content-bearing entity **MUST** carry a **classification**: `PUBLIC`, `INTERNAL`,
   `CONFIDENTIAL`, `RESTRICTED`, `PROHIBITED`.
2. The classification of a request **MUST** be the **maximum** over all its content items.
3. Classification **MAY** be raised by automation; **lowering MUST** be an explicit, role-gated,
   audited human act with a justification.
4. Every AI invocation **MUST** pass a single **egress policy gate**. No other path to a provider
   exists.
5. `RESTRICTED` and above **MUST NOT** reach an `external_hosted` provider. `PROHIBITED` content
   **MUST NOT** be processed by any AI.
6. A project **MUST** be configurable with `allowExternalProviders = false`.
7. A denial **MUST** be a first-class product outcome: it reports which classification blocked it,
   which providers were considered and why each was rejected, and what options remain. **It MUST
   NOT be silently degraded or silently retried elsewhere.**
8. Analysis Frame slots left unpopulated because of a denial **MUST** be marked
   `blocked_by_policy`, never `empty`.
9. Redaction, where applied, **MUST** be deterministic, locally reversible, recorded, and
   **MUST NOT** be treated as a licence to send `RESTRICTED` content externally. Token maps
   **MUST NOT** leave the enterprise.
10. Anchors **MUST** be computed against unredacted normalised text, so redaction never affects
    traceability.
11. Embeddings and vectors **MUST** be treated as derived content at the same classification.
    Embeddings are not anonymisation.
12. **There is no override for a denial.** Policy must be changed by an administrator, which is
    itself audited.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Project-level allow/deny only | Too coarse: one restricted appendix in an otherwise internal corpus would either block everything or leak |
| Redaction as the primary control | Redaction addresses content, not provenance or ownership. A restricted document remains restricted |
| Model-based content classification | Classifying content with a model is itself an egress event |
| Trust the network perimeter | Necessary as defence in depth, but it cannot distinguish task types or classifications |
| Allow an audited override for urgent cases | The same failure mode as an override editor: it becomes the default path |

## Consequences

**Positive**

- The product is deployable in a governed enterprise environment.
- A gap caused by governance is never mistaken for a gap in the source material — a distinction
  that matters enormously to an auditor reading a coverage report.
- Every routing decision is recorded and answerable: "what exactly was sent outside?"
- Fully on-premise operation is a supported configuration, not a fork.

**Negative**

- Analysis quality can be constrained by policy, and the product must be honest about it rather
  than quietly compensating.
- **Vision has no degradation path.** If no vision-capable provider is eligible, screenshots,
  diagram images, and scanned documents cannot be analysed at all in that project — a scope
  consequence recorded as open decision OD-1.
- Classification is user effort at intake, and mis-classification has real consequences.
- Redaction adds a pass, a token map to protect, and a confidence penalty.

## Enforcement

- The egress gate is the sole path to any provider; providers are unreachable from elsewhere
  (invariant I9).
- CI asserts at the **HTTP transport boundary** that a `RESTRICTED` payload never reaches an
  external adapter, that a `PROHIBITED` source produces no `AiInteraction`, and that token maps
  never appear in an outbound payload (Spike S6).
- `RafCoverage.status = blocked_by_policy` and rule `L5-AI-001` surface policy-caused gaps.
- The release AI-disclosure report includes a policy-blocked-analysis section.
