# ASDP Process Designer — single image, two entrypoints (ADR-0028).
#
#   api     → apps/api/src/main.ts     HTTP service
#   worker  → apps/api/src/worker.ts   job consumer
#
# The same image runs both, so domain code cannot drift between them.
#
# NOT YET BUILD-VERIFIED: Docker is unavailable in the Phase 1 development
# environment. This file is a reviewed deliverable, not a tested artifact.
# See infra/README.md.

# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS deps
WORKDIR /app

# Manifests first, so the dependency layer caches independently of sources.
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
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

# Non-root, and a read-only-friendly layout: nothing is written to the image
# filesystem at runtime (ADR-0028 K2).
RUN groupadd --system --gid 1001 asdp \
 && useradd  --system --uid 1001 --gid asdp asdp

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY packages ./packages
COPY apps ./apps

USER asdp

EXPOSE 3000

# Liveness is process health only; readiness reflects dependency reachability
# (ADR-0028 K4). Orchestrators should probe /health/ready for traffic gating.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Default entrypoint is the API; compose overrides `command` for the worker.
CMD ["node", "apps/api/src/main.ts"]
