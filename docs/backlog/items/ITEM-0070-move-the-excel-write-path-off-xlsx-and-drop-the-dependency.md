---
ID: ITEM-0070
aliases: [ITEM-0070]
Title: Move the Excel write path off xlsx and drop the dependency
Type: SECURITY
Status: DEFERRED
Priority: P2
Severity: LOW
AffectedModules: [payroll, timesheets]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: DEFER
CreatedAt: 2026-08-20
UpdatedAt: 2026-08-20
RelatedBug: BUG-0052
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: post-launch
BlockedBy: 
---

# ITEM-0070 — Move the Excel write path off xlsx and drop the dependency

## Summary

`services/api/src/common/excel/excel-export.service.ts` still writes workbooks
with SheetJS. Its read path moved to ExcelJS in TASK-0010, so the two unfixable
`xlsx` advisories are no longer reachable — but the package is still installed,
so `npm audit --omit=dev` still reports two highs against the API. Moving
`buildWorkbookBuffer` to ExcelJS removes the dependency and the report with it.

## Why It Matters

Not a live exposure. Both advisories — prototype pollution
(GHSA-4r6h-8v6p-xvw6) and ReDoS (GHSA-5pgg-2g8v-p4x9) — are parse-side, and
after TASK-0010 there is no parse call site. The cost is elsewhere:

- **Every future release has to re-derive this.** Two highs sit in the audit
  output permanently, and each release either re-argues reachability or waves
  them through. [[BUG-0052]] is a record of that argument being got wrong once
  already, from the very same file.
- The registry copy of `xlsx` is abandoned; SheetJS publishes elsewhere now.
  Nothing about it will improve.

## Evidence

- `services/api/src/common/excel/excel-export.service.ts` — `buildWorkbookBuffer`
  is the only remaining SheetJS caller.
- Four production call sites: `payroll-export.providers.ts:89`,
  `payroll-operations.service.ts:1214`, `timesheet-export.service.ts:402`,
  `timesheets.service.ts:658`.
- `npm audit --omit=dev` in `services/api` — `xlsx *  high  No fix available`.

## Why it was deferred rather than done in TASK-0010

**Payroll exports are consumed by banks.** The generated workbook is not an
internal artifact; it is a file a customer uploads to a payment system that will
reject it for formatting reasons the exporter cannot see. ExcelJS produces
different bytes from SheetJS — column widths, autofilter ranges, freeze panes and
hidden-sheet flags are all written differently even when the cell values match.

Changing that in the same release that first puts the product in front of paying
customers trades a real, customer-visible risk for the removal of an advisory
that has no reachable call site. The security work — the read path — was done;
this half was not, deliberately.

## Proposed Approach

No ExecPlan needed; it is one file and four call sites. It does need real
verification, which is the whole reason it was deferred:

1. Reimplement `buildWorkbookBuffer` with ExcelJS. It becomes `async` —
   `workbook.xlsx.writeBuffer()` returns a promise — so the four call sites and
   their two mocks take an `await`.
2. Preserve, explicitly: header row override, column widths, autofilter range,
   the frozen header row, and hidden sheets. Each is set differently in ExcelJS
   and each will silently do nothing if it is mis-set.
3. **Compare against a golden file**, not against a round trip. A round trip
   proves the writer and reader agree with each other, which they will even if
   both are wrong. Generate one payroll export and one timesheet export before
   and after, and diff the extracted sheet XML.
4. Have someone open both in Excel proper. LibreOffice and ExcelJS are more
   forgiving than the thing the customer uses.
5. Remove `xlsx` from `services/api/package.json` and re-run
   `npm audit --omit=dev`.

## Acceptance Criteria

- No `xlsx` entry in `services/api/package.json` or the API production tree.
- `npm audit --omit=dev` for `services/api` reports neither GHSA-4r6h-8v6p-xvw6
  nor GHSA-5pgg-2g8v-p4x9.
- A payroll bank export and a timesheet export generated after the change open
  in Excel with the same column widths, frozen header, autofilter and hidden
  sheets as before.
- The existing round-trip test in `payroll-export.providers.spec.ts` still
  passes, and a golden-file comparison is added alongside it.

## Dependencies

None. Should not land in the same release as a payroll change, so that a bank
rejecting a file has one candidate cause rather than two.

## Related Items

- [[BUG-0052]] — the advisory record, and the corrected reachability finding.
- [[ITEM-0048]] — the other half of the dependency-replacement work
  (`active-win`).
- [[TASK-0010]] — where the read path moved.

## History

- 2026-08-20 — created at `e3658a4`, when the read path moved to ExcelJS and the
  write path deliberately did not.
