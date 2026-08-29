---
ID: BUG-2008
aliases: [BUG-2008]
Title: Every employee is counted absent on a non-working day and raised as an exception
Status: FIXED
Severity: HIGH
Priority: P1
Type: DATA_INTEGRITY
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [services/api/src/modules/attendance, services/api/src/modules/dashboard]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-2008 — Every employee is counted absent on a non-working day and raised as an exception

## Summary

On a Saturday — a scheduled off day for this tenant — the dashboard reports all
11 employees as ABSENT and raises "Absent employees 11" as an attendance
exception needing review. The product already knows the day is not a working day:
the Check In button on the same tenant, the same day, is disabled with the reason
"2026-08-29 is a scheduled off day". So one part of the system correctly excludes
the day and another counts every employee absent on it, on the first screen a
customer sees.

## Expected Behavior

Off days and holidays are excluded from the absent count and from the attendance
exception list, or are reported separately and labelled as non-working. A
workforce that is not expected to attend is not absent.

## Actual Behavior

Dashboard, Saturday 2026-08-29, tenant `DijiPeople Demo`:

```
Today attendance      CHECKED IN 0 | ABSENT 11 | LATE 0 | MISSING CHECKOUT 0 | ON LEAVE 0
Attendance exceptions Absent employees 11   [Review]
```

while, on `/attendance` the same day:

```
Check In  (disabled)
title="Check in is unavailable because 2026-08-29 is a scheduled off day."
```

## Reproduction

Target: `https://dijipeople-demo.ws.dijipeople.com`, tenant `DijiPeople Demo`,
production API commit `949f461c`, observed 2026-08-29 (a Saturday; this tenant's
work schedule treats Friday and Saturday as off days).

1. Sign in to the tenant workspace on an off day for that tenant's work schedule.
2. Read the dashboard **Today attendance** tile: ABSENT equals the full headcount.
3. Read the **Attendance exceptions** panel: "Absent employees 11" with a Review
   action.
4. Open `/attendance` on the same day and hover the disabled Check In button: the
   product states the day is a scheduled off day.

The two screens disagree about the same fact on the same day.

## Evidence

The dashboard tile, the exception row and the disabled-button reason above, all
observed live on the production demo tenant on 2026-08-29.

Corroboration that the attendance data itself is right, from the same tenant's
`/reports` screen: the attendance histogram for 2026-08-23 to 27 shows six
entries per working day and **0 for the Friday and the Saturday**. So the
reporting path already treats the weekend correctly. The defect is specifically
in whatever computes "absent today" for the dashboard tile and the exception
list, which apparently derives absence from "employees with no attendance record
today" without consulting the work schedule.

No file:line evidence was collected. The absent calculation in
`services/api/src/modules/attendance` and its consumer in
`services/api/src/modules/dashboard` were not opened during the run, and the
question of which of the two owns the schedule check should be answered there.

## Root Cause

Not established in code. Observably, the absent count is derived without
consulting the work schedule that the check-in gate does consult — two readers of
the same calendar, one of which does not read it.

## Impact

Customer-visible, wrong, and on the landing screen. Any customer who opens
DijiPeople on a weekend sees their entire workforce flagged absent and a red
exception row telling them to act on it. On a tenant whose purpose is prospect
demonstrations, that is the first thing a prospect sees.

It is not only cosmetic. The same calculation is what any absence report and any
absence-driven payroll deduction would be built on. A count that treats every
weekend as universal absence is wrong by roughly two ninths before anyone looks
at real data.

Rated HIGH: an attendance calculation error, visible in production, on the
primary screen, with a plausible route into payroll. Not CRITICAL: no payroll
amount was demonstrated wrong during this run and nothing is corrupted at rest —
the stored attendance data is correct, as the reports screen shows.

## Affected Areas

`services/api/src/modules/attendance` (the absent/exception calculation);
`services/api/src/modules/dashboard` (the Today attendance tile and the
Attendance exceptions panel); any absence report or payroll deduction consuming
the same calculation.

## Proposed Resolution

Make the absent calculation consult the same work-schedule source the check-in
gate consults, and treat a non-working day as neither present nor absent.

Decide explicitly what the tile should show on such a day — "Non-working day"
with the counts suppressed reads better than four zeroes — and apply the same
rule to holidays, which have the same shape and were not separately tested here.

Then check the other consumers of the absent calculation before closing: this
record establishes the defect on two dashboard surfaces, not that they are the
only two.

## Acceptance Criteria

- On a scheduled off day, the dashboard does not count any employee as absent.
- No attendance exception is raised for absence on a non-working day.
- The same holds for a configured public holiday.
- A working day is unaffected: genuine absences are still counted and still
  raised.

## Regression Coverage

None yet. A service test that asks for the absent count on a date the work
schedule marks as an off day, and asserts zero, would fail today.

## Dependencies

None identified.

## Related Items

