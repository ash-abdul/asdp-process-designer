# Product Charter

> **Status:** Approved (Phase 0) · **Version:** 1.0 · **Updated:** 2026-08-22
> **Related:** [ADR-0001](../adr/ADR-0001-requirements-driven-product-boundary.md), [product-boundary.md](product-boundary.md)

---

## 1. Purpose

ASDP Process Designer transforms heterogeneous business inputs into a **governed, traceable,
validated, executable Camunda 8 Process Application**.

Its differentiator is not generation. It is the **auditable chain of custody** from a sentence
on page 7 of a policy document, to an approved requirement, to a specification step, to a BPMN
element, to a test scenario — and the ability to prove that chain to a business owner, a
process engineer, or an auditor.

## 2. Problem statement

Process automation projects fail between requirements and models, not inside either:

| Failure | How ASDP addresses it |
|---|---|
| Requirements arrive as unstructured prose across many incompatible documents | Multimodal intake with structural parsing and reconciliation |
| Nobody can say why a given task exists in a deployed process | Element-level traceability to source evidence |
| Vague requirements get "clarified" during modelling, invisibly | Ambiguity/gap/conflict detection with blocking approval gates |
| AI assistance produces plausible models nobody can verify | Epistemic levelling, mandatory citation, human-only approval |
| Requirement changes have unknown blast radius | Deterministic forward impact analysis over a trace graph |
| Redesign silently overwrites engineering work done in Camunda | Handoff ownership boundary and three-way divergence analysis |

## 3. What the product does

1. Accepts requirements from free text, Word, PDF, BRDs, SOPs, policies, spreadsheets,
   images, screenshots, process diagrams, and existing BPMN/DMN/Form artifacts.
2. Uses AI to extract, classify, reconcile, and critique those inputs into a structured
   requirement model with full provenance.
3. Distinguishes, always and visibly: extracted fact · AI interpretation · AI recommendation ·
   unresolved ambiguity · conflict · human-approved requirement.
4. Surfaces what is missing, contradictory, or untestable, and requires humans to resolve it.
5. Produces a technology-neutral Business Process Specification for human approval.
6. Generates BPMN, DMN, Camunda Forms, and integration/worker specifications
   **deterministically** from approved specifications.
7. Validates the result against schema, semantic, Camunda-executability, traceability,
   governance, and testability rules.
8. Packages and exports a Camunda-ready Process Application, with a traceability matrix, an
   AI-disclosure report, and validation evidence.
9. On the next cycle, compares the new candidate against the handed-off baseline and against
   the current Camunda state, and reports divergence for human decision.

## 4. What the product does not do

- It is **not** a BPMN, DMN, or Form editor, and does not replace Camunda Modeler.
- It does **not** execute, deploy to production, monitor, or operate processes.
- It does **not** generate full worker implementation code (MVP).
- It does **not** overwrite changes made in Camunda after handoff, ever.

See [product-boundary.md](product-boundary.md) for the precise editing boundary and
[mvp-scope.md](mvp-scope.md) for MVP exclusions.

## 5. Success criteria

Phase-independent measures of whether the product works:

| # | Criterion | Measurement |
|---|---|---|
| S1 | Every generated artifact element traces to an approved requirement | Orphan element count = 0 (a non-zero value indicates a compiler defect) |
| S2 | Every approved requirement traces to resolvable source evidence, or is explicitly marked as inference with rationale | Unanchored requirement count = 0 |
| S3 | A reviewer can reach the originating source region from any element in ≤4 interactions | Usability measurement, Phase 5 |
| S4 | Exported packages open in Camunda Modeler and pass Camunda static validation for the configured target version | CI gate on the golden corpus |
| S5 | Generated diagrams are legible without manual repositioning | Layout quality thresholds met on the golden corpus ([layout-architecture.md](../30-generation/layout-architecture.md)) |
| S6 | Requirement change impact is complete and correct | Impact set verified against a manually derived set on regression cases |
| S7 | Analysts, not the build team, can operate the tool end to end | Pilot exit criterion, Phase 9 |
| S8 | AI output is reviewed, not rubber-stamped | Proposal edit-rate tracked per task type; a 100% raw-accept rate is treated as a warning signal, not a success |

## 6. Non-goals, stated to prevent drift

- A "paste your BRD, get a deployable process" one-shot button. The gates exist to prevent
  exactly this.
- Feature parity with Camunda Web Modeler on any modelling dimension.
- Real-time collaborative co-editing.
- Vendor lock to any single LLM provider ([ADR-0020](../adr/ADR-0020-ai-provider-abstraction.md)).

## 7. Constraints fixed in Phase 0

| Constraint | Decision |
|---|---|
| AI provider | Abstracted; Claude API is one adapter among several. Enterprise/private endpoints must be supportable |
| Data egress | Not all source material may leave the enterprise. Policy-driven per content, per task, per provider |
| Languages | Arabic and English, including mixed documents and RTL, from the data model up |
| Camunda target | Camunda 8.x, version-agnostic core, versioned generation and validation profiles |
| Camunda sandbox | Availability TBD; static validation only until an environment exists |
| Identity | Standards-based OIDC/OAuth2, provider-agnostic |
| Deployment | Containerised services; Docker Compose for development and initial MVP; Kubernetes-ready but not required |
| Corpus | Must ultimately be validated on real ASDP material; evaluation framework designed so real corpora slot in without redesign |
