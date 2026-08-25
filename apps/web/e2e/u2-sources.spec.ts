/**
 * U2 browser tests — the material journeys and the refusal paths.
 *
 * [ADR-0040](../../../docs/adr/ADR-0040-browser-testing-pinned-browser.md) §5:
 * these cover **wiring**, not arithmetic. Everything carrying a rule is tested
 * DOM-free in `web.test.ts`, and that is not relaxed because a browser exists.
 *
 * Each test seeds its own project over the API, so the suite is order-independent
 * and leaves nothing behind that another test depends on.
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
  const key = `e2e-${Date.now()}-${counter}`;
  const res = await api.post('/projects', {
    headers: { ...ADMIN, 'content-type': 'application/json' },
    data: { key, name: 'E2E project' },
  });
  expect(res.status(), await res.text()).toBe(201);
  return { id: (await res.json()).id as string, key };
}

async function ingest(projectId: string, filename: string, text: string): Promise<void> {
  const res = await api.post(`/projects/${projectId}/sources`, {
    headers: { ...ANALYST, 'content-type': 'application/json' },
    data: { filename, text },
  });
  expect(res.status(), await res.text()).toBe(201);
}

/** Sign in with the given roles and open a project. */
async function signIn(page: Page, roles: string[], projectKey: string): Promise<void> {
  await page.goto('/');
  await expect(page.getByText('Development authentication')).toBeVisible();

  // `exact: true` matters: 'Viewer' is a substring of 'ComplianceReviewer', and
  // a loose match resolves to two checkboxes.
  const box = (name: string) => page.getByRole('checkbox', { name, exact: true });
  const preChecked = box('BusinessAnalyst');
  if (await preChecked.isChecked()) await preChecked.uncheck();
  for (const role of roles) await box(role).check();

  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: new RegExp(projectKey) }).click();
}

// ---------------------------------------------------------------------------

test('the development authentication warning is unmissable', async ({ page }) => {
  // F-U1-b. If this ever stops being visible, something has gone badly wrong.
  await page.goto('/');
  await expect(page.getByText(/not.*the production authentication architecture/i)).toBeVisible();
});

test('U2-b: the inventory shows kind, direction, parse state and authority', async ({ page }) => {
  const project = await newProject();
  await ingest(project.id, 'brd-en.md', EN);
  await ingest(project.id, 'brd-ar.md', AR);

  await signIn(page, ['BusinessAnalyst'], project.key);

  await expect(page.getByTestId('inventory')).toBeVisible();
  await expect(page.getByText('brd-en.md')).toBeVisible();
  await expect(page.getByText('brd-ar.md')).toBeVisible();

  // Unranked must read as undecided, not as a low score.
  const authority = page.locator('[data-testid^="authority-"]').first();
  await expect(authority).toContainText(/Unranked/);
  await expect(authority).toContainText(/nobody has decided/);
});

test('U2-c: uploading a document adds it to the inventory', async ({ page }) => {
  const project = await newProject();
  await signIn(page, ['BusinessAnalyst'], project.key);

  await page.getByTestId('up-filename').fill('typed.md');
  await page.getByTestId('up-text').fill('The officer must respond within five days.');
  await page.getByTestId('up-submit').click();

  await expect(page.getByTestId('up-created')).toContainText('Uploaded');
  await expect(page.getByText('typed.md')).toBeVisible();
});

test('U2-c: A DUPLICATE IS REPORTED AS A DUPLICATE, not as an upload', async ({ page }) => {
  // The distinction that would be easiest to get wrong and hardest to notice.
  const project = await newProject();
  await ingest(project.id, 'original.md', EN);
  await signIn(page, ['BusinessAnalyst'], project.key);

  await page.getByTestId('up-filename').fill('a-different-name.md');
  await page.getByTestId('up-text').fill(EN); // identical BYTES
  await page.getByTestId('up-submit').click();

  await expect(page.getByTestId('up-deduplicated')).toContainText('Already present');
  await expect(page.getByTestId('up-deduplicated')).toContainText('nothing was added');
  await expect(page.getByTestId('up-created')).toHaveCount(0);
});

test("U2-c: a refused upload shows THE SERVER'S reason", async ({ page }) => {
  const project = await newProject();
  await signIn(page, ['BusinessAnalyst'], project.key);

  // Bytes that are neither valid UTF-8 nor a recognised document format.
  await page.getByTestId('up-filename').fill('broken.bin');
  await page.getByTestId('up-file').setInputFiles({
    name: 'broken.bin',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from([0xff, 0xfe, 0x00, 0x01, 0x02, 0xff, 0xfe]),
  });
  await page.getByTestId('up-submit').click();

  const refused = page.getByTestId('up-refused');
  await expect(refused).toBeVisible();
  await expect(refused).toContainText(/Refused/);
  // The server's own words, not a paraphrase.
  await expect(refused).toContainText(/UTF-8|format|cannot be/i);
});

