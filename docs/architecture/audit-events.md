# Audit, Events, Logging

Four distinct observability mechanisms with different purposes. Do not use one
where another belongs.

| Mechanism | Purpose | Store | Entry point |
|---|---|---|---|
| **Audit log** | Who changed what, for tenant admins and auditors | `AuditLog` / `PlatformAuditLog` | `AuditService.log()` |
| **Platform event** | SaaS operational events for DijiPeople staff | `PlatformEvent` | `PlatformEventsService.record()` |
| **Error log** | Persisted, deduplicated failures for support | `ErrorLog` | `HttpExceptionFilter` → `ErrorLogsService` |
| **Application log** | Runtime diagnostics | stdout | Nest `Logger` |

Notifications (email, in-app) are a separate delivery mechanism, described at
the end.

---

## Audit log

`services/api/src/modules/audit/audit.service.ts`

```ts
await this.auditService.log({
  tenantId: user.tenantId,
  actorUserId: user.userId,
  action: 'EMPLOYEE_TERMINATED',
  entityType: 'Employee',
  entityId: employee.id,
  organizationId, businessUnitId,          // optional
  requestId, traceId, sourceModule,         // optional
  scope, beforeSnapshot, afterSnapshot,     // optional
}, tx);                                     // optional transaction client
```

Behaviour:

- `tenantId === 'platform'` routes to **`PlatformAuditLog`** with
  `platformActorUserId`. This is the only string sentinel of its kind in the
  codebase.
- For tenant rows, `resolveTenantAuditActor()` looks up the actor as a tenant
  user first. If the actor is not a tenant user, `actorUserId` is left null and
  the platform actor's identity is merged into `scope` (with
  `source: 'platform-admin'` or `'external-or-platform-actor'`). **This is how a
  platform admin acting inside a tenant is attributed** — do not bypass it by
  writing `AuditLog` rows directly.
- Passing the transaction client makes the audit row commit or roll back with
  the change. Do this whenever you are inside `$transaction`.
- Snapshots are normalised to JSON before storage.

Schema (`AuditLog`): `tenantId`, `organizationId`, `businessUnitId`,
`actorUserId`, `action`, `entityType`, `entityId`, `requestId`, `traceId`,
`sourceModule`, `scope`, `beforeSnapshot`, `afterSnapshot`, `createdAt` — with
indexes on `(tenantId, createdAt)`, `(tenantId, action, createdAt)`,
`(tenantId, entityType, createdAt)`, `(tenantId, actorUserId, createdAt)`,
`(tenantId, requestId)` and `(tenantId, sourceModule, createdAt)`.

Reads go through `AuditService.listByTenant()` and the `audit` controller,
gated by the `audit.read` permission.

### Conventions

- `action` — stable `SCREAMING_SNAKE_CASE` verb phrase (`EMPLOYEE_TERMINATED`,
  `PAYROLL_RUN_FINALIZED`, `BUSINESS_UNIT_ACCESS_DENIED`). Do not rename
  existing actions; historical rows keep the old value.
- `entityType` — the Prisma model name.
- Snapshots — the fields that changed and enough context to make the row
  meaningful. **Never** password hashes, tokens, decrypted secrets or full bank
  details.

### Coverage

`AuditService.log()` is called at **165 sites across 60 services**. Coverage is
deliberate but not universal. New state-changing operations that a tenant admin
or auditor would need to see must add an audit call — nothing enforces this
automatically.

---

## Platform events

`services/api/src/modules/platform-events/platform-events.service.ts`

For SaaS-operational occurrences: provisioning, lifecycle transitions, billing
outcomes, integration health. `PlatformEvent` carries `eventCode`, `source`
(`PlatformEventSource`), `result` (`PlatformEventResult`), `severity`,
`environment`, `correlationId`, `entityType`/`entityId`, optional `tenantId` and
`customerAccountId`, `actorType`/`actorId`, `route` and `metadata`.

`record()` swallows its own failures — recording an event must never break the
operation it describes. `correlationId` defaults to a generated `evt_<uuid>`;
pass the request's trace id when you have one so an event can be tied to a
request.

Reads are gated by platform permissions (`userHasPlatformPermission`).

