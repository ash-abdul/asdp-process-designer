/**
 * U3-c browser tests — the read-only requirements workspace.
 *
 * ## The limitation these tests are shaped by, stated first
 *
 * **A populated requirement list is unreachable in any runnable configuration.**
 * Every AI port refuses by default (`app.module.ts`), `POPULATE_FRAME` is the only
 * thing that creates a proposal, and this UI exposes no control that could start
 * one (**Z2-B**). So there is no honest way to get a requirement onto the screen
 * in a browser test without wiring a provider stub into the running service —
 * which would cross exactly the line H3 and A7 draw.
 *
 * What that leaves is still substantial, and it is what a browser test is *for*
 * ([ADR-0040](../../../docs/adr/ADR-0040-browser-testing-pinned-browser.md) §5:
 * wiring, not arithmetic):
 *
 * - **both empty states**, which ARE reachable — the API distinguishes "no pass
 *   has run" from "a pass ran and proposed nothing", and the suite provokes the
 *   second by calling `populate-frame` over the API (never through the UI);
 * - navigation, the rail, the refusal path, keyboard, RTL, and Ask ASDP's
 *   inertness on the new workspace — **Z9**.
 *
 * Everything that carries a rule — the empty-state distinction, confidence
 * formatting, the G-e version bound, the inferred-rationale defect, unresolved
 * chips — is tested DOM-free in `web.test.ts` over the same functions this screen
 * renders from.
 */

import { test, expect, request, type APIRequestContext, type Page } from '@playwright/test';

const API = 'http://localhost:3000';

const ADMIN = { 'x-asdp-subject': 'u-admin', 'x-asdp-roles': 'PlatformAdmin' };
const ANALYST = { 'x-asdp-subject': 'u-analyst', 'x-asdp-roles': 'BusinessAnalyst' };

const EN = [
  '# Licence renewal',
  '',
  '## 1. Eligibility',
  'The applicant must submit the renewal request within ninety days of expiry.',
].join('\n');

let api: APIRequestContext;
let counter = 0;

test.beforeAll(async () => {
  api = await request.newContext({ baseURL: API });
});
test.afterAll(async () => {
  await api.dispose();
});

async function newProject(): Promise<{ id: string; key: string }> {
  counter += 1;
  const key = `e2e-u3c-${Date.now()}-${counter}`;
  const res = await api.post('/projects', {
    headers: { ...ADMIN, 'content-type': 'application/json' },
    data: { key, name: 'E2E U3-c project' },
  });
  expect(res.status(), await res.text()).toBe(201);
  return { id: (await res.json()).id as string, key };
}

async function ingest(projectId: string, filename: string, text: string): Promise<string> {
  const res = await api.post(`/projects/${projectId}/sources`, {
    headers: { ...ANALYST, 'content-type': 'application/json' },
    data: { filename, text },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).source.id as string;
}

/**
 * Drive a population pass **over the API**, never through the UI.
 *
 * With no provider wired the pass refuses and proposes nothing — but it still
 * creates the `RequirementSet`, which is what makes the second empty state
 * reachable at all. The refusal is asserted here so the test documents the state
 * it is setting up rather than assuming it.
 */
async function runRefusedPopulation(projectId: string, sourceId: string): Promise<string> {
  const units = await api.get(`/projects/${projectId}/sources/${sourceId}/units`, { headers: ANALYST });
  expect(units.status()).toBe(200);
  const unitId = (await units.json()).units.at(-1).id as string;

  const evidence = await api.post(`/projects/${projectId}/evidence`, {
    headers: { ...ANALYST, 'content-type': 'application/json' },
    data: { sourceId, sourceUnitId: unitId },
  });
  expect(evidence.status(), await evidence.text()).toBe(201);

  const populated = await api.post(`/projects/${projectId}/populate-frame`, { headers: ANALYST });
  expect(populated.status(), await populated.text()).toBe(201);
  const body = await populated.json();
  expect(body.degradations, 'the pass must have refused for want of a provider').toContain(
    'no_provider_configured',
  );
  expect(body.accepted, 'a refused pass proposes nothing').toHaveLength(0);
  return body.requirementSetId as string;
}

async function signIn(page: Page, roles: string[], projectKey: string): Promise<void> {
  await page.goto('/');
  await expect(page.getByText('Development authentication')).toBeVisible();
  const box = (name: string) => page.getByRole('checkbox', { name, exact: true });
  const preChecked = box('BusinessAnalyst');
  if (await preChecked.isChecked()) await preChecked.uncheck();
  for (const role of roles) await box(role).check();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: new RegExp(projectKey) }).click();
}

