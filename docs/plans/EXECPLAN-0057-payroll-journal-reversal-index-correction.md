# ExecPlan — Payroll journal reversal: drop the two obsolete one-journal-per-run unique indexes

> Required by `PLANS.md` (payroll logic, and a migration changing uniqueness). Fixes BUG-4639, found by the payroll isolation suite on 2026-11-22 and confirmed by independent review. Owner decision 2026-11-22: create this plan and implement the corrective migration in development; nothing is applied to production.

CONTEXT_FILES_REQUIRED: |
  - AGENTS.md, services/api/AGENTS.md, services/api/prisma/AGENTS.md
  - services/api/prisma/migrations/20260430040000_payroll_gl_foundation/migration.sql
  - services/api/prisma/migrations/20260712190000_payroll_journal_reversal_documents/migration.sql
  - services/api/src/modules/payroll/payroll-journal.service.ts
  - services/api/test/payroll-cross-tenant.e2e-spec.ts
SPECIALIST_AGENTS_REQUIRED: |
  - database — the migration (single writer of schema.prisma, which does not change here)
  - backend-api — journal service behaviour tests
  - qa — fresh-database and old-schema migration proof, HTTP regression
  - security reviewer — tenant isolation of the reversal route
DELIBERATELY_NOT_USED: DROP INDEX CONCURRENTLY (cannot run inside the transaction Prisma wraps a migration in; the table is small and the lock is brief), a partial unique index (Prisma cannot express it, so it would create permanent schema drift)
SINGLE_WRITER_FILES: none changed (schema.prisma already declares no such unique)
QA_REQUIRED: yes
KNOWN_BUG_PATTERNS_IN_SCOPE: migration-no-op (a statement that silently matches nothing)
REGRESSION_ENTRIES_IN_SCOPE: REG for BUG-4639 (added with the fix)
TARGET_BRANCH: develop
TARGET_ENVIRONMENT: LOCAL
DEPLOYMENT_REQUIRED: no (development only; production application is a separate owner-approved release step)
DEPLOYMENT_COMPONENTS: database, api
DEPLOYMENT_ORDER: database -> api
ROLLBACK_CLASS: DATABASE_ADDITIVE_NOT_REVERSIBLE_AFTER_USE (see Rollback)
INTEGRATOR_REQUIRED: yes
RELEASE_DEVOPS_REQUIRED: yes
POST_DEPLOY_QA_REQUIRED: yes
MERGE_STRATEGY: ref-push fast-forward to develop after exact-SHA CI
KNOWN_CONCURRENT_WORK: none touching payroll migrations
ENVIRONMENT_DEPENDENCIES: none

## Objective

A database built only from the migration history can hold an ORIGINAL journal and its REVERSAL (and ADJUSTMENT) journal for the same payroll run, exactly as `schema.prisma` and `payroll-journal.service.ts` intend. Posting a journal and then reversing it returns 2xx, creates one reversal row, and leaves the original and its lines and audit history untouched.

## Business requirement

A posted payroll journal can be reversed with a reason, producing a mirror-image journal linked to the original. ADJUSTMENT journals: the enum value exists and the schema comment says original, reversal and adjustment journals coexist, but no service path creates one today. This plan removes the database obstacle only; an adjustment feature is out of scope and any rule for it (who may post one, how it links to its original) is a separate product decision recorded when that feature is planned.

## Existing behavior

- `20260430040000_payroll_gl_foundation` ran `CREATE UNIQUE INDEX` twice on the same column pair: `PayrollJournalEntry_tenantId_payrollRunId_key` `(tenantId, payrollRunId)` and `PayrollJournalEntry_payrollRunId_tenantId_key` `(payrollRunId, tenantId)`. Both enforce one journal per run.
- `20260712190000_payroll_journal_reversal_documents` tried to remove them with `ALTER TABLE ... DROP CONSTRAINT IF EXISTS`. They are indexes, not constraints, so both statements matched nothing and both indexes survive.
- `schema.prisma` `PayrollJournalEntry` declares `@@unique([id, tenantId])` and `@@index([tenantId, payrollRunId])` and no unique on the run pair.
- Observed 2026-11-22 on a migration-built database: `POST /payroll/runs/:runId/journal/reverse` on a POSTED journal returns 500, a unique violation on `PayrollJournalEntry_tenantId_payrollRunId_key`.
- `payroll-journal.service.ts` `reverseJournal` already enforces: only POSTED journals may be reversed, a reason is required, and a journal already carrying `reversalJournalId` or an existing REVERSAL row is refused with `ConflictException('This journal already has a reversal.')`. Lines are mirrored and `assertBalanced` runs.
- `generateJournal` refuses a second ORIGINAL for a run in the service (`findFirst` on `journalType: ORIGINAL`, `originalJournalId: null`), so the one-original-per-run rule is enforced in code, not by the database.

