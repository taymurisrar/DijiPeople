# Bug Pattern — Tenant Filter Missing

## Pattern
A query reaches a tenant-owned record without comparing `tenantId` to the
caller's tenant, allowing cross-tenant read or write.

## Why it happens in DijiPeople
Tenant isolation is **enforced only by hand-written `where` clauses**. There is
no PostgreSQL row-level security, and the `$use` middleware in `PrismaService`
scopes by business unit — not tenant — and does not execute at all on Prisma 7
because `$use` no longer exists on the client. Nothing catches an omission.

The failure is usually *partial*: one branch of a method compares tenant and a
neighbouring, more privileged branch does not.

## Example architecture area
`ErrorLogsService.findForUser` returned the log on support role alone, with no
`log.tenantId === user.tenantId` comparison — while the owner branch immediately
below it did compare. A tenant `system-admin` holding a foreign traceId read
another tenant's error log, including request details and path.

## Detection checklist
- Every Prisma call in the diff: is the model tenant-owned?
- Does the `where` include `tenantId`, sourced from `request.user.tenantId`?
- `findUnique` by bare id on a tenant-owned model → unsafe by construction.
- Are **writes** scoped, not only reads?
- Do **all** branches compare tenant, including role-privileged shortcuts?
- Background jobs, queue processors and seeds: is `tenantId` passed explicitly?

## Required regression test
A caller in tenant A requesting a tenant-B identifier receives the same result
as for a non-existent identifier — no existence disclosure through a different
status code or message.

## Agent responsible
Backend/API; Database for model-level constraints.

## Reviewer check
Never accept "`tenantId` is included" based on the happy path. Check every
branch, especially the privileged one.

## QA check
Cross-tenant identifier scenario for every read and write path touched, plus an
assertion that denial and non-existence are indistinguishable.

## Prevention rule
Tenant filtering is necessary, not sufficient, and it must be on every branch.
The query you write is the only boundary that exists.
