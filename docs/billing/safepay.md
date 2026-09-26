# Safepay — PKR payments alongside Stripe

> Written 2026-09-26 in SESSION-0108. Describes the code at the commit that
> introduced it; re-derive anything counted here before relying on it.

DijiPeople owns the subscription. A payment provider only moves money. Stripe
keeps doing what it did — it is a recurring-billing engine whose state is
projected onto `Subscription` by `WebhookService` — and Safepay is the first
provider that only **executes payments DijiPeople has priced**. For those,
DijiPeople issues every invoice, runs every renewal and decides access.

## Routing

`resolvePaymentProvider` (`billing/providers/payment-provider.resolver.ts`) is
the only place a provider is chosen, from the currency of the price being sold:

| Currency | `SAFEPAY_ENABLED=true` | `SAFEPAY_ENABLED` off |
|---|---|---|
| PKR | Safepay | Stripe (unchanged) |
| anything else | Stripe | Stripe |

The browser never chooses and never sends an amount. `PaymentGateways` wraps the
resolver and hands back the adapter; adding PayPro or PayFast is one currency
row plus one adapter implementing `PaymentGateway`.

Existing subscriptions keep the provider they were created with
(`Subscription.paymentProvider`). A PKR tenant already on Stripe stays on Stripe
for renewals after Safepay is switched on.

## What is built on what

| Concern | Where |
|---|---|
| Safepay API (tracker, passport token, reporter, refund, webhook HMAC) | `billing/providers/safepay.gateway.ts` — the only file that knows Safepay's URLs, headers and minor units |
| Checkout: price, coupon, tax, invoice + PENDING payment, hosted checkout | `billing/services/managed-checkout.service.ts` |
| Settlement: re-read the provider, check amount/currency, credit once | `billing/services/payment-settlement.service.ts` |
| Renewals, period boundaries, re-verification sweep | `billing/services/managed-renewal.service.ts`, run by `managed-billing.worker.ts` |
| State machine and period arithmetic (pure) | `billing/managed-billing.rules.ts` |
| Webhook | `billing/controllers/safepay-webhook.controller.ts` → `POST /api/billing/safepay/webhook` |

Reused rather than rebuilt: `Promotion` (coupons), `SubscriptionOrder` (public
signup), `TaxBasisService`, `Invoice`/`Payment`, `RefundRequest`,
`OrderActivationService.confirmPayment` and the outbox → provisioning chain,
`AuditService`, `PlatformEventsService`.

## Flows

### Tenant checkout (existing workspace)

1. `POST /billing/checkout-sessions { planPriceId, seatQuantity, promotionCode? }`
   — the same endpoint as Stripe. Market and sellability checks are shared.
2. Server prices it: `unitAmount × billable seats`, minus a validated promotion,
   plus tax basis. A zero total is refused.
3. Under a per-tenant advisory lock: reuse an open checkout for the identical
   selection, or create the invoice (`ISSUED`, `metadataJson.kind = INITIAL`)
   and a `PENDING` payment; the first checkout of a tenant with no subscription
   creates it `INCOMPLETE`.
4. Safepay: create tracker (minor units) → attach our payment id as `order_id`
   → passport token → hosted URL. Stored on the payment.
5. Buyer returns to `/settings/subscription/success?payment=<id>`, which polls
   `GET /billing/payments/:id`. That endpoint re-verifies a pending payment with
   Safepay before answering — the redirect is never evidence.

### Public signup (no tenant yet)

`POST /public/subscribe` opens the order exactly as before; after email
verification, a PKR order gets a Safepay checkout instead of a Stripe session.
The success page already polls `/public/onboarding/:id/status`, which now
re-verifies with Safepay first. Paid → `confirmPayment({ orderId })` →
`PAYMENT_CONFIRMED` → onboarding → provisioning, identical to Stripe.
Provisioning creates the subscription with `paymentProvider = SAFEPAY` and
records the paid invoice and payment (`recordOrderPayment`).

