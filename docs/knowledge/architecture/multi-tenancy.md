# Multi-Tenancy

> Generated from repository evidence at `ad8f77f`.

**The most important invariant in DijiPeople, and the one with the least
mechanical support.** Read this before writing any query.

## How it actually works

1. The JWT carries `tenantId`. `JwtAuthGuard` verifies the token with a
   **per-client secret** (`web`, `admin`, `agent-desktop`), checks the token's
   `appClientId`/`aud` matches the requesting client, confirms the session row
   is still live, then loads the access context.
2. That produces `request.user: AuthenticatedUser` carrying `userId`,
   `tenantId`, `roleIds`, `roleKeys`, `permissionKeys`, `rolePrivileges`,
   `accessContext` (business units, org, teams) and, for platform admins,
   `platform`.
3. **Services then pass `user.tenantId` into every Prisma `where` clause by
   hand.**

## What does NOT exist

- **No PostgreSQL row-level security.**
- **No global tenant Prisma middleware.** `PrismaService` registers a `$use`
  middleware, but it scopes by *business unit*, not tenant — and on the
  installed `@prisma/client@7.8.0` `$use` is unavailable, so it is effectively
  inert. Never treat it as a safety net.
- No automatic tenant filter in the generic entity data API; `modules/data/`
  resolves scope explicitly through `entity-scope.resolver.ts`.

**The query you write is the only thing protecting the boundary.**

## The rules

- Every query on a tenant-owned model filters `tenantId` taken from
  `request.user.tenantId` — never from a body, query string, path param or
  header.
- `findUnique` by bare id is unsafe. Use `findFirst({ id, tenantId })`, or
  re-verify `record.tenantId === user.tenantId` before returning or mutating.
- Writes are scoped too: `updateMany` / `deleteMany` with `{ id, tenantId }`, or
  read-verify-write inside a transaction.
- Cross-tenant reads are legitimate **only** on the explicitly platform-guarded
  path (`super-admin`, `platform-*`, `tenants`). Never widen a tenant endpoint
  to serve a platform need.
- `tenantId: 'platform'` on an audit row routes to `PlatformAuditLog`. It is the
  only string sentinel; do not invent others.
- Background jobs, queue processors and seeds carry no request context — they
  take `tenantId` as an explicit argument and thread it through.
- A new tenant-owned model carries `tenantId`, the relation,
  `@@index([tenantId])`, and composite uniqueness that **includes** `tenantId`.

## What has actually gone wrong here

- [[BUG-0005-cross-tenant-error-log-read-via-support-role]] — CRITICAL. One
  branch of a two-branch method omitted the tenant comparison; the correct code
  sat three lines below, which is why review missed it. The file *looked*
  tenant-aware.
- [[BUG-0006-organization-structure-mutable-by-any-authenticated-user]] — not a
  leak but a **scope escalation**: business-unit membership feeds
  `accessContext.accessibleBusinessUnitIds`, so editing the org chart widened
  the editor's own data scope.

Pattern: [[tenant-filter-missing]].

Partially untested: tenant erasure is now exercised against a real PostgreSQL
(`tenant-erasure-order.e2e-spec.ts`, `tenant-erasure-dry-run.e2e-spec.ts`), but
nothing yet asserts that erasing one tenant leaves another **intact** —
[[ITEM-0003]]. For a delete walk across ~285 models, that is the assertion a
missing `tenantId` predicate would fail.

## Related

[[system-architecture]] · [[rbac]] · [[authentication]] ·
[[database-architecture]] · [[tenant-workspace-routing]] ·
[[tenant-control-plane]]

Source: root `AGENTS.md` (Tenant Isolation), `.agent/context/tenant-context.md`,
`docs/architecture/tenancy.md`, `docs/qa/regressions/index.md`.
