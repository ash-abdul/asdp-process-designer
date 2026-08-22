#!/usr/bin/env node
/**
 * Documentation consistency checker.
 *
 * Phase 0 produced 72 interlinked specifications that are the governing source of
 * truth. A broken cross-reference silently degrades them, so link integrity is a
 * CI gate rather than an occasional manual sweep.
 *
 * Checks:
 *   1. every relative Markdown link resolves to a file that exists
 *   2. every ADR referenced by number exists
 *   3. every ADR file is listed in the ADR index
 *   4. no document references a superseded artefact name
 *
 * Zero dependencies.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DOCS = join(ROOT, 'docs');

/** Names removed or renamed during the Phase 0 corrections. */
const SUPERSEDED_NAMES = [
  'layout_hint',
  'override_technical_id',
  'override_element_name',
  'use_gateway_style',
  'externalise_decision',
  'inline_decision',
  'collapse_notification_into_task',
  'extract_call_activity',
  'complianceAndPolicyBasis',
  'openIssuesFromSources',
];

/** Files permitted to mention superseded names, because they record the history. */
const HISTORY_FILES = [
  'docs/adr/ADR-0013-generation-directives.md',
  'docs/30-generation/generation-directives.md',
  'docs/20-domain/requirement-analysis-frame.md',
  'docs/adr/ADR-0014-layout-safety-critical.md',
  'docs/10-architecture/technology-stack.md',
];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.md')) out.push(full);
  }
  return out;
}

const problems = [];
const mdFiles = [...walk(DOCS), join(ROOT, 'README.md'), join(ROOT, 'infra/README.md')].filter(existsSync);

let linkCount = 0;

for (const file of mdFiles) {
  const rel = relative(ROOT, file);
  const text = readFileSync(file, 'utf8');

  // 1. relative link resolution
  for (const m of text.matchAll(/\]\((?!https?:|#|mailto:)([^)\s#]+)(?:#[^)]*)?\)/g)) {
    const target = m[1];
    linkCount++;
    const resolved = resolve(dirname(file), target);
    if (!existsSync(resolved)) {
      problems.push({ file: rel, kind: 'broken-link', detail: target });
    }
  }

  // 2. referenced ADR numbers exist
  for (const m of text.matchAll(/\bADR-(\d{4})\b/g)) {
    const num = m[1];
    const found = existsSync(join(DOCS, 'adr'))
      ? readdirSync(join(DOCS, 'adr')).some((f) => f.startsWith(`ADR-${num}-`))
      : false;
    if (!found) problems.push({ file: rel, kind: 'missing-adr', detail: `ADR-${num}` });
  }

  // 4. superseded names outside the files that record history
  if (!HISTORY_FILES.includes(rel)) {
    for (const name of SUPERSEDED_NAMES) {
      if (new RegExp(`\\b${name}\\b`).test(text)) {
        problems.push({ file: rel, kind: 'superseded-name', detail: name });
      }
    }
  }
}

// 3. every ADR is indexed
const adrDir = join(DOCS, 'adr');
if (existsSync(adrDir)) {
  const indexText = readFileSync(join(adrDir, 'README.md'), 'utf8');
  for (const f of readdirSync(adrDir)) {
    if (!f.startsWith('ADR-')) continue;
    if (!indexText.includes(f)) {
      problems.push({ file: 'docs/adr/README.md', kind: 'unindexed-adr', detail: f });
    }
  }
}

if (problems.length === 0) {
  console.log(`documentation checks passed (${mdFiles.length} files, ${linkCount} links)`);
  process.exit(0);
}
console.error(`documentation checks FAILED — ${problems.length} problem(s):\n`);
for (const p of problems) console.error(`  [${p.kind}] ${p.file}\n      ${p.detail}`);
process.exit(1);
