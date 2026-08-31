---
ID: BUG-2693
aliases: [BUG-2693]
Title: Historical headcount reports employee-days instead of headcount and grows with the length of the period
Status: FIXED
Severity: HIGH
Priority: P1
Type: DATA_INTEGRITY
Source: QA_RUN
DetectedDate: 2026-08-31
DetectedInSha: bcc188bf
AffectedModules: [services/api/src/modules/reporting]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-389
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-31
UpdatedAt: 2026-08-31
ResolvedAt:
---

# BUG-2693 — Historical headcount reports employee-days instead of headcount and grows with the length of the period

## Summary

The "Historical headcount" tile on Workforce Analytics counted rows in a table that holds one row per employee per day. A company of twelve people read **323**, and the number grew with the length of the selected period rather than describing the workforce.

The value was arithmetically true and answered a question nobody asked. Nothing about the tile looked broken.

## Expected Behavior

Headcount on a day: the number of people employed. Selecting a longer period changes *which* day is reported, never the magnitude of the answer.

## Actual Behavior

The tile reported employee-days, scaling linearly with the window:

| Period selected | Tile showed |
|---|---|
| 7 days | 70 |
| 30 days | 323 |

Twelve employees, in both cases.

## Reproduction

1. Open `/reports/analytics/workforce` on a tenant with workforce snapshots.
2. Read "Historical headcount" with the default 30-day period.
3. Switch the period to 7 days and read it again.
4. The number changes by roughly the ratio of the two periods.

## Evidence

Measured against production, 2026-08-31, on a tenant with 12 employees:

```
period 08/25 - 08/31 (7 days)    Historical headcount  70
period 08/02 - 08/31 (30 days)   Historical headcount  323
```

The metric was declared as:

```ts
calculation: { kind: 'count' },
```

against `workforce_history`, whose own source documentation states it holds one row per employee per day.

Its own caveat, rendered directly beneath the number, read:

> One row per employee per day. A period spanning several days must be grouped by snapshot date; the raw row count over a month is roughly thirty times the headcount.

So the product printed a wrong number and, underneath it, an explanation of how the reader should have computed the right one.

## Root Cause

A stock was modelled as a flow. Counting rows is correct for an event table — joiners, leavers, applications — and wrong for a daily snapshot, where the row count multiplies the population by the number of days.

The metric's `description` already said "Headcount on a given day"; the calculation did not implement that description, and nothing compared the two. The engine had no way to express "count on one date", so `count` was the only kind available and it was reached for.

Why it was not caught earlier: until the workforce backfill ran, `workforce_history` was empty for every tenant and the tile rendered an empty state. The defect could not appear on screen until the surface had data, and it appeared within minutes of it getting some.

## Impact

Every tenant, on the flagship analytics surface, on the tile a reader is most likely to quote. Overstated by a factor of roughly the number of days in the period — about 27x on the default view.

Not a data-integrity problem in the database: the snapshots themselves are correct, and the trend chart beneath the tile was always right, because a trend groups by snapshot date and so every bucket was already a single day.

## Affected Areas

`services/api/src/modules/reporting/metrics/workforce.metrics.ts`, and the metric engine, which had no calculation kind able to express a point-in-time count.

`workforce.turnover_rate` names this metric in `dependsOn` and its caveat requires an **average daily** headcount denominator — a genuinely different quantity. It is unaffected in practice because `derived` metrics return `null` and nothing composes them, so turnover renders as "—" today. That is recorded separately rather than fixed here.

## Proposed Resolution

Add a `point_in_time_count` calculation kind: resolve the latest date present in the period, then count only that day. Not the period's own end date — the snapshot job captures *yesterday*, so the last day of a period ending today is routinely empty and would report zero.

## Acceptance Criteria

- Headcount on a 7-day and a 30-day period returns the same magnitude for an unchanging workforce.
- A breakdown by department sums to the headcount, not to employee-days.
- A period containing no snapshot reports nothing rather than zero.
- The trend continues to show one point per day.

## Regression Coverage

REG-389.

## Dependencies

None.

## Related Items

Found immediately after the workforce backfill made the surface non-empty, during the follow-up to [[TASK-0028]]. Same family of "presentation misstating a true number" as [[BUG-2043]].

## Resolution

Fixed on `agent/session-redirect-loop`. New `point_in_time_count` kind in the calculation union, implemented once in `restrictToLatestDate` and used by both the scalar path and the breakdown — the breakdown needed it too, or "headcount by department" became "employee-days by department", the same defect drawn as a chart.

The caveats were rewritten. The old one explained how to work around the tile; the new ones say which day is counted and that an empty period means unmeasured rather than unstaffed.

## QA Retest

To be confirmed in production after deploy: the same magnitude at 7 and 30 days, and a department breakdown that sums to it.

## History

- 2026-08-31 — found within minutes of the workforce backfill giving the surface data; it had been unobservable while the tile showed an empty state.
- 2026-08-31 — fixed with a new point-in-time calculation kind.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[reporting]]
- Regression — REG-389 (see the regression register)

<!-- GRAPH:END -->
