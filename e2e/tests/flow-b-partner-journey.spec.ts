import { expect, test, type Page } from '@playwright/test';
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

/**
 * Fill the public partner inquiry form.
 *
 * Shared by B1 and B2 deliberately. Both previously carried their own copy of
 * the selectors, and both copies were wrong in the same way — written against
 * label text this form has never had:
 *
 *   'Partner type'                        → 'How would you like to partner with DijiPeople?'
 *   'Company name'                        → 'Company / Organization name'
 *   'Business email'                      → 'Work email'
 *   'Phone'                               → 'Phone number'
 *   'Country' + `.fill()`                 → 'Country / Region', which is a <select>
 *   'How would you work with DijiPeople?' → the message textarea, whose label differs again
 *
 * `getByLabel` matches the accessible name, so none of those resolved and
 * `selectOption` sat until its 20s timeout — deterministically, on every run and
 * every retry. Two copies of a selector list is how they drift apart together;
 * one helper is the actual fix.
 *
 * Labels are matched by regex rather than exact string because two of them
 * contain a typographic apostrophe (`&rsquo;`), which is easy to get wrong in
 * source and invisible in a diff.
 */
async function fillPartnerInquiry(page: Page) {
  await page
    .getByLabel(/How would you like to partner with DijiPeople/i)
    .selectOption({ index: 1 });
  await page.getByLabel(/Company \/ Organization name/i).fill(INQUIRY.company);
  await page.getByLabel(/First name/i).fill(INQUIRY.firstName);
  await page.getByLabel(/Last name/i).fill(INQUIRY.lastName);
  await page.getByLabel(/Work email/i).fill(INQUIRY.email);
  await page.getByLabel(/Phone number/i).fill('+13125550199');
  await page.getByLabel(/Country \/ Region/i).selectOption({ index: 1 });
  await page
    .getByLabel(/Tell us how you.{0,3}d like to work with DijiPeople/i)
    .fill(`Browser E2E run ${RUN_ID}. Safe to delete.`);

  /*
   * `consentAccepted` carries the `required` attribute, so leaving it unchecked
   * fails native form validation and the submit never reaches the API — with
   * nothing surfaced to the test beyond a later assertion timing out. Checked
   * unconditionally rather than behind an `if (count())`, because a form that
   * no longer has the field is a change this test should notice, not skip past.
   */
  await page.locator('input[name="consentAccepted"]').first().check();
}

/**
 * Assert the submission was **accepted**, not merely answered.
 *
 * The form renders success and failure into the same `role="status"` region, so
 * `toBeVisible()` on it passes for "Reference PI-123" and for "website must be a
 * URL address" alike. That is how BUG-0048 stayed invisible here: the API was
 * rejecting every submission, this assertion passed, and the failure surfaced
 * three statements later as a row count of 0 — with nothing in the message to
 * say why.
 *
 * Asserting the reference number makes the test fail at the point of failure and
 * puts the server's own words in the report.
 */
async function expectInquiryAccepted(page: Page) {
  const status = page.locator('[role="status"]');
  await expect(status).toBeVisible({ timeout: 30_000 });

  const shown = (await status.textContent().catch(() => null)) ?? 'no status text';
  await expect(status, `the form answered: ${shown}`).toContainText(/Reference/i, {
    timeout: 15_000,
  });
}

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

    await fillPartnerInquiry(page);

    await submit.click();

    await expectInquiryAccepted(page);

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
    await expect(
      page.getByRole('button', { name: /submit partner inquiry/i }),
    ).toBeVisible({ timeout: 30_000 });

    await fillPartnerInquiry(page);

    await page.getByRole('button', { name: /submit partner inquiry/i }).click();
    await expectInquiryAccepted(page);

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
