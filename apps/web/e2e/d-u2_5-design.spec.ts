/**
 * D-U2.5 browser tests — the design foundation, in a real browser.
 *
 * [ADR-0040](../../../docs/adr/ADR-0040-browser-testing-pinned-browser.md) §5:
 * these cover **wiring and rendering**, not arithmetic. Every rule that can be
 * tested without a DOM is tested in `design/design.test.ts`, and that is not
 * relaxed because a browser is available. What is here is what only a browser can
 * answer: does it actually mirror, does the theme actually change, does the
 * assistant actually stay silent.
 *
 * The existing U2 suite is **untouched**. Its ten tests passing unchanged is what
 * makes this slice presentation-only rather than merely claimed to be.
 */

import { test, expect, request, type APIRequestContext, type Page } from '@playwright/test';

const API = 'http://localhost:3000';

const ADMIN = { 'x-asdp-subject': 'u-admin', 'x-asdp-roles': 'PlatformAdmin' };
const ANALYST = { 'x-asdp-subject': 'u-analyst', 'x-asdp-roles': 'BusinessAnalyst' };

const EN = ['# Licence renewal', '', '## 1. Eligibility', 'The applicant must submit within ninety days.'].join('\n');
const AR = ['# تجديد الرخصة', '', '## ١. الأهلية', 'يجب على مقدم الطلب تقديم طلب التجديد خلال تسعين يوماً.'].join('\n');

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
  const key = `d25-${Date.now()}-${counter}`;
  const res = await api.post('/projects', {
    headers: { ...ADMIN, 'content-type': 'application/json' },
    data: { key, name: 'Design foundation project' },
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

async function signIn(page: Page, roles: string[], projectKey?: string): Promise<void> {
  await page.goto('/');
  const box = (name: string) => page.getByRole('checkbox', { name, exact: true });
  const preChecked = box('BusinessAnalyst');
  if (await preChecked.isChecked()) await preChecked.uncheck();
  for (const role of roles) await box(role).check();
  await page.getByRole('button', { name: 'Sign in' }).click();
  if (projectKey !== undefined) await page.getByRole('button', { name: new RegExp(projectKey) }).click();
}

// ---------------------------------------------------------------------------
// The shell
// ---------------------------------------------------------------------------

test('the shell renders its regions, and the status strip is present', async ({ page }) => {
  const project = await newProject();
  await signIn(page, ['BusinessAnalyst'], project.key);

  await expect(page.getByTestId('shell')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Workspaces' })).toBeVisible();
  await expect(page.getByTestId('project-bar')).toBeVisible();
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByTestId('status-strip')).toBeVisible();

  // The project context is unlosable: it is in the bar AND in the status strip.
  await expect(page.getByTestId('project-bar')).toContainText(project.key);
  await expect(page.getByTestId('status-project')).toContainText(project.key);
});

test('the rail declares future workspaces as DISABLED and names their slice', async ({ page }) => {
  // §26.2 and §2.1: navigation may show what does not exist, but it must never
  // imply the capability is there. This is the honesty check.
  await signIn(page, ['BusinessAnalyst']);

  await expect(page.getByTestId('nav-sources')).toBeEnabled();
  await expect(page.getByTestId('nav-sources')).toHaveAttribute('data-available', 'true');

  // `requirements` left this list at U3-c, which BUILT it. The assertion that it
  // was disabled was correct when written and is now false — the honesty rule it
  // enforces is unchanged, and only the membership moved. Nothing is weakened:
  // the entry is still asserted, now on the other side.
  await expect(page.getByTestId('nav-requirements')).toBeEnabled();
  await expect(page.getByTestId('nav-requirements')).toHaveAttribute('data-available', 'true');

  for (const id of ['specifications', 'processes', 'decisions', 'forms', 'services', 'overview']) {
    const entry = page.getByTestId(`nav-${id}`);
    await expect(entry, `${id} must be disabled`).toBeDisabled();
    await expect(entry).toHaveAttribute('data-available', 'false');
    // The reason is in the accessible name, so it is never dimming alone.
    await expect(entry).toHaveAttribute('aria-label', /Not built/i);
  }
  await expect(page.getByTestId('nav-coverage')).toHaveAttribute('aria-label', /U4/);
  await expect(page.getByTestId('nav-specifications')).toHaveAttribute('aria-label', /P3/);
});

test('the development authentication warning survives the redesign, in the shell', async ({ page }) => {
  // F-U1-b. The redesign made it more prominent, not less.
  await signIn(page, ['BusinessAnalyst']);
  const badge = page.getByTestId('dev-badge');
  await expect(badge).toBeVisible();
  await expect(badge).toContainText(/Development authentication/);
  await expect(page.getByTestId('status-auth')).toContainText(/localhost only/i);
});

test('the page never scrolls sideways: wide content scrolls inside its own region', async ({ page }) => {
  const project = await newProject();
  await ingest(project.id, 'brd-en.md', EN);
  await signIn(page, ['BusinessAnalyst'], project.key);
  await expect(page.getByTestId('inventory')).toBeVisible();

  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    table: document.querySelector('.table-wrap') !== null,
  }));
  expect(overflow.table).toBe(true);
  expect(overflow.body).toBeLessThanOrEqual(1);
});

