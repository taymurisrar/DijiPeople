import { expect, test } from '@playwright/test';
import { BASE_URLS } from '../playwright.config';
import { probeTenantProduct } from '../fixtures/environment';
import {
  openWeb,
  resolveTenant,
  signInToWeb,
  tenantCredentials,
  tenantUrl,
  type TenantTarget,
} from '../fixtures/web-session';

/**
 * Flow H — the first browser test ever to open `apps/web`.
 *
 * The tenant product is 254 pages and 207 client components, used by every
 * employee of every tenant, and until 2026-08-29 no test had rendered a single
 * one of them (ITEM-0034). It is also the only app in the monorepo with no
 * alternative: its `jest.config.js` is `testEnvironment: node` with no jsdom,
 * so nothing in it can be tested through a DOM by any other mechanism.
 *
 * This flow covers getting in, which everything else depends on. Two properties
 * are worth stating because they are decisions rather than mechanics.
 *
 * **The sign-in is a real form submission.** The same reasoning as Flow A's:
 * BUG-0008 was a session-expired link pointing at a route that exported only
 * POST, and it stranded every operator. A suite that injects a cookie would not
 * have caught it and would not catch its successor.
 *
 * **A workspace picker is a pass, not a failure.** Since TASK-0009's contract
 * phase one `Identity` can own a `User` row in several tenants, so a sign-in may
 * legitimately land on `/workspace/choose`. Asserting a dashboard would fail on
 * exactly the multi-workspace case the identity work exists to support.
 */

let tenant: TenantTarget | null = null;

test.beforeAll(async () => {
  // Only what these flows use: the tenant product, the API behind it, and a
  // disposable database. Landing and admin are neither opened nor required.
  const environment = await probeTenantProduct({
    web: BASE_URLS.web,
    api: BASE_URLS.api,
  });
  test.skip(
    !environment.ready,
    `environment not ready: ${environment.missing.join('; ')}`,
  );
  test.skip(
    !tenantCredentials(),
    'E2E_TENANT_USER_EMAIL / E2E_TENANT_USER_PASSWORD are unset (no default exists by design)',
  );
  tenant = await resolveTenant();
  test.skip(
    !tenant,
    'no ACTIVE tenant with a slug exists in the seeded database — run seed-demo, or set E2E_TENANT_SLUG',
  );
});

test.describe('Flow H — a tenant user reaches their workspace', () => {
  test('H1 — the tenant login page is served for a real workspace', async ({
    page,
  }) => {
    await page.goto(tenantUrl(BASE_URLS.web, tenant!.slug), {
      waitUntil: 'domcontentloaded',
    });

    /*
     * A password field, not merely a 200. The composed address resolving is
     * necessary and not sufficient — BUG-1644 shipped a host that answered and
     * was not the workspace, and a status check would have called that healthy.
     */
    await expect(page.getByLabel(/password/i).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test('H2 — the login field has an accessible name and an autocomplete hint', async ({
    page,
  }) => {
    /*
     * BUG-1655 exactly: the tenant login password field had no accessible name
     * and no autocomplete hint, so a screen reader announced it as blank and no
     * password manager could fill it. It was fixed and guarded by a unit test
     * reading the component. This asserts the rendered page, which is where the
     * defect was actually experienced.
     */
    await page.goto(tenantUrl(BASE_URLS.web, tenant!.slug), {
      waitUntil: 'domcontentloaded',
    });
    const password = page.getByLabel(/password/i).first();
    await expect(password).toBeVisible({ timeout: 30_000 });
    await expect(password).toHaveAttribute('autocomplete', /password/i);
  });

  test('H3 — signing in leaves the login page', async ({ page }) => {
    const landed = await signInToWeb(
      page,
      BASE_URLS.web,
      tenant!,
      tenantCredentials()!,
    );
    expect(['workspace', 'picker']).toContain(landed);
  });

  test('H4 — the authenticated shell renders navigation', async ({ page }) => {
    const landed = await signInToWeb(
      page,
      BASE_URLS.web,
      tenant!,
      tenantCredentials()!,
    );
    test.skip(
      landed === 'picker',
      'this identity reaches several workspaces and stopped at the picker; H5 covers that',
    );

    await openWeb(page, BASE_URLS.web, tenant!, '/');
    // A navigation landmark, not a specific link: which modules appear depends
    // on the tenant's plan, and asserting one would make this flow plan-specific
    // when Flow I is the place that belongs.
    await expect(page.getByRole('navigation').first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test('H5 — an identity reaching several workspaces is offered the choice', async ({
    page,
  }) => {
    const landed = await signInToWeb(
      page,
      BASE_URLS.web,
      tenant!,
      tenantCredentials()!,
    );
    test.skip(
      landed !== 'picker',
      'this identity reaches one workspace, so there is no choice to offer',
    );

    /*
     * The capability TASK-0009 existed to deliver, asserted from the outside.
     * Its e2e suites prove the model and the endpoint; this proves a person can
     * actually use it.
     */
    await expect(page).toHaveURL(/\/workspace\/choose/);
    await expect(page.getByRole('link').first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
