# ADR-0025: Camunda 8.x Version-Agnostic Core with Versioned Profiles

> **Status:** Approved · **Date:** 2026-08-22 · **Reversibility:** Moderate
> **Related:** ADR-0005, ADR-0026, docs/50-governance/camunda-integration.md

## Context

Phase 0 decision 3: target Camunda 8.x, do not tightly couple to a specific minor release unless
required by an implementation feature, and make version-specific generation and validation rules
configurable and versioned.

Camunda 8 releases frequently. Constructs, extension attribute shapes, user-task implementation
strategies, FEEL built-ins, and lint rules all move between minor versions. A design that hard-codes
any of these makes every Camunda release a threat to the product.

## Decision

1. The **Process IR, specification layer, requirements layer, traceability, and layout MUST be
   Camunda-version-neutral.** The IR contains no `zeebe:` attributes, no BPMN element names, and no
   FEEL dialect assumptions.
2. Version-specific behaviour **MUST** live in a **`CamundaTargetProfile`** — versioned **data**,
   not code — declaring supported elements, extension shapes, user-task implementation, DMN version
   and expression language, form schema version and components, FEEL built-ins, the pinned lint
   package version, the connector template set, and structural limits.
3. **Only the compilers and the L3 validation pack MAY consult a profile.**
4. Profile IDs **MUST** be opaque strings. **No code may parse a version number to infer
   behaviour.**
5. A project selects a profile via `ProjectSettings.camundaTargetProfileId`. **No project is
   migrated automatically.**
6. An IR construct unsupported by the active profile **MUST** fail invariant IR-19, producing a
   specification-level finding that names the construct and proposes an alternative.
7. Every artifact version and validation run **MUST** record the profile it targeted.
8. A profile change **MUST** produce a migration report showing what would change per project,
   including whether the change is `major` in process-contract terms.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Target one specific minor version | Every Camunda release becomes a migration project; and the choice would be baked into the compiler |
| Version detection at runtime from a cluster | No cluster is available (ADR-0026), and design-time behaviour should not depend on a live environment |
| Generate the lowest common denominator across 8.x | Forgoes useful capability and still breaks when the floor moves |
| Semantic version comparison in code (`if version >= 8.7`) | Version-number parsing spreads coupling everywhere it is used |

## Consequences

**Positive**

- A new Camunda 8.x release is a new profile plus fixtures, not a code change through the stack.
- Multiple projects can target different profiles simultaneously.
- Old releases remain explainable and reproducible because the profile is recorded.
- Opt-in migration with a per-project impact report.

**Negative**

- Golden fixtures must be maintained **per profile**, which multiplies the fixture set.
- Profile authoring requires real knowledge of each Camunda release's specifics.
- Some genuinely valuable version-specific capability will be unavailable to projects on older
  profiles, and the finding that tells them so must be clear about why.

## Enforcement

- Dependency rule: `packages/camunda-profiles` may be imported only by `compiler-*` and
  `validation`.
- An architecture test asserts that no code parses a profile ID as a version number.
- Golden fixtures exist per supported profile; a missing fixture set blocks marking a profile
  `supported`.
- IR-19 and `L3-CAM-006` enforce construct support.
