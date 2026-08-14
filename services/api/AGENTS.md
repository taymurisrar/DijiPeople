# AGENTS.md — `services/api` (NestJS backend)

Scope-specific rules for the DijiPeople API. Read the root
[`AGENTS.md`](../../AGENTS.md) first; this file does not repeat it.

Prisma schema, migrations and seeds have their own rules in
[`prisma/AGENTS.md`](prisma/AGENTS.md).

---

## Shape of the service

NestJS 11 on Express 5. Bootstrapped in `src/main.ts`:

- Global prefix `/api`; `/`, `/api` and `/api/health` return a runtime health
  payload registered directly on the Express instance.
- `bodyParser: false` — body parsing is configured manually so the Stripe
  webhook (`/api/billing/stripe/webhook`) receives a `raw` body and the platform
  email template endpoint gets a 10 MB JSON limit. Everything else is 1 MB.
  **Do not add a global body parser.**
- Global `ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })`.
- Global `HttpExceptionFilter`.
- `cookieParser()` and CORS with credentials (`buildCorsOptions` from
  `src/config/env.validation.ts`).
- Environment is validated at boot by `validateDeploymentEnv` (`@repo/config`),
  `validateApiEnvironment` and `assertAuthEnvironment`. A missing required
  variable fails startup on purpose — keep it that way.
- `LOG_LEVEL` names the lowest severity to show and expands into Nest's explicit
  level list.

`AppModule` registers `RequestIdMiddleware` then `BusinessUnitAccessMiddleware`
for all routes. There are **no global guards** — guards are applied per
controller.

---

## Module conventions

```
src/modules/<domain>/
  <domain>.module.ts
  <domain>.controller.ts        (one or more; split by sub-resource)
  <domain>.service.ts           (business logic)
  <domain>.repository.ts        (Prisma access; optional but preferred)
  <domain>.<concern>.service.ts (focused collaborators)
  dto/
  *.spec.ts                     (colocated)
```

- Register a new module in `src/app.module.ts` `imports`. Keep the list
  alphabetically tidy where it already is.
- Export from the module only what other modules need to inject.
- Cross-module access is by **injecting the owning module's service**, not by
  querying the other domain's tables. `EmployeesService` injecting
  `BenefitsService`, `TenantSettingsResolverService` and `AuditService` is the
  house pattern.
- Shared cross-cutting code goes in `src/common/`:
  `config/`, `constants/`, `decorators/`, `errors/`, `excel/`, `filters/`,
  `guards/`, `interfaces/`, `mailer/`, `middleware/`, `prisma/`,
  `reference-data/`, `request-context/`, `security/`, `storage/`, `utils/`,
  `validation/`.

### Repositories

```ts
type PrismaDb = PrismaService | Prisma.TransactionClient;
```

Repository methods take an optional `db` so callers can compose transactions.
Shared `include`/`select` shapes are declared once at the top of the repository
(`const employeeInclude = { ... }`) and reused. Do not duplicate them into
services.

---

## Controllers

```ts
@Controller('employees')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EmployeesController {
  @Get()
  @Permissions('employees.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: EmployeeQueryDto) {
    return this.employeesService.findByTenant(user, query);
  }
}
```

Rules:

- Guards on the class, permission decorators on the method.
- Always take the actor via `@CurrentUser()` and pass it to the service. The
  service — not the controller — decides scope.
- Use `ParseUUIDPipe` for id params.
- No Prisma, no business branching, no permission arithmetic in a controller.
- `@Public()` marks a genuinely unauthenticated route. There are currently four:
  `billing/controllers/public-billing.controller.ts`,
  `billing/controllers/stripe-webhook.controller.ts`,
  `leads/public-leads.controller.ts`,
  `tenants/public-tenants.controller.ts`.
  Adding a fifth needs an explicit justification, `PublicRateLimitGuard`, strict
  DTO validation, and no tenant enumeration in responses or errors.

---

## Authentication

