import { test, expect, env } from '../fixtures/test';
import { api, apiToken, tenantUrl, TENANTS } from '../fixtures/tenants';
import { mail, sql } from '../fixtures/mail-db';
import { spawnSync } from 'node:child_process';

/**
 * RUN-007 (authored before the fix candidate exists).
 *   EML-001..004  e-mail configuration states across REPEATED seed:config, checked in the UI-facing API, the database AND real delivery to the local SMTP sink (DP-QA-039, decision 5)
 *   RESP-100..    Settings sub-pages and command bars at phone width: no horizontal scroll, content column has width, controls inside the viewport (DP-QA-041, DP-QA-035)
 *   WK-100..      WebKit direct navigation and prefetch: no "access control checks" page error on cold opens of redirecting routes, and none during in-app navigation (DP-QA-023)
 * SMTP safety: only the local sink; provider rows carry dummy credentials created for the test and are removed; nothing from a seed's output is attached.
 */
const run = Date.now().toString(36);
const worktree = process.env.QA_API_WORKTREE ?? (env as unknown as Record<string, string | undefined>).QA_API_WORKTREE ?? '';
const seedConfig = () => spawnSync('npm', ['--workspace', 'api', 'run', 'seed:config'], { cwd: worktree, env: { ...process.env, DATABASE_URL: env.QA_DATABASE_URL, NODE_ENV: 'test' }, encoding: 'utf8', shell: true, timeout: 300_000 }).status;
const tid = async (slug: string) => (await sql<{ id: string }>(`select id from "Tenant" where slug = $1`, [slug]))[0]?.id;

