---
ID: BUG-2044
aliases: [BUG-2044]
Title: No employee lifecycle event is audited, including employee creation and reporting-manager assignment
Status: OPEN
Severity: HIGH
Priority: P1
Type: DATA_INTEGRITY
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [services/api/src/modules/employees, services/api/src/modules/organization, services/api/src/modules/leave]
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt:
---

# BUG-2044 — No employee lifecycle event is audited, including employee creation and reporting-manager assignment

## Summary

Creating an employee writes no audit row. Neither does assigning that employee a
reporting manager, creating the department or designation they are placed into,
creating a leave policy, rule or assignment, changing a leave type, or submitting
a leave request. All of these were performed on a live tenant and none of them
appears anywhere in the 305 rows the tenant's audit log then held.

For an HRM holding personal data, "who created this employee record, and who
changed their reporting line" is the archetypal question an audit trail exists to
answer, and the product cannot answer it.

## Expected Behavior

`AGENTS.md` requires `AuditService.log()` with `beforeSnapshot` and
`afterSnapshot` "for every state-changing operation that a tenant admin or
auditor would need to see". Employee creation, organizational placement,
reporting-line changes and leave-request submission are all in that set.

## Actual Behavior

Across all 305 audit rows on the tenant, after the operations listed below, there
is **no action of any kind** for:

| Operation performed | Count | Audit rows |
|---|---|---|
| Employee creation (EMP-0002 … EMP-0011 and others) | 12 | 0 |
| Reporting-manager assignment (`PATCH /employees/:id/reporting-manager`) | 9 | 0 |
| Department creation | 10 | 0 |
| Designation creation | 8 | 0 |
| Leave policy / policy rule / policy assignment creation | several | 0 |
| Leave type update (`consumesBalance`) | 1 | 0 |
| Leave request creation | several | 0 — only approval is recorded |

It is not recorded in the parallel store either. `GET /api/employees/<id>/history`
returns `[]` for an employee created that same day with department, designation,
level and reporting manager all set. That store was checked specifically, because
the employee record carries an "Employee History" tab and a gap that turned out
to be a different store would not be a gap at all.

**What is audited**, as contrast — the module does call `AuditService`, just not
on these paths: `attendance.manual_created` (all 61 of them),
`attendance.deleted`, `EMPLOYEE_LEVEL_CREATED` (5),
`EMPLOYEE_SYSTEM_ACCESS_PROVISIONED`, `USER_INVITATION_CREATED`,
`APPROVAL_MATRIX_CREATED` / `APPROVAL_MATRIX_UPDATED`, `TENANT_SETTINGS_UPDATED`,
`auth.login.succeeded`, `project.create`, `project.update`,
`LEAVE_REQUEST_APPROVED`.

## Reproduction

1. Sign in to a tenant workspace as an administrator.
2. Create a department and a designation under Settings → Organization.
3. Create an employee, setting department, designation and level.
4. `PATCH /api/employees/<id>/reporting-manager` to assign a manager.
5. Submit a leave request as that employee.
6. Open `/settings/audit-compliance/history/audit-events`, or call
   `GET /api/audit-logs?pageSize=100` across every page, and search for any row
   whose `entityType` is `Employee`, `Department` or `Designation` and whose
   `createdAt` falls in that window. There is none.
7. `GET /api/employees/<id>/history` → `[]`.

Note that step 6 through the UI is itself unreliable until BUG-2043 is fixed —
that screen shows only the first 20 rows. Aggregate the API pages instead.

## Evidence

Live, 2026-08-29, production API `949f461c`, DijiPeople Demo tenant: 305 audit
rows pulled across all four API pages and aggregated; no matching action in any
of them. `GET /api/employees/<id>/history` → `[]`.

Code, at `eb457d9d`, corroborating each gap:

- `services/api/src/modules/employees/employees.service.ts:908-1073` —
  `create()` contains **no** `auditService.log()` call. The service's audited
  actions are `EMPLOYEE_UPDATED` (`:1206`), `EMPLOYEE_ARCHIVED` (`:1318`),
  `EMPLOYEE_OWNER_ASSIGNED` (`:1438`), `EMPLOYEES_IMPORTED` (`:1675`),
  `EMPLOYEE_SYSTEM_ACCESS_PROVISIONED` (`:2166`) and
  `EMPLOYEE_DEFAULT_BENEFITS_ASSIGNMENT_FAILED` (`:3788`). Creation is the one
  lifecycle event missing from an otherwise well-audited service — so this reads
  as an omission, not a policy.