async function openRequirements(page: Page): Promise<void> {
  await page.getByTestId('nav-requirements').click();
  await expect(page.getByTestId('requirements-card')).toBeVisible();
}

// ---------------------------------------------------------------------------

test('U3-c: the rail now REACHES the requirements workspace', async ({ page }) => {
  const project = await newProject();
  await ingest(project.id, 'brd-en.md', EN);
  await signIn(page, ['BusinessAnalyst'], project.key);

  const entry = page.getByTestId('nav-requirements');
  await expect(entry).toBeEnabled();
  await expect(entry).toHaveAttribute('data-available', 'true');

  await entry.click();
  await expect(page.getByRole('heading', { name: 'Requirements' })).toBeVisible();
  await expect(page.getByTestId('requirements-card')).toBeVisible();

  // And back again: two workspaces means navigation must work in both directions.
  await page.getByTestId('nav-sources').click();
  await expect(page.getByTestId('inventory')).toBeVisible();
});

test('U3-c: NO PASS HAS RUN is a different message from A PASS PROPOSED NOTHING', async ({ page }) => {
  // The distinction the API draws and the workspace must keep. "No requirements"
  // for both would be the same class of error as rendering unranked as rank 0.
  const project = await newProject();
  await ingest(project.id, 'brd-en.md', EN);
  await signIn(page, ['BusinessAnalyst'], project.key);
  await openRequirements(page);

  const noPass = page.getByTestId('requirements-no-pass');
  await expect(noPass).toBeVisible();
  await expect(noPass).toContainText(/No population pass has run/i);
  await expect(page.getByTestId('requirements-empty-set')).toHaveCount(0);
});

test('U3-c: a REFUSED PASS says so, and blames the configuration rather than the evidence', async ({ page }) => {
  const project = await newProject();
  const sourceId = await ingest(project.id, 'brd-en.md', EN);
  const setId = await runRefusedPopulation(project.id, sourceId);

  await signIn(page, ['BusinessAnalyst'], project.key);
  await openRequirements(page);

  const emptySet = page.getByTestId('requirements-empty-set');
  await expect(emptySet).toBeVisible();
  await expect(emptySet).toContainText(setId);
  await expect(emptySet).toContainText(/no AI provider is wired/i);
  // The sentence that must not be lost: this is not a finding about the evidence.
  await expect(emptySet).toContainText(/not a statement that the evidence supports nothing/i);
  await expect(page.getByTestId('requirements-no-pass')).toHaveCount(0);
});

test('U3-c: the workspace offers NO WRITE CONTROL and NO BULK SELECTION', async ({ page }) => {
  // Read-only by scope, and limitation 70's only structural mitigation. Asserted
  // by absence over the whole workspace.
  const project = await newProject();
  const sourceId = await ingest(project.id, 'brd-en.md', EN);
  await runRefusedPopulation(project.id, sourceId);
  await signIn(page, ['BusinessAnalyst'], project.key);
  await openRequirements(page);

  const workspace = page.locator('.workspace');
  await expect(workspace.locator('input[type="checkbox"]')).toHaveCount(0);
  for (const word of [/approve/i, /accept/i, /reject/i, /revise/i, /select all/i]) {
    await expect(workspace.getByRole('button', { name: word })).toHaveCount(0);
  }
});

