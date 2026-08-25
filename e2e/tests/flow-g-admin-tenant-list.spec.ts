import { expect, test } from '@playwright/test';
import { BASE_URLS } from '../playwright.config';
import { openAdmin, signInToAdmin } from '../fixtures/admin-session';
import { probeEnvironment } from '../fixtures/environment';

/**
 * Flow G — the tenant list, as an operator actually sees it.
 *
 * This suite exists because of a specific report: *"Customers are showing on the
 * tenant page!!"* The tenant list was leading with the **Customer** column and
 * carrying no tenant name at all, so every row was addressed by somebody else's
 * name and the screen had stopped being a list of tenants.
 *
 * Nothing was broken in the sense anything could detect. The module definition
 * was correct, the deploy had landed, the API returned the right fields, and
 * 1,764 API tests plus 834 frontend tests were green. A saved table preference
 * — written when the module offered a different column set — was reapplied over
 * the definition and removed the identity column. `mergeVisibleColumns` honours
 * a hidden column on purpose, because "never offered" and "deliberately hidden"
 * are genuinely different states.
 *
 * **The gap this closes is not a missing assertion, it is a missing altitude.**
 * Every test in this repository that could have caught it reads the definition,
 * and the definition was right. Only a browser sees what the definition plus the
 * saved state plus the render actually produce, and until now nothing in the
 * pipeline opened an admin screen.
 *
 * So the assertions here are deliberately about **what is on screen**, not about
 * what the registry declares. A test that re-reads the registry would have
 * passed throughout the incident.
 */

test.describe('Flow G — the admin tenant list', () => {
  test.beforeAll(async () => {
    const report = await probeEnvironment({
      landing: BASE_URLS.landing,
      admin: BASE_URLS.admin,
      api: BASE_URLS.api,
    });
    test.skip(
      !report.ready,
      `Environment not ready for Flow G: ${report.missing.join('; ')}`,
    );
  });

  test('G1 — the list identifies each row by its own name', async ({ page }) => {
    await signInToAdmin(page);
    await openAdmin(page, '/tenants');

    await expect(
      page.getByRole('heading', { name: /^tenants$/i }),
    ).toBeVisible();

    /*
     * The regression, stated as the thing that was wrong: `Customer` led the
     * table and no name column existed.
     *
     * Compared by position rather than by presence. `Customer` is a legitimate
     * column here and must keep existing — the defect was that it came first,
     * with nothing before it.
     *
     * Empty headers are dropped before comparing, because the selection
     * checkbox occupies the real first column. Asserting on `headers.first()`
     * would have tested that checkbox and passed no matter what the rest of the
     * table did — a green test that proves nothing is worse than none.
     */
    const labels = (await page.getByRole('columnheader').allTextContents())
      .map((text) => text.trim())
      .filter(Boolean);

    const nameAt = labels.findIndex((label) => /^name$/i.test(label));
    const customerAt = labels.findIndex((label) => /^customer$/i.test(label));

    expect(nameAt, `Name column missing. Headers: ${labels.join(', ')}`).toBeGreaterThanOrEqual(0);
    expect(customerAt).toBeGreaterThanOrEqual(0);
    expect(nameAt, 'the name column must come before the customer column').toBeLessThan(customerAt);
    expect(labels[nameAt]).toBe(labels[0]);
  });

  test('G2 — the columns an operator triages by are all present', async ({
    page,
  }) => {
    await signInToAdmin(page);
    await openAdmin(page, '/tenants');

    /*
     * The default visible set. Each answers a question asked of this screen —
     * which workspace, whose, is it healthy, what are they paying for, which
     * environment, how big — and the list is not usable without them.
     *
     * `Customer` is asserted here too: it belongs on this list. The defect was
     * never that it appeared, only that it appeared *instead of* the name.
     */
    /*
     * Matched against the headers' text, not their accessible names.
     *
     * Each header also contains a resize handle labelled "Resize <column>
     * column", which contributes to the accessible name — so the header for
     * Name computes as "Name Resize Name column" and an anchored
     * `getByRole('columnheader', { name: /^name$/i })` never matches it. The
     * handle is correct to be labelled; the assertion was wrong to assume the
     * name was only the title.
     *
     * `allTextContents` returns the visible text alone, which is what an
     * operator reads and what G1 and G4 already compare on.
     */
    const labels = (await page.getByRole('columnheader').allTextContents())
      .map((text) => text.trim())
      .filter(Boolean);

    for (const expected of [
      /^name$/i,
      /^workspace$/i,
      /^customer$/i,
      /^status$/i,
      /^plan$/i,
      /^subscription$/i,
      /^environment$/i,
      /^employees$/i,
    ]) {
      expect(
        labels.some((label) => expected.test(label)),
        `expected a ${expected} column. Headers: ${labels.join(', ')}`,
      ).toBe(true);
    }
  });

  test('G3 — the identity column cannot be switched off', async ({ page }) => {
    await signInToAdmin(page);
    await openAdmin(page, '/tenants');

    await page.getByRole('button', { name: /columns/i }).click();

    /*
     * Offered, checked, and disabled — not hidden from the picker.
     *
     * Removing it from the list entirely would be tidier and worse: an operator
     * hunting for the missing "Name" column would find nothing and conclude it
     * had been dropped, which is the confusion this whole change exists to end.
     */
    const nameRow = page.locator('label', { hasText: /^name/i }).first();
    const nameCheckbox = nameRow.locator('input[type="checkbox"]');

    await expect(nameCheckbox).toBeChecked();
    await expect(nameCheckbox).toBeDisabled();

    /*
     * A column that IS the operator's to turn off, proving the guard is narrow.
     * If this were also disabled, `essential` would have been applied too
     * broadly and the picker would have stopped meaning anything.
     */
    const employeesRow = page
      .locator('label', { hasText: /^employees/i })
      .first();
    await expect(
      employeesRow.locator('input[type="checkbox"]'),
    ).toBeEnabled();
  });

  test('G4 — every row shows a name, not an empty identity cell', async ({
    page,
  }) => {
    await signInToAdmin(page);
    await openAdmin(page, '/tenants');

    /*
     * Locate the Name column by its header rather than assuming an index. The
     * selection checkbox occupies a column of its own, so "the first cell" is
     * the checkbox — a cell that always has a child and would satisfy a
     * not-empty assertion however broken the table was.
     */
    const headerCells = page.getByRole('columnheader');
    const labels = await headerCells.allTextContents();
    const nameColumn = labels.findIndex((label) => /^name$/i.test(label.trim()));
    expect(nameColumn, `Name column missing. Headers: ${labels.join(', ')}`).toBeGreaterThanOrEqual(0);

    const rows = page.getByRole('row');
    const count = await rows.count();

    /*
     * A header row and nothing else is a legitimate state on an empty
     * environment, and must not read as a pass by accident.
     */
    test.skip(count <= 1, 'No tenants in this environment to assert on.');

    /*
     * `displayName` is served as `displayName ?? name`, so a blank identity
     * cell means that fallback stopped working — the other way this screen
     * becomes unreadable while every column header is still correct.
     */
    for (let index = 1; index < Math.min(count, 6); index += 1) {
      const cell = rows.nth(index).getByRole('cell').nth(nameColumn);
      await expect(cell).not.toBeEmpty();
    }
  });
});
