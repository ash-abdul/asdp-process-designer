/**
 * The typed API client — the frontend's only door to the server.
 *
 * Two jobs, and no others.
 *
 * **1. Validate every response at the boundary.** A contract drift becomes a
 * loud, located error here rather than a blank pane three components deep.
 * Schemas come from `@asdp/schemas`, which
 * [ADR-0039](../../../../docs/adr/ADR-0039-react-presentation-layer.md) §2 makes
 * the **only** workspace package this application may import.
 *
 * **2. Preserve the API's status vocabulary.** CLAUDE.md §12 makes 401, 403, 404
 * and 503 mean different things, and a UI that collapses them sends the user
 * looking in the wrong place. `ApiError` carries the status so a screen can say
 * *"you need a role"* rather than *"something went wrong"*.
 *
 * It contains **no business rule**. It does not decide whether a gate is ready,
 * whether an actor may act, or what a confidence band means. It asks.
 */

import { z } from 'zod';

export class ApiError extends Error {
  // Explicit fields, not constructor parameter properties: `erasableSyntaxOnly`
  // is retained everywhere outside apps/api (ADR-0036), and relaxing it to save
  // four lines would weaken a build rule for a convenience.
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }

  /** What the user should be told to do about it. Wording lives in the UI. */
  get kind(): 'unauthenticated' | 'forbidden' | 'not_found' | 'conflict' | 'unavailable' | 'invalid' | 'unknown' {
    if (this.status === 401) return 'unauthenticated';
    if (this.status === 403) return 'forbidden';
    if (this.status === 404) return 'not_found';
    if (this.status === 409) return 'conflict';
    if (this.status === 503) return 'unavailable';
    if (this.status === 400 || this.status === 422) return 'invalid';
    return 'unknown';
  }
}

/** A response that parsed as JSON but did not match its schema. */
export class ContractError extends Error {
  readonly path: string;
  readonly issues: unknown;

  constructor(path: string, issues: unknown) {
    super(`the API response for ${path} did not match the expected shape`);
    this.name = 'ContractError';
    this.path = path;
    this.issues = issues;
  }
}

export interface ClientOptions {
  readonly baseUrl: string;
  /** Supplied per request, so a sign-out takes effect immediately. */
  readonly headers: () => Record<string, string>;
  readonly fetchImpl?: typeof fetch;
}

export interface ApiClient {
  get<T>(path: string, schema: z.ZodType<T>): Promise<T>;
  post<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T>;
  put(path: string, body: unknown): Promise<void>;
}

export function createClient(options: ClientOptions): ApiClient {
  const doFetch = options.fetchImpl ?? fetch;

  async function send<T>(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body: unknown,
    schema: z.ZodType<T> | undefined,
  ): Promise<T> {
    const res = await doFetch(`${options.baseUrl}${path}`, {
      method,
      headers: {
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...options.headers(),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    const text = await res.text();
    const payload = text.length === 0 ? undefined : safeJson(text);

    if (!res.ok) {
      throw new ApiError(res.status, payload, messageFor(res.status, payload));
    }
    if (schema === undefined) return undefined as T;

    const parsed = schema.safeParse(payload);
    if (!parsed.success) throw new ContractError(path, parsed.error.issues);
    return parsed.data;
  }

  return {
    get: (path, schema) => send('GET', path, undefined, schema),
    post: (path, body, schema) => send('POST', path, body, schema),
    // U2 writes that return a shape the UI does not consume. Validating a
    // payload nothing reads would fail a request for a field it does not need.
    put: async (path, body) => {
      await send('PUT', path, body, undefined);
    },
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/** The server's own message when it gave one; never invented. */
function messageFor(status: number, body: unknown): string {
  if (body !== null && typeof body === 'object' && 'error' in body) {
    const err = (body as { error?: unknown }).error;
    if (typeof err === 'string' && err.length > 0) return err;
  }
  return `request failed with status ${status}`;
}
