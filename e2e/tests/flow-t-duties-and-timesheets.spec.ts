// REPEATABILITY: duty templates have no delete (deactivated only, by design) and a
// timesheet entry is replaced on every save, so each run creates its own templates
// under a per-run key, deactivates them at the end, archives the work items it made,
// and restores the tenant's plan/feature rows exactly from a snapshot.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { auditPage, blocking, describeViolations, scrollsSideways } from '../fixtures/accessibility';
import {
  guiDatabaseUrl,
  restoreEntitlements,
  removeE2eDuties,
  seedForeignDuties,
  setTenantPlan,
  withGuiDb,
  snapshotEntitlements,
  type EntitlementSnapshot,
} from '../fixtures/work-database';
import {
  OTHER_SLUG,
  OTHER_WEB,
  RUN,
  WEB,
  Workspace,
  alertText,
  field,
  newTenantTarget,
  ymd,
} from '../fixtures/work-hardening';
import { workPassword, workTenant, type WorkRole } from '../fixtures/work-sessions';
import { BASE_URLS } from '../playwright.config';

/**
 * Flow T - duties (WP-36.S3) and the timesheet work-item picker (WP-06.S5), driven
 * through the real UI of apps/web with an assertion on the API outcome next to every
 * UI one.
 *
 *   1 EMPLOYEE     - checklist, blocked completion, completion, handover, timesheet link
 *   2 MANAGER      - generate, assign, acknowledge a team handover
 *   3 ADMIN        - template create / edit / deactivate / activate, filters, paging
 *   4 ENTITLEMENT  - a Starter tenant has no Duties and the page refuses; Growth has it
 *   5 CROSS-TENANT - a second tenant gets 404 for this tenant's ids (needs a second tenant)
 *   6 RESPONSIVE   - 390 / 768 / 1280, no sideways scroll, dialogs fit
 *   7 ACCESSIBILITY- axe, keyboard checklist, focus trap and Escape in the dialogs
 *
 * Environment: the same as Flow R/S (E2E_WEB_URL, E2E_API_URL, E2E_TENANT_SLUG,
 * E2E_WEB_PASSWORD, E2E_DATABASE_URL) plus, for journey 5, E2E_OTHER_TENANT_SLUG and
 * E2E_OTHER_WEB_URL. `node scripts/work-gui-stack.mjs env --export` prints the first set.
 */

const SHOTS = join(__dirname, '..', 'test-results', 'flow-t');
const A_SLUG = workTenant()?.slug ?? '';
const HAVE_DB = Boolean(guiDatabaseUrl());
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

const ws = { a: null as unknown as Workspace, b: null as unknown as Workspace };
const cleanups: Array<{ what: string; run: () => Promise<unknown> }> = [];
let snapshot: EntitlementSnapshot | null = null;

/** A mid-week local date a few days out, so the assignee is normally scheduled on it. */
function weekdayAhead(minDays: number, from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + minDays);
  while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() + 1);
  return ymd(0, d);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return ymd(0, d);
}

const DUTY_DATE = weekdayAhead(2);
const MANAGER_DATE = addDays(DUTY_DATE, 1);

const NAME_REQ = `E2E duty ${RUN}`;
const NAME_SIMPLE = `E2E simple ${RUN}`;
const CHECK_REQ = `Unlock ${RUN}`;
const CHECK_OPT = `Lights ${RUN}`;
const CHECK_SWEEP = `Sweep ${RUN}`;

let tplReqId = '';
let tplSimpleId = '';
let occReqId = '';
let occSimpleId = '';
let managerTeamId: string | null = null;
let managerName = '';

