# Database and Prisma

> **Last verified:** 2026-08-20
> **Verified against commit:** bab45ad
> **Key source files:** services/api/prisma/schema.prisma, services/api/prisma.config.ts, services/api/package.json, package.json, render.yaml, services/api/src/common/prisma/prisma.service.ts, services/api/prisma/create-prisma-client.ts, services/api/prisma/seed-config.ts, services/api/prisma/verify-seed-config.ts, services/api/prisma/seed-admin.ts, services/api/prisma/seed-demo.ts, services/api/prisma/seed-platform-workflows.ts, docs/development/git-worktrees.md
>
> This document describes the repository, it is not authority over it. If the
> code disagrees, the code is current truth — report the discrepancy and
> recommend a context update.

## CURRENT

### Stack

Prisma **7.8.0** (`services/api/package.json:53-54,101` request `^7.8.0`;
`package-lock.json:4561-4562` resolves `7.8.0`) against PostgreSQL through the
driver adapter `@prisma/adapter-pg`.

`schema.prisma:6-13`:
```prisma
generator client { provider = "prisma-client-js"  engineType = "client" }
datasource db   { provider = "postgresql" }
```
Note the datasource declares **no `url`** — the connection string comes from
`prisma.config.ts:12-14` (`datasource: { url: env('DATABASE_URL') }`) for CLI
work, and at runtime from `new PrismaPg({ connectionString: process.env.DATABASE_URL })`
in `common/prisma/prisma.service.ts:19-26` and `prisma/create-prisma-client.ts:5-12`.
Both throw `'DATABASE_URL is required.'` when it is empty.

**Consequence:** `prisma generate` and `prisma validate` need `DATABASE_URL`
present in the environment even though they never open a connection, because
`prisma.config.ts` resolves `env('DATABASE_URL')` eagerly. `prisma.config.ts:3`
imports `dotenv/config`, so `services/api/.env` satisfies this locally.

### Schema shape (counted at this commit)

| Metric | Count |
|---|---|
| Lines in `schema.prisma` | 10,436 |
| `model` declarations | 292 |
| `enum` declarations | 267 |
| Models declaring a `tenantId` field | 235 |
| `@@index` blocks | 1,105 |
| `@@unique` blocks | 215 |
| `@@map` | **0** |
| `onDelete:` clauses | 775 (`Cascade` 430, `SetNull` 202, `Restrict` 143) |
| Migration directories | 200 (`20260407175455_init_auth_foundation` … `20260817110000_customer_lead_unique`) |

> Measured at `3f9063f`, and reconciled with `AGENTS.md`, which now carries the
> same figures.
>
> This note previously called the `AGENTS.md` figures "stale and overstated" and
> misquoted them as 1,076 `@@index` where that file said 1,080. Both documents
> were in fact stale in the *same* direction — the schema only grows — and the
> table above was the older of the two, having been measured at `8682dc1` while
> `AGENTS.md` was measured at `78716c4`. A correction that is itself uncounted
> is just a second stale claim; re-derive with the commands in this file's
> closing section before quoting either source.

There is exactly **one** schema file. `prisma/migrations/migration_lock.toml`
pins `provider = "postgresql"`.

### Naming, fields and relations

- Primary keys: `id String @id @default(uuid())`. Timestamps `createdAt` /
  `updatedAt` on essentially every model. Actor columns `createdById` /
  `updatedById` where an actor is meaningful.
- Tenant-owned models: `tenantId String` + a `tenant` relation +
  `@@index([tenantId])`, and composite uniqueness that **includes** `tenantId`.
- `PascalCase` models, `camelCase` fields, `SCREAMING_SNAKE_CASE` enum members.
- **No `@@map` anywhere** — the Prisma model name *is* the table name, so a
  model rename is a table rename and requires a migration you inspect by hand.
- Every relation carries an explicit `onDelete`: `Cascade` for owned children,
  `SetNull` for optional references (actor columns, optional lookups),
  `Restrict` where deletion must be blocked. Two relations connecting the same
  pair of models get explicit relation names.

### Soft delete is NOT universal

Only **two** models carry `isDeleted`:
- `Employee` — `schema.prisma:4250` (`isDeleted Boolean @default(false)`), paired
  with `deletedAt`; queries filter both, e.g.
  `services/api/src/modules/employees/employees.repository.ts:243`
  (`{ id: employeeId, tenantId, isDeleted: false, deletedAt: null }`) and
  `jwt-auth.guard.ts:197-204`.
- `CustomDataRecord` — `schema.prisma:9976`, with five composite indexes that
  include `isDeleted` (`:9984-9988`).

