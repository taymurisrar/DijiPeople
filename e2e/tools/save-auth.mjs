/**
 * Sign in once and save the session, so an agent driving the browser through
 * MCP does not sign in again on every look.
 *
 * WHY THIS IS SEPARATE FROM THE SUITE
 *
 * `fixtures/admin-session.ts` signs in through the real login form on purpose —
 * that path has broken in production before (BUG-0008) and a suite that skipped
 * it would not have caught it. That reasoning applies to a *test*. It does not
 * apply to an agent that wants to look at the tenants list: paying a full login
 * for every screenshot is a cost with no evidence attached, and an agent that
 * has to re-authenticate mid-review loses the thread of what it was checking.
 *
 * So: sign in once here, through the same real form, and hand the resulting
 * storage state to the MCP browser. The suite keeps its own login coverage.
 *
 * WHAT THIS WRITES, AND WHY IT IS NOT COMMITTED
 *
 * `e2e/.auth/<app>.json` contains live session cookies. It is a credential in
 * every sense that matters — anyone holding it is signed in as that operator
 * until it expires. `e2e/.gitignore` excludes the directory, and this script
 * refuses to run against anything but a local origin so a production session
 * cannot end up in a file on disk by a mistyped flag.
 *
 *   node e2e/tools/save-auth.mjs                       # admin, localhost:3002
 *   node e2e/tools/save-auth.mjs --app web             # tenant product
 *   node e2e/tools/save-auth.mjs --base http://localhost:3002
 *
 * Credentials come from the environment, as everywhere else in this suite:
 * E2E_PLATFORM_ADMIN_EMAIL / E2E_PLATFORM_ADMIN_PASSWORD. There is no fallback
 * password by design.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const E2E_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : argv[index + 1];
};

const APPS = {
  admin: { port: 3002, loginPath: '/login' },
  web: { port: 3001, loginPath: '/login' },
};

const app = flag('app', 'admin');
if (!APPS[app]) {
  console.error(`Unknown --app "${app}". Expected one of: ${Object.keys(APPS).join(', ')}`);
  process.exit(2);
}

const base = flag('base', `http://localhost:${APPS[app].port}`);

/*
 * Fail closed on anything that is not local.
 *
 * The suite's own database guard takes the same shape and for the same reason:
 * this file is pointed at other environments by a flag, and the cost of being
 * wrong is a live session for a real operator sitting in a file. A staging or
 * production session is never worth the convenience.
 */
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(base)) {
  console.error(`Refusing to save a session for a non-local origin: ${base}`);
  console.error('This writes live session cookies to disk. Local origins only.');
  process.exit(2);
}

const email = process.env.E2E_PLATFORM_ADMIN_EMAIL?.trim();
const password = process.env.E2E_PLATFORM_ADMIN_PASSWORD;
if (!email || !password) {
  console.error('Missing E2E_PLATFORM_ADMIN_EMAIL / E2E_PLATFORM_ADMIN_PASSWORD.');
  console.error('No fallback password exists by design — see docs/development/browser-e2e.md.');
  process.exit(2);
}

const outputDir = resolve(E2E_ROOT, '.auth');
const output = resolve(outputDir, `${app}.json`);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

try {
  await page.goto(base + APPS[app].loginPath, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  /*
   * Settle before touching the form. The submit handler is attached by React
   * hydration, which lands after the inputs exist — clicking earlier submits
   * nothing and looks exactly like a rejected password. Tolerant of a network
   * that never idles, because that is a reason to proceed, not to fail.
   */
  await page.waitForLoadState('networkidle').catch(() => undefined);

  /* By label, not by CSS class — the classes are Tailwind utility strings that
   * change on any restyle, and a selector on them would report a restyle as a
   * broken login. Same policy as fixtures/admin-session.ts. */
  await page.getByLabel('Email', { exact: false }).first().fill(email);
  await page.getByLabel('Password', { exact: false }).first().fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).first().click();

  await page.waitForURL((url) => !/\/login/.test(url.pathname), { timeout: 45_000 });

  mkdirSync(outputDir, { recursive: true });
  const state = await context.storageState();
  writeFileSync(output, JSON.stringify(state, null, 2), 'utf8');

  const cookies = state.cookies?.length ?? 0;
  console.log(`Saved ${app} session — ${cookies} cookie(s) → e2e/.auth/${app}.json`);
  console.log('Point the MCP browser at it with:');
  console.log(`  --storage-state e2e/.auth/${app}.json`);
  console.log('This file is a credential. It is gitignored; do not move it out of e2e/.auth/.');
} catch (error) {
  /*
   * Say which of the three it was. "Sign-in failed" sends people to check a
   * password when the server was not running, which is the common case.
   */
  console.error(`Could not sign in to ${app} at ${base}.`);
  console.error(error instanceof Error ? error.message : String(error));
  console.error('');
  console.error('Check, in this order:');
  console.error(`  1. Is the ${app} app running on ${base}?`);
  console.error('  2. Is the API running, migrated and seeded?');
  console.error('  3. Do those credentials exist in this database? (npm run seed:admin)');
  process.exitCode = 1;
} finally {
  await browser.close();
}
