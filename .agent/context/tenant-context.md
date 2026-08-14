# Tenant Context and Isolation

> **Last verified:** 2026-08-14
> **Verified against commit:** 8682dc1
> **Key source files:** services/api/src/common/guards/jwt-auth.guard.ts, services/api/src/modules/auth/auth-access.service.ts, services/api/src/common/interfaces/authenticated-request.interface.ts, services/api/src/common/prisma/prisma.service.ts, services/api/src/common/request-context/request-context.service.ts, services/api/src/common/middleware/business-unit-access.middleware.ts, services/api/src/common/security/rbac-query-scope.ts, services/api/src/modules/audit/audit.service.ts, services/api/src/app.module.ts
>
> This document describes the repository, it is not authority over it. If the
> code disagrees, the code is current truth — report the discrepancy and
> recommend a context update.

## CURRENT

### The full path a `tenantId` travels

1. **JWT payload.** The access token carries `sub`, `tenantId`, `sessionId`,
   `appClientId`, `aud`, `email`, `tokenUse`. Verified in
   `jwt-auth.guard.ts:69-74` with a **per-client** secret resolved by
   `getClientAccessTokenSecret(configService, clientId)`.
2. **Client binding.** `jwt-auth.guard.ts:87-95` rejects the token unless both
   `payload.appClientId` and `payload.aud` normalize to the client id derived
   from request headers (`getAuthClientIdFromHeaders`).
3. **Live session check.** `assertSessionIsActive` (`jwt-auth.guard.ts:271-345`)
   re-queries `RefreshToken` / `PlatformRefreshToken` / `AgentRefreshToken`
   **on every request**, filtering on `tenantId` for the tenant and agent paths.
4. **Access context load.** `jwt-auth.guard.ts:99-105` calls
   `AuthAccessService.loadAccessContext(payload.sub, payload.tenantId)` — or
   `loadPlatformAccessContext(payload.sub)` when `clientId === 'admin'` and
   `payload.authSubjectType === 'platform-user'`.
5. **Tenant re-verification.** `auth-access.service.ts:71` reads the user with
   `prisma.user.findUnique({ where: { id: userId } })` and then
   `auth-access.service.ts:145-154` throws `UnauthorizedException` when
   `expectedTenantId && user.tenantId !== expectedTenantId`, or when the user or
   the tenant is not `ACTIVE`. This is a **read-then-verify**, not a scoped read.
   The tenant on `request.user` is therefore the **database** tenant, never the
   token's claim taken on faith.
6. **`request.user`.** `jwt-auth.guard.ts:129-131` assigns `authUser` and stamps
   `sessionId` / `appClientId`. Shape is `AuthenticatedUser` with `userId`,
   `tenantId`, `tenantName`, `roleIds`, `roleKeys`, `permissionKeys`,
   `rolePrivileges`, `miscPermissions`, `accessContext`
   (`auth-access.service.ts:245-269`).
7. **Hand-written Prisma `where`.** Services read `currentUser.tenantId` and
   thread it into every query themselves — e.g.
   `employees.service.ts:268` (`const tenantId = currentUser.tenantId`) feeding
   `employees.repository.ts:210-216`, which builds
   `AND: [buildWhereClause(tenantId, query), accessWhere]`.

**There is no step between 6 and 7 that adds `tenantId` for you.**

### What does NOT exist (verified)

- **No PostgreSQL row-level security.** No migration in
  `services/api/prisma/migrations/` (183 migrations) contains `ROW LEVEL
  SECURITY`, `ENABLE RLS`, or a policy statement.
- **No global tenant Prisma middleware.** `prisma.service.ts:28-105` registers a
  `$use` middleware, and it scopes by **business unit**, not tenant:
  `buildScopeWhere` (`prisma.service.ts:130-343`) emits filters on
  `businessUnitId` / `accessibleUserIds` for a fixed list of ~18 models
  (`Employee`, `AttendanceEntry`, `Timesheet`, `LeaveRequest`, `Application`,
  `Candidate`, `PayrollRecord`, `Document`, …). `tenantId` appears nowhere in
  that function.
- **That middleware does not run at all.** Registration is guarded by
  `const middlewareRegistrar = (this as any).$use; if (typeof
  middlewareRegistrar !== 'function') { …return; }`
  (`prisma.service.ts:28-34`). The installed client is `@prisma/client@7.8.0`
  (`package-lock.json:4561-4562`; `services/api/package.json:54` requests
  `^7.8.0`), and on that build `typeof PrismaClient.prototype.$use ===
  'undefined'` (verified by running it). The constructor logs
  `'Prisma middleware registration skipped…'` and returns. **Treat everything
  from `prisma.service.ts:36` to `:105` as dead code.**
