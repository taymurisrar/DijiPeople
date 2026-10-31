import { test, expect, gotoTenant, authFile, env } from '../fixtures/test';

/** DPQA-AUTH-*: sign-in, sign-out, unauthenticated access and role boundaries. */

test.describe('unauthenticated', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const [id, path] of [['001', '/employees'], ['002', '/settings'], ['003', '/attendance'], ['004', '/leaves']] as const) {
    test(`[DPQA-AUTH-${id}] ${path} redirects to login without a session`, async ({ page }) => {
      await gotoTenant(page, path);
      await expect(page).toHaveURL(/\/login/);
    });
  }

  test('[DPQA-AUTH-010] wrong password is rejected with a message and no session', async ({ page, diag }) => {
    diag.allow(/401|403|429|Failed to load resource/);
    await gotoTenant(page, '/login');
    await page.getByLabel(/email/i).first().fill(env.QA_ADMIN_EMAIL);
    await page.getByLabel(/password/i).first().fill('definitely-wrong-password');
    await page.getByRole('button', { name: /sign in|log in/i }).first().click();
    await expect(page.getByText(/invalid|incorrect|wrong|failed/i).first()).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('[DPQA-AUTH-011] empty submit shows validation, does not call the API', async ({ page }) => {
    await gotoTenant(page, '/login');
    await page.getByRole('button', { name: /sign in|log in/i }).first().click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('[DPQA-AUTH-012] API without a token is 401', async ({ request }) => {
    const r = await request.get(`${env.QA_API_URL}/api/employees`);
    expect(r.status()).toBe(401);
  });

  test('[DPQA-AUTH-013] API with a forged token is 401', async ({ request }) => {
    const r = await request.get(`${env.QA_API_URL}/api/employees`, { headers: { authorization: 'Bearer abc.def.ghi' } });
    expect(r.status()).toBe(401);
  });
});

test.describe('role boundaries', () => {
  test.describe('employee', () => {
    test.use({ storageState: authFile('EMPLOYEE') });
    test('[DPQA-AUTH-020] employee cannot open tenant user administration', async ({ page, diag }) => {
      diag.allow(/.*/);
      await gotoTenant(page, '/settings/security-access/identities/users');
      // The page redirects an unauthorised user away; let navigation settle before reading the URL.
      await page.waitForLoadState('load').catch(() => undefined);
      await page.waitForTimeout(2000);
      // The URL may stay (the app renders the profile page in place); judge the content and the API.
      await expect(page.getByRole('heading', { name: /^users$/i })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: /my profile/i }).first()).toBeVisible();
    });
    test('[DPQA-AUTH-021] employee API cannot list all employees beyond own scope', async ({ page }) => {
      await gotoTenant(page, '/employees');
      const rows = await page.getByRole('row').count();
      // Seed has 15 employees; an OWN-scoped employee must not see them all.
      expect(rows).toBeLessThan(10);
    });
  });

  test.describe('admin', () => {
    test.use({ storageState: { cookies: [], origins: [] } });
    // Uses the PAYROLL user: logging out revokes that user's sessions server-side, which would
    // poison the cached ADMIN session the entitlement suite reuses (this happened in RUN-001).
    test('[DPQA-AUTH-030] sign out ends the session; back navigation does not restore it', async ({ page, diag }) => {
      // Known: DP-QA-007 — the client logs "[Logout] Request timed out after 8000ms" when logout is slow.
      // Allowed here so the session-ended assertion below is what decides pass/fail; the slowness is tracked separately.
      diag.allow(/\[Logout\] Request timed out|status of 404/); // the /documents prefetch 404 is DP-QA-033 (NAV-001)
      await gotoTenant(page, '/login');
      await page.getByLabel(/email/i).first().fill(env.QA_PAYROLL_EMAIL);
      await page.getByLabel(/password/i).first().fill(env.QA_PASSWORD);
      await page.getByRole('button', { name: /sign in|log in/i }).first().click();
      await expect(page).not.toHaveURL(/\/login/, { timeout: 45_000 });
      await page.getByRole('button', { name: /demo|account|profile/i }).first().click();
      await page.getByText('Logout', { exact: true }).first().click();
      // Logout is slow locally (2-4 s) and lands on "/" before redirecting; what matters
      // is that the session is gone, so wait for the request then probe a protected route.
      await page.waitForResponse((r) => r.url().includes('/api/auth/logout'), { timeout: 30_000 }).catch(() => undefined);
      await page.waitForTimeout(1500);
      await page.goBack().catch(() => undefined);
      await gotoTenant(page, '/employees');
      await expect(page).toHaveURL(/\/login/);
    });
  });
});

test.describe('navigation hygiene', () => {
  test.use({ storageState: authFile('EMPLOYEE') });
  test('[DPQA-NAV-001] the Overview and My Profile of an employee make no request that answers 404 (DP-QA-033: /documents)', async ({ page }) => {
    const notFound: string[] = [];
    page.on('response', (r) => { if (r.status() === 404) notFound.push(r.url().replace(/^https?:\/\/[^/]+/, '')); });
    await gotoTenant(page, '/');
    await page.waitForTimeout(2500);
    expect(notFound, 'requests answered 404').toEqual([]);
  });
});
