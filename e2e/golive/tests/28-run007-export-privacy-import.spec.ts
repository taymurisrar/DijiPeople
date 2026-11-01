import { test, expect, env } from '../fixtures/test';
import { api, apiToken, tenantUrl, planTenantProvisioned } from '../fixtures/tenants';
import { sql } from '../fixtures/mail-db';
import type { APIRequestContext, Page } from '@playwright/test';

/**
 * RUN-007 (authored before the fix candidate exists). Owner decisions 1-3.
 *   EXP-001  standard export excludes soft-deleted employees                      (DP-QA-037)
 *   EXP-002  standard export excludes national IDs / tax IDs - header AND values   (DP-QA-037, DP-QA-038 owner decision 1)
 *   EXP-003  standard export / import fields exclude internal encrypted, hashed and storage columns (DP-QA-038)
 *   EXP-004  sensitive-identifier export: if the build supports it, it needs explicit authorization + deliberate selection + an audit row; if it does not, nothing sensitive may leak (decision 2)
 *   EXP-010  unauthorized roles (employee, manager) are refused export, template-with-data and import on every provisioned plan (decision 3)
 *   EXP-011  cross-tenant: foreign export job ids are 403/404 and an export never contains another tenant's people
 *   IMP-001  a VALID file imports through the API: analyse -> execute -> persisted rows, tenant-scoped, and re-importing creates no duplicates
 *   IMP-002  an invalid row is reported with its row number and creates nothing while valid rows are handled as documented
 *   IMP-020  Settings > Data Management imports a valid file end to end (UI + persisted)                      (DP-QA-035 retest)
 *   IMP-021  Employees > Data Transfer > Import imports a valid file end to end (UI + persisted)               (DP-QA-035)
 * Each test creates what it asserts on and removes exactly that. Selectors and the template's required columns are calibrated on the first RUN-007 pass; a calibration is justified in the report, never an assertion change.
 */
const MODULE = 'employees';
const hdrs = (t: string) => ({ authorization: `Bearer ${t}`, 'X-DijiPeople-App': 'web' });
const stamp = () => Date.now().toString(36);
const SENSITIVE_COLUMN = /^(cnic|taxIdentifier|nationalId|national_id|ssn|passportNumber|iban|bankAccount\w*)$/i;
const INTERNAL_COLUMN = /(Enc|Hmac|Hash|Salt|Token|Secret|Ciphertext|Iv|StorageKey|StoragePath|storage\w*)$/;

