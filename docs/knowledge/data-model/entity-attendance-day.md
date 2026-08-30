---
aliases: [AttendanceDay]
type: entity
model: AttendanceDay
last_verified: 2026-08-30
---

# AttendanceDay

## Purpose

**The computed daily result** — one row per employee per shift workday, holding
what the attendance engine concluded from the raw punches. It is the model
payroll, timesheets and every attendance report read.

`AttendanceEntry` is the other half: the raw record. This model is its
projection.

## `attendanceDate` is the shift day, not the calendar day

The schema says so in its own comment, and it is the single most important fact
about this model:

> An overnight 21:00→06:00 shift produces **one** row whose punches straddle
> midnight, so this is not always the calendar date the punches carry.

Any query that joins punches to days by calendar date is wrong for every
night-shift tenant, and correct for everyone else — which is exactly the shape of
defect that reaches production.

`@@unique([tenantId, employeeId, attendanceDate])` makes the row idempotent:
reconciliation recomputes in place rather than accumulating duplicates.

## The minute fields are a breakdown, not a set of independent counters

```
scheduledMinutes    what the schedule required
workedMinutes       what was actually worked
officeMinutes + remoteMinutes + fieldMinutes    where it was worked
breakMinutes        non-working time inside the span
lateMinutes / earlyDepartureMinutes / earlyArrivalMinutes    deviation
extraMinutes        beyond scheduled
approvedOvertimeMinutes    the subset of extra that was approved
leaveMinutes        covered by approved leave
```

`extraMinutes` and `approvedOvertimeMinutes` are **not the same number**, and
paying the first is the mistake this separation exists to prevent: time worked
beyond schedule is a fact, time approved for overtime is a decision. Only the
second is a payroll input.

All are `Int` minutes. There are no hours anywhere on this model — the `Decimal`
hours live on [[entity-timesheet|Timesheet]], which is a different system.

## Five booleans, one status

`isHoliday`, `isWeekend`, `isOffDay`, `onLeave` and `locked` sit alongside
`status` (`PENDING`, `PRESENT`, `PARTIAL`, `ABSENT`, `ON_LEAVE`, `HOLIDAY`,
`WEEKEND`, `OFF_DAY`, `NEEDS_REVIEW`), and the enum plainly overlaps the
booleans.

They are not redundant in practice: the booleans describe the **calendar** (this
day was a holiday) while `status` describes the **outcome** (the person was
nonetheless present). A holiday worked is `isHoliday: true` with
`status: PRESENT`, and collapsing the two loses the premium-pay case entirely.

`NEEDS_REVIEW` is the one a human resolves; `openExceptionCount` counts the
`AttendanceException` rows driving it.

## Locking and reconciliation

`locked`, `lockedAt`, `lockReason` and `lockedById` freeze a day once payroll has
consumed it. `reconciliationVersion` and `lastReconciledAt` record which pass of
the engine produced the current numbers.

**A locked day must not be recomputed.** The engine reconciles forward; if a
correction is needed after locking it goes through `AttendanceCorrectionRequest`
and its approval, not through a direct write.

## Security

Tenant-scoped, and additionally scope-sensitive: attendance is personal data
about when someone was at work. Row access is resolved by
`buildScopedAccessWhere()` against the caller's role — a `BUSINESS_UNIT` role
must not read another unit's days, and a manager reads their subtree. See
[[rbac]].

`AttendanceLocationEvidence` hangs off the same employee and carries **location**
data; treat it as more sensitive again.

<!-- GENERATED:schema-facts -->

> Generated from `services/api/prisma/schema.prisma` by `scripts/generate-data-model.mjs`. Do not hand-edit this region.

### Ownership and access

| Property | Value |
|---|---|
| Tenant-scoped | **yes** — carries `tenantId` |
| Primary key | `id` |
| Prisma accessor | `prisma.attendanceDay` |
| Owning module | `services/api/src/modules/attendance-engine` |
| Domain | Time |
| Also touched by | — |

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `employeeId` | `String` | yes | — |
| `attendanceDate` | `DateTime` | yes | — |
| `workScheduleId` | `String` | no | — |
| `shiftTemplateId` | `String` | no | — |
| `attendanceEntryId` | `String` | no | unique |
| `status` | `AttendanceDayStatus` (enum) | yes | default `PENDING` |
| `timezone` | `String` | no | — |
| `scheduledMinutes` | `Int` | yes | default `0` |
| `workedMinutes` | `Int` | yes | default `0` |
| `officeMinutes` | `Int` | yes | default `0` |
| `remoteMinutes` | `Int` | yes | default `0` |
| `fieldMinutes` | `Int` | yes | default `0` |
| `breakMinutes` | `Int` | yes | default `0` |
| `lateMinutes` | `Int` | yes | default `0` |
| `earlyDepartureMinutes` | `Int` | yes | default `0` |
| `earlyArrivalMinutes` | `Int` | yes | default `0` |
| `extraMinutes` | `Int` | yes | default `0` |
| `approvedOvertimeMinutes` | `Int` | yes | default `0` |
| `firstCheckInAt` | `DateTime` | no | — |
| `lastCheckOutAt` | `DateTime` | no | — |
| `derivedWorkMode` | `EmployeeWorkMode` (enum) | no | — |
| `sessionCount` | `Int` | yes | default `0` |
| `openExceptionCount` | `Int` | yes | default `0` |
| `isHoliday` | `Boolean` | yes | default `false` |
| `isWeekend` | `Boolean` | yes | default `false` |
| `isOffDay` | `Boolean` | yes | default `false` |
| `onLeave` | `Boolean` | yes | default `false` |
| `leaveMinutes` | `Int` | yes | default `0` |
| `locked` | `Boolean` | yes | default `false` |
| `lockedAt` | `DateTime` | no | — |
| `lockReason` | `String` | no | — |
| `lockedById` | `String` | no | — |
| `reconciliationVersion` | `Int` | yes | default `1` |
| `lastReconciledAt` | `DateTime` | no | — |

### States

- `status` — `AttendanceDayStatus`: `PENDING`, `PRESENT`, `PARTIAL`, `ABSENT`, `ON_LEAVE`, `HOLIDAY`, `WEEKEND`, `OFF_DAY`, `NEEDS_REVIEW`
- `derivedWorkMode` — `EmployeeWorkMode`: `OFFICE`, `REMOTE`, `HYBRID`, `FIELD`

### Relationships

**Belongs to** — this model holds the foreign key

- [[entity-employee|Employee]] via `employee` — `onDelete: Cascade`
- `WorkSchedule` via `workSchedule` (optional) — `onDelete: SetNull`
- `ShiftTemplate` via `shiftTemplate` (optional) — `onDelete: SetNull`
- `AttendanceEntry` via `attendanceEntry` (optional) — `onDelete: SetNull`
- [[entity-tenant|Tenant]] — the isolation owner

**Owns** — the foreign key lives on the other side

- `AttendanceSession` via `sessions`[]
- `AttendanceException` via `exceptions`[]
- `AttendanceLocationEvidence` via `locationEvidence`[]

### Constraints and indexes

- Unique: `attendanceEntryId`, `@@unique([tenantId, employeeId, attendanceDate])`
- Indexes: 4
<!-- /GENERATED:schema-facts -->

## Related

[[entity-employee|Employee]] · [[entity-timesheet|Timesheet]] ·
[[entity-tenant|Tenant]] · [[attendance]] · [[leave-attendance-approvals]] ·
[[rbac]] · [[data-model-overview]] · [[domain-map]]
