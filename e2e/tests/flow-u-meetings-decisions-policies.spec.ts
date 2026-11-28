import { expect, test, type Locator, type Page } from '@playwright/test';
import { BASE_URLS } from '../playwright.config';
import { workPassword, workTenant } from '../fixtures/work-sessions';
import {
  auditPage,
  blocking,
  describeViolations,
  scrollsSideways,
} from '../fixtures/accessibility';
import {
  Workspace,
  alertText,
  choose,
  escapeRe,
  field,
  newTenantTarget,
  RUN,
  WEB,
  ymd,
} from '../fixtures/work-hardening';
import {
  guiDatabaseUrl,
  restoreEntitlements,
  setTenantPlan,
  snapshotEntitlements,
  withGuiDb,
  type EntitlementSnapshot,
} from '../fixtures/work-database';

/**
 * Flow U - meetings, the decision register and daily-update policies (DP-MASTER
 * WP-28.S3 and WP-27.S3), driven through the real UI of apps/web with an assertion
 * on the persisted outcome (through the API) beside every visible one.
 *
 *   1  EMPLOYEE   - sees the meetings they attend, the decision an action came
 *                   from, the action in My work; cannot manage what they only read;
 *                   a chain step they may not see reads "Not visible"
 *   2  MANAGER    - plans, holds and records attendance for a meeting; records,
 *                   supersedes and reverses decisions; adds an action; the report
 *   3  HR / ADMIN - scoped daily-update policy CRUD, the effective policy, running
 *                   the escalation
 *   4  ISOLATION  - another tenant's ids are 404 over the API
 *   5  ENTITLEMENT- Starter refuses the pages and the API, Growth allows them
 *   6  RESPONSIVE - no sideways scroll, dialogs fit, three widths
 *   7  KEYBOARD   - dialogs are focus-trapped and escapable; the chain is operable
 *
 * Environment: as Flow R/S (E2E_WEB_URL, E2E_API_URL, E2E_TENANT_SLUG,
 * E2E_WEB_PASSWORD, E2E_DATABASE_URL for the DB-backed journeys).
 *
 * REPEATABILITY: every record carries the per-run suffix; decisions and meetings
 * have no delete API by design, so on a throwaway stack the run removes its own
 * rows through the guarded DB fixture (names starting "E2E-U <run>").
 */

const A_SLUG = workTenant()?.slug ?? '';
const HAVE_DB = Boolean(guiDatabaseUrl());
const P = `E2E-U ${RUN}`;

let ws: Workspace;
const snapshots: EntitlementSnapshot[] = [];
const cleanups: Array<{ what: string; run: () => Promise<unknown> }> = [];

const at = (days: number, hour = 10) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

async function createMeeting(
  body: Record<string, unknown> = {},
  by: 'manager' | 'hr' = 'manager',
) {
  return (await ws.api(by, 'POST', '/api/work-meetings', {
    title: `${P} sync ${Math.random().toString(36).slice(2, 6)}`,
    agenda: 'Roadmap',
    scheduledAt: at(1),
    facilitatorEmployeeId: ws.employeeIds.manager,
    attendeeEmployeeIds: [ws.employeeIds.employee],
    ...body,
  })) as { id: string; title: string };
}

async function createDecision(body: Record<string, unknown> = {}) {
  return (await ws.api('manager', 'POST', '/api/work-decisions', {
    title: `${P} decision ${Math.random().toString(36).slice(2, 6)}`,
    decision: 'Use vendor A',
    ...body,
  })) as { id: string; title: string };
}

function dialogOf(page: Page): Locator {
  return page.getByRole('dialog');
}

/** Open a decision from the register by its title. */
async function openDecision(page: Page, title: string) {
  await page.getByPlaceholder('Search decisions').fill(title);
  await page.getByRole('button', { name: title, exact: true }).first().click();
  await expect(dialogOf(page).getByRole('heading', { name: title })).toBeVisible();
}

