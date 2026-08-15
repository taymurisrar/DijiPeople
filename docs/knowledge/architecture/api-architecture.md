# API Architecture

> Generated from repository evidence at `ad8f77f`.

NestJS 11 at `services/api`, port 4000, global prefix `/api`. **63 modules**
under `src/modules/`, cross-cutting code in `src/common/`.

## Module layout

```
src/modules/<domain>/
  <domain>.module.ts
  <domain>.controller.ts      thin — decorators and delegation only
  <domain>.service.ts         business rules live here
  <domain>.repository.ts      Prisma access and shared include shapes
  dto/                        class-validator DTOs
  *.spec.ts                   colocated
```

**Controllers are thin.** Route decorators, guards, permission decorators,
`@CurrentUser()`, then delegate. No business logic, no Prisma.

**Repositories accept `PrismaService | Prisma.TransactionClient`**, so callers
can compose transactions.

## Validation is strict, and that is a contract

The global `ValidationPipe` runs with
`whitelist: true, transform: true, forbidNonWhitelisted: true`.

**An unknown request field is a 400.** DTO and frontend payload change together,
always. This is not a nuisance — during the commercial onboarding E2E it
correctly rejected six harness payloads that did not match the real DTOs, and
each rejection was a genuine mismatch rather than a defect.

## Errors are a single contract

Throw `AppError` with a code from `common/errors/error-catalog.ts`, or a Nest
exception carrying `{ code, message }`. `HttpExceptionFilter` renders
`success`, `traceId`, `statusCode`, `errorCode`, `message`, `description`,
`fieldErrors`, `support` and records the failure through `ErrorLogsService`.

**Add a catalog entry rather than an ad-hoc shape.** Three frontends parse this.

## Mass assignment

Never spread a DTO into `prisma.*.create/update`. Pick fields explicitly. A
client never sets `tenantId`, `id`, `createdById`, status or approval fields, or
money the domain should compute.

## Audit and events

`AuditService.log()` for every state-changing operation a tenant admin or
auditor would need to see, with `beforeSnapshot` and `afterSnapshot`, passing the
transaction client when inside `$transaction`.

Platform-side events via `PlatformEventsService`; tenant notifications through
the `notifications` module (catalog → orchestrator → queue → processor). **No
domain service sends email directly.**

## Contract stability

API response shapes are consumed by `apps/web`, `apps/admin`,
`apps/agent-desktop` and the .NET gateway — the last of which runs on customer
premises and is **not upgraded in lockstep**. Version or extend additively;
never repurpose a field. See [[integration-architecture]].

## Where the platform surface differs

`platform/*` and `partner-experience/*` authorize **inside the service** rather
than through decorators. Deliberate for a cross-tenant surface, and it means
every reachable method must assert — see [[rbac]] and [[service-authorization-hidden]].

The platform method-to-permission resolver has no `DELETE` mapping, so every
platform `DELETE` route is dead:
[[BUG-0018-bulk-lead-delete-is-unreachable-for-every-role]]. It fails closed.

## Related

[[system-architecture]] · [[rbac]] · [[authentication]] ·
[[database-architecture]] · [[integration-architecture]] ·
[[runtime-module-system]]

Source: root `AGENTS.md`, `services/api/AGENTS.md`,
`.agent/context/backend-architecture.md`, `.agent/context/api-contracts.md`,
`docs/architecture/backend.md`.
