---
ID: BUG-0901
aliases: [BUG-0901]
Title: A paid order records totalAmount 0.00 for every FLAT plan while Stripe charges the full price
Status: FIXED
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-23
DetectedInSha: 1dd74a25
AffectedModules: [services/api/src/modules/billing]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-236
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-23
UpdatedAt: 2026-08-23
ResolvedAt: 2026-08-23
---

# BUG-0901 — A paid order records totalAmount 0.00 for every FLAT plan while Stripe charges the full price

## Summary

`SubscriptionOrderService` applied per-seat arithmetic to every billing model
when it priced an order. On a `FLAT` price — where `unitAmount` is the price of
the whole subscription and `includedSeats` says what that one fee covers — it
computed `billableSeats = seats - includedSeats`. The public catalogue's Starter
FLAT price includes 25 seats, and the subscribe wizard opens on a team size of
25, so the arithmetic came out `12000 × (25 - 25) = 0`. Stripe, which is quoted
the flat price with quantity 1 by `buildRecurringCheckoutLineItem`, charged the
full 12,000 PKR. The platform's own record of the sale said the customer had
paid nothing.

## Expected Behavior

The order's `subtotalAmount`, `taxableAmount` and `totalAmount` describe the
money that actually moves. For a FLAT price bought at any seat count within its
capacity, that is `unitAmount` — the same figure Stripe is asked to charge.

## Actual Behavior

`totalAmount` was `0.00` on a `PAID` order while the Stripe Checkout session for
the same order reported `amount_total = 1200000` (12,000.00 PKR).

Above included capacity the same expression was wrong in the other direction:
30 seats on a 25-seat flat plan would have billed `unitAmount × 5`.

## Reproduction

1. Seed the commercial catalogue (`npm run seed:config`, `npm run seed:commercial`).
2. Sync plan prices to Stripe so checkout is reachable at all — see [[BUG-0898]].
3. Open `/subscribe?plan=starter&billingInterval=MONTH&teamSize=25` against a
   PKR market. The wizard resolves the Starter FLAT PKR MONTHLY price
   (`unitAmount 12000`, `minimumSeats 1`, `includedSeats 25`).
4. Complete the wizard, verify the owner email, and pay with Stripe test card
   `4242 4242 4242 4242`.
5. Read the order:
   `select "orderNumber", "unitAmount", "subtotalAmount", "totalAmount" from "SubscriptionOrder" where status = 'PAID'`.

## Evidence

Order row after a completed test-mode purchase:

```
orderNumber        | unitAmount | subtotalAmount | taxableAmount | taxAmount | totalAmount | requestedSeats | currency
ORD-2026-E79D1C3C  | 12000.00   | 0.00           | 0.00          | 0.00      | 0.00        | 25             | PKR
```

The matching Stripe Checkout session for that order:

```
cs_test_b1Wf4G5D0hW5  status=complete  payment=paid  amount_total=1200000  pkr  mode=subscription  livemode=false
```

The defect, at `services/api/src/modules/billing/services/subscription-order.service.ts:254`
before the fix:

```ts
const seats = Math.max(input.seatQuantity, planPrice.minimumSeats);   // 25
const billableSeats = Math.max(0, seats - planPrice.includedSeats);   // 25 - 25 = 0
const subtotalAmount = unitAmount.mul(billableSeats);                 // 12000 × 0 = 0
```

Two other places in the same module already had the rule right and disagreed
with this one:

- `billing-seat-pricing.ts::calculateSeatPricing` — `FLAT ⇒ billableSeats = 1`
- `billing-seat-pricing.ts::buildRecurringCheckoutLineItem` — `FLAT ⇒ quantity: 1`

## Root Cause

The rule "how many units of `unitAmount` does this seat count bill" was written
twice, and the copy inside `SubscriptionOrderService` did not branch on
`billingModel`. `includedSeats` on a FLAT price is a **capacity statement**, not
a discount, so subtracting it from the purchased seats is meaningless — and at
exactly the catalogue's default team size it produces zero.

This is the duplicate-source-of-truth failure the root `AGENTS.md` names in
Architecture Principle 4: the second copy compiled, so nothing caught it.

## Impact

Every self-service purchase of a FLAT plan — which is every plan the wizard
resolves for a buyer at the default team size. Revenue reporting, invoicing and
reconciliation all read `totalAmount`, so the platform's books would show zero
against real Stripe receipts. Reachable in production the moment [[BUG-0898]] is
resolved and checkout opens.

## Affected Areas

- `services/api/src/modules/billing/services/subscription-order.service.ts`
- `services/api/src/modules/billing/billing-seat-pricing.ts`
- `SubscriptionOrder` rows, and anything downstream that reads their amounts.

## Proposed Resolution

Remove the duplicate rule rather than patch one copy: export a single
`resolveBillableSeats(price, seats)` from `billing-seat-pricing.ts` and have both
`calculateSeatPricing` and `SubscriptionOrderService` call it. No ExecPlan
needed — the change is local and the semantics are already stated by the two
call sites that were correct.

## Acceptance Criteria

- A FLAT price bills one unit at, below and above its included capacity.
- A PER_SEAT price bills `seats - includedSeats` (unchanged; every PER_SEAT row
  in the catalogue has `includedSeats = 0`).
- A completed test-mode purchase writes a `totalAmount` equal to the Stripe
  session's `amount_total`.

## Regression Coverage

`services/api/src/modules/billing/billing-seat-pricing.spec.ts` —
`describe('billable seats by billing model')`. Mutation-tested: reverting
`resolveBillableSeats` to the per-seat expression fails two of its three tests.

## Dependencies

Reaching this defect through the UI requires [[BUG-0898]] to be worked around
first, because no price is sellable until it is synced to Stripe.

## Related Items

[[BUG-0898]], [[BUG-0900]], [[BUG-0902]]

## Resolution

Fixed on `agent/landing-e2e-go-live`:

- `billing-seat-pricing.ts` — new exported `resolveBillableSeats`, used by
  `calculateSeatPricing`.
- `subscription-order.service.ts:254` — calls it instead of open-coding the
  per-seat expression.

Verified by re-running the full browser checkout: order `ORD-2026-CEA572D5`
recorded `totalAmount 12000.00` against a Stripe session charging 1200000 minor
units. Full API suite: 211 suites / 1681 tests pass.

## QA Retest

Verified in this run by driving the browser journey end to end
(`e2e/drive-checkout.mjs`) and comparing the order row to the Stripe session.

## History

- 2026-08-23 — created from qa run at `1dd74a25`.
- 2026-08-23 — fixed and verified end to end.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[billing]]
- Regression — REG-236 (see the regression register)

<!-- GRAPH:END -->
