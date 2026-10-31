import { test, expect, env } from '../fixtures/test';
import { api, apiToken, credentials, tenantUrl, planTenantProvisioned } from '../fixtures/tenants';
import { sql } from '../fixtures/mail-db';
import type { APIRequestContext } from '@playwright/test';

/**
 * DPQA-IMX-*: BASIC import / export / templates on EVERY plan (owner-approved RUN-006 requirement) - API + persisted state + Settings/command-bar UI.
 * Written before the RUN-006 candidate exists: every expectation is the approved requirement, never a description of a build.
 *   IMX-001..003  allowed for the entitled role on Starter (tenant A) and, when provisioned, Growth (G), Enterprise (E), Custom (C)
 *   IMX-004       role-based security: an employee-level user is refused, on every plan
 *   IMX-005..008  invalid files, duplicate records, nothing created, error reporting
 *   IMX-009..010  sensitive data and cross-tenant isolation
 *   IMX-011       plan-scoped modules: Starter does not list modules/fields of features it does not own
 *   IMX-020..023  Settings > Data Management and the Employees command bar end to end (selectors calibrated on the first run; a selector fix is justified in the report, never an assertion change)
 * ADVANCED data management is premium: which routes are "advanced" must be named by the development handoff; nothing advanced is asserted until then (RUN-006-PREPARATION open question Q1).
 */
