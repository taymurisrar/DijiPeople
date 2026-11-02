import { test, expect, env } from '../fixtures/test';
import { credentials, tenantUrl } from '../fixtures/tenants';
import { sql } from '../fixtures/mail-db';
import { createCustomPlan, deleteCustomPlan, platformConfigured, priceRow } from '../fixtures/platform';

/**
 * RUN-008, browser level.
 *   PUBUI-001/002  DP-QA-044  the Admin console publishes and withdraws a Custom plan's price (Plans > plan > Pricing), the database follows, the predefined plans offer no such control
 *   SESS-050/051   SESS-005   on the PRODUCTION web build the session-expired dialog's "Sign in again" link is only followed on click: no /api/auth/logout request, no session revocation and no console error while it is drawn
 * The admin console is a second production build (QA_ADMIN_URL, port 3302). Platform sign-in is limited to 20 per 10 minutes, so each UI test signs in once.
 */
const run = Date.now().toString(36);
const adminUrl = (env as unknown as Record<string, string | undefined>).QA_ADMIN_URL ?? '';

test.describe('Admin console price publication (DP-QA-044)', () => {
  test.skip(!platformConfigured() || !adminUrl, 'NOT RUN: platform admin or QA_ADMIN_URL not configured');
  test.beforeEach(({}, i) => { test.skip(i.project.name !== 'chromium', 'admin console UI check runs once, on the chromium project'); });
  test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1440, height: 900 } });

  async function signIn(page: import('@playwright/test').Page) {
    await page.goto(`${adminUrl}/login`);
    await page.getByRole('textbox', { name: 'Email' }).fill((env as unknown as Record<string, string>).QA_PLATFORM_EMAIL);
    await page.getByRole('textbox', { name: 'Password' }).fill((env as unknown as Record<string, string>).QA_PLATFORM_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL((u) => !/login/.test(u.pathname), { timeout: 45_000 });
  }
  const openPricing = async (page: import('@playwright/test').Page, planId: string) => {
    await page.goto(`${adminUrl}/plans/${planId}`);
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.getByRole('tab', { name: /^pricing$/i }).or(page.getByRole('button', { name: /^pricing$/i })).first().click();
  };

  test('[DPQA-PUBUI-001] an operator prices, publishes and withdraws a Custom plan price from the console; the database and the console agree', async ({ page, request, diag }, info) => {
    test.setTimeout(240_000);
    diag.allow(/status of 40[14]|favicon/);
    const plan = await createCustomPlan(request, ['employees'], { label: 'ui', monthly: 29 });
    try {
      expect((await priceRow(plan.priceId!)).publicationStatus).toBe('DRAFT');
      await signIn(page);
      await openPricing(page, plan.id);
      const publish = page.getByRole('button', { name: /^publish price$/i });
      await expect(publish, 'a DRAFT price offers Publish price').toBeVisible({ timeout: 20_000 });
      await page.screenshot({ path: `golive-results/run008-evidence/PUBUI-001-before.png`, fullPage: true });
      await publish.click();
      await expect(page.getByText('Price published.')).toBeVisible({ timeout: 20_000 });
      await expect.poll(async () => (await priceRow(plan.priceId!)).publicationStatus, { timeout: 10_000 }).toBe('PUBLISHED');
      const withdraw = page.getByRole('button', { name: /withdraw price from use/i });
      await expect(withdraw, 'a PUBLISHED price offers Withdraw').toBeVisible();
      await page.screenshot({ path: `golive-results/run008-evidence/PUBUI-001-published.png`, fullPage: true });
      // survives a reload: the console reads the persisted state
      await page.reload(); await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.getByRole('tab', { name: /^pricing$/i }).or(page.getByRole('button', { name: /^pricing$/i })).first().click();
      await expect(page.getByRole('button', { name: /withdraw price from use/i })).toBeVisible();
      await page.getByRole('button', { name: /withdraw price from use/i }).click();
      await expect(page.getByText('Price withdrawn.')).toBeVisible({ timeout: 20_000 });
      await expect.poll(async () => (await priceRow(plan.priceId!)).publicationStatus, { timeout: 10_000 }).toBe('DRAFT');
      await expect(page.getByRole('button', { name: /^publish price$/i })).toBeVisible();
      await page.screenshot({ path: `golive-results/run008-evidence/PUBUI-001-withdrawn.png`, fullPage: true });
      const audit = await sql<{ action: string }>(`select action from "PlatformAuditLog" where "entityId" = $1 and action in ('PLAN_PRICE_PUBLISHED','PLAN_PRICE_UNPUBLISHED') order by "createdAt"`, [plan.priceId]);
      expect(audit.map((a) => a.action)).toEqual(['PLAN_PRICE_PUBLISHED', 'PLAN_PRICE_UNPUBLISHED']);
      info.annotations.push({ type: 'evidence', description: 'screenshots run008-evidence/PUBUI-001-*.png' });
    } finally { await deleteCustomPlan(request, plan); }
  });

  test('[DPQA-PUBUI-002] the predefined plans offer no price publish control in the console', async ({ page, diag }) => {
    test.setTimeout(180_000);
    diag.allow(/status of 40[14]|favicon/);
    const starter = (await sql<{ id: string }>(`select id from "Plan" where key = 'starter'`))[0].id;
    await signIn(page);
    await openPricing(page, starter);
    await expect(page.locator('main')).toContainText(/pric/i);
    await expect(page.getByRole('button', { name: /^publish price$/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /withdraw price from use/i })).toHaveCount(0);
    await page.screenshot({ path: `golive-results/run008-evidence/PUBUI-002-starter-pricing.png`, fullPage: true });
  });
});

