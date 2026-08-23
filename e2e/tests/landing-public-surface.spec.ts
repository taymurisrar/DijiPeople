import { expect, test, type Page } from '@playwright/test';

import { LEGAL_SLUGS, STATIC_ROUTES, TARGET, targetUp } from '../fixtures/landing-target';

/**
 * The public surface, asserted against a running deployment.
 *
 * Every test here is a GET, so this file is safe to point at production — and
 * is meant to be. Most of what can go wrong with a marketing site is only true
 * of the deployment people actually visit: a 500 on the front door, a plan card
 * quoting nothing, a soft 404 a crawler indexes as a real page. None of it is
 * provable from source.
 *
 * Point it somewhere else with `E2E_LANDING_URL`.
 */

test.beforeEach(async () => {
  test.skip(
    !(await targetUp()),
    `BROWSER_E2E = BLOCKED_INFRASTRUCTURE — landing not reachable at ${TARGET.landing}`,
  );
});

/** Errors the page itself produced, as opposed to ones the test caused. */
function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  return errors;
}

test.describe('every public route renders', () => {
  for (const route of STATIC_ROUTES) {
    test(`${route.name} answers 200 with one h1, a title and a description`, async ({ page }) => {
      const errors = collectPageErrors(page);
      const response = await page.goto(`${TARGET.landing}${route.path}`, {
        waitUntil: 'networkidle',
      });

      expect(response?.status(), `${route.path} status`).toBe(200);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page).toHaveTitle(/DijiPeople/);

      /*
       * A description is a functional requirement on an indexed page, not
       * polish: it is the copy under the search result. `apps/landing/AGENTS.md`
       * says so explicitly.
       */
      const description = page.locator('meta[name="description"]');
      await expect(description).toHaveCount(1);
      expect((await description.getAttribute('content'))?.length ?? 0).toBeGreaterThan(20);

      expect(errors, `${route.path} console errors`).toEqual([]);
    });
  }
});

test.describe('legal routes', () => {
  /*
   * The route exists whether or not a version is published — an inbound link to
   * /legal/privacy must not break every time a document is rotated. So these
   * assert the route resolves, never that it has content.
   */
  for (const slug of LEGAL_SLUGS) {
    test(`/legal/${slug} resolves whether or not a version is published`, async ({ page }) => {
      const response = await page.goto(`${TARGET.landing}/legal/${slug}`, {
        waitUntil: 'domcontentloaded',
      });
      expect(response?.status()).toBe(200);
      await expect(page.locator('h1')).toHaveCount(1);
    });
  }

  /*
   * BUG-0907. `notFound()` was already called for an unknown slug and could not
   * take effect: `app/loading.tsx` puts a Suspense boundary above every route,
   * so Next flushed the shell with a 200 before this segment ran. The URL
   * answered `200 OK` and sat on "Loading" forever — a soft 404 a crawler
   * indexes as a real page.
   *
   * Fixed with `dynamicParams = false`, which moves the refusal to the routing
   * layer where `generateStaticParams` already lists every legitimate slug.
   */
  test('an unknown legal slug is a real 404, not a 200 stuck on the loading shell', async ({
    page,
  }) => {
    const response = await page.goto(`${TARGET.landing}/legal/not-a-real-document`, {
      waitUntil: 'domcontentloaded',
    });

    expect(response?.status(), 'a soft 404 gets indexed as a real page').toBe(404);
    await expect(page.locator('body')).not.toContainText('Loading');
  });

  test('an unmatched path is a 404 that still carries the site chrome', async ({ page }) => {
    const response = await page.goto(`${TARGET.landing}/no-such-page`, {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status()).toBe(404);
    await expect(page.locator('header nav')).toBeVisible();
  });
});

test.describe('crawler contract', () => {
  test('robots.txt allows crawling and names a sitemap', async ({ request }) => {
    const response = await request.get(`${TARGET.landing}/robots.txt`);
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toMatch(/User-Agent:\s*\*/i);
    expect(body).toMatch(/Sitemap:\s*https?:\/\//i);
  });

  test('sitemap.xml lists the marketing routes and only published legal ones', async ({
    request,
  }) => {
    const response = await request.get(`${TARGET.landing}/sitemap.xml`);
    expect(response.status()).toBe(200);
    const body = await response.text();

    for (const path of ['/plans', '/features', '/about', '/contact', '/subscribe']) {
      expect(body, `sitemap should list ${path}`).toContain(path);
    }

    /*
     * A sitemap is an invitation to index. Inviting a crawler to a document that
     * says "not published yet" earns a search result that helps nobody, so the
     * legal entries are derived from what is actually published rather than
     * from the static route list.
     */
    const listedLegal = [...body.matchAll(/\/legal\/([a-z-]+)/g)].map((m) => m[1]);
    for (const slug of listedLegal) {
      expect(LEGAL_SLUGS as readonly string[]).toContain(slug);
    }
  });
});

test.describe('security headers', () => {
  test('the front door carries the baseline headers', async ({ request }) => {
    const response = await request.get(`${TARGET.landing}/`);
    const headers = response.headers();

    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBeTruthy();
    expect(headers['permissions-policy']).toBeTruthy();

    /*
     * Report-Only on purpose — `securityHeadersForApp` emits the policy for
     * collection rather than enforcement while it is being tuned. Asserting the
     * enforcing header instead would fail against a deliberate decision, so
     * this asserts the one that is actually set and will need updating when the
     * policy is promoted.
     */
    expect(headers['content-security-policy-report-only']).toBeTruthy();
  });
});

test.describe('navigation', () => {
  test('every header and footer link resolves', async ({ page, request }) => {
    await page.goto(`${TARGET.landing}/`, { waitUntil: 'networkidle' });

    const hrefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('header a, footer a'))
        .map((a) => a.getAttribute('href') ?? '')
        .filter((href) => href.startsWith('/') && !href.startsWith('/#')),
    );

    expect(hrefs.length).toBeGreaterThan(5);

    const seen = new Set<string>();
    for (const href of hrefs) {
      if (seen.has(href)) continue;
      seen.add(href);
      const response = await request.get(`${TARGET.landing}${href}`);
      expect(response.status(), `${href} from site chrome`).toBeLessThan(400);
    }
  });

  test('the current page is announced with aria-current', async ({ page }) => {
    await page.goto(`${TARGET.landing}/plans`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.locator('header nav a[aria-current="page"][href="/plans"]'),
    ).toHaveCount(1);
  });
});
