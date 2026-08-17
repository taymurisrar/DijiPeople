---
ID: BUG-0027
aliases: [BUG-0027]
Title: Admin plan pricing and checkout pricing come from different models
Status: VERIFIED
Severity: CRITICAL
Priority: P0
Type: DATA_INTEGRITY
Source: REVIEWER
DetectedDate: 2026-08-16
DetectedInSha: 45d00cf
AffectedModules: [services/api/prisma, apps/admin, apps/landing]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-16-commercial-config-wave1-a525896.md
RegressionId: REG-017
RelatedBacklogItem: ITEM-0018
RelatedDecision:
RelatedImplementation: agent/commercial-config-wave1
CreatedAt: 2026-08-16
UpdatedAt: 2026-08-17
ResolvedAt: 2026-08-16
---

# BUG-0027 — Admin plan pricing and checkout pricing come from different models

## Summary

A plan's price exists in **two independent places** with different units, and
different surfaces read different ones. `Plan.monthlyBasePrice` /
`Plan.annualBasePrice` / `Plan.currency` are flat per-plan amounts; `PlanPrice`
carries the real per-seat commercial terms and is what checkout charges. Platform
Admin displays the former. Nothing keeps them consistent, and the seed populates
only the former.

## Expected Behavior

One source of truth for what a plan costs. Every surface — Admin, the public
site, checkout and the invoice — derives from the same record, so the number an
operator sees is the number a customer is charged.

## Actual Behavior

- Admin's plan detail page shows `Plan.monthlyBasePrice` and computes annual
  savings from it.
- Public pricing and checkout resolve a `PlanPrice` row, which may hold a
  different amount, a different currency, and a **different unit** (per seat vs
  flat).
- A seeded plan has base prices but **no `PlanPrice` rows at all**, so the public
  site renders "Contact sales" for a plan Admin displays as `$199`.

## Reproduction

1. Seed plans — `DEFAULT_PLAN_DEFINITIONS` creates `starter` with
   `monthlyBasePrice: 199`, `currency: 'USD'`, and no `PlanPrice`.
2. Open Platform Admin → Plans → Starter. It shows `$199.00` per month and an
   annual saving computed as `199 × 12 − 1990`.
3. Open the public plans page. `findPlanPrice()` returns `null`, and
   `formatPlanPrice(null)` renders **"Contact sales"**.
4. Create a `PlanPrice` for Starter at, say, `unitAmount: 15` per seat. Admin
   still shows `$199`; checkout now charges `15 × seats`.

## Evidence

- `services/api/prisma/schema.prisma:3635-3665` — `Plan` carries
  `monthlyBasePrice`, `annualBasePrice`, `currency`.
- `services/api/prisma/schema.prisma:3686-3699` — `PlanPrice` carries
  `unitAmount`, `currency`, `billingModel` (**defaults to `PER_SEAT`**),
  `billingInterval`, `minimumSeats`, `maximumSeats`, `includedSeats`.
- `services/api/src/modules/super-admin/plans.catalog.ts:9-11,28-30,51-53` — the
  seed sets `monthlyBasePrice: 199 / 399 / 899` and `annualBasePrice: 1990 /
  3990 / 8990`, all `USD`, and defines **no** `PlanPrice` rows. These are flat
  monthly figures, so they are not even the same unit as the per-seat
  `PlanPrice.unitAmount`.
- `apps/admin/app/(internal)/plans/[planId]/page.tsx:60-61,70,76,144,152` — Admin
  reads `plan.monthlyBasePrice` / `plan.annualBasePrice` and derives the
  advertised annual saving from them.
- `apps/landing/lib/plans.ts:103-121` — `findPlanPrice()` resolves from
  `plan.prices` (i.e. `PlanPrice`), never from the base prices.
- `apps/landing/lib/plans.ts:127-137` — `formatPlanPrice(null)` returns
  `"Contact sales"`.
- `services/api/src/modules/billing/billing-seat-pricing.ts:44-68` —
  `calculateSeatPricing` operates purely on the `PlanPrice` contract.

## Root Cause

`PlanPrice` was introduced as the real commercial model — it has versioning
(`version`, `effectiveFrom`, `effectiveTo`, `supersedesPriceId`), Stripe linkage
and seat rules — but the older `Plan`-level base price columns were never
removed, and Admin was never migrated onto `PlanPrice`. Two sources of truth for
one fact, which the root [`AGENTS.md`](../../AGENTS.md) architecture principle
4 explicitly forbids.

## Impact

