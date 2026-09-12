---
ID: BUG-3376
aliases: [BUG-3376]
Title: Runtime lookups fetch one unpaged page and filter it in the browser, hiding every record past the server page size
Status: IN_PROGRESS
Severity: HIGH
Priority: P1
Type: DATA_INTEGRITY
Source: USER_REPORT
DetectedDate: 2026-09-11
DetectedInSha: cbd9b812
AffectedModules: [apps/web, apps/admin]
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
QAReport: 
RegressionId: 
RelatedBacklogItem: ITEM-0163, ITEM-0172
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-12
ResolvedAt:
---

# BUG-3376 — Runtime lookups fetch one unpaged page and filter it in the browser, hiding every record past the server page size

## Summary

A runtime lookup field loads its options with a single request that carries no
search term and no page size, then filters the returned array in the browser as
the user types. The server answers that request with its own default page. For
employees that default is 20 records. Every employee past the twentieth is
therefore unselectable in any lookup wired this way, and the control gives no
sign that anything was omitted — typing a missing colleague's name produces
"No matching records found", which reads as "this person does not exist".

This was found while auditing lookup consistency after a report about lookup
behaviour. It is the most consequential thing in that audit, because it is
silent and it loses data rather than merely looking wrong.

## Expected Behavior

Typing in a lookup searches the whole set the user is permitted to see. A record
that exists and is permitted can always be selected. If the control shows a
truncated list, it says so.

## Actual Behavior

The option list is whatever one unfiltered request returned. Typing narrows only
that array. Records beyond the server's default page never enter the browser and
cannot be selected or discovered.

## Reproduction

1. Use a tenant with more than 20 employees. The demo workspace has 11, so it
   does **not** reproduce there — this needs a realistically sized tenant.
2. Open a record whose form has an employee lookup, for example a Project and
   its Project Manager, Approval Manager, Account Manager or Delivery Manager
   field.
3. Open the lookup and type the name of an employee who sorts past the twentieth
   record.
4. The list shows "No matching records found." The employee cannot be selected.

## Evidence

- `apps/web/lib/runtime/modules/standard-module-data.adapter.ts:365-400` —
  `getLookupOptions` builds its query string from a dependency filter only. No
  search term and no page size are ever added. It then issues one
  `requestJson(requestPath)` and returns the records from that single response.
  The `isUnsupportedQueryParamError(error, "pageSize")` branch below it only
  removes a page size; nothing in this function ever sets one.
- `apps/web/app/components/metadata/runtime-metadata-form-renderer.tsx:1222-1241`
  — the renderer constructs `LookupField` without an `onSearch` prop. Grepping
  the whole file for `onSearch` returns nothing. The control supports
  server-side search; the caller does not use it.
- `apps/web/app/components/ui/form-control.tsx:998-1010` — with no `onSearch`,
  the typed query only filters the `options` array already in memory.
- `apps/web/lib/runtime/modules/standard-module-specs.ts:456-468` — the lookup
  path map sends `employeeId`, `approvalManagerEmployeeId`,
  `accountManagerEmployeeId`, `deliveryManagerEmployeeId` and
  `projectManagerEmployeeId` all to `/api/employees`.
- `services/api/src/modules/employees/dto/employee-query.dto.ts:146` —
  `pageSize = 20` is the default applied to a bare `GET /api/employees`.

So a bare request returns 20 employees, and those 20 are the entire selectable
universe for five separate fields.

The same pattern exists in the admin console:
`apps/admin/lib/runtime/use-runtime-lookup-options.ts:20-83` fetches once and
filters client-side, even though its own API route already forwards a `search`
parameter at `apps/admin/app/api/platform-runtime/lookups/route.ts:26`. The hook
never sends one.

## Root Cause

The lookup control was built to support server-side search and the wiring around
it was not. Every caller treats the option list as a small, complete, static set,
which is true for the reference data these lookups were first used for
(countries, currencies, timezones) and false for every entity lookup added
since.

## Impact

Any tenant larger than the server's default page cannot select the majority of
its own records in these fields. Because the failure presents as an empty search
result rather than an error, users conclude the record is missing and either
create a duplicate or abandon the task. No log line records it.

Severity is HIGH on reachability and silence rather than on blast radius: it is
a routine action, in production, that quietly produces the wrong outcome.

## Affected Areas

Every lookup routed through `standard-module-data.adapter.ts` in `apps/web`, and
every lookup using `use-runtime-lookup-options.ts` in `apps/admin`. Reference
lookups backed by small fixed sets (countries, currencies, timezones) are
unaffected in practice because their full set fits inside one page.

## Proposed Resolution

Needs an ExecPlan under `PLANS.md` — it changes a shared data contract and
touches both frontends.

Direction: make server-side search the default path for an entity lookup. Pass
the typed query through `onSearch` to a debounced refetch that sends both a
search term and an explicit page size; keep the currently selected record pinned
into the option list so an existing value never disappears while searching; and
show an explicit "showing first N, keep typing to narrow" affordance whenever the
response is truncated. The backend list endpoints these paths already hit accept
a search parameter, so this is mostly frontend wiring plus an agreed page-size
convention.

Small reference sets should keep the cheap prefetch path, chosen by the spec
rather than by accident.

## Acceptance Criteria

- On a tenant with more than 20 employees, typing the exact name of the 50th
  employee into an employee lookup finds and selects them.
- The request issued while typing carries the search term.
- A lookup whose result set is truncated says so in the control.
- Opening a record whose lookup value lies outside the first page still displays
  that value's label rather than falling back to a raw id.

## Regression Coverage

