# Authorization / RBAC

DijiPeople runs **two permission systems simultaneously**, plus a third,
separate layer for row-level access. Understanding all three is required before
changing any endpoint.

Primary sources:
`services/api/src/common/guards/permissions.guard.ts`,
`services/api/src/common/constants/permissions.ts` (2,482 lines),
`services/api/src/common/constants/rbac-matrix.ts` (1,347 lines),
`services/api/src/common/security/rbac-query-scope.ts`,
`services/api/src/common/security/elevated-tenant-roles.ts`.

---

## Layer 1 — Endpoint permission (`PermissionsGuard`)

Applied via `@UseGuards(JwtAuthGuard, PermissionsGuard)` on the controller.
**97 of 101 controllers carry it**; the four that do not are the intentionally
public ones.

Two decorator families, evaluated together:

| Decorator | Declared in | Checked against |
|---|---|---|
| `@Permissions('employees.read')` | `common/constants/permissions.ts` | `user.permissionKeys` |
| `@RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')` | `common/constants/rbac-matrix.ts` | `user.rolePrivileges` |

The guard's logic:

```
if no permissions declared at all          → allow
if user has no tenantId                    → ACCESS_DENIED
if hasElevatedTenantRole(user)             → allow  (entire check skipped)
hasAllPermissions  = every declared legacy key ∈ user.permissionKeys
hasRbacPermission  = no rbac requirement declared, OR at least one declared
                     (entityKey, privilege) resolves above SecurityAccessLevel.NONE
if !hasAllPermissions || !hasRbacPermission → ACCESS_DENIED
```

Two consequences that cause real bugs:

- **Legacy keys are ALL-of; matrix requirements are ANY-of.** Declaring several
  legacy keys means the caller needs every one of them.
- **Declaring only one of the two families is the most common authorization
  defect in this codebase.** Declare both on new endpoints, matching the
  neighbouring methods in the same controller.

### The elevated-role bypass

`hasElevatedTenantRole(user)` returns early and the entire permission check is
skipped. The role keys are listed in
`common/security/elevated-tenant-roles.ts` (`ELEVATED_TENANT_ROLE_KEYS`).
`resolveEffectiveAccessLevel()` likewise returns `TENANT` for these roles, so
they also bypass row-level scoping.

**Adding a role key to that list grants it full access to everything.** Treat
any change there as a security change requiring an ADR.

## Layer 2 — Row-level scope (in the service)

Endpoint permission answers "may you call this?". It does not answer "which
records may you see?". That is done explicitly in the service:

```ts
const where = buildScopedAccessWhere<Prisma.EmployeeWhereInput>(
  currentUser,
  ENTITY_KEYS.EMPLOYEES,
  SecurityPrivilege.READ,
  { organizationIdField: null, userIdField: 'userId' },
);
```

`common/security/rbac-query-scope.ts` provides:

- `resolveEffectiveAccessLevel(user, entityKey, privilege)` — the highest
  `SecurityAccessLevel` the user's role privileges grant for that pair
- `buildTenantWhere(tenantId, field?)`
- `buildOwnedRecordWhere(user, options)` — `ownerUserId` / `userId` /
  `createdById` / `ownerTeamId ∈ teamIds`
- `buildBusinessUnitScopeWhere(user, accessLevel, options)`
- `buildScopedAccessWhere(...)` — the composite used by services

Access levels, ordered by `SECURITY_ACCESS_LEVEL_WEIGHT` in `rbac-matrix.ts`:

```
NONE < OWN < TEAM < BUSINESS_UNIT < ORGANIZATION < TENANT
```

Field name options exist because models differ — `organizationIdField: null`
tells the builder that this model has no organization column and business-unit
filtering should be used instead.

**A read endpoint that returns records above the caller's access level is a HIGH
severity defect even when the endpoint permission is correct.**

## Layer 3 — Business-unit request context

`BusinessUnitAccessMiddleware` decodes the access token on every route, resolves
a BU access context through `OrganizationAccessService`, sets `req.buAccess`,
and stores it in `RequestContextService` (`AsyncLocalStorage`).

