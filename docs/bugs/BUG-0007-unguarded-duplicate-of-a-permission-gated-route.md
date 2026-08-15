---
ID: BUG-0007
aliases: [BUG-0007]
Title: An unguarded duplicate route aliased a permission-gated one
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: AUTHORIZATION
Source: REGRESSION_REGISTER
DetectedDate: 2026-08-14
DetectedInSha: 13e720e
AffectedModules: [services/api/src/modules/tenant-settings]
OwnerAgent: backend-api
ArchitectDisposition: DONE
QAReport:
RegressionId: REG-007
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-15
ResolvedAt: 2026-08-14
---

# BUG-0007 — An unguarded duplicate route aliased a permission-gated one

## Summary

`GET /tenant-settings/features/availability` declared no permission and called
the same service method as the `settings.read`-gated
`GET /tenant-settings/features`. It was an open alias for a gated route. Its
payload also carried `subscription.finalPrice`.

## Expected Behavior

Two routes reaching the same data are gated the same way, or the difference is
deliberate and documented.

## Actual Behavior

Any authenticated user reached the gated data through the alias, commercial
pricing included.

## Reproduction

See [REG-007](../qa/regressions/index.md).

## Evidence

`services/api/src/modules/tenant-settings/feature-availability-authorization.spec.ts`.

## Root Cause

Two paths to one capability, only one of which was reviewed when the permission
was added — compounded by `PermissionsGuard` returning `true` for a handler that
declares no permission family.

## Impact

Authorization bypass inside the tenant, plus exposure of commercial subscription
pricing to ordinary users.

## Affected Areas

`services/api/src/modules/tenant-settings`.

## Proposed Resolution

Resolved: gate the alias on `tenant-settings.resolved.read` and drop the
`subscription` block from its payload.

## Acceptance Criteria

An authenticated user without the key gets 403; the four ordinary roles still
succeed; the response carries no `subscription` block.

## Regression Coverage

[REG-007](../qa/regressions/index.md) — proven to fail without the fix.

## Dependencies

None.

## Related Items

Bug pattern [[duplicate-route-bypass]]. Module [[settings|Settings]].
Same guard behaviour as [[BUG-0006-organization-structure-mutable-by-any-authenticated-user]];
same data-sensitivity failure as [[BUG-0001-compensation-and-bank-data-behind-employee-record-read]].

## Resolution

Fixed 2026-08-14 on branch `agent/authz-feature-availability`.

## QA Retest

Verified by the regression spec.

## History

- 2026-08-14 — found, fixed, REG-007 added.
- 2026-08-15 — imported into the durable bug system.
