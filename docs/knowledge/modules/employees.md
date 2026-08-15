# Employees

> Generated from repository evidence at `ad8f77f`.

## Purpose

The people record at the centre of the tenant product. Nearly every other
module — attendance, payroll, leave, approvals, timesheets — hangs off it.

## Main entities

`Employee` (one of the few models carrying `isDeleted`), `EmployeeCompensation`,
plus the employment-type and employee-level lookups in their own modules.

## Main API / services

`services/api/src/modules/employees/`. `EmployeesService.findByTenant()` reads
`currentUser.tenantId` and forwards it to the repository — the canonical shape
for tenant-scoped reads in this codebase.

`getProfile` **embeds** the current compensation, which is why an authorization
mistake on compensation leaked through `GET /employees/:id` as well.

## Authorization

Three layers apply in full — see [[rbac]]. `assertEmployeeAccess` is the
employee-record READ check, and **a reporting manager clears it for their entire
subtree**. That is the fact that made
[[BUG-0001-compensation-and-bank-data-behind-employee-record-read]] wide rather
than narrow.

## Tenant isolation

Convention-only, like everything else — see [[multi-tenancy]].

## Important business rules

**Authorization must match the sensitivity of the data returned, not the entity
it hangs off.** `basicSalary`, `bankAccountNumber`, `bankIban`,
`bankRoutingNumber` and `taxIdentifier` require a compensation or payroll
permission, and are returned through an explicit `select`.

`isDeleted` exists here and **not** on most models. Do not generalise from it.

## Known bugs

[[BUG-0001-compensation-and-bank-data-behind-employee-record-read]] — VERIFIED.

## Regressions

REG-001 — `employee-compensation-access.spec.ts`, proven to fail without the fix.

## Related

[[rbac]] · [[multi-tenancy]] · [[organization]] · [[attendance]] · [[payroll]] ·
pattern [[sensitive-field-overexposure]]
