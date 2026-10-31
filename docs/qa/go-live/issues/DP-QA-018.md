# DP-QA-018 — A manager can approve a leave request of an employee who does not report to them

| Field | Value |
|---|---|
| Category | Security (object-level authorization) |
| Severity / Priority | High / **P2 — escalate to P1 if product confirms managers must be limited to their own reports/team** |
| Status | Open — product intent to be confirmed |
| Test | `DPQA-LV-026` (fails) |
| Env | `qa-prov-a`: employee `a-employee@…` (no reporting manager set) and role `manager` user `a-manager@…`; production build, 2026-10-31 |

## Actual (CONFIRMED)
`POST /api/leave-requests/:id/approve` as the `manager` role → **201**, request status becomes **APPROVED**, recorded with `approverUserId` = the manager and `approverRoleId` = the manager role.
The employee has no `reportingManagerId`, is in no team of that manager, and the QA fixtures created no access-team link. The payroll role is correctly refused (LV-025 passes).

## Why it matters
AGENTS.md requires object-level checks (`OWN/TEAM/BUSINESS_UNIT` scope) in addition to the permission key. If the manager role's scope is tenant-wide, any manager can approve any employee's leave. If it is business-unit scoped, every fixture employee sits in the same single business unit, so the result is expected and the finding is a fixture limitation —
**which is why intent must be confirmed.** Retest with two business units / two reporting lines once the dev agent confirms the intended scope.

| Run | Result |
|---|---|
| RUN-003 | FAIL |

Evidence: API transcript — approve call 201, final status APPROVED, approverRoleId = manager role (probe e2e/golive/tools/batch-probe.cjs); no screen applies.

## Retest history (RUN-005)

| Run | Result |
|---|---|
| RUN-005 (f47e504c) | **RESOLVED** - LV-026 pass; LV-029: refused outside the line, 2xx once the employee reports to the manager, persisted APPROVED |
