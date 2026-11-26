import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { BASE_URLS } from '../playwright.config';
import { gotoWork, openRoleContext, workPassword, workTenant, type WorkRole } from '../fixtures/work-sessions';
import { auditPage, blocking, describeViolations, scrollsSideways } from '../fixtures/accessibility';
import {
  Workspace,
  alertText,
  choose,
  dismissErrorModal,
  escapeRe,
  field,
  newTenantTarget,
  RUN,
  OTHER_WEB,
  WEB,
  ymd,
} from '../fixtures/work-hardening';
import {
  clearDailyUpdatesFor,
  ensureWorkspaceHosts,
  guiDatabaseUrl,
  removeCapacityFacts,
  restoreEntitlements,
  seedCapacityFacts,
  seedTimesheetHours,
  setTenantFeature,
  setTenantPlan,
  snapshotEntitlements,
  withGuiDb,
  type CapacityFixture,
  type EntitlementSnapshot,
} from '../fixtures/work-database';

/**
 * Flow S - work hardening journeys (DP-MASTER): blockers and accountability,
 * hours reconciliation and net capacity, entitlement toggling, cross-tenant
 * isolation, accessibility, work-profile settings and the editor's concurrency
 * guard, driven through the real UI of apps/web with an assertion on the
 * persisted outcome (through the API) beside every visible one.
 *
 * Environment (nothing secret is defaulted; the suite skips loudly):
 *   E2E_WEB_URL             tenant product, e.g. http://dijipeople-demo.localhost:3011
 *   E2E_API_URL             API (only to prove the stack is up)
 *   E2E_TENANT_SLUG         the tenant to sign in to
 *   E2E_TENANT_ROOT_DOMAIN  localhost:3011 (so the sign-in URL is the host, not ?tenant=)
 *   E2E_WEB_PASSWORD        password of the synthetic users (never committed)
 *   E2E_DATABASE_URL        a THROWAWAY database (name ends _gui or _e2e); the
 *                           journeys that need rows skip loudly without it
 *   E2E_OTHER_WEB_URL / E2E_OTHER_TENANT_SLUG
 *                           the second tenant (cross-tenant and entitlement journeys)
 *
 * THE THROWAWAY STACK NEEDS TenantDomain ROWS for the demo hosts
 * (<slug>.localhost, SYSTEM_SUBDOMAIN, primary, VERIFIED). Without them every
 * workspace URL answers "We could not find this company portal". When rebuilding
 * a stack, set E2E_ENSURE_WORKSPACE_HOSTS=1 and the suite inserts the missing
 * rows through the guarded fixture (never overwrites an existing row).
 *
 * REPEATABILITY (the suite runs twice in a row green):
 *   - blockers, items, projects, packages, profiles and units are created with a
 *     per-run suffix and removed (cancelled, archived, deleted) through the API;
 *   - a daily update is unique per employee and day and has no delete API, so at
 *     the start the DB helper clears the daily updates of the test employees
 *     (employee and manager) in the first tenant, and again at the end;
 *   - leave, holidays and timesheets seeded for the capacity journey are removed
 *     afterwards, and the plan / feature rows of both tenants are snapshotted at
 *     the start and restored exactly at the end.
 */

const EVIDENCE_DIR = join(__dirname, '..', '..', 'docs', 'programs', 'dp-master', 'evidence');
const A_SLUG = workTenant()?.slug ?? '';
const B_SLUG = process.env.E2E_OTHER_TENANT_SLUG?.trim() ?? '';
const HAVE_DB = Boolean(guiDatabaseUrl());

const ws = { a: null as unknown as Workspace, b: null as unknown as Workspace };
const cleanups: Array<{ what: string; run: () => Promise<unknown> }> = [];
const snapshots: EntitlementSnapshot[] = [];
const timesheetIds: string[] = [];
let capacity: CapacityFixture | null = null;

async function shoot(page: Page, name: string, width: number) {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  await page.setViewportSize({ width, height: 900 });
  await page.screenshot({ path: join(EVIDENCE_DIR, `s-${name}-${width}.png`) });
}

/** A project in the manager's business unit (a project with none is invisible to a unit-reach manager). */
async function createProject(label: string, projectManager: 'manager' | 'employee' = 'manager') {
  // A self-reach employee reads a project only through an active assignment to it.
  const units = await ws.a.api('manager', 'GET', '/api/business-units');
  const list = (Array.isArray(units) ? units : units.items) as Array<{ id: string }>;
  const project = await ws.a.api('manager', 'POST', '/api/projects', {
    name: `E2E ${label} ${RUN}`,
    code: `S${label.slice(0, 3)}-${RUN}`.toUpperCase().slice(0, 20),
    projectManagerEmployeeId: ws.a.employeeIds[projectManager],
    businessUnitId: list[0].id,
  });
  const assignment = await ws.a.api('ceo', 'POST', `/api/projects/${project.id}/assignments`, {
    employeeId: ws.a.employeeIds.employee,
    roleOnProject: 'Member',
    allocationPercent: 1,
  });
  cleanups.push({
    what: `delete project ${label}`,
    run: async () => {
      const open = await ws.a.raw('manager', 'GET', `/api/work-blockers?status=OPEN&projectId=${project.id}&take=100`);
      for (const b of (open.body?.items ?? []) as Array<{ id: string }>) {
        await ws.a.raw('manager', 'POST', `/api/work-blockers/${b.id}/cancel`, { resolution: 'e2e cleanup' });
      }
      // The manager holds no projects.delete: the assignment (which counts toward allocation) and the project go through the CEO.
      await ws.a.raw('ceo', 'DELETE', `/api/projects/${project.id}/assignments/${assignment.id}`);
      await ws.a.raw('ceo', 'DELETE', `/api/projects/${project.id}`);
    },
  });
  return project as { id: string; name: string };
}

async function createItem(
  owner: 'manager' | 'employee',
  title: string,
  projectId: string,
  start = true,
) {
  const item = await ws.a.api('manager', 'POST', '/api/work-items', {
    kind: 'TASK',
    title,
    projectId,
    ownerEmployeeId: ws.a.employeeIds[owner],
  });
  cleanups.push({
    what: `archive ${title}`,
    run: () => ws.a.raw('manager', 'POST', `/api/work-items/${item.id}/archive`),
  });
  if (start) {
    await ws.a.api(owner, 'POST', `/api/work-items/${item.id}/transition`, { to: 'IN_PROGRESS' });
  }
  return item as { id: string; title: string };
}

/** Deactivate the work units and profiles an interrupted earlier run left behind (they have no delete). */
async function sweepWorkProfileLeftovers() {
  const profiles = (await ws.a.raw('hr', 'GET', '/api/work-profiles')).body as Array<{ id: string; key: string; isActive: boolean }> | null;
  for (const p of profiles ?? []) {
    if (p.isActive && p.key.startsWith('e2e-agent-')) await ws.a.raw('hr', 'PATCH', `/api/work-profiles/${p.id}`, { isActive: false });
  }
  const units = (await ws.a.raw('hr', 'GET', '/api/work-profiles/units')).body as Array<{ id: string; key: string; isActive: boolean }> | null;
  for (const u of units ?? []) {
    if (u.isActive && u.key.startsWith('e2e-calls-')) await ws.a.raw('hr', 'PATCH', `/api/work-profiles/units/${u.id}`, { isActive: false });
  }
}

