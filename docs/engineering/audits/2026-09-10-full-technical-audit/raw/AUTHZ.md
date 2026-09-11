# AUTHZ — Authorization, RBAC and Privilege Escalation

Scope: `services/api` — 111 controllers, 1,226 mapped route handlers (of ~1,273
route decorators found; the remainder are edge cases in the parser, not in the
code). Method: static read of `common/guards/permissions.guard.ts`,
`common/security/permission-evaluation.ts`, `common/security/rbac-query-scope.ts`,
`common/security/elevated-tenant-roles.ts`, then a scripted enumeration of every
`@Get/@Post/@Put/@Patch/@Delete` handler in every `*.controller.ts` against its
`@Public()`, `@Permissions`/`@RequirePermissions` (legacy) and
`@RequirePermission`/`@RequireAnyPermission` (RBAC matrix) decorators, followed
by manual trace of the highest-value controllers (roles, users, employees,
payslips, approvals, leave, platform-*, data, contracts) into their services.

## 1. Mechanism — exact evaluation, fail-open vs fail-closed

`PermissionsGuard.canActivate` (`services/api/src/common/guards/permissions.guard.ts:20-68`):

```
20    const requiredPermissions = ... REQUIRED_PERMISSIONS_KEY ... ?? [];
26    const requiredRbacPermissions = ... REQUIRED_RBAC_PERMISSIONS_KEY ... ?? [];
32    if (requiredPermissions.length === 0 && requiredRbacPermissions.length === 0) {
36      return true;
37    }
```

**If a handler (and its controller) declares neither `@Permissions`/`@RequirePermissions`
nor `@RequirePermission`/`@RequireAnyPermission`, the guard returns `true`
immediately — fail-open for authorization.** `JwtAuthGuard` still runs first
(when the controller applies it), so this is "any authenticated user of any
role", not "anyone on the internet". Whether that is safe depends entirely on
what the handler does next.

The decision itself is centralised in `satisfiesPermissionRequirement`
(`common/security/permission-evaluation.ts:32-61`):

```
39  if (requirement.legacyKeys.length === 0 && requirement.rbac.length === 0) return true;
43  if (!user) return false;
47  if (hasElevatedTenantRole(user)) return true;   // total bypass, see AUTHZ-05
50  const hasAllLegacyKeys = requirement.legacyKeys.every((key) => held.has(key));
52  const hasRbacPrivilege = requirement.rbac.length === 0 || requirement.rbac.some(
      (required) => highestAccessLevel(user.rolePrivileges, required) !== SecurityAccessLevel.NONE);
60  return hasAllLegacyKeys && hasRbacPrivilege;
```

Decorator-alias note (per the briefing): `@RequirePermissions` (plural) is not
an alias of `@RequirePermission` (singular). `common/decorators/permissions.decorator.ts:1-8`
re-exports `RequirePermissions as Permissions` and `RequirePermissions` itself
— both are the **legacy** key setter (`REQUIRED_PERMISSIONS_KEY`). The RBAC
matrix setter is only `RequirePermission`/`RequireAnyPermission`
(`REQUIRED_RBAC_PERMISSIONS_KEY`). In 948 handlers found, the two are always
used together (`@Permissions('x.y')` + `@RequirePermission(ENTITY_KEYS.X, 'y')`);
**zero handlers in this codebase declare only one of the two** (see §2).
Consequently:

- Both declared → both must pass (AND on legacy keys, at-least-one on RBAC
  privilege ≠ `NONE`). Fail-closed.
- Only legacy declared → `requirement.rbac.length === 0` makes `hasRbacPrivilege`
  vacuously `true`; only the legacy keys gate. Fail-closed on what's declared.
- Only RBAC declared → `legacyKeys.every(...)` on an empty array is vacuously
  `true`; only the RBAC privilege gates. Fail-closed on what's declared.
- Neither declared → the guard never reaches this function; **fail-open**, see
  above.

`hasElevatedTenantRole` (`common/security/elevated-tenant-roles.ts:4-7,42-48`):

```
4   export const ELEVATED_TENANT_ROLE_KEYS = new Set<string>([ROLE_KEYS.GLOBAL_ADMIN, ROLE_KEYS.SYSTEM_ADMIN]);
42  export function hasElevatedTenantRole(user) {
45    return (user?.roleKeys ?? []).some((roleKey) => ELEVATED_TENANT_ROLE_KEYS.has(roleKey));
```

