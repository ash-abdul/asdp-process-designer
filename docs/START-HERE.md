# ASDP Process Designer — Start Here

Welcome to the ASDP Process Designer repository.

This document is the recommended entry point for anyone who is new to the product, architecture, or codebase.

The goal is to help you understand the product in the right order without having to read every document immediately.

---

## 1. What is the ASDP Process Designer?

The ASDP Process Designer is a requirements-driven, AI-assisted process engineering application.

Its purpose is to transform business requirements and supporting evidence into a governed, traceable, validated, Camunda-ready process application.

The product is designed around the following lifecycle:

**Source Evidence → Requirements Analysis → Structured Requirements → Approved Business Process Specification → Process IR → Generated BPMN / DMN / Forms / Interface Specifications → Validation → Camunda Handoff**

The ASDP Process Designer is **not** intended to replace Camunda Modeler.

Users work primarily with requirements, analysis, specifications, approvals, and generated outputs. Detailed structural BPMN/DMN editing is performed in Camunda after handoff.

---

## 2. Recommended Reading Order

If you are new to the project, follow this order.

### Step 1 — Product Orientation

Start with:

1. `README.md`
2. `00-product/product-charter.md`
3. `00-product/product-boundary.md`
4. `00-product/personas-and-journey.md`
5. `00-product/mvp-scope.md`

These documents explain:

- why the product exists
- who it is for
- what problem it solves
- what is in scope
- what is explicitly out of scope
- how the user experience is intended to work

Do not start with the code or detailed ADRs before understanding these documents.

---

### Step 2 — Understand the Overall Architecture

Read:

1. `10-architecture/architecture-overview.md`
2. `10-architecture/module-map.md`
3. `10-architecture/technology-stack.md`

Then, depending on your role, continue with:

- `10-architecture/ai-provider-abstraction.md`
- `10-architecture/data-governance.md`
- `10-architecture/multilingual-architecture.md`
- `10-architecture/identity-and-access.md`
- `10-architecture/deployment-architecture.md`

These documents explain how the major application components fit together.

---

### Step 3 — Understand the Core Domain

Read:

1. `20-domain/requirement-analysis-frame.md`
2. `20-domain/domain-model.md`
3. `20-domain/traceability-model.md`
4. `20-domain/provenance-and-anchoring.md`
5. `20-domain/artifact-model.md`
6. `20-domain/versioning-and-baselines.md`

These documents describe the internal concepts the application uses to represent requirements, source evidence, traceability, generated artifacts, and released baselines.

---

## 3. Key Concepts You Should Understand

### RAF — Requirements Analysis Framework

RAF is the structured model used to convert unstructured or semi-structured inputs into organized requirements.

Inputs may include:

- free text
- BRDs
- SOPs
- Word and PDF documents
- spreadsheets
- screenshots
- images
- process diagrams
- existing BPMN or DMN files

RAF captures business information such as actors, triggers, process behavior, rules, decisions, exceptions, timers, integrations, data, assumptions, constraints, and unresolved questions.

In simple terms:

**RAF answers: “What does the business actually require?”**

---

### BPS — Business Process Specification

The Business Process Specification is the approved, technology-neutral description of how the process should behave.

It sits between approved requirements and technical process generation.

The BPS should describe process meaning without forcing the business user to work directly with BPMN mechanics.

---

### Process IR — Process Intermediate Representation

Process IR is the structured process blueprint used between the approved business specification and generated Camunda artifacts.

The preferred pipeline is:

**Approved Requirements → Business Process Specification → Process IR → BPMN / DMN / Forms**

The Process IR is important because the application should not rely on an LLM directly generating authoritative BPMN XML from prose.

In simple terms:

**Process IR answers: “What process structure should be generated from the approved business intent?”**

---

### Provenance and Traceability

Every important generated or extracted item should remain traceable back to its source.

The target traceability chain is:

**Evidence → Requirement → Business Process Specification Element → Process IR Element → BPMN / DMN / Form / Interface Artifact → Validation Rule → Test Scenario**

This is a core product capability.

---

### Generated Artifacts Are Not Directly Edited in ASDP

ASDP is requirements-driven.

Users change:

- source requirements
- structured requirements
- approved business/process specifications

They do not directly structurally edit:

- BPMN tasks
- gateways
- sequence flows
- DMN tables
- form structures

Generated artifacts are reviewed, inspected, validated, and handed off to Camunda.

Detailed technical refinement belongs to Camunda tools after handoff.

---

## 4. Understand How Generation Works

After understanding the domain model, read:

1. `30-generation/generation-pipeline.md`
2. `30-generation/process-ir.md`
3. `30-generation/generation-directives.md`
4. `30-generation/pattern-mapping.md`
5. `30-generation/decision-generation.md`
6. `30-generation/form-generation.md`
7. `30-generation/layout-architecture.md`

These documents explain how approved requirements are transformed into Camunda-ready artifacts.

The most important relationship to understand is:

**Requirements → BPS → Process IR → Deterministic Generation → BPMN / DMN / Forms**

AI may propose structures and interpretations, but authoritative generation and validation are governed by deterministic application logic.

---

