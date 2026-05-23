# Stripe Billing UAT Checklist

Use this checklist for Stripe test-mode UAT before enabling production billing.

## A. Admin Setup

1. Apply database migrations to the target UAT database.

   ```bash
   npm --workspace api exec prisma migrate deploy -- --schema prisma/schema.prisma
   npm --workspace api run prisma:generate
   ```

2. Confirm Stripe API environment variables are configured on the API service.

   ```bash
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_API_VERSION=2026-04-22.dahlia
   STRIPE_MODE=test
   WEB_APP_URL=http://localhost:3001
   STRIPE_CHECKOUT_SUCCESS_URL=http://localhost:3001/settings/billing/success?session_id={CHECKOUT_SESSION_ID}
   STRIPE_CHECKOUT_CANCEL_URL=http://localhost:3001/settings/billing/cancel
   STRIPE_PORTAL_RETURN_URL=http://localhost:3001/settings/billing
   ```

3. Create a Stripe Product in test mode.

   ```bash
   stripe products create --name "DijiPeople Growth"
   ```

4. Create Stripe recurring Prices for each currency and billing cycle.

   ```bash
   stripe prices create --product prod_xxx --unit-amount 39900 --currency usd --recurring interval=month
   stripe prices create --product prod_xxx --unit-amount 399000 --currency usd --recurring interval=year
   ```

5. Configure Stripe Customer Portal in Dashboard.

   - Enable Customer Portal.
   - Allow invoice viewing.
   - Allow payment method update.
   - Allow cancellation or plan changes only if approved for UAT.

6. In Admin, open `/plans`.

   - Open each plan used in UAT.
   - Add or update PlanPrice rows.
   - Paste the matching Stripe `price_...` IDs.
   - Confirm each UAT price shows checkout-ready.

7. Open Admin `/billing`.

   - Confirm Stripe key is configured.
   - Confirm webhook secret is configured.
   - Confirm active public plans count is greater than zero.
   - Confirm checkout-ready prices count is greater than zero.
   - Confirm duplicate risk count is zero.

## B. Local UAT

1. Start the API.

   ```bash
   npm --workspace api run start:dev
   ```

2. Start the tenant web app.

   ```bash
   npm --workspace web run dev
   ```

3. Start the admin app.

   ```bash
   npm --workspace admin run dev
   ```

4. Start Stripe webhook forwarding.

   ```bash
   stripe listen --forward-to localhost:4000/api/billing/stripe/webhook
   ```

5. Copy the printed `whsec_...` value into `STRIPE_WEBHOOK_SECRET`.

6. Restart the API after changing `STRIPE_WEBHOOK_SECRET`.

7. Sign in to the tenant web app.

8. Open `/settings/billing`.

9. Verify billing health through the UI and, if needed, through:

   ```text
   GET /api/billing/health
   ```

10. Select a plan, billing cycle, and currency.

11. Click Subscribe.

12. Complete Stripe Checkout with:

    ```text
    4242 4242 4242 4242
    ```

13. Return to `/settings/billing/success`.

14. Confirm the page does not immediately claim the subscription is active.

15. Open Admin `/billing/webhooks`.

16. Confirm these events are processed:

    - `checkout.session.completed`
    - `customer.subscription.created`
    - `customer.subscription.updated`
    - `invoice.finalized`
    - `invoice.paid`
    - `payment_intent.succeeded`

17. Refresh tenant `/settings/billing`.

18. Confirm subscription status is `ACTIVE` or `TRIALING`.

19. Confirm invoice appears in the invoice list.

20. Confirm hosted invoice and PDF links open in a new tab.

21. Confirm payment record exists in admin `/payments`.

22. Click Manage in Stripe from tenant billing.

23. Confirm Customer Portal opens for the same tenant customer.

## C. Failure Scenarios

### Failed Payment

1. Start checkout with a UAT plan.
2. Use test card:

   ```text
   4000 0000 0000 9995
   ```

3. Confirm webhook event `invoice.payment_failed` is received.
4. Confirm subscription becomes `PAST_DUE` or remains payment-action-required.
5. Confirm tenant billing page shows a payment issue alert.
6. Confirm Manage billing opens Customer Portal when a Stripe customer exists.

### Incomplete Checkout

1. Start checkout.
2. Close the Stripe Checkout page without paying.
3. Return to `/settings/billing`.
4. Start checkout again within 24 hours.
5. Confirm DijiPeople reuses the recent open checkout session when Stripe still returns a URL.

### Duplicate Checkout Attempt

1. Complete a successful checkout.
2. Refresh `/settings/billing`.
3. Attempt to subscribe to the current active plan again.
4. Confirm the UI disables or blocks duplicate active subscription checkout.
5. Confirm the API rejects direct duplicate checkout attempts for `ACTIVE` or `TRIALING` subscriptions.

### Retry Failed Webhook

1. Open Admin `/billing/webhooks`.
2. Filter status to `FAILED`.
3. Click Retry on a failed event.
4. Confirm only failed events can retry.
5. Confirm retry uses the same Stripe event ID.
6. Confirm status changes to `PROCESSED` or remains `FAILED` with an updated safe error message.
7. Confirm no duplicate subscription, invoice, or payment rows are created.

## D. Acceptance Criteria

### Pass

- All Stripe billing migrations are applied.
- API starts without Stripe provider errors.
- `/api/billing/health` returns no critical setup warnings.
- Admin `/billing` diagnostics show Stripe and webhook configured.
- At least one active public PlanPrice has a Stripe `price_...` ID.
- Checkout creates a Stripe subscription session in subscription mode.
- Checkout metadata includes tenant, customer account, plan, plan price, and user IDs.
- Subscription is activated only after webhook-confirmed Stripe events.
- `invoice.paid` activates or confirms paid subscription state.
- Tenant invoice list shows the Stripe invoice.
- Payment row is created without duplicates.
- Customer Portal opens for the tenant Stripe customer.
- Failed webhook retry is idempotent.

### Fail

- Any required Stripe billing migration is pending.
- PlanPrice table is missing.
- No public checkout-ready prices exist.
- Webhook signature verification fails with the configured Stripe CLI secret.
- Checkout success page is the only source of subscription activation.
- Tenant can see another tenant's subscription or invoice.
- Duplicate checkout creates multiple active internal subscriptions.
- Replayed webhooks create duplicate invoices or payments.
