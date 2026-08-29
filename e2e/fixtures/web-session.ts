import { expect, type Browser, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withDatabase } from './environment';

/**
 * Signing in to the tenant product, and finding a tenant to sign in to.
 *
 * `apps/web` is the application every employee of every tenant uses, and until
 * now no browser test had ever opened it (ITEM-0034). Two things make its
 * sign-in different from admin's, and both are why this is a separate fixture
 * rather than a parameter on `signInToAdmin`:
 *
 * **The tenant has to be named.** `apps/web` resolves a workspace from the
 * host — `<slug>.<root>` — or, on localhost where there are no subdomains,
 * from a `?tenant=` parameter. `buildTenantPortalUrl` in
 * `apps/web/lib/tenant-url.ts` is the code that decides, and this fixture
 * follows it rather than inventing a second convention.
 *
 * **One identity may reach several workspaces.** Since TASK-0009's contract
 * phase, `User.identityId` is required and one `Identity` can own a `User` row
 * in more than one tenant. A sign-in may therefore land on a workspace picker
 * instead of a dashboard, and that is a correct outcome rather than a failure.
 */

export type TenantTarget = {
  tenantId: string;
  slug: string;
  name: string;
};

export type TenantSignIn = {
  email: string;
  password: string;
};

/**
 * Credentials for an ordinary tenant user, from the environment.
 *
 * **Deliberately not a platform admin, and not a tenant owner if it can be
 * helped.** A browser flow that signs in as a privileged user asserts what the
 * privileged path renders and hides exactly the authorization defects this
 * product most needs caught — the whole `OWN` / `TEAM` / `BUSINESS_UNIT`
 * distinction is invisible to somebody who can see everything.
 *
 * No fallback password, for the same reason `platformCredentials` has none: a
 * default ends up committed the first time somebody makes it work.
 */
export function tenantCredentials(): TenantSignIn | null {
  const email = process.env.E2E_TENANT_USER_EMAIL?.trim();
  const password = process.env.E2E_TENANT_USER_PASSWORD;
  return email && password ? { email, password } : null;
}

/**
 * A tenant this suite may sign in to, read from the database rather than
 * assumed.
 *
 * `E2E_TENANT_SLUG` names one explicitly. Without it, the newest ACTIVE tenant
 * is used — which is what `seed-demo` leaves behind — and `null` when there is
 * none, so the caller skips with a message instead of failing on an empty
 * page.
 */
export async function resolveTenant(): Promise<TenantTarget | null> {
  const wanted = process.env.E2E_TENANT_SLUG?.trim();
  const rows = await withDatabase(async (client) => {
    const result = wanted
      ? await client.query(
          'select id, slug, name from "Tenant" where slug = $1 limit 1',
          [wanted],
        )
      : await client.query(
          `select id, slug, name from "Tenant"
             where status = 'ACTIVE' and slug is not null
             order by "createdAt" desc limit 1`,
        );
    return result.rows;
  });
  if (!rows?.length) return null;
  const row = rows[0] as { id: string; slug: string; name: string };
  return { tenantId: row.id, slug: row.slug, name: row.name };
}

/**
 * The URL `apps/web` itself would compose for a workspace.
 *
 * Composed the way `buildTenantPortalUrl` composes it, on purpose. A fixture
 * that built the address its own way would keep passing while the app's version
 * was broken — which is precisely the shape of BUG-1644, where a bundle sent
 * every customer to a host with no DNS record.
 */
export function tenantUrl(webBase: string, slug: string, path = '/login') {
  const base = new URL(webBase);
  const isLocal = base.hostname === 'localhost' || base.hostname === '127.0.0.1';
  const root = process.env.E2E_TENANT_ROOT_DOMAIN?.trim();

  if (!isLocal && root) {
    return `${base.protocol}//${slug}.${root.replace(/^\.+|\.+$/g, '')}${path}`;
  }
  const url = new URL(path, base);
  url.searchParams.set('tenant', slug);
  return url.toString();
}

/**
 * Sign in to a tenant workspace through the browser.
 *
 * Real form submission, never a cookie injection — the same reasoning as
 * `signInToAdmin`: the point of this suite is that the UI works, and a login
 * path is one that has broken in production before.
 *
 * Returns where the sign-in landed. A workspace picker is a legitimate landing
 * place for an identity that reaches more than one tenant, so the caller is
 * told which happened rather than the fixture asserting one of them.
 */
export async function signInToWeb(
  page: Page,
  webBase: string,
  tenant: TenantTarget,
  credentials: TenantSignIn,
): Promise<'workspace' | 'picker'> {
  await page.goto(tenantUrl(webBase, tenant.slug), {
    waitUntil: 'domcontentloaded',
  });
  /*
   * Hydration, not politeness. The submit handler is attached by React after
   * the input exists, so a click that lands first does nothing and the
   * assertion below times out reporting a sign-in failure that never happened.
   * `signInToAdmin` carries the same wait for the same reason.
   */
  await page.waitForLoadState('networkidle').catch(() => undefined);

  await page
    .getByLabel(/email/i)
    .first()
    .fill(credentials.email);
  await page
    .getByLabel(/password/i)
    .first()
    .fill(credentials.password);
  await page
    .getByRole('button', { name: /sign in|log in/i })
    .first()
    .click();

  await expect(page).not.toHaveURL(/\/login/, { timeout: 45_000 });
  await page.waitForLoadState('networkidle').catch(() => undefined);

  return /\/workspace\/choose/.test(page.url()) ? 'picker' : 'workspace';
}

/**
 * Navigate to a tenant route and wait for it to settle.
 *
 * The tenant slug travels with the URL on localhost, so every navigation has to
 * carry it — dropping it mid-suite lands on the generic login and looks like a
 * session that expired.
 */
export async function openWeb(
  page: Page,
  webBase: string,
  tenant: TenantTarget,
  path: string,
) {
  await page.goto(tenantUrl(webBase, tenant.slug, path), {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

/**
 * Where a signed-in tenant session is cached for a run.
 *
 * One file per process, in the OS temp directory — never in the repository,
 * because it holds a live session cookie.
 */
export const TENANT_STATE_PATH = join(
  mkdtempSync(join(tmpdir(), 'dijipeople-e2e-')),
  'tenant-state.json',
);

/**
 * Sign in once, and reuse the session for every test in a file.
 *
 * **This exists because the first version did not, and the suite was flaky.**
 * Signing in per test meant roughly fifteen logins in five minutes, and
 * `PublicRateLimitGuard` correctly answered `429 RATE_LIMIT_EXCEEDED` partway
 * through — so tests that had passed a run earlier failed on a stuck `/login`,
 * which reads exactly like a broken product and is not one.
 *
 * The rate limit is not the problem; a login endpoint that did **not** throttle
 * would be the finding. The fixture was wrong to hammer it.
 *
 * Flow H still signs in for real on every test, and should: it is the flow that
 * tests signing in, and BUG-0008 — a session-expired link pointing at a route
 * that only exported POST — is the kind of defect a cached session hides. Three
 * logins there is well inside the limit. Flows I and J are not about
 * authentication and use this instead.
 */
export async function cacheTenantSession(
  browser: Browser,
  webBase: string,
  tenant: TenantTarget,
  credentials: TenantSignIn,
): Promise<void> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await signInToWeb(page, webBase, tenant, credentials);
    await context.storageState({ path: TENANT_STATE_PATH });
  } finally {
    await context.close();
  }
}

