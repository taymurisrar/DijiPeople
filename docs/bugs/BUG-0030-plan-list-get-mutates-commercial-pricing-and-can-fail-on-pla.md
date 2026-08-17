---
ID: BUG-0030
aliases: [BUG-0030]
Title: Plan list GET mutates commercial pricing and can fail on PlanPrice unique constraint
Status: VERIFIED
Severity: CRITICAL
Priority: P0
Type: DATA_INTEGRITY
Source: USER_REPORT
DetectedDate: 2026-08-16
DetectedInSha: 78072d2
AffectedModules: [services/api, services/api/prisma]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-16-hotfix-plan-list-hidden-write-78072d2.md
RegressionId: REG-020
RelatedBacklogItem: ITEM-0025
RelatedDecision:
RelatedImplementation: agent/hotfix-plan-list-hidden-write
CreatedAt: 2026-08-16
UpdatedAt: 2026-08-17
ResolvedAt: 2026-08-16
---

# BUG-0030 — Plan list GET mutates commercial pricing and can fail on PlanPrice unique constraint

## Summary

`GET /api/platform-runtime/plans` returned **409 `DATABASE_DUPLICATE_RECORD`** in
production. Opening the Admin Plans screen was creating Plans, Markets and
PlanPrices as a side effect of reading them, and the PlanPrice insert violated a
partial unique index.

## Expected Behavior

Listing plans is a read. It returns what exists and writes nothing.

## Actual Behavior

```
PlatformRuntimeService.list
  -> SuperAdminService.listPlans
    -> ensureDefaultPlans
      -> ensureAuthoritativePlanPrices
        -> prisma.planPrice.create()  -> P2002
```

Unique constraint failed on `(planId, billingCycle, currency)` —
`PlanPrice_active_plan_cycle_currency_key`.

## Reproduction

1. A database with an active `PlanPrice` for a plan/cycle/currency whose
   `marketId` is null or a different market.
2. `GET /api/platform-runtime/plans`.
3. The market-scoped check misses the row; the insert violates the index; the
   read returns 409.

Concurrent variant: two simultaneous requests against a database with no such
row — both check, both insert, one fails.

## Evidence

- `super-admin.service.ts:1701` (pre-fix) — `listPlans()` awaited
  `ensureDefaultPlans()`. Also on `getPlanDetail`, `createPlan`, `updatePlan`.
- `super-admin.service.ts` (pre-fix) — the market-scoped existence check.
- `prisma/migrations/20260523160000_plan_price_active_versioning/migration.sql:23`
  — the partial index, created before markets existed.
- `markets.catalog.ts` — PK, US and GCC all carry `defaultCurrency: 'USD'`.
- `prisma/seed-config.ts` (pre-fix) — never invoked the commercial bootstrap, so
  the read path was the **only** way defaults were ever created.

## Root Cause

**Two independent causes, and concurrency was the lesser one.**

### 1. The existence check disagreed with the constraint (primary)

`ensureAuthoritativePlanPrices` checked:

```ts
{ planId, marketId, currency, billingInterval }
```

The database enforces:

```sql
UNIQUE (planId, billingCycle, currency) WHERE isActive = true
```

Those disagree on **three axes at once**: the check included `marketId` and the
index did not; the check used `billingInterval` (`MONTH`/`YEAR`) while the index
used `billingCycle` (`MONTHLY`/`ANNUAL`); and the check ignored `isActive`
entirely while the index is partial on it.

So on any database already holding an **active** price for that plan, cycle and
currency scoped to a different market — or to no market, which is what rows
created before markets existed look like — the check found nothing and the
insert violated the index. That is deterministic, not a race.

### 2. Check-then-create race (secondary)

Two concurrent readers could both find nothing and both insert. Real, but it
would produce an intermittent failure; the mismatch above produces a reliable
one.

### 3. The constraint itself became wrong in Wave 1

