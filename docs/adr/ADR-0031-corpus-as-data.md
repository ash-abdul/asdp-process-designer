# ADR-0031: Evaluation Corpus as Data, Not Code

> **Status:** Approved · **Date:** 2026-08-22 · **Reversibility:** Easy
> **Related:** ADR-0011, ADR-0020, ADR-0021, docs/40-quality/ai-evaluation-framework.md

## Context

Phase 0 decision 6: the product must ultimately be validated using representative real-world ASDP
requirement material; Phase 0 may use representative or sanitised samples; the analysis must not be
optimised exclusively around synthetic test documents; and the evaluation framework must accept
real corpora later **without redesign**.

Two forces make this more than a testing concern. First, real requirement material is classified
and cannot be committed to a source repository. Second, **provider routing depends on measured
per-language quality** (ADR-0011, ADR-0020), so the evaluation harness is production
infrastructure, not a test convenience.

## Decision

1. A corpus **MUST** be a **registered dataset resolved by ID from a configured store**, never
   in-repo fixtures. The harness **MUST NOT** assume a corpus is present in the repository.
2. Corpora **MUST** carry a **tier**: `synthetic`, `sanitised`, `representative`, `real`; and a
   **classification**, which governs which providers may be evaluated on them **through the same
   egress gate as production** (ADR-0021).
3. Gold sets **MUST** be versioned independently of corpora, and **partial gold sets MUST be
   first-class** — a metric over a labelled subset is reported with its coverage.
4. Anti-over-fitting rules **MUST** apply:
   - once any sanitised or representative corpus exists, prompt and schema changes **MUST NOT** be
     accepted on synthetic evidence alone;
   - every report **MUST** state its corpus tier prominently, and a synthetic-only metric
     **MUST NOT** justify a routing decision;
   - synthetic corpora **MUST** be weighted lower in composite quality scores;
   - a **held-out** corpus **MUST NOT** be used for prompt iteration;
   - when real material arrives, the **full history of prompt versions MUST be re-run against it**.
5. AI responses **MUST** be recorded and replayable so CI evaluation runs with no network access;
   scheduled live runs **MUST** compare against recordings to detect provider drift.
6. Recordings **MUST** inherit their corpus classification.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| In-repo fixture corpora | Real material cannot be committed; and it would guarantee synthetic-only evaluation |
| Wait for real corpora before building the harness | Prompt work would start unmeasured, and routing decisions would be unfounded |
| Manual periodic evaluation | Not reproducible; not a CI gate; drift undetected |
| Evaluate on external providers regardless of classification | Would violate ADR-0021 in the one place it is easiest to forget |

## Consequences

**Positive**

- Real corpora slot in later as a data-loading exercise, exactly as Phase 0 decision 6 requires.
- Classification-aware evaluation means we can measure an on-premise provider on restricted
  material without violating policy.
- Provider drift becomes detectable, which matters because a silently updated hosted model could
  change extraction behaviour without notice.
- Corpus tier appears on every report, so a quality claim cannot be over-read.

**Negative**

- Restricted-corpus storage and access control are real operational work.
- Gold-set labelling is expensive and will always lag the corpora.
- Some metrics will be measurable only on synthetic material for a while, and must be labelled as
  such rather than quietly presented as validation.

## Enforcement

- The corpus registry resolves by ID; the harness has no in-repo corpus path.
- Evaluation invocations pass through the production egress gate, and CI asserts that a restricted
  corpus never reaches an external adapter.
- Report generation fails if the corpus tier is absent.
- A CI check rejects a prompt-version change whose only supporting evidence is a `synthetic`-tier
  report, once a higher-tier corpus is registered.
