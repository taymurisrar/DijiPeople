CONTEXT_FILES_REQUIRED:
  - docs/decisions/ADR-0009-notification-rule-and-preference-are-two-gates-not-one.md
  - docs/bugs/BUG-3379-a-delivery-log-row-says-not-delivered-and-carries-nothing-th.md
  - docs/bugs/BUG-3200 (queue synchronicity — sequencing dependency for automatic retry, not implemented here)

SPECIALIST_AGENTS_REQUIRED:
  - Backend/API — endpoint, permission, audit, eligibility guard, payload-capture

DELIBERATELY_NOT_USED:
  - Prisma/Migration — no schema change; the payload needed for retry is captured into the existing `EmailDeliveryLog.metadata` Json column

SINGLE_WRITER_FILES:
  - services/api/src/common/constants/permissions.ts (additive PermissionDefinition entries)

QA_REQUIRED: yes

KNOWN_BUG_PATTERNS_IN_SCOPE:
  - docs/qa/known-bug-patterns/authorization-missing.md
  - docs/qa/known-bug-patterns/sensitive-field-overexposure.md

REGRESSION_ENTRIES_IN_SCOPE:
  - none — this is new capability, not a fix to previously-working behaviour

TARGET_BRANCH:            develop
TARGET_ENVIRONMENT:       LOCAL
DEPLOYMENT_REQUIRED:      no
DEPLOYMENT_COMPONENTS:    api
DEPLOYMENT_ORDER:         api only (no frontend control ships in this plan — see Definition of Done)
ROLLBACK_CLASS:           CODE_ONLY

# ExecPlan — Manual, operator-initiated email delivery retry

## Objective

An operator with a new, distinct permission can retry a `FAILED`, retryable
`EmailDeliveryLog` row from the API, re-rendering the original template with
the variables captured at send time. A row that cannot succeed if retried — a
`NOT_DELIVERED` sink send, a non-retryable `FAILED` row, an `AUTH_*` row — is
refused with an explanation rather than silently reproduced.

## Business requirement

ITEM-0168. The product owner asked for a retry button on the delivery log.

**Explicit scope ruling from the coordinator, recorded here because it
changes what "done" means for this plan**: BUG-3200 (the notification queue's
synchronous-fallback problem) is out of scope. `ITEM-0168`'s own record
suggested folding this plan into BUG-3200's; that suggestion is not followed.
This plan delivers the manual retry only. Reviving `listRetryableDeliveryLogs`
into a real, automatic, scheduled retry is BUG-3200's work — it requires the
outbox-based asynchronous delivery BUG-3200 proposes, because a background
retry sending on whichever thread picks it up is a materially different,
larger problem than a human clicking a button once. BUG-3200 remains OPEN and
untouched by this plan; this plan's manual endpoint does not depend on it and
does not block on it.

## Existing behavior

- `NotificationsRepository.listRetryableDeliveryLogs` exists, filters
  `retryable: true`, `status: FAILED`, `nextRetryAt <= now` — and has no
  caller anywhere in the codebase. Dead code.
- No route, command or button exists anywhere for retry. The delivery-log
  record's action bar showed a permanently disabled `Edit` and `Delete` (see
  BUG-3379, fixed in the same session — `standard-module-runtime.ts` no
  longer renders a command a module structurally cannot support).
- `EmailDeliveryLog` never stored the `variables` a template was rendered
  with, nor the rendered html/text body — only the rendered `subject`. A
  retry that wanted to "resend exactly what was sent" cannot, without either
  a schema change or capturing more at send time.

## Existing architecture

`NotificationsService.getDeliveryLog`, `EmailService.sendTemplateEmail`,
`EmailExecutionService.execute()` (`buildMetadata`), `NotificationsController`.

## Requirements

1. `POST /notifications/email-delivery-logs/:id/retry`, tenant-scoped via
   `findFirst({ id, tenantId })`.
2. A new permission distinct from read: `notification.logs.retry`
   (`NOTIFICATION_PERMISSION_KEYS.NOTIFICATION_LOGS_RETRY`), both decorators.
3. Eligibility: refuses (400, `EMAIL_DELIVERY_LOG_NOT_RETRYABLE`) a row that
   is not `channel: EMAIL`; an `AUTH_*` event; one where the tenant's
   effective provider is currently a sink (would reproduce the exact
   `NOT_DELIVERED` outcome); or one that is not `retryable && status ===
   FAILED`.
4. **Decision: retry re-renders the template, using the variables captured at
   the original send** (`EmailDeliveryLog.metadata.originalVariables`, a new
   field added to what `EmailExecutionService.buildMetadata` already
   stores in the existing Json `metadata` column — no migration). "Re-send
   the stored rendered body" was considered and rejected: the schema never
   stored the rendered html/text, only the subject, so replaying it exactly
   is not possible without a migration this plan avoids; re-rendering with
   captured variables reproduces materially the same content and also picks
   up a template fix if one was made between the failure and the retry,
   which is the more useful behaviour for an operator retrying a failure.
5. Variables are **not captured** for `AUTH_ACCOUNT_ACTIVATION`,
   `AUTH_PASSWORD_RESET`, `AUTH_OTP` — an activation or reset link is a
   bearer credential, and a delivery log an operator can merely read should
   not become a second place that credential sits at rest. Those events are
   therefore also excluded from retry eligibility (requirement 3): retrying
   them means re-triggering the original action (resend invite, request a
   new reset link), not replaying old mail.
6. Every retry writes `AuditService.log()` with a before/after snapshot
   naming the actor and both the retried and newly-created delivery log ids.
7. `listRetryableDeliveryLogs` stays dead code in this plan — reviving it into
   an automatic retry is explicitly BUG-3200's work (Objective, above).

