# ADR-0003: No Override Editor for Generated Artifacts

> **Status:** Approved · **Date:** 2026-08-22 · **Reversibility:** Hard
> **Related:** ADR-0001, ADR-0002, ADR-0018

## Context

Even with the specification layer in place (ADR-0002), there will be cases where a generated
artifact needs something ASDP cannot express: a construct outside the pattern table, a connector
configuration the interface schema does not model, an urgent fix under delivery pressure.

The obvious accommodation is an admin-only, audited "unlock and edit" mode. It was seriously
considered and is rejected.

## Decision

**No override editor for generated artifacts MUST exist** — not for any role, not audited, not
behind a feature flag, not as an emergency path.

The sanctioned escape hatch is the **lifecycle**: hand off earlier and complete refinement in
Camunda, where that work belongs, and where it is recorded as divergence on the next cycle
(ADR-0018, ADR-0019).

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Admin-only audited override | Becomes the path of least resistance within weeks. Delivery pressure always finds the unlocked door |
| Override that marks the artifact "unmanaged" | Splits the product into governed and ungoverned artifacts; the ungoverned ones accumulate and the guarantee dies quietly |
| Override limited to non-semantic properties | The line between semantic and non-semantic is not defensible in BPMN — a changed retry count or correlation key is semantic |
| "Export, edit, re-import as truth" | Same problem via a longer route; explicitly rejected in docs/00-product/product-boundary.md §7 |

## Consequences

**Positive**

- Every element in every managed artifact has a spec-layer cause, permanently. The orphan count
  stays a reliable self-check on our own compiler.
- No merge semantics, ever.
- The governance claim stays provable rather than mostly-true.

**Negative**

- Some legitimate needs will be blocked in ASDP and must be met by handing off earlier. This will
  be unpopular the first few times.
- Gaps in the pattern table and interface schema become **urgent** rather than merely annoying,
  because there is no workaround. That pressure is intentional: it forces the schema to improve
  rather than the boundary to erode.

## Enforcement

- An architecture test enumerates all command handlers and asserts that none targets an
  `ArtifactVersion`.
- `ArtifactVersion.generatedBy` admits only `compiler` and `import`.
- Imported artifacts (legacy or Camunda observations) can never be promoted to managed artifacts.
- Any future proposal to add such an editor supersedes this ADR explicitly, and must state which
  of the four consequences above it accepts.
