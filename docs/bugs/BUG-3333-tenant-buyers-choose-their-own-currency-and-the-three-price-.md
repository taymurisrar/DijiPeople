---
ID: BUG-3333
aliases: [BUG-3333]
Title: Tenant buyers choose their own currency and the three price schedules are not equivalent
Status: PRODUCT_DECISION
Severity: HIGH
Priority: P1
Type: DATA_INTEGRITY
Source: REVIEWER
DetectedDate: 2026-09-11
DetectedInSha: caad4a56
AffectedModules: [apps/web, services/api/src/modules/billing]
OwnerAgent: architect
ArchitectDisposition: PRODUCT_DECISION
QAReport:
RegressionId:
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-12
ResolvedAt:
---

# BUG-3333 — Tenant buyers choose their own currency and the three price schedules are not equivalent

> **Architect triage, 2026-09-11 — `PRODUCT_DECISION`.** The engineering half is
> clear and small. What the PKR schedule is *supposed* to be is the owner's call,
> and the fix cannot be specified until that is answered.

## Summary

The Plans screen offers the buyer a free choice of currency from a dropdown
listing every currency any plan has a price in — PKR, QAR and USD. Nothing scopes
that list to the tenant's market, and nothing on the checkout path validates the
chosen currency against the tenant either.

The three schedules are not equivalent. QAR and USD are pegged exactly at
3.636 across all three plans, so they clearly came from one schedule. PKR does
not belong to it: PKR 300 against USD 2.20 implies **136 PKR per USD**, roughly
half the market rate. Selecting PKR is therefore about a 50% discount on the same
product, available from a dropdown with no explanation and no gate.

Which of the two is wrong — PKR priced too low, or USD and QAR priced too high —
is a commercial question this record does not try to answer. The absolute figures
are worth a second look too: Enterprise at **USD 6.05 per seat per month** for a
full HRM with payroll is low enough to suggest placeholder data reached
production.

## Expected Behavior

A tenant is quoted in the currency of the market it belongs to. Where a choice is
genuinely offered, the alternatives represent the same commercial value, and the
server refuses a price whose market does not match the buyer.

## Actual Behavior

Full matrix read from the rendered DOM on 2026-09-11, `dijipeople-demo`:

| Plan | PKR / mo | QAR / mo | USD / mo | PKR / yr | QAR / yr | USD / yr |
|---|---|---|---|---|---|---|
| Starter | 300.00 | 8.00 | 2.20 | 3,000.00 | 80.00 | 22.00 |
| Growth | 550.00 | 14.00 | 3.85 | 5,500.00 | 140.00 | 38.50 |
| Enterprise | 900.00 | 22.00 | 6.05 | 9,000.00 | 220.00 | 60.50 |

Checkout readiness is also uneven, and this is what a buyer actually runs into:

| Currency | Starter | Growth | Enterprise |
|---|---|---|---|
| PKR | current plan | not available | not available |
| QAR | current plan | **Subscribe** | **Subscribe** |
| USD monthly | current plan | not available | not available |
| USD annual | not available | not available | not available |

The default currency is PKR, under which **no plan can be bought at all**. The
only purchasable prices on the entire screen are Growth and Enterprise in Qatari
Riyal, and nothing tells the buyer to change the dropdown to find them.

Annual is exactly ten times monthly in every currency — a genuine 17% saving for
paying yearly — and the Monthly/Annual control says nothing about it.

## Reproduction

1. Open `/settings/subscription/plans`. Note the currency dropdown lists PKR, QAR
   and USD, and defaults to PKR.
2. In PKR, every plan other than the current one reads "This plan is not
   available for online checkout yet."
3. Change the currency to QAR. Growth and Enterprise now offer enabled Subscribe
   buttons.
4. Compare PKR and USD figures for the same plan and cycle.

## Evidence

The currency list is derived client-side from whatever prices arrived, with no
tenant input —
`apps/web/app/(authenticated)/settings/billing/_components/billing-settings-client.tsx:116-122`:

```tsx
const currencies = useMemo(() => {
  const values = new Set<string>();
  for (const plan of plans) {
    for (const price of plan.prices) values.add(price.currency);
  }
  return [...values].sort();
}, [plans]);
```

The API returns an `availableCurrencies` array the component ignores, so the same
list is derived in two places.

The server accepts whichever `planPriceId` is sent.
`BillingService.createCheckoutSession` validates the price is active, the plan is
active and published, and that the price is checkout-ready. It does not compare
the price's currency or market against the tenant —
`services/api/src/modules/billing/services/billing.service.ts:928-968`.

The initial selection is the first currency in an arbitrary order rather than the
tenant's own — same component, `resolveInitialCurrency`, lines 1011-1017. The
tenant's actual subscription currency is available on `subscription.currency` and
is not consulted.

## Root Cause

