# Backend Architecture (services/api)

> **Last verified:** 2026-08-14
> **Verified against commit:** 8682dc1
> **Key source files:** services/api/src/main.ts, services/api/src/app.module.ts, services/api/src/common/prisma/prisma.service.ts, services/api/src/common/guards/permissions.guard.ts, services/api/src/common/middleware/request-id.middleware.ts, services/api/src/common/middleware/business-unit-access.middleware.ts, services/api/src/common/request-context/request-context.service.ts, services/api/src/modules/employees/employees.repository.ts, services/api/src/modules/notifications/queues/notification-queue.service.ts, services/api/package.json
>
> This document describes the repository, it is not authority over it. If the
> code disagrees, the code is current truth — report the discrepancy and
> recommend a context update.

## CURRENT

### Bootstrap (`services/api/src/main.ts`)

NestJS 11 on Express 5, created with `NestFactory.create(AppModule, { bodyParser: false, logger: resolveLogLevels() })` (`main.ts:62-65`). Order matters and is explicit:

1. `validateDeploymentEnv(process.env, { app: 'api' })` from `@repo/config`, then `validateApiEnvironment` (`main.ts:60-61`).
2. `assertAuthEnvironment(configService)` — real body in `common/config/auth.config.ts:358`; it throws on missing per-client auth secrets.
3. `app.enableShutdownHooks()`, `app.setGlobalPrefix('api')` (`main.ts:71-72`).
4. Health routes registered **directly on the Express instance**, therefore bypassing the global prefix and all Nest pipes/filters: `/`, `/api`, `/api/health` (`main.ts:74-78`).
5. `cookieParser()` then `configureBodyParsing(expressApp)` (`main.ts:81-82`).
6. `app.enableCors(buildCorsOptions(process.env))` — credentials-enabled for cookie auth.
7. `useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }))` (`main.ts:87-93`).
8. `useGlobalFilters(app.get(HttpExceptionFilter))` — resolved **from the DI container**, because the filter injects `ConfigService` and `ErrorLogsService` (`main.ts:94`, filter ctor at `common/filters/http-exception.filter.ts:45-48`).
9. Listens on `0.0.0.0`, `PORT` or 4000.

**Why `bodyParser: false`** (`main.ts:110-149`): two routes need non-default parsing and Nest's built-in parser would consume the stream first.
- `/api/billing/stripe/webhook` gets `raw({ type: 'application/json', limit: '2mb' })` so the Stripe signature can be verified against the exact bytes; both the JSON and urlencoded parsers explicitly skip it via `isStripeWebhookRequest` (`main.ts:127-148`).
- `/api/super-admin/platform-email/templates` gets a `10mb` JSON limit; everything else is capped at `1mb`.

**LOG_LEVEL ladder** (`main.ts:38-57`): `LOG_LEVEL` names the *lowest* severity to show and the ladder `['error','warn','log','debug','verbose']` is sliced to that index. Unset/unrecognised falls back to `['error','warn']` in production, `['error','warn','log']` otherwise.

### Module layout

`AppModule` (`app.module.ts`) imports `ConfigModule.forRoot({ isGlobal: true })` plus ~60 feature modules. 60 directories exist under `src/modules/`. Two are **not** feature modules registered in `AppModule`:
- `modules/platform-auth/` contains only `platform-permissions.ts` + spec — a helper, no `.module.ts`.
- `modules/platform-communications/` has a module, but it is imported by `auth.module.ts:49`, `contracts.module.ts:15`, `leads.module.ts:14` rather than by `AppModule`.

Middleware is wired in `AppModule.configure()` (`app.module.ts:141-150`), both `forRoutes({ path: '*path', method: RequestMethod.ALL })`:
- `RequestIdMiddleware` — see api-contracts.md.
- `BusinessUnitAccessMiddleware` — decodes the access token itself with `jsonwebtoken` (`business-unit-access.middleware.ts:38-45`), resolves a business-unit access context, and stashes it in an `AsyncLocalStorage` via `RequestContextService.runWithContext` (`request-context.service.ts:18-25`). On any failure it sets `req.buAccess = null` and continues — it is **not** an auth gate.

### Layering

Counts at this commit: 88 `*.controller.ts`, 127 `*.service.ts`, only **21** `*.repository.ts` under `src/modules/`.

- **Controllers** carry `@Controller`, `@UseGuards(JwtAuthGuard, PermissionsGuard)`, `@Permissions` / `@RequirePermission`, `@CurrentUser()` and delegate (canonical example `modules/employees/employees.controller.ts:56-71`). 87 of 88 controllers declare `@UseGuards`.
- **Services** own business rules. 110 of 127 reference `prisma.` directly — the repository layer is the minority pattern, not the rule.
- **Repositories** own Prisma access and shared `include` shapes (e.g. `employeeInclude` at `employees.repository.ts:8`).

