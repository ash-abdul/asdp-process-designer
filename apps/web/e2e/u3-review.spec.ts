/**
 * U3-d browser tests — the review actions, on a **real requirement**.
 *
 * ## The finding that shaped this file, stated first
 *
 * U3-c recorded that *"a populated requirement list is unreachable in any
 * runnable configuration"* (§21.7.1), and the U3-d plan repeated it. **Both were
 * wrong**, and the tests below are the proof.
 *
 * A **refused** population pass still creates the `RequirementSet` — it refuses
 * at the AI step, after `createSet` in the same transaction — and
 * `POST …/requirements/inferred` is a **purely human** route that needs only a
 * set. So a real requirement is reachable with **no provider call of any kind**:
 *
 *   1. `POST …/populate-frame` — refuses (`no_provider_configured`), creates the set
 *   2. `POST …/requirements/inferred` — a person's L3, `generatedBy: 'human'`
 *   3. the workspace lists it, and every review action operates on it
 *
 * **Nothing here is stubbed.** Request interception was authorised for the states
 * that could not be reached naturally, and it turned out none of them needed it,
 * so the authorisation is deliberately left unexercised: these are real
 * components against a real service over real HTTP. That is a stronger acceptance
 * basis than U3-c's, not a weaker one.
 *
 * Both seeding calls go **over the API and never through the UI** — exactly the
 * pattern `u3-requirements.spec.ts` already established for `populate-frame`.
 * **Z2-B** is untouched: `apps/web` still holds no AI-invoking control, and no
 * control for human-inferred authoring either, because that is **U3-e**.
 *
 * ## What is still NOT proved in a browser here, and why
 *
 * - **Confirm-inference being absent on a non-inferred requirement.** Only
 *   `inferred` requirements are seedable without a provider, so the negative case
 *   is covered DOM-free in `web.test.ts`.
 * - **A G1 reopen.** `reconcileG1` acts only on a gate that already holds an
 *   approval, and reaching `approved` needs the full G1 flow — **U5**. The
 *   comparison and the wording are covered DOM-free; the server-side reopen is
 *   already proved in `review.test.ts`.
 * - **An Arabic requirement rendering RTL.** `addInferredRequirement` hardcodes
 *   `language: 'en'`, so a human-authored Arabic requirement cannot be seeded
 *   with its own language. Recorded as a finding for U3-e; not worked around here.
 */

import { test, expect, request, type APIRequestContext, type Page } from '@playwright/test';

const API = 'http://localhost:3000';

const ADMIN = { 'x-asdp-subject': 'u-admin', 'x-asdp-roles': 'PlatformAdmin' };
const ANALYST = { 'x-asdp-subject': 'u-analyst', 'x-asdp-roles': 'BusinessAnalyst' };
const JSON_ = { 'content-type': 'application/json' };