`PrismaService` contains a `$use` middleware that reads that context and injects
business-unit `where` clauses for a fixed model list (`Employee`,
`AttendanceEntry`, `Timesheet`, `TimesheetEntry`, `LeaveRequest`, `Application`,
`Candidate`, `JobOpening`, `EmployeeOnboarding`, `OnboardingTask`,
`PayrollCycle`, `ProcessingCycle`, `PayrollRecord`, `EmployeeCompensation`,
`Document`, …), and writes a `BUSINESS_UNIT_ACCESS_DENIED` audit row when an
id-targeted query returns nothing because of scope.

> **This middleware does not run.** `@prisma/client@7.8.0` no longer exposes
> `$use`; `PrismaService` checks `typeof this.$use === 'function'`, logs a debug
> message and skips registration. Verified:
> `PrismaClient.prototype.$use === undefined`.
>
> Do not treat it as an active defence, and do not add new logic there expecting
> it to execute. Layer 2 is what actually protects rows.

## Roles

`SystemRoleKey` / `ROLE_KEYS` in `rbac-matrix.ts`:

```
global-admin, system-admin, system-customizer, ceo, manager,
hr, recruiter, payroll-manager, employee
```

Tenants can define additional roles; role privileges are stored per role as
`(entityKey, privilege, accessLevel)` triples and surface on
`user.rolePrivileges`.

Platform users have a separate `PlatformUserRole` enum and their own
authorization path in the `super-admin` / `platform-*` modules and
`apps/admin/lib/platform-rbac.ts`.

## Entities and privileges

`ENTITY_KEYS` in `rbac-matrix.ts` enumerates the securable entities —
`employees`, `attendance`, `timesheets`, `leave-requests`, `payroll`,
`payroll-runs`, `payslips`, `claims`, `benefits`, `loans`, `compensation`,
`documents`, `projects`, `settings`, `reports`, and many more.

`SecurityPrivilege` (Prisma enum) covers the operations — `READ`, `CREATE`,
`UPDATE`, `DELETE` and others. `MiscPermissionDefinition` covers capabilities
that are not entity CRUD.

## Adding a permission — the full checklist

1. Add the key to `common/constants/permissions.ts`, and/or the
   entity/privilege to `common/constants/rbac-matrix.ts`.
2. Grant it to the intended system roles in `prisma/seed-config.ts`.
3. Assert it in `prisma/verify-seed-config.ts` so a fresh deploy fails loudly if
   it is missing.
4. Decorate the endpoint with **both** `@Permissions(...)` and
   `@RequirePermission(...)`.
5. Apply row-level scope in the service with `buildScopedAccessWhere()`.
6. Mirror into `apps/web/lib/security-keys.ts` **only if** the UI gates on it —
   that file is a hand-maintained copy with no generator.
7. Extend the matrix specs (`rbac-matrix*.spec.ts`) and, where relevant,
   `test/permission-propagation.e2e-spec.ts` and
   `common/constants/wiring-invariants.spec.ts`.

Skipping step 2 or 3 produces the confusing failure mode where the code is
correct but nobody has the permission on a fresh environment.

## Frontend gating is not enforcement

`apps/web/lib/permissions.ts`, `apps/web/lib/security-keys.ts`,
`PermissionGate`, navigation visibility and disabled controls exist for
usability. **Every gated action must be independently enforced by the API.** A
hidden button is not a security control.

`apps/web/lib/elevated-roles.ts` and `apps/admin/lib/platform-rbac.ts` mirror
server-side role logic. `apps/admin/lib/platform-rbac.spec.ts` exists precisely
because inline string comparisons (`role !== "SUPER_ADMIN"`) type-check fine
while silently excluding valid roles.

## Known risks

1. The two permission systems can drift; there is no check that every endpoint
   declares both.
2. `ELEVATED_TENANT_ROLE_KEYS` is a total bypass of layers 1 and 2.
3. The Prisma-level scoping reads as active defence-in-depth and is not.
4. `apps/web/lib/security-keys.ts` can silently diverge from the API constants.
5. Row-level scoping is applied per service; there is no global assertion that
   every list endpoint applies it.
