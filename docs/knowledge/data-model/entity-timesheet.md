---
aliases: [Timesheet]
type: entity
model: Timesheet
last_verified: 2026-08-30
---

# Timesheet

## Purpose

**One employee's month.** `@@unique([tenantId, employeeId, year, month])` — the
grain is monthly, not weekly and not daily, and the weekly and daily detail lives
in `TimesheetWeek` and `TimesheetDay` beneath it.

Timesheets answer *what was worked on*. [[entity-attendance-day|AttendanceDay]]
answers *whether the person was at work*. They are **two systems**, they use
different units (`Decimal` hours here, `Int` minutes there), and a change in one
does not update the other.

## Three status axes, and they are genuinely independent

| Field | Values | Answers |
|---|---|---|
| `status` | 16, `NOT_STARTED` … `CANCELLED` | Where the timesheet is in its own review flow |
| `payrollStatus` | 10, `NOT_APPLICABLE` … `ADJUSTMENT_REQUIRED` | What payroll has done with it |
| `lockStatus` | 5, `UNLOCKED` … `CUTOFF_LOCKED` | Why it cannot currently be edited |

A timesheet can legitimately be `APPROVED`, `EXPORTED` and `PAYROLL_LOCKED` at
once; those are three different facts about the same row. Reading one and
inferring the others is the mistake to avoid — in particular, **`status:
APPROVED` does not mean editing is closed**, `lockStatus` does.

`lockStatus` distinguishes *why* the lock exists — submitted, approved, consumed
by payroll, or past a cutoff date — because the unlock authority differs for
each.

## The policy is snapshotted

`policyId`, `policyVersion` and `policySnapshot` (Json) together freeze the rules
that applied when the timesheet was generated. `TimesheetPolicy` may change
afterwards; a submitted month must still be judged by the rules in force at the
time.

This is the same reasoning as `referralCodeSnapshot` on
[[entity-tenant|Tenant]]: where a record is evidence of an agreement, resolving
its terms live rewrites history. Do not query into `policySnapshot` — the
structured fields exist for that.

`version` is separate again: optimistic concurrency on the row.

## The hours breakdown

`requiredHours`, `enteredHours`, `approvedLeaveHours`, `holidayHours`,
`weekendHours`, `billableHours`, `nonBillableHours`, `overtimeHours` — all
`Decimal`, with `completionPercentage` derived from the first two.

`billableHours + nonBillableHours` is a **different partition** of the same time
as `holidayHours + weekendHours`; they are two views, not additive columns.
Summing across the two groups double-counts.

## `processingCycleId` is always null

The foreign key exists; `ProcessingCycle` has **no writer anywhere in the
repository**, so nothing can populate it. Code that branches on it takes the null
path forever. Recorded in [[known-gaps]] — it is the highest-value item there,
because two live models hold this key.

## Payroll handoff

`TimesheetPayrollHandoff` is the seam to [[entity-payroll-run|PayrollRun]], with
`payrollProcessedAt` recording completion. `TimesheetReopeningRequest` is how a
locked month is reopened — an approval flow, not a direct write.

## Security

Tenant-scoped, plus `TimesheetAccessRestriction` — a model that exists to narrow
access further than the role would. When reasoning about who can see a timesheet,
that table is a fourth check on top of permission, privilege and access level.

Billable hours are commercially sensitive: they feed customer invoicing, so
exposure is a client-confidentiality question and not only an HR one.

<!-- GENERATED:schema-facts -->

> Generated from `services/api/prisma/schema.prisma` by `scripts/generate-data-model.mjs`. Do not hand-edit this region.

### Ownership and access

