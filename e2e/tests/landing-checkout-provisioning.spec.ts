import { expect, test } from '@playwright/test';
import { Client } from 'pg';

import { TARGET, targetUp } from '../fixtures/landing-target';

/**
 * The self-service purchase, end to end: five wizard steps, the owner email
 * verification, Stripe Checkout with a test card, the webhook, provisioning,
 * and the workspace URL handed back.
 *
 * This is the journey that took money and delivered nothing. Three separate
 * defects sat on it — [[BUG-0900]] (provisioning blew a 5s transaction budget),
 * [[BUG-0901]] (a paid order recorded a zero total) and [[BUG-0902]] (the
 * workspace was never marked ready) — and none of them is visible from a unit
 * test, because each one is about what the *whole* chain wrote down.
 *
 * ## What it needs, and why it skips loudly without it
 *
 * - A landing app and API, and `E2E_DATABASE_URL` pointing at a **local,
 *   disposable** database. The suite reads rows back to check what was created,
 *   and reads the verification code out of `PlatformOutboundEmail` the way a
 *   person reads their inbox — the code still goes through `verify-email` and
 *   the server still checks the hash, so nothing here bypasses the flow.
 * - `OUTBOX_WORKER_ENABLED=true` on the API, or provisioning is never
 *   dispatched at all ([[BUG-0904]]).
 * - Stripe in **test** mode with webhooks forwarded to the API — locally,
 *   `stripe listen --forward-to http://localhost:4001/api/billing/stripe/webhook`.
 * - At least one plan price synced to Stripe, or the wizard refuses to render
 *   ([[BUG-0898]]).
 *
 * Every one of those is a real precondition rather than a nicety, so the test
 * skips naming the missing one instead of failing and looking like a product
 * defect.
 */

const SLOW = 5 * 60_000;

/** A disposable database, or nothing. Never a working database. */
function disposableDatabaseUrl(): string | null {
  const url = process.env.E2E_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) return null;
  const disposable = /(_test|_e2e|test_|e2e_)/i.test(url) && /localhost|127\.0\.0\.1/.test(url);
  return disposable ? url : null;
}

async function withDatabase<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const url = disposableDatabaseUrl();
  if (!url) throw new Error('no disposable database');
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