Commercial and customer-facing. An operator setting a price in Admin may believe
they have changed what customers pay when they have not. The public site can
advertise "Contact sales" for a plan Admin shows as priced, or advertise a figure
that differs from what Stripe charges. This is a money-path correctness defect,
not a display bug.

### Correction — this was worse than first recorded

The original assessment said the legacy columns were a display problem because
Stripe self-service checkout requires a verified `PlanPrice`. That was true of
**one** path and wrong about the system.

`SuperAdminBillingService.calculateSubscriptionPricing` ended in:

```ts
const basePrice = planPrice
  ? Number(planPrice.unitAmount) * quantity
  : billingCycle === BillingCycle.ANNUAL
    ? Number(plan.annualBasePrice)
    : Number(plan.monthlyBasePrice);
```

and `upsertSubscription` writes that straight into `Subscription.basePrice` and
`Subscription.finalPrice`. So an **operator-created subscription** with no
explicit `planPriceId` was billed from the legacy columns — and because the seed
created plans with **no `PlanPrice` at all**, that fallback was the normal path,
not an edge case. `Subscription.planPriceId` is nullable, so those subscriptions
also carried no reference to any price version, leaving them with no historical
commercial context at all.

That is a live money path driven by a value no longer shown as authoritative
anywhere. Re-rated **CRITICAL / P0**.

## Affected Areas

`Plan` / `PlanPrice` models, the plan seed, Platform Admin plan screens and plan
form, the public plans and subscribe pages, `super-admin` plan services.

## Proposed Resolution

**Needs an ExecPlan.** Dropping columns is a destructive schema change requiring
expand/backfill/contract staging per [`PLANS.md`](../../PLANS.md).

Direction: make `PlanPrice` the only price. Backfill a `PlanPrice` per (plan,
cycle, currency) from the existing base prices, migrate Admin and the plan form
onto `PlanPrice`, then drop `Plan.monthlyBasePrice`, `Plan.annualBasePrice` and
`Plan.currency`. Derive "annual saving" from the two `PlanPrice` rows rather than
from plan columns.

Sequence with [[ITEM-0018]] — both change the same models and the same Admin
screens, so one plan avoids migrating that UI twice.

## Acceptance Criteria

- No code path reads `Plan.monthlyBasePrice`, `Plan.annualBasePrice` or
  `Plan.currency`; the columns are gone.
- Admin, the public plans page and checkout all resolve the same `PlanPrice` for
  a given (plan, currency, billing cycle).
- The seed produces plans whose advertised price is non-empty on the public site.
- A test asserts the Admin projection and the checkout projection return the same
  amount for the same plan.

## Regression Coverage

`services/api/src/modules/super-admin/billing.legacy-pricing.spec.ts` — REG-017.
Six assertions pinning that the legacy columns are never read, that a plan with
no published price fails closed, that the error names the plan and cycle, and
that resolution filters on publication and orders by effective date.

`services/api/src/modules/billing/commercial-offer.resolver.spec.ts` — 26
assertions covering publication, market gating, effective dating, seat bounds
and sales-model narrowing.

## Dependencies

[[ITEM-0018]] — publication lifecycle, same models and screens.

## Related Items

[[ITEM-0018]] · [[ITEM-0019]] · [[BUG-0028]]

## Resolution

Fixed on `agent/commercial-config-wave1` (Wave 1 — Commercial Configuration
Foundation).

- The legacy fallback is gone. `calculateSubscriptionPricing` now resolves the
  published, in-force `PlanPrice` and **fails closed** with an actionable
  message when none exists, rather than billing an amount nobody chose.
- `resolveEffectivePlanPrice` orders by `effectiveFrom` then `version`, so a
  price staged for a future date cannot displace the one in force.
- The seed now creates published, market-scoped `PlanPrice` rows for every
  seeded plan, using the existing repository amounts unchanged. A freshly
  seeded system no longer has plans that Admin prices and the public site
  cannot.
- Platform Admin no longer leads with the legacy columns: the plans list shows
  publication status and sales model, and the plan detail page derives its
  figures from `PlanPrice`, showing "Not configured" instead of a legacy number.
- The migration backfills legacy amounts into `PlanPrice` as **inert DRAFT**
  rows — never overwriting an existing price, never inventing one for a zero
  amount, and never publishing automatically.

The legacy columns still exist and are **deliberately not dropped**. Removing
them is a contract phase with its own evidence requirement — see [[ITEM-0020]].

## QA Retest

`docs/qa/runs/2026-08-16-commercial-config-wave1-a525896.md` — scenarios A–E.

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

- 2026-08-16 — found during commercial-configuration discovery at `45d00cf`.

- 2026-08-16 — re-rated CRITICAL after finding the operator subscription path; fixed in Wave 1.
