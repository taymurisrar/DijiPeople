---
ID: BUG-1378
aliases: [BUG-1378]
Title: The public plans endpoint publishes sales-assisted internal pricing to anonymous visitors
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: SECURITY
Source: QA_RUN
DetectedDate: 2026-08-25
DetectedInSha: b5e365cb
AffectedModules: [services/api/src/modules/billing]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-25-landing-fixes-verification.md
RegressionId: REG-259
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-25
UpdatedAt: 2026-08-25
ResolvedAt: 2026-08-25
---

# BUG-1378 — The public plans endpoint publishes sales-assisted internal pricing to anonymous visitors

## Summary

`GET /api/public/plans` selected a plan's prices with `where: { isActive: true }`
and nothing else. It therefore returned rows whose `salesModel` is
`SALES_ASSISTED` — flat rates that exist for customers onboarded by hand and
that the owner's stated rule says must never be quoted to a visitor — to any
anonymous caller, and computed `checkoutReady` for them.

`/api/public/commercial-config`, over the same rows, has always applied the
channel rule correctly. One rule, two readers, and only one of them enforced it.

**And neither public write path checked it at all.** `startPublicOnboarding` and
`createPublicSubscriptionCheckout` both accept a client-supplied `planPriceId`
and validated only that the price was real, active and published — so an
anonymous caller who knew the id of an internal flat price could open an order
against it and be sold it. Those ids were public until this fix, published by
the very endpoint above.

## Expected Behavior

Both public endpoints answer "what may this visitor be sold" the same way. A
price a self-service visitor cannot buy is not published to them, and is
certainly not marked purchasable.

## Actual Behavior

`/public/plans` published every active price regardless of channel. Internal
flat pricing was visible to anyone who requested the endpoint, and — once the
prices were synced to Stripe — sellable.

## Reproduction

Before the fix, against production:

```bash
curl -s https://api.dijipeople.com/api/public/plans
```

Starter returned four active QAR prices: `MONTHLY FLAT 249`, `MONTHLY PER_SEAT
8`, `ANNUAL FLAT 2490`, `ANNUAL PER_SEAT 80`. The two flat rows carry
`SALES_ASSISTED`.

```bash
curl -s https://api.dijipeople.com/api/public/commercial-config
```

The same plan returned exactly two offers — `MONTH PER_SEAT 8` and `YEAR
PER_SEAT 80`. The flat rows are correctly absent.

## Evidence

The selection, in `getPublicPlans()` at
[`billing.service.ts`](../../services/api/src/modules/billing/services/billing.service.ts):

```ts
prices: {
  where: { isActive: true },
  orderBy: [{ currency: 'asc' }, { billingCycle: 'asc' }],
},
```

`isActive` is the only predicate. Compare
[`commercial-offer.resolver.ts`](../../services/api/src/modules/billing/commercial-offer.resolver.ts),
which narrows by channel *before* selecting:

```ts
if (channel !== 'SELF_SERVICE') return true;
return (
  narrowestSalesModel(plan.salesModel, price.salesModel) ===
  CommercialSalesModel.SELF_SERVICE
);
```

The rule is already written down, in
[`flat-pricing-is-internal.spec.ts`](../../services/api/src/modules/billing/flat-pricing-is-internal.spec.ts),
as the owner's commercial policy:

> the website, the plans page and self-service checkout show per-seat prices
> only. Flat pricing exists for customers onboarded by hand, where somebody
> decides a flat rate suits them, and must never be quoted to a visitor.

That spec covers the resolver. It did not cover this endpoint, and nothing else
did either.

## Root Cause

The channel rule was implemented where it was first needed — the commercial
config — and `/public/plans` predates it. Both read `PlanPrice` directly, so
adding the rule to one did not add it to the other. Nothing in the type system
or the tests connected them, and the two agree in every environment where a plan
has only per-seat prices, which is most of them.

## Impact

Two distinct harms, and the second is how it was found.

1. **Commercial confidentiality.** Hand-negotiated flat rates were readable by
   anyone, without authentication. `/public/plans` is `@Public()` and
   `no-store`, so this was a live, uncacheable disclosure of internal pricing.
2. **Internal prices became sellable.** `deriveCheckoutReadiness` was computed
   for these rows, so once the QAR prices were synced to Stripe on 2026-08-25
   the flat rows were `checkoutReady: true`. The subscribe wizard reads this
   endpoint, found two candidates for one currency and cycle, and quoted the
   internal one — QAR 249 against an advertised QAR 8 per active employee. That
   is [[BUG-1369]], which is this defect's symptom rather than a separate cause.
