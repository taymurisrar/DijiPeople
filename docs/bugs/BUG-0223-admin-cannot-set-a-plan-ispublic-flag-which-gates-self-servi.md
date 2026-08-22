---
ID: BUG-0223
aliases: [BUG-0223]
Title: Admin cannot set a plan isPublic flag which gates self-service checkout
Status: VERIFIED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-21
DetectedInSha: 08b8661
AffectedModules: [apps/admin, api:super-admin, api:billing]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: REG-225
RegressionId: REG-225
RelatedBacklogItem: ITEM-0022
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-21
UpdatedAt: 2026-08-22
ResolvedAt: 2026-08-22
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

## Decision and Resolution — 2026-08-22

**The user's instruction was "investigate and keep one only, no duplication".**
Publication won. `isPublic` was the weaker of the two on every axis:

| | `isPublic` | `publicationStatus` |
|---|---|---|
| States | boolean | DRAFT / PUBLISHED / ARCHIVED |
| Default | **`true`** — a new plan is purchasable unless somebody remembers | DRAFT |
| Audit | none | `publishedAt`, `archivedAt` |
| Scope | plan only | plan, market **and** price |
| Operator path | **none** — this record | the governed publish action |
| Treated as authority by | `billing.service`, two `super-admin` reads | `commercial-offer.resolver` |

A boolean gate on a commercial decision that defaults to "yes" and cannot be
turned off through the product is the wrong half to keep.

### What changed

Eleven reads of `Plan.isPublic` in three files now read
`publicationStatus === PUBLISHED`: both checkout entry points, the plan
listings, the public plan reads and the operator dashboard counts.

The response field `isPublic` **stays**, because the landing site consumes it —
but it is now derived rather than stored. One source of truth, several
presentations of it.

### Why this was safe to land in one step

Production was read before the change, not after:

```
key           active  isPublic  publicationStatus
enterprise    true    true      PUBLISHED
growth        true    true      PUBLISHED
starter       true    true      PUBLISHED

plans where the two gates DISAGREE: 0 of 3
```

Every production plan already agreed, so no plan changed purchasability. Had one
disagreed, this would have needed an ExecPlan and a staged rollout — the
Proposed Resolution said so, and checking is what turned that into a fact.

### What remains

The `isPublic` column is still in `schema.prisma`. Dropping it is a
contract-phase migration and is [[ITEM-0082]] — expand/backfill/contract, per
`PLANS.md`. Nothing reads it now, so the column is inert rather than dangerous.

### Regression Coverage

REG-225 — `one-self-service-gate.spec.ts`, five tests. Mutation-proven:
reintroducing the boolean gate fails two of them and names the file and line.

## History

- 2026-08-21 — found while making the plan record form match the API contract
  for [[BUG-0220]].

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Backlog item — [[ITEM-0022]]
- Referenced by — [[ITEM-0082]]
- Modules — [[platform-admin]], [[super-admin]], [[billing]]
- Regression — REG-225 (see the regression register)

<!-- GRAPH:END -->

- 2026-08-22 — user decided: keep one gate. Publication kept, `isPublic` reads removed, production checked first and all three plans already agreed. Column drop is ITEM-0082.
