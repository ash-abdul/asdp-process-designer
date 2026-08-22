# AI Provider Abstraction

> **Status:** Approved (Phase 0) · **Version:** 1.0 · **Updated:** 2026-08-22
> **Related:** [ADR-0020](../adr/ADR-0020-ai-provider-abstraction.md), [ADR-0022](../adr/ADR-0022-capability-negotiation.md), [data-governance.md](data-governance.md), [ai-evaluation-framework.md](../40-quality/ai-evaluation-framework.md)

---

## 1. Requirement

The application MUST NOT depend on any single LLM vendor. It MUST support, behind one
interface:

- the Claude API,
- enterprise / private / self-hosted model endpoints,
- other approved LLM providers.

Provider selection MUST be governed by data-classification policy, not by code. Content that
may not leave the enterprise MUST NOT be routed to an external provider under any
circumstance.

## 2. The three-layer design

```
         AI TASK LAYER  (what we need done — provider-agnostic, versioned)
   ┌───────────────────────────────────────────────────────────────────────┐
   │ EXTRACT_EVIDENCE · PROFILE_SOURCE · CANONICALISE_ENTITIES ·           │
   │ POPULATE_FRAME · RECONCILE_SOURCES · ANALYSE_QUALITY ·                │
   │ SYNTHESISE_QUESTIONS · DECOMPOSE_PROCESS · PROPOSE_DECISION_SPEC ·    │
   │ PROPOSE_FORM_SPEC · PROPOSE_INTERFACE_SPEC · REFINE_IR ·              │
   │ PROPOSE_TEST_DATA · TRANSLATE_TEXT · EXPLAIN_ELEMENT ·                │
   │ NARRATE_IMPACT · NARRATE_DIVERGENCE · DRAFT_DOCUMENTATION            │
   │                                                                       │
   │ Each task declares: input schema · output schema · REQUIRED and       │
   │ OPTIONAL capabilities · quality tier · max acceptable degradation     │
   └───────────────────────────────┬───────────────────────────────────────┘
                                   │
         ORCHESTRATION LAYER  (the Proposal Broker — one choke point)
   ┌───────────────────────────────▼───────────────────────────────────────┐
   │ 1. classify content        →  data classification of every input item │
   │ 2. EGRESS POLICY GATE      →  which providers are ELIGIBLE at all     │
   │ 3. capability negotiation  →  what can the eligible providers do      │
   │ 4. routing decision        →  choose provider + model + settings      │
   │ 5. degradation planning    →  how to achieve the task with what we got│
   │ 6. context assembly        →  chunking, caching, citation strategy    │
   │ 7. invoke via port         →  with retries and schema enforcement     │
   │ 8. post-process            →  verify citations, resolve anchors       │
   │ 9. emit Proposal + record  →  AiInteraction, provenance, cost         │
   └───────────────────────────────┬───────────────────────────────────────┘
                                   │  AiProvider port
         PROVIDER LAYER  (adapters — the only code that knows a vendor)
   ┌───────────────────┬───────────┴───────────┬───────────────────────────┐
   │ ClaudeAdapter     │ PrivateEndpointAdapter│ <FutureProviderAdapter>   │
   │ (external, hosted)│ (self-hosted / VPC)   │                           │
   └───────────────────┴───────────────────────┴───────────────────────────┘
```

**No component outside the provider layer may reference a vendor SDK, model identifier, or
vendor-specific request shape.** No component outside the orchestration layer may reach a
provider at all.

## 3. The `AiProvider` port (conceptual)

```
AiProvider {
  id                 stable identifier, e.g. "claude-hosted", "asdp-private-llm"
  descriptor()       → ProviderDescriptor      // static + discovered capabilities
  health()           → Health
  invoke(request)    → AiResponse              // streaming or buffered
  estimateCost(req)  → CostEstimate
  countTokens(input) → TokenCount              // provider-native where available
}

AiRequest {                                    // fully provider-neutral
  taskType, taskVersion
  systemInstruction, messages[]                // text · image · document parts
  outputContract   { mode: schema | tool | text, schema? }
  citationMode     none | native | post_hoc
  determinism      { temperatureTier: deterministic | balanced | creative }
  reasoningTier    minimal | standard | deep
  budget           { maxOutputUnits, maxLatencyMs }
  cacheHints       { stablePrefixBoundary? }
  languageHints    [bcp47]
}

AiResponse {
  outputs[]              // parsed, schema-validated
  citations[]            // normalised to our Anchor model where supported
  usage                  { inputUnits, cachedInputUnits, outputUnits, costEstimate }
  providerMeta           { providerId, modelId, capabilityTier, requestId }
  degradations[]         // which capabilities were unavailable and what we did
}
```

### 3.1 Deliberate neutrality choices