Two separate gaps meeting. The screen treats currency as a display preference
rather than as a property of the buyer, and the price data for PKR was populated
independently of the USD/QAR schedule. `PlanPrice.marketId` exists precisely to
scope this and is not read on this path — see [[BUG-3334]].

## Impact

Reachable in production by any tenant administrator. Two distinct harms:

- **Revenue.** The cheapest currency is roughly half price in real terms and is
  selectable in one click.
- **Conversion.** The default currency sells nothing. A buyer who does not think
  to change a dropdown labelled "Currency" concludes the product cannot be
  bought.

## Affected Areas

- `/settings/subscription/plans`
- `GET /billing/plans`, `POST /billing/checkout-sessions`
- `PlanPrice` rows for PKR across all three plans
- The public website path is **not** affected in the same way:
  `resolveCommercialOffer` narrows by market before selecting.

## Proposed Resolution

Two independent pieces.

**Data — needs the owner's answer first.** Decide what the PKR schedule should
be, and whether USD 2.20 to 6.05 per seat is the intended list price at all.
Correct the `PlanPrice` rows accordingly. Do not run `seed:commercial` against
production to do it; that catalog and the live schedules already disagree.

**Code — no ExecPlan needed.**

1. Resolve the offered currency from the tenant's market rather than from the
   union of all prices, defaulting to `subscription.currency` where one exists.
2. Validate on the server that the requested `planPriceId` belongs to the
   tenant's market before creating a checkout session, and refuse otherwise.
3. If a currency choice is deliberately kept, keep the schedules at parity and
   say which currency the tenant will actually be charged in.
4. Label the annual saving on the Monthly/Annual control.
5. Do not default to a currency in which nothing is purchasable.

## Acceptance Criteria

- A tenant cannot select a price outside its own market, in the UI or by posting
  a `planPriceId` directly.
- The same plan costs the same in real terms in every currency offered for it.
- The default currency and cycle presented to a tenant contain at least one
  purchasable plan, or the screen states why none is purchasable.
- The annual discount is stated as a percentage or an amount.

## Regression Coverage

Needs a REG entry: a checkout request for a price whose market does not match the
tenant is refused; and a schedule-parity check over `PlanPrice` rows.

## Dependencies

[[BUG-3334]] covers the missing publication and market gate on the same endpoint
and should be fixed together with item 2 above.

## Related Items

[[BUG-3330]], [[BUG-3331]], [[BUG-3332]], [[BUG-3334]], [[BUG-3335]], [[BUG-3336]]

## Resolution

Partially fixed — **server half only**, item 2 of the Proposed Resolution.
Still `PRODUCT_DECISION`: the PKR/QAR/USD schedule question is unresolved and
out of scope for this change; no `PlanPrice` row was touched and
`seed:commercial` was not run.

`BillingService.createCheckoutSession` now refuses a checkout whose
`planPriceId` does not belong to the tenant's own market, closing exactly the
gap this record's evidence names — the server accepted whichever
`planPriceId` was sent (`billing.service.ts:928-968` at the time this was
written) with no comparison against the tenant at all. The market comparison
is `CommercialConfigService.resolveMarketForTenant(tenantId)` against
`planPrice.marketId`; see [[BUG-3334]]'s resolution for the shared predicate
and the resolution order (subscription's current price → provisioning order →
platform default). A tenant can no longer buy a foreign-market price by
posting its id directly, in the currency dropdown or otherwise.

Not done, and deliberately left to the owner/UI decision:

- Item 1 (resolve the offered currency from the tenant's market rather than
  the union of all prices) — the **tenant-scoped listing** landed as part of
  [[BUG-3334]] (`getPublicPlans({tenantId})` now scopes to the tenant's
  market), which narrows the currency choice to one market's schedule as a
  side effect. Defaulting to `subscription.currency` and the UI's dropdown
  behaviour are the other agent's `apps/web` work.
- Items 3-5 (schedule parity, annual-saving label, default-currency
  purchasability) — commercial/UI decisions, not touched.
- The PKR/USD/QAR pricing question itself — explicitly out of scope; the
  owner has not decided what the PKR schedule should be.

## QA Retest

Pending — needs a QA pass posting a foreign-market `planPriceId` directly to
`POST /billing/checkout-sessions` and confirming refusal; covered today by
`services/api/src/modules/billing/services/billing-price-market-scoping.spec.ts`.

## History

- 2026-09-11 — created from reviewer at `caad4a56`.
- 2026-09-11 — Architect triage: `PRODUCT_DECISION` — the code fix is blocked on
  the owner deciding what the PKR schedule should be.
- 2026-09-12 — Server-side market validation on `POST /billing/checkout-sessions`
  landed (item 2 only), alongside [[BUG-3334]]. Status remains
  `PRODUCT_DECISION`: the pricing-schedule question is still open and no price
  data changed.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]], [[billing]]

<!-- GRAPH:END -->
