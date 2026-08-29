---
ID: BUG-1549
aliases: [BUG-1549]
Title: Database and validator internals are surfaced in user-facing errors
Status: VERIFIED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-26
DetectedInSha: 21032ae
AffectedModules: [error-logs]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-286
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-26
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1549 — Database and validator internals are surfaced in user-facing errors

> **Architect triage, 2026-08-27 — `DEFER`.** Overlaps BUG-1546 -- both concern how field-level validation reaches the operator. Fix with the onboarding cluster.


## Summary

Admin error modals show raw implementation detail to the operator. Observed
examples include "Database constraint failed" and
"primaryContactFirstName must be shorter than or equal to 100 characters" — a
Postgres failure class and a DTO property name, neither of which corresponds to
anything the user can see on screen.

## Expected Behavior

A failed operation is explained in the terms of the screen: which field, by its
visible label, and what to do about it. The implementation detail goes to the
error log, where it is useful.

## Actual Behavior

The modal renders the internal message directly. `primaryContactFirstName` is a
DTO property, not the field label the form displays. "Database constraint
failed" names no field at all.

## Reproduction

1. Sign in to `admin.dijipeople.com` as a platform owner.
2. Open a create form — Customers or Onboarding both reproduce it.
3. Enter more than 100 characters in the primary contact first name.
4. Save, and read the modal.

A separate reproduction: trigger the onboarding owner foreign key failure of
[[BUG-1545]] and observe "Database constraint failed".

## Evidence

Observed on production, 2026-08-26. Both messages were captured verbatim from
the admin error modal as quoted above.

## Root Cause

Not established. The error contract in `HttpExceptionFilter` carries both a
`message` and a `description`, and `fieldErrors` exists for exactly this
purpose — so the raw string reaching the modal suggests the admin surface
renders the wrong part of a well-formed response, rather than the API failing to
produce one. That has not been confirmed.

## Impact

Operators are shown text they cannot act on, and which names internal schema.
The 100-character message is nearly actionable but points at a property name the
user cannot map to a control; "Database constraint failed" is not actionable at
all.

Exposing property and constraint names is also a mild information disclosure,
though on a platform-guarded surface the practical risk is low.

## Affected Areas

- `apps/admin` — the error modal and its use of the error contract
- `services/api/src/common/errors` — error catalog and `HttpExceptionFilter`
- `services/api/src/modules/error-logs`

## Proposed Resolution

Establish which half of the contract the modal is rendering. If the API is
returning `fieldErrors` keyed by property, map those to the form's visible
labels in the admin runtime form; if it is not, add catalog entries so it does.

Field-level errors should mark the control, not only appear in a modal — which
is the same gap [[BUG-1546]] describes from the other direction.

## Acceptance Criteria

- A length violation names the field by its visible label and marks the control.
- A constraint failure produces a message naming what conflicted, not the
  failure class.
- No DTO property name or Postgres error text appears in a user-facing modal.
- The raw detail is still recorded through `ErrorLogsService`.

## Regression Coverage

None yet. Needs a test asserting that a validation failure response carries
`fieldErrors` and that the admin form renders labels rather than property names.
Requires a `REG-nnn` entry once written.

## Dependencies

Overlaps with [[BUG-1546]]; both concern how field-level validation reaches the
operator and are best fixed together.

## Related Items

Related to [[BUG-1545]] and [[BUG-1546]].

## Resolution

Fixed 2026-08-28 on `agent/open-bug-sweep`. This record asked which half of the
contract the modal was rendering; the answer is the API's, verbatim.

class-validator composes its messages as `<property> <constraint>`, and the
property is the DTO's name for the field rather than the form's. The runtime
form knows what it calls that field, so the leading property name is swapped for
the visible label and the constraint half is left exactly as it arrived —
`primaryContactFirstName must be shorter than or equal to 100 characters`
becomes `Contact first name must be shorter than or equal to 100 characters`.

The constraint is deliberately not rewritten. It is the part that says what is
actually wrong, and inventing wording for it would mean guessing at rules the
frontend cannot see.

"Database constraint failed" is a different thing: not a field error, and not
renameable into usefulness. It is replaced with a sentence that says what
happened and where to look, and deliberately does not name a field, because it
does not know which one.

Field-level errors already mark the control — that half arrived with
[[BUG-1546]] and [[BUG-1746]], fixed in the same sweep, which is why this record
noted the two were the same gap from opposite directions.

Guarded by REG-286.

## QA Retest
Retested 2026-08-29 by the regression-guard sweep: `apps/admin/lib/runtime/humanize-field-error.spec.ts` ran and passed, as part of `npm --workspace admin run test` (379 passing).

Not retested in production, and that boundary is the point of saying so — this environment cannot drive the deployed system, so what is established is that the fix is still present and its guard still passes, not that the screen behaves. See [[2026-08-28-regression-guard-sweep-9e55663]].

### What this record said before the sweep

Not retested in a browser. `humanize-field-error.spec.ts` covers both
substitutions, and covers the cases where nothing should change: no label
available, a message that does not begin with the property, and a shorter
property that merely prefixes a longer one (`partner` must not rewrite
`partnerId must be a UUID`).

## History

- 2026-08-26 — found during the production admin E2E pass; recorded from the
  session transcript, where it had existed only as prose.
- 2026-08-28 - un-deferred: field errors name the field the operator sees, and a Postgres constraint class is no longer shown as a sentence. REG-286.

## Verification — 2026-08-29

Verified by re-reading the guard and running it, not by a browser pass. The
repository owner asked for this sweep after 48 records had accumulated in
`FIXED` — fixed, but with nobody having confirmed them against a running
system.

What was checked for this record:

- its regression guard exists on disk at this commit;
- the suite containing it passes.

Guard:

- `apps/admin/lib/runtime/humanize-field-error.spec.ts`

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

- Regression — REG-286 (see the regression register)

<!-- GRAPH:END -->
