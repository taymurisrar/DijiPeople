---
ID: BUG-0223
aliases: [BUG-0223]
Title: Admin cannot set a plan isPublic flag which gates self-service checkout
Status: PRODUCT_DECISION
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-21
DetectedInSha: 08b8661
AffectedModules: [apps/admin, api:super-admin, api:billing]
OwnerAgent: architect
ArchitectDisposition: PRODUCT_DECISION
QAReport:
RegressionId:
RelatedBacklogItem: ITEM-0022
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-21
UpdatedAt: 2026-08-21
ResolvedAt:
---

# BUG-0223 — Admin cannot set a plan isPublic flag which gates self-service checkout

## Summary

`Plan.isPublic` gates self-service checkout — `BillingService` refuses a
checkout session for a plan price whose plan is not public, and the public plan
listing filters on it. No Admin path sets it. Neither `CreatePlanDto` nor
`UpdatePlanDto` declares it, the legacy plan form does not send it, and the
runtime record page cannot (see [[BUG-0220]]). The flag can only be changed
directly in the database or by a seed.

## Expected Behavior

A platform operator can decide, from Platform Admin, whether a plan is offered
for self-service purchase.

## Actual Behavior

The value is displayed and cannot be changed by anyone using the product.

## Reproduction

1. Open a plan in Platform Admin. **Public** shows its stored value, read-only.
2. Search the codebase for a write path: none exists outside `seed-config`,
   `commercial-bootstrap.ts` and the ITEM-0018 backfill migration.

## Evidence

- `services/api/src/modules/billing/services/billing.service.ts:257`, `:324`,
  `:843` — checkout is refused when `!planPrice.plan.isPublic`.
- `services/api/src/modules/super-admin/super-admin.service.ts:2819`, `:2828` —
  public plan reads filter `{ isActive: true, isPublic: true }`.
- `services/api/src/modules/super-admin/dto/update-plan.dto.ts` — no `isPublic`.
- `services/api/src/modules/super-admin/dto/create-plan.dto.ts` — no `isPublic`.
- `services/api/src/modules/super-admin/super-admin.service.ts` — `updatePlan`
  does not pass it to the repository.

## Root Cause

Not established. Most likely `isPublic` predates the publication state added by
ITEM-0018 and was left in place as a second gate without an owner deciding which
of the two an operator should be setting.

## Impact

A plan cannot be opened to or withdrawn from self-service purchase without a
database change. Low frequency, high consequence: it decides what customers can
buy.

## Affected Areas

`apps/admin` plans screens, `super-admin` plan DTOs and service, `billing`
checkout gating.

## Proposed Resolution

**A product decision before an implementation.** Either

1. `isPublic` and `publicationStatus` are one concept, in which case `isPublic`
   should be derived from publication and removed as an independent gate; or
2. they are genuinely different — published means released, public means
   self-service rather than sales-assisted — in which case setting it belongs
   with the governed publish and archive actions in [[ITEM-0022]], audited the
   same way, not as a checkbox.

Option 1 changes checkout behaviour and needs an ExecPlan. Nothing here should
be fixed by quietly adding the property to `UpdatePlanDto`.

## Acceptance Criteria

- Whether a plan is buyable self-service is decidable from Platform Admin.
- The decision is audited, and only one field expresses it.

## Regression Coverage

None yet.

## Dependencies

Overlaps [[ITEM-0022]]; should be sequenced with it rather than separately.

## Related Items

[[ITEM-0018]] — introduced `publicationStatus` beside this flag.
[[ITEM-0022]] — governed publish and archive actions.
[[BUG-0220]] — why the runtime record page cannot write it today.

## Resolution

Not resolved. Recorded rather than fixed: adding the field to the DTO would
create a second ungoverned way to change what customers can buy, which is the
thing ITEM-0022 exists to stop.

## QA Retest

Not applicable yet.

## History

- 2026-08-21 — found while making the plan record form match the API contract
  for [[BUG-0220]].
