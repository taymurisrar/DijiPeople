---
ID: BUG-1755
aliases: [BUG-1755]
Title: The plans list cannot show publication status or sales model because the API omits them
Status: FIXED
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-28
DetectedInSha: 912f4e61
AffectedModules: [apps/admin, api:super-admin]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: docs/qa/runs/2026-08-28-admin-console-e2e-912f4e6.md
RegressionId: REG-278
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-28
UpdatedAt: 2026-08-28
ResolvedAt:
---

# BUG-1755 — The plans list cannot show publication status or sales model because the API omits them

## Summary

The Plans list renders **Publication** and **Sales model** as an em dash for
every plan. Both columns were added deliberately — the registry comment calls
publication status "what actually governs whether a plan reaches the public
catalogue" and made it the leading column — but `mapPlan()` does not serialize
either field, so the API never sends them. The screen built to show an operator
which plans are sellable shows nothing in the two columns that would answer it.

## Expected Behavior

The Plans list shows each plan's publication status and sales model, so an
operator can see at a glance which plans reach the public catalogue.

## Actual Behavior

Both columns are empty for all five plans.

## Reproduction

1. Platform Admin, **Plans**.
2. Every row shows an em dash under **Publication** and under **Sales model**,
   while Plan, Active, Prices, Features, Subscriptions and Updated all populate.

## Evidence

`GET /api/super-admin/plans` returns, per plan:

```
id, key, name, description, isActive, monthlyBasePrice, annualBasePrice,
currency, sortOrder, subscriptionCount, subscriptions, priceCount, featureCount,
pricingModels, monthlyFrom, annualFrom, startingCurrency, prices, features,
createdAt, updatedAt, createdById
```

Neither `publicationStatus` nor `salesModel` appears. Reading them back for each
plan returns `undefined`.

Both exist on the model — `services/api/prisma/schema.prisma`, `model Plan`:

```prisma
publicationStatus  CommercialPublicationStatus @default(DRAFT)
salesModel         CommercialSalesModel        @default(SELF_SERVICE)
@@index([publicationStatus, isActive, sortOrder])
```

They are indexed, so they are meant to be queried on.

The columns are declared deliberately in
`apps/admin/lib/runtime/platform-module-registry.ts`, with the comment:

> Publication, not `isActive`, is what decides whether a plan reaches the public
> catalogue. Leading with it shows an operator the state that actually governs
> what customers can buy.

## Root Cause

`mapPlan()` in `services/api/src/modules/super-admin/super-admin.service.ts`
builds its response shape by hand and was never extended when the publication
columns were added. The frontend asked for fields the serializer does not send.

## Impact

An operator cannot tell which plans are published or how they are sold, on the
screen designed to tell them. That matters more than a normally-empty column
because of [[BUG-1749]]: plans created from the console are active but
unsellable, and publication status is exactly the field that would make that
visible.

It also interacts with [[BUG-0220]]'s acceptance criterion, which required that
"publication status, sales model and the publication timestamps are visible on
the record and clearly not editable there". They are not visible.

## Affected Areas

`super-admin` `mapPlan()` and the plans list endpoint; `apps/admin` plans list
and record screens.

## Proposed Resolution

Add `publicationStatus` and `salesModel` to `mapPlan()`. They are read-only on
this surface by design — [[ITEM-0022]] owns making publication a governed action
— so this is a serialization change, not a new write path.

## Acceptance Criteria

- The Plans list shows a real publication status and sales model for every plan.
- The plan record shows both, clearly not editable.
- A regression test asserts the plan serializer includes both fields.

## Regression Coverage

None yet.

## Dependencies

None. Deliberately does not depend on [[ITEM-0022]], which is about making them
writable through governed actions.

## Related Items

[[BUG-1749]] — plans created from the console are active but unsellable;
publication status is the field that would surface it.
[[BUG-0220]] — required these fields be visible on the record; that half was not
delivered.
[[ITEM-0022]] — the governed publish and archive actions that should own writing
these fields.

## Resolution

Fixed 2026-08-28 on `agent/open-bug-sweep`. A serialization change, as this
record said, and nothing more.

`mapPlan()` now sends `publicationStatus`, `salesModel`, `publishedAt` and
`archivedAt`. No write path is added: ITEM-0022 owns making publication a
governed action, and these stay read-only on this surface.

`isPublic` is also sent, but derived from `publicationStatus` rather than read
from the column — see [[BUG-1749]] and BUG-0223 for why reading it would
reintroduce a second gate.

Guarded by REG-278.

## QA Retest

Not retested in a browser. `plan-lifecycle.spec.ts` asserts each field is
serialized, and asserts separately that `isPublic` is derived rather than read.

The browser check is one screen: the Plans list, with Publication and Sales model
showing values instead of em dashes for every row.

## History

- 2026-08-28 — created from the admin console end-to-end QA pass at `912f4e61`,
  observed against production `e0aeabcd`.
- 2026-08-28 - mapPlan serializes publication state, so the Plans list can answer the question it was built to answer. REG-278.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[platform-admin]], [[super-admin]]
- Regression — REG-278 (see the regression register)

<!-- GRAPH:END -->
