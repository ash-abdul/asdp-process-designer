/**
 * HTTP surface.
 *
 * Built on Node's built-in http module with a small typed router. See
 * docs/adr/ADR-0033 for why NestJS is deferred.
 *
 * Every architectural obligation is implemented explicitly as middleware:
 * authentication, RBAC, gate guards, audit interception, correlation ids,
 * structured logging and graceful shutdown.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';

import type { GateCode, Role, Stage } from '@asdp/schemas';
import type { Config } from './config.ts';
import {
  approveProjectGate,
  assertStageEnterable,
  AuthorizationError,
  createProject,
  evaluateProjectGate,
  freezeProjectBaseline,
  GateGuardError,
  ValidationError,
  type Actor,
  type CommandContext,
} from './commands.ts';
import { ConcurrencyError, type DependencyProbe } from './ports.ts';

export interface AppDeps {
  readonly config: Config;
  readonly ctx: Omit<CommandContext, 'correlationId'>;
  readonly probe: DependencyProbe;
}

interface Handled {
  readonly status: number;
  readonly body: unknown;
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

/**
 * Resolve the caller.
 *
 * ADR-0027: authorisation is enforced by the API, never by the client, and there
 * is NO skip-auth mode. In `headers` mode the caller must still present an
 * identity; the mode exists so the service can run before an OIDC provider is
 * reachable, not so authentication can be bypassed.
 */
function resolveActor(req: IncomingMessage, config: Config): Actor {
  if (config.authMode === 'oidc') {
    // Token verification lands here when the OIDC adapter is implemented; until
    // then the mode is rejected rather than silently trusted.
    throw new AuthorizationError(
      'ASDP_AUTH_MODE=oidc is configured but the OIDC adapter is not yet implemented; ' +
        'no request may be trusted in this state',
    );
  }

  const subject = header(req, 'x-asdp-subject');
  const rolesRaw = header(req, 'x-asdp-roles');
  if (subject === undefined || subject.length === 0) {
    throw new AuthorizationError('unauthenticated: x-asdp-subject is required');
  }
  const roles = (rolesRaw ?? '')
    .split(',')
    .map((r) => r.trim())
    .filter((r) => r.length > 0) as Role[];
  if (roles.length === 0) {
    throw new AuthorizationError('unauthenticated: x-asdp-roles is required');
  }
  return { subject, roles, kind: 'human', tokenIssuer: 'header-mode' };
}

function header(req: IncomingMessage, name: string): string | undefined {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    // Bounded resource behaviour (ADR-0028 K11).
    if (total > 1_000_000) throw new ValidationError('request body exceeds 1 MB');
    chunks.push(buf);
  }
  if (chunks.length === 0) return {};
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new ValidationError('request body must be a JSON object');
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError('request body is not valid JSON');
  }
}

