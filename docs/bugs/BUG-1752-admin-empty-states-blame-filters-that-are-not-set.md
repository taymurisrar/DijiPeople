---
ID: BUG-1752
aliases: [BUG-1752]
Title: Admin empty states blame filters that are not set
Status: VERIFIED
Severity: LOW
Priority: P3
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-28
DetectedInSha: 912f4e61
AffectedModules: [apps/admin]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-28-admin-console-e2e-912f4e6.md
RegressionId: REG-283
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-28
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1752 — Admin empty states blame filters that are not set

## Summary

Every empty list in the Platform Admin console tells the operator to "adjust the
current view and filters" whether or not any filter is applied. This is exactly
the defect [[BUG-1654]] recorded and fixed — but that fix landed in `apps/web`
only, and `apps/admin` builds its empty state from a static string in the shared
module registry, so it has no filter-awareness at all.

## Expected Behavior

An empty list with no search and no filters says the module is empty. An empty
list caused by filters says the filters are the reason.

## Actual Behavior

Both cases render the same sentence, which names filters in both.

## Reproduction

1. Platform Admin, **Support cases**. View is "All cases", status filter is "All
   statuses", search is empty — no filter is applied.
2. The screen reads: "No support cases found / Create a support case or adjust
   the current view and filters."

The same wording appears on every empty runtime list, for example Commissions
("No commissions found").

## Evidence

The admin side, `apps/admin/lib/runtime/platform-module-registry.ts:4014-4017`,
inside the shared `define()` helper:

```ts
emptyState: input.emptyState ?? {
  title: `No ${input.pluralDisplayName.toLowerCase()} found`,
  description: `Create a ${input.displayName.toLowerCase()} or adjust the current view and filters.`,
  actionLabel: `New ${input.displayName.toLowerCase()}`,
},
```

Static, and applied to every module that does not override it.

The web side was fixed properly —
`apps/web/app/components/data-table/utils.ts:277`:

```ts
export function emptyStateMessage(hasActiveSearchOrFilters: boolean): string {
  return hasActiveSearchOrFilters
    ? "No records match the selected search or filters."
    : "No records yet.";
}
```

covered by `apps/web/app/components/data-table/empty-state-message.spec.ts`,
which asserts `emptyStateMessage(false)` is `"No records yet."`.

## Root Cause

[[BUG-1654]] was fixed in the app where it was observed. The same defect existed
in the other app, through a different mechanism — a static registry string
rather than a message function — and nothing connected the two.

## Impact

Low. It misleads an operator into hunting for filters that are not set, most
sharply on a genuinely empty module where the honest message would be "nothing
here yet". It is the kind of small wrongness that makes a console feel
untrustworthy on first use.

## Affected Areas

`apps/admin` runtime module registry and every runtime list screen.

## Proposed Resolution

Port `emptyStateMessage()` from `apps/web`, or make the registry's `emptyState`
description a function of the active search and filter state rather than a
constant. Prefer sharing one implementation between the two apps so the next fix
does not have to be made twice.

## Acceptance Criteria

- An empty admin list with no filters set says the module is empty.
- An empty admin list with filters set says the filters are why.
- A spec covers both, mirroring the existing web spec.

## Regression Coverage

None on the admin side. The web spec exists and passes while this defect is
live, which is the gap.

## Dependencies

None.

## Related Items

[[BUG-1654]] — the same defect, fixed in `apps/web` and shipped in `e0aeabcd`.
[[BUG-1751]] — the promotions table shows no empty state at all, a harsher
version of the same problem on a bespoke screen.

## Resolution

Fixed 2026-08-28 on `agent/open-bug-sweep`, in `@repo/config` rather than in
either app.

The admin default composed one static string for every empty list — "Create a
<thing> or adjust the current view and filters" — which is wrong in two
independent ways, and both records are closed by the same change.

The wording now depends on what is actually true:

- **Filtered**, and the list says the filters are why and offers to clear them.
- **Unfiltered with a create control**, and it suggests creating one.
- **Unfiltered without one**, and it says where the records come from —
  "Invoices are raised automatically when a subscription bills" — because an
  instruction the operator cannot follow is worse than no instruction.

Whether the list is filtered is decided by the list and passed in, never
recomputed: the table already tracks it, including operators that filter without
a value, and a second definition would disagree with the first the moment either
changed. The view key is deliberately not counted as a filter — a view is where
the operator navigated to, and "Resolved" being empty is good news.

It lives in `packages/config` because [[BUG-1654]] fixed exactly this in
`apps/web` and `apps/admin` kept the defect. One implementation, so the next
correction is not made twice.

Guarded by REG-283.

## QA Retest
Retested 2026-08-29 by the regression-guard sweep: `packages/config/empty-list-message.test.js` ran and passed, as part of `node --test packages/config/…`.

Not retested in production, and that boundary is the point of saying so — this environment cannot drive the deployed system, so what is established is that the fix is still present and its guard still passes, not that the screen behaves. See [[2026-08-28-regression-guard-sweep-9e55663]].

### What this record said before the sweep

Not retested in a browser. `packages/config/empty-list-message.test.js` asserts
the unfiltered wording mentions neither "filter" nor "search" — which is the
whole of this defect — and runs in CI as its own step.

The browser check is a screen with no records and no filters set: it must not
mention filters.

## History

- 2026-08-28 — created from the admin console end-to-end QA pass at `912f4e61`,
  observed against production `e0aeabcd` while retesting [[BUG-1654]].
- 2026-08-28 - empty-list wording moved to @repo/config and made a function of the actual state. REG-283.

## Verification — 2026-08-29

Verified by re-reading the guard and running it, not by a browser pass. The
repository owner asked for this sweep after 48 records had accumulated in
`FIXED` — fixed, but with nobody having confirmed them against a running
system.

What was checked for this record:

- its regression guard exists on disk at this commit;
- the suite containing it passes.

Guard:

- `packages/config/empty-list-message.test.js`

Proven by:

- `node --test packages/config/…` — 11 of 12 files passing (the twelfth is ITEM-0092, unrelated)

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

- Modules — [[platform-admin]]
- Regression — REG-283 (see the regression register)

<!-- GRAPH:END -->
