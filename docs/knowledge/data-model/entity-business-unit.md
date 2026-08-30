---
aliases: [BusinessUnit]
type: entity
model: BusinessUnit
last_verified: 2026-08-30
---

# BusinessUnit

## Purpose

The **unit of row-level access**, and the reason `RoleAccessLevel` has the shape
it does. `BusinessUnit` is how a tenant's data is partitioned below the tenant
boundary: who can see whose records, once everyone is already inside the same
workspace.

It is also an organisational structure — a self-referencing tree under
`Organization` — but the access role is the one that makes it load-bearing.
**56 relation ends**, fifth in the schema.

## Why it is required on `User` and optional on `Employee`

[[entity-user|User]]`.businessUnitId` is **not null**. [[entity-employee|Employee]]`.businessUnitId` **is** nullable.

That asymmetry is deliberate. Access scoping is resolved from the signed-in
`User`, so every account must sit somewhere in the tree or it could not be
scoped at all. An `Employee` is a record *about* a person and may be filed before
its placement is known — a draft profile, an import mid-flight.

Code that resolves scope must read it from the `User`. Reading it from the
`Employee` finds a null on exactly the records least likely to be complete.

## The access ladder

`Role.accessLevel` (`RoleAccessLevel`) is defined relative to this model:

```
USER  <  BUSINESS_UNIT  <  PARENT_BU  <  ORGANIZATION  <  TENANT
```

`PARENT_BU` is the one worth pausing on: it grants the unit **and its subtree**,
resolved through `parentBusinessUnitId`. A deep tree therefore makes a
`PARENT_BU` role much broader than it looks on a permissions screen, in exactly
the way a reporting-manager grant on [[entity-employee|Employee]] does.

Scope is applied by `buildScopedAccessWhere()` and
`resolveEffectiveAccessLevel()` in `common/security/rbac-query-scope.ts`. It is a
**separate step from permission checking** — holding `employees.read` does not
decide which employees. See [[rbac]].

## The middleware that does not run

`PrismaService` registers a `$use` middleware that scopes by business unit — not
by tenant. On `@prisma/client@7.8.0` `$use` is unavailable, so it is inert.

**Never treat it as a safety net for business-unit scoping either.** The same
caution [[tenant-isolation]] gives for tenant filtering applies here: the query
you write is the only thing enforcing the boundary.

## Type is broader than the name suggests

`BusinessUnitType` is `INTERNAL`, `EXTERNAL_ORGANIZATION`, `BRANCH`,
`DEPARTMENT`, `COST_CENTER`. So a `BusinessUnit` row may model something a
separate `Department` model also models — the tree is general-purpose, and
`type` is what says which sense is meant.

`status` and `subStatus` are unconstrained `String`s alongside a typed
`isActive` boolean, the same tri-state shape [[entity-employee|Employee]] has and
the same caution applies: nothing in the database restricts their values.

## Tenant-safe identity

`@@unique([id, tenantId])`, like [[entity-employee|Employee]], so other models
can reference a unit with a composite key that cannot cross tenants.
`@@unique([tenantId, code])` and `@@unique([tenantId, organizationId, name])` are
both tenant-composite.

## Security

Widening who can read or move a `BusinessUnit` is an **authorization change**,
not an org-chart change: reshaping the tree changes what every `PARENT_BU` role
in the tenant can reach. [[BUG-0058]] is this failure — organization structure
reads resolved targets by a bare tenant-keyed lookup, so being *in* the tenant
was treated as authority to reshape it.

<!-- GENERATED:schema-facts -->

> Generated from `services/api/prisma/schema.prisma` by `scripts/generate-data-model.mjs`. Do not hand-edit this region.

### Ownership and access

| Property | Value |
|---|---|
| Tenant-scoped | **yes** — carries `tenantId` |
| Primary key | `id` |
| Prisma accessor | `prisma.businessUnit` |
| Owning module | `services/api/src/modules/organization` |
| Domain | People |
| Also touched by | `users`, `tenant-control-plane` (reads), `tenant-settings` (reads), `approvals` (reads), `dashboard` (reads), `leave` (reads), `notifications` (reads), `payroll` (reads), and 10 more |

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `code` | `String` | no | — |
| `name` | `String` | yes | — |
| `organizationId` | `String` | yes | — |
| `parentBusinessUnitId` | `String` | no | — |
| `type` | `BusinessUnitType` (enum) | yes | default `INTERNAL` |
| `headEmployeeId` | `String` | no | — |
| `ownerUserId` | `String` | no | — |
| `status` | `String` | yes | default `"ACTIVE"` |
| `subStatus` | `String` | yes | default `"OPERATIONAL"` |
| `description` | `String` | no | — |
| `isActive` | `Boolean` | yes | default `true` |
| `settingsJson` | `Json` | no | — |
| `payrollContactName` | `String` | no | — |
| `payrollContactEmail` | `String` | no | — |
| `payrollContactPhone` | `String` | no | — |
| `approvalContactName` | `String` | no | — |
| `approvalContactEmail` | `String` | no | — |

### States

- `type` — `BusinessUnitType`: `INTERNAL`, `EXTERNAL_ORGANIZATION`, `BRANCH`, `DEPARTMENT`, `COST_CENTER`

### Relationships

**Belongs to** — this model holds the foreign key

- `Organization` via `organization` — `onDelete: Restrict`
- [[entity-business-unit|BusinessUnit]] via `parentBusinessUnit` (optional) — `onDelete: Restrict`
- [[entity-employee|Employee]] via `headEmployee` (optional) — `onDelete: SetNull`
- [[entity-user|User]] via `ownerUser` (optional) — `onDelete: SetNull`
- [[entity-user|User]] via `createdBy` (optional) — `onDelete: SetNull`
- [[entity-user|User]] via `updatedBy` (optional) — `onDelete: SetNull`
- [[entity-tenant|Tenant]] — the isolation owner

**Owns** — the foreign key lives on the other side

- [[entity-business-unit|BusinessUnit]] via `childBusinessUnits`[]
- `Department` via `departments`[]
- [[entity-user|User]] via `users`[]
- [[entity-employee|Employee]] via `employees`[]
- `Project` via `projects`[]
- `Team` via `teams`[]
- [[entity-timesheet|Timesheet]] via `timesheets`[]
- `PayrollCycle` via `payrollCycles`[]
- `PayrollCalendar` via `payrollCalendars`[]
- `HolidayCalendar` via `holidayCalendars`[]
- `HolidayCalendarAssignment` via `holidayCalendarAssignments`[]
- `WorkSchedule` via `workSchedules`[]
- `PayrollRegion` via `payrollRegions`[]
- `TimePayrollPolicy` via `timePayrollPolicies`[]
- `OvertimePolicy` via `overtimePolicies`[]
- `ProcessingCycle` via `processingCycles`[]
- `ApprovalMatrix` via `approvalMatrices`[]
- `BenefitPolicy` via `benefitPolicies`[]
- `SalaryPackageRule` via `salaryPackageRules`[]
- `Location` via `locations`[]
- `AttendanceDeviceScope` via `attendanceDeviceScopes`[]

### Constraints and indexes

- Unique: `@@unique([id, tenantId])`, `@@unique([tenantId, code])`, `@@unique([tenantId, organizationId, name])`
- Indexes: 9
<!-- /GENERATED:schema-facts -->

## Related

[[entity-user|User]] · [[entity-employee|Employee]] · [[entity-role|Role]] ·
[[entity-tenant|Tenant]] · [[organization]] · [[rbac]] · [[tenant-isolation]] ·
[[BUG-0058]] · [[data-model-overview]] · [[domain-map]]
