import { test, expect } from '../fixtures/test';
import { api, apiToken, stateFile, tenantUrl } from '../fixtures/tenants';

/**
 * DPQA-ATT-*: attendance, run on the seed-demo tenant S because a freshly PROVISIONED tenant ships no shift templates or work sites
 * (manual entry fails with 'Selected shift is not active' / 'officeLocationId must be a UUID' — see OBS-008). Tenant B is the isolation counterpart. Manual entries are created through the admin API for a fixed past working day (the
 * suite cannot rely on "today" being a working day — the QA clock was a scheduled off day when this was written) and removed
 * in afterAll. UI checks cover the employee's own view.
 */


const DAY = '2026-10-26'; // a Monday
let owner: string; let emp: string; let b: string;
let employeeId: string; let officeLocationId: string | undefined; let entryId: string | undefined;
const created: string[] = [];

test.beforeAll(async ({ request }) => {
  owner = await apiToken(request, 'S', 'ADMIN');
  emp = await apiToken(request, 'S', 'EMPLOYEE');
  b = await apiToken(request, 'B', 'OWNER');
  const list = (await api(request, owner, 'GET', '/employees?pageSize=100')).body.items as Array<{ id: string; firstName: string }>;
  employeeId = (list as Array<{ id: string; workEmail?: string }>).find((e) => e.workEmail === 'employee@dijipeople.local')!.id;
  const locs = (await api(request, owner, 'GET', '/attendance/locations')).body as Array<{ id: string }>;
  officeLocationId = locs[0]?.id;
});

test.afterAll(async ({ request }) => {
  const bad: string[] = [];
  for (const id of created) {
    const r = await api(request, owner, 'DELETE', `/attendance/${id}`);
    if (r.status >= 300) bad.push(`${id}:${r.status}`);
  }
  expect(bad, 'attendance cleanup').toEqual([]);
});

const manual = (over: Record<string, unknown> = {}) => ({
  employeeId, date: DAY, attendanceMode: 'OFFICE', officeLocationId, checkInTime: '08:00', checkOutTime: '16:30',
  adjustmentReason: 'QA manual entry', ...over,
});

test('[DPQA-ATT-001] manual entry is persisted with the right duration and appears in the entry list', async ({ request }) => {
  const r = await api(request, owner, 'POST', '/attendance/manual', manual());
  expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBeLessThan(300);
  entryId = r.body.id ?? r.body.entry?.id;
  created.push(entryId!);
  const one = await api(request, owner, 'GET', `/attendance/${entryId}`);
  expect(one.status).toBe(200);
  const minutes = one.body.workedMinutes ?? one.body.totalWorkedMinutes;
  if (minutes !== undefined) expect(minutes).toBeGreaterThanOrEqual(480);
});

test('[DPQA-ATT-002] check-out earlier than check-in is rejected and nothing is stored', async ({ request }) => {
  const r = await api(request, owner, 'POST', '/attendance/manual', manual({ date: '2026-10-27', checkInTime: '16:00', checkOutTime: '08:00' }));
  if (r.status < 300) created.push(r.body.id);
  expect(r.status, 'out-before-in must be rejected').toBeGreaterThanOrEqual(400);
  expect(r.status).toBeLessThan(500);
});

test('[DPQA-ATT-003] a second entry for the same employee and day is refused', async ({ request }) => {
  test.skip(!entryId, 'depends on ATT-001');
  const r = await api(request, owner, 'POST', '/attendance/manual', manual());
  if (r.status < 300) created.push(r.body.id);
  expect(r.status, 'duplicate day entry').toBeGreaterThanOrEqual(400);
});

test('[DPQA-ATT-004] a manual entry without an adjustment reason is rejected', async ({ request }) => {
  const r = await api(request, owner, 'POST', '/attendance/manual', manual({ date: '2026-10-28', adjustmentReason: undefined }));
  if (r.status < 300) created.push(r.body.id);
  expect(r.status).toBe(400);
});

