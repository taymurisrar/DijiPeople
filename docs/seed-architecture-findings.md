# Seed Architecture Findings

Date: 2026-06-13

## Current architecture

The monorepo uses Prisma 7 with PostgreSQL through the shared
`prisma/create-prisma-client.ts` factory. The API, Admin App, and Web App are
separate applications. Admin App authentication uses `PlatformUser`; Web App
authentication uses tenant-scoped `User` records, optionally linked one-to-one
to `Employee`.

The current seed commands are split across five files:

| File                   | Current responsibility                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `seed-admin.ts`        | Creates a customer account, tenant, organization, business unit, tenant RBAC, tenant user, and tenant ownership.                                                               |
| `seed-system.ts`       | Creates global notification events/templates, tenant RBAC, and project-role lookup data.                                                                                       |
| `seed-config.ts`       | Creates notification configuration, tenant email settings, leave types, customization metadata, and a hardcoded platform super admin.                                          |
| `seed-demo.ts`         | Adds demo organization data, users, employees, work configuration, compensation, project, attendance, leave request, timesheet, and notification data to the bootstrap tenant. |
| `seed-payroll-flow.ts` | Creates a separate, destructive payroll validation scenario and generated payroll artifacts.                                                                                   |

The root scripts use npm workspaces, despite the requested examples using
`pnpm`. Existing project convention should be preserved, so the public command
names will be added as `npm run seed:*` and remain callable through the API
workspace.

## Problems and duplication

1. `seed-admin` creates tenant/Web App data instead of the Admin App
   `PlatformUser`.
2. `seed-config` creates the platform super admin with a hardcoded email and
   password.
3. `seed-system` and `seed-config` overlap on notification foundations and
   tenant configuration.
4. RBAC is bootstrapped from `seed-system` and `seed-admin`, making command
   ordering unclear.
5. `seed-demo` depends on the tenant created by `seed-admin`, so admin identity
   and disposable demo data cannot be managed independently.
6. Demo records have no explicit ownership marker or batch record.
7. The existing `seed:all` order is system, admin, demo, payroll-flow rather
   than admin, config, demo.
8. There are no reset/reseed scripts, API endpoints, or Admin App controls.
9. The payroll validation seed is mixed into `seed:all` even though it is a
   specialized test fixture rather than general demo data.
10. Documentation still describes `seed-admin` as a tenant bootstrap.

The uncommitted change found in `seed-config.ts` is formatting-only. It must be
preserved while changing the file's responsibilities.

## Target ownership

### `seed-admin`

Own only one Admin App identity:

- Upsert one `PlatformUser`.
- Set `role = SUPER_ADMIN` and `status = ACTIVE`.
- Read name, email, and password from environment variables.
- Hash the password with bcrypt.
- Create no tenant, tenant user, employee, or transactional data.

### `seed-config`

Own production-safe system configuration:

- Global notification events and system email template placeholders.
- Tenant permission, role, role-permission, role-privilege, and miscellaneous
  permission mappings.
- Project-role lookup data.
- Tenant email templates, notification preferences/settings/templates/rules,
  and fallback console provider.
- Default leave types.
- Required customization solution, table, column, view, form, action-bar, and
  widget metadata.
- Existing tenant settings and work/attendance defaults should continue to be
  resolved from their catalogs and runtime defaults unless a persisted record
  is required. The current application does not require seed-created real
  users for this configuration.

`seed-system` should remain only as a backward-compatible alias to
`seed-config`, not as an independent source of configuration.

### `seed-demo`

Own a complete, disposable demo tenant and its seed-owned customer account:

- Demo tenant/company, organization, and business unit.
- Departments, designations, work sites, calendar, holiday, schedule, shifts,
  and schedule assignments.
- Tenant users and linked employees for executive/admin, HR, recruiter,
  manager, and employee scenarios.
- Additional employees and reporting hierarchy.
- Leave types from config, balances, requests, and approval steps/scenarios.
- Attendance records across useful dashboard dates.
- Project, project assignments, timesheet, and notification/activity data.
- Pay components and compensation required for useful reports.

The specialized payroll validation fixture remains an explicit
`seed:payroll-flow` command and is removed from `seed:all`.

## Demo table footprint

The current demo seed directly touches:

- `CustomerAccount`
- `Tenant`
- `Organization`
- `BusinessUnit`
- `Permission`
- `Role`
- `RolePermission`
- `RolePrivilege`
- `RoleMiscPermission`
- `ProjectRole`
- `User`
- `UserRole`
- `Employee`
- `Department`
- `Designation`
- `Location`
- `HolidayCalendar`
- `Holiday`
- `WorkSchedule`
- `WorkScheduleDay`
- `ShiftTemplate`
- `EmployeeScheduleAssignment`
- `LeaveType`
- `LeaveBalance`
- `LeaveRequest`
- `LeaveApprovalStep`
- `AttendanceEntry`
- `PayComponent`
- `EmployeeCompensationHistory`
- `EmployeeCompensationComponent`
- `Project`
- `ProjectAssignment`
- `Timesheet`
- `TimesheetEntry`
- `Notification`
- tenant-scoped email, notification, and customization configuration created
  when config is applied to the demo tenant

Most tenant records cascade from `Tenant`. `Tenant.customerAccountId` uses
`onDelete: Restrict`, so safe deletion order is tenant first, then the tagged
customer account.

## Recommended demo tagging and deletion

Adding demo fields to every business table would create a large, error-prone
migration and require every module to preserve those fields. The safer boundary
is root ownership:

- Add `isDemoData`, `demoBatchId`, and `seedSource` to `Tenant`.
- Add the same ownership fields to `CustomerAccount`.
- Add a `DemoSeedBatch` model with batch status, timestamps, tenant/customer
  references stored as scalar IDs, summary JSON, and error text.

Only a tenant and customer account explicitly tagged by the demo seed are
eligible for deletion. Reset runs in a transaction, deletes the tagged tenant
so tenant-owned records cascade in FK-safe order, then deletes the matching
tagged customer account. It must reject deletion if tags do not agree.

This strategy never searches by names, emails, or a broad slug pattern and
cannot delete the platform super admin or configuration for non-demo tenants.
Configuration inside the wholly demo-owned tenant is disposable with that
tenant and recreated by reseed.

## Required migration

One additive migration:

- Demo ownership fields and indexes on `Tenant`.
- Demo ownership fields and indexes on `CustomerAccount`.
- New `DemoSeedBatch` table and status enum.

No existing migration should be edited.

## Backend impact

- Prisma schema and one new migration.
- Shared demo seed service/module usable by CLI and Nest.
- `seed-admin.ts`, `seed-config.ts`, `seed-system.ts`, and `seed-demo.ts`.
- New reset CLI and reseed CLI wrappers.
- New guarded Admin API controller/service:
  - `GET /admin/demo-data/summary`
  - `DELETE /admin/demo-data`
  - `POST /admin/demo-data/reseed`
- Platform permission catalog/guard gains `platform.demoData.delete`.
- Reset is restricted to platform `SUPER_ADMIN`.
- Mutating endpoints require `ENABLE_DEMO_DATA_RESET=true`.
- Delete/reseed actions write `PlatformAuditLog`.

## Frontend impact

- New Admin App settings page at `/settings/demo-data`.
- New Admin App proxy route for summary/delete/reseed.
- Settings navigation card visible only to platform super admins.
- Client component displays per-table counts, total records, last batch, and
  reset availability.
- Delete and recreate actions require the exact confirmation phrase
  `DELETE DEMO DATA`.

The Web App does not receive destructive demo controls because the operation is
platform-level and belongs in the Admin App.

## Documentation impact

- Add a seed architecture and operations guide.
- Update root README and deployment checklist.
- Update environment examples with platform admin and demo reset variables.
- Document production safeguards and the exact reset boundary.

## Verification plan

1. Prisma validate and generate.
2. Prisma migration status.
3. API typecheck, lint, focused unit tests, and build.
4. Admin App typecheck, lint, and build.
5. Web App typecheck/build to catch shared-contract regressions.
6. Run `seed:admin` twice and verify one platform super admin.
7. Run `seed:config` twice and compare stable counts.
8. Run `seed:demo` twice and verify one tagged demo tenant with stable records.
9. Query demo summary and compare module totals.
10. Run demo reset and verify:
    - tagged demo tenant/customer account removed,
    - platform super admin remains,
    - non-demo tenant/config records remain.
11. Run demo reseed and verify a new completed batch and restored summary.