Needs a test that seeds more employees than the default page size and asserts an
employee past that boundary is selectable through the runtime lookup. A register
entry follows once written.

## Dependencies

Should be planned alongside [[ITEM-0163]], which covers the wider lookup
consistency work; this record is the one defect in that set that loses data.

## Related Items

[[ITEM-0163]] lookup consistency and the openable label. [[BUG-3377]] admin
lookup accessibility. [[BUG-1956]] fixed the web combobox semantics and did not
touch this data path.

## Resolution

**Partially fixed 2026-09-12, in SESSION-0103, under EXECPLAN-0037.
Complete for `apps/admin`. Not yet complete for `apps/web`'s named
reproduction (a metadata-driven record-form lookup, e.g. Project → Project
Manager) — see "What remains open" below before treating this as closed.**

### `apps/admin` — complete

- `apps/admin/lib/runtime/use-runtime-lookup-options.ts` now accepts and sends
  a `search` parameter. The route
  (`apps/admin/app/api/platform-runtime/lookups/route.ts`) and
  `buildRuntimeLookupPath` (`apps/admin/lib/runtime/runtime-lookups.ts`)
  already forwarded one; nothing ever called it with one.
- `RuntimeLookup` (`apps/admin/app/_components/runtime/runtime-form.tsx`)
  debounces the typed query (300ms, new
  `apps/admin/lib/runtime/lookup-search.ts`) before feeding it to the hook.
- `SearchableSelect` gained `onQueryChange`/`serverFiltered`/`loading`/
  `resultsTruncated` so it stops re-filtering results the server already
  filtered.
- Admin's pin-on-hydrate story needed no change: `RuntimeLookup` already
  derived the current option's label from the record's own denormalised field
  (`resolveLookupLabel`) rather than from the options list, so a value outside
  whatever page is currently loaded already displayed correctly before this
  fix, and continues to under search.
- Not attempted: an explicit page-size convention for admin's lookups. The
  evidence for admin was specifically "search is never sent," not a
  demonstrated page-size cap; inventing a `pageSize`/`limit` parameter the
  underlying platform-runtime lookup endpoints were not confirmed to support
  risked doing nothing silently, or erroring, for no evidenced benefit.

### `apps/web` — adapter and control layer shipped, one integration point open

- `standard-module-data.adapter.ts#getLookupOptions` now accepts an optional
  search query (additive 4th argument) and sends an explicit page size
  (`ENTITY_LOOKUP_PAGE_SIZE = 50`, `apps/web/lib/runtime/lookup-search.ts`)
  for entity lookups — already a real improvement over the previous unbounded
  default (20 for employees) even before any caller passes a search term.
  Small, effectively-fixed reference sets (country, currency, timezone,
  state/province, city — `isSmallReferenceLookupEntity`) keep the original
  cheap one-shot prefetch, chosen by the field's target entity rather than by
  which caller happened to omit a page size, per this record's Proposed
  Resolution.
- `LookupField` (`apps/web/app/components/ui/form-control.tsx`): `onSearch` is
  now debounced (300ms) instead of firing per keystroke; the previously
  resolved selected option is pinned across a narrower search result until
  the value itself changes (`resolveVisibleSelectedOption`); a new
  `resultsTruncated` prop renders a "showing first N — keep typing to narrow"
  affordance; client-side substring filtering is skipped once a caller wires
  `onSearch`, trusting the server's own matching instead.
- New `apps/web/lib/runtime/lookup-search.ts` / `.spec.ts` cover the debounce
  primitive, the pin rule and the truncation/small-reference-set logic in
  isolation — `apps/web`'s jest config has no jsdom, so this is what the
  component itself cannot be tested through.

### What remains open

**The acceptance criteria below are not yet demonstrable for `apps/web`'s
named reproduction.** The one remaining call site,
`apps/web/app/components/metadata/runtime-metadata-form-renderer.tsx:1222-1241`
(the only place `<LookupField>` is constructed for a metadata-driven record
form, and the only supplier of `selectedHref` anywhere in the app), was owned
by a concurrent agent in this session and named as out of scope in this task's
brief. Filed as [[ITEM-0172]] with the exact follow-up diff shape — everything
it needs (debounce, pin, truncation prop, larger default page size) already
shipped here, so that item is additive wiring, not new design.
`docs/architecture/lookup-control-contract.md` records the same gap as the
one place the contract is not yet fully conformed to.

`apps/web/app/(authenticated)/recruitment/_components/employee-draft-form.tsx`'s
"Reporting manager" `LookupField` (a bespoke page, not gated by the excluded
file) has the same underlying defect — a plain array from a server component
prop, filtered client-side — and was not touched here; it was not named in
this bug's Evidence and fixing it was out of scope for this pass.

## QA Retest

Pending. `apps/admin`'s fix can be exercised today (open a runtime form with a
lookup reading from an endpoint with more than one page, type a query matching
a record outside the first page). `apps/web`'s named reproduction (Project →
Project Manager) cannot be meaningfully retested until [[ITEM-0172]] lands.

## History

- 2026-09-11 — created at `cbd9b812`. Raised by a consistency audit and then
  re-verified independently against the adapter, the renderer and the employee
  query DTO before filing.
- 2026-09-12 — `apps/admin` fixed and `apps/web`'s adapter/control layer
  shipped in SESSION-0103, branch `agent/r-s6-lookups`, under EXECPLAN-0037.
  Remaining `apps/web` integration filed as [[ITEM-0172]].

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Referenced by — [[ITEM-0163]], [[ITEM-0172]]
- Modules — [[tenant-application]], [[platform-admin]]

<!-- GRAPH:END -->
