# ADR-0018: Camunda Handoff Ownership Boundary

> **Status:** Approved · **Date:** 2026-08-22 · **Reversibility:** Hard
> **Related:** ADR-0019, ADR-0026, docs/50-governance/handoff-and-divergence.md

## Context

Before handoff, ASDP is the source of truth for the generated process design. After handoff,
Camunda may be used by process engineers for detailed technical refinement — and ASDP must not
subsequently overwrite those Camunda changes.

A tool that can write to the target environment will eventually do so at the wrong moment. The
safest guarantee is not a permission check but the absence of the capability.

## Decision

1. **No write path to any Camunda cluster or repository MUST exist in the MVP codebase** — not
   disabled, not permission-gated, absent.
2. Handoff **MUST** be an explicit, recorded, one-way event capturing recipient, environment,
   Camunda target profile, artifact hashes, and notes.
3. On handoff, the `Release` **MUST** transition to `handed_off` and be **frozen permanently**. No
   command, role, or migration may alter it.
4. Regeneration **MUST NOT** patch. ASDP emits complete new candidate artifacts; what reaches
   Camunda is a human decision.
5. ASDP **MUST NOT** overwrite Camunda-side changes. Where such changes are observed, the
   divergence report **MUST** classify them and require a human disposition (ADR-0019).
6. Where the Camunda state is unknown, that **MUST** be reported prominently as an incomplete
   comparison.
7. Every package **MUST** include a `HANDOFF.md` stating the ownership transfer explicitly.

An eventual sandbox `DeploymentValidator` adapter (ADR-0026) is deploy-and-discard against an
isolated cluster only, and **MUST NOT** be able to target a non-sandbox environment.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| ASDP deploys to environments | Explicitly out of scope; and a tool that can deploy will deploy at the wrong moment |
| ASDP pushes updates to Web Modeler | Would overwrite engineering work; the exact outcome this ADR forbids |
| Bidirectional sync with Camunda | Not achievable reliably; would require merge semantics for artifacts ASDP does not own |
| Soft freeze (frozen by convention) | Conventions are not enforcement |

## Consequences

**Positive**

- Engineering work done in Camunda is safe by construction, not by policy.
- The ownership model is legible to both sides and stated in every package.
- Frozen releases give exact hashes for later three-way comparison.
- Removes an entire class of catastrophic failure (overwriting production models).

**Negative**

- Handoff is manual (export and deliver). Publishing integrations are deferred, and each must
  respect this ADR when built.
- ASDP cannot know the Camunda state unless someone tells it, so the second cycle depends on a
  human uploading an observation.
- A frozen release cannot be corrected in place; a correction is a new release, which is more
  ceremony than a patch.

## Enforcement

- Architecture test: no HTTP client in the codebase targets a Camunda deployment endpoint.
- Domain invariant D12: a `handed_off` release is immutable.
- `ArtifactPublisher` and `DeploymentValidator` ports are declared but unimplemented in the MVP.
- Divergence completeness is reported explicitly; a missing observation is never implied away.
