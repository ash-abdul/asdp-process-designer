# ADR-0016: Immutable, Content-Addressed Artifact Versions

> **Status:** Approved · **Date:** 2026-08-22 · **Reversibility:** Hard
> **Related:** ADR-0017, ADR-0018, ADR-0032, docs/20-domain/artifact-model.md

## Context

Gates approve content. Approvals must bind to exactly the content reviewed, diffs must be
trustworthy, and a handed-off release must be provably identical to what was delivered. Mutable
records make all three impossible to guarantee.

Separately, XML reserialisation produces cosmetic differences that would churn hashes and flood
diffs with noise — and a noisy diff is a diff nobody reads.

## Decision

1. Artifact versions **MUST** be immutable. Every generation creates a new `ArtifactVersion`;
   nothing is updated in place.
2. Every version **MUST** be content-addressed by a hash over its **canonical serialisation**.
3. Canonicalisation **MUST** be specified and implemented per artifact kind: fixed namespace
   prefixes, declared attribute and element ordering, normalised whitespace, fixed numeric
   formatting, sorted JSON keys, LF endings, UTF-8 without BOM, and **NFC-normalised text**
   (ADR-0023).
4. Every version **MUST** record `compilerVersion`, `layoutEngineVersion`, `rulePackVersion`, and
   `camundaTargetProfileId`.
5. `Baseline`, `Approval`, `Release`, `Handoff`, `AuditEvent`, and `EvidenceItem` **MUST** be
   insert-only.
6. `ArtifactVersion.generatedBy` **MUST NOT** admit a `human` value.
7. Diffs **MUST** be semantic, not textual, and **MUST** classify changes as structural, contract,
   or cosmetic.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Mutable artifacts with an audit log | The log records that something changed, not what was approved. Approval binding becomes unprovable |
| Hash raw bytes without canonicalisation | Cosmetic reserialisation churns hashes; every diff shows noise; approvers stop reading diffs |
| Version only on approval | Loses intermediate history and makes iterative review impossible to reconstruct |
| Text diffs on XML | Unreviewable; a renamed label looks like a rewritten process |

## Consequences

**Positive**

- Approvals bind to exact content; a change automatically reopens the gate (ADR-0017).
- Reproducibility: same IR + same pinned tool versions → identical artifact, verified in CI.
- Handoff integrity: artifact hashes recorded at handoff enable exact three-way comparison later
  (ADR-0019).
- Bilingual stability: the same Arabic label in NFC and NFD input yields one hash.

**Negative**

- Storage grows monotonically. Accepted (ADR-0032).
- Canonicalisation is fiddly, easy to get subtly wrong, and must be implemented per kind — with
  the failure mode being hash churn that erodes trust in diffs.
- Semantic differs must be written for every artifact kind.

## Enforcement

- Insert-only enforced in the domain layer and by database constraints.
- CI: determinism test (two processes, identical output), canonical-stability test
  (parse→reserialise→identical hash), Unicode-stability test (NFC/NFD → one hash).
- `L1-SCH-007` validates canonical stability.
- An architecture test asserts no command mutates an `ArtifactVersion`.
