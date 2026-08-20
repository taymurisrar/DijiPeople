---
ID: ITEM-0072
aliases: [ITEM-0072]
Title: Six published self-service prices with no market and a zero amount exist on every database
Type: TECH_DEBT
Status: DEFERRED
Priority: P3
Severity: LOW
AffectedModules: [billing, super-admin]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: DEFER
CreatedAt: 2026-08-20
UpdatedAt: 2026-08-20
RelatedBug:
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: post-launch
BlockedBy: 
---

# ITEM-0072 — Six published self-service prices with no market and a zero amount exist on every database

## Summary

A database built from the migration chain alone — before any seed runs —
contains three plans and **six `PlanPrice` rows that are `isActive`,
`PUBLISHED`, `SELF_SERVICE`, priced at `0.00`, and attached to no market**.

They are created by two migrations acting in sequence, neither of which is
wrong on its own:

1. `20260410094500_billing_plan_enforcement_foundation` inserts `starter`,
   `growth` and `enterprise` directly, without price columns, so
   `monthlyBasePrice` and `annualBasePrice` default to `0`.
2. `20260523120000_stripe_billing_foundation` backfills a `PlanPrice` from each
   plan's legacy base price — faithfully copying the zero, and with no market
   because markets did not exist yet.

## Why It Matters

Not exploitable, and the reasons are worth stating precisely because they are
what keeps the severity at LOW rather than removing it:

- `selectEffectivePrice` filters on `price.marketId !== null`
  (`commercial-offer.resolver.ts`), so an unscoped row can never be selected.
- `deriveCheckoutReadiness` rejects `unitAmount <= 0` with "Amount must be
  greater than zero", so it could not be bought even if it were.

What it actually costs:

- **Twelve warnings on every seed.** `createPlanPriceIfAbsent` reports "an
  active price exists with no market and cannot be resolved by any market" for
  each affected slot. That warning is correct and useful — it is exactly how
  this was found — but firing it unconditionally on a healthy fresh database
  trains operators to ignore it, and the next real occurrence goes with it.
- **`PRICE_NOT_MARKET_SCOPED` is reachable when it should not be.** The resolver
  distinguishes "a price exists but nobody scoped it" from "no price at all"
  precisely so an operator knows which mistake to fix. Here it reports a
  configuration mistake that no operator made.

## Evidence

Measured on 2026-08-20 against a database with migrations applied and **no seed
run at all**:

```text
after migrations:
  plans: 3
  prices: 6
```

```text
    key     | billingCycle | currency | billingModel | unitAmount | isActive
------------+--------------+----------+--------------+------------+----------
 starter    | MONTHLY      | USD      | FLAT         |       0.00 | t
 starter    | ANNUAL       | USD      | FLAT         |       0.00 | t
 growth     | MONTHLY      | USD      | FLAT         |       0.00 | t
 ...
```

`publicationStatus = PUBLISHED`, `salesModel = SELF_SERVICE`,
`backfilledFromLegacyAt` null.

Note the contrast with `20260816120000_commercial_configuration_foundation`,
which does the same kind of backfill and gets it right — it creates rows as
`DRAFT` and says why: *"Backfilled rows are created as DRAFT with no market, so
they are inert… this migration must not silently start charging anyone the
legacy number."* The 2026-05-23 migration predates that reasoning.

## Proposed Approach

Do **not** delete the rows in a migration. They are indistinguishable, by shape
alone, from a row an operator created deliberately and has not finished
configuring, and deleting somebody's draft pricing to tidy a warning is a worse
outcome than the warning.

Deactivate rather than delete, and only where every marker of automatic
creation is present:

```sql
UPDATE "PlanPrice"
SET "isActive" = false, "publicationStatus" = 'DRAFT'
WHERE "marketId" IS NULL
  AND "unitAmount" = 0
  AND "isActive" = true;
```

A zero-amount price cannot be sold by any path, so deactivating one takes
nothing away. Pair it with a check that the seed's unscoped-price warning fires
only when a **non-zero** unscoped price exists, which is the case an operator
actually needs to see.

## Acceptance Criteria

- A database built from migrations alone contains no active, published,
  market-less price with a zero amount.
- `seed:config` on a fresh database emits no unscoped-price warnings.
- The warning still fires when a genuinely unscoped, non-zero price exists —
  proven by creating one.

## Dependencies

None.

## Related Items

- [[BUG-0030]] — the original unscoped-price collision, which is why the warning
  exists at all.
- [`EXECPLAN-0002`](../../plans/EXECPLAN-0002-per-seat-public-pricing-with-sales-assisted-flat.md)
  — found while verifying the per-seat pricing seed against a virgin database.

## History

- 2026-08-20 — found during TASK-0010 WP-08, while checking that the new price
  schedule seeded cleanly. The twelve warnings were the symptom; counting rows
  before any seed ran was what located the cause.
