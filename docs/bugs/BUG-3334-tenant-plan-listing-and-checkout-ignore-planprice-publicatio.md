---
ID: BUG-3334
aliases: [BUG-3334]
Title: Tenant plan listing and checkout ignore PlanPrice publication status and market scoping
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: SECURITY
Source: REVIEWER
DetectedDate: 2026-09-11
DetectedInSha: caad4a56
AffectedModules: [services/api/src/modules/billing]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport:
RegressionId:
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-11
ResolvedAt:
---

# BUG-3334 — Tenant plan listing and checkout ignore PlanPrice publication status and market scoping

## Summary

`PlanPrice` carries two gates of its own — `publicationStatus`, which defaults to
`DRAFT`, and `marketId`, which the schema documents as failing closed when unset.
The public website path enforces both. The **tenant** path enforces neither.

`BillingService.getPublicPlans` selects prices with `where: { isActive: true }`
and nothing else, then computes `isCheckoutReady` for each. Every checkout guard
in the same file tests `planPrice.plan.publicationStatus` — the *plan's* gate,
never the *price's*. So a price row that a platform administrator has created but
not published, or has scoped to a market the tenant is not in, is listed to
tenants and can be bought if its Stripe row happens to be synced.

## Expected Behavior

The same publication and market rules apply wherever a price is offered. A DRAFT
price is not quotable. An unscoped or foreign-market price is not sellable to
this tenant.

## Actual Behavior

The price-level gates are absent from the tenant listing and from every tenant
checkout guard. The plan-level gate is present, so the failure only shows when a
published plan carries an unpublished or wrongly-scoped price — which is exactly
what a staged price change looks like while it is being prepared.

## Reproduction

Requires platform-admin access to create the state; not reproduced against
production data in this review.

1. On a `PUBLISHED` plan, add a `PlanPrice` with `isActive: true`,
   `salesModel: SELF_SERVICE` and the default `publicationStatus: DRAFT`.
2. Sync it to Stripe so `deriveCheckoutReadiness` returns ready.
3. Open `/settings/subscription/plans` as a tenant administrator. The draft price
   is listed and offered.

## Evidence

The tenant listing, `services/api/src/modules/billing/services/billing.service.ts:118-122`:

```ts
prices: {
  where: { isActive: true },
  orderBy: [{ currency: 'asc' }, { billingCycle: 'asc' }],
},
```

The sibling resolver, which does it correctly —
`services/api/src/modules/billing/commercial-offer.resolver.ts:179` and `:205`:

```ts
if (market.publicationStatus !== CommercialPublicationStatus.PUBLISHED)
...
price.publicationStatus === CommercialPublicationStatus.PUBLISHED &&
```

`services/api/src/modules/billing/services/commercial-config.service.ts:185-194`
applies the same price-level filter.

Every tenant-side guard checks only the plan —
`billing.service.ts:330`, `:416`, `:947` are all
`planPrice.plan.publicationStatus !== PUBLISHED`.

`marketId` does not appear anywhere in `billing.service.ts`. The schema comment at
`services/api/prisma/schema.prisma:4026-4031` states the intent this path does
not honour:

> Nullable because the expand phase must not invalidate prices that existed
> before markets did — a null market means "not yet scoped", and resolution
> treats it as unavailable for self-service rather than as a wildcard. Failing
> closed is the point: an unscoped price must not silently become purchasable in
> every country.

## Root Cause

Markets and price-level publication were added to the commercial model after the
tenant billing endpoints were written, and the retrofit reached the public
resolver and the commercial-config service without reaching
`getPublicPlans` and the tenant checkout guards. The rule now exists in three
places and one copy is behind.

## Impact

Not demonstrated against live data — how many production `PlanPrice` rows are
`DRAFT` or unscoped was not measured, because that needs database access this
review did not take. The exposure is bounded by needing a synced Stripe price, so
it is a fail-open gate rather than an open door. Rated MEDIUM on that basis;
raise it if the live rows say otherwise.

The visible consequence today is the currency dropdown offering every schedule to
every tenant — see [[BUG-3333]].

## Affected Areas

- `GET /billing/plans`
- `POST /billing/checkout-sessions`
- `BillingService.getPublicPlans`, `createCheckoutSession`,
  `startPublicOnboarding`, `createPublicSubscriptionCheckout`

## Proposed Resolution

No ExecPlan needed.

1. Add `publicationStatus: PUBLISHED` to the price filter in `getPublicPlans`.
2. Add the price's own publication check to every tenant checkout guard alongside
   the existing plan check.
3. Scope by `marketId` on the tenant path, resolving the tenant's market the way
   `resolveCommercialOffer` resolves a visitor's, and treat a null market as
   unavailable.
4. Best done by calling one shared predicate rather than adding a fourth copy of
   the rule — the divergence recorded here is what three copies produced.

## Acceptance Criteria

- A `DRAFT` `PlanPrice` never appears in `GET /billing/plans`.
- A checkout request naming a `DRAFT`, unscoped, or foreign-market price is
  refused.
- The tenant path and `resolveCommercialOffer` agree on every price, tested
  against the same fixtures.

## Regression Coverage

Needs a REG entry: a DRAFT price on a PUBLISHED plan is absent from the tenant
listing and refused at checkout.

## Dependencies

Fix alongside item 2 of [[BUG-3333]]; both add the missing market check to the
same call path.

## Related Items

[[BUG-3330]], [[BUG-3331]], [[BUG-3332]], [[BUG-3333]], [[BUG-3335]], [[BUG-3336]]

## Resolution

Not yet fixed.

## QA Retest

Pending.

## History

- 2026-09-11 — created from reviewer at `caad4a56`.
- 2026-09-11 — Architect triage: `FIX_NOW`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[billing]]

<!-- GRAPH:END -->
