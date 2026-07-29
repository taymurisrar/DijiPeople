# Timesheet enterprise workflow migration

This migration is additive and intentionally preserves the legacy monthly
timesheet and entry columns while introducing the month → week → day → entry
hierarchy. Existing entries are linked to generated day records; they are not
rewritten or deleted. Per-tenant counts and failures are stored in
`TimesheetMigrationResult` so deployment verification is auditable.

## Deployment verification

After `prisma migrate deploy`, verify that every migration result has
`status = 'COMPLETED'` and `failedCount = 0`, and that no non-deleted legacy
entry is missing `timesheetDayId`:

```sql
SELECT "tenantId", status, "processedCount", "succeededCount",
       "failedCount", details
FROM "TimesheetMigrationResult"
WHERE "migrationKey" = '20260726190000_timesheet_enterprise_workflow';

SELECT count(*) AS unlinked_entries
FROM "TimesheetEntry"
WHERE "timesheetDayId" IS NULL;
```

## Rollback procedure

Application rollback does not require a database rollback: deploy the prior
application version, which continues to use the preserved monthly columns and
legacy entry fields. Leave the new hierarchy tables in place so data created by
the new version remains recoverable and a corrected release can resume without
loss.

Do not drop the new tables as an automated rollback. The new model permits
multiple entries per employee/date, which cannot be represented by the old
unique constraint without a reviewed consolidation. If permanent removal is
ever required, first export all new entry rows and audit/approval/payroll
handoff records, consolidate duplicate employee/date entries under an approved
business rule, then restore the former unique constraint in a separately
reviewed migration.
