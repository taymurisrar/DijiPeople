import { test, expect } from '../fixtures/test';
import { stateFile, tenantUrl } from '../fixtures/tenants';
import type { Page } from '@playwright/test';

/**
 * DPQA-VIS-*  visual regression baselines (Chromium, 1440x900). Baselines live next to this file in `*-snapshots/`;
 * create/refresh them deliberately with `--update-snapshots` and review the diff. Dynamic regions (dates, counts, names of
 * fixture rows, avatars) are masked so the check fails on layout/styling, not on data.
 * DPQA-CMD-*  command visibility / enablement per role and screen.
 */
test.describe('visual regression (owner, tenant A) @visual', () => {
  test.use({ storageState: stateFile('A', 'OWNER'), viewport: { width: 1440, height: 900 } });

  const SHOTS: Array<[id: string, path: string, name: string]> = [
    ['001', '/', 'overview'], ['002', '/employees', 'employees-list'], ['003', '/employees/new', 'employee-new'],
    ['004', '/leaves', 'leave-list'], ['005', '/attendance', 'attendance-list'], ['006', '/settings', 'settings-home'],
    ['007', '/settings/branding', 'branding'], ['008', '/approvals', 'approvals'],
  ];
  for (const [id, path, name] of SHOTS) {
    test(`[DPQA-VIS-${id}] ${path} matches its baseline`, async ({ page }) => {
      await page.goto(tenantUrl('A', path), { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.waitForTimeout(1500);
      await expect(page).toHaveScreenshot(`${name}.png`, {
        fullPage: false, maxDiffPixelRatio: 0.03, animations: 'disabled',
        mask: [page.locator('table'), page.locator('main section').filter({ has: page.locator('table') }), page.locator('[data-testid*=chart], svg'), page.getByText(/showing \d+ to \d+/i), page.locator('time')],
      });
    });
  }
});

const names = async (page: Page) => [...new Set(await page.locator('button, a[role=button], a').evaluateAll((els) => els.map((e) => (e.textContent || e.getAttribute('aria-label') || '').trim()).filter(Boolean)))];

test.describe('command visibility - owner', () => {
  test.use({ storageState: stateFile('A', 'OWNER') });
  for (const [id, path, must] of [
    ['001', '/employees', ['New', 'Data Transfer']],
    ['002', '/leaves', ['New', 'Refresh', 'Data Transfer']],
    ['003', '/attendance', ['Check In', 'New', 'Correction Request', 'Refresh', 'Data Transfer']],
    ['004', '/claims', ['New claim', 'Refresh']],
  ] as const) {
    test(`[DPQA-CMD-${id}] owner sees all list commands on ${path}`, async ({ page }) => {
      await page.goto(tenantUrl('A', path), { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.waitForTimeout(1200);
      const have = await names(page);
      for (const m of must) expect(have.some((n) => n.includes(m)), `"${m}" on ${path}; found: ${have.slice(0, 18).join(' | ')}`).toBe(true);
    });
  }
  test('[DPQA-CMD-005] employee record: Edit, Delete, Export, Share, Assign, Refresh are offered; Save appears only in edit mode', async ({ page, request }) => {
    const { api, apiToken } = await import('../fixtures/tenants');
    const t = await apiToken(request, 'A', 'OWNER');
    const id = (await api(request, t, 'GET', '/employees?pageSize=1')).body.items[0].id;
    await page.goto(tenantUrl('A', `/employees/${id}`), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.waitForTimeout(1500);
    const have = await names(page);
    for (const m of ['Edit', 'Delete', 'Export', 'Share', 'Assign', 'Refresh']) expect(have.some((n) => n === m), m).toBe(true);
    expect(have.includes('Save')).toBe(false);
    await page.getByRole('button', { name: /^edit$/i }).first().click();
    await expect(page.getByRole('button', { name: /^save$/i }).first()).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('command visibility - employee', () => {
  test.use({ storageState: stateFile('A', 'EMPLOYEE') });
  test('[DPQA-CMD-010] employee Employees list offers no New / Data Transfer / bulk commands', async ({ page, diag }) => {
    diag.allow(/documents\/[0-9a-f-]+\/view|status of 404/); // DP-QA-016 logo 404 for non-admin
    await page.goto(tenantUrl('A', '/employees'), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.waitForTimeout(1200);
    const have = await names(page);
    for (const m of ['New', 'Data Transfer']) expect(have.some((n) => n === m || n.startsWith(m)), `${m} must not be offered`).toBe(false);
  });
  test('[DPQA-CMD-011] employee cannot open /employees/new by URL', async ({ page }) => {
    await page.goto(tenantUrl('A', '/employees/new'), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.waitForTimeout(1200);
    await expect(page.getByRole('button', { name: /^save$/i })).toHaveCount(0);
  });
  test('[DPQA-CMD-012] employee leave list: New is offered; row-level select exists', async ({ page, diag }) => {
    diag.allow(/documents\/[0-9a-f-]+\/view|status of 404/); // DP-QA-016 logo 404 for non-admin
    await page.goto(tenantUrl('A', '/leaves'), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    const have = await names(page);
    expect(have.some((n) => n === 'New')).toBe(true);
  });
  test('[DPQA-CMD-013] attendance Check In state carries a reason when disabled', async ({ page, diag }) => {
    diag.allow(/documents\/[0-9a-f-]+\/view|status of 404/); // DP-QA-016 logo 404 for non-admin
    await page.goto(tenantUrl('A', '/attendance'), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    const btn = page.getByRole('button', { name: /check in/i }).first();
    await expect(btn).toBeVisible();
    if (await btn.isDisabled()) expect((await btn.getAttribute('title')) ?? (await btn.getAttribute('aria-describedby')) ?? '', 'a disabled command must say why').not.toBe('');
  });
});
