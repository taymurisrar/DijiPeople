---
ID: BUG-0004
aliases: [BUG-0004]
Title: A search filter silently overwrote the access scope
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: AUTHORIZATION
Source: REGRESSION_REGISTER
DetectedDate: 2026-08-14
DetectedInSha: 13e720e
AffectedModules: [services/api/src/modules/approvals]
OwnerAgent: backend-api
ArchitectDisposition: DONE
QAReport:
RegressionId: REG-004
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-17
ResolvedAt: 2026-08-17
---

# BUG-0004 — A search filter silently overwrote the access scope

## Summary

`buildWhere` spread the access scope and the search filter into one object
literal. Both render as `OR`, so the later key won: any caller supplying
`?search=` lost their scope restriction entirely and the query fell back to
`tenantId` alone.

## Expected Behavior

Searching narrows results. It never widens them.

## Actual Behavior

A plain `approvals.read` user adding `?search=` saw every approval in the tenant.

## Reproduction

See [REG-004](../qa/regressions/index.md).

## Evidence

`services/api/src/modules/approvals/approvals.scope.spec.ts`.

## Root Cause

**Object-literal composition of two predicates that use the same key.** The
authorization predicate had no structural protection — it was one spread away
from being discarded, and nothing in the type system noticed.

## Impact

Authorization bypass reachable from an ordinary UI action — typing in a search
box. Inside the tenant boundary.

## Affected Areas

`services/api/src/modules/approvals`. The same composition shape exists wherever
a scope predicate and a filter are merged.

## Proposed Resolution

Resolved: compose with `AND` so neither clause can displace the other.

## Acceptance Criteria

The emitted `where` for a scoped user with `?search=` contains both the scope
predicate and the search clause.

## Regression Coverage

[REG-004](../qa/regressions/index.md) — proven to fail without the fix.

## Dependencies

None.

## Related Items

Bug pattern [[search-filter-scope-overwrite]]. Module [[approvals|Approvals]].
Sibling scope defect: [[BUG-0003-readteam-granted-tenant-wide-visibility]].

## Resolution

Fixed 2026-08-14 on branch `agent/authz-batch0-readteam`.

## QA Retest

Verified by the regression spec.

## History

- 2026-08-14 — found, fixed, REG-004 added.
- 2026-08-15 — imported into the durable bug system.
- 2026-08-16 — **reopened.** The fix and its regression test are on `agent/authz-batch0`, which has never merged: no commit implementing them is an ancestor of `origin/main`. The record had said VERIFIED since 2026-08-14, so every view derived from it — `docs/backlog/open.md`, the dashboards, a future `BACKLOG_PRECHECK` — reported protection that the integration branch does not have. Evidence and the prevention check are in [[BUG-0047]].
- 2026-08-17 — **re-verified and closed against the integration branch.** The fix was ported onto `develop` by TASK-0005 (cherry-picked from the original `agent/authz-*` branch, which had never merged), and `services/api/src/modules/employees/employees.service.spec.ts` now exists and passes there. Previously this record read VERIFIED on branch-level evidence alone — see [[BUG-0047]], which is what caught it, and the two validator checks that now make the same drift a red build.