`PlanPrice_active_plan_cycle_currency_key` predates markets
(`20260523160000_plan_price_active_versioning`). Wave 1 added
`PlanPrice.marketId` and scoped prices to markets, which made an index with no
market column structurally wrong: **all three seeded markets (PK, US, GCC)
default to USD**, so pricing a second market would collide with a legitimate
configuration.

### Ownership

The `listPlans -> ensureDefaultPlans` hidden write **pre-dates** Wave 1 — it
already created and updated `Plan` rows on read. Wave 1 extended that chain with
`ensureDefaultMarkets` and `ensureAuthoritativePlanPrices`, which carried it into
the one table with a partial unique index. The pattern was inherited; making it
fail was introduced by Wave 1.

## Impact

Production, operator-facing: the Admin Plans screen could not be opened.
CRITICAL — a read endpoint failing, with a misleading duplicate-record error,
and silent commercial writes on every successful load.

No data was corrupted. The failing insert rolled back, and every write the
bootstrap did complete was the creation of a row that did not exist.

## Affected Areas

`services/api/src/modules/super-admin`, commercial bootstrap seeding, the
`PlanPrice` partial unique index, and the Admin plan-list read path.

## Proposed Resolution

Three parts, because fixing only the exception would leave two of the causes.

1. **Read-path purity.** `listPlans` and `getPlanDetail` write nothing.
   `createPlan`/`updatePlan` do not bootstrap either — that would move the
   hidden write one layer along.
2. **Explicit, idempotent bootstrap.** Moved to `commercial-bootstrap.ts`,
   invoked from `seed:config` (so `npm run release:api` runs it). Its conflict
   check mirrors the index exactly, and a unique violation re-reads the winning
   row and verifies it rather than assuming success.
3. **Market-aware uniqueness.** A new partial index on
   `(planId, marketId, billingCycle, currency) WHERE isActive`, using
   `NULLS NOT DISTINCT` so unscoped legacy rows keep the protection the old index
   gave them.

## Acceptance Criteria

- `GET /platform-runtime/plans` performs zero commercial writes, under any
  number of concurrent calls.
- Two markets may hold an active price for the same plan, cycle and currency.
- Two active prices in one market remain impossible.
- Version history, drafts and future-effective rows coexist freely.
- No unique violation is reported as success without verifying the winner.

## Regression Coverage

`services/api/test/commercial-bootstrap.e2e-spec.ts` — REG-020, **real
PostgreSQL**, promoted into the `database-migration` required gate. Covers the
constraint, idempotency, 8-way concurrency, `NULLS NOT DISTINCT`, versioning and
draft safety.

`services/api/src/modules/super-admin/plan-read-path-purity.spec.ts` — the cheap
structural guard that runs on every push. Verified to **fail** when the read path
is restored.

## Dependencies

Migration must run before the API rollout, and `seed:config` after it. That is
already the order in `npm run release:api`.

## Related Items

[[BUG-0027]] · [[BUG-0028]] — the Wave 1 work this regressed from.
[[ITEM-0025]] — the same hidden-write pattern on five other read methods.

## Resolution

Fixed on `agent/hotfix-plan-list-hidden-write`.

## QA Retest

`docs/qa/runs/2026-08-16-hotfix-plan-list-hidden-write-78072d2.md`.

Retested at the merged SHA `d1768cb` during the open-bug closure wave.

The linked regression suite runs green: 7 API suites / 85 assertions across
REG-013 – REG-021, `npm run test:app-urls` 16/16, and REG-020's
`commercial-bootstrap.e2e-spec.ts` in the `Database migration gate` against a
real PostgreSQL 16. Each of these tests was proven to fail without its fix when
it was written; re-running them is what confirms the fix still holds.

## History

- 2026-08-17 — Architect reconciliation: terminal `VERIFIED` status normalized
  to `ArchitectDisposition: DONE`; the existing resolution and QA evidence are
  unchanged.

- 2026-08-16 — reported from production; root-caused and fixed the same day.
