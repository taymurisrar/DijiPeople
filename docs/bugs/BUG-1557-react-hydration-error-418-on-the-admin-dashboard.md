---
ID: BUG-1557
aliases: [BUG-1557]
Title: React hydration error 418 on the admin dashboard
Status: VERIFIED
Severity: LOW
Priority: P3
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-26
DetectedInSha: 21032ae
AffectedModules: [dashboard]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-296
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-26
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1557 — React hydration error 418 on the admin dashboard

> **Architect triage, 2026-08-27 — `DEFER`.** A console error with no user-visible effect. Worth fixing to keep the console readable, not before the above.


## Summary

The admin dashboard logs React error #418 — a hydration mismatch — to the
browser console on load. The page renders, but server and client disagree about
the initial markup.

## Expected Behavior

The dashboard hydrates cleanly, with no hydration warnings in the console.

## Actual Behavior

React error #418 appears in the console on dashboard load.

## Reproduction

1. Sign in to `admin.dijipeople.com` as a platform owner.
2. Open the dashboard.
3. Read the browser console.

## Evidence

Observed on production, 2026-08-26: React error #418 in the console on the admin
dashboard.

## Root Cause

Not established. Hydration mismatches on a dashboard commonly come from
rendering a value that differs between server and client — a relative time, a
locale-formatted number, a random key — but the specific element has not been
identified.

## Impact

The page works, so the immediate user impact is nil. The cost is that a
persistent console error trains everyone to ignore the console on this screen,
which is where several other defects in this pass were found. A dashboard that
always shows an error is a dashboard whose console carries no signal.

Hydration mismatches can also cause React to discard and re-render server
markup, so there may be a minor render cost.

## Affected Areas

- `apps/admin` — the dashboard route and its components
- `services/api/src/modules/dashboard`

## Proposed Resolution

Identify the mismatching element. If it is a time or locale-formatted value —
the most likely candidate given the dashboard's content — render it after
mount, or format it deterministically on both sides.

## Acceptance Criteria

- The admin dashboard loads with no React hydration error in the console.
- No new console errors are introduced by the fix.

## Regression Coverage

None yet. A console-error assertion on the dashboard in the browser e2e suite
would cover it. Requires a `REG-nnn` entry once written.

## Dependencies

None.

## Related Items

Found in the same production admin E2E pass as [[BUG-1515]].

## Resolution

Fixed 2026-08-28 on `agent/open-bug-sweep`. Two causes, both the same shape, and
they get opposite treatments for a reason.

The mismatching elements are the ones this record predicted — locale-formatted
values. Next server-renders this client component on a UTC server and hydrates
it in a browser somewhere else, and two formatters were told to use "whatever
locale and timezone this JavaScript happens to be running in":

1. `new Intl.NumberFormat(undefined, ...)`, used for every money figure on the
   page. **Made deterministic** — `en-US`, matching `lib/formatters`, so the
   dashboard now formats money the same way as every other admin screen. There
   is no reading of an amount where the viewer's locale is right and the
   server's is wrong.

2. `new Date(summary.refreshedAt).toLocaleString()` on the "Refreshed" stamp.
   **Declared as legitimately different**, with `suppressHydrationWarning`.
   Formatting this deterministically would fix the warning by showing every
   operator the server's clock, and "when was this refreshed" is only useful in
   the viewer's own time. The difference is real, so it is stated rather than
   removed.

Two `toLocaleDateString()` calls on contract dates now go through the shared
`formatDate`, which pins its locale.

Guarded by REG-296, which also checks the hazard has not spread: no client
component in `apps/admin` formats against an explicit `undefined` locale.

## QA Retest
Retested 2026-08-29 by the regression-guard sweep: `apps/admin/lib/dashboard-hydration.spec.ts` ran and passed, as part of `npm --workspace admin run test` (379 passing).

Not retested in production, and that boundary is the point of saying so — this environment cannot drive the deployed system, so what is established is that the fix is still present and its guard still passes, not that the screen behaves. See [[2026-08-28-regression-guard-sweep-9e55663]].

### What this record said before the sweep

Not retested in a browser, and this one is worth confirming there — the evidence
for this record is a console error, and the closing evidence should be its
absence.

Load the admin dashboard with the console open. React error #418 should be gone.

If it is not, the remaining mismatch is something else and the diagnosis above
was incomplete rather than wrong: these two were certainly mismatches, and
whether they were the *only* ones cannot be established from the source.

## History

- 2026-08-26 — found during the production admin E2E pass; recorded from the
  session transcript, where it had existed only as prose.
- 2026-08-28 - un-deferred: money formatting made deterministic, the refresh clock declared as legitimately viewer-local. REG-296.

## Verification — 2026-08-29

Verified by re-reading the guard and running it, not by a browser pass. The
repository owner asked for this sweep after 48 records had accumulated in
`FIXED` — fixed, but with nobody having confirmed them against a running
system.

What was checked for this record:

- its regression guard exists on disk at this commit;
- the suite containing it passes.

Guard:

- `apps/admin/lib/dashboard-hydration.spec.ts`

Proven by:

- `npm --workspace admin run test` — 379 passing

**What this does not establish.** No screen was opened. A guard that reads
source and asserts a string is weaker evidence than one that runs the code, and
this sweep does not distinguish between them — it establishes that the fix is
still present and its test still passes, which is what separates a real fix from
one that was silently reverted. Behaviour against production remains unverified
here, and a browser QA pass would still be worth having.

Part of a sweep over all 48: every one of the 206 regression test files named in
the register was confirmed to exist, and every suite containing one was run.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Regression — REG-296 (see the regression register)

<!-- GRAPH:END -->
