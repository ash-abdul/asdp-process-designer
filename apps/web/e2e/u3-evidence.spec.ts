/**
 * U3-b browser tests — citing a unit, and the evidence inventory.
 *
 * [ADR-0040](../../../docs/adr/ADR-0040-browser-testing-pinned-browser.md) §5:
 * these cover **wiring**, not arithmetic. Everything carrying a rule — the
 * citation body, the refusal mapping, the ADR-0038 non-conflation, the grouping —
 * is tested DOM-free in `web.test.ts`, and that is not relaxed because a browser
 * exists.
 *
 * Each test seeds its own project over the API, so the suite is order-independent.
 *
 * **One approved case is not testable here, and saying so matters.** The boundary
 * asks that a `broken` or `drifted` anchor refusal render honestly. It cannot be
 * provoked through this UI: citing a unit inherits an anchor the server minted
 * and immediately re-verifies, and nothing in the browser can make stored text
 * drift. The refusal path is therefore covered by unit tests over `citeRefusal`,
 * and the reachable refusal — a role that may not cite — is covered below.
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

const AR = [
  '# تجديد الرخصة',
  '',
  '## ١. الأهلية',
  'يجب على مقدم الطلب تقديم طلب التجديد خلال تسعين يوماً من تاريخ الانتهاء.',
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
  const key = `e2e-u3b-${Date.now()}-${counter}`;
  const res = await api.post('/projects', {
    headers: { ...ADMIN, 'content-type': 'application/json' },
    data: { key, name: 'E2E U3-b project' },
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

async function signIn(page: Page, roles: string[], projectKey: string): Promise<void> {
  await page.goto('/');
  await expect(page.getByText('Development authentication')).toBeVisible();

  // `exact: true` matters: 'Viewer' is a substring of 'ComplianceReviewer'.
  const box = (name: string) => page.getByRole('checkbox', { name, exact: true });
  const preChecked = box('BusinessAnalyst');
  if (await preChecked.isChecked()) await preChecked.uncheck();
  for (const role of roles) await box(role).check();

  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: new RegExp(projectKey) }).click();
}

// ---------------------------------------------------------------------------

test('U3-b: the evidence inventory starts empty and SAYS WHAT TO DO', async ({ page }) => {
  const project = await newProject();
  await ingest(project.id, 'brd-en.md', EN);
  await signIn(page, ['BusinessAnalyst'], project.key);

  const card = page.getByTestId('evidence-card');
  await expect(card).toBeVisible();
  // W9: an empty state carries the reason, never a blank pane.
  await expect(card).toContainText(/cite one of its units/i);
  // And it does not imply a capability this build does not have.
  await expect(card).toContainText(/no provider is wired/i);
});

test('U3-b: citing a unit records evidence, and the inventory shows it', async ({ page }) => {
  const project = await newProject();
  await ingest(project.id, 'brd-en.md', EN);
  await signIn(page, ['BusinessAnalyst'], project.key);

  await page.locator('[data-testid^="open-"]').first().click();
  await expect(page.locator('.viewer__text')).toBeVisible();

  // The citation control lives in the document inspector, beside the reading
  // surface, and it offers UNITS — never a character range.
  const picker = page.getByTestId('cite-unit');
  await expect(picker).toBeVisible();
  await expect(page.getByTestId('cite-submit')).toBeEnabled();

  await page.getByTestId('cite-submit').click();

  // The server verified the anchor before storing, and the id is reported.
  const recorded = page.getByTestId('cite-recorded');
  await expect(recorded).toBeVisible();
  await expect(recorded).toContainText(/Recorded as/i);
  await expect(recorded).toContainText(/verified the anchor/i);

  // Back on the workspace, the list has RE-READ rather than guessed (W4).
  await page.getByTestId('back-to-sources').click();
  const card = page.getByTestId('evidence-card');
  await expect(card).toBeVisible();
  await expect(card.locator('[data-testid^="evidence-ev-"]').first()).toBeVisible();
  await expect(card).toContainText('brd-en.md');
});

test('U3-b: the inventory NEVER claims an anchor RESOLVED (ADR-0038)', async ({ page }) => {
  const project = await newProject();
  await ingest(project.id, 'brd-en.md', EN);
  await signIn(page, ['BusinessAnalyst'], project.key);

  await page.locator('[data-testid^="open-"]').first().click();
  await page.getByTestId('cite-submit').click();
  await expect(page.getByTestId('cite-recorded')).toBeVisible();
  await page.getByTestId('back-to-sources').click();

  const card = page.getByTestId('evidence-card');
  await expect(card.locator('[data-testid^="evidence-anchor-note-"]').first()).toBeVisible();

  // `anchorVerified` is true for content_unverified anchors too, so the word
  // "Resolved" here would be the conflation ADR-0038 exists to prevent.
  const note = card.locator('[data-testid^="evidence-anchor-note-"]').first();
  await expect(note).toHaveAttribute('data-verified', 'true');
  await expect(note).toContainText(/not reported here/i);
  await expect(card).not.toContainText(/\bResolved\b/);
});

test('U3-b: a Contributor sees citing DISABLED, and the API refuses anyway', async ({ page }) => {
  const project = await newProject();
  const sourceId = await ingest(project.id, 'brd-en.md', EN);
  await signIn(page, ['Contributor'], project.key);

  await page.locator('[data-testid^="open-"]').first().click();
  await expect(page.locator('.viewer__text')).toBeVisible();

  // The affordance is a courtesy, and it NAMES the missing role.
  await expect(page.getByTestId('cite-submit')).toBeDisabled();
  const reason = page.getByTestId('cite-denied');
  await expect(reason).toBeVisible();
  await expect(reason).toContainText(/recordEvidence/);
  await expect(reason).toContainText(/BusinessAnalyst/);

  // And the control is not the enforcement: the API refuses the same call.
  const unitsRes = await api.get(`/projects/${project.id}/sources/${sourceId}/units`, {
    headers: ANALYST,
  });
  expect(unitsRes.status(), await unitsRes.text()).toBe(200);
  const unitId = (await unitsRes.json()).units[0].id as string;

  const refused = await api.post(`/projects/${project.id}/evidence`, {
    headers: {
      'x-asdp-subject': 'u-contributor',
      'x-asdp-roles': 'Contributor',
      'content-type': 'application/json',
    },
    data: { sourceId, sourceUnitId: unitId },
  });
  expect(refused.status(), await refused.text()).toBe(403);
});

test('U3-b: an Arabic quote is listed in ITS OWN direction, not the interface\'s', async ({ page }) => {
  const project = await newProject();
  await ingest(project.id, 'brd-ar.md', AR);
  await signIn(page, ['BusinessAnalyst'], project.key);

  await page.locator('[data-testid^="open-"]').first().click();
  await expect(page.locator('.viewer__text')).toHaveAttribute('dir', 'rtl');
  await page.getByTestId('cite-submit').click();
  await expect(page.getByTestId('cite-recorded')).toBeVisible();
  await page.getByTestId('back-to-sources').click();

  const row = page.getByTestId('evidence-card').locator('[data-testid^="evidence-ev-"]').first();
  await expect(row).toBeVisible();
  // ADR-0023: direction is DATA. The quote carries the server's direction and
  // its language, inside an LTR interface.
  await expect(row.locator('[dir="rtl"]').first()).toBeVisible();
  await expect(row.locator('[lang="ar"]').first()).toBeVisible();
  // The identifier stays LTR and ASCII, as D-U2.5 requires.
  await expect(row.locator('code.id').first()).toBeVisible();
});

test('U3-b: the citation control is UNIT-LEVEL, with no character-range input', async ({ page }) => {
  const project = await newProject();
  await ingest(project.id, 'brd-en.md', EN);
  await signIn(page, ['BusinessAnalyst'], project.key);

  await page.locator('[data-testid^="open-"]').first().click();

  const cite = page.getByTestId('cite');
  await expect(cite).toBeVisible();
  // One control, and it is a unit picker. Absence is the enforcement.
  await expect(cite.locator('select')).toHaveCount(1);
  await expect(cite.locator('input[type="number"]')).toHaveCount(0);
  // The constraint is stated beside the control, in the inspector section that
  // holds it — not inside the control's own element.
  await expect(page.getByText(/unit-level only/i)).toBeVisible();
});

test('U3-b: the citation panel is operable by KEYBOARD, not only by mouse', async ({ page }) => {
  const project = await newProject();
  await ingest(project.id, 'brd-en.md', EN);
  await signIn(page, ['BusinessAnalyst'], project.key);

  await page.locator('[data-testid^="open-"]').first().click();
  await expect(page.getByTestId('cite-unit')).toBeVisible();

  await page.getByTestId('cite-unit').focus();
  await expect(page.getByTestId('cite-unit')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('cite-submit')).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.getByTestId('cite-recorded')).toBeVisible();
});

test('ASK ASDP STILL MAKES NO NETWORK CALL from the document view', async ({ page }) => {
  // **Z9**, applied to the surface U3-b actually adds. The boundary extends the
  // zero-request assertion to S5, which U3-c builds; the document view is where
  // this slice's new control lives, so it is asserted here now and on S5 then.
  const project = await newProject();
  await ingest(project.id, 'brd-en.md', EN);
  await signIn(page, ['BusinessAnalyst'], project.key);

  await page.locator('[data-testid^="open-"]').first().click();
  await expect(page.getByTestId('cite-unit')).toBeVisible();

  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));

  await page.getByTestId('assistant-expand').click();
  await expect(page.getByTestId('assistant')).toBeVisible();
  await expect(page.getByTestId('assistant-unavailable')).toContainText(/H3/);

  const input = page.getByTestId('assistant-input');
  await expect(input).toBeDisabled();
  // `fill()` waits for the element to become editable and would hang on a
  // disabled input; force-click and type, as the D-U2.5 test does.
  await input.click({ force: true }).catch(() => undefined);
  await page.keyboard.type('what evidence supports this?');
  await page.getByTestId('assistant-action-show-evidence').click({ force: true }).catch(() => undefined);

  await page.waitForTimeout(300);

  const nonAsset = requests.filter(
    (u) => !/\/(src|node_modules|@vite|@react-refresh|@id)\//.test(u) && !u.endsWith('.css'),
  );
  expect(nonAsset, `the assistant caused requests: ${nonAsset.join(', ')}`).toEqual([]);

  // And no fabricated answer, which is the half a request count cannot catch.
  const text = await page.getByTestId('assistant').innerText();
  expect(text).not.toMatch(/here('s| is) what|based on the evidence|I found/i);
});
