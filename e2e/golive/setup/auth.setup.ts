import { test as setup, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { loadQaEnv, ROLES, roleEmail } from '../fixtures/env';

const env = loadQaEnv();
mkdirSync('./golive-results/.auth', { recursive: true });

// One real UI sign-in per role, cached for the run. The login endpoint is
// throttled (20 per 10 min), so tests that are not about authentication must
// reuse these sessions instead of signing in themselves.
for (const role of ROLES) {
  setup(`[DPQA-SETUP-${role}] sign in as ${role}`, async ({ page }) => {
    await page.goto(`/login?tenant=${env.QA_TENANT_SLUG}`);
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.getByLabel(/email/i).first().fill(roleEmail(env, role));
    await page.getByLabel(/password/i).first().fill(env.QA_PASSWORD);
    await page.getByRole('button', { name: /sign in|log in/i }).first().click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 45_000 });
    await page.context().storageState({ path: `./golive-results/.auth/${role}.json` });
  });
}
