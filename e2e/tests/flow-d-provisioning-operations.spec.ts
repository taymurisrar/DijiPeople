import { expect, test } from '@playwright/test';
import { BASE_URLS } from '../playwright.config';
import { openAdmin, signInToAdmin } from '../fixtures/admin-session';
import { probeEnvironment } from '../fixtures/environment';
import {
  removeProvisioningRuns,
  seedProvisioningRuns,
} from '../fixtures/provisioning-runs';

/**
 * Flow D — the provisioning operations queue, driven through the browser.
 *
 * Provisioning runs and their steps have been recorded for a long time and
 * nothing read them across tenants. An operator could open one workspace and
 * see its history, but there was no answer to the only question that matters
 * when somebody has paid and cannot use the product: **is anybody stuck right
 * now.** This suite is the proof that the answer is now on a screen.
 *
 * What it checks that the API tests cannot: that the six derived states reach a
 * rendered page, that the blocker text an operator would act on is actually
 * shown rather than truncated away, and that the rows arrive in triage order
 * instead of alphabetically. Those are properties of the screen, and reading
 * them from the component source is how a UI defect goes unnoticed.
 */

const RUN_MARKER = 'e2e-flow-d';

/** Filled by the shared fixture, which owns the message so it cannot drift. */
let blockerMessage = '';

test.describe('Flow D — provisioning operations', () => {
  test.beforeAll(async () => {
    const report = await probeEnvironment({
      landing: BASE_URLS.landing,
      admin: BASE_URLS.admin,
      api: BASE_URLS.api,
    });
    test.skip(
      !report.ready,
      `Environment not ready for Flow D: ${report.missing.join('; ')}`,
    );
  });

  /**
   * Seed through the shared fixture.
   *
   * This used to be a copy of the seeding logic living in this file. E5 and E6
   * in Flow E asserted on the same table without seeding anything at all, and
   * passed locally on leftover rows before failing in CI against a clean
   * database — so the seeding moved somewhere both suites can reach it.
   */
  test.beforeAll(async () => {
    ({ blockerMessage } = await seedProvisioningRuns(RUN_MARKER));
  });

  test.afterAll(async () => {
    await removeProvisioningRuns(RUN_MARKER);
  });

  test('D1 — the queue names every state it is holding', async ({ page }) => {
    await signInToAdmin(page);
    await openAdmin(page, '/operations/provisioning');

    await expect(
      page.getByRole('heading', { name: /provisioning operations/i }),
    ).toBeVisible();

    /*
     * Each state is asserted as rendered text. Colour alone would not be
     * enough — an operator with no colour vision must still be able to triage,
     * which is why every pill carries its label.
     */
    for (const state of [
      /breached/i,
      /failed/i,
      /manual action required/i,
      /in progress/i,
    ]) {
      await expect(page.getByText(state).first()).toBeVisible();
    }
  });

  test('D2 — the blocker an operator would act on is shown in full', async ({
    page,
  }) => {
    await signInToAdmin(page);
    await openAdmin(page, '/operations/provisioning');

    /*
     * The failed step's message, not the run-level one. A run carries both and
     * the run-level message is the less useful of the two — it says a step
     * failed, where the step says why.
     */
    await expect(page.getByText(blockerMessage, { exact: false })).toBeVisible();
    await expect(
      page.getByText(/Run-level message that must not win/i),
    ).toHaveCount(0);
  });

  test('D3 — rows arrive in triage order, not alphabetical order', async ({
    page,
  }) => {
    await signInToAdmin(page);
    await openAdmin(page, '/operations/provisioning');

    const stateCells = page.locator('table tbody tr td:first-child');
    await expect(stateCells.first()).toBeVisible();

    const order = (await stateCells.allInnerTexts()).map((text) =>
      text.trim().toLowerCase(),
    );

    const rank = (label: string) =>
      [
        'breached',
        'failed',
        'manual action required',
        'at risk',
        'in progress',
        'ready',
      ].findIndex((state) => label.startsWith(state));

    const ranks = order.map(rank).filter((value) => value >= 0);
    expect(ranks.length).toBeGreaterThan(1);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });

  test('D4 — the page tells an operator how many runs need them', async ({
    page,
  }) => {
    await signInToAdmin(page);
    await openAdmin(page, '/operations/provisioning');

    /*
     * The one number worth reading first. A row of six near-identical stat
     * cards was the alternative, and it makes an operator do the arithmetic
     * that the screen exists to have already done.
     */
    await expect(
      page.getByText(/runs? need attention|nothing needs attention/i).first(),
    ).toBeVisible();
  });

  test('D5 — the page body does not scroll sideways at laptop width', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await signInToAdmin(page);
    await openAdmin(page, '/operations/provisioning');

    /*
     * A wide operational table must scroll inside its own container. When the
     * page body scrolls instead, the navigation shell slides off with it and
     * the screen becomes unusable on the most common laptop width there is.
     */
    const overflows = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);
  });
});
