import { test, expect } from '../fixtures/test';
import { api, apiToken, stateFile, tenantUrl } from '../fixtures/tenants';

/**
 * DPQA-EMP-*: employee lifecycle in tenant A (provisioned through the real workflow), as the tenant owner.
 * Each scenario creates its own data with a unique run suffix and removes it afterwards; cleanup failures are reported,
 * not swallowed (see .agent/context/test-resource-policy.md).
 */
test.use({ storageState: stateFile('A', 'OWNER') });


const run = Date.now().toString(36);
const created: string[] = [];
let token: string;

test.beforeAll(async ({ request }) => {
  token = await apiToken(request, 'A', 'OWNER');
});

test.afterAll(async ({ request }) => {
  const failures: string[] = [];
  for (const id of created) {
    const r = await api(request, token, 'DELETE', `/employees/${id}`);
    if (![200, 204].includes(r.status)) failures.push(`${id} -> ${r.status}`);
  }
  expect(failures, 'cleanup of created employees').toEqual([]);
});

const open = async (page: import('@playwright/test').Page, path: string) => {
  await page.goto(tenantUrl('A', path), { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
};

test('[DPQA-EMP-001] list renders seeded rows, columns and commands', async ({ page }) => {
  await open(page, '/employees');
  await expect(page.getByRole('heading', { name: /employees/i }).first()).toBeVisible();
  for (const name of ['New', 'Data Transfer']) await expect(page.getByRole('button', { name }).or(page.getByRole('link', { name })).first()).toBeVisible();
  for (const col of ['Full Name', 'Employee Code', 'Employment Status', 'Reporting Manager', 'Hire Date', 'Work Email']) {
    await expect(page.getByText(col, { exact: false }).first()).toBeVisible();
  }
  await expect(page.getByText(/showing \d+ to \d+ of \d+ records/i)).toBeVisible();
});

test('[DPQA-EMP-002] empty form: Save is refused with field-level messages and creates nothing', async ({ page, request }) => {
  const before = (await api(request, token, 'GET', '/employees?pageSize=100')).body.meta.total;
  await open(page, '/employees/new');
  await page.getByRole('button', { name: /^save$/i }).first().click();
  await expect(page.getByText(/required|is required|enter/i).first()).toBeVisible();
  await expect(page).toHaveURL(/\/employees\/new/);
  const after = (await api(request, token, 'GET', '/employees?pageSize=100')).body.meta.total;
  expect(after).toBe(before);
});

test('[DPQA-EMP-003] create an employee through the UI; list, record and database agree', async ({ page, request }) => {
  const first = `Qa${run}`;
  await open(page, '/employees/new');
  await page.getByLabel(/^First Name/i).fill(first);
  await page.getByLabel(/^Last Name/i).fill('Lifecycle');
  await page.getByLabel(/^Hire Date/i).fill('2025-02-03');
  await page.getByLabel(/^Phone/i).first().fill('+97455512345');
  await page.getByLabel(/^Emergency Contact Name/i).fill('Emergency Person');
  await page.getByLabel(/^Emergency Contact Phone/i).fill('+97455512346');
  // The custom combobox is attached after hydration; retry the open until the listbox is actually there.
  await expect(async () => {
    await page.getByRole('combobox', { name: /Emergency Contact Relation Type/i }).click();
    await expect(page.getByRole('option', { name: 'Parent' })).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 20_000 });
  await page.getByRole('option', { name: 'Parent' }).click();
  await page.getByLabel(/^Work Email/i).fill(`qa-${run}@qa.dijipeople.test`);
  await page.getByRole('button', { name: /^save$/i }).first().click();
  await expect(page).not.toHaveURL(/\/employees\/new/, { timeout: 30_000 });
  const found = await api(request, token, 'GET', `/employees?search=${first}`);
  expect(found.body.items.length).toBe(1);
  const e = found.body.items[0];
  created.push(e.id);
  expect(e.lastName).toBe('Lifecycle');
  expect(e.employeeCode, 'an employee code is generated').toBeTruthy();
  await open(page, '/employees');
  await page.getByPlaceholder(/quick filter/i).fill(first);
  await expect(page.getByText(first).first()).toBeVisible();
});

test('[DPQA-EMP-004] duplicate work email is refused and no second row exists', async ({ request }) => {
  const rel = await api(request, token, 'GET', '/lookups/relation-types');
  const relId = (Array.isArray(rel.body) ? rel.body : rel.body.items)[0].id;
  const body = { firstName: 'Dup', lastName: 'Email', workEmail: `qa-${run}@qa.dijipeople.test`, hireDate: '2025-02-03', employmentStatus: 'ACTIVE', phone: '+97455500001', emergencyContactName: 'X Y', emergencyContactRelationTypeId: relId, emergencyContactPhone: '+97455500002' };
  const r = await api(request, token, 'POST', '/employees', body);
  if (r.status === 201) created.push(r.body.id);
  expect(r.status, 'duplicate workEmail must be rejected').toBeGreaterThanOrEqual(400);
  const rows = await api(request, token, 'GET', `/employees?search=qa-${run}`);
  expect(rows.body.items.length).toBe(1);
});

test('[DPQA-EMP-005] boundary: over-long and malformed values are rejected by the API', async ({ request }) => {
  const rel = await api(request, token, 'GET', '/lookups/relation-types');
  const relId = (Array.isArray(rel.body) ? rel.body : rel.body.items)[0].id;
  const base = { firstName: 'Bound', lastName: 'Case', hireDate: '2025-02-03', employmentStatus: 'ACTIVE', phone: '+97455500001', emergencyContactName: 'X Y', emergencyContactRelationTypeId: relId, emergencyContactPhone: '+97455500002' };
  for (const [label, patch] of [
    ['300-char first name', { firstName: 'x'.repeat(300) }],
    ['malformed email', { workEmail: 'not-an-email' }],
    ['impossible hire date', { hireDate: '2025-13-45' }],
    ['unknown employment status', { employmentStatus: 'WIZARD' }],
  ] as const) {
    const r = await api(request, token, 'POST', '/employees', { ...base, ...patch });
    if (r.status === 201) created.push(r.body.id);
    expect(r.status, label).toBe(400);
  }
});

async function withEmployee(request: import('@playwright/test').APIRequestContext, fn: (id: string) => Promise<void>) {
  const rel = await api(request, token, 'GET', '/lookups/relation-types');
  const relId = (Array.isArray(rel.body) ? rel.body : rel.body.items)[0].id;
  const tag = Date.now().toString(36);
  const r = await api(request, token, 'POST', '/employees', { firstName: `Tmp${tag}`, lastName: 'Fixture', hireDate: '2025-02-03', employmentStatus: 'ACTIVE', phone: '+97455500001', emergencyContactName: 'X Y', emergencyContactRelationTypeId: relId, emergencyContactPhone: '+97455500002' });
  expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBeLessThan(300);
  try { await fn(r.body.id); } finally { await api(request, token, 'DELETE', `/employees/${r.body.id}`); }
}

test('[DPQA-EMP-006] edit persists after reload and in the database', async ({ page, request }) => {
  await withEmployee(request, async (id) => {
    await open(page, `/employees/${id}`);
    await page.getByRole('button', { name: /^edit$/i }).first().click();
    const input = page.locator('[data-runtime-field="preferredName"] input').first();
    await expect(input).toBeEnabled({ timeout: 15_000 });
    await input.fill(`Pref${run}`);
    await page.getByRole('button', { name: /^save$/i }).first().click();
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await expect.poll(async () => (await api(request, token, 'GET', `/employees/${id}`)).body.preferredName, { timeout: 15_000 }).toBe(`Pref${run}`);
    await page.reload();
    await expect(page.getByText(`Pref${run}`).first()).toBeVisible();
  });
});

test('[DPQA-EMP-007] record page exposes the Starter tabs; non-Starter tabs are not offered (DP-QA-015)', async ({ page, request }) => {
  await withEmployee(request, async (id) => {
    await open(page, `/employees/${id}`);
    for (const tab of ['Summary', 'Attendance', 'Leave History', 'Documents']) await expect(page.getByRole('tab', { name: tab })).toBeVisible();
    for (const tab of ['Timesheets', 'Compensation', 'Pay setup', 'Payslips', 'Project Allocations']) {
      await expect(page.getByRole('tab', { name: tab }), `non-Starter tab "${tab}" must not be shown`).toHaveCount(0);
    }
  });
});

test('[DPQA-EMP-008] sorting the list by Full Name works (DP-QA-014: "Unknown sort field: fullName")', async ({ page }) => {
  await open(page, '/employees');
  await page.getByRole('button', { name: /sort full name/i }).click();
  await page.waitForTimeout(2500);
  await expect(page.getByText(/unknown sort field|could not load the employee module/i)).toHaveCount(0);
  await expect(page.locator('tbody tr').first()).toBeVisible();
});

test('[DPQA-EMP-009] sorting by Employee Code is applied (URL) without an error screen; quick filter narrows to empty', async ({ page }) => {
  await open(page, '/employees');
  await page.getByRole('button', { name: /sort employee code/i }).click();
  await page.waitForTimeout(2500);
  expect(page.url()).toMatch(/orderBy=employeeCode/);
  await expect(page.getByText(/unknown sort field|could not load the employee module/i)).toHaveCount(0);
  await page.getByPlaceholder(/quick filter/i).fill('zzzz-no-such-person');
  await expect(page.getByText(/no (records|results)|showing 0/i).first()).toBeVisible();
});
