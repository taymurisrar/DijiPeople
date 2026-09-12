---
ID: ITEM-0168
aliases: [ITEM-0168]
Title: A retry action on an email delivery log
Type: FOLLOW_UP
Status: DONE
Priority: P2
Severity: 
AffectedModules: [notifications, apps/web]
Source: USER_REPORT
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-12
ResolvedAt: 2026-09-12
RelatedBug: BUG-3200
RelatedQA: QA-SETTINGS-020
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

## Resolution

The backend landed first (below), and the item was deliberately left `READY`
rather than `DONE` for it alone — the product owner asked for a retry
**button**, and a working endpoint with no way to reach it does not answer
that ask, whatever the audit trail behind it looks like. This pass adds the
control.

**Backend** (`POST /notifications/email-delivery-logs/:id/retry`,
`NotificationsController`): tenant-scoped via `findFirst({ id, tenantId })`;
gated by a new permission, `notification.logs.retry`, distinct from
`notification.logs.read` in both permission systems; refuses — before
attempting anything — a non-EMAIL channel, an `AUTH_*` event (a one-time
credential should not be replayed from a log; re-trigger the original action
instead), a workspace whose effective provider is currently a sink (would
only reproduce the same `NOT_DELIVERED` row), a row that is not
`retryable && status === FAILED`, and a row that predates variable capture
(`EmailDeliveryLog.metadata.originalVariables`, added alongside this
feature — nothing before it could be replayed at all). Every refusal is an
`AppError` with a full sentence, which the global `HttpExceptionFilter`
places on the response's `message` field — confirmed by reading
`http-exception.filter.ts`, not assumed. Every attempt, successful or not,
is audited (`notification_delivery_log.retried`). Pinned by
`services/api/src/modules/notifications/notification-retry.spec.ts` (6
cases: the four refusals, the sink-provider refusal, and the happy path).
The endpoint now returns **both** the retried row and the new delivery it
produced (`{ retriedLog, newDeliveryLog }`) — a retry always lands on a new
`EmailDeliveryLog` row rather than mutating the original in place, so
returning only the stale original would leave the caller with no way to
show what the retry actually did. This is a same-session, pre-frontend
change to the response shape; nothing else had started consuming it yet.

**Frontend**: `apps/web/app/(authenticated)/settings/_components/notification-email-log-record-page.tsx`
(new). The settings-runtime adapter for this screen (`notification-email-logs`)
stays `mode: "read-only"` — switching it to `"specialized"` would have
replaced the whole screen, including the list-view fixes BUG-3379 made to the
shared `module-data-table.tsx` — so this wraps the same generic
`StandardModuleRecordPage` every read-only record uses (the pattern
`WorkSiteRecordPage` already established for a different reason) and adds one
panel above it. `SettingsRuntimeRecord` in `settings-runtime-pages.tsx` special-cases
`adapter.key === "notification-email-logs"` to compute `canRetry`
server-side from the session (`hasAnySettingsPermission`, the same helper
`canEditTenantSlug` already uses) and pass it down — a user without
`notification.logs.retry` never receives the control in the payload, the
same way `canEditTenantSlug` is withheld today; the server endpoint enforces
the permission independently regardless, so a user who reached the control
some other way would still be refused. The panel itself renders only when
`record.status === "FAILED" && record.retryable === true` **and** `canRetry`
— both conditions, not either — so a non-retryable row never shows it
regardless of permission. `retryable` is now a declared, read-only field on
the adapter (`EmailDeliveryLog.retryable` was already persisted and
returned by the API; it was simply never selected by this adapter before).
On success the outcome renders inline — the new delivery's status through
the shared `StatusPill` with a human label, its provider type, and its
reason if one exists — so "the outcome is visible on the row" does not
require a second navigation to the new record. On refusal, `err.message`
(the full sentence from the `AppError`, unwrapped by
`NotificationRequestError` in `notifications-api.ts`) renders directly in an
inline error banner, not a raw error code.

**Verified, not assumed, before closing:**
- Permission gating is genuinely server-enforced: `retryDeliveryLog` carries
  both `@Permissions(NOTIFICATION_LOGS_RETRY)` and
  `@RequirePermission(ENTITY_KEYS.SETTINGS, 'configure')`, guarded the same
  way every other mutating route in this controller is — a user without the
  legacy key or the matrix privilege 403s before the service method runs,
  independent of whatever the UI shows or hides.
- `npm --workspace web run check-types`, `npm --workspace api run check-types`
  (only the 2 pre-existing, unrelated `@aws-sdk` errors), `npm --workspace api
  run test` (all notifications suites, including the new
  `notification-retry.spec.ts`), `npm --workspace web run test` (93/93
  suites), `eslint` on every changed file (0 errors, 0 warnings on the new
  files) — all run this session with real, current results.

Reviving `listRetryableDeliveryLogs` into an automatic, scheduled retry
remains out of scope, confirmed to be [[BUG-3200]]'s work (its own record is
untouched by this resolution beyond a cross-reference).

## History

- 2026-09-11 — created at `cbd9b812` from a user request for a retry button;
  the absence of any existing retry, and the dead `listRetryableDeliveryLogs`
  helper, confirmed by code search before filing.
- 2026-09-12 — backend implemented in SESSION-0103, per
  `EXECPLAN-0039`. Left `Status: READY` deliberately: the endpoint existed
  with no way to reach it, and marking the item DONE would have misdescribed
  what an operator could actually do.
- 2026-09-12 — frontend control added in the same session, reopened by the
  coordinator specifically to close this gap before release. See Resolution
  above. QA-SETTINGS-020 is the reusable scenario; REG-490 is the regression
  entry.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-3200]]
- Referenced by — [[BUG-3379]]
- Modules — [[notifications]], [[tenant-application]]

<!-- GRAPH:END -->
