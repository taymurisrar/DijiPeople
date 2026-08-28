---
ID: BUG-1559
aliases: [BUG-1559]
Title: Empty states instruct the user to create records on screens with no create control
Status: VERIFIED
Severity: LOW
Priority: P3
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-26
DetectedInSha: 21032ae
AffectedModules: [billing]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-283
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-26
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1559 — Empty states instruct the user to create records on screens with no create control

> **Architect triage, 2026-08-27 — `DEFER`.** Copy, though the fix is a real one -- say where the records come from.


## Summary

Empty states on the invoices, payments and commissions screens tell the operator
to create a record, on screens that offer no create control. The instruction
cannot be followed from where it is given.

## Expected Behavior

An empty state either offers the action it names, or explains how records
actually arrive on that screen.

## Actual Behavior

Three screens render a "Create a X" empty state with no corresponding control
anywhere on the page.

## Reproduction

1. Sign in to `admin.dijipeople.com` as a platform owner.
2. Open Invoices, then Payments, then Commissions — all three are empty.
3. Read the empty state and look for the control it names.

## Evidence

Observed on production, 2026-08-26, on all three screens. Each was empty and
each carried a create instruction with no create control present.

## Root Cause

Not established. A shared empty-state component that composes its message from
the entity name, without knowing whether the screen exposes a create action,
would produce this on exactly the screens where records are generated rather
than entered — which is what invoices, payments and commissions are.

## Impact

An operator new to the console is told to do something impossible, on three
screens at once. The more useful message on these screens would explain that
invoices and payments arrive from the billing flow and commissions from partner
activity — which is genuine product information the empty state is currently
displacing.

Cosmetic in severity, but these are the first screens a new operator sees empty.

## Affected Areas

- `apps/admin` — the shared empty state and the invoices, payments and
  commissions screens
- `services/api/src/modules/billing`
- `services/api/src/modules/partners` — commissions

## Proposed Resolution

Let the empty state take its message from the screen rather than composing one
from the entity name. On these three screens, say where the records come from.
Where a screen does offer a create control, keep the current behaviour.

## Acceptance Criteria

- No admin screen instructs the user to create a record it offers no control to
  create.
- Invoices, payments and commissions each explain how records reach them.
- Screens with a create control keep their existing empty state.

## Regression Coverage

None yet. Needs a check that a create-instruction empty state is only rendered
where a create action exists. Requires a `REG-nnn` entry once written.

## Dependencies

None.

## Related Items

One of several presentation defects found in the same pass; see [[BUG-1556]] and
[[BUG-1558]].

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

The three screens this record names — invoices, payments and commissions — now
say where their records come from. Those sentences are declared per module in
`RECORD_ORIGINS`, not generated: a generic "records appear here automatically"
would be as useless as the instruction it replaces, and only the module knows
the real answer.

## QA Retest
Retested 2026-08-29 by the regression-guard sweep: `packages/config/empty-list-message.test.js` ran and passed, as part of `node --test packages/config/…`.

Not retested in production, and that boundary is the point of saying so — this environment cannot drive the deployed system, so what is established is that the fix is still present and its guard still passes, not that the screen behaves. See [[2026-08-28-regression-guard-sweep-9e55663]].

### What this record said before the sweep

Not retested in a browser. Covered by `empty-list-message.test.js`, which
asserts that a screen without a create control is never told to create one.

The browser check is the three screens this record names, each with no records:
none should contain the word "create".

## History

- 2026-08-26 — found during the production admin E2E pass; recorded from the
  session transcript, where it had existed only as prose.
- 2026-08-28 - un-deferred and fixed with BUG-1752; screens that cannot create records now say where they come from. REG-283.

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

- Modules — [[billing]]
- Regression — REG-283 (see the regression register)

<!-- GRAPH:END -->