## 5. Understand Quality and Validation

Read:

1. `40-quality/validation-architecture.md`
2. `40-quality/validation-rule-catalog.md`
3. `40-quality/test-scenario-model.md`
4. `40-quality/ai-evaluation-framework.md`

These documents explain how the application verifies that:

- requirements are complete enough to progress
- generated specifications are valid
- generated artifacts are internally consistent
- AI output quality is evaluated
- blocking errors are distinguished from warnings and informational findings

A key principle is:

- **ERROR** = blocks the applicable gate
- **WARNING** = may proceed only where policy permits
- **INFO** = informational

---

## 6. Understand Governance and Camunda Handoff

Read:

1. `50-governance/governance-and-gates.md`
2. `50-governance/camunda-integration.md`
3. `50-governance/handoff-and-divergence.md`
4. `50-governance/audit-and-compliance.md`

These documents explain:

- approval gates
- released baselines
- auditability
- Camunda handoff
- ownership after handoff
- how future ASDP changes should avoid overwriting Camunda changes

The core lifecycle boundary is:

**Before handoff:** ASDP is the source of truth for generated process design.

**After handoff:** Camunda may be used for detailed technical refinement.

Later requirement changes in ASDP create a new candidate version rather than automatically overwriting a previously released process.

---

## 7. Architecture Decision Records

The `adr/` folder contains detailed Architecture Decision Records.

Do not read all ADRs first.

Start with the most foundational ones:

- `ADR-0001-requirements-driven-product-boundary.md`
- `ADR-0004-ai-proposes-code-commits.md`
- `ADR-0005-ir-first-compilation.md`
- `ADR-0010-raf-deterministic-schema.md`
- `ADR-0015-read-only-viewers.md`
- `ADR-0018-handoff-ownership-boundary.md`
- `ADR-0020-ai-provider-abstraction.md`
- `ADR-0029-modular-monolith.md`
- `ADR-0030-typescript-end-to-end.md`

Read the remaining ADRs when you need to understand why a particular architectural choice was made.

---

## 8. Project Plan and Open Decisions

Read these after you understand the product and architecture:

1. `60-plan/roadmap.md`
2. `60-plan/open-decisions.md`

`60-plan/phase-0-tasks.md` is mainly useful for understanding the history and outputs of the Phase 0 architecture work.

---

## 9. 30-Minute Onboarding Path

If you only have 30 minutes, read:

1. `README.md`
2. `00-product/product-charter.md`
3. `00-product/product-boundary.md`
4. `10-architecture/architecture-overview.md`
5. `20-domain/requirement-analysis-frame.md`
6. `30-generation/process-ir.md`
7. `30-generation/generation-pipeline.md`
8. `50-governance/governance-and-gates.md`

This should give you the full product story:

**Why it exists → what it does → how requirements are structured → how process intent is represented → how Camunda artifacts are generated → how the result is governed**

---

## 10. Role-Based Reading Paths

### Product Manager / Business Owner

Prioritize:

- `00-product/`
- `20-domain/requirement-analysis-frame.md`
- `20-domain/traceability-model.md`
- `50-governance/governance-and-gates.md`
- `60-plan/roadmap.md`

### Business Analyst / Process Engineer

Prioritize:

- `00-product/personas-and-journey.md`
- `20-domain/requirement-analysis-frame.md`
- `20-domain/provenance-and-anchoring.md`
- `30-generation/process-ir.md`
- `30-generation/generation-directives.md`
- `30-generation/pattern-mapping.md`
- `40-quality/validation-rule-catalog.md`

### Software Engineer

Prioritize:

- `10-architecture/`
- `20-domain/domain-model.md`
- `30-generation/generation-pipeline.md`
- `30-generation/process-ir.md`
- `40-quality/validation-architecture.md`
- critical ADRs
- repository code and automated tests

### Solution / Enterprise Architect

Prioritize:

- `10-architecture/`
- `20-domain/domain-model.md`
- `20-domain/versioning-and-baselines.md`
- `30-generation/process-ir.md`
- `50-governance/`
- `adr/`

### AI / LLM Engineer

Prioritize:

- `10-architecture/ai-provider-abstraction.md`
- `10-architecture/data-governance.md`
- `10-architecture/multilingual-architecture.md`
- `20-domain/epistemic-model.md`
- `20-domain/provenance-and-anchoring.md`
- `20-domain/requirement-analysis-frame.md`
- `40-quality/ai-evaluation-framework.md`

---

## 11. Before Making Changes

Before modifying the application:

1. Read `CLAUDE.md`.
2. Read the product and architecture documents relevant to your change.
3. Identify whether the change affects an ADR.
4. Update the authoritative specification where required.
5. Perform impact analysis.
6. Implement the change.
7. Update or add automated tests.
8. Keep documentation and implementation synchronized.
9. Do not silently change architectural boundaries.

For major or hard-to-reverse changes, create or update an ADR before implementation.

---

## 12. The One-Sentence Mental Model

If you remember only one thing:

> **ASDP Process Designer turns evidence-backed, human-approved business requirements into governed, traceable, validated Camunda process artifacts without asking business users to directly author BPMN.**
