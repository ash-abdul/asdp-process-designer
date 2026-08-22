/**
 * Configuration.
 *
 * ADR-0028 K3: all configuration from environment variables or mounted files;
 * no baked-in environment values; secrets injected, never in the image.
 *
 * ADR-0028 rule: NO CODE BRANCHES ON ENVIRONMENT NAME. Behavioural differences
 * are explicit configuration values, so "works in dev, fails in prod" has one
 * fewer cause. The architecture checker enforces this.
 */

export interface Config {
  readonly port: number;
  readonly logLevel: 'debug' | 'info' | 'warn' | 'error';
  /** Repository adapter. `memory` is the Phase 1 implementation. */
  readonly repository: 'memory' | 'postgres';
  readonly databaseUrl?: string;
  readonly objectStoreEndpoint?: string;
  readonly camundaTargetProfileId: string;
  readonly rulePackVersion: string;
  readonly rafVersion: string;
  /** OIDC. Required when authMode is 'oidc'. */
  readonly authMode: 'oidc' | 'headers';
  readonly oidcIssuerUrl?: string;
  readonly oidcClientId?: string;
  readonly oidcAudience?: string;
  readonly oidcClaimGroups: string;
  readonly shutdownGraceMs: number;
}

export class ConfigError extends Error {}

function num(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new ConfigError(`${name} must be a number, got '${raw}'`);
  return n;
}

function oneOf<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
  fallback: T,
  name: string,
): T {
  if (raw === undefined || raw === '') return fallback;
  if (!(allowed as readonly string[]).includes(raw)) {
    throw new ConfigError(`${name} must be one of ${allowed.join('|')}, got '${raw}'`);
  }
  return raw as T;
}

/**
 * Load and validate configuration. Fails fast on a missing required value
 * (ADR-0028 K3) rather than surfacing the problem at first use.
 */
export function loadConfig(env: Readonly<Record<string, string | undefined>>): Config {
  const authMode = oneOf(env.ASDP_AUTH_MODE, ['oidc', 'headers'] as const, 'headers', 'ASDP_AUTH_MODE');

  const config: Config = {
    port: num(env.PORT, 3000, 'PORT'),
    logLevel: oneOf(env.ASDP_LOG_LEVEL, ['debug', 'info', 'warn', 'error'] as const, 'info', 'ASDP_LOG_LEVEL'),
    repository: oneOf(env.ASDP_REPOSITORY, ['memory', 'postgres'] as const, 'memory', 'ASDP_REPOSITORY'),
    databaseUrl: env.ASDP_DATABASE_URL,
    objectStoreEndpoint: env.ASDP_OBJECT_STORE_ENDPOINT,
    camundaTargetProfileId: env.ASDP_CAMUNDA_TARGET_PROFILE ?? 'camunda-8x-baseline',
    rulePackVersion: env.ASDP_RULE_PACK_VERSION ?? 'rp-1.2',
    rafVersion: env.ASDP_RAF_VERSION ?? 'raf-1.1',
    authMode,
    oidcIssuerUrl: env.ASDP_OIDC_ISSUER_URL,
    oidcClientId: env.ASDP_OIDC_CLIENT_ID,
    oidcAudience: env.ASDP_OIDC_AUDIENCE,
    oidcClaimGroups: env.ASDP_OIDC_CLAIM_GROUPS ?? 'groups',
    shutdownGraceMs: num(env.ASDP_SHUTDOWN_GRACE_MS, 10_000, 'ASDP_SHUTDOWN_GRACE_MS'),
  };

  if (config.repository === 'postgres' && (config.databaseUrl ?? '') === '') {
    throw new ConfigError('ASDP_DATABASE_URL is required when ASDP_REPOSITORY=postgres');
  }
  if (config.authMode === 'oidc') {
    for (const [key, value] of [
      ['ASDP_OIDC_ISSUER_URL', config.oidcIssuerUrl],
      ['ASDP_OIDC_CLIENT_ID', config.oidcClientId],
      ['ASDP_OIDC_AUDIENCE', config.oidcAudience],
    ] as const) {
      if ((value ?? '') === '') {
        throw new ConfigError(`${key} is required when ASDP_AUTH_MODE=oidc`);
      }
    }
  }

  return config;
}
