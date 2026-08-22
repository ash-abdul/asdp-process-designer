# ADR-0026: Static Validation First; Live Deployment Validation Deferred

> **Status:** Approved · **Date:** 2026-08-22 · **Reversibility:** Easy
> **Related:** ADR-0018, ADR-0025, docs/40-quality/validation-architecture.md §5

## Context

Phase 0 decision 4: a Camunda sandbox cluster must not block Phase 0; actual sandbox availability
is **TBD**; initial validation may use schema and static validation; live deployment or dry-run
validation can be introduced once an environment becomes available.

Static validation can establish a great deal — schema validity, structural soundness, Camunda
compatibility per profile, FEEL parseability, dependency resolution. It cannot establish that a
specific engine instance would accept the deployment.

## Decision

1. The MVP **MUST** rely on **static validation only**: Camunda's own static compatibility lint
   pinned per target profile, profile construct rules, FEEL parsing and static type checking,
   element-template conformance, and cross-artifact dependency resolution within the baseline.
2. A **`DeploymentValidator` port MUST be defined now** and left unimplemented, so that adding live
   validation later is an adapter rather than a redesign.
3. L3 findings **MUST** carry an explicit qualifier — *"validated statically against profile X; not
   deployment-verified"* (`L3-CAM-014`) — until an adapter exists. **Overstating the guarantee is
   worse than lacking it.**
4. The absence of the adapter **MUST NOT** block any gate. It changes the qualifier on L3, not L3's
   ability to pass.
5. When an adapter is built it **MUST** be deploy-and-discard against an **isolated sandbox cluster
   only**, declared as such in configuration, and **MUST NOT** be able to target a non-sandbox
   environment (ADR-0018).
6. Sandbox availability **MUST** remain marked TBD in the open-decision register until confirmed.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Require a sandbox before proceeding | Blocks Phase 0 on an environment decision outside our control |
| Build a mock Zeebe validator | Would reimplement engine acceptance semantics badly and give false confidence — the worst outcome |
| Claim full executability validation from static checks alone | Dishonest; a reviewer would over-trust G3 |
| Defer the port until a cluster exists | The port is nearly free now and prevents a redesign later |

## Consequences

**Positive**

- Phase 0 and the MVP proceed with no environment dependency.
- Static validation genuinely catches the large majority of executability defects, because
  Camunda's own lint encodes what the engine rejects.
- The honest qualifier keeps reviewer trust calibrated to what was actually verified.
- Adding live validation later is additive.

**Negative**

- Some deployment rejections will be discovered by the receiving Camunda team rather than by ASDP.
- Connector connectivity, credentials, and cluster-specific configuration cannot be checked at all.
- G3 is a slightly weaker signal than it will eventually be, and the qualifier must be visible in
  the release package so nobody forgets that.

## Enforcement

- `L3-CAM-014` is emitted on every validation run until a `DeploymentValidator` adapter is
  registered.
- The qualifier appears in `docs/validation-report.md` inside every release package.
- The port is declared in `packages/validation` with no implementation, and an architecture test
  asserts no HTTP client targets a Camunda deployment endpoint (ADR-0018).
- Sandbox availability is tracked as an open item in docs/60-plan/open-decisions.md.
