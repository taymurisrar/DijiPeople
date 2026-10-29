# Starter Plan — verified scope

> Derived from code, not from the brief. Source of truth:
> `services/api/src/modules/super-admin/plans.catalog.ts` (plan → feature keys),
> `services/api/src/modules/tenant-settings/tenant-settings.catalog.ts` (the 16 feature keys),
> `services/api/src/common/security/tenant-entitlement.*` (enforcement).
> Verified against `origin/develop` 214433c1 on 2026-10-30. Part of [[README]].

## Features the Starter plan sells (7 of 16)

`employees` · `organization` · `leave` · `attendance` · `documents` · `notifications` · `branding`

Confirmed at runtime: `GET /api/tenant-settings/features` on the QA tenant returns exactly these seven enabled
(test `DPQA-ENT-030`).

## Discrepancy with the QA brief

The brief lists **Leads, Customers, Projects, Timesheets** as Starter modules. They are not.

| Brief says | Reality | Evidence |
|---|---|---|
| Leads, Customers | Not tenant-web modules at all. `leads`/`partners`/`contracts` are platform/commercial (admin app) modules. | no route in `apps/web` sidebar; see [[DECISIONS-AND-OBSERVATIONS]] DEC-002 |
| Projects | Growth+ (`projects`) | `plans.catalog.ts` growth list; `/projects` → 403 under ENFORCE |
| Timesheets | Growth+ (`timesheets`) | same |
| Dashboard | Not a feature key; always present ("Overview") | `/` |

These are therefore tested **only as exclusions** (suite `DPQA-ENT`), as the brief allows.

## Web navigation visible to a Starter tenant admin (ENFORCE mode)

Overview · Employees · Leave · Attendance · Approvals · Reports & Analytics · Claims · Settings

Observations: **Claims** has no feature key in the catalog, so it is un-gated and shows on every plan;
**Approvals** and **Reports** likewise. Whether that is intended is open — [[DECISIONS-AND-OBSERVATIONS]] OBS-003.

## Enforcement model

`entitlementEnforcement` in `PlatformSetting key=module-settings` is `OFF | REPORT_ONLY | ENFORCE`.
**Default is `REPORT_ONLY`** — a fresh `seed:config` leaves it unset, so non-entitled modules are *reachable*
and only logged. The QA database is set to `ENFORCE`. Which mode production runs is **not verifiable from here**
and is a go-live decision — [[DECISIONS-AND-OBSERVATIONS]] OBS-001.

## Roles seeded for QA (tenant `qa-starter`)

| Role key | QA login var | Used for |
|---|---|---|
| `system-admin` (+ `global-admin`) | `QA_ADMIN_EMAIL` | tenant admin journeys, all CRUD |
| `hr` | `QA_HR_EMAIL` | HR operations, approvals |
| `manager` (+ `employee`) | `QA_MANAGER_EMAIL` | team-scope, approvals |
| `employee` | `QA_EMPLOYEE_EMAIL` | OWN-scope boundary checks |
| `payroll-manager`, `recruiter` | `QA_PAYROLL_EMAIL`, `QA_RECRUITER_EMAIL` | exclusion checks only |

## Modules in scope and their routes

| Module | Routes | Suite |
|---|---|---|
| Overview | `/` | SMK |
| Employees | `/employees`, `/employees/new`, `/employees/import`, `/employees/[id]` | SMK, EMP |
| Leave | `/leaves` | SMK, LV |
| Attendance | `/attendance` | SMK, ATT |
| Documents | employee Documents tab; `/documents` API | DOC |
| Approvals | `/approvals` | SMK |
| Reports | `/reports` | SMK |
| Claims | `/claims` | SMK |
| Settings (general, branding, security & access, customization, audit) | `/settings/**` | SMK, SET |
| Auth | `/login`, logout, password flows | AUTH |
