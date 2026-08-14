# Authentication and RBAC

> **Last verified:** 2026-08-14
> **Verified against commit:** 8682dc1
> **Key source files:** services/api/src/common/config/auth.config.ts, services/api/src/common/guards/jwt-auth.guard.ts, services/api/src/common/guards/permissions.guard.ts, services/api/src/common/decorators/permissions.decorator.ts, services/api/src/common/decorators/require-permissions.decorator.ts, services/api/src/common/constants/permissions.ts, services/api/src/common/constants/rbac-matrix.ts, services/api/src/common/security/elevated-tenant-roles.ts, services/api/src/common/security/rbac-query-scope.ts, services/api/src/modules/auth/auth-access.service.ts, services/api/src/modules/permissions/permission-bootstrap.service.ts, services/api/src/modules/platform-auth/platform-permissions.ts, apps/web/lib/security-keys.ts
>
> This document describes the repository, it is not authority over it. If the
> code disagrees, the code is current truth — report the discrepancy and
> recommend a context update.

## CURRENT

### Per-client JWT

`AUTH_CLIENT_IDS = { WEB: 'web', ADMIN: 'admin', AGENT_DESKTOP: 'agent-desktop' }`
(`auth.config.ts:4-8`). `getAuthClientIdFromHeaders` (`:255-264`) tries
`x-dijipeople-app`, then `x-dijipeople-client`, then `x-client-id`, and
**falls back to `'web'`** when none matches (`normalizeAuthClientId`, `:239-253`).

Secrets are per client **with a shared fallback**: `getClientAccessTokenSecret`
(`:45-57`) reads `<PUBLIC_PREFIX>_JWT_ACCESS_SECRET`, else `JWT_ACCESS_SECRET`,
else the dev literal `'dijipeople-access-secret-dev'` (`:13-35`). Without
per-client env overrides all three clients share one secret; refresh mirrors this
(`:59-71`).

TTL defaults (`AUTH_CONFIG_DEFAULTS`, `:13-25`): access `15m`, refresh `8h`,
idle `8h`, absolute `12h`, activity throttle `60s`; agent-desktop access `15m`,
refresh `90d`, idle `30d`, absolute `30d`. Each has a cascade of env aliases
(`getAccessTokenTtl`, `:73-93`).

### What `JwtAuthGuard` enforces, in order

`jwt-auth.guard.ts:43-187`:

1. `@Public()` short-circuits (`:44-51`).
2. Token from `Authorization: Bearer` or the per-client access cookie
   (`extractToken`, `:255-264`; names from `getAuthCookieNames`,
   `auth.config.ts:266-296`), then `verifyAsync` with the per-client secret
   (`:69-74`); `tokenUse`/`type` must be `access` (`:76-85`).
3. **Client binding:** both `payload.appClientId` and `payload.aud` must
   normalize to the header-derived client id (`:87-95`).
4. `assertSessionIsActive` (`:271-345`) — a **live database row** is required
   every request: `PlatformRefreshToken` for admin platform users,
   `AgentRefreshToken` for agent-desktop (`:373-419`), otherwise `RefreshToken`
   filtered on `sessionId`, `userId`, `tenantId`, `appClientId`, `revokedAt:
   null`, `expiresAt > now`. Missing row → `SESSION_REVOKED`. Then
   `absoluteExpiresAt` and, when `SESSION_SLIDING_ENABLED !== 'false'`, idle
   timeout → `SESSION_EXPIRED`. Web tenants override idle timeout via the
   `security/idleTimeoutMinutes` tenant setting, clamped 15–1440 minutes
   (`resolveIdleTimeoutMs`, `:347-371`).
5. Access context via `AuthAccessService` (`:99-105`), then an email-drift check
   (`:118-127`); `request.user` assigned with `sessionId` / `appClientId`
   (`:129-131`).
