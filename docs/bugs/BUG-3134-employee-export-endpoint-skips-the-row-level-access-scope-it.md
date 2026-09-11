---
ID: BUG-3134
aliases: [BUG-3134]
Title: Employee export endpoint skips the row-level access scope its read sibling applies (BOLA)
Status: DUPLICATE
Severity: HIGH
Priority: P1
Type: AUTHORIZATION
Source: SECURITY_REVIEW
DetectedDate: 2026-09-10
DetectedInSha: a800d8f2
AffectedModules: [services/api/src/modules/employees]
OwnerAgent: architect
ArchitectDisposition: DUPLICATE
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-11
ResolvedAt:
---

# BUG-3134 — Employee export endpoint skips the row-level access scope its read sibling applies (BOLA)

> **Architect triage, 2026-09-11 — `DUPLICATE`.** Fixed in this session as BUG-3241 (AUTHZ-03). exportProfile now calls canViewEmployeeRecord, the same decision the sibling read makes.

## Summary

Employee export endpoint skips the row-level access scope its read sibling applies (BOLA)

Identified by the 2026-09-10 full technical audit as AUTHZ-03 / OBS-26 (confidence: AUTHZ-03=CONFIRMED, OBS-26=CONFIRMED).

## Expected Behavior

**AUTHZ-03:** `exportEmployeeProfile` should call the same `assertEmployeeAccess`/`canViewEmployeeRecord` (or `buildReadableEmployeeWhere`) check as `getProfile` before building the CSV.

**OBS-26:** Identity and contact fields gated the way compensation is, and the detail endpoint gated on `employees.read` rather than `dashboard.view`.

## Actual Behavior

**AUTHZ-03:** `GET /employees/:employeeId` correctly denies a caller whose RBAC `EMPLOYEES:READ` access level is `SELF`/`TEAM`/`BUSINESS_UNIT` and who is out of scope for the target id. `GET /employees/:employeeId/export`, gated by the same RBAC privilege (`EMPLOYEES:read`) plus the legacy key `employees.export`, performs only a tenant + id lookup and returns a CSV of the employee's profile, employment and ownership fields to any caller who holds `employees.export` at any access level.

**OBS-26:** Any user whose row-level scope reaches an employee — a team lead with `TEAM` scope, for instance — receives that employee's national identity number, date of birth, home address and emergency contact details in the *list* response, for every employee in scope, on a page they open routinely.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior. Multiple audit findings are consolidated into this record; each is independently traceable at its own citation.

## Evidence

**AUTHZ-03** (services/api/src/modules/employees/employees.controller.ts, employees.service.ts):

`employees.controller.ts:216-218` —
```
@Get(':employeeId/export')
@Permissions('employees.export')
@RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
```
calls `this.employeesService.exportEmployeeProfile(user, employeeId)`.

`employees.service.ts:1981-1985` —
```
async exportEmployeeProfile(currentUser, employeeId) {
  const employee = await this.findById(currentUser.tenantId, employeeId);
```
`employees.service.ts:425-436` —
```
async findById(tenantId, employeeId) {
  const employee = await this.employeesRepository.findByIdAndTenant(tenantId, employeeId);
```
— **no third `where` argument.** Compare the sibling read path, `employee-profiles.service.ts:104-105` (`getProfile`, backing `GET /employees/:employeeId`) —
```
async getProfile(currentUser, employeeId) {
  const employee = await this.assertEmployeeAccess(currentUser, employeeId);
```
`employee-profiles.service.ts:1807-1829` (`assertEmployeeAccess`) calls `employeeAccessService.canViewEmployeeRecord`, which (`employee-access.service.ts:94-107`) runs `employeesRepository.findByIdAndTenant(tenantId, employeeId, await this.buildReadableEmployeeWhere(user))` — the third argument is exactly the `buildScopedAccessWhere`-derived OWN/TEAM/BUSINESS_UNIT filter (`employee-access.service.ts:43-68`) that `findById` never applies.

