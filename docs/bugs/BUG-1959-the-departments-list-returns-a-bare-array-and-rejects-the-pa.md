---
ID: BUG-1959
aliases: [BUG-1959]
Title: The departments list returns a bare array and rejects the page size its own table offers
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [services/api/src/modules/organization, apps/web]
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

# BUG-1959 — The departments list returns a bare array and rejects the page size its own table offers

## Summary

Two list endpoints in the same product answer in two different shapes.
`GET /api/employees` returns the paginated envelope; `GET /api/departments`
returns a bare array with no envelope and no paging, and rejects a `pageSize`
query parameter outright — while the departments table in the UI renders a "Rows
per page 10 / 25 / 50 / 100" control that implies server paging exists.

> **Corrected 2026-08-29, see Resolution.** The API half of this is accurate.
> The implication about the control is not: the departments table paginates
> client-side and the control works. This title and the Actual Behavior and
> Impact sections below still read as they did when the record was written.

## Expected Behavior

List endpoints share one response contract. A table that offers a page size sends
it to an endpoint that accepts it, and the endpoint returns the page requested
with the totals the footer needs.

## Actual Behavior

```
GET /api/employees   -> {"items":[…],"meta":{"page":…,"pageSize":…,"total":…,"totalPages":…}}
GET /api/departments -> [ … ]                       (bare array, no envelope, no paging)
GET /api/departments?pageSize=100
  -> 400 VALIDATION_FAILED  "property pageSize should not exist"
```

Every department row is shipped on every load, and the page-size control changes
nothing on the server.

## Reproduction

Target: `https://dijipeople-demo.ws.dijipeople.com`, tenant `DijiPeople Demo`,
production API commit `949f461c`, observed 2026-08-29.

1. Sign in to the tenant workspace as a tenant administrator.
2. `GET /api/employees` — note the `{items, meta}` envelope.
3. `GET /api/departments` — note the bare array.
4. `GET /api/departments?pageSize=100` — `400 VALIDATION_FAILED`, message
   `property pageSize should not exist`.
5. Open `/settings/general-setup/organization/departments` and note the "Rows per
   page" control offering 10 / 25 / 50 / 100.

## Evidence

Request and response shapes as quoted above, taken from the authenticated tenant
session on production.

The 400 is the global `ValidationPipe` doing its job: `AGENTS.md` records that it
runs with `whitelist: true, transform: true, forbidNonWhitelisted: true`, so an
unknown query field is a 400. The defect is that the departments query DTO
declares no pagination fields while the UI offers them.

No file:line evidence was collected for the controller or the table component;
both should be located before the fix.

## Root Cause

Not established beyond the mechanism: the departments endpoint was written
without the pagination DTO the employees endpoint has, and the shared table
component supplies a page-size control regardless of whether its endpoint
supports one.

## Impact

Two costs, both modest today and both growing with tenant size. The user-visible
one: a control that promises to change the page size and does nothing. The
structural one: every department row is transferred and rendered on every load,
and any consumer written against the employees envelope breaks when pointed at
departments. Rated MEDIUM as an architectural divergence with a visible UI
symptom, not LOW, because the response-shape inconsistency is a contract
question that affects every future list.

## Affected Areas

`services/api/src/modules/organization` (departments list controller and query
DTO), `apps/web` departments settings screen and the shared data-table page-size
control.

## Proposed Resolution

Bring the departments list onto the same contract as employees: a query DTO with
`page`/`pageSize`, and the `{items, meta}` envelope. If the shape must stay a
bare array for backward compatibility with an existing consumer, then the table
must not offer a page-size control it cannot honour — and the reason should be
recorded, because three frontends and a gateway read these contracts.

## Acceptance Criteria

- `GET /api/departments?pageSize=100` is accepted and honoured, or the page-size
  control is removed from the departments table.
- The departments response shape and the employees response shape agree, or the
  divergence is documented as deliberate.
- The table footer's totals come from the server rather than the length of the
  array it received.

## Regression Coverage

None yet. An e2e assertion that every list endpoint the UI paginates accepts
`page` and `pageSize` would catch this class across modules.

## Dependencies

None identified.

## Related Items

BUG-1554 (admin requests its own partners API with a rejected pageSize) is the
same class of defect in Platform Admin and is already VERIFIED — this is the same
mistake in the tenant product against a different endpoint.

## Resolution

