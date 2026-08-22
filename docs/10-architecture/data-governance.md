# Data Classification and AI Egress Policy

> **Status:** Approved (Phase 0) · **Version:** 1.0 · **Updated:** 2026-08-22
> **Related:** [ADR-0021](../adr/ADR-0021-data-classification-egress-policy.md), [ai-provider-abstraction.md](ai-provider-abstraction.md), [audit-and-compliance.md](../50-governance/audit-and-compliance.md)

---

## 1. Governing assumption

> **Do not assume that uploaded source material may leave the enterprise environment.**

Every piece of content is classified, and classification determines which AI providers — if
any — may receive it. This is enforced at a single choke point in the AI Orchestration layer
and is asserted at the transport boundary in tests.

## 2. Classification model

### 2.1 Levels

| Level | Meaning | Default AI routing |
|---|---|---|
| `PUBLIC` | Already published or publishable | Any enabled provider |
| `INTERNAL` | Ordinary business content, not for publication | Any provider permitted by policy |
| `CONFIDENTIAL` | Commercially or personally sensitive | Approved providers only; redaction applied where configured |
| `RESTRICTED` | Must not leave the enterprise boundary | **On-premise / VPC providers only.** External providers structurally unreachable |
| `PROHIBITED` | Must not be processed by any AI | Deterministic parsing and human review only |

Levels are ordered. The classification of a request is the **maximum** over all its content
items — never an average, never the classification of the "main" document.

### 2.2 What carries a classification

| Entity | Classification source |
|---|---|
| `Source` | Set at upload: uploader-declared, defaulted by project policy, and optionally raised by automated detection |
| `SourceUnit` / `EvidenceItem` | Inherited from the source; may be **raised** by detection, never lowered |
| `DataField` | Independently classified; `piiFlag` and `sensitivity` |
| `Requirement` | Derived as the maximum over its evidence and referenced data fields |
| `Project` | A ceiling and a floor: the maximum classification it may hold, and the minimum applied to everything in it |

Classification can only ever be **raised** by automation. Lowering is an explicit, audited,
role-gated human act with a recorded justification.

### 2.3 Automated detection (assistive, never authoritative)

Deterministic detectors run at ingest and flag candidates for human confirmation:
national ID and passport patterns, IBAN and card patterns, phone and email patterns,
salary and financial-figure patterns, health and legal keywords, and document markings
("Confidential", "سري", "للاستخدام الداخلي"). Detection is bilingual and pattern-based, not
model-based — a model call to classify content would itself be an egress event.

## 3. The egress policy gate

Every AI invocation passes through one gate. There is no other path to a provider.

```
egressDecision(task, contentItems, provider) :
  classification = max(item.classification for item in contentItems)

  if classification == PROHIBITED                       → DENY (no AI processing at all)
  if provider.deploymentClass == external_hosted
       and classification >= RESTRICTED                 → DENY
  if project.allowExternalProviders == false
       and provider.deploymentClass == external_hosted  → DENY
  if task.egressCategory not in policy.allowedTasks[classification]
                                                        → DENY
  if classification >= CONFIDENTIAL and policy.requireRedaction
       → require a successful redaction plan, else       DENY

  → ALLOW  with { redactionPlan?, retentionRequirement, residencyRequirement }
```

### 3.1 Denial is visible, never silent

A denial is a **first-class product outcome**, not an error to swallow:

- the pass reports which classification blocked it, which providers were considered, and why
  each was rejected;
- the user is offered concrete options: use an on-premise provider, redact and retry,
  reclassify with justification (if authorised), or proceed with deterministic parsing plus
  manual analysis;
- affected Analysis Frame slots are marked `blocked_by_policy` rather than `empty`, so a gap
  caused by governance is never mistaken for a gap in the source material.

That last point matters: a coverage dashboard that shows "no SLA information found" when the
truth is "we were not allowed to read the SLA document" would be actively misleading.

## 4. Redaction

Redaction is deterministic, reversible **locally only**, and recorded.

```
RedactionPlan {
  items[] { anchor, detectorId, category, replacementToken }
  tokenMap                 // held in the enterprise only, NEVER sent to a provider
  coverage                 // what fraction of detected sensitive spans is covered
}
```

