---
ID: BUG-0531
aliases: [BUG-0531]
Title: Flat prices were sellable on the public site at invented amounts
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

# BUG-0531 — Flat prices were sellable on the public site at invented amounts

## Summary

Every active price in the development database was a FLAT price marked
`SELF_SERVICE`, priced in USD, at amounts nobody had agreed. Flat pricing is a
sales-assisted instrument by design — `resolveCommercialOffer` refuses
`SALES_ASSISTED` rows on the self-service channel precisely so a visitor cannot
reach one — and marking those rows `SELF_SERVICE` removed that protection. Four
of the eight carried no market at all; the other four were scoped to Pakistan
and priced in USD, a currency the PK market supports, so they genuinely
resolved.

## Expected Behavior

Self-service checkout offers **per-seat** prices, in the market's own currency,
at the amounts in `pricing.catalog.ts`. Flat prices exist for negotiated deals
and are reachable only through an operator.

## Actual Behavior

The only prices a market could resolve were flat, in USD, at 399/3990/899/8990 —
the invented pre-schedule figures. Starter, the default plan, had no active
price at all and so could not be bought in any currency.

## Reproduction

1. `npm run report:commercial` against a database seeded before 2026-08-20.
2. Read the active price list.

Observed at `99dc70a`:

```
Active prices (8):
  —     growth       FLAT     MONTHLY USD  399   SELF_SERVICE  stripe:NOT_SYNCED
  PK    growth       FLAT     MONTHLY USD  399   SELF_SERVICE  stripe:NOT_SYNCED
  —     growth       FLAT     ANNUAL  USD  3990  SELF_SERVICE  stripe:NOT_SYNCED
  PK    growth       FLAT     ANNUAL  USD  3990  SELF_SERVICE  stripe:NOT_SYNCED
  PK    enterprise   FLAT     MONTHLY USD  899   SELF_SERVICE  stripe:NOT_SYNCED
  —     enterprise   FLAT     MONTHLY USD  899   SELF_SERVICE  stripe:NOT_SYNCED
  —     enterprise   FLAT     ANNUAL  USD  8990  SELF_SERVICE  stripe:NOT_SYNCED
  PK    enterprise   FLAT     ANNUAL  USD  8990  SELF_SERVICE  stripe:NOT_SYNCED
```

No PKR row, no QAR row, no per-seat row, and nothing for `starter`.

## Evidence

The report above, produced by `services/api/prisma/report-commercial.ts`, which
was written for this investigation and reads the catalogue rather than the
seed's account of itself.

The schedule those rows should have matched has existed since 2026-08-20 in
`services/api/src/modules/super-admin/pricing.catalog.ts` — 36 rows, three
markets, per-seat and flat, in PKR, QAR and USD.

The protection that was bypassed is in the same file: *"The public site and
self-service checkout sell per active employee. Flat-per-plan exists for
customers who negotiate it and is reachable only through an operator: those rows
carry `salesModel: SALES_ASSISTED`."*

## Root Cause

[[BUG-0533]]. `bootstrapCommercialDefaults` was create-only, so the rows
predated the schedule and no later run could correct them. `reconcilePlanPrice`
matches an occupant by plan, market, cycle, currency **and** billing model, so a
row in a combination the catalogue never mentions — PK+USD, or no market at all
— was invisible to it and survived every seed regardless.

## Impact

Reachable in any environment seeded before 2026-08-20. A visitor could be quoted
and charged a flat price at an unagreed amount, in the wrong currency for their
market; and Starter, the default plan, could not be bought at all.

Not reached production: `deriveCheckoutReadiness` refuses any price without a
verified, synced, active Stripe price, and none of these were synced —
`stripe:NOT_SYNCED` on all eight. That guard, not the price rows, is what stood
between an invented number and a customer's card. It is the last line, not the
intended one.

## Affected Areas

`super-admin` (commercial bootstrap, plans, prices), the offer resolver, the
landing pricing page, self-service checkout.

## Proposed Resolution

No ExecPlan: no schema change, and nothing destructive. Fixed with [[BUG-0533]]
— the bootstrap converges, and a pass deactivates active prices on catalogue
plans that the catalogue does not list.

## Acceptance Criteria

- `npm run report:commercial` lists 36 active prices: 3 plans x 3 markets x 2
  cycles x 2 models, in PKR, QAR and USD.
- Every FLAT row reads `SALES_ASSISTED`.
- Every per-seat row reads `SELF_SERVICE` and matches `PER_SEAT_SCHEDULE`.
- No active price has a null market.
- Starter has active prices in all three currencies.

## Regression Coverage

REG-201. `commercial-bootstrap.reconcile.spec.ts` — "deactivates an active price
the catalogue does not list" reconstructs both defective shapes and asserts they
are deactivated while catalogued rows are untouched.

## Dependencies

The fix lands in code; **the database is only corrected when
`npm run seed:commercial` is run against it.** Until then the rows above stand.

## Related Items

[[BUG-0533]], [[BUG-0534]], [[BUG-0027]], [[BUG-0030]], REG-201,
[[QA-PLATFORM-018]]

## Resolution

Fixed on `agent/plans-reset` as part of the convergence work in [[BUG-0533]].
`retireUncataloguedPrices` deactivates — never deletes — any active price on a
catalogue plan whose (market, cycle, currency, model) tuple the catalogue does
not claim.

## QA Retest

QA-PLATFORM-018. Not yet run against a database: the reconcile command was
blocked by a permission prompt and has not been executed.

### Verification — 2026-08-22, SESSION-0040

Re-ran the guard this record names, rather than reading a green suite
summary: REG-201 names `services/api/src/modules/super-admin/commercial-bootstrap.reconcile.spec.ts`, and that is what was executed.

```text
npx jest --runTestsByPath, services/api   PASS
```

`Status: FIXED` → `VERIFIED`.

## History

- 2026-08-22 — created at `99dc70a` from the catalogue report.
- 2026-08-22 — fixed in code; database correction still pending a seed run.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[super-admin]], [[platform-admin]]
- Regression — REG-201 (see the regression register)

<!-- GRAPH:END -->