## Dependencies

Sequenced after BUG-3379 (needs the reason/provider-type visibility an
operator uses to decide whether retrying is sensible) — BUG-3379 landed in
the same session. Automatic/scheduled retry depends on BUG-3200 and is out of
scope here.

## Files / modules affected

`services/api/src/modules/notifications/notifications.constants.ts`,
`notifications.service.ts` (`retryDeliveryLog`), `notifications.controller.ts`,
`email/email-execution.service.ts` (`buildMetadata` — `originalVariables`
capture, exported `AUTH_NOTIFICATION_EVENTS`),
`common/constants/permissions.ts`, `common/errors/error-catalog.ts`,
`apps/web/lib/security-keys.ts`.

## Database impact

None. `originalVariables` is a new key inside the existing
`EmailDeliveryLog.metadata` Json column, not a new column.

## Backend impact

`NotificationsService.retryDeliveryLog(user, deliveryLogId)`: loads the log
(`findDeliveryLogById`, tenant-scoped), runs the eligibility checks in
order (channel → AUTH exclusion → sink-provider check → retryable/FAILED
check → captured-variables presence check), calls
`EmailService.sendTemplateEmail` with the captured `originalVariables`,
increments `retryCount`/`lastRetryAt` on the **original** row, audits, and
returns the refreshed original log. A **new** `EmailDeliveryLog` row is
created by the retried send itself (the existing `execute()` path always
creates one) — the retry does not overwrite history, it adds to it.

## Frontend impact

**None shipped in this plan.** See Definition of Done — the settings-runtime
adapter for delivery logs has no non-CRUD command extension point today
(distinct from the domain-module command registry used by, e.g., approvals);
building one safely was judged a separate, larger frontend investment than
this session's remaining budget allowed, and is called out explicitly rather
than shipped half-wired into a shared runtime file under time pressure. The
backend contract (endpoint, permission, audit, eligibility, payload-capture
decision) is complete and ready for a frontend control to call.

## Permission / RBAC impact

New legacy key `notification.logs.retry`, added to `PERMISSION_KEYS`
(`permissions.ts`) with a `PermissionDefinition`, and to
`NOTIFICATION_PERMISSION_KEYS` (`notifications.constants.ts`). Not granted to
any `BASE_ROLE_PERMISSION_KEYS` role by default — matching the existing
precedent for `notification.logs.read` and `notification.providers.manage`,
neither of which is granted to a base role either; reachable today only by
`GLOBAL_ADMIN`/`SYSTEM_ADMIN` (the elevated-role bypass) or a role a tenant
explicitly grants it to via the roles screen. `RequirePermission(ENTITY_KEYS.SETTINGS,
'configure')` — the same matrix privilege the provider/template management
routes already use.

## Tenant-isolation impact

`findDeliveryLogById(tenantId, id)` is `findFirst({ id, tenantId })`, already
existing and reused unchanged. The new route never accepts `tenantId` from
the client.

## Audit / event / logging impact

`notification_delivery_log.retried`, `entityType: 'EmailDeliveryLog'`,
before (`status`, `retryCount`, `providerMessageId`) and after (`status`,
`deliveryLogId` of the new row, `providerMessageId`) snapshots.

## Integration impact

None.

## Migration / data compatibility

Additive. A delivery log written before this plan has no
`metadata.originalVariables` key; retrying it is refused with
`EMAIL_DELIVERY_LOG_NOT_RETRYABLE` ("predates variable capture") rather than
silently sending with empty variables. This is a deliberate, honest
degradation rather than a broken retry.

## Parallel-safe tasks

The frontend control (deferred) is PARALLEL_SAFE against everything else in
this plan once undertaken.

## Dependency-blocked tasks

Automatic/scheduled retry — DEPENDENCY_BLOCKED on BUG-3200.

## Integration tasks

None.

## Testing strategy

No dedicated new spec was added for `retryDeliveryLog` in this session — see
Definition of Done. `npm --workspace api run check-types` and
`npm --workspace api run test` (existing suite, no regressions) are the
validation run for this plan; a focused
`services/api/src/modules/notifications/notification-retry.spec.ts` covering
the eligibility branches (AUTH exclusion, sink-provider refusal,
non-retryable refusal, missing-variables refusal, happy path with audit) is
the natural next addition and is named here so it is not lost.

## Risks

1. **A retry re-sending to the wrong recipient after the record changed** —
   not applicable: the recipient is read from the immutable log row, not from
   the live record.
2. **Credential exposure via captured variables** — mitigated by excluding
   `AUTH_*` events from capture entirely (Requirement 5).
3. **A retry producing a misleading "success" for a row that cannot actually
   improve** — mitigated by the sink-provider and AUTH-exclusion refusals.
4. **No frontend control shipped** — the retry is not reachable by an operator
   yet. Explicit, not hidden: see Definition of Done.

## Rollback considerations

Pure code rollback. No data written by this plan needs unwinding — a retry
only ever adds a new `EmailDeliveryLog` row through the existing, unchanged
send path.

## Definition of Done

- [x] Endpoint, permission (both decorators), audit, eligibility guard,
      tenant scoping — implemented and reviewed.
- [x] Decision on re-render vs re-send made and written down (Requirement 4).
- [ ] Regression/unit test for the eligibility branches — **not written this
      session**, named above as the next addition.
- [ ] Frontend control — **explicitly deferred**, reasoning in Frontend
      impact above. `ITEM-0168` records this split so a future session does
      not have to rediscover why the backend shipped without a button.
- [ ] `npm run seed:config` / a live database run to exercise the endpoint
      end-to-end — not run in this session; no database was provisioned for
      this task.