async function shoot(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${name}.png`) });
}

async function createTemplate(
  role: WorkRole,
  body: Record<string, unknown>,
): Promise<{ id: string; key: string }> {
  const created = await ws.a.api(role, 'POST', '/api/work-duties/templates', body);
  cleanups.push({
    what: `deactivate ${created.key}`,
    run: () => ws.a.raw('hr', 'POST', `/api/work-duties/templates/${created.id}/deactivate`),
  });
  return created;
}

async function occurrenceFor(role: WorkRole, templateId: string, date: string) {
  const page = await ws.a.api(
    role,
    'GET',
    `/api/work-duties/occurrences?templateId=${templateId}&date=${date}&take=10`,
  );
  return (page.items as Array<{ id: string; workItemId: string }>)[0];
}

function rowOf(page: Page, text: string): Locator {
  return page.getByRole('row').filter({ hasText: text });
}

async function pickView(page: Page, name: string) {
  const radio = page.getByRole('radio', { name });
  await expect(async () => {
    await radio.click();
    await expect(radio).toBeChecked({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

async function chooseOption(page: Page, scope: Page | Locator, label: string | RegExp, option: string | RegExp) {
  const name = typeof label === 'string' ? new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) : label;
  await scope.getByRole('combobox', { name }).click();
  await page.getByRole('option', { name: option }).first().click();
}

/** A row of a server-paged list, looking through the pages from the first. */
async function findRow(page: Page, text: string): Promise<Locator> {
  const row = rowOf(page, text);
  const prev = page.getByRole('button', { name: 'Previous page' });
  const next = page.getByRole('button', { name: 'Next page' });
  // The pager buttons are disabled while a page loads: wait for them to settle, then rewind.
  for (let i = 0; i < 40; i += 1) {
    if (await prev.isEnabled().catch(() => false)) {
      await prev.click();
      continue;
    }
    await page.waitForTimeout(700);
    if (!(await prev.isEnabled().catch(() => false))) break;
  }
  for (let i = 0; i < 40; i += 1) {
    if (await row.first().isVisible().catch(() => false)) return row;
    await row.first().waitFor({ state: 'visible', timeout: 4_000 }).catch(() => undefined);
    if (await row.first().isVisible().catch(() => false)) return row;
    await page.waitForTimeout(700);
    if (!(await next.isEnabled().catch(() => false))) {
      await page.waitForTimeout(1_500);
      if (!(await next.isEnabled().catch(() => false))) break;
    }
    await next.click();
  }
  await expect(row).toBeVisible({ timeout: 10_000 });
  return row;
}

/** The app raises a blocking ERROR modal for some failed calls and not others; close it when it is there. */
async function closeErrorModalIfShown(page: Page, pattern: RegExp) {
  const modal = page.locator('[role="presentation"]').filter({ hasText: 'REFERENCE ID' }).last();
  if (await modal.waitFor({ state: 'visible', timeout: 2_000 }).then(() => true, () => false)) {
    await expect(modal).toContainText(pattern);
    await modal.getByRole('button', { name: 'Close' }).click();
    await expect(modal).toBeHidden();
  }
}

/** Filter the duty list to a date and wait until that duty is the one shown; a fill before the page is interactive is lost, so it is repeated. */
async function filterDutiesTo(page: Page, name: string, date: string) {
  await expect(async () => {
    await field(page, 'Date').fill(date);
    await expect(page.getByRole('button', { name: `Open ${name} for ${date}` })).toBeVisible({ timeout: 4_000 });
  }).toPass({ timeout: 60_000 });
}

async function openOccurrence(page: Page, name: string, date: string) {
  await field(page, 'Date').fill(date);
  const row = rowOf(page, name);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByRole('button', { name: new RegExp(`^Open ${name}`) }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('list', { name: 'Checklist' })).toBeVisible();
  return dialog;
}

test.describe('Flow T - duties and timesheet work items', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(600_000);
    test.skip(!workPassword(), 'E2E_WEB_PASSWORD is unset: the synthetic users share a password that is never committed');
    test.skip(!A_SLUG, 'E2E_TENANT_SLUG is unset (e.g. dijipeople-demo)');
    const apiUp = await fetch(`${BASE_URLS.api}/api/health`).then((r) => r.status < 500).catch(() => false);
    test.skip(!apiUp, `the API is not reachable at ${BASE_URLS.api}`);

    if (HAVE_DB) {
      snapshot = await snapshotEntitlements(A_SLUG);
      // what an interrupted earlier run left behind
      await removeE2eDuties(A_SLUG);
    }

    ws.a = new Workspace(WEB, newTenantTarget(A_SLUG));
    await ws.a.signIn(browser, ['employee', 'manager', 'hr', 'ceo']);
    if (OTHER_SLUG && OTHER_WEB) {
      ws.b = new Workspace(OTHER_WEB, newTenantTarget(OTHER_SLUG));
      await ws.b.signIn(browser, ['hr', 'manager']);
    }

    // Warm the routes once so no test absorbs Next dev's first-hit compile.
    const warm = await ws.a.contexts.hr.newPage();
    for (const path of ['/work/duties', '/timesheets/new']) {
      await warm
        .goto(`${WEB}${path}?tenant=${A_SLUG}`, { waitUntil: 'domcontentloaded', timeout: 180_000 })
        .catch(() => undefined);
    }
    await warm.close();

    const manager = await ws.a.api('hr', 'GET', `/api/employees/${ws.a.employeeIds.manager}`);
    managerTeamId = (manager.teamId as string | null) ?? null;
    if (!managerTeamId && HAVE_DB) {
      // The demo manager has no team: give them one for the team-handover journey and take it away again.
      const team = await ws.a.api('ceo', 'POST', '/api/teams', { name: `E2E team ${RUN}` });
      await withGuiDb((db) => db.query('update "Employee" set "teamId" = $1 where id = $2', [team.id, ws.a.employeeIds.manager]));
      managerTeamId = team.id as string;
      cleanups.push({
        what: 'remove the e2e team',
        run: () =>
          withGuiDb(async (db) => {
            await db.query('update "Employee" set "teamId" = null where id = $1', [ws.a.employeeIds.manager]);
            await db.query('delete from "DutyHandover" where "teamId" = $1', [team.id]);
            await db.query('delete from "Team" where id = $1', [team.id]);
          }),
      });
    }
    managerName = `${manager.firstName ?? ''} ${manager.lastName ?? ''}`.trim() || (manager.fullName as string);

    // Two duties for the employee on the same day: one with a required check, one plain.
    const base = {
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      timezone: TZ,
      startMinutes: 480,
      dueMinutes: 1020,
      assigneeEmployeeId: ws.a.employeeIds.employee,
    };
    tplReqId = (
      await createTemplate('hr', {
        ...base,
        key: `e2e-req-${RUN}`,
        name: NAME_REQ,
        checklist: [
          { label: CHECK_REQ, required: true },
          { label: CHECK_OPT, required: false },
        ],
      })
    ).id;
    tplSimpleId = (
      await createTemplate('hr', {
        ...base,
        key: `e2e-simple-${RUN}`,
        name: NAME_SIMPLE,
        checklist: [{ label: CHECK_SWEEP, required: false }],
      })
    ).id;
    await ws.a.api('hr', 'POST', '/api/work-duties/generate', { date: DUTY_DATE });
    occReqId = (await occurrenceFor('hr', tplReqId, DUTY_DATE)).id;
    occSimpleId = (await occurrenceFor('hr', tplSimpleId, DUTY_DATE)).id;
    for (const id of [occReqId, occSimpleId]) {
      cleanups.push({
        what: 'archive occurrence work item',
        run: async () => {
          const occ = await ws.a.raw('hr', 'GET', `/api/work-duties/occurrences/${id}`);
          if (occ.body?.workItemId) await ws.a.raw('hr', 'POST', `/api/work-items/${occ.body.workItemId}/archive`);
        },
      });
    }
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      let n = 0;
      for (const page of ws.a ? ws.a.pages : []) {
        n += 1;
        await page.screenshot({ path: testInfo.outputPath(`failure-page-${n}.png`), fullPage: true }).catch(() => undefined);
      }
    }
    if (ws.a) await ws.a.releaseAll();
    if (ws.b) await ws.b.releaseAll();
  });

  test.afterAll(async () => {
    for (const cleanup of cleanups.reverse()) await cleanup.run().catch(() => undefined);
    if (snapshot) await restoreEntitlements(snapshot).catch(() => undefined);
    if (HAVE_DB) await removeE2eDuties(A_SLUG).catch(() => undefined);
    if (ws.a) await ws.a.close();
    if (ws.b) await ws.b.close();
  });

  /* ===================================================== 1. EMPLOYEE ===== */

  test.describe('1 employee', () => {
    test.describe.configure({ mode: 'serial' });

    test('a required check blocks completion with the server message; ticking it with a note lets the duty complete', async () => {
      test.setTimeout(240_000);
      const page = await ws.a.open('employee', '/work/duties');
      await expect(page.getByRole('heading', { name: 'Duties', level: 2 })).toBeVisible();
      // an employee manages no templates: only their own duties and handovers
      await expect(page.getByRole('radio', { name: 'Templates' })).toHaveCount(0);
      await shoot(page, 'employee-duties-list');

      const dialog = await openOccurrence(page, NAME_REQ, DUTY_DATE);
      await expect(dialog.getByText(/0 of 2 checks done/)).toBeVisible();

      // blocked: the required check is open
      await dialog.getByRole('button', { name: 'Complete duty' }).click();
      await closeErrorModalIfShown(page, /required checklist item/);
      expect(await alertText(dialog)).toMatch(/1 required checklist item\(s\) are not complete/);
      expect((await ws.a.api('employee', 'GET', `/api/work-duties/occurrences/${occReqId}`)).status).not.toBe('DONE');

      // tick the required check with a note
      await field(dialog, `Note for ${CHECK_REQ}`).fill('checked by e2e');
      await dialog.getByRole('checkbox', { name: `${CHECK_REQ} (required)` }).check();
      await expect(dialog.getByRole('checkbox', { name: `${CHECK_REQ} (required)` })).toBeChecked();
      await expect(dialog.getByText(/1 of 2 checks done/)).toBeVisible();
      const afterTick = await ws.a.api('employee', 'GET', `/api/work-duties/occurrences/${occReqId}`);
      const required = (afterTick.checks as Array<{ label: string; completedAt: string | null; note: string | null }>).find(
        (c) => c.label === CHECK_REQ,
      )!;
      expect(required.completedAt).not.toBeNull();
      expect(required.note).toBe('checked by e2e');

      // untick and tick again: the API follows
      await dialog.getByRole('checkbox', { name: `${CHECK_REQ} (required)` }).uncheck();
      await expect(dialog.getByText(/0 of 2 checks done/)).toBeVisible();
      await dialog.getByRole('checkbox', { name: `${CHECK_REQ} (required)` }).check();
      await expect(dialog.getByText(/1 of 2 checks done/)).toBeVisible();

      await dialog.getByRole('button', { name: 'Complete duty' }).click();
      await expect(dialog.getByText('Done', { exact: true })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Complete duty' })).toHaveCount(0);
      expect((await ws.a.api('employee', 'GET', `/api/work-duties/occurrences/${occReqId}`)).status).toBe('DONE');
      await shoot(page, 'employee-duty-completed');
    });

    test('hands a duty over to the manager and sees it among the handovers', async () => {
      test.setTimeout(240_000);
      const page = await ws.a.open('employee', '/work/duties');
      const dialog = await openOccurrence(page, NAME_SIMPLE, DUTY_DATE);
      await dialog.getByRole('button', { name: 'Hand over' }).click();
      const handover = page.getByRole('dialog');
      await expect(handover.getByRole('heading', { name: `Hand over: ${NAME_SIMPLE}` })).toBeVisible();

      // a note that is too short is refused before it is sent
      await handover.getByRole('button', { name: 'Hand over' }).click();
      expect(await alertText(handover)).toMatch(/Choose who receives/);

      await handover.getByRole('combobox', { name: /^Person/ }).click();
      await page.getByRole('option', { name: new RegExp(managerName) }).first().click();
      await handover.getByLabel(/^Note/).fill(`Keys are with security ${RUN}`);
      await handover.getByRole('button', { name: 'Hand over' }).click();

      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByRole('radio', { name: 'Handovers' })).toBeChecked();
      await findRow(page, `Keys are with security ${RUN}`);
      const list = await ws.a.api('employee', 'GET', '/api/work-duties/handovers?status=OPEN&take=100');
      const mine = (list.items as Array<{ note: string; toEmployeeId: string; occurrenceId: string }>).find((h) =>
        h.note.includes(RUN),
      );
      expect(mine?.toEmployeeId).toBe(ws.a.employeeIds.manager);
      expect(mine?.occurrenceId).toBe(occSimpleId);
      await shoot(page, 'employee-handover-created');
    });
  });

  /* ======================================================= 2. MANAGER ===== */

  test.describe('2 manager', () => {
    test.describe.configure({ mode: 'serial' });

    test('generates the duties for a date, assigns a template, and acknowledges a team handover', async () => {
      test.setTimeout(300_000);
      const page = await ws.a.open('manager', '/work/duties');
      await pickView(page, 'Templates');
      await findRow(page, NAME_REQ);

      // generate for another day: the API creates one occurrence per active template that recurs
      await page.getByRole('button', { name: 'Generate duties' }).click();
      const generate = page.getByRole('dialog');
      await field(generate, 'Date').fill(MANAGER_DATE);
      await generate.getByRole('button', { name: 'Generate' }).click();
      await expect(generate.getByRole('status')).toContainText(/Created \d+, already existing \d+/, { timeout: 30_000 });
      expect(await occurrenceFor('manager', tplReqId, MANAGER_DATE)).toBeTruthy();
      // a second run is idempotent: the same duties are reported as existing
      await generate.getByRole('button', { name: 'Generate' }).click();
      await expect(generate.getByRole('status')).toContainText(/Created 0/, { timeout: 30_000 });
      await generate.getByRole('button', { name: 'Close' }).click();

      // assign: a template created by the manager for the employee (the manager's own
      // reach is the employee, so that is who the assignee picker offers)
      await page.getByRole('button', { name: 'New template' }).first().click();
      const create = page.getByRole('dialog');
      await field(create, 'Name').fill(`E2E mgr ${RUN}`);
      await create.getByRole('combobox', { name: /^Assignee/ }).click();
      await page.getByRole('option', { name: /Demo Employee/ }).first().click();
      await create.getByRole('button', { name: 'Create template' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      const mine = (
        (await ws.a.api('manager', 'GET', '/api/work-duties/templates?take=100')).items as Array<{
          id: string;
          key: string;
          assigneeEmployeeId: string | null;
        }>
      ).find((t) => t.key === `e2e-mgr-${RUN}`)!;
      cleanups.push({
        what: 'deactivate manager template',
        run: () => ws.a.raw('hr', 'POST', `/api/work-duties/templates/${mine.id}/deactivate`),
      });
      expect(mine.assigneeEmployeeId).toBe(ws.a.employeeIds.employee);
      await findRow(page, `E2E mgr ${RUN}`);
      await shoot(page, 'manager-templates');
    });

    test('acknowledges a handover addressed to a team the manager belongs to; the sender cannot', async () => {
      test.skip(!managerTeamId, 'the demo manager belongs to no team, so a team handover cannot be addressed to them');
      test.setTimeout(240_000);
      const note = `Team handover ${RUN}`;
      const made = await ws.a.api('employee', 'POST', '/api/work-duties/handovers', { teamId: managerTeamId, note });

      // the sender is not the receiver
      const own = await ws.a.raw('employee', 'POST', `/api/work-duties/handovers/${made.id}/acknowledge`);
      expect(own.status, JSON.stringify(own.body)).toBe(403);

      const page = await ws.a.open('manager', '/work/duties');
      await pickView(page, 'Handovers');
      const row = await findRow(page, note);
      await row.getByRole('button', { name: /^Acknowledge handover/ }).click();
      await expect(rowOf(page, note)).toHaveCount(0, { timeout: 30_000 });
      expect((await ws.a.api('manager', 'GET', `/api/work-duties/handovers?status=ACKNOWLEDGED&take=100`)).items).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: made.id, status: 'ACKNOWLEDGED' })]),
      );
    });
  });

  /* ========================================================= 3. ADMIN ===== */

  test.describe('3 admin', () => {
    test.describe.configure({ mode: 'serial' });
    const adminName = `E2E admin ${RUN}`;
    let adminTemplateId = '';

    test('creates, edits, deactivates and re-activates a template with weekdays, zone, times and a checklist', async () => {
      test.setTimeout(300_000);
      const page = await ws.a.open('hr', '/work/duties');
      await pickView(page, 'Templates');
      await page.getByRole('button', { name: 'New template' }).first().click();
      const dialog = page.getByRole('dialog');

      // refused locally: no checklist label
      await field(dialog, 'Name').fill(adminName);
      await dialog.getByRole('button', { name: 'Add checklist item' }).click();
      await dialog.getByRole('button', { name: 'Create template' }).click();
      expect(await alertText(dialog)).toMatch(/Every checklist item needs a label/);

      await expect(field(dialog, 'Key')).toHaveValue(`e2e-admin-${RUN}`);
      await dialog.getByRole('checkbox', { name: 'Saturday' }).check();
      await chooseOption(page, dialog, 'Timezone', 'Pacific/Auckland');
      await field(dialog, 'Start time').fill('08:00');
      await field(dialog, 'Due time').fill('17:30');
      await field(dialog, 'Checklist item 1').fill(`Open the till ${RUN}`);
      await dialog.getByLabel('Required, item 1').check();
      await dialog.getByRole('button', { name: 'Add checklist item' }).click();
      await field(dialog, 'Checklist item 2').fill(`Count the float ${RUN}`);
      await dialog.getByRole('button', { name: 'Create template' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);

      const row = await findRow(page, adminName);
      await expect(row).toContainText('Pacific/Auckland');
      await expect(row).toContainText('08:00 to 17:30');
      await expect(row).toContainText('Active');
      const found = await ws.a.api('hr', 'GET', '/api/work-duties/templates?take=100');
      const created = (found.items as Array<{ id: string; key: string }>).find((t) => t.key === `e2e-admin-${RUN}`)!;
      adminTemplateId = created.id;
      cleanups.push({
        what: 'deactivate admin template',
        run: () => ws.a.raw('hr', 'POST', `/api/work-duties/templates/${adminTemplateId}/deactivate`),
      });
      const stored = await ws.a.api('hr', 'GET', `/api/work-duties/templates/${adminTemplateId}`);
      expect(stored).toMatchObject({
        name: adminName,
        timezone: 'Pacific/Auckland',
        weekdays: [1, 2, 3, 4, 5, 6],
        startMinutes: 480,
        dueMinutes: 1050,
        isActive: true,
      });
      expect(stored.checklist.map((c: { label: string; required: boolean }) => [c.label, c.required])).toEqual([
        [`Open the till ${RUN}`, true],
        [`Count the float ${RUN}`, false],
      ]);

      // edit: rename, drop Saturday, add a third item; the key cannot change
      await row.getByRole('button', { name: `Edit ${adminName}` }).click();
      const edit = page.getByRole('dialog');
      await expect(field(edit, 'Key')).toBeDisabled();
      await field(edit, 'Name').fill(`${adminName} v2`);
      await edit.getByRole('checkbox', { name: 'Saturday' }).uncheck();
      await edit.getByRole('button', { name: 'Add checklist item' }).click();
      await field(edit, 'Checklist item 3').fill(`Lock up ${RUN}`);
      await edit.getByRole('button', { name: 'Save template' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await findRow(page, `${adminName} v2`);
      const edited = await ws.a.api('hr', 'GET', `/api/work-duties/templates/${adminTemplateId}`);
      expect(edited.name).toBe(`${adminName} v2`);
      expect(edited.weekdays).toEqual([1, 2, 3, 4, 5]);
      expect(edited.checklist).toHaveLength(3);

      // deactivate, filter by inactive, activate
      const editedRow = rowOf(page, `${adminName} v2`);
      await editedRow.getByRole('button', { name: `Deactivate ${adminName} v2` }).click();
      await expect(editedRow).toContainText('Inactive', { timeout: 30_000 });
      expect((await ws.a.api('hr', 'GET', `/api/work-duties/templates/${adminTemplateId}`)).isActive).toBe(false);
      await chooseOption(page, page, 'Show', 'Inactive');
      await findRow(page, `${adminName} v2`);
      await expect(rowOf(page, NAME_REQ)).toHaveCount(0);
      await rowOf(page, `${adminName} v2`).getByRole('button', { name: `Activate ${adminName} v2` }).click();
      await expect(rowOf(page, `${adminName} v2`)).toHaveCount(0, { timeout: 30_000 });
      expect((await ws.a.api('hr', 'GET', `/api/work-duties/templates/${adminTemplateId}`)).isActive).toBe(true);
      await shoot(page, 'admin-templates');

      // an invalid key and an unknown zone never reach the API
      await chooseOption(page, page, 'Show', 'All templates');
      await page.getByRole('button', { name: 'New template' }).first().click();
      const bad = page.getByRole('dialog');
      await field(bad, 'Name').fill('x');
      await field(bad, 'Key').fill('Bad Key');
      await bad.getByRole('button', { name: 'Create template' }).click();
      expect(await alertText(bad)).toMatch(/Key must be/);
      await bad.getByRole('button', { name: 'Cancel' }).click();
    });

    test('the occurrence list filters by template and pages by the server total', async () => {
      test.setTimeout(300_000);
      // twelve duties of the plain template, so the list needs two pages
      for (let i = 0; i < 12; i += 1) {
        await ws.a.api('hr', 'POST', '/api/work-duties/generate', { date: addDays(DUTY_DATE, 10 + i) });
      }
      const page = await ws.a.open('hr', '/work/duties');
      await page.getByRole('combobox', { name: /^Template/ }).click();
      await page.getByPlaceholder('All templates').fill(NAME_SIMPLE);
      await page.getByRole('option', { name: NAME_SIMPLE }).first().click();
      const total = (
        await ws.a.api('hr', 'GET', `/api/work-duties/occurrences?templateId=${tplSimpleId}&take=1`)
      ).total as number;
      expect(total).toBeGreaterThanOrEqual(12);
      await expect(page.getByRole('status').filter({ hasText: /^Duties / })).toHaveText(
        new RegExp(`Duties 1 to 10 of ${total}`),
        { timeout: 30_000 },
      );
      await page.getByRole('button', { name: 'Next page' }).click();
      await expect(page.getByRole('status').filter({ hasText: /^Duties / })).toHaveText(
        new RegExp(`Duties 11 to ${Math.min(20, total)} of ${total}`),
        { timeout: 30_000 },
      );
      await expect(page.getByRole('button', { name: 'Previous page' })).toBeEnabled();
      // a date narrows it to one
      await page.getByRole('button', { name: 'All dates' }).count();
      await field(page, 'Date').fill(DUTY_DATE);
      await expect(page.getByRole('status').filter({ hasText: /^Duties / })).toHaveText(/Duties 1 to 1 of 1/, {
        timeout: 30_000,
      });
    });
  });

  /* =================================================== TIMESHEET LINK ===== */

  test.describe('1b employee timesheet', () => {
    test.describe.configure({ mode: 'serial' });
    const itemTitle = `E2E ts item ${RUN}`;
    const otherTitle = `E2E ts other ${RUN}`;
    let itemId = '';
    let otherId = '';
    let projectId = '';
    let otherProjectId = '';

    async function projectIn(label: string, assign: boolean) {
      const units = await ws.a.api('manager', 'GET', '/api/business-units');
      const unit = ((Array.isArray(units) ? units : units.items) as Array<{ id: string }>)[0];
      const project = await ws.a.api('manager', 'POST', '/api/projects', {
        name: `E2E ${label} ${RUN}`,
        code: `T${label.slice(0, 3)}-${RUN}`.toUpperCase().slice(0, 20),
        projectManagerEmployeeId: ws.a.employeeIds.manager,
        businessUnitId: unit.id,
      });
      let assignmentId = '';
      if (assign) {
        const assignment = await ws.a.api('ceo', 'POST', `/api/projects/${project.id}/assignments`, {
          employeeId: ws.a.employeeIds.employee,
          roleOnProject: 'Member',
          allocationPercent: 1,
        });
        assignmentId = assignment.id;
      }
      cleanups.push({
        what: `delete project ${label}`,
        run: async () => {
          if (assignmentId) await ws.a.raw('ceo', 'DELETE', `/api/projects/${project.id}/assignments/${assignmentId}`);
          await ws.a.raw('ceo', 'DELETE', `/api/projects/${project.id}`);
        },
      });
      return project.id as string;
    }

    async function newItem(title: string, extra: Record<string, unknown>) {
      const item = await ws.a.api('manager', 'POST', '/api/work-items', {
        kind: 'TASK',
        title,
        ownerEmployeeId: ws.a.employeeIds.employee,
        ...extra,
      });
      cleanups.push({
        what: `archive ${title}`,
        run: () => ws.a.raw('manager', 'POST', `/api/work-items/${item.id}/archive`),
      });
      return item.id as string;
    }

    /** Empty every editable day of the employee's month, so runs never pile entries up. */
    async function clearTimesheetEntries() {
      const sheet = await ws.a.raw('employee', 'GET', '/api/timesheets/mine/monthly');
      for (const week of (sheet.body?.weeks ?? []) as Array<{
        id: string;
        version: number;
        canEdit: boolean;
        days: Array<{ id: string; version: number; isLocked: boolean; entries: unknown[] }>;
      }>) {
        const days = week.days.filter((d) => !d.isLocked && d.entries.length > 0);
        if (!week.canEdit || days.length === 0) continue;
        await ws.a.raw('employee', 'PATCH', `/api/timesheets/${sheet.body.id}/weeks/${week.id}/entries`, {
          weekVersion: week.version,
          days: days.map((d) => ({ dayId: d.id, version: d.version, entries: [] })),
        });
      }
    }

    test.beforeAll(async () => {
      test.setTimeout(300_000);
      projectId = await projectIn('tsa', true);
      otherProjectId = await projectIn('tsb', false);
      itemId = await newItem(itemTitle, {});
      otherId = await newItem(otherTitle, { projectId: otherProjectId });
      await clearTimesheetEntries();
      cleanups.push({ what: 'clear timesheet entries', run: clearTimesheetEntries });
    });

    /** The first editable week's "+ Add entry", filled with a project and an hour. */
    async function addEntry(page: Page) {
      const week = page.locator('details').first();
      await week.getByRole('button', { name: '+ Add entry' }).first().click();
      const entry = week.locator('div.rounded-xl.border').filter({ has: page.getByLabel('Hours') }).last();
      await entry.getByLabel('Project').selectOption({ index: 1 });
      await entry.getByLabel('Hours').fill('1');
      return { week, entry };
    }

    test('links an entry to one of my own work items by title; the link survives a save and a reload', async () => {
      test.setTimeout(300_000);
      const page = await ws.a.open('employee', '/timesheets/new');
      await page.waitForURL(/\/timesheets\/[0-9a-f-]{36}/, { timeout: 120_000 });
      const { week, entry } = await addEntry(page);

      // my items are offered by title; someone else's is not
      await entry.getByRole('combobox', { name: /^Work item/ }).click();
      await expect(page.getByRole('option', { name: itemTitle })).toBeVisible();
      await expect(page.getByRole('option', { name: 'Other task' })).toBeVisible();
      await page.getByRole('option', { name: itemTitle }).click();
      await week.getByRole('button', { name: 'Save draft' }).click();
      await expect(page.getByText(/Week saved and recalculated/i)).toBeVisible({ timeout: 30_000 });

      const sheet = await ws.a.api('employee', 'GET', '/api/timesheets/mine/monthly');
      const entries = (sheet.weeks as Array<{ days: Array<{ entries: Array<{ taskId: string | null }> }> }>).flatMap((w) =>
        w.days.flatMap((d) => d.entries),
      );
      expect(entries.some((e) => e.taskId === itemId)).toBe(true);

      await page.reload();
      await expect(
        page.locator('details').first().getByRole('combobox', { name: /^Work item/ }).filter({ hasText: itemTitle }),
      ).toHaveCount(1, { timeout: 30_000 });
      await shoot(page, 'timesheet-linked-entry');
    });

    test('free text stays possible, and a server refusal appears as a field error on the work item', async () => {
      test.setTimeout(300_000);
      const page = await ws.a.open('employee', '/timesheets/new');
      await page.waitForURL(/\/timesheets\/[0-9a-f-]{36}/, { timeout: 120_000 });
      const { week, entry } = await addEntry(page);

      // free text
      await chooseOption(page, entry, 'Work item', 'Other task');
      await field(entry, 'Task').fill(`TICKET-${RUN}`);
      await week.getByRole('button', { name: 'Save draft' }).click();
      await expect(page.getByText(/Week saved and recalculated/i)).toBeVisible({ timeout: 30_000 });
      const taskIds = async () =>
        ((await ws.a.api('employee', 'GET', '/api/timesheets/mine/monthly')).weeks as Array<{
          days: Array<{ entries: Array<{ taskId: string | null }> }>;
        }>).flatMap((w) => w.days.flatMap((d) => d.entries.map((e) => e.taskId)));

      // project mismatch: the item belongs to another project than the entry's
      await chooseOption(page, entry, 'Work item', otherTitle);
      await week.getByRole('button', { name: 'Save draft' }).click();
      await closeErrorModalIfShown(page, /different project/);
      await expect(entry.getByText(/different project/i)).toBeVisible({ timeout: 30_000 });

      // not yours: ownership moves away between choosing and saving
      await chooseOption(page, entry, 'Work item', itemTitle);
      await ws.a.api('manager', 'POST', `/api/work-items/${itemId}/reassign`, {
        ownerEmployeeId: ws.a.employeeIds.manager,
        reason: 'e2e',
      });
      await week.getByRole('button', { name: 'Save draft' }).click();
      await closeErrorModalIfShown(page, /own or share/);
      await expect(entry.getByText(/own or share/i)).toBeVisible({ timeout: 30_000 });
      await ws.a.api('manager', 'POST', `/api/work-items/${itemId}/reassign`, {
        ownerEmployeeId: ws.a.employeeIds.employee,
        reason: 'e2e restore',
      });
      // Reads come last on purpose: reading the sheet recalculates it and moves its version, which would make the open editor stale between saves.
      const stored = await taskIds();
      expect(stored).toContain(`TICKET-${RUN}`);
      expect(stored).not.toContain(otherId);
    });
  });

  /* ================================================== 4. ENTITLEMENT ===== */

  test.describe('4 entitlement', () => {
    test('a Starter tenant has no Duties and the page refuses; Growth shows it', async () => {
      test.skip(!HAVE_DB, 'E2E_DATABASE_URL is unset: the plan is changed through the guarded DB helper');
      test.setTimeout(900_000);
      const health = await fetch(`${BASE_URLS.api}/api/health`).then((r) => r.json()).catch(() => ({}));
      const enforced = Boolean(health?.entitlementEnforcement?.enforced);

      const offered = async (present: boolean) =>
        expect
          .poll(
            async () => {
              const r = await ws.a.raw('hr', 'GET', '/work/duties');
              return !String(r.body).includes('not part of your current subscription');
            },
            { timeout: 150_000, intervals: [5_000], message: `Duties ${present ? 'offered' : 'withdrawn'} by the plan` },
          )
          .toBe(present);

      try {
        await setTenantPlan(A_SLUG, 'starter');
        await offered(false);
        const wall = await ws.a.open('hr', '/work/duties');
        await expect(wall.getByText(/not part of your current subscription/i)).toBeVisible({ timeout: 60_000 });
        await expect(wall.getByRole('radio', { name: 'My duties' })).toHaveCount(0);
        await expect(wall.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: 'Duties' })).toHaveCount(0);
        await shoot(wall, 'entitlement-starter');
        const refused = await ws.a.raw('hr', 'GET', '/api/work-duties/occurrences?take=1');
        if (enforced) {
          expect(refused.status).toBe(403);
          expect(String(refused.body?.errorCode ?? refused.body?.code)).toMatch(/ENTITLED/);
        } else {
          expect(refused.status, 'REPORT_ONLY lets the call through').toBe(200);
        }
        await ws.a.release(wall);

        await setTenantPlan(A_SLUG, 'growth');
        await offered(true);
        const shown = await ws.a.open('hr', '/work/duties');
        await expect(shown.getByRole('heading', { name: 'Duties', level: 2 })).toBeVisible({ timeout: 60_000 });
        await expect(shown.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: 'Duties' })).toBeVisible();
        await shoot(shown, 'entitlement-growth');
      } finally {
        if (snapshot) await restoreEntitlements(snapshot);
      }
    });
  });

  /* ================================================ 5. CROSS-TENANT ===== */

  test.describe('5 cross-tenant', () => {
    test("another tenant's duty ids answer 404 over the API, in both directions", async () => {
      test.skip(!HAVE_DB, 'needs E2E_DATABASE_URL (a second tenant is created in the throwaway database)');
      test.setTimeout(240_000);
      const foreign = await seedForeignDuties(RUN, ws.a.employeeIds.employee);
      try {
        // this tenant's people asking for the other tenant's ids
        const paths: Array<['GET' | 'PATCH' | 'POST', string]> = [
          ['GET', `/api/work-duties/templates/${foreign.templateId}`],
          ['PATCH', `/api/work-duties/templates/${foreign.templateId}`],
          ['POST', `/api/work-duties/templates/${foreign.templateId}/deactivate`],
          ['GET', `/api/work-duties/occurrences/${foreign.occurrenceId}`],
          ['POST', `/api/work-duties/occurrences/${foreign.occurrenceId}/complete`],
          ['POST', `/api/work-duties/checks/${foreign.checkId}/complete`],
          ['POST', `/api/work-duties/checks/${foreign.checkId}/uncomplete`],
          ['POST', `/api/work-duties/handovers/${foreign.handoverId}/acknowledge`],
        ];
        for (const role of ['employee', 'manager', 'hr'] as const) {
          for (const [method, path] of paths) {
            const r = await ws.a.raw(role, method, path, method === 'PATCH' ? { name: 'x' } : undefined);
            expect(r.status, `${role} ${method} ${path} -> ${JSON.stringify(r.body)?.slice(0, 200)}`).toBe(404);
          }
        }
        // and they never show up in a list, a recipient search, or the page
        const occ = await ws.a.api('hr', 'GET', '/api/work-duties/occurrences?take=100');
        expect(JSON.stringify(occ)).not.toContain(foreign.occurrenceId);
        const hands = await ws.a.api('hr', 'GET', '/api/work-duties/handovers?take=100');
        expect(JSON.stringify(hands)).not.toContain(foreign.handoverId);
        const people = await ws.a.api('employee', 'GET', '/api/work-duties/handover-recipients');
        expect(JSON.stringify(people)).not.toContain('X-' + RUN);
        const page = await ws.a.open('hr', '/work/duties');
        await expect(page.getByText('Foreign duty', { exact: false })).toHaveCount(0);
        // the refused writes changed nothing
        const still = await withGuiDb((db) =>
          db.query(`select "isActive" from "DutyTemplate" where id = $1`, [foreign.templateId]),
        );
        expect(still.rows[0].isActive).toBe(true);
        // the other direction, when a real second tenant with users is configured
        if (ws.b) {
          for (const [method, path] of [
            ['GET', `/api/work-duties/templates/${tplReqId}`],
            ['GET', `/api/work-duties/occurrences/${occReqId}`],
            ['POST', `/api/work-duties/occurrences/${occReqId}/complete`],
          ] as const) {
            expect((await ws.b.raw('hr', method, path)).status, `${method} ${path}`).toBe(404);
          }
        }
      } finally {
        await foreign.cleanup();
      }
    });
  });

  /* ================================================== 6. RESPONSIVE ===== */

  test.describe('6 responsive', () => {
    const VIEWPORTS = [
      { width: 1280, height: 900 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ];
    for (const viewport of VIEWPORTS) {
      test(`duties at ${viewport.width}x${viewport.height}`, async () => {
        test.setTimeout(240_000);
        // the employee sees the duties and handovers; the admin sees the templates
        const page = await ws.a.contexts.employee.newPage();
        ws.a.pages.add(page);
        await page.setViewportSize(viewport);
        await page.goto(`${WEB}/work/duties?tenant=${A_SLUG}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
        await expect(page.getByRole('radio', { name: 'My duties' })).toBeVisible({ timeout: 60_000 });
        const fits = async (label: string) => {
          expect(await scrollsSideways(page), `${label} scrolls sideways at ${viewport.width}`).toBe(false);
        };
        const dialogFits = async () => {
          const box = (await page.getByRole('dialog').boundingBox())!;
          expect(box.x).toBeGreaterThanOrEqual(-1);
          expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
          expect(box.height, 'dialog is taller than the viewport').toBeLessThanOrEqual(viewport.height + 1);
          expect(await scrollsSideways(page)).toBe(false);
        };

        await filterDutiesTo(page, NAME_REQ, DUTY_DATE);
        await findRow(page, NAME_REQ);
        await fits('my duties');
        await shoot(page, `responsive-duties-${viewport.width}`);
        await page.getByRole('button', { name: `Open ${NAME_REQ} for ${DUTY_DATE}` }).click();
        await expect(page.getByRole('dialog').getByRole('list', { name: 'Checklist' })).toBeVisible();
        await dialogFits();
        await shoot(page, `responsive-occurrence-${viewport.width}`);
        await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

        await pickView(page, 'Handovers');
        await fits('handovers');
        await page.getByRole('button', { name: 'New handover' }).click();
        await dialogFits();
        await shoot(page, `responsive-handover-${viewport.width}`);
        await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

        const admin = await ws.a.contexts.hr.newPage();
        ws.a.pages.add(admin);
        await admin.setViewportSize(viewport);
        await admin.goto(`${WEB}/work/duties?tenant=${A_SLUG}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
        await pickView(admin, 'Templates');
        await findRow(admin, NAME_REQ);
        expect(await scrollsSideways(admin), `templates scroll sideways at ${viewport.width}`).toBe(false);
        await shoot(admin, `responsive-templates-${viewport.width}`);
        await admin.getByRole('button', { name: 'New template' }).first().click();
        const box = (await admin.getByRole('dialog').boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(-1);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
        expect(box.height, 'template dialog is taller than the viewport').toBeLessThanOrEqual(viewport.height + 1);
        expect(await scrollsSideways(admin)).toBe(false);
        await shoot(admin, `responsive-template-dialog-${viewport.width}`);
      });
    }
  });

  /* ============================================== 7. ACCESSIBILITY ===== */

  test.describe('7 accessibility', () => {
    test('axe finds nothing blocking on the duties screens and dialogs', async () => {
      test.setTimeout(300_000);
      const page = await ws.a.open('employee', '/work/duties');
      await expect(page.getByRole('radio', { name: 'My duties' })).toBeVisible();
      const found: string[] = [];
      const audit = async (label: string) => {
        const violations = blocking(await auditPage(page));
        if (violations.length) found.push(`${label}: ${describeViolations(violations)}`);
      };
      await filterDutiesTo(page, NAME_REQ, DUTY_DATE);
      await findRow(page, NAME_REQ);
      await audit('my duties');
      await page.getByRole('button', { name: `Open ${NAME_REQ} for ${DUTY_DATE}` }).click();
      await expect(page.getByRole('dialog').getByRole('list', { name: 'Checklist' })).toBeVisible();
      await audit('occurrence dialog');
      await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
      await pickView(page, 'Handovers');
      await audit('handovers');
      const admin = await ws.a.open('hr', '/work/duties');
      await pickView(admin, 'Templates');
      await findRow(admin, NAME_REQ);
      const auditAdmin = async (label: string) => {
        const violations = blocking(await auditPage(admin));
        if (violations.length) found.push(`${label}: ${describeViolations(violations)}`);
      };
      await auditAdmin('templates');
      await admin.getByRole('button', { name: 'New template' }).first().click();
      await auditAdmin('template dialog');
      expect(found, found.join('\n')).toEqual([]);
    });

    test('the checklist and dialogs work from the keyboard: Space ticks, Tab stays inside, Escape closes and returns focus', async () => {
      test.setTimeout(300_000);
      const page = await ws.a.open('employee', '/work/duties');
      await filterDutiesTo(page, NAME_SIMPLE, DUTY_DATE);
      const opener = page.getByRole('button', { name: `Open ${NAME_SIMPLE} for ${DUTY_DATE}` });
      await expect(opener).toBeVisible({ timeout: 30_000 });
      // pressed until the dialog opens: the first Enter can land before the page is interactive
      const dialog = page.getByRole('dialog');
      await expect(async () => {
        await opener.focus();
        await page.keyboard.press('Enter');
        await expect(dialog.getByRole('list', { name: 'Checklist' })).toBeVisible({ timeout: 4_000 });
      }).toPass({ timeout: 45_000 });

      const box = dialog.getByRole('checkbox', { name: CHECK_SWEEP });
      // Focus stays on the very same checkbox through ten ticks and unticks, whether read
      // at once or after the API has answered, and Tab never drops out of the dialog.
      // Repeated so an intermittent loss of focus shows up here, not in a customer's hands.
      const sweep = await box.elementHandle();
      for (let i = 0; i < 10; i += 1) {
        await box.focus();
        await page.keyboard.press('Space');
        for (const when of ['at once', 'after the answer']) {
          if (when === 'after the answer') await page.waitForTimeout(700);
          const same = await sweep!.evaluate((el) => el.isConnected && document.activeElement === el);
          expect(same, `tick ${i + 1}: focus left the checkbox ${when}`).toBe(true);
        }
        await page.keyboard.press('Tab');
        const afterTab = await dialog.evaluate((el) => el.contains(document.activeElement) && document.activeElement !== el);
        expect(afterTab, `tick ${i + 1}: Tab left the dialog`).toBe(true);
      }
      await box.focus();
      await page.keyboard.press('Space');
      await expect(box).toBeChecked();
      await expect
        .poll(async () => {
          const occ = await ws.a.api('employee', 'GET', `/api/work-duties/occurrences/${occSimpleId}`);
          return (occ.checks as Array<{ label: string; completedAt: string | null }>).find((c) => c.label === CHECK_SWEEP)
            ?.completedAt;
        })
        .toBeTruthy();

      // focus never leaves the dialog while tabbing around it
      for (let i = 0; i < 12; i += 1) {
        await page.keyboard.press('Tab');
        const inside = await dialog.evaluate((el) => el.contains(document.activeElement));
        const active = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 160));
        expect(inside, `focus escaped the dialog on Tab ${i + 1}: ${active}`).toBe(true);
      }
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(opener).toBeFocused();
    });
  });
});
