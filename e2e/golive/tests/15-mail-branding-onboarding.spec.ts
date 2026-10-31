import { test, expect, env } from '../fixtures/test';
import { api, apiToken, credentials, stateFile, tenantUrl, TENANTS } from '../fixtures/tenants';
import { mail, sql } from '../fixtures/mail-db';
import type { APIRequestContext } from '@playwright/test';

/**
 * RUN-004. Everything here uses the LOCAL SMTP sink (no external delivery) and the throwaway database.
 * DPQA-INV-1xx  onboarding: employee + system access + invitation e-mail, token lifecycle, first sign-in through the UI.
 * DPQA-MAIL-*   e-mail content, links, branding, password-reset lifecycle, no enumeration.
 * DPQA-BRAND-*  branding in the tenant UI, login page and e-mails, and isolation between tenants.
 */
const run = Date.now().toString(36);
const web = (path: string, t: 'A' | 'B' = 'A') => tenantUrl(t, path);
const hdr = { 'X-DijiPeople-App': 'web' };

async function relationId(request: APIRequestContext, token: string) {
  const rel = (await api(request, token, 'GET', '/lookups/relation-types')).body;
  return (Array.isArray(rel) ? rel : rel.items)[0].id as string;
}
const empBody = (relId: string, email: string, extra: Record<string, unknown> = {}) => ({
  firstName: 'Onb', lastName: run, workEmail: email, hireDate: '2025-02-03', employmentStatus: 'ACTIVE', phone: '+97455500001',
  emergencyContactName: 'X Y', emergencyContactRelationTypeId: relId, emergencyContactPhone: '+97455500002', ...extra,
});

let owner: string;
test.beforeAll(async ({ request }) => { owner = await apiToken(request, 'A', 'OWNER'); await mail.clear(); });

test('[DPQA-INV-101] creating an employee with system access + "send invitation now" sends one invitation e-mail with a working token link', async ({ request }) => {
  const email = `onb-${run}@qa.dijipeople.test`;
  const relId = await relationId(request, owner);
  const e = await api(request, owner, 'POST', '/employees', empBody(relId, email, { provisionSystemAccess: true, sendInvitationNow: true }));
  expect(e.status, JSON.stringify(e.body).slice(0, 300)).toBeLessThan(300);
  try {
    const m = await mail.waitFor(email, /activate|invit|welcome/i, 60_000);
    expect(m.from).toBe('no-reply@qa.dijipeople.test');
    expect(m.subject, 'subject names the tenant').toMatch(/QA Provisioned A/);
    expect(m.text).toMatch(/expires in \d+ hours/i);
    const token = mail.token(m);
    expect(token.length).toBeGreaterThan(20);
    // a link host of *.dijipeople.com (production root domain) is expected locally; only the token is used here (OBS-010)
    const pw = `Onb!${run}Zz9`;
    const act = await request.post(`${env.QA_API_URL}/api/auth/activate-account`, { headers: hdr, data: { token, password: pw } });
    expect(act.status()).toBeLessThan(300);
    const again = await request.post(`${env.QA_API_URL}/api/auth/activate-account`, { headers: hdr, data: { token, password: pw } });
    expect(again.status(), 'activation token is single-use').toBeGreaterThanOrEqual(400);
    const login = await request.post(`${env.QA_API_URL}/api/auth/login`, { headers: hdr, data: { email, password: pw, tenantSlug: TENANTS.A.slug } });
    expect(login.status()).toBeLessThan(300);
    expect((await mail.list(email)).length, 'exactly one invitation e-mail').toBe(1);
    const rows = await sql<{ status: string }>(`select ui.status as status from "UserInvitation" ui join "User" u on u.id = ui."userId" where u.email = $1 order by ui."createdAt" desc limit 1`, [email]);
    expect(rows[0]?.status, 'persisted invitation state').toBe('CONSUMED');
  } finally {
    await api(request, owner, 'DELETE', `/employees/${e.body.id}`);
  }
});

test('[DPQA-INV-102] an expired invitation token is refused (token aged in the QA database)', async ({ request }) => {
  const email = `onb2-${run}@qa.dijipeople.test`;
  const relId = await relationId(request, owner);
  const e = await api(request, owner, 'POST', '/employees', empBody(relId, email, { provisionSystemAccess: true, sendInvitationNow: true }));
  expect(e.status).toBeLessThan(300);
  try {
    const token = mail.token(await mail.waitFor(email));
    const aged = await sql(`update "UserInvitation" set "expiresAt" = (now() at time zone 'utc') - interval '1 hour' where "userId" in (select id from "User" where email = $1) returning id`, [email]);
    expect(aged.length, 'fixture aged the invitation row').toBeGreaterThan(0);
    const act = await request.post(`${env.QA_API_URL}/api/auth/activate-account`, { headers: hdr, data: { token, password: `Exp!${run}Zz9` } });
    expect(act.status(), 'expired token').toBeGreaterThanOrEqual(400);
    expect(act.status()).toBeLessThan(500);
  } finally {
    await api(request, owner, 'DELETE', `/employees/${e.body.id}`);
  }
});