### `type PrismaDb`

Declared **locally in 20 files**, not shared. Dominant form:

```ts
type PrismaDb = PrismaService | Prisma.TransactionClient;
```

(`employees.repository.ts:6`, `payroll.repository.ts:6`, `leave.repository.ts:8`, …). Two variants exist: `audit.repository.ts:6` adds `| PrismaClient`, and `common/utils/tenant-code.util.ts:4` orders the union the other way. Repository methods take it as a defaulted last parameter — `db: PrismaDb = this.prisma` — so a caller can pass `tx` to compose a transaction.

### Transactions

225 `$transaction` call sites under `src/modules/`. Both forms are in use:
- Interactive callback: `this.prisma.$transaction(async (tx) => { … })` (`employees.service.ts:977, 1296, 1419, 2016`).
- Batch array for read pairs: `this.prisma.$transaction([findMany, count])` (`employees.service.ts:1500`).

Audit writes inside a transaction pass the client through: `AuditService.log(input, db?)` (`modules/audit/audit.service.ts:10-27`).

### `src/common/` map

| dir | contents |
|---|---|
| `config/` | `auth.config.ts` — `AUTH_CLIENT_IDS = { WEB: 'web', ADMIN: 'admin', AGENT_DESKTOP: 'agent-desktop' }` (`:4-8`), per-client secrets/TTLs, cookie names, `assertAuthEnvironment` |
| `constants/` | `permissions.ts`, `rbac-matrix.ts`, `tenant-modules.ts`, `wiring-invariants.spec.ts`, 6 `rbac-matrix.*.spec.ts` |
| `decorators/` | `current-user`, `permissions`, `public`, `require-permissions`, `require-roles` |
| `errors/` | `app-error.ts`, `error-catalog.ts`, `error-config.ts`, `sanitize-error-log.ts` |
| `filters/` | `http-exception.filter.ts` (the only one) |
| `guards/` | `jwt-auth.guard.ts`, `permissions.guard.ts`, `roles.guard.ts`, `public-rate-limit.guard.ts` |
| `middleware/` | `request-id.middleware.ts`, `business-unit-access.middleware.ts` |
| `prisma/` | `prisma.service.ts`, `prisma.module.ts` |
| `request-context/` | `AsyncLocalStorage` holder for BU access context |
| `security/` | `rbac-query-scope.ts`, `elevated-tenant-roles.ts`, `secret-encryption.service.ts`, `reference-data-access.ts`, `role-matching.ts`, `employee-account-actions.ts` |
| others | `excel/`, `mailer/`, `reference-data/`, `storage/`, `utils/`, `validation/`, `interfaces/` |

### There are NO global guards

`grep APP_GUARD|APP_INTERCEPTOR|APP_FILTER|APP_PIPE` over `src/` returns **zero** hits. Auth is opt-in per controller via `@UseGuards(JwtAuthGuard, PermissionsGuard)`. `HttpExceptionFilter` and the `ValidationPipe` are the only truly global cross-cutting pieces, and both are registered imperatively in `main.ts`.

Consequence in `PermissionsGuard.canActivate` (`common/guards/permissions.guard.ts:34-39`): when neither `@Permissions` nor `@RequirePermission` is present it **returns `true` immediately**. A guarded controller with an undecorated handler is authenticated but not authorized.

### Background work / queues

**No Redis, no BullMQ, no `@nestjs/schedule`.** `services/api/package.json` has no `bullmq`, `ioredis`, `@nestjs/bull*` or `@nestjs/schedule` dependency; `grep '@Cron\|ScheduleModule\|bullmq\|ioredis'` over `src/` returns zero hits.

Background work is plain `setInterval` inside `OnModuleInit`, with `.unref?.()` where present:
- `modules/error-logs/error-logs.service.ts:52-57` — 24h retention cleanup.
- `modules/data-management/data-job-worker.service.ts:36` — job poll cycle.
- `modules/timesheets/timesheet-jobs.service.ts:45`.
- `modules/platform-communications/platform-communications.service.ts:48` — 5-minute retry cycle.

`NotificationQueueService` is a **queue-shaped facade with no queue behind it**. `isQueueEnabled()` reads `NOTIFICATIONS_QUEUE_ENABLED === 'true'` (`notification-queue.service.ts:17-22`); either way `dispatchEmail` calls `executeSync(...)` and, when "enabled", logs `'Notification queue requested but BullMQ is not wired; using sync fallback.'` (`:60-66`). `getQueueDiagnostics()` reports `adapter: 'sync-fallback'` and reads `REDIS_HOST`/`REDIS_PORT` purely for reporting (`:24-34`).

## Key abstractions

