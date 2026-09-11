---
ID: BUG-3170
aliases: [BUG-3170]
Title: Timesheet bulk-import confirmation runs an unbounded per-row loop inside one transaction on the default 5-second timeout
Status: OPEN
Severity: HIGH
Priority: P1
Type: PERFORMANCE
Source: REVIEWER
DetectedDate: 2026-09-10
DetectedInSha: 23504f4b
AffectedModules: [services/api/src/modules/timesheets]
OwnerAgent: architect
ArchitectDisposition: TRIAGE_REQUIRED
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-10
ResolvedAt:
---

# BUG-3170 — Timesheet bulk-import confirmation runs an unbounded per-row loop inside one transaction on the default 5-second timeout

## Summary

Timesheet bulk-import confirmation runs an unbounded per-row loop inside one transaction on the default 5-second timeout

Identified by the 2026-09-10 full technical audit as DBQ-04 (confidence: DBQ-04=CONFIRMED).

## Expected Behavior

Either (a) pass an explicit, generous `{ timeout:
  ... }` sized to a realistic worst-case row count, or (b) — better, since (a)
  still fails atomically for a large-enough import — commit each row (or a
  chunk of rows) in its own short transaction and report partial success/failure
  per row the way the `data-management` `DataJobWorkerService` already does
  (`import-execution.service.ts:273-350`, chunked with `CHUNK_SIZE` and no
  enclosing transaction across chunks).

## Actual Behavior

Confirming a timesheet import performs up to 4
  sequential round trips per row, all inside one transaction. At a
  conservative 10 ms/round-trip (matching RES-02's own estimate for the same
  Neon connection), 4 queries/row means the transaction starts risking the 5 s
  default timeout at roughly **125 rows** — a single tenant importing a
  quarter's worth of daily entries for a modest team (e.g. 20 employees × 65
  working days = 1,300 rows) is an order of magnitude past that. When the
  timeout fires, Prisma aborts the whole transaction: every row committed so
  far in that `$transaction` call is rolled back (interactive transactions are
  all-or-nothing), so the import fails **entirely**, including the rows that
  had already succeeded, with an opaque "transaction expired" error rather than
  a partial-success report.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**DBQ-04** (`services/api/src/modules/timesheets/timesheets.service.ts`):

`timesheets.service.ts:780-868`:
  ```ts
  await this.prisma.$transaction(async (tx) => {
    for (const row of preview.rows) {
      if (!row.payload || row.severity === 'error') continue;
      let timesheet = await this.timesheetsRepository.findMONTHLYTimesheet(..., tx);   // 1
      if (!timesheet) {
        timesheet = await this.timesheetsRepository.createTimesheet({...}, tx);        // 1
      } else {
        await this.timesheetsRepository.updateTimesheet(..., tx);                       // 1
      }
      const existingEntry = await this.timesheetsRepository.findEntryByDate(..., tx);  // 1
      if (existingEntry) {
        await this.timesheetsRepository.updateTimesheetEntry(..., tx);                 // 1
      } else {
        await this.timesheetsRepository.createTimesheetEntry({...}, tx);               // 1
      }
    }
  });
  ```
  No `{ timeout: ... }` option is passed to this `$transaction` call, so it
  inherits Prisma's default 5-second interactive-transaction timeout (the same
  default RES-09 documents). `preview.rows` comes from a parsed import file
  with **no row-count cap** found anywhere in `timesheets.service.ts` or
  `PayslipQueryDto`-style DTOs for this endpoint (`grep -n "MAX.*ROW\|rows.length"`
  over the file finds no cap); the only indirect limit is the API's default
  1 MB request-body cap (`main.ts:158-186`), which an `.xlsx`/`.csv` file with a
  few thousand short data rows fits inside easily.

---


Full finding text: DBQ-04 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/DBQ.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

A whole-batch, all-or-nothing failure for any timesheet import
  above roughly a hundred rows, indistinguishable to the end user from a bug in
  their data — it succeeds identically for a small pilot import and fails for
  the production-sized one the pilot was meant to de-risk. This is the same
  failure *class* as BUG-0900 (CRITICAL, provisioning) and RES-02 (payroll):
  a loop's cost scales with row count, but the timeout budget does not.

## Affected Areas

services/api/src/modules/timesheets

## Proposed Resolution

Follow `import-execution.service.ts`'s pattern: commit in
  bounded chunks (a few hundred rows) with each chunk in its own short
  transaction, track `processedRows`/`failedRows` on the import batch row, and
  drop the single enclosing transaction. If atomicity across the whole batch is
  a genuine product requirement, pass an explicit `timeout` proportional to
  `preview.rows.length` instead, with a hard cap on importable row count.

(Difficulty: MEDIUM; Regression risk: MEDIUM — changes the failure semantics from
  all-or-nothing to partial-success, which is the correct behaviour but is a
  visible contract change for the import-confirmation screen.; Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for `services/api/src/modules/timesheets/timesheets.service.ts` (audit id DBQ-04).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: DBQ-04=MEDIUM — changes the failure semantics from
  all-or-nothing to partial-success, which is the correct behaviour but is a
  visible contract change for the import-confirmation screen.. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `DBQ-04` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/DBQ.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (DBQ-04) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
