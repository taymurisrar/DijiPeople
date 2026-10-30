import { test as setup, expect } from '@playwright/test';
import { existsSync, statSync } from 'node:fs';
import { credentials, stateFile, tenantUrl, type TenantKey, type TenantRole } from '../fixtures/tenants';

/**
 * UI sign-in per provisioned tenant and role. A fresh cached session (< 20 min) is reused, because the login endpoint is
 * throttled (20 / 10 min) and re-running the suite several times in a row would otherwise produce 429s that look like
 * product failures.
 */
const PLAN: Array<[TenantKey, TenantRole]> = [
  ['A', 'OWNER'], ['A', 'EMPLOYEE'], ['B', 'OWNER'],
];

for (const [t, role] of PLAN) {
  setup(`[DPQA-SETUP-${t}-${role}] sign in to tenant ${t} as ${role}`, async ({ page }) => {
    const file = stateFile(t, role);
    if (existsSync(file) && Date.now() - statSync(file).mtimeMs < 20 * 60_000 && !process.env.QA_FORCE_LOGIN) {
      setup.skip(true, 'fresh cached session reused');
      return;
    }
    const c = credentials(t, role);
    await page.goto(tenantUrl(t, '/login'));
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.getByLabel(/email/i).first().fill(c.email);
    await page.getByLabel(/password/i).first().fill(c.password);
    await page.getByRole('button', { name: /sign in|log in/i }).first().click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 45_000 });
    await page.context().storageState({ path: file });
  });
}
