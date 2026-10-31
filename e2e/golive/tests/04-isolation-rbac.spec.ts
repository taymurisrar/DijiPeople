import { test, expect, env } from '../fixtures/test';
import { api, apiToken, stateFile, tenantUrl } from '../fixtures/tenants';

/**
 * DPQA-ISO-*: tenant isolation between two independently provisioned tenants (A and B).
 * DPQA-RBAC-*: what each base role may do inside tenant A.
 * Every assertion checks the persisted state through the API of the OWNING tenant, not only the response to the attacker.
 */


let A: string; // tenant A owner token
let B: string; // tenant B owner token
let aIds: string[] = [];
let bIds: string[] = [];

test.beforeAll(async ({ request }) => {
  A = await apiToken(request, 'A', 'OWNER');
  B = await apiToken(request, 'B', 'OWNER');
  const a = await api(request, A, 'GET', '/employees?pageSize=100');
  const b = await api(request, B, 'GET', '/employees?pageSize=100');
  aIds = (a.body.items as Array<{ id: string }>).map((e) => e.id);
  bIds = (b.body.items as Array<{ id: string }>).map((e) => e.id);
});

test('[DPQA-ISO-000] fixture sanity: both tenants have employees and they are disjoint', async () => {
  expect(aIds.length).toBeGreaterThan(0);
  expect(bIds.length).toBeGreaterThan(0);
  expect(aIds.filter((i) => bIds.includes(i))).toEqual([]);
});

test('[DPQA-ISO-001] tenant A list never contains tenant B employees', async ({ request }) => {
  const r = await api(request, A, 'GET', '/employees?pageSize=100');
  const ids = (r.body.items as Array<{ id: string; tenantId: string }>);
  expect(ids.some((e) => bIds.includes(e.id))).toBe(false);
  expect(new Set(ids.map((e) => e.tenantId)).size).toBe(1);
});

test('[DPQA-ISO-002] A cannot read a B employee by id', async ({ request }) => {
  const r = await api(request, A, 'GET', `/employees/${bIds[0]}`);
  expect([403, 404]).toContain(r.status);
});

test('[DPQA-ISO-003] A cannot update a B employee; B record is unchanged', async ({ request }) => {
  const before = await api(request, B, 'GET', `/employees/${bIds[0]}`);
  const r = await api(request, A, 'PATCH', `/employees/${bIds[0]}`, { firstName: 'Hijacked' });
  expect([400, 403, 404]).toContain(r.status);
  const after = await api(request, B, 'GET', `/employees/${bIds[0]}`);
  expect(after.body.firstName).toBe(before.body.firstName);
});

test('[DPQA-ISO-004] A cannot delete a B employee; B record still exists', async ({ request }) => {
  const r = await api(request, A, 'DELETE', `/employees/${bIds[0]}`);
  // Contract confirmed in REMEDIATION-HANDOFF (DP-QA-008): a single-id delete that matches nothing in the caller's tenant answers 404 EMPLOYEE_NOT_FOUND,
  // identical for a foreign id and a random id (no tenant enumeration). RUN-001..003 asserted the old 200/deletedCount=0 body.
  expect(r.status).toBe(404);
  const rnd = await api(request, A, 'DELETE', '/employees/11111111-2222-4333-8444-555555555555');
  expect(rnd.status, 'same answer as for a foreign id').toBe(404);
  expect(JSON.stringify(rnd.body).replace(/"(traceId|timestamp|path|reference)":"[^"]*",?/g, '')).toBe(JSON.stringify(r.body).replace(/"(traceId|timestamp|path|reference)":"[^"]*",?/g, ''));
  const still = await api(request, B, 'GET', `/employees/${bIds[0]}`);
  expect(still.status).toBe(200);
});

test('[DPQA-ISO-005] a client-supplied tenantId is rejected and nothing is created in B', async ({ request }) => {
  const before = (await api(request, B, 'GET', '/employees?pageSize=100')).body.meta.total;
  const r = await api(request, A, 'POST', '/employees', { tenantId: 'x', firstName: 'Mass', lastName: 'Assign', hireDate: '2025-01-01' });
  expect(r.status).toBe(400); // forbidNonWhitelisted
  const after = (await api(request, B, 'GET', '/employees?pageSize=100')).body.meta.total;
  expect(after).toBe(before);
});

for (const [id, path] of [['006', '/users'], ['007', '/departments'], ['008', '/documents'], ['009', '/roles']] as const) {
  test(`[DPQA-ISO-${id}] ${path}: no row of tenant B appears in tenant A's list`, async ({ request }) => {
    const a = await api(request, A, 'GET', `${path}?pageSize=100`);
    const b = await api(request, B, 'GET', `${path}?pageSize=100`);
    expect(a.status).toBe(200);
    const rows = (x: any): any[] => (Array.isArray(x) ? x : (x?.items ?? []));
    const aTenant = new Set(rows(a.body).map((r) => r.tenantId).filter(Boolean));
    const bTenant = new Set(rows(b.body).map((r) => r.tenantId).filter(Boolean));
    for (const t of aTenant) expect(bTenant.has(t)).toBe(false);
  });
}