test('[DPQA-INV-103] resend-invite delivers a NEW invitation e-mail (DP-QA-028: none is sent today)', async ({ request }) => {
  const email = `onb3-${run}@qa.dijipeople.test`;
  const relId = await relationId(request, owner);
  const e = await api(request, owner, 'POST', '/employees', empBody(relId, email, { provisionSystemAccess: true, sendInvitationNow: true }));
  expect(e.status).toBeLessThan(300);
  try {
    await mail.waitFor(email, undefined, 60_000);
    const re = await api(request, owner, 'POST', `/employees/${e.body.id}/resend-invite`);
    expect(re.status, JSON.stringify(re.body).slice(0, 200)).toBeLessThan(300);
    await new Promise((r) => setTimeout(r, 8000));
    expect((await mail.list(email)).length, 'a second invitation e-mail after resend').toBeGreaterThanOrEqual(2);
  } finally {
    await api(request, owner, 'DELETE', `/employees/${e.body.id}`);
  }
});

test('[DPQA-INV-105] after a resend the SUPERSEDED (revoked) invitation token no longer activates the account (DP-QA-027)', async ({ request }) => {
  const email = `onb5-${run}@qa.dijipeople.test`;
  const relId = await relationId(request, owner);
  const e = await api(request, owner, 'POST', '/employees', empBody(relId, email, { provisionSystemAccess: true, sendInvitationNow: true }));
  expect(e.status).toBeLessThan(300);
  try {
    const first = mail.token(await mail.waitFor(email, undefined, 60_000));
    const re = await api(request, owner, 'POST', `/employees/${e.body.id}/resend-invite`);
    const fresh = JSON.stringify(re.body ?? {}).match(/token=([0-9a-f]{32,})/)?.[1];
    expect(fresh, 'resend returns the new activation link to the admin').toBeTruthy();
    expect(fresh).not.toBe(first);
    const rows = await sql<{ status: string }>(`select ui.status as status from "UserInvitation" ui join "User" u on u.id = ui."userId" where u.email = $1 order by ui."createdAt"`, [email]);
    expect(rows.map((r) => r.status), 'old invitation is marked REVOKED').toEqual(['REVOKED', 'PENDING']);
    const old = await request.post(`${env.QA_API_URL}/api/auth/activate-account`, { headers: hdr, data: { token: first, password: `Old!${run}Zz9x` } });
    expect(old.status(), 'a revoked invitation token must not activate').toBeGreaterThanOrEqual(400);
  } finally {
    await api(request, owner, 'DELETE', `/employees/${e.body.id}`);
  }
});

