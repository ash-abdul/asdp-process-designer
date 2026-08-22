#!/usr/bin/env node
/**
 * ASDP architecture checker.
 *
 * Enforces, mechanically and in CI, the invariants that Phase 0 declared must be
 * structural rather than cultural:
 *
 *   I1  packages/ai has no write authority          ADR-0004  (dep rule)
 *   I2  only compilers may serialise artifacts      ADR-0005  (dep rule)
 *   I3  no artifact-mutating command exists         ADR-0002  (absence test)
 *   I9  vendor AI SDKs only inside ai/adapters      ADR-0020  (dep rule)
 *   --  pure packages perform no I/O                module-map.md §2
 *   --  no branching on environment name            ADR-0028 K3
 *
 * Run:  node tools/check-architecture.mjs
 *       node tools/check-architecture.mjs --self-test
 *
 * Zero dependencies by design: this tool must run before anything is installed.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

/** Allowed workspace-internal dependencies, by package name. */
const ALLOWED_DEPS = {
  '@asdp/schemas': [],
  '@asdp/text': ['@asdp/schemas'],
  '@asdp/provenance': ['@asdp/schemas', '@asdp/text'],
  '@asdp/raf': ['@asdp/schemas'],
  '@asdp/domain': ['@asdp/schemas', '@asdp/text', '@asdp/provenance', '@asdp/raf'],
  // ADR-0004 / invariant I1: the AI layer cannot reach domain state.
  '@asdp/ai': ['@asdp/schemas', '@asdp/raf', '@asdp/text'],
  '@asdp/eval': ['@asdp/schemas', '@asdp/ai', '@asdp/text', '@asdp/provenance'],
  '@asdp/api': [
    '@asdp/schemas',
    '@asdp/text',
    '@asdp/provenance',
    '@asdp/raf',
    '@asdp/domain',
    '@asdp/ai',
    '@asdp/eval',
  ],
};

/** Modules a pure package may never import. node:crypto is allowed: hashing is
 *  a deterministic computation, not I/O (see NOTE-PURITY in docs consistency). */
const FORBIDDEN_IN_PURE = [
  'node:fs',
  'node:fs/promises',
  'node:http',
  'node:https',
  'node:net',
  'node:dgram',
  'node:child_process',
  'node:worker_threads',
  'node:os',
  'node:process',
  'node:cluster',
  'node:dns',
  'node:tls',
  'node:readline',
  'node:repl',
];