6. `assertTimesheetRestrictionAllowsRequest` (`:189-253`) — read the body, it is
   real enforcement. Skipped for platform users and `system-scheduler`
   (`:192-196`). Looks up the caller's `Employee` (tenant-scoped, `isDeleted:
   false`), then an active `TimesheetAccessRestriction`. `WARNING_ONLY` passes;
   so does any path matching the 20-entry `alwaysAllowed` prefix list
   (`:222-239`); `LIMITED_ACCESS` additionally allows any `GET`; everything else
   throws `ForbiddenException` code `TIMESHEET_ACCESS_RESTRICTED`.

### Two permission systems, one guard

**Family A — legacy keys.** `@Permissions(...)` is a re-export alias:
`permissions.decorator.ts:6` exports `RequirePermissions as Permissions`. It
sets metadata `required_permissions` (`require-permissions.decorator.ts:4-6`)
and is checked against `user.permissionKeys`.

**Family B — RBAC matrix.** `@RequirePermission(entityKey, action)` and
`@RequireAnyPermission(...)` set metadata `required_rbac_permissions`
(`require-permissions.decorator.ts:13-40`), normalizing the action into the
`SecurityPrivilege` enum. Checked against `user.rolePrivileges`.

`PermissionsGuard.canActivate` (`permissions.guard.ts:22-93`), read carefully:

- **Early return `true` when NEITHER family is declared** (`:34-39`) — a
  controller that mounts the guard but declares no permission metadata is
  **authenticated-only**; the guard authorizes nothing.
- Requires `user.tenantId`, else `ACCESS_DENIED` (`:44-49`); then
  `hasElevatedTenantRole(user)` → **immediate `true`**, both families bypassed
  (`:51-53`).
- Legacy: **every** declared key must be in `user.permissionKeys` (`:57-59`).
- Matrix: `hasRbacPermission = requiredRbacPermissions.length === 0 || …some(…)`
  (`:61-83`). **An absent matrix requirement is treated as satisfied.** When
  present, the guard takes the highest-weighted matching `rolePrivilege` and
  passes if it is anything other than `NONE` — it does **not** compare access
  levels against a required minimum; level is a service-layer concern.
- Both must hold, else `ACCESS_DENIED` (`:85-90`).

**Actual decorator coverage across the 88 controllers under
`services/api/src/modules/`:** 10 declare both families, 51 legacy-only, 1
matrix-only, **26 neither**. Of that last group, `dashboard.controller.ts:16` and
`approvals.controller.ts:9` still mount `PermissionsGuard`, so it returns `true`
at `permissions.guard.ts:38`; `data/data.controller.ts:20` mounts only
`JwtAuthGuard`; the rest are platform controllers guarded by `RolesGuard` +
`PlatformPermissionsGuard` (`super-admin.controller.ts:67`;
`modules/platform-auth/platform-permissions.ts`). The "both decorators are
normally required" rule in `AGENTS.md` is a **TARGET**, not the current state.

### `hasElevatedTenantRole` — total bypass

`security/elevated-tenant-roles.ts:4-7` sets
`ELEVATED_TENANT_ROLE_KEYS = { GLOBAL_ADMIN, SYSTEM_ADMIN }`; `:42-48` returns
true if any of the user's `roleKeys` is in that set. Consequences: the guard
returns `true` unconditionally (`permissions.guard.ts:51`);
`resolveEffectiveAccessLevel` returns `TENANT` before looking at any privilege
(`rbac-query-scope.ts:31-33`), so `buildScopedAccessWhere` degenerates to a bare
`{ tenantId }`; `canAccessRecord` returns `true` after the tenant check
(`:173-175`); and `AuthAccessService` grants the user (and the tenant owner)
**every** key in `FOUNDATION_PERMISSION_DEFINITIONS`
(`auth-access.service.ts:183-190`).

Used in 10 files under `services/api/src`. `manager`, `system-customizer` and
`recruiter` are deliberately excluded — see the comments at
`elevated-tenant-roles.ts:33-41`.

### Row-level scope — `common/security/rbac-query-scope.ts`

`SECURITY_ACCESS_LEVEL_WEIGHT` (`rbac-matrix.ts:1105-1116`):
`NONE 0 < SELF/USER 1 < TEAM/BUSINESS_UNIT 2 < PARENT_CHILD_BUSINESS_UNIT(S) 3
< ORGANIZATION 4 < TENANT 5`, matching the `SecurityAccessLevel` enum at
`schema.prisma:1714-1724`. `SecurityPrivilege` (`:1726+`): `READ, CREATE, WRITE,
DELETE, ASSIGN, SHARE, APPEND, APPEND_TO, IMPORT, EXPORT, APPROVE, REJECT, …`.

`resolveEffectiveAccessLevel(user, entityKey, privilege)` (`:26-51`) reduces
`user.rolePrivileges` to the highest weight for that `(entityKey, privilege)`
pair, defaulting to `NONE`.

`buildScopedAccessWhere` (`:114-161`) always starts from `{ tenantId }` and adds:
`NONE` → `{ id: '__rbac_no_access__' }` (deliberate empty result, not an
exception); `TENANT` → nothing further; `SELF`/`USER` → `buildOwnedRecordWhere`
(`ownerUserId` OR `userId` OR `createdById` OR `ownerTeamId in teamIds`,
`:60-78`); `TEAM` → `OR[owned, businessUnitScope(BUSINESS_UNIT)]`; otherwise
`buildBusinessUnitScopeWhere` (`:80-112`) — `organizationId` for `ORGANIZATION`
(falling back to `accessibleBusinessUnitIds` when `organizationIdField` is
explicitly `null`), `businessUnitSubtreeIds` for `PARENT_CHILD_*`.

`canAccessRecord` (`:163-234`) is the post-read equivalent. Its `TEAM` branch
requires a non-null `record.ownerTeamId`, so a team-less record is inaccessible
at `TEAM` level — stricter than `buildScopedAccessWhere`.

### How permission keys reach `user.permissionKeys`

`AuthAccessService.loadAccessContext` (`auth-access.service.ts:184-218`) unions:
1. all of `FOUNDATION_PERMISSION_DEFINITIONS` when the user is elevated or is
   the tenant owner;
2. `rolePermissions[].permission.key` from direct roles and from team roles
   (`teamMemberships → team.teamRoles`, `:117-137`, `:159-169`; inactive roles
   and inactive teams filtered out);
3. **synthesized** keys from `rolePrivileges` with `accessLevel !== 'NONE'`,
   formatted `` `${entityKey}.${privilege.toLowerCase()}` `` (`:201-208`) — this
   is how matrix privileges also satisfy legacy `@Permissions` checks;
4. `role.miscPermissions` where `enabled` (`:209-213`);
5. direct `user.userPermissions[].permission.key`.

The misc set originates from `SYSTEM_ROLE_MISC_PERMISSIONS`
(`rbac-matrix.ts:890`), materialized into `RoleMiscPermission` rows by
`PermissionBootstrapService`
(`modules/permissions/permission-bootstrap.service.ts:128-160`, `:216-240`),
which also `createMany`s `Permission` rows from
`FOUNDATION_PERMISSION_DEFINITIONS` and upserts `RolePrivilege` rows (`:28-38`,
`:192-212`). Misc keys are surfaced separately as `authUser.miscPermissions`
(`auth-access.service.ts:228-232`, `:256`).

Platform users take a different path: `platformAccessForRole(user.role)`
(`auth-access.service.ts:24`, in `modules/platform-auth/platform-permissions.ts`)
returns a static `{ roleKeys, permissionKeys }`, with `tenantId: 'platform'`.

### Frontend mirror

`apps/web/lib/security-keys.ts` (307 lines) hand-declares `ROLE_KEYS` and
`PERMISSION_KEYS` as literal objects. **There is no generator** — nothing in
`scripts/` or either `package.json` references it, so it drifts silently from
`common/constants/permissions.ts` (2,376 lines) and `rbac-matrix.ts` (1,327
lines). Frontend gating is cosmetic; the API is the authority.

## Key abstractions

| Symbol | Where | Note |
|---|---|---|
| `AUTH_CLIENT_IDS`, `AUTH_CONFIG_DEFAULTS`, `getClientAccessTokenSecret` | `common/config/auth.config.ts:4,13,45` | client ids, TTL defaults, per-client secret with shared fallback |
| `JwtAuthGuard` | `common/guards/jwt-auth.guard.ts:32` | verify → client-bind → session row → access context → timesheet restriction |
| `PermissionsGuard` | `common/guards/permissions.guard.ts:19` | dual-family check with two permissive early exits |
| `Permissions` (= `RequirePermissions`) | `common/decorators/permissions.decorator.ts:6` | alias; metadata `required_permissions` |
| `RequirePermission` / `RequireAnyPermission` | `common/decorators/require-permissions.decorator.ts:15,27` | metadata `required_rbac_permissions` |
| `hasElevatedTenantRole` | `common/security/elevated-tenant-roles.ts:42` | total authorization bypass |
| `resolveEffectiveAccessLevel` / `buildScopedAccessWhere` / `canAccessRecord` | `common/security/rbac-query-scope.ts:26,114,163` | row-level scope, applied by services |
| `ENTITY_KEYS`, `SYSTEM_ROLE_MISC_PERMISSIONS`, `SECURITY_ACCESS_LEVEL_WEIGHT` | `common/constants/rbac-matrix.ts:43,890,1105` | single home for matrix keys |
| `FOUNDATION_PERMISSION_DEFINITIONS` | `common/constants/permissions.ts` | single home for legacy keys |

## Known exceptions

- `@Public()` routes bypass `JwtAuthGuard` entirely and must carry
  `PublicRateLimitGuard` (`common/guards/public-rate-limit.guard.ts`).
- Platform/admin routes use `RolesGuard` + `PlatformPermissionsGuard`, not
  `PermissionsGuard`. Do not mix the two systems on one controller.
- `system-scheduler` and platform users skip the timesheet restriction check
  (`jwt-auth.guard.ts:192-196`).
- Tenant owner (`tenant.ownerUserId === user.id`) receives all foundation
  permissions without holding an elevated role (`auth-access.service.ts:180`,
  `:186-190`).
- Agent-desktop sessions are keyed on `deviceId` when present
  (`jwt-auth.guard.ts:379`).

## Anti-patterns to avoid

1. Mounting `PermissionsGuard` and declaring no permission metadata — the route
   becomes authenticated-only, which almost never matches intent.
2. Declaring one family and assuming the other is enforced too. It is not: an
   empty `requiredPermissions` passes trivially, and an empty
   `requiredRbacPermissions` is explicitly treated as satisfied.
3. Assuming `@RequirePermission(ENTITY, 'write')` denies a `SELF`-level holder.
   The guard only checks `!== NONE`; the level must be enforced in the service
   with `buildScopedAccessWhere` / `resolveEffectiveAccessLevel`.
4. Adding a role key to `ELEVATED_TENANT_ROLE_KEYS` to "make a screen work" —
   that grants every permission everywhere and drops row-level scope.
5. Inventing a permission key at the call site. Keys live in
   `common/constants/permissions.ts` (legacy) or `rbac-matrix.ts` (matrix).
6. Trusting `apps/web/lib/security-keys.ts` as a source of truth, or gating
   server behaviour on a client-sent role/permission list.
7. Reading `tenantId` from the JWT claim directly instead of `request.user` — the
   claim is only re-verified inside `loadAccessContext`.

## TARGET (required going forward)

- Every authenticated controller mounts `@UseGuards(JwtAuthGuard,
  PermissionsGuard)` **and** declares at least one permission requirement. New
  routes declare both families and keep them semantically consistent:
  ```ts
  @Permissions('employees.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  ```
- Row-level enforcement is mandatory in the service for every list and every
  single-record read/write: `buildScopedAccessWhere()` for queries,
  `canAccessRecord()` for post-read verification.
- New permission keys are registered in `common/constants/permissions.ts` and/or
  `rbac-matrix.ts`, wired into `SYSTEM_ROLE_MISC_PERMISSIONS` where a system role
  needs them, and mirrored by hand into `apps/web/lib/security-keys.ts`.
- No additions to `ELEVATED_TENANT_ROLE_KEYS` without an ADR.
- Changes to permission wiring extend the existing invariant specs
  (`common/constants/wiring-invariants.spec.ts`, `rbac-matrix*.spec.ts`,
  `test/permission-propagation.e2e-spec.ts`).
- **Backlog, not yet done:** close the 26 controllers with no permission metadata
  and the 51 legacy-only controllers; generate `apps/web/lib/security-keys.ts`
  instead of hand-maintaining it. Neither is in scope for an unrelated change.

## What the specialist agent MUST verify before changing this

1. **Re-read `permissions.guard.ts` in full** before claiming a route is
   protected — the two early exits (`:34-39` no metadata, `:51-53` elevated role)
   defeat any reasoning from decorator names alone. Re-count the 10/51/1/26 split
   before citing it; it changes as controllers are touched.
2. **Grep the controller for both metadata keys** (`@Permissions`,
   `@RequirePermission`, `@RequireAnyPermission`) *and* the class-level
   `@UseGuards` — `getAllAndOverride` reads handler then class.
3. **Trace any new permission key end to end**: `permissions.ts` /
   `rbac-matrix.ts` → `permission-bootstrap.service.ts` (is a `Permission`,
   `RolePermission`, `RolePrivilege` or `RoleMiscPermission` row created?) →
   `auth-access.service.ts:184-218` (does it land in `permissionKeys`?) → the
   guard. A key that never reaches the third step silently denies everyone.
4. **Re-seed after permission changes**: `npm run seed:config` then
   `npm run seed:verify`; bootstrap runs on provisioning, not on deploy.
5. **Run** `npm --workspace api run test` (rbac-matrix and guard specs, incl.
   `jwt-auth.guard.spec.ts`) plus the permission e2e suite, and report
   pre-existing failures as pre-existing with evidence.
6. **Confirm per-client secrets are actually distinct** in the target environment
   before asserting cross-client token reuse is impossible —
   `auth.config.ts:52-56` falls back to a single shared secret.
