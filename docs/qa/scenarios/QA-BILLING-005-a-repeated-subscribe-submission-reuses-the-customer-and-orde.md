---
SCENARIO_ID: QA-BILLING-005
aliases: [QA-BILLING-005]
TITLE: A repeated subscribe submission reuses the customer and order, and the server owns every money figure
AREA: subscription-orders
MODULE: billing
TYPE: DATABASE
RISK: CRITICAL
AUTOMATION_STATUS: AUTOMATED
TEST_REFERENCE: services/api/test/subscription-order.e2e-spec.ts
RELATED_BUGS: []
RELATED_REGRESSIONS: []
LAST_RUN: 2026-08-18
LAST_RESULT: PASS
CREATED_AT: 2026-08-18
UPDATED_AT: 2026-08-18
---

# QA-BILLING-005 — A repeated subscribe submission reuses the customer and order, and the server owns every money figure

## Preconditions

Real PostgreSQL with migrations through `20260818171000_subscription_order_plan_setnull`
and at least one `PlanPrice`. No Stripe credential needed.

## Steps

1. Submit the subscribe form once.
2. Submit the identical form again.
3. Submit again with a different seat quantity.
4. Submit two different company names from two generic (gmail) addresses.
5. Submit the same company from two different addresses on one corporate domain.
6. Inspect the stored money figures against the PlanPrice.
7. Inspect the tax fields.
8. Expire an unpaid order, then submit the same form again.

## Expected Result

1. One CustomerAccount in `PROSPECT` and one order in `PENDING_PAYMENT`. The
   customer exists **before** payment. `industry`, `companySize` are null and
   the surname is the real one — nothing is fabricated to fill a column.
2. The same order id is returned with `reused: true`. Still exactly one order.
3. A new order, the **same** customer. A different quantity is a different
   order, not a different customer.
4. Two separate customers. A generic domain is not evidence of a shared
   employer, and a wrong merge is unrecoverable.
5. One customer. Legal suffix, case and punctuation do not make two companies.
6. `unitAmount` equals the PlanPrice; `subtotal = unit x billable seats`;
   `taxable = subtotal - discount`; `total = taxable + tax`. The commercial
   snapshot records the price version and billable seats.
7. `taxTreatment = NOT_DETERMINED`, tax zero, rate null, and the snapshot
   reason names why. **Not** `NOT_APPLICABLE` — nothing has been determined,
   and claiming otherwise would be a false tax position.
8. A **new** order is created. The expired order released its submission hash;
   holding it would make that company and plan unbuyable forever.

## Notes

Created 2026-08-18 at `2051133`.
