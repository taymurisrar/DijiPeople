import { defineConfig, devices } from '@playwright/test';

/**
 * Browser end-to-end configuration for DijiPeople.
 *
 * This repository had **no browser tooling of any kind** until this file: no
 * Playwright, no Cypress, no Puppeteer, and `apps/web` / `apps/admin` jest
 * running in a node environment with no jsdom. `BROWSER_E2E =
 * BLOCKED_INFRASTRUCTURE` appeared in every QA run's Known Limitations, and it
 * was load-bearing — it is why no UI defect in this repository could be
 * *proven* fixed, only read from code. See ITEM-0001.
 *
 * Deliberate choices, each of which was a real decision:
 *
 * **Its own workspace, not `apps/admin/e2e`.** The primary commercial journey
 * starts on the landing site (port 3000) and finishes in platform admin (port
 * 3002). A suite living inside one app would either be misfiled for half its
 * scenarios or would grow a second copy in the other app.
 *
 * **No `webServer` block.** Playwright can start servers, but this stack needs
 * a migrated and seeded PostgreSQL before the API will boot, and Playwright has
 * no way to express that ordering. Making it look automatic would produce a
 * suite that fails for environmental reasons and reads as a product failure —
 * the exact thing the QA context warns about. `docs/development/browser-e2e.md`
 * states the prerequisites, and the suite skips loudly when they are absent
 * rather than failing.
 *
 * **Report-only in CI, initially.** The stability criteria for promoting it to
 * the required gate are in `docs/development/browser-e2e.md`. A suite that goes
 * red for environmental reasons on arrival trains people to ignore CI, which is
 * the failure the pipeline exists to prevent.
 */

/** Every URL the suite drives, resolvable per environment. */
const BASE_URLS = {
  landing: process.env.E2E_LANDING_URL ?? 'http://localhost:3000',
  web: process.env.E2E_WEB_URL ?? 'http://localhost:3001',
  admin: process.env.E2E_ADMIN_URL ?? 'http://localhost:3002',
  api: process.env.E2E_API_URL ?? 'http://localhost:4000',
} as const;

export { BASE_URLS };

export default defineConfig({
  testDir: './tests',
  /*
   * Serial by default. The commercial journeys mutate shared platform state —
   * leads, customers, tenants — and two workers racing through provisioning
   * would produce failures that look like product defects and are not.
   * Parallelism here is a correctness question, not a speed one.
   */
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  /*
   * One retry in CI only, and none locally.
   *
   * The justification is narrow and worth stating because "retries: 2" is the
   * usual thoughtless default: CI runners contend for I/O against a database
   * container, and a Next.js dev-mode first paint can exceed a default timeout
   * on a cold runner. A retry covers that. It does NOT cover a flaky product,
   * and a test that only passes on retry must be investigated, not tolerated —
   * `retry #1` is visible in the HTML report for exactly that reason.
   */
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI
    ? [
        ['list'],
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
        ['json', { outputFile: 'playwright-report/results.json' }],
      ]
    : [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  outputDir: './test-results',
  use: {
    baseURL: BASE_URLS.admin,
    /*
     * Evidence on failure and nothing on success. A trace per test would make
     * the artifact unusable; a trace only on the first retry would mean a
     * locally-failing test produces nothing, because retries are 0 locally.
     */
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
