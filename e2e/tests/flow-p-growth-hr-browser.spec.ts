import { expect, test, type Locator, type Page } from '@playwright/test';
import { BASE_URLS } from '../playwright.config';
import {
  actor,
  requireGrowthEnvironment,
  RUN_TAG,
  rows,
  unique,
  type Actor,
} from '../fixtures/growth-api';
import { deleteTaggedTimesheets, residue } from '../fixtures/residue';

/**
 * Flow P — the everyday people workflows, driven through the browser.
 *
 * Flow N proves these hand-offs through the API. This is the version a person
 * sees: every mutation below is a click or a keystroke in apps/web, performed
 * by the role that would really do it. The API is used only to CHECK what the
 * screen persisted (and to clean up), never to perform the action under test.
 *
 * Sign-ins: one browser session per role per run (login throttle is 20 per 10
 * minutes). Every row carries RUN_TAG, and afterAll asserts residue is empty.
 */
test.describe.configure({ mode: 'serial' });

let employeePage: Page;
let managerPage: Page;
let hrPage: Page;
let adminPage: Page;
let employee: Actor;
let manager: Actor;
let hr: Actor;
let admin: Actor;

const cleanup: Array<() => Promise<string | null>> = [];

async function signIn(page: Page, email: string, password: string, slug: string) {
  await page.goto(`${BASE_URLS.web}/login?tenant=${slug}`);
  await page.getByLabel(/email/i).first().fill(email);
  await page.getByLabel(/password/i).first().fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 45_000 });
}

/**
 * Navigate by path. The tenant is carried by the session cookie after sign-in;
 * a stray `?tenant=` is forwarded by some list pages to the API as a filter and
 * rejected ("property tenant should not exist"), so none is added here.
 */