Everything else is a hard delete. Do not assume `isDeleted` exists on a model,
and do not add it without updating every existing query that reads that model.

### Tooling — every CLI call passes `--config prisma.config.ts`

From `services/api/package.json`:
`prisma:validate`, `prisma:generate`, `prisma:migrate:dev`,
`prisma:migrate:deploy`, `prisma:migrate:status`, `prisma:studio`,
`prisma:seed` — all `prisma <cmd> --config prisma.config.ts`. Root
`package.json` re-exports these as `npm run prisma:*` delegating to the `api`
workspace. `prisma.config.ts:10` points `db seed` at
`ts-node prisma/seed-demo.ts`.

`services/api/package.json` `build` runs `clean:dist && prisma:generate && nest
build` — a build regenerates the client, so a schema edit is picked up by a
build but **not** by `start:dev` alone.

### Seeds

| Script | File | Purpose |
|---|---|---|
| `seed:config` (alias `seed:system`) | `prisma/seed-config.ts` | Production-safe system configuration; exports `verifyRequiredSeedData` |
| `seed:verify` | `prisma/verify-seed-config.ts` | Loads `.env`, lists all tenants, calls `verifyRequiredSeedData(prisma, tenants)`; throws if `DATABASE_URL` is unset (`:11-14`) |
| `seed:admin` | `prisma/seed-admin.ts` | Platform super admin |
| `seed:demo` / `seed:demo:reset` / `seed:demo:reseed` | `prisma/seed-demo*.ts` | Demo tenant data — **destructive** |
| `seed:platform-workflows` | `prisma/seed-platform-workflows.ts` | Platform workflow definitions |
| `seed:payroll-flow` | `prisma/seed-payroll-flow.ts` | Payroll fixture data |
| `seed:all` | — | `seed:admin && seed:config && seed:platform-workflows && seed:demo` |

### Release chain

`npm run release:api` → `npm --workspace api run release` →
`prisma:migrate:deploy && seed:config && seed:verify && seed:admin &&
seed:legal && legal:publish -- --confirm`
(`services/api/package.json`), wired as `preDeployCommand`
(`render.yaml:8`); `buildCommand` / `startCommand` (`render.yaml:6-7`) do **not**
touch the database. A required configuration row missing from `seed-config.ts`
or from `verifyRequiredSeedData` therefore either breaks fresh deploys or fails
the pre-deploy and blocks the release.

### Worktree hazard

`docs/development/git-worktrees.md:150-172`: `.env` files are gitignored and are
**not** copied into a new worktree; the documented remedy is to copy the main
checkout's `.env` in — so **every worktree points at the same `DATABASE_URL` by
default**. Two agents running `prisma migrate dev` corrupt each other's
`_prisma_migrations` state, and a `seed:demo:reset` in one worktree destroys
another's data. The rule is single-writer: only the agent owning the schema task
runs migrations; independent migration work needs its own database and
`DATABASE_URL`.

## Key abstractions

| Symbol | Where | Note |
|---|---|---|
| `PrismaService` | `common/prisma/prisma.service.ts:12` | Nest-injected `PrismaClient` with `PrismaPg` adapter; `onModuleInit → $connect` |
| Dead `$use` block | `prisma.service.ts:28-105` | Business-unit scoping middleware, guarded by `typeof this.$use === 'function'`; `$use` does not exist on client 7.8.0, so it never runs. See `.agent/context/tenant-context.md` |
| `createPrismaClient()` | `prisma/create-prisma-client.ts:4` | Standalone client factory used by every seed/backfill script |
| `prisma.config.ts` | `services/api/prisma.config.ts` | Schema path, migrations path, seed command, datasource url |
| `verifyRequiredSeedData` | `prisma/seed-config.ts` (consumed at `verify-seed-config.ts:4,21`) | Deploy-time assertion that required config rows exist |
| `Prisma.TransactionClient` | throughout repositories | Repositories accept `PrismaService \| Prisma.TransactionClient` so callers compose `$transaction` |

## Known exceptions

- `AuthAccessService.loadAccessContext` uses `findUnique` on `User` by bare id
  and then compares `user.tenantId` explicitly
  (`modules/auth/auth-access.service.ts:71,147`). Safe only because of the second
  half.
- `loadPlatformAccessContext` uses `findUnique` on `PlatformUser`
  (`auth-access.service.ts:14`) — `PlatformUser` is platform-owned, not
  tenant-owned, so no tenant filter applies.
- `PayrollCycle` / `ProcessingCycle` carry a **nullable** `businessUnitId`
  (tenant-wide cycles), which is why the dead scope helper special-cases
  `OR: [{ businessUnitId: null }, …]` (`prisma.service.ts:282-286`).