- `PrismaService extends PrismaClient` with `@prisma/adapter-pg` (`common/prisma/prisma.service.ts:24-28`); `DATABASE_URL` required at construction.
- `RequestContextService` — `AsyncLocalStorage<BuAccessRequestContext | null>`.
- `AuthenticatedUser` — `common/interfaces/authenticated-request.interface.ts`; `request.user` shape everywhere.
- `PrismaDb` union — transaction-composable repository/service signatures.
- `AppError` + `ERROR_CATALOG` — see api-contracts.md.
- Schema scale here: 266 models, 222 enums, 10,436 lines in `prisma/schema.prisma`, 184 migrations.

## Known exceptions

- **The `$use` business-unit middleware in `PrismaService` is dead code.** It is registered only if `(this as any).$use` is a function (`prisma.service.ts:30-37`); on `@prisma/client@7.8.0` it is not, so the debug branch fires and the ~330 lines of `buildScopeWhere` model cases (`Employee`, `AttendanceEntry`, `Timesheet`, `LeaveRequest`, `Application`, `PayrollCycle`, `Document`, …) never execute. **It is not a safety net.** It also scopes by business unit only — never by `tenantId`.
- Health endpoints registered on the raw Express app (`main.ts:76-78`) skip the global prefix, guards, pipes and the exception filter.
- Two controllers inject `PrismaService` directly: `modules/tenant-settings/field-security.controller.ts`, `modules/tenant-settings/settings-context.controller.ts`.
- `BusinessUnitAccessMiddleware` verifies a JWT with `jsonwebtoken` independently of `JwtAuthGuard` — a second token-decoding path.
- **AGENTS.md drift found at this commit:** `gateway/` and `tools/` do not exist in the tree; `packages/` contains only `config`, `eslint-config`, `typescript-config`, `ui`; modules `attendance-engine`, `attendance-integrations` and `app-releases` do not exist under `src/modules/`. Schema is 10,436 lines / 266 models / 222 enums / 184 migrations, not the figures AGENTS.md quotes.

## Anti-patterns to avoid

- Assuming a global guard exists. If you add a controller without `@UseGuards(JwtAuthGuard, PermissionsGuard)`, it is public.
- Assuming Prisma middleware scopes anything. Every query needs an explicit `tenantId` in the `where`.
- Introducing BullMQ/Redis/`@nestjs/schedule` as if already present — they are not dependencies.
- Registering a body parser globally, or moving `bodyParser: false`; that breaks Stripe signature verification.
- Putting Prisma calls or authorization decisions in a controller.
- Spreading a DTO into `prisma.*.create/update` — the `ValidationPipe` whitelist is not a mass-assignment defence for fields the DTO legitimately declares.
- Declaring yet another local `type PrismaDb` variant with a different union order.

## TARGET (required going forward)

- New modules: `<domain>.module.ts` / `.controller.ts` / `.service.ts` / `dto/` / colocated `*.spec.ts`, registered in `app.module.ts`.
- Every controller: `@UseGuards(JwtAuthGuard, PermissionsGuard)` at class level, and **every handler** carries at least `@Permissions(...)`; add `@RequirePermission(ENTITY_KEYS.X, 'read'|'create'|…)` when the entity exists in `rbac-matrix.ts`.
- Multi-write operations go inside `this.prisma.$transaction(async (tx) => …)`, and every helper called inside must accept `tx` as `PrismaDb`.
- New repositories: `type PrismaDb = PrismaService | Prisma.TransactionClient` and `db: PrismaDb = this.prisma` as the trailing parameter.
- Deferred work: reuse an existing `OnModuleInit` + `setInterval` worker pattern, or state explicitly in the plan that a real queue is being introduced (that is an ADR-level decision, not an implementation detail).
- New env vars: register in `packages/config` validation, `turbo.json` `globalEnv`, `render.yaml` and `docs/environment-variables.md`.

## What the specialist agent MUST verify before changing this

1. Re-read `main.ts` — confirm `bodyParser: false`, the two special-cased paths in `configureBodyParsing`, and the `ValidationPipe` flags before touching request handling.
2. Re-grep `APP_GUARD` before assuming any global guard now exists.
3. Re-read `PermissionsGuard.canActivate` **body** — confirm the empty-decorator early `return true` and the `hasElevatedTenantRole(user)` bypass at `:52-54` are still there.
4. Re-check `(this as any).$use` in `prisma.service.ts:30` and the installed `@prisma/client` version before relying on middleware scoping.
5. Confirm no queue/scheduler dependency was added: `grep -n 'bullmq\|ioredis\|@nestjs/schedule' services/api/package.json`.
6. Re-read `notification-queue.service.ts` before assuming async delivery.
7. Re-count controllers/repositories rather than trusting the numbers above.
8. Run `npm --workspace api run check-types`, `npm --workspace api run test`, and `npm run prisma:validate` for anything touching schema or wiring.
