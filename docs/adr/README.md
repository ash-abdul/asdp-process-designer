# Architecture Decision Records

> **Status:** Phase 0 set complete, awaiting approval · **Updated:** 2026-08-22

An ADR records one decision, its context, and its consequences. **Where an ADR and a
specification document disagree, the ADR wins** and the document is a defect.

Statuses: `Proposed` · `Approved` · `Superseded by ADR-XXXX` · `Deprecated`.
An approved ADR is never edited to change its decision — it is superseded by a new one.

---

## Index

### Product boundary

| ADR | Title | Reversibility |
|---|---|---|
| [0001](ADR-0001-requirements-driven-product-boundary.md) | Requirements-Driven Product Boundary | **Very hard** |
| [0002](ADR-0002-spec-layer-editing.md) | Spec-Layer Editing, Artifact-Layer Read-Only | **Very hard** |
| [0003](ADR-0003-no-override-editor.md) | No Override Editor for Generated Artifacts | Hard |
| [0015](ADR-0015-read-only-viewers.md) | Read-Only Artifact Viewers | Moderate |

### AI boundary and epistemics

| ADR | Title | Reversibility |
|---|---|---|
| [0004](ADR-0004-ai-proposes-code-commits.md) | AI Proposes, Deterministic Code Commits | **Very hard** |
| [0005](ADR-0005-ir-first-compilation.md) | AI Never Emits Artifact Serialisations | **Very hard** |
| [0007](ADR-0007-epistemic-ladder.md) | Four-Level Epistemic Ladder | **Very hard** |
| [0008](ADR-0008-resolvable-anchors.md) | Resolvable Provenance Anchors Are Mandatory | **Very hard** |
| [0010](ADR-0010-raf-deterministic-schema.md) | Requirement Analysis Frame as a Deterministic Schema | Hard |
| [0011](ADR-0011-computed-confidence.md) | Computed Confidence, Not Model Self-Report | Moderate |
| [0012](ADR-0012-deterministic-conflict-precedence.md) | Deterministic Conflict Precedence | Moderate |

### AI provider and data governance

| ADR | Title | Reversibility |
|---|---|---|
| [0020](ADR-0020-ai-provider-abstraction.md) | AI Provider Abstraction | Hard |
| [0021](ADR-0021-data-classification-egress-policy.md) | Data Classification and AI Egress Policy | Hard |
| [0022](ADR-0022-capability-negotiation.md) | Provider Capability Negotiation and Degradation Ladder | Moderate |

### Generation

| ADR | Title | Reversibility |
|---|---|---|
| [0006](ADR-0006-correct-by-construction-ir.md) | Correct-by-Construction Process IR (Structured Region Tree) | **Very hard** |
| [0009](ADR-0009-technology-neutral-bps.md) | Technology-Neutral Business Process Specification | **Very hard** |
| [0013](ADR-0013-generation-directives.md) | Generation Directives as the Only Shape Influence **(v2 — 7 kinds)** | Moderate |
| [0014](ADR-0014-layout-safety-critical.md) | Layout Quality Is Safety-Critical; the Layout Engine Is Not Ours to Build **(v2)** | Moderate |

### Language and identifiers

| ADR | Title | Reversibility |
|---|---|---|
| [0023](ADR-0023-unicode-bilingual-architecture.md) | Unicode-First, Bilingual (Arabic/English) Text Architecture | **Very hard** |
| [0024](ADR-0024-ascii-identifiers-unicode-names.md) | ASCII Technical Identifiers, Unicode Display Names | Hard |

### Repository, versioning, governance

| ADR | Title | Reversibility |
|---|---|---|
| [0016](ADR-0016-immutable-content-addressed-artifacts.md) | Immutable, Content-Addressed Artifact Versions | Hard |
| [0017](ADR-0017-approval-as-baseline-signature.md) | Gate Approval as a Signature over a Baseline Hash | Hard |
| [0032](ADR-0032-retain-everything.md) | Retain Everything | Easy |

### Camunda lifecycle

| ADR | Title | Reversibility |
|---|---|---|
| [0018](ADR-0018-handoff-ownership-boundary.md) | Camunda Handoff Ownership Boundary | Hard |
| [0019](ADR-0019-divergence-via-observation.md) | Three-Way Divergence via Observation Re-Import | Easy |
| [0025](ADR-0025-camunda-version-profiles.md) | Camunda 8.x Version-Agnostic Core with Versioned Profiles | Moderate |
| [0026](ADR-0026-static-validation-first.md) | Static Validation First; Live Deployment Validation Deferred | Easy |

### Platform

| ADR | Title | Reversibility |
|---|---|---|
| [0027](ADR-0027-abstract-oidc-identity.md) | Abstract OIDC/OAuth2 Identity | Easy |
| [0028](ADR-0028-containerised-compose-first.md) | Containerised Services, Compose First, Kubernetes-Ready | Easy |
| [0029](ADR-0029-modular-monolith.md) | Modular Monolith with Enforced Package Boundaries | Moderate |
| [0030](ADR-0030-typescript-end-to-end.md) | TypeScript End-to-End | **Very hard** |
| [0031](ADR-0031-corpus-as-data.md) | Evaluation Corpus as Data, Not Code | Easy |

### Phase 1 / Phase 2 decisions

| ADR | Title | Reversibility |
|---|---|---|
| [0033](ADR-0033-http-framework-deferral.md) | Temporary Deferral of NestJS for the Phase 1 HTTP Foundation — *deferral discharged by ADR-0034; conditions C2/C3 carried forward* | Easy |
| [0034](ADR-0034-nestjs-application-layer.md) | NestJS as the Application Composition Layer **(conditions N1–N5)** | Moderate |
| [0035](ADR-0035-persistence-plain-sql-pglite.md) | Plain Parameterised SQL over PGlite in Development; PostgreSQL in Production | Easy |
| [0036](ADR-0036-build-toolchain.md) | Compiled Build Toolchain | Moderate |
| [0037](ADR-0037-binary-document-extraction.md) | Binary Document Extraction and Rasterisation Toolchain — **PROPOSED, awaiting approval** | Moderate |
| [0038](ADR-0038-target-versus-content-verification.md) | Target Verification versus Content Verification | **Hard** |
| [0039](ADR-0039-react-presentation-layer.md) | React + Vite as the Presentation Layer, and Its Boundary | Moderate |

---

## The five that cannot be revisited cheaply

If only a subset is approved now, these are the ones that must be:

**ADR-0001** (requirements-driven boundary) · **ADR-0002** (spec-layer editing) ·
**ADR-0004** (AI proposes, code commits) · **ADR-0008** (resolvable anchors) ·
**ADR-0023** (Unicode/bilingual architecture).

Every other decision can be changed later at a cost measured in weeks. These five are structural:
reversing any of them invalidates the traceability guarantee, the governance model, or the entire
text pipeline.

---

## Template

```markdown
# ADR-XXXX: Title

> **Status:** Proposed | Approved | Superseded by ADR-YYYY
> **Date:** YYYY-MM-DD · **Reversibility:** Easy | Moderate | Hard | Very hard
> **Related:** ADR-…, docs/…

## Context
What forces are at play. What we know and do not know.

## Decision
The decision, stated as an obligation (MUST / MUST NOT).

## Alternatives considered
Each with the reason for rejection.

## Consequences
Positive, negative, and what this forecloses.

## Enforcement
How the decision is made mechanical rather than cultural.
```
