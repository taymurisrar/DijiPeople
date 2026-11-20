import { expect, request, test, type BrowserContext, type Page } from '@playwright/test';
import { BASE_URLS } from '../playwright.config';
import { withDatabase } from '../fixtures/environment';
import { TARGET } from '../fixtures/landing-target';
import { signInToWeb, tenantUrl } from '../fixtures/web-session';
import { mainOf,
  OWNER_PASSWORD,
  TAG,
  approveInDialog,
  attemptTenantLogin,
  awaitProvisioned,
  buyGrowthToInvoice,
  cleanTagged,
  createChecker,
  fillStable,
  findGrowthOffer,
  newBuyer,
  openClaimDialog,
  orderState,
  platformOperator,
  provisionBankMethod,
  rejectInDialog,
  requireBankTransferEnvironment,
  runWizardToVerification,
  scalar,
  signInToAdminAs,
  submitClaimInBrowser,
  taggedResidue,
  SYNTHETIC_RECEIPT,
  type GrowthOffer,
  type PlatformOperator,
} from '../fixtures/bank-transfer';

/**
 * Flow Q — the Growth plan, bought by bank transfer, end to end in a real browser.
 *
 * landing pricing -> Growth -> five-step wizard -> email verification -> bank
 * details -> the customer reports a payment with a synthetic receipt -> a
 * platform operator verifies it in the admin console -> subscription ACTIVE on
 * Growth -> tenant provisioned -> activation email recorded -> the owner follows
 * the activation link, sets a password and signs in to the tenant app.
 *
 * Nothing here moves money. The receiving account, the receipt, the amounts and
 * every reference are synthetic and tagged with RUN_TAG, and `afterAll` removes
 * exactly those rows and then asserts that nothing tagged remains.
 *
 * ## Prerequisites the suite creates itself
 *
 * - A second platform operator (the checker), through `POST /platform-users`.
 * - A bank-transfer payment method for the market that carries the Growth price,
 *   with a receiving account entered by the maker and approved by the checker.
 *   The product's two-person rule is on that account (who may direct customer
 *   money); the suite exercises it rather than working around it.
 *
 * ## What the CI browser job must provide
 *
 * `SECRET_ENCRYPTION_KEY` (bank details are stored encrypted), `OUTBOX_WORKER_ENABLED=true`
 * (provisioning is dispatched from the outbox) and `EXPOSE_DEV_AUTH_LINKS=true`
 * (the only way to read an activation link when the mail provider is the CONSOLE sink).
 */

const MINUTES = 60_000;
let maker: PlatformOperator;
let checker: PlatformOperator;
let offer: GrowthOffer;
let configId = '';
let checkerContext: BrowserContext;
let checkerPage: Page;
let statementCounter = 0;

const statementRef = () => `STMT-${TAG}-${++statementCounter}`;
const expectedTotal = () => (Number(offer.unitAmount) * 25).toFixed(2);

async function landingApi() {
  return request.newContext({ baseURL: TARGET.landing });
}

async function activationEmails(email: string) {
  return scalar<number>(
    `select count(*)::int as n from "EmailDeliveryLog" where "eventCode" = 'AUTH_ACCOUNT_ACTIVATION' and recipient = $1`,
    [email],
  );
}

async function claimIdFor(orderId: string, status?: string) {
  const state = await orderState(orderId);
  const claim = status ? state.claims.filter((c) => c.status === status).at(-1) : state.claims.at(-1);
  expect(claim, `a ${status ?? ''} claim should exist for the order`).toBeTruthy();
  return claim!.id;
}

async function approveByApi(orderId: string, ref: string, claimStatus = 'PENDING_VERIFICATION') {
  const claimId = await claimIdFor(orderId, claimStatus);
  return checker.call('POST', `/super-admin/payments/bank-transfers/${claimId}/approve`, {
    bankStatementReference: ref,
    receivedAmount: expectedTotal(),
    currency: offer.currency,
  });
}

