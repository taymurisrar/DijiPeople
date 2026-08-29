---
ID: BUG-2016
aliases: [BUG-2016]
Title: Cancelling a leave request leaves its needs-approval notification outstanding in the inbox
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [services/api/src/modules/notifications, services/api/src/modules/leave]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-2016 — Cancelling a leave request leaves its needs-approval notification outstanding in the inbox

## Summary

Submitting a leave request raises an action-required notification for the
approver. Cancelling that request moves it to `CANCELLED` and returns 201, but
the notification is untouched: it stays in the approver's inbox, unread, at
priority 1, still saying "Leave request needs approval". The lifecycle of the
notification is not tied to the lifecycle of the record it points at, so an
approver is told to act on something the employee has already withdrawn.

## Expected Behavior

A notification that asks someone to act is resolved when the thing it asks about
is settled. Cancelling, approving or rejecting a leave request should resolve,
archive or mark-actioned the corresponding action-required notification, so that
the approver's queue reflects only work that still needs doing.

## Actual Behavior

The request is cancelled and the notification is not:

```
POST /api/leave-requests/86200df6-6993-43eb-b9c7-4b310180ecd1/cancel -> 201
GET  /api/leave-requests/86200df6-6993-43eb-b9c7-4b310180ecd1        -> status CANCELLED
```

and the Inbox still shows, for the approver:

```
"Leave request needs approval" | Leave | Approvals | priority 1 | Unread
created 08/29/2026, 1:15 AM
related record 86200df6-6993-43eb-b9c7-4b310180ecd1
```

## Reproduction

Target: `https://dijipeople-demo.ws.dijipeople.com`, tenant `DijiPeople Demo`,
production API commit `949f461c`, observed 2026-08-29.

1. Submit a leave request that routes successfully to an approver. (On this
   tenant that required the approval-chain workaround described in BUG-1968 and
   `consumesBalance: false` on the leave type to get past BUG-1967.)
2. Confirm the approver's notification arrives: the inbox row reads "Leave
   request needs approval", category Approvals, priority 1, Unread.
3. Cancel the request: `POST /api/leave-requests/{id}/cancel` returns 201 and the
   request's status becomes `CANCELLED`.
4. Reload the Inbox. The notification is still present, still Unread, still
   priority 1, still asking for approval. Its "Related record" cell still carries
   the cancelled request's id.

## Evidence

Observed live on the production demo tenant, with the request id
`86200df6-6993-43eb-b9c7-4b310180ecd1` quoted above so the state can be
re-checked directly.

The surrounding notification machinery is working correctly, which is what makes
this a lifecycle gap rather than a broken channel: `GET
/api/notifications/in-app/unread-count` returned `{"unreadCount": 5}`, the
approver event carried `eventCode "leave.request.submitted.approver"`, `moduleKey
"leave"`, `deliveredAt 2026-08-29T01:16:17.802Z` and `popupShownAt
2026-08-29T01:17:02.964Z`, the dashboard bell rendered the badge, and both the
approver-side and requester-side events fire with correct human titles and
formatted dates. The delivery half is sound; only the resolution half is missing.

No file:line evidence was collected. Where a state transition on a leave request
would have to resolve the notification — in `modules/leave` at the transition, or
in the `notifications` orchestrator keyed on the related record — was not located
during the run and should be established before the fix, because it determines
whether this is a leave-module omission or a missing capability in the
notification model.

## Root Cause

**Established, and it is the larger of the two possibilities this record
allowed for: the notification model had no way to say it.**

A notification's lifecycle ran only forwards from delivery, and every transition
belonged to the recipient. `NotificationsRepository` offered
`markInAppNotificationRead` and `archiveInAppNotification`, both keyed on a
`recipientId` and both called from the user's own inbox actions
(`in-app-notifications.service.ts:88-101`). Nothing anywhere took a *record* and
retired the outstanding requests for action pointing at it, so there was no call
for `modules/leave` to make. That is why the answer to "is this a leave omission
or a missing capability" is the second.

The materials for it existed. `NotificationStatus` already carries `ACTIONED`
and `SUPERSEDED` (`schema.prisma:815-823`), and
`findActiveNotificationByDedupeKey` already treats both as inactive
(`notifications.repository.ts:894-914`) — the states were modelled and never
written.

Two rows have to change for a row to actually leave the queue, which is the part
a call site would probably have got wrong on its own. `NotificationRecipient` is
what the inbox listing and the unread badge read
(`listInAppNotifications`, `countUnreadInAppNotifications`), and
`Notification.status` is what the dedupe lookup reads — so retiring only the
recipient row would suppress the *next* legitimate notification for the same
record.

## Impact

The approvals queue accumulates dead work. Every cancelled request leaves a
permanent unread priority-1 item, and an approver who opens one finds nothing to
act on. On a tenant with real volume the inbox stops being a reliable statement
of what is outstanding, which is the only thing an inbox is for — and the unread
count on the dashboard bell inherits the same error.

Reachable in production today, with no special role. Nothing is corrupted and no
decision is made wrongly; the cost is that the queue lies.

Rated MEDIUM: a state-machine gap with a real operational cost, not a blocked
journey and not a wrong calculation. It is not LOW because the defect
accumulates — every cancellation makes the queue worse and nothing ever cleans
it.

## Affected Areas

