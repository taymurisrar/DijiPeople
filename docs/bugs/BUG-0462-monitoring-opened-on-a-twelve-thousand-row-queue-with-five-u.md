---
ID: BUG-0462
aliases: [BUG-0462]
Title: Monitoring opened on a twelve thousand row queue with five unactionable tiles
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-22
DetectedInSha: 3883798
AffectedModules: [apps/admin]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-193
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: agent/tenant-repair-and-console-ux
CreatedAt: 2026-08-22
UpdatedAt: 2026-08-22
ResolvedAt: 2026-08-22
---

# BUG-0462 — Monitoring opened on a twelve thousand row queue with five unactionable tiles

## Summary

The sidebar's Monitoring entry linked to `/settings/monitoring/error-logs`,
dropping every operator straight into a queue of 12,005 incidents and skipping
the Overview that exists to say which of them matter. The five tiles above that
queue were mislabelled and inert.

## Expected Behavior

Monitoring opens on its Overview. Every number on the incident queue says what
it counts, over what window, and narrows the table when clicked.

## Actual Behavior

- The sidebar skipped Overview entirely.
- **"Error severity: 488"** — a column name used as a metric label, counting
  criticals.
- **"Open investigations: 12,005"** equalled **"Matching incidents: 12,005"**,
  because every sanitized incident starts `NEW`. The same figure under two names,
  and neither said which was the queue.
- No tile was clickable, so learning that 488 were critical left an operator to
  rebuild that filter by hand.
- No tile stated its window, so "12,005" read as a workload rather than as
  everything ever recorded.

## Reproduction

1. Sign in to Platform Admin, click **Monitoring** in the sidebar.
2. Land on Incidents / Errors, never on Overview.
3. Read the five tiles; click one.

## Evidence

- `apps/admin/lib/runtime/platform-module-registry.ts` — `routeBase` for
  `monitoring-incidents` is `/settings/monitoring/error-logs`, and
  `moduleItem()` used it directly.
- `apps/admin/app/_components/monitoring/error-logs-table.tsx` — five
  `SummaryCard`s rendered as `<article>`, with the labels above.

## Root Cause

Two independent errors that read as one bad page.

`routeBase` is where a module's *records* live, which is the right answer for
the runtime record routes built from it and the wrong one for an area's landing
page. Using it for both meant the more specific answer won.

The tiles were built as presentation rather than as controls. A metric that
cannot be acted on is decoration, and one with no stated scope is a number.

## Impact

Every platform operator using Monitoring, which is the screen used when
something is wrong — the worst time to be handed a firehose with no way to
narrow it.

## Affected Areas

`apps/admin` — the sidebar, and the incident queue's summary row.

## Proposed Resolution

An `href` override on `moduleItem` so Monitoring lands on `/settings/monitoring`
without changing `routeBase`. Rename each tile to what it counts, make each one
toggle its filter, show the active window on every tile, and mark the tile whose
filter is in force so the row doubles as a statement of what is being shown.

## Acceptance Criteria

- The sidebar lands on Overview, and stays highlighted across all monitoring
  pages.
- Every tile label names what it counts.
- Every tile states its window.
- Clicking a tile applies its filter; clicking it again clears it.
- The active tile is marked, in text as well as colour.

## Regression Coverage

REG-193 — `apps/admin/lib/monitoring-metrics.spec.ts`.

## Dependencies

None. The default window is deliberately **unchanged**: narrowing it would make
the page open on less than everything, which is a product decision rather than a
UX repair.

## Related Items

[[unbounded-render]] — the same instinct, one screen over.

## Resolution

Fixed on `agent/tenant-repair-and-console-ux`.

## QA Retest

Not opened in a browser.

## History

- 2026-08-22 — reported as "make sure 'Overview' tab opens as default ... and
  also redo the user experience of this page".