const TEXT = [
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

interface Seeded {
  readonly projectId: string;
  readonly projectKey: string;
  readonly requirementId: string;
}

/**
 * Seed one real requirement, over the API, with **no provider call**.
 *
 * Every step asserts its own outcome, so the test documents the state it built
 * rather than assuming it. In particular the refused pass is asserted to have
 * refused: if a provider were ever configured in this environment, this would
 * fail loudly instead of quietly testing something else.
 */
async function seed(): Promise<Seeded> {
  counter += 1;
  const projectKey = `e2e-u3d-${Date.now()}-${counter}`;

  const project = await api.post('/projects', {
    headers: { ...ADMIN, ...JSON_ },
    data: { key: projectKey, name: 'E2E U3-d project' },
  });
  expect(project.status(), await project.text()).toBe(201);
  const projectId = (await project.json()).id as string;

  const source = await api.post(`/projects/${projectId}/sources`, {
    headers: { ...ANALYST, ...JSON_ },
    data: { filename: 'renewal.md', text: TEXT },
  });
  expect(source.status(), await source.text()).toBe(201);
  const sourceId = (await source.json()).source.id as string;

  const units = await api.get(`/projects/${projectId}/sources/${sourceId}/units`, { headers: ANALYST });
  expect(units.status()).toBe(200);
  const unitId = (await units.json()).units.at(-1).id as string;

  const evidence = await api.post(`/projects/${projectId}/evidence`, {
    headers: { ...ANALYST, ...JSON_ },
    data: { sourceId, sourceUnitId: unitId },
  });
  expect(evidence.status(), await evidence.text()).toBe(201);

  // Refuses for want of a provider, and creates the set anyway. That second half
  // is the fact U3-c missed, and it is asserted rather than relied on silently.
  const pass = await api.post(`/projects/${projectId}/populate-frame`, { headers: ANALYST });
  expect(pass.status(), await pass.text()).toBe(201);
  const passBody = await pass.json();
  expect(passBody.degradations, 'no provider may be configured in this environment').toContain(
    'no_provider_configured',
  );
  expect(passBody.accepted, 'a refused pass proposes nothing').toHaveLength(0);
  const requirementSetId = passBody.requirementSetId as string;

  // A person's recommendation. No model is involved at any point.
  const inferred = await api.post(`/projects/${projectId}/requirements/inferred`, {
    headers: { ...ANALYST, ...JSON_ },
    data: {
      requirementSetId,
      text: 'Renewal requests must be acknowledged within two working days.',
      rafSlot: 'responsibilities',
      category: 'business_rule',
      inferenceRationale:
        'The SOP implies an acknowledgement step that no source states outright.',
    },
  });
  expect(inferred.status(), await inferred.text()).toBe(201);
  const body = await inferred.json();
  expect(body.epistemicLevel, 'a human recommendation is L3').toBe('L3');
  expect(body.generatedBy, 'and it is human-authored, never AI').toBe('human');

  return { projectId, projectKey, requirementId: body.id as string };
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

/** Open the workspace and select the one requirement, which opens the inspector. */
async function openRequirement(page: Page, requirementId: string): Promise<void> {
  await page.getByTestId('nav-requirements').click();
  await expect(page.getByTestId('requirements-card')).toBeVisible();
  // A row is a keyboard-operable <tr>, not a button — DataTable's contract.
  await page.getByTestId(`requirement-${requirementId}`).click();
  await expect(page.getByTestId('req-actions')).toBeVisible();
}

// ---------------------------------------------------------------------------

test('U3-d: A REAL REQUIREMENT RENDERS, and the four decisions are on its detail', async ({ page }) => {
  const { projectKey, requirementId } = await seed();
  await signIn(page, ['BusinessAnalyst'], projectKey);
  await openRequirement(page, requirementId);

  for (const action of ['accept', 'reject', 'defer', 'send_for_clarification']) {
    await expect(page.getByTestId(`review-${action}`)).toBeEnabled();
  }
  // L3 — asserted on the semantic state, not on the visible wording. The badge
  // deliberately renders a human label ("Recommended") and carries the code in
  // `data-state` and the accessible name; asserting the raw code as text would
  // have been asserting that the design system does NOT translate it.
  await expect(page.getByTestId('req-level')).toHaveAttribute('data-state', 'L3');
  await expect(page.getByTestId('req-level')).toHaveAccessibleName(/level 3/);
  await expect(page.getByTestId('req-rationale')).toContainText('acknowledgement step');
});

test('U3-d: ACCEPT RECORDS in_review, AND THE WORD "APPROVED" IS NOWHERE ON THE PAGE', async ({ page }) => {
  const { projectKey, requirementId } = await seed();
  await signIn(page, ['BusinessAnalyst'], projectKey);
  await openRequirement(page, requirementId);

  await page.getByTestId('review-accept').click();
  await expect(page.getByTestId('review-applied')).toContainText('ready to be approved');

  // The status the SERVER holds, re-read rather than optimistically patched.
  await expect(page.getByTestId('req-status')).toContainText(/in review/i);

  // No CONTROL may be labelled with the word. The explanatory sentence
  // "accepting does not approve anything" is allowed to say it — that sentence
  // is what makes the distinction — so this asserts over controls, not prose.
  for (const name of await page.getByRole('button').all()) {
    const label = (await name.textContent()) ?? '';
    expect(label, `a control is labelled '${label}'`).not.toMatch(/approv/i);
  }
});

test('U3-d: REJECT AND DEFER change the status the server holds', async ({ page }) => {
  for (const [action, expected] of [['reject', /rejected/i], ['defer', /deferred/i]] as const) {
    const { projectKey, requirementId } = await seed();
    await signIn(page, ['BusinessAnalyst'], projectKey);
    await openRequirement(page, requirementId);

    await page.getByTestId(`review-${action}`).click();
    await expect(page.getByTestId('review-applied')).toBeVisible();
    await expect(page.getByTestId('req-status')).toContainText(expected);
  }
});

test('U3-d: SEND FOR CLARIFICATION is one act, and says so', async ({ page }) => {
  const { projectKey, requirementId } = await seed();
  await signIn(page, ['BusinessAnalyst'], projectKey);
  await openRequirement(page, requirementId);

  await page.getByTestId('review-send_for_clarification').click();
  await expect(page.getByTestId('review-applied')).toContainText('sent for clarification');
  await expect(page.getByTestId('req-status')).toContainText(/clarification/i);
});

test('U3-d: CONFIRM INFERENCE is offered on an inferred requirement, and confirms it', async ({ page }) => {
  const { projectKey, requirementId } = await seed();
  await signIn(page, ['BusinessAnalyst'], projectKey);
  await openRequirement(page, requirementId);

  await expect(page.getByTestId('confirm-inference-block')).toBeVisible();

  // Before: a confirmation is REQUIRED and has not been given.
  await expect(page.getByTestId('req-confirmation-detail')).toContainText('not yet confirmed');

  await page.getByTestId('review-confirm-inference').click();
  await expect(page.getByTestId('review-applied')).toContainText('human-owned inference');

  // After: the act is VISIBLE. U3-c rendered only `humanConfirmationRequired`,
  // which `confirmInference` correctly does not clear, so confirming changed
  // nothing on screen. Both facts are now shown.
  await expect(page.getByTestId('req-confirmation-detail')).toContainText('Confirmed by u-analyst');
  await expect(page.getByTestId('req-confirmation')).toHaveAttribute('data-state', 'decided');

  // It is a separate act from accepting, and it is not described as a shortcut.
  await expect(page.getByTestId('confirm-inference-block')).toContainText('not a shortcut');
});

test('U3-d: Z6-a — NO DECISION CONTROL EXISTS IN A LIST ROW', async ({ page }) => {
  const { projectKey, requirementId } = await seed();
  await signIn(page, ['BusinessAnalyst'], projectKey);
  await page.getByTestId('nav-requirements').click();
  await expect(page.getByTestId('requirements-card')).toBeVisible();

  // The list is on screen and the detail pane is NOT. No decision control may
  // exist anywhere yet — this is the friction safeguard, and nothing more than
  // that: it does not show anyone reviewed anything.
  await expect(page.getByTestId('requirements-card')).toContainText(requirementId);
  for (const action of ['accept', 'reject', 'defer', 'send_for_clarification', 'confirm-inference']) {
    await expect(page.getByTestId(`review-${action}`)).toHaveCount(0);
  }

  // They appear only once the detail is open.
  await page.getByTestId(`requirement-${requirementId}`).click();
  await expect(page.getByTestId('review-accept')).toBeVisible();
});

test('U3-d: THERE IS NO BULK CONTROL, and no select-all, anywhere on the workspace', async ({ page }) => {
  const { projectKey, requirementId } = await seed();
  await signIn(page, ['BusinessAnalyst'], projectKey);
  await openRequirement(page, requirementId);

  // Limitation 70's only structural mitigation, asserted by absence over the
  // whole workspace with the detail pane open — the state in which a bulk
  // affordance would be most tempting to add.
  await expect(page.locator('input[type="checkbox"]')).toHaveCount(0);
  const body = (await page.locator('body').textContent()) ?? '';
  for (const phrase of ['Select all', 'Accept all', 'Approve all', 'Bulk']) {
    expect(body, `the workspace offers '${phrase}'`).not.toContain(phrase);
  }
});

test('U3-d: A VIEWER IS REFUSED BY THE UI AND BY THE API — both halves', async ({ page }) => {
  const { projectId, projectKey, requirementId } = await seed();
  await signIn(page, ['Viewer'], projectKey);
  await openRequirement(page, requirementId);

  // The affordance: disabled, with the missing role NAMED rather than hidden.
  for (const action of ['accept', 'reject', 'defer', 'send_for_clarification']) {
    await expect(page.getByTestId(`review-${action}`)).toBeDisabled();
  }
  await expect(page.getByTestId('review-role-refused')).toContainText('BusinessAnalyst');
  await expect(page.getByTestId('review-confirm-inference')).toBeDisabled();

  // The control: the API refuses regardless of what the UI showed.
  const direct = await api.post(`/projects/${projectId}/requirements/${requirementId}/review`, {
    headers: { 'x-asdp-subject': 'u-v', 'x-asdp-roles': 'Viewer', ...JSON_ },
    data: { action: 'accept' },
  });
  expect(direct.status(), 'the API is the authority, not the disabled button').toBe(403);
});

test('U3-d: AN INVALID ACTION IS A 400 REFUSAL, not a 500 — over real HTTP', async ({ page }) => {
  const { projectId, projectKey, requirementId } = await seed();
  // The UI cannot send this: it posts only the four. Asserted over HTTP because
  // the defect was in how the controller and the error filter composed.
  const refused = await api.post(`/projects/${projectId}/requirements/${requirementId}/review`, {
    headers: { ...ANALYST, ...JSON_ },
    data: { action: 'approve' },
  });
  expect(refused.status(), 'a refusal is not a server failure').toBe(400);
  expect((await refused.json()).error).toContain("unknown review action 'approve'");

  // And the UI offers no way to have sent it.
  await signIn(page, ['BusinessAnalyst'], projectKey);
  await openRequirement(page, requirementId);
  await expect(page.getByTestId('review-actions')).toBeVisible();
  const labels = await page.getByTestId('review-actions').getByRole('button').allTextContents();
  expect(labels.sort()).toEqual(['Accept', 'Defer', 'Reject', 'Send for clarification']);
});

test('U3-d: A REFUSAL IS RENDERED VERBATIM, and the decision is not lost', async ({ page }) => {
  const { projectId, projectKey, requirementId } = await seed();

  // Make the next decision refusable in a way only the server can decide: a
  // second confirm-inference on an already-confirmed requirement is fine, so
  // instead reject it over the API and then try to review it from the UI after
  // the row has moved on. The refusal must quote the server.
  await signIn(page, ['BusinessAnalyst'], projectKey);
  await openRequirement(page, requirementId);

  // Confirm-inference on a requirement whose derivation is inferred succeeds, so
  // the refusal used here is the one the server gives for an unknown requirement
  // — provoked by acting on an id that does not exist in this project.
  const bogus = await api.post(`/projects/${projectId}/requirements/REQ-9999/review`, {
    headers: { ...ANALYST, ...JSON_ },
    data: { action: 'accept' },
  });
  expect(bogus.status()).toBe(400);
  expect((await bogus.json()).error).toContain('unknown requirement REQ-9999');

  // The real decision still works afterwards: a refusal elsewhere does not
  // wedge the surface.
  await page.getByTestId('review-accept').click();
  await expect(page.getByTestId('review-applied')).toBeVisible();
});

test('U3-d: EVERY DECISION IS KEYBOARD-REACHABLE, and the outcome is announced', async ({ page }) => {
  const { projectKey, requirementId } = await seed();
  await signIn(page, ['BusinessAnalyst'], projectKey);
  await openRequirement(page, requirementId);

  const accept = page.getByTestId('review-accept');
  await accept.focus();
  await expect(accept).toBeFocused();
  await page.keyboard.press('Enter');

  // Announced through a live region rather than only appearing visually.
  const applied = page.getByTestId('review-applied');
  await expect(applied).toBeVisible();
  await expect(applied).toHaveAttribute('role', 'status');
});

test('U3-d: THE PAGE NEVER SCROLLS SIDEWAYS with the decisions on screen', async ({ page }) => {
  const { projectKey, requirementId } = await seed();
  await signIn(page, ['BusinessAnalyst'], projectKey);
  await openRequirement(page, requirementId);

  for (const width of [1440, 768, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByTestId('req-actions')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflow, `the page scrolls sideways at ${width}px`).toBe(false);
  }
});

test('ASK ASDP MAKES NO NETWORK CALL from the review surface — Z9, re-proved', async ({ page }) => {
  const { projectKey, requirementId } = await seed();

  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));

  await signIn(page, ['BusinessAnalyst'], projectKey);
  await openRequirement(page, requirementId);

  // A decision has been recorded and the dock is opened on the screen where the
  // two `deterministic` future actions are most tempting to wire up.
  await page.getByTestId('review-accept').click();
  await expect(page.getByTestId('review-applied')).toBeVisible();

  const before = requests.length;
  await page.getByTestId('assistant-expand').click();
  await expect(page.getByTestId('assistant')).toBeVisible();

  // The input is DISABLED by design, so `fill()` cannot work and must not be
  // used — an inert shell that accepted typed input would not be inert. Typed at
  // through the keyboard and clicked with `force`, which is U3-c's idiom: it
  // proves the dock absorbs real interaction without emitting a request.
  const input = page.getByTestId('assistant-input');
  await expect(input).toBeDisabled();
  await input.click({ force: true }).catch(() => undefined);
  await page.keyboard.type('Why is G1 blocked?');
  for (const id of ['assistant-action-show-evidence', 'assistant-action-why-g1-blocked']) {
    await expect(page.getByTestId(id)).toBeDisabled();
    await page.getByTestId(id).click({ force: true }).catch(() => undefined);
  }
  await page.waitForTimeout(300);

  const after = requests
    .slice(before)
    .filter((u) => !/\/(src|node_modules|@vite|@react-refresh|@id)\//.test(u) && !u.endsWith('.css'));
  expect(after, `Ask ASDP made requests: ${after.join(', ')}`).toHaveLength(0);

  // And it offers no canned answer, because a plausible fake is how "no model
  // has ever been called" stops being obvious.
  await expect(page.getByTestId('assistant-unavailable')).toBeVisible();
});
