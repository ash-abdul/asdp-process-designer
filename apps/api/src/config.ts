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
  /**
   * Persistence adapter (ADR-0035). `pglite` is development and CI; `postgres`
   * is production. `memory` remains for unit tests that need no SQL.
   */
  readonly repository: 'memory' | 'pglite' | 'postgres';
  readonly databaseUrl?: string;
  /** PGlite data directory. Omitted ⇒ in-memory, which tests rely on. */
  readonly databaseDir?: string;
  /**
   * Blob adapter (A6). MUST be selected explicitly — there is no silent default
   * to `filesystem`, because that would let a dev adapter reach production.
   */
  readonly blobStore: 'filesystem' | 's3';
  readonly blobRoot?: string;
  /** Replica count. >1 with a filesystem blob store is refused at startup. */
  readonly replicaCount: number;
  readonly objectStoreEndpoint?: string;
  /**
   * Maximum accepted source size (V1 intake). Bounded because an unbounded
   * upload is a denial-of-service surface, and because a document larger than
   * this is almost certainly the wrong file rather than a very long BRD.
   */
  readonly maxSourceBytes: number;
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
    repository: oneOf(
      env.ASDP_REPOSITORY,
      ['memory', 'pglite', 'postgres'] as const,
      'pglite',
      'ASDP_REPOSITORY',
    ),
    databaseUrl: env.ASDP_DATABASE_URL,
    databaseDir: env.ASDP_DATABASE_DIR,
    blobStore: oneOf(env.ASDP_BLOB_STORE, ['filesystem', 's3'] as const, 'filesystem', 'ASDP_BLOB_STORE'),
    blobRoot: env.ASDP_BLOB_ROOT,
    replicaCount: num(env.ASDP_REPLICA_COUNT, 1, 'ASDP_REPLICA_COUNT'),
    objectStoreEndpoint: env.ASDP_OBJECT_STORE_ENDPOINT,
    maxSourceBytes: num(env.ASDP_MAX_SOURCE_BYTES, 10 * 1024 * 1024, 'ASDP_MAX_SOURCE_BYTES'),
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

  if (config.maxSourceBytes <= 0) {
    throw new ConfigError(
      `ASDP_MAX_SOURCE_BYTES must be positive, got ${config.maxSourceBytes}; there is no ` +
        '"unlimited" value because an unbounded upload is a denial-of-service surface',
    );
  }
  if (config.repository === 'postgres' && (config.databaseUrl ?? '') === '') {
    throw new ConfigError('ASDP_DATABASE_URL is required when ASDP_REPOSITORY=postgres');
  }
  if (config.blobStore === 's3' && (config.objectStoreEndpoint ?? '') === '') {
    throw new ConfigError('ASDP_OBJECT_STORE_ENDPOINT is required when ASDP_BLOB_STORE=s3');
  }
  if (config.blobStore === 'filesystem' && (config.blobRoot ?? '') === '') {
    throw new ConfigError('ASDP_BLOB_ROOT is required when ASDP_BLOB_STORE=filesystem');
  }
  // A6 guard 2: a filesystem blob store behind several replicas silently loses
  // blobs — exactly the failure ADR-0028 K2 exists to prevent.
  if (config.blobStore === 'filesystem' && config.replicaCount > 1) {
    throw new ConfigError(
      `ASDP_BLOB_STORE=filesystem is single-node only, but ASDP_REPLICA_COUNT=${config.replicaCount}. ` +
        'Use ASDP_BLOB_STORE=s3 for any multi-replica deployment (ADR-0028 K2).',
    );
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
