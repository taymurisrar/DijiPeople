import { test as base, expect, type Page } from '@playwright/test';
import { loadQaEnv, type Role } from './env';

export const env = loadQaEnv();

/** Every navigation carries the tenant slug, as the app itself does on localhost. */
// Production resolves the workspace from the host (<slug>.<root>), so QA does the
// same: QA_WEB_URL is http://<slug>.localhost:PORT and no `?tenant=` is added.
// A `?tenant=` query is forwarded by some pages to the API, which rejects it
// (forbidNonWhitelisted) — a localhost-only artefact, not a product defect.
export const tenantPath = (path: string) =>
  new URL(env.QA_WEB_URL).hostname.startsWith(`${env.QA_TENANT_SLUG}.`)
    ? path
    : `${path}${path.includes('?') ? '&' : '?'}tenant=${env.QA_TENANT_SLUG}`;

/**
 * Request pacing. One employee form (new / record) makes ~100 server-side API calls (22x /locations, 26x /tenant-settings/resolved ...,
 * DP-QA-025) and the per-user read limit is 600 / min; a 429 on a page load drops the user on the error screen (DP-QA-024). After loading
 * such a page the suite waits so that, whatever else ran in the same minute, it never self-inflicts that failure.
 */
const HEAVY = /\/employees\/(new|[0-9a-f-]{36})/;
let lastHeavy = 0;
export async function pace(path: string) {
  if (!HEAVY.test(path)) return;
  const wait = lastHeavy + 25_000 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHeavy = Date.now();
  await new Promise((r) => setTimeout(r, 10_000)); // let the burst of lookups finish before the test continues
}

export async function gotoTenant(page: Page, path: string) {
  const response = await page.goto(tenantPath(path), { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await pace(path);
  return response;
}
export const authFile = (role: Role) => `./golive-results/.auth/${role}.json`;

type Diagnostics = { consoleErrors: string[]; failedRequests: string[]; allow: (re: RegExp) => void };

/**
 * Diagnostics are collected for EVERY test and fail it when a console error or
 * a 5xx appears, unless the scenario explicitly allows it. A page that "loads"
 * while its console is red has not passed.
 */
export const test = base.extend<{ diag: Diagnostics }>({
  diag: [
    async ({ page }, use, testInfo) => {
      const allowed: RegExp[] = [];
      const consoleErrors: string[] = [];
      const failedRequests: string[] = [];
      const failed4xx: string[] = [];
      // CSP *Report-Only* notices about script eval come from `next dev` HMR in Firefox/WebKit; they are an artefact of the dev server
      // (production CSP is release gate B8), so they are not counted as page errors.
      const devOnly = /Content[- ]Security[- ]Policy/i;
      page.on('console', (m) => m.type() === 'error' && !devOnly.test(m.text()) && consoleErrors.push(m.text().slice(0, 300)));
      page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 300)}`));
      page.on('response', (r) => {
        if (r.status() >= 400 && r.status() < 500 && r.status() !== 401) failed4xx.push(`${r.status()} ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 140)}`);
        if (r.status() >= 500) failedRequests.push(`${r.status()} ${r.request().method()} ${r.url().slice(0, 200)}`);
      });
      await use({ consoleErrors, failedRequests, allow: (re) => allowed.push(re) });
      const bad = [...consoleErrors, ...failedRequests].filter((l) => !allowed.some((re) => re.test(l)));
      if (consoleErrors.length || failedRequests.length) {
        await testInfo.attach('diagnostics.json', { body: JSON.stringify({ consoleErrors, failedRequests, failed4xx }, null, 1), contentType: 'application/json' });
      }
      expect.soft(bad, 'unexpected console errors / 5xx responses').toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };
