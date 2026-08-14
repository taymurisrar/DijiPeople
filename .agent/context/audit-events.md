# Audit, Events, Notifications and Error Logs

> **Last verified:** 2026-08-14
> **Verified against commit:** 8682dc1
> **Key source files:** services/api/src/modules/audit/audit.service.ts, services/api/src/modules/audit/audit.repository.ts, services/api/src/modules/platform-events/platform-events.service.ts, services/api/src/modules/notifications/notification-events.catalog.ts, services/api/src/modules/notifications/notification-orchestrator.service.ts, services/api/src/modules/notifications/queues/notification-queue.service.ts, services/api/src/modules/notifications/processors/email-notification.processor.ts, services/api/src/modules/error-logs/error-logs.service.ts, services/api/prisma/schema.prisma
>
> This document describes the repository, it is not authority over it. If the
> code disagrees, the code is current truth — report the discrepancy and
> recommend a context update.

## CURRENT

### `AuditService.log()` (`modules/audit/audit.service.ts:10-73`)

```ts
log(
  input: {
    tenantId: string;                 // required
    organizationId?: string | null;
    businessUnitId?: string | null;
    actorUserId?: string | null;
    action: string;                   // free-form string, no enum
    entityType: string;               // free-form string
    entityId: string;
    requestId?: string | null;
    traceId?: string | null;
    sourceModule?: string | null;
    scope?: unknown;
    beforeSnapshot?: unknown;
    afterSnapshot?: unknown;
  },
  db?: Prisma.TransactionClient,
)
```

`db` is the **second positional argument**, forwarded to `auditRepository.create/createPlatform` so audit rows join the caller's `$transaction`.

**The `'platform'` sentinel** (`:28-44`): when `input.tenantId === 'platform'` the call is rerouted to `PlatformAuditLog` via `auditRepository.createPlatform`, with `actorUserId` written as `platformActorUserId`. No `tenantId`/`organizationId`/`businessUnitId` is stored. There are 21 `tenantId: 'platform'` occurrences under `src/`. This is the **only** string sentinel of its kind.

**Actor resolution** (`resolveTenantAuditActor`, `:75-106`) — read the body, it is not a simple assignment:
- `actorUserId` absent → `{ actorUserId: null, platformActor: null }`.
- Otherwise `auditRepository.findTenantActor(tenantId, actorUserId)` does `user.findFirst({ where: { id, tenantId } })` (`audit.repository.ts:12-20`). Found → `actorUserId` is stored, `platformActor` null.
- Not found → `findPlatformActor` does `platformUser.findUnique({ where: { id } })` (`:22-32`). Found → **`actorUserId` is stored as `null`** and a `platformActor` object (`id`, `email`, `fullName`, `role`, `source: 'platform-admin'`) is merged into `scope` by `mergeAuditScope` (`:245-262`).
- Neither → `actorUserId: null` and `platformActor = { id: actorUserId, source: 'external-or-platform-actor' }`.

So a tenant `AuditLog.actorUserId` is **guaranteed to be a real tenant user or null**; cross-tenant/platform actors survive only inside `scope.platformActor`.

`normalizeSnapshot` (`:237-243`) is `JSON.parse(JSON.stringify(value))`, returning `undefined` for null/undefined — it will throw on circular structures and silently drops `undefined` properties and functions.

**Read paths**: `listByTenant` (`:108-124`, paginated + filter metadata), `detailByTenant` (`:126-133`, throws `NotFoundException`), `listRecordTimeline` (`:135-167`). `mapAuditLogItem` (`:175-219`) derives display fields by **string-reading `afterSnapshot` keys**: `email`, `result`, `failureReason`, `ipAddress`, `appClientId`, `userAgent`, `sessionId`, `mfaResult`. Those key names are an implicit contract for auth-related audit writers.

**Call sites: 152 `auditService.log(` occurrences across 46 files.** Distribution (top): `super-admin` 19, `timesheets` 15, `attendance` 11, `teams` 10, `payslips` 7, `payroll` 7, `leads` 7, `employees` 7, `compensation` 7, `policies` 6, `users` 5, `roles` 5, `tenant-settings` 4, `projects` 4, `platform-monitoring` 4, `approvals` 4, then 1-3 each in `pay-components`, `employee-levels`, `documents`, `data`, `auth`, `time-payroll`, `tax-rules`, `employment-types`, `agent`, and others. With 127 services in the codebase, coverage is far from universal.