- Access + refresh JWTs, per client id: `web`, `admin`, `agent-desktop`.
  Secrets, TTLs, cookie names and idle timeouts resolve through
  `common/config/auth.config.ts`. The client id arrives via header
  (`getAuthClientIdFromHeaders`) and must match the token's `appClientId`/`aud`.
- Tokens are read from `Authorization: Bearer` first, then the per-client cookie.
- Sessions are rows: `RefreshToken` (tenant users), `PlatformRefreshToken`
  (platform admins), `AgentRefreshToken` (desktop agent). `JwtAuthGuard`
  re-checks the session on every request — revoked, expired, absolutely-expired
  and idle-timed-out sessions all fail with distinct codes
  (`SESSION_REVOKED`, `SESSION_EXPIRED`).
- Idle timeout for `web` can be overridden per tenant via the
  `security.idleTimeoutMinutes` tenant setting, clamped to 15–1440 minutes.
- `JwtAuthGuard` also enforces `TimesheetAccessRestriction`, which can block or
  read-only a tenant user outside an allow-listed set of route prefixes. If you
  add a route that a restricted user must still reach, add its prefix to
  `alwaysAllowed` in the guard — do not weaken the restriction.
- Refresh tokens are stored hashed. Never log or return a raw token.

---

## Authorization

Three independent layers. All three must be considered on every change.

### 1. Endpoint permission (`PermissionsGuard`)

Two systems evaluated together:

| Decorator | Source of truth | Checked against |
|---|---|---|
| `@Permissions('employees.read')` | `common/constants/permissions.ts` | `user.permissionKeys` |
| `@RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')` | `common/constants/rbac-matrix.ts` | `user.rolePrivileges` |

The guard requires **all** declared legacy keys **and** **at least one** matrix
privilege resolving above `SecurityAccessLevel.NONE`. Declaring only one of the
two is the most common authorization bug in this codebase.

`hasElevatedTenantRole(user)` returns early and **skips the entire check**. The
role keys in `common/security/elevated-tenant-roles.ts` therefore have full
endpoint access. Do not add to that list as a convenience.

### 2. Row-level scope (in the service)

```ts
const where = buildScopedAccessWhere<Prisma.EmployeeWhereInput>(
  currentUser, ENTITY_KEYS.EMPLOYEES, SecurityPrivilege.READ,
  { organizationIdField: null, userIdField: 'userId' },
);
```

`common/security/rbac-query-scope.ts` resolves the highest
`SecurityAccessLevel` the actor holds for that entity/privilege
(`NONE < OWN < TEAM < BUSINESS_UNIT < ORGANIZATION < TENANT`, weights in
`rbac-matrix.ts`) and builds the matching `where`. A read endpoint that returns
records the actor's access level should not reach is a **HIGH** severity defect
even when the endpoint permission is correct.

### 3. Business-unit request context

`BusinessUnitAccessMiddleware` decodes the access token, resolves a BU access
context via `OrganizationAccessService`, sets `req.buAccess` and stores it in
`RequestContextService` (AsyncLocalStorage). `PrismaService` reads that context
in a `$use` middleware to apply BU scoping.

**Important:** on `@prisma/client@7.8.0` the `$use` API is unavailable, so
`PrismaService` logs a debug line and skips registration. Treat the Prisma-level
BU scoping as **not active**. Layer 2 is the one that actually protects rows.

### Adding a permission

1. Add the key to `common/constants/permissions.ts` and/or the entity/privilege
   to `common/constants/rbac-matrix.ts`.
2. Grant it in the role definitions so the intended system roles receive it.
3. Decorate the endpoint with both decorators.
4. Apply row scope in the service.
5. Mirror the key into `apps/web/lib/security-keys.ts` (and the admin
   equivalent) **only if** the UI needs to gate on it — that file is a manual
   copy with no generator, so keep the addition minimal and exact.
6. Extend `rbac-matrix.*.spec.ts` / `wiring-invariants.spec.ts` coverage.

---

## Errors

```ts
throw new AppError('EMPLOYEE_NOT_FOUND', { details: { employeeId } });
```

