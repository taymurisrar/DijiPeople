---
ID: BUG-1966
aliases: [BUG-1966]
Title: A failed save in the runtime form is swallowed with no message, toast or inline error
Status: OPEN
Severity: HIGH
Priority: P1
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [apps/web]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt:
---

# BUG-1966 — A failed save in the runtime form is swallowed with no message, toast or inline error

## Summary

A save that fails with an HTTP 400 produces nothing on screen. No toast, no
banner, no inline field error, no change of state — the page simply stays where
it was. The only evidence the request happened at all is a console entry and a
network row. A user cannot tell a failed save from a slow one, or from a button
that does nothing.

This is the generic half of the leave-request observation in BUG-1965: that
record covers the bad payload, this one covers the runtime form layer discarding
the failure. It is filed separately because the swallow is not specific to leave
and is arguably the worse of the two.

## Expected Behavior

Every failed save tells the user it failed, in the terms of the screen, and the
form stays populated so the user can correct and retry. `AGENTS.md` requires
loading, error and empty states for every data surface; a save is a data surface.

## Actual Behavior

After pressing Save on `/leaves/new` with a payload the API rejects with 400:

- the page stays on `/leaves/new`;
- `main` contains **zero** `[role=alert]` nodes and no error nodes of any kind —
  verified in the live DOM;
- no toast is rendered;
- no field is marked invalid;
- the only trace is the console 400 and the network entry.

## Reproduction

Target: `https://dijipeople-demo.ws.dijipeople.com`, tenant `DijiPeople Demo`,
production API commit `949f461c`, observed 2026-08-29.

1. Sign in to the tenant workspace as an employee with an employee record.
2. Open `/leaves/new`, fill in leave type, start date, end date and reason.
3. Save. The request fails 400 with
   `property ownerId should not exist, property status should not exist`
   (see BUG-1965).
4. Inspect the DOM: no `[role=alert]`, no error text anywhere in `main`.
5. Nothing distinguishes this from a successful save except that the page did not
   navigate.

Any 400 from this form reproduces it; the payload defect in BUG-1965 is simply
the one that was available.

## Evidence

The live DOM check above (`main` contains no `[role=alert]` or error nodes after
the failed save), together with the console 400 and network entry, on the
production tenant workspace.

No file:line evidence was collected for the form's submit handler; it should be
located before the fix, since the point of this record is that the handler
discards the rejection.

## Root Cause

Not established. The submit path evidently treats a rejected request as a
non-event rather than surfacing it.

## Impact

Severe out of proportion to its simplicity: any save that fails for any reason —
validation, authorization, a network error — is invisible. The user believes the
system is unresponsive, retries, and produces duplicate attempts or abandons the
journey. It also hides other defects from QA and from support, because the only
symptom reaching the user is "nothing happens".

Rated HIGH: it affects every runtime form in the tenant product, and it converts
every recoverable failure into an unexplained dead end.

## Affected Areas

`apps/web` metadata form runtime submit handling — every module rendered through
the runtime, not only leave.

## Proposed Resolution

Make the runtime form's submit path surface every rejection: an accessible,
announced error region (`role="alert"`), field-level reasons attached to their
inputs where the contract supplies them, and the form's values preserved. Fix it
in the shared runtime so every module inherits it, and pair it with BUG-1963 so
the message shown is the contract's `description` rather than its raw `message`.

## Acceptance Criteria

- A save rejected with 400 renders a visible, announced error on the form.
- The form retains the user's input after the failure.
- The error is discoverable by a screen reader (`role="alert"` or an equivalent
  live region).
- The behaviour holds for a network failure and a 500, not only a validation 400.

## Regression Coverage

None yet. A component test that stubs a rejected save and asserts an alert is
rendered would fail today.

## Dependencies

None. BUG-1965 is the payload defect that exposed this and is independent.

## Related Items

BUG-1965 (the bad payload on the same save) and BUG-1963 (raw server message and
endpoint shown when a dialog *does* render an error). BUG-1422 is the Platform
Admin runtime's analogue, where the server sent no field reasons; here the client
discards a message it was given.

## Resolution

Open. No fix has been written.

## QA Retest

Awaiting a fix — nothing to retest yet.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`. Split from the leave-request payload finding because the swallow is generic to the runtime form layer.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition FIX_NOW — release blocker and generic to the whole runtime form layer; arguably the highest-leverage single fix in this batch.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]

<!-- GRAPH:END -->
