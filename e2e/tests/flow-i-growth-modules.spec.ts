import { expect, test } from '@playwright/test';
import { BASE_URLS } from '../playwright.config';
import { probeTenantProduct, withDatabase } from '../fixtures/environment';
import type { Page } from '@playwright/test';
import {
  openWeb,
  resolveTenant,
  signInToWeb,
  tenantCredentials,
  type TenantTarget,
} from '../fixtures/web-session';

/**
 * Flow I — every module a Growth-plan tenant is entitled to.
 *
 * The slice was chosen by the repository owner on 2026-08-29, and the reason it
 * is a good one is that it is *checkable* rather than a judgement about
 * importance: `plans.catalog.ts` states exactly what Growth grants.
 *
 *   employees · organization · leave · attendance · timesheets
 *   projects · recruitment · onboarding · documents · notifications · branding
 *
 * **Payroll is deliberately absent.** It is Enterprise-only. An earlier draft of
 * this flow had a payslip journey in it — a screen no Growth tenant can open,
 * which would have asserted an empty state or a 403 and reported it as coverage.
 * Reading the catalog removed a test that would have proved nothing.
 *
 * The four entitlements without a top-level route — organization, documents,
 * notifications, branding — are Flow J's, or are reached from a record. Which
 * is which is stated there rather than left to inference.
 *
 * **Every assertion is on a real element, never on the page having loaded.** A
 * `page.goto` that resolves proves the server answered; it does not prove the
 * screen rendered. `expect(heading).toBeVisible()` is the difference between
 * coverage and the appearance of it.
 */

/**
 * The Growth entitlements that have a route of their own, and the control that
 * proves each one rendered *its own* screen.
 *
 * `marker` is deliberately not a heading. The first run of this flow asserted
 * `getByRole('heading', { name: /attendance/i })` and failed on a page that had
 * rendered perfectly — because the tenant workspace shell puts a single
 * `<h1>Dashboard</h1>` on **every** screen (BUG-1887, found by this flow). The
 * module's own name appears on its view-switcher button instead.
 */
