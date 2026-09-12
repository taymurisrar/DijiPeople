---
ID: ITEM-0168
aliases: [ITEM-0168]
Title: A retry action on an email delivery log
Type: FOLLOW_UP
Status: READY
Priority: P2
Severity: 
AffectedModules: [notifications, apps/web]
Source: USER_REPORT
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-12
RelatedBug: BUG-3200
RelatedQA: 
RelatedADR: 
RelatedImplementation: EXECPLAN-0039
TargetMilestone: 
BlockedBy: 
---

# ITEM-0168 — A retry action on an email delivery log

## Summary

The product owner asked for a retry button on the email delivery log record.
There is no retry anywhere in the product today: no endpoint, no command, no
automatic retry that reaches these rows, and the delivery log screen is a
read-only adapter with no actions at all.

Building one is more than a button. It needs an endpoint, a permission in both
permission systems, an audit entry, a runtime command, and a rule about which
rows may legitimately be retried.

## Why It Matters

When a message fails for a transient reason — a provider timeout, a rate limit,
a credential rotated mid-flight — the only recovery today is to re-trigger the
originating business action, which for a scheduled report or an account
activation is either impossible or has side effects of its own. An operator
looking at a failed row can see that it failed and can do nothing about it.

## Evidence

**No retry exists.**

- `services/api/src/modules/notifications/notifications.repository.ts:672-682`
  defines `listRetryableDeliveryLogs`, filtering `retryable: true`,
  `status: FAILED` and `nextRetryAt <= now`. **It has no other call site in the
  codebase.** It is dead code.
- Grepping the notifications controller for `retry`, `resend` or `requeue`
  returns nothing. There is no route.
- `apps/web/app/(authenticated)/settings/_lib/settings-adapter-registry.ts:6620-6642`
  — the delivery-logs screen is the settings-runtime adapter keyed
  `notification-email-logs` with `mode: "read-only"`. Its fields are subject,
  recipient, status, `providerMessageId` and `createdAt`. No commands.

Observed live at `cbd9b812`, the delivery log record form's action bar is Back,
Edit (disabled), Share, Export, Delete (disabled). Nothing resembling a retry.

**Which rows are even retryable.**
`services/api/src/modules/notifications/email/email-execution.service.ts:476-494`
sets `NOT_DELIVERED` with `retryable: false` whenever the provider is a sink
(`CONSOLE` or `DEV`). Retrying such a row through the same provider would
reproduce the same outcome exactly. The thrown-error path at `:535-551` is the
one that sets `errorMessage`, `retryable` and `nextRetryAt`, and produces
`FAILED` — those are the rows a retry is actually for.

So a retry button must distinguish the two, or it will offer an action that
cannot possibly succeed.

**Wider context.** `NotificationQueueService.dispatchEmail`
(`services/api/src/modules/notifications/queues/notification-queue.service.ts:34-77`)
always calls `executeSync` inline on the caller's thread; its own diagnostics
note that BullMQ is not wired and the synchronous fallback is active, and
`render.yaml` sets neither `NOTIFICATIONS_QUEUE_ENABLED` nor `REDIS_HOST`. That
is [[BUG-3200]], OPEN and HIGH. A manual retry is the smaller, sooner half of
the same problem, and the two should not be designed in ignorance of each other.

## Proposed Approach

**Ruling (2026-09-12, architect):** this gets its **own** ExecPlan, not folded
into [[BUG-3200]]'s. BUG-3200 is the synchronous-queue problem and a real
automatic-retry story depends on it (a background retry sending on the
request thread of whoever happens to trigger it is not a retry worth having);
the manual, operator-initiated retry this item actually asks for is tractable
today, independent of that work, and BUG-3200 stays untouched and OPEN. See
`docs/plans/EXECPLAN-0039-manual-email-delivery-retry.md`.

It crosses the API, the permission matrix, audit and the settings runtime.

The pieces:

- `POST /notifications/email-delivery-logs/:id/retry` on
  `NotificationsController`, tenant-scoped from `request.user.tenantId` and
  reading the row with `findFirst({ id, tenantId })` as the existing reads do.
- A new permission — read access to a log is not authority to send mail. Needs
  both decorators: a legacy key in `common/constants/permissions.ts` and a
  matrix privilege via `@RequirePermission`.
- `AuditService.log()` on every retry, with before and after snapshots. A
  re-send is a state-changing operation an auditor would want to see.
- A guard on eligibility: refuse a retry that would go through a sink provider,
  with a message saying so, rather than silently producing a second identical
  `NOT_DELIVERED` row.
- Switching the settings adapter off `mode: "read-only"` to carry a runtime
  command, or adding a command surface that does not require making the record
  editable.
- A decision on whether retry re-renders the template or re-sends the stored
  payload. Re-rendering can produce different content than the row claims was
  sent; re-sending needs the payload to still exist.

Reviving `listRetryableDeliveryLogs` into a real automatic retry is the natural
companion and belongs in the same plan.

## Acceptance Criteria

- An operator with the retry permission can retry a `FAILED` delivery from its
  record, and the outcome is visible on the row.
- An operator without that permission cannot, and the control is not shown.
- Retrying a row that would go through a sink provider is refused with an
  explanation rather than attempted.
- Every retry writes an audit entry naming the actor and the row.
- The endpoint is tenant-scoped and cannot reach another tenant's log.

## Dependencies

Should be planned with [[BUG-3200]]. [[BUG-3379]] surfaces the failure reason
the operator needs in order to decide whether retrying is sensible, and is
cheaper; it should land first.

## Related Items

[[BUG-3200]] the synchronous notification queue. [[BUG-3379]] the undiagnosable
delivery row. [[BUG-2741]] introduced the sink status these rules turn on.

## History

- 2026-09-11 — created at `cbd9b812` from a user request for a retry button;
  the absence of any existing retry, and the dead `listRetryableDeliveryLogs`
  helper, confirmed by code search before filing.
- 2026-09-12 — backend implemented in SESSION-0103, per
  `EXECPLAN-0039`; **frontend deliberately not shipped, so this item stays
  READY rather than DONE.** `POST /notifications/email-delivery-logs/:id/retry`
  exists with both permission decorators (new `notification.logs.retry` key,
  distinct from read), tenant scoping, an eligibility guard (refuses a sink
  send, a non-retryable/non-FAILED row, and — a decision made in this
  pass — any `AUTH_*` event, since those carry a one-time credential that
  should not be re-sent from a log), an audit entry, and a payload-capture
  decision (re-render using variables captured at original send time, stored
  in the existing `EmailDeliveryLog.metadata` column — no schema change).
  `listRetryableDeliveryLogs` remains dead code; reviving it into an
  automatic retry is confirmed to be BUG-3200's work, not this item's. No
  frontend control was added — the settings-runtime adapter for this screen
  has no non-CRUD command extension point today, and building one safely was
  judged out of this session's remaining budget; see EXECPLAN-0039's Frontend
  impact section for the full reasoning. The literal ask ("a retry button")
  is therefore not yet delivered end-to-end, hence `Status: READY`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-3200]]
- Referenced by — [[BUG-3379]]
- Modules — [[notifications]], [[tenant-application]]

<!-- GRAPH:END -->
