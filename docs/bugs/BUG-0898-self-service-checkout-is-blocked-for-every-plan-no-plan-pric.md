---
ID: BUG-0898
aliases: [BUG-0898]
Title: "Self-service checkout is blocked for every plan: no plan price has ever been synced to Stripe"
Status: OPEN
Severity: CRITICAL
Priority: P0
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-23
DetectedInSha: 1dd74a25
AffectedModules: [services/api/src/modules/super-admin, apps/landing/app/subscribe]
OwnerAgent: architect
ArchitectDisposition: BLOCKED_EXTERNAL
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-23
UpdatedAt: 2026-08-23
ResolvedAt:
---

# BUG-0898 — Self-service checkout is blocked for every plan: no plan price has ever been synced to Stripe

## Summary

Nobody can buy DijiPeople online. On production, **0 of 36 active plan prices**
carry a synced Stripe price, so `checkoutReady` is false for all of them and
`checkoutBlock()` returns `DP-CHK-01` for every plan a visitor selects. The
subscribe wizard responds by refusing to render its form at all — the buyer sees
"This plan is not available to buy online at the moment" and a link to sales.
This is the state of `www.dijipeople.com` right now, for Starter, Growth and
Enterprise alike.

The mechanism is not broken; it has never been run. `seed-commercial.ts` says so
in its own header: *"What it does **not** do is talk to Stripe. Every price it
writes is published … Syncing is … a real Stripe account — not something a seed
should do on anyone's behalf."* Syncing is an operator action in Platform Admin,
and no operator has performed it.

## Expected Behavior

A visitor selecting a self-service plan on `/subscribe` gets the onboarding
wizard and can complete a purchase.

## Actual Behavior

Every plan — including the three marked `SELF_SERVICE` — renders the
`DP-CHK-01` block and no form. Verified identically on production and on a
freshly seeded local stack.

## Reproduction

1. Open `https://www.dijipeople.com/subscribe`.
2. Select any plan in the "Plan" control, or arrive with
   `?plan=starter&billingInterval=MONTH&teamSize=25`.
3. The form area reads "This form is not available for the plan you have
   selected (DP-CHK-01)". No wizard fields are rendered.

## Evidence

Browser probe against production, all four entry points:

```
=== /subscribe                                        selected: Starter      DP-CHK-01: BLOCKED — no form
=== /subscribe?plan=starter&billingInterval=MONTH…    selected: Starter      DP-CHK-01: BLOCKED — no form
=== /subscribe?plan=growth&billingInterval=MONTH…     selected: Growth       DP-CHK-01: BLOCKED — no form
=== /subscribe?plan=enterprise&billingInterval=MONTH… selected: Enterprise   DP-CHK-01: BLOCKED — no form
```

`GET https://api.dijipeople.com/api/public/plans` — every price, e.g. Starter
PKR MONTHLY PER_SEAT:

```json
{
  "stripeProductId": null,
  "hasStripePrice": false,
  "checkoutReady": false,
  "isCheckoutReady": false,
  "stripeSyncStatus": "NOT_SYNCED",
  "stripeVerifiedAt": null,
  "checkoutReadinessReasons": [
    "Stripe Product ID is missing.",
    "Stripe Price ID is missing.",
    "Stripe environment does not match.",
    "Stripe verification has not succeeded.",
    "Stripe Price is inactive.",
    "Stripe usage type must be licensed.",
    "Stripe recurring interval must be month.",
    "Stripe Price has not been verified."
  ]
}
```

`npm run report:commercial` states it plainly:

```
0 of 36 active price(s) are synced to Stripe. The rest cannot be checked out until they are.
```

## Root Cause

Two facts combine:

1. `seed-commercial.ts` writes prices directly through Prisma and deliberately
   never contacts Stripe.
2. The only code path that creates the Stripe product and recurring price is
   `SuperAdminService.prepareStripePlanPrice`, reached by creating or updating a
   plan price through the Platform Admin API.

So a freshly seeded deployment — which is what production is — has a full
catalogue and nothing sellable, and the gap is invisible until someone tries to
buy.

## Impact

Total loss of self-service revenue. Every visitor who clicks the site's primary
call to action reaches a dead end. This is the single largest go-live blocker
found in this run.

## Affected Areas

- `services/api/src/modules/super-admin/super-admin.service.ts`
  (`prepareStripePlanPrice`)
- `services/api/prisma/seed-commercial.ts`
- `apps/landing/lib/plans.ts` (`checkoutBlock`, `isCheckoutReady`)
- `apps/landing/app/subscribe/subscribe-form.tsx`

## Proposed Resolution

Operationally: sync the SELF_SERVICE prices for every launched market through
Platform Admin before go-live, and confirm with `npm run report:commercial`.

Structurally, two gaps are worth closing so this cannot recur silently:

- There is **no bulk sync command**. Syncing 36 prices means 36 individual
  admin edits. A `npm run stripe:sync-prices` script — or a "sync all" action on
  the plans screen — belongs next to `report:commercial`.
- Nothing fails when the catalogue is unsellable. `npm run smoke:deployment`
  should assert that at least one SELF_SERVICE price per launched market is
  `checkoutReady`, so a deployment that cannot take money is a failed
  deployment rather than a quiet one.

This needs an ExecPlan only if the bulk-sync command is built; the operational
step does not.

## Acceptance Criteria

- `report:commercial` shows every active SELF_SERVICE price as `stripe:SYNCED`
  for each launched market.
- `/subscribe` renders the wizard for Starter, Growth and Enterprise.
- A deployment smoke check fails when no purchasable price exists.

## Regression Coverage

None yet. The check that would have caught this is a deployment-time assertion
that a launched market has at least one `checkoutReady` price — see Proposed
Resolution.

## Dependencies

Requires `STRIPE_API_VERSION` to be set wherever the sync is run. It is present
in production; it is commented out in `services/api/.env` locally, where the
sync 500s with `STRIPE_API_VERSION is required for Stripe billing.` — see
[[ITEM-0087]].

## Related Items

[[BUG-0901]], [[BUG-0903]], [[BUG-0904]]

## Resolution

Not fixed here. Production plan prices are commercial data and syncing them
creates real Stripe objects on the live account; that is the owner's call, not a
QA run's.

Proven fixable: on the isolated stack all 36 prices synced successfully through
the documented admin path (`e2e/sync-stripe-prices.mjs`), after which the wizard
rendered and a complete purchase went through. The mechanism works.

## QA Retest

Retest by opening `/subscribe` for each plan and confirming the wizard renders,
then completing one purchase in Stripe test mode.

## History

- 2026-08-23 — created from qa run at `1dd74a25`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Referenced by — [[ITEM-0085]], [[ITEM-0086]]
- Modules — [[super-admin]]

<!-- GRAPH:END -->