- **No automatic tenant filter in the generic data API.**
  `modules/data/data.controller.ts:20` mounts only `JwtAuthGuard`; scope is
  resolved explicitly inside the module.

### The request context that *is* live

`RequestContextService` (`request-context/request-context.service.ts:16-28`) is
an `AsyncLocalStorage<BuAccessRequestContext | null>` holding `userId`,
`tenantId`, `businessUnitId`, `organizationId`, `accessibleBusinessUnitIds`,
`accessibleUserIds`, `effectiveAccessLevel`, `requiresSelfScope`.

`BusinessUnitAccessMiddleware` (`middleware/business-unit-access.middleware.ts`)
is applied to every route (`app.module.ts:156-158`). It independently
`jwt.verify`s the access token (`:37-43`), resolves
`OrganizationAccessService.resolveBusinessUnitAccessContext(userId)` (`:51-54`),
sets `req.buAccess` and runs the rest of the request inside
`runWithContext(buAccess, …)` (`:56-57`). On any failure it sets `null` and
continues — **it never rejects a request**.

Because the only consumer of `RequestContextService.getContext()` is the dead
`$use` middleware, this AsyncLocalStorage context is currently **populated but
unused for enforcement**. `req.buAccess` is still readable by handlers.

### The `'platform'` sentinel

`AuthAccessService.loadPlatformAccessContext` sets `tenantId: 'platform'`
(`auth-access.service.ts:28`). `AuditService.log` branches on it
(`audit.service.ts:28`): `input.tenantId === 'platform'` routes the row to
`PlatformAuditLog` via `auditRepository.createPlatform`, otherwise it writes a
tenant `AuditLog`. This is the **only** string sentinel in the tenant field.

## Key abstractions

| Symbol | Where | What it actually does |
|---|---|---|
| `AuthenticatedUser.tenantId` | `common/interfaces/authenticated-request.interface.ts` | The only trustworthy tenant identity in a request handler |
| `AuthAccessService.loadAccessContext` | `modules/auth/auth-access.service.ts:70` | Loads roles/permissions/BU access; re-verifies tenant and ACTIVE status |
| `buildTenantWhere(tenantId, field?)` | `common/security/rbac-query-scope.ts:53-58` | Trivial `{ tenantId }` object; the base of every scoped where |
| `buildScopedAccessWhere(user, entityKey, privilege, opts)` | `common/security/rbac-query-scope.ts:114-161` | Tenant filter **plus** row-level scope; returns `{ AND: [tenantWhere, { id: '__rbac_no_access__' }] }` on `NONE` |
| `canAccessRecord(user, entityKey, privilege, record)` | `common/security/rbac-query-scope.ts:163-234` | Post-read check; first line is `user.tenantId !== record.tenantId → false` |
| `RequestContextService` | `common/request-context/request-context.service.ts` | AsyncLocalStorage of BU context; no tenant enforcement |
| `AuditService.log` | `modules/audit/audit.service.ts:10` | Dual-sink audit keyed on the `'platform'` sentinel |

Scale of the convention: 213 models in `schema.prisma` declare a `tenantId`
field. Repositories use `findFirst` 776 times vs `findUnique` 246 times across
`services/api/src/modules` — the ratio is the convention, not a guarantee.

## Known exceptions

- **Platform path.** `authSubjectType: 'platform-user'` users legitimately read
  across tenants. Those endpoints live in `super-admin`, `platform-*` and
  `tenants` and carry their own guards — `super-admin.controller.ts:67` uses
  `@UseGuards(JwtAuthGuard, RolesGuard, PlatformPermissionsGuard)`.
  `loadPlatformAccessContext` uses `findUnique` on `PlatformUser`
  (`auth-access.service.ts:14`), which is correct: `PlatformUser` is not
  tenant-owned.
- **`AuthAccessService.loadAccessContext` itself** uses `findUnique` on `User` by
  bare id. Safe only because of the explicit `expectedTenantId` comparison at
  `:147`. Do not copy the `findUnique` half without the comparison half.
- **`JwtAuthGuard.assertTimesheetRestrictionAllowsRequest`**
  (`jwt-auth.guard.ts:189-253`) queries `Employee` and
  `TimesheetAccessRestriction`; both are correctly scoped on
  `request.user.tenantId`.
