# AI Evaluation Framework

> **Status:** Approved (Phase 0) · **Version:** 1.0 · **Updated:** 2026-08-22
> **Related:** [ADR-0031](../adr/ADR-0031-corpus-as-data.md), [ai-provider-abstraction.md](../10-architecture/ai-provider-abstraction.md), [data-governance.md](../10-architecture/data-governance.md)

Per Phase 0 decision 6: the product must ultimately be validated on representative real-world
ASDP requirement material; Phase 0 may use representative or sanitised samples; the analysis
must not be optimised exclusively around synthetic documents; and the framework must accept real
corpora later **without redesign**.

Because provider routing depends on measured quality
([ai-provider-abstraction.md](../10-architecture/ai-provider-abstraction.md) §7), this harness
is mandatory infrastructure, not optional tooling.

---

## 1. Corpus as data, not code

A corpus is a **registered dataset**, never checked into the application repository as fixtures.

```
Corpus {
  id, name, tier
  tier   synthetic | sanitised | representative | real
  storageRef                        // classification-appropriate location
  classification                    // governs which providers may be evaluated on it
  languages[]                       // ar, en, mixed
  documents[] { sourceKind, language, pageCount, provenance }
  goldSetRef?                       // labels, if any
  createdBy, createdAt, notes
}
```

| Tier | Content | Storage | Providers evaluable |
|---|---|---|---|
| `synthetic` | Written by the team to exercise mechanics | In-repo | All |
| `sanitised` | Real documents with identifiers and figures replaced | Restricted store | Per classification |
| `representative` | Real documents from a comparable domain, permitted for use | Restricted store | Per classification |
| `real` | Actual ASDP requirement material | Enterprise store only | **On-premise providers only unless explicitly cleared** |

**The harness never assumes a corpus is available in-repo.** It resolves a corpus by ID from a
configured store. This is the property that lets real corpora arrive later with no redesign
([ADR-0031](../adr/ADR-0031-corpus-as-data.md)).

### 1.1 Guarding against synthetic over-fitting

Explicit rules, because Phase 0 decision 6 names this risk directly:

1. **Prompt and schema changes may not be accepted on synthetic evidence alone** once any
   sanitised or representative corpus exists.
2. Every evaluation report states its corpus tier prominently. A metric measured only on
   `synthetic` is labelled as such and is not usable to justify a routing decision.
3. Synthetic corpora are **held to a lower weight** in the composite quality score than
   sanitised/representative ones.
4. A **held-out** corpus is never used for prompt iteration — only for final measurement.
5. When real material becomes available, the harness re-runs the full history of prompt versions
   against it, so we learn where synthetic evaluation misled us rather than quietly moving on.

## 2. Gold sets

A gold set is human-labelled expected output for a corpus, versioned independently of the corpus.

| Gold set | Labels |
|---|---|
| Evidence extraction | Expected evidence items with anchors and verbatim quotes |
| Frame population | Expected slot assignment per requirement |
| Conflict detection | Known contradictions between documents, with the correct precedence outcome |
| Gap detection | Known missing information |
| Ambiguity detection | Spans a human analyst marked ambiguous |
| Entity canonicalisation | Expected merge sets for actors, terms, data fields |
| Decomposition | A reference ProcessSpec produced by an experienced architect |
| Decision extraction | Expected DecisionSpec rows |

Labelling is expensive, so gold sets are built incrementally and partial gold sets are
first-class: a metric computed over a labelled subset is reported with its coverage.

## 3. Metrics

### 3.1 Extraction and analysis

| Metric | Definition |
|---|---|
| Evidence precision | Extracted items that are correct and correctly anchored / all extracted |
| Evidence recall | Correct items found / all gold items |
| **Anchor resolution rate** | Extracted items whose anchor resolves and whose quote verifies. **Target: 100%** — below 100% is a defect, not a score |
| Anchor precision distribution | Share at `exact` / `cell` / `page` / `document` |
| Slot assignment accuracy | Correct RAF slot / all assigned |
| Gap detection recall | Known gaps surfaced / all known gaps |
| Conflict detection recall & precision | Against labelled contradictions |
| Ambiguity agreement | Overlap with human-marked ambiguity spans |
| Canonicalisation F1 | Merge decisions vs. gold merge sets |
| Hallucination rate | Items with no locatable source that were **not** marked as inference. **Target: 0** |

