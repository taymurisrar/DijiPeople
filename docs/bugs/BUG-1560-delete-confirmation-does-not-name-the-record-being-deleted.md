---
ID: BUG-1560
aliases: [BUG-1560]
Title: Delete confirmation does not name the record being deleted
Status: VERIFIED
Severity: LOW
Priority: P3
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-26
DetectedInSha: 21032ae
AffectedModules: [leads]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-284
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-26
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1560 — Delete confirmation does not name the record being deleted

> **Architect triage, 2026-08-27 — `DEFER`.** Cheap and worth doing, but the blast radius on a lead is small.


## Summary

The delete confirmation dialog does not name the record it is about to delete.
The operator is asked to confirm a destructive action without being told what it
applies to.

## Expected Behavior

A destructive confirmation names its target, so the operator can see they are
deleting the record they meant to.

## Actual Behavior

The dialog asks for confirmation generically, with no record name.

## Reproduction

1. Sign in to `admin.dijipeople.com` as a platform owner.
2. Open Leads and select a lead.
3. Delete it, and read the confirmation dialog.

## Evidence

Observed on production, 2026-08-26, on the lead delete path.

For contrast, the tenant erasure flow on the same console does this properly: it
presents destroyed-versus-kept counts from a rolled-back dry run, requires a
reason, and requires the operator to type both the tenant name and a
confirmation phrase. The pattern already exists in this codebase.

## Root Cause

Not established. A shared confirmation component that takes no record context
would produce this, but it has not been located.

## Impact

An operator who selected the wrong row has nothing in the dialog to catch it.
The blast radius on a single lead is small, but the same generic dialog is
likely used for other record types, and the confirmation is the last point at
which a mistaken deletion can be stopped.

## Affected Areas

- `apps/admin` — the shared delete confirmation
- `services/api/src/modules/leads`, and any other module using the same dialog

## Proposed Resolution

Pass the display name of the record into the confirmation and render it. Follow
the tenant erasure panel as the reference for what a destructive confirmation
should contain; it does not need typing confirmation for a lead, but it does
need to name the target.

## Acceptance Criteria

- The delete confirmation names the record being deleted.
- The name shown is the one the operator saw in the list or on the record.
- Every screen using the shared confirmation gets the same treatment.

## Regression Coverage

None yet. Needs a test asserting the confirmation renders the name of the target
record. Requires a `REG-nnn` entry once written.

## Dependencies

None.

## Related Items

Found in the same production admin E2E pass as [[BUG-1515]].

## Resolution

Fixed 2026-08-28 on `agent/open-bug-sweep`, with [[BUG-1756]] — one dialog, two
records.

The confirmation now names the record: "Delete Acme Partners?" rather than
"Confirm action". The name is resolved from whatever the row actually carries —
`displayName`, `name`, `companyName`, `fullName`, `title`, and so on down to the
id, because an id is a poor name and still better than asking somebody to
confirm deleting "a record".

Following this record's guidance, the tenant erasure panel's typing confirmation
was **not** adopted. A lead does not need it; what it needed was naming the
target, which is the part that was missing.

Guarded by REG-284.

## QA Retest
Retested 2026-08-29 by the regression-guard sweep: `apps/admin/lib/runtime/destructive-confirm.spec.ts` ran and passed, as part of `npm --workspace admin run test` (379 passing).

Not retested in production, and that boundary is the point of saying so — this environment cannot drive the deployed system, so what is established is that the fix is still present and its guard still passes, not that the screen behaves. See [[2026-08-28-regression-guard-sweep-9e55663]].

### What this record said before the sweep

Not retested in a browser. `destructive-confirm.spec.ts` covers the wording and
the name resolution, and asserts that the action bar renders the composed copy
rather than the static strings it used to.

## History

- 2026-08-26 — found during the production admin E2E pass; recorded from the
  session transcript, where it had existed only as prose.
- 2026-08-28 - un-deferred: the delete confirmation names the record it will delete. REG-284.

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

- Modules — [[leads]]
- Regression — REG-284 (see the regression register)

<!-- GRAPH:END -->
