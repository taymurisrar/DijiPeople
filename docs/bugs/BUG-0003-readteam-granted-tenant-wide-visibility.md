---
ID: BUG-0003
aliases: [BUG-0003]
Title: readTeam permissions granted tenant-wide visibility
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: AUTHORIZATION
Source: REGRESSION_REGISTER
DetectedDate: 2026-08-14
DetectedInSha: 13e720e
AffectedModules: [services/api/src/modules/attendance, services/api/src/modules/approvals]
OwnerAgent: backend-api
ArchitectDisposition: DONE
QAReport:
RegressionId: REG-003
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-15
ResolvedAt: 2026-08-14
---

# BUG-0003 — readTeam permissions granted tenant-wide visibility

## Summary

`attendance.correction.readTeam` and `approvals.readTeam` were each bundled into
a scope branch that returned `{}` — an unrestricted `where`. Both were therefore
silent synonyms for their `manage` permission.

## Expected Behavior

`readTeam` means own records plus direct reports. `manage` means tenant-wide.
The two exist precisely to be different.

## Actual Behavior

A user holding only `*.readTeam` listed every record in the tenant.

## Reproduction

See [REG-003](../qa/regressions/index.md).

## Evidence

`attendance.correction-authorization.spec.ts`, `approvals.scope.spec.ts`.

## Root Cause

A scope resolver that **fails open**: the branch for an unrecognised or
narrow-scope permission returned an empty predicate instead of refusing. Two
independent occurrences of the same misreading, in two modules — which is what
made it a shared-abstraction defect rather than two local ones.

## Impact

Every holder of a "team" permission saw the whole tenant. Inside the tenant
boundary, but far outside the intended scope.

## Affected Areas

`services/api/src/modules/attendance`, `services/api/src/modules/approvals`, and
`common/security/rbac-query-scope.ts` as the shared abstraction.

## Proposed Resolution

Resolved: `readTeam` resolves to an own + direct-reports predicate; `manage`
retains tenant-wide.

## Acceptance Criteria

A `*.readTeam`-only user's emitted `where` always carries a scope predicate,
never `{}`. `manage` still yields tenant-wide.

## Regression Coverage

[REG-003](../qa/regressions/index.md) — two specs, proven to fail without the fix.

## Dependencies

None.

## Related Items

Bug pattern [[fail-open-scope]]. Modules [[attendance|Attendance]], [[approvals|Approvals]].
The shared-root-cause example cited in [`docs/qa/README.md`](../qa/README.md).
Related scope defect: [[BUG-0004-search-filter-overwrote-the-access-scope]].

## Resolution

Fixed 2026-08-14 on branches `agent/authz-batch0-attendance`,
`agent/authz-batch0-readteam`.

## QA Retest

Verified by both regression specs.

## History

- 2026-08-14 — found in two modules, fixed at the shared resolver, REG-003 added.
- 2026-08-15 — imported into the durable bug system.
