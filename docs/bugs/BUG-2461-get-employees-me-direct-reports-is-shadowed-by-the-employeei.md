---
ID: BUG-2461
aliases: [BUG-2461]
Title: GET employees me direct-reports is shadowed by the employeeId route and returns 400
Status: FIXED
Severity: LOW
Priority: P3
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-30
DetectedInSha: 39d8ddc4
AffectedModules: [api:employees]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport:
RegressionId: REG-370
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-30
UpdatedAt: 2026-08-30
ResolvedAt: 2026-08-30
---

# BUG-2461 — GET employees me direct-reports is shadowed by the employeeId route and returns 400

## Summary

`EmployeesController` declares `@Get(':employeeId/direct-reports')` at line 262
and `@Get('me/direct-reports')` at line 273. Nest registers routes in
declaration order and Express matches in that order, so
`GET /api/employees/me/direct-reports` is matched by the **first** handler with
`employeeId = 'me'`. Its `ParseUUIDPipe` then rejects it with
`400 Validation failed (uuid is expected)`. `getMyDirectReports` is
unreachable — there is no request that can ever reach it.

This is a latent defect, not an observed outage: nothing in the three
frontends currently calls the route. It is filed because it is a live broken
endpoint and because the shape is easy to reintroduce.

## Expected Behavior

`GET /api/employees/me/direct-reports` returns the direct reports of the
calling user's own employee record, via `getDirectReportsByUser`.

## Actual Behavior

It returns `400 VALIDATION_FAILED` — `"Validation failed (uuid is expected)"` —
because `'me'` is parsed as an employee id.

## Reproduction

1. Authenticate against the API as any tenant user holding `hierarchy.read`.
2. `GET /api/employees/me/direct-reports`.
3. Response is `400` with
   `{"errorCode":"VALIDATION_FAILED","message":"Validation failed (uuid is expected)"}`.
4. `GET /api/employees/me/context` — declared at line 178, *before*
   `@Get(':employeeId')` at line 185 — works, which is the contrast that shows
   the cause is ordering rather than the `me` literal.

## Evidence

- `services/api/src/modules/employees/employees.controller.ts:262` —
  `@Get(':employeeId/direct-reports')` with
  `@Param('employeeId', new ParseUUIDPipe())`.
- `services/api/src/modules/employees/employees.controller.ts:273` —
  `@Get('me/direct-reports')`, shadowed.
- `services/api/src/modules/employees/employees.controller.ts:178` —
  `@Get('me/context')`, correctly placed before the `:employeeId` routes.

Found by scanning all 109 controllers for a fully static route declared after a
same-verb, same-depth route with a parameter segment that subsumes it. It is
the **only** occurrence in the codebase — the rest of the API orders its static
routes correctly.

The scan was prompted by the production queue, which carries several
`400 "Validation failed (uuid is expected)"` rows on collection-shaped paths
(`GET /api/employees/import`, `GET /api/attendance/daily`,
`GET /api/onboarding/plans`, `GET /api/attendance/work-sites`). Those four were
checked and are **not** this bug — none of those routes exists in the API at
all, and the requests came from manual probing, not product code. Only
`me/direct-reports` is a real route made unreachable by ordering.

## Root Cause

Route registration order. `me/direct-reports` was added after the parameterised
sibling rather than before it, and nothing in the build or test suite asserts
that a declared route is reachable.

## Impact

One API endpoint is dead. Because no client calls it today, the user-visible
impact is nil right now — the harm is that the next feature to need "my direct
reports" will call it, get a `400`, and spend time debugging a route that looks
correct in the source.

## Affected Areas

- `services/api/src/modules/employees/employees.controller.ts`
- `GET /api/employees/me/direct-reports`

## Proposed Resolution

Move `@Get('me/direct-reports')` above `@Get(':employeeId/direct-reports')`,
next to the other `me/` route at line 178 where it belongs.

Then keep it from recurring: add an invariant spec that walks every controller
and fails when a static route is declared after a parameterised route that
would match it. The scan written for this triage is the check — it belongs in
the suite rather than in a scratch file.

No ExecPlan needed.

## Acceptance Criteria

- `GET /api/employees/me/direct-reports` returns the caller's direct reports.
- `GET /api/employees/<uuid>/direct-reports` still works unchanged.
- An invariant spec fails if any controller reintroduces a shadowed static
  route, and passes on the current tree.

## Regression Coverage

The controller-ordering invariant spec described above, which fails on the
current ordering and passes after the move. Registered as a regression entry
once written.

## Dependencies

None.

## Related Items

[[BUG-2465]] — the triage that surfaced the `uuid is expected` family this was
found through. Sibling invariant suites live in
`common/constants/wiring-invariants.spec.ts`.

## Resolution

Moved `@Get('me/direct-reports')` up beside `@Get('me/context')`, above every
`:employeeId` route, with a comment saying why both must stay there.

The invariant is the durable half:
`services/api/src/common/routing/route-shadowing.invariant.spec.ts` walks all
109 controllers and fails when a fully static route is declared after a
same-verb, same-depth parameterised route that would match it first. Verified by
reintroducing the bug — the spec named the exact route and both line numbers —
and it found no other instance in the codebase.

The scanner blanks comments before parsing, preserving offsets so line numbers
stay true. Without that it read the fix comment above — which quotes the
parameterised decorator to explain the fault — as a real declaration, and
reported the very bug it documents.

## QA Retest

Pending.

## History

- 2026-08-30 — created from the production monitoring triage at `39d8ddc4`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[employees]]
- Regression — REG-370 (see the regression register)

<!-- GRAPH:END -->