Holding `GLOBAL_ADMIN` or `SYSTEM_ADMIN` short-circuits `satisfiesPermissionRequirement`
**and** `resolveEffectiveAccessLevel`/`canAccessRecord`/`buildScopedAccessWhere`
in `common/security/rbac-query-scope.ts:26-34,190-196` to unconditional
tenant-wide access — permission check and row-level scope both collapse to
"is this role key present". AGENTS.md documents this as deliberate
(`# Repository AGENTS.md`, Security table: "Nothing added to the elevated-role
list without an explicit decision"). See AUTHZ-05 for why this matters given
AUTHZ-01.

## 2. Route enumeration

Scripted scan (Node, read-only, output discarded after use — not committed)
over all 111 `*.controller.ts` files, matching each HTTP-method decorator to
the decorator block immediately following it (this codebase places
`@Permissions`/`@RequirePermission` **after** `@Get`/`@Post`/etc., not before —
worth flagging because a naive backward-scan mis-parses every route in the
repository and reports 97% "unprotected", which is a parsing artifact, not a
finding):

- **1,226 mapped handlers.**
- **39 `@Public()` handlers across 14 controllers** (baseline in AGENTS.md is
  "33 across 13" — re-derived count on `f55cf4b2` is 39/14; AGENTS.md itself
  says to re-derive rather than trust the number, so this is not itself a
  finding, just the corrected count. Full list below, §2.1).
- **948 handlers carry both `@Permissions` and `@RequirePermission`.**
- **0 handlers carry only one of the two** — the two-system design is applied
  uniformly wherever it is applied at all.
- **239 non-public handlers carry neither decorator.** All 239 fall inside 23
  controllers, almost entirely the platform/commercial modules
  (`super-admin` 90, `contracts` 41, `tenant-control-plane` 35,
  `platform-users` 11, `admin-leads` 7, `gateway-runtime` 6,
  `platform-monitoring` 6, `data` 5, `admin-legal` 5, `partner-experience` 4,
  `partners` 4, `platform-events` 4, `gateway-service` 3, `demo-data` 3,
  `error-logs` 3, `app.controller` 2, `metadata` 2, `support-cases` 2,
  `workspaces` 2, `customization-runtime` 1, `organization-access` 1,
  `organization-hierarchy` 1, `platform-runtime` 1). §2.2 traces every one of
  these controllers into its service layer.

### 2.1 `@Public()` handlers — full list and judgement

| Controller | Routes | Judgement |
|---|---|---|
| `auth/auth.controller.ts` | signup, discover-workspaces, login, refresh, invitation-status, activate-account, forgot-password, reset-password, `me`, logout (10) | Expected — pre-session flows. All mutating ones sit behind `PublicRateLimitGuard`. `me` (line 154) is public by necessity (must answer a signed-out visitor) but **was** a session-revocation bypass — see below, verified fixed. |
| `auth/admin-auth.controller.ts` | login, forgot-password, reset-password (3) | Same pattern, platform-admin login. `PublicRateLimitGuard` present. |
| `agent/agent.controller.ts` | auth/login, auth/refresh, auth/logout (3) | Desktop-agent's own auth client, rate-limited. |
| `billing/controllers/public-billing.controller.ts` | plans, commercial-config, subscribe, onboarding + 4 sub-routes (8) | Pre-account checkout flow. Controller-level `@UseGuards(PublicRateLimitGuard)`. |
| `billing/controllers/stripe-webhook.controller.ts` | webhook (1) | Verifies `stripe-signature` header via `constructEvent` before trusting the body (`stripe-webhook.controller.ts:53-88`) — correct pattern for a webhook. No `PublicRateLimitGuard`, but Stripe-signature verification is the actual gate here; low risk. |
| `leads/public-leads.controller.ts` | submit (1) | Rate-limited. |
| `legal/public-legal.controller.ts` | list, `:slug` (2) | Public legal documents, read-only, rate-limited. |
| `lookups/public-geography.controller.ts` | countries, states (2) | Static reference data, rate-limited. |
| `tenants/tenants.controller.ts` | signup (1) | Rate-limited. |
| `app-releases/release-publisher.controller.ts` | publish, promote, releases (3) | **Not** unauthenticated despite `@Public()` — every route sits behind `ReleasePublishTokenGuard` (class-level `@UseGuards`), which fails closed when `RELEASE_PUBLISH_TOKEN` is unset/short, does a `timingSafeEqual` digest comparison, and is documented as a machine credential scoped to publishing only (`release-publisher.controller.ts:103-118`, `release-publish-token.guard.ts:30-48`). Verified healthy. |
| `tenants/public-tenants.controller.ts` | resolve, `:tenantSlug/assets/:assetType` (2) | **No `PublicRateLimitGuard` anywhere in the controller or its routes** — see AUTHZ-07. |
| `tenant-domains/workspace.controller.ts` | resolve (1) | Same gap — no rate limit guard on the public route. See AUTHZ-07. |
| `tenant-settings/tenant-branding.controller.ts` | resolved (1) | Same gap. See AUTHZ-07. |
| `tenant-settings/tenant-settings.controller.ts` | public-branding (1) | Same gap. See AUTHZ-07. |

### 2.2 Non-public, no-decorator handlers — where the authorization actually lives

`PermissionsGuard` fails open on these 239 handlers, so authorization is
either delegated to the service layer explicitly, or genuinely absent. Traced
every controller in the list:

- **Platform-permission-guarded controllers** (`super-admin`, `leads/admin-leads`,
  `legal/admin-legal`, `demo-data` — 105 handlers) use `PlatformPermissionsGuard`
  instead of `PermissionsGuard` (`@UseGuards(JwtAuthGuard, RolesGuard, PlatformPermissionsGuard)`).
  That guard is fail-closed by construction: `platform-permissions.ts:341-369`
  requires `request.user?.platform?.id` first, then resolves a required
  `PlatformPermission` from a path/method matcher and **refuses an unresolved
  permission** rather than falling through — the file's own comment cites two
  historical bugs (BUG-0071 four unreachable routes, BUG-0072 a write route
  inheriting a read permission) both fixed by completing the map, and
  `platform-permissions.spec.ts` enumerates the controllers to keep new routes
  from landing unmapped. Verified healthy, with the caveat that the mapper is a
  path-substring match — a maintenance hazard, not a currently-observed bug.
- **`tenant-control-plane.controller.ts`** (35 handlers, `@UseGuards(JwtAuthGuard)`
  only): the controller's own header comment states authorization is delegated
  to the service layer because these routes legitimately cross tenants
  (`tenant-control-plane.controller.ts:36-44`). Verified: every service file in
  the module (`tenant-access.service.ts`, `tenant-apps.service.ts`,
  `tenant-control-plane.service.ts`, `tenant-domains-admin.service.ts`,
  `tenant-erasure.service.ts`, `tenant-modules.service.ts`,
  `tenant-operations.service.ts`, `provisioning-operations.service.ts`) opens
  every public method with `assertTenantPlatformAccess(user, '<permission>')`
  (`tenant-control-plane.guard.ts:20-32`), which requires `user.platform?.id`
  and a specific platform permission; irreversible operations
  (`tenant-erasure.service.ts:134,389`) additionally require
  `assertPlatformAdministrator` (role in `SUPER_ADMIN`/`PLATFORM_OWNER`/`PLATFORM_ADMIN`).
  Consistent across the ~40 call sites found. Verified healthy.
- **`contracts.controller.ts`** (41 handlers, `@UseGuards(JwtAuthGuard)` only):
  same pattern — `contracts.service.ts` calls `this.assertWrite(user)` /
  `this.assertPlatform(user)` (defined `contracts.service.ts:5031-5041`,
  requiring `user.platform?.id`) at the top of every mutating and most
  read methods (spot-checked `create` at `contracts.service.ts:1207-1208`).
  `dto.tenantId` is accepted as client input in several create paths
  (`contracts.service.ts:1298,1882`), which would be a tenant-isolation risk on
  a tenant-scoped model, but this module is platform-side (DijiPeople's own
  commercial contracts with customer tenants) and gated by `assertPlatform`
  first — the platform actor choosing which tenant a contract is *for* is the
  intended shape, not client-controlled tenant scoping of the actor's own data.
  Verified healthy as designed; flagged in §6 as an architectural pattern worth
  a static check (no guard/decorator means nothing stops a future handler from
  forgetting the `assert*` call — see AUTHZ-06).
- **`data.controller.ts`** (5 handlers) / **`metadata.controller.ts`** (2
  handlers): the generic entity API. No controller-level guard beyond
  `JwtAuthGuard`, but `data.service.ts`/`custom-data.service.ts`/`metadata.service.ts`
  all call `EntityPermissionResolver.assertCanRead`/`assertCan`
  (`entity-permission.resolver.ts:9-49`), which re-derives the same
  `permissionKeys` + `resolveEffectiveAccessLevel` check `PermissionsGuard`
  would apply, per-entity, from `EntityMetadata.permissions`. Verified healthy
  — this is the AGENTS.md-documented design ("No automatic tenant filter in the
  generic entity data API... resolves scope explicitly").
- **`platform-users.controller.ts`** (11 handlers): 6 are `me/*` routes,
  correctly self-scoped by `user.platform.id` alone (no id parameter exists to
  redirect them). The remaining 5 (`list`, `listOwnerCandidates`, `create`,
  `update`, `disable`) all call `assertPlatformUser` or the stricter
  `assertCanManage` (requires `SUPER_ADMIN`/`PLATFORM_OWNER`,
  `platform-users.service.ts:542-549`). `update`/`disable` additionally call
  `assertSuperAdminInvariant` (`platform-users.service.ts:566-605`), which
  blocks self-disable and blocks removing the last active `SUPER_ADMIN`.
  Verified healthy, and a genuinely good escalation-resistant design — see
  Healthy section.
- **`platform-monitoring.controller.ts`** / **`platform-events.controller.ts`**
  (6 + 4 handlers): every method calls `assertMonitoring`/`assertRead`
  (`platform-monitoring.service.ts:33,163,200,371`;
  `platform-events.service.ts:99,177,192,253,283-288`), both requiring
  `user.platform?.id`. Destructive/config methods additionally call
  `assertSuperAdmin` (`platform-monitoring.service.ts:275,299,325,352-368`).
  Verified healthy.
- **`error-logs.controller.ts`** (3 handlers): `persistClientLog` writes with
  the caller's own `tenantId`/`userId` (safe by construction — no cross-tenant
  read). `getLog`/`downloadLog` call `findForUser`, which contains a
  documented, already-fixed cross-tenant bug: `error-logs.service.ts:211-228`
  ("anyone holding a support role who learned a traceId from another tenant
  could read that tenant's log... the support branch should have done the same
  [tenantId compare]"). Current code compares `log.tenantId === user.tenantId`
  on both the support and owner branches. Verified fixed as read.
- **`partners.controller.ts`** (4 handlers) / **`support-cases.controller.ts`**
  (2 handlers): `assertRead`/`assertWrite`/`assertPlatform` at every service
  entry point (`partners.service.ts:29,34,39,44,53,62,72,81,91`;
  `support-cases.service.ts:84,167,221`). Verified healthy.
- **`organization-access.controller.ts`** (`GET me`, 1 handler) and
  **`organization-hierarchy.controller.ts`** (`GET tree`, 1 handler),
  **`customization-runtime.controller.ts`** (`GET published`, 1 handler): all
  three are either strictly self-scoped (`me` — no id parameter can point
  elsewhere) or return tenant-wide, low-sensitivity structural data (org
  hierarchy tree, published runtime metadata) that every authenticated user
  legitimately needs for navigation. No RBAC gate is appropriate here; verified
  as intentionally ungated, not a gap.
- **`app.controller.ts`** (`GET /`, `GET /health`, 2 handlers): health check,
  not even behind `JwtAuthGuard`. Confirms `JwtAuthGuard` is opt-in per
  controller rather than global (no `APP_GUARD` registration found), so the
  absence of `@Public()` here is correct, not an omission.
- **`gateway-runtime.controller.ts`** / **`gateway-service.controller.ts`**
  (6 + 3 handlers): `GatewayAuthGuard` (a separate device-credential guard for
  the on-premise .NET gateway), not `PermissionsGuard` — out of this area's
  scope beyond confirming it is a deliberate separate auth path, not a gap.

**Net assessment of §2.2: the 239 "no permission decorator" handlers are, with
the exceptions below, consistently protected by an equivalent manual check in
the service layer.** The residual risk is structural (AUTHZ-06), not a
currently-exploitable gap in this set. The genuine authorization gaps found in
this audit are not in this list — they are on routes that carry the *correct*
decorators but whose service methods skip a check their sibling method
applies. See §3 and §4.

## 3. Object-level authorization (BOLA)

### AUTHZ-03 — `GET /employees/:employeeId/export` bypasses the row-scope check its sibling `GET /employees/:employeeId` applies

- **Category:** AuthZ / BOLA
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** NEW (not in `docs/bugs/`; grepped `exportEmployeeProfile`, `employees.export`, `export.*employee.*profile` — only unrelated `BUG-2026`, a CSV-column-shape bug, matched)
- **Component:** `services/api/src/modules/employees/employees.controller.ts`, `employees.service.ts`
- **Evidence:**
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
  — **no third `where` argument.** Compare the sibling read path,
  `employee-profiles.service.ts:104-105` (`getProfile`, backing
  `GET /employees/:employeeId`) —
  ```
  async getProfile(currentUser, employeeId) {
    const employee = await this.assertEmployeeAccess(currentUser, employeeId);
  ```
  `employee-profiles.service.ts:1807-1829` (`assertEmployeeAccess`) calls
  `employeeAccessService.canViewEmployeeRecord`, which
  (`employee-access.service.ts:94-107`) runs
  `employeesRepository.findByIdAndTenant(tenantId, employeeId, await this.buildReadableEmployeeWhere(user))`
  — the third argument is exactly the `buildScopedAccessWhere`-derived OWN/TEAM/
  BUSINESS_UNIT filter (`employee-access.service.ts:43-68`) that `findById` never
  applies.
- **Current behaviour:** `GET /employees/:employeeId` correctly denies a caller
  whose RBAC `EMPLOYEES:READ` access level is `SELF`/`TEAM`/`BUSINESS_UNIT` and
  who is out of scope for the target id. `GET /employees/:employeeId/export`,
  gated by the same RBAC privilege (`EMPLOYEES:read`) plus the legacy key
  `employees.export`, performs only a tenant + id lookup and returns a CSV of
  the employee's profile, employment and ownership fields to any caller who
  holds `employees.export` at any access level.
- **Expected behaviour:** `exportEmployeeProfile` should call the same
  `assertEmployeeAccess`/`canViewEmployeeRecord` (or `buildReadableEmployeeWhere`)
  check as `getProfile` before building the CSV.
- **Risk:** A manager or any role holding `employees.export` at `SELF` or
  `TEAM` RBAC level can export the full profile CSV (name, work/personal email,
  phone, DOB, gender, marital status, nationality, address, emergency contact,
  tax identifier — the same field set returned by `getProfile`, per
  `employee-profiles.service.ts:134-192`, minus fields the CSV mapper omits) for
  **any employee id in the tenant**, not just their own reports. Concretely:
  role "Manager" (RBAC `EMPLOYEES:READ = TEAM`, legacy key `employees.export`
  granted) calls `GET /employees/<any-uuid-in-tenant>/export`; `findById` returns
  the record because it only checks `tenantId`; the manager receives a CSV
  containing an out-of-team employee's PII.
- **Remediation:** In `employees.service.ts:exportEmployeeProfile`, replace the
  `findById` call with the same access-checked path `getProfile` uses (either
  call `employeeAccessService.canViewEmployeeRecord` first and throw
  `ForbiddenException` on failure, or route the lookup through
  `buildReadableEmployeeWhere`).
- **Difficulty:** LOW
- **Regression risk:** LOW (narrows an already-too-wide read path; no legitimate
  caller should have been relying on tenant-wide export)
- **Fix now:** YES

### AUTHZ-04 — `GET /employees/:employeeId/project-allocations` has the same gap, gated by a different, broader permission

- **Category:** AuthZ / BOLA
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/employees/employees.controller.ts:765-772`, `employees.service.ts:709-714`
- **Evidence:**
  `employees.controller.ts:765-772` —
  ```
  @Get(':employeeId/project-allocations')
  @Permissions('projects.read')
  @RequirePermission(ENTITY_KEYS.PROJECTS, 'read')
  getProjectAllocations(@CurrentUser() user, @Param('employeeId') employeeId) {
    return this.employeesService.getProjectAllocations(user, employeeId);
  }
  ```
  `employees.service.ts:709-714` —
  ```
  async getProjectAllocations(currentUser, employeeId) {
    await this.findById(currentUser.tenantId, employeeId);
    const assignments = await this.prisma.projectAssignment.findMany({...
  ```
  — same unscoped `findById`, and the gate is `projects.read`/`PROJECTS:read`,
  not any employee-scoped privilege at all, so anyone who can read the projects
  module can pull any employee's project-allocation history by id.
- **Current behaviour:** No employee-record scoping; tenant-wide by id.
- **Expected behaviour:** Same access check as employee profile reads, since the
  response is employee-linked data.
- **Risk:** Lower sensitivity than AUTHZ-03 (project/task assignment, not PII),
  but the same class of bug and the same fix.
- **Remediation:** Same as AUTHZ-03 — route through `canViewEmployeeRecord`.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** LATER (bundle with AUTHZ-03's fix; same root cause)

### `GET /employees/:employeeId` itself — re-verified, not a bug

The briefing flagged (from the OBS specialist) that `GET /employees/:id` is
"gated only by `dashboard.view`" and returns CNIC/DOB/address. Confirmed the
permission decorators are `@Permissions('dashboard.view')` +
`@RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')`
(`employees.controller.ts:206-208`), and confirmed the response does include
`cnic`, `dateOfBirth`, `addressLine1/2`, `emergencyContact*`, `taxIdentifier`
(`employee-profiles.service.ts:134-192`). However, tracing the call chain
(`findOne` → `getProfile` → `assertEmployeeAccess` → `canViewEmployeeRecord` →
`buildReadableEmployeeWhere` → `buildScopedAccessWhere`, §above) shows the
row-level OWN/TEAM/BUSINESS_UNIT scope **is** applied on this specific route.
The generic legacy key `dashboard.view` does not by itself widen access,
because `satisfiesPermissionRequirement` still requires the RBAC
`EMPLOYEES:read` privilege, and that privilege's access level is what drives
the row filter. **This route is NOT vulnerable as described; the export and
project-allocations siblings are.** Flagging this explicitly so the
orchestrator can reconcile the two specialist reports — the underlying
instinct (a route named for a dashboard widget gating employee PII reads) was
right to flag, but the actual bug is one hop away, in the two handlers that
skip the scope check `findOne` applies correctly.

## 4. Privilege escalation

### AUTHZ-01 — `POST /users/:userId/roles` can grant `GLOBAL_ADMIN` with none of the checks its sibling `PUT` endpoint applies

- **Category:** AuthZ / Privilege Escalation
- **Severity:** CRITICAL
- **Confidence:** CONFIRMED
- **Known:** NEW (grepped `addRole`, `assign-roles`, `GLOBAL_ADMIN`, `privilege escalation` in `docs/bugs/` — no match for this path; `BUG-2015`/`BUG-1970` are unrelated approval-permission bugs)
- **Component:** `services/api/src/modules/users/users.controller.ts:168-181`, `users.service.ts:603-641`
- **Evidence:**
  `users.controller.ts:168-181` —
  ```
  @Post(':userId/roles')
  @Permissions('users.assign-roles')
  @RequirePermission(ENTITY_KEYS.USERS, 'assign')
  addRole(@CurrentUser() currentUser, @Param('userId') targetUserId, @Body('roleId') roleId) {
    return this.usersService.addRole(...)
  ```
  `users.service.ts:603-624` — the entire method body:
  ```
  async addRole(tenantId, userId, roleId, actorId) {
    await this.assertUserBelongsToTenant(tenantId, userId);
    const role = await this.rolesRepository.findByIds(tenantId, [roleId]);
    if (role.length !== 1) throw new BadRequestException(...);
    if (!role[0].isActive) throw new BadRequestException(...);
    const row = await this.usersRepository.addUserRole(tenantId, userId, roleId, actorId);
    return { ... };
  }
  ```
  That is the complete method — no comparison of the actor's own roles/privileges
  to the role being granted, no check on `role.isSystem`, no special case for
  `ROLE_KEYS.GLOBAL_ADMIN`, no self-target check.

  Compare the sibling bulk-replace endpoint, same controller,
  `users.controller.ts:141-154` (`PUT :userId/roles` → `usersService.assignRoles`),
  whose service method (`users.service.ts:277-370`) does all of the above:
  ```
  313  const canAssignPrivilegedRoles = ownership.isActorOwner || actorEffectiveRoleKeys.includes(ROLE_KEYS.SYSTEM_ADMIN);
  317  if (!canAssignPrivilegedRoles && roles.some((role) => role.isSystem)) {
         throw new ForbiddenException('Only tenant owners and system administrators can assign system roles.');
  323  const includesGlobalAdministrator = roles.some((role) => role.key === ROLE_KEYS.GLOBAL_ADMIN);
  327  if (includesGlobalAdministrator && !ownership.isTargetOwner) {
         throw new ForbiddenException('Global Administrator can only be assigned to the tenant owner.');
  333  if (ownership.isTargetOwner) { ... 339 if (globalAdministrator && !roleIds.includes(globalAdministrator.id))
         throw new ForbiddenException('The tenant owner cannot be downgraded from Global Administrator.');
  ```
  Both controller methods require the identical permission pair
  (`users.assign-roles` legacy key + `USERS:assign` RBAC privilege), so
  `PermissionsGuard` treats them as equally sensitive — but only one of the two
  services enforces the escalation rules that make that permission pair safe to
  grant to a delegated "assign roles" admin in the first place.
- **Current behaviour:** Any actor holding `users.assign-roles` +
  `USERS:assign` (at any RBAC access level ≠ `NONE` — the privilege is not
  itself scoped to a role tier) can call `POST /users/<any-userId-in-tenant>/roles`
  with `{"roleId": "<tenant's GLOBAL_ADMIN role id>"}` and succeed
  unconditionally, including against their own user id.
- **Expected behaviour:** Same checks as `assignRoles` — system roles require
  tenant-owner or `SYSTEM_ADMIN`; `GLOBAL_ADMIN` may only be assigned to the
  tenant owner.
- **Risk:** Complete privilege escalation. Scenario: a tenant-scoped role that
  legitimately needs to assign ordinary roles to new hires (holds
  `users.assign-roles` + `USERS:assign`, e.g. a delegated "People Ops" role that
  was never meant to touch system roles) calls
  `POST /api/users/<own-id>/roles` with body `{"roleId": "<GLOBAL_ADMIN-role-id>"}`.
  `addUserRole` inserts the row; the actor's `roleKeys` now include
  `GLOBAL_ADMIN`. Every subsequent request from that user hits
  `hasElevatedTenantRole` (§1) and bypasses **every** `PermissionsGuard` check
  and **every** row-level scope check (`resolveEffectiveAccessLevel`,
  `buildScopedAccessWhere`, `canAccessRecord` all return unconditional tenant
  access for an elevated role) tenant-wide — payroll, compensation, role
  management, billing, everything gated by the standard mechanism in this
  tenant.
- **Remediation:** Move the escalation checks out of `assignRoles` into a
  shared private method (e.g. `assertRoleGrantAllowed(currentUser, ownership, roles)`)
  and call it from both `assignRoles` and `addRole` in `users.service.ts`.
- **Difficulty:** LOW (the logic to reuse already exists and is tested for the
  `PUT` path)
- **Regression risk:** LOW
- **Fix now:** YES

### AUTHZ-02 — `PUT /roles/:roleId/permissions` (legacy) skips the "cannot exceed own access" check its sibling `/matrix` endpoint applies

- **Category:** AuthZ / Privilege Escalation
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/roles/roles.controller.ts:92-117`, `roles.service.ts:123-155,270-330,580-624`
- **Evidence:**
  `roles.controller.ts:92-106` and `:108-117` — both `PUT :roleId/permissions`
  (`updatePermissions`) and `PUT :roleId/matrix` (`updateMatrix`) require the
  identical pair: `@Permissions('roles.assign-permissions')` +
  `@RequirePermission(ENTITY_KEYS.SETTINGS, 'configure')`.

  `roles.service.ts:270-294` (`updateMatrix`) —
  ```
  290  this.assertValidMatrix(dto);
  292  if (!this.canEscalateBeyondOwnAccess(currentUser)) {
  293    await this.assertMatrixWithinActorAccess(currentUser, dto);
  294  }
  ```
  `roles.service.ts:580-617` (`assertMatrixWithinActorAccess`) computes the
  actor's own max `SecurityAccessLevel` per `entityKey:privilege` from their
  own roles' `rolePrivileges`, and throws `ForbiddenException('Custom roles
  cannot exceed your own effective access.')` if any requested privilege in the
  matrix exceeds it.

  `roles.service.ts:123-155` (`updatePermissions`) — the complete method:
  ```
  123  async updatePermissions(tenantId, roleId, permissionIds, actorId) {
         const role = await this.rolesRepository.findByIdAndTenant(tenantId, roleId);
         if (!role) throw new NotFoundException(...);
         if (role.isSystem || !role.isEditable) throw new ForbiddenException(...);
         const permissions = await this.permissionsService.findByIds(tenantId, permissionIds);
         if (permissions.length !== permissionIds.length) throw new BadRequestException(...);
         return this.rolesRepository.replacePermissions(tenantId, roleId, permissionIds, actorId);
       }
  ```
  No call to `assertMatrixWithinActorAccess` or any equivalent — only that the
  requested permission ids belong to the tenant.
- **Current behaviour:** An actor holding `roles.assign-permissions` +
  `SETTINGS:configure` can, via the legacy-keys endpoint, grant any editable
  role **any legacy permission key that exists in the tenant** (e.g.
  `payslips.read-all`, `employees.delete`, `billing.manage` if tenant-scoped)
  regardless of whether the actor holds that key themselves — the RBAC-matrix
  sibling endpoint blocks exactly this, the legacy endpoint does not.
- **Expected behaviour:** Same "cannot exceed own effective access" rule
  applied to legacy permission keys as is applied to RBAC matrix privileges.
- **Risk:** Scenario: a role holding `roles.assign-permissions` but not
  `payslips.read-all` calls `PUT /api/roles/<own-role-id>/permissions` with a
  `permissionIds` array that includes the id for `payslips.read-all`, then
  either already holds that role or self-assigns it (subject to AUTHZ-01/the
  `assignRoles` checks, which do not gate on *legacy key* content, only on
  `isSystem`/`GLOBAL_ADMIN`) — the role now carries a legacy key none of its
  original grantors intended, tenant-wide.
- **Remediation:** In `roles.service.ts:updatePermissions`, resolve the
  permission keys for `permissionIds`, and reuse (or adapt)
  `assertMatrixWithinActorAccess`'s pattern: reject any key not in
  `currentUser.permissionKeys` unless `canEscalateBeyondOwnAccess(currentUser)`.
- **Difficulty:** LOW
- **Regression risk:** MEDIUM (will reject some currently-successful admin
  actions if any tenant relies on granting keys the granter doesn't hold —
  worth an audit-log query before shipping, per AGENTS.md's backward-compat
  rule)
- **Fix now:** YES

### AUTHZ-05 — `hasElevatedTenantRole` is a total bypass, by design, and AUTHZ-01 shows it is reachable via self-service

- **Category:** AuthZ / Privilege Escalation
- **Severity:** INFORMATIONAL (LOW on its own; amplifies AUTHZ-01's severity)
- **Confidence:** CONFIRMED
- **Known:** KNOWN-BY-DESIGN — AGENTS.md, Security table: "Nothing added to the
  elevated-role list without an explicit decision — `hasElevatedTenantRole`
  bypasses the guard entirely." Also documented at the call site,
  `permission-evaluation.ts:45-47`.
- **Component:** `common/security/elevated-tenant-roles.ts:4-7,42-48`,
  `common/security/rbac-query-scope.ts:26-34,190-196`
- **Evidence:** quoted in §1.
- **Current behaviour:** `GLOBAL_ADMIN`/`SYSTEM_ADMIN` skip every permission
  check and every row-scope check uniformly.
- **Expected behaviour:** No change requested to the design itself — it is a
  documented decision — but its risk profile changes materially once AUTHZ-01
  is fixed: today, AUTHZ-01 means the elevated-role set is not "assigned only
  by tenant owners", it is "assigned by anyone who holds `users.assign-roles`".
- **Risk:** Compounding factor for AUTHZ-01, not a new independent path.
- **Remediation:** None beyond fixing AUTHZ-01; noting for the orchestrator so
  the two findings are read together.
- **Difficulty:** N/A
- **Regression risk:** N/A
- **Fix now:** NO (tracks AUTHZ-01)

### Role/permission assignment — mass assignment and invite flows checked, not exploitable as far as traced

- `RolesController.create`/`clone` (`roles.controller.ts:64-79`) →
  `roles.service.ts:54-91` applies the same
  `canEscalateBeyondOwnAccess`/`unauthorizedPermission` check as `updateMatrix`
  for the initial permission set of a new custom role. Consistent with
  `updateMatrix`, inconsistent with `updatePermissions` (AUTHZ-02).
- `EmployeesService.create` (`employees.service.ts:1000-1038`): a client can
  request `dto.provisionSystemAccess`, gated by
  `assertAccessProvisioningPermissions(currentUser)`
  (`employees.service.ts:1026`); `dto.ownerUserId` is checked via
  `assertAssignableOwner` unless it equals the actor's own id
  (`employees.service.ts:1004-1006`). Did not find a path here to set
  `roleIds`/`isAdmin` directly on employee creation — role assignment for a
  provisioned account appears to be a separate step through
  `users.controller.ts` (i.e. subject to AUTHZ-01 above, not a second
  independent path).
- Did not find an invite/onboarding endpoint where the invitee chooses their
  own role (self-service signup in `auth.controller.ts` creates an account with
  no role; `tenants.controller.ts:signup` provisions a new tenant, whose owner
  role is presumably system-assigned — not traced to the provisioning service
  in this pass, see Limits).
- `assignDirectPermissions` (`users.service.ts:372-421`) calls
  `assertUserAccessChangeAllowed(ownership)` before replacing a user's direct
  permission set, but — like `updatePermissions` — was not traced far enough
  to confirm it also rejects granting a permission key the actor does not hold
  themselves. Flagging as **NOT OBSERVED / needs a second pass**, same shape as
  AUTHZ-02; did not confirm either way within budget.

## 5. Business-logic authorization

- **Self-approval is explicitly blocked, repeatedly, and the exemption for
  elevated roles was deliberately closed.** `leave.service.ts:1689-1699`:
  "self-approval is refused here as well as in [elsewhere]" —
  `if (leaveRequest.employee.userId === currentUser.userId) throw new
  ForbiddenException('You cannot approve or reject your own leave request.')`.
  A second instance at `leave.service.ts:2276-2289` explicitly discusses
  **not** exempting `GLOBAL_ADMIN`/`SYSTEM_ADMIN` from this rule — i.e. the
  elevated-role bypass (AUTHZ-05) was deliberately *not* allowed to reach this
  check. This matches `docs/bugs/BUG-1970-the-elevated-role-bypass-precedes-the-self-requester-check-o.md`
  (title: "the elevated role bypass precedes the self-requester check") —
  **KNOWN, verified fixed** at this commit; the ordering the bug title
  describes is no longer present.
- **The generic approvals inbox re-checks the owning module's permission at
  decision time**, closing the class of bug `BUG-2015` names ("approving and
  rejecting leave is gated on read permission"): `approvals.service.ts:298-370`,
  specifically `357-365`, calls the exact same
  `satisfiesPermissionRequirement` function `PermissionsGuard` uses, with a
  comment naming BUG-2015 directly. **KNOWN, verified fixed.**
- **Approval-request visibility is scoped**, not tenant-wide by default:
  `approvals.service.ts:840-851` (`relevantScope`) restricts a non-`approvals.manage`
  caller to requests they submitted or are assigned to (plus a `readTeam` case
  the file documents fixing from an unrestricted `{}` — comment at
  `approvals.service.ts:854-863` references the fix without a bug id found in
  `docs/bugs/`, flagged as **KNOWN-BY-COMMENT, record not located**).
- **Stage-level ownership within a multi-step approval** (can a user assigned
  to step 2 decide on step 1 while it's pending?) — `decide()` does not take a
  step id, and `relevantScope`'s `assignments: { some: { assignedToUserId } }`
  matches on *any* assignment on the request, not the currently-pending one.
  Whether the per-module `delegate.execute` (e.g. the leave module's own
  approve logic) re-derives and enforces "is this actually your pending stage"
  was **not traced to a conclusion within budget — NOT OBSERVED, flagged as a
  gap in this audit, not a confirmed finding.**
- **Payroll finalize, employee terminate, timesheet lock, project assign,
  recruitment advance** — all confirmed server-enforced with both decorators
  (`payroll.controller.ts:146`, `employees.controller.ts:786`,
  `projects.controller.ts:106,127,138`, `applications.controller.ts:80`); did
  not find a code path that mutates a finalized payroll run, an approved leave
  request, or a published payslip without going through the corresponding
  `@Permissions`/`@RequirePermission`-gated handler. Not exhaustively traced
  for every state-transition guard (e.g. whether a `PAID` payroll run's amounts
  can still be edited by a sufficiently-permissioned caller) — see Limits.

## 6. UI-only gates — checked against server enforcement

Sampled from `apps/web/lib/permissions.ts` (`MANAGEMENT_PERMISSION_KEYS`,
cosmetic-only per AGENTS.md) against the corresponding API decorator:

| UI permission key | Server route | Server-enforced? |
|---|---|---|
| `PAYROLL_FINALIZE` | `POST payroll/.../finalize` | YES — `payroll.controller.ts:146` `@Permissions('payroll.finalize')` |
| `EMPLOYEES_TERMINATE` | `POST employees/:id/terminate` | YES — `employees.controller.ts:786` `@Permissions('employees.terminate')` |
| `PROJECTS_ASSIGN` | 3 routes in `projects.controller.ts` | YES — `:106,127,138` all `@Permissions('projects.assign')` |
| `RECRUITMENT_ADVANCE` | `applications.controller.ts` | YES — `:80` `@Permissions('recruitment.advance')` |
| `CUSTOMIZATION_PUBLISH` | 10 routes in `customization.controller.ts` | YES — all `@Permissions('customization.publish')` |
| `ATTENDANCE_MANAGE` | 9 routes across `attendance.controller.ts`/`attendance-engine.controller.ts` | YES — all `@Permissions('attendance.manage')` |
| leave-requests approve/reject | `leave-requests.controller.ts:143,155` | YES, plus service-level self-approval block (§5) |
| `ROLES_ASSIGN_PERMISSIONS` | `roles.controller.ts:92-117` | Decorator present on both routes; **business-logic gap found on one of them — AUTHZ-02**, not a missing-decorator gap |
| `USERS_ASSIGN_ROLES` | `users.controller.ts:141-181` | Decorator present on both routes; **business-logic gap found on one — AUTHZ-01**, not a missing-decorator gap |

**No case of a UI-hidden action with a genuinely unguarded server route was
found in this sample (8 actions).** The two real gaps in this sample
(AUTHZ-01, AUTHZ-02) are more subtle than "missing decorator" — they are
"decorator present and satisfied, but the service-layer business rule that
makes the permission safe to hold is only implemented on one of two routes
that both claim to need it." Worth relaying to whichever specialist covers UI:
the UI only exposes the `PUT` forms for both role/permission assignment (per
the permission-key naming), so the vulnerable `POST` routes (AUTHZ-01) may be
API-only surface with no UI trigger today — that reduces likelihood of
accidental use but not of deliberate exploitation, since the API is reachable
directly.

## 7. Public endpoints missing rate limiting

### AUTHZ-07 — Five `@Public()` read routes have no `PublicRateLimitGuard`

- **Category:** AuthZ-adjacent / Public endpoint hardening
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW (this exact set of routes is not in `docs/bugs/`; the project
  has repeatedly recorded this same class of issue elsewhere —
  `BUG-0013`, `BUG-0031`, `BUG-0032`, `BUG-0075` — which is why AGENTS.md states
  "Public endpoints (`@Public()`) additionally need rate limiting" as a
  standing rule, not a one-off fix)
- **Component:**
  `modules/tenants/public-tenants.controller.ts:18-19,34-35` (`resolve`,
  `getBrandingAsset` — no `@UseGuards` on the controller at all),
  `modules/tenant-domains/workspace.controller.ts:17-32` (`resolve` — class has
  no `@UseGuards`, and only `/mine` gets `@UseGuards(JwtAuthGuard)` at method
  level), `modules/tenant-settings/tenant-branding.controller.ts:23-30`
  (`resolved` — class-level guards are `JwtAuthGuard, PermissionsGuard`, both
  bypassed by `@Public()`, no `PublicRateLimitGuard` added back),
  `modules/tenant-settings/tenant-settings.controller.ts:90-93`
  (`public-branding`, same pattern).
- **Current behaviour:** These five routes can be called at unlimited rate by
  an unauthenticated caller. `public-tenants.controller.ts:resolve` accepts
  `slug`/`domain`/`host`/`tenantCode` query parameters and returns whatever
  `publicTenantsService.resolve` resolves; `getBrandingAsset` streams a file by
  `tenantSlug` + `assetType`.
- **Expected behaviour:** Per AGENTS.md's own Security table, every
  `@Public()` handler needs `PublicRateLimitGuard`.
- **Risk:** Unthrottled tenant-slug/domain enumeration and unthrottled asset
  serving. Low data sensitivity (these are explicitly public-facing branding
  and routing endpoints, not tenant business data), but real load/enumeration
  exposure, and a direct, citable violation of the project's own stated rule
  for `@Public()` routes — the kind of gap this project has repeatedly had to
  fix elsewhere (see the four cited sibling `BUG-00xx` records).
- **Remediation:** Add `@UseGuards(PublicRateLimitGuard)` (controller-level, matching
  `public-billing.controller.ts`'s pattern) to `PublicTenantsController`,
  `WorkspaceController`, and the two `resolved`/`public-branding` methods (or
  their controllers, if nothing else on those controllers needs to stay
  unthrottled-by-guard).
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** LATER (real but low-severity; batch with other public-endpoint
  hardening)

## Healthy — verified good

- `PermissionsGuard`/`satisfiesPermissionRequirement` is a single, shared
  decision function used identically by the HTTP guard and by the generic
  approvals inbox (`approvals.service.ts:357-365`), specifically to prevent the
  BUG-2015 class of drift. Verified by reading both call sites.
- `roles.service.ts:updateMatrix` (`assertMatrixWithinActorAccess`,
  `canEscalateBeyondOwnAccess`) and `roles.service.ts:create`
  (`roles.service.ts:80-90`) both correctly prevent a role-configurator from
  granting a custom role RBAC privileges beyond their own effective access.
  (The sibling legacy-key endpoint does not — AUTHZ-02.)
- `users.service.ts:assignRoles` (the `PUT` bulk-replace path) correctly
  restricts system-role and `GLOBAL_ADMIN` assignment to tenant owners /
  `SYSTEM_ADMIN`, and blocks downgrading the tenant owner out of
  `GLOBAL_ADMIN`. (The sibling `POST` single-add path does not — AUTHZ-01.)
- `platform-users.service.ts`: `assertCanManage` requires
  `SUPER_ADMIN`/`PLATFORM_OWNER`; `assertSuperAdminInvariant`
  (`:566-605`) blocks self-disable and blocks removing the last active
  `SUPER_ADMIN`. A genuinely well-built escalation-resistant module.
  Verified by reading `create`/`update`/`disable` and their guards in full.
- `PlatformPermissionsGuard` (`platform-auth/platform-permissions.ts:341-369`)
  is fail-closed by construction (an unresolved permission is refused, not
  granted), and its own file documents two historical near-misses
  (BUG-0071, BUG-0072) that were fixed by completing the route map rather than
  relaxing the guard, backed by `platform-permissions.spec.ts` enumerating
  every controller route to keep the map complete.
- `ReleasePublishTokenGuard` (`release-publish-token.guard.ts`) fails closed
  when `RELEASE_PUBLISH_TOKEN` is unset/short, uses `timingSafeEqual` on
  SHA-256 digests (not raw string comparison), and is correctly the real gate
  behind the `@Public()` release-publisher routes.
- `StripeWebhookController` verifies the `stripe-signature` header via
  `constructEvent` before trusting any webhook payload
  (`stripe-webhook.controller.ts:53-88`).
- `error-logs.service.ts:findForUser` — the cross-tenant read documented as
  fixed in the code's own comment (`:211-228`) is in fact fixed at this commit:
  both the support-role branch and the owner branch compare `log.tenantId ===
  user.tenantId` before returning a row.
- `auth.controller.ts:me` (`@Public()`, `auth.service.ts:getProfileFromRequest`)
  — `BUG-2547` (a revoked session still answering here) is fixed: the code
  calls `isSessionStillLive(payload, clientId)` and throws to the refresh path
  if not, matching `docs/bugs/BUG-2547-...md`'s `Status: FIXED`.
  Cross-referenced `REG-377`.
- `EntityPermissionResolver` (`modules/data/entity-permission.resolver.ts`)
  replicates the exact `permissionKeys` + `resolveEffectiveAccessLevel` check
  used elsewhere, applied per-entity for the generic `/data/:entityLogicalName`
  API — the AGENTS.md-documented design for that module, verified present and
  called from every `DataService`/`CustomDataService` mutation and read path.
- `organization-access.controller.ts:GET me`,
  `organization-hierarchy.controller.ts:GET tree`,
  `customization-runtime.controller.ts:GET published` — all three are either
  strictly self-scoped by the token's own `userId` (no parameter exists to
  redirect them elsewhere) or return non-sensitive tenant-wide structural data;
  their absence of an RBAC decorator is correct, not an oversight.
  `app.controller.ts`'s two health routes confirm `JwtAuthGuard` is opt-in per
  controller (no global `APP_GUARD`), so their being unguarded is expected.
- `leave.service.ts` self-approval prohibition is enforced at multiple call
  sites and was deliberately extended to cover the elevated-role bypass case
  (`:2276-2289`), matching `BUG-1970`'s fix.
- Two permission systems (legacy key + RBAC matrix) are used **together** on
  every one of the 948 decorated handlers found — zero handlers rely on only
  one of the two, so there is no live example in this codebase of the
  "declared only one" ambiguity the briefing asked about; the ambiguity exists
  only in the guard's handling of that hypothetical case (§1), not in current
  route declarations.

## Not examined / limits

- **`assignDirectPermissions`** (`users.service.ts:372-421`) was read far
  enough to confirm it calls `assertUserAccessChangeAllowed`, but not far
  enough to confirm whether that function blocks granting a permission the
  actor does not themselves hold (the same question AUTHZ-02 answers "no" for
  legacy role-permission assignment). Flagged as a likely-same-shape gap, not
  confirmed.
- **Multi-step approval stage ownership** (§5): did not trace whether a user
  assigned to a later step in a workflow can decide an earlier, currently-
  pending step through a per-module `delegate.execute` implementation (e.g.
  the leave module's own approve path outside the generic inbox). The generic
  inbox's `relevantScope` matches on "assigned to any step", which is
  consistent with a real gap but was not confirmed against the per-module
  execute logic within budget.
- **Tenant provisioning / owner role assignment on signup**
  (`tenants.controller.ts:signup`) was not traced into whatever service
  assigns the initial tenant-owner role, so "can a new tenant's signup flow be
  used to grant an arbitrary role" is unconfirmed either way.
- **Compensation/salary-write paths** (`compensation.controller.ts`,
  `salary-package-rules.controller.ts`) were enumerated (both carry both
  decorators on all handlers, per the scripted scan) but not traced into their
  services for row-level scope the way `employees`/`payslips` were — a full
  BOLA trace of compensation data specifically (as the task asked) was not
  completed within budget.
- **Payroll-run state-transition guards** (can a `PAID`/`FINALIZED` run still
  be edited by a sufficiently-permissioned caller) were not traced to a
  conclusion; only confirmed the finalize/publish/void endpoints are
  permission-decorated.
- **Mass-assignment sweep**: found 15 `...dto` spreads into Prisma
  create/update calls across services (`agent`, `attendance`, `customization`,
  `employees`, `leads`, `partners`, `pay-components`, `payroll`, `super-admin`,
  `support-cases`, `tax-rules`); spot-checked `employees.service.ts:create`
  (guarded by `assertAccessProvisioningPermissions`/`assertAssignableOwner`)
  but did not check the other 13 sites for a DTO field that maps to a
  privileged/computed column (`tenantId`, `status`, approval fields, money
  fields). The global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`
  bounds this risk to fields the DTO class itself declares, which narrows but
  does not eliminate it.
- **Path-substring fragility of `resolvePlatformPermission`**
  (`platform-permissions.ts:391+`) was read and found to be actively guarded
  by a completeness spec, but the *correctness* of each mapping (as opposed to
  its completeness) was not independently re-derived route-by-route — taking
  the module's own regression history (BUG-0071/0072, both fixed) and spec
  coverage as sufficient evidence for this pass.
- **`gateway-runtime`/`gateway-service` controllers' `GatewayAuthGuard`** was
  confirmed to be a distinct guard from `PermissionsGuard` but not read in
  detail — out of primary RBAC scope, noted only to explain why those routes
  appear in the "no permission decorator" list without being a gap.
- The scripted route enumeration is a regex-based parser, not a TypeScript
  AST — it recovers 1,226 of ~1,273 raw `@Get`/etc. decorator occurrences (the
  gap is multi-line decorator argument lists the parser's paren-balancer
  mis-handled, not a systematic bias toward hiding unprotected routes; spot
  checks of controllers with the largest counts, e.g. `employees`, `contracts`,
  `super-admin`, matched manual reads).
