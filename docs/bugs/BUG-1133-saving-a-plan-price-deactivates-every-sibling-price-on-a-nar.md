---
ID: BUG-1133
aliases: [BUG-1133]
Title: Saving a plan price deactivates every sibling price on a narrower key than the unique index
Status: FIXED
Severity: CRITICAL
Priority: P0
Type: DATA_INTEGRITY
Source: QA_RUN
DetectedDate: 2026-08-24
DetectedInSha: 15f11c30
AffectedModules: [api:super-admin, apps/admin]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: docs/qa/runs/2026-08-24-record-state-reconciliation-0a5586f.md
RegressionId: REG-247
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: TASK-0018
CreatedAt: 2026-08-24
UpdatedAt: 2026-08-24
ResolvedAt: 2026-08-24
---

# BUG-1133 — Saving a plan price deactivates every sibling price on a narrower key than the unique index

## Summary

Saving any plan price in Platform Admin silently deactivates other prices that
were never in conflict with it. On 2026-08-24 this removed **nine of Starter's
twelve prices** in production — every annual price and every flat price, in all
three currencies — leaving one row per currency.

Nothing failed. No error was raised, no audit entry named the rows, and
`updateMany` returned a count nobody reads. The loss was found by comparing the
public plans endpoint against `pricing.catalog.ts`, not by anything in the
system noticing.

## Expected Behavior

Superseding a price deactivates **only** the row occupying the same slot, where
a slot is what the database says it is:

```sql
CREATE UNIQUE INDEX "PlanPrice_active_plan_market_cycle_currency_model_key"
ON "PlanPrice" ("planId", "marketId", "billingCycle", "currency", "billingModel")
NULLS NOT DISTINCT
WHERE "isActive" = true;
```

A `PER_SEAT` price and a `FLAT` price for the same plan, market, cycle and
currency are different products and must coexist — that is why `billingModel`
was added to the key by
`20260820140000_planprice_billing_model_uniqueness_and_overage`.

## Actual Behavior

Both write paths deactivated on three columns:

```ts
where: { planId, billingCycle, currency, isActive: true }
```

`marketId` and `billingModel` were absent. So saving `Starter / MONTHLY / PKR /
PER_SEAT` deactivated `Starter / MONTHLY / PKR / FLAT`, and — with no market
filter — the seeded rows for every other market too.

## Reproduction

1. Note the active price count for a plan: `GET /api/public/plans` — Starter had
   12.
2. In Platform Admin, edit any Starter price and save.
3. Re-read the endpoint. The sibling prices for that plan, cycle and currency
   are gone, across billing models and markets.

Observed in production between 18:26:56Z — when the deploy's `seed:config`
reported `36 already on catalogue terms` — and 19:32Z, when the endpoint served
27.

## Evidence

- `super-admin.service.ts:1894` (`createPlanPrice`) and `:2052`
  (`updatePlanPrice`) — the three-column `where`.
- `prisma/migrations/20260820140000_planprice_billing_model_uniqueness_and_overage/migration.sql:51-54`
  — the five-column index.
- Production, measured directly:

  | Plan | Active prices | Expected |
  |---|---|---|
  | Growth | 12 | 12 |
  | Enterprise | 12 | 12 |
  | **Starter** | **3** | **12** |

  Growth and Enterprise were not edited that day and are intact. Only Starter's
  `MONTHLY` / `PER_SEAT` rows survived — one per currency, exactly the shape a
  `{planId, billingCycle, currency}` collapse produces.
- Seeded prices carry a `marketId` (`commercial-bootstrap.ts:589`); admin-created
  prices never set one, so they are `null`. With no `marketId` in the `where`,
  an admin save reached across both.

## Root Cause

The supersede key was narrower than the uniqueness key. Deactivating on a
narrower key than the one defining a slot does not resolve a conflict — it
destroys rows that were never in conflict.

**This was predicted.** [[TASK-0018]]'s assumption **A-06** is recorded as
`LOW` confidence with exactly this impact: a fake Prisma client "cannot enforce
the partial unique index `PlanPrice_active_plan_market_cycle_currency_model_key`
… Disagreeing with that index is exactly the root cause of BUG-0030." The
warning was written down, the risk was accepted, and no test asserted the
agreement the warning was about.

## Impact

**Critical.** Silent, unbounded destruction of commercial configuration by an
ordinary admin action. A plan can lose its entire annual and flat schedule while
the screen reports success. Existing subscribers are not repriced —
`Subscription` snapshots its terms at purchase — so the damage is to what can be
*sold*, not to what is already billed.

Nothing is unrecoverable: rows are `isActive: false` rather than deleted, and
`pricing.catalog.ts` is the source of truth.

## Affected Areas

- `createPlanPrice`, `updatePlanPrice` in `super-admin.service.ts`
- every plan-price edit surface in `apps/admin`
- the public plans and checkout surfaces downstream of `PlanPrice`

## Proposed Resolution

Match the index, column for column, at both sites. `marketId` is `null` on the
create path (which never sets one) and `existing.marketId` on the update path
(which can edit a seeded row). `billingModel` is the effective value, since the
DTO may change it — a price moving to a different slot should clear the slot it
moves *into*.

Then restore the lost rows with `npm run seed:commercial`, which recreates
whatever the catalogue lists and is a no-op for what is already correct.

## Acceptance Criteria

- Saving a `PER_SEAT` price leaves the `FLAT` price for the same plan, market,
  cycle and currency active.
- Saving a price with `marketId: null` does not touch rows carrying a market.
- Both supersede sites filter on all five index columns.
- Starter serves 12 active prices again.

## Regression Coverage

REG-247 — `plan-price-supersede-scope.spec.ts`. It reads the column list out of
the migration and asserts every supersede `where` constrains all of them, so the
test cannot drift from the index: change the index and the expectation changes
with it.

## Dependencies

Found while investigating [[BUG-1134]], which was the 500 an operator hit on the
same screen. The two are one family and BUG-1134 was, perversely, the only thing
limiting this one's blast radius.

## Related Items

[[BUG-1134]], [[BUG-0030]], [[BUG-0995]], [[TASK-0018]], [[ITEM-0064]],
[[ITEM-0072]], [[super-admin]], [[billing]]

## Resolution

Fixed on `agent/record-state-reconciliation`. Both `updateMany` calls now filter
on `planId`, `marketId`, `billingCycle`, `billingModel`, `currency` and
`isActive`, matching the partial unique index exactly.

The nine lost Starter rows are **not** restored by this change — that is a
production data write and is the owner's to authorise. See Acceptance Criteria.

## QA Retest

Regression suite green; reverting either `where` to the three-column form fails
it. `super-admin` and `billing` together: 31 suites, 216 tests, 0 failures.

Retest in production after `seed:commercial` by confirming Starter serves 12
active prices and that a subsequent single-price edit leaves the other 11 alone.

## History

- 2026-08-24 — found by re-measuring the commercial catalogue after the owner
  reported a 500 on the plan pricing screen. The catalogue had been verified
  converged at 36/36 earlier the same day, which is what made the loss visible
  at all.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[super-admin]], [[platform-admin]]
- Regression — REG-247 (see the regression register)

<!-- GRAPH:END -->
