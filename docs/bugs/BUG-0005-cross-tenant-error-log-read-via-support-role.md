---
ID: BUG-0005
aliases: [BUG-0005]
Title: A support-role user could read another tenant's error log
Status: VERIFIED
Severity: CRITICAL
Priority: P0
Type: TENANT_ISOLATION
Source: REGRESSION_REGISTER
DetectedDate: 2026-08-14
DetectedInSha: 13e720e
AffectedModules: [services/api/src/modules/error-logs]
OwnerAgent: backend-api
ArchitectDisposition: DONE
QAReport:
RegressionId: REG-005
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-17
ResolvedAt: 2026-08-17
---

# BUG-0005 — A support-role user could read another tenant's error log

## Summary

`findForUser` returned the log on the support-role branch with no
`log.tenantId === user.tenantId` comparison, while the owner branch directly
beneath it did compare. A tenant `system-admin` holding a foreign traceId read
another tenant's error log.

## Expected Behavior

No tenant-owned record crosses the tenant boundary, whatever the role. The only
legitimate cross-tenant path is the explicitly platform-guarded one.

## Actual Behavior

A foreign traceId returned the other tenant's log, including whatever the log
payload carried.

## Reproduction

See [REG-005](../qa/regressions/index.md).

## Evidence

`services/api/src/modules/error-logs/error-logs.service.spec.ts`.

## Root Cause

**Two branches, one of which forgot the tenant comparison.** The correct code
sat three lines below the incorrect code, which is why review missed it — the
file *looked* tenant-aware.

## Impact

Cross-tenant read. The highest severity class this repository recognises,
because there is no RLS and no tenant middleware to catch it — the query is the
only boundary.

## Affected Areas

`services/api/src/modules/error-logs`.

## Proposed Resolution

Resolved: compare `tenantId` on the support branch, and return `null`
indistinguishably from a traceId that does not exist, so the endpoint cannot be
used to probe for foreign records.

## Acceptance Criteria

A support-role user in tenant A requesting a tenant B traceId receives `null`,
identical to an unknown traceId.

## Regression Coverage

[REG-005](../qa/regressions/index.md) — proven to fail without the fix.

## Dependencies

None.

## Related Items

Bug pattern [[tenant-filter-missing]]. Architecture note [[multi-tenancy|Multi-Tenancy]].
Module [[audit-and-events|Audit and Events]].

## Resolution

Fixed 2026-08-14 on branch `agent/authz-batch0-errorlogs`.

## QA Retest

Verified by the regression spec.

## History

- 2026-08-14 — found, fixed, REG-005 added.
- 2026-08-15 — imported into the durable bug system.
- 2026-08-16 — **reopened.** The fix and its regression test are on `agent/authz-batch0-errorlogs`, which has never merged: no commit implementing them is an ancestor of `origin/main`. The record had said VERIFIED since 2026-08-14, so every view derived from it — `docs/backlog/open.md`, the dashboards, a future `BACKLOG_PRECHECK` — reported protection that the integration branch does not have. Evidence and the prevention check are in [[BUG-0047]].
- 2026-08-17 — **re-verified and closed against the integration branch.** The fix was ported onto `develop` by TASK-0005 (cherry-picked from the original `agent/authz-*` branch, which had never merged), and `services/api/src/modules/error-logs/error-logs.service.spec.ts` now exists and passes there. Previously this record read VERIFIED on branch-level evidence alone — see [[BUG-0047]], which is what caught it, and the two validator checks that now make the same drift a red build.
