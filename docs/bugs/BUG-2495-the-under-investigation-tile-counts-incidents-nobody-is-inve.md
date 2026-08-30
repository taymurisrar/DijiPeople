---
ID: BUG-2495
aliases: [BUG-2495]
Title: The Under investigation tile counts incidents nobody is investigating
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-30
DetectedInSha: c4ffd13b
AffectedModules: [admin:monitoring, api:platform-monitoring]
OwnerAgent: architect
ArchitectDisposition: TRIAGE_REQUIRED
QAReport:
RegressionId:
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-30
UpdatedAt: 2026-08-30
ResolvedAt:
---

# BUG-2495 — The Under investigation tile counts incidents nobody is investigating

## Summary

The monitoring overview computes "Under investigation" as
`total - open - resolved`. That subtraction assumes every incident is in one of
three states. Since [[BUG-1754]] there is a fourth — `NOT_AN_INCIDENT`, the
rows the classifier deliberately set aside — and the arithmetic was never
taught about it. Every set-aside row therefore lands in the "Under
investigation" tile, labelled **"Assigned and in progress"**, while its link
(`?status=INVESTIGATING`) returns none of them.

Production reads **27** there today, and all 27 are `NOT_AN_INCIDENT`. Nobody
is investigating anything.

## Expected Behavior

"Under investigation" counts incidents actually being investigated —
`INVESTIGATING` and `FIX_IN_PROGRESS`, which is what its own link filters on.
A tile and the screen it opens agree.

## Actual Behavior

The tile counts everything that is neither open nor resolved, which is
`INVESTIGATING + FIX_IN_PROGRESS + NOT_AN_INCIDENT`. In practice it is almost
entirely the last of those, so it reports work in progress that does not exist
and its link opens an empty list.

## Reproduction

1. Open `https://admin.dijipeople.com/settings/monitoring`.
2. "Under investigation" reads 27, hinted "Assigned and in progress".
3. Click it. The queue opens filtered to `status=INVESTIGATING` and returns 0.

Confirmed against the full queue pulled on 2026-08-30: 1,897 incidents,
`supportStatus` distribution `NEW 1870 | NOT_AN_INCIDENT 27`. There are **zero**
rows in any investigating state, and the tile reads 27.

## Evidence

```
total    1897   (all incidents)
open     1870   supportStatus notIn ['RESOLVED', NOT_AN_INCIDENT]
resolved    0
tile     1897 - 1870 - 0 = 27   == exactly the NOT_AN_INCIDENT count
```

- `apps/admin/app/_components/monitoring/monitoring-overview.tsx:200` —
  `value={Math.max(metrics.total - metrics.open - metrics.resolved, 0)}`
- `apps/admin/app/_components/monitoring/monitoring-overview.tsx:196` —
  the link, `${QUEUE}?status=INVESTIGATING`
- `services/api/src/modules/platform-monitoring/platform-monitoring.service.ts:128`
  — `open` is `{ supportStatus: { notIn: ['RESOLVED', NOT_AN_INCIDENT] } }`
- `services/api/src/modules/platform-monitoring/platform-monitoring.service.ts:672`
  — `investigating` means `{ in: ['INVESTIGATING', 'FIX_IN_PROGRESS'] }`

The `open` metric was correctly taught to exclude `NOT_AN_INCIDENT`. The
subtraction three lines away in the frontend was not, so the excluded rows had
to reappear somewhere — and this tile is where the arithmetic put them.

## Root Cause

A derived count standing in for a measured one. "Under investigation" is not
computed from the states it names; it is inferred by subtracting the states it
does not. That inference was true when there were three states and silently
became false when a fourth was added, with nothing to fail.

This is the same shape as [[BUG-1750]] and REG-281 — a tile counting one
thing while its label and its link mean another — and it is the second time
this screen has had it.

## Impact

Directly undermines the surface this whole triage exists to make trustworthy.
An operator reads "27 assigned and in progress", concludes someone is on it,
clicks through to an empty list, and learns not to trust the tiles.

**It gets far worse with the [[BUG-2465]] backfill.** That moves 1,680 rows to
`NOT_AN_INCIDENT`, so this tile would read **1,707 "assigned and in progress"**
against zero real investigations. The backfill must not be applied until this
is fixed, or it converts a small wrong number into an absurd one.

## Affected Areas

- `apps/admin/app/_components/monitoring/monitoring-overview.tsx`
- `services/api/src/modules/platform-monitoring/platform-monitoring.service.ts`
  (the metrics payload, which does not currently expose an investigating count)
- `https://admin.dijipeople.com/settings/monitoring`

## Proposed Resolution

Measure it instead of deriving it. Add an `investigating` count to the metrics
payload, computed from the same `['INVESTIGATING', 'FIX_IN_PROGRESS']` set the
view filter uses, and render that.

One definition, one place — the rule [[BUG-1750]] established for "critical"
after it had been spelled three different ways on this same screen.

Consider also surfacing `NOT_AN_INCIDENT` as its own count rather than leaving
it invisible: after the backfill it is the largest group in the table, and a
number nobody can see is how this drifted in the first place. Worth doing, but
secondary to correcting the wrong label.

No ExecPlan needed.

## Acceptance Criteria

- "Under investigation" equals the number of incidents whose `supportStatus` is
  `INVESTIGATING` or `FIX_IN_PROGRESS`, and nothing else.
- The tile's value matches the row count of the list its link opens.
- With only `NEW` and `NOT_AN_INCIDENT` rows present, the tile reads 0.
- A test asserts the tile value and the view filter derive from one definition.

## Regression Coverage

A spec asserting the metric excludes `NOT_AN_INCIDENT` and counts both
investigating states, and that the tile value agrees with `incidentViewWhere`
for `viewKey=investigating`. Registered as a regression entry once written.

## Dependencies

**Blocks the [[BUG-2465]] backfill.** Fix this first — see Impact.

## Related Items

[[BUG-1750]], [[BUG-1420]], [[BUG-1419]] — the previous round of tiles on this
screen disagreeing with the lists they open. [[BUG-1754]] — the record that
introduced the fourth state this arithmetic never learned. [[BUG-2465]] — the
backfill that would multiply this by 63.

## Resolution

Filled at fix time.

## QA Retest

Pending.

## History

- 2026-08-30 — created from the production monitoring overview at `c4ffd13b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
