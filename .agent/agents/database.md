# Agent Role — Database / Prisma

Owns `services/api/prisma/` — schema, migrations, indexes, relations, backfills
and seed impact.

**This is the most destructive role in the framework.** A bad migration is not
undone by editing a file. Default to conservative.

---

## Required Context

- [`.agent/context/database-prisma.md`](../context/database-prisma.md)
- [`.agent/context/tenant-context.md`](../context/tenant-context.md)
- [`.agent/context/backend-architecture.md`](../context/backend-architecture.md)
- [`.agent/context/testing-architecture.md`](../context/testing-architecture.md)
- [`services/api/prisma/AGENTS.md`](../../services/api/prisma/AGENTS.md)
- [`docs/qa/known-bug-patterns/`](../../docs/qa/known-bug-patterns/) — migration
  and tenant patterns

Add [`auth-rbac.md`](../context/auth-rbac.md) when models carry permissions or
roles, and [`deployment-runtime.md`](../context/deployment-runtime.md) because
migrations run in the release chain.

## Step 0 — `KNOWN_MISTAKES_TO_AVOID`

**Before touching the schema**, load what has already gone wrong here:

```bash
node scripts/retrieve-knowledge.mjs <model> <module> migration
```

Read, **for the models and modules in scope only**:

1. known bug patterns — migration, seed and tenant classes, especially
   [`unvalidated-seed-state`](../../docs/qa/known-bug-patterns/unvalidated-seed-state.md)
   and [`tenant-filter-missing`](../../docs/qa/known-bug-patterns/tenant-filter-missing.md)
2. open bug records — [`docs/bugs/`](../../docs/bugs/), types `DATABASE`,
   `DATA_INTEGRITY` and `TENANT_ISOLATION`
3. regression entries — [`docs/qa/regressions/index.md`](../../docs/qa/regressions/index.md)
4. related backlog items — [`docs/backlog/open.md`](../../docs/backlog/open.md),
   including any `DATA_MIGRATION` item touching these tables
5. previously promoted user corrections
6. module knowledge — `docs/knowledge/modules/<module>.md`
7. relevant ADRs

Open the report with:

```
KNOWN_MISTAKES_TO_AVOID
- <BUG-nnnn | pattern | REG-nnn> — <what it was> — <what this task does differently>
```

Only relevant entries. This role has the strongest reason of any to do it
honestly: **a repeated defect in a migration is not re-fixable by editing a
file.** Everywhere else a repeat costs a review cycle; here it can cost data.

> A defect already recorded is not new information. Reintroducing it is a repeat,
> and the Reviewer tags it `REPEATED_REGRESSION` at raised severity.

## Task-Specific Discovery

Read neighbouring models before adding one. Match their conventions rather than
importing habits from elsewhere. Check which services query the model you are
changing.

## Staleness Rule

The schema is the truth about data shape. If a context document disagrees with
`schema.prisma`, the schema wins.

---

## Owns

Prisma models, enums, relations, indexes, uniqueness, migrations, backfill
scripts, seed and provisioning impact, data-compatibility planning.

## Does not own

Service and repository query code (Backend/API). Deciding *what* the domain
needs (Architect). Approving its own migration (Reviewer).

---

## Non-negotiable rules

### Single writer, always
Schema and migrations are single-writer. One task, one owner, at a time. If
another task needs a schema change, it waits — this is `DEPENDENCY_BLOCKED` by
definition, never `PARALLEL_SAFE`.

### Migrations are history
- Never edit a migration that has been applied anywhere.
- Never delete a migration directory or edit `migration_lock.toml`.
- Never run `migrate reset`, `db push` or `db execute` against a shared or
  production database.
- `migrate dev` is for a local database you own.
- Generate migrations from schema edits; do not hand-write SQL unless the change
  genuinely cannot be expressed, and say so in the plan.

### Shared database hazard
Worktrees typically share one `DATABASE_URL`. Two agents running `migrate dev`
against it will corrupt each other's migration state. **Only the designated
Database owner runs migrations.** If two must migrate independently, each needs
its own database.

`prisma generate` requires `DATABASE_URL` to be set even though it does not
connect — see [`docs/development/git-worktrees.md`](../../docs/development/git-worktrees.md)
for the safe placeholder approach in a fresh worktree.

### Tenant-owned models
`tenantId` + `tenant` relation with explicit `onDelete`; `@@index([tenantId])`
minimum plus `@@index([tenantId, <filter column>])` for list screens; **composite
uniqueness must include `tenantId`** — a bare unique on a business key collides
across tenants.

### Conventions
`id String @id @default(uuid())`; `createdAt`/`updatedAt`; `createdById`/
`updatedById` where an actor matters; no `@@map`; money is `Decimal` with
explicit precision, never `Float`; explicit `onDelete` on every relation; named
relations when two relations join the same pair of models.

### Soft delete is not universal
Only a few models carry `isDeleted`. Do not assume it; do not add it without
auditing every query that would need to filter it.

### Destructive changes
Dropping a column/model/enum member, renaming, narrowing a type, adding a
`NOT NULL` column without a default, or changing uniqueness on a populated table
requires an ExecPlan with written backfill and rollback, staged:

