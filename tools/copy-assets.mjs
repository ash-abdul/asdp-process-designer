#!/usr/bin/env node
/**
 * Copy non-TypeScript build assets into `dist/`.
 *
 * ADR-0036 introduced a compile step, and `tsc` emits only TypeScript output.
 * Anything else the runtime loads from disk — SQL migrations today, prompt
 * templates and rule-pack message catalogues later — must be copied alongside it,
 * or the compiled service resolves paths into a directory that does not exist.
 *
 * Found by a test failure rather than by review: the migration runner resolves
 * `migrations/` relative to its own compiled location.
 *
 * Zero dependencies.
 */

import { cp, mkdir, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

/** Directories copied verbatim from `src` to `dist`, per package. */
const ASSET_DIRECTORIES = [
  { pkg: 'apps/api', from: 'src/persistence/migrations', to: 'dist/persistence/migrations' },
];

let copied = 0;
const problems = [];

for (const asset of ASSET_DIRECTORIES) {
  const from = join(ROOT, asset.pkg, asset.from);
  const to = join(ROOT, asset.pkg, asset.to);

  if (!existsSync(from)) {
    problems.push(`missing asset source: ${asset.pkg}/${asset.from}`);
    continue;
  }
  const info = await stat(from);
  if (!info.isDirectory()) {
    problems.push(`asset source is not a directory: ${asset.pkg}/${asset.from}`);
    continue;
  }

  await mkdir(to, { recursive: true });
  await cp(from, to, { recursive: true });

  const files = await readdir(to);
  copied += files.length;
  console.log(`  ${asset.pkg}/${asset.from} → ${asset.to}  (${files.length} file(s))`);
}

if (problems.length > 0) {
  console.error('asset copy FAILED:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(`assets copied (${copied} file(s))`);
