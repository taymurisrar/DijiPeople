---
ID: BUG-2505
aliases: [BUG-2505]
Title: A mode-or-location correction could never be submitted at all
Status: FIXED
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-30
DetectedInSha: ade1fea7
AffectedModules: [apps/web, services/api/src/modules/attendance]
OwnerAgent: frontend
ArchitectDisposition: DONE
QAReport:
RegressionId: REG-379
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-30
UpdatedAt: 2026-08-30
ResolvedAt: 2026-08-30
---

# BUG-2505 — A mode-or-location correction could never be submitted at all

## Summary

The attendance correction form offers eight kinds of correction. One of them —
"My work location or mode is wrong", the `TIME_ADJUSTMENT` type — could not be
submitted by anybody, ever. The form deliberately hid both timestamp fields for
that type, and the API requires at least one timestamp on every type except
`OVERTIME_APPROVAL`. Every attempt therefore reached the server and came back
`400`, naming a field the employee had never been shown.

## Expected Behavior

Every correction type the form offers can be submitted. If the server needs a
value, the form asks for it.

## Actual Behavior

Choosing "My work location or mode is wrong", filling in the mode, the site and
a reason, then pressing **Submit request** returned
`400 — "A requested check-in or check-out timestamp is required."` There is no
way for the employee to satisfy it, because neither time field is rendered for
that type.

The client-side validator did not catch it either: `validateDraft` computes
`needsTime` from `showsField`, and since the type showed no time fields
`needsTime` was `false` and no issue was raised. The draft passed local
validation and failed remotely, every time.

## Reproduction

1. Sign in to the tenant app as any employee with attendance read.
2. Go to `/attendance/corrections/new`.
3. Choose **My work location or mode is wrong**.
4. Pick a day, choose a work mode, write a reason.
5. Press **Submit request**.
6. Result: `400`, `"A requested check-in or check-out timestamp is required."`

## Evidence

- `apps/web/app/components/attendance-corrections/correction-form-fields.ts` —
  `fieldsFor("TIME_ADJUSTMENT")` returned
  `["attendanceDate", "requestedWorkMode", "requestedWorkSiteId", "reason"]`,
  with neither timestamp.
- `services/api/src/modules/attendance/attendance.service.ts:814-819` — the
  create path throws unless the type is `OVERTIME_APPROVAL` or one of
  `requestedCheckInAtUtc` / `requestedCheckOutAtUtc` is present.
- `apps/web/app/components/attendance-corrections/correction-form-fields.spec.ts`
  — a test named "asks a mode-or-location correction for mode and site but no
  time" asserted the broken shape, and passed.

## Root Cause

**The rule was asserted from one side only, and that side was the wrong one.**
The form's field map and the server's validation are two statements of one
contract, and nothing compared them. A test existed, was green, and encoded the
defect: it checked that the form behaved as the form's author intended, never
that the request the form produces is one the server accepts.

## Impact

One of eight offered correction types was unusable in production for every
tenant and every employee, with no in-product workaround: the employee cannot
supply the missing field because it is not on the screen. The failure is silent
from the operator's side — it produces a client error row, not an alert.

## Affected Areas

- `apps/web/app/components/attendance-corrections/correction-form-fields.ts`
- `apps/web/app/components/attendance-corrections/attendance-correction-form.tsx`
- `POST /api/attendance/correction-requests`

## Proposed Resolution

Collect the period on `TIME_ADJUSTMENT` too. Asking which work period is being
re-described is the honest question regardless — a day can hold more than one —
and it makes the request one the server accepts. No API change.

## Acceptance Criteria

- `TIME_ADJUSTMENT` renders both timestamp fields.
- `validateDraft` refuses a `TIME_ADJUSTMENT` draft carrying no time.
- Every correction type except `OVERTIME_APPROVAL` collects at least one
  timestamp, asserted over the whole `CORRECTION_TYPE_OPTIONS` list rather than
  type by type, so a ninth type cannot reintroduce this.

## Regression Coverage

[REG-379](../qa/regressions/index.md) —
`apps/web/app/components/attendance-corrections/correction-form-fields.spec.ts`,
"every type except overtime collects a timestamp the server will accept".

## Dependencies

None.

## Related Items

- [[BUG-2504-approving-a-correction-never-applies-the-requested-work-mode]] — the
  other half: even once submittable, approval does not apply the mode.
- [[BUG-2507-the-manager-s-correction-screen-hides-four-of-the-eight-kind]]
- [[EXECPLAN-0029-attendance-correction-from-the-record-page]]
- [[attendance]]

## Resolution

Fixed on `agent/attendance-correction-entry`. `fieldsFor` now returns both
timestamp fields for `TIME_ADJUSTMENT`, and the two tests that asserted the old
shape were inverted, each with a comment explaining why it had been wrong.

## QA Retest

Covered by the automated regression above. A live retest is folded into the
post-deploy sweep for SESSION-0084.

## History

- 2026-08-30 - created from qa run at `ade1fea7`.
- 2026-08-30 - fixed; REG-379 added.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]], [[attendance]]
- Regression — REG-379 (see the regression register)

<!-- GRAPH:END -->
