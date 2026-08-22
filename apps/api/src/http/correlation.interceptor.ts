/**
 * Correlation id and structured request logging.
 *
 * ADR-0028 K8: structured JSON logs to stdout with propagated correlation ids.
 * Prompt content is NEVER logged — it goes to the audited interaction store
 * (audit-and-compliance.md §2.1).
 */

import { Inject, Injectable } from '@nestjs/common';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { tap } from 'rxjs';
import type { Observable } from 'rxjs';
import type { Config } from '../config.ts';
import { CONFIG } from './tokens.ts';

interface RequestShape {
  headers: Record<string, string | string[] | undefined>;
  method?: string;
  originalUrl?: string;
  url?: string;
  asdpCorrelationId?: string;
}

interface ResponseShape {
  statusCode: number;
  setHeader(name: string, value: string): void;
}

@Injectable()
export class CorrelationInterceptor implements NestInterceptor {
  constructor(@Inject(CONFIG) private readonly config: Config) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<RequestShape>();
    const res = http.getResponse<ResponseShape>();

    const incoming = req.headers['x-correlation-id'];
    const correlationId =
      (Array.isArray(incoming) ? incoming[0] : incoming) ?? randomUUID();
    req.asdpCorrelationId = correlationId;
    res.setHeader('x-correlation-id', correlationId);

    const started = process.hrtime.bigint();
    const log = (status: number): void => {
      if (this.config.logLevel === 'error' && status < 500) return;
      const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
      process.stdout.write(
        `${JSON.stringify({
          level: status >= 500 ? 'error' : 'info',
          msg: 'http_request',
          method: req.method,
          path: (req.originalUrl ?? req.url ?? '').split('?')[0],
          status,
          durationMs: Math.round(durationMs * 100) / 100,
          correlationId,
        })}\n`,
      );
    };

    return next.handle().pipe(
      tap({
        next: () => log(res.statusCode),
        error: (err: unknown) => {
          const status = (err as { status?: number }).status ?? 500;
          log(status);
        },
      }),
    );
  }
}
