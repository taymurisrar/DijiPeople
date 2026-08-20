# Tenant Isolation

> Generated from repository evidence at `b1c09ac`.

## Purpose

The single most important invariant in this codebase: one database, many
tenants, and no row may cross between them. Every other guarantee — payroll
correctness, document confidentiality, audit integrity — sits on top of this one.

## How it actually works

It is enforced **by convention, in application code**, and by nothing else.

1. The JWT carries `tenantId`. `JwtAuthGuard`
   (`services/api/src/common/guards/jwt-auth.guard.ts`) verifies the token with a
   per-client secret (`web`, `admin`, `agent-desktop`), checks the token's
   `appClientId`/`aud` matches the requesting client, confirms the session row is
   still live, then loads the access context.
2. That produces `request.user: AuthenticatedUser` carrying `userId`, `tenantId`,
   `roleIds`, `roleKeys`, `permissionKeys`, `rolePrivileges`, `accessContext` and,
   for platform admins, `platform`.
3. **Services then pass `user.tenantId` into every Prisma `where` clause by
   hand.**

## What does not exist

Read this twice before assuming a safety net catches a mistake:

- **No PostgreSQL row-level security.**
- **No global tenant Prisma middleware.** `PrismaService` registers a `$use`
  middleware, but it scopes by *business unit*, not tenant — and on the installed
  `@prisma/client` `$use` is unavailable, so it is effectively inert.
- **No automatic tenant filter** in the generic entity data API; `modules/data/`
  resolves scope explicitly through `entity-scope.resolver.ts`.

The query is the only boundary. That is why a single missing `where` clause is
scored CRITICAL here rather than HIGH.

## Important rules

- Take `tenantId` from `request.user`. **Never** from a body, query string, path
  param or header, and never accept it as client input on an authenticated route.
- `findUnique` by bare id is unsafe on a tenant-owned model. Use `findFirst` with
  `{ id, tenantId }`, or re-verify `record.tenantId === user.tenantId` before
  returning or mutating.
- Writes are scoped too: `updateMany`/`deleteMany` with `{ id, tenantId }`, or
  read-verify-write inside a transaction.
- Cross-tenant reads are legitimate only on the **platform** path
  (`authSubjectType: 'platform-user'`, `user.platform` present), in the
  `super-admin`, `platform-*` and `tenants` modules, explicitly platform-guarded.
  Never widen a tenant endpoint to serve a platform need.
- `tenantId: 'platform'` routes audit rows to `PlatformAuditLog`. It is the only
  string sentinel — do not invent others.
- Background jobs, queue processors and seeds carry no request context. They take
  `tenantId` as an explicit argument and thread it through.
- New tenant-owned models need `tenantId`, the `tenant` relation and at minimum
  `@@index([tenantId])`. Composite uniqueness includes `tenantId`
  (`@@unique([tenantId, employeeCode])`), never a bare business key.

## How it has failed before

Both recorded failures were *partial* isolation, which is the dangerous shape —
the file looks tenant-aware because most of it is.

- [[BUG-0005]] — `findForUser` compared tenants on one branch and not on the
  support-role branch three lines above it. The first fix covered foreign tenant
  ids but treated a null `tenantId` as belonging to every caller, so it was
  reopened; the rule is now exact equality, and null/platform-scope rows are
  excluded from tenant endpoints entirely.
- [[BUG-0058]] — organization structure reads resolved targets by a bare
  tenant-keyed lookup, which is tenant-safe but scope-blind: being *in* the
  tenant was treated as authority to reshape it.

Object-level authorization is a **separate** step. Owning the right permission is
not owning the record — see `buildScopedAccessWhere()` and
`resolveEffectiveAccessLevel()` in `common/security/rbac-query-scope.ts`.

## Related

[[multi-tenancy]] · [[tenant-filter-missing]] · [[BUG-0005]] · [[BUG-0058]] ·
[[workspace-routing-and-domains]] · [[audit-and-events]]
