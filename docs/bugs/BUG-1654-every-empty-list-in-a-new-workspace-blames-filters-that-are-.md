---
ID: BUG-1654
aliases: [BUG-1654]
Title: Every empty list in a new workspace blames filters that are not set
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-27
DetectedInSha: 21032ae
AffectedModules: [views, employees]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-27
UpdatedAt: 2026-08-27
ResolvedAt:
---

# BUG-1654 — Every empty list in a new workspace blames filters that are not set

> **Architect triage, 2026-08-27 — `FIX_NOW`.** It is the first sentence a new customer reads on every screen, and it is wrong. Cheap, and it sits beside [[BUG-1649]] on the same first-run surface -- fix the pair together.


## Summary

Every list in a freshly provisioned workspace renders "No records match the
selected search or filters." No search has been typed and no filter is set —
the tenant simply has no data yet. The first thing a new customer reads on every
screen is an explanation for an absence that has a different cause.

## Expected Behavior

A list with no records and no active filter says the module is empty and,
ideally, what to do about it. A list whose filters exclude everything says that
instead. The two are different states and read differently.

## Actual Behavior

Both states render the same sentence, and it describes only the second.

## Reproduction

1. Provision a tenant through the paid public signup and sign in as its owner.
2. Open Employees. Apply no filter and type nothing.
3. Read the table body.

Repeats on Leave, and on every module list rendered by the shared table.

## Evidence

Observed on production 2026-08-27 on tenant `dijipeople-demo`, minutes after
its owner first signed in — a workspace with one user and no other records.

Employees, on the default `All Employees` view
(`?viewId=10000000-0000-4000-8000-000000000001`), no search text:

```
No records match the selected search or filters.
```

Leaves, on its default view, identical. The string has a single definition:
`apps/web/app/components/data-table/data-table.tsx:669`, so every runtime module
list shares it.

## Root Cause

Established. The table renders one empty-state message and does not distinguish
"no rows exist" from "no rows survived the filter". `data-table.tsx:669` is the
only definition, and nothing above it branches on whether a search term or
filter is active.

The ambiguity is already known in the opposite direction.
`apps/web/lib/runtime/modules/standard-module-views.spec.ts:15-25` exists
because a view naming a field its module does not have "fails silently and in
the worst possible way: the column renders blank, or the filter matches nothing
and the grid says 'No records match the selected search or filters' — which
reads as 'there is no data' rather than 'this view is broken'."

That comment describes this exact sentence being misread one way. This record is
it being misread the other. One message serving two opposite conditions is the
defect; the spec guards a symptom of it.

## Impact

It lands on the first-run experience, which is the one moment a customer forms a
judgement about whether the product works. Every module they open tells them
their filters are hiding something, when nothing is hidden and nothing is wrong.

The likely reading is that the product is broken or that data failed to load —
particularly here, where a genuine "Server unavailable" dialog is also on screen
from [[BUG-1649]]. Together they make a healthy, correctly provisioned workspace
look like a failed one.

No data is at risk. This is entirely a matter of what the screen says.

## Affected Areas

- `apps/web/app/components/data-table/data-table.tsx:669`
- Every module list rendered through the runtime: Employees, Leave, Attendance,
  Timesheets, Projects, Approvals, Customers, Recruitment, Onboarding
- `apps/admin` if it shares the component — not verified

## Proposed Resolution

Branch the message on whether a search term or any filter is active:

- filters active → keep the current sentence, and offer to clear them
- no filters, no rows → say the module is empty, and where the first record
  comes from

The second case is where a first-run workspace lives, and it is worth writing
per module rather than generically — "No employees yet. Add your first
employee." tells someone what to do; "No records" does not. `ModuleEmptyState`
already exists for this.

Take care not to repeat [[BUG-1559]], which found admin telling users to create
records on screens with no create control. Employees has a New button; some
modules will not.

## Acceptance Criteria

- An unfiltered empty list does not mention search or filters.
- A filtered list that excludes everything does, and offers to clear them.
- A module with a create action points at it; one without does not.
- Verified on a workspace with genuinely no data, not a filtered view of one
  that has some.

## Regression Coverage

None yet. Needs a test asserting the two states render different messages.
Requires a `REG-nnn` entry once written.

## Dependencies

None.

## Related Items

Found on the same first sign-in as [[BUG-1649]], which puts a false error dialog
on the same screens. Same family as [[BUG-1559]] in the admin console.

## Resolution

Not yet resolved.

## QA Retest

Not yet retested. Retest on a newly provisioned tenant — an existing workspace
with data cannot show this state at all, which is why it survived until the
first real first-run.

## History

- 2026-08-27 — found on the first browser sign-in to a newly provisioned tenant
  workspace.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[employees]]

<!-- GRAPH:END -->
