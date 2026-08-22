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
UpdatedAt: 2026-08-20
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

A foreign tenant traceId was fixed, but a null/platform-scope log still passed
the same support-role branch because `!log.tenantId` was treated as belonging
to every tenant caller.

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

Require exact tenant equality on the tenant endpoint. Return `null`
indistinguishably for foreign, null/platform-scope, and nonexistent trace IDs;
platform logs remain available only through platform monitoring.

## Acceptance Criteria

A support-role user in tenant A requesting a tenant B, null-scope, or platform
traceId receives `null`, identical to an unknown traceId.

## Regression Coverage

[REG-005](../qa/regressions/index.md) — proven to fail without the fix.

## Dependencies

None.

## Related Items

Bug pattern [[tenant-filter-missing]]. Architecture note [[multi-tenancy|Multi-Tenancy]].
Module [[audit-and-events|Audit and Events]].

## Resolution

Fixed in WP-03 and integrated into `develop` at `2313bef`. The wording above
this line read *"WP-03 correction in progress"* until 2026-08-20; it was written
mid-work and never updated once the correction landed.

`ErrorLogsService.findForUser` now computes one predicate and gates **both**
branches on it:

```ts
const belongsToCallerTenant =
  Boolean(log.tenantId) && log.tenantId === user.tenantId;
```

The `Boolean(log.tenantId)` half is the part the first fix was missing. A
platform-scope log — a failed sign-in that never resolved a tenant, for example
— has no `tenantId`, and the earlier comparison treated "no tenant" as
"belongs to whichever tenant is asking". Those records stay on the
platform-monitoring path.

Both branches return `null` rather than throwing, so a foreign traceId is
indistinguishable from one that does not exist.

## QA Retest

**Pass, executed 2026-08-20.** This section previously read *"Pending WP-03
retest of the expanded regression cases"*, which was stale: the expanded cases
had been added and were passing.

`services/api/src/modules/error-logs/error-logs.service.spec.ts` —
2 suites, 10 tests, all passing. The cases that matter here:

| Case | Result |
|---|---|
| Support user reads a log from their own tenant | allowed |
| Support user reads a log from another tenant | `null` |
| **Support user reads a platform-scope log** (`it.each([null, 'platform'])`) | `null` |
| A foreign trace is reported exactly as a missing one | indistinguishable |
| Ordinary user reads another user's log in their own tenant | `null` |

The third row is the expanded case this record was reopened for on 2026-08-17,
and it is parameterised over both shapes a scopeless log can take — a genuine
`null` and the `'platform'` sentinel that routes to `PlatformAuditLog`.

## History

- 2026-08-20 — **retested and genuinely verified.** The body-content check added
  for [[ITEM-0071]] flagged this record on its first run: `Status: VERIFIED`
  above a QA Retest reading *"Pending WP-03 retest"*. It was downgraded to
  `FIXED`, then investigated properly — and the prose turned out to be the stale
  half. The guard is correct, the expanded platform-scope cases exist as
  `it.each([null, 'platform'])`, and all 10 tests pass. Restored to `VERIFIED`
  on executed evidence rather than on a status field nobody had questioned.

  Worth noting for whoever reads this next: **this record was wrong in the
  reassuring direction and in the alarming one within the same hour.** Its
  status over-claimed for three days; its prose then under-claimed once
  challenged. Neither half was checked against the code until now.

- 2026-08-17 — fixed and verified in WP-03; integrated into develop at 2313bef with the CI required gate green on that exact SHA.
- 2026-08-17 - reopened in WP-03 after the unguarded-route audit proved the
  tenant endpoint still exposed null/platform-scope logs to tenant support
  roles; exact-equality fix and regression cases added.

- 2026-08-14 — found, fixed, REG-005 added.
- 2026-08-15 — imported into the durable bug system.
- 2026-08-16 — **reopened.** The fix and its regression test are on `agent/authz-batch0-errorlogs`, which has never merged: no commit implementing them is an ancestor of `origin/main`. The record had said VERIFIED since 2026-08-14, so every view derived from it — `docs/backlog/open.md`, the dashboards, a future `BACKLOG_PRECHECK` — reported protection that the integration branch does not have. Evidence and the prevention check are in [[BUG-0047]].
- 2026-08-17 — **re-verified and closed against the integration branch.** The fix was ported onto `develop` by TASK-0005 (cherry-picked from the original `agent/authz-*` branch, which had never merged), and `services/api/src/modules/error-logs/error-logs.service.spec.ts` now exists and passes there. Previously this record read VERIFIED on branch-level evidence alone — see [[BUG-0047]], which is what caught it, and the two validator checks that now make the same drift a red build.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Regression — REG-005 (see the regression register)

<!-- GRAPH:END -->
