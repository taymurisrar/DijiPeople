---
ID: BUG-0027
aliases: [BUG-0027]
Title: Admin plan pricing and checkout pricing come from different models
Status: OPEN
Severity: HIGH
Priority: P1
Type: DATA_INTEGRITY
Source: REVIEWER
DetectedDate: 2026-08-16
DetectedInSha: 45d00cf
AffectedModules: [services/api/prisma, apps/admin, apps/landing]
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
QAReport:
RegressionId:
RelatedBacklogItem: ITEM-0018
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-16
UpdatedAt: 2026-08-16
ResolvedAt:
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
one fact, which the root [`AGENTS.md`](../../../AGENTS.md) architecture principle
4 explicitly forbids.

## Impact

Commercial and customer-facing. An operator setting a price in Admin may believe
they have changed what customers pay when they have not. The public site can
advertise "Contact sales" for a plan Admin shows as priced, or advertise a figure
that differs from what Stripe charges. This is a money-path correctness defect,
not a display bug.

**Not** currently a live mischarge: checkout only proceeds against a `PlanPrice`
that passes `deriveCheckoutReadiness` (`billing-seat-pricing.ts:70-99`), so a
customer cannot be charged the Admin number. The exposure is a wrong *advertised*
price and operator confusion — which is why this is HIGH and not CRITICAL.

## Affected Areas

`Plan` / `PlanPrice` models, the plan seed, Platform Admin plan screens and plan
form, the public plans and subscribe pages, `super-admin` plan services.

## Proposed Resolution

**Needs an ExecPlan.** Dropping columns is a destructive schema change requiring
expand/backfill/contract staging per [`PLANS.md`](../../../PLANS.md).

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

None yet. Required: a test pinning that one plan resolves to exactly one price
per (currency, cycle), and that Admin and checkout agree.

## Dependencies

[[ITEM-0018]] — publication lifecycle, same models and screens.

## Related Items

[[ITEM-0018]] · [[ITEM-0019]] · [[BUG-0028]]

## Resolution

Not yet fixed.

## QA Retest

Not yet retested.

## History

- 2026-08-16 — found during commercial-configuration discovery at `45d00cf`.