| Neutral concept | Rather than | Why |
|---|---|---|
| `reasoningTier` | vendor thinking/effort parameters | Vendors differ in name, shape, and availability |
| `determinism.temperatureTier` | raw temperature | Some providers reject or ignore sampling parameters |
| `outputContract.mode` | a specific structured-output API | Schema-constrained output, tool-calling, and prompt-plus-repair are all valid implementations |
| `inputUnits` / `outputUnits` | "tokens" | Tokenisation differs; **Arabic tokenises very differently from English** and per-provider counting is mandatory ([multilingual-architecture.md](multilingual-architecture.md) §7) |
| `citationMode` | a vendor citation feature | Native citations exist on some providers only; `post_hoc` is our fallback |
| `cacheHints.stablePrefixBoundary` | vendor cache-control markers | Adapters translate or ignore |

## 4. Capability descriptor

Each adapter declares what it can do. Capabilities are **declared in configuration and
verified by a conformance probe** at startup and on a schedule — a descriptor that claims a
capability the endpoint does not honour is a configuration defect that must fail loudly.

```
ProviderDescriptor {
  providerId, displayName, deploymentClass  external_hosted | vpc | on_premise
  models[] {
    modelId, displayName
    contextUnits                 // usable input budget
    maxOutputUnits
    capabilities {
      vision                     bool     // images, screenshots, diagram reading
      documentInput              bool     // native PDF/DOCX ingestion
      nativeCitations            bool     // span/page-anchored citations
      schemaConstrainedOutput    bool
      toolCalling                bool
      strictToolSchemas          bool
      promptCaching              bool
      batchProcessing            bool
      streaming                  bool
      reasoningControl           none | tiered | budgeted
      arabicQualityTier          A | B | C | unknown   // from our own evals
      englishQualityTier         A | B | C | unknown
    }
    costModel { inputUnitCost, cachedInputUnitCost, outputUnitCost, currency }
    dataHandling { retentionDays, trainingOptOut, residencyRegion }
  }
}
```

`arabicQualityTier` and `englishQualityTier` are **measured by our own evaluation harness**
([ai-evaluation-framework.md](../40-quality/ai-evaluation-framework.md)), never taken from
vendor claims. This is what allows the router to prefer one provider for Arabic evidence
extraction and another for English reconciliation, on evidence.

## 5. Task capability requirements

Each AI task declares required and optional capabilities. The broker refuses to run a task
whose REQUIRED capabilities cannot be satisfied by any eligible provider.

| Task | REQUIRED | Strongly preferred | Notes |
|---|---|---|---|
| `PROFILE_SOURCE` | structured output | — | Cheap, low stakes |
| `EXTRACT_EVIDENCE` (text) | structured output | native citations, large context, prompt caching | Without native citations → `post_hoc` verification is mandatory |
| `EXTRACT_EVIDENCE` (image/scan/diagram) | **vision** | — | No vision ⇒ task refused, not degraded. Manual transcription offered |
| `CANONICALISE_ENTITIES` | structured output | — | |
| `POPULATE_FRAME` | structured output | large context, prompt caching | Chunked map-reduce if context is small |
| `RECONCILE_SOURCES` | structured output | **large context** | Most context-sensitive task; degradation cost is highest here |
| `ANALYSE_QUALITY` | structured output | deep reasoning | |
| `SYNTHESISE_QUESTIONS` | structured output | — | |
| `DECOMPOSE_PROCESS` | structured output | deep reasoning | Highest-consequence generation |
| `PROPOSE_DECISION_SPEC` | structured output | deep reasoning | Output is verified by exact algorithms afterwards |
| `PROPOSE_FORM_SPEC` | structured output | — | |
| `PROPOSE_INTERFACE_SPEC` | structured output | — | |
| `REFINE_IR` | structured output | deep reasoning | Schema is restrictive; IR invariants checked after |
| `PROPOSE_TEST_DATA` | structured output | — | |
| `TRANSLATE_TEXT` | — | Arabic tier A/B | Provenance-recorded; never overwrites the original |
| `EXPLAIN_ELEMENT` / `NARRATE_*` | — | — | Commentary only; lowest stakes |

## 6. Degradation ladder

When a preferred capability is unavailable, the broker follows a **declared** ladder. Every
degradation is recorded on the proposal, propagates into confidence
([ADR-0011](../adr/ADR-0011-computed-confidence.md)), and is visible in the UI and in the
AI-disclosure report.

