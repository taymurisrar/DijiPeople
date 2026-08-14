# API Contracts (error shape, validation, consumers)

> **Last verified:** 2026-08-14
> **Verified against commit:** 8682dc1
> **Key source files:** services/api/src/common/filters/http-exception.filter.ts, services/api/src/common/errors/error-catalog.ts, services/api/src/common/errors/app-error.ts, services/api/src/common/errors/error-config.ts, services/api/src/common/errors/sanitize-error-log.ts, services/api/src/common/middleware/request-id.middleware.ts, services/api/src/main.ts, apps/web/lib/api-error.ts, apps/web/lib/server-api.ts, apps/admin/lib/api-error.ts, apps/agent-desktop/src/main/api-client.ts, services/api/src/modules/agent/agent.controller.ts
>
> This document describes the repository, it is not authority over it. If the
> code disagrees, the code is current truth — report the discrepancy and
> recommend a context update.

## CURRENT

### The standard error contract

Produced by `HttpExceptionFilter` (`common/filters/http-exception.filter.ts`), a `@Catch()`-all filter registered globally from the DI container in `main.ts:94`. The exact shape is `StandardErrorContract` (`http-exception.filter.ts:21-38`), assembled at `:62-88`:

| field | type | source |
|---|---|---|
| `success` | `false` | literal |
| `traceId` | `string` | `resolveTraceId` (`:301-319`) |
| `timestamp` | `string` | `new Date().toISOString()` |
| `statusCode` | `number` | normalized exception |
| `errorCode` | `ErrorCode` | catalog key |
| `message` | `string` | short title |
| `description` | `string` | user-facing sentence |
| `path` | `string` | `request.originalUrl ?? request.url` |
| `method` | `string` | HTTP verb |
| `details` | `unknown` | `enrichErrorDetails(...)` (`:363-385`) |
| `fieldErrors?` | `Array<{ field: string; message: string }>` | only when `readFieldErrors(details)` is non-empty (`:78-81`) |
| `support` | `{ reference: string; message: string }` | `reference` = `traceId`; `message` from `ERROR_SUPPORT_MESSAGE` |
| `stack?` | `string` | only when `ERROR_VERBOSE_RESPONSE` is on **and** `canExposeStack` passes |

`canExposeStack` (`:321-330`) requires `exposeStackToSystemCustomizer` **and** (`user.accessContext.isSystemCustomizer` or `roleKeys` includes `'system-customizer'`).

`enrichErrorDetails` appends a `platformActor` block (`id`, `email`, `role`, `status`, `source: 'platform-admin'`, `sessionId`, `appClientId`) to `details` **only when `user.platform?.id` is set** (`:369-384`).

Every response also side-effects: it logs a JSON `logContext` (`error` at ≥500, else `warn`) and `await`s `errorLogsService.persist(...)` **before** sending the response (`:101-130`).

### Normalization ladder (`normalizeException`, `:133-203`)

1. `AppError` → fields taken verbatim.
2. `HttpException` → status from `getStatus()`; `code`/`errorCode` from the response payload run through `mapLegacyCode` (`:254-274`), which maps legacy strings (`AUTH_REQUIRED`→`AUTH_TOKEN_MISSING`, `INVALID_TOKEN`→`AUTH_TOKEN_INVALID`, `ACCESS_TOKEN_EXPIRED`→`SESSION_EXPIRED`, `VALIDATION_ERROR`/`BAD_REQUEST`→`VALIDATION_FAILED`, `FORBIDDEN`→`ACCESS_DENIED`, `UNAUTHORIZED`→`AUTH_UNAUTHORIZED`, `NOT_FOUND`→`DATABASE_RECORD_NOT_FOUND`) then falls back by status (401/403/404/409/400/422/429 → codes; else `SYSTEM_UNEXPECTED_ERROR`).
3. Prisma errors via `mapPrismaError` (`:205-252`): `P2002`→`DATABASE_DUPLICATE_RECORD`, `P2025`→`DATABASE_RECORD_NOT_FOUND`, `P2003`→`DATABASE_CONSTRAINT_FAILED`, other known → `PRISMA_KNOWN_REQUEST_ERROR`; validation → `PRISMA_VALIDATION_ERROR`; init → `PRISMA_CONNECTION_ERROR`; `P1001/P1002/P1017/ECONNREFUSED` and recovery-mode messages → `DATABASE_CONNECTION_FAILED` (`isDatabaseUnavailableError`, `:455-473`).
4. Anything else → `NETWORK_ERROR` if the message matches `/timeout|timed out|econnrefused|enotfound|network|connection/i`, else `SYSTEM_UNEXPECTED_ERROR`.

