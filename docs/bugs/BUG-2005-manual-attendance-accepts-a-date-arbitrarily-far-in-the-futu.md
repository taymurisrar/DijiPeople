---
ID: BUG-2005
aliases: [BUG-2005]
Title: Manual attendance accepts a date arbitrarily far in the future
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: DATA_INTEGRITY
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [services/api/src/modules/attendance]
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

# BUG-2005 — Manual attendance accepts a date arbitrarily far in the future

## Summary

`POST /api/attendance/manual` has no upper bound on `date`. An entry dated ten
months from now is accepted and stored. Attendance is a record of what happened;
a future-dated row is by definition not that, and it flows into attendance
reports, the absent and exception calculations, and anything downstream that
consumes attendance as a payroll input. The adjacent validations on the same
endpoint are correct, which makes this a specific gap rather than an unvalidated
endpoint.

## Expected Behavior

A manual attendance entry is refused for a date beyond today — or beyond a
deliberately chosen, small tolerance if a tenant timezone ahead of the server
makes "today" ambiguous. The refusal names the rule.

## Actual Behavior

```
POST /api/attendance/manual
{"employeeId": <employee>, "date": "2027-06-15",
 "checkInTime": "09:00", "checkOutTime": "17:00",
 "attendanceMode": "OFFICE", "officeLocationId": <office>,
 "adjustmentReason": "<text>"}

-> 201 CREATED   id 49ebf7cf-c9fb-4871-bd2b-8001eb057e94
```

## Reproduction

Target: `https://dijipeople-demo.ws.dijipeople.com`, tenant `DijiPeople Demo`,
production API commit `949f461c`, observed 2026-08-29 (so the date above is
roughly ten months ahead).

1. Authenticate as a user who can create manual attendance.
2. Issue the request quoted above with any `date` in the future.
3. It returns 201 and the row is persisted and readable.

The probe row was deleted afterwards.

## Evidence

The request and the 201 above, on the production demo tenant.

The contrast is what establishes this as a missing rule rather than a missing
validator: the same endpoint enforces its other invariants correctly.

```
duplicate employee + date        -> 409 "An attendance entry already exists for this employee on this date."
check-out earlier than check-in  -> 400 "Check-out time cannot be earlier than check-in time."
```

No file:line evidence was collected; the manual-attendance DTO and service in
`services/api/src/modules/attendance` were not opened during the run. The bound
belongs wherever those two rules live, and that is the first thing to find.

## Root Cause

Not established in code. Observably, no upper bound on `date` is declared or
checked on the manual attendance path.

## Impact

Corrupts every consumer of attendance data, quietly and for as long as the row
survives. Attendance reports include a day that has not happened; the absent and
exception calculations acquire a phantom present day; and attendance is a payroll
input, so a future-dated entry is a route to a wrong payroll amount without
anyone having entered a wrong amount.

It is also a plausible accident rather than an attack: a mistyped year in a date
field is the single most common data-entry error there is, and nothing catches
it.

Rated MEDIUM: missing validation with real downstream consequences, but it
requires someone to enter the wrong date and it produces no cross-tenant or
authorization effect. It would be HIGH if a wrong payroll amount were
demonstrated rather than reasoned about; that was not attempted.

## Affected Areas

`services/api/src/modules/attendance` (the manual entry DTO and service);
attendance reports; the absent/exception calculation that BUG-2008 also concerns;
`time-payroll` and any payroll path consuming attendance.

## Proposed Resolution

Add the upper bound alongside the two rules that already work, and decide the
tolerance deliberately: "not after today in the tenant's timezone" is the obvious
rule, and the tenant timezone matters because the server's today and the tenant's
today are not always the same date.

While there, check the other attendance write paths — corrections, imports and
the device ingestion path — for the same gap. This record establishes it on the
manual endpoint only.

## Acceptance Criteria

- `POST /api/attendance/manual` with a date after today in the tenant timezone is
  refused with a clear message naming the rule.
- Today's date is still accepted.
- The other attendance write paths enforce the same bound, or the plan says why
  they legitimately differ.

## Regression Coverage

None yet. A service test asserting a future date is refused would fail today, and
sits naturally beside whatever tests cover the duplicate-day and reversed-times
rules.

## Dependencies

None identified.

## Related Items

BUG-2008 (every employee counted absent on a non-working day) is the other
attendance calculation defect from this run, and both feed the same dashboard
tiles.

## Resolution

Open. No fix has been written.

## QA Retest

Awaiting a fix — nothing to retest yet.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`. Disposition FIX_NOW.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[attendance]]

<!-- GRAPH:END -->