Fixed 2026-08-29 on `agent/bugfix-org` — but only half of this record survived
being checked, and the half that did is the API half.

**What was true.** `GET /api/departments` returned a bare array, and
`?pageSize=100` was a 400. The departments query DTO declared no pagination and
the global `ValidationPipe` runs with `forbidNonWhitelisted: true`, so an
undeclared query field is rejected. Both confirmed in code.

**What was not true.** The record's user-visible symptom — "a control that
promises to change the page size and does nothing" — does not happen. The
departments screen paginates client-side and it works. The settings runtime list
passes `paginationMode="client"`
(`apps/web/app/(authenticated)/settings/_components/settings-runtime-pages.tsx:153`),
and `StandardModuleListPage` then slices the record set itself and recomputes
the totals from it
(`apps/web/app/components/runtime/standard-module-list-page.tsx:78-99`).
Changing "Rows per page" re-renders the table with that many rows and a correct
footer. The page size never reaches the API at all: `settingsListApiPath` builds
the request from the adapter's `serverApiPath` and does not forward the page
parameters (`settings-runtime-pages.tsx:506-518`), so `page` and `pageSize` stay
in the browser URL.

That also settles the third acceptance criterion. "The table footer's totals come
from the server rather than the length of the array it received" describes a
defect that only exists under server paging. Under client paging the array *is*
the whole set, so its length is the true total — `records.length` at
`settings-runtime-pages.tsx:149` is correct, not a stand-in for a number the
screen failed to fetch.

**What was fixed.** The endpoint now accepts and honours pagination, opt-in.
`ListDepartmentsDto` (`services/api/src/modules/organization/dto/list-departments.dto.ts`)
extends `ListMasterDataDto` with optional `page` and `pageSize`, bounded the
same way `EmployeeQueryDto` bounds them, and with **no defaults**.
`OrganizationService.listDepartmentsForUser`
(`organization.service.ts:940-960`) returns the bare array when neither is
present, and the `{items, meta}` envelope the employees list uses when either
is. The controller routes through it
(`departments.controller.ts:32-40`).

**Why the shape is opt-in rather than changed.** The bare array is not unique to
departments — business units, designations and locations all answer the same
way, and several consumers read it directly: the settings runtime lookup
sources, `use-employee-lookups.ts`, the holiday calendar manager. Switching one
of the four to an envelope would resolve a divergence with `employees` by
creating one inside master data, and it would do it to contracts that three
frontends, an Electron agent and a .NET gateway read. So the divergence is
recorded as deliberate here and in the code, and a caller that wants server
paging asks for it and gets the envelope with the totals a footer needs.

One honest limitation, stated in the code as well: the slice happens after the
visibility filter, not in the query. Department visibility is resolved in memory
against the caller's business units, so `take`/`skip` in Prisma would page the
wrong set. This bounds the response, not the read.

Files changed:

- `services/api/src/modules/organization/dto/list-departments.dto.ts` — new
- `services/api/src/modules/organization/organization.service.ts:940-960`
- `services/api/src/modules/organization/departments.controller.ts:23,37,39`
- `services/api/src/modules/organization/departments-list-contract.spec.ts:65-121`
  — bare array by default, the envelope on request, a page beyond the end
  clamped, and the default page size

No change was made in `apps/web`: nothing there was broken.

## QA Retest

Not retested against a running system; this environment cannot reach the tenant
workspace. The unit guards for both shapes pass.

The retest is two requests as a tenant administrator:
`GET /api/departments` should still be a bare array, byte-for-byte the contract
it was, and `GET /api/departments?page=1&pageSize=100` should return
`{items, meta}` with `meta.total` equal to the length of the bare array.

Worth also opening `/settings/general-setup/organization/departments` and
changing "Rows per page" — not to confirm the fix, but to confirm the finding
above that the control already worked, which was established from the code
rather than from a browser.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition FIX_NOW — contract inconsistency; the UI already offers a control the API refuses.
- 2026-08-29 — fixed on `agent/bugfix-org` during the SESSION-0076 burndown, with one correction to the record: the departments table paginates client-side and the page-size control has always worked, so the UI symptom described here does not occur. The API half was real and the endpoint now accepts `page`/`pageSize`, answering with the employees envelope when either is sent and the unchanged bare array when neither is.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[organization]], [[tenant-application]]

<!-- GRAPH:END -->