test('U2-d: authority ranking reorders the inventory, and rank 0 is refused', async ({ page }) => {
  const project = await newProject();
  await ingest(project.id, 'low.md', EN);
  await ingest(project.id, 'high.md', AR);
  await signIn(page, ['BusinessAnalyst'], project.key);

  const items = () => page.locator('[data-testid^="source-"]');
  await expect(items()).toHaveCount(2);

  // Rank 0 is not settable: it means undecided, not lowest.
  const first = items().first();
  const id = (await first.getAttribute('data-testid'))!.replace('source-', '');
  await page.getByTestId(`rank-${id}`).click();
  await page.getByTestId(`rank-input-${id}`).fill('0');
  await page.getByTestId(`rank-save-${id}`).click();
  await expect(page.getByTestId(`rank-error-${id}`)).toContainText(/Rank 0 is not settable/);

  // A real rank is accepted, with a justification, and the list reorders.
  await page.getByTestId(`rank-input-${id}`).fill('9');
  await page.getByTestId(`rank-just-${id}`).fill('Signed by the regulator');
  await page.getByTestId(`rank-save-${id}`).click();

  await expect(page.getByTestId(`authority-${id}`)).toContainText('Rank 9');
  await expect(items().first()).toHaveAttribute('data-testid', `source-${id}`);
});

test('U2-e: L0 validation renders findings with rule ids and severity', async ({ page }) => {
  const project = await newProject();
  await ingest(project.id, 'brd-en.md', EN);
  await signIn(page, ['BusinessAnalyst'], project.key);

  await page.getByTestId('validate-run').click();

  // Either outcome is legitimate; what matters is that it is REPORTED.
  const clean = page.getByTestId('validation-clean');
  const findings = page.getByTestId('validation-findings');
  await expect(clean.or(findings)).toBeVisible();

  if (await findings.isVisible()) {
    await expect(findings.locator('code').first()).toContainText(/^L0-ING-/);
  }
});

test('a Viewer sees ingest and ranking DISABLED, and the API refuses anyway', async ({ page }) => {
  // ADR-0039 §4: the affordance is a courtesy; the API is the control. Both
  // halves are asserted, because only asserting the first would prove nothing.
  const project = await newProject();
  await ingest(project.id, 'brd-en.md', EN);
  await signIn(page, ['Viewer'], project.key);

  await expect(page.getByTestId('upload-denied')).toContainText(/cannot add sources/);
  await expect(page.getByTestId('up-submit')).toBeDisabled();
  await expect(page.locator('[data-testid^="rank-denied-"]').first()).toBeVisible();

  const refused = await api.post(`/projects/${project.id}/sources`, {
    headers: {
      'x-asdp-subject': 'u-viewer',
      'x-asdp-roles': 'Viewer',
      'content-type': 'application/json',
    },
    data: { filename: 'sneaky.md', text: 'Should not be permitted.' },
  });
  expect(refused.status()).toBe(403);
});

test('a Contributor CAN upload — the role U1 could not select', async ({ page }) => {
  // U2-a's defect, asserted end to end rather than only in a drift test.
  const project = await newProject();
  await signIn(page, ['Contributor'], project.key);

  // The control is disabled while the form is empty as well as by role, so the
  // role assertion has to come after the form is complete — otherwise it would
  // pass for the wrong reason.
  await expect(page.getByTestId('upload-denied')).toHaveCount(0);
  await page.getByTestId('up-filename').fill('contributed.md');
  await page.getByTestId('up-text').fill('Contributed evidence.');
  await expect(page.getByTestId('up-submit')).toBeEnabled();
  await page.getByTestId('up-submit').click();
  await expect(page.getByTestId('up-created')).toContainText('Uploaded');
});

test('U1 IS NOT REGRESSED: opening an Arabic source still highlights RTL', async ({ page }) => {
  const project = await newProject();
  await ingest(project.id, 'brd-ar.md', AR);
  await signIn(page, ['BusinessAnalyst'], project.key);

  await page.locator('[data-testid^="open-"]').first().click();

  const viewer = page.locator('.viewer__text');
  await expect(viewer).toBeVisible();
  await expect(viewer).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('mark.hl').first()).toBeVisible();

  // The accessible name carries direction — never colour alone.
  await expect(page.locator('mark.hl').first()).toHaveAttribute(
    'aria-label',
    /right to left/,
  );
});
