---
ID: BUG-1749
aliases: [BUG-1749]
Title: Admin creates plans that can never be sold and can never be deleted
Status: OPEN
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-28
DetectedInSha: 912f4e61
AffectedModules: [apps/admin, api:super-admin]
OwnerAgent: architect
ArchitectDisposition: TRIAGE_REQUIRED
QAReport: docs/qa/runs/2026-08-28-admin-console-e2e-912f4e6.md
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-28
UpdatedAt: 2026-08-28
ResolvedAt:
---

# BUG-1749 — Admin creates plans that can never be sold and can never be deleted

## Summary

`/plans/new` is a bespoke page that collects `monthlyBasePrice`,
`annualBasePrice` and `currency` — precisely the legacy fields the runtime form
deliberately removes — and creates no `PlanPrice` rows. Checkout sells from
`PlanPrice`, so a plan created through the admin console is born active and
unsellable. There is no delete endpoint for a plan, so it then cannot be
removed. Two plans in production are in exactly this state.

## Expected Behavior

Creating a plan from the console produces a plan a customer can actually buy, or
the console tells the operator that prices must be added before it can be sold.

## Actual Behavior

The plan is created active, with legacy base-price columns set and zero
`PlanPrice` rows, and cannot subsequently be deleted.

## Reproduction

1. Platform Admin, **Plans**, press **New**.
2. Observe the form collects Plan key, Plan name, Description, Monthly price,
   Annual price, Currency, Sort order, Active plan and feature entitlements.
3. Create a plan and read it back: `priceCount` is 0.
4. There is no way to delete it from the console, and no API route to delete it.

## Evidence

The runtime deliberately withdraws these fields —
`apps/admin/lib/runtime/platform-module-registry.ts`:

```ts
const FORM_EXCLUDED_FIELDS = {
  plans: ["currency", "monthlyBasePrice", "annualBasePrice",
          "legacyPricingMigratedAt"],
};
```

with a comment stating that what is withdrawn "is the claim that an operator
should be setting them". The bespoke create page collects them anyway.

`services/api/src/modules/super-admin/super-admin.service.ts:1842` `createPlan()`
writes `monthlyBasePrice`, `annualBasePrice`, `currency` and feature rows, and
creates no `PlanPrice`.

Live state, `GET /api/super-admin/plans`:

```
QA00591      active false  prices 0   currency PKR
Starter      active true   prices 15  currency USD
Growth       active true   prices 16  currency USD
Enterprise   active true   prices 17  currency USD
Enterprise+  active true   prices 0   currency USD
```

`Enterprise+` is active with zero prices and **is offered publicly** —
`GET /api/public/plans` returns it with `prices: []`. `QA00591` is a previous
session's test plan that cannot be removed.

Deletion: `MODULE_CAPABILITIES.plans` is `{create: false, update: true, delete:
false}` and the only delete route under plans is
`@Delete('plans/:planId/prices/:priceId')`. The disabled Delete in the UI is
deliberate and explains itself well ("Archive the plan instead") — that part is
good design. The asymmetry is the defect: a bespoke create page makes records
the runtime then refuses to remove.

Note also that `MODULE_CAPABILITIES.plans.create` is `false`, yet the list
renders an enabled **New** button, because it routes to the bespoke page rather
than the runtime record page.

## Root Cause

Two creation paths for one entity. The runtime path was corrected to stop
treating legacy base prices as operator-editable; the bespoke `/plans/new` page
was not, and it is the one the New button reaches.

## Impact

Any plan created by an operator is unsellable until someone adds `PlanPrice`
rows through another route, and is permanent once created. `Enterprise+` is the
live consequence: an active, price-less plan in the public catalogue that a
customer can select and not be charged for — the shape recorded in
[[BUG-1555]].

## Affected Areas

`apps/admin` `/plans/new`, `super-admin` `createPlan`, the public plan catalogue.

## Proposed Resolution

Retire the bespoke create page in favour of the runtime, or make it create
`PlanPrice` rows and stop collecting legacy columns. Either way a plan should
not be able to become active and public with no price. Decide separately whether
an operator-created plan should default to inactive.

## Acceptance Criteria

- A plan created from the console either has sellable prices or is not active
  and not public.
- The create form does not collect the fields `FORM_EXCLUDED_FIELDS` withdraws.
- The public catalogue never returns an active plan with no prices.
- `Enterprise+` and `QA00591` are resolved — archived, priced, or removed.

## Regression Coverage

None yet.

## Dependencies

Overlaps [[BUG-1555]], which is open by deliberate decision.

## Related Items

[[BUG-1555]] — an inactive or price-less plan offered as a customer preferred
plan; open on purpose, and this record is the creation path that keeps producing
them.
[[BUG-1755]] — the Plans list cannot show publication status, so an operator
cannot see which plans are sellable.
[[BUG-1745]] — the currency confusion this shares: plan rows carry USD and PKR
while every real price is QAR.

## Resolution

Not yet fixed.

## QA Retest

Not yet retested.

## History

- 2026-08-28 — created from the admin console end-to-end QA pass at `912f4e61`,
  observed against production `e0aeabcd`. No test plan was created during the
  pass, precisely because plans cannot be deleted.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[platform-admin]], [[super-admin]]

<!-- GRAPH:END -->
