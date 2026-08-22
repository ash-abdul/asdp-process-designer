# ADR-0033: Temporary Deferral of NestJS for the Phase 1 HTTP Foundation

> **Status:** **Approved with conditions** · **Date:** 2026-08-22 · **Reversibility:** Easy
> **Related:** ADR-0030, docs/10-architecture/technology-stack.md, docs/60-plan/phase-1-status.md

> ### This is a framework DEFERRAL, not a framework REJECTION.
>
> **NestJS remains the selected application architecture** for the ASDP API
> (`technology-stack.md`). This ADR approves using Node's built-in HTTP module as
> *lightweight Phase 1 infrastructure scaffolding* only. It does not replace, revise or
> supersede that selection, and it confers no licence to build an alternative framework.

## Context

`technology-stack.md` names **NestJS** for the backend, on the rationale that its guards and
interceptors map cleanly onto gate guards, RBAC, audit and idempotency. That rationale stands.

Phase 1 was implemented in an environment with **no container runtime and no Postgres**
(recorded in `infra/README.md`). Three consequences bear on the choice:

1. NestJS's principal value here is dependency-injection wiring to a real persistence layer and
   module graph. With an in-memory repository behind a port, that value cannot be exercised.
2. Its dependency surface is large, and Phase 1 deliberately installs the minimum: TypeScript,
   Zod, and `@types/node`.
3. Every architectural obligation NestJS would carry — authentication, RBAC, gate guards, audit
   interception, correlation ids, structured logging, graceful shutdown, bounded request size — is
   small enough to implement explicitly at Phase 1 scale.

This ADR exists because Phase 1's instructions require that a conflict with approved documentation
be identified and proposed rather than silently absorbed.

## Decision

Node's built-in `http` module, with a small typed router, is approved as the **Phase 1 HTTP
scaffolding**. NestJS adoption is **deferred**, and remains the selected target architecture.

### Binding conditions of approval

| # | Condition |
|---|---|
| **C1** | Node built-in HTTP may be used as **lightweight Phase 1 infrastructure scaffolding** only |
| **C2** | **The typed router MUST NOT evolve into a custom application framework.** No routing DSL, no middleware pipeline abstraction, no DI container, no decorators, no controller base classes, no request-lifecycle infrastructure |
| **C3** | Domain logic, command handlers, governance logic, authentication/RBAC semantics, audit logic and validation **MUST remain independent of the HTTP implementation** |
| **C4** | An **explicit decision on introducing NestJS MUST be made before substantial application API development begins**, and in any case before the user-facing Process Designer APIs materially expand |
| **C5** | If the native HTTP layer begins to require significant routing abstraction, middleware infrastructure, dependency injection, decorators, controller abstractions or request-lifecycle infrastructure, **stop and recommend migration to NestJS rather than recreating those capabilities** |
| **C6** | This ADR documents a framework **deferral**, not a rejection (stated at the head of this record) |

### What C3 means concretely

The HTTP layer is a transport adapter. It parses a request, resolves the caller, and calls a
command. It holds no domain knowledge:

```
apps/api/src/http.ts        transport only — parse, authenticate, dispatch, map errors
apps/api/src/commands.ts    RBAC · gate guards · audit · transactions   ← no HTTP import
apps/api/src/ports.ts       persistence contracts                      ← no HTTP import
packages/domain             gate state machine · baselines · invariants ← pure
packages/schemas            validation contracts                       ← pure
```

The API test suite exercises the command layer **directly as well as over HTTP**, so a framework
change is verified by the same assertions.

## Alternatives considered

| Alternative | Assessment |
|---|---|
| **Adopt NestJS now** | Its main benefit — DI to a real persistence layer and a module graph — cannot be exercised without Postgres, while its dependency surface arrives immediately. The right call once the datastore lands |
| Adopt a lighter framework (Fastify, Hono) | Adds a dependency without the DI benefit that motivated NestJS |
| **Node built-ins now, explicit NestJS decision before API expansion** | **Selected.** Smallest dependency surface; every obligation implemented explicitly and tested; one transport file to replace |
| Grow the typed router into a general framework | **Explicitly forbidden by C2 and C5.** This is the failure mode the conditions exist to prevent |
| Silently substitute and edit the stack document | Rejected — precisely what Phase 1 instruction 4 forbids |

## Consequences

**Positive**

- Phase 1 installs three packages in total, all architecturally mandated.
- Middleware behaviour is explicit and directly testable.
- The transport layer is ~180 lines and replaceable without touching domain or command code.
- C4 makes the NestJS decision a scheduled, deliberate act rather than something that never happens.

**Negative**

- Route definitions are hand-written and will not scale gracefully past roughly twenty routes —
  which is why that number is a tripwire rather than a guideline.
- No OpenAPI generation yet; the contract lives in `@asdp/schemas` but is not yet published as a
  specification.
- Some transport work will be redone at migration. Bounded to `http.ts`, and a known cost.

## Enforcement

Conditions C2, C3 and C5 are enforced mechanically by `tools/check-architecture.mjs`, because a
condition that depends on memory is not a condition:

| Rule | Enforces | Behaviour |
|---|---|---|
| `http-independence` | **C3** | Fails the build if `commands.ts`, `ports.ts`, or any pure package imports `node:http`/`node:https` or the transport module |
| `framework-creep` | **C2** | Fails the build on decorator syntax, a DI container/`Injectable` pattern, a controller base class, or a middleware-pipeline abstraction inside `apps/api` |
| `route-budget` | **C5** | Fails the build when the router exceeds **20 routes**, with a message directing the reader to this ADR and to condition C4 |

The route budget failing is not a defect to work around — it is the signal that C4's explicit
decision is now due.

**Review trigger:** whichever comes first — the Postgres adapter, the OIDC adapter, the route budget
being reached, or the start of user-facing Process Designer API work.
