/**
 * Authentication guard.
 *
 * ADR-0027: authorisation is enforced by the API, never the client, and there is
 * NO skip-auth mode. In `headers` mode the caller must still present an identity;
 * the mode exists so the service can run before an OIDC provider is reachable,
 * not so authentication can be bypassed.
 *
 * ADR-0034 N3: the guard resolves identity only. Role checks belong to the
 * command layer, which already owns them.
 */

import {
  ForbiddenException,
  Inject,
  Injectable,
  createParamDecorator,
} from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Role } from '@asdp/schemas';
import type { Actor } from '../commands.ts';
import type { Config } from '../config.ts';
import { CONFIG } from './tokens.ts';

interface RequestWithActor {
  headers: Record<string, string | string[] | undefined>;
  asdpActor?: Actor;
  asdpCorrelationId?: string;
}

function header(req: RequestWithActor, name: string): string | undefined {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

@Injectable()
export class ActorGuard implements CanActivate {
  constructor(@Inject(CONFIG) private readonly config: Config) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithActor>();

    if (this.config.authMode === 'oidc') {
      // Token verification lands here when the OIDC adapter is implemented.
      // Until then the mode is REFUSED rather than silently trusted.
      throw new ForbiddenException(
        'ASDP_AUTH_MODE=oidc is configured but the OIDC adapter is not yet implemented; ' +
          'no request may be trusted in this state',
      );
    }

    const subject = header(req, 'x-asdp-subject');
    if (subject === undefined || subject.length === 0) {
      throw new ForbiddenException('unauthenticated: x-asdp-subject is required');
    }
    const roles = (header(req, 'x-asdp-roles') ?? '')
      .split(',')
      .map((r) => r.trim())
      .filter((r) => r.length > 0) as Role[];
    if (roles.length === 0) {
      throw new ForbiddenException('unauthenticated: x-asdp-roles is required');
    }

    req.asdpActor = { subject, roles, kind: 'human', tokenIssuer: 'header-mode' };
    return true;
  }
}

/** Injects the authenticated actor resolved by ActorGuard. */
export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Actor => {
    const req = context.switchToHttp().getRequest<RequestWithActor>();
    const actor = req.asdpActor;
    if (actor === undefined) {
      throw new ForbiddenException('no authenticated actor on this request');
    }
    return actor;
  },
);

/** Injects the correlation id assigned by CorrelationInterceptor. */
export const CorrelationId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const req = context.switchToHttp().getRequest<RequestWithActor>();
    return req.asdpCorrelationId ?? 'unknown';
  },
);
