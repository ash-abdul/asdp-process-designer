# ADR-0034: NestJS as the Application Composition Layer

> **Status:** **Approved with conditions** · **Date:** 2026-08-22 · **Reversibility:** Moderate
> **Supersedes in part:** [ADR-0033](ADR-0033-http-framework-deferral.md) — the deferral is now
> discharged; ADR-0033's conditions C2/C3 carry forward into this record.
> **Related:** ADR-0030, ADR-0029, docs/10-architecture/technology-stack.md

## Context

[ADR-0033](ADR-0033-http-framework-deferral.md) approved Node's built-in HTTP module as temporary
Phase 1 scaffolding, under condition **C4**: *an explicit decision on introducing NestJS must be made
before substantial application API development begins.* Condition **C5** added a route-budget
tripwire at 20 routes, enforced mechanically.

Phase 2 planning showed the trigger has arrived. The requirements-analysis vertical slice needs
roughly **32 new endpoints** against a 13-route baseline, and the composition surface has grown to
seven repositories, a blob store, a provider registry and a pass orchestrator. C5's tripwire fired
exactly as designed — the enforcement mechanism produced the decision rather than the decision being
remembered.

## Decision

**NestJS is adopted as the HTTP and application composition layer** for `apps/api`, from Phase 2 V0.

### Binding conditions

| # | Condition |
|---|---|
| **N1** | NestJS is used **primarily as the HTTP and application composition layer**: routing, dependency wiring, request lifecycle, guards, interceptors |
| **N2** | **Domain and application logic MUST remain independent of NestJS decorators and controllers.** No `@Injectable()` on domain services, no framework types in domain signatures |
| **N3** | **Business logic MUST NOT move into controllers.** A controller parses the request, delegates to a command, and maps the result. Nothing else |
| **N4** | The existing **command and governance boundaries are preserved**: `commands.ts` keeps RBAC, gate guards, audit and transactions, and remains free of HTTP and framework imports |
| **N5** | Pure packages (`domain`, `text`, `provenance`, `raf`, and later `process-ir`, `compilers`) **MUST NOT** import any NestJS package |

### Structure

```
apps/api/src/
  main.ts                      bootstrap, graceful shutdown
  app.module.ts                composition root — wiring only
  http/
    *.controller.ts            parse → delegate → map. NO business logic (N3)
    guards/                    authentication, RBAC, gate guards
    interceptors/              audit, correlation id, structured logging
  commands/                    RBAC · gate guards · audit · transactions   ← no framework imports (N4)
  persistence/                 repository adapters                         ← no framework imports
  ports.ts                     interfaces
```

The command layer keeps its current shape and its current tests. Controllers become a thin
transport skin over it, which is why this migration is bounded.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Continue with the built-in router | C5's budget is crossed on the first Phase 2 slice, and C2 forbids growing our own routing, DI or middleware infrastructure |
| Fastify or Hono | Adds a dependency without the DI benefit that motivated NestJS; the composition surface is now the actual problem |
| NestJS with domain services as providers | Would violate N2/N5 and couple pure packages to a framework — the opposite of what ADR-0029 exists to protect |

## Consequences

**Positive**

- Declarative routing, guards and interceptors replace hand-written middleware, so the obligations
  ADR-0033 implemented by hand are now framework-supported.
- Dependency wiring for seven repositories, a blob store and a provider registry becomes declarative.
- Validation pipes consume the existing Zod schemas, so the contract stays single-sourced.

**Negative**

- Largest dependency addition in the project: `@nestjs/core`, `@nestjs/common`, a platform adapter,
  `rxjs`, `reflect-metadata`.
- `erasableSyntaxOnly` must be relaxed **for `apps/api` only**, because decorators are not erasable
  TypeScript. Pure packages keep the strict setting, and the boundary is enforced by N5.
- Controller and module boilerplate.

## Enforcement

Mechanically, in `tools/check-architecture.mjs`:

| Rule | Enforces |
|---|---|
| `nest-confinement` | No NestJS import in any pure or contract package (**N5**) |
| `nest-domain-purity` | No NestJS decorator or import in `commands/` or `persistence/` (**N2**, **N4**) |
| `controller-thinness` | Controller files may not import `@asdp/domain`, and are size-capped, so logic cannot accumulate there (**N3**) |
| *(retired)* `route-budget` | Discharged by this ADR; the tripwire has served its purpose |

`framework-creep` and `http-independence` from ADR-0033 remain in force: they now prevent building a
*second* framework alongside NestJS.