test.describe('self-service checkout', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async () => {
    test.skip(
      !(await targetUp()),
      `BROWSER_E2E = BLOCKED_INFRASTRUCTURE — landing not reachable at ${TARGET.landing}`,
    );
    test.skip(
      TARGET.isProduction,
      'this journey completes a real purchase and provisions a tenant — never against production',
    );
    test.skip(
      !disposableDatabaseUrl(),
      'BROWSER_E2E = BLOCKED_INFRASTRUCTURE — E2E_DATABASE_URL must name a local, disposable database',
    );
  });

  test('a buyer pays and gets a provisioned workspace, priced correctly', async ({ page }) => {
    test.setTimeout(SLOW);

    const run = `qa${Date.now().toString(36)}`;
    const slug = `qa-${run}`.toLowerCase().slice(0, 30);

    await page.goto(`${TARGET.landing}/subscribe?plan=starter&billingInterval=MONTH&teamSize=25`, {
      waitUntil: 'networkidle',
    });

    /*
     * BUG-0898 gate. With no price synced to Stripe the wizard renders a
     * DP-CHK-01 notice and no form at all, and every assertion below would fail
     * for a reason that is configuration rather than code.
     */
    const blocked = await page.locator('main').innerText();
    test.skip(
      blocked.includes('DP-CHK-01'),
      'BROWSER_E2E = BLOCKED_INFRASTRUCTURE — no plan price is synced to Stripe, so checkout cannot open (BUG-0898)',
    );

    /*
     * Driven by what is on screen rather than by a step count: the wizard skips
     * a step whose requirements are already satisfied — with nothing published
     * to accept it passes through Agreements and Review in one move — so a
     * fixed fill/click sequence fills the wrong step and fails somewhere
     * unrelated.
     */
    const filled = new Set<string>();
    for (let guard = 0; guard < 12; guard++) {
      await page.waitForTimeout(1200);
      const text = await page.locator('main').innerText();
      if (/Confirm your email/i.test(text)) break;

      if (/Your organization/i.test(text) && !filled.has('org')) {
        await page.getByLabel('Company name', { exact: false }).first().fill(`QA Test Co ${run}`);
        await page.getByLabel('Country', { exact: false }).first().selectOption({ label: 'Pakistan' });
        await page.getByLabel('Approximate employees', { exact: false }).first().fill('25');
        filled.add('org');
      } else if (/Your workspace/i.test(text) && !filled.has('workspace')) {
        await page.getByLabel('Workspace address', { exact: false }).first().fill(slug);
        await page.waitForTimeout(2500); // the availability check is debounced
        filled.add('workspace');
      } else if (/Workspace administrator/i.test(text) && !filled.has('owner')) {
        await page.getByLabel('First name', { exact: false }).first().fill('Ada');
        await page.getByLabel('Last name', { exact: false }).first().fill('Lovelace');
        await page.getByLabel('Work email', { exact: false }).first().fill(`qa+${run}@dijipeople.local`);
        filled.add('owner');
      } else if (/accept|agree to|terms below/i.test(text) && !filled.has('agreements')) {
        const boxes = page.locator('input[type=checkbox]');
        for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).check().catch(() => undefined);
        filled.add('agreements');
      }

      const submit = page.getByRole('button', { name: /confirm and verify email/i });
      if (await submit.count()) {
        await submit.click();
        await page.waitForTimeout(3000);
        break;
      }

      // A Continue click can submit outright and remove the button mid-click.
      // Losing it is not a failure if the page landed where the click meant.
      try {
        await page.getByRole('button', { name: /^continue$/i }).first().click({ timeout: 15_000 });
        await page.waitForTimeout(800);
      } catch (error) {
        if (/Confirm your email/i.test(await page.locator('main').innerText())) break;
        throw error;
      }
    }

    await expect(page.locator('main')).toContainText(/Confirm your email/i);

    // Read the code the way a person reads their inbox. The submission still
    // goes through POST /verify-email and the server still checks the hash.
    const email = await withDatabase((client) =>
      client
        .query<{ entityId: string; htmlBody: string }>(
          `select "entityId", "htmlBody" from "PlatformOutboundEmail"
            where "eventCode" = 'ONBOARDING_EMAIL_VERIFICATION'
            order by "createdAt" desc limit 1`,
        )
        .then((r) => r.rows[0]),
    );
    expect(email, 'a verification email should have been recorded').toBeTruthy();

    const orderId = email.entityId;
    const code = email.htmlBody.match(/<strong>(\d{4,8})<\/strong>/)?.[1];
    expect(code, 'the email should carry a numeric code').toBeTruthy();

    await page.getByLabel(/verification code/i).first().fill(code!);
    await page.getByRole('button', { name: /confirm and continue to payment/i }).click();

    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });

    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    await page.getByPlaceholder('1234 1234 1234 1234').fill('4242424242424242');
    await page.getByPlaceholder('MM / YY').fill('12 / 34');
    await page.getByPlaceholder('CVC').fill('123');
    const cardName = page.getByPlaceholder('Full name on card');
    if (await cardName.count()) await cardName.fill('Ada Lovelace');
    await page.getByTestId('hosted-payment-submit-button').click();

    await page.waitForURL(/\/subscribe\/(success|cancel)/, { timeout: 120_000 });
    expect(page.url(), 'the test card should not be declined').toContain('/subscribe/success');

    /*
     * REG-236 and REG-237. Provisioning is asynchronous — the webhook confirms
     * the payment, the outbox dispatches PROVISIONING_REQUESTED, and the
     * handler builds the tenant and marks it ready. Polling the public status
     * endpoint is exactly what the buyer's own page does.
     */
    const status = await expect
      .poll(
        async () => {
          const response = await fetch(`${TARGET.api}/public/onboarding/${orderId}/status`);
          const body = (await response.json()) as { state: string };
          return body.state;
        },
        {
          message:
            'the order should reach READY — PAYMENT_CONFIRMED means the outbox never provisioned (BUG-0900/BUG-0904)',
          timeout: 180_000,
          intervals: [5_000],
        },
      )
      .toBe('READY');
    void status;

    const finalStatus = await (
      await fetch(`${TARGET.api}/public/onboarding/${orderId}/status`)
    ).json();

    // REG-237 — every step done, and a workspace the buyer can actually open.
    expect(finalStatus.steps.map((s: { state: string }) => s.state)).toEqual([
      'DONE',
      'DONE',
      'DONE',
      'DONE',
    ]);
    expect(finalStatus.workspace, 'the buyer must be given the workspace URL').toBeTruthy();
    expect(finalStatus.workspace.hostname).toContain(slug);

    // REG-235 — the order records the money that actually moved.
    const order = await withDatabase((client) =>
      client
        .query<{ status: string; totalAmount: string; unitAmount: string; tenantId: string | null }>(
          `select status, "totalAmount", "unitAmount", "tenantId"
             from "SubscriptionOrder" where id = $1`,
          [orderId],
        )
        .then((r) => r.rows[0]),
    );

    expect(order.tenantId, 'the order should be linked to the tenant it paid for').toBeTruthy();
    expect(
      Number(order.totalAmount),
      'a paid order recording 0.00 is the billing record disagreeing with the money (BUG-0901)',
    ).toBeGreaterThan(0);
    expect(Number(order.totalAmount)).toBe(Number(order.unitAmount));

    const tenant = await withDatabase((client) =>
      client
        .query<{ status: string; readinessStatus: string }>(
          `select status, "readinessStatus" from "Tenant" where id = $1`,
          [order.tenantId],
        )
        .then((r) => r.rows[0]),
    );

    expect(tenant.status).toBe('ACTIVE');
    expect(
      tenant.readinessStatus,
      'NOT_READY means markTenantReady was never called (BUG-0902)',
    ).not.toBe('NOT_READY');
  });
});
