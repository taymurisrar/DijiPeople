---
ID: BUG-2560
aliases: [BUG-2560]
Title: The requester is shown Approve and Reject buttons that always refuse
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: AUTHORIZATION
Source: QA_RUN
DetectedDate: 2026-08-30
DetectedInSha: fba846d1
AffectedModules: [services/api/src/modules/attendance, apps/web]
OwnerAgent: security
ArchitectDisposition: DONE
QAReport:
RegressionId: REG-378
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-30
UpdatedAt: 2026-08-30
ResolvedAt: 2026-08-30
---

# BUG-2560 — The requester is shown Approve and Reject buttons that always refuse

## Summary

`canApprove`, `canReject` and `canEdit` came back `true` for the person who filed
a correction request and for the employee whose attendance it would change. The
detail page draws its Approve and Reject controls from exactly those flags, so
both parties were shown buttons that returned 403 on every press.

The write path was never wrong. Only the answer the screen was given was.

## Expected Behavior

The flags a screen draws its controls from agree with the rule the server will
apply. Nobody is offered an action they will be refused.

## Actual Behavior

Measured on production at `fba846d1`, signed in as the requester and subject of
`ACR-000001`:

```
GET  /attendance/correction-requests/{id}
     canEdit true · canApprove true · canReject true
POST /attendance/correction-requests/{id}/reject
     403 ACCESS_DENIED
     "You cannot approve or reject your own attendance correction request."
```

## Reproduction

1. As any employee, submit an attendance correction request.
2. Open it at `/attendance/corrections/{id}`.
3. Approve and Reject are rendered.
4. Press either. `403 ACCESS_DENIED`.

## Evidence

- `services/api/src/modules/attendance/attendance.service.ts:1903-1928` —
  `assertCanActionCorrection`, the write path, opens with the party check and
  throws `ForbiddenException` for either party.
- `services/api/src/modules/attendance/attendance.service.ts:2293-2317` before
  the fix — `canCurrentUserActionCorrection`, the read model, began at the
  permission check with no party check at all.
- `services/api/src/modules/attendance/attendance.service.ts:2281-2287` —
  `canEdit`, `canApprove` and `canReject` are all derived from it.
- `apps/web/app/(authenticated)/attendance/corrections/[id]/page.tsx` — passes
  the three flags straight into `AttendanceCorrectionActions`.
- Live transcript above, taken 2026-08-30.

## Root Cause

**A rule was added to the write path and never mirrored into the read model that
describes it.** The party check exists because of BUG-0002, where a manager could
file a correction rewriting their own attendance and approve it. That fix went
into `assertCanActionCorrection`. `canCurrentUserActionCorrection` — written to
answer the same question for the UI — was left as a copy of the authorization
logic *minus* the rule that had just been added to it.

This is the third finding in SESSION-0084 of one shape: a single decision
implemented in two places, which then disagreed. BUG-2506 was sign-out revoking
in two ways; BUG-2547 was `/auth/me` re-deciding what the guard decides.

## Impact

No security exposure — the write path refuses correctly, which is what REG-002
asserts and what production still does. The damage is to trust and to the control
itself: a separation-of-duties rule that presents itself as available and then
refuses reads as a broken product rather than as a deliberate boundary, and it
invites someone to "fix" the 403 rather than the button.

It became more visible with this task, which rebuilt that screen's decision
surface, so it is fixed in the same release.

## Affected Areas

- `AttendanceService.canCurrentUserActionCorrection`
- `GET /api/attendance/correction-requests`, `GET .../:id`
- `apps/web/app/(authenticated)/attendance/corrections/[id]/page.tsx`

## Proposed Resolution

Open the read model with the same party check the write path opens with, and
assert the two together rather than separately.

## Acceptance Criteria

- The read model reports `false` for the submitter and for the subject, including
  on a proxy submission filed by someone else.
- It still reports `true` for a manager who is not a party.
- It still reports `true` for the assigned approver holding no role bundle.
- Each party case asserts the read model and the write path in the same test, so
  the two cannot drift apart again silently.

## Regression Coverage

[REG-378](../qa/regressions/index.md) —
`services/api/src/modules/attendance/attendance.correction-authorization.spec.ts`.
Mutation-tested: with the party check removed from the read model, two cases fail
and twelve pass.

## Dependencies

None.

## Related Items

- [[BUG-0002-self-approval-of-attendance-corrections]] — the rule this failed to
  mirror.
- [[BUG-2547-a-revoked-session-still-answers-on-auth-me]]
- [[BUG-2506-sign-out-leaves-the-refresh-token-live-whenever-the-tenant-i]]
- [[EXECPLAN-0029-attendance-correction-from-the-record-page]]
- [[attendance]]

## Resolution

Fixed on `agent/attendance-correction-entry`. Found by cleaning up after the
SESSION-0084 live verification: the attempt to withdraw the correction request
that verification had created was refused, while the record that described it had
said it would be allowed.

## QA Retest

Four automated assertions pairing both answers. Live retest after deployment:
open a self-filed correction and confirm neither button is offered.

## History

- 2026-08-30 - found during the SESSION-0084 production sweep at `fba846d1`.
- 2026-08-30 - fixed; REG-378 added.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[attendance]], [[tenant-application]]
- Regression — REG-378 (see the regression register)

<!-- GRAPH:END -->
