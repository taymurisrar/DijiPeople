---
ID: BUG-3020
aliases: [BUG-3020]
Title: Records behind these numbers shows raw GUIDs and a count that does not match the metric
Status: OPEN
Severity: HIGH
Priority: P1
Type: UX
Source: USER_REPORT
DetectedDate: 2026-09-09
DetectedInSha: 72d9db1f
AffectedModules: [apps/web, services/api/src/modules/reporting]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-09
UpdatedAt: 2026-09-09
ResolvedAt:
---

# BUG-3020 — Records behind these numbers shows raw GUIDs and a count that does not match the metric

## Summary

Every analytics surface ends in a "Records behind these numbers" table — the
drill-down that shows the rows a metric was computed from. On Workforce
analytics, five of its eight columns render raw UUIDs instead of names, and the
row count above it counts a different thing from the metric it claims to explain.

The table exists to answer "where does this number come from". It currently
answers with identifiers no human can read.

## Expected Behavior

A drill-down table shows the same labels the rest of the page shows. If the
breakdown beside it can print "Engineering", "People & Culture" and "Sales", the
table under it prints those too.

The count above the table describes the rows in the table in terms the reader
can tie to the metric — or says plainly what unit it is counting.

## Actual Behavior

On `/reports/analytics/workforce`, Starter demo tenant, production API `890cd96`,
period 08/11/2026-09/09/2026:

| Column | Renders |
|---|---|
| Department | `12736fbd-7133-4346-9430-e887adb7116c` |
| Employee | `ac83e710-281f-425c-ac80-1126c00cad68` |
| Organization | `f72a5131-b57d-48bd-bcc0-c7e7c9cd18c6` |
| Business unit | `e8dda19a-cd14-412a-a221-4e80b7a3f955` |
| Location | `a619115c-fe74-4bc4-9653-761a81d05033` |
| Employee code | `EMP-0007` — readable |
| Snapshot date | `08/26/2026` — readable |
| Team | `-` |

**The same page resolves those names correctly elsewhere.** The "Historical
headcount by Department" breakdown directly above prints Engineering 4, People &
Culture 2, Sales 2, Administration 1, Marketing 1, Customer Success 1,
Unassigned 1. So the label resolver exists and the drill-down does not use it.

**The count describes a different unit from the metric.** The tile reads
"Historical headcount 12". The table reads "332 records behind these numbers"
and "Showing 1 to 25 of 332 records". Both are internally correct — 332 is daily
snapshot rows across the period, 12 is people — but the sentence claims the 332
are the records *behind* the 12, and a reader who counts them will not arrive at
12.

**A rounding inconsistency in the same breakdown.** Four groups hold one person
each and are printed as 8.4%, 8.3%, 8.3% and 8.3%. One twelfth is 8.333%; two
different roundings of the same value appear four rows apart, and the seven
groups sum to 99.6%.

## Reproduction

1. Sign in to any tenant with employee data and open
   `/reports/analytics/workforce`.
2. Scroll to "Records behind these numbers".
3. Read the Department, Employee, Organization, Business unit and Location
   columns.
4. Compare the row count with the "Historical headcount" tile.
5. Read the percentages in "Historical headcount by Department".

## Evidence

Full-page capture taken during the 2026-09-09 live pass. Reproduced on the
Starter demo tenant as `global-admin`; not role-specific, since the columns are
rendered the same for any caller who can see the rows.

The defect is in presentation, not in the query: the rows are correctly
tenant-scoped and access-filtered, and the ids shown are the tenant's own.

## Root Cause

Not established. The breakdown resolves display names through the reporting
catalog's dimension lookups; the records table appears to render the raw source
columns without passing them through the same resolution. Whether the drill-down
was built before the lookups existed, or simply never wired to them, this record
cannot settle.

## Impact

The drill-down is the feature that makes an analytics number trustworthy — the
answer to "prove it". In its current form it cannot be read, so the number above
it cannot be checked, and a reader who opens it once is unlikely to open it
again.

No data exposure: the identifiers belong to the caller's own tenant and the rows
are already access-filtered. This is unreadable, not unsafe.

Rated HIGH rather than MEDIUM because it defeats the purpose of the surface
rather than degrading it, and because it is on every analytics page.

## Affected Areas

`apps/web/app/(authenticated)/reports` (the records table component) and
`services/api/src/modules/reporting` (the row projection served to it).

## Proposed Resolution

Resolve dimension columns to display names in the drill-down through the same
lookup the breakdown uses, rather than adding a second resolver. Where an id has
no label, show the id — but as a fallback, not as the default.

Separately, either count the same unit as the metric or name the unit in the
sentence: "332 daily snapshot rows behind this headcount of 12" is honest and as
short.

Fix the percentage rounding in the same change: one rounding rule for the whole
breakdown, and a decision about whether the parts are shown as summing to 100.

## Acceptance Criteria

- No UUID appears in a records table for a column that has a display name.
- A column with no resolvable label shows the id and is visibly a fallback.
- The count above the table and the metric it explains either count the same
  unit or the sentence names the unit.
- All parts of a breakdown use one rounding rule.
- A test renders the drill-down with a known fixture and asserts no value
  matching a UUID pattern appears in a labelled column.

## Regression Coverage

None yet. The UUID assertion above is the one that would have caught this, and
it is cheap: a regex over the rendered cell values.

## Dependencies

None.

## Related Items

- [[BUG-3007]] — the entitlement leak on the same surface.
- [[ITEM-0128]] — the explanatory cards above these tables.
- [[ITEM-0130]] — why the review missed this.
- Modules — [[reporting]], [[tenant-application]]

## Resolution

Open. No fix has been written.

## QA Retest

Awaiting a fix.

## History

- 2026-09-09 — reported by the user during the Reports & Analytics review, and
  confirmed on the production Starter demo tenant. The user reported the GUIDs
  and the count; the rounding inconsistency was found while confirming them.
- 2026-09-09 — triaged FIX_NOW by the Architect for SESSION-0095.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]], [[reporting]]

<!-- GRAPH:END -->
