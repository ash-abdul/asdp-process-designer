# ASDP Process Designer — two-stage production build (ADR-0028, ADR-0036).
#
#   api     → apps/api/dist/main.js     HTTP service
#   worker  → apps/api/dist/worker.js   job consumer
#
# The same image runs both, so domain code cannot drift between them.
#
# ADR-0036: production runs COMPILED JavaScript. Phase 1 ran TypeScript sources
# directly under Node's experimental type-stripping flag; that flag no longer
# appears anywhere in this image.
#
# NOT YET BUILD-VERIFIED: Docker is unavailable in the current development
# environment. Reviewed deliverable, not a tested artifact. See infra/README.md.

# ---------------------------------------------------------------------------
# Stage 1 — build
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS builder
WORKDIR /build

# Manifests first, so the dependency layer caches independently of sources.
COPY package.json package-lock.json ./
COPY tsconfig.base.json tsconfig.json ./
COPY packages/schemas/package.json    packages/schemas/
COPY packages/text/package.json       packages/text/
COPY packages/provenance/package.json packages/provenance/
COPY packages/raf/package.json        packages/raf/
COPY packages/domain/package.json     packages/domain/
COPY packages/ai/package.json         packages/ai/
COPY packages/eval/package.json       packages/eval/
COPY apps/api/package.json            apps/api/

# Full install: the build needs devDependencies (typescript).
RUN npm ci

# Sources and per-project tsconfigs.
COPY packages ./packages
COPY apps ./apps
COPY tools ./tools

# tsc -b resolves build order from the solution file's project references.
RUN npm run build

# Fail the image if the build produced no output — a silent empty dist would
# otherwise ship and fail at container start.
RUN test -f apps/api/dist/main.js || (echo "build produced no entrypoint" && exit 1)

# ---------------------------------------------------------------------------
# Stage 2 — production dependencies only
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS deps
WORKDIR /build
COPY package.json package-lock.json ./
COPY packages/schemas/package.json    packages/schemas/
COPY packages/text/package.json       packages/text/
COPY packages/provenance/package.json packages/provenance/
COPY packages/raf/package.json        packages/raf/
COPY packages/domain/package.json     packages/domain/
COPY packages/ai/package.json         packages/ai/
COPY packages/eval/package.json       packages/eval/
COPY apps/api/package.json            apps/api/
RUN npm ci --omit=dev

# ---------------------------------------------------------------------------
# Stage 3 — runtime
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

# Non-root, and a read-only-friendly layout: nothing is written to the image
# filesystem at runtime (ADR-0028 K2).
RUN groupadd --system --gid 1001 asdp \
 && useradd  --system --uid 1001 --gid asdp asdp

COPY --from=deps    /build/node_modules ./node_modules
COPY --from=builder /build/package.json ./package.json

# Compiled output and the manifests that make workspace resolution work.
# Sources are NOT shipped.
COPY --from=builder /build/packages/schemas/dist    ./packages/schemas/dist
COPY --from=builder /build/packages/schemas/package.json ./packages/schemas/
COPY --from=builder /build/packages/text/dist       ./packages/text/dist
COPY --from=builder /build/packages/text/package.json ./packages/text/
COPY --from=builder /build/packages/provenance/dist ./packages/provenance/dist
COPY --from=builder /build/packages/provenance/package.json ./packages/provenance/
COPY --from=builder /build/packages/raf/dist        ./packages/raf/dist
COPY --from=builder /build/packages/raf/package.json ./packages/raf/
COPY --from=builder /build/packages/domain/dist     ./packages/domain/dist
COPY --from=builder /build/packages/domain/package.json ./packages/domain/
COPY --from=builder /build/packages/ai/dist         ./packages/ai/dist
COPY --from=builder /build/packages/ai/package.json ./packages/ai/
COPY --from=builder /build/packages/eval/dist       ./packages/eval/dist
COPY --from=builder /build/packages/eval/package.json ./packages/eval/
COPY --from=builder /build/apps/api/dist            ./apps/api/dist
COPY --from=builder /build/apps/api/package.json    ./apps/api/

# Migrations are plain .sql applied by a one-shot task, never on service start
# (ADR-0028 K7, ADR-0035).
COPY --from=builder /build/apps/api/dist/persistence/migrations ./apps/api/dist/persistence/migrations

USER asdp

EXPOSE 3000

# Liveness is process health only; readiness reflects dependency reachability
# (ADR-0028 K4). Orchestrators gate traffic on /health/ready.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/api/dist/main.js"]