The last metric is the most important one in this document. An uncited claim presented as
extracted fact is the failure mode the whole architecture is built to prevent, and it must be
measured, not assumed away.

### 3.2 Decomposition and generation

| Metric | Definition |
|---|---|
| Step recall / precision | Against the reference ProcessSpec |
| Structural similarity | Region-tree edit distance to the reference |
| Decision identification recall | Decisions found / decisions in the reference |
| IR invariant pass rate | Proposals that pass IR-1…IR-20 unmodified |
| Layout quality on generated output | Metric compliance rate ([layout-architecture.md](../30-generation/layout-architecture.md)) |

### 3.3 Human-in-the-loop signals (measured in production, not in the lab)

| Metric | Why it matters |
|---|---|
| **Proposal acceptance rate** per task | The primary product quality signal |
| **Edit rate** and edit magnitude | A ~100% raw-accept rate is a **warning** (rubber-stamping), not a success ([product-charter.md](../00-product/product-charter.md) S8) |
| Rejection reasons | Directly drives prompt work |
| Question usefulness | Share of generated questions that produced a requirement change |
| Time to G1 | Whether the tool actually reduces analysis effort |
| Rework rate after G2 | Whether decomposition proposals are trustworthy |

### 3.4 Cost and operations

Input/output units per pass, cost per project, cache-hit ratio, latency distribution, degradation
frequency by kind, and egress-denial frequency.

## 4. Provider parity — the routing input

The same corpus and gold set are run against every configured provider, per language.

```
ParityReport {
  corpusId, goldSetRef, corpusTier
  providers[] {
    providerId, modelId, capabilityTier
    metricsByLanguage { ar: {...}, en: {...}, mixed: {...} }
    degradationsApplied[]
    costPerRun, latencyP50, latencyP95
    conformanceResult
  }
  recommendedRoutingByTask[]
}
```

This produces the `arabicQualityTier` / `englishQualityTier` values in the provider descriptor.
**Per-language measurement is not optional**: a provider strong on English and weak on Arabic is
a realistic and consequential case, and routing must be able to act on it.

## 5. Reproducibility

| Property | Mechanism |
|---|---|
| Deterministic replay | AI responses recorded per (corpus, prompt version, provider, model, settings); replayed in CI without provider calls |
| Pinned inputs | Corpus version, gold set version, prompt version, provider, model, settings all recorded on every run |
| No network in CI | The default CI evaluation runs entirely from recordings; live runs are explicit and scheduled |
| Drift detection | Scheduled live runs compare against recordings; a divergence is a signal that a provider changed under us |

Provider drift detection matters: a hosted model updated silently can change extraction
behaviour, and without a scheduled live comparison we would discover it through a user complaint.

## 6. Governance of evaluation

| Concern | Rule |
|---|---|
| Corpus classification is enforced | Evaluating a `RESTRICTED` corpus on an external provider is **denied** by the same egress gate as production ([data-governance.md](../10-architecture/data-governance.md)) |
| Real-material access is role-gated | Held in the enterprise store; access audited |
| Recordings inherit classification | A recording of a restricted-corpus response is restricted |
| Reports state tier and provider explicitly | So a quality claim can never be over-read |

## 7. Phasing

| Phase | Evaluation state |
|---|---|
| **P0** | Harness skeleton, corpus registry, one synthetic corpus, anchor-resolution and hallucination metrics, replay infrastructure |
| **P1–P2** | Gold sets for evidence extraction and frame population; provider conformance suite; first parity report |
| **P3–P5** | Decomposition and decision gold sets; layout quality tracking |
| **P6–P8** | Production human-in-the-loop metrics; scheduled drift detection |
| **P9** | **Real ASDP corpora introduced**; full prompt-version history re-run against them; routing re-derived from real measurements |

The framework is built in Phase 0 precisely so that step P9 is a data-loading exercise rather
than a project.