test.describe('e-mail configuration states across repeated seeding (tenant B)', () => {
  test.skip(!worktree, 'NOT RUN: QA_API_WORKTREE is not set');
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'chromium', 'database-level suite: runs once, on the chromium project'); });
  test.describe.configure({ mode: 'default' });
  const emailEnabled = (t: string) => sql<{ v: string }>(`select value::text as v from "TenantSetting" where "tenantId" = $1 and category = 'notifications' and key = 'emailEnabled'`, [t]);

  /** Triggers a password-reset e-mail for a disposable user and reports whether the sink received it. */
  async function resetMailArrives(request: import('@playwright/test').APIRequestContext, owner: string, slug: string, wait: number): Promise<boolean> {
    const rel = (await api(request, owner, 'GET', '/lookups/relation-types')).body;
    const email = `eml-${run}-${Math.random().toString(36).slice(2, 6)}@qa.dijipeople.test`;
    const e = await api(request, owner, 'POST', '/employees', { firstName: 'Eml', lastName: 'Probe', workEmail: email, hireDate: '2025-02-03', employmentStatus: 'ACTIVE', phone: '+97455500051', emergencyContactName: 'X Y', emergencyContactRelationTypeId: (Array.isArray(rel) ? rel : rel.items)[0].id, emergencyContactPhone: '+97455500052' });
    expect(e.status, JSON.stringify(e.body).slice(0, 200)).toBeLessThan(300);
    try {
      expect((await api(request, owner, 'POST', '/users', { firstName: 'Eml', lastName: 'Probe', email, password: `Eml!${run}Zz9a`, status: 'ACTIVE', employeeId: e.body.id })).status).toBeLessThan(300);
      await request.post(`${env.QA_API_URL}/api/auth/forgot-password`, { headers: { 'X-DijiPeople-App': 'web' }, data: { email, tenantSlug: slug } });
      try { await mail.waitFor(email, /reset|password/i, wait); return true; } catch { return false; }
    } finally { await api(request, owner, 'DELETE', `/employees/${e.body.id}`); }
  }

  test('[DPQA-EML-001] enabled state: after two seeds e-mail is still enabled and a reset e-mail is DELIVERED to the sink', async ({ request }) => {
    test.setTimeout(900_000);
    const t = (await tid(TENANTS.B.slug))!; const owner = await apiToken(request, 'B', 'OWNER');
    await sql(`update "TenantSetting" set value = 'true'::jsonb where "tenantId" = $1 and category = 'notifications' and key = 'emailEnabled'`, [t]);
    expect(seedConfig()).toBe(0); expect(seedConfig()).toBe(0);
    expect((await emailEnabled(t))[0].v).toBe('true');
    expect(await resetMailArrives(request, owner, TENANTS.B.slug, 60_000), 'reset e-mail delivered through the sink after seeding').toBe(true);
  });

  test('[DPQA-EML-002] disabled state: after two seeds e-mail is still disabled (database) and NO e-mail reaches the sink', async ({ request }) => {
    test.setTimeout(900_000);
    const t = (await tid(TENANTS.B.slug))!; const owner = await apiToken(request, 'B', 'OWNER');
    const original = (await emailEnabled(t))[0]?.v ?? 'true';
    try {
      await sql(`update "TenantSetting" set value = 'false'::jsonb where "tenantId" = $1 and category = 'notifications' and key = 'emailEnabled'`, [t]);
      expect(seedConfig()).toBe(0); expect(seedConfig()).toBe(0);
      expect((await emailEnabled(t))[0].v, 'DP-QA-039: a deliberate off survives the deploy seed').toBe('false');
      expect(await resetMailArrives(request, owner, TENANTS.B.slug, 20_000), 'no e-mail may be delivered while the tenant has e-mail disabled').toBe(false);
    } finally { await sql(`update "TenantSetting" set value = $2::jsonb where "tenantId" = $1 and category = 'notifications' and key = 'emailEnabled'`, [t, original]); }
  });

  test('[DPQA-EML-003] the tenant\'s own provider choice (id, type, enabled, default flag, configuration) is untouched by two seeds', async () => {
    test.setTimeout(900_000);
    const t = (await tid(TENANTS.B.slug))!;
    const snap = () => sql<{ h: string; n: string }>(`select md5(coalesce(string_agg(p::text, '|' order by p.id), '')) as h, count(*)::text as n from "EmailProviderSetting" p where p."tenantId" = $1`, [t]);
    const before = (await snap())[0];
    expect(seedConfig()).toBe(0); expect(seedConfig()).toBe(0);
    expect((await snap())[0], 'provider rows identical (no replacement, no duplicate, no updatedAt churn)').toEqual(before);
  });

  test('[DPQA-EML-004] fresh tenant (pristine onboarded qa-probe) receives at most ONE safe default provider that is not an external SMTP with credentials; other tenants are not touched', async ({}, info) => {
    test.setTimeout(900_000);
    const probe = await tid('qa-probe');
    test.skip(!probe, 'NOT RUN: pristine onboarded tenant qa-probe does not exist');
    const others = [TENANTS.A.slug, TENANTS.B.slug];
    const snap = async () => Promise.all(others.map(async (s) => (await sql<{ h: string }>(`select md5(coalesce(string_agg(p::text, '|' order by p.id), '')) as h from "EmailProviderSetting" p where p."tenantId" = $1`, [await tid(s)]))[0].h));
    const before = await snap();
    expect(seedConfig()).toBe(0); expect(seedConfig()).toBe(0);
    const rows = await sql<{ type: string; isDefault: boolean; enabled: boolean; hasSecret: boolean }>(`select "providerType"::text as type, "isDefault", enabled, (configuration::text ~* '(password|secret|apikey|token)') as "hasSecret" from "EmailProviderSetting" where "tenantId" = $1`, [probe]);
    info.annotations.push({ type: 'observation', description: `qa-probe providers after seeds: ${rows.map((r) => `${r.type}/default=${r.isDefault}/enabled=${r.enabled}`).join('; ') || 'none'}` });
    expect(rows.filter((r) => r.isDefault).length, 'at most one default provider').toBeLessThanOrEqual(1);
    expect(rows.filter((r) => r.hasSecret), 'a default must not carry external credentials').toEqual([]);
    expect(await snap(), 'other tenants\' providers unchanged by the fresh-tenant default').toEqual(before);
  });
});

const SETTINGS_ROUTES = ['/settings', '/settings/data-management', '/settings/branding', '/settings/access', '/settings/security-access/roles', '/settings/notifications'];
const COMMAND_BAR_ROUTES = ['/employees', '/leave', '/attendance', '/documents'];

