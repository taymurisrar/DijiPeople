---
ID: BUG-1128
aliases: [BUG-1128]
Title: Stripe API version skew: invoice.paid cannot map to a subscription because invoice.subscription no longer exists
Status: FIXED
Severity: CRITICAL
Priority: P0
Type: INTEGRATION
Source: QA_RUN
DetectedDate: 2026-08-24
DetectedInSha: caacf80c
AffectedModules: [services/api/src/modules/billing]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: docs/qa/runs/2026-08-24-record-state-reconciliation-0a5586f.md
RegressionId: REG-246
RelatedBacklogItem: ITEM-0087
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-24
UpdatedAt: 2026-08-24
ResolvedAt:
---

# BUG-1128 — Stripe API version skew: invoice.paid cannot map to a subscription because invoice.subscription no longer exists

## Summary

With [[BUG-0989]] fixed, Stripe deliveries now verify their signature and reach
the handler. The next event to arrive — a replayed `invoice.paid` for a real
PKR 12,000 payment — fails with a **different** `400`:

```
"message": "Stripe invoice could not be mapped to a DijiPeople subscription."
```

`resolveInvoiceContext` reads `invoice.subscription` and `invoice.metadata`.
**Neither exists in the payload Stripe actually sends.** In API version
`2026-07-29.dahlia` the subscription id and its metadata have moved to
`invoice.parent.subscription_details`, and the invoice's own top-level
`metadata` is `{}`. Every resolution branch therefore misses, and the handler
throws.

The payment is real, `status: "paid"`, `amount_paid: 1200000`. The platform
rejects the notification of it.

## Expected Behavior

`invoice.paid` resolves to the DijiPeople `Subscription` the invoice belongs to,
and the billing lifecycle proceeds: payment recorded, order confirmed,
`PROVISIONING_REQUESTED` emitted, workspace built.

## Actual Behavior

`400 VALIDATION_FAILED`, `"Stripe invoice could not be mapped to a DijiPeople
subscription."` Stripe marks the delivery failed and retries — *"Next retry in
1 minutes"* — so it will keep failing on a fixed schedule until the code or the
endpoint version changes.

## Reproduction

Stripe Dashboard → Developers → Webhooks → the `dijipeople` destination →
Event deliveries → `invoice.paid` `evt_1U7WppHSlnE5ArNF2BykDaya` → **Resend**.

Observed 2026-08-24T19:18:30Z, trace `req_24fb7144-74ed-4fe5-b863-62d8432bc47c`.

## Evidence

**The payload has no top-level `subscription`.** The id lives here instead:

```json
"parent": {
  "type": "subscription_details",
  "subscription_details": {
    "subscription": "sub_1U7WpoHSlnE5ArNFxsF2O6mA",
    "metadata": {
      "subscriptionOrderId": "6f1fdb3a-42f6-4efe-ab25-5cb05eb68cd7",
      "customerAccountId": "dbfec27c-0e51-470c-b8c6-0f4199bee04e",
      "planPriceId": "8b09be0d-54d9-4889-a8cb-f8898e9ac81c",
      "planId": "11111111-1111-4111-8111-111111111111",
      "seatQuantity": "25",
      "source": "public_website",
      "publicSubscription": "true"
    }
  }
}
```

while the invoice's own metadata is `"metadata": {}`.

**The code cannot see any of it.** `webhook.service.ts:65-94` declares
`StripeInvoiceObject` with `subscription?: string | { id: string } | null` and
**no `parent` field at all**, so there is not even a typed path to the data.

`resolveInvoiceContext` (`webhook.service.ts:964-1013`) then tries four routes
and misses on every one:

| Route | Why it misses |
|---|---|
| `Subscription` by `stripeSubscriptionId` | `getStripeId(invoice.subscription)` is `undefined` — the field does not exist |
| Retrieve from Stripe and upsert | Guarded by the same `stripeSubscriptionId`, so it never runs |
| `Subscription` by `metadata.tenantId` | Top-level `metadata` is `{}` |
| `CustomerAccount` by `stripeCustomerId`, if it has exactly one tenant subscription | `cus_V7mOUBV5goAlBS` has no provisioned tenant, because provisioning never ran — see Root Cause |

**Version skew, confirmed on both sides.** The event declares
`"api_version": "2026-07-29.dahlia"`. The Stripe request log for this account's
outbound calls shows `2026-02-25.clover`, *"Specified by request"* — that is
`STRIPE_API_VERSION`, which `stripe-billing.service.ts:297` requires and pins at
`:305`.

**Pinning the client does not pin the webhook.** Stripe renders event payloads
at the version configured on the endpoint or the account default, not the
version the API client requests. So this deployment makes outbound calls in
`clover` and receives inbound events in `dahlia`, and nothing in the codebase
reconciles the two.

## Root Cause

`invoice.subscription` was removed from the Stripe invoice object in a version
after `2026-02-25.clover`, replaced by `invoice.parent.subscription_details`.
The webhook handler was written against the older shape and never updated,
because the version it is *exercised* at differs from the version it is
*written* against and nothing asserts they agree.

The fourth fallback — one customer, one subscription — is the only route that
could have rescued this, and it is defeated by a circular consequence of
[[BUG-0989]]: the original 2026-08-23 checkout could not provision, because its
webhooks were rejected on signature; so no tenant exists; so there is no
subscription to find now. **Fixing BUG-0989 does not retroactively rescue orders
stranded while it was broken.**

