---
ID: BUG-2504
aliases: [BUG-2504]
Title: Approving a correction never applies the requested work mode, work site or overtime
Status: FIXED
Severity: HIGH
Priority: P1
Type: STATE_MACHINE
Source: QA_RUN
DetectedDate: 2026-08-30
DetectedInSha: ade1fea7
AffectedModules: [services/api/src/modules/attendance]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport:
RegressionId: REG-404
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: EXECPLAN-0032
CreatedAt: 2026-08-30
UpdatedAt: 2026-09-11
ResolvedAt: 2026-09-11
---

# BUG-2504 — Approving a correction never applies the requested work mode, work site or overtime

## Summary

`applyApprovedCorrection` writes exactly two fields onto the attendance entry:
`checkIn` and `checkOut`. A correction request can also carry
`requestedWorkMode`, `requestedWorkSiteId` and `requestedOvertimeMinutes`. None
of the three is ever applied. A manager approves the request, the request is
marked `APPROVED`, the employee is notified that it was approved — and the
attendance record is unchanged in every respect the request was actually about.

## Expected Behavior

Approving a correction applies what the correction asked for. The owner's
statement of this workflow is explicit: "If approved then changes on the
attendance record is updated."

## Actual Behavior

Approval updates `checkIn`, `checkOut`, the derived `status`, `source` and the
notes. `attendanceMode` keeps its old value; `officeLocationId` keeps its old
value; the overtime minutes are written nowhere at all.

Worse than a silent no-op, `deriveManualStatus` is then called with
`existing.attendanceMode` — the mode the request asked to change — so the status
is re-derived from the value the approval was supposed to replace.

## Reproduction

1. As an employee, submit a correction of type "My work location or mode is
   wrong" requesting `REMOTE` for a day recorded `OFFICE`.
   (Today this step is itself blocked by BUG-2505; fix that first, or create the
   request directly through `POST /api/attendance/correction-requests` with a
   timestamp included.)
2. As the line manager, approve it.
3. Read the attendance entry: `attendanceMode` is still `OFFICE`.
4. Repeat with `requestedOvertimeMinutes`. Nothing anywhere records it.

## Evidence

- `services/api/src/modules/attendance/attendance.service.ts:1674-1720` —
  `applyApprovedCorrection`. The `attendanceEntry.update` payload is `checkIn`,
  `checkOut`, `status`, `source`, `notes`, `updatedById`, and nothing else.
- `services/api/src/modules/attendance/attendance.service.ts:871-873` — all three
  fields **are** persisted on the request at creation, so the data is present and
  simply never read back.

## Root Cause

Not yet fully established, but the shape is clear: the correction request model
grew three fields — mode, site, overtime — after the apply path was written, and
the apply path was never extended. Two of the three cannot be extended
mechanically, which is probably why:

- **Work mode has no clean target.** `requestedWorkMode` is an `EmployeeWorkMode`
  (`OFFICE`/`REMOTE`/`FIELD`/`HYBRID`); the entry's `attendanceMode` is an
  `AttendanceMode` (`OFFICE`/`REMOTE`/`HYBRID`/`MACHINE`/`MANUAL`). `FIELD` has
  no counterpart. The entry's `derivedWorkMode` *is* an `EmployeeWorkMode`, but
  it belongs to the reconciliation engine, and writing to it from an approval
  would put two writers on one column.
- **Overtime has no target at all.** `AttendanceEntry` holds no overtime field.
- **Work site is the one clean case.** `requestedWorkSiteId` is validated against
  `Location`, which is the same model `officeLocationId` points at.

## Impact

Reachable in production on every tenant. Two of the eight correction types —
`TIME_ADJUSTMENT` and `OVERTIME_APPROVAL` — are approvals that do nothing, and
the third, `MANUAL_CORRECTION`, applies its times but drops the site it named.
The employee is told their correction was approved. It was not applied. That is
worse than a refusal, because nobody is left with a reason to check.

## Affected Areas

- `applyApprovedCorrection`, `services/api/src/modules/attendance/attendance.service.ts`
- `AttendanceEntry.attendanceMode`, `officeLocationId`, `derivedWorkMode`
- the attendance reconciliation engine, which owns `derivedWorkMode`

## Proposed Resolution