/** A segmented-control tab of the work-profile settings; retried until hydration has attached its handler. */
async function pickTab(page: Page, name: string) {
  const radio = page.getByRole('radio', { name });
  await expect(async () => {
    await radio.click();
    await expect(radio).toBeChecked({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

/** Cancel the open blockers an interrupted earlier run left behind (identified by their wording). */
async function sweepLeftoverBlockers() {
  const mine = /^(Waiting for the vendor contract|Needs the employee to approve|E2E bulk) /;
  for (let round = 0; round < 4; round += 1) {
    const page = await ws.a.api('manager', 'GET', '/api/work-blockers?status=OPEN&take=100');
    const stale = (page.items as Array<{ id: string; reason: string }>).filter((b) => mine.test(b.reason));
    if (!stale.length) return;
    for (const b of stale) {
      await ws.a.raw('manager', 'POST', `/api/work-blockers/${b.id}/cancel`, { resolution: 'e2e sweep' });
    }
  }
}

/**
 * The web gate reads the tenant's plan from the API (cached for a while), so wait on the page the
 * layout gates: it carries the plan wall until the plan offers Projects.
 */
async function projectsOffered(present: boolean) {
  await expect
    .poll(
      async () => {
        const r = await ws.b.raw('ceo', 'GET', '/projects');
        return !String(r.body).includes('not part of your current subscription');
      },
      { timeout: 150_000, intervals: [5_000], message: `Projects ${present ? 'offered' : 'withdrawn'} by the plan` },
    )
    .toBe(present);
}

test.describe('Flow S - work hardening', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(600_000);
    test.skip(!workPassword(), 'E2E_WEB_PASSWORD is unset: the synthetic users share a password that is never committed');
    test.skip(!A_SLUG, 'E2E_TENANT_SLUG is unset (e.g. dijipeople-demo)');
    const apiUp = await fetch(`${BASE_URLS.api}/api/health`).then((r) => r.status < 500).catch(() => false);
    test.skip(!apiUp, `the API is not reachable at ${BASE_URLS.api}`);

    if (HAVE_DB) {
      if (process.env.E2E_ENSURE_WORKSPACE_HOSTS === '1') {
        const root = process.env.E2E_TENANT_ROOT_DOMAIN?.trim() || 'localhost';
        await ensureWorkspaceHosts([A_SLUG, ...(B_SLUG ? [B_SLUG] : [])], root);
      }
      snapshots.push(await snapshotEntitlements(A_SLUG));
      if (B_SLUG) snapshots.push(await snapshotEntitlements(B_SLUG));
      await clearDailyUpdatesFor(A_SLUG, ['employee@dijipeople.local', 'manager@dijipeople.local']);
    }

    ws.a = new Workspace(WEB, newTenantTarget(A_SLUG));
    await ws.a.signIn(browser, ['employee', 'manager', 'hr', 'ceo']);

    if (B_SLUG && process.env.E2E_OTHER_WEB_URL) {
      ws.b = new Workspace(OTHER_WEB, newTenantTarget(B_SLUG));
      await ws.b.signIn(browser, ['hr', 'ceo', 'manager']);
    }

    // Warm every route once so no test absorbs Next dev's first-hit compile.
    const warm = await ws.a.contexts.ceo.newPage();
    for (const path of [
      '/work',
      '/work/blockers',
      '/work/contributions',
      '/work/daily-update',
      '/work/daily-updates',
      '/settings/daily-updates',
      '/settings/work-profiles',
      '/settings/customization/packages',
      '/projects',
    ]) {
      await warm
        .goto(`${WEB}${path}`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
        .catch(() => undefined);
    }
    await warm.close();

    // Blockers a failed earlier run left open would clutter the lists; cancel them.
    await sweepLeftoverBlockers();
    await sweepWorkProfileLeftovers();

    // Daily updates must be switched on and open on every day for the journeys.
    await ws.a.api('hr', 'PUT', '/api/daily-updates/policy', {
      enabled: true,
      workingDays: [1, 2, 3, 4, 5, 6, 7],
      deadlineMinutes: 1080,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      requireAcknowledgement: true,
    });
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      let n = 0;
      for (const page of [...ws.a.pages, ...(ws.b?.pages ?? [])]) {
        n += 1;
        await page
          .screenshot({ path: testInfo.outputPath(`failure-page-${n}.png`), fullPage: true })
          .catch(() => undefined);
      }
    }
    await ws.a?.releaseAll();
    await ws.b?.releaseAll();
  });

  test.afterAll(async () => {
    for (const cleanup of cleanups.reverse()) await cleanup.run().catch(() => undefined);
    if (HAVE_DB && capacity) {
      await removeCapacityFacts(capacity, { timesheetIds }).catch(() => undefined);
    } else if (HAVE_DB && timesheetIds.length) {
      await withGuiDb(async (db) => {
        await db.query('delete from "TimesheetEntry" where "timesheetId" = any($1)', [timesheetIds]);
        await db.query('delete from "Timesheet" where id = any($1)', [timesheetIds]);
      }).catch(() => undefined);
    }
    for (const snapshot of snapshots) await restoreEntitlements(snapshot).catch(() => undefined);
    if (HAVE_DB && A_SLUG) {
      await clearDailyUpdatesFor(A_SLUG, ['employee@dijipeople.local', 'manager@dijipeople.local']).catch(
        () => undefined,
      );
    }
    if (ws.a) await sweepWorkProfileLeftovers().catch(() => undefined);
    await ws.a?.close();
    await ws.b?.close();
  });

  /* ================================================== 1. BLOCKERS ===== */

  test.describe('1 blockers', () => {
    test.describe.configure({ mode: 'serial' });
    let projectId = '';
    let itemId = '';
    let blockerId = '';
    const itemTitle = `Blocked task ${RUN}`;
    const reason = `Waiting for the vendor contract ${RUN}`;

    test('employee raises a blocker: the item becomes Blocked and the cause is never guessed', async () => {
      test.setTimeout(180_000);
      const project = await createProject('blk', 'employee');
      projectId = project.id;
      const item = await createItem('employee', itemTitle, projectId);
      itemId = item.id;

      const page = await ws.a.open('employee', `/projects/${projectId}`);
      await expect(page.getByRole('button', { name: `Open ${itemTitle}` })).toBeVisible({ timeout: 60_000 });
      await page.getByRole('button', { name: `Open ${itemTitle}` }).click();
      const detail = page.getByRole('dialog').first();
      const blockersSection = detail.getByRole('region', { name: 'Blockers' });
      await expect(blockersSection).toContainText('No blockers on this item.');
      await blockersSection.getByRole('button', { name: 'Raise blocker' }).click();

      const raise = page.getByRole('dialog', { name: new RegExp(`Raise blocker: ${itemTitle}`) });
      await expect(raise).toBeVisible();
      // validation: nothing chosen, then a reason that is too short
      await raise.getByRole('button', { name: 'Raise blocker' }).click();
      expect(await alertText(raise)).toMatch(/choose a category/i);
      await choose(page, raise, 'Category', 'Waiting on approval');
      await field(raise, 'Reason').fill('ab');
      await raise.getByRole('button', { name: 'Raise blocker' }).click();
      expect(await alertText(raise)).toMatch(/at least 3 characters/i);
      // the optional cause starts at "Not sure": never pre-filled with a blame cause
      await expect(raise.getByRole('combobox', { name: /^Cause/ })).toContainText('Not sure');
      await field(raise, 'Reason').fill(reason);
      await raise.getByRole('button', { name: 'Raise blocker' }).click();
      await expect(raise).toBeHidden();

      await expect(blockersSection).toContainText(reason);
      await expect(blockersSection.getByText('Cause not determined')).toBeVisible();
      await expect(blockersSection.getByText('Open', { exact: true }).first()).toBeVisible();

      const stored = await ws.a.api('employee', 'GET', `/api/work-items/${itemId}/blockers`);
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({ status: 'OPEN', cause: 'UNDETERMINED', causeSetById: null });
      blockerId = stored[0].id;
      expect((await ws.a.api('employee', 'GET', `/api/work-items/${itemId}`)).status).toBe('BLOCKED');

      await detail.getByRole('button', { name: 'Close' }).click();
      await expect(page.getByRole('region', { name: 'Blocked column' })).toContainText(itemTitle);
    });

    test('the person doing the delayed work cannot name the cause; a manager can, on the record', async () => {
      const emp = await ws.a.open('employee', '/work/blockers');
      await expect(emp.getByRole('heading', { name: 'Blockers' }).first()).toBeVisible();
      await emp.getByPlaceholder('Search blockers').fill(RUN);
      const setCause = emp.getByRole('button', { name: `Set cause: ${reason}` });
      await expect(setCause).toBeVisible();
      await setCause.click();
      const dialog = emp.getByRole('dialog', { name: 'Set blocker cause' });
      await choose(emp, dialog, 'Cause', 'External');
      await dialog.getByRole('button', { name: 'Save cause' }).click();
      expect(await alertText(dialog)).toMatch(/reviewer/i);
      await dismissErrorModal(emp, /reviewer/i);
      await dialog.getByRole('button', { name: 'Close' }).click();
      // once refused, the control is not offered again for that blocker
      await expect(setCause).toHaveCount(0);
      expect((await ws.a.api('employee', 'GET', `/api/work-items/${itemId}/blockers`))[0].cause).toBe('UNDETERMINED');

      const mgr = await ws.a.open('manager', '/work/blockers');
      await mgr.getByPlaceholder('Search blockers').fill(RUN);
      await mgr.getByRole('button', { name: `Set cause: ${reason}` }).click();
      const mdialog = mgr.getByRole('dialog', { name: 'Set blocker cause' });
      await expect(mdialog).toContainText('Cause not determined');
      await choose(mgr, mdialog, 'Cause', 'Team-controllable');
      await field(mdialog, 'Note').fill('The key was never shared');
      await mdialog.getByRole('button', { name: 'Save cause' }).click();
      await expect(mdialog).toBeHidden();
      await expect(mgr.getByRole('row').filter({ hasText: reason })).toContainText('Team-controllable');
      const after = (await ws.a.api('manager', 'GET', `/api/work-items/${itemId}/blockers`))[0];
      expect(after.cause).toBe('TEAM_CONTROLLABLE');
      expect(after.causeSetById).not.toBeNull();
    });

    test('escalation is deliberate and stops at the ceiling; the fourth is refused with its message', async () => {
      const page = await ws.a.open('manager', '/work/blockers');
      await page.getByPlaceholder('Search blockers').fill(RUN);
      const row = page.getByRole('row').filter({ hasText: reason });
      for (let level = 1; level <= 3; level += 1) {
        await row.getByRole('button', { name: /^Escalate blocker:/ }).click();
        const dialog = page.getByRole('dialog', { name: 'Escalate blocker' });
        await expect(dialog).toContainText(level === 1 ? 'Not escalated' : `Escalation level ${level - 1} of 3`);
        await dialog.getByRole('button', { name: 'Escalate blocker' }).click();
        await expect(dialog).toBeHidden();
        await expect(row).toContainText(`Escalation level ${level} of 3`);
      }
      await expect(row.getByRole('button', { name: /^Escalate blocker:/ })).toHaveCount(0);
      const fourth = await ws.a.raw('manager', 'POST', `/api/work-blockers/${blockerId}/escalate`, {});
      // The refusal is a 409 carrying the API's own sentence. (The web-facing error contract renders
      // its errorCode as DATABASE_CONSTRAINT_FAILED rather than WORK_BLOCKER_MAX_ESCALATION: reported, not asserted.)
      expect(fourth.status).toBe(409);
      expect(String(fourth.body.message)).toMatch(/at most 3 times/i);
      expect((await ws.a.api('manager', 'GET', `/api/work-items/${itemId}/blockers`))[0].escalationLevel).toBe(3);
    });

    test('resolving returns the item to In progress; a too-short resolution is refused', async () => {
      const page = await ws.a.open('manager', '/work/blockers');
      await page.getByPlaceholder('Search blockers').fill(RUN);
      await page.getByRole('button', { name: `Resolve blocker: ${reason}` }).click();
      const dialog = page.getByRole('dialog', { name: 'Resolve blocker' });
      await field(dialog, 'Resolution').fill('x');
      await dialog.getByRole('button', { name: 'Resolve blocker' }).click();
      expect(await alertText(dialog)).toMatch(/at least 3 characters/i);
      await field(dialog, 'Resolution').fill('Contract signed and shared');
      await dialog.getByRole('button', { name: 'Resolve blocker' }).click();
      await expect(dialog).toBeHidden();
      // the default filter is Open, so the row leaves the list
      await expect(page.getByRole('row').filter({ hasText: reason })).toHaveCount(0);
      const stored = (await ws.a.api('manager', 'GET', `/api/work-items/${itemId}/blockers`))[0];
      expect(stored).toMatchObject({ status: 'RESOLVED', resolution: 'Contract signed and shared' });
      expect((await ws.a.api('manager', 'GET', `/api/work-items/${itemId}`)).status).toBe('IN_PROGRESS');
      // History stays: the Resolved filter shows it with the resolution text
      await choose(page, page, 'Status', 'Resolved');
      await expect(page.getByRole('row').filter({ hasText: reason })).toContainText('Resolution: Contract signed and shared');
    });

    test('a person a blocker waits on sees it under "Waiting on me", and only that item', async () => {
      const other = await createItem('manager', `Manager other ${RUN}`, projectId);
      const waiting = await createItem('manager', `Needs the employee ${RUN}`, projectId);
      const waitReason = `Needs the employee to approve ${RUN}`;
      const raised = await ws.a.api('manager', 'POST', `/api/work-items/${waiting.id}/blockers`, {
        category: 'WAITING_ON_PERSON',
        reason: waitReason,
        ownerEmployeeId: ws.a.employeeIds.employee,
      });
      expect(raised.cause).toBe('UNDETERMINED');

      const page = await ws.a.open('employee', '/work/blockers');
      await page.getByRole('checkbox', { name: 'Waiting on me' }).check();
      await expect(page.getByRole('row').filter({ hasText: waitReason })).toBeVisible();
      await expect(page.getByRole('row').filter({ hasText: 'Cause not determined' }).first()).toBeVisible();
      // the API agrees: that item is readable, the manager's other item is not
      expect((await ws.a.raw('employee', 'GET', `/api/work-items/${waiting.id}`)).status).toBe(200);
      expect((await ws.a.raw('employee', 'GET', `/api/work-items/${other.id}`)).status).toBe(404);
      const mine = await ws.a.api('employee', 'GET', '/api/work-blockers?mine=true&take=100');
      expect(mine.items.map((b: { id: string }) => b.id)).toContain(raised.id);
      for (const b of mine.items as Array<{ workItemId: string }>) {
        expect(b.workItemId).not.toBe(other.id);
      }
    });

    test('the summary shows blocked time by cause, with the undetermined row distinct', async () => {
      const page = await ws.a.open('manager', '/work/blockers');
      const summary = page.getByRole('region', { name: 'Blocked time summary' });
      await page.getByRole('button', { name: 'Show summary' }).click();
      const byCause = summary.getByRole('list', { name: 'Blocked time by cause' });
      await expect(byCause.getByRole('listitem')).toHaveCount(5);
      const undetermined = byCause.getByRole('listitem').filter({ hasText: 'Cause not determined' });
      await expect(undetermined).toContainText('Not attributed to anyone');
      await expect(undetermined).toContainText(/blocked, \d+ blockers? , ?\d+ open|blocked, \d+ blockers?, \d+ open/);
      await expect(byCause.getByRole('listitem').filter({ hasText: 'Team-controllable' })).toContainText(/\d+ blockers?/);
      await expect(summary).toContainText('never subtracted');
      const range = { from: ymd(-27), to: ymd(0) };
      const api = await ws.a.api(
        'manager',
        'GET',
        `/api/work-blockers/summary?from=${range.from}T00:00:00.000Z&to=${ymd(1)}T00:00:00.000Z`,
      );
      const row = (api.byCause as Array<{ cause: string; count: number }>).find((r) => r.cause === 'UNDETERMINED');
      expect(row, 'an undetermined blocker exists in the summary').toBeTruthy();
      await expect(undetermined).toContainText(`${row!.count} blocker`);
      // an inverted period is refused in the page, before any request
      await field(page, 'Summary period start').fill(ymd(5));
      await field(page, 'Summary period end').fill(ymd(1));
      await page.getByRole('button', { name: 'Show summary' }).click();
      expect((await alertText(summary)).length).toBeGreaterThan(5);
    });

    test('pagination: 30+ blockers page in the table, and 100+ load more', async () => {
      test.setTimeout(300_000);
      const bulk = await createItem('manager', `Bulk blockers ${RUN}`, projectId);
      const ids: string[] = [];
      for (let n = 1; n <= 105; n += 1) {
        const b = await ws.a.api('manager', 'POST', `/api/work-items/${bulk.id}/blockers`, {
          category: 'OTHER',
          reason: `E2E bulk ${RUN} number ${String(n).padStart(3, '0')}`,
        });
        ids.push(b.id);
      }
      cleanups.push({
        what: 'cancel bulk blockers',
        run: async () => {
          for (const id of ids) await ws.a.raw('manager', 'POST', `/api/work-blockers/${id}/cancel`, { resolution: 'e2e cleanup' });
        },
      });
      const page = await ws.a.open('manager', '/work/blockers');
      const status = page.getByRole('status').filter({ hasText: /^Showing \d+ of \d+ blockers/ });
      await expect(status).toContainText(/Showing 100 of \d{3} blockers/);
      const total = Number(/of (\d+) blockers/.exec((await status.textContent()) ?? '')![1]);
      expect(total).toBeGreaterThanOrEqual(105);
      // the table pages its 100 loaded rows client-side
      await page.getByPlaceholder('Search blockers').fill(`E2E bulk ${RUN}`);
      await expect(page.getByRole('button', { name: /Next/i }).first()).toBeEnabled();
      await page.getByRole('button', { name: /Next/i }).first().click();
      await expect(page.getByRole('row').filter({ hasText: `E2E bulk ${RUN}` }).first()).toBeVisible();
      await page.getByPlaceholder('Search blockers').fill('');
      await page.getByRole('button', { name: 'Load more blockers' }).click();
      await expect(status).toContainText(`Showing ${total} of ${total} blockers`);
      await expect(page.getByRole('button', { name: 'Load more blockers' })).toHaveCount(0);
      await shoot(page, 'blockers', 1440);
    });
  });
  /* ============================================ 7. CONCURRENCY ===== */

  test.describe('7 concurrency in the UI', () => {
    test('a stale tab is refused with a message and loses nothing; reload then save works', async ({ browser }) => {
      test.setTimeout(240_000);
      const second = await openRoleContext(browser, WEB, ws.a.tenant, 'employee');
      try {
        const first = await ws.a.open('employee', '/work/daily-update');
        const stale = await second.newPage();
        await gotoWork(stale, WEB, ws.a.tenant, '/work/daily-update');
        for (const page of [first, stale]) {
          await expect(field(page, 'Summary of the day')).toBeVisible({ timeout: 60_000 });
        }
        const versionOf = async (page: Page) =>
          Number(/\d+/.exec((await page.getByText(/^Version \d+$/).textContent()) ?? '')![0]);
        const loadedVersion = await versionOf(first);
        expect(await versionOf(stale)).toBe(loadedVersion);

        await field(first, 'Summary of the day').fill(`first tab ${RUN}`);
        await first.getByRole('button', { name: 'Save draft' }).click();
        await expect(first.getByText('Draft saved.')).toBeVisible();
        expect(await versionOf(first)).toBe(loadedVersion + 1);

        // the other tab still holds the old version
        await field(stale, 'Summary of the day').fill(`second tab ${RUN}`);
        await stale.getByRole('button', { name: 'Save draft' }).click();
        expect(await alertText(stale)).toMatch(/changed somewhere else/i);
        const kept = await ws.a.api('employee', 'POST', '/api/daily-updates/draft', {});
        expect(kept.summary, "the first tab's save is intact").toBe(`first tab ${RUN}`);
        expect(kept.version).toBe(loadedVersion + 1);

        await stale.reload({ waitUntil: 'domcontentloaded' });
        await expect(field(stale, 'Summary of the day')).toHaveValue(`first tab ${RUN}`, { timeout: 60_000 });
        await field(stale, 'Summary of the day').fill(`second tab after reload ${RUN}`);
        await stale.getByRole('button', { name: 'Save draft' }).click();
        await expect(stale.getByText('Draft saved.')).toBeVisible();
        const final = await ws.a.api('employee', 'POST', '/api/daily-updates/draft', {});
        expect(final.summary).toBe(`second tab after reload ${RUN}`);
        expect(final.version).toBe(loadedVersion + 2);
      } finally {
        await second.close();
      }
    });
  });

  /* ============================== 2. HOURS and NET CAPACITY ===== */

  test.describe('2 hours and net capacity', () => {
    test.describe.configure({ mode: 'serial' });
    let projectId = '';
    let itemId = '';
    const title = `Hours task ${RUN}`;

    test('an item shows reported against approved time, the gap in words, and "Not reported" never 0', async () => {
      test.skip(!HAVE_DB, 'E2E_DATABASE_URL is unset: timesheet rows are seeded through the guarded DB helper');
      test.setTimeout(180_000);
      const project = await createProject('hrs');
      projectId = project.id;
      const item = await createItem('employee', title, projectId, false);
      itemId = item.id;
      const e = ws.a.employeeIds.employee;
      const m = ws.a.employeeIds.manager;
      await ws.a.api('manager', 'PUT', `/api/work-items/${itemId}/contributors/${e}`, { estimateMinutes: 240, actualMinutes: 120 });
      await ws.a.api('manager', 'PUT', `/api/work-items/${itemId}/contributors/${m}`, { estimateMinutes: 60 });
      const sheetE = await seedTimesheetHours({ slug: A_SLUG, employeeId: e, taskId: itemId, hours: '1.50', approvalStatus: 'APPROVED', day: '2027-02-03', month: 2, year: 2027 });
      const sheetM = await seedTimesheetHours({ slug: A_SLUG, employeeId: m, taskId: itemId, hours: '1.00', approvalStatus: 'APPROVED', day: '2027-02-03', month: 2, year: 2027 });
      timesheetIds.push(sheetE.timesheetId, sheetM.timesheetId);

      const api = await ws.a.api('manager', 'GET', `/api/work-items/${itemId}/hours`);
      const byId = new Map((api.people as Array<Record<string, unknown>>).map((p) => [p.employeeId, p]));
      expect(byId.get(e)).toMatchObject({ reportedActualMinutes: 120, approvedTimesheetMinutes: 90, reconciliation: 'REPORTED_NOT_YET_APPROVED' });
      expect(byId.get(m)).toMatchObject({ reportedActualMinutes: null, approvedTimesheetMinutes: 60, reconciliation: 'NO_ACTUAL_REPORTED' });

      const page = await ws.a.open('manager', `/projects/${projectId}`);
      await page.getByRole('button', { name: `Open ${title}` }).click();
      const hours = page.getByRole('dialog').first().getByRole('region', { name: 'Hours' });
      const employeeRow = hours.getByRole('row').filter({ hasText: 'Demo Employee' });
      await expect(employeeRow).toContainText('4h');
      await expect(employeeRow.getByRole('cell').nth(2)).toHaveText('2h');
      await expect(employeeRow.getByRole('cell').nth(3)).toHaveText('1h 30m');
      await expect(employeeRow).toContainText('Reported 30m more than is approved so far (not yet approved)');
      const managerRow = hours.getByRole('row').filter({ hasText: 'Demo Manager' });
      await expect(managerRow.getByRole('cell').nth(2)).toHaveText('Not reported');
      await expect(managerRow.getByRole('cell').nth(3)).toHaveText('1h');
      await expect(managerRow).toContainText('No actual time reported; timesheet hours exist');
      await shoot(page, 'work-item-hours', 1440);
    });

    test('the workload shows leave and holiday days and the net capacity, and "No capacity" when none is left', async () => {
      test.skip(!HAVE_DB, 'E2E_DATABASE_URL is unset: leave and holidays are seeded through the guarded DB helper');
      test.setTimeout(180_000);
      test.skip(!projectId, 'the hours journey did not create the project');
      const fixture = await seedCapacityFacts({
        slug: A_SLUG,
        employeeId: ws.a.employeeIds.employee,
        leaveDays: ['2027-02-02', '2027-02-03'],
        holidayDays: ['2027-02-03', '2027-02-05'],
        tag: RUN,
      });
      capacity = fixture;
      const api = await ws.a.api(
        'manager',
        'GET',
        `/api/work-items/workload?from=2027-02-01T00:00:00.000Z&to=2027-02-08T00:00:00.000Z&projectId=${projectId}`,
      );
      expect(api.basis).toBe('NET_OF_LEAVE_AND_HOLIDAYS');
      const person = (api.people as Array<Record<string, unknown>>).find((p) => p.employeeId === ws.a.employeeIds.employee);
      // Tue+Wed leave (2), Wed already off, Fri holiday (1): 5 weekdays - 3 = 2 days of 8h
      expect(person).toMatchObject({ leaveDays: 2, holidayDays: 1, netCapacityMinutes: 960 });

      const page = await ws.a.open('manager', `/projects/${projectId}`);
      await page.getByRole('radio', { name: 'Workload' }).click();
      await field(page, 'Period start').fill('2027-02-01');
      await field(page, 'Period end').fill('2027-02-07');
      await page.getByRole('button', { name: 'Show workload' }).click();
      for (const header of ['Leave days', 'Holiday days', 'Net capacity']) {
        await expect(page.getByRole('columnheader', { name: new RegExp(header) })).toBeVisible();
      }
      const row = page.getByRole('row').filter({ hasText: 'Demo Employee' });
      await expect(row).toContainText('2 days');
      await expect(row).toContainText('1 day');
      await expect(row).toContainText('16h');
      await shoot(page, 'workload', 1440);

      // Tue and Wed are both leave: no capacity left, said in words rather than 0
      await field(page, 'Period start').fill('2027-02-02');
      await field(page, 'Period end').fill('2027-02-03');
      await page.getByRole('button', { name: 'Show workload' }).click();
      await expect(page.getByRole('row').filter({ hasText: 'Demo Employee' })).toContainText('No capacity');
      const none = await ws.a.api(
        'manager',
        'GET',
        `/api/work-items/workload?from=2027-02-02T00:00:00.000Z&to=2027-02-04T00:00:00.000Z&projectId=${projectId}`,
      );
      const noneRow = (none.people as Array<Record<string, unknown>>).find((p) => p.employeeId === ws.a.employeeIds.employee);
      expect(noneRow).toMatchObject({ netCapacityMinutes: 0, loadPercent: null });
    });
  });

  /* ================================= 3. ENTITLEMENT TOGGLING ===== */

  test.describe('3 entitlements and policy', () => {
    test.describe.configure({ mode: 'serial' });

    test('the second tenant follows its plan: starter hides Projects, enterprise and an override restore it', async () => {
      test.skip(!HAVE_DB || !B_SLUG, 'needs E2E_DATABASE_URL and the second tenant (E2E_OTHER_TENANT_SLUG)');
      test.setTimeout(900_000);
      const health = await fetch(`${BASE_URLS.api}/api/health`).then((r) => r.json());
      const enforced = Boolean(health?.entitlementEnforcement?.enforced);
      test.info().annotations.push({ type: 'entitlement-enforcement', description: JSON.stringify(health?.entitlementEnforcement) });

      // 1. enterprise: the Work area is there
      await setTenantPlan(B_SLUG, 'enterprise');
      await projectsOffered(true);
      const units = await ws.b.api('manager', 'GET', '/api/business-units');
      const unitList = (Array.isArray(units) ? units : units.items) as Array<{ id: string }>;
      const project = await ws.b.api('manager', 'POST', '/api/projects', {
        name: `E2E entitlement ${RUN}`,
        code: `SEN-${RUN}`.toUpperCase().slice(0, 20),
        projectManagerEmployeeId: ws.b.employeeIds.manager,
        businessUnitId: unitList[0].id,
      });
      try {
        const onPlan = await ws.b.open('manager', `/projects/${project.id}`);
        await expect(onPlan.getByRole('radiogroup', { name: 'Work view' })).toBeVisible({ timeout: 60_000 });
        await expect(onPlan.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: 'Projects' })).toBeVisible();
        await ws.b.release(onPlan);

        // 2. starter: the plan withdraws Projects
        await setTenantPlan(B_SLUG, 'starter');
        await projectsOffered(false);
        const wall = await ws.b.open('manager', `/projects/${project.id}`);
        await expect(wall.getByText(/not part of your current subscription/i)).toBeVisible({ timeout: 60_000 });
        await expect(wall.getByRole('radiogroup', { name: 'Work view' })).toHaveCount(0);
        await expect(wall.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: 'Projects' })).toHaveCount(0);
        await shoot(wall, 'plan-wall', 1440);
        await ws.b.release(wall);
        // The API: in ENFORCE mode it refuses; in REPORT_ONLY it only logs, so the call still succeeds.
        const apiOnStarter = await ws.b.raw('manager', 'GET', `/api/work-items?projectId=${project.id}&take=1`);
        if (enforced) {
          expect(apiOnStarter.status).toBe(403);
          expect(String(apiOnStarter.body?.errorCode ?? apiOnStarter.body?.code)).toMatch(/ENTITLED/);
        } else {
          expect(apiOnStarter.status, 'REPORT_ONLY lets the call through').toBe(200);
        }

        // 3. a CUSTOM per-tenant override grants it on starter (a MANUAL one is capped by the plan)
        await setTenantFeature(B_SLUG, 'projects', true, 'CUSTOM');
        await projectsOffered(true);
        const overridden = await ws.b.open('manager', `/projects/${project.id}`);
        await expect(overridden.getByRole('radiogroup', { name: 'Work view' })).toBeVisible({ timeout: 60_000 });
        await ws.b.release(overridden);

        // 4. and an override off takes it away from enterprise
        await setTenantPlan(B_SLUG, 'enterprise');
        await setTenantFeature(B_SLUG, 'projects', false);
        await projectsOffered(false);
        const switchedOff = await ws.b.open('manager', `/projects/${project.id}`);
        await expect(switchedOff.getByText(/not part of your current subscription/i)).toBeVisible({ timeout: 60_000 });
        await ws.b.release(switchedOff);
      } finally {
        await setTenantPlan(B_SLUG, 'enterprise');
        await projectsOffered(true).catch(() => undefined);
        await ws.b.raw('ceo', 'DELETE', `/api/projects/${project.id}`);
      }
    });

    test('daily updates switched off and on: the team screen says nothing is due, then lists who is missing', async () => {
      test.setTimeout(240_000);
      const date = ymd(-1);
      const policy = {
        enabled: true,
        workingDays: [1, 2, 3, 4, 5, 6, 7],
        deadlineMinutes: 1080,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        requireAcknowledgement: true,
      };
      try {
        await ws.a.api('hr', 'PUT', '/api/daily-updates/policy', { ...policy, enabled: false });
        const off = await ws.a.open('manager', '/work/daily-updates');
        await expect(off.getByRole('heading', { name: /team updates/i }).first()).toBeVisible({ timeout: 60_000 });
        await off.getByRole('button', { name: 'Check missing' }).click();
        await expect(off.getByText('Nobody is missing')).toBeVisible();
        await expect(off.getByText('No updates are due on this date.')).toBeVisible();
        const offApi = await ws.a.api('manager', 'GET', `/api/daily-updates/missing?date=${date}`);
        expect(offApi.due).toBe(false);
        expect(offApi.people).toHaveLength(0);
        await ws.a.release(off);

        await ws.a.api('hr', 'PUT', '/api/daily-updates/policy', { ...policy, enabled: true });
        const yesterday = await ws.a.api('manager', 'GET', `/api/daily-updates/missing?date=${date}`);
        expect(yesterday.due).toBe(true);
        expect((yesterday.people as unknown[]).length).toBeGreaterThan(0);
        const on = await ws.a.open('manager', '/work/daily-updates');
        await expect(on.getByRole('button', { name: 'Check missing' })).toBeVisible({ timeout: 60_000 });
        await on.getByRole('button', { name: 'Check missing' }).click();
        // the screen shows either the list or "Nobody is missing"; it must agree with the API read after it
        const list = on.getByRole('list', { name: 'People missing an update' });
        const nobody = on.getByText('Nobody is missing');
        await expect(list.or(nobody)).toBeVisible();
        const today = await ws.a.api('manager', 'GET', `/api/daily-updates/missing?date=${ymd(0)}`);
        expect(await list.isVisible(), 'the list is shown exactly when someone is missing').toBe(Boolean(today.due && today.people.length));
      } finally {
        await ws.a.raw('hr', 'PUT', '/api/daily-updates/policy', policy);
      }
    });
  });

  /* ============================= 4. CROSS-TENANT ISOLATION ===== */

  test.describe('4 cross-tenant isolation', () => {
    test('tenant B cannot reach tenant A work, blockers, updates or evidence, by id or in lists', async () => {
      test.skip(!B_SLUG, 'needs the second tenant (E2E_OTHER_TENANT_SLUG / E2E_OTHER_WEB_URL)');
      test.setTimeout(400_000);
      if (HAVE_DB) {
        // the earlier plan journey leaves the tenant on its own terms; this one needs Projects on
        await setTenantPlan(B_SLUG, 'enterprise');
        await projectsOffered(true);
      }
      const project = await createProject('iso');
      const item = await createItem('employee', `Tenant A secret ${RUN}`, project.id);
      const blocker = await ws.a.api('employee', 'POST', `/api/work-items/${item.id}/blockers`, {
        category: 'OTHER',
        reason: `Tenant A private blocker ${RUN}`,
      });
      const contribution = await ws.a.api('employee', 'POST', '/api/contributions', {
        workKind: 'TASK',
        measure: 'OCCURRENCE',
        occurredAt: new Date(Date.now() - 30 * 60_000).toISOString(),
        timezone: 'UTC',
        note: `e2e tenant A evidence ${RUN}`,
        clientRequestId: `e2e-iso-${RUN}`,
      });
      cleanups.push({
        what: 'withdraw contribution',
        run: () => ws.a.raw('employee', 'POST', `/api/contributions/${contribution.id}/withdraw`, { reason: `e2e cleanup ${RUN}` }),
      });
      const update = await ws.a.api('employee', 'POST', '/api/daily-updates/draft', { date: ymd(-3) });
      await ws.a.api('employee', 'PUT', `/api/daily-updates/${update.id}`, {
        summary: `Tenant A summary ${RUN}`,
        items: [{ section: 'COMPLETED', text: `Tenant A line ${RUN}` }],
      });

      // B's own data, so "only B's data" is a positive statement
      const bItem = await ws.b.api('manager', 'POST', '/api/work-items', { kind: 'TASK', title: `Tenant B task ${RUN}` });
      cleanups.push({ what: 'archive B item', run: () => ws.b.raw('manager', 'POST', `/api/work-items/${bItem.id}/archive`) });
      await ws.b.api('manager', 'POST', `/api/work-items/${bItem.id}/transition`, { to: 'IN_PROGRESS' });
      const bBlocker = await ws.b.api('manager', 'POST', `/api/work-items/${bItem.id}/blockers`, {
        category: 'OTHER',
        reason: `Tenant B blocker ${RUN}`,
      });
      cleanups.push({
        what: 'cancel B blocker',
        run: () => ws.b.raw('manager', 'POST', `/api/work-blockers/${bBlocker.id}/cancel`, { resolution: 'e2e cleanup' }),
      });

      for (const role of ['hr', 'manager'] as const) {
        const page = await ws.b.open(role, '/work/blockers');
        const probe = (path: string) =>
          page.evaluate(async (p) => {
            const response = await fetch(p, { cache: 'no-store' });
            const text = await response.text();
            return { status: response.status, text };
          }, path);
        for (const path of [
          `/api/work-items/${item.id}`,
          `/api/work-items/${item.id}/blockers`,
          `/api/work-items/${item.id}/hours`,
          `/api/daily-updates/${update.id}`,
          `/api/contributions/${contribution.id}`,
          `/api/projects/${project.id}`,
        ]) {
          const result = await probe(path);
          // a role without the key answers 403, one with it 404: never the record
          const allowed = path.startsWith('/api/projects') ? [403, 404] : [404];
          expect(allowed, `${role} of B reading ${path} -> ${result.status}`).toContain(result.status);
          expect(result.text).not.toContain('Tenant A');
        }
        // lists: nothing of A
        const blockers = await probe('/api/work-blockers?take=100');
        expect(blockers.status).toBe(200);
        expect(blockers.text).not.toContain(blocker.id);
        expect(blockers.text).not.toContain('Tenant A');
        const items = await probe('/api/work-items?take=100');
        expect(items.text).not.toContain(item.id);
        expect(items.text).not.toContain('Tenant A secret');
        const updates = await probe(`/api/daily-updates?from=${ymd(-10)}&to=${ymd(0)}&take=100`);
        expect(updates.text).not.toContain(update.id);
        expect(updates.text).not.toContain('Tenant A');
        const evidence = await probe('/api/contributions?take=100');
        expect(evidence.text).not.toContain(contribution.id);
        expect(evidence.text).not.toContain('tenant A evidence');
        await ws.b.release(page);
      }

      // the browser: B's blockers screen shows B's blocker and none of A's
      const bScreen = await ws.b.open('manager', '/work/blockers');
      await expect(bScreen.getByRole('row').filter({ hasText: `Tenant B blocker ${RUN}` })).toBeVisible({ timeout: 60_000 });
      await expect(bScreen.getByText('Tenant A private blocker')).toHaveCount(0);
      // A's project opened on B's host: a not-found state, never A's project
      const direct = await ws.b.open('manager', `/projects/${project.id}`);
      await expect(direct.getByText(/could not be found|not found/i).first()).toBeVisible({ timeout: 60_000 });
      await expect(direct.getByText(`E2E iso ${RUN}`)).toHaveCount(0);
      // and A's own screen still shows A's blocker (the control)
      const aScreen = await ws.a.open('manager', '/work/blockers');
      await expect(aScreen.getByRole('row').filter({ hasText: `Tenant A private blocker ${RUN}` })).toBeVisible({ timeout: 60_000 });
      await expect(aScreen.getByText('Tenant B blocker')).toHaveCount(0);
    });
  });

  /* ============================ 6. WORK-PROFILE SETTINGS ===== */

  test.describe('6 work profile settings', () => {
    test.describe.configure({ mode: 'serial' });
    const unitName = `E2E calls ${RUN}`;
    const unitKey = `e2e-calls-${RUN}`;
    const profileName = `E2E agent ${RUN}`;
    const profileKey = `e2e-agent-${RUN}`;
    let unitId = '';
    let profileId = '';
    let exported = '';

    test('hr creates a unit and a profile with a work type, and publishes version 1', async () => {
      test.setTimeout(240_000);
      const page = await ws.a.open('hr', '/settings/work-profiles');
      await expect(page.getByRole('heading', { name: /work profiles/i }).first()).toBeVisible({ timeout: 60_000 });

      // units
      await pickTab(page, 'Units');
      await page.getByRole('button', { name: 'New unit' }).first().click();
      let dialog = page.getByRole('dialog', { name: 'New work unit' });
      await dialog.getByRole('button', { name: 'Create unit' }).click();
      expect(await alertText(dialog)).toMatch(/needs a name/i);
      await field(dialog, 'Name').fill(unitName);
      await field(dialog, 'Key').fill('x');
      await dialog.getByRole('button', { name: 'Create unit' }).click();
      expect(await alertText(dialog)).toMatch(/key must be 2-64/i);
      await field(dialog, 'Key').fill(unitKey);
      await choose(page, dialog, 'Kind', 'Count');
      await dialog.getByRole('button', { name: 'Create unit' }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByRole('row').filter({ hasText: unitName })).toContainText(unitKey);
      const units = await ws.a.api('hr', 'GET', '/api/work-profiles/units');
      const unit = (units as Array<{ id: string; key: string; kind: string }>).find((u) => u.key === unitKey);
      expect(unit).toMatchObject({ kind: 'COUNT' });
      unitId = unit!.id;
      cleanups.push({ what: 'deactivate unit', run: () => ws.a.raw('hr', 'PATCH', `/api/work-profiles/units/${unitId}`, { isActive: false }) });

      // profile
      await pickTab(page, 'Profiles');
      await page.getByRole('button', { name: 'New profile' }).first().click();
      dialog = page.getByRole('dialog', { name: 'New work profile' });
      await dialog.getByRole('button', { name: 'Create profile' }).click();
      expect(await alertText(dialog)).toMatch(/needs a name and a key/i);
      await field(dialog, 'Name').fill(profileName);
      await field(dialog, 'Key').fill(profileKey);
      await dialog.getByRole('button', { name: 'Create profile' }).click();
      expect(await alertText(dialog)).toMatch(/add at least one work type/i);
      await dialog.getByRole('button', { name: 'Add work type' }).click();
      await field(dialog, 'Name').nth(1).fill('Handle calls');
      await choose(page, dialog, 'Kind', 'Task');
      await choose(page, dialog, 'Measurement mode', 'Quantity');
      await choose(page, dialog, 'Unit', new RegExp(escapeRe(unitName)));
      await dialog.getByRole('button', { name: 'Create profile' }).click();
      // the dialog now shows the created profile, titled by its name
      dialog = page.getByRole('dialog', { name: profileName });
      await expect(dialog.getByRole('heading', { name: /^Draft v1/ })).toBeVisible({ timeout: 30_000 });
      await dialog.getByRole('button', { name: 'Publish' }).click();
      await expect(dialog.getByRole('heading', { name: /^Published v1/ })).toBeVisible({ timeout: 30_000 });

      const profiles = await ws.a.api('hr', 'GET', '/api/work-profiles');
      const profile = (profiles as Array<{ id: string; key: string; currentVersion?: { version: number } }>).find((p) => p.key === profileKey);
      expect(profile?.currentVersion?.version).toBe(1);
      profileId = profile!.id;
      cleanups.push({ what: 'deactivate profile', run: () => ws.a.raw('hr', 'PATCH', `/api/work-profiles/${profileId}`, { isActive: false }) });
      await shoot(page, 'work-profiles', 1440);
    });

    test('hr assigns an employee, and the export re-imports with no change (idempotent)', async () => {
      test.setTimeout(240_000);
      const page = await ws.a.open('hr', '/settings/work-profiles');
      await pickTab(page, 'Assignments');
      await page.getByRole('button', { name: 'Assign profile' }).first().click();
      const dialog = page.getByRole('dialog', { name: 'Assign a work profile' });
      await dialog.getByRole('button', { name: 'Assign', exact: true }).click();
      expect(await alertText(dialog)).toMatch(/choose an employee, a profile and a start date/i);
      await dialog.getByLabel(/^Employee/).click();
      await page.getByRole('option', { name: /Demo Employee/ }).first().click();
      await choose(page, dialog, 'Profile', new RegExp(escapeRe(profileName)));
      await field(dialog, 'Effective from').fill(ymd(0));
      await dialog.getByRole('button', { name: 'Assign', exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByRole('row').filter({ hasText: profileName })).toContainText('Demo Employee');
      const assignments = await ws.a.api('hr', 'GET', '/api/work-profiles/assignments');
      const mine = (assignments as Array<{ id: string; employeeId: string; profileId: string }>).filter(
        (a) => a.profileId === profileId,
      );
      expect(mine).toHaveLength(1);
      expect(mine[0].employeeId).toBe(ws.a.employeeIds.employee);
      cleanups.push({
        what: 'end assignment',
        run: () => ws.a.raw('hr', 'PATCH', `/api/work-profiles/assignments/${mine[0].id}/end`, { effectiveTo: new Date(Date.now() + 86_400_000).toISOString() }),
      });

      // export the published version, then import the very same file
      await pickTab(page, 'Profiles');
      await page.getByRole('row').filter({ hasText: profileName }).getByRole('button', { name: 'Open' }).click();
      const profileDialog = page.getByRole('dialog', { name: profileName });
      const download = page.waitForEvent('download');
      await profileDialog.getByRole('button', { name: 'Export' }).click();
      const file = await download;
      expect(file.suggestedFilename()).toMatch(/\.djpkg$/);
      const stream = await file.createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk as Buffer);
      exported = Buffer.concat(chunks).toString('utf8');
      expect(exported).toContain(profileKey);
      await profileDialog.getByRole('button', { name: 'Close' }).click();

      await page.getByRole('button', { name: 'Import' }).first().click();
      const importDialog = page.getByRole('dialog', { name: 'Import work profiles' });
      await importDialog.getByLabel(/Package file/).setInputFiles({
        name: file.suggestedFilename(),
        mimeType: 'application/json',
        buffer: Buffer.from(exported, 'utf8'),
      });
      await expect(importDialog.getByRole('list', { name: /^Contents of/ })).toContainText('No change');
      await expect(importDialog.getByRole('button', { name: 'Import', exact: true })).toBeDisabled();
      await importDialog.getByRole('button', { name: 'Cancel' }).click();
      const after = await ws.a.api('hr', 'GET', `/api/work-profiles/${profileId}`);
      expect((after.versions as unknown[]).length, 'no new version was created').toBe(1);
    });

    test('the Add work components dialog lists the three groups and shows the API refusal for a role without work-profiles.manage', async () => {
      test.setTimeout(240_000);
      const pkg = await ws.a.api('ceo', 'POST', '/api/customization/packages', {
        packageKey: `e2e_work${RUN}`,
        displayName: `E2E work package ${RUN}`,
        publisherName: 'E2E',
        version: '1.0.0',
      });
      cleanups.push({ what: 'delete package', run: () => ws.a.raw('ceo', 'DELETE', `/api/customization/packages/${pkg.id}`) });
      const page = await ws.a.open('ceo', `/settings/customization/packages/${pkg.id}`);
      await page.getByRole('button', { name: 'Add work components' }).first().click();
      const dialog = page.getByRole('dialog', { name: 'Add work components' });
      for (const group of ['Work units', 'Work profiles', 'Work queues']) {
        await expect(dialog.getByText(group, { exact: true })).toBeVisible({ timeout: 30_000 });
      }
      const add = dialog.getByRole('button', { name: 'Add selected work components' });
      await expect(add).toBeDisabled();
      await dialog.getByRole('checkbox', { name: new RegExp(escapeRe(`${unitName} (${unitKey})`)) }).check();
      await expect(add).toBeEnabled();
      await add.click();
      // Adding work components needs BOTH customization.packages.manage and work-profiles.manage, and
      // no seeded role holds both (the CEO manages packages, HR manages work profiles). So the API
      // refuses, its message is shown in the dialog as it arrives, and nothing is added. The success
      // path therefore cannot be driven with the seeded roles; the API suite covers it.
      expect(await alertText(dialog)).toMatch(/requires the work-profiles.manage permission/i);
      await expect(dialog).toBeVisible();
      const detail = await ws.a.api('ceo', 'GET', `/api/customization/packages/${pkg.id}`);
      expect(JSON.stringify(detail)).not.toContain(unitKey);
      test.info().annotations.push({ type: 'not-driven', description: 'add-work-components success: no seeded role holds both required permissions' });
      await shoot(page, 'package-work-components', 1440);
    });

    test('an employee gets no access: the screen refuses and the API says 403', async () => {
      const page = await ws.a.open('employee', '/settings/work-profiles');
      // Self-service users are sent away from Settings (to their own profile) or shown the access-denied state:
      // either way the work-profile screen never renders.
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await expect(page.getByRole('heading', { name: /work profiles/i })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'New profile' })).toHaveCount(0);
      await expect(page.getByRole('radio', { name: 'Units' })).toHaveCount(0);
      const api = await ws.a.raw('employee', 'GET', '/api/work-profiles');
      expect(api.status).toBe(403);
      expect((await ws.a.raw('employee', 'POST', '/api/work-profiles/units', { key: `nope-${RUN}`, name: 'x', kind: 'COUNT' })).status).toBe(403);
    });
  });

  /* ============================================ 5. ACCESSIBILITY ===== */

  test.describe('5 accessibility', () => {
    test.describe.configure({ mode: 'serial' });
    let projectId = '';
    let blockerReason = '';

    const findings: string[] = [];
    const minor: string[] = [];
    async function audit(page: Page, name: string) {
      const all = await auditPage(page);
      // not gating (the repo's threshold is serious/critical) but recorded, so a screen's debt is visible
      for (const v of all.filter((x) => !blocking([x]).length)) minor.push(`${name}: ${v.impact} ${v.id} (${v.nodes.length})`);
      const found = blocking(all);
      if (found.length) findings.push(`${name}\n${describeViolations(found)}`);
      return found;
    }

    test('no serious or critical violations on the work screens', async () => {
      test.setTimeout(600_000);
      const project = await createProject('a11y');
      projectId = project.id;
      const item = await createItem('employee', `A11y task ${RUN}`, projectId);
      blockerReason = `A11y blocker ${RUN}`;
      await ws.a.api('employee', 'POST', `/api/work-items/${item.id}/blockers`, { category: 'OTHER', reason: blockerReason });
      const pkg = await ws.a.api('ceo', 'POST', '/api/customization/packages', {
        packageKey: `e2e_ally${RUN}`,
        displayName: `E2E a11y package ${RUN}`,
        publisherName: 'E2E',
        version: '1.0.0',
      });
      cleanups.push({ what: 'delete package', run: () => ws.a.raw('ceo', 'DELETE', `/api/customization/packages/${pkg.id}`) });

      const plain: Array<[string, WorkRole, string, RegExp | null]> = [
        ['My work', 'employee', '/work', /my work/i],
        ['My evidence', 'employee', '/work/contributions', /my evidence/i],
        ['Daily update', 'employee', '/work/daily-update', null],
        ['Team updates', 'manager', '/work/daily-updates', /team updates/i],
        ['Blockers', 'manager', '/work/blockers', /^blockers$/i],
        ['Project Work area', 'manager', `/projects/${projectId}`, null],
        ['Work profiles', 'hr', '/settings/work-profiles', /work profiles/i],
        ['Daily update policy', 'hr', '/settings/daily-updates', null],
      ];
      for (const [name, role, path, heading] of plain) {
        const page = await ws.a.open(role, path);
        if (heading) await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible({ timeout: 60_000 });
        else await page.waitForLoadState('networkidle').catch(() => undefined);
        await page.waitForTimeout(800);
        await audit(page, name);
        await ws.a.release(page);
      }

      // dialogs open
      const blockers = await ws.a.open('manager', '/work/blockers');
      await blockers.getByPlaceholder('Search blockers').fill(blockerReason);
      await blockers.getByRole('button', { name: `Assign owner: ${blockerReason}` }).click();
      await expect(blockers.getByRole('dialog', { name: 'Assign blocker owner' })).toBeVisible();
      await audit(blockers, 'Blockers (Assign owner dialog open)');
      await ws.a.release(blockers);

      const detail = await ws.a.open('manager', `/projects/${projectId}`);
      await detail.getByRole('button', { name: `Open A11y task ${RUN}` }).click();
      await expect(detail.getByRole('dialog').first().getByRole('region', { name: 'Hours' })).toBeVisible({ timeout: 60_000 });
      await audit(detail, 'Work item detail panel');
      await ws.a.release(detail);

      const pkgPage = await ws.a.open('ceo', `/settings/customization/packages/${pkg.id}`);
      await pkgPage.getByRole('button', { name: 'Add work components' }).first().click();
      const addDialog = pkgPage.getByRole('dialog', { name: 'Add work components' });
      await expect(addDialog.getByText('Work units', { exact: true })).toBeVisible({ timeout: 30_000 });
      await audit(pkgPage, 'Package screen (Add work components dialog open)');
      await ws.a.release(pkgPage);

      console.log(`AXE_NON_BLOCKING ${minor.join(' | ') || 'none'}`);
      test.info().annotations.push({ type: 'axe-non-blocking', description: minor.join(' | ') || 'none' });
      expect(findings, findings.join('\n\n')).toEqual([]);
    });

    test('one dialog works from the keyboard alone, and status is never colour alone', async () => {
      test.setTimeout(240_000);
      test.skip(!blockerReason, 'the audit journey did not seed the blocker');
      const page = await ws.a.open('manager', '/work/blockers');
      await page.getByPlaceholder('Search blockers').fill(blockerReason);
      const trigger = page.getByRole('button', { name: `Assign owner: ${blockerReason}` });
      await expect(trigger).toBeVisible({ timeout: 60_000 });

      // pills carry words: the row states its status, category and cause in text
      const row = page.getByRole('row').filter({ hasText: blockerReason });
      await expect(row).toContainText('Open');
      await expect(row).toContainText('Other');
      await expect(row).toContainText('Cause not determined');
      const causeRows = page.getByRole('list', { name: 'Blocked time by cause' }).getByRole('listitem');
      await expect(causeRows.first()).toBeVisible();
      for (let n = 0; n < (await causeRows.count()); n += 1) {
        expect(((await causeRows.nth(n).textContent()) ?? '').trim().length).toBeGreaterThan(10);
      }

      // open with Enter
      await trigger.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: 'Assign blocker owner' });
      await expect(dialog).toBeVisible();
      // focus is inside the dialog and stays there through a full Tab cycle
      const insideDialog = () =>
        page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')));
      const visited = new Set<string>();
      for (let n = 0; n < 10; n += 1) {
        await page.keyboard.press('Tab');
        expect(await insideDialog(), `Tab #${n + 1} stays in the dialog`).toBe(true);
        visited.add(
          await page.evaluate(() => {
            const el = document.activeElement as HTMLElement | null;
            return `${el?.tagName}:${el?.getAttribute('aria-label') ?? el?.textContent?.trim().slice(0, 30)}`;
          }),
        );
      }
      expect(visited.size, 'Tab reaches more than one control in the dialog').toBeGreaterThan(1);
      // Escape closes, and focus returns to the control that opened it
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
    });
  });

  /* ================================ 5b. RESPONSIVE (phone) ===== */

  test.describe('5b responsive', () => {
    test('blockers and the project Work area do not scroll sideways on a phone', async () => {
      test.setTimeout(240_000);
      const project = await createProject('rsp');
      const item = await createItem('employee', `Phone task ${RUN}`, project.id);
      await ws.a.api('employee', 'POST', `/api/work-items/${item.id}/blockers`, { category: 'OTHER', reason: `Phone blocker ${RUN}` });
      for (const [name, path] of [
        ['blockers', '/work/blockers'],
        ['project-work', `/projects/${project.id}`],
      ] as const) {
        const page = await ws.a.open('manager', path);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForLoadState('networkidle').catch(() => undefined);
        await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 60_000 });
        expect(await scrollsSideways(page), `${name} scrolls sideways at 390px`).toBe(false);
        await shoot(page, name, 390);
        await ws.a.release(page);
      }
    });
  });

});
