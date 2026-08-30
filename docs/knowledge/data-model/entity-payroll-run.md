---
aliases: [PayrollRun]
type: entity
model: PayrollRun
last_verified: 2026-08-30
---

# PayrollRun

## Purpose

**One execution of payroll for one period.** `@@unique([payrollPeriodId, runNumber])`
— a period may be run several times, and each attempt is its own row rather than
an overwrite of the last.

That is the design decision the whole model turns on: payroll is re-runnable, and
every run is auditable. `PayrollRunEmployee` holds the per-person result,
`PayrollRunLineItem` the per-component detail beneath it.

## Recalculation is detected, not assumed

Three fields exist solely to answer "is this result still valid?":

- **`checksum`** — a hash of the inputs the calculation consumed.
- **`inputChangedAfterCalculation`** — set when something upstream moved.
- **`requiresRecalculation`** — the resulting verdict.

Payroll reads attendance, leave, timesheets, compensation and pay components,
all of which can change after a run is calculated and before it is approved.
Without this, a run approved on Tuesday could be paying Monday's numbers with no
sign that anything was wrong.

**Never approve or pay a run with `requiresRecalculation` set.** Recalculate
first.

## Eight states, and each transition has its own actor and timestamp

```
DRAFT → CALCULATING → CALCULATED → REVIEWED → APPROVED → PAID → LOCKED
                                                    ↘ FAILED
```

`createdBy`, `approvedBy`, `finalizedBy`, `disbursedBy` and `lockedBy` are
separate fields, with `calculationStartedAt`, `calculatedAt`, `approvedAt`,
`finalizedAt`, `paidAt`, `disbursedAt` and `lockedAt` beside them.

Storing an actor per transition rather than one `updatedById` is what makes
segregation of duties provable — the person who approves must not be the person
who disburses, and after the fact the row itself is the evidence. Do not collapse
these.

`LOCKED` is terminal. Corrections after it go through `PayrollAdjustment`, never
by editing the run.

## `correlationId`

Payroll runs are long, multi-step and partly asynchronous. `correlationId` is
what ties the log lines, `PayrollException` rows and any queued work back to the
run that caused them. Populate it; a failure without one is a failure nobody can
trace.

## Tenant-safe identity

`@@unique([id, tenantId])`, like [[entity-employee|Employee]] and
[[entity-business-unit|BusinessUnit]], so descendants can reference the run with
a composite key that cannot cross tenants. Given what this model computes, that
is not a formality.

## Security

The most sensitive computation in the product. It reads bank details, tax
identifiers and salaries; it writes amounts that become real payments.

- Payroll permissions are **not** implied by employee permissions — see
  [[BUG-0001-compensation-and-bank-data-behind-employee-record-read]] for what
  happens when sensitive fields ride along on a less-guarded read.
- Every state-changing operation must call `AuditService.log()` with before and
  after snapshots, passing the transaction client when inside `$transaction`.
- Amounts are `Decimal` and are computed server-side from stored inputs. Never
  accept a computed amount from a client, and never recompute from a
  client-supplied rate.

<!-- GENERATED:schema-facts -->

> Generated from `services/api/prisma/schema.prisma` by `scripts/generate-data-model.mjs`. Do not hand-edit this region.

### Ownership and access

| Property | Value |
|---|---|
| Tenant-scoped | **yes** — carries `tenantId` |
| Primary key | `id` |
| Prisma accessor | `prisma.payrollRun` |
| Owning module | `services/api/src/modules/payroll` |
| Domain | Pay |
| Also touched by | `dashboard` (reads), `time-payroll` (reads), `payslips` (reads), `tax-rules` (reads), `tenant-control-plane` (reads) |

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `payrollPeriodId` | `String` | yes | — |
| `runNumber` | `Int` | yes | default `1` |
| `status` | `PayrollRunStatus` (enum) | yes | default `DRAFT` |
| `calculationStartedAt` | `DateTime` | no | — |
| `calculatedAt` | `DateTime` | no | — |
| `approvedAt` | `DateTime` | no | — |
| `finalizedAt` | `DateTime` | no | — |
| `finalizedBy` | `String` | no | — |
| `paidAt` | `DateTime` | no | — |
| `disbursedAt` | `DateTime` | no | — |
| `disbursedBy` | `String` | no | — |
| `lockedAt` | `DateTime` | no | — |
| `createdBy` | `String` | no | — |
| `approvedBy` | `String` | no | — |
| `lockedBy` | `String` | no | — |
| `checksum` | `String` | no | — |
| `inputChangedAfterCalculation` | `Boolean` | yes | default `false` |
| `requiresRecalculation` | `Boolean` | yes | default `false` |
| `correlationId` | `String` | no | — |
| `notes` | `String` | no | — |

### States

- `status` — `PayrollRunStatus`: `DRAFT`, `CALCULATING`, `CALCULATED`, `REVIEWED`, `APPROVED`, `PAID`, `LOCKED`, `FAILED`

### Relationships

**Belongs to** — this model holds the foreign key

- `PayrollPeriod` via `payrollPeriod` — `onDelete: Cascade`
- [[entity-tenant|Tenant]] — the isolation owner

**Owns** — the foreign key lives on the other side

- `PayrollRunEmployee` via `employees`[]
- `PayrollException` via `exceptions`[]
- `Payslip` via `payslips`[]
- `PayrollJournalEntry` via `journalEntries`[]
- `PayrollBankExport` via `bankExports`[]
- `PayrollCostAllocationLine` via `costAllocationLines`[]
- `PayrollAdjustment` via `adjustments`[]
- `PayrollExchangeRateLock` via `exchangeRateLocks`[]
- `PayrollPaymentLine` via `paymentLines`[]

### Constraints and indexes

- Unique: `@@unique([id, tenantId])`, `@@unique([payrollPeriodId, runNumber])`
- Indexes: 2
<!-- /GENERATED:schema-facts -->

## Related

[[entity-pay-component|PayComponent]] · [[entity-employee|Employee]] ·
[[entity-timesheet|Timesheet]] · [[entity-attendance-day|AttendanceDay]] ·
[[payroll]] · [[rbac]] ·
[[BUG-0001-compensation-and-bank-data-behind-employee-record-read]] ·
[[data-model-overview]] · [[domain-map]]