### Error catalog (`common/errors/error-catalog.ts`)

`ERROR_CATALOG` (`:34`) is `as const satisfies Record<string, ErrorCatalogEntry>` with **76 entries**; `export type ErrorCode = keyof typeof ERROR_CATALOG` (`:603`). Each entry is built by the private `entry()` helper (`:611-629`):

```ts
{ statusCode, message, description, severity, category, userAction?, retryable }
```

- `ErrorSeverity` (`:1`): `'info' | 'warning' | 'error' | 'critical'`.
- `ErrorCategory` (`:3-22`), 20 values: `auth`, `session`, `access`, `rbac`, `tenant`, `organization`, `business-unit`, `user`, `employee`, `validation`, `database`, `file`, `notification`, `integration`, `agent`, `payroll`, `settings`, `network`, `system`.
- `getErrorCatalogEntry(code)` (`:605-609`) never throws — unknown codes fall back to `SYSTEM_UNEXPECTED_ERROR`.

### `AppError` (`common/errors/app-error.ts:8-41`)

Extends `Error`. Constructor takes `(errorCode, options?)`; every field defaults from the catalog entry: `statusCode`, `description`, `severity` (`isOperational` defaults `true`). Also exported: `isErrorCode(value)` (`:43`, a `value in ERROR_CATALOG` check) and `createAppError(code, options)` (`:47`, coerces unknown codes to `SYSTEM_UNEXPECTED_ERROR`).

### Request contracts: DTOs + global ValidationPipe

`main.ts:87-93`:

```ts
new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })
```

- `whitelist` — properties without a `class-validator` decorator are stripped.
- `forbidNonWhitelisted` — but instead of stripping, an undecorated property **throws**. Nest emits `property <name> should not exist`, a 400 `BadRequestException` with a `message` array. **An unknown request field is therefore a 400, not a silently ignored field.** DTO and every frontend payload must change in the same commit.
- `transform` — the raw body is instantiated into the DTO class and `@Type`/implicit conversions run, so `@IsNumber()`/`@IsDate()` see converted values.

The filter turns that array into `details.fields` via `extractValidationDetails` (`:276-299`), matching `^property (\w+) should not exist$` first, then a generic `^(field) (rest)$`, defaulting `field` to `'request'`.

220 `*.dto.ts` files exist under `src/modules/`; 11 use `PartialType` from `@nestjs/mapped-types`.

### Trace headers (`common/middleware/request-id.middleware.ts`)

Applied to `{ path: '*path', method: RequestMethod.ALL }` in `app.module.ts:142-144`.

- `REQUEST_ID_HEADER = 'x-request-id'` (`:6`).
- Incoming header read is `ERROR_TRACE_HEADER` (lowercased, default `'x-trace-id'`), falling back to `x-request-id` (`:22`).
- Value is trimmed and truncated to 128 chars; otherwise generated as `` `req_${randomUUID()}` `` (`:23-26`).
- Sets **both** `X-Request-Id` and `X-Trace-Id` on the response, and `req.requestId`.

`HttpExceptionFilter.resolveTraceId` (`:301-319`) repeats this precedence — incoming header → `request.requestId` → existing `X-Request-Id` response header → new `req_<uuid>` — and re-sets both headers. So trace ids propagate on success *and* failure.

