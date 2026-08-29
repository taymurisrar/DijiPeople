---
ID: BUG-1959
aliases: [BUG-1959]
Title: The departments list returns a bare array and rejects the page size its own table offers
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [services/api/src/modules/organization, apps/web]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt:
---

# BUG-1959 — The departments list returns a bare array and rejects the page size its own table offers

## Summary

Two list endpoints in the same product answer in two different shapes.
`GET /api/employees` returns the paginated envelope; `GET /api/departments`
returns a bare array with no envelope and no paging, and rejects a `pageSize`
query parameter outright — while the departments table in the UI renders a "Rows
per page 10 / 25 / 50 / 100" control that implies server paging exists.

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

Open. No fix has been written.

## QA Retest

Awaiting a fix — nothing to retest yet.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition FIX_NOW — contract inconsistency; the UI already offers a control the API refuses.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[organization]], [[tenant-application]]

<!-- GRAPH:END -->
