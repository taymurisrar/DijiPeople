---
ID: BUG-1756
aliases: [BUG-1756]
Title: Bulk delete confirms without naming how many records or which ones
Status: VERIFIED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-28
DetectedInSha: 912f4e61
AffectedModules: [apps/admin]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-28-admin-console-e2e-912f4e6.md
RegressionId: REG-284
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-28
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1756 — Bulk delete confirms without naming how many records or which ones

## Summary

Selecting rows and choosing Delete shows "Delete selected records?" with no
count and no names, and the list itself never displays a selection count. An
operator confirming a bulk delete has nothing on screen telling them whether
they are deleting one record or every record on the page.

## Expected Behavior

A destructive bulk action states its scope: how many records, and ideally which,
before it is confirmed. The list shows how many rows are selected.

## Actual Behavior

The dialog reads:

> **Delete selected records?**
> This action follows the module retention policy and cannot always be reversed.

No count, no names. The toolbar shows no "n selected" indicator either — instead
it replaces New and Refresh with the bulk actions, so the only signal that a
selection exists is that the toolbar changed shape.

## Reproduction

1. Platform Admin, **Partners** (or Customers — any module where delete is
   enabled).
2. Tick the header checkbox to select every row.
3. **More → Delete**.
4. The confirmation names neither the count nor the records.

## Evidence

Observed on Partners and Customers during this pass; bulk delete itself works
correctly in both.

The risk is clearest on **Plans**. Selecting all five plans and opening More
presents the same flow, and the selection includes `Starter`, which carries two
live subscriptions. Delete is correctly disabled there — `MODULE_CAPABILITIES`
refuses it with a tooltip reading "Plans are referenced by every subscription and
price sold under them. Archive the plan instead" — so no harm is possible on that
module. But the same unlabelled dialog governs the modules where delete *is*
enabled, and nothing in it distinguishes one record from all of them.

The disabled-with-a-reason pattern is good design and worth keeping; this record
is only about the confirmation that follows when the action is allowed.

## Root Cause

The confirmation dialog is generic and is not passed the selection it is
confirming.

## Impact

Moderate. Bulk delete is reachable on leads, partners, partner inquiries,
customers, customer onboarding and partner onboarding. The header checkbox
selects the whole page in one click, so the gap between "delete one" and "delete
twenty-five" is one checkbox and an unlabelled confirm.

No data was lost during this pass, and the flow is not broken — this is about
the margin for error it leaves.

## Affected Areas

`apps/admin` runtime list toolbar, selection state, and the bulk delete
confirmation dialog.

## Proposed Resolution

Pass the selection into the dialog and state the count — "Delete 5 selected
partners?" — and list the record names when the selection is small. Add a
persistent "n selected" indicator to the toolbar so the selection is visible
before the dialog opens.

## Acceptance Criteria

- The bulk delete confirmation names how many records will be deleted.
- The list shows a selection count whenever at least one row is selected.
- Selecting rows does not hide New and Refresh without replacing them with a
  visible count.

## Regression Coverage

None yet.

## Dependencies

None.

## Related Items

[[BUG-1749]] — the plans module, where delete is deliberately refused, and the
refusal is the part that works well.

## Resolution

Fixed 2026-08-28 on `agent/open-bug-sweep`, with [[BUG-1560]].

The bulk confirmation states the count — "Delete 5 partners?" — and lists the
names when the selection is small. Past five it names five and counts the rest:
forty names turn the dialog into a wall nobody reads, which fails the same way
naming none does.

The toolbar now shows "n selected of m" while a selection exists, so the
selection is visible *before* the dialog opens. That was the other half of the
complaint and arguably the more important one — a dialog is a last chance, not
the first time an operator should learn what they have selected.

Guarded by REG-284.

## QA Retest
Retested 2026-08-29 by the regression-guard sweep: `apps/admin/lib/runtime/destructive-confirm.spec.ts` ran and passed, as part of `npm --workspace admin run test` (379 passing).

Not retested in production, and that boundary is the point of saying so — this environment cannot drive the deployed system, so what is established is that the fix is still present and its guard still passes, not that the screen behaves. See [[2026-08-28-regression-guard-sweep-9e55663]].

### What this record said before the sweep

Not retested in a browser. `destructive-confirm.spec.ts` covers the counting,
the naming cutoff, the singular/plural agreement and the fallback when there is
nothing to name; it also asserts the list renders the selection count.

## History

- 2026-08-28 — created from the admin console end-to-end QA pass at `912f4e61`,
  observed against production `e0aeabcd`.
- 2026-08-28 - bulk delete counts and names what it will delete, and the toolbar shows the selection before the dialog opens. REG-284.

## Verification — 2026-08-29

Verified by re-reading the guard and running it, not by a browser pass. The
repository owner asked for this sweep after 48 records had accumulated in
`FIXED` — fixed, but with nobody having confirmed them against a running
system.

What was checked for this record:

- its regression guard exists on disk at this commit;
- the suite containing it passes.

Guard:

- `apps/admin/lib/runtime/destructive-confirm.spec.ts`

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

- Modules — [[platform-admin]]
- Regression — REG-284 (see the regression register)

<!-- GRAPH:END -->
