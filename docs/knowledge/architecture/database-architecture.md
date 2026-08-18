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

## The lifecycle, and who owns it

Four artefacts must agree, always:

```
schema.prisma → migration state → generated Prisma Client → local PostgreSQL → application
```

When they disagree the application fails in a way that points **everywhere
except the cause**. This has happened three times and cost hours each:

| Record | What broke | What it looked like |
|---|---|---|
| [[BUG-0060]] | Client a day behind the schema | 60 TypeScript errors naming application code, none of it wrong. CI green throughout, so it read as a branch defect |
| [[BUG-0068]] | The same guard, blind to **field**-level drift | Adding a scalar to an existing model passed the check and produced 8 errors saying the property does not exist — the guard reported healthy while the failure it exists to prevent was happening |

**The Database Agent owns prevention of this class.** Not the developer who hits
it, not Backend/API, not CI — CI regenerates the client on every run and is
therefore structurally incapable of noticing local staleness.

`node scripts/db-preflight.mjs` resolves it in one read-only pass:

```
DATABASE_AGENT_STATUS · SCHEMA_STATUS · MIGRATION_STATUS
PRISMA_CLIENT_STATUS · LOCAL_DATABASE_STATUS
DATABASE_WRITE_REQUIRED · DATABASE_WRITE_LEASE_STATUS
```

`UNKNOWN` is not a resting state. It means nobody looked, which is the condition
all three defects above started from. Before dependent development,
`PRISMA_CLIENT_STATUS = CURRENT`; before DB-backed validation, `MIGRATION_STATUS`
and `LOCAL_DATABASE_STATUS` too.

### Ownership boundaries

| Role | May |
|---|---|
| **Database** | Design and author schema, migrations, constraints, indexes, backfills. Exclusive |
| **Backend/API** | *Request* a schema change. Never author one |
| **Release/DevOps** | *Execute* migrations during deployment. Never design one |
| **QA** | Validate behaviour against a real database |
| **Reviewer** | Independently review migration safety |

A release that applies a migration requires the Database handoff to exist —
`ROLLBACK_CLASSIFICATION` in particular, because that is what decides whether a
bad deploy can be reversed at all.

### One writer, across every chat

Schema and migrations are single-writer **globally**, not per session. There is
one logical `DATABASE_WRITE_LEASE`, and it is the existing `schema` lease — no
second locking system:

```bash
node scripts/session.mjs list      # DATABASE_WRITER: <session or none>
node scripts/session.mjs lease acquire schema --session SESSION-nnnn --reason "…"
```

**Reads are parallel; writes are exclusive.** Any number of sessions may run a
preflight or inspect the schema simultaneously. A session refused the lease
records `HELD_BY_OTHER` and continues its independent work — the schema work
package is `DEPENDENCY_BLOCKED`, the task is not.

Worktrees typically share one `DATABASE_URL`, so two agents running `migrate dev`
against it corrupt each other's migration state. That is the concrete reason the
lease is global rather than advisory.

### Repair, and where it stops

Non-destructive repair is automatic: `prisma generate` for a stale client,
`migrate deploy` for unapplied migrations, `seed:config` + `seed:verify` for
missing configuration.

**`MIGRATION_DRIFT` is never repaired automatically.** Drift means the applied
history and the committed history disagree; the usual "fixes" are `migrate reset`
and `db push`, both of which lose data and destroy the evidence of how the two
diverged. Diagnose it.

No reset and no data loss without evidence and a stated migration strategy.
Destructive changes — dropping a column, model or enum member, narrowing a type,
adding `NOT NULL` without a default, changing uniqueness on a populated table —
need an ExecPlan with backfill and rollback, expand/backfill/contract phasing,
Reviewer approval, and validation against a real PostgreSQL.

## Related

[[multi-tenancy]] · [[api-architecture]] · [[qa-and-ci-architecture]] ·
[[deployment-architecture]] · [[security-architecture]] · [[ci-architecture]]

The role that owns this: `.agent/agents/database.md`. The preflight that
enforces it: `scripts/db-preflight.mjs`.

Source: root `AGENTS.md`, `services/api/prisma/AGENTS.md`,
`.agent/context/database-prisma.md`, `docs/architecture/database.md`,
`docs/seed-architecture.md`.
