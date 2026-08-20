---
ID: BUG-0080
aliases: [BUG-0080]
Title: Seeded prices bill a flat fee while the Terms say the billable unit is an active employee
Status: PRODUCT_DECISION
Severity: HIGH
Priority: P1
Type: DATA_INTEGRITY
Source: ARCHITECT
DetectedDate: 2026-08-20
DetectedInSha: d4c0b00
AffectedModules: [billing, super-admin, legal]
OwnerAgent: architect
ArchitectDisposition: PRODUCT_DECISION
QAReport: 
RegressionId: REG-075
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-20
UpdatedAt: 2026-08-20
ResolvedAt:
---

# BUG-0080 — Seeded prices bill a flat fee while the Terms say the billable unit is an active employee

## Summary

The Terms of Service draft states: *"The billable unit is an **active
employee**."* An entire seat engine exists to support that — active-employee
counting, usage history, overage, seat-change lifecycle, all delivered by
TASK-0007 WP-04 and WP-06.

Every seeded price is `BillingModel.FLAT`.

So a buyer who selects 5 seats, 50 seats or 500 seats is charged the same
amount, and the seat count they chose has no effect on what Stripe collects.

## Expected Behavior

Either the prices bill per active employee, matching the Terms and the seat
engine — or the Terms and the pricing page describe a flat subscription and the
seat field is not presented as something that changes the price.

## Actual Behavior

A checkout for 5 seats of Growth produced a Stripe session for **$399**, the
flat monthly amount. Not $1,995.

## Reproduction

Against the Stripe sandbox with the synced USD prices:

1. `POST /public/subscribe` with `seatQuantity: 5` for Growth monthly.
2. Verify the owner email, resubmit, and retrieve the resulting session.
3. `amount_total` is `39900`.

## Evidence

`commercial-bootstrap.ts:352` — every seeded price:

```ts
billingModel: BillingModel.FLAT,
```

`seed-legal.ts:190`, Terms of Service draft:

> The billable unit is an **active employee**. Employees counted as active are
> those in active, probation or notice status.

Confirmed live on 2026-08-20 by a temporary spec driving the real Stripe
sandbox through `BillingService.createPublicSubscriptionCheckout`:

```
seatQuantity: 5, Growth monthly (unitAmount 399.00, billingModel FLAT)
Stripe session amount_total: 39900
```

The code is self-consistent — `calculateSeatPricing` multiplies only for
`PER_SEAT`, and `FLAT` correctly ignores the seat count. The defect is that the
seeded configuration and the customer-facing description disagree about which
model this product uses.

## Root Cause

Not established, and worth saying so. Two plausible readings:

1. The seat engine was built for a per-employee model and the bootstrap was
   never updated from an earlier flat-fee design.
2. The product genuinely is a flat subscription with a seat *cap*, and the Terms
   draft describes an intention rather than the implementation.

Which one it is determines the fix, and neither is an engineering call.

## Impact

**Revenue, in whichever direction the answer goes.** If the product is meant to
bill per employee, every self-service customer is currently undercharged by a
factor of their headcount. If it is meant to be flat, the Terms promise a
metering model that does not exist, and the seat field on the pricing page
misleads.

The wizard asks for a seat count and shows an estimate. Today that estimate is
computed from a `PER_SEAT` branch that the seeded prices never take, so a buyer
can be shown one figure and charged another — which is the one part of this that
is a straightforward defect regardless of the product answer.

Nothing has been mischarged yet: no live prices exist and no real payment has
been taken.

## Affected Areas

- `commercial-bootstrap.ts` — seeds every price `FLAT`
- `billing-seat-pricing.ts` — `calculateSeatPricing`, the `PER_SEAT` branch
- `seed-legal.ts` — Terms and Subscription/Billing Terms drafts
- `apps/landing/app/subscribe` — the seat field and its estimate
- The whole active-employee seat engine, which currently bills nothing

## Proposed Resolution

`PRODUCT_DECISION` first, engineering second. The question for the business:

> **Is DijiPeople priced per active employee, or is it a flat subscription with
> a seat cap?**

If per employee: seeded prices become `PER_SEAT`, and the Stripe prices are
recreated with `recurring.usage_type` matching. If flat: the Terms draft is
corrected before publication and the seat field stops implying it affects price.

Either way the pricing page, the wizard estimate, the Terms and the seeded
`billingModel` must all state the same thing — the defect is the disagreement,
not any one of them.

## Acceptance Criteria

- The seeded `billingModel`, the Terms wording and the wizard's estimate agree.
- A checkout for N seats charges what the pricing page showed for N seats.
- A regression asserts the amount Stripe receives against the displayed estimate.

## Regression Coverage

To be added with the fix. The assertion that found this — comparing
`amount_total` against the seat count and the unit amount — is the shape of it.

## Dependencies

Blocks nothing technically. Blocks going live commercially: it decides what
customers are charged.

## Related Items

[[TASK-0008]] · [[TASK-0007]]

## Resolution

**Not resolved. Awaiting a product decision**, and the record's status was
corrected on 2026-08-20 to say so — it read `FIXED` while its own resolution
said the opposite, which is exactly the kind of disagreement that lets a release
count a blocker as closed.

**The decision became more urgent, not less.** TASK-0010 WP-02 wired
`legal:publish` into `npm run release`, so a deployment now *publishes* the
Terms of Service rather than leaving it a draft. The sentence *"the billable
unit is an active employee"* stops being a draft the moment the first deploy
runs, while every seeded price is still `BillingModel.FLAT` and Stripe charges
the same amount for 5 seats as for 500.

Before publication this was an internal inconsistency. After it, it is a
published commercial term that the billing system does not honour.

## QA Retest

Pending.

## History

- 2026-08-20 — found while proving the checkout path against the real Stripe
  sandbox. The test asserted `5 x $199 = 99500` from the pricing page's own
  logic; Stripe returned `39900`. The literal in the test was wrong *and* it was
  wrong in the same way a customer's expectation would be, which is what made
  the mismatch visible.
