import { expect, test } from '@playwright/test';
import { BASE_URLS } from '../playwright.config';
import { probePublicSurface } from '../fixtures/environment';

/**
 * Flow F — the public surface's discoverability contract.
 *
 * The landing site is how DijiPeople is found. Nothing checked that its pages
 * carry a title, a description, a canonical URL or a single `h1`, that
 * `robots.txt` and the sitemap are served, or that the sitemap lists URLs that
 * actually resolve — a sitemap naming a 404 is worse than no sitemap, because a
 * crawler trusts it.
 *
 * Deliberately **not** gated on the database. `probeEnvironment` demands a
 * disposable PostgreSQL, a platform session and all three apps, because the
 * journeys it guards write rows and sign in. These pages are served to
 * anonymous visitors and this suite only reads their markup. Demanding more
 * than a suite uses turns a green run into an unnoticed skip.
 *
 * One thing this suite cannot check here: WP-10 requires unpublished legal
 * documents to carry `noindex`, and whether a document is published is a
 * database fact. That assertion belongs with the DB-backed suites and is called
 * out rather than quietly omitted.
 */

const INDEXABLE_PAGES = [
  { name: 'home', url: '/' },
  { name: 'plans', url: '/plans' },
  { name: 'about', url: '/about' },
  { name: 'contact', url: '/contact' },
  { name: 'partners', url: '/partners' },
  { name: 'features', url: '/features' },
];

test.describe('Flow F — public SEO and metadata', () => {
  test.beforeAll(async () => {
    const report = await probePublicSurface(BASE_URLS.landing);
    test.skip(!report.ready, `Landing not reachable: ${report.missing.join('; ')}`);
  });

  for (const surface of INDEXABLE_PAGES) {
    test(`F1 — ${surface.name} carries the metadata a crawler needs`, async ({
      page,
    }) => {
      const response = await page.goto(`${BASE_URLS.landing}${surface.url}`, {
        waitUntil: 'domcontentloaded',
      });
      expect(
        response?.status(),
        `${surface.name} should be served`,
      ).toBeLessThan(400);

      /* A title is what a search result is made of. */
      const title = (await page.title()).trim();
      expect(title.length, `${surface.name} has no title`).toBeGreaterThan(5);

      const description = await page
        .locator('head meta[name="description"]')
        .first()
        .getAttribute('content');
      expect(
        (description ?? '').trim().length,
        `${surface.name} has no meta description`,
      ).toBeGreaterThan(20);

      /*
       * Exactly one h1. Zero leaves both crawlers and screen-reader users
       * without a page heading; several make the page's subject ambiguous.
       */
      await expect(
        page.locator('h1'),
        `${surface.name} should have exactly one h1`,
      ).toHaveCount(1);

      /* The document language, which screen readers use to pick a voice. */
      const lang = await page.locator('html').getAttribute('lang');
      expect((lang ?? '').trim().length, `${surface.name} has no lang`).toBeGreaterThan(1);
    });
  }

  test('F2 — no indexable page is accidentally marked noindex', async ({
    page,
  }) => {
    /*
     * WP-10 deliberately marks *unpublished legal documents* noindex. That is
     * correct and is not what this checks: a marketing page carrying noindex is
     * invisible to search, and it is the kind of defect that is silent until
     * somebody wonders why the site never ranks.
     */
    const offenders: string[] = [];

    for (const surface of INDEXABLE_PAGES) {
      await page.goto(`${BASE_URLS.landing}${surface.url}`, {
        waitUntil: 'domcontentloaded',
      });
      /*
       * Count before reading. A Playwright locator auto-waits for its element,
       * so `getAttribute` on a tag that legitimately may not exist blocks until
       * the test times out — and a trailing `.catch()` never runs, because a
       * timeout is not a rejection it sees. Most pages here carry no robots
       * meta at all, which is the correct state and was the case that hung.
       */
      const robotsTag = page.locator('head meta[name="robots"]').first();
      const robots =
        (await robotsTag.count()) > 0
          ? await robotsTag.getAttribute('content')
          : null;

      if (robots && /noindex/i.test(robots)) {
        offenders.push(`${surface.name} (${robots})`);
      }
    }

    expect(offenders).toEqual([]);
  });

  test('F3 — titles distinguish one page from another', async ({ page }) => {
    /*
     * A site where every page shares one title is a site whose search results
     * are unusable. Checked across pages rather than per page, because a single
     * page cannot know it is a duplicate.
     */
    const titles = new Map<string, string>();

    for (const surface of INDEXABLE_PAGES) {
      await page.goto(`${BASE_URLS.landing}${surface.url}`, {
        waitUntil: 'domcontentloaded',
      });
      titles.set(surface.name, (await page.title()).trim());
    }

    const seen = new Map<string, string[]>();
    for (const [name, title] of titles) {
      seen.set(title, [...(seen.get(title) ?? []), name]);
    }

    const duplicated = [...seen.entries()]
      .filter(([, names]) => names.length > 1)
      .map(([title, names]) => `"${title}" shared by ${names.join(', ')}`);

    expect(duplicated).toEqual([]);
  });

  test('F4 — robots.txt is served and does not block the whole site', async ({
    request,
  }) => {
    const response = await request.get(`${BASE_URLS.landing}/robots.txt`);
    expect(response.status()).toBeLessThan(400);

    const body = await response.text();
    expect(body.trim().length).toBeGreaterThan(0);

    /*
     * `Disallow: /` under a wildcard agent takes the entire site out of search.
     * It is a one-character difference from `Disallow:`, which blocks nothing.
     */
    const blanketBlock = /User-agent:\s*\*[\s\S]*?Disallow:\s*\/\s*$/im.test(body);
    expect(blanketBlock, `robots.txt blocks the whole site:\n${body}`).toBe(false);
  });

  test('F5 — the sitemap is served and every URL in it resolves', async ({
    request,
  }) => {
    const response = await request.get(`${BASE_URLS.landing}/sitemap.xml`);
    expect(response.status()).toBeLessThan(400);

    const body = await response.text();
    const urls = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) =>
      match[1].trim(),
    );

    expect(urls.length, 'the sitemap lists no URLs').toBeGreaterThan(0);

    /*
     * A sitemap naming a 404 is worse than no sitemap: a crawler trusts it and
     * spends its budget on pages that do not exist. Each entry is fetched
     * against the running site rather than pattern-matched.
     */
    const broken: string[] = [];
    for (const url of urls) {
      const path = new URL(url).pathname;
      const page = await request.get(`${BASE_URLS.landing}${path}`);
      if (page.status() >= 400) broken.push(`${path} → ${page.status()}`);
    }

    expect(broken, `sitemap entries that do not resolve:\n${broken.join('\n')}`).toEqual(
      [],
    );
  });
});
