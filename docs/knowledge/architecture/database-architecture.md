# Database Architecture

> Generated from repository evidence at `ad8f77f`. Counts move; re-derive rather
> than trusting them if your branch differs.

Prisma **7.8** with `@prisma/adapter-pg` against PostgreSQL. A **single schema
file**: `services/api/prisma/schema.prisma` — ~11,800 lines, ~285 models, ~255
enums, with ~191 migrations. Configured by `services/api/prisma.config.ts`;
every Prisma CLI call passes `--config prisma.config.ts`.

## Conventions

- `id String @id @default(uuid())`, `createdAt` / `updatedAt`,
  `createdById` / `updatedById` where an actor matters.
- `tenantId` + `tenant` relation on tenant-owned models.
- `PascalCase` models, `camelCase` fields, `SCREAMING_SNAKE_CASE` enum members.
- **No `@@map`** — Prisma names are the table names.
- Explicit `onDelete` on every relation (424 use `Cascade`).
- ~1,080 `@@index` and ~210 `@@unique`. Index every foreign key you filter on,
  and every `(tenantId, <filter column>)` pair a list screen sorts or filters by.

**Soft delete is not universal.** Only a handful of models carry `isDeleted`
(`Employee` is one). Do not assume it exists; do not add it without updating
every query that reads it.

## The one file everyone wants to edit

`schema.prisma` is a **single-writer file**. Two tasks editing it conflict
constantly, and a bad merge silently changes the database. Two agents running
`prisma migrate dev` against a shared dev database corrupt each other's
migration state. Both are named explicitly as bad parallelisation.

## Migrations

Timestamped directories, created locally with `npm run prisma:migrate:dev`.

**Never hand-edit an applied migration. Never delete one. Never run
`migrate reset` or `db push` against a shared database.** Deployment applies
them with `prisma migrate deploy`, wrapped by `npm run release:api`.

Destructive changes — dropping a column, model or enum value, narrowing a type,
adding a `NOT NULL` column without a default, changing a unique constraint —
require an ExecPlan with an explicit backfill and rollback section, done in
**expand → backfill → contract** phases.

## Constraints are where correctness actually lives

`CustomerAccount.leadId` is a plain nullable foreign key with a **non-unique**
index, and the "already converted?" pre-check runs outside the conversion
transaction. A concurrent double-conversion test produced one customer — but it
was not *prevented*, it simply did not race. [[ITEM-0005]].

Contrast `PartnerInquiry`, which deduplicates on a `submissionHash` at the data
layer and therefore cannot race at all. The difference is a constraint, not
code.

## Seeds

`seed-config` (production-safe system configuration), `seed-admin` (platform
super admin), `seed-demo`, `seed-platform-workflows`.

**A new required configuration row must be added to `seed-config` and verified
by `verify-seed-config`, or fresh deploys break.**

A seed that does not validate itself against the catalogue it seeds into
produced [[BUG-0012-onboarding-created-by-lead-conversion-was-born-uneditable]]:
every converted customer's onboarding was born un-editable. Pattern:
[[unvalidated-seed-state]].

## Testing against a real database

Mocked Prisma returns whatever it was told, so it can "prove" a foreign key the
schema does not have. Schema, migration, constraint, tenant-scoping and seed
changes **cannot** be signed off against a mock.

CI runs an ephemeral PostgreSQL service in the `database-migration` job, which
applies the entire committed migration history to an **empty** database — which
is exactly what a new deployment does. `scripts/assert-test-database.mjs` fails
closed on any host it does not recognise as disposable.

## Related

[[multi-tenancy]] · [[api-architecture]] · [[qa-and-ci-architecture]] ·
[[deployment-architecture]]

Source: root `AGENTS.md`, `services/api/prisma/AGENTS.md`,
`.agent/context/database-prisma.md`, `docs/architecture/database.md`,
`docs/seed-architecture.md`.
