# ADR-0032: Retain Everything

> **Status:** Approved · **Date:** 2026-08-22 · **Reversibility:** Easy
> **Related:** ADR-0016, ADR-0021, docs/50-governance/audit-and-compliance.md

## Context

The product's value is an auditable chain of custody from source material to executable artifact.
That chain must remain reconstructible long after the project, the toolchain, and possibly the
people have moved on — including for a release handed off years earlier.

Any deletion path in the domain is a hole in that chain, and holes in audit trails are discovered
at the worst possible moment.

## Decision

The application **MUST** retain, indefinitely and without a deletion path in the domain:

- source bytes (superseded sources marked, never deleted);
- evidence items (immutable by construction);
- all entity versions and supersession chains — **identifiers are never reused**;
- all baselines, approvals, and validation runs (insert-only);
- all releases and handoffs (frozen);
- all AI interactions, including prompt and response payloads, subject to classification-based
  access control;
- the complete append-only audit log, including rejected proposals and rejected requirements.

**No administrative purge, no soft-delete, no retention job MUST exist in the domain.** If a
retention policy is ever required, it **MUST** be implemented as a policy layer over an intact
record — never as a deletion path built into the model.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Configurable retention windows | The audit chain would develop holes exactly where old releases still matter |
| Delete rejected proposals and requirements | A rejection is evidence of due diligence; deleting it destroys the record that review happened |
| Archive to cold storage with deletion after N years | Acceptable as an operational tier later; not as a domain capability now |
| Delete prompt/response payloads after use | Removes the ability to explain why a requirement was extracted the way it was |

## Consequences

**Positive**

- The evidentiary chain in docs/50-governance/audit-and-compliance.md §4 is always reconstructible.
- Reproducibility: a past release can be explained and, given pinned tool versions, regenerated.
- Rejected content is retained, so "we considered and rejected this" is provable.
- No risk of a retention job silently breaking traceability.

**Negative**

- Storage grows monotonically — dominated by source blobs, page images, and AI payloads.
- Classification-based access control must be applied to a growing archive.
- Right-to-erasure style requirements, if they ever apply to personal data inside source documents,
  would need a deliberate, separately designed mechanism. **This is flagged as a known future
  tension rather than pre-solved**, because a general deletion capability would undermine the
  guarantee this ADR exists to provide.

## Enforcement

- Insert-only enforced in the domain layer and by database constraints for `Baseline`, `Approval`,
  `Release`, `Handoff`, `AuditEvent`, and `EvidenceItem`.
- Domain invariant D15: identifiers are never reused.
- An architecture test asserts no delete or purge command exists for the retained entity types.
- Storage growth is a monitored operational metric, so it is managed by capacity planning rather
  than by deletion.
