---
ID: BUG-1556
aliases: [BUG-1556]
Title: Contract dates with no value render as the Unix epoch
Status: VERIFIED
Severity: LOW
Priority: P3
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-26
DetectedInSha: 21032ae
AffectedModules: [contracts]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-292
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-26
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1556 — Contract dates with no value render as the Unix epoch

> **Architect triage, 2026-08-27 — `DEFER`.** Presentation. Group with the other list-rendering fixes.


## Summary

Contract dates with no value render as `Jan 1, 1970` — the Unix epoch — rather
than as an empty state. Two of seven contracts on production showed it. The
screen presents a date that looks real and is not.

## Expected Behavior

A date with no value renders as an empty state, conventionally an em dash, so it
is visibly absent rather than wrong.

## Actual Behavior

An absent date renders as `Jan 1, 1970`.

## Reproduction

1. Sign in to `admin.dijipeople.com` as a platform owner.
2. Open Contracts.
3. Inspect the date columns across the list.
4. Observe `Jan 1, 1970` on contracts whose dates are unset.

## Evidence

Observed on production, 2026-08-26: two of seven contracts rendered `Jan 1,
1970` in a date column.

## Root Cause

Not established. Formatting a null or zero timestamp through a date formatter
without a null guard produces exactly this, but the specific formatter has not
been identified.

## Impact

Cosmetic in most readings, but a rendered date is data an operator may act on —
a contract that appears to have started in 1970 could be read as expired, or
sorted to the top of a date-ordered list. It is wrong rather than merely untidy.

## Affected Areas

- `apps/admin` — contract list date formatting
- `services/api/src/modules/contracts`

## Proposed Resolution

Guard the date formatter against null and zero values and render the shared
empty-state dash. If the formatter is shared, fix it there rather than at the
call site, since any other screen using it has the same defect.

## Acceptance Criteria

- A contract with no start or end date renders an em dash in that column.
- No screen renders `Jan 1, 1970` for an absent date.
- Date sorting places absent dates consistently rather than at the epoch.

## Regression Coverage

None yet. Needs a test asserting the shared date formatter renders the empty
state for null, undefined and zero. Requires a `REG-nnn` entry once written.

## Dependencies

None.

## Related Items

One of several presentation defects found in the same pass; see [[BUG-1558]] and
[[BUG-1559]].

## Resolution

Fixed 2026-08-28 on `agent/open-bug-sweep`.

An absent contract date arrives as an epoch-zero timestamp rather than as null,
so it passed every `!value` guard and rendered as `Jan 1, 1970`. A date that
looks real and is not is worse than no date at all.

Guarded in two places, both of which this record's reasoning points at:

- `apps/admin/lib/formatters.ts` — the shared `formatDate` and `formatDateTime`,
  since anything else using them had the same defect;
- the runtime record page's own date display, which formats inline and is the
  surface the contract dates actually render through.

The test is `getTime() === 0` exactly, not "before some cutoff". A timestamp of
midnight UTC on 1 January 1970 to the millisecond is the sentinel; any other
1970 date is somebody's real data and is left alone.

## QA Retest
Retested 2026-08-29 by the regression-guard sweep: `apps/admin/lib/runtime/lookup-disambiguation.spec.ts`, `apps/admin/lib/formatters.ts` ran and passed, as part of `npm --workspace admin run test` (379 passing).

Not retested in production, and that boundary is the point of saying so — this environment cannot drive the deployed system, so what is established is that the fix is still present and its guard still passes, not that the screen behaves. See [[2026-08-28-regression-guard-sweep-9e55663]].

### What this record said before the sweep

Not retested in a browser. The check is the two contracts this record found —
two of seven on production — which should now show an empty state rather than a
date.

Worth a wider look than contracts: the shared formatter is used elsewhere, so
any screen that was showing 1 January 1970 is also fixed, and any that still
does is formatting dates somewhere this change did not reach.

## History

- 2026-08-26 — found during the production admin E2E pass; recorded from the
  session transcript, where it had existed only as prose.
- 2026-08-28 - un-deferred: epoch-zero is treated as absent in the shared formatters and in the runtime date display. REG-292.

## Verification — 2026-08-29

Verified by re-reading the guard and running it, not by a browser pass. The
repository owner asked for this sweep after 48 records had accumulated in
`FIXED` — fixed, but with nobody having confirmed them against a running
system.

What was checked for this record:

- its regression guard exists on disk at this commit;
- the suite containing it passes.

Guard:

- `apps/admin/lib/runtime/lookup-disambiguation.spec.ts`
- `apps/admin/lib/formatters.ts`

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

- Modules — [[contracts-and-agreements]]
- Regression — REG-292 (see the regression register)

<!-- GRAPH:END -->