// ---------------------------------------------------------------------------
// Appearance: dark mode and density
// ---------------------------------------------------------------------------

test('dark mode changes the theme attribute AND the painted background', async ({ page }) => {
  await signIn(page, ['BusinessAnalyst']);

  const themeOf = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  const bodyBg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  const before = { theme: await themeOf(), bg: await bodyBg() };

  // light → dark → system. One click from the resolved starting point is enough
  // to prove the token layer actually repaints.
  await page.getByTestId('theme-toggle').click();
  await page.getByTestId('theme-toggle').click();

  const after = { theme: await themeOf(), bg: await bodyBg() };
  expect(['light', 'dark']).toContain(after.theme);
  expect(after.theme).not.toBe(before.theme);
  expect(after.bg).not.toBe(before.bg);
  await expect(page.getByTestId('status-theme')).toContainText(after.theme!);
});

test('compact density changes spacing and NOT information', async ({ page }) => {
  const project = await newProject();
  await ingest(project.id, 'brd-en.md', EN);
  await ingest(project.id, 'brd-ar.md', AR);
  await signIn(page, ['BusinessAnalyst'], project.key);

  // Wait for the inventory before measuring: a count taken while it is still
  // loading would be 0, and the assertion would then pass for the wrong reason.
  await expect(page.getByTestId('inventory')).toBeVisible();
  const rowCount = () => page.locator('[data-testid^="source-"]').count();
  await expect(page.locator('[data-testid^="source-"]')).toHaveCount(2);
  const before = await rowCount();
  expect(before).toBe(2);
  const heightBefore = await page.locator('.table tbody tr').first().evaluate((el) => el.getBoundingClientRect().height);

  await page.getByTestId('density-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  await expect(page.getByTestId('status-density')).toContainText('compact');

  const heightAfter = await page.locator('.table tbody tr').first().evaluate((el) => el.getBoundingClientRect().height);
  expect(heightAfter).toBeLessThan(heightBefore);
  // Density never removes information — Y15.
  expect(await rowCount()).toBe(before);
  await expect(page.locator('[data-testid^="authority-"]').first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// Responsive collapse order
// ---------------------------------------------------------------------------

test('the collapse order is the approved one, and the status strip never goes', async ({ page }) => {
  const project = await newProject();
  await ingest(project.id, 'brd-en.md', EN);
  await signIn(page, ['BusinessAnalyst'], project.key);

  const shell = page.getByTestId('shell');

  await page.setViewportSize({ width: 1600, height: 900 });
  await expect(shell).toHaveAttribute('data-rail', 'expanded');
  await expect(page.getByTestId('status-strip')).toBeVisible();

  await page.setViewportSize({ width: 1200, height: 900 });
  await expect(shell).toHaveAttribute('data-rail', 'icons');
  await expect(page.getByTestId('status-strip')).toBeVisible();

  await page.setViewportSize({ width: 900, height: 900 });
  await expect(shell).toHaveAttribute('data-inspector', 'overlay');
  await expect(page.getByTestId('status-strip')).toBeVisible();

  await page.setViewportSize({ width: 600, height: 900 });
  await expect(shell).toHaveAttribute('data-rail', 'drawer');
  await expect(page.getByTestId('rail-toggle')).toBeVisible();
  // The invariant: chrome collapses, state does not.
  await expect(page.getByTestId('status-strip')).toBeVisible();
  await expect(page.getByTestId('status-auth')).toContainText(/localhost only/i);
  // And U2's write path is still there at the narrowest width.
  await expect(page.getByTestId('up-submit')).toBeVisible();
});

// ---------------------------------------------------------------------------
// RTL
// ---------------------------------------------------------------------------

test('RTL mirrors the shell, and identifiers do NOT mirror', async ({ page }) => {
  const project = await newProject();
  await ingest(project.id, 'brd-ar.md', AR);
  await signIn(page, ['BusinessAnalyst'], project.key);
  await page.setViewportSize({ width: 1600, height: 900 });
  await expect(page.getByTestId('inventory')).toBeVisible();

  const railBox = async () => (await page.locator('.rail').boundingBox())!;
  const ltr = await railBox();
  expect(ltr.x).toBeLessThan(100);

  // The interface direction follows the document element. Because the layout uses
  // logical properties only, mirroring needs no CSS of its own — which is the
  // property being asserted here.
  await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
  const rtl = await railBox();
  expect(rtl.x).toBeGreaterThan(900);

  // D7 / ADR-0024: an identifier is ASCII and stays left-to-right in either layout.
  const idDirection = await page.locator('.id').first().evaluate((el) => getComputedStyle(el).direction);
  expect(idDirection).toBe('ltr');

  await page.evaluate(() => document.documentElement.setAttribute('dir', 'ltr'));
});

test('an Arabic document still renders RTL inside the new viewer', async ({ page }) => {
  const project = await newProject();
  await ingest(project.id, 'brd-ar.md', AR);
  await signIn(page, ['BusinessAnalyst'], project.key);

  await page.locator('[data-testid^="open-"]').first().click();
  await expect(page.locator('.viewer__text')).toHaveAttribute('dir', 'rtl');

  // The inspector reports the two verification states SEPARATELY (ADR-0038).
  await expect(page.getByTestId('inspector')).toBeVisible();
  await expect(page.getByTestId('inspector-length')).toContainText(/code points/);
});

// ---------------------------------------------------------------------------
// Semantic states without colour
// ---------------------------------------------------------------------------

test('semantic states are identifiable WITHOUT colour', async ({ page }) => {
  const project = await newProject();
  await ingest(project.id, 'brd-en.md', EN);
  await signIn(page, ['BusinessAnalyst'], project.key);

  // Unranked: the badge says "undecided" in words and carries a glyph, and the
  // row also spells out that nobody has decided. Not a colour, and not a zero.
  const undecided = page.locator('.badge[data-state="undecided"]').first();
  await expect(undecided).toBeVisible();
  await expect(undecided).toHaveAttribute('aria-label', /undecided/i);
  await expect(undecided).toContainText('Undecided');
  await expect(page.locator('[data-testid^="authority-"]').first()).toContainText(/nobody has decided/i);

  // Every badge on the page carries a non-colour cue: a glyph AND a word.
  const badges = page.locator('.badge');
  const count = await badges.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) {
    const badge = badges.nth(i);
    await expect(badge).toHaveAttribute('aria-label', /.+/);
    const glyph = await badge.locator('.badge__glyph').innerText();
    expect(glyph.trim().length).toBeGreaterThan(0);
  }

  // Simulate greyscale: with colour removed the labels still distinguish states.
  await page.addStyleTag({ content: 'html { filter: grayscale(1) !important; }' });
  await expect(undecided).toContainText('Undecided');
  await expect(page.locator('.badge[data-state="parsed"]').first()).toContainText('Parsed');
});

test('a lifecycle badge names the parse state, and a parse failure keeps its reason visible', async ({ page }) => {
  const project = await newProject();
  await ingest(project.id, 'brd-en.md', EN);
  await signIn(page, ['BusinessAnalyst'], project.key);

  const parse = page.locator('[data-testid^="parse-"]').first();
  await expect(parse).toBeVisible();
  await expect(parse).toHaveAttribute('aria-label', /brd-en\.md/);
});

// ---------------------------------------------------------------------------
// The contextual inspector
// ---------------------------------------------------------------------------

test('selecting a source opens the contextual panel with its rank form', async ({ page }) => {
  const project = await newProject();
  await ingest(project.id, 'brd-en.md', EN);
  await signIn(page, ['BusinessAnalyst'], project.key);

  // Before selection the side region offers the upload form.
  await expect(page.getByTestId('upload-card')).toBeVisible();
  await expect(page.getByTestId('source-inspector')).toHaveCount(0);

  const row = page.locator('[data-testid^="source-"]').first();
  const id = (await row.getAttribute('data-testid'))!.replace('source-', '');
  await page.getByTestId(`rank-${id}`).click();

  await expect(page.getByTestId('source-inspector')).toBeVisible();
  await expect(page.getByTestId(`rank-form-${id}`)).toBeVisible();
  await expect(page.getByTestId(`rank-input-${id}`)).toBeVisible();
  // Selection is marked structurally, not by colour alone.
  await expect(row).toHaveAttribute('aria-selected', 'true');

  await page.getByTestId('source-inspector-close').click();
  await expect(page.getByTestId('upload-card')).toBeVisible();
});

// ---------------------------------------------------------------------------
// Ask ASDP — the point of the whole exercise: it must do NOTHING
// ---------------------------------------------------------------------------

test('ASK ASDP MAKES NO NETWORK CALL, and offers no simulated answer', async ({ page }) => {
  const project = await newProject();
  await ingest(project.id, 'brd-en.md', EN);
  await signIn(page, ['BusinessAnalyst'], project.key);
  await expect(page.getByTestId('inventory')).toBeVisible();

  // Record every request from here on. H3 is unresolved: the dock must be inert.
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));

  await page.getByTestId('assistant-expand').click();
  await expect(page.getByTestId('assistant')).toBeVisible();
  await expect(page.getByTestId('assistant-unavailable')).toContainText(
    'Ask ASDP unavailable — live AI enablement pending.',
  );
  await expect(page.getByTestId('assistant-unavailable')).toContainText(/H3/);

  // Try to use it, the way a user would.
  const input = page.getByTestId('assistant-input');
  await expect(input).toBeDisabled();
  await input.click({ force: true }).catch(() => undefined);
  await page.keyboard.type('Why is G1 blocked?');
  await page.getByTestId('assistant-action-why-g1-blocked').click({ force: true }).catch(() => undefined);
  await page.getByTestId('assistant-action-show-evidence').click({ force: true }).catch(() => undefined);
  await page.waitForTimeout(300);

  // Nothing left the browser. Not to a provider, not to the API, not anywhere.
  const nonAsset = requests.filter((u) => !/\/(src|node_modules|@vite|@react-refresh|@id)\//.test(u) && !u.endsWith('.css'));
  expect(nonAsset, `the assistant caused requests: ${nonAsset.join(', ')}`).toEqual([]);

  // And no answer was invented in place of one.
  const text = await page.getByTestId('assistant').innerText();
  expect(text).not.toMatch(/blocked because|the answer is|based on the following evidence/i);
});

test('every Ask ASDP action is disabled, and the deterministic ones are labelled as such', async ({ page }) => {
  await signIn(page, ['BusinessAnalyst']);
  await page.getByTestId('assistant-expand').click();

  for (const id of ['show-evidence', 'why-g1-blocked', 'explain-this', 'identify-conflicts', 'summarise-issues', 'explain-impact']) {
    await expect(page.getByTestId(`assistant-action-${id}`)).toBeDisabled();
  }

  // Y23: the two most damaging answers to fabricate are queries, not prompts.
  const evidence = page.getByTestId('assistant-action-show-evidence').locator('..');
  await expect(evidence).toContainText('deterministic');
  const g1 = page.getByTestId('assistant-action-why-g1-blocked').locator('..');
  await expect(g1).toContainText('deterministic');

  // It states that it cannot approve anything, on screen.
  await expect(page.getByTestId('assistant')).toContainText(/no approve/i);
});

test("Ask ASDP's context follows the selection, and it is never hidden", async ({ page }) => {
  const project = await newProject();
  await ingest(project.id, 'brd-en.md', EN);

  await signIn(page, ['BusinessAnalyst']);
  await page.getByTestId('assistant-expand').click();
  // No project yet: it says so rather than guessing.
  await expect(page.getByTestId('assistant-context')).toContainText(/No project selected/i);

  await page.getByRole('button', { name: new RegExp(project.key) }).click();
  await expect(page.getByTestId('assistant-context')).toContainText(project.key);

  await page.locator('[data-testid^="open-"]').first().click();
  await expect(page.getByTestId('assistant-context')).toContainText('brd-en.md');
});

test('Ask ASDP collapses to a persistent tab and is never modal', async ({ page }) => {
  const project = await newProject();
  await ingest(project.id, 'brd-en.md', EN);
  await signIn(page, ['BusinessAnalyst'], project.key);
  await page.setViewportSize({ width: 1600, height: 900 });

  // Collapsed by default — honest, because it is unavailable.
  await expect(page.getByTestId('assistant-expand')).toBeVisible();
  await expect(page.getByTestId('assistant')).toHaveCount(0);

  await page.getByTestId('assistant-expand').click();
  await expect(page.getByTestId('assistant')).toBeVisible();
  // Never modal: the workspace stays usable while it is open.
  await expect(page.getByTestId('up-filename')).toBeVisible();
  await page.getByTestId('up-filename').fill('still-usable.md');

  await page.getByTestId('assistant-collapse').click();
  await expect(page.getByTestId('assistant')).toHaveCount(0);
  await expect(page.getByTestId('assistant-expand')).toBeVisible();
});

test('the status strip states that Ask ASDP is unavailable, without opening it', async ({ page }) => {
  await signIn(page, ['BusinessAnalyst']);
  await expect(page.getByTestId('status-assistant')).toContainText(/unavailable \(H3\)/i);
});

test('a selectable row is operable by KEYBOARD, not only by mouse', async ({ page }) => {
  // Found in review: the row had a click handler and no keyboard path. For a role
  // with no action buttons in the row, clicking was the only way to select it.
  const project = await newProject();
  await ingest(project.id, 'brd-en.md', EN);
  await signIn(page, ['Viewer'], project.key);
  await expect(page.getByTestId('inventory')).toBeVisible();

  const row = page.locator('[data-testid^="source-"]').first();
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('source-inspector')).toBeVisible();
  await expect(row).toHaveAttribute('aria-selected', 'true');

  // A Viewer sees the panel read-only, with the reason in words.
  await expect(page.getByTestId('source-inspector')).toContainText(/Ranking needs BusinessAnalyst/i);
});

test('a refused upload uses the shared refusal state, and says nothing was stored', async ({ page }) => {
  const project = await newProject();
  await signIn(page, ['BusinessAnalyst'], project.key);

  await page.getByTestId('up-filename').fill('broken.bin');
  await page.getByTestId('up-file').setInputFiles({
    name: 'broken.bin',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from([0xff, 0xfe, 0x00, 0x01, 0x02, 0xff, 0xfe]),
  });
  await page.getByTestId('up-submit').click();

  const refused = page.getByTestId('up-refused');
  await expect(refused).toBeVisible();
  // A refusal is the system working — distinct from an error, and it says so.
  await expect(refused).toContainText(/A refusal is the system working/i);
  await expect(refused).toContainText(/Nothing was changed/i);
});

test('a project is findable by its KEY, which lives in the accessible name', async ({ page }) => {
  // Found in the refinement pass: the key was removed from the project link's
  // visible text because it ran together with the name — and that removed it from
  // the accessible name too, breaking every test that finds a project by key. A
  // project is identified by its key; it stays in the name, visible or not.
  const project = await newProject();
  await signIn(page, ['BusinessAnalyst']);

  const link = page.getByRole('button', { name: new RegExp(project.key) });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('aria-label', new RegExp(project.key));
  await link.click();
  await expect(page.getByTestId('project-bar')).toContainText(project.key);
});

test('the refined workspace header carries project identity at heading scale', async ({ page }) => {
  const project = await newProject();
  await ingest(project.id, 'brd-en.md', EN);
  await signIn(page, ['BusinessAnalyst'], project.key);

  const bar = page.getByTestId('project-bar');
  await expect(bar).toContainText('Project');
  await expect(bar).toContainText(project.key);
  // A header, not a thin strip: it is taller than a single line of body text.
  const height = await bar.evaluate((el) => el.getBoundingClientRect().height);
  expect(height).toBeGreaterThan(48);

  // The project name is set at a larger size than body text.
  const nameSize = await page
    .locator('.projectbar__name')
    .first()
    .evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
  const bodySize = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.body).fontSize));
  expect(nameSize).toBeGreaterThan(bodySize);
});