async function go(page: Page, path: string) {
  await page.goto(`${BASE_URLS.web}${path}`, { waitUntil: 'domcontentloaded' });
  // A form typed into before the app hydrates is reset by hydration.
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

/** Fill, and keep filling until the value sticks: survives a late hydration. */
async function fillStable(field: Locator, value: string) {
  await expect(async () => {
    await field.fill(value);
    await expect(field).toHaveValue(value, { timeout: 1_500 });
  }).toPass({ timeout: 20_000 });
}

/** Open a runtime lookup (custom combobox) and choose the option by name. */
async function pickLookup(
  page: Page,
  label: RegExp,
  option: RegExp,
  scope: Page | Locator = page,
) {
  const field = scope.getByRole('combobox', { name: label }).first();
  await expect(async () => {
    await field.click();
    // The record's Form switcher is a <select> whose hidden <option>s also match.
    // The listbox is portalled out of any drawer, so look for it on the page.
    await page
      .locator('[role="option"]:visible')
      .filter({ hasText: option })
      .first()
      .click({ timeout: 3_000 });
  }).toPass({ timeout: 20_000 });
}

test.beforeAll(async ({ browser }) => {
  await requireGrowthEnvironment();
  [employee, manager, hr, admin] = await Promise.all([
    actor('employee'),
    actor('manager'),
    actor('hr'),
    actor('system-admin'),
  ]);
  const slug = process.env.E2E_TENANT_SLUG?.trim() || 'dijipeople-demo';
  const domain = process.env.E2E_TENANT_USER_DOMAIN || 'dijipeople.local';
  const password = process.env.E2E_TENANT_USER_PASSWORD!;
  const open = async (role: string) => {
    // Remote check-in needs the browser's location, so grant it (Doha).
    const page = await (
      await browser.newContext({
        permissions: ['geolocation'],
        geolocation: { latitude: 25.2854, longitude: 51.531 },
      })
    ).newPage();
    await signIn(page, `${role}@${domain}`, password, slug);
    return page;
  };
  employeePage = await open('employee');
  managerPage = await open('manager');
  hrPage = await open('hr');
  adminPage = await open('system-admin');
});

test.afterAll(async () => {
  const failures: string[] = [];
  // Timesheet entries pin the project (409 on delete), so they go first.
  await deleteTaggedTimesheets(RUN_TAG);
  for (const step of cleanup.reverse()) {
    const failure = await step().catch((e: Error) => e.message);
    if (failure) failures.push(failure);
  }
  expect(failures, 'cleanup must not fail silently').toEqual([]);
  expect(await residue(RUN_TAG), 'this run left rows behind').toEqual({});
});

/** A weekday far ahead and unique per call (see Flow N): reruns never collide. */
let dayCursor = 0;
const runBase = 200 + Math.floor(Math.random() * 400) * 7;
function freeDay(): string {
  dayCursor += 7;
  const date = new Date(Date.now() + (runBase + dayCursor) * 86_400_000);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6)
    date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

type LeaveRequest = { id: string; status: string; reason?: string };

async function findLeave(reason: string): Promise<LeaveRequest | undefined> {
  const mine = await employee.get('leave-requests/mine');
  return rows<LeaveRequest>(mine.body).find((r) => r.reason === reason);
}

/** Employee files a one-day leave request through the form; returns its id. */
async function requestLeaveInUi(reason: string, day: string): Promise<string> {
  await go(employeePage, '/leaves/new');
  await pickLookup(employeePage, /leave type/i, /annual/i);
  await fillStable(employeePage.getByLabel(/start date/i), day);
  await fillStable(employeePage.getByLabel(/end date/i), day);
  await fillStable(employeePage.getByLabel(/reason/i), reason);
  await employeePage.getByRole('button', { name: /^save$/i }).click();
  await expect
    .poll(async () => (await findLeave(reason))?.id ?? '', { timeout: 30_000 })
    .not.toBe('');
  const found = (await findLeave(reason))!;
  cleanup.push(async () => {
    const r = await employee.post(`leave-requests/${found.id}/cancel`, {});
    return [200, 201, 400, 404, 409].includes(r.status)
      ? null
      : `leave cancel ${found.id}: ${r.status} ${r.message}`;
  });
  return found.id;
}

test.describe('Flow P — leave', () => {
  test('GP-L1 an employee requests leave, a manager approves it on the record, the employee sees it approved', async () => {
    const reason = `GP-L1 ${unique()}`;
    const id = await requestLeaveInUi(reason, freeDay());
    expect((await findLeave(reason))?.status).toBe('PENDING');

    await go(managerPage, `/leaves/${id}`);
    await managerPage.getByRole('button', { name: /^approve$/i }).click();
    await expect
      .poll(async () => (await findLeave(reason))?.status, { timeout: 30_000 })
      .toBe('APPROVED');

    await go(employeePage, `/leaves/${id}`);
    await expect(employeePage.getByText(/approved/i).first()).toBeVisible();
  });
});

/** The approval request the leave created; assigned to the tenant admin here. */
async function approvalFor(entityId: string) {
  let found: { id: string; status: string } | undefined;
  await expect
    .poll(async () => {
      const r = await admin.get(`approvals?entityId=${entityId}`);
      found = rows<{ id: string; status: string }>(r.body)[0];
      return found?.id ?? '';
    }, { timeout: 30_000, message: 'approval request for the leave' })
    .not.toBe('');
  return found!;
}

/** Open an approval from the inbox list (a click on its row), not by URL. */
async function openFromInbox(page: Page, approvalId: string) {
  await go(page, '/approvals');
  await page.locator(`a[href*="${approvalId}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(approvalId));
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

test.describe('Flow P — approvals inbox and notifications', () => {
  test('GP-L2 the approver rejects from the Approvals inbox with a reason; employee sees REJECTED and the reason is on the approval', async () => {
    const reason = `GP-L2 ${unique()}`;
    const id = await requestLeaveInUi(reason, freeDay());
    const approval = await approvalFor(id);
    expect(approval.status).toBe('PENDING');

    await openFromInbox(adminPage, approval.id);
    await adminPage.getByRole('button', { name: /^reject$/i }).click();
    const why = `Team coverage ${RUN_TAG}`;
    await fillStable(adminPage.getByLabel(/^reason/i), why);
    await adminPage.getByRole('button', { name: /^reject$/i }).last().click();

    await expect
      .poll(async () => (await findLeave(reason))?.status, { timeout: 30_000 })
      .toBe('REJECTED');
    const after = await admin.get(`approvals/${approval.id}`);
    expect(after.status).toBe(200);
    expect(JSON.stringify(after.body)).toContain(why);
    await go(employeePage, `/leaves/${id}`);
    await expect(employeePage.getByText(/rejected/i).first()).toBeVisible();
  });

  test('GP-A1 the approver approves from the inbox and the requester is notified in the UI', async () => {
    const reason = `GP-A1 ${unique()}`;
    const id = await requestLeaveInUi(reason, freeDay());
    const approval = await approvalFor(id);

    await openFromInbox(adminPage, approval.id);
    await adminPage.getByRole('button', { name: /^approve$/i }).click();
    await adminPage.getByRole('button', { name: /^approve$/i }).last().click();
    await expect
      .poll(async () => (await findLeave(reason))?.status, { timeout: 30_000 })
      .toBe('APPROVED');
    expect((await approvalFor(id)).status).toBe('APPROVED');

    // The product's own notification feed, as the employee sees it.
    await go(employeePage, '/inbox');
    await expect(
      employeePage.getByText(/leave request approved/i).first(),
    ).toBeVisible({ timeout: 30_000 });
  });

  test('GP-L3 an end date before the start date is refused with a visible message and nothing is saved', async () => {
    const reason = `GP-L3 ${unique()}`;
    const day = freeDay();
    const earlier = new Date(Date.parse(day) - 2 * 86_400_000).toISOString().slice(0, 10);
    await go(employeePage, '/leaves/new');
    await pickLookup(employeePage, /leave type/i, /annual/i);
    await fillStable(employeePage.getByLabel(/start date/i), day);
    await fillStable(employeePage.getByLabel(/end date/i), earlier);
    await fillStable(employeePage.getByLabel(/reason/i), reason);
    await employeePage.getByRole('button', { name: /^save$/i }).click();
    await expect(
      employeePage.getByText(/end date cannot be before start date/i).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(await findLeave(reason), 'the refused request must not exist').toBeUndefined();
  });
});

// ---------------------------------------------------------------- projects
const projectSuffix = unique();
const customerName = `QA Customer ${projectSuffix}`;
const projectName = `QA Project ${projectSuffix}`;
let projectId = '';

test.describe('Flow P — projects and timesheets', () => {
  test('GP-P1 an admin creates a customer and a project and assigns the employee, who then sees it', async () => {
    let customerId = '';
    await go(adminPage, '/customers/new');
    await fillStable(adminPage.getByLabel(/^company/i), customerName);
    await adminPage.getByRole('button', { name: /^save$/i }).click();
    await expect
      .poll(async () => {
        const r = await admin.get(`customers?search=${encodeURIComponent(projectSuffix)}`);
        customerId = rows<{ id: string; name: string }>(r.body).find((c) => c.name === customerName)?.id ?? '';
        return customerId;
      }, { timeout: 30_000 })
      .not.toBe('');

    await go(adminPage, '/projects/new');
    await fillStable(adminPage.getByLabel(/^project name/i), projectName);
    await pickLookup(adminPage, /^customer/i, new RegExp(customerName));
    await adminPage.getByRole('button', { name: /^save$/i }).click();
    await expect
      .poll(async () => {
        const r = await admin.get(`projects?search=${encodeURIComponent(projectSuffix)}`);
        projectId = rows<{ id: string; name: string }>(r.body).find((p) => p.name === projectName)?.id ?? '';
        return projectId;
      }, { timeout: 30_000 })
      .not.toBe('');
    // Dependents first: a project with an assignment refuses deletion.
    cleanup.push(async () => {
      const a = await admin.get(`projects/${projectId}/assignments`);
      for (const row of rows<{ id: string }>(a.body)) {
        await admin.del(`projects/${projectId}/assignments/${row.id}`);
      }
      const p = await admin.del(`projects/${projectId}`);
      const c = await admin.del(`customers/${customerId}`);
      return [200, 204, 404].includes(p.status) && [200, 204, 404].includes(c.status)
        ? null
        : `project/customer cleanup: ${p.status} ${p.message} / ${c.status} ${c.message}`;
    });

    await go(adminPage, `/projects/${projectId}`);
    await adminPage.locator('[id$="-tab-assigned-employees"]').click();
    await adminPage.getByRole('button', { name: 'Assign', exact: true }).click();
    const drawer = adminPage.getByRole('dialog');
    await fillStable(drawer.getByLabel(/billing rate/i), '10');
    await fillStable(drawer.getByLabel(/allocation from/i), new Date().toISOString().slice(0, 10));
    await drawer.getByLabel(/project role/i).selectOption({ index: 1 });
    await adminPage.getByRole('checkbox', { name: /^demo employee$/i }).check();
    await adminPage.getByRole('button', { name: /^save & close$/i }).click();

    await expect
      .poll(async () => {
        const a = await admin.get(`projects/${projectId}/assignments`);
        return rows(a.body).length;
      }, { timeout: 30_000 })
      .toBe(1);
    const mine = await employee.get('projects/assigned/me');
    expect(JSON.stringify(mine.body)).toContain(projectId);
    await go(employeePage, '/projects');
    await expect(employeePage.getByText(projectName).first()).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('Flow P — timesheets', () => {
  test('GP-T1 the employee fills and submits a week, the manager approves it, status persists', async () => {
    expect(projectId, 'GP-P1 created the project this week is filled against').not.toBe('');
    const note = `GP-T1 ${unique()}`;
    await go(employeePage, '/timesheets/new');
    // The first overdue week: it takes "Submit week" with a late reason, and in
    // a month's opening week has the fewest working days to fill. Submission
    // requires every working day of the week to be completed.
    const first = employeePage
      .locator('details')
      .filter({ has: employeePage.locator('summary', { hasText: /overdue/i }) })
      .first();
    const title = (await first.locator('summary').innerText()).match(/Week \d+/)![0];
    const weekNumber = Number(title.replace(/\D/g, ''));
    // Pin the week by its title: its badge changes as it is saved.
    const week = employeePage
      .locator('details')
      .filter({ has: employeePage.locator('summary', { hasText: new RegExp(`^\\s*${title}\\b`) }) });
    // Overdue weeks render open and a click on the summary would close them.
    await week.evaluate((el) => ((el as HTMLDetailsElement).open = true));
    // Each day is an <article>; only working days need hours.
    const days = week.locator('article').filter({ hasText: 'Working Day' });
    const workingDays = await days.count();
    expect(workingDays, 'the week has days to fill').toBeGreaterThan(0);
    for (let i = 0; i < workingDays; i += 1) {
      const card = days.nth(i);
      await card.getByRole('button', { name: /add entry/i }).click();
      await card.locator('select').first().selectOption({ label: projectName });
      await fillStable(card.getByRole('spinbutton', { name: /hours/i }), '8');
      await fillStable(card.getByPlaceholder(/work note/i), note);
    }
    await fillStable(week.getByLabel(/comment or late reason/i), `late ${note}`);
    await week.getByRole('button', { name: /save draft/i }).click();
    const timesheetId = employeePage.url().split('/').pop()!.split('?')[0];
    type Sheet = {
      entries: Array<{ note?: string | null; hoursWorked?: number }>;
      weeks: Array<{ id: string; weekNumber: number; status: string }>;
    };
    const sheet = async () => (await employee.get<Sheet>(`timesheets/${timesheetId}`)).body;
    await expect
      .poll(async () => (await sheet()).entries.filter((e) => e.note === note).length, { timeout: 30_000 })
      .toBe(workingDays);

    const status = async () => (await sheet()).weeks.find((w) => w.weekNumber === weekNumber)?.status ?? '';
    await expect.poll(status, { timeout: 30_000, message: 'saved week is ready' }).toBe('READY_TO_SUBMIT');
    // The week is no longer "Overdue" once saved, but it is still late: the form
    // must keep taking the late reason (regression: it silently dropped it).
    await week.getByRole('button', { name: /submit week/i }).click();
    await expect
      .poll(status, { timeout: 30_000, message: 'week left the draft states' })
      .toMatch(/SUBMITTED|PENDING_APPROVAL/);
    // The manager's queue opens on the submitted timesheet; approve that week.
    await go(managerPage, '/timesheets/approvals');
    const managerWeek = managerPage
      .locator('details')
      .filter({ has: managerPage.locator('summary', { hasText: new RegExp(`^\\s*${title}\\b`) }) });
    await managerWeek.evaluate((el) => ((el as HTMLDetailsElement).open = true));
    await managerWeek.getByRole('button', { name: /^approve$/i }).click();
    await expect
      .poll(status, { timeout: 30_000, message: 'week approved by the manager' })
      .toMatch(/APPROVED|PAYROLL_READY/);

    await go(employeePage, `/timesheets/${timesheetId}`);
    await expect(
      employeePage.locator('summary', { hasText: new RegExp(`^\\s*${title}\\b`) }),
    ).toContainText(/approved/i);
  });
});

test.describe('Flow P — attendance', () => {
  test('GP-AT1 the employee checks in and out on the Attendance screen and the record persists', async () => {
    type Entry = { id: string; checkInAt?: string | null; checkOutAt?: string | null };
    const before = await employee.get<Entry | ''>('attendance/mine/active');
    expect(before.body, 'no open attendance entry before the test').toBeFalsy();

    await go(employeePage, '/attendance');
    await employeePage.getByRole('button', { name: 'Check In', exact: true }).click();
    let entryId = '';
    await expect
      .poll(async () => {
        const r = await employee.get<Entry | ''>('attendance/mine/active');
        entryId = (r.body as Entry)?.id ?? '';
        return entryId;
      }, { timeout: 30_000 })
      .not.toBe('');
    // The punch has no tag column, so cleanup is by the id captured here.
    cleanup.push(async () => {
      const r = await admin.del(`attendance/${entryId}`);
      return [200, 204, 404].includes(r.status)
        ? null
        : `attendance ${entryId}: ${r.status} ${r.message}`;
    });
    await expect(employeePage.getByRole('button', { name: 'Check Out', exact: true })).toBeVisible({ timeout: 20_000 });

    await employeePage.getByRole('button', { name: 'Check Out', exact: true }).click();
    await expect
      .poll(async () => {
        const r = await employee.get<Entry>(`attendance/${entryId}`);
        return r.body.checkOutAt ?? '';
      }, { timeout: 30_000 })
      .not.toBe('');
    const open = await employee.get<Entry | ''>('attendance/mine/active');
    expect(open.body, 'the entry is closed, nothing left open').toBeFalsy();
    await expect(employeePage.getByRole('button', { name: 'Check In', exact: true })).toBeVisible({ timeout: 20_000 });
  });
});

async function uploadEmployeeDocumentInUi(page: Page, who: Actor, label: string) {
  {
    const people = await who.get('employees?pageSize=100');
    const target = rows<{ id: string; workEmail?: string }>(people.body).find(
      (e) => e.workEmail === 'employee@dijipeople.local',
    );
    expect(target, 'the seeded employee exists').toBeTruthy();
    const title = `${label} ${unique()}`;
    const body = `${label} synthetic ${RUN_TAG}`;
    // The grid lists the file name, so the tag rides in it.
    const fileName = `${label.toLowerCase()}-${unique()}.pdf`;

    await go(page, `/employees/${target!.id}`);
    await page.locator('[id$="-tab-documents"]').first().click();
    await page.getByRole('button', { name: 'New', exact: true }).click();
    const drawer = page.getByRole('dialog');
    await pickLookup(page, /document type/i, /.+/, drawer);
    await pickLookup(page, /document category/i, /.+/, drawer);
    await fillStable(drawer.getByLabel(/^title/i), title);
    // Choosing the file is what submits the form.
    await drawer.locator('input[type="file"]').setInputFiles({
      name: fileName,
      mimeType: 'application/pdf',
      buffer: Buffer.from(body),
    });

    let documentId = '';
    await expect
      .poll(async () => {
        const r = await who.get(`documents/entity/EMPLOYEE/${target!.id}`);
        documentId = rows<{ id: string; title: string }>(r.body).find((d) => d.title === title)?.id ?? '';
        return documentId;
      }, { timeout: 30_000 })
      .not.toBe('');
    cleanup.push(async () => {
      // HR may upload but holds no documents:DELETE, so the admin removes it.
      const r = await admin.del(`documents/${documentId}`);
      return [200, 204, 404].includes(r.status)
        ? null
        : `document ${documentId}: ${r.status} ${r.message}`;
    });

    // It lists on the employee's Documents tab for the person who uploaded it...
    await go(page, `/employees/${target!.id}`);
    await page.locator('[id$="-tab-documents"]').first().click();
    const row = page.getByRole('row').filter({ hasText: fileName });
    await expect(row).toBeVisible({ timeout: 20_000 });
    // ...and the download action on that row hands back the stored bytes.
    const downloading = page.waitForEvent('download');
    await row.getByRole('link', { name: /download document/i }).click();
    const file = await downloading;
    expect(file.suggestedFilename()).toBe(fileName);
    const { readFile } = await import('node:fs/promises');
    expect((await readFile((await file.path())!)).toString()).toBe(body);
  }
}

test.describe('Flow P — documents', () => {
  test('GP-D1 an administrator uploads a document against an employee in the UI; it lists and downloads', async () => {
    await uploadEmployeeDocumentInUi(adminPage, admin, 'GP-D1');
  });

  // BUG-4456 (fixed): HR now holds employees.documents.upload. Was test.fixme while the
  // grant was missing, which refused HR with a 403 in the browser.
  test('GP-D2 HR uploads a document against an employee in the UI (BUG-4456)', async () => {
    await uploadEmployeeDocumentInUi(hrPage, hr, 'GP-D2');
  });
});

test.describe('Flow P — settings', () => {
  test('GP-S1 an admin changes the late-check-in grace in Attendance Settings; it persists across a reload and is restored', async () => {
    const policy = async () =>
      (await admin.get<{ lateCheckInGraceMinutes: number }>('attendance/policy')).body.lateCheckInGraceMinutes;
    const original = await policy();
    const changed = original + 1;
    // Safety net: whatever happens below, the tenant ends on its original value.
    cleanup.push(async () => {
      if ((await policy()) === original) return null;
      const r = await admin.patch('attendance/policy', { lateCheckInGraceMinutes: original });
      return r.status < 300 ? null : `restore attendance policy: ${r.status} ${r.message}`;
    });

    const field = () => adminPage.getByLabel(/late grace minutes/i);
    await go(adminPage, '/settings/people/attendance');
    await expect(field()).toHaveValue(String(original), { timeout: 20_000 });
    await fillStable(field(), String(changed));
    await adminPage.getByRole('button', { name: /^save$/i }).click();
    await expect.poll(policy, { timeout: 30_000 }).toBe(changed);

    await go(adminPage, '/settings/people/attendance');
    await expect(field()).toHaveValue(String(changed), { timeout: 20_000 });

    await fillStable(field(), String(original));
    await adminPage.getByRole('button', { name: /^save$/i }).click();
    await expect.poll(policy, { timeout: 30_000 }).toBe(original);
    await go(adminPage, '/settings/people/attendance');
    await expect(field()).toHaveValue(String(original), { timeout: 20_000 });
  });
});