test('U3-c: a role the API refuses is told so, and the API refuses too', async ({ page }) => {
  // TestDesigner is a real role that listRequirements does not permit.
  const project = await newProject();
  await ingest(project.id, 'brd-en.md', EN);
  await signIn(page, ['TestDesigner'], project.key);
  await openRequirements(page);

  const refused = page.getByTestId('requirements-denied');
  await expect(refused).toBeVisible();
  await expect(refused).toContainText(/listRequirements/);

  const direct = await api.get(`/projects/${project.id}/requirements`, {
    headers: { 'x-asdp-subject': 'u-td', 'x-asdp-roles': 'TestDesigner' },
  });
  expect(direct.status(), await direct.text()).toBe(403);
});

test('U3-c: a Contributor CAN read requirements — the role map now matches the API', async ({ page }) => {
  // The corrected entry, proved end to end. The old map refused a Contributor
  // that the API permits.
  const project = await newProject();
  await ingest(project.id, 'brd-en.md', EN);
  await signIn(page, ['Contributor'], project.key);
  await openRequirements(page);

  await expect(page.getByTestId('requirements-denied')).toHaveCount(0);
  await expect(page.getByTestId('requirements-no-pass')).toBeVisible();

  const direct = await api.get(`/projects/${project.id}/requirements`, {
    headers: { 'x-asdp-subject': 'u-c', 'x-asdp-roles': 'Contributor' },
  });
  expect(direct.status()).toBe(200);
});

test('U3-c: the workspace is reachable and operable by KEYBOARD', async ({ page }) => {
  const project = await newProject();
  await ingest(project.id, 'brd-en.md', EN);
  await signIn(page, ['BusinessAnalyst'], project.key);

  const entry = page.getByTestId('nav-requirements');
  await entry.focus();
  await expect(entry).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('requirements-card')).toBeVisible();
});

test('U3-c: the page never scrolls sideways, and the status strip survives', async ({ page }) => {
  // Inherited responsive behaviour: wide content scrolls inside its own region,
  // and governance information collapses last (Y26).
  const project = await newProject();
  const sourceId = await ingest(project.id, 'brd-en.md', EN);
  await runRefusedPopulation(project.id, sourceId);
  await signIn(page, ['BusinessAnalyst'], project.key);
  await openRequirements(page);

  for (const width of [1440, 1024, 720]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `the page scrolls sideways at ${width}px`).toBeLessThanOrEqual(1);
    await expect(page.getByTestId('status-assistant')).toBeVisible();
  }
});

test('ASK ASDP MAKES NO NETWORK CALL from the requirements workspace — Z9', async ({ page }) => {
  // Z9's actual requirement: the zero-request assertion extended to S5, now that
  // S5 exists. This is the screen where "Show supporting evidence" and "Why is G1
  // blocked?" are most tempting to wire up. Both stay disabled.
  const project = await newProject();
  const sourceId = await ingest(project.id, 'brd-en.md', EN);
  await runRefusedPopulation(project.id, sourceId);
  await signIn(page, ['BusinessAnalyst'], project.key);
  await openRequirements(page);

  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));

  await page.getByTestId('assistant-expand').click();
  await expect(page.getByTestId('assistant')).toBeVisible();
  await expect(page.getByTestId('assistant-unavailable')).toContainText(/H3/);

  const input = page.getByTestId('assistant-input');
  await expect(input).toBeDisabled();
  await input.click({ force: true }).catch(() => undefined);
  await page.keyboard.type('which evidence supports REQ-0001?');
  await page.getByTestId('assistant-action-show-evidence').click({ force: true }).catch(() => undefined);
  await page.getByTestId('assistant-action-why-g1-blocked').click({ force: true }).catch(() => undefined);
  await page.waitForTimeout(300);

  const nonAsset = requests.filter(
    (u) => !/\/(src|node_modules|@vite|@react-refresh|@id)\//.test(u) && !u.endsWith('.css'),
  );
  expect(nonAsset, `the assistant caused requests: ${nonAsset.join(', ')}`).toEqual([]);

  const text = await page.getByTestId('assistant').innerText();
  expect(text).not.toMatch(/here('s| is) what|based on the evidence|I found|the answer is/i);
});