`services/api/src/modules/leave` (the cancel, approve and reject transitions);
`services/api/src/modules/notifications` (catalog, orchestrator and whatever
would own resolution by related record); the Inbox screen and the dashboard
unread-count badge, both of which display the stale rows.

## Proposed Resolution

Tie the notification's lifecycle to the record's. On every terminal transition of
a leave request — cancel, approve, reject — resolve or archive the outstanding
action-required notifications whose related record is that request.

Do it in the notification layer rather than at each call site if the model
supports resolution by related record, because the same gap will exist for every
other approvable record type: timesheets, claims, loans and business trips all
raise the same kind of notification. Check those before choosing the scope, and
say in the plan whether this record is being fixed or the class is.

## Acceptance Criteria

- Cancelling a leave request removes its needs-approval notification from the
  approver's outstanding queue, or marks it resolved so it no longer counts as
  action-required.
- Approving and rejecting do the same.
- The dashboard unread/action-required count reflects the change.
- A notification is never left asking for action on a record in a terminal state.

## Regression Coverage

None yet. A service test that submits, cancels, and asserts the approver has no
outstanding action-required notification for that request would fail today.

## Dependencies

Reproducing this end to end requires a routable approval chain, so BUG-1968 and
BUG-1967 shape how easily the test can be written on a realistic tenant. Neither
blocks the fix.

## Related Items

BUG-1968 (approval chain resolution) and BUG-1967 (leave balances) are the two
workarounds this reproduction needed. BUG-2017 is the other inbox defect found in
the same pass.

## Resolution

**Fixed, and the class was fixed rather than the instance**, as the Proposed
Resolution asked: the capability lives in the notification layer, keyed on the
related record, so timesheets, claims, loans and business trips can use it
without new bookkeeping of their own.

- `services/api/src/modules/notifications/notifications.repository.ts:916-988` —
  new `resolveActionRequiredNotificationsForRecord({ tenantId,
  relatedEntityType, relatedEntityId })`. It selects the tenant's own
  `requiresAction` notifications for that record whose status is still `UNREAD`
  or `READ`, fills `readAt` only where it was empty, then sets the recipient rows
  to `ACTIONED` with `archivedAt`, and the notifications to `ACTIONED`.
  `archivedAt` is what removes the row from the default inbox view; the status
  alone would drop it from the unread count and leave it on screen.
  Informational notifications are deliberately untouched — they are still true
  after the record settles, and clearing them would be losing history rather
  than clearing a queue.
- `services/api/src/modules/notifications/notifications.service.ts:758-780` —
  `resolveActionRequired`, the other half of `emit` for anything that asks
  somebody to act.
- `services/api/src/modules/leave/leave.service.ts:940-976` —
  `resolveOutstandingApprovalNotifications`, called from
  `cancelLeaveRequest` after its transaction
  (`leave.service.ts:937`) and from `processLeaveRequestDecision` for both
  approve and reject (`leave.service.ts:1740`). It runs after the transaction
  rather than inside it, alongside the `emit` calls it mirrors: the notification
  tables are not part of the leave request's consistency boundary, and a
  decision must not roll back because an inbox row could not be tidied.

On the decision path it runs **before** the employee's approved/rejected
notification is emitted, so a resolution keyed on the same related record cannot
swallow the row it was meant to leave behind.

Against the acceptance criteria:

- **1, cancelling removes the needs-approval notification from the outstanding
  queue** — met.
- **2, approving and rejecting do the same** — met, on the acted step.
- **3, the dashboard count reflects the change** — met by construction:
  `countUnreadInAppNotifications` counts recipient rows with
  `status: UNREAD` and `archivedAt: null`, and both are written.
- **4, a notification is never left asking for action on a record in a terminal
  state** — met for leave. The capability is generic, but no other module calls
  it yet; the other approvable record types are named in Related Items below and
  are follow-up work, not a claim made here.

### Regression coverage

- `services/api/src/modules/notifications/notification-action-resolution.spec.ts`
  — the mechanics: both tables written, tenant-scoped, `readAt` filled only
  where empty, `archivedAt` set, and nothing written at all when the record has
  no outstanding request for action.
- `services/api/src/modules/leave/leave-notification-lifecycle.spec.ts` — that
  each of the three terminal transitions makes the call with the record the
  notification was keyed on, and that resolution precedes the outcome emit.

## QA Retest

Not performed live — this task did not touch `main`, so nothing here is verified
in production and the stale row on the demo tenant is still stale.

The retest is the Reproduction section: submit, confirm the approver's inbox row
appears, cancel, and reload. Expect the row gone from the default inbox view and
the unread count down by one, with the row still findable under archived. Repeat
for approve and for reject. The cancelled request
`86200df6-6993-43eb-b9c7-4b310180ecd1` named above is a pre-existing row and will
**not** be cleaned up retroactively: the fix resolves notifications at the
transition, so rows stranded before the release stay where they are.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`. Disposition FIX_NOW.
- 2026-08-29 — **fixed** in SESSION-0076 on `agent/bugfix-leave`: the notification model gained resolution by related record, and leave calls it on cancel, approve and reject. Root Cause established as a missing capability rather than a leave omission. Covered by `notification-action-resolution.spec.ts` and `leave-notification-lifecycle.spec.ts`. Status OPEN to FIXED. Rows stranded before the release are not cleaned up retroactively.


<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[notifications]]

<!-- GRAPH:END -->