---

**OBS-26** (services/api/src/modules/employees/):

`modules/employees/employees.service.ts:3556 private mapEmployee()` returns, without any field-level gate:
```
:3587  dateOfBirth: employee.dateOfBirth,
:3592  cnic: employee.cnic,
:3604  addressLine1: employee.addressLine1,
:3625  emergencyContactPhone: employee.emergencyContactPhone,
:3641  taxIdentifier: employee.taxIdentifier,
```
It is the shared projection for the **list** (`employees.service.ts:345, 389`) and the **detail** (`:435`).
The detail endpoint is gated on the weakest legacy key in the product — `modules/employees/employees.controller.ts:206-208`:
```ts
@Get(':employeeId')
@Permissions('dashboard.view')
@RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
```
(`GET :employeeId/compensation` at `:446-447` is likewise `@Permissions('dashboard.view')`, against `@Put :employeeId/compensation` at `:459-460` which requires `payroll.write`.)
The money half **is** correctly gated, by BUG-0001 — `modules/employees/employee-profiles.service.ts:617-641, 660-661`:
```ts
private canViewCompensation(...)
  if (accessMode === 'SELF') return true;
  if (permissions.has(PERMISSION_KEYS.COMPENSATION_READ) || ... PAYROLL_READ) ...
...
  if (!this.canViewCompensation(currentUser, accessMode)) { return null; }
```
That is the **only** field-level gate in the module. Identity and contact data has none.

---


Full finding text: AUTHZ-03 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/AUTHZ.md`; OBS-26 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/OBS.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

**AUTHZ-03:** A manager or any role holding `employees.export` at `SELF` or `TEAM` RBAC level can export the full profile CSV (name, work/personal email, phone, DOB, gender, marital status, nationality, address, emergency contact, tax identifier — the same field set returned by `getProfile`, per `employee-profiles.service.ts:134-192`, minus fields the CSV mapper omits) for **any employee id in the tenant**, not just their own reports. Concretely: role "Manager" (RBAC `EMPLOYEES:READ = TEAM`, legacy key `employees.export` granted) calls `GET /employees/<any-uuid-in-tenant>/export`; `findById` returns the record because it only checks `tenantId`; the manager receives a CSV containing an out-of-team employee's PII.

**OBS-26:** Bulk PII exposure to low-privilege staff with no audit trail (OBS-12), and a CNIC is a reusable identity credential in the product's primary market.

## Affected Areas

services/api/src/modules/employees

## Proposed Resolution

**AUTHZ-03:** In `employees.service.ts:exportEmployeeProfile`, replace the `findById` call with the same access-checked path `getProfile` uses (either call `employeeAccessService.canViewEmployeeRecord` first and throw `ForbiddenException` on failure, or route the lookup through `buildReadableEmployeeWhere`). (Difficulty: LOW; Regression risk: LOW (narrows an already-too-wide read path; no legitimate caller should have been relying on tenant-wide export); Fix now: YES)

**OBS-26:** Extend the `canViewCompensation` pattern to a `canViewIdentityFields` gate applied inside `mapEmployee`, defaulting to `SELF` plus an explicit `employees.pii.read` permission; change `employees.controller.ts:207` and `:446` to `@Permissions('employees.read')`. (Difficulty: MEDIUM; Regression risk: MEDIUM (screens will lose fields); Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for services/api/src/modules/employees/employees.controller.ts, employees.service.ts (audit id AUTHZ-03).
- The behaviour described in Expected Behavior holds for services/api/src/modules/employees/ (audit id OBS-26).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: AUTHZ-03=LOW (narrows an already-too-wide read path; no legitimate caller should have been relying on tenant-wide export), OBS-26=MEDIUM (screens will lose fields). Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `AUTHZ-03` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/AUTHZ.md`
- Audit finding `OBS-26` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/OBS.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (AUTHZ-03, OBS-26) at `a800d8f2`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[employees]]

<!-- GRAPH:END -->
