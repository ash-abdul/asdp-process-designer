# Audit and Compliance

> **Status:** Approved (Phase 0) · **Version:** 1.0 · **Updated:** 2026-08-22
> **Related:** [ADR-0032](../adr/ADR-0032-retain-everything.md), [data-governance.md](../10-architecture/data-governance.md), [governance-and-gates.md](governance-and-gates.md)

The Compliance reviewer is a first-class persona. This document specifies what they can rely on.

---

## 1. The audit log

Append-only. No update path, no delete path, no administrative purge.

```
AuditEvent {
  id, at
  actor                     // authenticated subject
  rolesAtTime[]             // resolved roles at the moment of the action
  tokenIssuer               // which IdP asserted the identity
  action                    // typed action name
  entityType, entityId, entityVersion?
  before, after             // classification-aware; see §2
  correlationId             // request or job that caused it
  gateContext?              // gate and baseline, when relevant
}
```

Recorded actions include: source upload and classification changes, every AI interaction, every
proposal acceptance/edit/rejection, every entity version, every gate transition and approval,
every waiver, every directive, every generation and validation run, every release, every
handoff, every observation upload, and every policy or configuration change.

## 2. AI interaction record

Every AI call is logged in full, by the broker rather than by callers, so it cannot be bypassed
([architecture-overview.md](../10-architecture/architecture-overview.md) I8).

```
AiInteraction {
  id, projectId, at
  taskType, taskVersion, promptVersion         // prompt referenced by hash
  providerId, modelId, capabilityTier
  deploymentClass                              // external_hosted | vpc | on_premise
  routingRecord {
    contentClassification
    eligibleProviders[], rejectedProviders[] with reasons
    selectedProvider, degradationPlan
  }
  redaction { applied, detectorIds[], spanCount }
  request  { systemInstructionRef, contentRefs[], outputContract, settings }
  response { outputRefs[], citationCount, degradations[] }
  usage    { inputUnits, cachedInputUnits, outputUnits, costEstimate, latencyMs }
  proposalId?
  humanVerdict  accepted | edited | rejected | pending
  verdictBy, verdictAt
}
```

**"Why did this requirement come from the on-premise model?"** and **"what exactly was sent
outside the enterprise?"** must both be answerable from this record alone. That is the design
requirement.

### 2.1 Prompt and response payloads

- Stored **inside the enterprise boundary**, referenced from the interaction record.
- Inherit the highest classification of their content, and are access-controlled accordingly.
- **Never written to application logs** — logs carry references and metadata only
  ([deployment-architecture.md](../10-architecture/deployment-architecture.md) §7).
- Redaction token maps are stored separately and are never included in any outbound payload or
  export.

## 3. Disclosure reporting

Two reports that distinguish this product from a generator with a log.

### 3.1 AI-disclosure report (per release)

| Section | Content |
|---|---|
| Inference exposure | How many design elements rest on L2 interpretation, how many on L3 inference, and **which ones** |
| Confirmation record | Which L3 requirements a human explicitly confirmed, by whom, when |
| Extraction quality | Requirements produced under degradation (chunked context, `post_hoc` citations), and requirements derived from redacted input |
| **Policy-blocked analysis** | RAF slots marked `blocked_by_policy`: what could not be analysed, which classification blocked it, and what was done instead |
| Provider attribution | Which provider and model produced each content group, and at which measured quality tier |
| Prompt provenance | Prompt versions in force, by hash |

The policy-blocked section is essential. An auditor reading a release needs to know not only
what rests on inference but **what was never analysed at all**, and why.

### 3.2 Directive log (per release)

Human shape decisions taken above the requirements layer: kind, scope, parameters, rationale,
author, and affected elements. A Camunda engineer receiving the package deserves to know which
structure came from policy and which came from an architect's judgement
([generation-directives.md](../30-generation/generation-directives.md) §6).

## 4. Evidentiary chain

For any element in any handed-off release, the following must be reconstructible **from the
retained record alone**, without the application being able to recompute it:

```
element
  → compiled_to → specification element
    → requirement(s), with epistemic level, confidence, and confirmation record
      → evidence item(s), with verbatim quote and resolvable anchor
        → source file, with hash and the exact region
          → who uploaded it, when, at what classification
and, in parallel:
  → the approval that promoted each requirement, by whom, on which baseline hash
  → the validation run that supported each gate
  → the AI interactions that produced each proposal, with provider and model
  → the directives that influenced the element's shape
```

This is what the traceability matrix plus the audit log plus the disclosure reports jointly
deliver ([traceability-model.md](../20-domain/traceability-model.md) §6).

## 5. Retention

**Retain everything, indefinitely** ([ADR-0032](../adr/ADR-0032-retain-everything.md)):

| Retained forever | Note |
|---|---|
| Source bytes | Superseded sources marked, never deleted |
| Evidence items | Immutable by construction |
| All entity versions and supersession chains | IDs never reused |
| All baselines, approvals, validation runs | Insert-only |
| All releases and handoffs | Frozen |
| All AI interactions, prompts, responses | Classification-controlled |
| The audit log | Append-only |

A governed design tool that garbage-collects its own audit trail has no reason to exist. If
retention limits are ever required, they will be a policy layer over an intact record, not a
deletion path in the domain.

## 6. Access

| Role | Audit access |
|---|---|
| `ComplianceReviewer` | Read-only access to everything: audit log, AI interactions, prompts/responses within classification limits, all reports |
| `PlatformAdmin` | Same, plus configuration history |
| Project members | Their project's audit trail and reports |
| Nobody | Write, edit, or delete access to any audit record |

Access to audit data is itself audited.

## 7. Export

| Export | Format | Use |
|---|---|---|
| Traceability matrix | CSV/XLSX, bilingual | Auditor's primary artifact |
| Audit log extract | JSONL, filtered by project and date range | External audit, incident review |
| Approval register | CSV | Governance reporting |
| AI-disclosure report | Markdown, in the release package | Handoff and audit |
| Directive log | Markdown, in the release package | Handoff |
| Validation report | Markdown, in the release package | Handoff |

Exports are generated deterministically from retained data, are themselves audited, and carry
the classification of their content.

## 8. Compliance posture statements the product can support

Because of the above, the product can substantiate — with evidence rather than assertion — each
of the following:

1. Every executable element traces to an approved business requirement.
2. Every approved requirement traces to a source document region, or is disclosed as inference
   with a named human confirmation.
3. No AI system approved any requirement or artifact.
4. Every approval was made against exact, hashed content and specific validation evidence.
5. It is recorded which content was sent to which AI provider, under which data classification,
   and which content was never sent at all.
6. Changes made in Camunda after handoff were never silently overwritten.
7. Every generated artifact is reproducible from its recorded inputs and pinned tool versions.
