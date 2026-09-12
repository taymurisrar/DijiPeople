---
ID: ITEM-0172
aliases: [ITEM-0172]
Title: Wire debounced search and the openable label into the metadata-driven record-form lookup call site
Type: FOLLOW_UP
Status: READY
Priority: P1
Severity: HIGH
AffectedModules: [apps/web]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
CreatedAt: 2026-09-12
UpdatedAt: 2026-09-12
RelatedBug: BUG-3376
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0172 — Wire debounced search and the openable label into the metadata-driven record-form lookup call site

## Summary

[[BUG-3376]] and [[ITEM-0163]] were fixed at the adapter and control layer in
SESSION-0103 (`apps/web/lib/runtime/modules/standard-module-data.adapter.ts`,
`apps/web/app/components/ui/form-control.tsx`) and fully closed for the admin
console, but the one remaining integration point for the tenant product —
wiring the fix into `apps/web/app/components/metadata/runtime-metadata-form-renderer.tsx`,
the sole call site for every metadata-driven record-form lookup (Project →
Project Manager, Approval Manager, Account Manager, Delivery Manager, and
every other entity-lookup field rendered by the standard module runtime) —
was explicitly out of scope: that file was owned by a concurrent agent in the
same session and the task brief for this work named it as a file not to
touch.

This item is that remaining wiring. Everything it needs already exists.

## Why It Matters

Until this lands, BUG-3376's core reproduction case — a tenant with more than
20 employees, where every entity lookup on a runtime record form silently
limits itself to the server's default page — is **not fixed** for the tenant
product, only for the platform admin console. A user typing the exact name of
the 50th employee in a Project's "Project Manager" field still gets "No
matching records found," reads it as "this person does not exist," and either
creates a duplicate or abandons the task. Every day this stays open is another
day that failure mode is live for every tenant above the default page size.

## Evidence

- `apps/web/app/components/metadata/runtime-metadata-form-renderer.tsx:1222-1241`
  — the `<LookupField>` construction for a metadata-driven lookup field. No
  `onSearch`, no `resultsTruncated`, `options` is a static array from the
  hydration effect at `:734-825`.
- `apps/web/app/components/metadata/runtime-metadata-form-renderer.tsx:2432-2454`
  — `LOOKUP_REFERENCE_ROUTES`, the hand-maintained allowlist ITEM-0163 asked to
  replace with a module-registry lookup. Untouched by SESSION-0103 for the same
  reason.
- `apps/web/lib/runtime/modules/standard-module-data.adapter.ts`'s
  `getLookupOptions` already accepts an optional 4th argument,
  `{ search?: string }` (BUG-3376), and already sends an explicit page size
  (`ENTITY_LOOKUP_PAGE_SIZE`, currently 50) for anything that is not a small
  reference set (`isSmallReferenceLookupEntity` in
  `apps/web/lib/runtime/lookup-search.ts`).
- `apps/web/app/components/ui/form-control.tsx`'s `LookupField` already
  accepts `onSearch` (now debounced), `resultsTruncated`, and pins the
  previously resolved selected option across a narrower search result
  (`resolveVisibleSelectedOption`). It already renders `selectedHref` as a
  label-row link rather than a line below the control (ITEM-0163) — no change
  needed there for this item.
- `docs/architecture/lookup-control-contract.md` — the behavioural contract
  both apps' controls implement, and what admin's equivalent wiring
  (`apps/admin/app/_components/runtime/runtime-form.tsx`'s `RuntimeLookup`)
  looks like end to end, as a worked example.
- `docs/plans/EXECPLAN-0040-lookup-search-and-openable-label-consistency.md`
  — the plan this work was built under; its `## Rollback considerations`
  section names the exact shape of this diff.

## Proposed Approach

No new ExecPlan needed — EXECPLAN-0040 already covers the requirements and
risk; this item is that plan's final integration task, `INTEGRATION`-labelled
there. At the named call site:

1. Replace the hydration effect's plain `getLookupOptions(runtime, field,
   values)` call with one that also threads a debounced search query — most
   simply, a small hook (e.g. `useLookupFieldSearch({ dataAdapter, runtime,
   field, values })`) returning `{ options, onSearch, resultsTruncated }`,
   spread onto `<LookupField>` alongside the existing `selectedHref` prop.
2. Compute `resultsTruncated` from the returned option count against
   `ENTITY_LOOKUP_PAGE_SIZE` (exported from `lib/runtime/lookup-search.ts`).
3. Separately: replace `LOOKUP_REFERENCE_ROUTES` with a lookup into whichever
   module registry already knows an entity's route (the task brief for
   ITEM-0163 named this as the same file's `:2432-2454`), and fix the two
   legacy entries (`roles`, `teams`) while doing so.
4. Delete the two lines above once the wiring lands from this record's
   "known gap" note in `docs/architecture/lookup-control-contract.md`.

## Acceptance Criteria

- On a tenant with more than 20 employees, typing the exact name of the 50th
  employee into a Project's Project Manager (or any other entity lookup
  rendered by the standard module runtime) finds and selects them.
- The request issued while typing carries the search term.
- A truncated result set says so in the control.
- Every entity lookup can open its target record without an entry being
  added to a hand-maintained route map.

## Dependencies

None once `runtime-metadata-form-renderer.tsx` is not concurrently owned by
another session. Depends on nothing this item's own author needs to build —
only on being picked up.

## Related Items

[[BUG-3376]] the defect this closes for the tenant product. [[ITEM-0163]] the
wider lookup-consistency item this also finishes (the allowlist replacement).
[[BUG-3377]] the admin accessibility fix landed alongside this session's other
work. `docs/architecture/lookup-control-contract.md` the contract this
completes conformance with.

## History

- 2026-09-12 — created at `833d4d23`, filed while implementing BUG-3376 /
  BUG-3377 / ITEM-0163 in SESSION-0103: the task brief for that work excluded
  `runtime-metadata-form-renderer.tsx` because a concurrent agent owned it,
  so the adapter- and control-layer fix shipped without its one remaining
  integration point. This is that point.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-3376]]
- Modules — [[tenant-application]]

<!-- GRAPH:END -->