test('[DPQA-ISO-010] B credentials do not work against tenant A login', async ({ request }) => {
  const r = await request.post(`${env.QA_API_URL}/api/auth/login`, {
    headers: { 'X-DijiPeople-App': 'web' },
    data: { email: env.QA_TENANT_B_OWNER, password: env.QA_PASSWORD, tenantSlug: env.QA_TENANT_A_SLUG },
  });
  expect(r.status()).toBe(401);
});

test.describe('browser session scope', () => {
  test.use({ storageState: stateFile('A', 'OWNER') });
  test('[DPQA-ISO-011] tenant A session cookie does not open tenant B workspace', async ({ page }) => {
    await page.goto(tenantUrl('B', '/employees'));
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await expect(page).toHaveURL(/\/login/);
  });
});

/* ------------------------------ RBAC inside tenant A ------------------------------ */

const ROLES = ['EMPLOYEE', 'MANAGER', 'HR', 'PAYROLL'] as const;

for (const role of ROLES) {
  // DP-QA-002: reproduced on a tenant created through the real provisioning workflow.
  test(`[DPQA-RBAC-1-${role}] ${role} can read own self-context (DP-QA-002)`, async ({ request }) => {
    const t = await apiToken(request, 'A', role);
    const r = await api(request, t, 'GET', '/employees/me/context');
    expect(r.status, 'GET /employees/me/context').toBe(200);
    expect(r.body.employee?.workEmail).toContain(role === 'PAYROLL' ? 'payroll-manager' : role.toLowerCase());
  });
}

// DP-QA-009 remediation: the features endpoint stays readable for module visibility but must not leak price/cycle to non-settings roles.
test('[DPQA-RBAC-2-PRICE] subscription price and billing cycle are visible to the owner only (DP-QA-009 retest)', async ({ request }) => {
  const sub = async (role: 'OWNER' | 'MANAGER' | 'EMPLOYEE') => api(request, await apiToken(request, 'A', role), 'GET', '/tenant-settings/features');
  const o = await sub('OWNER');
  expect(o.body.subscription.finalPrice, 'owner sees the price').toBe(69);
  const m = await sub('MANAGER');
  expect(m.status).toBe(200);
  const leaked = JSON.stringify(m.body.subscription ?? {});
  expect(leaked).not.toMatch(/finalPrice|billingCycle|currency|"69"|:69/);
  expect((m.body.items as Array<{ key: string; isEnabled: boolean }>).some((i) => i.key === 'leave' && i.isEnabled), 'module visibility still works for managers').toBe(true);
  expect((await sub('EMPLOYEE')).status).toBe(403);
});

for (const role of ['EMPLOYEE', 'MANAGER'] as const) {
  for (const [id, path] of [['01', '/users'], ['02', '/roles'], ['04', '/audit-logs']] as const) {
    test(`[DPQA-RBAC-2-${role}-${id}] ${role} is refused ${path}`, async ({ request }) => {
      const t = await apiToken(request, 'A', role);
      const r = await api(request, t, 'GET', path);
      expect(r.status).toBe(403);
    });
  }
}

test('[DPQA-RBAC-3-EMPLOYEE] employee list is limited to own scope', async ({ request }) => {
  const t = await apiToken(request, 'A', 'EMPLOYEE');
  const r = await api(request, t, 'GET', '/employees?pageSize=100');
  expect(r.status).toBe(200);
  expect(r.body.meta.total, 'OWN-scope employee must not see the whole tenant').toBeLessThanOrEqual(1);
});

test('[DPQA-RBAC-4-EMPLOYEE] employee cannot update another employee', async ({ request }) => {
  const t = await apiToken(request, 'A', 'EMPLOYEE');
  const other = aIds.find((i) => true)!;
  const mine = (await api(request, t, 'GET', '/employees?pageSize=100')).body.items.map((e: any) => e.id);
  const target = aIds.find((i) => !mine.includes(i)) ?? other;
  const r = await api(request, t, 'PATCH', `/employees/${target}`, { firstName: 'Nope' });
  expect([403, 404]).toContain(r.status);
});

test('[DPQA-RBAC-5-EMPLOYEE] OWN scope: an employee cannot read another employee record by id (dashboard.view grant must not widen row scope)', async ({ request }) => {
  const t = await apiToken(request, 'A', 'EMPLOYEE');
  const mine = (await api(request, t, 'GET', '/employees?pageSize=100')).body.items.map((e: { id: string }) => e.id);
  const other = aIds.find((i) => !mine.includes(i))!;
  const r = await api(request, t, 'GET', `/employees/${other}`);
  expect([403, 404], 'GET another employee').toContain(r.status);
});

test('[DPQA-RBAC-6-EMPLOYEE] the leave CONFIGURATION list stays closed to employees; the employee form uses available-types', async ({ request }) => {
  const t = await apiToken(request, 'A', 'EMPLOYEE');
  expect((await api(request, t, 'GET', '/leave-types')).status).toBe(403);
  expect((await api(request, t, 'GET', '/leave-requests/available-types')).status).toBe(200);
});
