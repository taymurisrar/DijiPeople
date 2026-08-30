---
ID: BUG-2494
aliases: [BUG-2494]
Title: Check-out re-validates check-in preconditions and traps the entry open for ever
Status: OPEN
Severity: HIGH
Priority: P1
Type: STATE_MACHINE
Source: QA_RUN
DetectedDate: 2026-08-30
DetectedInSha: c4ffd13b
AffectedModules: [api:attendance]
OwnerAgent: architect
ArchitectDisposition: TRIAGE_REQUIRED
QAReport:
RegressionId:
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-30
UpdatedAt: 2026-08-30
ResolvedAt:
---

# BUG-2494 — Check-out re-validates check-in preconditions and traps the entry open for ever

## Summary

`checkOut` calls `validateModeAndLocation` against the **stored** entry — its
`attendanceMode` and its `officeLocationId` — before closing it. Those are
check-in preconditions, decided and committed hours earlier. Check-out accepts
no office location and no mode, so when that validation fails there is nothing
the employee can do: the entry stays open, `checkOut` returns `400` on every
attempt, and the working day can never be closed through self-service.

It is failing in production right now. Entry `85303ef3-4285-45d4-a751-370a00a78828`
on the `dijipeople-demo` tenant has been open since `12:43:50Z` and cannot be
closed.

## Expected Behavior

Check-out validates what check-out controls: the location payload the client is
submitting now. A record the system already accepted at check-in must always be
closable. If some condition genuinely blocks closing, it must be one the
employee can act on, or the system must close the entry itself.

## Actual Behavior

`POST /api/attendance/check-out` returns
`400 VALIDATION_FAILED — "Office location is required for office attendance."`
whenever the stored entry has `attendanceMode: OFFICE` and
`officeLocationId: null`. The employee has no way to supply one — the check-out
DTO has no such field — so the entry is stuck permanently.

## Reproduction

1. Have an attendance entry with `attendanceMode: OFFICE` and
   `officeLocationId: null` and an open `checkIn`. Three routes reach this
   state; see Root Cause.
2. `POST /api/attendance/check-out` as that employee.
3. `400 — "Office location is required for office attendance."`
4. Repeat forever. There is no request that succeeds.

## Evidence

Read live from production on 2026-08-30 via `GET /api/attendance/mine/active`
as the affected user:

```
id:               85303ef3-4285-45d4-a751-370a00a78828
employeeId:       7ac8967d-3e37-458f-9e76-60b8f5068036
attendanceMode:   "OFFICE"
officeLocationId: null            <- what check-out validates
workSite:         { id: "a619115c-fe74-4bc4-9653-761a81d30503",
                    name: "Head Office", code: "HQ" }
checkIn:          "2026-08-30T12:43:50.531Z"
checkOut:         null            <- still open five hours later
```

The matching incidents in the monitoring queue, one from the browser and one
from the API, for the same attempt:

```
client_1788107725420_7qxptrsxvek  attendance.checkOut /attendance      400
web_78548d86-d5e3-4743-8b4b-424a9c9f243a  POST /api/attendance/check-out  400
                      "Office location is required for office attendance."
```

Source:

- `services/api/src/modules/attendance/attendance.service.ts:509-517` —
  `checkOut` calls `validateModeAndLocation(tenantId, existing.attendanceMode,
  policy, existing.officeLocationId ?? undefined, …)`.
- `services/api/src/modules/attendance/attendance.service.ts:3760-3764` — the
  throw, reached whenever mode is `OFFICE` and no location id is present.
- `services/api/src/modules/attendance/attendance.service.ts:4183` — the read
  path resolves `entry.officeLocation ?? entry.employee.location`, which is why
  the screen shows "Head Office" for an entry whose `officeLocationId` is null.

**The read path and the validation path disagree about where the work site
lives.** The API response says this entry has a work site. The check-out
validator says it has none. Both are reading the same row.

## Root Cause

Two faults, and the second is the one that makes it unrecoverable.

**1. A field written at check-in is read back as a precondition at check-out.**
`checkOut` re-runs a check-in gate. Nothing between check-in and check-out can
change what the employee submits, so re-validating can only ever *fail on data
the system itself accepted*. When it fails there is no recovery path, because
check-out has no field to correct.

**2. Several routes legitimately produce `OFFICE` with a null location.** This
is not one bad write to be cleaned up:

- `officeLocation` on the entry is `onDelete: SetNull`
  (`schema.prisma`, `AttendanceOfficeLocation`). **Deleting a work site nulls
  the column on every historical entry**, so retiring one office traps every
  employee currently checked in there.
- The read path's own fallback — `entry.officeLocation ?? entry.employee.location`
  — shows the platform already treats the employee's own location as a valid
  answer. The validator does not.
- `validateModeAndLocation` also enforces `policy.allowedModes`. A tenant that
  disables `OFFICE` mode after check-in traps every open `OFFICE` entry the same
  way, with a different message.

So the class of trap is wider than the one message: **any check-in precondition
that stops holding before check-out locks the entry open.**

## Impact

An employee cannot close their working day. The entry stays open, so
`markMissingCheckout` will eventually mark the shift as a missing check-out,
and worked hours for that day are wrong — which flows into timesheets and
payroll.

Reachable in production and currently happening. The blast radius is larger
than one user: deleting a single work site would trap everyone checked in
against it simultaneously, and each of them would see a message telling them to
supply something they cannot supply.

## Affected Areas

- `POST /api/attendance/check-out`
- `services/api/src/modules/attendance/attendance.service.ts`
- Timesheets and payroll downstream of `workedMinutes`
- The tenant workspace attendance screen

## Proposed Resolution

Stop re-validating check-in preconditions at check-out.

`validateAttendanceLocationPayload` already runs immediately afterwards and is
the correct control for check-out: it validates what the client is submitting
*now*. The `validateModeAndLocation` call adds nothing check-out can act on —
it re-asks a question that was already answered and committed — so it should be
removed, with a comment recording why it must not come back.

Deliberately **not** proposed: defaulting the missing location from
`employee.location` at check-out. That would paper over the trap while silently
attributing attendance to an office the geofence never confirmed, which is the
integrity control the check-in path exists to enforce. The right place to
resolve a work site is check-in, where the position is available.

Separately, the stuck production entry needs closing once the fix ships.

No ExecPlan needed — the change removes a validation rather than adding
behaviour, and the removed call has no side effects beyond throwing.

## Acceptance Criteria

- An entry with `attendanceMode: OFFICE` and `officeLocationId: null` can be
  checked out.
- An entry whose work site was deleted after check-in can be checked out.
- An entry whose mode was disallowed by policy after check-in can be checked
  out.
- Check-in still refuses `OFFICE` without a resolvable work site — the
  precondition is enforced where it belongs, and a test asserts it.
- The location payload validation on check-out is unchanged.

## Regression Coverage

A spec driving `checkOut` against an entry with `OFFICE` + null
`officeLocationId` and asserting it closes, alongside one asserting `checkIn`
still refuses the same combination. Registered as a regression entry once
written.

## Dependencies

None.

## Related Items

[[BUG-2465]] — the triage that surfaced this from the production queue.
The check-in half of this area is [[BUG-2335]] and its work-site resolution.

## Resolution

Filled at fix time.

## QA Retest

Pending.

## History

- 2026-08-30 — created from the production monitoring queue at `c4ffd13b`,
  confirmed against the live entry rather than inferred from the log.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[attendance]]

<!-- GRAPH:END -->