### Settlement — the only place money becomes access

Every path (webhook, return page, status poll, sweeper, operator "Verify")
calls `settlePayment`, which **re-reads the tracker from Safepay** and:

- `PENDING` — nothing.
- terminal failure (`CANCELLED`, `EXPIRED`, `VOIDED`, `REVERSED`) — payment
  `FAILED`, invoice `PAYMENT_FAILED`, subscription untouched.
- paid, but amount or currency differs from the invoice — payment `FAILED` with
  `SAFEPAY_AMOUNT_MISMATCH`/`SAFEPAY_CURRENCY_MISMATCH`, a CRITICAL platform
  event, nothing activated.
- paid and matching — in one transaction: a conditional update moves the
  payment out of `PENDING`/`FAILED` (so concurrent confirmations credit once),
  the invoice is paid, and the subscription is activated (`INITIAL`) or
  extended (`RENEWAL`).
- paid for an invoice already paid or voided, or a subscription already live
  from another payment, or cancelled before a renewal was paid, or a renewal
  for a period already covered — the money is recorded and a `RefundRequest`
  (`DUPLICATE_PAYMENT`) is raised for an operator. A second paid checkout on an
  already-paid public order does the same, with a CRITICAL platform event.

A payment the sweeper marked `FAILED` as abandoned is still credited if Safepay
later reports it paid.

## Subscription state machine (DijiPeople-billed only)

```
(none) ──checkout──▶ INCOMPLETE ──verified payment──▶ ACTIVE
ACTIVE ──renewal paid before period end──▶ ACTIVE (period extended)
ACTIVE ──period ends, cancelAtPeriodEnd──▶ CANCELED
ACTIVE ──period ends, renewal unpaid──▶ PAST_DUE (gracePeriodEndsAt set; still entitled)
PAST_DUE ──renewal paid──▶ ACTIVE
PAST_DUE ──grace ends──▶ EXPIRED (not entitled; open renewals withdrawn)
EXPIRED ──new checkout paid──▶ ACTIVE
```

Every boundary write is conditional on each field it was decided from —
status, `currentPeriodEnd`, `cancelAtPeriodEnd`, `gracePeriodEndsAt` — so a
renewal paid or a cancellation revoked while the sweep runs is never
overwritten. Settling a payment locks its subscription row first; a renewal
never moves the paid-through date backwards (a stale one is refunded), and
paying a renewal switches renewals back on.

Entitlement reads `isSubscriptionLive(status, gracePeriodEndsAt)`: `ACTIVE`,
`TRIALING`, or `PAST_DUE` inside a grace period DijiPeople set. Stripe never sets
`gracePeriodEndsAt`, so Stripe's `past_due` behaves exactly as before.

Renewal invoices are issued `MANAGED_BILLING_RENEWAL_NOTICE_DAYS` before the
period end, priced from the current plan price — or from a plan change scheduled
for that boundary — minus any `FOREVER`/in-window `REPEATING` promotion. Plan
changes on a Safepay subscription always take effect at renewal: an immediate
upgrade would otherwise be free, because nothing charges mid-period. Requesting
one voids an unpaid (not yet overdue) renewal so it is re-issued at the new
plan, and the change is applied when that renewal is paid — the renewal-date
sweep (`applyDueChanges`) skips Safepay subscriptions.

Cancel/resume: `POST /billing/subscription/cancel` and `/resume` (tenant,
`BILLING_MANAGE`) set or clear `cancelAtPeriodEnd` and void an unpaid renewal.
They deliberately do not use `CancellationService`, which starts the data
retention and erasure clock — something a Stripe cancellation has never done.

## Coupons

The existing `Promotion` model is reused. For Safepay the server evaluates it
(`evaluatePromotion`): active, started, not past `redeemBy`, under
`maximumRedemptions`, in scope (global, plan, price or customer), and — for a
fixed amount — in the purchase's own currency. One code per checkout; the
provider only sees the discounted total.

