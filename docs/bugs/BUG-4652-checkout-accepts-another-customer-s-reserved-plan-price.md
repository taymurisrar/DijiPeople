---
ID: BUG-4652
aliases: [BUG-4652]
Title: A reserved or out-of-window plan price could be quoted, checked out or ordered by a caller not entitled to it
Status: FIXED
Severity: HIGH
Priority: P1
Type: AUTHORIZATION
Source: QA_RUN
DetectedDate: 2026-11-22
DetectedInSha: a802ab9d
AffectedModules: [billing]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-705
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-11-22
UpdatedAt: 2026-11-22
ResolvedAt:
---

# BUG-4652 — A reserved or out-of-window plan price could be quoted, checked out or ordered by a caller not entitled to it

## Summary

`BillingService.createCheckoutSession` (`POST /billing/checkout-sessions`) loads a price by id and checks active, published, sellable and market, but never that the price's plan may be assigned to the caller's customer. A tenant that knew another customer's reserved plan price id could start a checkout for it. Found by the independent QA review of the BUG-4638 fix, which had closed only the read-only quote path.

## Expected Behavior

A price on a plan reserved for another customer (or outside its validity window) is refused exactly as an unknown price is, and no invoice or checkout is created.

## Actual Behavior

By code read, the request proceeded to provider selection and checkout creation. Not executed against a payment provider.

## Reproduction

1. Two tenants in one market; BETA's customer has a CUSTOM plan reserved to it with a PUBLISHED price.
2. As an ALPHA admin POST `/billing/checkout-sessions` with `{ planPriceId: <BETA reserved price>, seatQuantity: 3 }`.
3. Without the guard the request is not refused for eligibility (the mutation test shows HTTP 400 from a later check instead of the 404 refusal).

## Evidence

- `services/api/src/modules/billing/services/billing.service.ts` `createCheckoutSession`: no call to `assertPlanAssignableToTenant`.
- Mutation: removing the new guard line turns `billing-cross-tenant.e2e-spec.ts` ("BUG-4652") red (400 instead of 404); restoring it gives 77/77.

## Root Cause

Same as BUG-4638: eligibility was applied to plan MOVES only, and each other path that takes a price id (quote, checkout) had to remember it.

## Impact

A tenant could start paying for, and so potentially take, a plan negotiated for another customer, at that customer's price. Needs the price id and a published price in the caller's market. Not known to have been exploited; production was not tested.

## Affected Areas

billing: seat quote and authenticated checkout (tenant path), and the ANONYMOUS public paths: `GET /public/payment-methods`, `POST /public/onboarding`, `POST /public/subscribe`, and `SubscriptionOrderService.openOrder`, which a service can reach without a controller.

## Proposed Resolution

Two policies, each in one place. Tenant path: `assertTenantMayBuyPlan` (quote and checkout), which exempts the tenant's current plan. Anonymous path: `services/api/src/modules/billing/public-purchase-eligibility.ts`, which requires an active published plan and price, both validity windows, a self-service sales model, a market-scoped price, and a plan NOT reserved for a customer; the refusal is the same `NotFoundException("Plan price not found.")` an unknown id gets. Applied to payment options, onboarding, subscribe and `openOrder`. The public listing also now honours the price's own validity window so it never offers what a purchase refuses. Done.

## Acceptance Criteria

- Anonymous payment-option lookup, onboarding and subscribe for a reserved, future-dated, expired, sales-assisted, draft, inactive or unscoped price are 404 with the unknown-id message, create no order, customer account, e-mail record or outbox event, and name nothing about the plan.
- `openOrder` called directly refuses the same set.
- A valid standard or custom public offer still works end to end.
- A tenant already on a reserved or grandfathered plan can still quote and check out its own plan.

## Regression Coverage

`services/api/test/public-purchase-eligibility.e2e-spec.ts` (58 tests: controls, 13 refused price shapes on three anonymous routes, a direct `openOrder` caller), `services/api/src/modules/billing/public-purchase-eligibility.spec.ts` (pure policy table), `billing-seat-quote.spec.ts`, and `billing-cross-tenant.e2e-spec.ts` (tenant checkout). Mutation-verified: removing the reservation clause turns 4 tests red; removing the `openOrder` guard turns 13 red. REG-705, QA-BILLING-051.

## Dependencies

Other records, decisions or infrastructure this waits on.

## Related Items

Wikilinks to related bugs, items, modules and decisions — for the Obsidian graph.

## Resolution

Fixed on branch `agent/dependency-alert-remediation` (SESSION-0137, WP3). Also found while testing: draft and unscoped prices answered through `AppError` with the text "Plan price not found" (no full stop, plus an error code) while unknown ids answered "Plan price not found.", which let an enumerator tell existing-but-unsellable ids from unknown ones. All anonymous refusals now come from the one policy and are identical.

Not changed: the authenticated tenant path still allows an unreserved SALES_ASSISTED custom plan to be quoted (it cannot be MOVED onto; `PlanChangeService` refuses that). Recorded, low impact.

**Independent review (2026-11-22): APPROVE WITH CHANGES, no blockers.** Confirmed: every anonymous route that takes a price id is behind the policy; `openOrder` has exactly two callers, both public; no super-admin, lead or partner flow legitimately opens an order for a reserved or sales-assisted plan, so none breaks; refusal is the same exception class and message as an unknown id, with no write or provider call before it.

Open items for the Architect, not defects:
- **Legacy orders.** An order opened for a reserved price BEFORE this fix is reusable (the idempotent lookup precedes the policy) and can progress through order-bound routes (bank-transfer issue-invoice, verify-email checkout). A one-off read-only query on the target database should list open `SubscriptionOrder` rows whose price's plan has `eligibleCustomerAccountId` set; expire any found. Not run: no production access.
- **Authenticated tenant path** (`assertTenantMayBuyPlan`) checks the plan, not the price's own window or sales model, so a tenant could still buy an expired or SALES_ASSISTED price on a plan it may use. The code comment records widening that as a separate commercial decision; flagged for owner decision.
- **Behaviour change:** `getPublicPlans` also backs the authenticated `/billing/plans`, so the price-window filter applies there too.
- **Test isolation:** `plan-draft`, `plan-inactive`, `price-inactive`, `assisted`, `price-assisted`, `price-draft`, `price-unscoped` and `reserved-assisted` would also be refused by older inline checks; the cases that exercise only the new policy are `reserved-self`, `plan-future`, `plan-expired`, `price-future`, `price-expired`, and the pure unit spec isolates every dimension. Byte-identity of the refusal with an unknown id is established statically through the shared exception path; the e2e app has no production exception filter.

## QA Retest

QA-BILLING-051 on the isolated database, 2026-11-22: public suite 58/58 with the fix; 4 and 13 failures with the two guards removed in turn. Independent review of the public-path change pending.

## History

- 2026-11-22 — created from qa run at `a802ab9d`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[billing]]
- Regression — REG-705 (see the regression register)

<!-- GRAPH:END -->