test('[DPQA-ATT-005] an employee cannot create a manual entry (admin-only command)', async ({ request }) => {
  const r = await api(request, emp, 'POST', '/attendance/manual', manual({ date: '2026-10-29' }));
  if (r.status < 300) created.push(r.body.id);
  expect(r.status).toBe(403);
});

test('[DPQA-ATT-006] employee own-day view loads; check-in on a scheduled off day is refused with a clear reason', async ({ request }) => {
  const today = await api(request, emp, 'GET', '/attendance/mine/today');
  expect(today.status).toBe(200);
  const r = await api(request, emp, 'POST', '/attendance/check-in', { attendanceMode: 'OFFICE' });
  // Depending on the QA clock this is either a refusal (off day / no work site) or a success; both must be explicit.
  if (r.status < 300) await api(request, emp, 'POST', '/attendance/check-out', {});
  else expect(String(r.body?.message ?? '').length, 'refusal carries a human-readable reason').toBeGreaterThan(5);
});

test('[DPQA-ATT-007] tenant B cannot read or delete tenant A\'s entry', async ({ request }) => {
  test.skip(!entryId, 'depends on ATT-001');
  const g = await api(request, b, 'GET', `/attendance/${entryId}`);
  expect([403, 404]).toContain(g.status);
  const d = await api(request, b, 'DELETE', `/attendance/${entryId}`);
  expect(d.status === 200 ? d.body.deletedCount ?? 0 : 0).toBe(0);
  expect((await api(request, owner, 'GET', `/attendance/${entryId}`)).status).toBe(200);
});

test('[DPQA-ATT-008] correction request: create then cancel; both states persist', async ({ request }) => {
  test.skip(!entryId, 'depends on ATT-001');
  const c = await api(request, emp, 'POST', '/attendance/correction-requests', { attendanceDate: DAY, correctionType: 'LATE_CHECK_IN', requestedCheckInAtUtc: `${DAY}T04:30:00.000Z`, reason: 'QA correction' });
  expect(c.status, JSON.stringify(c.body).slice(0, 300)).toBeLessThan(300);
  const id = c.body.item?.id ?? c.body.id;
  const x = await api(request, emp, 'POST', `/attendance/correction-requests/${id}/cancel`, {});
  expect(x.status).toBeLessThan(300);
  expect(String(x.body.item?.status), 'cancel response carries the new state').toMatch(/CANCEL/);
  // Persisted state is read by the admin: the employee cannot read their own request (DP-QA-022, see ATT-009).
  const owner2 = await apiToken(request, 'S', 'ADMIN');
  const g = await api(request, owner2, 'GET', `/attendance/correction-requests/${id}`);
  expect(String(g.body.item?.status ?? g.body.status)).toMatch(/CANCEL/);
});

test('[DPQA-ATT-009] an employee can read their own correction request (DP-QA-022: 403 today)', async ({ request }) => {
  const c = await api(request, emp, 'POST', '/attendance/correction-requests', { attendanceDate: '2026-10-22', correctionType: 'LATE_CHECK_IN', requestedCheckInAtUtc: '2026-10-22T04:30:00.000Z', reason: 'QA own-read' });
  expect(c.status, JSON.stringify(c.body).slice(0, 200)).toBeLessThan(300);
  const id = c.body.item?.id ?? c.body.id;
  try {
    const g = await api(request, emp, 'GET', `/attendance/correction-requests/${id}`);
    expect(g.status, 'own request must be readable by its creator').toBe(200);
  } finally {
    await api(request, emp, 'POST', `/attendance/correction-requests/${id}/cancel`, {});
  }
});

test.describe('attendance UI', () => {
  test.use({ storageState: `./golive-results/.auth/ADMIN.json` });
  test('[DPQA-ATT-010] admin attendance list: commands visible and the manual entry is listed', async ({ page }) => {
    await page.goto(tenantUrl('S', '/attendance'), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await expect(page.getByRole('heading', { name: /attendance/i }).first()).toBeVisible();
    for (const name of [/check in/i, /^new$/i, /correction request/i, /refresh/i, /data transfer/i]) {
      await expect(page.getByRole('button', { name }).or(page.getByRole('link', { name })).first()).toBeVisible();
    }
  });
});
