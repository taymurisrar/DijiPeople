# Backend Architecture

`services/api` — NestJS 11 on Express 5, TypeScript, Prisma 7 against
PostgreSQL. A **modular monolith**: one deployable, 68 feature modules.

---

## Bootstrap

`src/main.ts`, in order:

1. `validateDeploymentEnv(process.env, { app: 'api' })` from `@repo/config`
2. `validateApiEnvironment(process.env)` from `src/config/env.validation.ts`
3. `NestFactory.create(AppModule, { bodyParser: false, logger: resolveLogLevels() })`
4. `assertAuthEnvironment(configService)` — refuses production/staging with
   development auth secrets
5. `enableShutdownHooks()`, `setGlobalPrefix('api')`
6. Health routes registered directly on the Express instance: `/`, `/api`,
   `/api/health`
7. `cookieParser()`
8. `configureBodyParsing()` — **manual, deliberate** (see below)
9. `enableCors(buildCorsOptions(process.env))` — credentials enabled
10. Global `ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })`
11. Global `HttpExceptionFilter`
12. Listen on `PORT` (default 4000), host `0.0.0.0`

### Body parsing

`bodyParser: false` is set on purpose:

- `/api/billing/stripe/webhook` receives a **raw** body (2 MB) — Stripe
  signature verification requires the unparsed bytes.
- `/api/super-admin/platform-email/templates` gets a 10 MB JSON limit.
- Everything else: JSON and urlencoded at 1 MB.

**Do not add a global body parser or reorder this.** It breaks webhook
verification silently.

### Logging levels

`LOG_LEVEL` names the *lowest* severity to show and expands to Nest's explicit
list. Unset or unrecognised falls back to `['error','warn']` in production,
`['error','warn','log']` otherwise. Nest's default logs every mapped route at
boot, which is why this exists.

---

## Request lifecycle

```
Express
  → RequestIdMiddleware              trace id in, X-Request-Id / X-Trace-Id out
  → BusinessUnitAccessMiddleware     decodes token, resolves BU context,
                                     runs the rest inside AsyncLocalStorage
  → JwtAuthGuard                     token + session + access context
  → PermissionsGuard                 legacy keys AND rbac matrix
  → ValidationPipe                   DTO validation and transformation
  → Controller                       thin
  → Service                          business rules, tenant scope, row scope
  → Repository                       Prisma
  ← HttpExceptionFilter              on any throw: standard contract + ErrorLog
```

There are **no global guards**. `JwtAuthGuard` and `PermissionsGuard` are
applied per controller via `@UseGuards(...)` — 97 of 101 controllers carry them.

---

## Module structure

```
src/
  main.ts
  app.module.ts          registers all 68 feature modules + middleware
  app.controller.ts
  config/                env.validation.ts (CORS, health payload)
  common/                cross-cutting (below)
  modules/<domain>/
      <domain>.module.ts
      <domain>.controller.ts
      <domain>.service.ts
      <domain>.repository.ts
      <domain>.<concern>.service.ts
      dto/
      *.spec.ts
```

Larger domains subdivide by concern rather than growing one file —
`attendance-integrations/` splits into `connectors/`, `devices/`, `gateways/`,
`ingestion/`, `mapping/`, `operations/`, `provisioning/`, `work-sites/`;
`attendance-engine/` splits into policy resolution, session building, punch
interpretation, geofencing, reconciliation and backfill services.

### `src/common/`

| Directory | Contents |
|---|---|
| `config/` | `auth.config.ts` — clients, secrets, TTLs, cookie names |
| `constants/` | `permissions.ts`, `rbac-matrix.ts`, `tenant-modules.ts` + specs |
| `decorators/` | `@CurrentUser`, `@Permissions`, `@RequirePermission`, `@Public`, `@RequireRoles` |
| `errors/` | `AppError`, `error-catalog.ts`, `error-config.ts`, `sanitize-error-log.ts` |
| `filters/` | `HttpExceptionFilter` |
| `guards/` | `JwtAuthGuard`, `PermissionsGuard`, `RolesGuard`, `PublicRateLimitGuard` |
| `interfaces/` | `AuthenticatedRequest`, `AuthenticatedUser`, `AuthTokenPayload` |
| `middleware/` | `RequestIdMiddleware`, `BusinessUnitAccessMiddleware` |
| `prisma/` | `PrismaService` (+ the inert `$use` BU-scope middleware) |
| `request-context/` | `RequestContextService` (AsyncLocalStorage) |
| `security/` | `rbac-query-scope.ts`, `elevated-tenant-roles.ts`, `role-matching.ts`, `employee-account-actions.ts`, `reference-data-access.ts`, `secret-encryption.service.ts` |
| `validation/` | `duplicate-rule-engine.ts` |
| `excel/`, `storage/`, `mailer/`, `utils/`, `reference-data/` | supporting services |

