# Stripe Billing Setup

This guide covers the DijiPeople Stripe subscription billing setup for test mode, UAT, and production rollout.

## Environment Variables

Set these on the API service. Do not expose them to frontend apps.

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

Use `sk_live_...` only when `STRIPE_MODE=live`.

## Stripe Dashboard Setup

1. Open Stripe Dashboard in test mode.
2. Create one Product per DijiPeople plan or commercial package.
3. Create recurring Prices for each supported currency and billing cycle:
   - Monthly
   - Annual
4. Copy each `price_...` value into the matching DijiPeople `PlanPrice.stripePriceId`.
5. Confirm each public plan has at least one active `PlanPrice` with a Stripe Price ID.

## Customer Portal Setup

Stripe Customer Portal must be enabled before `POST /api/billing/portal-sessions` can return a usable URL.

In Stripe Dashboard:

1. Go to Billing > Customer portal.
2. Enable portal.
3. Configure allowed actions:
   - Update payment method
   - View invoices
   - Cancel subscription, if policy allows
   - Change subscription, if DijiPeople plan-change policy allows it
4. Save the portal configuration.

If portal is not configured, the DijiPeople health endpoint reports a warning.

## Webhook Setup

Endpoint:

```text
POST /api/billing/stripe/webhook
```

Required events:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.finalized
invoice.paid
invoice.payment_failed
invoice.voided
invoice.marked_uncollectible
payment_intent.succeeded
payment_intent.payment_failed
```

DijiPeople verifies the `Stripe-Signature` header using `STRIPE_WEBHOOK_SECRET`. Subscription activation must come from webhook processing, not the Checkout success URL.

## Local Testing With Stripe CLI

1. Start the API.
2. Start the web app.
3. Forward Stripe webhooks:

```bash
stripe listen --forward-to localhost:4000/api/billing/stripe/webhook
```

4. Copy the `whsec_...` value printed by Stripe CLI into `STRIPE_WEBHOOK_SECRET`.
5. Restart the API.
6. Start Checkout from `/settings/billing`.
7. Complete Checkout using a test card.

## Test Cards

```text
4242 4242 4242 4242  Successful payment
4000 0000 0000 9995  Payment declined
4000 0025 0000 3155  Requires authentication
```

Use any future expiry date, any CVC, and any postal code accepted by Stripe test mode.

## Operational Checks

Tenant endpoint:

```text
GET /api/billing/health
```

Admin diagnostics:

```text
GET /api/super-admin/billing/diagnostics
GET /api/super-admin/billing/stripe-webhook-events
```

Admin UI:

```text
/billing
/billing/webhooks
/plans/:planId
```

## Deployment Notes

Render:

- Add Stripe env vars to the API service only.
- Confirm the public API URL is used in the Stripe webhook endpoint.
- Restart the API after changing `STRIPE_WEBHOOK_SECRET`.

Neon:

- Run Prisma migrations before enabling UAT checkout.
- Confirm unique indexes for Stripe invoice, subscription, and payment intent IDs exist.
- Check for legacy duplicate `Payment.stripePaymentIntentId` values before applying the unique constraint migration.

## Production Checklist

- `STRIPE_MODE=live`
- Live `STRIPE_SECRET_KEY` starts with `sk_live_`
- Live webhook endpoint configured in Stripe
- Live `STRIPE_WEBHOOK_SECRET` saved in API env
- Customer Portal configured
- All public plans have active PlanPrice rows
- All online PlanPrice rows have live `price_...` IDs
- `/api/billing/health` has no critical warnings
- Admin webhook failures are zero before go-live
- Checkout success page copy does not claim immediate activation

## Troubleshooting

### Webhook Signature Failed

- Confirm the raw body parser is active only for `/api/billing/stripe/webhook`.
- Confirm `STRIPE_WEBHOOK_SECRET` matches the exact Stripe endpoint or Stripe CLI session.
- Restart the API after changing the secret.

### No PlanPrice.stripePriceId

Checkout is disabled until the selected `PlanPrice` has a `price_...` ID. Add it in admin plan detail under Stripe checkout prices.

### Portal Not Configured

Stripe may reject Customer Portal session creation until the portal is configured in Dashboard. Configure Customer Portal and retry.

### Subscription Not Active After Checkout

This is expected until verified webhooks arrive. Check:

- Stripe CLI or live webhook delivery status
- Admin `/billing/webhooks`
- `invoice.paid` event processing
- `StripeWebhookEvent.processingStatus`

### Duplicate Payment Intent Unique Constraint

Webhook handlers use `stripePaymentIntentId` as an idempotency key. If a duplicate constraint occurs:

- Check for legacy duplicate payment rows.
- Merge or remove duplicate legacy rows after finance review.
- Retry the failed webhook from admin webhook viewer.
