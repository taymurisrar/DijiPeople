import { test, expect, env } from '../fixtures/test';
import { api, apiToken, growthTenantProvisioned } from '../fixtures/tenants';

/**
 * DPQA-GRW-* / DPQA-TRC-*: Growth-entitled import (needs the optional Growth tenant `QA_TENANT_G_SLUG` + `QA_TENANT_G_OWNER`, see QA-RUNBOOK RUN-005),
 * Starter-side entitlement enforcement for the same routes, and DP-QA-034 (employee self-context lookups).
 * AUTOMATION STATUS: written before the final candidate exists; the Growth tests have NOT been executed. First RUN-005 pass must start with
 * `--grep GRW` and any selector/contract correction must be justified in the run report - never by relaxing an assertion.
 * Genuinely unsupported (documented in TEST-MATRIX, not tested): leave delegation (no user-facing delegation; `leave-approval.delegate.ts` is an internal pattern),
 * calendar-driven leave accrual (policy persistence is LV-030..032; the clock-driven run needs a controlled application clock and is Not Run).
 */
const MODULE = 'employees';

// RUN-006: basic import/export/templates are on every plan (owner-approved). The Starter owner is ALLOWED the basic routes; the employee-level role is not (see 20-import-export-all-plans).
test.describe('Starter: basic data management is reachable (all plans)', () => {
  let owner: string;
  test.beforeAll(async ({ request }) => { owner = await apiToken(request, 'A', 'OWNER'); });
  for (const [id, method, path] of [
    ['001', 'GET', '/data-management/imports'],
    ['002', 'GET', `/data-management/modules/${MODULE}/template`],
    ['003', 'GET', `/data-management/modules/${MODULE}/fields`],
  ] as const) {
    test(`[DPQA-GRW-${id}] Starter owner: ${method} ${path} is allowed (basic import/export, every plan)`, async ({ request }) => {
      const r = await api(request, owner, method, path);
      expect(r.status, JSON.stringify(r.body).slice(0, 160)).toBe(200);
    });
  }
  test('[DPQA-GRW-004] Starter owner: an import analysis upload of a valid-shaped CSV is accepted for analysis (no 403, no 5xx) and writes no employees', async ({ request }) => {
    const before = (await api(request, owner, 'GET', '/employees?pageSize=1')).body;
    const r = await request.post(`${env.QA_API_URL}/api/data-management/modules/${MODULE}/imports/analyse`, {
      headers: { authorization: `Bearer ${owner}`, 'X-DijiPeople-App': 'web' },
      multipart: { file: { name: 'e.csv', mimeType: 'text/csv', buffer: Buffer.from('First Name,Last Name\nA,B\n') } },
    });
    expect(r.status(), await r.text()).not.toBe(403);
    expect(r.status()).toBeLessThan(500);
    const after = (await api(request, owner, 'GET', '/employees?pageSize=1')).body;
    expect(JSON.stringify(after.total ?? after.meta ?? after), 'analysis must not create employees').toBe(JSON.stringify(before.total ?? before.meta ?? before));
  });
});

test.describe('Growth: entitled import is reachable and validated', () => {
  test.skip(!growthTenantProvisioned(), 'NOT RUN: Growth tenant not provisioned (QA_TENANT_G_SLUG / QA_TENANT_G_OWNER unset) - see QA-RUNBOOK RUN-005');
  let owner: string;
  test.beforeAll(async ({ request }) => { owner = await apiToken(request, 'G', 'OWNER'); });

  test('[DPQA-GRW-010] Growth owner reads the import history, module list, fields and template (200)', async ({ request }) => {
    for (const p of ['/data-management/imports', '/data-management/modules', `/data-management/modules/${MODULE}/fields`]) {
      const r = await api(request, owner, 'GET', p);
      expect(r.status, p).toBe(200);
    }
    const t = await request.get(`${env.QA_API_URL}/api/data-management/modules/${MODULE}/template`, { headers: { authorization: `Bearer ${owner}`, 'X-DijiPeople-App': 'web' } });
    expect(t.status()).toBe(200);
    expect((await t.body()).length, 'template has content').toBeGreaterThan(100);
  });

  test('[DPQA-GRW-011] analysing the downloaded template records an analysis and writes NO employee data', async ({ request }) => {
    const hdrs = { authorization: `Bearer ${owner}`, 'X-DijiPeople-App': 'web' };
    const before = (await api(request, owner, 'GET', '/employees?pageSize=1')).body;
    const tpl = await request.get(`${env.QA_API_URL}/api/data-management/modules/${MODULE}/template`, { headers: hdrs });
    const a = await request.post(`${env.QA_API_URL}/api/data-management/modules/${MODULE}/imports/analyse`, {
      headers: hdrs, multipart: { file: { name: 'employees-template.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await tpl.body() } },
    });
    expect(a.status(), await a.text()).toBeLessThan(500);
    const after = (await api(request, owner, 'GET', '/employees?pageSize=1')).body;
    expect(JSON.stringify(after.total ?? after.meta ?? after), 'analysis must not create employees').toBe(JSON.stringify(before.total ?? before.meta ?? before));
  });

  test('[DPQA-GRW-012] a file with an executable type or wrong extension is refused', async ({ request }) => {
    const r = await request.post(`${env.QA_API_URL}/api/data-management/modules/${MODULE}/imports/analyse`, {
      headers: { authorization: `Bearer ${owner}`, 'X-DijiPeople-App': 'web' },
      multipart: { file: { name: 'payload.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ\x90\x00') } },
    });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });

  test('[DPQA-GRW-013] tenant isolation: the Growth tenant\'s import history never lists another tenant\'s jobs', async ({ request }) => {
    const a = await apiToken(request, 'A', 'OWNER');
    const aJobs = JSON.stringify((await api(request, a, 'GET', '/data-management/imports')).body ?? '');
    const gJobs = (await api(request, owner, 'GET', '/data-management/imports')).body;
    for (const j of (Array.isArray(gJobs) ? gJobs : gJobs?.items ?? []) as { id: string }[]) expect(aJobs).not.toContain(j.id);
  });
});

test.describe('employee self-context (DP-QA-034)', () => {
  test('[DPQA-TRC-034] an employee\'s My Profile makes no request that answers 403 (teams/locations lookups)', async ({ browser }) => {
    const { authFile } = await import('../fixtures/test');
    const ctx = await browser.newContext({ storageState: authFile('EMPLOYEE') });
    const page = await ctx.newPage();
    const denied: string[] = [];
    page.on('response', (r) => { if (r.status() === 403) denied.push(r.url().replace(/^https?:\/\/[^/]+/, '')); });
    const { gotoTenant } = await import('../fixtures/test');
    await gotoTenant(page, '/my-profile');
    await page.waitForTimeout(2500);
    await ctx.close();
    expect(denied, 'requests answered 403 on My Profile').toEqual([]);
  });
});