`ErrorLogsService` derives `sourceApp` from the trace id prefix: `client_`→`web`, `admin_`→`admin`, else `api` (`modules/error-logs/error-logs.service.ts:405-409`). Client-generated ids therefore carry meaning.

### Error framework config (`common/errors/error-config.ts:16-46`)

`ERROR_LOG_ENABLED` (true), `ERROR_LOG_STORAGE` (`database`|`file`|`console`|`none`, default `database`), `ERROR_LOG_RETENTION_DAYS` (90), `ERROR_LOG_INCLUDE_STACK` (true), `ERROR_LOG_INCLUDE_REQUEST_BODY` (**false**), `ERROR_LOG_EXPOSE_STACK_TO_SYSTEM_CUSTOMIZER` (true), `ERROR_LOG_DOWNLOAD_ROLE` (`System Customizer`), `ERROR_TRACE_HEADER` (`x-trace-id`), `ERROR_SUPPORT_MESSAGE`, `ERROR_VERBOSE_RESPONSE` (false).

### Who consumes these responses

1. **`apps/web`** — `apps/web/lib/api-error.ts:1-16` re-declares `StandardApiError` with `success`, `traceId`, `statusCode`, `errorCode`, `message`, `description`, `fieldErrors`, `support`. It carries a client-side `DEFAULTS` table keyed by `errorCode` (`:24-78`) and synthesises `errorCode: "NETWORK_ERROR"` with a `createClientTraceId()` on transport failure (`:121-125`). `apps/web/lib/server-api.ts` owns cookie auth (`ACCESS_TOKEN_COOKIE`/`REFRESH_TOKEN_COOKIE`/`SESSION_COOKIE`), the `AUTH_APP_CLIENT_ID` header, a 30s timeout and refresh-on-401.
2. **`apps/admin`** — `apps/admin/lib/api-error.ts` reads `errorCode`/`traceId` from the body *or* a nested object (`:75-90`) and falls back to `` `client_${Date.now()}` `` (`:108`).
3. **`apps/agent-desktop`** — Electron; `apps/agent-desktop/src/main/api-client.ts` against its own auth client id `agent-desktop` (`common/config/auth.config.ts:7`). It talks to `@Controller('agent')` (`modules/agent/agent.controller.ts:43`): `auth/login|refresh|logout`, `me`, `me/productivity`, `employees/:employeeId/summary`, `employees/:employeeId/location-requests`, `location-requests/pending`, `location-requests/:requestId/result`, `config`, `devices/register`, `devices/permissions`, `sessions/start|heartbeat|end`, `settings`.
4. **The .NET on-premise gateway** is described in AGENTS.md but `gateway/` **does not exist in the tree at this commit** — treat it as an out-of-repo consumer whose contract you cannot verify locally.

Because four independent clients decode these bodies, **response shapes, `errorCode` values, permission keys and enum values are breaking changes**. Removing or renaming a catalog entry breaks the `DEFAULTS` lookups in both frontends.

### `@Public()` routes

