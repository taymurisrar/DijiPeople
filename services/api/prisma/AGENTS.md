# AGENTS.md — `services/api/prisma` (schema, migrations, seeds)

Scope-specific rules for the DijiPeople database layer. Read the root
[`AGENTS.md`](../../../AGENTS.md) and
[`services/api/AGENTS.md`](../AGENTS.md) first.

**This is the highest-risk directory in the repository.** A bad migration is not
revertible by editing a file.

---

## Facts

- Prisma **7.8** (`prisma`, `@prisma/client`) with the `@prisma/adapter-pg`
  driver adapter against PostgreSQL.
- `generator client { provider = "prisma-client-js", engineType = "client" }`.
- **`schema.prisma` is a single ~11,800-line file**: 285 models, 255 enums.
- **191 migrations** in `migrations/`, timestamped
  `YYYYMMDDHHMMSS_snake_case_description`.
- All Prisma CLI invocations pass `--config prisma.config.ts`
  (`services/api/prisma.config.ts`), which sets the schema path, migrations path
  and `DATABASE_URL`.
- `@prisma/client@7.8.0` no longer exposes `$use`. The middleware block in
  `common/prisma/prisma.service.ts` is guarded and skips registration — the
  business-unit scoping it contains does **not** run. Do not add new logic there
  expecting it to execute.

---

## Schema conventions

```prisma
model Thing {
  id          String   @id @default(uuid())
  tenantId    String
  // ... business fields
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  createdById String?
  updatedById String?

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, code])
  @@index([tenantId])
  @@index([tenantId, status])
}
```

- `PascalCase` models, `camelCase` fields, `SCREAMING_SNAKE_CASE` enum members.
- No `@@map` / `@map` — Prisma names are the physical names. Keep it that way.
- `String @id @default(uuid())` for primary keys. No auto-increment ids.
- `createdAt` / `updatedAt` on every primary entity.
- `createdById` / `updatedById` where an actor is meaningful.
- Money: `Decimal` with an explicit `@db.Decimal(p, s)`. **Never `Float` for
  money.** Coordinates already use `Decimal @db.Decimal(10, 7)` in places and
  `Float` in others — follow the neighbouring field, do not "fix" it as a
  drive-by.
- `Json` columns are fine for snapshots, policy payloads and settings values, but
  they are not queryable — do not put anything you must filter or join on there.
- Long explanatory comments on non-obvious fields are the house style (see
  `AttendanceEntry.workedMinutes`). Keep and add them; do not strip them.

### Tenant-owned models

- `tenantId String` + `tenant Tenant @relation(..., onDelete: Cascade)`.
- `@@index([tenantId])` at minimum, plus `@@index([tenantId, <column>])` for
  every column a list screen filters or sorts by.
- **Uniqueness must be tenant-scoped**: `@@unique([tenantId, employeeCode])`,
  never `@unique` on the business key alone. A bare unique on a business key is
  a cross-tenant collision waiting to happen.
- Platform-owned models (`Platform*`, `Plan`, `Lead`, `Partner`,
  `CustomerAccount`, …) intentionally have no `tenantId`. Do not add one to make
  a query easier.

### Relations

- Always specify `onDelete` explicitly. The dominant choices here are `Cascade`
  (424 uses, for child rows that die with the parent) and `SetNull` (for optional
  references such as `Employee.userId`).
- Name the relation (`@relation("ManagerReports", ...)`) whenever two relations
  connect the same pair of models, or Prisma will guess ambiguously.
- Prefer a foreign key + relation over a loose id string. Loose ids exist in
  places; do not add more.

### Soft delete

`isDeleted` exists on only a handful of models (`Employee` among them). It is
**not** a global convention.

- Do not assume `isDeleted` exists on a model — check.
- When it does exist, every read path must filter it, including counts,
  uniqueness checks and relation includes.
- Do not add `isDeleted` to an existing model without auditing and updating
  every query that touches it. That is an ExecPlan-level change.

---

## Migrations

```bash
npm run prisma:validate          # from repo root
npm run prisma:generate
npm run prisma:migrate:status
npm --workspace api run prisma:migrate:dev     # local development only
npm --workspace api run prisma:migrate:deploy  # applied by npm run release:api
```

