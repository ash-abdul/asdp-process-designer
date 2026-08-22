/**
 * The BlobStore port.
 *
 * A6 (approved): source bytes and page images live behind an abstraction. A
 * filesystem-backed adapter is acceptable for local development; it MUST remain
 * an adapter choice and MUST NOT change the production architecture, which is an
 * S3-compatible object store.
 *
 * Deliberately object-store-shaped — opaque key, streamed bytes, no directory
 * semantics — so the production adapter is a like-for-like swap. Domain and
 * application logic never sees a filesystem path (A6 condition).
 */

export interface BlobMetadata {
  readonly key: string;
  readonly size: number;
  readonly contentType: string;
  readonly sha256: string;
  readonly createdAt: string;
}

export interface PutBlobRequest {
  /** Opaque key. Callers derive it from content hash, never from a path. */
  readonly key: string;
  readonly data: Uint8Array;
  readonly contentType: string;
}

export interface BlobStore {
  /** Identifies the adapter, for the readiness report and the audit record. */
  readonly kind: 'filesystem' | 's3';
  put(request: PutBlobRequest): Promise<BlobMetadata>;
  get(key: string): Promise<Uint8Array | undefined>;
  head(key: string): Promise<BlobMetadata | undefined>;
  exists(key: string): Promise<boolean>;
  /** For the readiness probe (ADR-0028 K4). */
  ping(): Promise<boolean>;
}

export class BlobNotFoundError extends Error {}
export class BlobKeyError extends Error {}

/**
 * Validate a blob key.
 *
 * Keys are opaque to callers but must be safe for every adapter, so the
 * intersection of object-store and filesystem constraints applies: no traversal,
 * no absolute paths, no backslashes, bounded length. This is what stops a
 * filesystem adapter turning a key into a path escape.
 */
export function assertValidBlobKey(key: string): void {
  if (key.length === 0 || key.length > 512) {
    throw new BlobKeyError(`blob key must be 1–512 characters: '${key}'`);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(key)) {
    throw new BlobKeyError(`blob key contains an unsafe character: '${key}'`);
  }
  if (key.includes('..') || key.startsWith('/') || key.includes('//') || key.includes('\\')) {
    throw new BlobKeyError(`blob key must not traverse or be absolute: '${key}'`);
  }
}

/**
 * Derive a content-addressed key.
 *
 * Content addressing means a re-uploaded identical source is deduplicated for
 * free, and the key carries no filesystem meaning — which is what keeps the
 * abstraction honest.
 */
export function contentAddressedKey(
  namespace: 'sources' | 'pages' | 'artifacts',
  sha256: string,
  extension?: string,
): string {
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    throw new BlobKeyError(`content hash must be 64 hex characters: '${sha256}'`);
  }
  const shard = `${sha256.slice(0, 2)}/${sha256.slice(2, 4)}`;
  const suffix = extension === undefined ? '' : `.${extension.replace(/^\./, '')}`;
  return `${namespace}/${shard}/${sha256}${suffix}`;
}