/** Non-deterministic constructs forbidden in pure packages. */
const FORBIDDEN_PATTERNS_IN_PURE = [
  { re: /\bDate\.now\s*\(/, why: 'clock access (pure packages must be deterministic)' },
  { re: /\bnew\s+Date\s*\(\s*\)/, why: 'clock access (pure packages must be deterministic)' },
  { re: /\bMath\.random\s*\(/, why: 'randomness (pure packages must be deterministic)' },
  { re: /\bprocess\.env\b/, why: 'environment access (pure packages take inputs only)' },
];

/** Vendor AI SDKs. Permitted only under packages/ai/src/adapters (ADR-0020). */
const VENDOR_AI_SDKS = [
  '@anthropic-ai/sdk',
  'openai',
  '@google/generative-ai',
  '@mistralai/mistralai',
  'cohere-ai',
  'ollama',
];

/** BPMN/DMN serialisation libraries. Permitted only in compiler-* and ingestion (ADR-0005). */
const MODEL_SERIALISATION_LIBS = [
  'bpmn-moddle',
  'dmn-moddle',
  'zeebe-bpmn-moddle',
  'bpmn-js',
  'dmn-js',
];

/** Identifiers that would indicate an artifact-mutating command (ADR-0002, I3). */
const ARTIFACT_MUTATION_PATTERNS = [
  /\b(update|patch|edit|mutate|modify|delete|remove)ArtifactVersion\b/i,
  /\b(update|patch|edit|mutate|modify)Artifact\b/i,
  /\bsaveArtifactContent\b/i,
  /\boverwriteArtifact\b/i,
];

/** Environment-name branching (ADR-0028 K3, "no code branches on environment name"). */
const ENV_BRANCH_PATTERNS = [
  { re: /NODE_ENV\s*===?\s*['"]/, why: 'branching on NODE_ENV' },
  { re: /ASDP_ENV\s*===?\s*['"]/, why: 'branching on ASDP_ENV' },
];

// --- ADR-0033 conditions C2, C3, C5 ----------------------------------------

/**
 * C3: domain logic, command handlers, governance, RBAC semantics, audit and
 * validation must remain independent of the HTTP implementation.
 * These files may never reach for transport.
 */
const HTTP_INDEPENDENT_FILES = [
  'apps/api/src/commands.ts',
  'apps/api/src/ports.ts',
  'apps/api/src/repo-memory.ts',
];

const TRANSPORT_MODULES = ['node:http', 'node:https', 'node:http2', './http.ts', './http'];

/**
 * C2: the typed router must not evolve into a custom application framework.
 * These shapes are the early signs of exactly that.
 */
const FRAMEWORK_CREEP_PATTERNS = [
  { re: /^\s*@[A-Z][A-Za-z]*\s*\(/m, why: 'decorator syntax (controller/DI style)' },
  { re: /\bclass\s+\w*Controller\b/, why: 'controller base class or hierarchy' },
  { re: /\b(createContainer|DIContainer|ServiceContainer|Injectable|inject)\s*[(<]/, why: 'dependency-injection container' },
  { re: /\bclass\s+\w*Module\b/, why: 'module abstraction (NestJS-shaped)' },
  { re: /\b(use|applyMiddleware)\s*\(\s*(?:async\s*)?\(\s*req\s*,\s*res\s*,\s*next\b/, why: 'middleware pipeline abstraction' },
  { re: /\bMiddlewareStack\b|\bcomposeMiddleware\b/, why: 'middleware composition infrastructure' },
];

/** C5: the route budget is a tripwire, not a guideline. */
const ROUTE_BUDGET = 20;
const ROUTER_FILE = 'apps/api/src/http.ts';

// ---------------------------------------------------------------------------
// Pure rule evaluation (used by both the real check and the self-test)
// ---------------------------------------------------------------------------

/**
 * @typedef {{ path: string, pkg: string, cls: string, text: string }} SourceFile
 * @typedef {{ rule: string, file: string, detail: string }} Violation
 */

/** Extract module specifiers from import/export/require forms. */
export function extractImports(text) {
  const specs = [];
  const patterns = [
    /(?:^|\n)\s*import\s+(?:[\s\S]*?)\sfrom\s*['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*export\s+(?:[\s\S]*?)\sfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) specs.push(m[1]);
  }
  return specs;
}

/** Map a module specifier to a workspace package name, or null. */
function toWorkspacePackage(spec) {
  if (!spec.startsWith('@asdp/')) return null;
  const parts = spec.split('/');
  return `${parts[0]}/${parts[1]}`;
}

/** @param {SourceFile[]} files @returns {Violation[]} */
export function evaluateRules(files) {
  /** @type {Violation[]} */
  const violations = [];

  for (const f of files) {
    const imports = extractImports(f.text);

    // --- workspace dependency rules -------------------------------------
    const allowed = ALLOWED_DEPS[f.pkg];
    for (const spec of imports) {
      const dep = toWorkspacePackage(spec);
      if (!dep || dep === f.pkg) continue;
      if (allowed === undefined) {
        violations.push({
          rule: 'unknown-package',
          file: f.path,
          detail: `package ${f.pkg} is not declared in ALLOWED_DEPS`,
        });
        continue;
      }
      if (!allowed.includes(dep)) {
        violations.push({
          rule: 'forbidden-dependency',
          file: f.path,
          detail: `${f.pkg} may not import ${dep} (module-map.md §3)`,
        });
      }
    }

    // --- purity ---------------------------------------------------------
    if (f.cls === 'pure') {
      for (const spec of imports) {
        if (FORBIDDEN_IN_PURE.includes(spec)) {
          violations.push({
            rule: 'pure-io',
            file: f.path,
            detail: `pure package ${f.pkg} may not import ${spec}`,
          });
        }
      }
      // Test files are exempt from determinism patterns only for fixtures they
      // build; production sources are not exempt at all.
      if (!f.path.endsWith('.test.ts')) {
        for (const { re, why } of FORBIDDEN_PATTERNS_IN_PURE) {
          if (re.test(f.text)) {
            violations.push({
              rule: 'pure-nondeterminism',
              file: f.path,
              detail: `pure package ${f.pkg}: ${why}`,
            });
          }
        }
      }
    }

    // --- vendor AI SDK confinement (ADR-0020) ---------------------------
    const inAiAdapters =
      f.pkg === '@asdp/ai' && f.path.split(sep).includes('adapters');
    for (const spec of imports) {
      const bare = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
      if (VENDOR_AI_SDKS.includes(bare) && !inAiAdapters) {
        violations.push({
          rule: 'vendor-sdk-leak',
          file: f.path,
          detail: `${bare} may only be imported inside packages/ai/src/adapters (ADR-0020)`,
        });
      }
    }

    // --- model serialisation confinement (ADR-0005) ---------------------
    const inCompilerOrIngestion =
      /@asdp\/(compiler-[a-z]+|ingestion)/.test(f.pkg);
    for (const spec of imports) {
      const bare = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
      if (MODEL_SERIALISATION_LIBS.includes(bare) && !inCompilerOrIngestion) {
        violations.push({
          rule: 'serialisation-leak',
          file: f.path,
          detail: `${bare} may only be imported by compiler-* or ingestion (ADR-0005)`,
        });
      }
    }

    // --- artifact mutation absence test (ADR-0002, invariant I3) --------
    for (const re of ARTIFACT_MUTATION_PATTERNS) {
      const m = f.text.match(re);
      if (m) {
        violations.push({
          rule: 'artifact-mutation',
          file: f.path,
          detail: `'${m[0]}' — no artifact-mutating command may exist (ADR-0002)`,
        });
      }
    }

    // --- environment-name branching (ADR-0028 K3) -----------------------
    for (const { re, why } of ENV_BRANCH_PATTERNS) {
      if (re.test(f.text)) {
        violations.push({ rule: 'env-branching', file: f.path, detail: why });
      }
    }

    // --- ADR-0033 C3: HTTP independence ---------------------------------
    const normalisedPath = f.path.split(sep).join('/');
    if (HTTP_INDEPENDENT_FILES.includes(normalisedPath) || f.cls === 'pure') {
      for (const spec of imports) {
        if (TRANSPORT_MODULES.includes(spec)) {
          violations.push({
            rule: 'http-independence',
            file: f.path,
            detail:
              `must not import '${spec}': domain, command, governance, RBAC, audit and validation ` +
              'logic stay independent of the HTTP implementation (ADR-0033 C3)',
          });
        }
      }
    }

    // --- ADR-0033 C2: no custom application framework -------------------
    if (f.pkg === '@asdp/api' && !f.path.endsWith('.test.ts')) {
      for (const { re, why } of FRAMEWORK_CREEP_PATTERNS) {
        if (re.test(f.text)) {
          violations.push({
            rule: 'framework-creep',
            file: f.path,
            detail:
              `${why} — the typed router must not evolve into a custom framework. ` +
              'Recommend migration to NestJS instead (ADR-0033 C2/C5).',
          });
        }
      }
    }

    // --- ADR-0033 C5: route budget tripwire -----------------------------
    if (normalisedPath === ROUTER_FILE) {
      const routeCount = (f.text.match(/method === '(?:GET|POST|PUT|PATCH|DELETE)'/g) ?? []).length;
      if (routeCount > ROUTE_BUDGET) {
        violations.push({
          rule: 'route-budget',
          file: f.path,
          detail:
            `${routeCount} routes exceeds the budget of ${ROUTE_BUDGET}. This is not a defect to ` +
            'work around: it is the signal that the explicit NestJS decision required by ' +
            'ADR-0033 C4 is now due. Stop and recommend migration.',
        });
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Repository scan
// ---------------------------------------------------------------------------

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

function readWorkspacePackages() {
  /** @type {{name: string, cls: string, dir: string}[]} */
  const pkgs = [];
  for (const group of ['packages', 'apps']) {
    const base = join(ROOT, group);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base)) {
      const manifest = join(base, entry, 'package.json');
      if (!existsSync(manifest)) continue;
      const json = JSON.parse(readFileSync(manifest, 'utf8'));
      pkgs.push({
        name: json.name,
        cls: json.asdp?.class ?? 'unclassified',
        dir: join(base, entry),
      });
    }
  }
  return pkgs;
}

function collectSources() {
  /** @type {SourceFile[]} */
  const files = [];
  const problems = [];
  for (const pkg of readWorkspacePackages()) {
    if (pkg.cls === 'unclassified') {
      problems.push({
        rule: 'unclassified-package',
        file: relative(ROOT, pkg.dir),
        detail: `package.json must declare asdp.class (pure|contract|adapter|application|presentation)`,
      });
    }
    for (const path of walk(join(pkg.dir, 'src'))) {
      files.push({
        path: relative(ROOT, path),
        pkg: pkg.name,
        cls: pkg.cls,
        text: readFileSync(path, 'utf8'),
      });
    }
  }
  return { files, problems };
}

// ---------------------------------------------------------------------------
// Self-test: prove each rule actually fires (phase-0-tasks A3/A5)
// ---------------------------------------------------------------------------

const SELF_TEST_CASES = [
  {
    name: 'ai importing domain is rejected (I1 / ADR-0004)',
    rule: 'forbidden-dependency',
    file: { path: 'packages/ai/src/leak.ts', pkg: '@asdp/ai', cls: 'adapter',
            text: `import { x } from '@asdp/domain';\n` },
  },
  {
    name: 'pure package importing node:fs is rejected',
    rule: 'pure-io',
    file: { path: 'packages/text/src/leak.ts', pkg: '@asdp/text', cls: 'pure',
            text: `import { readFileSync } from 'node:fs';\n` },
  },
  {
    name: 'pure package using Date.now() is rejected',
    rule: 'pure-nondeterminism',
    file: { path: 'packages/text/src/clock.ts', pkg: '@asdp/text', cls: 'pure',
            text: `export const t = Date.now();\n` },
  },
  {
    name: 'vendor AI SDK outside ai/adapters is rejected (ADR-0020)',
    rule: 'vendor-sdk-leak',
    file: { path: 'packages/domain/src/leak.ts', pkg: '@asdp/domain', cls: 'pure',
            text: `import Anthropic from '@anthropic-ai/sdk';\n` },
  },
  {
    name: 'BPMN serialisation library outside compilers is rejected (ADR-0005)',
    rule: 'serialisation-leak',
    file: { path: 'apps/api/src/leak.ts', pkg: '@asdp/api', cls: 'application',
            text: `import BpmnModdle from 'bpmn-moddle';\n` },
  },
  {
    name: 'artifact-mutating command is rejected (I3 / ADR-0002)',
    rule: 'artifact-mutation',
    file: { path: 'apps/api/src/bad.ts', pkg: '@asdp/api', cls: 'application',
            text: `export function updateArtifactVersion() {}\n` },
  },
  {
    name: 'branching on NODE_ENV is rejected (ADR-0028 K3)',
    rule: 'env-branching',
    file: { path: 'apps/api/src/bad2.ts', pkg: '@asdp/api', cls: 'application',
            text: `if (NODE_ENV === 'production') {}\n` },
  },
  {
    name: 'command layer importing node:http is rejected (ADR-0033 C3)',
    rule: 'http-independence',
    file: { path: 'apps/api/src/commands.ts', pkg: '@asdp/api', cls: 'application',
            text: `import { createServer } from 'node:http';\n` },
  },
  {
    name: 'a pure package importing the transport module is rejected (ADR-0033 C3)',
    rule: 'http-independence',
    file: { path: 'packages/domain/src/leak.ts', pkg: '@asdp/domain', cls: 'pure',
            text: `import { createApp } from './http.ts';\n` },
  },
  {
    name: 'decorator syntax in the API is rejected (ADR-0033 C2)',
    rule: 'framework-creep',
    file: { path: 'apps/api/src/creep.ts', pkg: '@asdp/api', cls: 'application',
            text: `@Controller('/projects')\nexport class X {}\n` },
  },
  {
    name: 'a DI container in the API is rejected (ADR-0033 C2)',
    rule: 'framework-creep',
    file: { path: 'apps/api/src/creep2.ts', pkg: '@asdp/api', cls: 'application',
            text: `export const c = createContainer({});\n` },
  },
  {
    name: 'a controller class hierarchy is rejected (ADR-0033 C2)',
    rule: 'framework-creep',
    file: { path: 'apps/api/src/creep3.ts', pkg: '@asdp/api', cls: 'application',
            text: `export class ProjectController {}\n` },
  },
  {
    name: 'a middleware pipeline abstraction is rejected (ADR-0033 C2)',
    rule: 'framework-creep',
    file: { path: 'apps/api/src/creep4.ts', pkg: '@asdp/api', cls: 'application',
            text: `app.use(async (req, res, next) => next());\n` },
  },
  {
    name: 'exceeding the route budget trips the NestJS decision (ADR-0033 C5)',
    rule: 'route-budget',
    file: {
      path: 'apps/api/src/http.ts', pkg: '@asdp/api', cls: 'application',
      text: Array.from({ length: 21 }, (_, i) => `if (method === 'GET' && p === '/r${i}') {}`).join('\n'),
    },
  },
];

function runSelfTest() {
  let failures = 0;
  console.log('architecture checker self-test\n');
  for (const c of SELF_TEST_CASES) {
    const violations = evaluateRules([c.file]);
    const fired = violations.some((v) => v.rule === c.rule);
    console.log(`  ${fired ? '✔' : '✘'} ${c.name}`);
    if (!fired) {
      failures++;
      console.log(`      expected rule '${c.rule}' to fire, got: ${JSON.stringify(violations)}`);
    }
  }
  // A clean file must produce nothing.
  const clean = evaluateRules([
    { path: 'packages/text/src/ok.ts', pkg: '@asdp/text', cls: 'pure',
      text: `import type { Foo } from '@asdp/schemas';\nexport const f = (s: string) => s.normalize('NFC');\n` },
  ]);
  const cleanOk = clean.length === 0;
  console.log(`  ${cleanOk ? '✔' : '✘'} a compliant file produces no violations`);
  if (!cleanOk) {
    failures++;
    console.log(`      unexpected: ${JSON.stringify(clean)}`);
  }
  console.log(`\n${failures === 0 ? 'self-test passed' : `self-test FAILED (${failures})`}`);
  return failures === 0 ? 0 : 1;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function main() {
  if (process.argv.includes('--self-test')) return runSelfTest();

  const { files, problems } = collectSources();
  const violations = [...problems, ...evaluateRules(files)];

  if (violations.length === 0) {
    console.log(`architecture checks passed (${files.length} source files)`);
    return 0;
  }
  console.error(`architecture checks FAILED — ${violations.length} violation(s):\n`);
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}\n      ${v.detail}`);
  }
  return 1;
}

process.exit(main());
