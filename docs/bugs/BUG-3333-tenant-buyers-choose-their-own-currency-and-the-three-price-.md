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

**Partially fixed — UI half only, and only the part achievable from
`apps/web` alone.** Per the owner's decision, no `PlanPrice` data was
changed. `services/api` was also out of scope for this pass (owned
concurrently by another stream) — see the caveat below on what that leaves
undone.

Fixed in `apps/web/app/(authenticated)/settings/billing/_components/billing-settings-client.tsx`
and the new `apps/web/app/(authenticated)/settings/billing/_lib/plan-presentation.ts`:

1. Currency default: `resolveDefaultCurrency` prefers the tenant's own
   `subscription.currency` when it is in the offered list; otherwise it
   prefers a currency with at least one checkout-ready price for the default
   billing cycle over the previous first-alphabetically pick. The default
   currency shown to a tenant with no subscription yet is never one in which
   nothing is purchasable, as long as any currency in the list is
   purchasable at all (see the caveat below for the case where none are).
2. The frontend now prefers the server's `availableCurrencies` (already
   returned by `GET /billing/plans`, previously computed a second time
   client-side) via a new `availableCurrencies` prop threaded through
   `load-subscription-settings.ts` and `subscription-settings-page.tsx`,
   rather than re-deriving the same list independently.
3. The Monthly/Annual control now labels the annual saving as a percentage
   (`computeAnnualSavingsPercent`, e.g. "Annual — save 17%"), computed from
   whichever plan in the current currency has both cycles, rather than
   asserting a fixed number.

**What this does not, and cannot, fix from `apps/web` alone:** true market
scoping. `GET /billing/plans` (`BillingService.getPublicPlans`) does not
accept or use a tenant market today — its `availableCurrencies` is still the
same unscoped union across all self-service prices this record's Evidence
section describes, and `createCheckoutSession` still does not validate a
`planPriceId`'s currency/market against the tenant. Item 2 of this record's
Proposed Resolution ("validate on the server... and refuse otherwise") is
API-side work and is untouched. A `TODO(BUG-3333)` in `plan-presentation.ts`
flags this for the API stream. Until that lands, this record's Acceptance
Criteria — "a tenant cannot select a price outside its own market" and "the
same plan costs the same in real terms in every currency offered" — are not
met; only "never default to a currency in which nothing is purchasable
[when a purchasable one exists]" and "the annual discount is stated as a
percentage" are.

The data question this record raised (what the PKR schedule should be, and
whether USD 2.20-6.05/seat is intended) is unresolved and remains a product
decision, unchanged from the original triage.

## QA Retest

Pending — needs confirmation that the default currency shown to a fresh
tenant is purchasable where any currency in the list is, and that the
Annual control shows a percentage. The market-scoping and server-side
validation criteria cannot be retested until the API half lands.

## History

- 2026-09-11 — created from reviewer at `caad4a56`.
- 2026-09-11 — Architect triage: `PRODUCT_DECISION` — the code fix is blocked on
  the owner deciding what the PKR schedule should be.
- 2026-09-12 — UI half fixed in `apps/web` (SESSION-0103,
  `agent/r-s1-billing-web`): smarter currency default, reuse of the server's
  `availableCurrencies`, and a labelled annual saving percentage. No price
  data changed. Server-side market scoping and checkout validation (this
  record's item 2) are unaddressed and are the API stream's work; the PKR
  schedule question remains a pending product decision.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]], [[billing]]

<!-- GRAPH:END -->
