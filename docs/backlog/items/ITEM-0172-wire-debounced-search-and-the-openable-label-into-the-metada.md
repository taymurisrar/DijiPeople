---
ID: ITEM-0172
aliases: [ITEM-0172]
Title: Wire debounced search and the openable label into the metadata-driven record-form lookup call site
Type: FOLLOW_UP
Status: DONE
Priority: P1
Severity: HIGH
AffectedModules: [apps/web]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-09-12
UpdatedAt: 2026-09-12
ResolvedAt: 2026-09-12
RelatedBug: BUG-3376
RelatedQA: 
RelatedADR: ADR-0007
RelatedImplementation: apps/web/app/components/metadata/runtime-metadata-form-renderer.tsx, apps/web/app/components/metadata/lookup-reference-route.ts
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

## Resolution — 2026-09-12

Done. Landed in `apps/web/app/components/metadata/runtime-metadata-form-renderer.tsx`
and a new colocated pure helper, `apps/web/app/components/metadata/lookup-reference-route.ts`.

1. **Search wiring.** A new hook, `useLookupFieldSearch` (defined in the
   renderer, called from `EditableField`), replaces the static
   `options={[...resolvedLookupOptions]}` wiring. While the user has not
   typed, it shows the hydration-derived, pin-safe base list
   (`ensureSelectedLookupOption`'s output, unchanged); once `LookupField`'s
   debounced `onSearch` fires, it calls `dataAdapter.getLookupOptions(runtime,
   field, values, { search })` and swaps in the server's result. A monotonic
   request token discards a response that resolves after a newer one (or
   after the field/its dependency changed), and a field/dependency change
   resets search state during render — a state-vs-state comparison, not a
   ref, to satisfy this repo's `react-hooks/refs` lint, which is stricter
   than the vanilla React docs' ref-based version of the same "adjust state
   during render" pattern. Small reference sets
   (`isSmallReferenceLookupEntity`) are left on the original cheap prefetch —
   `searchable` is false for them, so no `onSearch` is even passed.
2. **`resultsTruncated`** is computed from the currently-displayed option
   count against `ENTITY_LOOKUP_PAGE_SIZE`, for both the base list and a
   search result — matching that the adapter now sends an explicit page size
   unconditionally, not only when a search term is present.
3. **The empty-options message stayed keyed to the base list, deliberately.**
   `lookupOptionsMissing`/`lookupEmptyMessage` (the "this field has no valid
   options" / "options unavailable" strings) still read from
   `resolvedLookupOptions`, never from the search-narrowed list — an ordinary
   zero-match search result must fall through to `LookupField`'s own default
   "No matching records found.", not the stronger message meant for a field
   with no options at all independent of what was typed.
4. **The allowlist.** `LOOKUP_REFERENCE_ROUTES` is replaced, not extended.
   `apps/web` has no live entity-to-route registry to delegate to —
   `module-registry.ts` and its siblings were removed as inert scaffolding
   with zero callers ([[ADR-0007]]), and reviving one to answer this question
   would have contradicted that decision. Admin's equivalent
   (`resolveLookupRecordRoute`) derives a route from the lookup's own API
   collection path, which sidesteps spelling entirely — but `apps/web`'s
   `FieldMetadata` never carries that path, only
   `lookupTargets[0].entityLogicalName`, spelled inconsistently by design
   (plural/lowercase for a settings-runtime field, singular/camelCase for the
   bespoke employee domain). The old map compared the raw string with no
   normalization, so most of an Employee record's own lookups — Team,
   Department, Designation, Location, Organization, Business Unit, Work
   Schedule, Employee Level, Owner, Country, State/Province, City — silently
   resolved to no link at all despite every one of those settings screens
   existing. The replacement, `lookup-reference-route.ts`, is a static
   (lowercase, singular/plural-aware) alias table over the same destinations
   plus three verified additions (`team` distinct from `teams`,
   `organizations`, `business-units`); the acceptance criterion is satisfied
   in the sense that fixing a spelling mismatch no longer requires a new
   per-field map entry, though a genuinely new destination still does — the
   same shape admin's own path-keyed table has.
5. **The two "legacy" entries.** `roles` now points directly at
   `/settings/security-access/authorization/roles` (verified: the old
   `/settings/access/roles` path is redirected there by `next.config.ts`,
   confirmed still present at the cited lines). `teams` was investigated and
   found NOT to be legacy — no `next.config.ts` redirect exists for
   `/settings/access/teams`, and `settings-adapter-registry.ts`'s own `teams`
   key (`mode: "specialized"`) declares that exact path as its current,
   deliberate destination ("Access Teams", the RBAC concept). It is left
   unchanged. What the old map never had at all was a route for the
   *organizational* "Team" an Employee record assigns
   (`lookupEntity: "team"`, singular) — added as its own destination,
   `/settings/general-setup/organization/teams`, distinct from `teams`.

Not attempted: replacing the two-step normalize-then-alias resolver with a
literal registry, and re-auditing every one of the 19 original destination
URLs for drift (only `roles` had verified evidence of being wrong; the others
were left as-is rather than guessed at).

Validation: `npm --workspace web run check-types` (pass), `npm --workspace web
run test` (93 suites / 1837 tests pass, including a new
`lookup-reference-route.spec.ts`), `eslint --fix` on all three changed files
(clean).

## History

- 2026-09-12 — created at `833d4d23`, filed while implementing BUG-3376 /
  BUG-3377 / ITEM-0163 in SESSION-0103: the task brief for that work excluded
  `runtime-metadata-form-renderer.tsx` because a concurrent agent owned it,
  so the adapter- and control-layer fix shipped without its one remaining
  integration point. This is that point.
- 2026-09-12 — closed in SESSION-0103, branch `agent/r-s9-lookup-wiring`: the
  search wiring and the allowlist replacement both landed at the named call
  site. See Resolution above.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-3376]]
- Modules — [[tenant-application]]

<!-- GRAPH:END -->
