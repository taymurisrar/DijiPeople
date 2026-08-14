# Tenancy

How DijiPeople separates tenants. Verified against the code; statements that
could not be confirmed are marked.

---

## Model

**Shared database, shared schema, discriminator column.** One PostgreSQL
database, one Prisma schema, one API process. Tenant-owned rows carry a
`tenantId` foreign key to `Tenant`.

There is no per-tenant database, no per-tenant schema, and no connection
switching.

## Two subject types

| Subject | Token marker | Scope |
|---|---|---|
| **Tenant user** | `authSubjectType: 'tenant-user'` (or absent), `tenantId` set | One tenant |
| **Platform user** | `authSubjectType: 'platform-user'`, `user.platform` populated | Cross-tenant, by design |

Tenant users belong to exactly one tenant. Platform users are DijiPeople staff
operating the SaaS through `apps/admin`; their access path is
`AuthAccessService.loadPlatformAccessContext()` and it is **not** tenant-scoped.
This is the highest-risk surface in the product.

## How `tenantId` reaches a query

```
JWT (tenantId)
  → JwtAuthGuard verifies token + live session
  → AuthAccessService.loadAccessContext(sub, tenantId)   ← re-read from DB
  → request.user: AuthenticatedUser { tenantId, roleKeys, permissionKeys, rolePrivileges, accessContext }
  → @CurrentUser() user  →  service reads user.tenantId
  → repository: prisma.model.findMany({ where: { tenantId, ... } })   ← BY HAND
```

The access context is re-resolved from the database on **every** request, not
trusted from the token body alone. The token's `email` is compared against the
stored user's current email; a mismatch invalidates the token.

Key files:

- `services/api/src/common/guards/jwt-auth.guard.ts`
- `services/api/src/common/interfaces/authenticated-request.interface.ts`
- `services/api/src/modules/auth/auth-access.service.ts`
- `services/api/src/common/security/rbac-query-scope.ts` (`buildTenantWhere`)

## What enforces isolation

**Service and repository code, by convention.** Each service reads
`currentUser.tenantId` and passes it into the Prisma `where` clause. Example:
`EmployeesService.findByTenant()` →
`EmployeesRepository.findByTenant(tenantId, query, …)`.

`buildTenantWhere(tenantId, tenantIdField?)` exists in
`common/security/rbac-query-scope.ts` but is **not used universally** — most
call sites inline `{ tenantId }`.

## What does NOT enforce isolation

This section matters more than the previous one.

- **No PostgreSQL row-level security.** No `CREATE POLICY`, no
  `SET LOCAL app.tenant_id`, no session GUC.
- **No global tenant Prisma middleware.** `PrismaService` registers a `$use`
  middleware, but that middleware applies **business-unit** scoping, not tenant
  scoping — `buildScopeWhere()` in
  `services/api/src/common/prisma/prisma.service.ts` filters by
  `accessibleBusinessUnitIds` and `accessibleUserIds`, never by `tenantId`.
- **That middleware does not run.** `@prisma/client@7.8.0` no longer exposes
  `$use`; the constructor checks `typeof this.$use === 'function'`, logs a debug
  line, and returns. Verified:
  `PrismaClient.prototype.$use === undefined` on the installed client. Treat the
  Prisma-level scoping as inactive.
- **No automatic scoping in the generic entity data API.** `modules/data/`
  resolves scope explicitly through `entity-scope.resolver.ts` and
  `entity-permission.resolver.ts`.

**Consequence:** a single repository method that forgets `tenantId` is a
cross-tenant data leak, and nothing in the stack will catch it. This is the
single most important thing to check in review.

## Business-unit context (a separate, narrower concern)

`BusinessUnitAccessMiddleware` (`common/middleware/business-unit-access.middleware.ts`)
runs on every route: it decodes the access token, resolves a BU access context
via `OrganizationAccessService`, sets `req.buAccess`, and stores it in
`RequestContextService` — an `AsyncLocalStorage` store
(`common/request-context/request-context.service.ts`).

This is **intra-tenant** scoping (organization → business unit → team → self),
not tenant isolation. Its Prisma-middleware consumer is inert (above), so the
enforcement that actually happens is the explicit
`buildScopedAccessWhere()` calls in services. See [`rbac.md`](rbac.md).

## Rules

- `tenantId` comes from `request.user.tenantId`. **Never** from a request body,
  query parameter, path parameter or header on an authenticated route.
- `findUnique({ where: { id } })` on a tenant-owned model is unsafe. Use
  `findFirst({ where: { id, tenantId } })`, or verify
  `record.tenantId === user.tenantId` before returning or mutating.
- Writes must be scoped too — `updateMany`/`deleteMany` with `{ id, tenantId }`,
  or read-verify-write inside a transaction.
- Composite uniqueness on tenant-owned models must include `tenantId`
  (`@@unique([tenantId, employeeCode])`). Bare uniqueness on a business key
  collides across tenants.
- Every tenant-owned model gets `@@index([tenantId])` plus
  `@@index([tenantId, <filter column>])` for list screens.
- Background jobs, queue processors and seeds have no request context — pass
  `tenantId` explicitly.
- Cross-tenant access belongs only to the platform path, in `super-admin`,
  `platform-*` and `tenants` modules, explicitly guarded.

## Tenant identity and addressing

- `Tenant` carries `slug`, `tenantCode` and `status`
  (`ONBOARDING`, `PENDING_SETUP`, `ACTIVE`, `INACTIVE`, `SUSPENDED`,
  `ARCHIVED`, `CHURNED`).
- `TenantDomain` supports `SYSTEM_SUBDOMAIN` and `CUSTOM_DOMAIN` with
  `PENDING` / `VERIFIED` / `FAILED` verification.
- System subdomains are provisioned by
  `super-admin/tenant-provisioning.service.ts` as
  `<slug>.<tenantBaseDomain>`, where the base domain comes from the
  `tenant-provisioning` platform setting or `TENANT_BASE_DOMAIN`.
- Frontend tenant resolution: `apps/web/lib/tenant-resolution.ts` derives a
  tenant hint from host, query, cookie or fallback, with a `RESERVED_HOST_LABELS`
  deny list so infrastructure hostnames are never read as tenant slugs.
- The API's `public-tenants` controller serves unauthenticated tenant lookups
  (branding, availability). It must not leak tenant existence in a way that
  enables enumeration.

## The `'platform'` sentinel

`AuditService.log()` treats `tenantId === 'platform'` as "this is a platform
action" and writes to `PlatformAuditLog` instead of `AuditLog`. This is the only
such string sentinel in the codebase. Do not introduce others.

## Provisioning

`super-admin/tenant-provisioning.service.ts` handles domain provisioning;
`super-admin/platform-onboarding.service.ts` and
`super-admin/platform-lifecycle.service.ts` handle onboarding and lifecycle
state; `modules/tenants/` handles tenant CRUD.

Tenant creation and its first admin user must be transactional.

> **Not fully verified:** the complete end-to-end provisioning sequence
> (tenant → domain → subscription → seed → first admin invite) spans several
> services and the Stripe billing flow. Trace it in code before changing it;
> this document does not claim to describe the whole path.

## Known risks

1. Isolation is convention-only — one missing filter is a breach, with no
   backstop.
2. The Prisma middleware reads like a safety net and is not one.
3. Platform-path endpoints legitimately cross tenants; widening a tenant
   endpoint to serve a platform need would be a silent breach.
4. There is no automated test asserting that a tenant user cannot read another
   tenant's records for arbitrary models.
   `test/attendance-integrations-isolation.e2e-spec.ts` covers one area only.