## Existing architecture

Payroll GL: `PayrollJournalEntry` / `PayrollJournalEntryLine`, `payroll-journal.service.ts`, `payroll-gl.controller.ts`. The migration runner is `prisma migrate deploy` (`npm run release:api`, Render pre-deploy). Migrations run inside a transaction.

## Requirements

1. Both obsolete unique indexes are removed by a NEW forward migration; no applied migration is edited.
2. Removal is conditional (`DROP INDEX IF EXISTS`) so it is safe on a database where the index is already gone, such as one built by `db push`.
3. Nothing the removal could affect is dropped: the primary key, `PayrollJournalEntry_id_tenantId_key`, every foreign key, and the non-unique `(tenantId, payrollRunId)` index remain.
4. No row is deleted or rewritten.
5. After migration, the physical structure of the table matches `schema.prisma` with no drift.
6. A real HTTP and database regression test proves post, reverse, duplicate-reverse refusal, balanced mirror lines, cross-tenant denial and untouched history.
7. The migration is proved on (a) an empty database built from the full history and (b) an isolated database holding the OLD schema with real original-journal rows.

## Dependencies

None blocking. Isolated PostgreSQL on 127.0.0.1:5433 (disposable, asserted by `scripts/assert-test-database.mjs`).

## Files / modules affected

- `services/api/prisma/migrations/<timestamp>_payroll_journal_drop_run_unique_indexes/migration.sql` (new)
- `services/api/test/payroll-journal-reversal.e2e-spec.ts` (new) and the owner control in `payroll-cross-tenant.e2e-spec.ts` (tightened to expect 2xx)
- `docs/bugs/BUG-4639-*.md`, a regression entry, a QA scenario, this plan.

## Database impact

Migration shape:

```sql
DROP INDEX IF EXISTS "PayrollJournalEntry_tenantId_payrollRunId_key";
DROP INDEX IF EXISTS "PayrollJournalEntry_payrollRunId_tenantId_key";
```

Verified on the migration-built isolated database before writing this plan (catalog query, 2026-11-22): neither index backs any constraint (`pg_constraint.conindid` for every constraint on the table names only `PayrollJournalEntry_pkey`, `PayrollJournalEntry_id_tenantId_key`, `PayrollRun_id_tenantId_key` and `Tenant_pkey`), and `pg_depend` shows no object depending on either index. The foreign key `PayrollJournalEntry_payrollRunId_tenantId_fkey` is backed by `PayrollRun_id_tenantId_key` on the referenced table, not by these indexes. `PayrollJournalEntryLine` references `(id, tenantId)`, backed by `PayrollJournalEntry_id_tenantId_key`, which stays.

Locking: `DROP INDEX` takes a brief `ACCESS EXCLUSIVE` lock on `PayrollJournalEntry`. The table holds at most one row per posted payroll run per tenant, so it is small; the lock is short. `CONCURRENTLY` is not used because it cannot run in a transaction block, and `prisma migrate deploy` runs each migration in one. No backfill, no data change.

Intended uniqueness after the change: `id` (primary key), `(id, tenantId)` (composite FK target). Uniqueness of the ORIGINAL journal per run, and of the single REVERSAL per journal, is a service rule.

**Independent review finding (2026-11-22, MAJOR, fixed in this change):** as first written, that service rule was NOT concurrency-safe. `generateJournalForPayrollRun` and `reverseJournal` did a plain find-then-create, and the unique index being dropped had been the only atomic guard, so two simultaneous requests could create two ORIGINAL journals or double-reverse the general ledger. Both now take a row lock (`SELECT ... FOR UPDATE` on the payroll run, and on the original journal) inside the transaction and re-check under the lock, so the second caller waits and then sees the first's row. Tests: three simultaneous reversals give exactly one 201 and two 409 and one REVERSAL row; three simultaneous generates give one ORIGINAL row. Mutation (lock and re-check removed): the reversal test fails 3 of 3 runs. A partial unique index on `(tenantId, payrollRunId) WHERE journalType = 'ORIGINAL'` would also enforce it in the database, but Prisma cannot declare it, so `migrate diff` would report permanent drift; recorded as a deliberate non-goal, with the service rule and the existing test as the control.

