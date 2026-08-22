# ADR-0005: AI Never Emits Artifact Serialisations — IR-First Compilation

> **Status:** Approved · **Date:** 2026-08-22 · **Reversibility:** Very hard
> **Related:** ADR-0004, ADR-0006, docs/30-generation/process-ir.md

## Context

An LLM can produce BPMN XML that looks plausible. It cannot be relied upon to produce XML that is
schema-valid, namespace-correct, ID-consistent, geometrically coherent, and semantically
executable — and the failure modes are subtle rather than loud. Meanwhile, artifacts must be
byte-reproducible for content hashing (ADR-0016) and canonical for reviewable diffs.

## Decision

AI **MUST NOT** emit BPMN XML, DMN XML, Camunda form JSON, diagram geometry, element identifiers,
or any other artifact serialisation.

AI **MAY** propose a **Process IR** document or a specification object, constrained by a published
schema. Deterministic, pure compilers in `packages/compiler-*` are the **only** code that produces
artifact content.

Identifier minting, namespace handling, serialisation order, canonicalisation, and geometry are
exclusively deterministic.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| AI emits XML, code validates and repairs | Repair of subtly wrong XML is harder than generation; and a repaired artifact has no reliable provenance for its repaired parts |
| AI emits XML with a strict schema constraint | Schema validity is necessary but nowhere near sufficient: valid XML can be unexecutable, unreachable, or ungeometric |
| AI emits a partial artifact, code fills gaps | Two authors of one artifact; hashing, diffing, and traceability all become ambiguous |

## Consequences

**Positive**

- Artifacts are byte-reproducible: same IR → identical canonical output → identical hash.
- Compilers are pure and snapshot-testable, so artifact correctness is a unit-test property.
- The IR can be restricted so invalid output is unrepresentable (ADR-0006).
- Camunda version differences are absorbed by the compiler via profiles (ADR-0025), not by
  re-prompting.

**Negative**

- Every construct we want to generate must be modelled in the IR **and** implemented in a
  compiler, with fixtures. This deliberately slows vocabulary growth
  (docs/30-generation/pattern-mapping.md §8).
- The IR schema becomes a first-class maintained artifact.

## Enforcement

- **Dependency rule:** only `compiler-*` and `ingestion` may import `bpmn-moddle`, `dmn-moddle`,
  or the Zeebe extension moddle. Any other import fails CI.
- `packages/ai` cannot import a compiler.
- Golden-file tests assert byte-identical output for identical IR across processes
  (docs/20-domain/artifact-model.md §9).
