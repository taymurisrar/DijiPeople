---
ID: BUG-1546
aliases: [BUG-1546]
Title: Required fields on unfocused tabs give no indication of where they are
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-26
DetectedInSha: 21032ae
AffectedModules: [customization]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-274
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-26
UpdatedAt: 2026-08-28
ResolvedAt:
---

# BUG-1546 — Required fields on unfocused tabs give no indication of where they are

> **Architect triage, 2026-08-27 — `DEFER`.** Same form as BUG-1545, which blocks the screen outright. No value fixing discoverability on a screen that cannot save.


## Summary

Saving a multi-tab admin form can fail with "Complete the required fields" while
nothing on the visible tab is marked. The required fields are on tabs the user
has not opened. Customer onboarding spreads eight required fields across four of
its six tabs, so a user can fill everything they can see and still be unable to
save, with no indication of where to look.

## Expected Behavior

When a save is refused for missing required fields, the form says which fields
and where they are. Tabs containing unmet requirements are marked, and the form
can move focus to the first one.

## Actual Behavior

The error message names no field and no tab. The visible tab shows no marked
control. The user must open each remaining tab and search.

## Reproduction

1. Sign in to `admin.dijipeople.com` as a platform owner.
2. Open Onboarding and start a new record, or open the Customers create form.
3. Complete every field visible on the first tab.
4. Save.
5. Observe "Complete the required fields" with nothing marked on the visible tab.

## Evidence

Observed on production, 2026-08-26, on both the Customers and Onboarding forms.

Customer onboarding carries eight required fields distributed across four of its
six tabs. None of the unopened tabs carried any indicator that they held an
unmet requirement.

## Root Cause

Not established. The validation result evidently knows which fields failed,
since it refuses the save; what is not established is whether that detail is
lost before it reaches the form or is simply never rendered.

## Impact

Operators cannot complete admin forms without trial and error across every tab.
On onboarding, which has the most fields and the most tabs, this is the
difference between a form that takes a minute and one that takes several with no
guarantee of success. It is a plausible reason for the onboarding queue being as
empty as it is.

Affects every multi-tab admin form, not only the two observed.

## Affected Areas

- `apps/admin` — `RuntimeForm` and the responsive runtime tabs
- `services/api/src/modules/customization` — form metadata
- The Customers and Onboarding create forms specifically

## Proposed Resolution

Surface the validation result the form already receives: mark each tab that
contains an unmet requirement, mark the individual controls, and move focus to
the first failing field on save. This belongs in the shared runtime form rather
than in either screen, so every multi-tab form benefits.

## Acceptance Criteria

- A refused save marks every tab holding an unmet required field.
- Individual failing controls are marked on their own tab.
- Focus moves to the first failing field.
- The message names what is missing rather than only that something is.

## Regression Coverage

None yet. Needs a test that submits a multi-tab form with a requirement unmet on
a non-active tab and asserts the tab is marked. Requires a `REG-nnn` entry once
written.

## Dependencies

None.

## Related Items

Shares the onboarding form with [[BUG-1547]] and [[BUG-1548]]. Found in the same
production pass as [[BUG-1515]].

## Resolution

Fixed 2026-08-28 on `agent/open-bug-sweep`. One shared runtime change, so every
module gets it at once.

Three things together, because any one alone still leaves a dead end:

1. **The tab strip marks failures.** Each tab carries a count badge when it
   holds an invalid field. The badge is not colour alone — it shows the number
   and names itself for a screen reader.
2. **A blocked save moves to the first failing tab.** The operator lands where
   the problem is rather than being told there is one somewhere.
3. **The message names the fields** — up to three, then "and N more" — so it
   stands on its own when the tab strip has scrolled out of view. The generic
   sentence is now the fallback for a form whose fields carry no labels, not
   the normal case.

The server's field errors get the same treatment as the client's: a rejected
field sits on an unmounted tab exactly as easily as a blank required one, which
is what made [[BUG-1742]] read as "no field is marked anywhere".

The logic lives in `apps/admin/lib/runtime/blocked-save-feedback.ts` rather than
inside the record page, so it can be asserted without mounting React — the
defect was never about rendering, it was about which tab the operator is looking
at when the message appears.

Guarded by REG-274.

Recorded twice: this record and [[BUG-1746]] describe the same defect, found two
days apart. Both are closed by the same change rather than one being marked a
duplicate, because each carries its own reproduction and neither is wrong.

## QA Retest

Not yet retested in a browser. Covered by
`apps/admin/lib/runtime/blocked-save-feedback.spec.ts`, whose last assertion runs
against the **real** partner form definition: every required field it declares
must be reachable by both the badge and the tab switch. That is the assertion
that would have failed on the reported form.

## History

- 2026-08-26 — found during the production admin E2E pass; recorded from the
  session transcript, where it had existed only as prose.
- 2026-08-28 - un-deferred and fixed with BUG-1746, the same defect recorded twice. REG-274.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Regression — REG-274 (see the regression register)

<!-- GRAPH:END -->
