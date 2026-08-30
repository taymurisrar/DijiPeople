---
aliases: [Data Model Overview, Data Model]
type: architecture
last_verified: 2026-08-30
---

# Data Model Overview

> Measured at `2007fad`. Every number here is re-derivable — run
> `npm run knowledge:data-model` and the counts in [[domain-map]] regenerate from
> the schema. **Do not trust a count in prose; trust the generator.** The note
> this one supersedes claimed "~285 models, ~255 enums" while the schema held 318
> and 299, and nothing announced the drift.

One PostgreSQL database. One schema file —
`services/api/prisma/schema.prisma`, **14,061 lines** — holding **318 models**
and **299 enums**, with **224 migrations** applied. Prisma **7.8** through
`@prisma/adapter-pg`.

## The shape of it

**254 of the 318 models are tenant-scoped**; the other 64 are platform-owned,
global reference data, or commercial records that exist before any tenant does.

The graph has one overwhelming hub. [[entity-tenant|Tenant]] participates in
**246 relation ends** — more than the next four models combined — because every
tenant-owned model must carry a real `tenantId` column and Prisma requires the
reciprocal relation. After it:

| Model | Relation ends | Role |
|---|---|---|
| [[entity-tenant|Tenant]] | 246 | The isolation boundary |
| [[entity-employee|Employee]] | 85 | The people record everything hangs off |
| [[entity-user|User]] | 51 | Membership of a tenant |
| `Contract` | 29 | Commercial agreements |
| `BusinessUnit` | 28 | The row-level access unit |

That shape is a **consequence of the isolation design**, not a modelling
preference. Because isolation is enforced in application code and nowhere else —
no row-level security, no working middleware; see
[[decision-tenantid-is-the-isolation-identity]] — the column has to be physically
present on every owned row.

## Domains

The 318 models group into ten domains by the module that writes them, plus one
residual. Full inventory in [[domain-map]].

Attribution is **by counted Prisma call sites, weighted towards writes** — a
module that only reads a model does not own it. That distinction matters: raw
call counts made `dashboard` the owner of `Employee` and `tenant-control-plane`
the owner of `User`, because reporting modules query more often than owning ones
write.

`Commercial` (68) and `Pay` (53) are the two largest domains. That is worth
knowing before assuming this is primarily an HR product: the platform's own
selling, billing and contracting surface is the biggest thing in the schema.

## Conventions

- `id String @id @default(uuid())`, `createdAt` / `updatedAt`, and
  `createdById` / `updatedById` where an actor matters.
- `tenantId` plus the `tenant` relation on tenant-owned models, with at minimum
  `@@index([tenantId])`.
- `PascalCase` models, `camelCase` fields, `SCREAMING_SNAKE_CASE` enum members.
- **No `@@map`.** Prisma names are the table names.
- Explicit `onDelete` on every relation — **451** use `Cascade`.
- **1,177 `@@index`** and **222 `@@unique`**.

### Composite uniqueness, always tenant-first

A business key is unique *within a tenant*, never globally:
`@@unique([tenantId, employeeCode])`. A bare unique on a business key is a
tenant-isolation defect even when it compiles, because it makes one tenant's data
entry fail on another tenant's value.

[[entity-employee|Employee]] additionally carries `@@unique([id, tenantId])`,
which exists so other models can reference it with a **composite** foreign key —
a reference that structurally cannot cross a tenant boundary.

The exceptions are deliberate and few: [[entity-tenant|Tenant]]`.slug` and
`.tenantCode` are globally unique because routing resolves on them, and
[[entity-identity|Identity]]`.email` is globally unique because an identity spans
tenants by design.

## Soft delete is nearly absent

**Exactly two models carry `isDeleted`**: [[entity-employee|Employee]] and
`CustomDataRecord`. `DemoSeedBatch` has `deletedAt` without `isDeleted`.

That is 2 of 318. Do not assume soft delete exists, do not filter on a column
that is not there, and do not add one to a model without updating every query
that reads it.

## Where the schema and the code disagree

Discovery found three categories of model that no module writes:

- **6 seed-owned** — `LegalDocument`, `NotificationRule`, `NotificationTemplate`,
  `ProjectRole`, `ClaimApproval`, `Subprocessor`. Written by
  `services/api/prisma/seed-*`, read at runtime. **Working as designed.**
- **1 read but never written anywhere** — `SlaRule`.
- **13 with no Prisma call site at all**, in modules or seeds.

The last two categories are recorded, with evidence, in [[known-gaps]]. They are
tables that exist in every deployed database and that no code path can populate.

## Working on the schema

`schema.prisma` is a **single-writer file** across all sessions. Two tasks
editing it conflict constantly, and two agents running `prisma migrate dev`
against a shared database corrupt each other's migration state.

Run `npm run db:preflight` before any work on a database-backed screen. A local
database a few migrations behind is invisible until the Prisma client is
regenerated, and then every query touching a new column returns `P2022` on
whichever screen reaches it first — which reads as a regression in that screen
and is not one.

Destructive changes — dropping a column, model or enum value, narrowing a type,
adding `NOT NULL` without a default, changing a unique constraint — need an
ExecPlan with backfill and rollback, done in expand/backfill/contract phases.

## Related

[[domain-map]] · [[entity-tenant|Tenant]] · [[entity-employee|Employee]] ·
[[entity-user|User]] · [[entity-identity|Identity]] · [[database-architecture]] ·
[[tenant-isolation]] · [[multi-tenancy]] ·
[[decision-tenantid-is-the-isolation-identity]] · [[known-gaps]] ·
[[contradictions]] · [[discovery-status]] · [[glossary]]
