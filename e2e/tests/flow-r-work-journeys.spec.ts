// REPEATABILITY: a daily update is unique per employee and day and the API has no
// delete (corrections only, by design), so each run consumes one of the last 28
// days. On a throwaway stack clear them with: DELETE FROM "DailyUpdate" (test DB only).
import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { BASE_URLS } from '../playwright.config';
import {
  apiFor,
  gotoWork,
  openRoleContext,
  roleEmail,
  workPassword,
  workTenant,
  type WorkRole,
} from '../fixtures/work-sessions';
import type { TenantTarget } from '../fixtures/web-session';

/**
 * Flow R - the work journeys (DP-MASTER R4): My work, work queues, evidence
 * (contributions), evidence review, daily updates, the daily update policy, the
 * project Work area and the multi-recipient workflow builder, driven through the
 * real UI of apps/web with an assertion on the API outcome next to every UI one.
 *
 * Six journeys, one per concern:
 *   1  EMPLOYEE   - tasks, the three measures, validation, correction,
 *                   withdrawal, the daily update
 *   2  MANAGER    - acknowledge, review, missing updates, project work
 *   3  HR/ADMIN   - policy, queues with SLAs, workflow with two recipients
 *   4  PAGINATION - rows per page and Next/Previous with real row counts
 *   5  RESPONSIVE - three viewports, no sideways scroll, dialogs fit
 *   6  RBAC       - the API refuses what the sidebar hides
 *
 * Environment (nothing is defaulted that is secret; the suite skips loudly):
 *   E2E_WEB_URL         tenant product, e.g. http://dijipeople-demo.localhost:3011
 *   E2E_API_URL         API, used only to prove the stack is up
 *   E2E_TENANT_SLUG     the tenant to sign in to
 *   E2E_WEB_PASSWORD    the password of the synthetic users (never committed)
 *   E2E_WEB_<ROLE>_EMAIL  optional override: EMPLOYEE | MANAGER | HR | CEO
 *
 * Every call to the API goes through the web app's same-origin /api proxy from
 * inside the browser: Node cannot resolve <slug>.localhost, Chromium can.
 */

const WEB = BASE_URLS.web;
const EVIDENCE_DIR = join(
  __dirname,
  '..',
  '..',
  'docs',
  'programs',
  'dp-master',
  'evidence',
);

/** Unique per run, so titles, notes, units and queue keys never collide. */
const RUN = `${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 36).toString(36)}`;

let tenant: TenantTarget;
const contexts = {} as Record<WorkRole, BrowserContext>;
const apis = {} as Record<WorkRole, Awaited<ReturnType<typeof apiFor>>>;
const employeeIds = {} as Record<WorkRole, string>;
const openPages = new Set<Page>();
const cleanups: Array<{ what: string; run: () => Promise<unknown> }> = [];

/* ------------------------------------------------------------------ helpers */

function ymd(offsetDays = 0, from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function hm(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function open(role: WorkRole, path: string): Promise<Page> {
  const page = await contexts[role].newPage();
  openPages.add(page);
  await gotoWork(page, WEB, tenant, path);
  await waitOutThrottle(page, path);
  return page;
}

/**
 * The API throttles per source address, and a long run from one machine can
 * trip it (RATE_LIMIT_EXCEEDED modal). That is the environment, not the product:
 * wait the window out and reload rather than report a false failure.
 */
async function waitOutThrottle(page: Page, path: string) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const throttled = await page.getByText('RATE_LIMIT_EXCEEDED').count();
    if (!throttled) return;
    await page.waitForTimeout(30_000);
    await gotoWork(page, WEB, tenant, path);
  }
}

async function releasePage(page: Page) {
  openPages.delete(page);
  await page.close().catch(() => undefined);
}

/** Pick an option of the app's custom combobox (SelectField). */
async function choose(
  page: Page,
  scope: Page | Locator,
  label: string | RegExp,
  option: string | RegExp,
) {
  const name = typeof label === 'string' ? new RegExp(`^${escapeRe(label)}`) : label;
  await scope.getByRole('combobox', { name }).click();
  await page.getByRole('option', { name: option }).first().click();
}

function escapeRe(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A labelled input: the app appends " *" to required labels, so match the start. */
function field(scope: Page | Locator, label: string) {
  return scope.getByLabel(new RegExp(`^${escapeRe(label)}`));
}

async function search(page: Page, placeholder: string, text: string) {
  const box = page.getByPlaceholder(placeholder);
  await box.fill(text);
  await expect(box).toHaveValue(text);
}

function rowOf(page: Page, text: string): Locator {
  return page.getByRole('row').filter({ hasText: text });
}

/** After a search that matches one record, its row (evidence rows do not print the note). */
function onlyRow(page: Page): Locator {
  return page.locator('tbody tr').filter({ has: page.getByRole('button', { name: /^History:/ }) });
}

async function alertText(scope: Page | Locator): Promise<string> {
  const alert = scope.getByRole('alert').filter({ hasText: /\S/ }).first();
  await expect(alert).toBeVisible();
  return ((await alert.textContent()) ?? '').trim();
}

/** The API call as a role; fails the test with the body when the status is unexpected. */
async function api(
  role: WorkRole,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  expectStatus: number | 'ok' = 'ok',
) {
  let result = await apis[role].call(method, path, body);
  for (let attempt = 0; attempt < 5 && result.status === 429; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20_000));
    result = await apis[role].call(method, path, body);
  }
  const good =
    expectStatus === 'ok'
      ? result.status >= 200 && result.status < 300
      : result.status === expectStatus;
  expect(
    good,
    `${role} ${method} ${path} -> ${result.status} ${JSON.stringify(result.body)?.slice(0, 400)}`,
  ).toBe(true);
  return result.body;
}

async function apiRaw(
  role: WorkRole,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
) {
  return apis[role].call(method, path, body);
}

function uuid() {
  return globalThis.crypto.randomUUID();
}

/** A contribution through the API, as a role, noted so it can be found by search. */
async function recordOccurrence(
  role: WorkRole,
  note: string,
  at: Date = new Date(Date.now() - 20 * 60_000),
) {
  return api(role, 'POST', '/api/contributions', {
    workKind: 'TASK',
    measure: 'OCCURRENCE',
    occurredAt: at.toISOString(),
    timezone: 'UTC',
    note,
    clientRequestId: `e2e-${uuid()}`.slice(0, 64),
  });
}

async function withdrawQuietly(role: WorkRole, id: string) {
  await apiRaw(role, 'POST', `/api/contributions/${id}/withdraw`, {
    reason: `e2e cleanup run ${RUN}`,
  });
}

