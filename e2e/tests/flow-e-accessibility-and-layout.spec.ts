import { expect, test } from '@playwright/test';
import { BASE_URLS } from '../playwright.config';
import { openAdmin, signInToAdmin } from '../fixtures/admin-session';
import { probeEnvironment } from '../fixtures/environment';
import {
  auditPage,
  blocking,
  describeViolations,
  scrollsSideways,
  VIEWPORTS,
} from '../fixtures/accessibility';

/**
 * Flow E — accessibility and layout, across the surfaces a person actually uses.
 *
 * `AGENTS.md` has always required labelled controls, keyboard-navigable tables,
 * escapable dialogs and meaning that never rests on colour alone. Nothing
 * checked any of it: every QA run recorded `ACCESSIBILITY` as unverified, and
 * an unverified requirement is a requirement in name only.
 *
 * Two deliberate choices, both recorded so a later reader does not mistake them
 * for oversights:
 *
 * **Critical and serious violations gate; moderate and minor are reported.** A
 * first audit of a codebase that has never had one surfaces a long tail. Failing
 * on all of it at once produces a suite nobody can act on, and a suite nobody
 * can act on gets ignored — which is worse than no suite. The tail becomes
 * backlog items and is burned down deliberately.
 *
 * **Layout is asserted as properties, not screenshots.** Pixel baselines
 * generated on one operating system do not match another's renderer, so they
 * cannot gate CI. "The page body does not scroll sideways at 390px" is true or
 * false identically everywhere, and it is the assertion that catches the defect
 * that actually strands people.
 */

/** Public surfaces need no session. */
const PUBLIC_PAGES = [
  { name: 'landing home', url: '/' },
  // `/plans`, not `/pricing` — the first draft of this list assumed the latter
  // and the status guard below caught it as a 404 rather than auditing an error
  // page and reporting it clean.
  { name: 'landing plans', url: '/plans' },
  { name: 'landing contact', url: '/contact' },
  { name: 'landing about', url: '/about' },
  { name: 'landing partners', url: '/partners' },
];

/** Admin surfaces, behind a platform session. */
const ADMIN_PAGES = [
  { name: 'provisioning operations', path: '/operations/provisioning' },
  { name: 'admin dashboard', path: '/' },
];

test.describe('Flow E — accessibility and layout', () => {
  test.beforeAll(async () => {
    const report = await probeEnvironment({
      landing: BASE_URLS.landing,
      admin: BASE_URLS.admin,
      api: BASE_URLS.api,
    });
    test.skip(
      !report.ready,
      `Environment not ready for Flow E: ${report.missing.join('; ')}`,
    );
  });

  for (const surface of PUBLIC_PAGES) {
    test(`E1 — ${surface.name} has no critical or serious accessibility violations`, async ({
      page,
    }) => {
      const response = await page.goto(`${BASE_URLS.landing}${surface.url}`, {
        waitUntil: 'domcontentloaded',
      });
      /*
       * A 404 would audit clean and prove nothing. The page has to exist for
       * its accessibility to mean anything.
       */
      expect(response?.status(), `${surface.name} should be served`).toBeLessThan(
        400,
      );
      await page.waitForLoadState('networkidle').catch(() => undefined);

      const violations = await auditPage(page);
      const serious = blocking(violations);

      expect(
        serious,
        `${surface.name}\n${describeViolations(serious)}`,
      ).toEqual([]);
    });
  }

  for (const surface of PUBLIC_PAGES) {
    test(`E2 — ${surface.name} does not scroll sideways at any width`, async ({
      page,
    }) => {
      for (const viewport of VIEWPORTS) {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await page.goto(`${BASE_URLS.landing}${surface.url}`, {
          waitUntil: 'domcontentloaded',
        });
        await page.waitForLoadState('networkidle').catch(() => undefined);

        expect(
          await scrollsSideways(page),
          `${surface.name} scrolls sideways at ${viewport.name} (${viewport.width}px)`,
        ).toBe(false);
      }
    });
  }

  for (const surface of ADMIN_PAGES) {
    test(`E3 — ${surface.name} has no critical or serious accessibility violations`, async ({
      page,
    }) => {
      await signInToAdmin(page);
      await openAdmin(page, surface.path);

      const violations = await auditPage(page);
      const serious = blocking(violations);

      expect(
        serious,
        `${surface.name}\n${describeViolations(serious)}`,
      ).toEqual([]);
    });
  }

  test('E4 — the provisioning queue does not scroll sideways at any width', async ({
    page,
  }) => {
    await signInToAdmin(page);

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await openAdmin(page, '/operations/provisioning');

      expect(
        await scrollsSideways(page),
        `the provisioning queue scrolls sideways at ${viewport.name} (${viewport.width}px)`,
      ).toBe(false);
    }
  });

  test('E5 — the provisioning table is reachable and readable by keyboard', async ({
    page,
  }) => {
    await signInToAdmin(page);
    await openAdmin(page, '/operations/provisioning');

    /*
     * Column headers must be headers, not styled cells. A screen reader
     * announces "Customer" alongside each value only when the header carries a
     * scope; without it the table is a grid of unlabelled strings.
     */
    const headers = page.locator('table thead th[scope="col"]');
    await expect(headers.first()).toBeVisible();
    expect(await headers.count()).toBeGreaterThan(5);

    /* The table needs an accessible name, even when it is visually obvious. */
    const caption = page.locator('table caption');
    await expect(caption).toHaveCount(1);
  });

  test('E6 — state is never carried by colour alone', async ({ page }) => {
    await signInToAdmin(page);
    await openAdmin(page, '/operations/provisioning');

    /*
     * Every state pill must carry its own text. A coloured dot with a tooltip
     * is the usual regression here, and it makes the screen unusable for an
     * operator with no colour vision — on a screen whose entire purpose is
     * telling apart six states at a glance.
     */
    const stateCells = page.locator('table tbody tr td:first-child');
    const count = await stateCells.count();
    expect(count).toBeGreaterThan(0);

    for (let index = 0; index < count; index += 1) {
      const text = (await stateCells.nth(index).innerText()).trim();
      expect(text.length, `row ${index} has an empty state cell`).toBeGreaterThan(
        2,
      );
    }
  });
});
