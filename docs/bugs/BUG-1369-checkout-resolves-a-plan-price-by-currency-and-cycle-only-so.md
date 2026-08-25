---
ID: BUG-1369
aliases: [BUG-1369]
Title: Checkout resolves a plan price by currency and cycle only, so it can quote a billing model the plans page never advertises
Status: OPEN
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-25
DetectedInSha: b5e365cb
AffectedModules: [apps/landing]
OwnerAgent: architect
ArchitectDisposition: TRIAGE_REQUIRED
QAReport: docs/qa/runs/2026-08-25-landing-fixes-verification.md
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-25
UpdatedAt: 2026-08-25
ResolvedAt:
---

# BUG-1369 — Checkout resolves a plan price by currency and cycle only, so it can quote a billing model the plans page never advertises

## Summary

`/plans` and `/subscribe` answer "what does this plan cost" with two different
resolvers. `/plans` renders the **per-seat** price; `/subscribe` calls
`findPlanPrice`, which matches on currency and billing cycle alone and returns
the *first* match — ignoring `billingModel` entirely. While only per-seat prices
were sellable the two agreed by accident. As soon as a `FLAT` price exists for
the same currency and cycle, checkout quotes the flat one and the two pages
disagree about the price of the same selection.

## Expected Behavior

The price shown on `/subscribe` is the price advertised on `/plans` for the same
plan, currency and billing cycle. If the catalogue holds more than one billing
model, one of them is the published one and both surfaces resolve to it.

## Actual Behavior

`/plans` advertises per-employee pricing; `/subscribe` quotes a flat
subscription. At 25 seats the two differ by roughly 25%, and they describe the
purchase differently — "per active employee / year" against "Billed as one
subscription."

## Reproduction

Live on production at the time of writing:

1. Open `https://www.dijipeople.com/plans` as a QAR visitor.
2. Read Starter — monthly and annual.
3. Open `https://www.dijipeople.com/subscribe?plan=starter&billingInterval=MONTH&teamSize=25`,
   then the same with `YEAR`.

| Selection | `/plans` advertises | `/subscribe` quotes |
|---|---|---|
| Starter, monthly, 25 seats | QAR 8 per active employee / month → **QAR 200** | **QAR 249**, "Billed as one subscription." |
| Starter, annual, 25 seats | QAR 80 per active employee / year → **QAR 2,000** | **QAR 2,490**, "Billed as one subscription." |

## Evidence

The resolver, at
[`apps/landing/lib/plans.ts`](../../apps/landing/lib/plans.ts) —
`findPlanPrice`:

```ts
return (
  plan.prices.find(
    (price) =>
      price.currency.toUpperCase() === currency.toUpperCase() &&
      price.billingCycle === billingCycle,
  ) ?? null
);
```

Two of the three dimensions that identify a price are matched. `billingModel`
(`PER_SEAT` | `FLAT`) is not, so the result depends on the order
`/api/public/plans` happens to return prices in — which is not a contract.

Its comment is careful about the currency dimension for exactly the right
reason ("Quoting a plan in a currency the visitor's market does not use is worse
than showing no price"). The same argument applies to the billing model and was
not extended to it.

## Root Cause

**One question, two resolvers.** `/plans` uses the presentation layer in
`plan-presentation.ts`, which selects the per-seat price deliberately; the
wizard uses `findPlanPrice`, which selects positionally. They agreed only
because the catalogue never had two sellable models for one currency and cycle.

This was **latent until 2026-08-25**, when the QAR prices were synced to Stripe
to make production checkout reachable. That sync made the `FLAT` rows
checkout-ready alongside the per-seat ones, and the disagreement became visible
immediately. The sync exposed the defect; it did not create it. Any future
currency that gains a second sellable model reproduces it.

## Impact

Reachable in production now, for every QAR visitor — currently the only market
with sellable prices. The checkout page quotes a higher figure than the one the
site advertises, and describes the basis of the charge differently. That is the
same class of defect as [[BUG-1302]], from a different cause: the price shown
before payment is not the price the rest of the site promised.

It also silently defeats the seat model. A buyer who chose DijiPeople because
pricing "follows your headcount rather than a band you have to grow into" —
the plans page's own words — is quoted a flat fee at the last step.

Severity HIGH rather than CRITICAL only because the amounts are close enough to
be plausible: nothing looks broken, which is what makes it worth catching in a
test rather than by eye.

## Affected Areas

- `apps/landing/lib/plans.ts` — `findPlanPrice`.
- `apps/landing/app/subscribe/subscribe-form.tsx` — its only consumer.
- Any market whose catalogue holds both a `FLAT` and a `PER_SEAT` price for one
  currency and cycle. QAR does, today, in production.

## Proposed Resolution

Two options, and the choice is a product decision as much as an engineering one:

- **Make the resolvers agree in code.** Give `findPlanPrice` the billing model
  as a third dimension, sourced from the same place `/plans` uses, so both
  surfaces resolve identically whatever the catalogue holds. This is the durable
  fix: it survives a future currency gaining a second model, and it removes the
  dependence on API response ordering.
- **Make the catalogue unambiguous.** Deactivate the `FLAT` prices, which
  nothing advertises, leaving one sellable model per currency and cycle. Faster,
  and it restores the previous behaviour immediately, but it leaves the code
  free to make the same mistake the next time two models coexist.

Doing both is the honest answer: the catalogue change stops the bleeding today,
the code change stops it recurring.

## Acceptance Criteria

- For every plan, currency and billing cycle, `/subscribe` quotes the same
  amount and the same billing basis as `/plans`.
- The resolution does not depend on the order `/api/public/plans` returns prices.
- A test seeds both a `FLAT` and a `PER_SEAT` price for one currency and cycle
  and asserts the two surfaces agree — that case does not exist today, which is
  why this shipped.

## Regression Coverage

None yet. The test named above must fail against the current `findPlanPrice`.

## Dependencies

Relates to [[BUG-0027]] — "admin plan pricing and checkout pricing come from
different models" — which describes the same divergence from the admin side.
Worth resolving together; they may be one defect seen from two ends.

## Related Items

- [[BUG-1302]] — the other "price shown is not the price charged" defect, fixed
  the same day.
- [[BUG-0027]] — the admin-side view of the same divergence.
- [[BUG-0898]] — the sync that exposed this.

## Resolution

Not yet fixed.

## QA Retest

Pending. Retest with the table in Reproduction, which is a live production
comparison and needs no fixture.

## History

- 2026-08-25 — found immediately after syncing QAR prices to production Stripe
  to make checkout reachable. The sync was authorised and correct; it made a
  latent divergence visible within minutes. Recorded before completing the
  production test purchase, which was deliberately **not** carried out at a
  price the site does not advertise.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[landing-architecture]]

<!-- GRAPH:END -->