---

## Error logging and tracing

`RequestIdMiddleware` (`common/middleware/request-id.middleware.ts`) runs first
on every route:

- Accepts an inbound trace header (`ERROR_TRACE_HEADER`, default `x-trace-id`)
  or `x-request-id`, else mints `req_<uuid>`.
- Sets `req.requestId` and both `X-Request-Id` and `X-Trace-Id` response
  headers.

`HttpExceptionFilter` (`common/filters/http-exception.filter.ts`) catches
everything and returns the standard contract:

```json
{
  "success": false,
  "traceId": "...",
  "timestamp": "...",
  "statusCode": 400,
  "errorCode": "VALIDATION_FAILED",
  "message": "...",
  "description": "...",
  "path": "...",
  "method": "...",
  "details": {},
  "fieldErrors": [{ "field": "...", "message": "..." }],
  "support": { "reference": "...", "message": "..." }
}
```

It resolves the code through `common/errors/error-catalog.ts`, maps Prisma
errors, enriches details with the authenticated user's context, sanitises via
`sanitizeForErrorLog()`, and persists through `ErrorLogsService`.

`ErrorLog` deduplicates on `fingerprint` (unique) with
`firstSeenAt` / `lastSeenAt` / `occurrenceCount`, and stores `errorCode`,
`statusCode`, `severity`, `sourceApp`, `environment`, `message`, `stack`,
`cause`, request context (`method`, `path`, `params`, `query`, `requestBody`,
`userAgent`, `ipAddress`), actor context (`userId`, `tenantId`,
`organizationId`, `businessUnitId`) and a support workflow
(`supportStatus`, `assignedTo`). Surfaced in `apps/admin` under monitoring.

Throw `AppError` with a catalog code rather than an ad-hoc error, so the
response, the severity and the persisted record are all consistent.

---

## Application logging

Nest `Logger`, one per class. `main.ts` maps `LOG_LEVEL` onto a ladder —
`LOG_LEVEL=debug` means "debug and everything more serious". Defaults:
`['error','warn']` in production, `['error','warn','log']` otherwise.

Never log: tokens, passwords, password hashes, decrypted secrets, full request
bodies, national identifiers, bank details.

---

## Notifications

`services/api/src/modules/notifications/` — a separate delivery pipeline, not an
audit mechanism.

```
notification-events.catalog.ts   the event → template/rule contract
NotificationOrchestratorService  resolves recipients, templates, scope chain
queues/ + processors/            asynchronous delivery
email/                           email rendering and provider selection
in-app-notifications.service.ts  in-app delivery
notification-diagnostics.service.ts
```

Rules:

- Domain services **do not send email directly.** They raise a notification
  event; the orchestrator resolves rules, templates and recipients. The mailer
  (`common/mailer/`) is the notification module's dependency.
- Templates and rules can be scoped per tenant module — the module keys are in
  `common/constants/tenant-modules.ts`.
- Notification failure must not fail the business operation.

Email provider configuration falls back to the platform SMTP settings
(`EMAIL_PROVIDER`, `EMAIL_SMTP_*`, `EMAIL_FROM`) when no per-tenant provider row
exists; without them every outbound email fails in production. See the comments
in [`render.yaml`](../../render.yaml).

---

## Choosing the right mechanism

| Situation | Use |
|---|---|
| A tenant record was created, changed, approved or deleted | Audit log |
| A tenant was provisioned, suspended, or a subscription changed state | Platform event (and audit if a tenant record changed) |
| A request failed | Nothing to add — the exception filter handles it. Throw `AppError` with the right code. |
| Diagnosing behaviour during development | Nest `Logger` |
| A person needs to be told something happened | Notification event |

---

## Known gaps

1. Audit coverage is per-service and manual — new mutations can ship unaudited.
2. There is no automated check that state-changing endpoints write an audit row.
3. `ErrorLog.requestBody` is persisted; `sanitizeForErrorLog` is what keeps
   secrets out of it. New sensitive field names must be added there.
4. Trace ids propagate through the API's own responses, but end-to-end tracing
   across the Next.js apps and the .NET gateway was **not verified** and should
   not be assumed.
