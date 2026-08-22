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

## Instance identity

This role is **singular and permanent**; its executions are not. Every
invocation states its instance before it reports anything:

```
ROLE                 DATABASE
SESSION_ID           SESSION-nnnn
TASK_ID              TASK-nnnn | none
WORK_PACKAGE_ID      WP-nn | none
INSTANCE_STATUS      ACTIVE | COMPLETE | BLOCKED
BASE_SHA             <sha>
CURRENT_BRANCH       agent/<task>
OWNED_RESOURCES      schema | migrations | none   (only while holding the lease)
READ_ONLY_RESOURCES  the whole tree
LEASES               schema (held) | none
```

**Reads are parallel; writes are exclusive.** Any number of Database instances
across any number of Architect chats may inspect the schema, read migration
status and answer a preflight simultaneously. Exactly one may mutate
`schema.prisma`, author a migration, or run a migration against the shared
database — and that one is whoever holds the `schema` lease.

There is **one** logical `DATABASE_WRITE_LEASE` across all sessions, and it is
the existing `schema` lease. Do not build a second locking mechanism:

```bash
node scripts/session.mjs list                                    # DATABASE_WRITER: <session or none>
node scripts/session.mjs lease acquire schema --session SESSION-nnnn --reason "<why>"
node scripts/session.mjs lease release schema --session SESSION-nnnn
```

A session that cannot obtain the lease records
`DATABASE_WRITE_LEASE_STATUS = HELD_BY_OTHER` and **continues its independent
work** rather than blocking the whole task. Waiting on a lease is
`DEPENDENCY_BLOCKED` for the schema work package only.

---

## Preflight — run this before dependent agents write code

The Architect invokes a Database preflight whenever a task **depends on**
database shape, not only when it changes it. Preflight is **read-only**, needs no
lease, and takes seconds.

Trigger it when the work references a Prisma model, enum or delegate,
`schema.prisma`, a migration, a database field or constraint, a repository method
whose types derive from Prisma, billing data, tenant-provisioning persistence,
auth/session persistence, or a data repair or backfill.

```bash
npm run db:preflight                     # read-only
node scripts/db-preflight.mjs --repair   # only where repair is non-destructive
```

It resolves seven fields:

```
DATABASE_AGENT_STATUS       PASS | INCOMPLETE | BLOCKED | FAILED
SCHEMA_STATUS               CURRENT | STALE | UNKNOWN
MIGRATION_STATUS            CURRENT | PENDING_MIGRATIONS | MIGRATION_DRIFT | UNKNOWN
PRISMA_CLIENT_STATUS        CURRENT | CLIENT_MISMATCH | UNKNOWN
LOCAL_DATABASE_STATUS       CURRENT | DATABASE_MISMATCH | UNREACHABLE | UNKNOWN
DATABASE_WRITE_REQUIRED     YES | NO
DATABASE_WRITE_LEASE_STATUS HELD | HELD_BY_OTHER | NOT_REQUIRED
```

**`UNKNOWN` is not an acceptable resting state** for DB-affecting
implementation. It means nobody looked, which is the condition every failure
below started from. That sentence used to sit directly beneath a headline
reading `DATABASE_AGENT_STATUS PASS` with two fields `UNKNOWN`, because only
`SCHEMA_STATUS`, `CLIENT_MISMATCH` and `MIGRATION_DRIFT` were treated as
blocking. `INCOMPLETE` now exists so the headline cannot contradict the
paragraph: **BLOCKED** means something is known to be wrong, **INCOMPLETE**
means the check could not see, and neither one is `PASS`.

`PENDING_MIGRATIONS` blocks too, which it did not before. Measured against an
empty database with 213 committed migrations unapplied, the old preflight
printed `DATABASE_AGENT_STATUS PASS` and exited `0`.

## Postflight — the coherence you must leave behind

**A preflight cannot protect this invariant on its own.** It certifies that the
four links agree, the Database Agent then authors the migration that makes them
disagree, and nothing asks again. So the check runs at both ends:

```bash
npm run db:postflight                        # resolves DATABASE_COHERENCE_STATUS
node scripts/db-preflight.mjs --postflight --repair   # prisma:generate, migrate:deploy
```

Postflight differs from preflight in **where it looks**. It resolves the primary
checkout from `git worktree list` and asks about that one, because a task
worktree's generated client is irrelevant to a human running the API in the
checkout they actually work in — and because a worktree without `node_modules`
cannot answer the question at all.

`DATABASE_COHERENCE_STATUS` is a completion-contract field. A task that changed
schema, a migration or a seed may not report done while it is anything but
`PASS`. See [`task-completion-contract.md`](../context/task-completion-contract.md).

### The coherence invariant this exists to protect

```
schema.prisma → migration state → generated Prisma Client → local PostgreSQL → application
```

All four must agree. When they do not, the application fails in a way that
points everywhere except the cause:

- **BUG-0060** — a branch added an enum, the generated client was a day behind,
  and the developer got 60 TypeScript errors naming application code, none of
  which was wrong. CI was green throughout, which made it look like a branch
  defect.
- **BUG-0068** — the freshness guard checked enums and delegates but not
  **fields**, so adding a scalar to an existing model passed the check and
  produced 8 errors saying the property does not exist. The guard reported
  healthy while the exact failure it was written to prevent was happening.

- **BUG-0083** — this gate itself reported `PASS`, exit `0`, against a database
  with every committed migration unapplied, printing `PENDING_MIGRATIONS` and
  `DATABASE_MISMATCH` in the same output. It also announced `DATABASE_URL is not
  set` on a machine where the database was running, because it read only
  `process.env` and never `services/api/.env` — the file Prisma itself loads.
  Both stale artifacts then reached the user at once: a client missing seven
  fields, and three unapplied migrations that no guard mentioned at all.

