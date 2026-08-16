---
ID: BUG-0006
aliases: [BUG-0006]
Title: Organization and business-unit structure was mutable by any authenticated user
Status: OPEN
Severity: CRITICAL
Priority: P0
Type: AUTHORIZATION
Source: REGRESSION_REGISTER
DetectedDate: 2026-08-14
DetectedInSha: 13e720e
AffectedModules: [services/api/src/modules/organization]
OwnerAgent: backend-api
ArchitectDisposition: PLAN_REQUIRED
QAReport:
RegressionId: REG-006
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-16
ResolvedAt:
---

# BUG-0006 — Organization and business-unit structure was mutable by any authenticated user

## Summary

`OrganizationsController` and `BusinessUnitsController` carried `JwtAuthGuard`
alone, and none of the six mutating service methods performed an authorization
check.

## Expected Behavior

Structural changes to an organization require an organization-management
permission.

## Actual Behavior

Any authenticated employee could create, update or delete organizations and
business units.

## Reproduction

See [REG-006](../qa/regressions/index.md).

## Evidence

`services/api/src/modules/organization/organization-structure-authorization.spec.ts`,
`organization-structure-tenant-scope.spec.ts`.

## Root Cause

`PermissionsGuard` **returns `true` when a handler declares no permission
family**. A controller carrying the guard and no decorators therefore secures
nothing while looking secured. Combined with a service layer that assumed the
controller had already decided, the result was six unprotected mutations.

## Impact

Privilege escalation, not merely unauthorized writes: business-unit membership
feeds `accessContext.accessibleBusinessUnitIds`, which feeds
`buildScopedAccessWhere()`. An employee could widen their own data scope by
editing the org chart.

## Affected Areas

`services/api/src/modules/organization`, and every row-level scope decision
downstream of business-unit membership.

## Proposed Resolution

Resolved: declare permissions on all six routes and add a coverage test that
fails when a new mutating route arrives undeclared.

## Acceptance Criteria

An ordinary employee gets 403 on all six routes; HR holding
`organization.manage` still succeeds; a new undeclared mutating route fails the
coverage test.

## Regression Coverage

[REG-006](../qa/regressions/index.md) — two specs, including the coverage test
that generalises the fix beyond the six routes found.

## Dependencies

None.

## Related Items

Bug pattern [[authorization-missing]]. Module [[organization|Organization]].
The guard behaviour it depends on is the same one behind
[[BUG-0007-unguarded-duplicate-of-a-permission-gated-route]].

## Resolution

Fixed 2026-08-14 on branch `agent/authz-org-bu`.

## QA Retest

Verified by both regression specs.

## History

- 2026-08-14 — found, fixed, REG-006 added.
- 2026-08-15 — imported into the durable bug system.
- 2026-08-16 — **reopened.** The fix and its regression test are on `agent/authz-org-bu`, which has never merged: no commit implementing them is an ancestor of `origin/main`. The record had said VERIFIED since 2026-08-14, so every view derived from it — `docs/backlog/open.md`, the dashboards, a future `BACKLOG_PRECHECK` — reported protection that the integration branch does not have. Evidence and the prevention check are in [[BUG-0047]].