## Impact

**Critical and immediate.** With BUG-0989 fixed, this is now the top of the
payment path. Every `invoice.paid` fails, so:

- no `Payment` row is written for a real charge;
- the subscription is never activated;
- `PROVISIONING_REQUESTED` is never emitted, so no workspace is built;
- Stripe retries on a fixed schedule and each retry fails identically.

The customer is charged and receives nothing — the same outcome as BUG-0989, one
layer further in.

`PaymentRecheckService` can still rescue an individual order by hand, which is
the only mitigation until this is fixed.

## Affected Areas

- `webhook.service.ts` — `StripeInvoiceObject`, `resolveInvoiceContext`,
  `handleInvoiceEvent`, `upsertPaymentFromInvoice`.
- **Probably wider.** `StripeInvoiceObject` also declares
  `payment_intent?: string | { id: string } | null`, which the same generation
  of API versions relocated. Every field this type reads should be checked
  against a real `dahlia` payload rather than assumed — the version skew is the
  defect, and the missing subscription is only the first symptom of it.
- `subscription.*` and `payment_intent.*` handlers, for the same reason.

## Proposed Resolution

Two changes, and the order matters.

**1. Unblock now — align the endpoint's API version.** In the Stripe dashboard,
set the `dijipeople` event destination to the same version the client pins
(`2026-02-25.clover`). Stripe will then render payloads in the shape the code
already expects. This is an operator action, reversible, and it makes the
stranded retries succeed without deploying anything.

**2. Fix properly — read the new shape, keep the old.** Add `parent` to
`StripeInvoiceObject` and resolve as:

```
invoice.parent?.subscription_details?.subscription ?? invoice.subscription
```

with metadata read the same way. Supporting both shapes is what makes the
handler survive the next version bump instead of failing the same way again.

Then close the class rather than the instance: **assert the versions agree.**
`STRIPE_API_VERSION` is pinned for outbound calls and unasserted for inbound
events; a startup check or a `smoke:deployment` assertion comparing the pinned
version against the endpoint's configured version would have caught this before
a payment did. That is the durable guard, and it is the same shape as
[[ITEM-0094]].

Needs no ExecPlan for step 2 — it is a type and one resolver. The version
assertion is worth its own item.

## Acceptance Criteria

- A resent `invoice.paid` in the `dahlia` shape returns `200`.
- `evt_1U7WppHSlnE5ArNF2BykDaya` specifically resolves, since it is a real paid
  invoice currently stranded.
- A unit test feeds a `parent.subscription_details` payload to
  `resolveInvoiceContext` and it resolves; the same test with the legacy flat
  `subscription` field also resolves.
- Deployment fails, or warns loudly, when the pinned `STRIPE_API_VERSION` and
  the webhook endpoint's version disagree.

## Regression Coverage

A fixture-based unit test on `resolveInvoiceContext` is both possible and cheap
here — unlike [[BUG-0989]], this **is** a code defect, and the payload above is
the fixture. It must cover both shapes: a test that only asserts the new one
would break the legacy path silently.

## Dependencies

Discovered only because [[BUG-0989]] was fixed first — the signature check
short-circuited every delivery before it could reach this code. Blocks
[[ITEM-0078]], which cannot pass while `invoice.paid` fails.

## Related Items

[[BUG-0989]], [[BUG-0904]], [[BUG-0900]], [[ITEM-0078]], [[ITEM-0094]],
[[ITEM-0087]], [[billing]], [[outbox]]

## Resolution

Fixed on `agent/record-state-reconciliation`. `StripeInvoiceObject` gains a
`parent` shape, and two exported helpers — `invoiceSubscriptionId` and
`invoiceMetadata` — read **both** layouts, the newer winning where both are
present. `resolveInvoiceContext` uses them instead of the flat fields.

Supporting both is the point rather than a courtesy: following the rename alone
would have let the legacy path rot and produced the same defect in the other
direction on the next version change. The metadata helper merges rather than
replaces, because an invoice may carry its own metadata *and* belong to a
subscription carrying more.

**Step 1 of the Proposed Resolution — realigning the endpoint version — is now
unnecessary.** The code handles either version, which is strictly better than
depending on a dashboard setting staying put.

**What is still not fixed is the skew itself.** Nothing asserts that the pinned
`STRIPE_API_VERSION` and the endpoint's configured version agree, so this class
recurs on any field Stripe relocates — `payment_intent` on the same type is the
next candidate. That guard is the remaining work.

## QA Retest

Retest against the Acceptance Criteria. The stranded event
`evt_1U7WppHSlnE5ArNF2BykDaya` is the natural test case: it is a real paid
invoice, it currently fails, and Stripe will replay it on demand.

## History

- 2026-08-24 — found at `caacf80c` by resending a failed delivery to confirm
  [[BUG-0989]]'s fix. The signature verified — which is the confirmation that
  BUG-0989 is genuinely resolved — and execution then failed one layer deeper.
  Two defects had been stacked on the same endpoint, and the outer one hid the
  inner one completely.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Backlog item — [[ITEM-0087]]
- Modules — [[billing]]
- Regression — REG-246 (see the regression register)

<!-- GRAPH:END -->