---

## Layering

### Controller

Route decorators, guards, permission decorators, `@CurrentUser()`,
`ParseUUIDPipe` on ids, then delegate. **No Prisma, no business branching, no
permission arithmetic.**

### Service

Business rules, orchestration, transactions, tenant scoping, row-level scoping,
audit calls. Cross-module needs are met by **injecting the owning module's
service** — `EmployeesService` injects `BenefitsService`,
`TenantSettingsResolverService`, `PermissionsService`, `AuditService` and
others. Do not query another domain's tables directly.

### Repository

Prisma access. Shared `include`/`select` shapes declared once at the top and
reused:

```ts
type PrismaDb = PrismaService | Prisma.TransactionClient;

const employeeInclude = { manager: { select: { ... } }, user: { include: { ... } } } ;
```

Every method takes an optional `db` so callers can compose transactions.

Not every module has a repository — smaller modules put Prisma in the service.
Follow the neighbouring module rather than imposing a layer.

---

## Validation

`class-validator` + `class-transformer` DTOs under `dto/`. The global pipe runs
with `forbidNonWhitelisted: true`, so **any request field without a matching DTO
property is a 400**. Frontend payloads and DTOs must change together.

`common/validation/duplicate-rule-engine.ts` provides configurable duplicate
detection used by employee creation and similar flows.

---

## Errors

```ts
throw new AppError('EMPLOYEE_NOT_FOUND', { details: { employeeId } });
```

`ERROR_CATALOG` entries carry `statusCode`, `message`, `description`,
`severity` (`info`/`warning`/`error`/`critical`), `category` (`auth`, `session`,
`access`, `rbac`, `tenant`, `organization`, `business-unit`, `user`, `employee`,
`validation`, `database`, `file`, `notification`, `integration`, `agent`,
`payroll`, `settings`, `network`, `system`) and `retryable`.

Nest built-ins carrying `{ code, message }` are also accepted
(`throw new ForbiddenException({ code: 'ACCESS_DENIED', message: '...' })`).

Add a catalog entry rather than inventing an inline error shape.

---

## Transactions

`prisma.$transaction` whenever two dependent writes must both succeed — tenant +
first admin creation, payroll run state transitions, approval decisions,
provisioning, bulk imports.

Pass the transaction client down through repositories **and** to
`AuditService.log()`.

For concurrency-sensitive flows (payroll runs, timesheet locking, attendance
reconciliation), re-read and re-check state **inside** the transaction rather
than trusting a value read before it.

Long-running work goes to the queue/processor pattern already used by
`notifications/` and
`attendance-engine/attendance-reconciliation-queue.service.ts`.

> **Note:** the AGENTS.md ancestor of this document mentioned Redis + BullMQ as a
> future choice. No Redis or BullMQ dependency is present in
> `services/api/package.json`. The existing queues are in-process. Verify before
> assuming a broker exists.

---

## Notable modules

| Module | Role |
|---|---|
| `data/` | Generic entity data API — entity registry, query parser/validator, Prisma mapper, scope and permission resolvers |
| `platform-runtime/` | Server adapter and authorization boundary for the platform admin metadata runtime |
| `settings-runtime/` + `tenant-settings/` | Tenant configuration plane, resolution and field security |
| `customization/` | Tenant customization layers, packages, dependency validation |
| `views/` | Module and dashboard view definitions, including system views |
| `workflows/` + `approvals/` | Governed workflows and approval matrices |
| `attendance-engine/` | Punch interpretation, sessions, geofencing, impossible travel, reconciliation |
| `attendance-integrations/` | Devices, connectors, on-prem gateway, ingestion, provisioning |
| `super-admin/` | Platform operations: plans, subscriptions, invoices, payments, tenant provisioning, lifecycle |

---

## Dependencies of note

`@nestjs/*` 11, `@prisma/client` + `@prisma/adapter-pg` 7.8, `class-validator`,
`class-transformer`, `bcryptjs`, `passport` + `passport-jwt`, `cookie-parser`,
`nodemailer`, `stripe`, `exceljs` / `xlsx` (spreadsheets), `pdfkit` /
`pdf-parse` (PDF), `docx` / `mammoth` (Word), `sanitize-html`, `htmlparser2`.

---

## Testing

- **126** colocated `*.spec.ts`, run by `npm --workspace api run test`. Jest
  config is inline in `package.json` (`rootDir: src`, `testRegex: .*\.spec\.ts$`).
- **10** e2e specs in `test/`, run by `npm --workspace api run test:e2e` with
  `test/jest-e2e.json`.
- Invariant specs that must stay green when wiring or permissions change:
  `common/constants/wiring-invariants.spec.ts`,
  `common/constants/rbac-matrix*.spec.ts`,
  `test/permission-propagation.e2e-spec.ts`.