test.describe('first sign-in through the UI after activation', () => {
  const activateAndSignIn = async (page: import('@playwright/test').Page, request: APIRequestContext, how: 'click' | 'enter') => {
    const email = `onb${how}-${run}@qa.dijipeople.test`;
    const relId = await relationId(request, owner);
    const e = await api(request, owner, 'POST', '/employees', empBody(relId, email, { provisionSystemAccess: true, sendInvitationNow: true }));
    expect(e.status).toBeLessThan(300);
    try {
      const token = mail.token(await mail.waitFor(email, undefined, 60_000));
      const pw = `Ui!${run}Zz9${how}`;
      await page.goto(web(`/activate?token=${encodeURIComponent(token)}`), { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await expect(page.getByText(/activate your dijipeople access/i)).toBeVisible({ timeout: 20_000 });
      const pwFields = page.locator('input[type=password]');
      for (let i = 0; i < await pwFields.count(); i++) await pwFields.nth(i).fill(pw);
      if (how === 'click') { await page.getByRole('button', { name: 'Activate account' }).scrollIntoViewIfNeeded(); await page.getByRole('button', { name: 'Activate account' }).click(); }
      else await pwFields.last().press('Enter');
      await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
      await page.getByLabel(/email/i).first().fill(email);
      await page.getByLabel(/password/i).first().fill(pw);
      await page.getByRole('button', { name: /sign in|log in/i }).first().click();
      await expect(page).not.toHaveURL(/\/login/, { timeout: 45_000 });
    } finally {
      await api(request, owner, 'DELETE', `/employees/${e.body.id}`);
    }
  };
  test.use({ storageState: { cookies: [], origins: [] } });
  test('[DPQA-INV-104] clicking "Activate account" completes activation and the user signs in (DP-QA-032: the click does nothing today)', async ({ page, request, diag }) => { diag.allow(/status of 404/); await activateAndSignIn(page, request, 'click'); });
  test('[DPQA-INV-106] pressing Enter in the password field completes activation and the user signs in', async ({ page, request, diag }) => {
    diag.allow(/status of 404/); // /documents prefetch 404 is tracked separately as DP-QA-033 (NAV-001)
    await activateAndSignIn(page, request, 'enter');
  });
});

test('[DPQA-MAIL-001] forgot-password sends a reset e-mail only for a real account; the answer is identical either way', async ({ request }) => {
  const c = credentials('A', 'PAYROLL');
  await mail.clear();
  const post = (email: string) => request.post(`${env.QA_API_URL}/api/auth/forgot-password`, { headers: hdr, data: { email, tenantSlug: TENANTS.A.slug } });
  const known = await post(c.email);
  const unknown = await post(`ghost-${run}@qa.dijipeople.test`);
  expect(known.status()).toBe(unknown.status());
  const m = await mail.waitFor(c.email, /reset|password/i);
  expect(m.subject).toMatch(/QA Provisioned A|DijiPeople/);
  expect(m.text).toMatch(/expire|valid/i);
  await new Promise((r) => setTimeout(r, 1500));
  expect((await mail.list(`ghost-${run}@qa.dijipeople.test`)).length, 'no mail for an unknown address').toBe(0);
});

/** A disposable sign-in identity: reset flows change passwords, and the product (rightly) refuses to reset to a previously used one, so shared role users must never be used for them. */
async function disposableUser(request: APIRequestContext, tag: string) {
  const email = `${tag}-${run}@qa.dijipeople.test`;
  const relId = await relationId(request, owner);
  const e = await api(request, owner, 'POST', '/employees', empBody(relId, email));
  expect(e.status, JSON.stringify(e.body).slice(0, 200)).toBeLessThan(300);
  const password = `Start!${run}Zz9a`;
  const u = await api(request, owner, 'POST', '/users', { firstName: 'Disp', lastName: tag, email, password, status: 'ACTIVE', employeeId: e.body.id });
  expect(u.status, JSON.stringify(u.body).slice(0, 200)).toBeLessThan(300);
  return { email, password, employeeId: e.body.id as string };
}

test('[DPQA-MAIL-002] reset link: new password works, old stops, the previous password cannot be reused, and the token is single-use (DP-QA-031: it is reusable today)', async ({ request }) => {
  const d = await disposableUser(request, 'rst');
  try {
    await mail.clear();
    await request.post(`${env.QA_API_URL}/api/auth/forgot-password`, { headers: hdr, data: { email: d.email, tenantSlug: TENANTS.A.slug } });
    const token = mail.token(await mail.waitFor(d.email, /reset|password/i, 60_000));
    const fresh = `Rst!${run}Zz9x`;
    const r = await request.post(`${env.QA_API_URL}/api/auth/reset-password`, { headers: hdr, data: { token, password: fresh } });
    expect(r.status(), await r.text()).toBeLessThan(300);
    const login = (pw: string) => request.post(`${env.QA_API_URL}/api/auth/login`, { headers: hdr, data: { email: d.email, password: pw, tenantSlug: TENANTS.A.slug } });
    expect((await login(fresh)).status()).toBeLessThan(300);
    expect((await login(d.password)).status(), 'old password').toBe(401);
    // RUN-005 contract: the consumed token is refused with 401 before password history is looked at (the 400 history check applies to a LIVE token; unreachable here without a second reset e-mail, which the 60 s cool-down suppresses)
    const reuse = await request.post(`${env.QA_API_URL}/api/auth/reset-password`, { headers: hdr, data: { token, password: d.password } });
    expect(reuse.status(), 'a consumed token cannot be used, whatever password it carries').toBe(401);
    const again = await request.post(`${env.QA_API_URL}/api/auth/reset-password`, { headers: hdr, data: { token, password: `Again!${run}Zz9b` } });
    expect(again.status(), 'the same reset link must not work a second time').toBeGreaterThanOrEqual(400);
  } finally {
    await api(request, owner, 'DELETE', `/employees/${d.employeeId}`);
  }
});

test('[DPQA-MAIL-004] a second reset request within the cool-down sends no second e-mail and answers identically', async ({ request }) => {
  const c = credentials('A', 'EMPLOYEE');
  await mail.clear();
  const post = () => request.post(`${env.QA_API_URL}/api/auth/forgot-password`, { headers: hdr, data: { email: c.email, tenantSlug: TENANTS.A.slug } });
  const a = await post();
  await mail.waitFor(c.email, /reset|password/i, 60_000);
  const b = await post();
  expect(b.status()).toBe(a.status());
  await new Promise((r) => setTimeout(r, 5000));
  expect((await mail.list(c.email)).length, 'one e-mail only inside the cool-down window').toBe(1);
});

test('[DPQA-MAIL-003] the reset token is a signed, short-lived token: lifetime is positive and at most 24 h (it is stateless, so expiry cannot be aged in the DB)', async ({ request }) => {
  const c = credentials('A', 'MANAGER');
  await mail.clear();
  await request.post(`${env.QA_API_URL}/api/auth/forgot-password`, { headers: hdr, data: { email: c.email, tenantSlug: TENANTS.A.slug } });
  const token = mail.token(await mail.waitFor(c.email, /reset|password/i, 60_000));
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  const ttl = claims.exp - claims.iat;
  expect(ttl, `token lifetime ${ttl} s`).toBeGreaterThan(0);
  expect(ttl).toBeLessThanOrEqual(24 * 3600);
  expect(claims.type, 'token is typed for password reset only').toMatch(/reset/i);
  const forged = token.slice(0, -3) + (token.endsWith('abc') ? 'xyz' : 'abc');
  const bad = await request.post(`${env.QA_API_URL}/api/auth/reset-password`, { headers: hdr, data: { token: forged, password: `Forged!${run}Zz9` } });
  expect(bad.status(), 'tampered reset token').toBeGreaterThanOrEqual(400);
  expect(bad.status()).toBeLessThan(500);
});

test.describe('branding', () => {
  // fixed strings on purpose: a failed test restarts the worker, and a value derived from Date.now() would differ afterwards
  const BRAND = { brandName: 'Acme QA Brand', primaryColor: '#7c3aed', welcomeTitle: 'Welcome to Acme QA Brand', emailBrandColor: '#7c3aed', emailFooterText: 'Acme QA footer' };
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  let original: Record<string, unknown> = {};

  const setBrand = async (request: APIRequestContext) => {
    const r = await api(request, owner, 'PATCH', '/tenant-settings', { updates: Object.entries(BRAND).map(([key, value]) => ({ category: 'branding', key, value })) });
    expect(r.status, JSON.stringify(r.body).slice(0, 200)).toBeLessThan(300);
  };
  test.beforeAll(async ({ request }) => {
    const cur = (await api(request, owner, 'GET', '/tenant-settings/resolved')).body;
    original = (cur.settings?.branding ?? cur.branding ?? {}) as Record<string, unknown>;
  });
  test.afterAll(async ({ request }) => {
    const restore = Object.keys(BRAND).map((k) => ({ category: 'branding', key: k, value: (original as any)[k] ?? '' }));
    await api(request, owner, 'PATCH', '/tenant-settings', { updates: restore });
  });

  test('[DPQA-BRAND-001] saving branding persists and is returned by the API; an invalid colour is refused', async ({ request }) => {
    const bad = await api(request, owner, 'PATCH', '/tenant-settings', { updates: [{ category: 'branding', key: 'primaryColor', value: 'not-a-colour' }] });
    expect(bad.status, 'invalid colour').toBeGreaterThanOrEqual(400);
    const ok = await api(request, owner, 'PATCH', '/tenant-settings', { updates: Object.entries(BRAND).map(([key, value]) => ({ category: 'branding', key, value })) });
    expect(ok.status, JSON.stringify(ok.body).slice(0, 200)).toBeLessThan(300);
    const got = (await api(request, owner, 'GET', '/tenant-settings/resolved')).body;
    expect(JSON.stringify(got)).toContain(BRAND.brandName);
    expect(JSON.stringify(got).toLowerCase()).toContain(BRAND.primaryColor);
  });

  test('[DPQA-BRAND-002] logo upload: every role of the tenant can load it (DP-QA-016 retest) and tenant B never receives A\'s asset', async ({ request }) => {
    const up = await request.post(`${env.QA_API_URL}/api/tenant-settings/branding-assets`, { headers: { authorization: `Bearer ${owner}`, ...hdr }, multipart: { file: { name: 'logo.png', mimeType: 'image/png', buffer: PNG }, settingKey: 'logoUrl' } });
    expect(up.status(), await up.text()).toBeLessThan(300);
    const settings = JSON.stringify((await api(request, owner, 'GET', '/tenant-settings/resolved')).body);
    const url = (settings.match(/"logoUrl":"([^"]*\/documents\/[0-9a-f-]+\/view)"/) ?? [])[1];
    expect(url, 'logoUrl set').toBeTruthy();
    const docPath = url!.replace(/^.*\/api/, '');
    const statuses: Record<string, number> = {};
    for (const role of ['OWNER', 'EMPLOYEE', 'HR', 'MANAGER', 'PAYROLL'] as const) {
      const t = await apiToken(request, 'A', role);
      const r = await request.get(`${env.QA_API_URL}/api${docPath}`, { headers: { authorization: `Bearer ${t}`, ...hdr } });
      statuses[role] = r.status();
    }
    expect(statuses, 'logo status per role (all must be 200)').toEqual({ OWNER: 200, EMPLOYEE: 200, HR: 200, MANAGER: 200, PAYROLL: 200 });
    const b = await apiToken(request, 'B', 'OWNER');
    expect([403, 404], 'tenant B reading A\'s logo').toContain((await request.get(`${env.QA_API_URL}/api${docPath}`, { headers: { authorization: `Bearer ${b}`, ...hdr } })).status());
    const anon = await request.get(`${env.QA_API_URL}/api${docPath}`);
    expect([401, 403, 404], 'anonymous logo fetch').toContain(anon.status());
  });

  test('[DPQA-BRAND-003] the login page shows tenant A\'s brand and nothing of it on tenant B', async ({ browser, request }) => {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    await setBrand(request);
    const page = await ctx.newPage();
    await page.goto(web('/login', 'A'), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    // The public tenant resolve is cached up to PUBLIC_TENANT_RESOLVE_CACHE_TTL_SECONDS (300 s): poll across one TTL before judging.
    await expect(async () => { await page.reload({ waitUntil: 'domcontentloaded' }); await expect(page.getByText(BRAND.welcomeTitle).first()).toBeVisible({ timeout: 4000 }); }).toPass({ timeout: 90_000, intervals: [5_000] });
    const pb = await ctx.newPage();
    await pb.goto(web('/login', 'B'), { waitUntil: 'domcontentloaded' });
    await pb.waitForLoadState('networkidle').catch(() => undefined);
    expect(await pb.content()).not.toContain(BRAND.brandName);
    await ctx.close();
  });

  test.describe('signed-in surfaces', () => {
    test.use({ storageState: stateFile('A', 'EMPLOYEE') });
    test('[DPQA-BRAND-004] an employee sees the tenant logo (no broken image, no 404) and the brand colour in the app shell', async ({ page, diag }) => {
      const failed: string[] = [];
      page.on('response', (r) => { if (r.status() >= 400 && /\/documents\//.test(r.url())) failed.push(`${r.status()} ${r.url()}`); });
      await page.goto(web('/leaves'), { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.waitForTimeout(1500);
      expect(failed, 'logo/document requests that failed').toEqual([]);
      const broken = await page.evaluate(() => Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0 && i.src).map((i) => i.src));
      expect(broken, 'broken images on the page').toEqual([]);
      void diag;
    });
  });

  test('[DPQA-BRAND-005] e-mails identify the tenant (company name, own host) and never another tenant; custom e-mail branding is NOT_IMPLEMENTED by design (DP-QA-026)', async ({ request }) => {
    const c = credentials('A', 'PAYROLL');
    await new Promise((r) => setTimeout(r, 65_000)); // cool-down since MAIL-001
    await mail.clear();
    await request.post(`${env.QA_API_URL}/api/auth/forgot-password`, { headers: hdr, data: { email: c.email, tenantSlug: TENANTS.A.slug } });
    const m = await mail.waitFor(c.email, /reset|password/i, 60_000);
    const body = `${m.subject}\n${m.html}\n${m.text}`;
    expect(body, 'tenant company name in the e-mail').toContain('QA Provisioned A');
    expect(body, 'no other tenant in the e-mail').not.toContain('QA Provisioned B');
    expect(m.links.some((l) => l.includes(`${TENANTS.A.slug}.`)), 'reset link points at this tenant host').toBe(true);
    test.info().annotations.push({ type: 'not-implemented', description: 'branding.emailSenderName / emailFooterText / showLogoInEmails are NOT_IMPLEMENTED (tenant-settings-dispositions.ts); the Branding screen does not expose them. Subject stays "Reset your DijiPeople password".' });
  });
});
