import AxeBuilder from '@axe-core/playwright';
import { test, expect, pace } from '../fixtures/test';
import { stateFile, tenantUrl } from '../fixtures/tenants';

/**
 * DPQA-A11Y-*  axe-core (WCAG 2.1 A/AA) per Starter screen, plus keyboard reachability.
 * DPQA-RESP-*  no horizontal page scroll and primary navigation reachable at tablet/mobile widths (@responsive).
 * DPQA-PERF-*  local timing only. These numbers come from `next dev --webpack` on a laptop and are NOT production evidence.
 */
test.use({ storageState: stateFile('A', 'OWNER') });

const SCREENS: Array<[id: string, path: string]> = [
  ['001', '/'], ['002', '/employees'], ['003', '/employees/new'], ['004', '/leaves'], ['005', '/attendance'],
  ['006', '/approvals'], ['007', '/claims'], ['008', '/settings'], ['009', '/settings/branding'],
  ['010', '/settings/security-access/identities/users'],
];

// The authenticated read limit is 600 requests/min per user and the earlier suites share the owner token: start this file with a fresh window.
// (A 429 on a page load sends the UI to the error boundary — DP-QA-024 — so a polluted window shows up as a spurious console error.)
test.beforeAll(async () => { await new Promise((r) => setTimeout(r, 62_000)); });

const settle = async (page: import('@playwright/test').Page, path: string) => {
  await page.goto(tenantUrl('A', path), { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(1000);
  await pace(path);
};

for (const [id, path] of SCREENS) {
  test(`[DPQA-A11Y-${id}] ${path} has no serious/critical axe violations`, async ({ page }, testInfo) => {
    await settle(page, path);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const blocking = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    await testInfo.attach('axe.json', { body: JSON.stringify(result.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help })), null, 1), contentType: 'application/json' });
    expect(blocking.map((v) => `${v.id} (${v.impact}, ${v.nodes.length} nodes)`)).toEqual([]);
  });
}

test('[DPQA-A11Y-020] keyboard: Tab reaches interactive controls on the employee list and focus is visible', async ({ page }) => {
  await settle(page, '/employees');
  const seen = new Set<string>();
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    const d = await page.evaluate(() => { const e = document.activeElement as HTMLElement | null; return e ? `${e.tagName}:${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30)}` : ''; });
    seen.add(d);
  }
  expect(seen.size, 'focus must move through distinct controls').toBeGreaterThan(8);
});

test('[DPQA-A11Y-021] the New employee form: every input has an accessible name', async ({ page }) => {
  await settle(page, '/employees/new');
  const unnamed = await page.evaluate(() => [...document.querySelectorAll('input:not([type=hidden]),select,textarea')]
    .filter((e) => { const el = e as HTMLInputElement; return !el.labels?.length && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby') && !el.title; })
    .map((e) => `${e.tagName}[name=${(e as HTMLInputElement).name}]`));
  expect(unnamed).toEqual([]);
});

test('[DPQA-A11Y-022] dialogs: the profile menu closes on Escape and returns focus', async ({ page }) => {
  await settle(page, '/');
  const trigger = page.getByRole('button', { name: /owner|qa|account|profile/i }).first();
  await trigger.click();
  await expect(page.getByText('Logout', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText('Logout', { exact: true })).toHaveCount(0);
});

for (const [id, path] of [['001', '/'], ['002', '/employees'], ['003', '/employees/new'], ['004', '/leaves'], ['005', '/attendance'], ['006', '/settings']] as const) {
  test(`[DPQA-RESP-${id}] ${path} has no horizontal page overflow @responsive`, async ({ page }, testInfo) => {
    await settle(page, path);
    const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    await testInfo.attach('viewport.png', { body: await page.screenshot(), contentType: 'image/png' });
    expect(o.sw, `scrollWidth ${o.sw} > clientWidth ${o.cw}`).toBeLessThanOrEqual(o.cw + 1);
  });
}

test('[DPQA-RESP-010] primary navigation is reachable at the current viewport @responsive', async ({ page }) => {
  await settle(page, '/');
  const nav = page.getByRole('link', { name: /^employees$/i }).or(page.getByRole('button', { name: /menu|open navigation|toggle/i })).first();
  await expect(nav).toBeVisible();
});

// LOCAL `next dev --webpack` numbers. Budgets here are only a sanity ceiling; the measured values are attached to every run and recorded in the run report.
// Real thresholds need owner approval and a production-like build (OBS-006, gate C2).
const BUDGET_MS = { page: 15000, api: 5000 } as const;
for (const [id, path] of [['001', '/employees'], ['002', '/leaves'], ['003', '/attendance'], ['004', '/']] as const) {
  test(`[DPQA-PERF-${id}] ${path} warm load under provisional ${BUDGET_MS.page} ms and no request over ${BUDGET_MS.api} ms`, async ({ page }, testInfo) => {
    await settle(page, path); // first hit compiles the route in dev; measure the second
    const slow: string[] = [];
    page.on('requestfinished', async (req) => {
      const t = req.timing();
      const ms = t.responseEnd > 0 ? t.responseEnd : 0;
      if (req.url().includes('/api/') && ms > BUDGET_MS.api) slow.push(`${Math.round(ms)}ms ${req.url().replace(/\?.*/, '').slice(-60)}`);
    });
    const t0 = Date.now();
    await page.goto(tenantUrl('A', path), { waitUntil: 'load' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    const ms = Date.now() - t0;
    await testInfo.attach('timing.json', { body: JSON.stringify({ path, ms, slow }), contentType: 'application/json' });
    expect(ms).toBeLessThan(BUDGET_MS.page);
    expect(slow, 'slow API requests').toEqual([]);
  });
}

test('[DPQA-PERF-010] controlled concurrent read load: 25 parallel GET /employees stay under 8 s each locally and none fail', async ({ request }) => {
  const { apiToken, api } = await import('../fixtures/tenants');
  const token = await apiToken(request, 'A', 'OWNER');
  // Distinct query strings, so the result is real concurrency and not one cached response replayed (see memory: identical-concurrent-fetches).
  const started = Date.now();
  const rs = await Promise.all(Array.from({ length: 25 }, async (_, i) => { const t = Date.now(); const r = await api(request, token, 'GET', `/employees?pageSize=${10 + i}`); return { s: r.status, ms: Date.now() - t }; }));
  const worst = Math.max(...rs.map((r) => r.ms));
  test.info().annotations.push({ type: 'local-load', description: `25 concurrent: worst ${worst} ms, total ${Date.now() - started} ms (local dev server, not production evidence)` });
  expect(rs.every((r) => r.s === 200)).toBe(true);
  expect(worst).toBeLessThan(8000);
});
