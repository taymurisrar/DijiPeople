---
ID: BUG-0995
aliases: [BUG-0995]
Title: Editing any plan price 500s once its Stripe product id goes stale
Status: FIXED
Severity: HIGH
Priority: P1
Type: INTEGRATION
Source: USER_REPORT
DetectedDate: 2026-08-23
DetectedInSha: a3e15568
AffectedModules: [billing, super-admin]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-242
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-23
UpdatedAt: 2026-08-23
ResolvedAt: 2026-08-23
---

# BUG-0995 — Editing any plan price 500s once its Stripe product id goes stale

## Summary

Every attempt to edit any price on a plan returned a 500 once the plan's stored
`stripeProductId` pointed at a Stripe product that no longer existed. Two
independent defects compounded into a permanent dead end: the lookup did not
handle a missing product, and the caller could not replace the id even after a
replacement was created. No screen offered a way to clear the id, so the plan
could not be priced again from Admin at all.

## Expected Behavior

A stale Stripe product id is an ordinary condition — the sandbox was reset, the
account was switched, someone removed the product in the dashboard. The price
edit should create a replacement product, store its id, and carry on.

## Actual Behavior

```
500 SYSTEM_UNEXPECTED_ERROR
PATCH /api/super-admin/plans/{planId}/prices/{priceId}
Cause: No such product: 'prod_V4vU7oieZdX6kH'
  at StripeBillingService.resolveOrCreateProduct
```

Repeatable on every attempt, for every price on the plan.

## Reproduction

1. Take a plan whose `stripeProductId` names a product that is absent from the
   connected Stripe account.
2. Platform Admin → that plan → Pricing → edit any price → Save.
3. 500, every time. Nothing in the UI can clear or correct the id.

## Evidence

`services/api/src/modules/billing/services/stripe-billing.service.ts` —
`resolveOrCreateProduct` handled a *deleted* product, for which Stripe returns a
stub carrying `deleted: true`, but not a *missing* one, for which
`products.retrieve` throws `resource_missing`. The throw escaped, so the
"orCreate" half never ran.

`services/api/src/modules/super-admin/super-admin.service.ts:4246` — the caller
persisted a newly created product id only when the stored one was **empty**:

```ts
if (!input.plan.stripeProductId) { … }   // never true here: it is set, just dead
```

So even with the first defect fixed, each attempt would have created a fresh
Stripe product, failed to record it, and failed again next time — leaking one
product per attempt.

Reported from production by the user with the full error log.

## Root Cause

Two Stripe failure modes look alike and are not: a deleted product resolves, a
missing product throws. Only the first was handled. The persistence condition
then encoded "we have no id" where the real question was "is the id we have the
one we just resolved".

## Impact

Reachable in production. A plan in this state cannot have any price created or
edited from Admin, which blocks commercial configuration entirely for that plan
— including the price sync that go-live depends on.

## Affected Areas

- `services/api/src/modules/billing/services/stripe-billing.service.ts`
- `services/api/src/modules/super-admin/super-admin.service.ts`

## Proposed Resolution

Catch `resource_missing` specifically and fall through to creation; and persist
the resolved id whenever it differs from the stored one, rather than only when
the stored one is absent.

## Acceptance Criteria

- A missing Stripe product results in a replacement being created and stored.
- A deleted Stripe product behaves the same way, as it already did.
- An existing product is reused, with no create call.
- Any other Stripe error — authentication, network — still raises. Swallowing
  those would mint duplicate products during an outage, silently.

## Regression Coverage

`services/api/src/modules/billing/stripe-product-resolution.spec.ts`, four cases
covering exactly the acceptance criteria above. Mutation-tested: replacing the
guard with `if (true) throw error` fails the missing-product case.

Registered as REG-242.

## Dependencies

None.

## Related Items

- [[BUG-0994]] — the other plan-screen defect found in the same pass.
- [[BUG-0989]] — the Stripe webhook destination failure from the same go-live
  sweep.

## Resolution

Fixed on `agent/plan-pricing-admin-ux`.

- `stripe-billing.service.ts` — `resolveOrCreateProduct` catches
  `StripeInvalidRequestError` with `code === 'resource_missing'`, logs which
  plan it is replacing a product for, and falls through to `products.create`.
  The narrowness is deliberate and commented: any other error still raises.
- `super-admin.service.ts` — the persistence condition became
  `if (input.plan.stripeProductId !== product.id)`, so a stale id is corrected
  rather than kept.

## QA Retest

Covered by the regression spec, which passes and was mutation-tested. Retest
against the reported plan once `develop` is deployed.

## History

- 2026-08-23 — reported from production with the full error log.
- 2026-08-23 — both defects established, fixed, regression coverage added.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[billing]], [[super-admin]]
- Regression — REG-242 (see the regression register)

<!-- GRAPH:END -->
