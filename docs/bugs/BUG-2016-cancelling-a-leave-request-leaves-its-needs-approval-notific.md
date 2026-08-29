---
ID: BUG-2016
aliases: [BUG-2016]
Title: Cancelling a leave request leaves its needs-approval notification outstanding in the inbox
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [services/api/src/modules/notifications, services/api/src/modules/leave]
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

Not established. Observably, no leave request state transition resolves the
action-required notification that points at it. Whether the notification model
even supports "resolve every action-required notification for this record" is the
first thing to find out; if it does not, the fix is larger than a call site.

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

Open. No fix has been written.

## QA Retest

Awaiting a fix — nothing to retest yet. The cancelled request
`86200df6-6993-43eb-b9c7-4b310180ecd1` and its stale notification are still on
the demo tenant and can be used as the retest fixture.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`. Disposition FIX_NOW.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[notifications]]

<!-- GRAPH:END -->
