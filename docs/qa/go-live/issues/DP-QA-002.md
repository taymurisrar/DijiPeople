# DP-QA-002 — Non-admin roles get 403 on self-context: "Employee profile not linked" and "We could not load your dashboard"

| Field | Value |
|---|---|
| Category | Functional / Security (RBAC) |
| Severity / Priority | High / **P1 — CONFIRMED application defect (not a fixture artefact), see Verdict** |
| Status | Open |
| Module / routes | Overview `/`, `/my-profile`, `GET /api/employees/me/context` |
| Roles | `employee`, `manager`, `hr`, `payroll-manager` (all non-elevated roles tried). `system-admin` works. |
| Tests | `DPQA-SMK-*` as non-admin (to add: `DPQA-RBAC-001..`), probe `probe-api.mjs <ROLE> /employees/me/context` |
| Env | local, Chromium, tenant `qa-starter`, commit `214433c1`, 2026-10-30 |
| Evidence | ![employee profile](../evidence/DP-QA-002-employee-profile-not-linked.png) ![payroll dashboard](../evidence/DP-QA-002-payroll-dashboard-unavailable.png) |

## Steps
1. Sign in as `employee@…` (linked to employee `DP-ESS`; the Employees list shows that record).
2. Open the profile menu → *My Profile* (or `/my-profile`).
3. Sign in as `payroll@…` and open Overview.

## Expected
Employee sees their own profile; every signed-in user sees an Overview.

## Actual
- `GET /api/employees/me/context` → **403 ACCESS_DENIED** for employee, manager, hr (and payroll). 200 for admin.
- `getCurrentEmployee()` (`apps/web/app/(authenticated)/_lib/current-employee.ts`) converts that 403 into
  `employee: null`, so My Profile says **"Employee profile not linked. An administrator must link this account to an
  Employee record."** — which is false and sends the user to an admin who cannot fix it.
- Payroll role's Overview shows **"We could not load your dashboard — You do not have permission to perform this action."**

## Analysis
- **CONFIRMED:** the 403, the misleading message, and that the DB link exists (`Employee.userId` set for all seven seeded users).
- **CONFIRMED:** the endpoint requires legacy key `dashboard.view`; in the QA database **no role** holds a `dashboard.view`
  `RolePermission` row (hr/manager/employee/payroll all 0), although `BASE_ROLE_PERMISSION_KEYS.hr` lists it.
  The legacy key is bridged from matrix entity `user-preferences` READ (`rbac-matrix.ts` ~L1763) and no
  `SYSTEM_ROLE_PRIVILEGES` entry appears to grant `user-preferences`.
- **SUSPECTED / must verify before the P1 stands:** whether this is (a) a real gap in the system-role matrix that also
  affects production tenants, or (b) an artefact of `seed-demo` role setup. Verification path: provision a tenant
  through the real super-admin provisioning flow (not `seed-demo`) and repeat the probe. Until then the severity is
  provisional; the *misleading message* defect (converting every 403 to "not linked") stands independently as P2.
- **Recommended:** (1) grant `user-preferences` READ to all system roles (or stop gating self-context on it);
  (2) only map a 404/empty result to "not linked", never a 403.

## Verdict (2026-10-30, RUN-002) — application defect, not seed-demo

Reproduced on **two tenants created through the real platform workflow** (super-admin customer → onboarding → create-tenant,
Starter plan, owner activated via the activation API; tenants `qa-prov-a`, `qa-prov-b`), with employees and users created through the
tenants own admin API and roles assigned with `POST /users/:id/roles`:

| Tenant | Role | GET /employees/me/context | GET /dashboard/summary |
|---|---|---|---|
| qa-prov-a | owner (admin tier) | 200 | 200 |
| qa-prov-a | employee / manager / hr / payroll-manager | **403 ×4** | **403 ×4** |

Same result on seed-demo (`qa-starter`). **CONFIRMED** also: in all three tenants no role holds a `dashboard.view` RolePermission row
(role → count of dashboard.view links: all 0), including the provisioned ones, so the cause is in the system-role definitions that
provisioning applies (`SYSTEM_ROLE_PRIVILEGES` / bridge to `user-preferences` READ), not in seed-demo.
Authorization was **not** weakened to confirm this; the endpoints are correctly refusing a role that was never granted the permission.
Tests: `DPQA-RBAC-1-EMPLOYEE|MANAGER|HR|PAYROLL` (fail, mapped here).

## Regression impact
Self-service (leave, attendance, profile) entry points for every non-admin Starter user. Highest-impact
role-based finding so far; blocks the OWN/TEAM-scope test plan until resolved or fixture-corrected.

## Retest history
| Run | Result |
|---|---|
| RUN-001 | FAIL (reproduced, 4 roles, seed-demo) |
| RUN-002 | FAIL (reproduced, 4 roles, real-provisioned tenant) — verdict: application defect |
