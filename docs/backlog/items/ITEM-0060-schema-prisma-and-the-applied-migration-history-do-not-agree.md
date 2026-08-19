---
ID: ITEM-0060
aliases: [ITEM-0060]
Title: schema.prisma and the applied migration history do not agree
Type: TECH_DEBT
Status: DEFERRED
Priority: P2
Severity: MEDIUM
AffectedModules: [prisma, timesheets, attendance, payroll, billing]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: DEFER
CreatedAt: 2026-08-19
UpdatedAt: 2026-08-19
RelatedBug: 
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0060 — schema.prisma and the applied migration history do not agree

## Summary

Apply all 210 migrations to an empty database and diff the result against
`schema.prisma`, and the diff is not empty. It is roughly **196 statements**
long before any new change is added: index renames, index drops, foreign-key
constraint renames, and `ALTER COLUMN … DROP DEFAULT` on `updatedAt` columns.

None of it appears to be a runtime defect. The names differ, not the shapes, and
`@updatedAt` is applied by Prisma in the application layer, so a database-side
default is redundant either way. The cost is not incorrect behaviour — it is
that **"is the schema in sync with the migrations?" is no longer a question this
repository can answer**, because the honest answer is permanently "no".

## Why It Matters

Three concrete costs, in order of how soon they bite.

1. **Authoring a migration is now a manual filtering exercise.** The documented
   offline route — `prisma migrate diff` — emits the drift alongside the real
   change. TASK-0008 WP-01 added one column and got a 600-line script back, of
   which 2 lines were the change. Whoever writes the next migration has to
   correctly identify their own 2 lines in 600, and the failure mode of getting
   that wrong is a migration that silently renames 55 indexes on production.
2. **`migrate dev` cannot be used as documented.** `services/api/prisma/AGENTS.md`
   tells agents to create migrations with `npm run prisma:migrate:dev`. Run
   against a database built from the migration history, that command folds the
   entire drift into the next feature's migration.
3. **Drift detection is dead as a signal.** A future genuine divergence —
   someone hand-editing a migration, or a migration that fails halfway on one
   environment — arrives as 198 statements instead of 196 and nobody notices.

## Evidence

Reproduced at `8b51613` against a database built purely from the committed
migration history:

```bash
# fresh database, 210 migrations, nothing else
prisma migrate deploy --config prisma.config.ts
prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```

600 lines out. Statement census:

| kind | count |
|---|---|
| RenameIndex | 55 |
| CreateIndex | 54 |
| DropForeignKey | 35 |
| AlterTable | 18 |
| AddForeignKey | 18 |
| DropIndex | 16 |
| RenameForeignKey | 1 |

93 of the 600 lines mention `Timesheet`, the single largest cluster, and it
looks like one identifiable cause: models were renamed in the schema —
`TimesheetRestriction` → `TimesheetAccessRestriction`,
`TimesheetReopening` → `TimesheetReopeningRequest` — without a migration
renaming the constraints and indexes still carrying the old name.

```sql
ALTER TABLE "TimesheetAccessRestriction" DROP CONSTRAINT "TimesheetRestriction_employeeId_fkey";
ALTER INDEX "TimesheetReopening_tenant_approval_idx" RENAME TO "TimesheetReopeningRequest_tenantId_approvalRequestId_idx";
```

The rest is spread thin across `AttendanceEntry`, `RawAttendanceEvent`,
`Invoice`, `PayrollJournalEntry`, `PayrollPostingRule`, `Project`, `LoanPolicy`,
`TaxRule`, `Subscription`, `ExchangeRateSnapshot`, `HolidayCalendar` and
`FiscalYear`.

## Proposed Approach

Needs an ExecPlan under [`PLANS.md`](../../../PLANS.md) — it touches ~200
constraints across a dozen domains, and index and constraint renames take locks
on large tables.

The direction, not the patch:

1. Establish whether the database-side names are load-bearing anywhere. Grep for
   raw SQL and any `ON CONSTRAINT` usage before assuming a rename is free.
2. Author **one** reconciliation migration that is purely renames and
   default-drops, with no shape change, so it can be reviewed as a single
   mechanical act rather than hidden inside a feature.
3. Prove it by re-running the diff afterwards and asserting the script is
   **empty** — that assertion is the deliverable, not the migration.
4. Add the empty-diff check to CI so the next divergence is caught the day it
   lands rather than a year later.

Step 4 is the part with lasting value. Without it, this recurs.

## Acceptance Criteria

- `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma`
  against a database built from the committed migration history produces an
  **empty** script.
- A CI check fails when it does not, with the diff in the job output.
- No table is renamed or dropped and no column type is changed by the
  reconciliation migration — it renames constraints and indexes only.

## Dependencies

None. Deliberately **deferred out of TASK-0008**: WP-01 needs one column, and
folding a 200-statement estate-wide rename into a feature migration is precisely
the mistake this record exists to prevent. WP-01's migration was therefore hand
authored to contain only its own two statements.

## Related Items

[[TASK-0008]] · [[BUG-0075]]

## History

- 2026-08-19 — found at `8b51613` while authoring the TASK-0008 WP-01 migration.
  The drift is pre-existing and unrelated to that work; it surfaced only because
  WP-01 was the first change in a while to generate a diff and actually read it.
