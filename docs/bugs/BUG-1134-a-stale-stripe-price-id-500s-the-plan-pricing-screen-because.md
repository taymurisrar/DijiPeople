---
ID: BUG-1134
aliases: [BUG-1134]
Title: A stale Stripe price id 500s the plan pricing screen because verifyRecurringPrice is unguarded
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: INTEGRATION
Source: USER_REPORT
DetectedDate: 2026-08-24
DetectedInSha: 15f11c30
AffectedModules: [api:billing, api:super-admin, apps/admin]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-24-record-state-reconciliation-0a5586f.md
RegressionId: REG-248
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-24
UpdatedAt: 2026-08-24
ResolvedAt: 2026-08-24
---

# BUG-1134 — A stale Stripe price id 500s the plan pricing screen because verifyRecurringPrice is unguarded

## Summary

Editing a plan price whose `stripePriceId` no longer exists in the connected
Stripe account returns `500 SYSTEM_UNEXPECTED_ERROR`. The operator sees an
unexplained failure and has no way to clear or replace the dead id from the
screen, so the price cannot be edited again.

This is the same defect [[BUG-0995]] fixed for the *product*, in the sibling
call eighty lines away, left bare.

## Expected Behavior

A price id that no longer resolves is a **verdict**, not a crash.
`verifyRecurringPrice` already returns `{ valid, reasons }`, and
`prepareStripePlanPrice` turns an invalid verdict into
`stripeSyncStatus: FAILED` with `stripeVerificationError` set. The edit should
succeed, the row should be marked unsynced, and the reason should say what to do.

## Actual Behavior

```
500 SYSTEM_UNEXPECTED_ERROR
Error: No such price: 'price_1U4mO1Dx5h60TWDLy3zudsug'
    at StripeBillingService.verifyRecurringPrice
    at SuperAdminService.prepareStripePlanPrice
    at async SuperAdminService.updatePlanPrice
```

## Reproduction

`PATCH /api/super-admin/plans/{planId}/prices/{priceId}` where the stored
`stripePriceId` names a price absent from the current Stripe account.

Observed in production 2026-08-24T19:25:06.291Z, reference
`admin_dfbb759d-60f7-4c65-86a3-221e61ba2773`, on plan
`11111111-1111-4111-8111-111111111111`, price
`8614c1fb-a861-4f4c-b7c6-d3a994b1f7a8`.

## Evidence

- `stripe-billing.service.ts` — `verifyRecurringPrice` called
  `this.stripe.prices.retrieve(input.stripePriceId)` with no `try`.
- The same file, ~80 lines above: `resolveOrCreateProduct` **does** catch
  `resource_missing` and recover, with a comment explaining why an id goes
  stale for ordinary reasons.
- The stale id's prefix is instructive: `price_1U4mO…` against current ids of
  the form `price_1U7…`. The database holds price ids minted by a **different
  Stripe account or sandbox**, so they can never resolve — a reset sandbox or a
  switched account, exactly the cases BUG-0995's comment anticipated.

## Root Cause

BUG-0995 fixed one half of a symmetry. The product path was made resilient and
the price path beside it was not, so the same class of failure survived one
function away.

Both calls retrieve an id that was stored earlier and may since have been
deleted; both are reached from the same request; only one had a guard.

## Impact

**High.** Any plan price carrying a stale id is uneditable, and the failure mode
gives the operator nothing to act on. Combined with [[BUG-1133]] it produced a
misleading picture: some edits succeeded and silently destroyed sibling prices,
others 500'd, and the difference was invisible from the screen.

Worth stating plainly: **this bug was limiting BUG-1133's blast radius.** Fixing
it alone would have made the data loss easier to trigger, which is why the two
were fixed together.

## Affected Areas

- `StripeBillingService.verifyRecurringPrice`
- `SuperAdminService.prepareStripePlanPrice`, `createPlanPrice`, `updatePlanPrice`
- the plan pricing screen in `apps/admin`

## Proposed Resolution

Catch `resource_missing` and return an invalid verdict naming the price and the
remedy. Let everything else throw — an auth failure or a network blip must still
surface, because silently marking a good price unsynced during a Stripe outage
is worse than the error.

**Do not auto-create a replacement.** The product path does, and that is right
for a product; a price determines what customers are charged, and minting one
behind an operator's back is not a recovery, it is a pricing change.

## Acceptance Criteria

- Editing a price with a stale id succeeds, and the row becomes
  `stripeSyncStatus: FAILED` with a readable `stripeVerificationError`.
- The message names the price id and says to re-sync.
- A non-`resource_missing` Stripe error still propagates.
- A price that exists verifies exactly as before.

## Regression Coverage

REG-248 — `stripe-price-resolution.spec.ts`, deliberately the counterpart of
`stripe-product-resolution.spec.ts`; the two should be read together. It covers
the missing case, the wrong-error case, and the still-works case, so a future
change cannot fix one and regress another.

## Dependencies

Same family as [[BUG-1133]]. Fixed in the same change, and the ordering matters:
this one must not land alone.

## Related Items

[[BUG-1133]], [[BUG-0995]], [[BUG-0877]], [[billing]], [[super-admin]]

## Resolution

Fixed on `agent/record-state-reconciliation`. `verifyRecurringPrice` wraps the
retrieve, returns an invalid verdict for `resource_missing`, logs a warning
naming the id, and reports the runtime mode rather than inventing a `livemode`
for a price that no longer exists.

## QA Retest

Five cases green. `super-admin` and `billing` together: 31 suites, 216 tests, 0
failures.

Retest in production by editing the price that produced reference
`admin_dfbb759d-60f7-4c65-86a3-221e61ba2773` and confirming it saves with a
`FAILED` sync status rather than a 500.

## History

- 2026-08-24 — Verified in production at `2609275`. The plan pricing surface answers `200`, and the guard that turns a stale price id into an unsynced row rather than a 500 is deployed. The specific price that produced reference `admin_dfbb759d-60f7-4c65-86a3-221e61ba2773` will now save with a readable `stripeVerificationError`.

- 2026-08-24 — reported by the owner with a full error log from the production
  admin app, while investigating why nine Starter prices had disappeared.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[billing]], [[super-admin]], [[platform-admin]]
- Regression — REG-248 (see the regression register)

<!-- GRAPH:END -->