| Missing capability | Degradation | Cost |
|---|---|---|
| **Native citations** | `post_hoc`: require verbatim quotes in the structured output, then **deterministically locate each quote in the normalised source text** and mint the anchor ourselves. Quotes that cannot be located are rejected, and the item is demoted to interpretation (L2) or dropped | Extra pass; some recall loss; anchors still resolvable — the traceability guarantee is preserved |
| **Large context** | Chunked map-reduce: per-chunk extraction → deterministic merge → a reconciliation pass over *summarised* chunk outputs. Chunk boundaries follow document structure, never mid-sentence | Cross-document reasoning quality drops; confidence reduced; `RECONCILE_SOURCES` flagged as degraded |
| **Schema-constrained output** | Tool-calling; else prompt-plus-validate with a bounded repair loop (max 3 attempts) against the same schema, then hard failure | Latency and cost; never a relaxed schema |
| **Prompt caching** | Recompute prefixes; enable batch processing where available; reduce pass count by merging compatible passes | Cost only |
| **Document input** | Deterministic pre-extraction to normalised text + page images, then send text/images | Layout fidelity loss; anchors unaffected (we anchor to our own parse anyway) |
| **Vision** | **No degradation.** Task refused. The affected sources are marked `requires_vision_capability` and the user is offered manual transcription or an alternate provider | Explicit and visible |
| **Deep reasoning** | Decompose the task into smaller deterministic-boundary sub-tasks; raise the human-review requirement on the output | More human review |

**Rule:** degradation may reduce recall, raise cost, or increase required human review. It may
**never** weaken a schema, drop the citation requirement, or produce an unanchored requirement.

## 7. Routing

```
route(task, contentItems) :
  1. classification  = max(classificationOf(item) for item in contentItems)
  2. eligible        = providers where egressPolicy.permits(classification, provider, task)
                       └── if empty → REFUSE with an explanatory result (never silently downgrade)
  3. capable         = eligible where descriptor satisfies task.REQUIRED
                       └── if empty → REFUSE with the specific missing capability named
  4. ranked          = sort capable by
                         (a) policy preference order
                         (b) measured quality tier for the dominant content language
                         (c) capability completeness against task.PREFERRED
                         (d) cost estimate
                         (e) health / latency
  5. selected        = ranked[0];  plan = degradationPlan(task, selected)
  6. record          = { classification, eligible, selected, rejected+reasons, plan }
```

The routing record is stored on the `AiInteraction` and is queryable. "Why did this
requirement come from the on-premise model?" must always be answerable.

### 7.1 Configuration surface

Routing is **configuration, not code** — per environment, per project, per task type:

```
aiRouting:
  defaultProvider: claude-hosted
  providers:
    - id: claude-hosted        enabled: true   deploymentClass: external_hosted
    - id: asdp-private-llm     enabled: true   deploymentClass: on_premise
  taskOverrides:
    EXTRACT_EVIDENCE:   preferenceOrder: [claude-hosted, asdp-private-llm]
    TRANSLATE_TEXT:     preferenceOrder: [asdp-private-llm, claude-hosted]
    EXPLAIN_ELEMENT:    preferenceOrder: [asdp-private-llm]
  projectOverrides:
    "<projectId>":     allowExternalProviders: false      # fully on-premise project
```

A project MUST be configurable as **fully on-premise**: all tasks routed to private endpoints,
with tasks whose required capabilities are unavailable refused rather than downgraded.

## 8. MVP provider obligations

The MVP must ship with **two adapters** so the abstraction is proven rather than theoretical:

1. **ClaudeAdapter** — external hosted, full capability set. Used for development where
   permitted.
2. **PrivateEndpointAdapter** — a generic adapter for an OpenAI-compatible or
   custom-HTTP private endpoint, with a configurable capability descriptor and a
   deliberately reduced default capability set (no native citations, smaller context, no
   caching). This exercises every rung of the degradation ladder in CI.

A **NullProvider** is also required for tests: it refuses every task, proving that the
application remains navigable and honest with no AI available at all.

## 9. Conformance test suite

One provider-agnostic suite runs against every adapter, in CI and against a live endpoint on
demand:

| Test group | Asserts |
|---|---|
| Descriptor honesty | Every declared capability is actually honoured by the endpoint |
| Schema conformance | Structured output validates for all task schemas, including Arabic content |
| Citation fidelity | Every returned citation resolves to a real region of the source |
| Degradation correctness | With each capability disabled, the ladder produces valid, anchored output |
| Language parity | Same gold corpus in Arabic and English; per-language quality tier recorded |
| Egress compliance | A restricted-classification payload never reaches an external adapter (asserted at the transport boundary) |
| Cost and unit accounting | Reported usage is consistent and non-zero |
| Failure behaviour | Timeouts, rate limits, refusals, and malformed responses all surface as typed, retryable errors |

Provider parity results feed the quality tiers in the descriptor, closing the loop.

## 10. What this costs us

Stated plainly so the trade-off is owned:

- We cannot lean on any vendor's newest convenience feature as a load-bearing dependency;
  each becomes an optional capability with a fallback.
- Native citations, the cleanest provenance mechanism, must have a `post_hoc` equivalent
  that we build and maintain.
- Prompt-cache economics vary by provider, so cost forecasting is per-provider.
- The evaluation harness becomes mandatory rather than optional, because routing decisions
  depend on measured quality.

The abstraction is worth it: without it, a data-governance decision could invalidate the
architecture. With it, a governance decision changes a configuration file.