`redemptionCount` moves only when a payment succeeds, by a conditional
`UPDATE … WHERE redemptionCount < maximumRedemptions`. Checkout also counts
in-flight pending payments carrying the code, under a per-promotion advisory
lock, so the last redemption cannot be sold twice. A payment that still lands
over the cap was charged the discounted price, so it is honoured and logged.

Stripe coupons are unchanged: Stripe applies its own.

## Webhook

`POST https://<api-host>/api/billing/safepay/webhook`

- Raw body (`main.ts` → `rawWebhookPaths`), verified as a hex HMAC-SHA512 in
  `X-SFPY-SIGNATURE` with `SAFEPAY_WEBHOOK_SECRET`, compared in constant time.
  Safepay's plugin signs its re-serialised JSON rather than the raw bytes, so
  both are accepted.
- Recorded once in `PaymentProviderEvent`, unique on `(provider,
  externalEventId)` — Safepay's event `token`. A redelivery of a processed event
  is acknowledged without reprocessing.
- The body is only a pointer: settlement re-reads the tracker from Safepay.
- Failure answers non-2xx, so Safepay retries (it expects 2xx within 10 s).

## Configuration steps (sandbox)

1. Create a Safepay **sandbox** account; from Developers → API keys copy the
   Public API Key (`sec_…`) and Private API Secret Key.
2. Developers → Endpoints → Add endpoint:
   `https://<api-host>/api/billing/safepay/webhook`, subscribe to the 2.0.0
   `payment.succeeded`, `payment.failed` and `payment.refunded` events, then
   "View shared secret".
3. Set on the API: `SAFEPAY_ENVIRONMENT=sandbox`, the three keys,
   `SAFEPAY_ENABLED=true`, `MANAGED_BILLING_WORKER_ENABLED=true`,
   `SUBSCRIPTION_CHANGE_SWEEPER_ENABLED=true`.
4. Apply the migration `20260926120000_payment_provider_and_safepay`.
5. A PKR `PlanPrice` must be published and scoped to the tenant's market, as for
   Stripe. It needs no Stripe price: readiness for a Safepay price is the price
   itself plus configured credentials.
6. Test cards: https://safepay-docs.netlify.app/developers/safepay/test-cards/
   (frictionless success `4456 5300 0000 1005`, failure `…1013`).

Production is the same with the **live** account's keys and
`SAFEPAY_ENVIRONMENT=production`.

## Operations (platform admin)

Billing → **Safepay** tab: whether routing is on and credentials present, every
Safepay payment (tenant, plan, status, amount, tracker, failure) with **Verify**
(re-reads Safepay; never marks paid on an operator's word) and **Refund in
full** (requires `platform.billing.administer`; recorded as a `RefundRequest`
whether Safepay accepts or refuses), and the webhook deliveries. Payments and
Subscriptions lists show the provider.

## Known limitations

- **Refund body shape is unconfirmed.** Safepay's docs wrap it in `payload`
  (used here); the SDK is ambiguous. The result is read from the returned
  tracker state and a refusal is recorded, never assumed successful. Verify in
  sandbox before relying on it; dashboard refunds are the fallback, and
  `payment.refunded` webhooks mark the payment `REFUNDED` either way.
- **Webhook signing input** is documented inconsistently by Safepay; confirm
  with the first real sandbox event.
- **No automatic card charging.** Safepay's card-on-file (`unscheduled_cof`) is
  documented only in SDK examples and its native Subscriptions cannot be created
  by API, so renewals are customer-initiated: the tenant pays each renewal
  invoice from billing history.
- **No renewal email yet.** The invoice appears in billing history and the
  overview warns when it is overdue; emailing it is a follow-up.
- **No coupon on the public signup page** (Stripe buyers enter codes on
  Stripe's page; Safepay buyers cannot yet).
- **Mid-period seat increases** are not charged until renewal, as for plan
  upgrades.
- A tenant on `TRIALING` cannot start a checkout on either provider — the
  pre-existing rule, kept for both.
