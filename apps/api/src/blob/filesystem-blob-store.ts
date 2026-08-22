/**
 * Filesystem BlobStore adapter — DEVELOPMENT ONLY.
 *
 * A6 (approved): acceptable for local development, must remain an adapter choice,
 * must not change the production architecture.
 *
 * This is in acknowledged tension with ADR-0028 K2 ("no local filesystem
 * dependence"), and the tension is contained by three guards required at
 * approval:
 *
 *   1. selected explicitly — no silent default (enforced in config.ts)
 *   2. refuses to start alongside any multi-replica configuration (below)
 *   3. listed in the Docker-deferred table so it is never mistaken for
 *      production-ready (infra/README.md)
 *
 * K2's purpose is pod-rescheduling safety, which does not apply to a single-node
 * development environment. It very much applies in production, which is why the
 * S3 adapter is the production path.
 */

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, sep } from 'node:path';
import {
  assertValidBlobKey,
  BlobKeyError,
  type BlobMetadata,
  type BlobStore,
  type PutBlobRequest,
} from './blob-store.ts';

export interface FilesystemBlobStoreOptions {
  readonly rootDirectory: string;
  /** Replica count from configuration. >1 with this adapter is a misconfiguration. */
  readonly replicaCount?: number;
}

export class UnsafeBlobStoreConfiguration extends Error {}

export async function createFilesystemBlobStore(
  options: FilesystemBlobStoreOptions,
): Promise<BlobStore> {
  const replicas = options.replicaCount ?? 1;
  if (replicas > 1) {
    // Guard 2. A filesystem blob store behind several replicas silently loses
    // blobs, which is exactly the failure ADR-0028 K2 exists to prevent.
    throw new UnsafeBlobStoreConfiguration(
      `the filesystem blob store is single-node only; ${replicas} replicas were configured. ` +
        'Use the S3-compatible adapter for any multi-replica deployment (ADR-0028 K2).',
    );
  }

  const root = resolve(options.rootDirectory);
  await mkdir(root, { recursive: true });

  /** Resolve a key to a path, refusing anything that escapes the root. */
  const pathFor = (key: string): string => {
    assertValidBlobKey(key);
    const full = resolve(join(root, key));
    if (full !== root && !full.startsWith(root + sep)) {
      throw new BlobKeyError(`blob key resolves outside the store root: '${key}'`);
    }
    return full;
  };

  const metaPathFor = (key: string): string => `${pathFor(key)}.meta.json`;

  return {
    kind: 'filesystem',

    async put(request: PutBlobRequest): Promise<BlobMetadata> {
      const path = pathFor(request.key);
      const sha256 = createHash('sha256').update(request.data).digest('hex');
      const metadata: BlobMetadata = {
        key: request.key,
        size: request.data.byteLength,
        contentType: request.contentType,
        sha256,
        createdAt: new Date().toISOString(),
      };
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, request.data);
      await writeFile(metaPathFor(request.key), JSON.stringify(metadata), 'utf8');
      return metadata;
    },

    async get(key: string): Promise<Uint8Array | undefined> {
      try {
        const buf = await readFile(pathFor(key));
        return new Uint8Array(buf);
      } catch (err) {
        if ((err as { code?: string }).code === 'ENOENT') return undefined;
        throw err;
      }
    },

    async head(key: string): Promise<BlobMetadata | undefined> {
      try {
        const raw = await readFile(metaPathFor(key), 'utf8');
        return JSON.parse(raw) as BlobMetadata;
      } catch (err) {
        if ((err as { code?: string }).code === 'ENOENT') return undefined;
        throw err;
      }
    },

    async exists(key: string): Promise<boolean> {
      try {
        await stat(pathFor(key));
        return true;
      } catch {
        return false;
      }
    },

    async ping(): Promise<boolean> {
      try {
        await stat(root);
        return true;
      } catch {
        return false;
      }
    },
  };
}