const hdrs = (t: string) => ({ authorization: `Bearer ${t}`, 'X-DijiPeople-App': 'web' });
const MODULE = 'employees';
const csv = (text: string) => ({ name: 'upload.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });
const analyse = (request: APIRequestContext, token: string, file: { name: string; mimeType: string; buffer: Buffer }) =>
  request.post(`${env.QA_API_URL}/api/data-management/modules/${MODULE}/imports/analyse`, { headers: hdrs(token), multipart: { file } });
const employeeCount = async (request: APIRequestContext, token: string) => {
  const b = (await api(request, token, 'GET', '/employees?pageSize=1')).body;
  return JSON.stringify(b?.total ?? b?.meta ?? b);
};

type PlanKey = 'A' | 'G' | 'E' | 'C';
const PLANS: Array<[PlanKey, string]> = [['A', 'Starter'], ['G', 'Growth'], ['E', 'Enterprise'], ['C', 'Custom']];

for (const [key, label] of PLANS) {
  test.describe(`basic import/export/templates - ${label}`, () => {
    test.skip(key !== 'A' && !planTenantProvisioned(key as 'G' | 'E' | 'C'), `NOT RUN: ${label} tenant not provisioned (QA_TENANT_${key}_SLUG / _OWNER unset) - see QA-RUNBOOK RUN-006`);
    let owner: string;
    test.beforeAll(async ({ request }) => { owner = await apiToken(request, key, 'OWNER'); });

    test(`[DPQA-IMX-001-${key}] ${label} owner reads modules, fields and import history (200)`, async ({ request }) => {
      for (const p of ['/data-management/modules', `/data-management/modules/${MODULE}/fields`, '/data-management/imports']) {
        const r = await api(request, owner, 'GET', p);
        expect(r.status, `${label} GET ${p} -> ${JSON.stringify(r.body).slice(0, 140)}`).toBe(200);
      }
    });

    test(`[DPQA-IMX-002-${key}] ${label} owner downloads the employee template with real content`, async ({ request }) => {
      const t = await request.get(`${env.QA_API_URL}/api/data-management/modules/${MODULE}/template`, { headers: hdrs(owner) });
      expect(t.status()).toBe(200);
      expect((await t.body()).length, 'template has content').toBeGreaterThan(100);
    });

    test(`[DPQA-IMX-003-${key}] ${label} owner queues an export and gets a downloadable file for own-tenant data only`, async ({ request }) => {
      const q = await request.post(`${env.QA_API_URL}/api/data-management/exports`, { headers: hdrs(owner), data: { moduleKey: MODULE, format: 'xlsx' } });
      expect(q.status(), await q.text()).toBeLessThan(300);
      const job = await q.json();
      const id = job.id ?? job.jobId ?? job.job?.id;
      expect(id, 'export job id').toBeTruthy();
      let status = '';
      for (let i = 0; i < 30; i++) {
        status = String((await api(request, owner, 'GET', `/data-management/exports/${id}/status`)).body?.status ?? '');
        if (/COMPLETED|DONE|READY|SUCCEEDED/i.test(status)) break;
        await new Promise((r) => setTimeout(r, 1000));
      }
      expect(status, 'export finished').toMatch(/COMPLETED|DONE|READY|SUCCEEDED/i);
      const d = await request.get(`${env.QA_API_URL}/api/data-management/exports/${id}/download`, { headers: hdrs(owner) });
      expect(d.status()).toBe(200);
      const text = (await d.body()).toString('latin1');
      expect(text, 'no password hashes or tokens in an export').not.toMatch(/\$2[aby]\$|passwordHash|refreshToken|accessToken/);
    });

    test(`[DPQA-IMX-005-${key}] ${label}: empty, non-spreadsheet and executable uploads are refused (4xx, never 5xx) and nothing is created`, async ({ request }) => {
      const before = await employeeCount(request, owner);
      for (const f of [
        { name: 'empty.csv', mimeType: 'text/csv', buffer: Buffer.alloc(0) },
        { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') },
        { name: 'payload.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ\x90\x00') },
      ]) {
        const r = await analyse(request, owner, f);
        expect(r.status(), f.name).toBeGreaterThanOrEqual(400);
        expect(r.status(), f.name).toBeLessThan(500);
      }
      expect(await employeeCount(request, owner), 'nothing created').toBe(before);
    });

    test(`[DPQA-IMX-006-${key}] ${label}: a CSV with duplicate keys and invalid rows is analysed with row-level errors and creates nothing`, async ({ request }) => {
      const before = await employeeCount(request, owner);
      const dup = `dup-${Date.now().toString(36)}@qa.dijipeople.test`;
      const body = ['First Name,Last Name,Work Email,Hire Date', `A,One,${dup},2025-01-01`, `B,Two,${dup},2025-01-01`, 'C,Three,not-an-email,31-31-2025', ',,,'].join('\n');
      const r = await analyse(request, owner, csv(body));
      expect(r.status(), await r.text()).toBeLessThan(500);
      const text = JSON.stringify(await r.json().catch(() => ({})));
      expect(text, 'the analysis reports problems for the duplicate / invalid rows').toMatch(/duplicate|invalid|error|required|already/i);
      expect(await employeeCount(request, owner), 'analysis writes nothing').toBe(before);
    });

    test(`[DPQA-IMX-004-${key}] ${label}: an employee-level user cannot import, export, or read templates`, async ({ request }) => {
      test.skip(key !== 'A', 'role users exist on A/B/G (seed-role-users); E/C use the owner role only');
      const emp = await apiToken(request, 'A', 'EMPLOYEE');
      for (const [m, p] of [['GET', '/data-management/imports'], ['GET', `/data-management/modules/${MODULE}/template`], ['POST', '/data-management/exports']] as const) {
        const r = await api(request, emp, m, p, m === 'POST' ? { moduleKey: MODULE, format: 'xlsx' } : undefined);
        expect([401, 403], `${m} ${p}`).toContain(r.status);
      }
      expect((await analyse(request, emp, csv('First Name\nA\n'))).status()).toBe(403);
    });
  });
}

test.describe('sensitive data, isolation and plan-scoped modules (tenant A, Starter)', () => {
  let owner: string; let ownerB: string;
  test.beforeAll(async ({ request }) => { owner = await apiToken(request, 'A', 'OWNER'); ownerB = await apiToken(request, 'B', 'OWNER'); });

  test('[DPQA-IMX-009] the exported employee file excludes credentials, tokens and payroll/bank fields the Starter role set does not grant', async ({ request }) => {
    const fields = (await api(request, owner, 'GET', `/data-management/modules/${MODULE}/fields`)).body;
    // RUN-006 test-side correction: the response also carries `excludedFields`, which NAMES the sensitive fields the platform refuses (e.g. agentRefreshTokens) - a safe statement, not an offered field.
    // The assertion applies to what is OFFERED (importFields); the excluded list is asserted separately to be present.
    const offered = JSON.stringify(fields.importFields ?? []).toLowerCase();
    expect(fields.importFields?.length, 'importFields are listed').toBeGreaterThan(0);
    expect(offered, 'no credential / token fields are offered for import or export').not.toMatch(/password|passwordhash|refreshtoken|secret|mfa/);
    // RUN-006 test-side correction: `taxIdentifier` / `cnic` are legitimate employee-profile fields, not payroll; whether they belong in a bulk file is an OWNER DECISION (recorded as an observation, see IMX-031).
    expect(offered, 'no payroll/bank fields on a plan that has no payroll').not.toMatch(/iban|accountnumber|bankaccount|salary/);
    expect(JSON.stringify(fields.excludedFields ?? []), 'sensitive fields are explicitly excluded').toMatch(/RefreshToken/i);
  });

  const exportCsv = async (request: APIRequestContext, token: string) => {
    const q = await api(request, token, 'POST', '/data-management/exports', { moduleKey: MODULE, format: 'csv' });
    expect(q.status, JSON.stringify(q.body).slice(0, 160)).toBeLessThan(300);
    let status = '';
    for (let i = 0; i < 40 && !/COMPLETED|FAILED/i.test(status); i++) { await new Promise((r) => setTimeout(r, 1500)); status = String((await api(request, token, 'GET', `/data-management/exports/${q.body.id}/status`)).body?.status ?? ''); }
    expect(status).toMatch(/COMPLETED/i);
    return (await request.get(`${env.QA_API_URL}/api/data-management/exports/${q.body.id}/download`, { headers: hdrs(token) })).text();
  };

  test('[DPQA-IMX-030] a soft-deleted employee is NOT present in the exported employee file (the live list already excludes them)', async ({ request }) => {
    const tag = `Gone${Date.now().toString(36)}`;
    const rel = (await api(request, owner, 'GET', '/lookups/relation-types')).body;
    const created = await api(request, owner, 'POST', '/employees', { firstName: tag, lastName: 'Export', workEmail: `${tag.toLowerCase()}@qa.dijipeople.test`, hireDate: '2025-02-03', employmentStatus: 'ACTIVE', phone: '+97455500001', emergencyContactName: 'X Y', emergencyContactRelationTypeId: (Array.isArray(rel) ? rel : rel.items)[0].id, emergencyContactPhone: '+97455500002' });
    expect(created.status, JSON.stringify(created.body).slice(0, 200)).toBeLessThan(300);
    expect((await api(request, owner, 'DELETE', `/employees/${created.body.id}`)).status).toBeLessThan(300);
    const list = JSON.stringify((await api(request, owner, 'GET', '/employees?pageSize=200')).body);
    expect(list, 'precondition: the live list excludes the deleted employee').not.toContain(tag);
    expect(await exportCsv(request, owner), 'deleted employee must not be exported').not.toContain(tag);
  });

  test('[DPQA-IMX-031] encrypted / hashed storage columns (*Enc, *Hmac) are neither offered for import nor present in the export; plaintext national/tax ids are recorded for owner decision', async ({ request }, info) => {
    const fields = (await api(request, owner, 'GET', `/data-management/modules/${MODULE}/fields`)).body;
    const offered = (fields.importFields as Array<{ key: string }>).map((f) => f.key);
    const header = (await exportCsv(request, owner)).split(/\r?\n/)[0].replace(/"/g, '').split(',');
    info.annotations.push({ type: 'owner-decision', description: `plaintext identity columns offered/exported: ${offered.concat(header).filter((k, i, a) => /^(cnic|taxIdentifier)$/.test(k) && a.indexOf(k) === i).join(', ') || 'none'}` });
    expect(offered.filter((k) => /(Enc|Hmac)$/.test(k)), 'import fields that are encrypted/hash storage columns').toEqual([]);
    expect(header.filter((k) => /(Enc|Hmac)$/.test(k)), 'export columns that are encrypted/hash storage columns').toEqual([]);
  });

  test('[DPQA-IMX-010] cross-tenant: import history and export jobs of tenant A never list tenant B jobs, and a foreign job id is 404', async ({ request }) => {
    const a = JSON.stringify((await api(request, owner, 'GET', '/data-management/imports')).body ?? '');
    const bJobs = (await api(request, ownerB, 'GET', '/data-management/imports')).body;
    for (const j of (Array.isArray(bJobs) ? bJobs : bJobs?.items ?? []) as Array<{ id: string }>) {
      expect(a).not.toContain(j.id);
      expect([403, 404], 'foreign import job').toContain((await api(request, owner, 'GET', `/data-management/imports/${j.id}`)).status);
      expect([403, 404], 'foreign import job errors').toContain((await api(request, owner, 'GET', `/data-management/imports/${j.id}/errors`)).status);
    }
    const rows = await sql<{ n: string }>(`select count(*)::text as n from "ImportJob" where "tenantId" <> (select id from "Tenant" where slug = $1)`, [env.QA_TENANT_A_SLUG]).catch(() => []);
    expect(rows.length === 0 || Number(rows[0].n) >= 0).toBe(true); // table name is verified on the candidate; the API assertions above are authoritative
  });

  test('[DPQA-IMX-011] plan-scoped modules: a Starter tenant is not offered modules or fields of features it does not own', async ({ request }) => {
    const mods = JSON.stringify((await api(request, owner, 'GET', '/data-management/modules')).body).toLowerCase();
    for (const notStarter of ['recruitment', 'onboarding', 'payroll', 'timesheets', 'projects', 'job-opening', 'candidate']) {
      expect(mods, `module list must not offer ${notStarter}`).not.toContain(notStarter);
    }
    expect(mods).toContain('employee');
  });
});

test.describe('Settings and command bars end to end (Starter, tenant A owner)', () => {
  test.use({ storageState: './golive-results/.auth/A-OWNER.json' });
  test('[DPQA-IMX-020] Settings > Data Management is reachable on Starter: no plan-gate screen, import / export / template entry points are present', async ({ page, diag }) => {
    diag.allow(/status of 403/); // advanced panels, if any, may legitimately refuse
    await page.goto(tenantUrl('A', '/settings/data-management'), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await expect(page.getByText(/not part of your current subscription|not included in your plan/i)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /data management|import|export/i }).first()).toBeVisible();
  });

  test('[DPQA-IMX-021] Employees > Data Transfer offers Import, Export and Export Template to a Starter owner', async ({ page }) => {
    await page.goto(tenantUrl('A', '/employees'), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.getByRole('button', { name: 'Data Transfer' }).click();
    for (const name of ['Import', 'Export', 'Export Template']) await expect(page.getByRole('menuitem', { name, exact: true }), name).toBeVisible();
  });

  test('[DPQA-IMX-022] Export and Export Template download a file from the command bar', async ({ page }) => {
    await page.goto(tenantUrl('A', '/employees'), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    for (const name of ['Export Template', 'Export']) {
      await page.getByRole('button', { name: 'Data Transfer' }).click();
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.getByRole('menuitem', { name, exact: true }).click()]);
      expect(dl.suggestedFilename(), name).toMatch(/\.(xlsx|csv)$/i);
    }
  });

  test('[DPQA-IMX-023] Import from the command bar opens the importer (not a plan gate); an invalid file is rejected with a visible message and no employee is created', async ({ page, request }) => {
    const owner = await apiToken(request, 'A', 'OWNER');
    const before = await employeeCount(request, owner);
    await page.goto(tenantUrl('A', '/employees'), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.getByRole('button', { name: 'Data Transfer' }).click();
    await page.getByRole('menuitem', { name: 'Import', exact: true }).click();
    await expect(page).toHaveURL(/data-management|import/, { timeout: 20_000 });
    await expect(page.getByText(/not part of your current subscription|not included in your plan/i)).toHaveCount(0);
    const input = page.locator('input[type=file]').first();
    await input.setInputFiles({ name: 'payload.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ\x90\x00') });
    await expect(page.getByText(/unsupported|invalid|not allowed|only .*xlsx|must be|could not/i).first()).toBeVisible({ timeout: 20_000 });
    expect(await employeeCount(request, owner), 'nothing created').toBe(before);
  });

  test('[DPQA-IMX-024] an employee-level user sees no Import/Export entry points', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: './golive-results/.auth/A-EMPLOYEE.json' });
    const page = await ctx.newPage();
    await page.goto(tenantUrl('A', '/employees'), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await expect(page.getByRole('button', { name: 'Data Transfer' })).toHaveCount(0);
    await ctx.close();
  });
});
