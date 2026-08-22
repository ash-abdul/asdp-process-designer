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
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
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
      //
      // 503, not 401 or 403: nothing is wrong with the caller's credentials —
      // the service is configured to require an authentication mechanism it
      // cannot perform. Reporting it as a client error would send the caller
      // looking for a problem with their token that does not exist.
      throw new ServiceUnavailableException(
        'ASDP_AUTH_MODE=oidc is configured but the OIDC adapter is not yet implemented; ' +
          'no request may be trusted in this state',
      );
    }

    // 401, not 403: absent or unusable credentials are an AUTHENTICATION failure.
    // 403 is reserved for an authenticated caller who lacks the required role,
    // which the command layer decides. Phase 1 returned 403 here; the settled
    // posture is 401 / 403 / 404 by meaning (CLAUDE.md §12).
    const subject = header(req, 'x-asdp-subject');
    if (subject === undefined || subject.length === 0) {
      throw new UnauthorizedException('unauthenticated: x-asdp-subject is required');
    }
    const roles = (header(req, 'x-asdp-roles') ?? '')
      .split(',')
      .map((r) => r.trim())
      .filter((r) => r.length > 0) as Role[];
    if (roles.length === 0) {
      throw new UnauthorizedException('unauthenticated: x-asdp-roles is required');
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
      // Reachable only if a handler asks for the actor without the guard having
      // run. That is a wiring mistake, not an authorisation decision — but the
      // caller is still unauthenticated, so 401 is the honest status.
      throw new UnauthorizedException('no authenticated actor on this request');
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