/** The first date in the last 28 days on which the employee has no daily update. */
async function freeUpdateDate(used: Set<string>): Promise<string> {
  const from = ymd(-28);
  const to = ymd(0);
  const page = await api(
    'employee',
    'GET',
    `/api/daily-updates?from=${from}&to=${to}&take=100`,
  );
  const taken = new Set<string>(
    (page.items as Array<{ forDate: string }>).map((u) => u.forDate.slice(0, 10)),
  );
  for (let ago = 1; ago <= 28; ago += 1) {
    const candidate = ymd(-ago);
    if (!taken.has(candidate) && !used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  throw new Error('no free daily-update date in the last 28 days; clear the stack data');
}

const usedUpdateDates = new Set<string>();

/**
 * A project with no business unit is invisible to a business-unit-reach manager,
 * even the one who created it (GET /projects/:id answers 404; reported as an API
 * observation). Journeys therefore place their projects in a unit the manager reaches.
 */
async function visibleBusinessUnitId(): Promise<string> {
  const units = await api('manager', 'GET', '/api/business-units');
  const list = (Array.isArray(units) ? units : units.items) as Array<{ id: string }>;
  return list[0].id;
}

/** The project Work area lives behind the Projects entitlement; a tenant without it gets a plan wall. */
async function skipUnlessProjectsOnPlan(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  const wall = await page.getByText(/not part of your current subscription/i).count();
  test.skip(
    wall > 0,
    'the tenant plan does not include Projects, so the project Work area is not reachable here (give the demo tenant a plan with Projects, e.g. Enterprise, and re-run)',
  );
}

/** Policy that lets any day be reported; journeys depend on it, HR tests restore it. */
const PERMISSIVE_POLICY = {
  enabled: true,
  workingDays: [1, 2, 3, 4, 5, 6, 7],
  deadlineMinutes: 1080,
  // The policy zone decides what "today" and "a future day" mean; match the browser's so the editor's default date is never refused.
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  requireAcknowledgement: true,
};

/** Draft, fill and submit a daily update for a role through the API. */
async function submitUpdateViaApi(role: WorkRole, date: string, text: string) {
  const draft = await api(role, 'POST', '/api/daily-updates/draft', { date });
  await api(role, 'PUT', `/api/daily-updates/${draft.id}`, {
    summary: `e2e summary ${RUN}`,
    items: [{ section: 'COMPLETED', text }],
  });
  return api(role, 'POST', `/api/daily-updates/${draft.id}/submit`);
}

/* ---------------------------------------------------------------- lifecycle */

test.describe('Flow R - work journeys', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(420_000);
    test.skip(
      !workPassword(),
      'E2E_WEB_PASSWORD is unset: the synthetic users share a password that is never committed',
    );
    const slug = workTenant();
    test.skip(!slug, 'E2E_TENANT_SLUG is unset (e.g. dijipeople-demo)');
    tenant = slug!;

    const up = await Promise.all(
      [`${BASE_URLS.api}/api/health`, `${WEB}/login`].map((url) =>
        fetch(url).then((r) => r.status < 500).catch(() => false),
      ),
    );
    // The web host is a *.localhost name Node cannot resolve; the browser can.
    test.skip(!up[0], `the API is not reachable at ${BASE_URLS.api}`);

    for (const role of ['employee', 'manager', 'hr', 'ceo'] as WorkRole[]) {
      contexts[role] = await openRoleContext(browser, WEB, tenant, role);
      apis[role] = await apiFor(contexts[role]);
      const me = await apis[role].call('GET', '/api/auth/me');
      employeeIds[role] = me.body?.user?.employeeId;
    }

    // Warm every route once so no test absorbs Next dev's first-hit compile.
    const warm = await contexts.ceo.newPage();
    for (const path of [
      '/work',
      '/work/queues',
      '/work/contributions',
      '/work/contributions/review',
      '/work/daily-update',
      '/work/daily-updates',
      '/settings/daily-updates',
      '/projects',
      '/settings/approvals/templates/workflow-templates/new',
    ]) {
      await warm
        .goto(`${WEB}${path}?tenant=${tenant.slug}`, {
          waitUntil: 'domcontentloaded',
          timeout: 120_000,
        })
        .catch(() => undefined);
    }
    await warm.close();

    // Evidence left by an earlier run would overlap this run's windows (the
    // ledger merges overlaps, correctly), so start from none of it.
    const leftovers = await apis.employee.call('GET', '/api/contributions?take=100');
    for (const entry of (leftovers.body?.items ?? []) as Array<{ id: string; note: string | null }>) {
      if (entry.note?.startsWith('e2e ')) await withdrawQuietly('employee', entry.id);
    }

    // Daily updates must be switched on and open on every day for the journeys.
    await api('hr', 'PUT', '/api/daily-updates/policy', PERMISSIVE_POLICY);
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      let n = 0;
      for (const page of openPages) {
        n += 1;
        await page
          .screenshot({
            path: testInfo.outputPath(`failure-page-${n}.png`),
            fullPage: true,
          })
          .catch(() => undefined);
      }
    }
    for (const page of [...openPages]) await releasePage(page);
  });

  test.afterAll(async () => {
    for (const cleanup of cleanups.reverse()) {
      await cleanup.run().catch(() => undefined);
    }
    for (const role of Object.keys(apis) as WorkRole[]) {
      await apis[role].close().catch(() => undefined);
    }
    for (const role of Object.keys(contexts) as WorkRole[]) {
      await contexts[role].close().catch(() => undefined);
    }
  });

  /* ===================================================== 1. EMPLOYEE ===== */

  test.describe('1 employee', () => {
    test.describe.configure({ mode: 'serial' });

    const taskTitle = `E2E task ${RUN}`;

    test('creates a task, starts it and completes it; sees no team entries', async () => {
      const page = await open('employee', '/work');
      await expect(page.getByRole('heading', { name: /my work/i }).first()).toBeVisible();

      const nav = page.locator('nav');
      await expect(nav.getByRole('link', { name: 'My Work' })).toBeVisible();
      await expect(nav.getByRole('link', { name: 'My Evidence' })).toBeVisible();
      await expect(nav.getByRole('link', { name: 'Daily Update', exact: true })).toBeVisible();
      for (const hidden of ['Work Queues', 'Evidence Review', 'Team Updates']) {
        await expect(
          nav.getByRole('link', { name: hidden }),
          `${hidden} must not be offered to self-service`,
        ).toHaveCount(0);
      }

      await page.getByRole('button', { name: 'New task' }).first().click();
      const dialog = page.getByRole('dialog');
      // Empty title is refused before any request is made.
      await dialog.getByRole('button', { name: 'Create task' }).click();
      await expect(dialog.getByRole('alert')).toContainText(/title/i);
      await field(dialog, 'Title').fill(taskTitle);
      await choose(page, dialog, 'Priority', 'High');
      await field(dialog, 'Due date').fill(ymd(3));
      await dialog.getByRole('button', { name: 'Create task' }).click();
      await expect(dialog).toBeHidden();

      await search(page, 'Search work', taskTitle);
      const row = rowOf(page, taskTitle);
      await expect(row).toHaveCount(1);
      await expect(row).toContainText('Open');
      await expect(row).toContainText('High');

      const list = await api('employee', 'GET', '/api/work-items?mine=true&take=100');
      const created = (list.items as Array<{ id: string; title: string; status: string; priority: string }>).find(
        (i) => i.title === taskTitle,
      );
      expect(created, 'the task is persisted').toBeTruthy();
      expect(created!.status).toBe('OPEN');
      expect(created!.priority).toBe('HIGH');
      cleanups.push({
        what: 'archive task',
        run: () => apiRaw('employee', 'POST', `/api/work-items/${created!.id}/archive`),
      });

      await page.getByRole('button', { name: `Start: ${taskTitle}` }).click();
      await expect(row).toContainText('In progress');
      expect((await api('employee', 'GET', `/api/work-items/${created!.id}`)).status).toBe('IN_PROGRESS');

      await page.getByRole('button', { name: `Done: ${taskTitle}` }).click();
      await expect(row).toContainText('Done');
      expect((await api('employee', 'GET', `/api/work-items/${created!.id}`)).status).toBe('DONE');
    });

    test('direct navigation to the team screens never shows another person', async () => {
      const review = await open('employee', '/work/contributions/review');
      await expect(review.getByText(/do not have access/i)).toBeVisible();
      await expect(review.getByRole('button', { name: /^Verify:/ })).toHaveCount(0);

      const team = await open('employee', '/work/daily-updates');
      // Either the access-denied state or an own-scope list: never a colleague.
      const denied = await team.getByText(/do not have access/i).count();
      if (denied === 0) {
        await expect(team.getByRole('heading', { name: /team updates/i }).first()).toBeVisible();
        await expect(team.getByText(/Demo Manager|Demo HR|Demo CEO/)).toHaveCount(0);
      }
      // The API is the authority: the employee's list holds only their own updates.
      const mine = await api(
        'employee',
        'GET',
        `/api/daily-updates?from=${ymd(-28)}&to=${ymd(0)}&take=100`,
      );
      for (const update of mine.items as Array<{ employeeId?: string }>) {
        if (update.employeeId) expect(update.employeeId).toBe(employeeIds.employee);
      }
      const reviewApi = await apiRaw(
        'employee',
        'GET',
        '/api/contributions?verification=UNVERIFIED&take=100',
      );
      if (reviewApi.status === 200) {
        for (const entry of reviewApi.body.items as Array<{ employeeId: string }>) {
          expect(entry.employeeId).toBe(employeeIds.employee);
        }
      }
    });

    test('records time, quantity and occurrence; the tiles move; quantity is never minutes', async () => {
      const page = await open('employee', '/work/contributions');
      await expect(page.getByRole('heading', { name: 'My evidence' }).first()).toBeVisible();

      const unit = `pages${RUN}`;
      const end = new Date(Date.now() - 40 * 60_000);
      const start = new Date(end.getTime() - 90 * 60_000);
      const tile = (name: string) => page.getByRole('group', { name, exact: true });
      const tileText = async (name: string) => ((await tile(name).textContent()) ?? '').trim();

      const occurrencesBefore = Number((await tile('Occurrences').locator('p').nth(1).textContent())?.replace(/\D/g, '') ?? '0');
      const toMinutes = (text: string | null) => {
        const m = /(?:(\d+)h)?\s*(?:(\d+)m)?/.exec((text ?? '').trim());
        return Number(m?.[1] ?? 0) * 60 + Number(m?.[2] ?? 0);
      };
      const unverifiedBefore = toMinutes(await tile('Unverified time').locator('p').nth(1).textContent());
      const formatted = (minutes: number) => {
        const h = Math.floor(minutes / 60);
        const r = minutes % 60;
        return h === 0 ? `${r}m` : r === 0 ? `${h}h` : `${h}h ${r}m`;
      };

      // 1. time spent: 90 minutes
      await page.getByRole('button', { name: 'Record entry' }).first().click();
      let dialog = page.getByRole('dialog');
      await choose(page, dialog, 'Measure', 'Time spent');
      await field(dialog, 'Start date').fill(ymd(0, start));
      await field(dialog, 'Start time').fill(hm(start));
      await field(dialog, 'End date').fill(ymd(0, end));
      await field(dialog, 'End time').fill(hm(end));
      await field(dialog, 'Note').fill(`e2e ${RUN} interval`);
      await dialog.getByRole('button', { name: 'Record entry' }).click();
      await expect(dialog).toBeHidden();
      await expect(tile('Unverified time').locator('p').nth(1)).toHaveText(formatted(unverifiedBefore + 90));

      // 2. quantity 12.5 in its own unit
      await page.getByRole('button', { name: 'Record entry' }).first().click();
      dialog = page.getByRole('dialog');
      await choose(page, dialog, 'Measure', 'Quantity');
      await field(dialog, 'Occurred date').fill(ymd(0, end));
      await field(dialog, 'Occurred time').fill(hm(end));
      await field(dialog, 'Quantity').fill('12.5');
      await field(dialog, 'Unit').fill(unit);
      await field(dialog, 'Note').fill(`e2e ${RUN} quantity`);
      await dialog.getByRole('button', { name: 'Record entry' }).click();
      await expect(dialog).toBeHidden();
      const quantityTile = tile(`Quantity: ${unit}`);
      await expect(quantityTile).toBeVisible();
      await expect(quantityTile).toContainText('0 verified');
      await expect(quantityTile).toContainText('Unverified 12.5');
      // Never minutes: the time tile is unchanged by the quantity.
      await expect(tile('Unverified time').locator('p').nth(1)).toHaveText(formatted(unverifiedBefore + 90));
      expect(await tileText('Unverified time')).not.toContain('12.5');

      // 3. occurrence
      await page.getByRole('button', { name: 'Record entry' }).first().click();
      dialog = page.getByRole('dialog');
      await choose(page, dialog, 'Measure', 'Occurrence');
      await field(dialog, 'Occurred date').fill(ymd(0, end));
      await field(dialog, 'Occurred time').fill(hm(end));
      await field(dialog, 'Note').fill(`e2e ${RUN} occurrence`);
      await dialog.getByRole('button', { name: 'Record entry' }).click();
      await expect(dialog).toBeHidden();
      await expect(tile('Occurrences')).toContainText(String(occurrencesBefore + 1));

      // API outcome: three entries, each with its own measure, quantity not in minutes.
      const entries = await api(
        'employee',
        'GET',
        `/api/contributions?take=100`,
      );
      const mine = (entries.items as Array<{ note: string | null; measure: string; quantity: string | null; unitKey: string | null; verification: string; id: string }>).filter(
        (e) => e.note?.startsWith(`e2e ${RUN}`),
      );
      expect(mine.map((e) => e.measure).sort()).toEqual(['INTERVAL', 'OCCURRENCE', 'QUANTITY']);
      const q = mine.find((e) => e.measure === 'QUANTITY')!;
      expect(Number(q.quantity)).toBe(12.5);
      expect(q.unitKey).toBe(unit);
      expect(mine.every((e) => e.verification === 'UNVERIFIED')).toBe(true);
      const summary = await api(
        'employee',
        'GET',
        `/api/contributions/summary?from=${encodeURIComponent(new Date(Date.now() - 8 * 86_400_000).toISOString())}&to=${encodeURIComponent(new Date(Date.now() + 86_400_000).toISOString())}`,
      );
      expect(
        (summary.quantities as Array<{ unitKey: string }>).some((x) => x.unitKey === unit),
        'quantity is summarised under its unit',
      ).toBe(true);
      for (const e of mine) {
        cleanups.push({ what: 'withdraw entry', run: () => withdrawQuietly('employee', e.id) });
      }
    });

    test('refuses bad entries with the message visible', async () => {
      const page = await open('employee', '/work/contributions');
      const end = new Date(Date.now() - 40 * 60_000);
      const dialogOf = async () => {
        await page.getByRole('button', { name: 'Record entry' }).first().click();
        return page.getByRole('dialog');
      };
      const close = async (dialog: Locator) => {
        await dialog.getByRole('button', { name: 'Cancel' }).click();
        await expect(dialog).toBeHidden();
      };

      // end before start
      let dialog = await dialogOf();
      await choose(page, dialog, 'Measure', 'Time spent');
      await field(dialog, 'Start date').fill(ymd(0, end));
      await field(dialog, 'Start time').fill('10:00');
      await field(dialog, 'End date').fill(ymd(0, end));
      await field(dialog, 'End time').fill('09:00');
      await dialog.getByRole('button', { name: 'Record entry' }).click();
      await expect(dialog.getByRole('alert')).toContainText('The end must be after the start.');
      await close(dialog);

      // quantity 0 (the form accepts a number; the API is the authority on "positive")
      dialog = await dialogOf();
      await choose(page, dialog, 'Measure', 'Quantity');
      await field(dialog, 'Occurred date').fill(ymd(0, end));
      await field(dialog, 'Occurred time').fill(hm(end));
      await field(dialog, 'Quantity').fill('0');
      await field(dialog, 'Unit').fill(`zero${RUN}`);
      await dialog.getByRole('button', { name: 'Record entry' }).click();
      const zeroMessage = await alertText(dialog);
      expect(zeroMessage.length).toBeGreaterThan(3);
      test.info().annotations.push({ type: 'quantity-0-message', description: zeroMessage });
      const listed = await api('employee', 'GET', '/api/contributions?take=100');
      expect(
        (listed.items as Array<{ unitKey: string | null }>).some((e) => e.unitKey === `zero${RUN}`),
        'a zero quantity is not stored',
      ).toBe(false);
      await close(dialog);

      // missing unit
      dialog = await dialogOf();
      await choose(page, dialog, 'Measure', 'Quantity');
      await field(dialog, 'Occurred date').fill(ymd(0, end));
      await field(dialog, 'Occurred time').fill(hm(end));
      await field(dialog, 'Quantity').fill('3');
      await dialog.getByRole('button', { name: 'Record entry' }).click();
      await expect(dialog.getByRole('alert')).toContainText(/unit/i);
      await close(dialog);

      // older than 7 days without a note
      dialog = await dialogOf();
      await choose(page, dialog, 'Measure', 'Occurrence');
      await field(dialog, 'Occurred date').fill(ymd(-10));
      await field(dialog, 'Occurred time').fill('09:00');
      await dialog.getByRole('button', { name: 'Record entry' }).click();
      await expect(dialog.getByRole('alert')).toContainText(
        'Entries older than 7 days need a note',
      );
      await close(dialog);
    });

    test('corrects an entry (reason required) and withdraws another', async () => {
      const page = await open('employee', '/work/contributions');
      await search(page, 'Search evidence', `e2e ${RUN} quantity`);
      let row = onlyRow(page);
      await expect(row).toHaveCount(1);
      await row.getByRole('button', { name: /^Correct:/ }).click();

      const dialog = page.getByRole('dialog');
      await field(dialog, 'Quantity').fill('15');
      await dialog.getByRole('button', { name: 'Save correction' }).click();
      await expect(dialog.getByRole('alert')).toContainText(/reason of at least/i);
      await field(dialog, 'Reason for the correction').fill(`miscounted pages ${RUN}`);
      await dialog.getByRole('button', { name: 'Save correction' }).click();
      await expect(dialog).toBeHidden();

      // The live row now shows the corrected amount; its history lists two revisions.
      row = onlyRow(page);
      await expect(row).toHaveCount(1);
      await expect(row).toContainText(`15 pages${RUN}`);
      await row.getByRole('button', { name: /^History:/ }).click();
      const history = page.getByRole('dialog');
      const revisions = history.getByRole('list', { name: 'Revisions' }).getByRole('listitem');
      await expect(revisions).toHaveCount(2);
      await expect(revisions.nth(0)).toContainText('Revision 1');
      await expect(revisions.nth(1)).toContainText('Revision 2');
      await history.getByRole('button', { name: 'Close' }).click();

      const all = await api('employee', 'GET', '/api/contributions?take=100');
      const live = (all.items as Array<{ note: string | null; quantity: string | null; revision: number; state: string }>).filter(
        (e) => e.note === `e2e ${RUN} quantity`,
      );
      expect(live.length).toBe(1);
      expect(Number(live[0].quantity)).toBe(15);
      expect(live[0].revision).toBe(2);

      // withdraw the occurrence
      await search(page, 'Search evidence', `e2e ${RUN} occurrence`);
      row = onlyRow(page);
      await expect(row).toHaveCount(1);
      await row.getByRole('button', { name: /^Withdraw:/ }).click();
      const wd = page.getByRole('dialog');
      await wd.getByRole('button', { name: 'Withdraw entry' }).click();
      await expect(wd.getByRole('alert')).toContainText(/reason of at least/i);
      await field(wd, 'Reason for withdrawing').fill(`entered by mistake ${RUN}`);
      await wd.getByRole('button', { name: 'Withdraw entry' }).click();
      await expect(wd).toBeHidden();
      await expect(onlyRow(page)).toHaveCount(0);
      const after = await api('employee', 'GET', '/api/contributions?take=100');
      expect(
        (after.items as Array<{ note: string | null; state: string }>).filter(
          (e) => e.note === `e2e ${RUN} occurrence` && e.state === 'ACTIVE',
        ),
        'no live occurrence remains',
      ).toHaveLength(0);
    });

    test('daily update: a draft from records, edit, add lines, submit, correct', async () => {
      const date = await freeUpdateDate(usedUpdateDates);
      // Evidence on that date so the draft has something to name.
      const at = new Date(`${date}T09:30:00`);
      const entry = await api('employee', 'POST', '/api/contributions', {
        workKind: 'TASK',
        measure: 'OCCURRENCE',
        occurredAt: at.toISOString(),
        timezone: 'UTC',
        note: `e2e ${RUN} past evidence`,
        clientRequestId: `e2e-${uuid()}`.slice(0, 64),
      });
      cleanups.push({ what: 'withdraw entry', run: () => withdrawQuietly('employee', entry.id) });

      const page = await open('employee', '/work/daily-update');
      await expect(page.getByRole('heading', { name: 'Daily update' }).first()).toBeVisible();
      await field(page, 'Update date').fill(date);

      await expect(page.getByText('Draft', { exact: true }).first()).toBeVisible();
      await expect(page.getByText('From your records').first()).toBeVisible();

      // edit the first drafted line
      let editedSection: Locator | null = null;
      for (const input of await page.getByRole('textbox', { name: /line \d+$/ }).all()) {
        if ((await input.inputValue()).length > 0) {
          editedSection = input;
          break;
        }
      }
      expect(editedSection, 'a drafted line exists to edit').not.toBeNull();
      await editedSection!.fill(`Edited drafted line ${RUN}`);

      await page.getByRole('button', { name: 'Add Unplanned work line' }).click();
      await field(page, 'Unplanned work line 1').fill(`Unplanned thing ${RUN}`);
      await page.getByRole('button', { name: 'Add Blockers line' }).click();
      await field(page, 'Blockers line 1').fill(`Blocked on access ${RUN}`);
      await field(page, 'Summary of the day').fill(`Summary ${RUN}`);

      await page.getByRole('button', { name: 'Save draft' }).click();
      await expect(page.getByText('Draft saved.')).toBeVisible();

      await page.getByRole('button', { name: 'Submit update' }).click();
      await expect(page.getByText('Update submitted.')).toBeVisible();
      await expect(page.getByText('Submitted', { exact: true }).first()).toBeVisible();

      const listed = await api(
        'employee',
        'GET',
        `/api/daily-updates?from=${date}&to=${date}&take=10`,
      );
      expect(listed.items).toHaveLength(1);
      const id: string = listed.items[0].id;
      const submitted = await api('employee', 'GET', `/api/daily-updates/${id}`);
      expect(submitted.status).toBe('SUBMITTED');
      const texts = (submitted.items as Array<{ section: string; text: string }>).map((i) => `${i.section}:${i.text}`);
      expect(texts).toContain(`UNPLANNED:Unplanned thing ${RUN}`);
      expect(texts).toContain(`BLOCKER:Blocked on access ${RUN}`);
      expect(
        (submitted.items as Array<{ contributionEntryId?: string | null; workItemId?: string | null }>).some(
          (i) => i.contributionEntryId || i.workItemId,
        ),
        'the evidence-backed line kept its link to the record',
      ).toBe(true);
      const versionBefore: number = submitted.version;

      // correct after submission: status stays submitted, version rises
      await field(page, 'Unplanned work line 1').fill(`Unplanned thing corrected ${RUN}`);
      await expect(page.getByRole('button', { name: 'Submit update' })).toHaveCount(0);
      await page.getByRole('button', { name: 'Save correction' }).click();
      await expect(page.getByText('Correction saved. Review starts again.')).toBeVisible();
      await expect(page.getByText('Submitted', { exact: true }).first()).toBeVisible();
      await expect(page.getByText(`Version ${versionBefore + 1}`)).toBeVisible();

      const corrected = await api('employee', 'GET', `/api/daily-updates/${id}`);
      expect(corrected.status).toBe('SUBMITTED');
      expect(corrected.version).toBe(versionBefore + 1);
      expect(
        (corrected.items as Array<{ text: string }>).some(
          (i) => i.text === `Unplanned thing corrected ${RUN}`,
        ),
      ).toBe(true);
    });
  });

  /* ======================================================= 2. MANAGER ===== */

  test.describe('2 manager', () => {
    test.describe.configure({ mode: 'serial' });

    test('acknowledges the employee update, cannot acknowledge their own', async () => {
      const employeeDate = await freeUpdateDate(usedUpdateDates);
      const submitted = await submitUpdateViaApi('employee', employeeDate, `Employee did a thing ${RUN}`);
      expect(submitted.status).toBe('SUBMITTED');

      const page = await open('manager', '/work/daily-updates');
      await expect(page.getByRole('heading', { name: /team updates/i }).first()).toBeVisible();
      await field(page, 'From').fill(employeeDate);
      await field(page, 'To').fill(employeeDate);
      const ack = page.getByRole('button', {
        name: new RegExp(`^Acknowledge update: .*Employee.* ${employeeDate}`),
      });
      await expect(ack).toBeVisible();
      await ack.click();
      await expect(ack).toHaveCount(0);
      await expect(page.getByRole('row').filter({ hasText: 'Demo Employee' })).toContainText('Acknowledged');
      const after = await api('manager', 'GET', `/api/daily-updates/${submitted.id}`);
      expect(after.status).toBe('ACKNOWLEDGED');

      // the manager's own update cannot be acknowledged by the manager
      const ownDate = await freeUpdateDate(usedUpdateDates);
      // freeUpdateDate checks the employee; the manager's own dates are independent
      const own = await submitUpdateViaApi('manager', ownDate, `Manager did a thing ${RUN}`);
      await field(page, 'From').fill(ownDate);
      await field(page, 'To').fill(ownDate);
      const ownAck = page.getByRole('button', {
        name: new RegExp(`^Acknowledge update: .*Manager.* ${ownDate}`),
      });
      await expect(ownAck).toBeVisible();
      await ownAck.click();
      const message = await alertText(page);
      expect(message.length).toBeGreaterThan(3);
      test.info().annotations.push({ type: 'self-ack-refusal', description: message });
      expect((await api('manager', 'GET', `/api/daily-updates/${own.id}`)).status).toBe('SUBMITTED');
    });

    test('reviews unverified evidence: verify one, reject one with a required note', async () => {
      const verifyNote = `e2e ${RUN} to verify`;
      const rejectNote = `e2e ${RUN} to reject`;
      const a = await recordOccurrence('employee', verifyNote, new Date(Date.now() - 31 * 60_000));
      const b = await recordOccurrence('employee', rejectNote, new Date(Date.now() - 32 * 60_000));
      cleanups.push({ what: 'withdraw', run: () => withdrawQuietly('employee', a.id) });
      cleanups.push({ what: 'withdraw', run: () => withdrawQuietly('employee', b.id) });

      const page = await open('manager', '/work/contributions/review');
      await expect(page.getByRole('heading', { name: 'Evidence review' }).first()).toBeVisible();
      await search(page, 'Search evidence', verifyNote);
      const rowA = onlyRow(page);
      await expect(rowA).toHaveCount(1);
      await rowA.getByRole('button', { name: /^Verify:/ }).click();
      await expect(onlyRow(page)).toHaveCount(0);
      expect((await api('manager', 'GET', `/api/contributions/${a.id}`)).verification).toBe('VERIFIED');

      await search(page, 'Search evidence', rejectNote);
      const rowB = onlyRow(page);
      await expect(rowB).toHaveCount(1);
      await rowB.getByRole('button', { name: /^Reject:/ }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Reject entry' }).click();
      await expect(dialog.getByRole('alert')).toContainText(/Add a note saying why/i);
      expect((await api('manager', 'GET', `/api/contributions/${b.id}`)).verification).toBe('UNVERIFIED');
      await field(dialog, 'Review note').fill(`not what was agreed ${RUN}`);
      await dialog.getByRole('button', { name: 'Reject entry' }).click();
      await expect(dialog).toBeHidden();
      await expect(onlyRow(page)).toHaveCount(0);
      const rejected = await api('manager', 'GET', `/api/contributions/${b.id}`);
      expect(rejected.verification).toBe('REJECTED');
      expect(rejected.reviewNote).toContain(`not what was agreed ${RUN}`);

      // verified evidence reaches the employee's own summary as verified
      const mine = await api('employee', 'GET', `/api/contributions/${a.id}`);
      expect(mine.verification).toBe('VERIFIED');
    });

    test('lists who is missing an update on a date', async () => {
      const missingDate = await freeUpdateDate(usedUpdateDates); // the employee has none that day
      const page = await open('manager', '/work/daily-updates');
      await field(page, 'Date to check').fill(missingDate);
      await page.getByRole('button', { name: 'Check missing' }).click();
      const list = page.getByRole('list', { name: 'People missing an update' });
      await expect(list).toBeVisible();
      await expect(list).toContainText('Employee');
      const apiMissing = await api('manager', 'GET', `/api/daily-updates/missing?date=${missingDate}`);
      expect(apiMissing.due).toBe(true);
      expect(
        (apiMissing.people as Array<{ name: string }>).some((p) => /Employee/.test(p.name)),
      ).toBe(true);

      // a date the employee did report is not listed against them
      const reported = await freeUpdateDate(usedUpdateDates);
      await submitUpdateViaApi('employee', reported, `reported ${RUN}`);
      await field(page, 'Date to check').fill(reported);
      await page.getByRole('button', { name: 'Check missing' }).click();
      await expect
        .poll(async () => {
          const names = await page.getByRole('list', { name: 'People missing an update' }).allTextContents();
          return names.join(' ');
        })
        .not.toMatch(/Demo Employee/);
    });

    /*
     * The same outcomes as the UI journey below, asserted on the API alone. It
     * always runs: the UI journey needs the Projects entitlement on the tenant's
     * plan and skips where the plan wall stands, and the numbers it asserts
     * (effort totals, cycle refusal, workload) must not go unchecked with it.
     */
    test('project work API outcomes: transitions, milestone, contributors, dependencies, workload', async () => {
      test.setTimeout(120_000);
      const project = await api('manager', 'POST', '/api/projects', {
        name: `E2E api project ${RUN}`,
        code: `E2A-${RUN}`.toUpperCase().slice(0, 20),
        projectManagerEmployeeId: employeeIds.manager,
        businessUnitId: await visibleBusinessUnitId(),
      });
      const projectId: string = project.id;
      cleanups.push({
        what: 'delete project',
        run: () => apiRaw('manager', 'DELETE', `/api/projects/${projectId}`),
      });
      const make = (kind: string, title: string) =>
        api('manager', 'POST', '/api/work-items', { kind, title, projectId });
      const milestone = await make('MILESTONE', `API milestone ${RUN}`);
      const a = await make('TASK', `API A ${RUN}`);
      const b = await make('TASK', `API B ${RUN}`);
      const c = await make('TASK', `API C ${RUN}`);

      // lifecycle: OPEN -> DONE is not a legal move, the API says so
      const illegal = await apiRaw('manager', 'POST', `/api/work-items/${a.id}/transition`, { to: 'DONE' });
      expect(illegal.status, JSON.stringify(illegal.body)).toBeGreaterThanOrEqual(400);
      expect(illegal.status).toBeLessThan(500);
      await api('manager', 'POST', `/api/work-items/${a.id}/transition`, { to: 'IN_PROGRESS' });
      await api('manager', 'POST', `/api/work-items/${a.id}/transition`, { to: 'IN_REVIEW' });
      expect((await api('manager', 'GET', `/api/work-items/${a.id}`)).status).toBe('IN_REVIEW');

      // milestone assignment
      await api('manager', 'POST', `/api/work-items/${c.id}/milestone`, { milestoneId: milestone.id });
      expect((await api('manager', 'GET', `/api/work-items/${c.id}`)).milestoneId).toBe(milestone.id);

      // two contributors on one task: totals are the sums, never doubled
      await api('manager', 'PUT', `/api/work-items/${a.id}/contributors/${employeeIds.employee}`, {
        estimateMinutes: 120,
        actualMinutes: 45,
      });
      await api('manager', 'PUT', `/api/work-items/${a.id}/contributors/${employeeIds.manager}`, {
        estimateMinutes: 60,
        actualMinutes: 30,
      });
      const progress = await api('manager', 'GET', `/api/work-items/progress?projectId=${projectId}`);
      expect(progress.effort.estimateMinutes).toBe(180);
      expect(progress.effort.actualMinutes).toBe(75);
      expect(progress.effort.contributors).toBe(2);
      // an update replaces a person's figures; it does not add to them
      await api('manager', 'PUT', `/api/work-items/${a.id}/contributors/${employeeIds.employee}`, {
        estimateMinutes: 120,
        actualMinutes: 45,
      });
      const again = await api('manager', 'GET', `/api/work-items/progress?projectId=${projectId}`);
      expect(again.effort.estimateMinutes).toBe(180);

      // dependencies: B after A is fine, closing the loop is refused with a message
      await api('manager', 'POST', `/api/work-items/${b.id}/dependencies`, { dependsOnId: a.id });
      const loop = await apiRaw('manager', 'POST', `/api/work-items/${a.id}/dependencies`, { dependsOnId: b.id });
      expect(loop.status, JSON.stringify(loop.body)).toBeGreaterThanOrEqual(400);
      expect(loop.status).toBeLessThan(500);
      test.info().annotations.push({ type: 'cycle-refusal-api', description: JSON.stringify(loop.body).slice(0, 200) });
      expect((await api('manager', 'GET', `/api/work-items/${a.id}`)).dependsOn).toHaveLength(0);

      // workload counts contributors, and a contributor with no estimate is listed
      // apart from committed minutes (remaining = estimate - actual: 120 - 45)
      await api('manager', 'POST', `/api/work-items/${c.id}/reassign`, { ownerEmployeeId: employeeIds.employee });
      await api('manager', 'PUT', `/api/work-items/${c.id}/contributors/${employeeIds.employee}`, {});
      const workload = await api(
        'manager',
        'GET',
        `/api/work-items/workload?from=${ymd(0)}&to=${ymd(27)}&projectId=${projectId}`,
      );
      const emp = (workload.people as Array<{ employeeId: string; unestimatedItems: number; committedMinutes: number }>).find(
        (p) => p.employeeId === employeeIds.employee,
      );
      expect(emp, 'the employee appears in the workload').toBeTruthy();
      expect(emp!.unestimatedItems).toBeGreaterThanOrEqual(1);
      expect(emp!.committedMinutes).toBe(75);
    });

    test('project work: milestone, tasks, board, milestone assignment, contributors, dependencies, workload', async () => {
      test.setTimeout(240_000);
      const project = await api('manager', 'POST', '/api/projects', {
        name: `E2E project ${RUN}`,
        code: `E2E-${RUN}`.toUpperCase().slice(0, 20),
        projectManagerEmployeeId: employeeIds.manager,
        businessUnitId: await visibleBusinessUnitId(),
        description: 'Created by the Flow R journeys',
      });
      expect(project.id).toBeTruthy();
      const projectId: string = project.id;
      cleanups.push({
        what: 'delete project',
        run: () => apiRaw('manager', 'DELETE', `/api/projects/${projectId}`),
      });

      const page = await open('manager', `/projects/${projectId}`);
      await skipUnlessProjectsOnPlan(page);
      await expect(page.getByRole('radiogroup', { name: 'Work view' })).toBeVisible();

      const milestoneTitle = `Milestone ${RUN}`;
      const taskA = `Task A ${RUN}`;
      const taskB = `Task B ${RUN}`;
      const taskC = `Task C ${RUN}`;

      // milestone
      await page.getByRole('button', { name: 'New milestone' }).first().click();
      let dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Create milestone' }).click();
      await expect(dialog.getByRole('alert')).toContainText(/title/i);
      await field(dialog, 'Title').fill(milestoneTitle);
      await field(dialog, 'Due date').fill(ymd(14));
      await dialog.getByRole('button', { name: 'Create milestone' }).click();
      await expect(dialog).toBeHidden();

      // three tasks
      for (const title of [taskA, taskB, taskC]) {
        await page.getByRole('button', { name: 'New task' }).first().click();
        dialog = page.getByRole('dialog');
        await field(dialog, 'Title').fill(title);
        await dialog.getByRole('button', { name: 'Create task' }).click();
        await expect(dialog).toBeHidden();
        await expect(page.getByRole('button', { name: `Open ${title}` })).toBeVisible();
      }

      const items = await api('manager', 'GET', `/api/work-items?projectId=${projectId}&take=100`);
      const byTitle = new Map<string, { id: string; status: string; milestoneId?: string | null; kind: string }>(
        (items.items as Array<{ id: string; title: string; status: string; kind: string; milestoneId?: string | null }>).map((i) => [i.title, i]),
      );
      expect(byTitle.get(taskA)?.status).toBe('OPEN');
      const milestoneId = byTitle.get(milestoneTitle)?.id;
      expect(milestoneId, 'the milestone is a work item of kind MILESTONE').toBeTruthy();
      expect(byTitle.get(milestoneTitle)?.kind).toBe('MILESTONE');

      // board: move a card across columns with the transition buttons
      const column = (name: string) => page.getByRole('region', { name: `${name} column` });
      await expect(column('Open')).toContainText(taskA);
      await page.getByRole('button', { name: `Start: ${taskA}` }).click();
      await expect(column('In progress')).toContainText(taskA);
      await expect(column('Open')).not.toContainText(taskA);
      await page.getByRole('button', { name: `Send to review: ${taskA}` }).click();
      await expect(column('In review')).toContainText(taskA);
      expect((await api('manager', 'GET', `/api/work-items/${byTitle.get(taskA)!.id}`)).status).toBe('IN_REVIEW');

      // an invalid move is refused with the API's message: the card on screen is
      // stale (the item was finished elsewhere), so "Start" is no longer lawful.
      await api('manager', 'POST', `/api/work-items/${byTitle.get(taskB)!.id}/transition`, { to: 'CANCELLED' });
      await page.getByRole('button', { name: `Start: ${taskB}` }).click();
      const refusal = await alertText(page);
      expect(refusal.length).toBeGreaterThan(3);
      test.info().annotations.push({ type: 'invalid-move-refusal', description: refusal });
      expect((await api('manager', 'GET', `/api/work-items/${byTitle.get(taskB)!.id}`)).status).toBe('CANCELLED');
      // put B back on the board for the dependency steps
      await api('manager', 'POST', `/api/work-items/${byTitle.get(taskB)!.id}/transition`, { to: 'OPEN' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('button', { name: `Open ${taskB}` })).toBeVisible();

      // assign task C to the milestone through the detail panel
      await page.getByRole('button', { name: `Open ${taskC}` }).click();
      let detail = page.getByRole('dialog');
      await expect(detail.getByRole('heading', { name: 'Milestone' })).toBeVisible();
      await choose(page, detail.getByRole('region', { name: 'Milestone' }), 'Milestone', milestoneTitle);
      await detail.getByRole('button', { name: 'Apply milestone' }).click();
      await expect
        .poll(async () => (await api('manager', 'GET', `/api/work-items/${byTitle.get(taskC)!.id}`)).milestoneId)
        .toBe(milestoneId);
      await detail.getByRole('button', { name: 'Close' }).click();

      // contributors: two people on one task, individual estimates and actuals
      await page.getByRole('button', { name: `Open ${taskA}` }).click();
      detail = page.getByRole('dialog');
      const contributors = detail.getByRole('region', { name: 'Contributors' });
      const addContributor = async (nameMatch: RegExp, estimate: string, actual: string) => {
        await contributors.getByRole('combobox', { name: /^Contributor/ }).click();
        await page.getByRole('option', { name: nameMatch }).first().click();
        await field(contributors, 'New contributor estimate minutes').fill(estimate);
        await field(contributors, 'New contributor actual minutes').fill(actual);
        await contributors.getByRole('button', { name: 'Add contributor' }).click();
      };
      await addContributor(/Demo Employee/, '120', '45');
      await expect(contributors.getByText(/Estimate minutes for Demo Employee/)).toBeVisible();
      // The people list is the manager's reach and does not offer the manager
      // themselves, so the second contributor goes in through the API and the
      // panel must then show both rows.
      await api('manager', 'PUT', `/api/work-items/${byTitle.get(taskA)!.id}/contributors/${employeeIds.manager}`, {
        estimateMinutes: 60,
        actualMinutes: 30,
      });
      await detail.getByRole('button', { name: 'Close' }).click();
      await page.getByRole('button', { name: `Open ${taskA}` }).click();
      detail = page.getByRole('dialog');
      await expect(detail.getByRole('region', { name: 'Contributors' }).getByText(/Estimate minutes for/)).toHaveCount(2);
      const withContributors = await api('manager', 'GET', `/api/work-items/${byTitle.get(taskA)!.id}`);
      expect(withContributors.contributors).toHaveLength(2);

      const progress = await api('manager', 'GET', `/api/work-items/progress?projectId=${projectId}`);
      // 120 + 60 and 45 + 30, each counted once.
      expect(progress.effort.estimateMinutes).toBe(180);
      expect(progress.effort.actualMinutes).toBe(75);
      expect(progress.effort.contributors).toBe(2);

      // dependencies: B depends on A, then closing the loop is refused
      await detail.getByRole('button', { name: 'Close' }).click();
      await page.getByRole('button', { name: `Open ${taskB}` }).click();
      detail = page.getByRole('dialog');
      const deps = detail.getByRole('region', { name: 'Dependencies' });
      await deps.getByRole('combobox', { name: /^Depends on/ }).click();
      await page.getByRole('option', { name: taskA }).click();
      await deps.getByRole('button', { name: 'Add dependency' }).click();
      await expect(deps.getByText(taskA)).toBeVisible();
      await detail.getByRole('button', { name: 'Close' }).click();

      await page.getByRole('button', { name: `Open ${taskA}` }).click();
      detail = page.getByRole('dialog');
      const depsA = detail.getByRole('region', { name: 'Dependencies' });
      await depsA.getByRole('combobox', { name: /^Depends on/ }).click();
      await page.getByRole('option', { name: taskB }).click();
      await depsA.getByRole('button', { name: 'Add dependency' }).click();
      const cycle = await alertText(detail);
      expect(cycle.length).toBeGreaterThan(3);
      test.info().annotations.push({ type: 'cycle-refusal', description: cycle });
      const aDetail = await api('manager', 'GET', `/api/work-items/${byTitle.get(taskA)!.id}`);
      expect((aDetail.dependsOn as unknown[]).length).toBe(0);
      await detail.getByRole('button', { name: 'Close' }).click();

      // give task C an owner and no estimate, then read the workload
      await page.getByRole('button', { name: `Open ${taskC}` }).click();
      detail = page.getByRole('dialog');
      await choose(page, detail.getByRole('region', { name: 'Owner' }), 'New owner', /Demo Employee/);
      await detail.getByRole('button', { name: 'Reassign owner' }).click();
      await expect
        .poll(async () => (await api('manager', 'GET', `/api/work-items/${byTitle.get(taskC)!.id}`)).ownerEmployeeId)
        .toBe(employeeIds.employee);
      const cContributors = detail.getByRole('region', { name: 'Contributors' });
      await cContributors.getByRole('combobox', { name: /^Contributor/ }).click();
      await page.getByRole('option', { name: /Demo Employee/ }).first().click();
      // the form needs one figure; an actual with no estimate is the unestimated case
      await field(cContributors, 'New contributor actual minutes').fill('10');
      await cContributors.getByRole('button', { name: 'Add contributor' }).click();
      await expect(cContributors.getByText(/Estimate minutes for Demo Employee/)).toBeVisible();
      await detail.getByRole('button', { name: 'Close' }).click();

      // milestones view: progress bar with its figure as text
      await page.getByRole('radio', { name: 'Milestones' }).click();
      const milestones = page.getByRole('list', { name: 'Milestones' });
      await expect(milestones).toContainText(milestoneTitle);
      await expect(milestones.getByRole('progressbar', { name: `Progress of ${milestoneTitle}` })).toBeVisible();
      await expect(milestones).toContainText(/\d+ of \d+ tasks done/);

      await page.getByRole('radio', { name: 'Workload' }).click();
      await expect(page.getByText(/standard week/i)).toBeVisible();
      await expect(page.getByText(/counted separately, never as zero/i)).toBeVisible();
      await page.getByRole('button', { name: 'Show workload' }).click();
      await expect(page.getByText(/Capacity for the period/)).toBeVisible();
      await expect(page.getByRole('columnheader', { name: /Unestimated items/ })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: /Committed/ })).toBeVisible();
      const workload = await api(
        'manager',
        'GET',
        `/api/work-items/workload?from=${ymd(0)}&to=${ymd(27)}&projectId=${projectId}`,
      );
      const emp = (workload.people as Array<{ employeeId: string; name: string; unestimatedItems: number; committedMinutes: number }>).find(
        (p) => p.employeeId === employeeIds.employee,
      );
      expect(emp, 'the employee is in the workload').toBeTruthy();
      expect(emp!.unestimatedItems, 'the unestimated task is listed apart').toBeGreaterThanOrEqual(1);
      const empRow = page.getByRole('row').filter({ hasText: emp!.name });
      await expect(empRow).toContainText(String(emp!.unestimatedItems));
      // remaining = estimate - actual (120 - 45): a missing estimate adds nothing
      expect(emp!.committedMinutes).toBe(75);
      await expect(empRow).toContainText('1h 15m');
      await expect(page.getByRole('radio', { name: 'Board' })).toBeVisible();
    });
  });

  /* ===================================================== 3. HR / ADMIN === */

  test.describe('3 hr and admin', () => {
    test.describe.configure({ mode: 'serial' });

    test('daily update policy persists across reload; an invalid time zone is refused', async () => {
      await api('hr', 'PUT', '/api/daily-updates/policy', {
        ...PERMISSIVE_POLICY,
        enabled: false,
        requireAcknowledgement: false,
        deadlineMinutes: 600,
        workingDays: [1, 2, 3, 4, 5],
      });
      const page = await open('hr', '/settings/daily-updates');
      const enabled = page.getByRole('checkbox', { name: 'Daily updates enabled' });
      const requireAck = page.getByRole('checkbox', { name: 'Require acknowledgement' });
      await expect(enabled).not.toBeChecked();
      await enabled.check();
      await requireAck.check();
      await page.getByRole('checkbox', { name: 'Saturday' }).check();
      await field(page, 'Deadline').fill('17:30');
      await field(page, 'Time zone').fill('Asia/Karachi');
      await page.getByRole('button', { name: 'Save policy' }).click();
      await expect(page.getByText('Policy saved.')).toBeVisible();

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('checkbox', { name: 'Daily updates enabled' })).toBeChecked();
      await expect(page.getByRole('checkbox', { name: 'Require acknowledgement' })).toBeChecked();
      await expect(page.getByRole('checkbox', { name: 'Saturday' })).toBeChecked();
      await expect(page.getByRole('checkbox', { name: 'Sunday' })).not.toBeChecked();
      await expect(field(page, 'Deadline')).toHaveValue('17:30');
      await expect(field(page, 'Time zone')).toHaveValue('Asia/Karachi');
      const stored = await api('hr', 'GET', '/api/daily-updates/policy');
      expect(stored).toMatchObject({
        enabled: true,
        requireAcknowledgement: true,
        deadlineMinutes: 1050,
        timezone: 'Asia/Karachi',
      });
      expect(stored.workingDays).toEqual([1, 2, 3, 4, 5, 6]);

      // invalid time zone: refused, nothing changes
      await field(page, 'Time zone').fill('Not/AZone');
      await page.getByRole('button', { name: 'Save policy' }).click();
      const refusal = await alertText(page);
      expect(refusal.length).toBeGreaterThan(3);
      test.info().annotations.push({ type: 'bad-timezone-refusal', description: refusal });
      expect((await api('hr', 'GET', '/api/daily-updates/policy')).timezone).toBe('Asia/Karachi');

      // no working day at all is refused before any request
      await field(page, 'Time zone').fill('Asia/Karachi');
      for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']) {
        await page.getByRole('checkbox', { name: day }).uncheck();
      }
      await page.getByRole('button', { name: 'Save policy' }).click();
      await expect(page.getByRole('alert').first()).toContainText('Choose at least one working day.');

      await api('hr', 'PUT', '/api/daily-updates/policy', PERMISSIVE_POLICY);
    });

    test('creates a queue with SLAs and sees SLA pills on a queued item; claims it', async () => {
      const queueName = `E2E queue ${RUN}`;
      const itemTitle = `Queued item ${RUN}`;
      const page = await open('hr', '/work/queues');
      await expect(page.getByRole('heading', { name: /work queues/i }).first()).toBeVisible();

      await page.getByRole('button', { name: 'New queue' }).first().click();
      const dialog = page.getByRole('dialog');
      await field(dialog, 'Name').fill(queueName);
      await field(dialog, 'Response SLA (minutes)').fill('30');
      await field(dialog, 'Resolution SLA (minutes)').fill('120');
      await dialog.getByRole('button', { name: 'Create queue' }).click();
      await expect(dialog).toBeHidden();

      const queues = await api('hr', 'GET', '/api/work-queues');
      const queue = (queues as Array<{ id: string; name: string; responseSlaMinutes?: number | null; resolutionSlaMinutes?: number | null }>).find(
        (q) => q.name === queueName,
      );
      expect(queue, 'the queue is persisted').toBeTruthy();
      expect(queue!.responseSlaMinutes).toBe(30);
      expect(queue!.resolutionSlaMinutes).toBe(120);

      const item = await api('hr', 'POST', '/api/work-items', {
        kind: 'TASK',
        title: itemTitle,
        queueId: queue!.id,
      });
      cleanups.push({
        what: 'archive queued item',
        run: () => apiRaw('hr', 'POST', `/api/work-items/${item.id}/archive`),
      });

      await page.reload({ waitUntil: 'domcontentloaded' });
      await choose(page, page, 'Queue', queueName);
      const row = rowOf(page, itemTitle);
      await expect(row).toHaveCount(1);
      await expect(row).toContainText(/Response: (On track|At risk|Breached|Met)/);
      await expect(row).toContainText(/Resolution: (On track|At risk|Breached|Met)/);
      await expect(row).not.toContainText('No SLA');
      const stored = await api('hr', 'GET', `/api/work-items/${item.id}`);
      expect(stored.queueId).toBe(queue!.id);
      expect(stored.sla?.response).not.toBe('NONE');

      // unassigned filter keeps it; claiming moves it to the claimer
      await page.getByRole('checkbox', { name: 'Unassigned' }).check();
      await expect(rowOf(page, itemTitle)).toHaveCount(1);
      await page.getByRole('button', { name: `Claim: ${itemTitle}` }).click();
      await expect(rowOf(page, itemTitle)).toHaveCount(0);
      await page.getByRole('checkbox', { name: 'Unassigned' }).uncheck();
      await expect(rowOf(page, itemTitle)).toContainText('Demo HR');
      expect((await api('hr', 'GET', `/api/work-items/${item.id}`)).ownerEmployeeId).toBe(employeeIds.hr);
      await page.getByRole('button', { name: `Owner history: ${itemTitle}` }).click();
      await expect(page.getByRole('dialog')).toContainText(/to Demo HR/);
    });

    test('builds a workflow with FIXED and ROLE recipients and reloads it', async () => {
      const page = await open('ceo', '/settings/approvals/templates/workflow-templates/new');
      const name = `E2E workflow ${RUN}`;
      await field(page, 'Name').first().fill(name);

      const template = field(page, 'Email template');
      const options = await template.locator('option').allTextContents();
      test.skip(
        options.filter((o) => o.trim() && !/select a template/i.test(o)).length === 0,
        'no active email template exists in this tenant to attach to an action',
      );
      await template.selectOption({ index: 1 });

      const recipients = page.getByRole('group', { name: 'Recipients for action 1' });
      await expect(recipients).toBeVisible();
      await recipients.getByRole('combobox', { name: 'Recipient 1 of action 1' }).selectOption('FIXED');
      await page.getByLabel('Address for recipient 1 of action 1').fill(`ops-${RUN}@example.test`);
      await page.getByRole('button', { name: 'Add recipient to action 1' }).click();
      await recipients.getByRole('combobox', { name: 'Recipient 2 of action 1' }).selectOption('ROLE');
      await page.getByLabel('Role key for recipient 2 of action 1').fill('hr');

      await page.getByRole('button', { name: 'Create Workflow' }).click();
      await expect(page).toHaveURL(/workflow-templates\/[0-9a-f-]{36}/, { timeout: 30_000 });
      const id = page.url().match(/workflow-templates\/([0-9a-f-]{36})/)![1];
      cleanups.push({ what: 'delete workflow', run: () => apiRaw('ceo', 'DELETE', `/api/workflows/${id}`) });

      await page.reload({ waitUntil: 'domcontentloaded' });
      const reloaded = page.getByRole('group', { name: 'Recipients for action 1' });
      await expect(reloaded.getByRole('combobox', { name: 'Recipient 1 of action 1' })).toHaveValue('FIXED');
      await expect(page.getByLabel('Address for recipient 1 of action 1')).toHaveValue(`ops-${RUN}@example.test`);
      await expect(reloaded.getByRole('combobox', { name: 'Recipient 2 of action 1' })).toHaveValue('ROLE');
      await expect(page.getByLabel('Role key for recipient 2 of action 1')).toHaveValue('hr');

      const stored = await api('ceo', 'GET', `/api/workflows/${id}`);
      const action = (stored.actions as Array<{ recipients?: Array<{ mode: string; address?: string; roleKey?: string }> }>)[0];
      expect(action.recipients, 'the stored action has a recipients list').toHaveLength(2);
      expect(action.recipients![0]).toMatchObject({ mode: 'FIXED', address: `ops-${RUN}@example.test` });
      expect(action.recipients![1]).toMatchObject({ mode: 'ROLE', roleKey: 'hr' });
    });
  });

  /* ==================================================== 4. PAGINATION ===== */

  test.describe('4 pagination', () => {
    test.describe.configure({ mode: 'serial' });
    const COUNT = 30;

    async function expectPaging(page: Page, searchPlaceholder: string, needle: string) {
      await search(page, searchPlaceholder, needle);
      const rows = () => page.locator('tbody tr');
      await expect(page.getByText(`of ${COUNT} records`)).toBeVisible();
      await expect(page.getByText(`Showing 1 to 10 of ${COUNT} records`)).toBeVisible();
      await expect(rows()).toHaveCount(10);
      await expect(page.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled();

      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await expect(page.getByText(`Showing 11 to 20 of ${COUNT} records`)).toBeVisible();
      await expect(rows()).toHaveCount(10);
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await expect(page.getByText(`Showing 21 to 30 of ${COUNT} records`)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
      await page.getByRole('button', { name: 'Previous', exact: true }).click();
      await expect(page.getByText(`Showing 11 to 20 of ${COUNT} records`)).toBeVisible();

      await page.getByLabel('Rows per page').selectOption('25');
      await expect(page.getByText(`of ${COUNT} records`)).toBeVisible();
      await expect(rows()).toHaveCount(25);
      await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await expect(rows()).toHaveCount(COUNT - 25);
      await page.getByLabel('Rows per page').selectOption('50');
      await expect(rows()).toHaveCount(COUNT);
      await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
    }

    test('My work pages through thirty tasks', async () => {
      test.setTimeout(240_000);
      const prefix = `E2E page ${RUN}`;
      for (let i = 1; i <= COUNT; i += 1) {
        const item = await api('employee', 'POST', '/api/work-items', {
          kind: 'TASK',
          title: `${prefix} ${String(i).padStart(2, '0')}`,
        });
        cleanups.push({ what: 'archive', run: () => apiRaw('employee', 'POST', `/api/work-items/${item.id}/archive`) });
      }
      const page = await open('employee', '/work');
      await expectPaging(page, 'Search work', prefix);
    });

    test('My evidence pages through thirty entries', async () => {
      test.setTimeout(240_000);
      const note = `e2e ${RUN} paging`;
      for (let i = 1; i <= COUNT; i += 1) {
        const entry = await recordOccurrence('employee', `${note} ${i}`, new Date(Date.now() - (60 + i) * 60_000));
        cleanups.push({ what: 'withdraw', run: () => withdrawQuietly('employee', entry.id) });
      }
      const page = await open('employee', '/work/contributions');
      await expectPaging(page, 'Search evidence', note);
    });
  });

  /* ===================================================== 5. RESPONSIVE === */

  test.describe('5 responsive', () => {
    const VIEWPORTS = [
      { width: 1440, height: 900 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ];
    let projectId = '';

    test.beforeAll(async () => {
      mkdirSync(EVIDENCE_DIR, { recursive: true });
      // Tables with rows are what stretch a layout: an empty state hides overflow.
      for (let i = 1; i <= 3; i += 1) {
        const entry = await recordOccurrence('employee', `e2e ${RUN} responsive ${i}`, new Date(Date.now() - (30 + i) * 60_000));
        cleanups.push({ what: 'withdraw', run: () => withdrawQuietly('employee', entry.id) });
        const task = await api('employee', 'POST', '/api/work-items', { kind: 'TASK', title: `E2E responsive row ${RUN} ${i}` });
        cleanups.push({ what: 'archive', run: () => apiRaw('employee', 'POST', `/api/work-items/${task.id}/archive`) });
      }
      const project = await api('manager', 'POST', '/api/projects', {
        name: `E2E responsive ${RUN}`,
        code: `E2R-${RUN}`.toUpperCase().slice(0, 20),
        projectManagerEmployeeId: employeeIds.manager,
        businessUnitId: await visibleBusinessUnitId(),
      });
      projectId = project.id;
      cleanups.push({ what: 'delete project', run: () => apiRaw('manager', 'DELETE', `/api/projects/${projectId}`) });
      for (const title of [`Resp A ${RUN}`, `Resp B ${RUN}`]) {
        await api('manager', 'POST', '/api/work-items', { kind: 'TASK', title, projectId });
      }
    });

    const SCREENS: Array<{
      key: string;
      role: WorkRole;
      path: () => string;
      primary: string | RegExp;
      dialogOpener?: string;
    }> = [
      { key: 'my-work', role: 'employee', path: () => '/work', primary: 'New task', dialogOpener: 'New task' },
      { key: 'my-evidence', role: 'employee', path: () => '/work/contributions', primary: 'Record entry', dialogOpener: 'Record entry' },
      { key: 'daily-update', role: 'employee', path: () => '/work/daily-update', primary: 'Save draft' },
      { key: 'project-work', role: 'manager', path: () => `/projects/${projectId}`, primary: 'New task', dialogOpener: 'New task' },
    ];

    for (const screen of SCREENS) {
      for (const viewport of VIEWPORTS) {
        test(`${screen.key} at ${viewport.width}x${viewport.height}`, async () => {
          test.setTimeout(120_000);
          const page = await contexts[screen.role].newPage();
          openPages.add(page);
          await page.setViewportSize(viewport);
          await gotoWork(page, WEB, tenant, screen.path());
          await waitOutThrottle(page, screen.path());

          if (screen.key === 'daily-update') {
            await expect(page.getByRole('button', { name: 'Save draft' })).toBeVisible({ timeout: 45_000 });
          }
          if (screen.key === 'project-work') {
            await skipUnlessProjectsOnPlan(page);
            await expect(page.getByRole('radiogroup', { name: 'Work view' })).toBeVisible({ timeout: 45_000 });
            await expect(page.getByRole('button', { name: `Open Resp A ${RUN}` })).toBeVisible();
          }

          const overflow = () =>
            page.evaluate(() => ({
              scroll: document.documentElement.scrollWidth,
              inner: window.innerWidth,
            }));
          const o1 = await overflow();
          expect(o1.scroll, `page scrolls sideways (${o1.scroll} > ${o1.inner})`).toBeLessThanOrEqual(o1.inner);

          const primary = page.getByRole('button', { name: screen.primary, exact: true }).first();
          await primary.scrollIntoViewIfNeeded();
          await expect(primary).toBeVisible();
          const box = (await primary.boundingBox())!;
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);

          // The project record fills the top of the page; show the Work area itself.
          if (screen.key === 'project-work') {
            await page.getByRole('radiogroup', { name: 'Work view' }).scrollIntoViewIfNeeded();
          } else {
            await page.evaluate(() => window.scrollTo(0, 0));
          }
          await page.screenshot({
            path: join(EVIDENCE_DIR, `r4-${screen.key}-${viewport.width}.png`),
            fullPage: false,
          });

          if (screen.dialogOpener) {
            await page.getByRole('button', { name: screen.dialogOpener, exact: true }).first().click();
            const dialog = page.getByRole('dialog');
            await expect(dialog).toBeVisible();
            const d = (await dialog.boundingBox())!;
            expect(d.x).toBeGreaterThanOrEqual(-1);
            expect(d.x + d.width).toBeLessThanOrEqual(viewport.width + 1);
            expect(d.height, 'dialog is taller than the viewport').toBeLessThanOrEqual(viewport.height + 1);
            const o2 = await overflow();
            expect(o2.scroll).toBeLessThanOrEqual(o2.inner);
          }
          await releasePage(page);
        });
      }
    }
  });

  /* ======================================================== 6. RBAC ======= */

  test.describe('6 entitlement and RBAC', () => {
    test('the API refuses with 403 what the sidebar hides', async () => {
      const own = await recordOccurrence('employee', `e2e ${RUN} rbac`);
      cleanups.push({ what: 'withdraw', run: () => withdrawQuietly('employee', own.id) });

      const queue = await apiRaw('employee', 'POST', '/api/work-queues', {
        key: `rbac-${RUN}`,
        name: `rbac ${RUN}`,
      });
      expect(queue.status, JSON.stringify(queue.body)).toBe(403);

      const policy = await apiRaw('employee', 'PUT', '/api/daily-updates/policy', PERMISSIVE_POLICY);
      expect(policy.status, JSON.stringify(policy.body)).toBe(403);

      const review = await apiRaw('employee', 'POST', `/api/contributions/${own.id}/review`, {
        decision: 'VERIFIED',
      });
      expect(review.status, JSON.stringify(review.body)).toBe(403);
      expect((await api('employee', 'GET', `/api/contributions/${own.id}`)).verification).toBe('UNVERIFIED');

      const ack = await apiRaw('employee', 'POST', `/api/daily-updates/${uuid()}/acknowledge`);
      expect(ack.status).toBe(403);

      // a manager reviews but does not administer
      const mgrPolicy = await apiRaw('manager', 'PUT', '/api/daily-updates/policy', PERMISSIVE_POLICY);
      expect(mgrPolicy.status).toBe(403);
      const mgrQueue = await apiRaw('manager', 'POST', '/api/work-queues', {
        key: `rbac-m-${RUN}`,
        name: `rbac m ${RUN}`,
      });
      expect(mgrQueue.status).toBe(403);

      // the settings screen itself is closed to the employee
      const page = await open('employee', '/settings/daily-updates');
      await expect(page.getByRole('button', { name: 'Save policy' })).toHaveCount(0);
      const queuesPage = await open('employee', '/work/queues');
      await expect(queuesPage.getByRole('button', { name: 'New queue' })).toHaveCount(0);
    });
  });
});

/** Silence the unused import when a role email override is not needed. */
void roleEmail;
