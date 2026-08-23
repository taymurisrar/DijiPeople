---
ID: BUG-0994
aliases: [BUG-0994]
Title: Plan entitlements blank out on save and the next save deletes them
Status: FIXED
Severity: CRITICAL
Priority: P0
Type: DATA_INTEGRITY
Source: QA_RUN
DetectedDate: 2026-08-23
DetectedInSha: a3e15568
AffectedModules: [platform-runtime, super-admin, admin]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-241
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-23
UpdatedAt: 2026-08-23
ResolvedAt: 2026-08-23
---

# BUG-0994 — Plan entitlements blank out on save and the next save deletes them

## Summary

The Entitlements tab of a plan in Platform Admin lists the product capabilities
that plan sells, as a grid of checkboxes. Two endpoints on the same runtime
module returned the plan's `features` in two different shapes, and the page
understood only one of them. So a plan read correctly when first opened and then
showed every capability unticked the moment anything on the record was saved —
including a save of the entitlements themselves.

That is not a display fault, because the same emptied array is what the next
save sends. `SuperAdminService.updatePlan` applies `featureKeys` as
`deleteMany: {}` followed by `create`, so it stores exactly the set it is given.
An operator who sees everything unticked, ticks the one capability they meant to
change, and saves has just removed every other entitlement from a plan that live
tenants are subscribed to.

## Expected Behavior

The Entitlements tab shows the capabilities the plan currently grants, whether
the record was just loaded or just saved, and saving changes only what the
operator changed.

## Actual Behavior

- On first load, the ticks are correct.
- After any save on the record, every checkbox is unticked and the "N enabled"
  count reads 0, while the plan in the database is unchanged.
- Ticking one capability from that state and saving deletes all the others.

## Reproduction

1. Open Platform Admin → Plans → any plan with entitlements (Starter grants
   seven) → Entitlements tab. The correct seven are ticked.
2. Change anything on the record and save — the Overview name, or the
   entitlements themselves.
3. The panel re-renders with **nothing** ticked. The plan is still correct in
   the database; only the page is wrong.
4. Tick one capability and press Save entitlements.
5. `PlanFeature` now holds exactly that one row. The other six are gone.

## Evidence

The two shapes, both on `/api/platform-runtime/plans/:id`:

- GET → `PlatformRuntimeService.findGeneric`
  (`services/api/src/modules/platform-runtime/platform-runtime.service.ts`)
  included `features: true`, returning raw `PlanFeature` rows:
  `[{ featureKey: 'leave', isEnabled: true }, …]`
- PATCH → `PlatformRuntimeService.update` → `SuperAdminService.updatePlan` →
  `mapPlan` (`services/api/src/modules/super-admin/super-admin.service.ts:4087`),
  returning already-filtered keys: `['leave', …]`

`apps/admin/app/_components/runtime/runtime-record-page.tsx` read only the row
shape:

```ts
(form.values.features as Array<Record<string, unknown>>)
  .filter((item) => item.isEnabled !== false)
  .map((item) => String(item.featureKey ?? ""))
  .filter(Boolean)
```

Over a `string[]`, `item.featureKey` is `undefined` on every element, so every
mapped value is `""` and `.filter(Boolean)` removes all of them — an empty set,
silently.

The destructive half, in `updatePlan`:

```ts
features: {
  deleteMany: {},
  create: featureKeys.map((featureKey) => ({ featureKey, isEnabled: true, … })),
}
```

## Root Cause

One runtime module described the same field two ways depending on the verb, and
the client trusted whichever response arrived last. The record page holds
`form.values` from the most recent response, so the PATCH shape overwrote the
GET shape and the derivation silently produced `[]` rather than failing.

The empty set was then indistinguishable from a deliberate "grant nothing",
because the API applies `featureKeys` as a replacement rather than a delta.

## Impact

Reachable in production, on every plan, through the ordinary route an operator
takes to change what a plan sells. The visible symptom is confusing; the second
save is data loss on commercial configuration, affecting every tenant on the
plan through the feature gates the product reads.

Found because it was reported from the live admin app as "the entitlements are
not correctly mapped — checkbox is unchecked".

## Affected Areas

- `services/api/src/modules/platform-runtime/platform-runtime.service.ts`
- `services/api/src/modules/super-admin/super-admin.service.ts` (`mapPlan`, `updatePlan`)
- `apps/admin/app/_components/runtime/runtime-record-page.tsx`
- `apps/admin/app/_components/plans/plan-entitlements-panel.tsx`

## Proposed Resolution

Make the runtime GET return the same shape as the runtime PATCH, so the two
cannot disagree; and keep the client tolerant of both, because it is the last
thing standing between a future mapper disagreement and deleted entitlements.

No ExecPlan needed — no schema change, no migration.

## Acceptance Criteria

- `GET /platform-runtime/plans/:id` returns `features` as a filtered key array,
  identical in shape to what `PATCH` returns.
- The Entitlements tab shows the same ticks before and after a save.
- A save sends the set the operator sees, never an empty set the page invented.

## Regression Coverage

- `services/api/src/modules/platform-runtime/plan-record-shape.spec.ts` — pins the
  GET shape to the PATCH shape. Mutation-tested: restoring `features: item.features`
  fails both cases.
- `apps/admin/lib/runtime/plan-entitlement-keys.spec.ts` — the client helper reads
  both shapes, drops a disabled row, and never silently empties a set it cannot
  read.

Registered as REG-241.

## Dependencies

None.

## Related Items

- [[BUG-0995]] — the other plan-screen defect found in the same pass.
- [[BUG-0027]] — the earlier case of Admin showing one pricing number while
  checkout used another; the same family of two-sources-of-truth defect.

## Resolution

Fixed on `agent/plan-pricing-admin-ux`.

- `platform-runtime.service.ts` — the plans branch of `findGeneric` now maps
  `features` to enabled keys, matching `mapPlan`, with a comment tying the two
  together.
- `apps/admin/lib/runtime/plan-entitlement-keys.ts` — new shape-tolerant
  `planEntitlementKeys()`, carrying the full account of why it accepts both.
- `runtime-record-page.tsx` — derives through the helper instead of inlining the
  row-shaped read.

Nothing was changed about `updatePlan`'s replacement semantics: replacing the set
is the right contract for that endpoint. What was wrong was the set it was sent.

## QA Retest

Covered by the two regression specs above; both pass, and the API-side one was
mutation-tested. Not yet retested on a deployed environment — pending the next
deploy of `develop`.

## History

- 2026-08-23 — created from qa run at `a3e15568`.
- 2026-08-23 — root cause established, fixed, regression coverage added.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[super-admin]], [[platform-admin]]
- Regression — REG-241 (see the regression register)

<!-- GRAPH:END -->
