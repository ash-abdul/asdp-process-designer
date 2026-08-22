/**
 * Domain error → HTTP status mapping.
 *
 * ADR-0034 N3: mapping is transport concern, so it lives here rather than in a
 * controller or a command. The command layer throws domain errors and knows
 * nothing about status codes.
 */

import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InvariantViolation } from '@asdp/domain';
import { AuthorizationError, GateGuardError, ValidationError } from '../commands.ts';
import { ConcurrencyError, NotFoundError } from '../ports.ts';
import {
  CheckViolationError,
  DatabaseError,
  ForeignKeyViolationError,
  UniqueViolationError,
} from '../persistence/db.ts';
import { BlobKeyError } from '../blob/blob-store.ts';

interface ResponseShape {
  status(code: number): ResponseShape;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
}

interface RequestShape {
  headers: Record<string, string | string[] | undefined>;
  asdpCorrelationId?: string;
}

function classify(err: unknown): { status: number; body: Record<string, unknown> } {
  if (err instanceof HttpException) {
    // Normalise to the stable `{ error }` envelope rather than passing through
    // NestJS's `{ statusCode, message, error }` shape. The HTTP contract is ours,
    // and it must not change because the composition layer changed (ADR-0034 N1).
    const response = err.getResponse();
    let detail: string;
    if (typeof response === 'string') {
      detail = response;
    } else {
      const asRecord = response as { message?: unknown; error?: unknown };
      const message = asRecord.message;
      detail = Array.isArray(message)
        ? message.map(String).join('; ')
        : typeof message === 'string'
          ? message
          : typeof asRecord.error === 'string'
            ? asRecord.error
            : err.message;
    }
    return { status: err.getStatus(), body: { error: detail } };
  }
  if (err instanceof AuthorizationError) return { status: 403, body: { error: err.message } };
  if (err instanceof GateGuardError) {
    return { status: 409, body: { error: err.message, kind: 'gate_guard' } };
  }
  if (err instanceof InvariantViolation) {
    return { status: 409, body: { error: err.message, kind: 'invariant', invariant: err.invariant } };
  }
  if (err instanceof ValidationError) return { status: 400, body: { error: err.message } };
  if (err instanceof BlobKeyError) return { status: 400, body: { error: err.message } };
  if (err instanceof NotFoundError) return { status: 404, body: { error: err.message } };
  if (err instanceof ConcurrencyError) {
    return { status: 409, body: { error: err.message, kind: 'concurrency' } };
  }
  if (err instanceof UniqueViolationError) {
    return { status: 409, body: { error: err.message, kind: 'conflict' } };
  }
  if (err instanceof ForeignKeyViolationError || err instanceof CheckViolationError) {
    return { status: 400, body: { error: err.message, kind: 'constraint' } };
  }
  if (err instanceof DatabaseError) {
    return { status: 503, body: { error: 'database unavailable', kind: 'database' } };
  }
  return {
    status: 500,
    body: { error: err instanceof Error ? err.message : 'unknown error' },
  };
}

@Catch()
export class DomainErrorFilter implements ExceptionFilter {
  catch(err: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<ResponseShape>();
    const req = http.getRequest<RequestShape>();

    // Interceptors do not run for unmatched routes, so the correlation id is set
    // here too: every response carries one, including 404s, or error reports are
    // untraceable exactly when tracing matters most.
    const incoming = req.headers['x-correlation-id'];
    const correlationId =
      req.asdpCorrelationId ??
      (Array.isArray(incoming) ? incoming[0] : incoming) ??
      randomUUID();
    res.setHeader('x-correlation-id', correlationId);

    const { status, body } = classify(err);
    res.status(status).json(body);
  }
}