/** A click made before hydration is lost; retry until the dialog is really open. */
async function openDialogWith(page: Page, opener: Locator) {
  await expect(async () => {
    await opener.click();
    await expect(dialogOf(page)).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
}

async function openMeeting(page: Page, title: string) {
  await page.getByPlaceholder('Search meetings').fill(title);
  await page.getByRole('button', { name: title, exact: true }).first().click();
  await expect(dialogOf(page).getByRole('heading', { name: title })).toBeVisible();
}

test.describe('Flow U - meetings, decisions and policies', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(600_000);
    test.skip(!workPassword(), 'E2E_WEB_PASSWORD is unset: the synthetic users share a password that is never committed');
    test.skip(!A_SLUG, 'E2E_TENANT_SLUG is unset (e.g. dijipeople-demo)');
    const apiUp = await fetch(`${BASE_URLS.api}/api/health`).then((r) => r.status < 500).catch(() => false);
    test.skip(!apiUp, `the API is not reachable at ${BASE_URLS.api}`);

    if (HAVE_DB) snapshots.push(await snapshotEntitlements(A_SLUG));
    ws = new Workspace(WEB, newTenantTarget(A_SLUG));
    await ws.signIn(browser, ['employee', 'manager', 'hr', 'ceo']);

    // Warm every route once so no test absorbs Next dev's first-hit compile.
    const warm = await ws.contexts.ceo.newPage();
    for (const path of ['/work/meetings', '/work/decisions', '/settings/daily-updates', '/work']) {
      await warm.goto(`${WEB}${path}`, { waitUntil: 'domcontentloaded', timeout: 120_000 }).catch(() => undefined);
    }
    await warm.close();
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      let n = 0;
      for (const page of ws?.pages ?? []) {
        n += 1;
        await page.screenshot({ path: testInfo.outputPath(`failure-page-${n}.png`), fullPage: true }).catch(() => undefined);
      }
    }
    await ws?.releaseAll();
  });

  test.afterAll(async () => {
    for (const cleanup of cleanups.reverse()) await cleanup.run().catch(() => undefined);
    if (HAVE_DB) {
      for (const snapshot of snapshots) await restoreEntitlements(snapshot).catch(() => undefined);
      await withGuiDb(async (db) => {
        // Decisions and meetings have no delete API (by design): remove this run's rows.
        await db.query(`delete from "DecisionAction" where "decisionId" in (select id from "WorkDecision" where title like $1)`, [`${P}%`]);
        await db.query(`delete from "WorkDecision" where title like $1`, [`${P}%`]);
        await db.query(`delete from "MeetingRecord" where title like $1`, [`${P}%`]);
      }).catch(() => undefined);
    }
    await ws?.close();
  });

  /* ======================================================== 1. EMPLOYEE ==== */

  test.describe('1 employee', () => {
    test.describe.configure({ mode: 'serial' });
    let meeting: { id: string; title: string };
    let decision: { id: string; title: string };
    let actionTitle = '';
    let hiddenOrigin: { id: string; title: string };
    let successor: { id: string; title: string };

    test.beforeAll(async () => {
      meeting = await createMeeting({ title: `${P} employee meeting` });
      decision = await createDecision({ title: `${P} employee decision`, meetingId: meeting.id });
      actionTitle = `${P} employee action`;
      const action = await ws.api('manager', 'POST', `/api/work-decisions/${decision.id}/actions`, {
        title: actionTitle,
        ownerEmployeeId: ws.employeeIds.employee,
        dueAt: at(3),
      });
      cleanups.push({
        what: 'archive action',
        run: () => ws.raw('manager', 'POST', `/api/work-items/${action.workItemId}/archive`),
      });
      // A chain whose earlier step the employee cannot see: A (manager only) -> B (carries the employee's action).
      hiddenOrigin = await createDecision({ title: `${P} hidden origin` });
      successor = (await ws.api('manager', 'POST', `/api/work-decisions/${hiddenOrigin.id}/supersede`, {
        decision: 'Use vendor B instead',
        title: `${P} visible successor`,
      })) as { id: string; title: string };
      const second = await ws.api('manager', 'POST', `/api/work-decisions/${successor.id}/actions`, {
        title: `${P} successor action`,
        ownerEmployeeId: ws.employeeIds.employee,
        dueAt: at(4),
      });
      cleanups.push({
        what: 'archive action',
        run: () => ws.raw('manager', 'POST', `/api/work-items/${second.workItemId}/archive`),
      });
    });

    test('sees the meeting they attend, with its agenda and attendance, but not one they do not', async () => {
      const unrelated = await createMeeting({ title: `${P} not for the employee`, attendeeEmployeeIds: [] });
      const page = await ws.open('employee', '/work/meetings');
      await expect(page.getByRole('heading', { name: 'Meetings', exact: true, level: 2 })).toBeVisible({ timeout: 60_000 });
      await page.getByPlaceholder('Search meetings').fill(P);
      await expect(page.getByRole('button', { name: meeting.title, exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: unrelated.title, exact: true })).toHaveCount(0);
      await openMeeting(page, meeting.title);
      const dialog = dialogOf(page);
      await expect(dialog.getByText('Roadmap')).toBeVisible();
      await expect(dialog.getByRole('list', { name: 'Invited people' })).toContainText('Demo Employee');
      await expect(dialog.getByRole('list', { name: 'Decisions in this meeting' })).toContainText(decision.title);
      // The API agrees: the unrelated meeting is not theirs to read.
      expect((await ws.raw('employee', 'GET', `/api/work-meetings/${unrelated.id}`)).status).toBe(404);
      expect((await ws.raw('employee', 'GET', `/api/work-meetings/${meeting.id}`)).status).toBe(200);
    });

    test('an action assigned from a decision is in their work, and the decision it came from is readable', async () => {
      const work = await ws.open('employee', '/work');
      await expect(work.getByText(actionTitle).first()).toBeVisible({ timeout: 60_000 });

      const page = await ws.open('employee', '/work/decisions');
      await openDecision(page, decision.title);
      const dialog = dialogOf(page);
      await expect(dialog.getByRole('list', { name: 'Decision actions' })).toContainText(actionTitle);
      await expect(dialog.getByText('Use vendor A')).toBeVisible();
      const read = await ws.raw('employee', 'GET', `/api/work-decisions/${decision.id}`);
      expect(read.status).toBe(200);
      // Reading it is not managing it.
      const refused = await ws.raw('employee', 'POST', `/api/work-decisions/${decision.id}/reverse`, { reason: 'not mine' });
      expect(refused.status).toBe(403);
    });

    test('the open-actions report lists the decision they own an action of, and only their own action', async () => {
      const page = await ws.open('employee', '/work/decisions');
      await page.getByRole('radio', { name: 'Open actions' }).click();
      const panel = page.getByRole('region', { name: 'Open actions' });
      await expect(panel.getByRole('button', { name: decision.title })).toBeVisible({ timeout: 60_000 });
      await expect(panel).toContainText(actionTitle);
      const report = await ws.api('employee', 'GET', '/api/work-decisions/open-actions?take=100');
      expect((report.items as Array<{ id: string }>).map((d) => d.id)).toContain(decision.id);
    });

    test('a chain step they cannot see reads "Not visible", never an error', async () => {
      const page = await ws.open('employee', `/work/decisions?open=${successor.id}`);
      const dialog = dialogOf(page);
      await expect(dialog.getByRole('heading', { name: successor.title })).toBeVisible({ timeout: 60_000 });
      const chain = dialog.getByRole('list', { name: 'Decision chain' });
      await expect(chain.getByText('Not visible')).toBeVisible();
      await expect(chain).not.toContainText(hiddenOrigin.title);
      await expect(dialog.getByRole('alert')).toHaveCount(0);
      const detail = await ws.api('employee', 'GET', `/api/work-decisions/${successor.id}`);
      expect(detail.previous).toEqual([{ id: null, link: 'HIDDEN_LINK' }]);
      expect(detail.supersedesId).toBeNull();
    });
  });

  /* ========================================================= 2. MANAGER ===== */

  test.describe('2 manager', () => {
    test.describe.configure({ mode: 'serial' });
    const title = `${P} planning`;
    let meetingId = '';
    const decisionTitle = `${P} adopt the vendor`;

    test('plans a meeting, holds it (the agenda locks) and records who came', async () => {
      const page = await ws.open('manager', '/work/meetings');
      await page.getByRole('button', { name: 'New meeting', exact: true }).click();
      let dialog = dialogOf(page);
      await expect(dialog.getByRole('heading', { name: 'New meeting' })).toBeVisible();

      // Empty and short input is refused with a message, before any request.
      await dialog.getByRole('button', { name: 'Create meeting' }).click();
      expect(await alertText(dialog)).toMatch(/title/i);

      await field(dialog, 'Title').fill(title);
      await field(dialog, 'Scheduled date').fill(ymd(2));
      await field(dialog, 'Scheduled time').fill('10:30');
      await field(dialog, 'Agenda').fill('1. Vendor\n2. Hiring');
      await dialog.getByRole('checkbox', { name: /Demo Employee/ }).check();
      await dialog.getByRole('button', { name: 'Create meeting' }).click();

      // The detail opens on the new meeting.
      dialog = dialogOf(page);
      await expect(dialog.getByRole('heading', { name: title })).toBeVisible({ timeout: 30_000 });
      await expect(dialog.getByText('Planned')).toBeVisible();
      const created = (await ws.api('manager', 'GET', `/api/work-meetings?status=PLANNED&take=100`)).items as Array<{ id: string; title: string; agenda: string; attendees: Array<{ employeeId: string }> }>;
      const row = created.find((m) => m.title === title)!;
      expect(row).toBeTruthy();
      meetingId = row.id;
      expect(row.agenda).toBe('1. Vendor\n2. Hiring');
      expect(row.attendees.map((a) => a.employeeId)).toContain(ws.employeeIds.employee);

      // Hold it with notes.
      await dialog.getByRole('button', { name: 'Hold', exact: true }).click();
      dialog = dialogOf(page);
      await expect(dialog.getByRole('heading', { name: `Hold ${title}` })).toBeVisible();
      await field(dialog, 'Notes').fill('Vendor A agreed');
      await dialog.getByRole('button', { name: 'Hold meeting' }).click();
      dialog = dialogOf(page);
      await expect(dialog.getByRole('heading', { name: title })).toBeVisible({ timeout: 30_000 });
      await expect(dialog.getByText('Held', { exact: true })).toBeVisible();
      await expect(dialog.getByText('Vendor A agreed')).toBeVisible();
      // Hold and Cancel are gone; the agenda is locked at the API too.
      await expect(dialog.getByRole('button', { name: 'Hold', exact: true })).toHaveCount(0);
      const locked = await ws.raw('manager', 'PATCH', `/api/work-meetings/${meetingId}`, { agenda: 'changed after the fact' });
      expect(locked.status).toBe(409);
      // Edit offers the notes alone.
      await dialog.getByRole('button', { name: 'Edit', exact: true }).click();
      const edit = dialogOf(page);
      await expect(edit.getByRole('heading', { name: 'Edit meeting' })).toBeVisible();
      await expect(edit.getByLabel(/^Agenda/)).toHaveCount(0);
      await expect(edit.getByLabel(/^Notes/)).toBeVisible();
      await edit.getByRole('button', { name: 'Cancel', exact: true }).click();

      // Attendance.
      dialog = dialogOf(page);
      await dialog.getByRole('checkbox', { name: /Demo Employee attended/ }).check();
      await dialog.getByRole('button', { name: 'Save attendance' }).click();
      await expect(dialog.getByText('Attendance saved.')).toBeVisible();
      const after = await ws.api('manager', 'GET', `/api/work-meetings/${meetingId}`);
      expect(after.status).toBe('HELD');
      expect((after.attendees as Array<{ employeeId: string; attended: boolean }>).find((a) => a.employeeId === ws.employeeIds.employee)?.attended).toBe(true);
    });

    test('records a decision in the held meeting, supersedes it, and the chain shows both', async () => {
      const page = await ws.open('manager', '/work/meetings');
      await openMeeting(page, title);
      await dialogOf(page).getByRole('button', { name: 'Record decision', exact: true }).click();
      let dialog = dialogOf(page);
      await expect(dialog.getByRole('heading', { name: `Record decision for ${title}` })).toBeVisible();
      await dialog.getByRole('button', { name: 'Record decision', exact: true }).click();
      expect(await alertText(dialog)).toMatch(/title/i);
      await field(dialog, 'Title').fill(decisionTitle);
      await field(dialog, 'Decision').fill('Go with vendor A');
      await dialog.getByRole('button', { name: 'Record decision', exact: true }).click();
      // Back on the meeting, which now lists it.
      dialog = dialogOf(page);
      await expect(dialog.getByRole('list', { name: 'Decisions in this meeting' })).toContainText(decisionTitle, { timeout: 30_000 });
      const stored = (await ws.api('manager', 'GET', `/api/work-decisions?meetingId=${meetingId}&take=50`)).items as Array<{ id: string; title: string; status: string }>;
      expect(stored.find((d) => d.title === decisionTitle)?.status).toBe('DECIDED');
      await dialog.getByRole('button', { name: 'Close' }).click();

      // Supersede it from the register.
      const register = await ws.open('manager', '/work/decisions');
      await openDecision(register, decisionTitle);
      let detail = dialogOf(register);
      await detail.getByRole('button', { name: 'Supersede', exact: true }).click();
      detail = dialogOf(register);
      await expect(detail.getByRole('heading', { name: `Supersede ${decisionTitle}` })).toBeVisible();
      await detail.getByRole('button', { name: 'Supersede decision' }).click();
      expect(await alertText(detail)).toMatch(/new decision/i);
      await field(detail, 'New decision').fill('Go with vendor B');
      await detail.getByRole('button', { name: 'Supersede decision' }).click();
      detail = dialogOf(register);
      await expect(detail.getByRole('heading', { name: decisionTitle })).toBeVisible({ timeout: 30_000 });
      await expect(detail.getByText('Go with vendor B').first()).toBeVisible();
      const chain = detail.getByRole('list', { name: 'Decision chain' });
      await expect(chain.getByRole('listitem')).toHaveCount(2);
      await expect(chain.getByRole('listitem').first()).toContainText('Superseded');
      await expect(chain.getByRole('listitem').nth(1)).toContainText('Decided');
      // The old one is kept, not rewritten.
      const old = stored.find((d) => d.title === decisionTitle)!;
      const oldNow = await ws.api('manager', 'GET', `/api/work-decisions/${old.id}`);
      expect(oldNow.status).toBe('SUPERSEDED');
      expect(oldNow.decision).toBe('Go with vendor A');
      expect(oldNow.next).toHaveLength(1);
      // Keyboard: a chain step opens its decision.
      await chain.getByRole('button', { name: `Open ${decisionTitle}` }).focus();
      await register.keyboard.press('Enter');
      await expect(dialogOf(register).getByText('Go with vendor A').first()).toBeVisible({ timeout: 30_000 });
      await expect(dialogOf(register).getByText('Superseded', { exact: true }).first()).toBeVisible();
    });

    test('reverses a decision with a required reason, shown from what was stored', async () => {
      const target = await createDecision({ title: `${P} reversible` });
      const page = await ws.open('manager', '/work/decisions');
      await openDecision(page, target.title);
      await dialogOf(page).getByRole('button', { name: 'Reverse', exact: true }).click();
      let dialog = dialogOf(page);
      await expect(dialog.getByRole('heading', { name: `Reverse ${target.title}` })).toBeVisible();
      await dialog.getByRole('button', { name: 'Reverse decision' }).click();
      expect(await alertText(dialog)).toMatch(/reason/i);
      await field(dialog, 'Reason').fill('no');
      await dialog.getByRole('button', { name: 'Reverse decision' }).click();
      expect(await alertText(dialog)).toMatch(/at least 3/i);
      expect((await ws.api('manager', 'GET', `/api/work-decisions/${target.id}`)).status).toBe('DECIDED');
      await field(dialog, 'Reason').fill('Vendor withdrew the offer');
      await dialog.getByRole('button', { name: 'Reverse decision' }).click();
      dialog = dialogOf(page);
      await expect(dialog.getByText('Reversed: Vendor withdrew the offer')).toBeVisible({ timeout: 30_000 });
      const stored = await ws.api('manager', 'GET', `/api/work-decisions/${target.id}`);
      expect(stored).toMatchObject({ status: 'REVERSED', reversedReason: 'Vendor withdrew the offer' });
      // A reversed decision takes no more actions or reversals.
      await expect(dialog.getByRole('button', { name: 'Reverse', exact: true })).toHaveCount(0);
      await expect(dialog.getByRole('button', { name: 'Add action', exact: true })).toHaveCount(0);
      expect((await ws.raw('manager', 'POST', `/api/work-decisions/${target.id}/reverse`, { reason: 'twice' })).status).toBe(409);
    });

    test('adds an action: a real work item, in the report with its owner, and the register pages and filters', async () => {
      const target = await createDecision({ title: `${P} needs work` });
      const page = await ws.open('manager', '/work/decisions');
      await openDecision(page, target.title);
      await dialogOf(page).getByRole('button', { name: 'Add action', exact: true }).click();
      let dialog = dialogOf(page);
      await expect(dialog.getByRole('heading', { name: `Add action to ${target.title}` })).toBeVisible();
      await dialog.getByRole('button', { name: 'Add action', exact: true }).click();
      expect(await alertText(dialog)).toMatch(/what has to be done/i);
      const actionTitle = `${P} sign the contract`;
      await field(dialog, 'Action').fill(actionTitle);
      await choose(page, dialog, 'Owner', /Demo Employee/);
      await field(dialog, 'Due date').fill(ymd(5));
      await field(dialog, 'Due time').fill('12:00');
      await dialog.getByRole('button', { name: 'Add action', exact: true }).click();
      dialog = dialogOf(page);
      await expect(dialog.getByRole('list', { name: 'Decision actions' })).toContainText(actionTitle, { timeout: 30_000 });
      await expect(dialog.getByRole('list', { name: 'Decision actions' })).toContainText('Demo Employee');
      const stored = await ws.api('manager', 'GET', `/api/work-decisions/${target.id}`);
      expect(stored.actions).toHaveLength(1);
      cleanups.push({
        what: 'archive action',
        run: () => ws.raw('manager', 'POST', `/api/work-items/${stored.actions[0].workItemId}/archive`),
      });
      const item = await ws.api('employee', 'GET', `/api/work-items/${stored.actions[0].workItemId}`);
      expect(item).toMatchObject({ kind: 'TASK', ownerEmployeeId: ws.employeeIds.employee });
      await dialog.getByRole('button', { name: 'Close' }).click();

      // The report lists it with its owner and due date.
      await page.getByRole('radio', { name: 'Open actions' }).click();
      const panel = page.getByRole('region', { name: 'Open actions' });
      await expect(panel).toContainText(actionTitle, { timeout: 30_000 });
      await expect(panel).toContainText('Demo Employee');

      // The register filters by status, and pages with the exact total.
      await page.getByRole('radio', { name: 'Register' }).click();
      await choose(page, page, 'Status', 'Reversed');
      const reversed = await ws.api('manager', 'GET', '/api/work-decisions?status=REVERSED&take=10&skip=0');
      await expect(page.getByRole('status').filter({ hasText: /^Decisions/ })).toContainText(`of ${reversed.total}`);
      const all = await ws.api('manager', 'GET', '/api/work-decisions?take=1');
      expect(all.total).toBeGreaterThan(0);
    });
  });

  /* ==================================================== 3. HR AND ADMIN ===== */

  test.describe('3 hr and admin', () => {
    test.describe.configure({ mode: 'serial' });

    test('scoped policy: create, edit, effective policy, run escalation, delete', async () => {
      test.setTimeout(240_000);
      const units = await ws.api('hr', 'GET', '/api/business-units');
      const list = (Array.isArray(units) ? units : units.items) as Array<{ id: string; name: string }>;
      const before = (await ws.api('hr', 'GET', '/api/daily-updates/scope-policies')).items as Array<{ id: string; businessUnitId: string | null; teamId: string | null }>;
      const taken = new Set(before.map((p) => p.businessUnitId));
      const unit = list.find((u) => !taken.has(u.id)) ?? list[0];
      const existing = before.find((p) => p.businessUnitId === unit.id);
      cleanups.push({
        what: 'restore the scoped policy',
        run: async () => {
          const now = (await ws.api('hr', 'GET', '/api/daily-updates/scope-policies')).items as Array<{ id: string; businessUnitId: string | null }>;
          const mine = now.find((p) => p.businessUnitId === unit.id);
          if (existing) {
            const { id: _id, teamId: _team, ...fields } = existing as Record<string, unknown>;
            void _id;
            void _team;
            await ws.raw('hr', 'PUT', '/api/daily-updates/scope-policies', fields);
          } else if (mine) {
            await ws.raw('hr', 'DELETE', `/api/daily-updates/scope-policies/${mine.id}`);
          }
        },
      });

      const page = await ws.open('hr', '/settings/daily-updates');
      await expect(page.getByRole('heading', { name: 'Scoped policies', exact: true })).toBeVisible({ timeout: 60_000 });
      await page.getByRole('button', { name: 'Add scoped policy' }).click();
      let dialog = dialogOf(page);
      await expect(dialog.getByRole('heading', { name: 'New scoped policy' })).toBeVisible();
      await dialog.getByRole('button', { name: 'Save scoped policy' }).click();
      expect(await alertText(dialog)).toMatch(/team/i);
      await choose(page, dialog, 'Applies to', 'Business unit');
      await dialog.getByRole('button', { name: 'Save scoped policy' }).click();
      expect(await alertText(dialog)).toMatch(/business unit/i);
      await choose(page, dialog, 'Business unit', new RegExp(escapeRe(unit.name)));
      await choose(page, dialog, 'Cadence', 'Per shift');
      await field(dialog, 'Deadline (minutes after shift)').fill('30');
      await field(dialog, 'Escalate after (minutes)').fill('45');
      await field(dialog, 'Time zone').fill('Asia/Karachi');
      await dialog.getByRole('button', { name: 'Save scoped policy' }).click();
      await expect(dialogOf(page)).toHaveCount(0, { timeout: 30_000 });
      const row = page.getByRole('row').filter({ hasText: `Business unit: ${unit.name}` });
      await expect(row).toContainText('Per shift');
      await expect(row).toContainText('Escalates after 45 min');
      const saved = ((await ws.api('hr', 'GET', '/api/daily-updates/scope-policies')).items as Array<Record<string, unknown>>).find((p) => p.businessUnitId === unit.id);
      expect(saved).toMatchObject({ cadence: 'PER_SHIFT', deadlineMinutes: 30, escalateAfterMinutes: 45, timezone: 'Asia/Karachi' });

      // Edit: escalation off.
      await row.getByRole('button', { name: `Edit Business unit: ${unit.name}` }).click();
      dialog = dialogOf(page);
      await expect(dialog.getByRole('heading', { name: 'Edit scoped policy' })).toBeVisible();
      await field(dialog, 'Escalate after (minutes)').fill('');
      await dialog.getByRole('button', { name: 'Save scoped policy' }).click();
      await expect(dialogOf(page)).toHaveCount(0, { timeout: 30_000 });
      await expect(row).toContainText('No escalation');
      const edited = ((await ws.api('hr', 'GET', '/api/daily-updates/scope-policies')).items as Array<Record<string, unknown>>).find((p) => p.businessUnitId === unit.id);
      expect(edited?.escalateAfterMinutes).toBeNull();

      // Effective policy of a chosen employee agrees with the API.
      await choose(page, page, 'Employee', /Demo Employee/);
      await page.getByRole('button', { name: 'Show effective policy' }).click();
      const result = page.getByRole('group', { name: 'Effective policy result' });
      await expect(result).toBeVisible({ timeout: 30_000 });
      const effective = await ws.api('hr', 'GET', `/api/daily-updates/policy/effective?employeeId=${ws.employeeIds.employee}`);
      const label = { TEAM: 'Team policy', BUSINESS_UNIT: 'Business unit policy', TENANT: 'Tenant policy' }[effective.source as 'TEAM'];
      await expect(result).toContainText(label);

      // Run escalation for a day that has not reached its deadline: counts, no notifications.
      await field(page, 'Day').fill(ymd(30));
      await page.getByRole('button', { name: 'Run escalation now' }).click();
      const counts = page.getByRole('list', { name: 'Escalation result' });
      await expect(counts.getByRole('listitem')).toHaveCount(5, { timeout: 30_000 });
      for (const name of ['Evaluated', 'Escalated', 'Already escalated', 'No manager', 'Failed']) {
        await expect(counts).toContainText(name);
      }
      // The same run over the API is idempotent and returns the same shape.
      const run = await ws.api('hr', 'POST', '/api/daily-updates/escalations/run', { date: ymd(30) });
      expect(Object.keys(run).sort()).toEqual(['alreadyEscalated', 'escalated', 'evaluated', 'failed', 'noManager']);

      // Delete (only when the journey created it).
      await row.getByRole('button', { name: `Delete Business unit: ${unit.name}` }).click();
      dialog = dialogOf(page);
      await expect(dialog.getByRole('heading', { name: new RegExp(`Delete policy for Business unit: ${escapeRe(unit.name)}`) })).toBeVisible();
      await dialog.getByRole('button', { name: 'Delete scoped policy' }).click();
      await expect(row).toHaveCount(0, { timeout: 30_000 });
      const gone = ((await ws.api('hr', 'GET', '/api/daily-updates/scope-policies')).items as Array<Record<string, unknown>>).find((p) => p.businessUnitId === unit.id);
      expect(gone).toBeUndefined();
    });

    test('an employee without the manage permission is refused the policy API', async () => {
      const refused = await ws.raw('employee', 'PUT', '/api/daily-updates/scope-policies', { businessUnitId: globalThis.crypto.randomUUID(), enabled: true });
      expect(refused.status).toBe(403);
      expect((await ws.raw('employee', 'POST', '/api/daily-updates/escalations/run', {})).status).toBe(403);
    });
  });

  /* ======================================================= 4. ISOLATION ===== */

  test.describe('4 cross-tenant', () => {
    test("another tenant's meeting, decision and scoped policy ids are 404 over the API", async () => {
      test.skip(!HAVE_DB, 'needs E2E_DATABASE_URL (a second tenant is created in the throwaway database)');
      const slug = `e2e-u-${RUN}`.toLowerCase();
      const ids = await withGuiDb(async (db) => {
        const customer = await db.query(`select id from "CustomerAccount" limit 1`);
        const tenant = await db.query(
          `insert into "Tenant" (id, "customerAccountId", name, slug, "updatedAt") values (gen_random_uuid()::text, $1, $2, $3, now()) returning id`,
          [customer.rows[0]?.id, `E2E U ${RUN}`, slug],
        );
        const tenantId = tenant.rows[0].id as string;
        const meeting = await db.query(
          `insert into "MeetingRecord" (id, "tenantId", title, "scheduledAt", "updatedAt") values (gen_random_uuid()::text, $1, $2, now(), now()) returning id`,
          [tenantId, `${P} foreign meeting`],
        );
        const decision = await db.query(
          `insert into "WorkDecision" (id, "tenantId", title, decision, "updatedAt") values (gen_random_uuid()::text, $1, $2, 'foreign', now()) returning id`,
          [tenantId, `${P} foreign decision`],
        );
        const policy = await db.query(
          `insert into "DailyUpdateScopePolicy" (id, "tenantId", "workingDays", "updatedAt") values (gen_random_uuid()::text, $1, '{1,2,3}', now()) returning id`,
          [tenantId],
        );
        return { tenantId, meeting: meeting.rows[0].id as string, decision: decision.rows[0].id as string, policy: policy.rows[0].id as string };
      });
      try {
        for (const role of ['employee', 'manager', 'ceo'] as const) {
          expect((await ws.raw(role, 'GET', `/api/work-meetings/${ids.meeting}`)).status, `${role} meeting`).toBe(404);
          expect((await ws.raw(role, 'GET', `/api/work-decisions/${ids.decision}`)).status, `${role} decision`).toBe(404);
        }
        expect((await ws.raw('manager', 'POST', `/api/work-decisions/${ids.decision}/reverse`, { reason: 'cross tenant' })).status).toBe(404);
        expect((await ws.raw('manager', 'PATCH', `/api/work-meetings/${ids.meeting}`, { notes: 'cross tenant' })).status).toBe(404);
        expect((await ws.raw('hr', 'DELETE', `/api/daily-updates/scope-policies/${ids.policy}`)).status).toBe(404);
        // Nor do they appear in a list.
        const listed = await ws.api('ceo', 'GET', '/api/work-decisions?take=100');
        expect((listed.items as Array<{ id: string }>).map((d) => d.id)).not.toContain(ids.decision);
        // A page for it shows no data and no error crash.
        const page = await ws.open('manager', `/work/decisions?open=${ids.decision}`);
        await expect(dialogOf(page).getByRole('alert')).toBeVisible({ timeout: 60_000 });
        await expect(page.getByText('foreign', { exact: true })).toHaveCount(0);
        // The policy row is still there: the refused delete changed nothing.
        const still = await withGuiDb((db) => db.query(`select 1 from "DailyUpdateScopePolicy" where id = $1`, [ids.policy]));
        expect(still.rowCount).toBe(1);
      } finally {
        await withGuiDb(async (db) => {
          await db.query(`delete from "DailyUpdateScopePolicy" where "tenantId" = $1`, [ids.tenantId]);
          await db.query(`delete from "WorkDecision" where "tenantId" = $1`, [ids.tenantId]);
          await db.query(`delete from "MeetingRecord" where "tenantId" = $1`, [ids.tenantId]);
          await db.query(`delete from "Tenant" where id = $1`, [ids.tenantId]);
        });
      }
    });
  });

  /* ==================================================== 5. ENTITLEMENT ===== */

  test.describe('5 entitlement', () => {
    test('Starter refuses the pages and the API; Growth allows them', async () => {
      test.skip(!HAVE_DB, 'needs E2E_DATABASE_URL to change the tenant plan');
      test.setTimeout(900_000);
      const health = await fetch(`${BASE_URLS.api}/api/health`).then((r) => r.json()).catch(() => null);
      const enforced = Boolean(health?.entitlementEnforcement?.enforced);
      const offered = async (present: boolean) => {
        await expect
          .poll(
            async () => {
              const r = await ws.raw('ceo', 'GET', '/work/meetings');
              return !String(r.body).includes('not part of your current subscription');
            },
            { timeout: 180_000, intervals: [5_000], message: `Work management ${present ? 'offered' : 'withdrawn'} by the plan` },
          )
          .toBe(present);
      };
      try {
        await setTenantPlan(A_SLUG, 'growth');
        await offered(true);
        const allowed = await ws.open('manager', '/work/meetings');
        await expect(allowed.getByRole('heading', { name: 'Meetings', exact: true, level: 2 })).toBeVisible({ timeout: 60_000 });
        await expect(allowed.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: 'Meetings' })).toBeVisible();
        expect((await ws.raw('manager', 'GET', '/api/work-meetings')).status).toBe(200);
        await ws.release(allowed);

        await setTenantPlan(A_SLUG, 'starter');
        await offered(false);
        for (const path of ['/work/meetings', '/work/decisions']) {
          const wall = await ws.open('manager', path);
          await expect(wall.getByText(/not part of your current subscription/i)).toBeVisible({ timeout: 60_000 });
          await expect(wall.getByRole('button', { name: 'New meeting' })).toHaveCount(0);
          await ws.release(wall);
        }
        await expect(
          (await ws.open('manager', '/work/meetings')).getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: 'Meetings' }),
        ).toHaveCount(0);
        const api = await ws.raw('manager', 'GET', '/api/work-decisions');
        if (enforced) {
          expect(api.status).toBe(403);
          expect(String(api.body?.errorCode ?? api.body?.code)).toMatch(/ENTITLED/);
        } else {
          expect(api.status, 'REPORT_ONLY lets the call through').toBe(200);
        }
      } finally {
        await setTenantPlan(A_SLUG, 'enterprise').catch(() => undefined);
        for (const snapshot of snapshots) await restoreEntitlements(snapshot).catch(() => undefined);
        await offered(true).catch(() => undefined);
      }
    });
  });

  /* ===================================================== 6. RESPONSIVE ===== */

  test.describe('6 responsive', () => {
    const VIEWPORTS = [
      { width: 1280, height: 900 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ];
    let meeting: { id: string; title: string };
    let decision: { id: string; title: string };

    test.beforeAll(async () => {
      meeting = await createMeeting({ title: `${P} responsive meeting`, agenda: 'A long agenda line '.repeat(8) });
      decision = await createDecision({ title: `${P} responsive decision`, meetingId: meeting.id, decision: 'A long decision text that wraps '.repeat(6) });
      await ws.api('manager', 'POST', `/api/work-decisions/${decision.id}/supersede`, { decision: 'Superseded text that wraps '.repeat(4) });
    });

    const SCREENS: Array<{ key: string; role: 'manager' | 'hr'; path: () => string; opener: string; heading: string | RegExp }> = [
      { key: 'meetings', role: 'manager', path: () => '/work/meetings', opener: 'New meeting', heading: 'Meetings' },
      { key: 'decisions', role: 'manager', path: () => '/work/decisions', opener: 'New decision', heading: 'Decisions' },
      { key: 'daily-update-policies', role: 'hr', path: () => '/settings/daily-updates', opener: 'Add scoped policy', heading: 'Scoped policies' },
    ];

    for (const screen of SCREENS) {
      for (const viewport of VIEWPORTS) {
        test(`${screen.key} at ${viewport.width}x${viewport.height}`, async ({}, testInfo) => {
          test.setTimeout(120_000);
          const page = await ws.contexts[screen.role].newPage();
          ws.pages.add(page);
          await page.setViewportSize(viewport);
          await page.goto(`${WEB}${screen.path()}`, { waitUntil: 'domcontentloaded' });
          await expect(page.getByRole('heading', { name: screen.heading, exact: true }).first()).toBeVisible({ timeout: 60_000 });
          await page.waitForLoadState('networkidle').catch(() => undefined);
          expect(await scrollsSideways(page), 'the page scrolls sideways').toBe(false);
          await page.screenshot({ path: testInfo.outputPath(`${screen.key}-${viewport.width}.png`) });

          await openDialogWith(page, page.getByRole('button', { name: screen.opener, exact: true }));
          const dialog = dialogOf(page);
          const box = (await dialog.boundingBox())!;
          expect(box.x).toBeGreaterThanOrEqual(-1);
          expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
          expect(box.height, 'dialog is taller than the viewport').toBeLessThanOrEqual(viewport.height + 1);
          expect(await scrollsSideways(page), 'the page scrolls sideways with the dialog open').toBe(false);
          await page.screenshot({ path: testInfo.outputPath(`${screen.key}-${viewport.width}-dialog.png`) });
          await ws.release(page);
        });
      }
    }

    for (const viewport of VIEWPORTS) {
      test(`a decision with a chain fits at ${viewport.width}x${viewport.height}`, async ({}, testInfo) => {
        test.setTimeout(120_000);
        const page = await ws.contexts.manager.newPage();
        ws.pages.add(page);
        await page.setViewportSize(viewport);
        await page.goto(`${WEB}/work/decisions?open=${decision.id}`, { waitUntil: 'domcontentloaded' });
        const dialog = dialogOf(page);
        await expect(dialog.getByRole('list', { name: 'Decision chain' })).toBeVisible({ timeout: 60_000 });
        await page.waitForLoadState('networkidle').catch(() => undefined);
        const box = (await dialog.boundingBox())!;
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
        expect(box.height).toBeLessThanOrEqual(viewport.height + 1);
        expect(await scrollsSideways(page)).toBe(false);
        await page.screenshot({ path: testInfo.outputPath(`chain-${viewport.width}.png`) });
        await ws.release(page);
      });
    }
  });

  /* ============================================ 7. KEYBOARD AND ACCESSIBILITY */

  test.describe('7 keyboard and accessibility', () => {
    test('the screens have no blocking accessibility violations', async () => {
      test.setTimeout(240_000);
      for (const [role, path] of [
        ['manager', '/work/meetings'],
        ['manager', '/work/decisions'],
        ['hr', '/settings/daily-updates'],
      ] as const) {
        const page = await ws.open(role, path);
        await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 60_000 });
        await page.waitForLoadState('networkidle').catch(() => undefined);
        const violations = blocking(await auditPage(page));
        expect(violations, `${path}\n${describeViolations(violations)}`).toEqual([]);
        await ws.release(page);
      }
    });

    test('a dialog is focus-trapped and Escape closes it, returning focus to the opener', async () => {
      const page = await ws.open('manager', '/work/decisions');
      const opener = page.getByRole('button', { name: 'New decision', exact: true });
      await opener.focus();
      await page.keyboard.press('Enter');
      const dialog = dialogOf(page);
      await expect(dialog).toBeVisible();
      // Tab many times: focus never leaves the dialog.
      for (let i = 0; i < 25; i += 1) {
        await page.keyboard.press('Tab');
        const inside = await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')));
        expect(inside, `focus escaped the dialog on Tab ${i + 1}`).toBe(true);
      }
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(opener).toBeFocused();
    });

    test('the chain is operable from the keyboard: Tab reaches each step and Enter opens it', async () => {
      const first = await createDecision({ title: `${P} kb first` });
      const second = (await ws.api('manager', 'POST', `/api/work-decisions/${first.id}/supersede`, { decision: 'kb second text' })) as { id: string };
      const page = await ws.open('manager', `/work/decisions?open=${second.id}`);
      const dialog = dialogOf(page);
      const chain = dialog.getByRole('list', { name: 'Decision chain' });
      await expect(chain).toBeVisible({ timeout: 60_000 });
      const open = chain.getByRole('button', { name: `Open ${first.title}` });
      let reached = false;
      for (let i = 0; i < 20 && !reached; i += 1) {
        await page.keyboard.press('Tab');
        reached = await open.evaluate((el) => el === document.activeElement);
      }
      expect(reached, 'the chain step is reachable by Tab').toBe(true);
      await page.keyboard.press('Enter');
      await expect(dialogOf(page).getByRole('heading', { name: first.title })).toBeVisible({ timeout: 30_000 });
      await expect(dialogOf(page).getByText('Superseded', { exact: true }).first()).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialogOf(page)).toHaveCount(0);
    });
  });
});