- Codes live in `common/errors/error-catalog.ts`, each with status, message,
  description, severity, category and retryability. Add a catalog entry rather
  than inventing an inline shape.
- Nest built-ins are acceptable when they carry `{ code, message }`:
  `throw new ForbiddenException({ code: 'ACCESS_DENIED', message: '...' })`.
- `HttpExceptionFilter` normalises everything into the standard contract with a
  `traceId`, and records it through `ErrorLogsService`. It also maps Prisma
  errors — do not catch and re-wrap Prisma errors generically.
- `sanitizeForErrorLog` strips sensitive fields before persistence. Use it if you
  add a new persistence path.

---

## Audit and events

```ts
await this.auditService.log({
  tenantId: user.tenantId,
  actorUserId: user.userId,
  action: 'EMPLOYEE_TERMINATED',
  entityType: 'Employee',
  entityId: employee.id,
  beforeSnapshot,
  afterSnapshot,
  sourceModule: 'employees',
}, tx);
```

- Pass the transaction client as the second argument when inside `$transaction`
  so the audit row commits or rolls back with the change.
- `tenantId: 'platform'` routes to `PlatformAuditLog`.
- `action` is a stable `SCREAMING_SNAKE_CASE` verb phrase; `entityType` is the
  Prisma model name.
- Platform lifecycle events go through `PlatformEventsService`.
- Tenant-facing notifications go through the `notifications` module:
  `notification-events.catalog.ts` → `NotificationOrchestratorService` → queue →
  processor. Domain services must not call the mailer directly; the mailer lives
  in `common/mailer/` and is the notification module's dependency.

---

## Integrations

- `attendance-integrations/` is organised by concern: `connectors/`, `devices/`,
  `gateways/`, `ingestion/`, `mapping/`, `operations/`, `provisioning/`,
  `work-sites/`. New device vendors register in `connectors/connector.registry.ts`
  and implement `connector.types.ts` — do not fork the ingestion pipeline.
- The on-premise gateway (`gateway/`, .NET) authenticates with service
  credentials; its runtime contract lives in `gateways/gateway-runtime.service.ts`.
  Changing that contract is a breaking change for deployed gateways — treat it as
  an integration change requiring an ExecPlan.
- Stripe: `billing/`. The webhook needs the raw body (already configured in
  `main.ts`) and signature verification. Never trust webhook payload contents
  without verification.
- Any third-party secret is stored through `SecretEncryptionService`
  (`common/security/secret-encryption.service.ts`). It refuses to start in
  production without `SECRET_ENCRYPTION_KEY`.

---

## Transactions and concurrency

- Use `prisma.$transaction` whenever two dependent writes must both succeed —
  tenant + first admin creation, payroll run state transitions, approval
  decisions, provisioning.
- Pass the transaction client down through repositories and to `AuditService`.
- Payroll, attendance reconciliation and timesheet locking are concurrency
  sensitive. Re-read and re-check status inside the transaction rather than
  trusting a status read before it.
- Long-running work belongs in the queue/processor pattern already used by
  `notifications/` and `attendance-engine/attendance-reconciliation-queue.service.ts`.

---

## Testing

```bash
npm --workspace api run test         # 126 colocated *.spec.ts
npm --workspace api run test:e2e     # test/*.e2e-spec.ts via test/jest-e2e.json
npm --workspace api run check-types
npm --workspace api run lint
npm --workspace api run format
```

Existing e2e specs at this baseline: `test/app.e2e-spec.ts` and
`test/platform-workflows.e2e-spec.ts`. **List `services/api/test/` rather than
assuming which suites exist** — this set changes with in-flight work, and
instruction files have cited suites that were never committed.

Invariant specs that must stay green when you touch wiring or permissions:
`common/constants/wiring-invariants.spec.ts`,
`common/constants/rbac-matrix*.spec.ts`.

`jest` config lives inline in `services/api/package.json` (`rootDir: src`,
`testRegex: .*\.spec\.ts$`).
