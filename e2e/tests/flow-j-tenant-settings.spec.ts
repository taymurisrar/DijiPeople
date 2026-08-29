import { expect, test } from '@playwright/test';
import { BASE_URLS } from '../playwright.config';
import { probeTenantProduct } from '../fixtures/environment';
import type { Page } from '@playwright/test';
import {
  openWeb,
  resolveTenant,
  signInToWeb,
  tenantCredentials,
  type TenantTarget,
} from '../fixtures/web-session';
import {
  auditPage,
  blocking,
  describeViolations,
  scrollsSideways,
  VIEWPORTS,
} from '../fixtures/accessibility';

/**
 * Flow J — tenant settings, and the Growth entitlements that live inside it.
 *
 * The repository owner asked for "the settings module and other related
 * modules" alongside the Growth plan, and settings is where three of Growth's
 * eleven entitlements actually are: `organization`, `notifications` and
 * `branding` have no top-level route and are reached here. Covering the Growth
 * list without covering settings would have missed a quarter of it.
 *
 * Settings is also its own runtime — `app/(authenticated)/settings/_lib` with a
 * `[category]` dynamic route — so this is the second generated surface in the
 * product, after the module runtime Flow I exercises. One screen's coverage
 * here is disproportionately broad for the same reason.
 *
 * **`documents`, the fourth entitlement without a route, is not covered by this
 * flow and is not silently omitted either.** It is reached from an employee
 * record rather than from navigation, so covering it means a record-level
 * journey that this slice does not include. Stated here so a reader counting
 * eleven entitlements against ten tests finds the answer rather than assuming
 * an oversight.
 *
 * Accessibility follows Flow E's established policy without change: critical
 * and serious violations gate, moderate and minor are reported. A first audit
 * of a surface that has never had one surfaces a long tail, and failing on all
 * of it produces a suite nobody can act on — which gets ignored, and is worse
 * than no suite.
 */

/**
 * `marker`, not a heading naming the page.
 *
 * The first run of this flow asserted `heading: /settings/i` and failed on a
 * settings page that had rendered fine — the tenant workspace shell puts a
 * single `<h1>Dashboard</h1>` on every screen, settings included (BUG-1887,
 * found by this flow). The settings index calls itself "Configuration
 * workspace"; the category pages carry a "Configuration" sidebar.
 */
const SETTINGS_SURFACES = [
  { key: 'index', path: '/settings', marker: /configuration workspace/i },
  { key: 'organization', path: '/settings/organization', marker: /configuration/i },
  { key: 'branding', path: '/settings/branding', marker: /configuration/i },
  { key: 'notifications', path: '/settings/notifications', marker: /configuration/i },
] as const;

let tenant: TenantTarget | null = null;

/*
 * One sign-in for the whole file, on one page every test shares.
 *
 * Signing in per test meant roughly fifteen logins in five minutes and
 * `PublicRateLimitGuard` answered `429 RATE_LIMIT_EXCEEDED` partway through —
 * so tests that passed one run failed the next on a stuck `/login`, which reads
 * as a broken product and is not one. The throttle is correct; the fixture was
 * wrong to hammer it.
 *
 * A shared page rather than `test.use({ storageState })`: the saved-state file
 * does not exist when Playwright builds the first test's context, so that form
 * fails the first test of every file with `ENOENT`. This is explicit and has no
 * ordering subtlety.
 *
 * `serial` because the tests share one page — a failure part-way leaves the
 * browser somewhere the next test did not expect, and running on regardless
 * produces cascading failures that hide the first one.
 *
 * Flow H still signs in for real on every test, because that is the flow about
 * signing in, and a reused session is exactly what hides a BUG-0008.
 */
test.describe.configure({ mode: 'serial' });

let shared: Page;

test.beforeAll(async ({ browser }) => {
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

  const context = await browser.newContext();
  shared = await context.newPage();
  const landed = await signInToWeb(
    shared,
    BASE_URLS.web,
    tenant!,
    tenantCredentials()!,
  );
  test.skip(
    landed === 'picker',
    'this identity reaches several workspaces; set E2E_TENANT_SLUG to pin one',
  );
});

test.afterAll(async () => {
  await shared?.context().close();
});

