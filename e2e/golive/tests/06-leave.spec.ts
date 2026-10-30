import { test, expect } from '../fixtures/test';
import { api, apiToken, stateFile, tenantUrl } from '../fixtures/tenants';
import type { APIRequestContext } from '@playwright/test';

/**
 * DPQA-LV-*: leave request lifecycle in tenant A (provisioned through the real workflow).
 * Every outcome is read back from the API (persisted state). Tests are SELF-CONTAINED: Playwright restarts the worker after a
 * failed test, so module-level state does not survive — each test creates what it needs and cancels it in `finally`
 * (leave requests have no delete route, so the final state of anything created here is CANCELLED).
 */
const run = Date.now() % 100000;
const day = (offset: number) => new Date(Date.UTC(2027, 0, 3 + offset)).toISOString().slice(0, 10);
const tokens = async (request: APIRequestContext) => ({
  emp: await apiToken(request, 'A', 'EMPLOYEE'),
  owner: await apiToken(request, 'A', 'OWNER'),
});

/** Idempotent fixture: a fresh provisioned tenant ships NO leave types (OBS-008). */
async function ensureType(request: APIRequestContext, owner: string): Promise<string> {
  const existing = await api(request, owner, 'GET', '/leave-types');
  const list = Array.isArray(existing.body) ? existing.body : (existing.body.items ?? []);
  const found = list.find((t: { code?: string }) => t.code === 'QAL');
  if (found) return found.id;
  const r = await api(request, owner, 'POST', '/leave-types', { name: 'QA Leave', code: 'QAL', category: 'ANNUAL', isPaid: true, consumesBalance: false, requiresApproval: true, employeeRequestAllowed: true, isActive: true });
  expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBeLessThan(300);
  return r.body.id;
}

async function withRequest(request: APIRequestContext, offset: number, body: (ctx: { emp: string; owner: string; typeId: string; id: string }) => Promise<void>) {
  const { emp, owner } = await tokens(request);
  const typeId = await ensureType(request, owner);
  const s = day((run + offset) % 300);
  const r = await api(request, emp, 'POST', '/leave-requests', { leaveTypeId: typeId, startDate: s, endDate: s, reason: `QA ${run}` });
  expect(r.status, `submit: ${JSON.stringify(r.body).slice(0, 300)}`).toBe(201);
  try {
    await body({ emp, owner, typeId, id: r.body.id });
  } finally {
    const c = await api(request, emp, 'POST', `/leave-requests/${r.body.id}/cancel`, { reason: 'QA cleanup' }); // employee is refused today: DP-QA-011
    if (c.status >= 300) await api(request, owner, 'POST', `/leave-requests/${r.body.id}/cancel`, { reason: 'QA cleanup (admin)' });
  }
}

test('[DPQA-LV-000] fixture: the owner can create a requestable leave type', async ({ request }) => {
  const { owner } = await tokens(request);
  expect(await ensureType(request, owner)).toBeTruthy();
});

test('[DPQA-LV-001] employee can list requestable leave types (DP-QA-011: 403 today)', async ({ request }) => {
  const { emp } = await tokens(request);
  const r = await api(request, emp, 'GET', '/leave-requests/available-types');
  expect(r.status, 'employee self-service: available leave types').toBe(200);
});

test('[DPQA-LV-002] a valid request is persisted as pending and listed under "mine"', async ({ request }) => {
  await withRequest(request, 1, async ({ emp, id }) => {
    const one = await api(request, emp, 'GET', `/leave-requests/${id}`);
    expect(one.status).toBe(200);
    expect(String(one.body.status)).toMatch(/PENDING|SUBMITTED/);
    const mine = await api(request, emp, 'GET', '/leave-requests/mine');
    const items = Array.isArray(mine.body) ? mine.body : (mine.body.items ?? []);
    expect(items.some((x: { id: string }) => x.id === id), 'new request appears in /mine').toBe(true);
  });
});

