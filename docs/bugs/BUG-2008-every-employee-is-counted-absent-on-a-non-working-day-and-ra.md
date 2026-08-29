---
ID: BUG-2008
aliases: [BUG-2008]
Title: Every employee is counted absent on a non-working day and raised as an exception
Status: OPEN
Severity: HIGH
Priority: P1
Type: DATA_INTEGRITY
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [services/api/src/modules/attendance, services/api/src/modules/dashboard]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt:
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

Open. No fix has been written.

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
