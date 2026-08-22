# Phase 1 — Implementation Status

> **Status:** complete, awaiting review · **Updated:** 2026-08-22
> **Related:** [phase-0-tasks.md](phase-0-tasks.md), [roadmap.md](roadmap.md), [ADR-0033](../adr/ADR-0033-http-framework-deferral.md)

Phase 1 delivered workstreams A–E. **215+ tests pass, none skipped or suppressed.**

---

## 1. Environment constraints encountered

Recorded because they shaped concrete choices and bound what could be verified.

| Constraint | Consequence |
|---|---|
| `pnpm` unavailable | **npm workspaces** used instead. Functionally equivalent; `module-map.md` §1 says pnpm |
| **Docker unavailable** | `infra/Dockerfile` and `infra/docker-compose.yml` are authored but **never built or run**. See [infra/README.md](../../infra/README.md) |
| **Postgres unavailable** | Persistence sits behind repository ports with a fully tested in-memory adapter. The Postgres adapter is deferred |
| npm registry reachable | Three packages installed: `typescript`, `zod`, `@types/node` |

## 2. Toolchain

| Concern | Choice |
|---|---|
| Language | TypeScript 5.9.3, `strict`, `erasableSyntaxOnly` (ADR-0030) |
| Execution | Node type stripping — `.ts` runs directly, **no build step** |
| Type checking | `tsc --noEmit` |
| Tests | Node's built-in `node:test` — zero test dependencies |
| Architecture enforcement | `tools/check-architecture.mjs`, zero dependencies, with a **self-test** |
| Documentation consistency | `tools/check-docs.mjs` — links, ADR references, superseded names |

`npm run verify` runs typecheck → architecture checks → checker self-test → tests.

## 3. What was built

| Package | Class | Contents |
|---|---|---|
| `@asdp/schemas` | contract | Zod schemas: identifiers, `LocalizedText`, classification, epistemic levels, gates, baselines, approvals, audit, validation `Rule`/`Finding` with **`gates[]` and `severityByGate`**, AI contracts |
| `@asdp/text` | **pure** | NFC normalisation, Arabic folding, match forms with offset maps, **code-point offset arithmetic**, bidi-safe composition, ASCII identifier minting |
| `@asdp/provenance` | **pure** | Anchor model (9 kinds), checksum-verified resolution with bounded drift repair, deterministic quote location |
| `@asdp/domain` | **pure** | Canonical serialisation and hashing, baselines, gate state machine, read-locks, computed confidence, invariants D1–D15 |
| `@asdp/raf` | **pure** | RAF v1.1 — 27 slots, 4 disjointness rules, coverage arithmetic |
| `@asdp/ai` | adapter | `AiProvider` port, task capability specs, **egress policy gate**, routing, degradation ladder, proposal broker, three adapters |
| `@asdp/eval` | adapter | Corpus registry, record/replay, provenance and quality metrics, report builder |
| `@asdp/api` | application | HTTP service, worker entrypoint, command layer with gate guards and audit, in-memory repositories |

## 4. Milestone M1 — runnable application

Verified by execution, not assertion:

```
GET  /health/live                      → {"status":"live"}
GET  /health/ready                     → dependency report, 200/503
GET  /meta                             → pinned raf/rulePack/camunda versions
GET  /projects                (anon)   → 403 unauthenticated
POST /projects                         → 201, five gates created closed
GET  /projects/:id/stages/generation/enterable
                                       → {"enterable":false,"reason":"read-locked until G2"}
SIGTERM                                → graceful drain, exit 0
```

## 5. Acceptance criteria

| # | Criterion | Status |
|---|---|---|
| 1 | `npm run build` clean, TypeScript strict | ✅ |
| 2 | `npm test` green, **no skipped or suppressed tests** | ✅ |
| 3 | `check:arch` passes and **fails on a deliberate violation** | ✅ 8/8 self-test cases fire |
| 4 | No artifact-mutating command exists | ✅ checker + registry assertion |
| 5 | Baseline hashing deterministic; NFC/NFD Arabic → one hash | ✅ |
| 6 | Anchor round-trip, checksum sensitivity, **non-BMP offsets** | ✅ |
| 7 | Approval invalidated by baseline or validation-run change | ✅ |
| 8 | `RESTRICTED` payload cannot reach an external adapter, **asserted at the transport boundary** | ✅ Spike S6 |
| 9 | Degradation ladder exercised against a reduced-capability adapter | ✅ |
| 10 | Evaluation metrics computed from recordings with **no network** | ✅ |

