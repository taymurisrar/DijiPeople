import { test as setup, expect } from '@playwright/test';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { loadQaEnv, ROLES, roleEmail } from '../fixtures/env';

const env = loadQaEnv();
mkdirSync('./golive-results/.auth', { recursive: true });

// One real UI sign-in per role for the seed-demo tenant, cached for the run. The login endpoint is throttled
// (20 per 10 min), so a fresh cached session (< 20 min) is reused and tests not about authentication never sign in.
for (const role of ROLES) {
  setup(`[DPQA-SETUP-${role}] sign in as ${role}`, async ({ page }) => {
    const file = `./golive-results/.auth/${role}.json`;
    if (existsSync(file) && Date.now() - statSync(file).mtimeMs < 20 * 60_000 && !process.env.QA_FORCE_LOGIN) {
      setup.skip(true, 'fresh cached session reused');
      return;
    }
    await page.goto(`/login?tenant=${env.QA_TENANT_SLUG}`);
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.getByLabel(/email/i).first().fill(roleEmail(env, role));
    await page.getByLabel(/password/i).first().fill(env.QA_PASSWORD);
    await page.getByRole('button', { name: /sign in|log in/i }).first().click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 45_000 });
    await page.context().storageState({ path: file });
  });
}
