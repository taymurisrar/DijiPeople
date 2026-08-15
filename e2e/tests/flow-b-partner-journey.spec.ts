import { expect, test } from '@playwright/test';
import { BASE_URLS } from '../playwright.config';
import { openAdmin, signInToAdmin } from '../fixtures/admin-session';
import { probeEnvironment, RUN_ID, withDatabase } from '../fixtures/environment';

/**
 * Flow B — the partner journey, driven through the browser.
 *
 * Landing partner inquiry → Admin partner inquiry → qualification → agreement →
 * onboarding → approval → activation → referral link → referred lead.
 *
 * Two of these steps are known to be unreachable through the product today, and
 * this suite says so rather than routing around them:
 *
 *   - the partner inquiry and onboarding review screens have **no inbound
 *     link** anywhere in the admin app (BUG-0019), so a reviewer cannot reach
 *     them from navigation;
 *   - partner activation requires a fully signed partner agreement, and
 *     signature is an external surface.
 *
 * The reachability half is asserted directly, because a test that navigates by
 * typed URL would hide exactly the defect BUG-0019 records.
 */

const INQUIRY = {
  company: `Flow B Partners ${RUN_ID}`,
  firstName: 'Flowb',
  lastName: `Tester${RUN_ID}`,
  email: `flow-b-${RUN_ID}@example.test`,
};

test.describe('Flow B — partner journey', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    const report = await probeEnvironment(BASE_URLS);
    test.skip(
      !report.ready,
      `BROWSER_E2E = BLOCKED_INFRASTRUCTURE — missing: ${report.missing.join('; ')}`,
    );
  });

  test('B1 — a visitor submits the partner inquiry form', async ({ page }) => {
    await page.goto(`${BASE_URLS.landing}/partners`);

    const submit = page.getByRole('button', { name: /submit partner inquiry/i });
    await expect(submit).toBeVisible({ timeout: 30_000 });

    await page.getByLabel('Partner type').selectOption({ index: 1 });
    await page.getByLabel('Company name').fill(INQUIRY.company);
    await page.getByLabel('First name').fill(INQUIRY.firstName);
    await page.getByLabel('Last name').fill(INQUIRY.lastName);
    await page.getByLabel('Business email').fill(INQUIRY.email);
    await page.getByLabel('Phone').fill('+13125550199');
    await page.getByLabel('Country').fill('United States');
    await page
      .getByLabel('How would you work with DijiPeople?')
      .fill(`Browser E2E run ${RUN_ID}. Safe to delete.`);

    const consent = page.locator('input[name="consentAccepted"]');
    if (await consent.count()) await consent.first().check();

    await submit.click();

    /* The form reports a reference number in a role=status region on success. */
    await expect(page.locator('[role="status"]')).toBeVisible({ timeout: 30_000 });

    const rows = await withDatabase((client) =>
      client.query('select id, status from "PartnerInquiry" where email = $1', [
        INQUIRY.email,
      ]),
    );
    expect(
      rows?.rowCount,
      'the browser submission created exactly one PartnerInquiry',
    ).toBe(1);
  });

  test('B2 — the inquiry deduplicates on resubmission', async ({ page }) => {
    /*
     * PartnerInquiry deduplicates by submissionHash at the data layer, which is
     * the property the QA run cited as the reason this entity cannot race —
     * in contrast to CustomerAccount.leadId, which has no unique constraint
     * (ITEM-0005). Worth one browser assertion because it is the only public
     * form in the product with that protection.
     */
    await page.goto(`${BASE_URLS.landing}/partners`);
    await page.getByLabel('Partner type').selectOption({ index: 1 });
    await page.getByLabel('Company name').fill(INQUIRY.company);
    await page.getByLabel('First name').fill(INQUIRY.firstName);
    await page.getByLabel('Last name').fill(INQUIRY.lastName);
    await page.getByLabel('Business email').fill(INQUIRY.email);
    await page.getByLabel('Phone').fill('+13125550199');
    await page.getByLabel('Country').fill('United States');
    await page
      .getByLabel('How would you work with DijiPeople?')
      .fill(`Browser E2E run ${RUN_ID}. Safe to delete.`);
    const consent = page.locator('input[name="consentAccepted"]');
    if (await consent.count()) await consent.first().check();
    await page.getByRole('button', { name: /submit partner inquiry/i }).click();
    await expect(page.locator('[role="status"]')).toBeVisible({ timeout: 30_000 });

    const rows = await withDatabase((client) =>
      client.query('select id from "PartnerInquiry" where email = $1', [
        INQUIRY.email,
      ]),
    );
    expect(rows?.rowCount, 'an identical resubmission adds no second row').toBe(1);
  });

  test('B3 — the partner surfaces are reachable from admin navigation', async ({
    page,
  }) => {
    await signInToAdmin(page);
    await openAdmin(page, '/partners');
    await expect(page).toHaveURL(/\/partners/, { timeout: 45_000 });
  });

  /*
   * BUG-0019, asserted rather than worked around.
   *
   * `/partner-inquiries/[inquiryId]` and `/partner-onboarding/[applicationId]`
   * are bespoke review screens with no inbound link anywhere in the app. This
   * test navigates the way a reviewer would — from the partner surfaces — and
   * records what is reachable. It is written to pass on the fixed tree and to
   * be the regression coverage BUG-0019 currently has none of.
   */
  test('B4 — the submitted inquiry is discoverable where a reviewer looks', async ({
    page,
  }) => {
    const inquiry = await withDatabase((client) =>
      client.query(
        'select id from "PartnerInquiry" where email = $1 limit 1',
        [INQUIRY.email],
      ),
    );
    test.skip(!inquiry?.rowCount, 'B1 did not produce an inquiry to review');

    await signInToAdmin(page);
    await openAdmin(page, '/partner-inquiries');

    /*
     * The list route currently redirects to /partners?viewId=…, whose rows open
     * /partners/{partnerId} — a different entity from the one the detail page
     * loads. Recording the landing URL is the evidence for that finding.
     */
    const landedOn = new URL(page.url()).pathname + new URL(page.url()).search;
    test.info().annotations.push({
      type: 'BUG-0019',
      description: `/partner-inquiries landed on ${landedOn}`,
    });

    await expect(
      page.getByText(INQUIRY.company).first(),
      'the company that submitted an inquiry appears on the partner-inquiries surface',
    ).toBeVisible({ timeout: 45_000 });

    /*
     * Be precise about what the assertion above does and does not prove.
     *
     * It proves the company is *discoverable*. It does NOT prove the review
     * screen is reachable: `/partner-inquiries` redirects to
     * `/partners?viewId=partner-inquiries`, which lists **Partner** rows, and a
     * partner inquiry creates a Partner carrying the same company name — so the
     * name would appear even with the inquiry entirely unreachable. The row
     * opens `/partners/{partnerId}`, a different entity from the
     * `/partner-inquiries/{inquiryId}` review screen, which still has no
     * inbound link anywhere in the app.
     *
     * The assertion below is the one BUG-0019 is actually about, and it is
     * expected to fail until the runtime view is pointed at PartnerInquiry
     * rows. It is marked `fixme` rather than deleted so the gap stays visible
     * in every report instead of being quietly absent.
     */
    test.fixme(
      true,
      'BUG-0019 — the partner-inquiries view lists Partner rows, so no row opens the inquiry review screen.',
    );
    await expect(page.getByRole('link', { name: /review/i }).first()).toHaveAttribute(
      'href',
      /\/partner-inquiries\/[0-9a-f-]{36}/,
    );
  });
});