### Models (`services/api/prisma/schema.prisma`)

**`AuditLog`** (`:9455-9481`): `id` uuid, `tenantId`, `organizationId?`, `businessUnitId?`, `actorUserId?`, `action`, `entityType`, `entityId`, `requestId?`, `traceId?`, `sourceModule?`, `scope? Json`, `beforeSnapshot? Json`, `afterSnapshot? Json`, `createdAt`. Relations: `tenant` (`onDelete: Cascade`), `actorUser` (`"AuditLogActor"`, `onDelete: SetNull`). Seven indexes, all tenant-leading: `[tenantId]`, `[tenantId, createdAt]`, `[tenantId, action, createdAt]`, `[tenantId, entityType, createdAt]`, `[tenantId, actorUserId, createdAt]`, `[tenantId, requestId]`, `[tenantId, sourceModule, createdAt]`.

**`PlatformAuditLog`** (`:9483-9504`): same columns minus `tenantId`/`organizationId`/`businessUnitId`, with `platformActorUserId?` → `PlatformUser` (`"PlatformAuditLogActor"`, `SetNull`). Six indexes mirroring the tenant ones without the tenant prefix.

Neither model has `updatedAt` or a delete path — audit rows are append-only in practice, and cascade-deleted with the tenant.

**`PlatformEvent`** (`:7291-7317`): `eventCode`, `source PlatformEventSource`, `result PlatformEventResult @default(SUCCEEDED)`, `severity String @default("INFO")`, `environment`, `correlationId`, `entityType?`, `entityId?`, `tenantId?`, `customerAccountId?`, `actorType?`, `actorId?`, `route?`, `metadata? Json`, `occurredAt`, `createdAt`. Eight indexes. `tenantId` here is a **plain nullable string with no relation** — it is telemetry, not a tenant-owned record.

### `PlatformEventsService` (`modules/platform-events/platform-events.service.ts`)

`record(input: RecordPlatformEventInput)` (`:34-64`) writes `platformEvent`. It normalizes `eventCode` to `A-Z0-9_`, ≤120 chars (`:170-177`), defaults `result` to `SUCCEEDED` and `severity` to `'INFO'`, generates `` `evt_${randomUUID()}` `` when no `correlationId`, truncates `entityType` 100 / `entityId` 160 / `actorType` 80 / `actorId` 160 / `route` 300, and runs `metadata` through `sanitizeMetadata` (depth 5, arrays capped at 50, strings at 1000).

**It swallows every failure**: the whole write is in a `try/catch` that logs a warning and returns `null`, with the comment *"Telemetry must never turn a successful business operation into a failure."* (`:56-63`). Do not use `record()` as a durability guarantee.

Read methods (`list`, `overview`, …) call `private assertRead(user)` (`:161-167`) whose body is: throw `ForbiddenException` unless `user.platform?.id` **and** `userHasPlatformPermission(user, 'monitoring.read')`. Platform-only, as intended.

### Notifications pipeline

**Catalog** — `modules/notifications/notification-events.catalog.ts`. `NOTIFICATION_EVENT_CATALOG: NotificationEventDefinition[]` (`:34`) with **29 events**, each `{ code, name, description, category: NotificationEventCategory, defaultChannels: NotificationChannel[], enabledByDefault, systemTemplateKey? }`. The file also exports `SystemEmailTemplateSeed` for system template seeding.

**Orchestrator** — `NotificationOrchestratorService` (`notification-orchestrator.service.ts`). Single public method `dispatch(input: NotificationDispatchInput)` (`:57`). Input carries `tenantId`, `eventCode`, `channels: NotificationChannel[]`, `sourceModule`, `correlationId?`, `requestedByUserId?`, an optional `scope` (`organizationId`/`businessUnitId`/`departmentId`/`teamId`/`employeeId`/`userId`, used to pick the most specific email template), plus `email` and/or `inApp` payloads. It fans out to `EmailService.sendTemplateEmail` and `InAppNotificationsService.create`, stamping `sourceModule` and `correlationId` into each metadata bag, then logs a completion line.

