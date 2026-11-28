---
ID: BUG-4639
aliases: [BUG-4639]
Title: Payroll journal reversal fails: unique index on payrollRunId was never dropped
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: DATA_INTEGRITY
Source: QA_RUN
DetectedDate: 2026-11-22
DetectedInSha: 34582a27
AffectedModules: [payroll]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-706
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: EXECPLAN-0057
CreatedAt: 2026-11-22
UpdatedAt: 2026-11-22
ResolvedAt:
---

# BUG-4639 — Payroll journal reversal fails: unique index on payrollRunId was never dropped

## Summary

Reversing a POSTED payroll journal (`POST /payroll/runs/:runId/journal/reverse`) failed with HTTP 500 on any database built from the migration history. The original payroll migration created TWO unique indexes allowing one journal per run, `PayrollJournalEntry_tenantId_payrollRunId_key` and `PayrollJournalEntry_payrollRunId_tenantId_key` (the same columns in both orders). The later reversal migration tried to remove them with `DROP CONSTRAINT IF EXISTS`; they are indexes, so both survived and a reversal or adjustment journal for a run that already has its original violated them.

## Expected Behavior

A posted journal can be reversed, creating a reversal journal for the same run.

## Actual Behavior

HTTP 500; a unique violation on `PayrollJournalEntry_tenantId_payrollRunId_key`.

## Reproduction

1. Apply every migration to an empty database.
2. Create a payroll run with a POSTED journal.
3. Call `POST /payroll/runs/:runId/journal/reverse` as the tenant admin.

Observed 2026-11-22 by the payroll isolation suite. `schema.prisma` declares no such unique, so a `db push` database would not show it.

## Evidence

- `20260430040000_payroll_gl_foundation/migration.sql` creates both indexes with `CREATE UNIQUE INDEX`.
- `20260712190000_payroll_journal_reversal_documents/migration.sql` runs `ALTER TABLE ... DROP CONSTRAINT IF EXISTS` on both names: a silent no-op.
- Catalog check on the migration-built isolated database: neither index backs a constraint or foreign key and `pg_depend` shows nothing depending on them; the FKs use `PayrollJournalEntry_id_tenantId_key`, `PayrollRun_id_tenantId_key` and the primary key.
- Independently confirmed by the QA/Security review (it also found the second index).

## Root Cause

Unique INDEXES were removed with `DROP CONSTRAINT IF EXISTS`, which matches nothing for an index. Schema and migrated databases diverged.

## Impact

On any migration-built database, production included if both migrations were applied there, a posted journal could not be reversed. Not an isolation defect; no data was ever corrupted because the database refused the insert. Production was not queried.

## Affected Areas

payroll: journal reversal.

## Proposed Resolution

New forward migration `20261122100000_payroll_journal_drop_run_unique_indexes` using `DROP INDEX IF EXISTS` for both. EXECPLAN-0057. Not applied to production; production application is a separate owner-approved release step.

## Acceptance Criteria

- On a database built only from migrations, reversing a POSTED journal returns 2xx and creates exactly one REVERSAL row linked both ways, with mirrored balanced lines.
- A second reversal is refused with 409 and creates nothing.
- An ADJUSTMENT journal coexists with the original for one run.
- A foreign tenant is refused with 404 and its rows are unchanged.
- No existing row changes; `prisma migrate status` is clean; no schema drift on `PayrollJournalEntry`.

## Regression Coverage

`services/api/test/payroll-cross-tenant.e2e-spec.ts` (the "BUG-4639" describe and the journal/reverse owner control, now expecting 2xx). Fails with a run-pair unique index re-added (mutation: 5 tests red). REG-706, QA-PAYROLL-002.

## Dependencies

Other records, decisions or infrastructure this waits on.

## Related Items

Wikilinks to related bugs, items, modules and decisions — for the Obsidian graph.

## Resolution

Migration `20261122100000_payroll_journal_drop_run_unique_indexes` on branch `agent/dependency-alert-remediation` (SESSION-0137). Proven (2026-11-22, isolated databases): (a) old-schema database with seeded journal and line rows: row and line hashes identical before and after, both indexes gone, primary key and `(id, tenantId)` unique intact; (b) a REVERSAL and an ADJUSTMENT row for the same run then insert; (c) re-running the SQL is a no-op; (d) a fresh database from all 243 migrations: `migrate deploy` clean, `migrate status` up to date, no drift entry mentioning `PayrollJournalEntry`.

Locking: plain `DROP INDEX` (brief ACCESS EXCLUSIVE lock on a small table); `CONCURRENTLY` is not usable inside the migration transaction.

Rollback: NOT safely reversible once any reversal or adjustment journal exists, because the unique indexes cannot be recreated over valid duplicate rows. Before any reversal exists the indexes can be recreated by hand. After, roll back the API, not the schema.

**Independent review (2026-11-22): APPROVE WITH CHANGES; the MAJOR finding is fixed.** Dropping the two unique indexes also removed the only atomic guard against double-writes: generate and reverse did a plain find-then-create, so two simultaneous requests could create two ORIGINAL journals or double-reverse the ledger. Both now lock a row (the payroll run, and the original journal) with `SELECT ... FOR UPDATE` inside the transaction and re-check under the lock. Tests: three simultaneous reversals give one 201, two 409 and one REVERSAL row; three simultaneous generates give one ORIGINAL row; mutation (lock and re-check removed) fails 3 of 3 runs. The audit assertion now requires a PAYROLL_JOURNAL_REVERSED audit row. Not verified by the reviewer: that the Render pre-deploy `release` script runs `migrate deploy`; the 2026-11-03 release recipe says it does.

## QA Retest

QA-PAYROLL-002 on the isolated database, 2026-11-22: passing with the migration, failing with an index re-added. Status stays OPEN until the independent QA/Security review of the migration and exact-SHA CI pass.

## History

- 2026-11-22 — created from qa run at `34582a27`.
- 2026-11-22 — owner approved the fix; EXECPLAN-0057 written; migration, regression test, REG-706 and QA-PAYROLL-002 added; independent review pending.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[payroll]]
- Regression — REG-706 (see the regression register)

<!-- GRAPH:END -->
