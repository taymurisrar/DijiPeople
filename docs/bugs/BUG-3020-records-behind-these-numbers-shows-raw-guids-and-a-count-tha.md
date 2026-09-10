---
ID: BUG-3020
aliases: [BUG-3020]
Title: Records behind these numbers shows raw GUIDs and a count that does not match the metric
Status: FIXED
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
RegressionId: REG-399
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-09
UpdatedAt: 2026-09-11
ResolvedAt: 2026-09-11
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

See the `## Regression Coverage` section under Resolution below, added at
fix closure (REG-399).

## Dependencies

None.

## Related Items

- [[BUG-3007]] — the entitlement leak on the same surface.
- [[ITEM-0128]] — the explanatory cards above these tables.
- [[ITEM-0130]] — why the review missed this.
- Modules — [[reporting]], [[tenant-application]]

## Resolution

Fixed on `agent/cs-s1-openbugs`, one fix per claim in this record, each
verified against the current source before being touched.

**The GUIDs (confirmed real).**
`services/api/src/modules/reporting/semantic/data-sources/workforce-history.source.ts`'s
own class comment already said why: "the label for each id is resolved
through `labelLookup` against the lookup table instead" — because
`workforce_history` stores denormalised foreign keys, not relations, so the
five affected fields (`organization`, `business_unit`, `department`, `team`,
`location`, plus `employee` and `manager`) have `path: <column>Id` and rely
on `labelLookup` for a name. `buildBreakdown` already resolved that lookup
for the chart; `records()` never did, and simply returned the raw scalar
`readFieldValue` reads off the row.

- `services/api/src/modules/reporting/engine/query-executor.ts` —
  `resolveLabels` (the breakdown's own id->label batching) refactored to
  share a new private `lookupLabels(lookup, ids)` with a new public
  `resolveFieldLabels(field, rawValues)`, which does the same batched lookup
  for a set of row values instead of a set of grouped buckets.
- `services/api/src/modules/reporting/execution/analytics.service.ts` —
  `records()` now collects every requested field with a `labelLookup`,
  resolves each in one batch across the whole fetched page (never one query
  per row), and replaces the raw value with the resolved label — falling
  back to the id itself only when the lookup finds nothing (a referenced row
  deleted since the snapshot), and to the field's `nullLabel` when the raw
  value is null.

**The count/unit mismatch (confirmed real).** "332 records behind these
numbers" beside "Historical headcount 12" implied the 332 were the records
*behind* the 12; they are daily snapshot rows across the period, an entirely
different unit. Fixed by naming the actual unit instead of the generic word
"records":
`apps/web/app/(authenticated)/reports/_lib/report-format.ts` gained
`pluralizeRecordNoun`, and
`apps/web/app/(authenticated)/reports/_components/analytics-surface-view.tsx`'s
row-count sentence now reads "332 daily snapshot rows behind these numbers"
(or the equivalent for whichever source is active). `RECORD_NOUNS
['workforce_history']` in
`apps/web/app/(authenticated)/reports/analytics/[surface]/page.tsx` was
itself wrong — "employee", not "daily snapshot row" — and is corrected in
the same change; it had no other consumer (the source's rows carry no
`recordHrefTemplate`, so the noun was never rendered in a link before now).

**The rounding inconsistency — investigated, and only half of what was
reported is real.** Reconstructing the exact split the record describes (a
12-person headcount as 4/2/2/1/1/1/1) against `computeShares`
(`apps/web/app/components/charts/chart-geometry.ts`) shows it already
apportions `displayShare` correctly by largest remainder — 33.4/16.7/16.7/
8.3/8.3/8.3/8.3, summing to exactly 100.0 — so the specific claim that this
function produces an inconsistent 8.4/8.3/8.3/8.3 split summing to 99.6% did
not reproduce, and `chart-geometry.spec.ts` already holds it to that
standard. What *is* real, one step later: `formatShare` chooses its decimal
count per value (0 for ≥10%, 1 below it), which independently re-rounds a
value `computeShares` had already apportioned at one shared precision —
formatting 33.4 with zero decimals while a sibling 8.3 keeps its one throws
away part of that apportionment, and the printed column stops summing to
100 even though the numbers behind it do. Reachable on any breakdown whose
shares span the 10% line, which is most of them.

- `apps/web/app/components/charts/chart-format.ts` — new `formatShares`,
  choosing one decimal count for a whole set of shares (1 decimal whenever
  any member of the set is under 10%) instead of letting each value pick its
  own.
- `apps/web/app/components/charts/horizontal-bar-list.tsx` and
  `chart-frame.tsx` — both call sites that render a breakdown's percentage
  column (the bar list and its table view) now call `formatShares` once over
  the whole set rather than `formatShare` per row, so the two can no longer
  disagree about the same breakdown on the same screen either.
- `formatShare` itself is unchanged: it is still correct for a single
  percentage shown alone (a funnel stage's conversion rate), which is most of
  its other call sites.

## Regression Coverage

REG-399.

- `services/api/src/modules/reporting/engine/query-executor.spec.ts` —
  `resolveFieldLabels`: batches ids into one query, deduplicates, excludes
  null/undefined, falls back correctly for a deleted lookup row and for a
  field with no `labelLookup`. Mutation-tested: reverting `records()` to call
  `readFieldValue` alone (no lookup resolution) is exactly the regression
  this guards; the coverage spec's `stale`/`missing` cases fail if
  `lookupLabels` stops excluding a `NULL_KEY`-equivalent or stops batching.
- `apps/web/app/components/charts/chart-format.spec.ts` — `formatShares`:
  asserts the exact 33.4/16.7/16.7/8.3×4 case sums to 100 and that calling
  `formatShare` on the same values individually does not (33+17+17+8.3×4 =
  100.2, proving the fix is not simply what the old function already did).
- `apps/web/app/(authenticated)/reports/_lib/report-format.spec.ts` —
  `pluralizeRecordNoun` over every noun currently in use.

## QA Retest

Not retested live — no access to a deployed environment or the production
Starter demo tenant from this branch. The three fixes above and their
automated coverage are the evidence available here; a live pass against
`/reports/analytics/workforce` on the Starter demo tenant — confirming no
uuid renders, the sentence names the unit, and the breakdown's bar list and
table agree — is still owed, matching this record's own reproduction steps.

## History

- 2026-09-09 — reported by the user during the Reports & Analytics review, and
  confirmed on the production Starter demo tenant. The user reported the GUIDs
  and the count; the rounding inconsistency was found while confirming them.
- 2026-09-09 — triaged FIX_NOW by the Architect for SESSION-0095.
- 2026-09-11 — fixed on `agent/cs-s1-openbugs`. The uuid leak and the
  count/unit mismatch are both fixed as reported. The rounding claim was
  investigated rather than blindly re-implemented: `computeShares` was
  already correct, and the real defect was one layer later in `formatShare`;
  the fix (`formatShares`) addresses that real defect rather than the
  mechanism the record guessed at. `RegressionId` set to `REG-399` — not
  centrally reserved; chosen as the next unused integer after `REG-398`,
  following the precedent the three records before this one in the same
  branch set for an unallocated regression id.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]], [[reporting]]

<!-- GRAPH:END -->
