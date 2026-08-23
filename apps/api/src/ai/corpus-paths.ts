/**
 * Where corpora and recordings live on disk (V4a).
 *
 * A separate module so the capture runner and the baseline runner agree, and so
 * neither hard-codes a path that the other could drift from.
 *
 * ADR-0031 says a corpus is resolved from a **configured store**, not from
 * in-repo fixtures — so these are defaults for the synthetic development corpus,
 * overridable by environment. Real material arrives as configuration, not as a
 * code change.
 */

import { env } from 'node:process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repository root, derived from this module's location rather than the cwd. */
function repositoryRoot(): string {
  // dist/ai/corpus-paths.js → apps/api → repository root
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
}

export const CORPUS_ROOT: string =
  env.ASDP_CORPUS_ROOT ?? join(repositoryRoot(), 'corpora', 'synthetic');

export const RECORDINGS_ROOT: string =
  env.ASDP_RECORDINGS_ROOT ?? join(repositoryRoot(), 'corpora', 'synthetic', 'recordings');
