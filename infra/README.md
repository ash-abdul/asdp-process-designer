# Infrastructure

> **Status:** authored in Phase 1, **not executed**. Docker is unavailable in the current
> development environment, so `Dockerfile` and `docker-compose.yml` are reviewed deliverables
> rather than tested artifacts. Everything else in Phase 1 runs and is tested without them.

Governed by [ADR-0028](../docs/adr/ADR-0028-containerised-compose-first.md).

---

## Topology

| Service | Role |
|---|---|
| `api` | Stateless HTTP service |
| `worker` | Stateless job consumer — **same image, different entrypoint**, so domain code cannot drift |
| `migrate` | One-shot migration task. Migrations never run on service start (K7) |
| `postgres` | Domain, evidence, trace graph, audit. **ICU collation required** (ADR-0023); pgvector for near-duplicate detection only |
| `minio` | S3-compatible object store: source blobs, page images, artifact payloads |
| `oidc` | Standards-compliant development identity provider. **There is no skip-auth mode** (ADR-0027) |

## Running it (once Docker is available)

```
docker compose -f infra/docker-compose.yml up --build
docker compose -f infra/docker-compose.yml run --rm migrate
```

## Kubernetes-readiness rules honoured in these files

| Rule | Where |
|---|---|
| K1 stateless services | No volumes on `api`/`worker`; no in-process session state |
| K2 no local filesystem dependence | Nothing written to the image filesystem at runtime; non-root user |
| K3 12-factor config | Every setting is an `ASDP_*` environment variable; no baked values |
| K4 distinct health and readiness | `HEALTHCHECK` probes `/health/live`; orchestrators gate traffic on `/health/ready` |
| K5 graceful shutdown | Implemented in `apps/api/src/main.ts`; SIGTERM drains before exit |
| K7 migrations as a task | The separate `migrate` service |
| K10 no co-location assumptions | Service addresses come from configuration, never `localhost` defaults |

## What Phase 1 could not verify

1. Image build and layer caching.
2. Compose start-up ordering and health gating.
3. Postgres ICU collation initialisation flags.
4. Keycloak realm import (`infra/oidc-realm/` is not yet authored).
5. MinIO bucket bootstrapping.

These become the first tasks of the next phase in an environment with a container runtime. Until
then, the API runs directly with `npm start` against the in-memory repository adapter.
