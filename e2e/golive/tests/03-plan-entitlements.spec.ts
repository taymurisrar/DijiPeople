import { test, expect, gotoTenant, authFile, env } from '../fixtures/test';
import { STARTER_BASE, APPROVED_STARTER_ADDITIONS } from '../fixtures/entitlement-matrix';

/**
 * DPQA-ENT-*: Starter users get what Starter sells and nothing else — in the
 * navigation, on a direct URL, and (the part that matters) on the API.
 * Requires `entitlementEnforcement = ENFORCE` on the QA database; the platform
 * default is REPORT_ONLY, which is covered separately by DPQA-ENT-020.
 */
test.use({ storageState: authFile('ADMIN') });

// Feature keys NOT in the Starter plan (services/api/.../plans.catalog.ts).
const NOT_STARTER: Array<[id: string, api: string, route: string]> = [
  ['001', '/projects', '/projects'],
  ['002', '/payroll/runs', '/payroll'],
  ['003', '/timesheets/entries', '/timesheets'],
  ['004', '/job-openings', '/recruitment'],
  ['005', '/onboarding/templates', '/onboarding'],
];

async function accessToken(request: import('@playwright/test').APIRequestContext) {
  const r = await request.post(`${env.QA_API_URL}/api/auth/login`, {
    headers: { 'X-DijiPeople-App': 'web' },
    data: { email: env.QA_ADMIN_EMAIL, password: env.QA_PASSWORD, tenantSlug: env.QA_TENANT_SLUG },
  });
  const body = await r.json();
  return (body.accessToken ?? body.tokens?.accessToken) as string;
}

test('[DPQA-ENT-010] sidebar shows only Starter modules', async ({ page }) => {
  await gotoTenant(page, '/');
  const nav = page.locator('aside, nav').first();
  for (const shown of ['Employees', 'Leave', 'Attendance', 'Settings']) {
    await expect(nav.getByText(shown, { exact: true }).first()).toBeVisible();
  }
  for (const hidden of ['Payroll', 'Timesheets', 'Projects', 'Recruitment', 'Onboarding']) {
    await expect(nav.getByText(hidden, { exact: true })).toHaveCount(0);
  }
});

for (const [id, api, route] of NOT_STARTER) {
  test(`[DPQA-ENT-${id}] API ${api} is refused for a Starter tenant`, async ({ request }) => {
    const token = await accessToken(request);
    const r = await request.get(`${env.QA_API_URL}/api${api}`, { headers: { authorization: `Bearer ${token}`, 'X-DijiPeople-App': 'web' } });
    expect([402, 403], `status for ${api}`).toContain(r.status());
  });

  test(`[DPQA-ENT-1${id}] direct URL ${route} shows an upgrade message, not a crash`, async ({ page, diag }) => {
    diag.allow(/.*/); // the refusal itself is expected to log; the screen is what we judge
    await gotoTenant(page, route);
    await page.waitForTimeout(2500); // let the error boundary or message settle before judging
    await expect(page.getByText(/we hit an unexpected problem/i), 'generic crash screen shown instead of an upgrade message').toHaveCount(0);
    await expect(page.getByText(/upgrade|not included in your plan|not available on your plan/i).first()).toBeVisible();
  });
}

test('[DPQA-ENT-040] Compliance-gated settings page shows the plan-gate screen with an upgrade path', async ({ page }) => {
  await gotoTenant(page, '/settings/audit-compliance/history/audit-events');
  await expect(page.getByText(/not part of your current subscription/i)).toBeVisible();
  await expect(page.getByText(/view plan and pricing/i)).toBeVisible();
});

test('[DPQA-ENT-030] feature resolution endpoint reports Starter', async ({ request }) => {
  const token = await accessToken(request);
  const r = await request.get(`${env.QA_API_URL}/api/tenant-settings/features`, { headers: { authorization: `Bearer ${token}`, 'X-DijiPeople-App': 'web' } });
  expect(r.status()).toBe(200);
  const body = await r.json();
  expect(body.subscription.plan.key).toBe('starter');
  const enabled = (body.items as Array<{ key: string; isEnabled: boolean }>).filter((i) => i.isEnabled).map((i) => i.key).sort();
  // RUN-006: Starter = the original seven plus ONLY the keys the owner-approved requirements add (fixtures/entitlement-matrix.ts); any other extra key fails.
  expect(enabled).toEqual([...STARTER_BASE, ...APPROVED_STARTER_ADDITIONS].sort());
});
