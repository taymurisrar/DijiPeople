---
ID: BUG-3376
aliases: [BUG-3376]
Title: Runtime lookups fetch one unpaged page and filter it in the browser, hiding every record past the server page size
Status: OPEN
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
RelatedBacklogItem: ITEM-0163
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-11
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

Not yet fixed.

## QA Retest

Pending.

## History

- 2026-09-11 — created at `cbd9b812`. Raised by a consistency audit and then
  re-verified independently against the adapter, the renderer and the employee
  query DTO before filing.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Backlog item — [[ITEM-0163]]
- Modules — [[tenant-application]], [[platform-admin]]

<!-- GRAPH:END -->
