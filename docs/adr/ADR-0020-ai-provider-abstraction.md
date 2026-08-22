# ADR-0020: AI Provider Abstraction

> **Status:** Approved · **Date:** 2026-08-22 · **Reversibility:** Hard
> **Related:** ADR-0021, ADR-0022, docs/10-architecture/ai-provider-abstraction.md

## Context

Phase 0 decision 1: the application must not be architected as dependent on a single vendor API.
It must support the Claude API, enterprise/private model endpoints, and potentially other approved
providers. Future data-governance policy must determine which content may be sent to which
provider, and not all uploaded source material may leave the enterprise environment.

Without abstraction, a governance decision — "this project's documents may not leave" — would
invalidate the architecture rather than change a configuration file.

## Decision

All AI access **MUST** go through an `AiProvider` port with a provider-neutral request and response
model. Provider adapters are the **only** code permitted to reference a vendor SDK, model
identifier, or vendor-specific request shape.

The request model **MUST** be neutral in its concepts:

| Neutral | Rather than |
|---|---|
| `reasoningTier` | vendor thinking/effort parameters |
| `determinism.temperatureTier` | raw sampling parameters |
| `outputContract.mode` | a specific structured-output API |
| `inputUnits` / `outputUnits` | "tokens" |
| `citationMode` | a vendor citation feature |
| `cacheHints.stablePrefixBoundary` | vendor cache-control markers |

Each adapter **MUST** publish a `ProviderDescriptor` declaring context budget, capabilities
(vision, document input, native citations, schema-constrained output, tool calling, caching,
batch, streaming, reasoning control), cost model, data-handling properties, and **measured
per-language quality tiers**.

Routing **MUST** be configuration — per environment, per project, per task type — and a project
**MUST** be configurable as fully on-premise.

Token accounting **MUST** use provider-native counting. Character-based estimation is prohibited,
because Arabic tokenises very differently from English.

The MVP **MUST** ship at least: a Claude adapter, a generic private-endpoint adapter with a
deliberately reduced capability set, and a null adapter that refuses every task.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Direct vendor SDK usage | A governance decision would become a rewrite; and the strongest vendor features would become load-bearing |
| A thin wrapper over one vendor's shape | Leaks that vendor's concepts into every task; other providers become second-class |
| An off-the-shelf multi-provider library | Imposes its own abstraction, typically lowest-common-denominator, with no capability negotiation or egress gating — which are the two things we actually need |
| Support two providers with parallel code paths | Duplicated logic; divergent behaviour; no single egress choke point |

## Consequences

**Positive**

- A data-governance decision changes configuration, not architecture.
- Fully on-premise projects are possible.
- Provider substitution is measurable rather than a leap of faith, because quality tiers are
  measured by our own harness.
- One choke point for egress policy, cost metering, and audit (invariants I8, I9).

**Negative**

- No vendor's newest convenience feature can be load-bearing; each becomes an optional capability
  with a fallback (ADR-0022).
- Native citations — the cleanest provenance mechanism — require a `post_hoc` equivalent that we
  build and maintain.
- Cost forecasting becomes per-provider.
- The evaluation harness becomes mandatory infrastructure rather than optional tooling
  (ADR-0031).

## Enforcement

- Dependency rule: vendor SDKs may be imported only within `packages/ai/adapters`. Violations fail
  CI.
- No component outside the orchestration layer may reach a provider.
- A provider conformance suite runs against every adapter, asserting descriptor honesty, schema
  conformance, citation fidelity, degradation correctness, language parity, and egress compliance.