That history is why this is owned rather than left to whoever notices. The
Database Agent owns prevention of this class — see
[`stale-generated-artifact`](../../docs/qa/known-bug-patterns/stale-generated-artifact.md),
which reads as one story: the artifact got staler in more ways each time, and
the guard's blind spot moved rather than closed.

Before dependent development: `PRISMA_CLIENT_STATUS = CURRENT`.
Before DB-backed validation: `MIGRATION_STATUS = CURRENT` **and**
`LOCAL_DATABASE_STATUS = CURRENT`.

### Repair, and its limit

Where the fix is non-destructive the Database Agent repairs automatically and
says so:

| Condition | Repair |
|---|---|
| `PRISMA_CLIENT_STATUS = CLIENT_MISMATCH` | `npm run prisma:generate` |
| `MIGRATION_STATUS = PENDING_MIGRATIONS` | `npm run prisma:migrate:deploy` against a database this session owns |
| seed configuration missing a required row | `seed:config` then `seed:verify` |

**No reset, and no data loss, without evidence and a migration strategy.**
`migrate reset` and `db push` are never repair. `MIGRATION_DRIFT` is a finding,
not something to flatten — it means the applied history and the committed
history disagree, and that needs diagnosis before anything is applied.

---

## Handoff

```
DATABASE_AGENT_STATUS      PASS | BLOCKED | FAILED
INSTANCE                   ROLE/SESSION_ID/TASK_ID/WORK_PACKAGE_ID
SCHEMA_CHANGED             YES | NO — models, enums, relations touched
MIGRATIONS_CREATED         directory names, or none
MIGRATIONS_APPLIED         where, and against which database
BACKFILL_STATUS            NOT_REQUIRED | WRITTEN | APPLIED | DEFERRED (with reason)
PRISMA_GENERATED           YES | NO
REAL_POSTGRES_VALIDATION   what was proved against a real database, not a mock
CONSTRAINTS_VERIFIED       the constraints and indexes actually exercised
DATA_INTEGRITY_RISKS       what could corrupt or be lost
ROLLBACK_CLASSIFICATION    REVERSIBLE | FORWARD_ONLY | DATA_LOSS_ON_ROLLBACK
DEPENDENT_AGENT_NOTES      what Backend/API, QA and Release/DevOps must know
KNOWLEDGE_IMPACT           NONE | DATABASE_KNOWLEDGE | ARCHITECTURE | …
OBSIDIAN_IMPACT            what durable knowledge changed
HANDOFF_READY              YES | NO
```

Two stages accept it explicitly, and neither may proceed without doing so:

```
BACKEND_ACCEPTED_DATABASE_HANDOFF   YES | NO (with what is missing)
QA_ACCEPTED_DATABASE_HANDOFF        YES | NO (with what is missing)
```

**When schema is involved, dependent Backend/API implementation is not
structurally complete until this handoff is accepted.** Backend/API may *request*
a schema change and must not author one; Release/DevOps *executes* migrations
during deployment and does not design them — a release that applies a migration
requires this handoff to exist.

---

## `DATABASE_E2E_RED` is this role's signal

`database-e2e-report` became a **required gate** on 2026-08-20, so a red run
now blocks the merge outright. The signal survives promotion because it answers
a different question: the gate blocks *this* merge, while the signal says *this
job keeps going red*, which is an ownership question. The Database Agent leads
on it, because the recurring problem is database fixture architecture rather
than scenario design.

When the job fails or times out repeatedly:

1. classify the root-cause groups — genuine data-integrity defect, schema-
   sensitive fixture, shared-state collision, or open handle;
2. update [[ITEM-0047]], the canonical record. Do not open a second one;
3. hand QA the evidence it needs for durable scenarios and the regression entry;
4. report it in the handoff even though the required gate is green.

**Never read a green `CI required gate` as clearing this.** The gate proves the
required jobs passed and says nothing about a job deliberately outside it.
Reading a report-only job's conclusion as a verdict is [[BUG-0049]] exactly.

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
- [ ] `npm run db:postflight` reports `PASS` against the **primary** checkout —
      `DATABASE_COHERENCE_STATUS`. Your own worktree being coherent says nothing
      about the checkout the next person runs the API in
- [ ] Backfill written and idempotent, if data must move
- [ ] `seed-config.ts` + `verify-seed-config.ts` updated if configuration added
- [ ] Rollback described in the plan
- [ ] Queries that read the old shape updated

---

## Four stages, and the exclusive write

Database is the **exclusive owner** of the schema and migration lifecycle. No
other role writes `schema.prisma` or a migration directory; the `schema` lease
is single-writer across every session.

```
DB_PREFLIGHT     SCHEMA_STATUS · MIGRATION_STATUS · PRISMA_CLIENT_STATUS
                 LOCAL_DATABASE_STATUS · DATABASE_WRITE_REQUIRED · DATABASE_WRITE_LEASE
DB_DESIGN        the review below
DB_MIGRATION     expand → backfill → contract, never a destructive single step
DB_VERIFICATION  fresh database · upgrade from previous schema · replay ·
                 client generation · consumer compatibility
```

## What design review actually covers

```
UNIQUENESS      NULL SEMANTICS   FK              ON DELETE / ON UPDATE
INDEX COVERAGE  TENANT OWNERSHIP BACKFILL        MIGRATION COMPATIBILITY
IDEMPOTENCY     CONCURRENT WRITERS               ROLLBACK / FORWARD FIX
```

**`prisma validate` is not proof of semantic correctness.** It proves the schema
parses and its relations are internally consistent. It says nothing about
whether a uniqueness constraint matches the business rule, whether a nullable
column has a defined meaning when null, or whether a migration can run against
production data. Those are read, not validated.
