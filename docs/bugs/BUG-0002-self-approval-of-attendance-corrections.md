---
ID: BUG-0002
aliases: [BUG-0002]
Title: A manager could file and approve their own attendance correction
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: AUTHORIZATION
Source: REGRESSION_REGISTER
DetectedDate: 2026-08-14
DetectedInSha: 13e720e
AffectedModules: [services/api/src/modules/attendance]
OwnerAgent: backend-api
ArchitectDisposition: DONE
QAReport:
RegressionId: REG-002
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-17
ResolvedAt: 2026-08-17
---

# BUG-0002 — A manager could file and approve their own attendance correction

## Summary

`assertCanActionCorrection` never compared the acting user to the parties of the
correction request, and `canActionAttendanceCorrection` passes on a bare
`attendance.correction.approve` — which the seeded `manager` bundle grants. A
manager could therefore file a correction rewriting their own attendance and
approve it themselves.

## Expected Behavior

Nobody approves a record they are a party to. Separation of duties is the entire
purpose of an approval step.

## Actual Behavior

Approve and reject both succeeded when the actor was the subject of the
correction, the filer, or both.

## Reproduction

See [REG-002](../qa/regressions/index.md).

## Evidence

`services/api/src/modules/attendance/attendance.correction-authorization.spec.ts`.

## Root Cause

**Holding a permission was treated as owning the decision.** The guard answered
"may this role approve corrections?" when the question was "may this person
approve *this* correction?".

## Impact

Attendance — and therefore payable time — could be rewritten unilaterally by any
seeded manager. Reachable in production by default role configuration.

## Affected Areas

`services/api/src/modules/attendance`, and the approval surfaces that consume it.

## Proposed Resolution

Resolved: compare the actor against the correction's subject and filer before
permitting an action.

## Acceptance Criteria

A manager holding approve/reject is refused on their own correction — as subject,
as filer, and as both — while still able to action a subordinate's.

## Regression Coverage

[REG-002](../qa/regressions/index.md) — proven to fail without the fix.

## Dependencies

None.

## Related Items

Bug pattern [[self-approval]]. Module [[attendance|Attendance]].
Found in the same sweep as [[BUG-0003-readteam-granted-tenant-wide-visibility]],
which shared the module.

## Resolution

Fixed 2026-08-14 on branch `agent/authz-batch0-attendance`.

## QA Retest

Verified by the regression spec; register records `Active: yes`.

## History

- 2026-08-14 — found, fixed, regression added as REG-002.
- 2026-08-15 — imported into the durable bug system.
- 2026-08-16 — **reopened.** The fix and its regression test are on `agent/authz-batch0-attendance`, which has never merged: no commit implementing them is an ancestor of `origin/main`. The record had said VERIFIED since 2026-08-14, so every view derived from it — `docs/backlog/open.md`, the dashboards, a future `BACKLOG_PRECHECK` — reported protection that the integration branch does not have. Evidence and the prevention check are in [[BUG-0047]].
- 2026-08-17 — **re-verified and closed against the integration branch.** The fix was ported onto `develop` by TASK-0005 (cherry-picked from the original `agent/authz-*` branch, which had never merged), and `services/api/src/modules/attendance/attendance.correction-authorization.spec.ts` now exists and passes there. Previously this record read VERIFIED on branch-level evidence alone — see [[BUG-0047]], which is what caught it, and the two validator checks that now make the same drift a red build.
