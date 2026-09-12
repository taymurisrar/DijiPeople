---
ID: BUG-3450
aliases: [BUG-3450]
Title: GET /employees/{id}/reporting-structure computed every root in the tenant to unbounded depth on every page view, unused
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: PERFORMANCE
Source: ARCHITECT
DetectedDate: 2026-09-12
DetectedInSha: c8d97a3d
AffectedModules: [services/api/src/modules/employees]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-480
RelatedBacklogItem: ITEM-0164
RelatedDecision: ADR-0012
RelatedImplementation: services/api/src/modules/employees/employees.service.ts
CreatedAt: 2026-09-12
UpdatedAt: 2026-09-12
ResolvedAt: 2026-09-12
---

# BUG-3450 — GET /employees/{id}/reporting-structure computed every root in the tenant to unbounded depth on every page view, unused

## Summary

`EmployeesService.getReportingStructure` — behind
`GET /employees/{id}/reporting-structure`, called on every employee record
page view — built a `fullTree` field spanning **every employee in the tenant
with no manager, and their entire descendant subtree, to unbounded depth**,
regardless of which `employeeId` was requested. Nothing read it: `grep -rn
"fullTree" apps/web services/api/src` returned exactly one hit, the line that
produced it.

## Expected Behavior

An endpoint queried for one employee's reporting structure should compute and
return data proportional to that employee's own position in the hierarchy,
not the entire tenant's org forest.

## Actual Behavior

`childrenByManagerId.get(null)` (every employee with no manager, or an
unresolvable `managerEmployeeId`) was treated as the tree's root set,
independent of `employeeId`, and `buildTree` recursed with no depth or node
cap. For a tenant with a large or deep org chart, every single employee page
view would build and serialize the organization's complete structure — CPU
and payload cost with no reader on either end.

## Reproduction

1. Seed a tenant with more than one manager-less employee (more than one org
   root) and a hierarchy deeper than a couple of levels under at least one of
   them.
2. Call `GET /employees/{anyEmployeeId}/reporting-structure`.
3. Before the fix: the response's `fullTree` field contains every root in the
   tenant and their full descendant subtrees, not just `anyEmployeeId`'s own
   branch — observable directly in the response body.
4. Confirm no caller reads it: `grep -rn "fullTree" apps/web services/api/src`
   (pre-fix) returns one match, the producing line itself.

## Evidence

- `services/api/src/modules/employees/employees.service.ts:704` (pre-fix) —
  `fullTree: (childrenByManagerId.get(null) ?? []).map((employee) =>
  buildTree(employee))`, unconditional on `employeeId`, unbounded depth.
- `services/api/src/modules/employees/employees.controller.ts:273-284` — the
  route this response comes from, called by
  `apps/web/lib/runtime/modules/employee-data.adapter.ts`'s
  `system.reportingHierarchy` widget data fetch on every employee record
  view.
- Zero frontend or backend consumers of `fullTree`, confirmed by repository
  grep before this record was filed.

## Root Cause

The endpoint's original three-card use case (`reportingLine`,
`directReports`, `currentEmployee`) only needed one level in each direction,
but the same method also built a fourth field — apparently intended for a
future consumer that never arrived — with no scoping to the queried employee
and no bound on depth or size.

## Impact

Wasted CPU and response payload on every employee record view, scaling with
the whole tenant's headcount and org depth rather than with anything the
viewer asked for. Not a security or correctness defect — the data itself was
already tenant-scoped and already readable through other endpoints — but a
real, silent cost with zero benefit, and the kind of thing that gets worse
invisibly as a tenant's headcount grows.

## Affected Areas

`services/api/src/modules/employees/employees.service.ts` — no frontend
surface, since nothing consumed the field.

## Proposed Resolution

Found and fixed while implementing [[ITEM-0164]] (the reporting hierarchy
tree viewer), which needed a real, bounded, scoped tree in the same response
shape `fullTree` was never actually filling. Replaced `fullTree` with `tree`:
rooted at the queried employee's own topmost ancestor (not every tenant
root), capped at `MAX_HIERARCHY_DEPTH = 8` additional levels and
`MAX_HIERARCHY_NODES = 500` total nodes, with a `hierarchyTruncated` flag.
No ExecPlan needed as a standalone fix — folded into [[ITEM-0164]]'s
`EXECPLAN-0043`, which was already required for the feature that made this
field worth having a real consumer.

## Acceptance Criteria

- The reporting-structure response for employee X contains only X's own
  ancestor chain and descendant subtree, never an unrelated root's tree in
  the same tenant.
- The response is bounded: `hierarchyTruncated: true` when a depth or node
  cap was hit, `false` otherwise.
- `reportingLine`, `directReports`, `currentEmployee` are unchanged in shape.

## Regression Coverage

`services/api/src/modules/employees/employees.service.spec.ts`, describe
block `getReportingStructure (ITEM-0164)`:
- `"scopes the tree to the queried employee's own branch, not every root in
  the tenant"` — asserts a second, unrelated root and its report in the same
  tenant never appear in `tree`.
- `"caps depth and node count and reports hierarchyTruncated"`.
- `"reads only the caller's tenant"`.

REG-480.

## Dependencies

[[ITEM-0164]], [[ADR-0012]].

## Related Items

[[ITEM-0164]] is the feature this fix was found and folded into.

## Resolution

Fixed in the same change as [[ITEM-0164]] (commit `c8d97a3d`,
`agent/r-s8-employee`). `fullTree` removed; `tree` added, scoped and bounded
as described above. See `employees.service.ts`'s `getReportingStructure` and
the `MAX_HIERARCHY_DEPTH` / `MAX_HIERARCHY_NODES` constants immediately above
`reportingNodeSelect`.

## QA Retest

Pending a live QA pass — no QA agent ran in this session. Automated coverage:
`DATABASE_URL=<dummy> npm --workspace api run test -- employees.service.spec.ts`
(10/10 pass, including the three cases listed under Regression Coverage).

## History

- 2026-09-12 — created from architect at `c8d97a3d`.
- 2026-09-12 — fixed in the same change, for SESSION-0103. See Resolution.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Backlog item — [[ITEM-0164]]
- Modules — [[employees]]
- Regression — REG-480 (see the regression register)

<!-- GRAPH:END -->