**Queue** — `NotificationQueueService` (`queues/notification-queue.service.ts`). `dispatchEmail(input, executeSync, options)` builds an `EmailNotificationJobPayload` (`jobId` uuid, `tenantId`, `eventCode`, `channel: 'EMAIL'`, `sourceModule`, `correlationId`, `requestedByUserId`, `requestedAt`, `email`) and then calls `executeSync(...)` **in both branches** (`:45-80`). When `NOTIFICATIONS_QUEUE_ENABLED === 'true'` it additionally warns *"Notification queue requested but BullMQ is not wired; using sync fallback."* (`:60-66`). `getQueueDiagnostics()` reports `adapter: 'sync-fallback'`.

**Processor** — `EmailNotificationProcessor` (`processors/email-notification.processor.ts`) is 11 lines: `process(job)` → `emailExecutionService.execute(job.email)`. No worker binds to it.

**There is no Redis/BullMQ dependency** in `services/api/package.json`. Email delivery is synchronous and in-process today.

**Rule vs. reality.** AGENTS.md says domain services must not send email directly. Only **two** modules outside `notifications/` inject `NotificationOrchestratorService`: `modules/payroll/payroll-notification.service.ts` and `modules/payslips/payslips.service.ts`. Six modules bypass it and inject `EmailService` directly: `auth/auth.service.ts`, `auth/user-invitations.service.ts`, `employees/employee-profiles.service.ts`, `super-admin/super-admin.service.ts`, `support-cases/support-cases.service.ts`, `workflows/workflow-runtime.service.ts`. A separate `common/mailer/MailerModule` is used only by `auth.module.ts`.

### `ErrorLog` dedup by fingerprint (`modules/error-logs/error-logs.service.ts`)

`persist(input)` (`:67`) returns early unless `config.enabled && config.storage === 'database'` and the table is available. It sanitizes the payload with `sanitizeForErrorLog`, adds `sourceApp` (from the trace-id prefix, `:405-409`) and `environment`, then computes `incidentFingerprint(data)` (`:411-435`):

```
sha256( sourceApp | errorCode | method | path | stableMessage )
```

where `stableMessage` is the message lowercased with UUIDs replaced by `:id`, bare integers by `:n`, and whitespace collapsed. That normalization is why `ErrorLog` counts *incidents*, not occurrences.

Inside a `$transaction` (`:106-138`): `errorLog.findUnique({ where: { fingerprint } })` → if found, `update` with `lastSeenAt: new Date()`, `occurrenceCount: { increment: 1 }` and refreshed severity/status/message/description/stack/cause/details; if not, `create` with `firstSeenAt`, `lastSeenAt`, `occurrenceCount: 1`. Then `errorLogOccurrence.upsert({ where: { traceId } })` links this trace to the incident with a `diagnosticJson` blob.

Models: `ErrorLog` (`schema.prisma:9506-9555`) has `traceId @unique`, `fingerprint String? @unique`, `firstSeenAt`, `lastSeenAt`, `occurrenceCount`, triage fields (`supportStatus @default("NEW")`, `assignedTo`, `assignedToUserId`, `internalNote`, `customerUpdate`, `resolvedAt`), `sourceApp @default("api")`, `environment`, and nine indexes. `ErrorLogOccurrence` (`:9557-9566`) has `traceId @unique` and cascades from `ErrorLog`.

`onModuleInit` starts a 24h `setInterval` retention cleanup (`:52-57`), unref'd.

## Key abstractions

- `AuditService.log(input, db?)` — the only sanctioned tenant/platform audit writer.
- `'platform'` tenantId sentinel — routes to `PlatformAuditLog`.
- `mergeAuditScope` / `scope.platformActor` — how a non-tenant actor is preserved.
- `PlatformEventsService.record()` — best-effort platform telemetry, never throws.
- `NOTIFICATION_EVENT_CATALOG` → `NotificationOrchestratorService.dispatch` → `NotificationQueueService.dispatchEmail` → `EmailNotificationProcessor.process`.
- `incidentFingerprint` — error dedup key.

## Known exceptions