test.describe('Settings and command bars at phone width (tenant A owner)', () => {
  test.use({ storageState: './golive-results/.auth/A-OWNER.json', viewport: { width: 412, height: 915 } });
  for (const [i, route] of SETTINGS_ROUTES.entries()) {
    test(`[DPQA-RESP-${100 + i}] ${route}: no horizontal scroll at 412 px and the content column has width`, async ({ page, diag }) => {
      diag.allow(/status of 40[34]/);
      await page.goto(tenantUrl('A', route), { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => undefined);
      const m = await page.evaluate(() => {
        const main = document.querySelector('main') ?? document.body;
        const heading = main.querySelector('h1, h2');
        const hb = heading?.getBoundingClientRect();
        return { inner: innerWidth, scroll: document.documentElement.scrollWidth, headingW: Math.round(hb?.width ?? 0), headingX: Math.round(hb?.x ?? 0), hasHeading: Boolean(heading) };
      });
      expect(m.scroll, `${route}: page wider than the viewport (layout viewport grew to ${m.inner})`).toBeLessThanOrEqual(412 + 1);
      expect(m.inner, 'layout viewport stayed at device width').toBe(412);
      expect(m.hasHeading, 'a heading renders').toBe(true);
      expect(m.headingW, `${route}: content column collapsed to zero width (DP-QA-041)`).toBeGreaterThan(40);
      expect(m.headingX, `${route}: content column pushed off-screen`).toBeLessThan(412);
    });
  }
  for (const [i, route] of COMMAND_BAR_ROUTES.entries()) {
    test(`[DPQA-RESP-${110 + i}] ${route}: command bar controls are inside the viewport and Data Transfer opens fully visible`, async ({ page, diag }) => {
      diag.allow(/status of 40[34]/);
      await page.goto(tenantUrl('A', route), { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => undefined);
      const buttons = page.locator('main button:visible, [role=toolbar] button:visible');
      const n = Math.min(await buttons.count(), 12);
      for (let i = 0; i < n; i++) {
        const b = await buttons.nth(i).boundingBox();
        if (b && b.width > 0) expect(b.x + b.width, `${route} control #${i} (${await buttons.nth(i).innerText().catch(() => '')}) clipped on the right`).toBeLessThanOrEqual(412 + 1);
      }
      const dt = page.getByRole('button', { name: 'Data Transfer' });
      if (await dt.count()) {
        await dt.first().click();
        for (const name of ['Import', 'Export']) { const item = page.getByRole('menuitem', { name, exact: true }); await expect(item, name).toBeVisible(); const b = await item.boundingBox(); expect(b!.x + b!.width, `${name} menu item inside the viewport`).toBeLessThanOrEqual(412 + 1); }
      }
    });
  }
});

const WK_ROUTES = ['/', '/settings', '/settings/security-access', '/employees', '/leave', '/attendance'];
test.describe('WebKit direct navigation and prefetch (tenant A owner)', () => {
  test.use({ storageState: './golive-results/.auth/A-OWNER.json' });
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'webkit', 'WebKit-specific regression (DP-QA-023): runs on the webkit project'); });
  const ACCESS = /access control checks|due to access control/i;
  for (const [i, route] of WK_ROUTES.entries()) {
    test(`[DPQA-WK-${100 + i}] cold direct open of ${route}: no "access control checks" page error and no failed navigation`, async ({ page }) => {
      const errors: string[] = []; const failed: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message)); page.on('requestfailed', (r) => { if (/_rsc=/.test(r.url())) failed.push(`${r.failure()?.errorText} ${r.url().replace(/_rsc=.*/, '_rsc=*')}`); });
      const r = await page.goto(tenantUrl('A', route), { waitUntil: 'networkidle' });
      await page.waitForTimeout(4_000);
      expect(r?.status() ?? 200, `${route} status`).toBeLessThan(400);
      expect(errors.filter((m) => ACCESS.test(m)), `${route}: WebKit page errors (DP-QA-023)`).toEqual([]);
      test.info().annotations.push({ type: 'observation', description: `${route}: ${failed.length} failed _rsc prefetch(es), ${errors.length} page error(s)` });
    });
  }
  test('[DPQA-WK-110] in-app navigation through the sidebar raises no page error', async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(tenantUrl('A', '/'), { waitUntil: 'networkidle' });
    for (const name of [/employees/i, /leave/i, /settings/i]) {
      const link = page.getByRole('link', { name }).first();
      if (await link.count()) { await link.click(); await page.waitForLoadState('networkidle').catch(() => undefined); await page.waitForTimeout(1_500); }
    }
    expect(errors.filter((m) => ACCESS.test(m))).toEqual([]);
  });
});
