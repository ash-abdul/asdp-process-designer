import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** A fresh database per run. The suite must not depend on, or disturb, dev data. */
const E2E_DIR = mkdtempSync(join(tmpdir(), 'asdp-e2e-'));

/**
 * Browser test configuration — [ADR-0040](../../docs/adr/ADR-0040-browser-testing-pinned-browser.md).
 *
 * `channel: 'chrome'` drives the **system-installed** Google Chrome. Nothing is
 * downloaded: not at install (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`), not at
 * first run, not at test time. A missing browser is refused by `preflight.mjs`.
 *
 * The servers are started here and stopped afterwards, so `npm run verify` stays
 * server-free and its test counts stay comparable across slices (ADR-0040 §4).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5173',
    channel: 'chrome',
    headless: true,
    trace: 'off',
  },
  webServer: [
    {
      // Migrations run as a ONE-SHOT TASK, never on service start (ADR-0028 K7),
      // so the suite must migrate before it starts the service. A fresh
      // directory per run keeps the tests independent of each other and of any
      // development database.
      command:
        'node apps/api/dist/migrate-task.js && node apps/api/dist/main.js',
      cwd: '../..',
      port: 3000,
      reuseExistingServer: false,
      env: {
        ASDP_DATABASE_DIR: E2E_DIR,
        ASDP_BLOB_ROOT: `${E2E_DIR}/blobs`,
        ASDP_LOG_LEVEL: 'error',
        PORT: '3000',
      },
    },
    {
      command: 'npx vite --config apps/web/vite.config.ts apps/web',
      cwd: '../..',
      port: 5173,
      reuseExistingServer: false,
    },
  ],
});