- `PrismaService` writes an audit row **directly** — `this.auditLog.create({ data: { action: 'BUSINESS_UNIT_ACCESS_DENIED', … } })` inside a `setImmediate`, bypassing `AuditService` (`common/prisma/prisma.service.ts:82-100`). It is unreachable because the surrounding `$use` middleware never registers on `@prisma/client@7.8.0`.
- `AuditLog.actorUserId` is deliberately `null` for platform actors — queries joining `actorUser` will under-report platform activity.
- `mapAuditLogItem` mines `afterSnapshot` for `ipAddress`/`userAgent`/`sessionId`/`mfaResult`; these are conventions with no type enforcement.
- `action` and `entityType` are free-form strings. There is no shared action enum, so casing/naming varies by module.
- `PlatformEvent.tenantId` has no FK and is not tenant-isolated.
- The processor/queue/job-payload files exist as scaffolding for a queue that is not wired.
- `notification-events.catalog.ts` contains at least one event marked as reserved for future use (`AUTH_OTP`, "Reserved for future one-time passcode authentication flows").

## Anti-patterns to avoid

- Writing `prisma.auditLog.create` / `prisma.platformAuditLog.create` directly instead of `AuditService.log()`.
- Calling `AuditService.log()` **outside** an enclosing `$transaction` when the state change is inside one — pass `tx` as the second argument or the audit row survives a rollback.
- Inventing a new sentinel tenantId. `'platform'` is the only one.
- Putting a raw JWT, password, secret or full request body into `beforeSnapshot`/`afterSnapshot` — `normalizeSnapshot` does **not** redact anything (unlike `sanitizeForErrorLog`).
- Passing circular objects to snapshots — `JSON.stringify` will throw inside the transaction.
- Injecting `EmailService`/`MailerService` into a new domain service. Six modules already do; do not make it seven.
- Treating `PlatformEventsService.record()` as durable, or awaiting it for correctness.
- Assuming `NOTIFICATIONS_QUEUE_ENABLED=true` makes delivery async — it does not.
- Adding a per-record unique constraint or a fingerprint-affecting field without checking `incidentFingerprint`.

## TARGET (required going forward)

- Every state-changing operation a tenant admin or auditor would need to see calls `AuditService.log()` with **both** `beforeSnapshot` and `afterSnapshot`, plus `sourceModule` and the request's `traceId`/`requestId`.
- Inside `$transaction`, always `await this.auditService.log({...}, tx)`.
- `action` uses the naming already present in the neighbouring module; `entityType` matches the Prisma model name used elsewhere in that module. Check existing values before coining a new one.
- Snapshots contain business fields only — no credentials, tokens, encrypted secrets, full national ids or bank details.
- Platform-side operations: `tenantId: 'platform'` for the audit trail, and `PlatformEventsService.record()` for telemetry. They are complementary, not alternatives.
- New notifications: add the event to `NOTIFICATION_EVENT_CATALOG` (with `systemTemplateKey` and seed template), then dispatch through `NotificationOrchestratorService.dispatch(...)` with `sourceModule` and `correlationId`. Never inject `EmailService` into a domain service.
- If real async delivery is required, that is an ADR-level change (adds Redis/BullMQ), not an implementation detail.

## What the specialist agent MUST verify before changing this

1. Re-read `AuditService.log` (`audit.service.ts:10-73`) and `resolveTenantAuditActor` (`:75-106`) **bodies** — the null-`actorUserId`-for-platform-actor behaviour is the easiest thing to get wrong.
2. Confirm the `db` parameter is still the second positional argument before threading a `tx`.
3. Re-grep `tenantId: 'platform'` to see whether a second sentinel has appeared.
4. Re-read `mapAuditLogItem` before renaming any `afterSnapshot` key — the audit UI reads them by string.
5. Re-read `assertRead` in `platform-events.service.ts:161` rather than trusting its name.
6. Re-check `notification-queue.service.ts` and `services/api/package.json` before assuming queued delivery exists.
7. Re-grep `EmailService` injections outside `modules/notifications/` to see whether the direct-send list grew or shrank.
8. Re-read `incidentFingerprint` before altering `errorCode`, `path` or message formatting — it silently changes dedup grouping.
9. Re-read the `AuditLog` / `PlatformAuditLog` / `ErrorLog` / `PlatformEvent` blocks in `schema.prisma` (line numbers shift with every migration).
10. Run `npm --workspace api run test` (see `attendance.service.spec.ts`, `notification-events.*.spec.ts`, `notification-scope-chain.spec.ts`) and `npm run prisma:validate`.
