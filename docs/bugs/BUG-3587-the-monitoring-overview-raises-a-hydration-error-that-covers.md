---
ID: BUG-3587
aliases: [BUG-3587]
Title: The monitoring overview raises a hydration error that covers the page with the error dialog
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-09-25
DetectedInSha: 0a84a58e
AffectedModules: [apps/admin]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/tasks/TASK-0032-streams/QA-summary.md
RegressionId: REG-626
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: TASK-0032
CreatedAt: 2026-09-25
UpdatedAt: 2026-09-25
ResolvedAt: 2026-09-25
---

# BUG-3587 — The monitoring overview raises a hydration error that covers the page with the error dialog

## Summary

The admin monitoring overview rendered a relative time (e.g. "2 minutes ago")
for incidents directly during React's server render, and again during
hydration on the client a few seconds later — the two renders necessarily
disagree because time has passed between them, which React reports as a
hydration mismatch. `ErrorProvider`'s global error boundary caught that
mismatch and covered the entire page with its blocking error dialog, making
the monitoring overview unusable on first load.

## Expected Behavior

A relative time on the monitoring overview should render identically on the
server and the client's first paint, then update client-side afterwards — the
standard fix for any "time since" display in a server-rendered React tree —
and a purely cosmetic timing difference should never trigger the page-level
error dialog.

## Actual Behavior

The relative-time formatting ran unguarded in the shared render path, so the
server's snapshot (computed at response time) and the client's first hydration
pass (computed moments later, always at least slightly later) produced
different strings for the same incident. React flagged this as a hydration
error, `ErrorProvider`'s global fetch/error interceptor treated it as a fatal
error, and the resulting full-page dialog covered the monitoring overview
before an operator could interact with it.

## Reproduction

1. Load `/settings/monitoring` (or the equivalent monitoring overview route)
   in `apps/admin` with at least one incident present.
2. Observe the page briefly renders, then the blocking error dialog covers it.

**Live reproduction, throwaway stack, 2026-09-25** (TASK-0032 WP-09 live QA):
the monitoring overview's relative incident times triggered a hydration
mismatch, and the resulting error dialog covered the page.

## Evidence

- `apps/admin` monitoring overview component(s) rendering incident relative
  times directly in the shared render path with no hydration guard.
- `ErrorProvider`'s global error boundary treating the resulting React
  hydration warning as page-fatal.

## Root Cause

A relative-time string is not stable between a server render and the client's
first hydration pass because real time elapses between them — a well-known
Next.js/React pitfall that needs either a fixed reference timestamp shared
between server and client, or client-only rendering of the relative portion
after mount (e.g. `suppressHydrationWarning` plus a `useEffect`-driven
client-side update).

## Impact

The monitoring overview — the page an operator opens specifically to
investigate a problem — was itself broken by its own error handling on first
load, for every environment with at least one incident recorded. No data was
lost, but the page was effectively unusable until the dialog was dismissed (if
dismissible) or the page reloaded.

## Affected Areas

- `apps/admin` monitoring overview (incident relative-time rendering)
- `apps/admin` `ErrorProvider` (treats a hydration warning as page-fatal)

## Proposed Resolution

Render incident times hydration-safely (compute the relative string only after
mount, or pass a shared, stable reference timestamp from the server render) so
the server and client markup agree on first paint. No ExecPlan needed — a
frontend rendering fix, no schema or contract change.

## Acceptance Criteria

- Loading the monitoring overview with incidents present never triggers the
  page-level error dialog.
- Incident relative times still update to reflect elapsed time after the
  initial render.

## Regression Coverage

REG-626 — no automated test exists for this path: `apps/admin`'s jest
configuration runs no rendering tests (no `jsdom`, matching the precedent
already recorded for REG-587 for the same app), so this is verified by direct
browser reproduction against the throwaway stack (see QA Retest) and by code
review of the hydration-safe rendering change, following the same
manual/browser-regression precedent REG-587 already established in this
register.

## Dependencies

None.

## Related Items

- [[BUG-3586]] — the sibling monitoring defect fixed in the same commit.
- Modules — [[platform-monitoring]]
- TASK-0032 — the program that found and fixed this.

## Resolution

Fixed by commit `910fcb50` (`fix(admin,monitoring): hydration-safe incident
times, honest health headline, readable MFA column (TASK-0032)`): incident
relative times now render hydration-safely, and the global error dialog no
longer fires for this case.

## QA Retest

Verified by TASK-0032 WP-09 live QA re-run against the throwaway stack after
the fix (browser reproduction, repeated page loads with incidents present, no
dialog) — see `docs/tasks/TASK-0032-streams/QA-summary.md` ("Monitoring
overview relative times caused a hydration error that the admin error dialog
covered the page with": Fixed `910fcb50`).

## History

- 2026-09-25 — created by the TASK-0032 records clerk pass, from WP-09 live
  QA.
- 2026-09-25 — Architect triage: FIX_NOW, then DONE once fixed at `910fcb50`
  and verified by WP-09 browser retest.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[platform-admin]]
- Regression — REG-626 (see the regression register)

<!-- GRAPH:END -->
