# Tenant Settings and Attendance Runtime

This document is an implementation companion to
[`settings-and-branding.md`](./settings-and-branding.md). The latter is the
canonical architecture contract whenever terminology or resolution order
differs.

## Settings information architecture

Tenant Settings uses the shared `SettingsShell`, settings navigation catalog,
shared form controls, and shared configuration manager. People Configuration
exposes Work Sites, Shifts, Work Schedules, and Attendance Rules as separate
destinations. Authorization is enforced by the API `settings.read` and
`settings.update` permissions; navigation visibility is permission-aware.

The Settings Runtime registry places those destinations under People
Configuration groups and redirects concise paths to canonical group routes.
The shell renders category -> group -> item navigation and derives breadcrumb
context from the same registry. Work Sites, schedules, holidays, Shifts, and
Attendance Rules use dedicated adapters and the shared list/record or
record-style tenant-settings renderer. No parallel records are introduced.

## Settings-backed records

- `Location` is the canonical Work Site record. It includes address, timezone,
  optional latitude/longitude, an optional allowed radius, and active state.
- `ShiftTemplate` owns start/end time, break minutes, expected hours, late and
  early-exit grace periods, timezone, night-shift state, and active state.
- `WorkSchedule` owns the weekly pattern and default/fallback behavior.
  `WorkScheduleDay.shiftTemplateId` assigns a shift to a working day.
- `EmployeeScheduleAssignment` is effective-dated and tenant-scoped. Creating
  an overlapping active assignment deactivates the previous assignment in the
  same transaction.
- `AttendancePolicy` stores operational switches that must survive independently
  of catalog defaults. Allowed modes remain in resolved tenant settings.

## Attendance resolution

Attendance resolves the tenant business date using the resolved tenant
timezone. It resolves, in order, an effective Employee override, Employee
default, Department default, Primary Work Site default, and tenant default
schedule. The weekday mapping must reference an active Shift or explicitly
represent an Off Day. Work Calendar and Holiday state are resolved after the
schedule and before policy validation.

Office mode requires an active tenant Work Site. Remote and Hybrid modes require
browser coordinates when the resolved policy enables location capture.
Attendance records persist the resolved schedule, shift, mode, Work Site, and
captured location fields. Late and early-exit calculations use shift times and
shift grace values before tenant policy fallbacks.

## Owner persistence

Runtime owner metadata is canonicalized as `ownerId`; the Employee adapter is
the only layer that translates it to `ownerUserId`. Assign and Status Group
updates both persist the Employee owner column, return owner display fields,
refresh the record, and write an audit entry. Owner options are authorized,
tenant-scoped, active-only, role-filtered, searchable, and paginated.

## Lookup performance

Employee read mode does not load edit-only lookup catalogs or the manager list.
Edit/create lookup catalogs use an eight-second request timeout, a five-minute
client cache, and in-flight request deduplication. Owner options are loaded by
the generic owner provider only when the owner interaction is available.

## Demo seed

`seed-demo.ts` idempotently creates linked CEO, HR, Recruiter, Employee, and
Manager users. The Manager is assigned the manager and employee roles and is
the Employee's reporting manager. The seed also creates two Work Sites, two
shifts, one default schedule, schedule-day shift mappings, and one employee
schedule assignment.

## Prisma 7

The datasource URL lives in `prisma.config.ts`. Prisma Client uses the
PostgreSQL driver adapter in the Nest service and every seed entry point.
Migration, generate, validate, Studio, and seed scripts all point to the same
config file. The schema uses the Rust-free client engine.