**Needs an ExecPlan**, because two of the three parts are product decisions and
not code:

1. **Work site** can be applied now: set `officeLocationId` from
   `requestedWorkSiteId`. Additive, no schema change.
2. **Work mode** needs a decision on where an approved mode lands, and how
   `FIELD` is represented on an entry whose enum has no such member. Options
   include widening `AttendanceMode`, mapping `FIELD` onto a site attribute, or
   routing the approval through the reconciliation engine rather than around it.
3. **Overtime** needs a decision on whether approved overtime is stored on the
   entry, on the day, or only on the request as an input to payroll. This one
   touches pay, so it is not a decision to take inside a bug fix.

Until then, an approval that cannot be applied should not silently claim
success — refusing at approval time is more honest than a notification that
overstates what happened.

## Acceptance Criteria

- Approving a site correction updates the entry's `officeLocationId`.
- Approving a mode correction either updates the entry's mode or is refused with
  a stated reason; it does not report success and change nothing.
- The status re-derivation uses the mode as approved, not the mode as it was.
- An approved overtime request results in a recorded, findable value.

## Regression Coverage

Covered by REG-404 in the regression register.

## Dependencies

- [[BUG-2505-a-mode-or-location-correction-could-never-be-submitted-at-al]] —
  until that was fixed, the mode path could not be exercised through the product
  at all, which is very likely why this went unnoticed.

## Related Items

- [[BUG-2507-the-manager-s-correction-screen-hides-four-of-the-eight-kind]]
- [[EXECPLAN-0029-attendance-correction-from-the-record-page]]
- [[attendance]]
- [[leave-attendance-approvals]]

## Resolution

Fixed per [[EXECPLAN-0032-attendance-correction-approval-completes-the-workflow]].

**Work site** — `applyApprovedCorrection` now sets `officeLocationId` from
`requestedWorkSiteId` on both the existing-entry and the create-new-entry
branches, falling back to the entry's current value when the correction did
not name one.

**Work mode** — the product decision this record called for: a new pure
function, `resolveApprovedAttendanceMode`, maps `EmployeeWorkMode` onto
`AttendanceMode` where the two agree (`OFFICE`, `REMOTE`, `HYBRID`) and
**refuses the approval** with `UnprocessableEntityException` when the request
asks for `FIELD` — `AttendanceMode` has no such member, and widening it is a
schema decision with its own consumers (reporting, payroll inputs, the
attendance list filter) that does not belong inside this fix. This satisfies
the acceptance criterion directly: "updates the entry's mode, or is refused
with a stated reason" — never a silent no-op. `deriveManualStatus` is now
called with the resolved (approved) mode, not `existing.attendanceMode`, which
closes the second defect the record named: status was being re-derived from
the value the approval was supposed to replace.

**Overtime** — no `AttendanceEntry` field was added, and none was needed.
Reading `services/api/src/modules/attendance-engine/attendance-reconciliation.service.ts`
found this already solved, independently of the apply path this record
describes: `loadApprovedAdjustments` reads approved `OVERTIME_APPROVAL`
corrections fresh on every reconciliation run, `sumApprovedOvertime` totals
them, and `persist` writes the result to
`AttendanceDay.approvedOvertimeMinutes` — read fresh each time specifically so
a withdrawn approval's minutes go back to zero without anyone editing a
derived record. `queueCorrectionReconciliation` already runs unconditionally
after every correction action. So an approved overtime request already
results in a recorded, findable value, sourced live rather than copied once —
the acceptance criterion is met by an existing mechanism this fix leaves
alone rather than duplicating (a second, entry-level copy would recreate the
exact "two writers on one column" problem this record raised for work mode).

Regression coverage:
`services/api/src/modules/attendance/attendance-correction-apply.spec.ts`.

## QA Retest

Not run as a live QA session — verified by targeted regression specs only
(see Regression Coverage). Pending a QA pass against a running tenant.

## History

- 2026-08-30 - created from qa run at `ade1fea7`; verified by reading the apply
  path and the create path against each other.
- 2026-09-11 - fixed per EXECPLAN-0032: work site and work mode applied at
  approval, FIELD refused with a stated reason, overtime confirmed already
  handled by the reconciliation engine.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[attendance]]
- Regression — REG-404 (see the regression register)

<!-- GRAPH:END -->