## Backend impact

None expected. `reverseJournal` already implements the intended rules. If the regression test exposes a service defect hidden behind the index error, it is fixed in the same change and recorded.

## Frontend impact

None.

## Permission / RBAC impact

None. The route keeps its existing `@Permissions` and `@RequirePermission` decorators.

## Tenant-isolation impact

No query changes. The new test proves a foreign tenant's admin gets the existing 404 on reverse and that the other tenant's journal, lines and run are unchanged afterwards.

## Audit / event / logging impact

None changed. The test checks that the existing audit history for the original journal is intact after a reversal.

## Integration impact

None. Payroll GL export consumers read journals by id and run; a run may now return more than one journal, which `GET runs/:runId/journals` already supports (the endpoint is plural and the service orders by `journalType`). `GET runs/:runId/journal` (singular) selects the ORIGINAL (`journalType: ORIGINAL, originalJournalId: null`).

## Migration / data compatibility

Forward-only and idempotent. Compatible with the previous API version (which never relied on the indexes) and the next. Safe to re-run. A database that was built by `db push` (no indexes) is unaffected. On any database that already holds a reversal row it could not have: the indexes made that impossible, so no existing data can violate the new state.

## Parallel-safe tasks

Test authoring against the old-schema database can proceed while the migration is written.

## Dependency-blocked tasks

Independent review needs the migration and the regression test.

## Integration tasks

Exact-SHA CI including the `Database migration gate` and `Database e2e`; fast-forward `develop`.

## Testing strategy

1. Old-schema proof: on an isolated database at the schema BEFORE the new migration, insert real payroll rows (tenant, run, ORIGINAL journal with balanced lines), apply the new migration only, and confirm every row and the audit rows are byte-identical afterwards and both indexes are gone.
2. Fresh-database proof: apply the whole history to an empty database; run `prisma migrate status` (no pending, no failed) and `prisma migrate diff --from-migrations --to-schema` (empty).
3. Idempotence: apply the migration SQL a second time by hand; no error.
4. HTTP e2e (`payroll-journal-reversal.e2e-spec.ts`): generate, validate and post a journal; reverse it (2xx, exactly one REVERSAL row, `originalJournalId` and `reversalJournalId` linked, lines mirror debit/credit and balance); duplicate reverse is 409; the original journal, its lines and its audit rows are unchanged; a foreign tenant's reverse is 404 and the other tenant's rows are unchanged; an ADJUSTMENT-typed row inserted for the same run coexists with the original.
5. Mutation: re-add one of the unique indexes and prove the reversal test fails.
6. The suite must exit cleanly without `--forceExit`.

## Risks

- Lock wait on a busy table: negligible, small table; the statement waits only for in-flight transactions on it.
- A reviewer assuming `DROP CONSTRAINT` semantics again: the migration carries a comment explaining why the first attempt was a no-op.

## Rollback considerations

Recreating the two unique indexes is only possible while no run has more than one journal. After any valid reversal or adjustment journal exists, `CREATE UNIQUE INDEX` on `(tenantId, payrollRunId)` fails because duplicates are valid data. Therefore this is NOT safely reversible after use. Rollback options, in order: (1) before any reversal is created, re-create the indexes by hand; (2) after reversals exist, do not roll back the schema — roll back the API deployment instead, which loses nothing because the old API simply never reverses a journal. This plan does not describe the change as safely reversible.

## Definition of Done

- New migration in the history; no applied migration modified.
- Old-schema and fresh-database proofs recorded in the register with exact commands and outputs.
- `prisma migrate status` clean and `migrate diff` empty.
- Regression test fails with an index re-added and passes without; suite exits cleanly.
- Independent QA and Security review pass.
- Exact-SHA CI and Engineering governance pass; BUG-4639 closed with REG and QA scenario.
- Production application is NOT performed; recorded as a release-step prerequisite.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this plan addresses or depends on, cited in its own body:

[[BUG-4639]]

<!-- GRAPH:END -->
