---
ID: BUG-2573
aliases: [BUG-2573]
Title: A correction request cannot be withdrawn by the person who filed it
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-30
DetectedInSha: fba846d1
AffectedModules: [services/api/src/modules/attendance, apps/web]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport:
RegressionId: REG-403
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: EXECPLAN-0032
CreatedAt: 2026-08-30
UpdatedAt: 2026-09-11
ResolvedAt: 2026-09-11
---

# BUG-2573 — A correction request cannot be withdrawn by the person who filed it

## Summary

`AttendanceCorrectionStatus` has a `CANCELLED` member and nothing can ever reach
it. There is no cancel or withdraw route on the controller, so an employee who
files a correction by mistake cannot take it back — and, correctly, cannot reject
it either, because separation of duties bars both parties from actioning it. The
request stays `PENDING_APPROVAL` until a manager disposes of it.

## Expected Behavior

Someone who raises a request can withdraw it while it is still pending, without
needing their manager to clear up after them.

## Actual Behavior

The only write routes are create, approve and reject:

```
POST /attendance/correction-requests
POST /attendance/correction-requests/:id/approve
POST /attendance/correction-requests/:id/reject
```

Approve and reject both run `assertCanActionCorrection`, which refuses either
party. So for the requester there is no action at all. The state exists in the
enum; no path leads to it.

## Reproduction

Encountered directly during the SESSION-0084 verification, cleaning up after the
sweep:

1. File a correction request as any employee.
2. Try to withdraw it. There is no route, and no control in the product.
3. Try `POST .../reject` as the requester.
   `403 ACCESS_DENIED — "You cannot approve or reject your own attendance
   correction request."` — which is the right answer to the wrong question.
4. The request remains `PENDING_APPROVAL` indefinitely.

`ACR-000001` on the `dijipeople-demo` tenant is exactly this: a request raised on
2026-08-30 to verify BUG-2505, which could not then be cleaned up.

## Evidence

- `services/api/src/modules/attendance/attendance.controller.ts:209-260` — the
  full set of correction routes. No cancel, no withdraw, no delete.
- `services/api/prisma/schema.prisma` — `AttendanceCorrectionStatus` includes
  `CANCELLED`.
- `apps/web/app/components/attendance-corrections/correction-form-fields.ts` —
  `correctionStatusLabel` already renders `CANCELLED` as "Cancelled", so the UI
  is ready for a state the API cannot produce.
- `services/api/src/modules/attendance/attendance.service.ts:1903-1928` — the
  party check that (correctly) prevents the workaround.

## Root Cause

Not established beyond the obvious: the happy path was built end to end and the
withdraw path was never built. The `CANCELLED` member suggests it was intended.

## Impact

Low severity, steady annoyance, and it grows: every mistaken request is
permanent work for a manager, and the queue a manager sees is padded with
requests nobody wants any more. It also makes the workflow hard to exercise
safely — any verification of the correction path leaves a row behind that the
verifier cannot remove, which is how this was found.

No security impact. The party check is doing exactly what it should.

## Affected Areas

- `AttendanceController` correction routes
- `AttendanceService` — a new cancel path
- `apps/web/app/(authenticated)/attendance/corrections/[id]/page.tsx`
- the approval record, which must be closed alongside the request

## Proposed Resolution

**Needs an ExecPlan**, small but with real decisions in it:

- who may cancel — the requester only, or the requester and HR
- whether cancelling is allowed after an approver has begun, or only while
  `PENDING_APPROVAL`
- what happens to the `ApprovalRequest`, its steps and its pending
  `ApprovalAssignment`, which must not be left dangling
- whether the approver is notified that a request they were assigned has gone
  away

None of these is hard; all of them are decisions, which is why this is not
folded into a frontend task.

## Acceptance Criteria

- The requester can cancel their own pending request, and the record reaches
  `CANCELLED`.
- Nobody can cancel somebody else's, and cancelling is not a way around the
  separation-of-duties rule on approve and reject.
- The approval request and any pending assignment are closed with it.
- A cancelled request no longer appears in an approver's queue.

## Regression Coverage

Covered by REG-403 in the regression register.

## Dependencies

None.

## Related Items

- [[BUG-2560-the-requester-is-shown-approve-and-reject-buttons-that-alway]] — the
  same screen, and the same party rule seen from the other side.
- [[BUG-0002-self-approval-of-attendance-corrections]]
- [[EXECPLAN-0029-attendance-correction-from-the-record-page]]
- [[attendance]]

## Resolution

Fixed per [[EXECPLAN-0032-attendance-correction-approval-completes-the-workflow]].
The record's four open decisions, resolved:

- **Who may cancel** — the requester only. Not HR, not the assigned approver.
  Widening it to HR was left out deliberately: nothing in this record asked
  for it, and the requester-only rule is the one that cannot become a second
  way around separation of duties.
- **When** — only while `PENDING_APPROVAL`. This single-step approval has no
  partial-decision state to draw a line through; "before anyone has acted on
  it" and "still pending" are the same condition here.
- **The approval record** — closed alongside the request by reusing
  `syncGenericAttendanceCorrectionApproval` with
  `ApprovalActionType.CANCELLED`. This function already mapped `CANCELLED` on
  all three of its status enums (`mapCorrectionApprovalStatus`,
  `mapCorrectionStepStatus` → `SKIPPED`, `mapCorrectionAssignmentStatus` →
  `SUPERSEDED`) before this fix — built anticipating this path, never wired to
  a route until now.
- **The approver is notified** — new event
  `attendance.correction.cancelled.approver`, registered in the notification
  catalog, emitted the same way an approval or rejection already is.

New route `POST /attendance/correction-requests/:id/cancel` ->
`AttendanceService.cancelCorrectionRequest`, gated on
`attendance.correction.create` (the requester already holds it, from filing
the request being withdrawn — no new permission granted). Refuses anyone but
the requester with `ForbiddenException`, and a request that is not
`PENDING_APPROVAL` with `ConflictException` — including a request that is
already `CANCELLED`, so this is not a way to re-fire the notification. No
reconciliation is queued: a pending request was never in
`loadApprovedAdjustments`'s `status: 'APPROVED'` filter, so there is nothing
for the engine to undo.

The fourth acceptance criterion — "no longer appears in an approver's queue"
— needed no new code: `buildCorrectionWhere`'s `pending` view already filters
on `status: PENDING_APPROVAL`, which a cancelled request no longer matches.

Frontend: `AttendanceCorrectionActions` gains a `canCancel` prop (from a new
`canCancel` field on `mapCorrectionRequest`'s read model, deliberately
independent of `canAct` — the same separation-of-duties reasoning
`canCurrentUserActionCorrection` already applies, on the opposite party) and a
"Withdraw request" control on the correction detail page.

`ACR-000001` on `dijipeople-demo` can now be withdrawn by the employee who
raised it, once this ships; not exercised live in this pass (see QA Retest).

Regression coverage:
`services/api/src/modules/attendance/attendance-correction-cancel.spec.ts`.

## QA Retest

Not run as a live QA session — verified by targeted regression specs only.
`ACR-000001` on `dijipeople-demo` remains a ready-made subject for a live
retest once this deploys.

## History

- 2026-08-30 - found while cleaning up after the SESSION-0084 live verification.
- 2026-09-11 - fixed per EXECPLAN-0032: requester-only cancel route, generic
  approval sync closed alongside it, approver notified.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[attendance]], [[tenant-application]]
- Regression — REG-403 (see the regression register)

<!-- GRAPH:END -->