24 `@Public()` decorations across 10 controllers: `agent`, `auth/admin-auth`, `auth/auth`, `billing/public-billing`, `billing/stripe-webhook`, `leads/public-leads`, `tenant-settings/tenant-branding`, `tenant-settings/tenant-settings`, `tenants/public-tenants`, `tenants/tenants`. (AGENTS.md's "there are currently four" is stale.)

## Key abstractions

- `StandardErrorContract` — the only error body the API is allowed to emit.
- `ERROR_CATALOG` / `ErrorCode` / `getErrorCatalogEntry` — single source of truth for status, copy, severity, category, retryability.
- `AppError` / `createAppError` — the throw-site type.
- `sanitizeForErrorLog` (`common/errors/sanitize-error-log.ts:19-34`) — recursive redaction, depth cap 8, `Date`→ISO. Redacts keys containing `password`, `token`, `secret`, `cookie`, `authorization`, `apikey`, `api_key`, `pass`, `connectionstring`, `database_url`, `jwt`, `otp`, plus exact `auth` — with explicit allowlist exceptions for `authenabled`/`smtp_auth_enabled`/`smtpauthenabled` (`:41-49`).
- `RequestIdMiddleware` / `REQUEST_ID_HEADER`.

## Known exceptions

- Health routes (`/`, `/api`, `/api/health`) are raw Express handlers (`main.ts:76-78`) and never produce the standard contract.
- The `error-config` `storage` values `'file'` and `'console'` are accepted by `readStorage` but `ErrorLogsService.persist` returns early unless `storage === 'database'` (`error-logs.service.ts:69`) — non-database storage silently discards.
- `apps/web` and `apps/admin` each maintain their **own** copy of the contract type and an `errorCode`→copy table. They are duplicated sources of truth that drift from `error-catalog.ts`.
- `mapLegacyCode` exists because services still throw bare Nest exceptions with `{ code, message }` rather than `AppError`.
- `enrichErrorDetails` puts platform-actor identity (`email`, `role`, `sessionId`) into the response `details` for platform users — acceptable only because it is gated on `user.platform?.id`.

## Anti-patterns to avoid

- Returning a bespoke `{ error: ... }` / `{ ok: false }` shape from a controller.
- `throw new HttpException('...')` with an ad-hoc `code` string not in the catalog — it degrades to a status-based fallback.
- Adding a request field on the frontend without adding the `class-validator` property to the DTO — `forbidNonWhitelisted` makes it a hard 400.
- Renaming/removing an `ErrorCode`, or changing an entry's `statusCode`, without checking `apps/web/lib/api-error.ts` and `apps/admin/lib/api-error.ts`.
- Re-implementing auth/tenant decisions in `apps/*/app/api/` route handlers — they are proxies; the API is the authority.
- Logging raw request bodies or headers without `sanitizeForErrorLog`.
- Setting `ERROR_VERBOSE_RESPONSE=true` in production.

## TARGET (required going forward)

- Throw `AppError` (or `createAppError`) with an existing `ErrorCode`. If none fits, **add a catalog entry** with the correct `category`, `severity`, `retryable` and `userAction` — do not invent an inline shape.
- Every request body gets a DTO with `class-validator` rules: bounded strings, enum validation, numeric ranges, date sanity. Never accept `tenantId`.
- Any change to a response shape, `errorCode`, permission key or enum value is a contract change: enumerate the consumers touched (`apps/web`, `apps/admin`, `apps/agent-desktop`, the external .NET gateway) in the plan.
- Field-level errors go into `details.fieldErrors` as `{ field, message }` so `readFieldErrors` surfaces them as top-level `fieldErrors`.
- Propagate the trace id: clients should send `x-trace-id` (or `x-request-id`); server code correlating work should read `request.requestId`.
- New `@Public()` routes need `PublicRateLimitGuard`, strict DTO validation, and no tenant enumeration in errors.

## What the specialist agent MUST verify before changing this

1. Re-read `StandardErrorContract` (`http-exception.filter.ts:21-38`) and the assembly block at `:62-88` — do not trust the table above for field presence/optionality.
2. Re-count `ERROR_CATALOG` entries and re-read `entry()` (`:611`) before claiming defaults.
3. Read `canExposeStack` and `enrichErrorDetails` **bodies** before asserting what leaks to whom.
4. Re-confirm the `ValidationPipe` flags in `main.ts` — the 400-on-unknown-field behaviour depends entirely on `forbidNonWhitelisted`.
5. Grep both `apps/web/lib/api-error.ts` and `apps/admin/lib/api-error.ts` for any `errorCode` you touch.
6. Check whether `gateway/` has reappeared before assuming the .NET consumer is or is not in-tree.
7. Re-read `sanitizeForErrorLog`'s key list before adding a field to an error payload.
8. Run `npm --workspace api run test` and `npm --workspace api run check-types`; add/extend a `*.spec.ts` for new catalog entries or normalization branches.