- **Business-unit scope is a second, orthogonal axis.** It is not a substitute
  for a tenant filter, and vice versa.

## Anti-patterns to avoid

1. `prisma.<model>.findUnique({ where: { id } })` on a tenant-owned model with no
   follow-up tenant comparison. Use `findFirst({ where: { id, tenantId } })`.
2. `prisma.<model>.update({ where: { id }, … })` / `.delete({ where: { id } })`.
   Prisma's `where` on `update`/`delete` accepts only unique fields, so the
   tenant filter silently disappears. Use `updateMany` / `deleteMany` with
   `{ id, tenantId }` and assert `count === 1`, or read-verify-write inside
   `$transaction`.
3. Taking `tenantId` from `@Body()`, `@Query()`, `@Param()` or a header on an
   authenticated endpoint. The DTO must not declare the field at all — the global
   `ValidationPipe` runs `forbidNonWhitelisted: true`, so an undeclared
   `tenantId` becomes a 400 rather than a hijack.
4. Spreading a DTO into `create`/`update` (`data: { ...dto }`). Pick fields
   explicitly; a `tenantId` in the spread overwrites the scoped one.
5. Relying on `prisma.service.ts`'s `$use` middleware, on `req.buAccess`, or on
   `RequestContextService` to constrain a query. The first does not execute; the
   other two never reject.
6. Adding a tenant-owned model with bare `@unique` on a business key
   (`@unique employeeCode`). Uniqueness must be composite with `tenantId`.
7. Passing `tenantId` implicitly into a queue processor, cron job or seed by
   reading ambient state. There is no request context there.

## TARGET (required going forward)

- Every query touching a tenant-owned model filters `tenantId` sourced from
  `request.user.tenantId`, no exceptions, including counts and aggregates.
- New list/read endpoints use `buildScopedAccessWhere()` rather than a bare
  `{ tenantId }`, so `OWN` / `TEAM` / `BUSINESS_UNIT` roles are constrained at
  the same time.
- New single-record reads use `findFirst({ where: { id, tenantId } })`; new
  writes use `updateMany`/`deleteMany` with `{ id, tenantId }` and assert the
  affected count, or read-verify-write in a transaction.
- New tenant-owned models declare `tenantId String`, the `tenant` relation with
  explicit `onDelete`, `@@index([tenantId])`, and composite uniqueness including
  `tenantId`.
- Background jobs, queue processors, schedulers and seeds accept `tenantId` as an
  explicit function argument and thread it through every call.
- State-changing operations call `AuditService.log()` with the real `tenantId`
  (or `'platform'` on the platform path) and before/after snapshots.
- **Decision pending, do not assume:** the dead `$use` block in
  `prisma.service.ts` should either be deleted or reimplemented as a Prisma 7
  client extension (`$extends({ query: { $allModels: … } })`). Until an ADR says
  otherwise it stays as-is; do not "fix" it opportunistically as part of an
  unrelated change, and do not cite it as protection.

## What the specialist agent MUST verify before changing this

1. **Re-check the installed Prisma client.** Run
   `node -e "console.log(require('@prisma/client/package.json').version,
   typeof require('@prisma/client').PrismaClient.prototype.$use)"`. If `$use`
   becomes a function again, the business-unit middleware in
   `prisma.service.ts` **starts executing** and silently rewrites `findUnique`
   into `findFirst` for ~18 models. Every claim in this document about it being
   inert is void.
2. **Re-count RLS.** `grep -ri "row level security" services/api/prisma/migrations`
   must still return nothing before you repeat "no RLS".
3. **Read the target service and repository end to end** before adding a query.
   Confirm whether the existing method already applies a tenant filter upstream;
   double-filtering is harmless, missing-filtering is a breach.
4. **For any new model:** confirm `tenantId`, relation `onDelete`,
   `@@index([tenantId])` and composite uniqueness are all present, then run
   `npm run prisma:validate`.
5. **For any change to `JwtAuthGuard`, `AuthAccessService`, or
   `PermissionsGuard`:** run `npm --workspace api run test` and the isolation
   e2e suites under `services/api/test/` (`permission-propagation.e2e-spec.ts`,
   `attendance-integrations-isolation.e2e-spec.ts`).
6. **Never widen a tenant endpoint to serve a platform need.** Confirm the
   caller's `authSubjectType`; if it is `platform-user`, the endpoint belongs in
   a platform-guarded module instead.