const GROWTH_MODULES = [
  { feature: 'employees', path: '/employees', marker: /all employees/i },
  { feature: 'leave', path: '/leaves', marker: /my leave requests/i },
  { feature: 'attendance', path: '/attendance', marker: /today's attendance/i },
  { feature: 'timesheets', path: '/timesheets', marker: /timesheet/i },
  { feature: 'projects', path: '/projects', marker: /project/i },
  { feature: 'recruitment', path: '/recruitment', marker: /recruit/i },
  { feature: 'onboarding', path: '/onboarding', marker: /onboard/i },
] as const;

/**
 * A screen that refused, and said why.
 *
 * Three of the seven refuse for this fixture user, and every one of them is
 * **correct**: projects and onboarding answer "Access denied" naming role,
 * permission set, business unit and tenant scope; timesheets answers "your user
 * account is not linked to an employee profile". A least-privileged user is
 * used on purpose (see `web-session.ts`), so meeting a refusal is the expected
 * outcome rather than a defect.
 *
 * What must never happen is a blank page, an unhandled crash, or a refusal that
 * does not explain itself — `apps/web/AGENTS.md` requires loading, error and
 * empty states on every data surface, and an unexplained refusal is the failure
 * this distinguishes from a legitimate one.
 */
const EXPLAINED_REFUSAL =
  /access denied|not linked to an employee profile|you do not have access/i;

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

test.describe('Flow I — the Growth plan, module by module', () => {
  for (const module of GROWTH_MODULES) {
    test(`I — ${module.feature} reaches an intentional state`, async () => {
      await openWeb(shared, BASE_URLS.web, tenant!, module.path);

      const main = shared.getByRole('main');
      await expect(main).toBeVisible({ timeout: 45_000 });

      /*
       * Either the module's own screen, or a refusal that explains itself.
       * Never a blank page and never an unhandled crash — which is the
       * assertion that has teeth, because both of those are what "the route
       * exists" hides.
       *
       * Asserting only the first would fail on three of seven for a
       * least-privileged user and would be reporting correct authorization as a
       * defect. Asserting only that something rendered would pass on a stack
       * trace.
       */
      const rendered = main.getByText(module.marker);
      const refused = main.getByText(EXPLAINED_REFUSAL);
      /*
       * `.first()` on the union, not on each side. Playwright resolves `a.or(b)`
       * against the whole page, so two already-first locators still hand it two
       * elements and it fails strict mode — which is a failure of the assertion,
       * not of the screen.
       */
      await expect(rendered.or(refused).first()).toBeVisible({
        timeout: 45_000,
      });

      // An unhandled Next.js error boundary is neither of those two.
      await expect(
        shared.getByText(/application error|a client-side exception/i),
      ).toHaveCount(0);
    });
  }

  test('I — a refusal names a reference somebody can quote to support', async () => {
    /*
     * The half of a refusal that makes it usable. "Access denied" alone sends
     * somebody to support with nothing; this product already prints an error
     * reference and what to check, and that is worth guarding — it is the
     * difference between a dead end and a support conversation.
     */
    await openWeb(shared, BASE_URLS.web, tenant!, '/projects');
    const main = shared.getByRole('main');
    const refused = await main
      .getByText(EXPLAINED_REFUSAL)
      .first()
      .isVisible()
      .catch(() => false);
    test.skip(
      !refused,
      'this fixture user can open projects, so there is no refusal to inspect',
    );

    await expect(main.getByText(/error reference/i)).toBeVisible();
    await expect(main.getByText(/what to check/i)).toBeVisible();
  });

  test('I — a module the plan does not entitle is not offered in navigation', async () => {
    /*
     * **This asserts a cosmetic property, and says so, because taking it for
     * enforcement would be the dangerous reading.**
     *
     * BUG-1952 — found by SESSION-0070's live Starter-plan pass, after this
     * test was written — establishes that plan entitlements gate *nothing*: the
     * only throwing entitlement primitive has zero call sites, and the one
     * consumer that exists hides sidebar links, fails open, and is skipped
     * entirely for the tenant's own administrator roles. The API serves every
     * unentitled module's endpoints normally.
     *
     * So a hidden link means the link is hidden. It does not mean the module is
     * unreachable, and `apps/web/AGENTS.md` is explicit that frontend gating is
     * UX only and every gated action must also be enforced server-side.
     *
     * The enforcement half is the `fixme` below. Leaving only this test would
     * have been worse than having no test: a green "not offered as if it were"
     * reads as an entitlement guarantee that does not exist.
     */
    const entitled = await withDatabase(async (client) => {
      // `key`, not `featureKey` — read from schema.prisma rather than guessed
      // from the catalog, which calls the same thing `enabledFeatureKeys`.
      const result = await client.query(
        `select f."key" from "TenantFeature" f
           where f."tenantId" = $1 and f."isEnabled" = true`,
        [tenant!.tenantId],
      );
      return result.rows.map((row: { key: string }) => row.key);
    });
    test.skip(
      entitled === null,
      'no database available to read this tenant’s entitlements',
    );
    test.skip(
      entitled!.includes('payroll'),
      'this tenant is entitled to payroll, so its absence is not the expected state',
    );

    await openWeb(shared, BASE_URLS.web, tenant!, '/');
    await expect(
      shared.getByRole('navigation').getByRole('link', { name: /payroll/i }),
    ).toHaveCount(0);
  });

  test.fixme(
    'I — a module the plan does not entitle is actually unreachable',
    async () => {
      /*
       * BUG-1952. The assertion that would matter, and it fails today.
       *
       * Navigating straight to an unentitled module must not serve it. A tenant
       * paying for Starter can currently open Payroll by typing the URL, and
       * the API answers its endpoints — which makes the plan tiers a
       * presentation detail rather than a commercial boundary.
       *
       * Written now, failing now, deliberately: when entitlement enforcement
       * lands this starts passing on its own, and until then the gap is visible
       * in the suite rather than only in a record.
       */
      await openWeb(shared, BASE_URLS.web, tenant!, '/payroll');
      await expect(
        shared
          .getByRole('main')
          .getByText(/not available on your plan|upgrade|not entitled/i)
          .first(),
      ).toBeVisible({ timeout: 45_000 });
    },
  );

  test('I — a list screen shows only this tenant’s records', async () => {
    /*
     * Cheap here, impossible in a unit test, and the single most important
     * invariant in this codebase — tenant isolation is enforced by convention
     * rather than by the database (`AGENTS.md`), so an observation from outside
     * is worth having.
     *
     * Compares what the browser shows against what the database says the tenant
     * has. A count is enough: a leak would show rows this tenant does not own.
     */
    const counts = await withDatabase(async (client) => {
      const mine = await client.query(
        'select count(*)::int as n from "Employee" where "tenantId" = $1 and "isDeleted" = false',
        [tenant!.tenantId],
      );
      const all = await client.query(
        'select count(*)::int as n from "Employee" where "isDeleted" = false',
      );
      return { mine: mine.rows[0].n as number, all: all.rows[0].n as number };
    });
    test.skip(counts === null, 'no database available to compare against');
    test.skip(
      counts!.all === counts!.mine,
      'only one tenant has employees, so this comparison cannot detect a leak',
    );

    await openWeb(shared, BASE_URLS.web, tenant!, '/employees');
    // The view-switcher, not a heading — every screen's h1 says "Dashboard"
    // (BUG-1950), so a heading assertion here would fail on a working page.
    await expect(shared.getByText(/all employees/i).first()).toBeVisible({
      timeout: 45_000,
    });

    const rows = await shared.getByRole('row').count();
    // Header rows and pagination make an exact match wrong; the assertion that
    // matters is that the screen cannot be showing every tenant's employees.
    expect(rows).toBeLessThanOrEqual(counts!.mine + 5);
  });
});