BUG-2005 (attendance accepts future dates) is the other attendance data-integrity
defect from this run and feeds the same tiles. ITEM-0109 concerns the disabled
Check In button whose tooltip is the evidence that the schedule is known.

## Resolution

Fixed. The premise held exactly as filed. The absent count was
`Math.max(activeEmployeeCount - entries.length, 0)`
(`services/api/src/modules/dashboard/dashboard.service.ts:1502` and `:1524` at
the time of the report) — headcount minus whoever had an attendance row, with no
reference to any work schedule or holiday calendar. The same number fed the
"Absent employees" exception row and the manager view's "Absent today" metric.

**Root cause, established.** Two readers of the same calendar, one of which did
not read it. The check-in gate resolves the employee's work configuration
through `AttendanceRepository.resolveEmployeeWorkConfiguration` and knows the day
is off; the dashboard never asked. It could not cheaply ask, either: that
resolver answers for one employee in up to eight round trips, so calling it per
head would have turned the landing screen of a large tenant into thousands of
queries.

**What changed.**

- `services/api/src/modules/attendance/attendance.repository.ts` — new
  `resolveWorkDayForEmployees(tenantId, employeeWhere, effectiveDate, dayOfWeek)`
  returning an `EmployeeWorkDayResolution` per employee. It resolves a whole
  population in **five queries** — employees, effective-dated schedule
  assignments, every active work schedule with its row for the weekday, every
  active holiday calendar, and the holidays on that date — then picks in memory.
  The precedence is **not** restated: it comes from
  `work-configuration-hierarchy.ts`, the same module the single-employee
  resolver uses, so the two cannot disagree about who wins. The comment on the
  method says what is duplicated (query shape) and what is not (the rule), and
  tells the next reader to change both together.

- `services/api/src/modules/attendance/attendance.service.ts` — new
  `resolveAttendanceExpectation(tenantId, attendanceDate, employeeWhere)`,
  splitting a population into `expectedEmployeeIds` and
  `nonWorkingEmployeeIds`. The work calendar is an attendance concept, so the
  attendance module owns the answer.

- `services/api/src/modules/dashboard/dashboard.service.ts` — `absent` is now
  the count of employees the calendar **expected** to attend who have no
  attendance row, rather than headcount minus attendance rows. The exception row
  is built from the same number, so no absence exception is raised on a
  non-working day. A `nonWorking` count is reported alongside so the tile can say
  "nobody was expected today" instead of showing four zeroes that read as missing
  data. `toAttendanceDate` converts the tile's server-local day to the UTC
  midnight that attendance dates are stored at; its comment records that the
  dashboard's use of the server's day rather than the tenant's is pre-existing
  and deliberately unchanged, because the two halves of the tile must at least
  agree with each other.

- `services/api/src/modules/dashboard/dashboard.module.ts` — imports
  `AttendanceModule` rather than re-querying schedules and holidays.

**Behaviour on the reported case.** An employee with no work schedule at all is
still counted as expected — nothing has said they do not work, and guessing
"off" would silently excuse them. This mirrors `resolveSelfServiceContext`,
which computes `isOffDay` as `Boolean(workSchedule && !isWorkingDay)`.

**Holidays are covered too**, which the record asked for and the run did not
test: a holiday on the employee's resolved calendar excuses them, with the
TENANT / DEPARTMENT / WORK_SITE scope matching the check-in path applies.

**Tests.**

- `services/api/src/modules/attendance/attendance-work-day-resolution.spec.ts`
  (new, 17 cases) pins the resolution itself: schedule-day wins over the weekly
  pattern; an employee with no schedule is not excused; assignment beats employee
  default beats team beats department; business-unit scope beats organization
  scope; tenant default is last; a tenant-scoped holiday applies, a
  department-scoped one does not apply across departments, a work-site one
  applies at that site, a holiday on an unresolved calendar is ignored, and the
  owning schedule's calendar is consulted before the tenant default. Two cases
  guard the shape: the whole population resolves in one pass, and no holiday
  query is issued when nobody resolves to a calendar.
- `services/api/src/modules/dashboard/dashboard.service.spec.ts` — the absent
  count is 0 when the calendar excuses the whole workforce, no exception is
  raised on such a day, a genuine absence on a working day is still counted and
  still raised as a warning, an excused employee is not counted alongside working
  colleagues, and the date handed to the attendance module is the UTC midnight of
  the day the tile is reporting on.

**Not done.** The record asked to check the other consumers of the absent
calculation before closing. `getAttendanceOperations` is the only place that
computes it; the HR, manager and employee views all read that one method, so all
three are fixed by this change. The reports screen was already correct — it
counts entries rather than deriving absence.

## QA Retest

Awaiting a fix — nothing to retest yet. Retesting requires either a Friday or a
Saturday on this tenant's schedule, or a temporary schedule change.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`. Only visible once the tenant had real employee data, which is why the earlier pass against an empty tenant did not see it. Disposition FIX_NOW.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Referenced by — [[ITEM-0109]]
- Modules — [[attendance]]

<!-- GRAPH:END -->