3. **Anyone holding an id could buy one deliberately.** Neither public write
   path checked the channel, so the exposure was not limited to what the wizard
   happened to select. A caller who kept an id from the listing — and the
   listing was public — could open an order against an internal rate at will.

Reachable in production for as long as the endpoint has existed. The disclosure
was live throughout; the sellability became live only when prices were synced.

Typed `SECURITY` for the disclosure and for (3). It is not an authorization
*bypass* — no guard was circumvented, and the endpoint is meant to be public —
but the channel rule is a commercial access control and it was absent from
every path that enforces one.

## Affected Areas

- `services/api/src/modules/billing/services/billing.service.ts` —
  `getPublicPlans()`.
- Every consumer of `/public/plans`: the landing subscribe wizard, and anything
  else reading the public catalogue.
- Not `/public/commercial-config`, which was always correct.

## Proposed Resolution

Apply the same rule, reusing `narrowestSalesModel` rather than testing
`billingModel` — the spec is explicit that a second, differently-shaped rule for
one decision is itself the hazard.

## Acceptance Criteria

- `/public/plans` returns no price whose narrowed sales model is not
  `SELF_SERVICE`.
- A `CUSTOM_ONLY` or `SALES_ASSISTED` **plan** publishes no prices at all, even
  where a price row says `SELF_SERVICE`.
- The per-seat prices a visitor is meant to see are unaffected.

## Regression Coverage

`REG-259`, added to `flat-pricing-is-internal.spec.ts` so both readers of the
rule are asserted in one file.

## Dependencies

None.

## Related Items

- [[BUG-1369]] — the symptom: checkout quoting the internal price.
- [[BUG-0027]] — admin and checkout pricing coming from different models.
- [[BUG-0898]] — the price sync that made the leaked rows sellable.

## Resolution

Fixed in **two** places, and the second is the one that matters.

**The read path.** `getPublicPlans()` now narrows a plan's prices with the same
`narrowestSalesModel` predicate the offer resolver uses, before both the
billing-cycle map and the price mapping are built — so a non-self-service price
is absent from the response entirely rather than present and unpurchasable.

**The write path.** Stopping the listing fixes nothing an attacker cares about.
`planPriceId` arrives from the client on both public write paths —
`startPublicOnboarding` and `createPublicSubscriptionCheckout` — and each
validated that the price was real, active and published without ever checking
that *this caller* was entitled to buy it. Those ids were published by
`/public/plans` until this change, so they are known.

**A read filter with no matching write check is a listing preference, not an
access control.** Both paths now call a shared
`assertSellableToAnonymousVisitor` before anything is created, which throws
`NotFoundException` with the same message as an unknown id — a distinct error
would confirm that a price exists and is merely off-limits, which tells an
enumerator exactly which ids are worth having.

Reusing the resolver's helper rather than writing a `billingModel` check is
deliberate throughout, and is the point: the defect was two rules for one
decision, and a second rule shaped differently would have reproduced it.

Deliberately **not** applied to the authenticated `createCheckoutSession`. That
path is a tenant administrator acting on their own subscription behind
`BILLING_MANAGE`, not an anonymous visitor, and a tenant already on a
hand-negotiated flat plan may legitimately need to act on it. Widening the rule
to that path is a separate commercial decision, not a tidy-up.

## QA Retest

Verified in `docs/qa/runs/2026-08-25-landing-fixes-verification.md`.

Four unit cases assert the predicate directly, including the narrowing
direction: a `SALES_ASSISTED` price under a `SELF_SERVICE` plan is excluded, a
`SELF_SERVICE` price under a `CUSTOM_ONLY` plan is excluded, and the per-seat
case is unaffected.

Retest on production after deployment by requesting `/public/plans` and
confirming Starter returns two QAR prices rather than four, and that
`/public/commercial-config` is unchanged.

## History

- 2026-08-25 — found while fixing [[BUG-1369]]. The frontend symptom was
  traceable to a genuine backend defect: the public catalogue was publishing
  rows the commercial rule already excluded everywhere else. Fixed and closed
  the same day.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[billing]]
- Regression — REG-259 (see the regression register)

<!-- GRAPH:END -->