- `AuditLog` vs `PlatformAuditLog` are separate models selected by the
  `tenantId === 'platform'` sentinel (`modules/audit/audit.service.ts:28`).
- `prisma db seed` runs the **demo** seed (`prisma.config.ts:10`), not the config
  seed. Never run it against a shared or production database.

## Anti-patterns to avoid

1. Hand-editing or deleting an already-applied migration directory. The checksum
   in `_prisma_migrations` will not match and `migrate deploy` will fail on every
   environment that already applied it.
2. `prisma migrate reset` or `prisma db push` against a shared `DATABASE_URL`.
   Both are data-destroying and both bypass the migration history.
3. Running a Prisma CLI command without `--config prisma.config.ts` — the
   datasource has no inline `url`, so it resolves nothing sensible.
4. Adding a tenant-owned model without `tenantId`, without the `tenant` relation,
   without `@@index([tenantId])`, or with bare `@@unique([employeeCode])` instead
   of `@@unique([tenantId, employeeCode])`; or any relation without an explicit
   `onDelete`.
5. Adding `@@map` — it breaks the "model name is the table name" invariant.
6. Adding `isDeleted` to a model and leaving existing queries unfiltered — every
   prior read now returns deleted rows.
7. Adding a required configuration row to `seed-config.ts` without a matching
   assertion in `verifyRequiredSeedData`, or vice versa.
8. Dropping a column/model/enum value, narrowing a type, adding `NOT NULL`
   without a default, or changing a unique constraint in a single migration.
9. Assuming the `$use` middleware in `prisma.service.ts` scopes anything. It
   scopes by business unit, and it does not execute.

## TARGET (required going forward)

- **Every schema change ships as a migration created by
  `npm run prisma:migrate:dev`** against a database only you are writing to, and
  is committed together with the `schema.prisma` diff.
- **Destructive changes are staged expand → backfill → contract**, in separate
  migrations across separate deploys:
  1. *expand* — add the new nullable column / new model / new enum value; deploy;
     dual-write.
  2. *backfill* — a data migration or a script under `prisma/` that fills the new
     shape; verify counts.
  3. *contract* — make it required, drop the old column, remove the dual-write.

  Each such change requires an ExecPlan per `PLANS.md` with an explicit backfill
  and rollback section.
- New tenant-owned models declare `tenantId`, the `tenant` relation with explicit
  `onDelete`, `@@index([tenantId])`, `(tenantId, <column>)` indexes for every
  column a list screen filters or sorts by, and composite uniqueness including
  `tenantId`.
- Repositories keep accepting `PrismaService | Prisma.TransactionClient` so
  callers can compose transactions and pass the transaction client to
  `AuditService.log`.
- After any schema edit: `npm run prisma:validate`, `npm run prisma:generate`,
  `npm --workspace api run check-types`, and `npm --workspace api run test`.
- New required configuration rows land in `seed-config.ts` **and**
  `verifyRequiredSeedData`, then are proven with
  `npm run seed:config && npm run seed:verify`.
- Keep the counts in this document and in `AGENTS.md` honest — re-derive them
  rather than copying them forward.

## What the specialist agent MUST verify before changing this

1. **`git status` and `npm run prisma:migrate:status`** before touching the
   schema. An unapplied or drifted migration means someone else owns the
   database; stop and coordinate.
2. **Which `DATABASE_URL` you are pointed at.** In a worktree it is almost
   certainly the same database as the main checkout
   (`docs/development/git-worktrees.md:157-160`). Confirm before any
   `migrate dev`, and never run `seed:demo:reset` on a shared one.
3. **Re-count the schema metrics** (`grep -cE '^model ' schema.prisma`, `^enum `,
   `@@index`, `@@unique`, `ls prisma/migrations | wc -l`) before citing them —
   the numbers above are a snapshot and `AGENTS.md` is already stale.
4. **Re-check whether `isDeleted` exists** on the specific model you are querying
   (`awk '/^model /{m=$2} /isDeleted/{print m}' prisma/schema.prisma`). Only
   `Employee` and `CustomDataRecord` have it at this commit.
5. **Read the generated SQL** in the new migration directory before committing —
   Prisma will emit a destructive `DROP` for a rename it cannot infer.
6. **Confirm the release chain still passes**: `prisma:migrate:deploy` →
   `seed:config` → `seed:verify` → `seed:admin`. A schema change that breaks
   `verifyRequiredSeedData` blocks the Render pre-deploy (`render.yaml:8`), not
   just local work.
7. **Do not repair the dead `$use` block** in `prisma.service.ts` as a side
   effect of a schema change. If it needs to become a Prisma 7 client extension,
   that is its own ExecPlan.
