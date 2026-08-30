---
ID: BUG-2507
aliases: [BUG-2507]
Title: The manager's correction screen hides four of the eight kinds of change
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-30
DetectedInSha: ade1fea7
AffectedModules: [apps/web]
OwnerAgent: frontend
ArchitectDisposition: DONE
QAReport:
RegressionId: REG-376
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-30
UpdatedAt: 2026-08-30
ResolvedAt: 2026-08-30
---

# BUG-2507 — The manager's correction screen hides four of the eight kinds of change

## Summary

The screen a manager approves or rejects a correction on showed only the check-in
and the check-out. `requestedWorkMode`, `requestedWorkSiteId`,
`requestedOvertimeMinutes` and `fallbackReason` were stored by the API and
returned by it, and were simply never declared in the web type nor rendered. A
manager reviewing a work-mode, work-site or overtime correction was looking at a
decision surface on which nothing appeared to have changed.

It also showed the two timestamps whether or not either had moved, as two parallel
lists — so an unchanged field looked exactly like a changed one.

## Expected Behavior

The manager sees what the request asks to change, and can tell a changed value
from an unchanged one without comparing two lists by eye.

## Actual Behavior

`/attendance/corrections/[id]` rendered two cards, "Original Values" and
"Requested Values", each listing check-in and check-out unconditionally. For a
`TIME_ADJUSTMENT` or `OVERTIME_APPROVAL` request both cards were identical or
empty, leaving the manager nothing to decide on beyond the free-text reason.

## Reproduction

1. Submit a correction of type "I am requesting overtime approval" for 90 minutes.
2. Sign in as the line manager and open the request.
3. The overtime figure appears nowhere on the page. Both value cards show the
   unchanged check-in and check-out.

## Evidence

- `apps/web/app/components/attendance-corrections/attendance-correction-types.ts`
  — `AttendanceCorrectionRequest` declared none of `requestedWorkMode`,
  `requestedWorkSiteId`, `requestedOvertimeMinutes` or `fallbackReason`.
- `services/api/src/modules/attendance/attendance.service.ts:2270-2290` —
  `mapCorrectionRequest` returns a spread of the whole row, so all four **were**
  crossing the wire the entire time.
- `apps/web/app/(authenticated)/attendance/corrections/[id]/page.tsx` — the two
  unconditional value cards.

## Root Cause

**A hand-written type narrower than the payload it describes.** Nothing compares
the web app's `AttendanceCorrectionRequest` against what the API actually returns,
so a field can be added to the model, written by the create path and returned by
the read path while remaining invisible in the product, with no error anywhere.
The two-card layout then hid the consequence: a card that renders every field
unconditionally looks the same whether it has anything to say or not.

## Impact

Managers approved or rejected mode, site and overtime corrections without being
shown what they were approving. No data was lost — the values are stored, and for
mode and site are still not applied on approval either, which is BUG-2504 — but
the approval step was not an informed one, and being informed is the entire point
of having it.

## Affected Areas

- `apps/web/app/(authenticated)/attendance/corrections/[id]/page.tsx`
- `apps/web/app/components/attendance-corrections/attendance-correction-types.ts`

## Proposed Resolution

Declare the four fields, and replace the two cards with a single list of what
actually moved — old value struck through, new value beside it — computed by a
pure function that can be tested without a DOM.

## Acceptance Criteria

- A request that changes only the work mode shows exactly one row, "Work mode",
  with the entry's current mode struck through.
- A field whose requested value equals the original is not listed.
- Two spellings of the same instant do not count as a change.
- Overtime shows no struck-through previous value, because the record holds none.
- A request that changes nothing says so in words rather than rendering blank.
- A request for a day with no attendance entry still renders.

## Regression Coverage

[REG-376](../qa/regressions/index.md) —
`apps/web/app/components/attendance-corrections/correction-form-fields.spec.ts`,
the `correctionChanges` block.

## Dependencies

The work-site row shows an id rather than a name where the requested site is not
the entry's own. That row cannot occur in practice until
[[BUG-2508-the-correction-work-site-selector-is-never-populated-for-an-]] is
fixed, and the name lookup should be delivered with it.

## Related Items

- [[BUG-2504-approving-a-correction-never-applies-the-requested-work-mode]]
- [[BUG-2505-a-mode-or-location-correction-could-never-be-submitted-at-al]]
- [[EXECPLAN-0029-attendance-correction-from-the-record-page]]
- [[attendance]]

## Resolution

Fixed on `agent/attendance-correction-entry`. The four fields are declared, and
`correctionChanges` in `correction-form-fields.ts` computes the diff across times,
work mode, work site, overtime minutes and the fallback reason. The manager's page
renders it as one "What changed" card.

## QA Retest

Automated as above; visual confirmation folded into the post-deploy sweep.

## History

- 2026-08-30 - created from qa run at `ade1fea7`.
- 2026-08-30 - fixed; REG-376 added.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]
- Regression — REG-376 (see the regression register)

<!-- GRAPH:END -->
