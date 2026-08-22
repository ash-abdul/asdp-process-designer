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
  // Intake adapters mint provenance, so they need text and provenance. They do
  // NOT get @asdp/domain: intake reads sources, it does not decide governance.
  '@asdp/ingestion': ['@asdp/schemas', '@asdp/text', '@asdp/provenance'],
  // Rule packs are pure functions from state to findings. No domain, so a rule
  // can never mutate what it judges.
  '@asdp/validation': ['@asdp/schemas', '@asdp/text', '@asdp/provenance'],
  // ADR-0004 / invariant I1: the AI layer cannot reach domain state.
  '@asdp/ai': ['@asdp/schemas', '@asdp/raf', '@asdp/text'],
  '@asdp/eval': ['@asdp/schemas', '@asdp/ai', '@asdp/text', '@asdp/provenance'],
  '@asdp/api': [
    '@asdp/schemas',
    '@asdp/text',
    '@asdp/provenance',
    '@asdp/raf',
    '@asdp/domain',
    '@asdp/ingestion',
    '@asdp/validation',
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

/**
 * Directories under the same C3 obligation.
 *
 * Added in V1: intake commands live in `commands/`, and listing files one by one
 * means the rule silently stops covering the next command file someone adds. A
 * directory rule cannot be outgrown.
 */
const HTTP_INDEPENDENT_DIRS = ['apps/api/src/commands/', 'apps/api/src/persistence/'];

const TRANSPORT_MODULES = ['node:http', 'node:https', 'node:http2', './http.ts', './http'];

/**
 * ADR-0033 C2, reconciled with ADR-0034.
 *
 * C2 was written to stop the hand-written router growing into a framework. NestJS
 * is now the approved framework, so decorators, controller classes and module
 * classes are EXPECTED inside the composition layer (`apps/api/src/http/`) — and
 * are still forbidden in commands and persistence, enforced by
 * `nest-domain-purity`.
 *
 * What remains prohibited everywhere is building a SECOND framework alongside
 * NestJS: our own DI container, our own middleware pipeline, our own router.
 */
const COMPOSITION_LAYER = 'apps/api/src/http/';

const FRAMEWORK_CREEP_PATTERNS = [
  { re: /\b(createContainer|DIContainer|ServiceContainer|ServiceLocator)\s*[(<]/, why: 'a hand-rolled dependency-injection container — use NestJS providers' },
  { re: /\bMiddlewareStack\b|\bcomposeMiddleware\b|\bmiddlewarePipeline\b/, why: 'hand-rolled middleware composition — use NestJS interceptors and guards' },
  { re: /\b(use|applyMiddleware)\s*\(\s*(?:async\s*)?\(\s*req\s*,\s*res\s*,\s*next\b/, why: 'a hand-rolled middleware pipeline — use NestJS interceptors and guards' },
  { re: /\bclass\s+\w*Router\b|\bcreateRouter\s*\(/, why: 'a hand-rolled router — use NestJS controllers' },
];

// The ADR-0033 C5 route budget is DISCHARGED by ADR-0034: NestJS is adopted, so
// the tripwire has served its purpose and is retired. `framework-creep` remains,
// and now prevents building a SECOND framework alongside NestJS.

// --- ADR-0034 / ADR-0036: NestJS confinement -------------------------------

const NEST_PACKAGES = ['@nestjs/core', '@nestjs/common', '@nestjs/platform-express', 'rxjs', 'reflect-metadata'];

/**
 * N5: no pure or contract package may import NestJS. `erasableSyntaxOnly` makes a
 * decorator a compile error there; this catches a non-decorator import too.
 */
function isNestPackage(spec) {
  return NEST_PACKAGES.some((p) => spec === p || spec.startsWith(`${p}/`));
}

/**
 * N2/N4: the command and persistence layers stay framework-free, so business
 * logic and governance are independent of the HTTP/composition layer.
 */
const FRAMEWORK_FREE_DIRS = ['apps/api/src/commands/', 'apps/api/src/persistence/'];
const FRAMEWORK_FREE_FILES = ['apps/api/src/commands.ts', 'apps/api/src/ports.ts'];

/** N3: a controller parses, delegates, maps. It holds no business logic. */
const CONTROLLER_MAX_LINES = 220;

// --- ADR-0035: persistence confinement and SQL safety ----------------------

const PERSISTENCE_PACKAGES = ['@electric-sql/pglite', 'pg'];
const PERSISTENCE_DIR = 'apps/api/src/persistence/';

/**
 * Plain SQL means parameterisation discipline is a review obligation, so it is
 * mechanised: a template literal or concatenation reaching a query call is a
 * build failure.
 */
const SQL_INTERPOLATION_PATTERNS = [
  { re: /\.(?:query|exec)\s*\(\s*`[^`]*\$\{/, why: 'template-literal interpolation into SQL — use a parameter array ($1, $2)' },
  { re: /\.(?:query|exec)\s*\(\s*['"][^'"]*['"]\s*\+/, why: 'string concatenation into SQL — use a parameter array' },
];

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
    const httpIndependent =
      HTTP_INDEPENDENT_FILES.includes(normalisedPath) ||
      HTTP_INDEPENDENT_DIRS.some((dir) => normalisedPath.startsWith(dir)) ||
      f.cls === 'pure';
    if (httpIndependent) {
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

    // --- ADR-0033 C2 (reconciled with ADR-0034): no SECOND framework ----
    if (f.pkg === '@asdp/api' && !f.path.endsWith('.test.ts')) {
      for (const { re, why } of FRAMEWORK_CREEP_PATTERNS) {
        if (re.test(f.text)) {
          violations.push({
            rule: 'framework-creep',
            file: f.path,
            detail: `${why} (ADR-0033 C2, reconciled with ADR-0034)`,
          });
        }
      }
    }

    // --- ADR-0034 N5 / ADR-0036: NestJS confinement ---------------------
    if (f.cls === 'pure' || f.cls === 'contract') {
      for (const spec of imports) {
        if (isNestPackage(spec)) {
          violations.push({
            rule: 'nest-confinement',
            file: f.path,
            detail:
              `${f.cls} package ${f.pkg} may not import '${spec}': NestJS is the application ` +
              'composition layer only (ADR-0034 N5)',
          });
        }
      }
    }

    // --- ADR-0034 N2/N4: command and persistence layers stay framework-free
    const isFrameworkFree =
      FRAMEWORK_FREE_FILES.includes(normalisedPath) ||
      FRAMEWORK_FREE_DIRS.some((d) => normalisedPath.startsWith(d));
    if (isFrameworkFree) {
      for (const spec of imports) {
        if (isNestPackage(spec)) {
          violations.push({
            rule: 'nest-domain-purity',
            file: f.path,
            detail:
              `must not import '${spec}': command, governance and persistence logic stay ` +
              'independent of the composition layer (ADR-0034 N2/N4)',
          });
        }
      }
      if (/^\s*@[A-Z][A-Za-z]*\s*\(/m.test(f.text)) {
        violations.push({
          rule: 'nest-domain-purity',
          file: f.path,
          detail: 'decorator syntax is not permitted here (ADR-0034 N2/N4)',
        });
      }
    }

    // --- ADR-0034 N3: controllers hold no business logic ----------------
    if (/\.controller\.ts$/.test(normalisedPath)) {
      for (const spec of imports) {
        if (spec === '@asdp/domain') {
          violations.push({
            rule: 'controller-thinness',
            file: f.path,
            detail:
              'a controller may not import @asdp/domain: it parses, delegates to a command, and ' +
              'maps the result (ADR-0034 N3)',
          });
        }
      }
      const lines = f.text.split('\n').length;
      if (lines > CONTROLLER_MAX_LINES) {
        violations.push({
          rule: 'controller-thinness',
          file: f.path,
          detail:
            `${lines} lines exceeds the ${CONTROLLER_MAX_LINES}-line cap; logic is accumulating in ` +
            'a controller (ADR-0034 N3). Move it into a command',
        });
      }
    }

    // --- ADR-0035: persistence confinement ------------------------------
    for (const spec of imports) {
      const bare = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
      if (PERSISTENCE_PACKAGES.includes(bare) && !normalisedPath.startsWith(PERSISTENCE_DIR)) {
        violations.push({
          rule: 'persistence-confinement',
          file: f.path,
          detail:
            `'${bare}' may only be imported inside ${PERSISTENCE_DIR}: the domain never sees a ` +
            'driver type (ADR-0035)',
        });
      }
    }

    // --- ADR-0035: SQL parameterisation ---------------------------------
    for (const { re, why } of SQL_INTERPOLATION_PATTERNS) {
      if (re.test(f.text)) {
        violations.push({ rule: 'sql-injection-guard', file: f.path, detail: why });
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
    name: 'a NEW command file importing node:http is rejected (ADR-0033 C3)',
    rule: 'http-independence',
    file: { path: 'apps/api/src/commands/intake.ts', pkg: '@asdp/api', cls: 'application',
            text: `import { createServer } from 'node:http';\n` },
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
    name: 'a hand-rolled DI container is rejected (ADR-0033 C2)',
    rule: 'framework-creep',
    file: { path: 'apps/api/src/creep2.ts', pkg: '@asdp/api', cls: 'application',
            text: `export const c = createContainer({});\n` },
  },
  {
    name: 'a hand-rolled middleware pipeline is rejected (ADR-0033 C2)',
    rule: 'framework-creep',
    file: { path: 'apps/api/src/creep4.ts', pkg: '@asdp/api', cls: 'application',
            text: `app.use(async (req, res, next) => next());\n` },
  },
  {
    name: 'a hand-rolled router is rejected (ADR-0033 C2)',
    rule: 'framework-creep',
    file: { path: 'apps/api/src/creep5.ts', pkg: '@asdp/api', cls: 'application',
            text: `export function createRouter() {}\n` },
  },
  {
    name: 'NestJS decorators ARE permitted in the composition layer (ADR-0034)',
    rule: null,
    expectNone: true,
    file: { path: 'apps/api/src/http/projects.controller.ts', pkg: '@asdp/api', cls: 'application',
            text: `import { Controller, Get } from '@nestjs/common';\n@Controller('projects')\nexport class ProjectsController { @Get() list() { return []; } }\n` },
  },
  {
    name: 'a pure package importing NestJS is rejected (ADR-0034 N5)',
    rule: 'nest-confinement',
    file: { path: 'packages/domain/src/leak.ts', pkg: '@asdp/domain', cls: 'pure',
            text: `import { Injectable } from '@nestjs/common';\n` },
  },
  {
    name: 'the contract package importing NestJS is rejected (ADR-0034 N5)',
    rule: 'nest-confinement',
    file: { path: 'packages/schemas/src/leak.ts', pkg: '@asdp/schemas', cls: 'contract',
            text: `import 'reflect-metadata';\n` },
  },
  {
    name: 'the command layer importing NestJS is rejected (ADR-0034 N4)',
    rule: 'nest-domain-purity',
    file: { path: 'apps/api/src/commands/gates.ts', pkg: '@asdp/api', cls: 'application',
            text: `import { Injectable } from '@nestjs/common';\n` },
  },
  {
    name: 'a decorator in the persistence layer is rejected (ADR-0034 N2)',
    rule: 'nest-domain-purity',
    file: { path: 'apps/api/src/persistence/repo.ts', pkg: '@asdp/api', cls: 'application',
            text: `@Injectable()\nexport class R {}\n` },
  },
  {
    name: 'a controller importing @asdp/domain is rejected (ADR-0034 N3)',
    rule: 'controller-thinness',
    file: { path: 'apps/api/src/http/projects.controller.ts', pkg: '@asdp/api', cls: 'application',
            text: `import { approveGate } from '@asdp/domain';\n` },
  },
  {
    name: 'an oversized controller is rejected (ADR-0034 N3)',
    rule: 'controller-thinness',
    file: { path: 'apps/api/src/http/big.controller.ts', pkg: '@asdp/api', cls: 'application',
            text: Array.from({ length: 240 }, (_, i) => `// line ${i}`).join('\n') },
  },
  {
    name: 'a database driver outside the persistence layer is rejected (ADR-0035)',
    rule: 'persistence-confinement',
    file: { path: 'apps/api/src/http/leak.controller.ts', pkg: '@asdp/api', cls: 'application',
            text: `import { PGlite } from '@electric-sql/pglite';\n` },
  },
  {
    name: 'template-literal interpolation into SQL is rejected (ADR-0035)',
    rule: 'sql-injection-guard',
    file: { path: 'apps/api/src/persistence/bad.ts', pkg: '@asdp/api', cls: 'application',
            text: 'await db.query(`select * from t where id = ${id}`);\n' },
  },
  {
    name: 'string concatenation into SQL is rejected (ADR-0035)',
    rule: 'sql-injection-guard',
    file: { path: 'apps/api/src/persistence/bad2.ts', pkg: '@asdp/api', cls: 'application',
            text: `await db.query('select * from t where id = ' + id);\n` },
  },
];

function runSelfTest() {
  let failures = 0;
  console.log('architecture checker self-test\n');
  for (const c of SELF_TEST_CASES) {
    const violations = evaluateRules([c.file]);
    // Some cases assert the opposite: that a legitimate pattern is NOT flagged.
    const ok = c.expectNone === true
      ? violations.length === 0
      : violations.some((v) => v.rule === c.rule);
    console.log(`  ${ok ? '✔' : '✘'} ${c.name}`);
    if (!ok) {
      failures++;
      console.log(
        c.expectNone === true
          ? `      expected NO violations, got: ${JSON.stringify(violations)}`
          : `      expected rule '${c.rule}' to fire, got: ${JSON.stringify(violations)}`,
      );
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
