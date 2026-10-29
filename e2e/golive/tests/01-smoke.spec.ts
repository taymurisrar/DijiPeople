import { test, expect, gotoTenant, authFile } from '../fixtures/test';

/**
 * DPQA-SMK-*: every Starter-entitled route renders for a tenant admin with no
 * console errors, no 5xx and no error boundary. Route list comes from the
 * verified Starter inventory (docs/qa/go-live/STARTER-SCOPE.md).
 */
test.use({ storageState: authFile('ADMIN') });

const STARTER_ROUTES: Array<[id: string, path: string, heading: RegExp]> = [
  ['001', '/', /overview/i],
  ['002', '/employees', /employees/i],
  ['003', '/employees/new', /new employee/i],
  ['004', '/employees/import', /import/i], // KNOWN-FAIL DP-QA-004
  ['005', '/leaves', /leave/i],
  ['006', '/attendance', /attendance/i],
  ['007', '/approvals', /approvals/i],
  ['008', '/reports', /reports/i],
  ['009', '/claims', /claims/i],
  ['010', '/settings', /settings/i],
  ['011', '/settings/access', /access/i],
  ['012', '/settings/branding', /branding/i],
  ['013', '/settings/customization', /customization/i],
  ['014', '/settings/general-setup/tenant/tenant-profile', /tenant profile/i],
  ['015', '/settings/security-access/roles', /roles|security/i],
  ['016', '/settings/security-access/identities/users', /users/i],
];

for (const [id, path, heading] of STARTER_ROUTES) {
  test(`[DPQA-SMK-${id}] ${path} renders cleanly @xbrowser @responsive`, async ({ page }) => {
    const response = await gotoTenant(page, path);
    await page.waitForTimeout(1500); // error boundaries render after hydration
    expect(response?.status(), 'document status').toBeLessThan(400);
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
    await expect(page.getByText(/we hit an unexpected problem/i)).toHaveCount(0);
    await expect(page.getByText(/not included in your plan/i)).toHaveCount(0);
  });
}

test('[DPQA-SMK-020] API health is ok', async ({ request }) => {
  const r = await request.get(`${process.env.QA_API_URL ?? 'http://localhost:4098'}/api/health`);
  expect(r.status()).toBe(200);
  expect((await r.json()).status).toBe('ok');
});
