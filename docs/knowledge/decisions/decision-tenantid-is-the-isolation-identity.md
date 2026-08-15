# Decision — `tenantId` is the isolation identity, enforced by convention

> Generated from repository evidence at `ad8f77f`. Reconstructed from the
> implementation and the standing rules in `AGENTS.md`; no ADR document exists
> for it.

## Decision

Tenant isolation is a **`tenantId` column filtered by hand in every query**, not
a database mechanism and not a deployment boundary.

## What was rejected, and is verifiably absent

- **PostgreSQL row-level security** — not enabled anywhere.
- **A global tenant Prisma middleware** — `PrismaService` registers a `$use`
  middleware, but it scopes by *business unit*, and on `@prisma/client@7.8.0`
  `$use` is unavailable, so it is inert.
- **A database or deployment per tenant.**

## Consequences, stated plainly

**The query you write is the only thing protecting the boundary.** There is no
second line of defence, which is why the rules around it are unusually strict:
`findFirst({ id, tenantId })` rather than `findUnique({ id })`; scoped writes;
`tenantId` never accepted from client input; background jobs taking it as an
explicit argument.

It also makes cross-tenant surfaces a deliberate, separate design. The platform
control plane authorizes **inside services** rather than through decorators,
precisely because the usual control does not apply there.

## Evidence that the cost is real

[[BUG-0005]] — CRITICAL. One branch of a two-branch method omitted the tenant
comparison; the correct code sat three lines below, so the file *looked*
tenant-aware. Nothing mechanical caught it.

That is the decision's bill, and it is worth restating whenever someone proposes
relying on a framework-level guard: **there isn't one.**

## Related

[[multi-tenancy]] · [[database-architecture]] · [[rbac]] ·
[[decision-platform-admin-is-a-separate-identity]] ·
pattern [[tenant-filter-missing]]