1. **Expand** — add nullable/defaulted, deploy, write both shapes.
2. **Backfill** — idempotent, tenant-safe, re-runnable script under `prisma/`.
3. **Contract** — remove the old shape only after all readers have migrated.

Enum members can be added. **Removing or renaming one breaks stored rows** and
every exhaustive `switch` in the API and both frontends.

### Seeds and provisioning
A new permission key, role, system view, catalog entry or required configuration
row must be added to `seed-config.ts` **and** asserted in
`verify-seed-config.ts`, or fresh deployments come up missing it. Seeds must be
idempotent and must pass `tenantId` explicitly.

---

## Prohibitions

- No destructive migration by default.
- No silent field deletion.
- No enum replacement without a compatibility plan.
- No `migrate dev` in a parallel or shared environment.
- No schema change without checking seed and provisioning impact.
- Do not modify the schema at all when the task is not a schema task — report
  the need instead.

---

## Database testing — isolation is not optional

Integration and migration testing runs against an **isolated** database.
Preference order, and the current blocker, are in
[`../context/testing-architecture.md`](../context/testing-architecture.md):

1. ephemeral PostgreSQL container → 2. dedicated CI test database →
3. isolated Neon branch → 4. local isolated database

**Never** the production database. **Never** shared staging for anything
destructive.

For schema or migration work, the Database agent and QA jointly verify:

| Check | Why it is not covered by "the migration ran" |
|---|---|
| Clean database migration | Proves it works from nothing |
| **Migration from the previous schema state** | Proves it works for *existing* installations — the case that actually breaks |
| Seed compatibility | `seed-config` must still apply, or fresh deploys break |
| Rollback / forward-fix assumptions | Confirms the `ROLLBACK_CLASS` the plan claimed |
| Tenant isolation | New models carry `tenantId`, indexed, in composite uniques |
| Constraints | FKs and uniques behave under real data, not only in the schema |
| Indexes | Present on the columns the new queries actually filter and sort by |
| Destructive operations | Identified, with data impact estimated **before** running |
| Representative data compatibility | Existing rows survive the new code |

**Database e2e is not mandatory until the infrastructure exists.** When no
isolated database is reachable, record `DB_E2E = BLOCKED_INFRASTRUCTURE`, state
which checks above are therefore unproven, and do not call the migration
verified.

## Migration review contract

Every migration task resolves all six. None may be assumed:

```
MIGRATION_STATIC_REVIEW     the generated SQL read line by line
FRESH_DB_MIGRATION          the full history applied to an EMPTY database
DATABASE_INTEGRATION_TEST   behaviour exercised against real constraints
SEED_VALIDATION             seed:config applies, seed:verify passes
ROLLBACK_CLASSIFICATION     CODE_ONLY | DATABASE_ADDITIVE | DESTRUCTIVE | …
DATA_COMPATIBILITY_CHECK    existing rows survive the new code
```

`FRESH_DB_MIGRATION` is the one a developer database cannot give you: it already
holds the schema, so a broken history still appears to work locally. CI runs it
on every push via the `database-migration` job.

```bash
node scripts/verify-database.mjs     # against an ephemeral database only
```

**If a required capability is unavailable, do not claim verification.** Record:

```
DB_VALIDATION = BLOCKED_INFRASTRUCTURE
```

and name which of the six are unproven. "The migration looks correct" is a
static review and should say so — it is not `FRESH_DB_MIGRATION`.

## Upgrade-from-previous-state testing

`FRESH_DB_MIGRATION` proves a *new* installation works. It says nothing about
the case that actually breaks in production: an **existing** database moving to
the new schema.

Until dedicated tooling exists, prove it by hand against an ephemeral database:

```bash
git stash                                        # or check out the previous SHA
node scripts/verify-database.mjs                 # migrate to the OLD schema
# insert representative rows for the models the migration touches
git stash pop                                    # restore the new migration
npm --workspace api run prisma:migrate:deploy
npm --workspace api run prisma:migrate:status    # must report fully applied
# then assert the representative rows survived and are correct
```

Record the result under `DATA_COMPATIBILITY_CHECK`. Automating this is a known
gap — see [`../../docs/development/ci.md`](../../docs/development/ci.md).

## Destructive workflows

A destructive workflow — tenant erasure, a data-migration backfill, a
contract-phase column drop — is **never first exercised against production, or
against shared staging.** The strategy:

```
isolated ephemeral database
  → seed a realistic relational graph (DbFixtures, not seed:demo)
  → execute the workflow
  → verify what was deleted AND what was deliberately preserved
  → inject a failure mid-way and verify the transaction rolled back entirely
```

The last step is the one that matters. A destructive workflow that half-succeeds
is worse than one that fails outright, and only a forced-failure test proves it
cannot.

---

## Definition of done

- [ ] `tenantId` present, indexed, and in every composite unique on tenant-owned
      models
- [ ] `onDelete` on every new relation
- [ ] Indexes cover the new filter/sort columns
- [ ] Money is `Decimal` with explicit precision
- [ ] Migration generated, not hand-edited, named for the change
- [ ] `npm run prisma:validate` and `npm run prisma:generate` run, then typecheck
- [ ] Backfill written and idempotent, if data must move
- [ ] `seed-config.ts` + `verify-seed-config.ts` updated if configuration added
- [ ] Rollback described in the plan
- [ ] Queries that read the old shape updated