test('[DPQA-LV-003] invalid submissions are rejected and create nothing', async ({ request }) => {
  const { emp, owner } = await tokens(request);
  const typeId = await ensureType(request, owner);
  const count = async () => { const m = await api(request, emp, 'GET', '/leave-requests/mine'); return (Array.isArray(m.body) ? m.body : (m.body.items ?? [])).length; };
  const n = await count();
  for (const [label, body] of [
    ['end before start', { leaveTypeId: typeId, startDate: day(300), endDate: day(299) }],
    ['missing leave type', { startDate: day(301), endDate: day(301) }],
    ['malformed date', { leaveTypeId: typeId, startDate: 'tomorrow', endDate: 'tomorrow' }],
    ['unknown leave type', { leaveTypeId: '11111111-2222-4333-8444-555555555555', startDate: day(302), endDate: day(302) }],
    ['unknown field (status)', { leaveTypeId: typeId, startDate: day(303), endDate: day(303), status: 'APPROVED' }],
  ] as const) {
    const r = await api(request, emp, 'POST', '/leave-requests', body);
    expect(r.status, label).toBeGreaterThanOrEqual(400);
    expect(r.status, label).toBeLessThan(500);
  }
  expect(await count()).toBe(n);
});

test('[DPQA-LV-004] an overlapping request for the same dates is refused', async ({ request }) => {
  await withRequest(request, 2, async ({ emp, typeId, id }) => {
    const first = await api(request, emp, 'GET', `/leave-requests/${id}`);
    const r = await api(request, emp, 'POST', '/leave-requests', { leaveTypeId: typeId, startDate: String(first.body.startDate).slice(0, 10), endDate: String(first.body.endDate).slice(0, 10), reason: 'dup' });
    if (r.status === 201) await api(request, emp, 'POST', `/leave-requests/${r.body.id}/cancel`, { reason: 'QA cleanup' });
    expect(r.status, 'overlap must be prevented').toBeGreaterThanOrEqual(400);
  });
});

test('[DPQA-LV-005] the requester cannot approve their own request', async ({ request }) => {
  await withRequest(request, 3, async ({ emp, id }) => {
    const r = await api(request, emp, 'POST', `/leave-requests/${id}/approve`, { comments: 'self' });
    expect([400, 403]).toContain(r.status);
    const one = await api(request, emp, 'GET', `/leave-requests/${id}`);
    expect(String(one.body.status)).not.toMatch(/APPROVED/);
  });
});

test('[DPQA-LV-006] another employee-level user cannot read someone else\'s request', async ({ request }) => {
  await withRequest(request, 4, async ({ id }) => {
    const t = await apiToken(request, 'A', 'PAYROLL');
    const r = await api(request, t, 'GET', `/leave-requests/${id}`);
    expect([403, 404]).toContain(r.status);
  });
});

test('[DPQA-LV-007] tenant B cannot read tenant A\'s request', async ({ request }) => {
  await withRequest(request, 5, async ({ id }) => {
    const b = await apiToken(request, 'B', 'OWNER');
    const r = await api(request, b, 'GET', `/leave-requests/${id}`);
    expect([403, 404]).toContain(r.status);
  });
});

test('[DPQA-LV-008] the request owner can cancel; the cancelled state persists (DP-QA-011: 403 today)', async ({ request }) => {
  const { emp, owner } = await tokens(request);
  const typeId = await ensureType(request, owner);
  const s = day((run + 6) % 300);
  const c = await api(request, emp, 'POST', '/leave-requests', { leaveTypeId: typeId, startDate: s, endDate: s });
  expect(c.status).toBe(201);
  const r = await api(request, emp, 'POST', `/leave-requests/${c.body.id}/cancel`, { reason: 'QA' });
  expect(r.status, `cancel own request: ${JSON.stringify(r.body).slice(0, 160)}`).toBeLessThan(300);
  const one = await api(request, emp, 'GET', `/leave-requests/${c.body.id}`);
  expect(String(one.body.status)).toMatch(/CANCEL/);
});

test.describe('leave UI (employee)', () => {
  test.use({ storageState: stateFile('A', 'EMPLOYEE') });
  test('[DPQA-LV-010] employee Leave page shows list and the New command', async ({ page }) => {
    await page.goto(tenantUrl('A', '/leaves'), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await expect(page.getByRole('heading', { name: /leaves?/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^new$/i }).or(page.getByRole('link', { name: /^new$/i })).first()).toBeVisible();
    await expect(page.getByText(/showing \d+ to \d+ of \d+ records|no leave/i).first()).toBeVisible();
  });
});