function str(body: Record<string, unknown>, key: string): string {
  const v = body[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new ValidationError(`'${key}' is required and must be a non-empty string`);
  }
  return v;
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

async function route(
  req: IncomingMessage,
  deps: AppDeps,
  correlationId: string,
): Promise<Handled> {
  const url = new URL(req.url ?? '/', 'http://internal');
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = req.method ?? 'GET';
  const ctx: CommandContext = { ...deps.ctx, correlationId };

  // --- health (ADR-0028 K4: liveness and readiness are DISTINCT) ----------
  if (method === 'GET' && path === '/health/live') {
    return { status: 200, body: { status: 'live' } };
  }
  if (method === 'GET' && path === '/health/ready') {
    const report = await deps.probe.check();
    return { status: report.ok ? 200 : 503, body: report };
  }
  if (method === 'GET' && path === '/health/dependencies') {
    return { status: 200, body: await deps.probe.check() };
  }
  if (method === 'GET' && path === '/meta') {
    return {
      status: 200,
      body: {
        service: 'asdp-api',
        phase: 'Phase 1',
        repository: deps.config.repository,
        authMode: deps.config.authMode,
        rafVersion: deps.config.rafVersion,
        rulePackVersion: deps.config.rulePackVersion,
        camundaTargetProfileId: deps.config.camundaTargetProfileId,
      },
    };
  }

  // Everything below requires an authenticated caller.
  const actor = resolveActor(req, deps.config);

  if (method === 'POST' && path === '/projects') {
    const body = await readJson(req);
    const project = await createProject(ctx, actor, {
      key: str(body, 'key'),
      name: str(body, 'name'),
      description: typeof body.description === 'string' ? body.description : undefined,
      settings: (body.settings as Record<string, unknown> | undefined) ?? undefined,
    });
    return { status: 201, body: project };
  }

  if (method === 'GET' && path === '/projects') {
    return { status: 200, body: await ctx.repos.projects.list() };
  }

  const projectMatch = /^\/projects\/([^/]+)(\/.*)?$/.exec(path);
  if (projectMatch !== null) {
    const projectId = decodeURIComponent(projectMatch[1] as string);
    const rest = projectMatch[2] ?? '';

    if (method === 'GET' && rest === '') {
      const project = await ctx.repos.projects.get(projectId);
      if (project === undefined) return { status: 404, body: { error: 'project not found' } };
      return { status: 200, body: project };
    }

    if (method === 'GET' && rest === '/gates') {
      return { status: 200, body: await ctx.repos.gates.list(projectId) };
    }

    if (method === 'GET' && rest === '/audit') {
      return { status: 200, body: await ctx.repos.audit.list(projectId) };
    }

    if (method === 'POST' && rest === '/baselines') {
      const body = await readJson(req);
      const baseline = await freezeProjectBaseline(ctx, actor, {
        projectId,
        stage: str(body, 'stage') as Stage,
        members: (body.members as never) ?? [],
      });
      return { status: 201, body: baseline };
    }

    if (method === 'GET' && rest === '/baselines') {
      return { status: 200, body: await ctx.repos.baselines.list(projectId) };
    }

    const gateMatch = /^\/gates\/(G[0-4])\/(evaluate|approve)$/.exec(rest);
    if (method === 'POST' && gateMatch !== null) {
      const gate = gateMatch[1] as GateCode;
      const action = gateMatch[2];
      const body = await readJson(req);

      if (action === 'evaluate') {
        const result = await evaluateProjectGate(ctx, actor, {
          projectId,
          gate,
          baselineId: str(body, 'baselineId'),
          validationRunId: str(body, 'validationRunId'),
          blockingFindingIds: Array.isArray(body.blockingFindingIds)
            ? (body.blockingFindingIds as string[])
            : [],
        });
        return { status: 200, body: result };
      }

      const result = await approveProjectGate(ctx, actor, {
        projectId,
        gate,
        baselineId: str(body, 'baselineId'),
        validationRunId: str(body, 'validationRunId'),
        comment: typeof body.comment === 'string' ? body.comment : undefined,
        contentAuthors: Array.isArray(body.contentAuthors)
          ? (body.contentAuthors as string[])
          : [],
      });
      return { status: 200, body: result };
    }

    // Read-lock probe: may this stage be entered?
    const stageMatch = /^\/stages\/([a-z]+)\/enterable$/.exec(rest);
    if (method === 'GET' && stageMatch !== null) {
      const stage = stageMatch[1] as Stage;
      try {
        await assertStageEnterable(ctx, projectId, stage);
        return { status: 200, body: { stage, enterable: true } };
      } catch (err) {
        if (err instanceof GateGuardError) {
          return { status: 200, body: { stage, enterable: false, reason: err.message } };
        }
        throw err;
      }
    }
  }

  return { status: 404, body: { error: `no route for ${method} ${path}` } };
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

function mapError(err: unknown): Handled {
  if (err instanceof AuthorizationError) return { status: 403, body: { error: err.message } };
  if (err instanceof GateGuardError) {
    return { status: 409, body: { error: err.message, kind: 'gate_guard' } };
  }
  if (err instanceof ValidationError) return { status: 400, body: { error: err.message } };
  if (err instanceof ConcurrencyError) {
    return { status: 409, body: { error: err.message, kind: 'concurrency' } };
  }
  const message = err instanceof Error ? err.message : 'unknown error';
  return { status: 500, body: { error: message } };
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

export interface RunningServer {
  readonly server: Server;
  readonly port: number;
  close(): Promise<void>;
}

export function createApp(deps: AppDeps): Server {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    const correlationId = header(req, 'x-correlation-id') ?? randomUUID();
    const started = process.hrtime.bigint();

    void route(req, deps, correlationId)
      .then((handled) => handled)
      .catch((err: unknown) => mapError(err))
      .then((handled) => {
        const payload = JSON.stringify(handled.body ?? null);
        res.writeHead(handled.status, {
          'content-type': 'application/json; charset=utf-8',
          'x-correlation-id': correlationId,
        });
        res.end(payload);

        // Structured JSON log to stdout (ADR-0028 K8). Never prompt content.
        const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
        if (deps.config.logLevel !== 'error' || handled.status >= 500) {
          process.stdout.write(
            `${JSON.stringify({
              level: handled.status >= 500 ? 'error' : 'info',
              msg: 'http_request',
              method: req.method,
              path: (req.url ?? '').split('?')[0],
              status: handled.status,
              durationMs: Math.round(durationMs * 100) / 100,
              correlationId,
            })}\n`,
          );
        }
      });
  });
}

/** Start the server and resolve once it is listening. */
export function listen(deps: AppDeps, port = deps.config.port): Promise<RunningServer> {
  const server = createApp(deps);
  return new Promise<RunningServer>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      const address = server.address();
      const boundPort = typeof address === 'object' && address !== null ? address.port : port;
      resolve({
        server,
        port: boundPort,
        close: () =>
          new Promise<void>((done, fail) => {
            server.close((err) => (err ? fail(err) : done()));
          }),
      });
    });
  });
}
