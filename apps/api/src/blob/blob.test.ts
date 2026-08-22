/**
 * Tests for the BlobStore port and its development adapter.
 *
 * A6: a filesystem adapter is acceptable for local development, must remain an
 * adapter choice, and must not let domain or application logic depend on
 * filesystem paths.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  assertValidBlobKey,
  BlobKeyError,
  contentAddressedKey,
} from './blob-store.ts';
import {
  createFilesystemBlobStore,
  UnsafeBlobStoreConfiguration,
} from './filesystem-blob-store.ts';

async function store() {
  const root = await mkdtemp(join(tmpdir(), 'asdp-blob-test-'));
  return { root, blobs: await createFilesystemBlobStore({ rootDirectory: root }) };
}

const HASH = 'a'.repeat(64);

describe('blob keys are opaque and safe', () => {
  test('accepts a well-formed key', () => {
    assert.doesNotThrow(() => assertValidBlobKey('sources/ab/cd/somehash.pdf'));
  });

  test('REJECTS TRAVERSAL — this is what stops a key becoming a path escape', () => {
    for (const bad of [
      '../etc/passwd',
      'sources/../../etc/passwd',
      '/absolute/path',
      'sources//double',
      'windows\\path',
    ]) {
      assert.throws(() => assertValidBlobKey(bad), BlobKeyError, `must reject '${bad}'`);
    }
  });

  test('rejects an empty or over-long key', () => {
    assert.throws(() => assertValidBlobKey(''), BlobKeyError);
    assert.throws(() => assertValidBlobKey('a'.repeat(513)), BlobKeyError);
  });

  test('rejects unsafe characters', () => {
    for (const bad of ['sources/a b', 'sources/a?b', 'sources/a;b', 'sources/a\nb']) {
      assert.throws(() => assertValidBlobKey(bad), BlobKeyError);
    }
  });
});

describe('content-addressed keys', () => {
  test('shards by hash prefix and carries no filesystem meaning', () => {
    const key = contentAddressedKey('sources', HASH, 'pdf');
    assert.equal(key, `sources/aa/aa/${HASH}.pdf`);
    assert.doesNotThrow(() => assertValidBlobKey(key));
  });

  test('the same content yields the same key — deduplication for free', () => {
    assert.equal(contentAddressedKey('sources', HASH), contentAddressedKey('sources', HASH));
  });

  test('namespaces are separated', () => {
    assert.notEqual(
      contentAddressedKey('sources', HASH),
      contentAddressedKey('pages', HASH),
    );
  });

  test('rejects a malformed content hash', () => {
    assert.throws(() => contentAddressedKey('sources', 'not-a-hash'), BlobKeyError);
    assert.throws(() => contentAddressedKey('sources', 'A'.repeat(64)), BlobKeyError, 'uppercase');
  });
});

describe('filesystem adapter', () => {
  test('put then get round-trips exact bytes', async () => {
    const { blobs } = await store();
    const data = new Uint8Array([0, 1, 2, 250, 255]);
    const key = contentAddressedKey('sources', HASH, 'bin');

    const meta = await blobs.put({ key, data, contentType: 'application/octet-stream' });
    assert.equal(meta.size, 5);
    assert.match(meta.sha256, /^[0-9a-f]{64}$/);

    const back = await blobs.get(key);
    assert.deepEqual(Array.from(back ?? []), Array.from(data));
  });

  test('stores a UTF-8 Arabic document byte-exact', async () => {
    const { blobs } = await store();
    const text = 'يجب إتمام التحقق من الهوية خلال ثلاثة أيام عمل';
    const data = new TextEncoder().encode(text);
    const key = contentAddressedKey('sources', 'b'.repeat(64), 'txt');

    await blobs.put({ key, data, contentType: 'text/plain; charset=utf-8' });
    const back = await blobs.get(key);
    assert.equal(new TextDecoder().decode(back), text);
  });

  test('head returns metadata without reading the body', async () => {
    const { blobs } = await store();
    const key = contentAddressedKey('pages', 'c'.repeat(64), 'png');
    await blobs.put({ key, data: new Uint8Array([1, 2, 3]), contentType: 'image/png' });

    const meta = await blobs.head(key);
    assert.equal(meta?.contentType, 'image/png');
    assert.equal(meta?.size, 3);
    assert.equal(meta?.key, key);
  });

  test('a missing blob yields undefined, not a throw', async () => {
    const { blobs } = await store();
    assert.equal(await blobs.get('sources/zz/zz/absent'), undefined);
    assert.equal(await blobs.head('sources/zz/zz/absent'), undefined);
    assert.equal(await blobs.exists('sources/zz/zz/absent'), false);
  });

  test('reports its kind, so the readiness report and audit can name the adapter', async () => {
    const { blobs } = await store();
    assert.equal(blobs.kind, 'filesystem');
    assert.equal(await blobs.ping(), true);
  });

  test('a traversal key cannot escape the store root', async () => {
    const { blobs } = await store();
    await assert.rejects(
      () => blobs.put({ key: '../escaped', data: new Uint8Array([1]), contentType: 'x' }),
      BlobKeyError,
    );
    await assert.rejects(() => blobs.get('../../etc/passwd'), BlobKeyError);
  });

  test('bytes land under the store root and nowhere else', async () => {
    const { root, blobs } = await store();
    const key = contentAddressedKey('sources', 'd'.repeat(64), 'txt');
    await blobs.put({ key, data: new TextEncoder().encode('hello'), contentType: 'text/plain' });
    const onDisk = await readFile(join(root, key), 'utf8');
    assert.equal(onDisk, 'hello');
  });
});

describe('A6 GUARD 2: single-node only', () => {
  test('the filesystem adapter REFUSES to start behind multiple replicas', async () => {
    const root = await mkdtemp(join(tmpdir(), 'asdp-blob-test-'));
    await assert.rejects(
      () => createFilesystemBlobStore({ rootDirectory: root, replicaCount: 3 }),
      UnsafeBlobStoreConfiguration,
    );
  });

  test('a single replica is accepted', async () => {
    const root = await mkdtemp(join(tmpdir(), 'asdp-blob-test-'));
    await assert.doesNotReject(() =>
      createFilesystemBlobStore({ rootDirectory: root, replicaCount: 1 }),
    );
  });
});