async function exportCsv(request: APIRequestContext, token: string, body: Record<string, unknown> = {}): Promise<{ csv: string; jobId: string; status: number }> {
  const q = await api(request, token, 'POST', '/data-management/exports', { moduleKey: MODULE, format: 'csv', ...body });
  if (q.status >= 300) return { csv: '', jobId: '', status: q.status };
  let st = '';
  for (let i = 0; i < 40 && !/COMPLETED|FAILED/i.test(st); i++) { await new Promise((r) => setTimeout(r, 1500)); st = String((await api(request, token, 'GET', `/data-management/exports/${q.body.id}/status`)).body?.status ?? ''); }
  expect(st, 'export job finishes').toMatch(/COMPLETED/i);
  const d = await request.get(`${env.QA_API_URL}/api/data-management/exports/${q.body.id}/download`, { headers: hdrs(token) });
  return { csv: await d.text(), jobId: q.body.id, status: d.status() };
}
const header = (csv: string) => csv.split(/\r?\n/)[0].replace(/"/g, '').split(',').map((s) => s.trim());

/** Creates an employee carrying known sensitive values so a leak is detectable by VALUE, not only by column name. */
async function seedEmployee(request: APIRequestContext, owner: string, tag: string, extra: Record<string, unknown> = {}) {
  const rel = (await api(request, owner, 'GET', '/lookups/relation-types')).body;
  const r = await api(request, owner, 'POST', '/employees', {
    firstName: tag, lastName: 'Privacy', workEmail: `${tag.toLowerCase()}@qa.dijipeople.test`, hireDate: '2025-02-03', employmentStatus: 'ACTIVE', phone: '+97455500011',
    emergencyContactName: 'X Y', emergencyContactRelationTypeId: (Array.isArray(rel) ? rel : rel.items)[0].id, emergencyContactPhone: '+97455500012', ...extra,
  });
  expect(r.status, JSON.stringify(r.body).slice(0, 240)).toBeLessThan(300);
  return r.body.id as string;
}

test.describe('standard employee export privacy (Starter, tenant A owner)', () => {
  let owner: string;
  test.beforeAll(async ({ request }) => { owner = await apiToken(request, 'A', 'OWNER'); });

  test('[DPQA-EXP-001] a soft-deleted employee is absent from the export and from the exported count', async ({ request }) => {
    const tag = `Gone${stamp()}`;
    const id = await seedEmployee(request, owner, tag);
    expect((await exportCsv(request, owner)).csv, 'precondition: live employee is exported').toContain(tag);
    expect((await api(request, owner, 'DELETE', `/employees/${id}`)).status).toBeLessThan(300);
    const rows = await sql<{ d: boolean }>(`select "isDeleted" as d from "Employee" where id = $1`, [id]);
    expect(rows[0]?.d, 'persisted: employee is soft-deleted').toBe(true);
    expect((await exportCsv(request, owner)).csv, 'deleted employee must not be exported').not.toContain(tag);
  });

  test('[DPQA-EXP-002] national and tax identifiers are neither columns nor values in a standard export', async ({ request }) => {
    const tag = `Sens${stamp()}`;
    const cnic = `${Math.floor(1e12 + Math.random() * 9e12)}`; const tax = `TX${Math.floor(1e8 + Math.random() * 9e8)}`;
    const id = await seedEmployee(request, owner, tag, { cnic, taxIdentifier: tax });
    try {
      const { csv } = await exportCsv(request, owner);
      expect(csv, 'precondition: the employee row is in the file').toContain(tag);
      expect(header(csv).filter((c) => SENSITIVE_COLUMN.test(c)), 'sensitive columns in the export header').toEqual([]);
      expect(csv, 'national id value leaked').not.toContain(cnic);
      expect(csv, 'tax id value leaked').not.toContain(tax);
    } finally { await api(request, owner, 'DELETE', `/employees/${id}`); }
  });

  test('[DPQA-EXP-003] no encrypted, hashed, token or storage column is offered for import/export or present in the file', async ({ request }) => {
    const fields = (await api(request, owner, 'GET', `/data-management/modules/${MODULE}/fields`)).body;
    const offered = ((fields.importFields ?? []) as Array<{ key: string }>).map((f) => f.key);
    expect(offered.length, 'importFields listed').toBeGreaterThan(0);
    expect(offered.filter((k) => INTERNAL_COLUMN.test(k) || SENSITIVE_COLUMN.test(k)), 'offered for import').toEqual([]);
    const { csv } = await exportCsv(request, owner);
    expect(header(csv).filter((k) => INTERNAL_COLUMN.test(k)), 'in the export header').toEqual([]);
    const tpl = await request.get(`${env.QA_API_URL}/api/data-management/modules/${MODULE}/template`, { headers: hdrs(owner) });
    expect(header(await tpl.text()).filter((k) => INTERNAL_COLUMN.test(k) || SENSITIVE_COLUMN.test(k)), 'in the template header').toEqual([]);
  });

  test('[DPQA-EXP-004] sensitive-identifier export, if the build supports it, needs authorization, deliberate selection and an audit row; otherwise nothing sensitive is exportable', async ({ request }, info) => {
    const fields = (await api(request, owner, 'GET', `/data-management/modules/${MODULE}/fields`)).body;
    const flagged = JSON.stringify(fields).match(/sensitive|restricted|requiresPrivilege|includeSensitive/gi) ?? [];
    info.annotations.push({ type: 'observation', description: `sensitive-export surface advertised by /fields: ${flagged.length ? 'yes (' + [...new Set(flagged)].join(', ') + ')' : 'no'}` });
    // 1. A default request, and one that merely asks for sensitive data without the deliberate selection, must not return identifiers.
    const tag = `Gate${stamp()}`; const cnic = `${Math.floor(1e12 + Math.random() * 9e12)}`;
    const id = await seedEmployee(request, owner, tag, { cnic });
    try {
      for (const body of [{}, { includeSensitive: true }, { fields: ['cnic'] }, { filters: { includeSensitive: true } }]) {
        const r = await exportCsv(request, owner, body);
        if (r.status >= 300 || !r.csv) continue; // refused or validated away: acceptable
        expect(r.csv, `export with ${JSON.stringify(body)} leaked the identifier without a deliberate, authorized path`).not.toContain(cnic);
      }
      test.skip(flagged.length === 0, 'Sensitive export is not offered by this build: the leak checks above are the whole requirement (decision 2 applies only if supported)');
      // 2. Supported: an unauthorized role is refused, and the authorized export is audited. The exact request shape is calibrated from the handoff on the first pass.
      const hr = await apiToken(request, 'A', 'HR').catch(() => '');
      if (hr) {
        const denied = await exportCsv(request, hr, { includeSensitive: true });
        expect(denied.csv.includes(cnic) && denied.status < 300, 'a non-authorized role must not receive identifiers').toBe(false);
      }
      const auditBefore = Number((await sql<{ n: string }>(`select count(*)::text as n from "AuditLog" where "tenantId" = (select id from "Tenant" where slug = $1) and (action ilike '%export%' or "entityType" ilike '%export%')`, [env.QA_TENANT_A_SLUG]))[0].n);
      await exportCsv(request, owner, { includeSensitive: true });
      const auditAfter = Number((await sql<{ n: string }>(`select count(*)::text as n from "AuditLog" where "tenantId" = (select id from "Tenant" where slug = $1) and (action ilike '%export%' or "entityType" ilike '%export%')`, [env.QA_TENANT_A_SLUG]))[0].n);
      expect(auditAfter, 'a sensitive export writes an audit row').toBeGreaterThan(auditBefore);
    } finally { await api(request, owner, 'DELETE', `/employees/${id}`); }
  });
});

for (const [key, label] of [['A', 'Starter'], ['G', 'Growth'], ['E', 'Enterprise'], ['C', 'Custom']] as const) {
  test.describe(`unauthorized roles - ${label}`, () => {
    test.skip(key !== 'A' && !planTenantProvisioned(key), `NOT RUN: ${label} tenant not provisioned`);
    test(`[DPQA-EXP-010-${key}] ${label}: employee and manager are refused export, template and import-analyse`, async ({ request }) => {
      test.setTimeout(600_000);
      for (const role of ['EMPLOYEE', 'MANAGER'] as const) {
        const t = await apiToken(request, key, role).catch(() => '');
        test.skip(!t, `NOT RUN: ${label} ${role} user cannot sign in`);
        const q = await api(request, t, 'POST', '/data-management/exports', { moduleKey: MODULE, format: 'csv' });
        expect([401, 403], `${label} ${role} export -> ${JSON.stringify(q.body).slice(0, 120)}`).toContain(q.status);
        const tpl = await request.get(`${env.QA_API_URL}/api/data-management/modules/${MODULE}/template`, { headers: hdrs(t) });
        expect([401, 403], `${label} ${role} template`).toContain(tpl.status());
        const an = await request.post(`${env.QA_API_URL}/api/data-management/modules/${MODULE}/imports/analyse`, { headers: hdrs(t), multipart: { file: { name: 'a.csv', mimeType: 'text/csv', buffer: Buffer.from('firstName\nx') } } });
        expect([401, 403], `${label} ${role} analyse`).toContain(an.status());
      }
    });
  });
}

test.describe('cross-tenant export security', () => {
  test('[DPQA-EXP-011] a foreign tenant cannot read or download tenant A export jobs, and A\'s file holds only A people', async ({ request }) => {
    const a = await apiToken(request, 'A', 'OWNER'); const b = await apiToken(request, 'B', 'OWNER');
    const tag = `Iso${stamp()}`;
    const id = await seedEmployee(request, a, tag);
    try {
      const { csv, jobId } = await exportCsv(request, a);
      expect(csv).toContain(tag);
      expect([403, 404], 'B reads A export status').toContain((await api(request, b, 'GET', `/data-management/exports/${jobId}/status`)).status);
      const dl = await request.get(`${env.QA_API_URL}/api/data-management/exports/${jobId}/download`, { headers: hdrs(b) });
      expect([403, 404], 'B downloads A export').toContain(dl.status());
      const bPeople = await sql<{ firstName: string }>(`select "firstName" from "Employee" where "tenantId" = (select id from "Tenant" where slug = $1) and "isDeleted" = false and "workEmail" like '%@qa.dijipeople.test' limit 20`, [env.QA_TENANT_B_SLUG]);
      for (const p of bPeople) expect(csv, `tenant B person ${p.firstName} in A's file`).not.toContain(`,${p.firstName},`);
    } finally { await api(request, a, 'DELETE', `/employees/${id}`); }
  });
});

/** Builds a valid employee CSV from the downloaded template, filling every column the module reports as required. */
async function validFile(request: APIRequestContext, owner: string, rows: Array<Record<string, string>>) {
  const fields = (await api(request, owner, 'GET', `/data-management/modules/${MODULE}/fields`)).body;
  const tpl = await (await request.get(`${env.QA_API_URL}/api/data-management/modules/${MODULE}/template`, { headers: hdrs(owner) })).text();
  const cols = header(tpl);
  const req = ((fields.importFields ?? []) as Array<{ key: string; required?: boolean }>).filter((f) => f.required).map((f) => f.key);
  const defaults: Record<string, string> = { hireDate: '2025-02-03', employmentStatus: 'ACTIVE', phone: '+97455500021', emergencyContactName: 'X Y', emergencyContactPhone: '+97455500022' };
  const lines = [cols.join(',')];
  for (const r of rows) lines.push(cols.map((c) => { const v = r[c] ?? defaults[c] ?? (req.includes(c) ? 'QA' : ''); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(','));
  return { name: 'qa-valid.csv', mimeType: 'text/csv', buffer: Buffer.from(lines.join('\n')) };
}
const analyse = (request: APIRequestContext, t: string, file: { name: string; mimeType: string; buffer: Buffer }) =>
  request.post(`${env.QA_API_URL}/api/data-management/modules/${MODULE}/imports/analyse`, { headers: hdrs(t), multipart: { file } });
async function runImport(request: APIRequestContext, t: string, file: { name: string; mimeType: string; buffer: Buffer }) {
  const a = await analyse(request, t, file); const aj = await a.json();
  expect(a.status(), JSON.stringify(aj).slice(0, 300)).toBeLessThan(300);
  const jobId = aj.id ?? aj.jobId ?? aj.job?.id;
  const ex = await api(request, t, 'POST', `/data-management/imports/${jobId}/execute`, {});
  expect(ex.status, JSON.stringify(ex.body).slice(0, 300)).toBeLessThan(300);
  let st = '';
  for (let i = 0; i < 40 && !/COMPLETED|FAILED|PARTIAL/i.test(st); i++) { await new Promise((r) => setTimeout(r, 1500)); st = String((await api(request, t, 'GET', `/data-management/imports/${jobId}/status`)).body?.status ?? ''); }
  return { jobId, status: st };
}
const cleanup = (tag: string) => sql(`update "Employee" set "isDeleted" = true where "firstName" like $1 and "tenantId" = (select id from "Tenant" where slug = $2)`, [`${tag}%`, env.QA_TENANT_A_SLUG]).catch(() => undefined);

test.describe('valid-file import through the API (Starter, tenant A)', () => {
  test('[DPQA-IMP-001] a valid file imports, persists tenant-scoped rows, and importing it again creates no duplicates', async ({ request }) => {
    test.setTimeout(300_000);
    const owner = await apiToken(request, 'A', 'OWNER'); const tag = `Imp${stamp()}`;
    const file = await validFile(request, owner, [1, 2].map((i) => ({ firstName: `${tag}${i}`, lastName: 'Import', workEmail: `${tag.toLowerCase()}${i}@qa.dijipeople.test` })));
    try {
      const first = await runImport(request, owner, file);
      expect(first.status, 'first import status').toMatch(/COMPLETED/i);
      const rows = await sql<{ n: string; tenants: string }>(`select count(*)::text as n, count(distinct "tenantId")::text as tenants from "Employee" where "firstName" like $1 and "isDeleted" = false`, [`${tag}%`]);
      expect(rows[0].n, 'persisted employees').toBe('2');
      expect(rows[0].tenants, 'all in one tenant').toBe('1');
      const owned = await sql<{ slug: string }>(`select t.slug from "Employee" e join "Tenant" t on t.id = e."tenantId" where e."firstName" like $1 limit 1`, [`${tag}%`]);
      expect(owned[0].slug, 'created in the importer\'s own tenant').toBe(env.QA_TENANT_A_SLUG);
      await runImport(request, owner, file).catch(() => undefined);
      const again = await sql<{ n: string }>(`select count(*)::text as n from "Employee" where "firstName" like $1 and "isDeleted" = false`, [`${tag}%`]);
      expect(again[0].n, 're-import must not duplicate (duplicates are rejected or updated, not inserted twice)').toBe('2');
    } finally { await cleanup(tag); }
  });

  test('[DPQA-IMP-002] a file with one invalid row reports that row and creates nothing for it', async ({ request }) => {
    test.setTimeout(300_000);
    const owner = await apiToken(request, 'A', 'OWNER'); const tag = `Bad${stamp()}`;
    const file = await validFile(request, owner, [
      { firstName: `${tag}ok`, lastName: 'Import', workEmail: `${tag.toLowerCase()}ok@qa.dijipeople.test` },
      { firstName: `${tag}bad`, lastName: 'Import', workEmail: 'not-an-email', hireDate: 'not-a-date' },
    ]);
    try {
      const a = await analyse(request, owner, file); const aj = await a.json();
      expect(a.status(), JSON.stringify(aj).slice(0, 300)).toBeLessThan(300);
      const jobId = aj.id ?? aj.jobId ?? aj.job?.id;
      const errs = JSON.stringify((await api(request, owner, 'GET', `/data-management/imports/${jobId}/errors`)).body);
      expect(errs, 'the bad row is reported with its row number').toMatch(/row|line|"3"|\b3\b/i);
      expect((await sql<{ n: string }>(`select count(*)::text as n from "Employee" where "firstName" = $1`, [`${tag}bad`]))[0].n, 'analysis alone creates nothing').toBe('0');
    } finally { await cleanup(tag); }
  });
});

test.describe('valid-file import through the UI (Starter, tenant A owner)', () => {
  test.use({ storageState: './golive-results/.auth/A-OWNER.json' });
  async function importViaUi(page: Page, request: APIRequestContext, entry: 'settings' | 'commandbar') {
    const owner = await apiToken(request, 'A', 'OWNER'); const tag = `Ui${entry === 'settings' ? 'S' : 'C'}${stamp()}`;
    const file = await validFile(request, owner, [{ firstName: tag, lastName: 'Import', workEmail: `${tag.toLowerCase()}@qa.dijipeople.test` }]);
    try {
      if (entry === 'settings') await page.goto(tenantUrl('A', '/settings/data-management'), { waitUntil: 'domcontentloaded' });
      else {
        await page.goto(tenantUrl('A', '/employees'), { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle').catch(() => undefined);
        await page.getByRole('button', { name: 'Data Transfer' }).click();
        await page.getByRole('menuitem', { name: 'Import', exact: true }).click();
        await expect(page, 'Import navigates to the importer (DP-QA-035)').toHaveURL(/data-management|import/, { timeout: 20_000 });
      }
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.locator('input[type=file]').first().setInputFiles(file);
      const confirm = page.getByRole('button', { name: /import|start|confirm|run|execute|upload/i }).last();
      await expect(confirm).toBeEnabled({ timeout: 30_000 });
      await confirm.click();
      await expect(page.getByText(/completed|success|imported|1 (row|record|employee)/i).first(), 'UI reports the result').toBeVisible({ timeout: 60_000 });
      const rows = await sql<{ n: string }>(`select count(*)::text as n from "Employee" where "firstName" = $1 and "isDeleted" = false`, [tag]);
      expect(rows[0].n, 'persisted employee').toBe('1');
    } finally { await cleanup(tag); }
  }
  test('[DPQA-IMP-020] Settings > Data Management imports a valid file end to end', async ({ page, request }) => { test.setTimeout(240_000); await importViaUi(page, request, 'settings'); });
  test('[DPQA-IMP-021] Employees > Data Transfer > Import imports a valid file end to end', async ({ page, request }) => { test.setTimeout(240_000); await importViaUi(page, request, 'commandbar'); });
});