## 6. Defects found and fixed during Phase 1

Three, all caught by tests rather than review:

1. **Arabic presentation-form folding was off by one slot.** U+0621 HAMZA has *one* presentation
   form, not two; treating it as two shifted every subsequent letter, silently mistranslating
   U+FE8D ALEF as U+0626 YEH-WITH-HAMZA. Found by a quote-location test in `@asdp/provenance`.
   Fixed with an explicit shape-width table plus a regression test that folds **every** code point
   in Presentation Forms-B and asserts each lands in the Arabic block.
2. **A Unicode-stability test passed vacuously.** The fixture `التحقق من الهوية` contains no
   decomposable characters, so NFC and NFD were identical and the test proved nothing. Caught by a
   deliberate guard assertion; fixture replaced with hamza-bearing text.
3. **An HTTP test asserted the wrong status.** Authentication precedes routing, so an unknown route
   returns 403 to an anonymous caller rather than leaking whether the route exists. The behaviour
   is better than the test assumed; the test now asserts both the anonymous and authenticated cases.

## 7. Deferred, with the reason

| Deferred | Reason | Trigger to revisit |
|---|---|---|
| NestJS — **deferred, not rejected** | DI value not exercisable without Postgres ([ADR-0033](../adr/ADR-0033-http-framework-deferral.md), **Approved with conditions C1–C6**) | Postgres adapter · OIDC adapter · route budget reached · start of Process Designer API work |
| Postgres adapter | No container runtime available | Docker availability |
| OIDC adapter | No identity provider reachable. `ASDP_AUTH_MODE=oidc` **rejects requests** rather than trusting them | IdP decision (OD-5 in identity terms) |
| Job queue | Durability is the point; an in-memory queue would teach nothing | Postgres adapter |
| Live provider transports | Both AI adapters take an injected transport, so shape, capabilities and egress guards are tested without a network call | OD-1 (endpoint identity) |
| Container build verification | Docker unavailable | Docker availability |

## 8. Not started, by instruction

BPMN/DMN/Form generation, Process IR compilers, layout, the requirements-analysis passes, the
Specification Studio, and any user-facing designer. Phase 1 instruction 6.

## 9. Review outcome — all items resolved

| Item | Outcome |
|---|---|
| [ADR-0033](../adr/ADR-0033-http-framework-deferral.md) | **Approved with binding conditions C1–C6.** A framework *deferral*, not a rejection: NestJS remains the selected application architecture |
| `@types/node` | Accepted as a TypeScript toolchain dependency |
| `node:crypto` in pure packages | Accepted under the documented deterministic-hashing constraint |
| npm workspaces instead of pnpm | Accepted for the current environment |

### ADR-0033 conditions, and how each is held

| Condition | Mechanism |
|---|---|
| C1 scaffolding only | Stated in the ADR; the transport layer is ~180 lines |
| **C2 no custom framework** | Architecture rule `framework-creep` — fails the build on decorators, DI containers, controller classes or middleware-pipeline abstractions |
| **C3 domain/command/governance/RBAC/audit/validation independent of HTTP** | Architecture rule `http-independence` — fails the build if `commands.ts`, `ports.ts`, `repo-memory.ts` or any pure package imports a transport module |
| C4 explicit NestJS decision before API expansion | Review trigger recorded in the ADR; the route budget makes it arrive automatically |
| **C5 stop and recommend migration rather than rebuild** | Architecture rule `route-budget` — fails the build above 20 routes with a message naming C4. The failure *is* the recommendation |
| C6 deferral not rejection | Stated at the head of the ADR |

The architecture checker now carries **14 self-test cases**, seven of which cover ADR-0033.