async function newCustomerPage(browser: import('@playwright/test').Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

test.describe.configure({ mode: 'serial' });

test.describe('Flow Q — Growth plan, bank transfer, browser end to end', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(3 * MINUTES);
    await requireBankTransferEnvironment();
    maker = await platformOperator(process.env.E2E_PLATFORM_ADMIN_EMAIL!, process.env.E2E_PLATFORM_ADMIN_PASSWORD!);
    checker = await createChecker(maker);
    offer = await findGrowthOffer();
    ({ configId } = await provisionBankMethod(maker, checker, offer));
    checkerContext = await browser.newContext();
    checkerPage = await checkerContext.newPage();
    await signInToAdminAs(checkerPage, checker.email, checker.password);
  });

  test.afterAll(async () => {
    test.setTimeout(3 * MINUTES);
    await checkerContext?.close();
    await cleanTagged();
    expect(await taggedResidue(), 'nothing tagged with this run may remain').toEqual({});
  });

  test('Q1 — a customer buys Growth by bank transfer and ends up signed in to a Growth workspace', async ({
    browser,
  }) => {
    test.setTimeout(8 * MINUTES);
    const buyer = newBuyer('hp');
    const { context, page } = await newCustomerPage(browser);

    await test.step('landing -> Growth -> wizard -> verified email -> bank invoice', async () => {
      const { orderId, reference } = await buyGrowthToInvoice(page, buyer);
      test.info().annotations.push({ type: 'order', description: orderId });
      const main = mainOf(page);
      await expect(main).toContainText(`Pay USD ${expectedTotal()}`);
      await expect(main).toContainText(`QA Test Bank ${TAG}`);
      await expect(main).toContainText('SYNTHETIC TEST ACCOUNT');

      const before = await orderState(orderId);
      expect(before.status).toBe('PENDING_PAYMENT');
      expect(before.tenantId, 'no tenant exists before payment is verified').toBeNull();
      expect(before.claims).toEqual([]);
      expect(Number(before.totalAmount).toFixed(2)).toBe(expectedTotal());
      expect(await scalar(`select count(*)::int from "SubscriptionOrder" where id = $1 and "ownerEmailVerifiedAt" is not null`, [orderId])).toBe(1);

      await test.step('the customer reports a payment with a synthetic receipt', async () => {
        await submitClaimInBrowser(page, `QAREF-${TAG}-hp`);
        const claimed = await orderState(orderId);
        expect(claimed.claims.map((c) => c.status)).toEqual(['PENDING_VERIFICATION']);
        expect(claimed.status, 'a customer claim never activates anything').toBe('PENDING_PAYMENT');
        expect(await scalar(`select count(*)::int from "BankTransferEvidence" where "claimId" = $1`, [claimed.claims[0].id])).toBe(1);
      });

      await test.step('the checker verifies the credit in the admin console and approves', async () => {
        const dialog = await openClaimDialog(checkerPage, buyer.company);
        await expect(dialog).toContainText(reference);
        await expect(dialog).toContainText(/pending verification/i);
        await expect(dialog).toContainText(`receipt-${TAG}.png`);
        await approveInDialog(dialog, statementRef());
        await expect(checkerPage.getByText(/approved\. the order is confirmed/i)).toBeVisible({ timeout: 30_000 });
      });

      await test.step('subscription ACTIVE on Growth, tenant provisioned', async () => {
        const done = await awaitProvisioned(orderId);
        expect(done.claims.map((c) => c.status)).toEqual(['APPROVED']);
        const reviewer = await scalar<string>(`select "reviewedById" from "BankTransferClaim" where id = $1`, [done.claims[0].id]);
        expect(reviewer, 'the claim was decided by the checker, not the maker').toBe(checker.userId);
        expect(reviewer).not.toBe(maker.userId);

        const subscription = await withDatabase(async (c) =>
          (
            await c.query(
              `select s.status, p.key, s."purchasedSeats", s."tenantId" from "Subscription" s
                 join "Plan" p on p.id = s."planId" where s."tenantId" = $1`,
              [done.tenantId],
            )
          ).rows,
        );
        expect(subscription).toHaveLength(1);
        expect(subscription![0]).toMatchObject({ status: 'ACTIVE', key: 'growth', purchasedSeats: 25, tenantId: done.tenantId });
        expect(await scalar(`select count(*)::int from "Subscription" where "tenantId" = $1`, [done.tenantId])).toBe(1);
        expect(await scalar<string>(`select name from "Tenant" where id = $1`, [done.tenantId])).toBe(buyer.company);

        // Self-service checkouts are provisioned by the outbox, not through the operator
        // provisioning-run queue (which only records operator-started runs), so the proof is the
        // order's public onboarding status, the tenant list in the admin console and the customer's page.
        const status = await (await fetch(`${TARGET.api}/public/onboarding/${orderId}/status`)).json();
        expect(status.state).toBe('READY');
        await checkerPage.goto(`${BASE_URLS.admin}/tenants`, { waitUntil: 'domcontentloaded' });
        const tenantRow = checkerPage.getByRole('row').filter({ hasText: buyer.company }).first();
        await expect(tenantRow).toBeVisible({ timeout: 45_000 });
        await expect(tenantRow).toContainText(/active/i);

        // The customer's own page now offers the way in.
        await page.reload();
        await expect(mainOf(page)).toContainText('Continue to your workspace');
      });

      await test.step('payment-received and activation emails are recorded', async () => {
        await expect
          .poll(() => activationEmails(buyer.email), { message: 'the owner activation email should be recorded', timeout: 60_000 })
          .toBe(1);
        const activation = await withDatabase(async (c) =>
          (
            await c.query(
              `select status, "providerType", "tenantId" from "EmailDeliveryLog"
                where "eventCode" = 'AUTH_ACCOUNT_ACTIVATION' and recipient = $1`,
              [buyer.email],
            )
          ).rows[0],
        );
        // A CONSOLE sink (local/CI) logs and discards, which the log records as NOT_DELIVERED: that is
        // the sink working as designed. A FAILED row would be the product failing to send.
        expect(activation).toBeTruthy();
        expect(activation!.status).not.toBe('FAILED');
        const received = await scalar<string>(
          `select status from "PlatformOutboundEmail" where "eventCode" = 'SUBSCRIPTION_PAYMENT_RECEIVED' and recipient = $1`,
          [buyer.email],
        );
        expect(received).toBe('SENT');
        expect(await scalar<string>(`select status from "User" where email = $1`, [buyer.email])).toBe('INVITED');
      });

      await test.step('the owner follows the activation link, sets a password and signs in', async () => {
        const tenantId = (await orderState(orderId)).tenantId!;
        const userId = await scalar<string>(`select id from "User" where email = $1 and "tenantId" = $2`, [buyer.email, tenantId]);
        // The mailed token is only stored hashed and the local sink discards the message, so the
        // platform operator re-issues the invitation and the API hands the link back in dev mode.
        const reissued = await maker.call('POST', `/platform/tenants/${tenantId}/access/${userId}/resend-invitation`);
        expect(reissued.status).toBeLessThan(300);
        const link = String(reissued.body.activationLink ?? '');
        expect(link, 'EXPOSE_DEV_AUTH_LINKS=true is required to read an activation link from a CONSOLE sink').toContain('token=');

        // The mailed link points at the tenant's own hostname (`<slug>.<root domain>`), which has no
        // DNS record on a local stack; the token is what matters, so it is opened on the local web origin.
        const token = new URL(link).searchParams.get('token')!;
        await page.goto(`${tenantUrl(BASE_URLS.web, buyer.slug, '/activate')}&token=${token}`, { waitUntil: 'domcontentloaded' });
        await expect(page.getByText(`Work email: ${buyer.email}`)).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText(`Workspace: ${buyer.company}`)).toBeVisible();
        await fillStable(page.getByLabel('Set password', { exact: true }), OWNER_PASSWORD);
        await fillStable(page.getByLabel('Confirm password', { exact: true }), OWNER_PASSWORD);
        await page.getByRole('button', { name: 'Activate account' }).click();
        await expect(page.getByText(/your account is active/i)).toBeVisible({ timeout: 30_000 });
        await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
        expect(await scalar<string>(`select status from "User" where id = $1`, [userId])).toBe('ACTIVE');

        const outcome = await signInToWeb(page, BASE_URLS.web, { tenantId, slug: buyer.slug, name: buyer.company }, { email: buyer.email, password: OWNER_PASSWORD });
        expect(outcome).toBe('workspace');
      });

      await test.step('the workspace carries Growth entitlements, and not Enterprise ones', async () => {
        const nav = page.getByRole('navigation');
        await expect(nav.getByRole('link', { name: /recruitment/i }).first()).toBeVisible({ timeout: 30_000 });
        await expect(nav.getByRole('link', { name: /timesheets/i }).first()).toBeVisible();
        await expect(nav.getByRole('link', { name: /payroll/i })).toHaveCount(0);
      });
    });
    await context.close();
  });

  test('Q2 — the maker of a receiving account cannot also be its checker', async () => {
    const account = await maker.call('POST', `/super-admin/billing/payment-methods/${configId}/accounts`, {
      bankName: `QA Test Bank ${TAG} second`,
      accountTitle: `QA Test Co ${TAG}`,
      accountNumber: '0000333344',
    });
    expect(account.status).toBe(201);
    const accountId = String(account.body.id);

    const own = await maker.call('POST', `/super-admin/billing/receiving-accounts/${accountId}/approve`, {});
    expect(own.status).toBe(409);
    expect(own.message).toMatch(/different operator/i);
    const stillPending = await withDatabase(async (c) =>
      (await c.query(`select status, "createdById", "approvedById" from "BankReceivingAccount" where id = $1`, [accountId])).rows[0],
    );
    expect(stillPending).toMatchObject({ status: 'PENDING_APPROVAL', createdById: maker.userId, approvedById: null });

    const second = await checker.call('POST', `/super-admin/billing/receiving-accounts/${accountId}/approve`, {});
    expect(second.status).toBe(201);
    const approved = await withDatabase(async (c) =>
      (await c.query(`select status, "createdById", "approvedById" from "BankReceivingAccount" where id = $1`, [accountId])).rows[0],
    );
    expect(approved).toMatchObject({ status: 'APPROVED', createdById: maker.userId, approvedById: checker.userId });
    expect(approved!.approvedById).not.toBe(approved!.createdById);
  });

  test('Q3 — a duplicate claim for the same order is refused, and a reused bank reference cannot settle a second order', async ({
    browser,
  }) => {
    test.setTimeout(8 * MINUTES);
    const first = newBuyer('d1');
    const second = newBuyer('d2');
    const a = await newCustomerPage(browser);
    const b = await newCustomerPage(browser);

    const orderA = await buyGrowthToInvoice(a.page, first);
    await submitClaimInBrowser(a.page, `QAREF-${TAG}-d1`);
    // The form is withdrawn while a claim awaits verification: the UI does not offer a second one.
    await expect(a.page.getByRole('button', { name: 'I have paid' })).toHaveCount(0);

    // Whatever the UI offers, the API refuses a second claim and keeps exactly one.
    const api = await landingApi();
    const again = await api.post(`/api/public/onboarding/${orderA.orderId}/bank-transfer/claims`, {
      multipart: { transactionReference: `QAREF-${TAG}-d1b`, note: `duplicate ${TAG}`, evidence: { name: 'again.png', mimeType: 'image/png', buffer: SYNTHETIC_RECEIPT } },
    });
    expect(again.status()).toBe(409);
    expect(JSON.stringify(await again.json())).toMatch(/already awaiting verification/i);
    await api.dispose();
    expect((await orderState(orderA.orderId)).claims).toHaveLength(1);

    // Settle order A with a bank statement reference...
    const sharedRef = statementRef();
    const settledA = await approveByApi(orderA.orderId, sharedRef);
    expect(settledA.status).toBeLessThan(300);
    await awaitProvisioned(orderA.orderId);

    // ...then a second order's claim presented with the SAME statement reference must be refused.
    const orderB = await buyGrowthToInvoice(b.page, second);
    await submitClaimInBrowser(b.page, `QAREF-${TAG}-d2`);
    const reuse = await approveByApi(orderB.orderId, sharedRef);
    expect(reuse.status).toBe(409);
    expect(reuse.message).toMatch(/already been used to settle another payment/i);
    const stateB = await orderState(orderB.orderId);
    expect(stateB.status).toBe('PENDING_PAYMENT');
    expect(stateB.tenantId).toBeNull();
    expect(stateB.claims.map((c) => c.status)).toEqual(['PENDING_VERIFICATION']);
    await a.context.close();
    await b.context.close();
  });

  test('Q4 — a rejected claim keeps the subscription inactive and the customer can resubmit, then be approved', async ({
    browser,
  }) => {
    test.setTimeout(8 * MINUTES);
    const buyer = newBuyer('rj');
    const { context, page } = await newCustomerPage(browser);
    const { orderId } = await buyGrowthToInvoice(page, buyer);
    await submitClaimInBrowser(page, `QAREF-${TAG}-rj1`);

    const dialog = await openClaimDialog(checkerPage, buyer.company);
    await rejectInDialog(dialog, `Amount not seen on the statement ${TAG}`);
    await expect(checkerPage.getByText(/claim for .* rejected/i)).toBeVisible({ timeout: 30_000 });

    const rejected = await orderState(orderId);
    expect(rejected.claims.map((c) => c.status)).toEqual(['REJECTED']);
    expect(rejected.status).toBe('PENDING_PAYMENT');
    expect(rejected.tenantId).toBeNull();
    expect(rejected.subscriptionId).toBeNull();

    // The customer sees the reason and is offered the form again.
    await page.reload();
    await expect(mainOf(page)).toContainText(`Amount not seen on the statement ${TAG}`);
    await submitClaimInBrowser(page, `QAREF-${TAG}-rj2`);
    const resubmitted = await orderState(orderId);
    expect(resubmitted.claims.map((c) => c.status)).toEqual(['REJECTED', 'PENDING_VERIFICATION']);
    expect(resubmitted.status).toBe('PENDING_PAYMENT');

    const second = await openClaimDialog(checkerPage, buyer.company);
    await approveInDialog(second, statementRef());
    await expect(checkerPage.getByText(/approved\. the order is confirmed/i)).toBeVisible({ timeout: 30_000 });
    const done = await awaitProvisioned(orderId);
    expect(done.claims.map((c) => c.status)).toEqual(['REJECTED', 'APPROVED']);
    expect(await scalar<string>(`select p.key from "Subscription" s join "Plan" p on p.id = s."planId" where s."tenantId" = $1`, [done.tenantId])).toBe('growth');
    await context.close();
  });

  test('Q5 — approving the same claim twice (double click, then a retry) provisions exactly once', async ({ browser }) => {
    test.setTimeout(8 * MINUTES);
    const buyer = newBuyer('dc');
    const { context, page } = await newCustomerPage(browser);
    const { orderId } = await buyGrowthToInvoice(page, buyer);
    await submitClaimInBrowser(page, `QAREF-${TAG}-dc`);

    const ref = statementRef();
    const dialog = await openClaimDialog(checkerPage, buyer.company);
    await approveInDialog(dialog, ref, 2);
    await expect(checkerPage.getByText(/approved\. the order is confirmed/i)).toBeVisible({ timeout: 30_000 });
    const done = await awaitProvisioned(orderId);

    // A retry of the same approval is idempotent: it reports the claim as already approved.
    const retry = await approveByApi(orderId, ref, 'APPROVED');
    expect(retry.status).toBeLessThan(300);
    expect(retry.body.alreadyApproved).toBe(true);

    await expect.poll(() => activationEmails(buyer.email), { timeout: 60_000 }).toBeGreaterThanOrEqual(1);
    expect(await activationEmails(buyer.email)).toBe(1);
    expect(await scalar(`select count(*)::int from "Tenant" where name = $1`, [buyer.company])).toBe(1);
    expect(await scalar(`select count(*)::int from "Subscription" where "tenantId" = $1`, [done.tenantId])).toBe(1);
    expect(await scalar(`select count(*)::int from "BankTransferClaim" where "subscriptionOrderId" = $1 and status = 'APPROVED'`, [orderId])).toBe(1);
    expect(await scalar(`select count(*)::int from "PlatformOutboundEmail" where "eventCode" = 'SUBSCRIPTION_PAYMENT_RECEIVED' and recipient = $1`, [buyer.email])).toBe(1);
    await context.close();
  });

  test('Q6 — a wrong or expired verification code is refused with a clear message, and a new code recovers', async ({
    browser,
  }) => {
    test.setTimeout(5 * MINUTES);
    const buyer = newBuyer('vc');
    const { context, page } = await newCustomerPage(browser);
    const { orderId, code } = await runWizardToVerification(page, buyer);
    const main = mainOf(page);
    const submit = page.getByRole('button', { name: /confirm and continue to payment/i });
    const unverified = () => scalar(`select count(*)::int from "SubscriptionOrder" where id = $1 and "ownerEmailVerifiedAt" is null`, [orderId]);

    const wrong = code === '000000' ? '111111' : '000000';
    await fillStable(page.getByLabel(/verification code/i), wrong);
    await submit.click();
    await expect(main).toContainText(/that code is not correct/i);
    expect(await unverified()).toBe(1);

    // Time travel on the test's own order: make the real code stale.
    await withDatabase((c) => c.query(`update "SubscriptionOrder" set "emailVerificationExpiresAt" = (now() at time zone 'utc') - interval '1 minute' where id = $1`, [orderId]));
    await fillStable(page.getByLabel(/verification code/i), code);
    await submit.click();
    await expect(main).toContainText(/that code has expired/i);
    expect(await unverified()).toBe(1);

    // No invoice can be issued for an unverified owner.
    const api = await landingApi();
    const early = await api.post(`/api/public/onboarding/${orderId}/bank-transfer`);
    expect(early.status()).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(await early.json())).toMatch(/verify the administrator email/i);
    await api.dispose();
    expect(await scalar(`select count(*)::int from "SubscriptionOrder" where id = $1 and "bankInvoiceIssuedAt" is not null`, [orderId])).toBe(0);

    // Asking for a new code recovers the purchase. A new code is rate limited to one a minute,
    // so the test moves the previous send out of that window rather than sleeping through it.
    await withDatabase((c) => c.query(`update "SubscriptionOrder" set "emailVerificationSentAt" = (now() at time zone 'utc') - interval '2 minutes' where id = $1`, [orderId]));
    await page.getByRole('button', { name: /send a new code/i }).click();
    await expect
      .poll(async () => (await scalar(`select count(*)::int from "PlatformOutboundEmail" where "eventCode" = 'ONBOARDING_EMAIL_VERIFICATION' and recipient = $1`, [buyer.email])), { timeout: 30_000 })
      .toBe(2);
    const fresh = await (async () => {
      const html = await scalar<string>(`select "htmlBody" from "PlatformOutboundEmail" where "eventCode" = 'ONBOARDING_EMAIL_VERIFICATION' and recipient = $1 order by "createdAt" desc limit 1`, [buyer.email]);
      return html.match(/<strong>(\d{4,8})<\/strong>/)![1];
    })();
    await fillStable(page.getByLabel(/verification code/i), fresh);
    await submit.click();
    await page.waitForURL(/\/subscribe\/bank-transfer\?onboarding=/, { timeout: 45_000 });
    await expect(main).toContainText('Awaiting your transfer');
    expect(await unverified()).toBe(0);

    // The same refusal applies to a bogus activation link.
    await page.goto(`${tenantUrl(BASE_URLS.web, buyer.slug, '/activate-account')}&token=${'0'.repeat(64)}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('alert').filter({ hasText: /invitation was not found/i })).toBeVisible({ timeout: 30_000 });
    await context.close();
  });

  test('Q7 — the customer cannot sign in before activating, and nothing is created by trying', async ({ browser }) => {
    test.setTimeout(8 * MINUTES);
    const buyer = newBuyer('na');
    const { context, page } = await newCustomerPage(browser);
    const { orderId } = await buyGrowthToInvoice(page, buyer);
    await submitClaimInBrowser(page, `QAREF-${TAG}-na`);

    // Before payment is verified there is no workspace to sign in to at all.
    await page.goto(tenantUrl(BASE_URLS.web, buyer.slug), { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/could not find this company portal/i)).toBeVisible({ timeout: 30_000 });
    expect(await orderState(orderId).then((s) => s.tenantId)).toBeNull();

    const settled = await approveByApi(orderId, statementRef());
    expect(settled.status).toBeLessThan(300);
    const done = await awaitProvisioned(orderId);

    // Provisioned but not activated: the owner is INVITED and a password attempt is refused.
    await attemptTenantLogin(page, buyer.slug, buyer.email, OWNER_PASSWORD);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 30_000 });
    expect(await scalar<string>(`select status from "User" where email = $1 and "tenantId" = $2`, [buyer.email, done.tenantId])).toBe('INVITED');
    expect(await scalar(`select count(*)::int from "RefreshToken" rt join "User" u on u.id = rt."userId" where u.email = $1`, [buyer.email])).toBe(0);
    await context.close();
  });
});