- `employees.service.ts:476-506` — `assignManager()` mutates the reporting line
  and returns, with no audit call. The route is
  `employees.controller.ts:322-336`.
- `services/api/src/modules/organization/` — **no file in the module references
  `AuditService` at all**, so department and designation writes have no audit
  path to omit.
- `services/api/src/modules/leave/leave.service.ts:1628-1639` — the only audit
  call in the leave service, on the decision path, emitting
  `LEAVE_REQUEST_APPROVED` or `LEAVE_REQUEST_REJECTED`. Submission and
  cancellation are not audited, and neither are leave policies, policy rules,
  policy assignments or leave types.
- A repository-wide search for `EMPLOYEE_CREATED`, `DEPARTMENT_CREATED`,
  `DESIGNATION_CREATED`, `LEAVE_REQUEST_CREATED` and
  `LEAVE_REQUEST_SUBMITTED` under `services/api/src` returns nothing: the action
  names do not exist, so no writer can be emitting them under another condition.

## Root Cause

Established for each gap individually: the call is absent. `employees.service`
audits five other lifecycle events and not creation; `organization` never
acquired an audit dependency; `leave` audits the decision and not the
submission. There is no shared mechanism that was expected to cover these and
failed — auditing here is per-call-site, so a call site that was never written is
silently unaudited and nothing reports it.

That is the deeper finding: **the absence of an audit call is invisible.** No
test, lint rule or invariant asserts that a state-changing service method emits
one, so this class of gap can only be found by doing the operation and reading
the log.

## Impact

A tenant cannot answer "who added this person to the system", "who changed this
person's manager", or "when was this leave requested" from the product. For an
HRM processing personal data on behalf of a customer, that is an accountability
gap the customer inherits — plausibly a GDPR Article 5(2) problem for them, and
the kind of thing a procurement security review asks about directly.

It also undermines the audit trail's usefulness in the ordinary case: the log
looks populated (305 rows), so its silence on employee changes reads as "nothing
happened" rather than "this is not recorded".

## Affected Areas

`services/api/src/modules/employees` (`create`, `assignManager`),
`services/api/src/modules/organization` (departments, designations — the whole
module), `services/api/src/modules/leave` (request submission and cancellation,
leave types, policies, policy rules, policy assignments). The Audit Events screen
and `GET /api/employees/:id/history` are the consumers that come up empty.

## Proposed Resolution

Needs a plan, not a patch. Two pieces:

1. **Decide the auditable event set** for people data — creation, organizational
   placement, reporting-line change, employment status change, leave submission
   and cancellation, and the leave configuration objects — with the before/after
   snapshot shape for each. A snapshot of an employee must not carry national
   ids or bank details into the audit log, so the projection is a real design
   question, not a `mapEmployee()` reuse.
2. **Close the invisibility.** A wiring invariant in the shape of
   `common/constants/wiring-invariants.spec.ts` that asserts each nominated
   service method emits an audit row is what stops the next gap being found by a
   QA run a year from now.

Whether `EmployeeHistory` and `AuditLog` should both be written, or whether the
history tab should read from the audit log, is part of the same decision — two
parallel stores that can disagree is the `divergent-duplicate-guard` pattern.

## Acceptance Criteria

- Creating an employee writes an audit row naming the actor, with before/after
  snapshots that exclude sensitive fields.
- Assigning or changing a reporting manager writes an audit row.
- Creating a department or designation writes an audit row.
- Submitting and cancelling a leave request each write an audit row, not only
  approval and rejection.
- A test fails when a nominated state-changing method stops emitting its audit
  row.
- `GET /api/employees/:id/history` is either populated by these events or its
  relationship to the audit log is documented.

## Regression Coverage

None yet. Service tests asserting `auditService.log` is called with the expected
action on create/assignManager would fail today, as would an e2e assertion that
a created employee appears in `GET /audit-logs`.

## Dependencies

BUG-2043 makes this hard to observe through the UI; verifying any fix through the
Audit Events screen requires that one fixed first, or the API used directly.

## Related Items

BUG-2043 (the audit screen under-reports its own total) was found in the same
sweep and shares a consumer. BUG-2045 (background-job rows dominate the log) is
the other half of the same complaint: the trail is simultaneously missing the
human actions and full of machine ones.

## Resolution

Open. No fix has been written.

## QA Retest

Awaiting a fix — nothing to retest yet.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`. The parallel `EmployeeHistory` store was checked before filing, to rule out a wrong-store reading.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition PLAN_REQUIRED — needs a considered list of auditable employee events with before/after snapshots, not a single call.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[employees]], [[organization]]

<!-- GRAPH:END -->
