---
ID: BUG-1953
aliases: [BUG-1953]
Title: Plan detail reports zero subscriptions while the plans list and subscriptions both show two
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [apps/admin, services/api/src/modules/super-admin]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1953 — Plan detail reports zero subscriptions while the plans list and subscriptions both show two

## Summary

Platform Admin shows two different subscription counts for the same plan on the
same console. The plans list says the Starter plan has 2 subscriptions and the
subscriptions screen lists two tenants on Starter; the plan's own Overview tile
says 0 and tells the operator "No tenant is billed on this plan yet."

## Expected Behavior

One plan has one subscription count. Whichever screen an operator opens, the
number agrees, and an empty state is shown only when the plan genuinely has no
subscriptions.

## Actual Behavior

The plan detail Overview tile reports 0 and renders the empty-state sentence
"No tenant is billed on this plan yet" for a plan that is billing two tenants.

## Reproduction

Target: `https://admin.dijipeople.com`, production API commit `949f461c`,
observed 2026-08-29.

1. Open Platform Admin and go to Plans.
2. Read the Subscriptions column for the Starter plan (id
   `11111111-1111-4111-8111-111111111111`): it shows **2**.
3. Open Subscriptions and filter for Starter: **two tenants** are listed, one of
   them `DijiPeople Demo` (Starter / Active / MONTHLY).
4. Open the plan itself at `/plans/11111111-1111-4111-8111-111111111111` and read
   the Overview subscriptions tile: it shows **0**, with the caption "No tenant
   is billed on this plan yet."

## Evidence

Observed live on the production admin console:

- Plans list, Subscriptions column for Starter: `2`
- `/subscriptions` filtered to Starter: two tenant rows
- `/plans/11111111-1111-4111-8111-111111111111` Overview tile: `0`, empty-state
  copy "No tenant is billed on this plan yet."

No file:line evidence was collected for this finding — the two counts were read
off the rendered screens, and the QA run did not trace which query each tile
uses.

## Root Cause

Not established. The two surfaces evidently count subscriptions by different
predicates (a status filter, a currency or price scope, or a different relation),
but which one is wrong was not determined.

## Impact

Operational trust. A platform operator deciding whether a plan can be retired,
repriced or archived reads the plan detail first, and that screen actively
asserts the plan has no paying tenants. Acting on it — archiving the plan, or
changing prices believing nobody is on them — would affect two live tenants. It
is not HIGH because nothing is mutated by the wrong number on its own; the
damage requires an operator to act on it.

## Affected Areas

`apps/admin` plan detail Overview and plans list; the `super-admin` plans and
subscriptions endpoints behind them.

## Proposed Resolution

Find both counting queries and make the detail tile use the same predicate the
list uses (or, better, the same endpoint). Then decide deliberately what the
count means — all subscriptions, or only active ones — and say so in the tile
label, so the two screens cannot drift apart again for a defensible reason.

## Acceptance Criteria

- The plans list count and the plan detail tile report the same number for the
  same plan, for every plan.
- The empty state appears only when that number is zero.

## Regression Coverage

None yet. A test that creates two subscriptions on one plan and asserts both
surfaces report 2 would fail today.

## Dependencies

None identified.

## Related Items

BUG-1755 (the plans list cannot show publication status or sales model because
the API omits them) is the same screen and the same class of list/detail
divergence, though a different field.

## Resolution

**Fixed 2026-08-29.** The premise held, and both numbers were being read from
the same payload.

`SuperAdminService.mapPlan` sends the count twice —
`services/api/src/modules/super-admin/super-admin.service.ts:4660-4661` — once
as `subscriptionCount` and once as `subscriptions`. The second name is
deliberate and is explained two hundred lines away in the admin module
registry: `validateRuntimeDefinition` resolves every list column against the
Prisma model graph, so the Plans list column has to be called `subscriptions`
after the relation, and a computed alias would resolve to nothing. Both are
numbers.

The plan record page then did this, at
`apps/admin/app/_components/runtime/runtime-record-page.tsx:545-549 before the fix`:

    Array.isArray(form.values.subscriptions) ? form.values.subscriptions.length : 0

A number is not an array, so every plan fell through to the zero branch — and
zero is exactly the value that makes the tile render "No tenant is billed on
this plan yet." The Plans list read the same field as a number and showed 2.
Nothing was miscounted; one of the two readers had the wrong idea of the shape.

The count is now read by a named helper rather than inline:

- `apps/admin/lib/runtime/plan-subscription-count.ts` — `planSubscriptionCount`
  prefers `subscriptionCount`, falls back to `subscriptions`, and accepts either
  a number or a relation array. The array branch is not defensive padding:
  `PlatformRuntimeService.findGeneric` genuinely includes the subscription rows
  for a plan, so both shapes exist in this codebase today.
- `apps/admin/lib/runtime/plan-subscription-count.spec.ts` — six cases,
  including the exact production payload (`{ subscriptions: 2 }`), which
  returned 0 before this change.
- `apps/admin/app/_components/runtime/runtime-record-page.tsx:554` now calls it.

The tile label was left as "Subscriptions" and still counts every subscription
on the plan, which is what the list column counts. The record asked for the two
predicates to be made the same; they always were, so there was no second
predicate to reconcile.

## QA Retest

Not retested against production. The helper is covered by unit tests; the screen
itself needs an operator to open a plan that has subscriptions and read the
Overview tile.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition FIX_NOW — isolated read/count bug on one admin tile.
- 2026-08-29 — fixed in SESSION-0076: the record page read a number as an array. `planSubscriptionCount` and its spec added; no API change was needed.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[platform-admin]], [[super-admin]]

<!-- GRAPH:END -->
