# Regression Register

Every material defect that has been fixed, and the test that stops it returning.

**QA reads the entries for the modules under test before designing scenarios.**
**Architect reads them during planning.** That is what makes this register more
than a changelog.

This is an evergreen document — update entries in place. Historical execution
detail lives in `docs/qa/runs/`.

---

## How to add an entry

When a material defect is fixed:

1. Give it the next `REG-nnn` id.
2. Record the bug class from [`../known-bug-patterns/`](../known-bug-patterns/).
3. Name the regression test file **and prove it fails without the fix**.
4. State the scenario in one line a future QA agent can re-run.
5. Keep `Active` accurate — a deleted or skipped test means `Active: no`, and
   that is a signal, not an embarrassment.

Do not add a typo. Add engineering lessons that could plausibly recur.

---

## Entries

### REG-001 — Compensation and bank data behind employee-record read

| | |
|---|---|
| **Bug class** | `sensitive-field-overexposure` |
| **Module** | `services/api/src/modules/employees` |
| **Root cause** | `getCurrentCompensation` gated only on `assertEmployeeAccess` (employee-record READ) and returned the whole `EmployeeCompensation` row with no `select`. `getProfile` embeds the same value, so `GET /employees/:id` leaked it too. Reporting managers clear that check for their whole subtree without any payroll permission. |
| **Regression test** | `services/api/src/modules/employees/employee-compensation-access.spec.ts` |
| **Scenario** | A reporting manager with `employees.read` but no compensation/payroll permission requests a report's compensation → receives `null`, and `basicSalary` / `bankAccountNumber` / `bankIban` / `bankRoutingNumber` / `taxIdentifier` appear nowhere in the response. |
| **Fixed** | 2026-08-14, branch `agent/authz-batch0-compensation` |
| **Active** | yes |

### REG-002 — Self-approval of attendance corrections

| | |
|---|---|
| **Bug class** | `self-approval` |
| **Module** | `services/api/src/modules/attendance` |
| **Root cause** | `assertCanActionCorrection` never compared the actor to the request's parties, and `canActionAttendanceCorrection` passes on a bare `attendance.correction.approve` — which the seeded `manager` bundle grants. A manager could file a correction rewriting their own attendance and approve it. |
| **Regression test** | `services/api/src/modules/attendance/attendance.correction-authorization.spec.ts` |
| **Scenario** | A manager holding approve/reject files a correction for themselves → approve and reject both 403. Also blocked when they filed it on someone else's behalf, and when they are the subject but someone else filed it. A manager acting on a subordinate's correction still succeeds. |
| **Fixed** | 2026-08-14, branch `agent/authz-batch0-attendance` |
| **Active** | yes |

### REG-003 — `readTeam` granted tenant-wide visibility

| | |
|---|---|
| **Bug class** | `fail-open-scope` |
| **Module** | `services/api/src/modules/attendance`, `services/api/src/modules/approvals` |
| **Root cause** | `attendance.correction.readTeam` and `approvals.readTeam` were both bundled into a branch returning `{}` — an unrestricted `where` — making each a synonym for its `manage` permission. Two independent occurrences of the same misreading. |
| **Regression test** | `attendance.correction-authorization.spec.ts`, `approvals.scope.spec.ts` |
| **Scenario** | A user holding only `*.readTeam` lists records → the query carries a scope predicate limited to own + direct reports, never `{}`. `manage` still yields tenant-wide. |
| **Fixed** | 2026-08-14, branches `agent/authz-batch0-attendance`, `agent/authz-batch0-readteam` |
| **Active** | yes |

### REG-004 — Search filter overwrote the access scope

| | |
|---|---|
| **Bug class** | `search-filter-scope-overwrite` |
| **Module** | `services/api/src/modules/approvals` |
| **Root cause** | `buildWhere` spread the access scope and the search filter into one object literal; both render as `OR`, so the later key won. Any caller supplying `?search=` lost their scope restriction and the query fell back to `tenantId` alone. |
| **Regression test** | `services/api/src/modules/approvals/approvals.scope.spec.ts` |
| **Scenario** | A plain `approvals.read` user lists with `?search=` → the emitted `where` still contains the own/assigned scope predicate alongside the search clause. |
| **Fixed** | 2026-08-14, branch `agent/authz-batch0-readteam` |
| **Active** | yes |

### REG-005 — Cross-tenant error-log read via support role

| | |
|---|---|
| **Bug class** | `tenant-filter-missing` |
| **Module** | `services/api/src/modules/error-logs` |
| **Root cause** | `findForUser` returned the log on support role alone with no `log.tenantId === user.tenantId` comparison, while the owner branch directly beneath it did compare. A tenant `system-admin` with a foreign traceId read another tenant's log. |
| **Regression test** | `services/api/src/modules/error-logs/error-logs.service.spec.ts` |
| **Scenario** | A support-role user in tenant A requests a traceId belonging to tenant B → `null`, and the response is indistinguishable from a traceId that does not exist. |
| **Fixed** | 2026-08-14, branch `agent/authz-batch0-errorlogs` |
| **Active** | yes |

### REG-006 — Organization and business-unit structure mutable by any authenticated user

| | |
|---|---|
| **Bug class** | `authorization-missing` |
| **Module** | `services/api/src/modules/organization` |
| **Root cause** | `OrganizationsController` and `BusinessUnitsController` carried `JwtAuthGuard` alone and none of the six mutating service methods performed authorization. Because business-unit membership feeds `accessContext.accessibleBusinessUnitIds` and therefore `buildScopedAccessWhere()`, this was privilege escalation, not just unauthorized writes. |
| **Regression test** | `services/api/src/modules/organization/organization-structure-authorization.spec.ts`, `organization-structure-tenant-scope.spec.ts` |
| **Scenario** | An ordinary employee attempts create/update/delete on an organization or business unit → 403 on all six routes. HR holding `organization.manage` still succeeds. A newly added mutating route with no `@Permissions` declaration fails the coverage test. |
| **Fixed** | 2026-08-14, branch `agent/authz-org-bu` |
| **Active** | yes |

### REG-007 — Unguarded duplicate of a permission-gated route

| | |
|---|---|
| **Bug class** | `duplicate-route-bypass` |
| **Module** | `services/api/src/modules/tenant-settings` |
| **Root cause** | `GET /tenant-settings/features/availability` declared no permission and called the same service method as the `settings.read`-gated `GET /tenant-settings/features`. `PermissionsGuard` returns true when neither family is declared, so it was an open alias. The payload also carried `subscription.finalPrice`. |
| **Regression test** | `services/api/src/modules/tenant-settings/feature-availability-authorization.spec.ts` |
| **Scenario** | An authenticated user without `tenant-settings.resolved.read` → 403; the four ordinary roles still succeed; the response contains no `subscription` block; the two routes remain on deliberately different keys. |
| **Fixed** | 2026-08-14, branch `agent/authz-feature-availability` |
| **Active** | yes |
