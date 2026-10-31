import { defineConfig, devices } from '@playwright/test';
import { loadQaEnv } from './golive/fixtures/env';

/**
 * Go-live QA configuration for the tenant web app (SESSION-0129).
 *
 * Separate from `playwright.config.ts` on purpose: that suite drives landing +
 * admin commercial journeys against shared state; this one drives ONE isolated
 * tenant on a throwaway database, with per-role sessions and three engines.
 * Everything it needs comes from the gitignored `.env.qa.local`; see
 * docs/qa/go-live/QA-RUNBOOK.md.
 */
const env = loadQaEnv();

export default defineConfig({
  testDir: './golive',
  outputDir: './golive-results/artifacts',
  // Serial: scenarios mutate one tenant, and parallel workers would make
  // duplicate-prevention and count assertions race each other.
  fullyParallel: false,
  workers: 1,
  retries: 0, // no hidden flakiness; rerun failures explicitly (npm run qa:rerun)
  timeout: 180_000, // login retries on 429 (20 / 10 min limiter) can take minutes in hooks
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: './golive-report', open: 'never' }],
    ['json', { outputFile: './golive-results/results.json' }],
  ],
  use: {
    baseURL: env.QA_WEB_URL,
    ignoreHTTPSErrors: true, // local self-signed TLS front (tools/tls-proxy.cjs) used for WebKit
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
  },
  projects: [
    { name: 'setup', testMatch: /setup\/.*\.setup\.ts/ },
    {
      name: 'chromium',
      testMatch: /tests\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
    {
      name: 'firefox',
      testMatch: /tests\/.*\.spec\.ts/,
      use: { ...devices['Desktop Firefox'] },
      dependencies: ['setup'],
      grep: /@xbrowser/,
    },
    {
      name: 'webkit',
      testMatch: /tests\/.*\.spec\.ts/,
      use: { ...devices['Desktop Safari'] },
      dependencies: ['setup'],
      grep: /@xbrowser/,
    },
    {
      name: 'mobile',
      testMatch: /tests\/.*\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
      dependencies: ['setup'],
      grep: /@responsive/,
    },
    {
      name: 'tablet',
      testMatch: /tests\/.*\.spec\.ts/,
      use: { ...devices['iPad (gen 7)'], browserName: 'chromium' },
      dependencies: ['setup'],
      grep: /@responsive/,
    },
  ],
});