| Property | Value |
|---|---|
| Tenant-scoped | **yes** — carries `tenantId` |
| Primary key | `id` |
| Prisma accessor | `prisma.timesheet` |
| Owning module | `services/api/src/modules/timesheets` |
| Domain | Time |
| Also touched by | `dashboard` (reads), `demo-data` (reads), `employees` (reads), `payroll` (reads), `time-payroll` (reads), `workflows` (reads) |

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `organizationId` | `String` | no | — |
| `businessUnitId` | `String` | no | — |
| `departmentId` | `String` | no | — |
| `teamId` | `String` | no | — |
| `processingCycleId` | `String` | no | — |
| `employeeId` | `String` | yes | — |
| `year` | `Int` | yes | — |
| `month` | `Int` | yes | — |
| `periodStart` | `DateTime` | yes | — |
| `periodEnd` | `DateTime` | yes | — |
| `status` | `TimesheetStatus` (enum) | yes | default `DRAFT` |
| `completionPercentage` | `Decimal` | yes | default `0`, decimal(5,2) |
| `requiredHours` | `Decimal` | yes | default `0`, decimal(8,2) |
| `enteredHours` | `Decimal` | yes | default `0`, decimal(8,2) |
| `approvedLeaveHours` | `Decimal` | yes | default `0`, decimal(8,2) |
| `holidayHours` | `Decimal` | yes | default `0`, decimal(8,2) |
| `weekendHours` | `Decimal` | yes | default `0`, decimal(8,2) |
| `billableHours` | `Decimal` | yes | default `0`, decimal(8,2) |
| `nonBillableHours` | `Decimal` | yes | default `0`, decimal(8,2) |
| `overtimeHours` | `Decimal` | yes | default `0`, decimal(8,2) |
| `payrollStatus` | `TimesheetPayrollStatus` (enum) | yes | default `NOT_APPLICABLE` |
| `lockStatus` | `TimesheetLockStatus` (enum) | yes | default `UNLOCKED` |
| `generatedAt` | `DateTime` | no | — |
| `finalizedAt` | `DateTime` | no | — |
| `payrollProcessedAt` | `DateTime` | no | — |
| `policyId` | `String` | no | — |
| `policyVersion` | `Int` | no | — |
| `policySnapshot` | `Json` | no | — |
| `version` | `Int` | yes | default `1` |
| `submittedNote` | `String` | no | — |
| `submittedAt` | `DateTime` | no | — |
| `approvedAt` | `DateTime` | no | — |
| `rejectedAt` | `DateTime` | no | — |
| `reviewedAt` | `DateTime` | no | — |
| `approverUserId` | `String` | no | — |
| `reviewNote` | `String` | no | — |
| `comments` | `String` | no | — |

### States

- `status` — `TimesheetStatus`: `NOT_STARTED`, `DRAFT`, `IN_PROGRESS`, `SUBMITTED`, `PENDING_APPROVAL`, `PARTIALLY_APPROVED`, `APPROVED`, `REJECTED`, `OVERDUE`, `PAYROLL_READY`, `PAYROLL_PROCESSED`, `LOCKED`, `NOT_REQUIRED`, `AUTO_COMPLETED`, `EXCEPTION`, `CANCELLED`
- `payrollStatus` — `TimesheetPayrollStatus`: `NOT_APPLICABLE`, `NOT_ELIGIBLE`, `BLOCKED`, `READY`, `EXPORT_PENDING`, `EXPORTED`, `FAILED`, `REPROCESSING`, `PAYROLL_PROCESSED`, `ADJUSTMENT_REQUIRED`
- `lockStatus` — `TimesheetLockStatus`: `UNLOCKED`, `SUBMISSION_LOCKED`, `APPROVAL_LOCKED`, `PAYROLL_LOCKED`, `CUTOFF_LOCKED`

### Relationships

**Belongs to** — this model holds the foreign key

- [[entity-business-unit|BusinessUnit]] via `businessUnit` (optional) — `onDelete: Restrict`
- `ProcessingCycle` via `processingCycle` (optional) — `onDelete: SetNull`
- [[entity-employee|Employee]] via `employee` — `onDelete: Cascade`
- [[entity-user|User]] via `approverUser` (optional) — `onDelete: SetNull`
- [[entity-tenant|Tenant]] — the isolation owner

**Owns** — the foreign key lives on the other side

- `TimesheetEntry` via `entries`[]
- `TimesheetWeek` via `weeks`[]
- `TimesheetImportBatch` via `importBatches`[]
- `TimesheetReopeningRequest` via `reopeningRequests`[]
- `TimesheetPayrollHandoff` via `payrollHandoffs`[]

### Constraints and indexes

- Unique: `@@unique([tenantId, employeeId, year, month])`
- Indexes: 8
<!-- /GENERATED:schema-facts -->

## Related

[[entity-employee|Employee]] · [[entity-attendance-day|AttendanceDay]] ·
[[entity-payroll-run|PayrollRun]] · [[entity-business-unit|BusinessUnit]] ·
[[known-gaps]] · [[rbac]] · [[data-model-overview]] · [[domain-map]]