test.describe('Flow J — tenant settings', () => {
  for (const surface of SETTINGS_SURFACES) {
    test(`J — settings ${surface.key} renders`, async () => {
      await openWeb(shared, BASE_URLS.web, tenant!, surface.path);

      /*
       * Scoped to the body, not to `main` — because on the category pages there
       * is no `main` to scope to (BUG-1951, found by this test waiting 45
       * seconds for a landmark that does not exist). The landmark requirement
       * has not been dropped; it is asserted separately below and marked
       * `fixme` against that record.
       */
      await expect(shared.getByText(surface.marker).first()).toBeVisible({
        timeout: 45_000,
      });
      await expect(
        shared.getByText(/application error|a client-side exception/i),
      ).toHaveCount(0);
    });
  }

  test.fixme(
    'J — every settings page has exactly one main landmark',
    async () => {
      /*
       * BUG-1951. `fixme` rather than deleted or rewritten, deliberately.
       *
       * 143 of 232 authenticated pages render no `main`, and neither layout
       * supplies one, so a page with no landmark offers no skip-to-content
       * target and cannot be navigated by landmark at all. Rewriting this to
       * assert the current behaviour would encode the defect as the
       * specification — which is the one thing a first test suite over an
       * unchecked app must not do.
       *
       * It says "exactly one" because the careless fix creates BUG-1421's
       * defect instead: adding a landmark to the layout without removing the 89
       * page-level ones gives those pages two.
       */
      await openWeb(shared, BASE_URLS.web, tenant!, '/settings/organization');
      await expect(shared.getByRole('main')).toHaveCount(1);
    },
  );

  /*
   * `fixme` against BUG-1986. This audit currently returns four violations, two
   * of them critical: five buttons with no discernible text, an unsupported
   * ARIA attribute, nested interactive controls, and a contrast failure on the
   * *current page* indicator — the element whose whole job is to say where you
   * are.
   *
   * Weakening the assertion to make it pass would turn the suite into a record
   * of what the product does instead of what it must do.
   */
  test.fixme('J — every settings control has an accessible name', async () => {
    /*
     * BUG-1423's shape, on the surface it was never checked against: runtime
     * form controls with no accessible name announce as blank to a screen
     * reader, so the form is unusable rather than merely awkward. It was fixed
     * and guarded in the admin console. Nothing has ever checked the tenant
     * product, which is the app most people actually use.
     */
    await openWeb(shared, BASE_URLS.web, tenant!, '/settings/organization');
    await expect(shared.getByText(/configuration/i).first()).toBeVisible({
      timeout: 45_000,
    });

    const violations = await auditPage(shared);
    const serious = blocking(violations);
    expect(
      serious,
      `Blocking accessibility violations on /settings/organization:\n${describeViolations(serious)}`,
    ).toHaveLength(0);
  });

  test.fixme('J — settings does not scroll sideways on a phone', async () => {
    /*
     * Asserted as a property rather than a screenshot, following Flow E: pixel
     * baselines generated on one operating system do not match another's
     * renderer and cannot gate CI, while "the body does not scroll sideways at
     * 390px" is true or false identically everywhere — and it is the assertion
     * that catches the defect that actually strands people on a phone.
     *
     * BUG-1668 records exactly this for tenant workspace pages and is deferred.
     * If this fails, that record has its reproduction.
     */
    // VIEWPORTS is an ordered array, not a keyed object; the phone case is the
    // one that strands people, so it is selected by name rather than by index.
    const phone = VIEWPORTS.find((viewport) => viewport.name === 'mobile')!;
    await shared.setViewportSize({ width: phone.width, height: phone.height });
    await openWeb(shared, BASE_URLS.web, tenant!, '/settings');
    await expect(shared.getByText(/configuration/i).first()).toBeVisible({
      timeout: 45_000,
    });

    /*
     * Currently fails, and that is a reproduction rather than a surprise.
     * BUG-1668 records "tenant workspace pages scroll horizontally at mobile
     * width" and is DEFERRED for want of one — it has one now, and this
     * assertion is what will tell us when it stops being true.
     */
    expect(
      await scrollsSideways(shared),
      'the settings page scrolls horizontally at 390px (BUG-1668)',
    ).toBe(false);
  });
});
