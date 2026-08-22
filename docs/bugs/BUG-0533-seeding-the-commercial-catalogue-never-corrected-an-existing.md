---
ID: BUG-0533
aliases: [BUG-0533]
Title: Seeding the commercial catalogue never corrected an existing plan or price
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: DATA_INTEGRITY
Source: USER_REPORT
DetectedDate: 2026-08-22
DetectedInSha: 99dc70a
AffectedModules: [super-admin, apps/admin]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-201
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-22
UpdatedAt: 2026-08-22
ResolvedAt: 2026-08-22
---

# BUG-0533 — Seeding the commercial catalogue never corrected an existing plan or price

## Summary

`bootstrapCommercialDefaults` only ever created. An existing plan kept whatever
name, description, features and sort order it was first seeded with; an occupied
price slot was counted as "already served" whatever amount stood in it; and a
plan the catalogue had stopped listing stayed on sale indefinitely. The
catalogue files were therefore a description of a state the database had no way
to reach.

## Expected Behavior

The catalogue is authoritative. Running the seed brings the database into
agreement with it — every time, idempotently.

## Actual Behavior

The seed established that rows *existed* and stopped. When the owner supplied a
real price schedule on 2026-08-20, every database seeded before that date kept
its old amounts through every subsequent run, and said nothing about it.

## Reproduction

1. Seed a database, then change an amount in `pricing.catalog.ts`.
2. Run `npm run seed:config`.
3. Read the price back.

The old amount stands, and the run reports the slot as `pricesSkippedExisting`.

## Evidence

`services/api/src/modules/super-admin/commercial-bootstrap.ts` at `99dc70a`:

- `ensurePlans` — `if (existing) { ...; continue; }`, writing the legacy amounts
  only when both were already zero.
- `ensureMarkets` — `if (existing) continue;`
- `createPlanPriceIfAbsent` — `if (occupant) { result.pricesSkippedExisting += 1; return; }`

The observed consequence is [[BUG-0531]]: eight active prices, none of them the
catalogue's.

## Root Cause

Create-only is the correct instinct for a seed and the wrong one for a
catalogue. The distinction the file did not draw: rows describing **what
DijiPeople sells** are owned by the catalogue and must converge, while rows
describing **what a customer bought** are owned by the sale and must never be
rewritten.

`ensureMarkets` is the one place where deference is still right — after the
first run a market's launch and self-service flags are operator decisions — and
it is deliberately left create-only.

## Impact

Any environment whose catalogue changed after it was first seeded. The failure
is silent: the seed reports success and the numbers are stale.

## Affected Areas

`super-admin/commercial-bootstrap.ts`, `prisma/seed-config.ts`, and every
surface reading plans or prices.

## Proposed Resolution

No ExecPlan: no schema change, no destructive migration.

Converge, preserving what was sold:

- a drifted catalogue plan is corrected, including its feature rows;
- a price on terms the catalogue no longer states is **superseded** — old row
  deactivated and dated, new row carrying `supersedesPriceId` and `version + 1`;
- a price the catalogue does not list at all is deactivated;
- a plan the catalogue dropped is retired, or — if customers are subscribed to
  it — withdrawn from sale and reported.

Nothing is deleted anywhere in that list.

## Acceptance Criteria

- A database already matching the catalogue produces zero writes.
- A drifted plan name, legacy amount or feature set is corrected.
- A drifted price is superseded, not edited, and the successor carries no Stripe
  identifiers.
- Drift in `salesModel`, `minimumSeats`, `includedSeats` or overage is detected,
  not only drift in the amount.
- A plan with subscriptions is never deactivated.

## Regression Coverage

REG-201, `commercial-bootstrap.reconcile.spec.ts` — seven tests. The
load-bearing one is "changes nothing when the database already matches": a
reconciler that rewrites correct rows is worse than one that never runs, because
it re-stamps `publishedAt` and detaches every price from Stripe on each deploy.

Mutation-tested: forcing `describePriceDrift` to return no differences fails
exactly the two supersession tests.

## Dependencies

None.

## Related Items

[[BUG-0531]], [[BUG-0534]], [[BUG-0027]], [[BUG-0030]], REG-201,
[[QA-PLATFORM-018]]

## Resolution

Fixed on `agent/plans-reset`. `bootstrapCommercialDefaults` now runs
`ensurePlans` -> `retireUnlistedPlans` -> `ensureMarkets` -> `ensurePlanPrices`,
the last of which finishes with `retireUncataloguedPrices`. New counters —
`plansUpdated`, `plansRetired`, `plansWithdrawn`, `pricesSuperseded`,
`pricesRetired` — are reported by both `seed:config` and the new
`seed:commercial`.

`npm run seed:commercial` runs the reconcile alone, and
`npm run report:commercial` reads the catalogue back without consulting the
seed's own account of itself.

## QA Retest

QA-PLATFORM-018. Code verified by unit test; not yet run against a database.

### Verification — 2026-08-22, SESSION-0040

Re-ran the guard this record names, rather than reading a green suite
summary: REG-201 names `services/api/src/modules/super-admin/commercial-bootstrap.reconcile.spec.ts`, and that is what was executed.

```text
npx jest --runTestsByPath, services/api   PASS
```

`Status: FIXED` → `VERIFIED`.

## History

- 2026-08-22 — created at `99dc70a`.
- 2026-08-22 — fixed on `agent/plans-reset`.
