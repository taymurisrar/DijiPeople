---
ID: BUG-2624
aliases: [BUG-2624]
Title: The reports endpoints return tenant-wide aggregates regardless of the caller's row scope
Status: OPEN
Severity: HIGH
Priority: P1
Type: AUTHORIZATION
Source: QA_RUN
DetectedDate: 2026-08-30
DetectedInSha: 1965b5cc
AffectedModules: [services/api/src/modules/reports/reports.service.ts]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-30
UpdatedAt: 2026-08-30
ResolvedAt:
---

# BUG-2624 — The reports endpoints return tenant-wide aggregates regardless of the caller's row scope

## Summary

Every query in `ReportsService` filters on `tenantId` alone. None of them applies
`buildScopedAccessWhere()`. A manager whose `reports:READ` privilege is scoped to
`PARENT_CHILD_BUSINESS_UNIT`, or an HR user scoped to `ORGANIZATION`, therefore
receives headcount, leave, attendance and recruitment aggregates for the entire
tenant — including business units they cannot open a single record from.

## Expected Behavior

An aggregate must be computed over exactly the rows the caller may read. Someone
whose access level is `BUSINESS_UNIT` should see their business unit's headcount,
not the tenant's, in the same way the Employees list already narrows for them.

## Actual Behavior

All four endpoints aggregate every row in the tenant. The number a manager reads
describes a population they are not permitted to see.

## Reproduction

1. Sign in as a user holding the `manager` role, whose matrix privilege
   `reports:READ` is `PARENT_CHILD_BUSINESS_UNIT`.
2. Open `/reports`.
3. Compare "Total employees" against the row count on `/employees`, which does
   apply the scope.
4. The reports figure is the whole tenant; the employees list is narrower.

## Evidence

`services/api/src/modules/reports/reports.service.ts` — every query is of the form:

```
this.prisma.employee.count({ where: { tenantId } })
this.prisma.employee.groupBy({ by: ['employmentStatus'], where: { tenantId }, ... })
this.prisma.leaveRequest.groupBy({ by: ['status'], where: { tenantId }, ... })
```

`grep buildScopedAccessWhere services/api/src/modules/reports/` returns nothing.

By contrast `services/api/src/modules/employees/employees.service.ts:321` builds
`employeeReadScope` from `buildScopedAccessWhere(currentUser, ENTITY_KEYS.EMPLOYEES,
SecurityPrivilege.READ, { organizationIdField: null, userIdField: 'userId' })` and
applies it.

The controller reinforces the misreading: `getHeadcountSummary` is declared
`@RequireAnyPermission({ EMPLOYEES, 'read' }, { REPORTS, 'read' })` and then calls
`this.reportsService.getHeadcountSummary(user.tenantId)` — the guard checks that the
caller has *some* level of access, and the service then ignores what that level was.

## Root Cause

The service takes `tenantId` as its only argument, so the caller's access context
never reaches the query. Passing a scalar rather than the authenticated user made
the omission structurally invisible.

## Impact

Confidentiality. It does not expose individual records — the endpoints return
counts and group totals — but it does disclose the size and shape of populations
outside the caller's scope, including per-department headcount for departments they
cannot otherwise see. Reachable in production by any role with a non-`TENANT`
reports scope: today that is `manager` (`PARENT_CHILD_BUSINESS_UNIT`), `hr` and
`payroll-manager` (`ORGANIZATION`).

## Affected Areas

`GET /reports/headcount-summary`, `/reports/leave-summary`,
`/reports/attendance-summary`, `/reports/recruitment-summary`, and the
`/reports` page in `apps/web` that renders them.

## Proposed Resolution

Re-point the four endpoints at the new reporting engine
(`services/api/src/modules/reporting`), which composes the tenant predicate with
`buildScopedAccessWhere` for each data source's own RBAC entity. Response shapes are
preserved so the existing page keeps working. No ExecPlan of its own is needed —
this is covered by EXECPLAN-0030.

Note that fixing this makes the numbers a scoped user sees **smaller**. That is the
correction, not a regression, and it should be called out in the release notes.

## Acceptance Criteria

- A `BUSINESS_UNIT`-scoped caller's headcount equals the count of employees they
  can list on `/employees`.
- A `TENANT`-scoped caller's figures are unchanged.
- The four response shapes are byte-compatible with the previous ones.
- An e2e test proves a scoped caller cannot read another business unit's totals.

## Regression Coverage

`services/api/test/reporting-authorization.e2e-spec.ts` — a scoped caller's
aggregate must equal their visible row count, and must differ from the tenant total.

## Dependencies

The reporting engine in EXECPLAN-0030.

## Related Items

[[BUG-2625]] · [[BUG-2623]] · [[rbac]] · [[multi-tenancy]]

## Resolution

Fixed by routing the legacy endpoints through the reporting engine under TASK-0028.

## QA Retest

Pending the QA run for TASK-0028.

## History

- 2026-08-30 — created from qa run at `1965b5cc`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