test.describe('SESS-005 on the production web build: links into route handlers are not prefetched', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  async function signIn(page: import('@playwright/test').Page) {
    const c = credentials('A', 'EMPLOYEE');
    await page.goto(tenantUrl('A', '/login'));
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.getByLabel(/email/i).first().fill(c.email);
    await page.getByLabel(/password/i).first().fill(c.password);
    await page.getByRole('button', { name: /sign in|log in/i }).first().click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 45_000 });
  }

  test('[DPQA-SESS-050] @xbrowser the session-expired dialog is drawn for 12 s without any /api/auth/logout request, the session stays live, the console stays clean; the link works when CLICKED', async ({ page, context, diag }, info) => {
    test.setTimeout(240_000);
    diag.allow(/status of 401/);
    await signIn(page);
    await page.goto(tenantUrl('A', '/leaves'), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    const logoutHits: string[] = [];
    page.on('request', (r) => { if (/\/api\/auth\/logout/.test(r.url())) logoutHits.push(`${r.method()} ${r.url().replace(/^https?:\/\/[^/]+/, '')} ${r.headers()['rsc'] ? '[rsc]' : ''}`); });
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('dijipeople:api-error', { detail: { error: { success: false, traceId: 'qa-sess-050', timestamp: new Date().toISOString(), statusCode: 401, errorCode: 'SESSION_EXPIRED', message: 'Session expired', description: 'Your session has expired. Sign in again.', path: '/api/qa', method: 'GET' } } })));
    const link = page.getByRole('link', { name: /sign in again/i });
    await expect(link, 'the dialog offers Sign in again').toBeVisible({ timeout: 15_000 });
    const href = await link.getAttribute('href');
    expect(href).toMatch(/^\/api\/auth\/logout\?reason=session-expired/);
    await link.scrollIntoViewIfNeeded();
    await page.waitForTimeout(12_000);
    expect(logoutHits, 'no logout request (navigation, prefetch or RSC) before the click').toEqual([]);
    const meStatus = await page.evaluate(async () => (await fetch('/api/auth/me', { credentials: 'include' })).status);
    const me = { status: () => meStatus };
    info.annotations.push({ type: 'observation', description: `GET /api/auth/me after 12 s with the dialog drawn -> ${me.status()}; cookies kept: ${(await context.cookies()).filter((c) => /access|refresh/i.test(c.name)).map((c) => c.name).join(',')}` });
    expect((await context.cookies()).some((c) => /access/i.test(c.name)), 'auth cookies not cleared by being drawn').toBe(true);
    expect(me.status(), 'session still live').toBeLessThan(400);
    await page.screenshot({ path: `golive-results/run008-evidence/SESS-050-${info.project.name}.png` });
    await link.click();
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
    expect(logoutHits.length, 'the logout request happens when the link is clicked').toBeGreaterThan(0);
  });

  test('[DPQA-SESS-051] @xbrowser the same holds on a mobile-sized viewport (the link is in the viewport, the case that triggered prefetching)', async ({ page, diag }, info) => {
    test.setTimeout(240_000);
    diag.allow(/status of 401/);
    await page.setViewportSize({ width: 412, height: 915 });
    await signIn(page);
    await page.goto(tenantUrl('A', '/leaves'), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    const hits: string[] = [];
    page.on('request', (r) => { if (/\/api\/auth\/logout/.test(r.url())) hits.push(r.url()); });
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('dijipeople:api-error', { detail: { error: { success: false, traceId: 'qa-sess-051', timestamp: new Date().toISOString(), statusCode: 401, errorCode: 'AUTH_TOKEN_INVALID', message: 'Access token is invalid.', description: 'Your session has expired.', path: '/api/qa', method: 'GET' } } })));
    await expect(page.getByRole('link', { name: /sign in again/i })).toBeInViewport({ timeout: 15_000 });
    await page.waitForTimeout(12_000);
    expect(hits, 'no logout request while drawn on a phone-sized viewport').toEqual([]);
    await page.screenshot({ path: `golive-results/run008-evidence/SESS-051-${info.project.name}.png` });
  });
});