- Placeholders are stable and typed (`⟦PERSON_1⟧`, `⟦IBAN_2⟧`, `⟦AMOUNT_3⟧`) so the model can
  still reason about structure and reference.
- **Rehydration happens locally** after the response returns, before the proposal is stored.
- Anchors are computed against the **unredacted** normalised text, so traceability is
  unaffected by redaction.
- Redaction is recorded on the `AiInteraction`; a requirement derived from redacted input is
  marked as such, because a model reasoning over `⟦AMOUNT_3⟧` may have missed a magnitude-
  dependent implication.
- Redaction is **not** a licence to send `RESTRICTED` content externally. Restriction is
  about the document's provenance and ownership, not only its literal contents.

## 5. Provider-side data handling requirements

Every provider entry declares, and the policy may require:

| Property | Policy use |
|---|---|
| `deploymentClass` | `external_hosted` \| `vpc` \| `on_premise` — the primary routing discriminator |
| `retentionDays` | A maximum may be required per classification (e.g. zero retention for `CONFIDENTIAL`) |
| `trainingOptOut` | May be mandatory above `INTERNAL` |
| `residencyRegion` | May be constrained per classification |
| `subprocessors` | Recorded for audit |

These are configuration, verified in the provider conformance suite where technically
verifiable and otherwise treated as contractual assertions recorded in the audit trail.

## 6. Storage, transport, and residency

| Concern | Rule |
|---|---|
| Source bytes | Stored inside the enterprise boundary, encrypted at rest, never relocated by the application |
| Page images | Derived artifacts, same classification as their source, same storage rules |
| Prompt/response audit payloads | Stored inside the boundary; a full-fidelity record is required for audit ([audit-and-compliance.md](../50-governance/audit-and-compliance.md)) and therefore inherits the highest classification of its content |
| Vectors / embeddings | Treated as derived content at the same classification as their source. Embeddings are **not** anonymisation. If embeddings are computed by an external provider, that is an egress event and is gated identically |
| Transport | TLS everywhere; provider endpoints pinned by configuration; no default-egress network posture for the application container |
| Backups | Inherit classification; residency constraints apply |

## 7. Interaction with confidence and disclosure

Governance decisions affect the epistemic record, which is why this document is not purely
operational:

| Situation | Effect |
|---|---|
| Task ran on a lower-quality-tier provider because of policy | Confidence reduced; the provider and tier are recorded on the requirement |
| Task ran on redacted input | Recorded; requirement marked `derivedFromRedactedInput` |
| Task was degraded (e.g. chunked because the eligible provider has small context) | Degradation recorded; confidence reduced |
| Task was denied | Frame slot marked `blocked_by_policy`; visible in the coverage dashboard and in the release AI-disclosure report |

The release **AI-disclosure report** therefore states not only what rests on inference, but
what could not be analysed at all because of data policy. An auditor reading a release needs
both.

## 8. Administration

| Capability | Role |
|---|---|
| Define classification levels and detector configuration | Platform Admin |
| Define provider entries, deployment classes, and data-handling declarations | Platform Admin |
| Define the egress policy matrix (classification × task × provider) | Platform Admin, with change audit |
| Set project-level `allowExternalProviders` and classification ceiling | Platform Admin or Project Owner |
| Classify a source at upload | Any contributor (may raise, not lower) |
| Lower a classification | Explicit role, justification required, audited |
| Override a denial | **Not possible.** There is no override; policy must be changed by an admin, which is itself audited |

## 9. Test obligations

These are non-negotiable CI assertions:

1. A `RESTRICTED` payload never reaches an `external_hosted` adapter — asserted by
   intercepting at the HTTP transport boundary, not by inspecting the router's intent.
2. A `PROHIBITED` source produces no `AiInteraction` of any kind.
3. Redaction tokens are never accompanied by their token map in any outbound payload.
4. A denied pass produces `blocked_by_policy` frame slots, not `empty` ones.
5. Lowering a classification without the required role fails and is audited.
6. Anchors computed under redaction resolve correctly against unredacted source text.
