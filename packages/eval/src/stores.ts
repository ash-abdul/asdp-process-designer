/**
 * Filesystem stores for recordings and corpora (V4a).
 *
 * ADR-0031 rule 5 gave the harness `RecordingStore` and `CorpusStore` ports and an
 * in-memory adapter. V4a adds the filesystem adapter, because a recording that
 * does not outlive the process cannot make CI reproducible — the whole point of
 * `replay_only`.
 *
 * **This is an adapter, not the harness.** The store is still injected, so
 * evaluation behaves identically whether a corpus is a synthetic fixture on disk
 * or real material in an enterprise store. That property is what lets real ASDP
 * corpora arrive later as a data-loading exercise rather than a redesign.
 *
 * ## Recordings are content-addressed by their key hash
 *
 * One file per recording, named by `recordingKeyHash`. A changed prompt version,
 * corpus, model or request produces a different hash and therefore a different
 * file, so a stale recording can never masquerade as a current one — it simply
 * misses, and `replay_only` turns a miss into an error rather than a network call.
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import type { CorpusDescriptor, CorpusStore } from './corpus.ts';
import type { Recording, RecordingStore } from './recording.ts';

export class StoreError extends Error {}

/**
 * Reject a key that could escape the store's directory.
 *
 * The same traversal guard the blob adapter uses: an id arriving from a
 * descriptor file is data, and data is not trusted to stay inside its root.
 */
function safeName(root: string, name: string): string {
  if (name.length === 0 || name.includes('/') || name.includes('\\') || name.includes('..')) {
    throw new StoreError(`unsafe store key '${name}'`);
  }
  const full = resolve(join(root, name));
  if (!full.startsWith(resolve(root) + sep)) {
    throw new StoreError(`store key '${name}' escapes the root directory`);
  }
  return full;
}

export interface FilesystemRecordingStoreConfig {
  readonly rootDirectory: string;
}

/**
 * Recordings on disk, one JSON file per recording.
 *
 * `put` creates the directory if needed, so a first capture does not require
 * anyone to have made a folder first. `list` ignores non-JSON files, so a README
 * beside the fixtures is not a parse error.
 */
export function createFilesystemRecordingStore(
  config: FilesystemRecordingStoreConfig,
): RecordingStore {
  const root = config.rootDirectory;

  return {
    async get(keyHash: string): Promise<Recording | undefined> {
      try {
        const text = await readFile(safeName(root, `${keyHash}.json`), 'utf8');
        return JSON.parse(text) as Recording;
      } catch (err) {
        if ((err as { code?: string }).code === 'ENOENT') return undefined;
        throw err;
      }
    },

    async put(recording: Recording): Promise<void> {
      await mkdir(root, { recursive: true });
      // Pretty-printed deliberately: a recording is committed to the repository
      // and reviewed by a human, so a readable diff matters more than bytes.
      await writeFile(
        safeName(root, `${recording.keyHash}.json`),
        `${JSON.stringify(recording, null, 2)}\n`,
        'utf8',
      );
    },

    async list(): Promise<readonly Recording[]> {
      let names: string[];
      try {
        names = await readdir(root);
      } catch (err) {
        if ((err as { code?: string }).code === 'ENOENT') return [];
        throw err;
      }
      const out: Recording[] = [];
      for (const name of names.filter((n) => n.endsWith('.json')).sort()) {
        out.push(JSON.parse(await readFile(join(root, name), 'utf8')) as Recording);
      }
      return out;
    },
  };
}

export interface FilesystemCorpusStoreConfig {
  readonly rootDirectory: string;
}

/**
 * A corpus on disk: `<root>/<corpusId>/corpus.json` plus its documents.
 *
 * The descriptor carries the **tier**, and the tier is what stops a number
 * measured on synthetic material being quoted as though it were validated
 * (ADR-0031). It is read from the file rather than inferred from the path,
 * because a directory name is not a provenance claim.
 */
export function createFilesystemCorpusStore(config: FilesystemCorpusStoreConfig): CorpusStore {
  const root = config.rootDirectory;

  async function readDescriptor(id: string): Promise<CorpusDescriptor | undefined> {
    try {
      const text = await readFile(join(safeName(root, id), 'corpus.json'), 'utf8');
      return JSON.parse(text) as CorpusDescriptor;
    } catch (err) {
      if ((err as { code?: string }).code === 'ENOENT') return undefined;
      throw err;
    }
  }

  return {
    async list(): Promise<readonly CorpusDescriptor[]> {
      let entries: string[];
      try {
        entries = await readdir(root);
      } catch (err) {
        if ((err as { code?: string }).code === 'ENOENT') return [];
        throw err;
      }
      const out: CorpusDescriptor[] = [];
      for (const entry of entries.sort()) {
        const descriptor = await readDescriptor(entry).catch(() => undefined);
        if (descriptor !== undefined) out.push(descriptor);
      }
      return out;
    },

    get: readDescriptor,

    async readDocument(corpusId: string, documentId: string): Promise<string> {
      const dir = safeName(root, corpusId);
      return readFile(join(safeName(dir, `${documentId}.txt`)), 'utf8');
    },
  };
}