### Hard rules

- **Never edit a migration that has been applied anywhere.** Fix forward with a
  new migration.
- **Never delete a migration directory.** Never edit `migration_lock.toml`.
- **Never run `prisma migrate reset`, `prisma db push` or `prisma db execute`
  against a shared or production database.** `migrate dev` is for a local
  database you own.
- One agent at a time touches `schema.prisma` and `migrations/`. This is the
  single most conflict-prone path in the repository — treat all schema work as
  `DEPENDENCY_BLOCKED` for everyone else. See
  [`docs/development/parallel-work.md`](../../../docs/development/parallel-work.md).
- Generate the migration from a schema edit; do not hand-write SQL unless the
  change genuinely cannot be expressed in the schema, and then say so in the
  plan.
- After any schema change, run `npm run prisma:generate` before typechecking
  anything that imports `@prisma/client`. Backend and frontend type errors after
  a schema change are usually a stale client.

### Destructive changes

Dropping a column, model or enum member; renaming; narrowing a type; adding a
`NOT NULL` column without a default; changing or adding a unique constraint on a
populated table — all require an ExecPlan with a written backfill and rollback
plan, and should be staged:

1. **Expand** — add the new column/table/enum member, nullable or defaulted;
   deploy; write to both shapes.
2. **Backfill** — a script under `prisma/` (see `backfill-attendance.ts`,
   `backfill-default-views.ts` for the existing pattern), idempotent and
   tenant-safe, runnable more than once.
3. **Contract** — only after all readers are migrated, remove the old shape in a
   later migration.

Enum members can be added safely; **removing or renaming an enum member breaks
rows that already hold it**. Adding a member requires auditing every `switch`
and every exhaustive mapping in the API and both frontends.

---

## Seeds and provisioning

| Script | Purpose | Safe in production |
|---|---|---|
| `seed-config.ts` (`npm run seed:config`) | System configuration: permissions, roles, catalogs, defaults | **Yes** — runs on every release |
| `verify-seed-config.ts` (`npm run seed:verify`) | Asserts the configuration seed produced what it must | Yes |
| `seed-admin.ts` (`npm run seed:admin`) | Bootstraps the platform super admin from env vars | Yes |
| `seed-platform-workflows.ts` | Platform governed workflows | Yes |
| `seed-demo.ts` / `seed-demo-reset.ts` | Demo tenant data | **No** |
| `seed-payroll-flow.ts` | Payroll validation fixture, excluded from `seed:all` | No |

`npm run release:api` = `prisma:migrate:deploy` → `seed:config` → `seed:verify`
→ `seed:admin`. This is what Render runs as `preDeployCommand`.

Rules:

- Every seed must be **idempotent**. Re-running must not duplicate rows.
- A new permission key, role, system view, catalog entry or required
  configuration row **must** be added to `seed-config.ts` and asserted in
  `verify-seed-config.ts`. Otherwise a fresh deployment comes up missing it and
  the failure surfaces as a confusing authorization or runtime error.
- Demo seeds mark rows with `isDemoData` / `demoBatchId`. Preserve that so
  `seed:demo:reset` can clean up.
- Seeds run without a request context. They must pass `tenantId` explicitly
  everywhere.
- See [`docs/seed-architecture.md`](../../../docs/seed-architecture.md).

---

## Checklist for a schema change

- [ ] `tenantId` present, indexed, and part of every composite unique on a
      tenant-owned model
- [ ] `onDelete` specified on every new relation
- [ ] Indexes cover the new filter/sort columns
- [ ] Money is `Decimal` with explicit precision
- [ ] Migration generated, never hand-edited, name describes the change
- [ ] `npm run prisma:generate` run, then `npm run typecheck`
- [ ] `npm run prisma:validate` passes
- [ ] Backfill script written and idempotent, if data must move
- [ ] `seed-config.ts` + `verify-seed-config.ts` updated if configuration was added
- [ ] Rollback described in the plan
- [ ] Repository/service queries updated so nothing reads the old shape
