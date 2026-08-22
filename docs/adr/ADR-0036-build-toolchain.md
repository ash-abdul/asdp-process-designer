# ADR-0036: Compiled Build Toolchain

> **Status:** **Approved** · **Date:** 2026-08-22 · **Reversibility:** Moderate
> **Revises:** the Phase 1 zero-build toolchain
> **Related:** ADR-0030, ADR-0034, ADR-0028

## Context

Phase 1 ran TypeScript sources directly using Node's type stripping, with
`erasableSyntaxOnly` and `noEmit`. There was no build step, which kept the loop fast and the
dependency count at three.

[ADR-0034](ADR-0034-nestjs-application-layer.md) adopted NestJS as the application composition
layer. NestJS's programming model is decorators, and **decorators are not erasable syntax** —
they are runtime behaviour, not type annotations. Verified directly:

```
$ node dec.ts
@Injectable()
^
SyntaxError: Invalid or unexpected token
```

Node's type stripping and NestJS are mutually exclusive. A transpilation step is required.

Two further facts weighed on the decision, independent of NestJS:

1. Node type stripping emits `ExperimentalWarning: Type Stripping is an experimental feature and
   might change at any time` on **every run**, including inside the container. Phase 1 shipped a
   Dockerfile that ran production on an experimental flag. That was a latent risk regardless.
2. A compiled artifact is the normal posture for a production service.

## Decision

**Compile to `dist/` with `tsc`, and run the compiled JavaScript.**

| Element | Decision |
|---|---|
| Build | `tsc -b` over a solution file with **project references**, so dependency order is derived, not maintained by hand |
| Layout | Per-package `outDir: dist`, `rootDir: src`. Package `exports` point at `./dist/index.js` with `./dist/index.d.ts` types |
| **Import specifiers** | `rewriteRelativeImportExtensions` — sources keep writing `'./foo.ts'`; tsc rewrites to `'./foo.js'` on emit. **No source file was edited to adopt this ADR** |
| Decorators | `experimentalDecorators` + `emitDecoratorMetadata` in **`apps/api/tsconfig.json` only** |
| **`erasableSyntaxOnly`** | **Retained for every pure and contract package.** Relaxed only in `apps/api`. This is now a load-bearing enforcement of ADR-0034 N5: a decorator in a pure package is a compile error |
| Tests | Run against emitted JavaScript: `node --test "packages/*/dist/**/*.test.js" "apps/*/dist/**/*.test.js"` |
| Container | Two-stage build: compile in a builder stage, ship `dist/` plus production dependencies. No experimental flag in production |

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| A transpiling loader (`tsx`, `swc`) for `apps/api` only | Adds a dependency and leaves two execution modes in one repository; the container wants a build artifact anyway |
| NestJS without decorators | Not viable — decorators are NestJS's programming model |
| Reverse ADR-0034 and keep the built-in router | Leaves the ADR-0033 C5 tripwire fired with ~32 endpoints pending |
| Emit the whole repository to a single root `dist/` | Breaks Node package resolution: `@asdp/text` resolves through the workspace symlink to the package's own `dist` |
| Rewrite every relative import from `.ts` to `.js` by hand | Unnecessary — `rewriteRelativeImportExtensions` exists for exactly this, and was verified before adoption |

## Consequences

**Positive**

- Decorators work, so ADR-0034 is implementable.
- **No experimental Node flag in production.** The Dockerfile becomes a normal two-stage build.
- Project references give incremental builds and enforce package boundaries a second way: a missing
  reference is a compile error, complementing the architecture checker.
- Declaration maps and source maps make stack traces point at TypeScript.
- **`erasableSyntaxOnly` becomes an enforcement mechanism**, not just a convenience: it makes
  ADR-0034 N5 a compile-time guarantee rather than a review obligation.

**Negative**

- A build step now precedes tests, so the loop is slower — measured at well under a second for
  incremental builds, and `tsc -b` skips unchanged projects.
- `dist/` must be built before `npm test`; `npm run verify` sequences this correctly, and a stale
  `dist` is the one new failure mode to watch for. Mitigated by `npm run clean`.
- Test files are emitted into `dist/` alongside production code. Acceptable for a private monorepo;
  excludable later if packages are ever published.

## Enforcement

| Mechanism | Enforces |
|---|---|
| `erasableSyntaxOnly` in `tsconfig.base.json` | No decorators outside `apps/api` — a **compile error**, not a lint warning |
| Project references | A cross-package import without a declared reference fails the build |
| Checker rule `nest-confinement` | No NestJS import in a pure or contract package (ADR-0034 N5) |
| `npm run verify` | build → architecture → self-test → docs → tests, in that order |
| Two-stage Dockerfile | Production runs compiled output; sources are not shipped |
