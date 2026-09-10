# OBS — Logging, Observability, Auditability, Privacy / Data Protection

Auditor area: observability, audit trail, privacy. Finding prefix `OBS`.
Worktree: `D:/My Work/hrm-dijipeople/dijipeople-audit` @ `f55cf4b2` (branch `agent/full-technical-audit`).
Everything below was read at that commit. No file in the product tree was modified.

## Executive summary

Three questions were asked. The short answers:

- **Can we see what is happening?** No. There is no error tracking, no alerting, no
  metrics, and no access log. The API's own health endpoint returns `status: 'ok'`
  unconditionally. If the API began returning 500s at 03:00, the first signal would be
  a customer email; the second would be a row in a database table that only a platform
  admin who opens a specific screen would ever read.
- **Can we reconstruct who changed sensitive HR data?** Partly, and unevenly. Salary,
  bank details, payroll finalisation, payslip issue, attendance edits and leave
  approval are audited properly, with before/after snapshots and central redaction —
  genuinely good work. But **employee termination writes no audit row at all**,
  **document views and downloads are recorded nowhere**, the entire `contracts` module
  (31 mutating endpoints) has no audit trail, and **no audit row anywhere carries an IP
  address, a user agent, a session id or a request id** — the two indexed correlation
  columns are dead.
- **Are we leaking personal data?** In logs, mostly no — the two redactors are
  competent, though they disagree with each other. At rest, yes: every employee bank
  account number, IBAN, routing code, CNIC and tax identifier is stored as plain text
  while a working AES-256-GCM service sits in the same codebase encrypting SMTP
  passwords. And the tenant-configurable field-masking feature is enforced only in the
  browser.

**Counts:** 3 CRITICAL · 8 HIGH · 13 MEDIUM · 5 LOW · 2 INFORMATIONAL.

---

## Part 1 — Logging and observability

### OBS-01 — Nothing alerts anyone when anything fails; the platform has no error tracking, no on-call path and no log shipping

- **Category:** Observability / Operations
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** KNOWN (ITEM-0009 — "No observability platform exists, so a release cannot be verified from outside", `Status: READY`, `ArchitectDisposition: PLAN_REQUIRED`)
- **Component:** whole platform
- **Evidence:**
  Repository-wide search for every mainstream telemetry dependency returns nothing but
  false positives (`pinOffset`, `previousEntry`, `seriesEntry`) plus the two records
  that already document the gap:
  ```
  rg -n "sentry|@sentry|datadog|opentelemetry|newrelic|pino|winston|prom-client|statsd" -i --glob '!node_modules'
  → docs/knowledge/architecture/deployment-architecture.md:54
    "Verified at this commit — no Sentry, Datadog, OpenTelemetry, Prometheus or
     log-shipping dependency exists anywhere in this repository."
  → docs/development/agent-tooling-matrix.md:26
    "| `MONITORING` | **UNAVAILABLE** | no Sentry / Datadog / OpenTelemetry / Prometheus anywhere |"
  ```
  `render.yaml` declares 40+ environment variables and **no log drain, no alert policy
  and no notification target for service health** — the only ops address in the file is
  `PLATFORM_OPS_NOTIFICATION_EMAILS` (line ~189), which is for commercial lifecycle
  events, not for errors (and see OBS-02).
  `services/api/src/main.ts` registers no logging transport: the only logger
  configuration is `logger: resolveLogLevels()` (main.ts:33), i.e. Nest's console
  logger to stdout.
- **Current behaviour:** Every log line goes to stdout and is captured only by Render's
  console. Nothing aggregates it, nothing searches it beyond Render's own retention
  window, nothing evaluates a threshold, nothing pages anybody. Application errors are
  written to a Postgres table (`ErrorLog`) that is read only when a human opens
  Platform Admin → monitoring.
- **Expected behaviour:** 500s, unhandled rejections, failed background jobs and deploy
  failures should reach a person without that person going looking.
- **Risk:** *Concretely, what happens today if the API starts erroring at 03:00:* the
  process keeps serving, `GET /api` keeps returning `{"status":"ok"}` (OBS-05), Render
  does not restart or roll back because its health check passes, `ErrorLog` rows
  accumulate with `supportStatus: 'NEW'`, and nobody is told. The outage is discovered
  when a customer reports it during business hours. For a payroll platform, an
  undetected overnight failure can mean a missed pay run.
- **Remediation:** ITEM-0009 already sets the order: (1) make `/api/health` touch the
  database with a bounded timeout, (2) add one error-aggregation dependency behind an
  ADR. Add a Render log drain and one alert on 5xx rate as the cheapest interim step.
- **Difficulty:** MEDIUM · **Regression risk:** LOW · **Fix now:** YES

---

### OBS-02 — Platform-ops alerts for failed payments and failed provisioning are written to a log line, never sent — and that log line is suppressed at the production log level

- **Category:** Observability / Alerting
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** NEW (no record found; grepped `docs/bugs/`, `docs/backlog/`, `docs/knowledge/` for `lifecycle.notification`, `LifecycleNotificationHandler`, "Recorded rather than sent" — no hits)
- **Component:** `services/api/src/modules/notifications/lifecycle-notification.handler.ts`
- **Evidence:**
  `services/api/src/modules/notifications/lifecycle-notification.handler.ts:76-95` —
  the handler resolves recipients and then does not use them:
  ```ts
  // Recorded rather than sent. Wiring this into the notification orchestrator
  // is a separate step with its own template and delivery concerns; ...
  this.logger.log(
    JSON.stringify({
      event: 'lifecycle.notification.resolved',
      code: definition.code,
      ...
      recipientCount: recipients.length,
  ...
  return { status: 'PROCESSED', ... };
  ```
  The events this covers include the two most urgent commercial states —
  `services/api/src/modules/notifications/platform-lifecycle-notifications.catalog.ts:60-85`:
  ```ts
  eventType: DomainEventType.PAYMENT_FAILED, code: 'OPS_PAYMENT_FAILED', severity: 'WARNING',
  rationale: 'A failed payment is recoverable for a few days and then is not. Nobody discovers it by reading the database.',
  ...
  eventType: DomainEventType.TENANT_PROVISIONING_FAILED, code: 'OPS_PROVISIONING_FAILED', severity: 'CRITICAL',
  rationale: 'Somebody has paid and cannot use the product. This is the highest-severity operational state the platform has.',
  ```
  It also covers the only tenant-facing provisioning message —
  `TENANT_WORKSPACE_READY` (catalog:86-94) — and the customer-facing
  `CUSTOMER_SEAT_OVERAGE` / `CUSTOMER_PLAN_CHANGED` (catalog:95-112). None are sent.
  The handler returns `'PROCESSED'`, so the outbox marks the event delivered and it
  disappears from the backlog — the one place an operator might otherwise have seen it.
  **Second failure, compounding:** the line it does write is `logger.log`, i.e. Nest's
  `log` level. `services/api/src/log-level.ts:73-77` returns
  `env.NODE_ENV === 'production' ? ['error', 'warn'] : [...]`, and `render.yaml`
  declares no `LOG_LEVEL`. So in production the notification is neither sent nor logged.
- **Current behaviour:** A payment fails, or provisioning breaks for a paying customer,
  and the system marks the event successfully processed with no output whatsoever.
- **Expected behaviour:** These events reach `PLATFORM_OPS_NOTIFICATION_EMAILS` through
  the notification orchestrator, or the handler returns `MANUAL_ACTION_REQUIRED` so the
  event stays visible in the outbox — which is exactly what the same file's header
  comment (lines 17-27) says the design intends when no recipient is configured.
- **Risk:** A customer pays, provisioning fails, nobody at DijiPeople learns of it. The
  recovery window for a failed card payment ("recoverable for a few days and then is
  not", per the catalogue's own rationale) passes unnoticed. This is revenue loss and a
  customer-facing outage with zero detection.
- **Remediation:** In `LifecycleNotificationHandler.handle`, dispatch through
  `NotificationOrchestratorService` / `PlatformCommunicationsService` instead of
  logging; until that lands, return `MANUAL_ACTION_REQUIRED` for `PLATFORM_OPS`
  severities `WARNING`/`CRITICAL` so the outbox retains them, and raise the log call to
  `logger.warn` so it survives the production level filter.
- **Difficulty:** MEDIUM · **Regression risk:** LOW · **Fix now:** YES

---

### OBS-03 — Production log level silently discards all 44 `logger.log` call sites, including the outbox drain counters

- **Category:** Observability
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW (the *alias* half of this — `LOG_LEVEL=info` falling through — is already
  fixed and documented in `services/api/src/log-level.ts:29-46`; the production default
  itself is not recorded anywhere)
- **Component:** `services/api/src/log-level.ts`, `render.yaml`
- **Evidence:**
  `services/api/src/log-level.ts:73-77`:
  ```ts
  return env.NODE_ENV === 'production'
    ? ['error', 'warn']
    : ['error', 'warn', 'log'];
  ```
  `render.yaml` sets `NODE_ENV: production` and `APP_ENV: production` and declares no
  `LOG_LEVEL` key at all (`rg "LOG_LEVEL" render.yaml` → no match).
  Level census across `services/api/src` excluding specs:
  `logger.log` **44**, `logger.warn` 86, `logger.error` 43, `logger.debug` 7,
  `logger.verbose` 0.
  Among the discarded 44: `modules/outbox/outbox-worker.service.ts:112-114`
  ```ts
  this.logger.log(
    `Outbox drain: claimed=${result.claimed} processed=${result.processed} retried=${result.retried} failed=${result.failed} manual=${result.manualActionRequired}`,
  );
  ```
  and `outbox-worker.service.ts:46-48`, the line that says the worker is disabled.
- **Current behaviour:** Queue throughput, drain counts, worker start/stop, lifecycle
  notification resolution and the console e-mail provider's record of what it swallowed
  are all invisible in production.
- **Expected behaviour:** Either the production default includes `log`, or the handful
  of operationally meaningful `logger.log` calls are promoted to `warn`. The file's own
  history (lines 29-46) records that this exact class of silence is why a workspace
  that could not send e-mail went unnoticed.
- **Risk:** The one observable signal about queue depth (OBS-06) is thrown away.
- **Remediation:** Set `LOG_LEVEL: log` in `render.yaml` (and apply the file — see the
  BUG-0767 warning at the top of it), or promote `outbox-worker.service.ts:112` and
  `lifecycle-notification.handler.ts:80` to `warn`.
- **Difficulty:** LOW · **Regression risk:** LOW · **Fix now:** YES

---

### OBS-04 — No access log, and `traceId` never reaches an application log line: a request that succeeded leaves no trace at all

- **Category:** Observability / Correlation
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/common/middleware/request-id.middleware.ts`, `services/api/src/app.module.ts`
- **Evidence:**
  A trace id **is** minted and returned on every response —
  `common/middleware/request-id.middleware.ts:22-30`:
  ```ts
  const incoming = req.header(traceHeader) ?? req.header(REQUEST_ID_HEADER);
  const requestId = incoming && incoming.trim().length > 0 ? incoming.trim().slice(0, 128) : `req_${randomUUID()}`;
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Trace-Id', requestId);
  ```
  applied globally at `app.module.ts:170-172` (`.forRoutes({ path: '*path', method: RequestMethod.ALL })`).
  But `rg "requestId"` across `services/api/src` excluding specs shows it is consumed
  in exactly **one** place outside the middleware itself —
  `modules/partner-experience/partner-experience.controller.ts:40` — and by the
  exception filter. Every other hit is an unrelated route parameter (`timesheets`,
  `agent`). No `Logger` call anywhere interpolates it.
  There is **no HTTP logging interceptor**: `rg -ln "NestInterceptor" services/api/src`
  returns nothing at all, and `rg -n "morgan|accessLog"` returns nothing.
- **Current behaviour:** The only log line that carries the trace id is
  `common/filters/http-exception.filter.ts:118-122`, which runs only when a request
  throws. A successful request produces zero log output. A `logger.warn` emitted deep
  inside a service cannot be tied to the request that caused it.
- **Expected behaviour:** Take a user complaint ("it broke at 14:32, reference
  `req_8f3…`") and find the request. Today you can do this **only if the request
  errored**, and only by querying the `ErrorLog` table — `GET /api/error-logs/:traceId`
  or Platform Admin monitoring. For a slow request, a wrong-result request, or a
  suspicious successful request, there is nothing to find.
- **Risk:** Support cannot reconstruct incidents. Security cannot reconstruct an
  attacker's session — every read of employee data that *succeeded* is invisible.
- **Remediation:** Add a Nest interceptor emitting one structured line per request
  (`traceId`, method, path, status, duration, `userId`, `tenantId`) at `log` level, and
  set `LOG_LEVEL` accordingly (OBS-03). Thread `req.requestId` into
  `RequestContextService` so services and `AuditService` can read it (see OBS-19).
- **Difficulty:** MEDIUM · **Regression risk:** LOW · **Fix now:** YES

---

### OBS-05 — `/api/health` reports `status: 'ok'` unconditionally and never touches the database; Render's health check is therefore green during a database outage

- **Category:** Observability / Deployment
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** KNOWN (ITEM-0009, which states this verbatim: *"Render's `healthCheckPath: /api` **can report healthy while the database is unreachable**"*)
- **Component:** `services/api/src/config/env.validation.ts`, `services/api/src/main.ts`, `render.yaml`
- **Evidence:**
  `services/api/src/config/env.validation.ts:227-242`:
  ```ts
  export function getRuntimeHealthPayload(env: NodeJS.ProcessEnv) {
    const commit = resolveDeployedCommit(env);
    return { app: 'dijipeople-api', status: 'ok', environment: ..., commit, ... };
  ```
  There is no database call in the function and no caller adds one:
  `main.ts:82-86` mounts three express handlers ahead of Nest's router that return
  `{ ...getRuntimeHealthPayload(process.env), outboxWorker: { enabled: ... } }` for
  `/`, `/api` and `/api/health`.
  `render.yaml`: `healthCheckPath: /api`.
- **Current behaviour:** The endpoint proves the Node process is alive and reports the
  deployed commit (which ITEM-0010 added, and which is real value). It proves nothing
  about the database, the outbox backlog, or whether any request can succeed.
- **Expected behaviour:** A bounded `SELECT 1` with a short timeout, failing the check
  on error, with the timeout chosen so a health probe cannot deepen an outage.
- **Risk:** Render will not restart or refuse to promote a deploy that cannot reach the
  database. Combined with OBS-01, a database outage is invisible to every automated
  signal the platform has.
- **Remediation:** Extend the `/api/health` handler in `main.ts` with a `prisma.$queryRaw`
  probe behind `Promise.race` with a ~2s timeout; return `status: 'degraded'` and a
  non-200 on failure. ITEM-0009 step 1.
- **Difficulty:** LOW · **Regression risk:** MEDIUM (a badly-tuned probe can flap the
  service) · **Fix now:** YES

---

### OBS-06 — No metrics of any kind exist; Prisma query logging is explicitly disabled in production

- **Category:** Observability / Metrics
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** KNOWN in part (ITEM-0009 covers the absence of a metrics platform; the
  Prisma `log: []` detail is NEW)
- **Component:** `services/api/src/common/prisma/prisma.service.ts`, whole platform
- **Evidence:**
  `services/api/src/common/prisma/prisma.service.ts:28-31`:
  ```ts
  super({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === 'development' ? ['warn'] : [],
  });
  ```
  No `prom-client`, no `@opentelemetry/*`, no `statsd` (OBS-01 grep).
  No `NestInterceptor` anywhere, so no request timing is captured (OBS-04).
  `@vercel/analytics` / `@vercel/speed-insights` absent from every `apps/*/package.json`.

  | Metric | Present? | Where it would be read |
  |---|---|---|
  | Request latency | **Absent** | — (Render shows aggregate response time on the service page only) |
  | Error rate | **Absent as a metric**; individual failures land in the `ErrorLog` table | Platform Admin → monitoring (`GET /api/platform/logs/events`), manually |
  | DB latency | **Absent** | — |
  | Slow queries | **Absent** — Prisma `log: []` in production | — (Neon console only) |
  | Connection-pool usage | **Absent** | — (Neon console only) |
  | CPU / RAM | Present, platform-provided | Render service dashboard |
  | Queue depth (outbox) | **Absent as a metric**; a count is logged at `log` level and discarded in production (OBS-03) | nowhere |
  | Failed jobs | Logged at `error` level only: `modules/outbox/outbox-dispatcher.service.ts:281-283` `Outbox event ${event.id} … exhausted ${event.maxAttempts} attempts` | Render log stream, unaggregated, unalerted |

- **Current behaviour:** No latency, throughput, saturation or error-rate signal exists
  inside the application. CPU/RAM come from Render only.
- **Expected behaviour:** At minimum a p95 latency and 5xx rate per route, and outbox
  backlog depth, exposed somewhere a human or an alert can read.
- **Risk:** Performance regressions and capacity problems are undetectable until a user
  complains. No baseline exists against which to judge a release.
- **Remediation:** Ship the request interceptor from OBS-04 with a duration field; add
  an authenticated `/api/platform/metrics` returning outbox backlog, failed-job count
  and error counts over a window, so the existing Platform Admin console has something
  to render.
- **Difficulty:** MEDIUM · **Regression risk:** LOW · **Fix now:** LATER

---

### OBS-07 — Two redactors disagree: `sanitizeForErrorLog` omits every national-id, bank and salary key that `redactAuditSnapshot` covers, and it is applied to query strings and route params that are persisted on every failure

- **Category:** Privacy / Logging
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/common/errors/sanitize-error-log.ts` vs `services/api/src/modules/audit/audit-snapshot.ts`
- **Evidence:**
  The error-log redactor's complete key list —
  `services/api/src/common/errors/sanitize-error-log.ts:1-14`:
  ```ts
  const SENSITIVE_KEY_PATTERNS = [
    'password', 'token', 'secret', 'cookie', 'authorization', 'apikey',
    'api_key', 'pass', 'connectionstring', 'database_url', 'jwt', 'otp',
  ];
  ```
  The audit redactor's, written later and for the same class of data —
  `services/api/src/modules/audit/audit-snapshot.ts:43-58`:
  ```ts
  const SENSITIVE_KEY_NAMES = new Set([
    'cnic', 'nationalid', 'nationalidnumber', 'passportnumber',
    'taxidentifier', 'taxidentificationnumber', 'socialsecuritynumber', 'ssn',
    'accountnumber', 'bankaccountnumber', 'iban', 'swiftcode',
    'swiftorroutingcode', 'routingnumber',
  ]);
  ```
  `audit-snapshot.ts:4-7` states the rule both are meant to implement: *"`AGENTS.md`
  forbids password hashes, refresh tokens, encrypted secrets, full national ids and
  bank details from leaving a service in a response or a log."*
  The error path persists `params` and `query` **unconditionally** —
  `services/api/src/modules/error-logs/error-logs.service.ts:94-96`:
  ```ts
  params: input.params,
  query: input.query,
  requestBody: config.includeRequestBody ? input.requestBody : undefined,
  ```
  fed from `common/filters/http-exception.filter.ts:136-138`
  (`params: request.params, query: request.query, requestBody: request.body`).
  Both then go into `ErrorLogOccurrence.diagnosticJson`
  (`error-logs.service.ts:156-166`) and are rendered verbatim into the downloadable
  text file at `modules/error-logs/error-log.formatter.ts:79-86`
  (`'Route Parameters:'`, `'Query Parameters:'`, `'Request Body:'`).
- **Current behaviour:** `sanitizeForErrorLog` is correct on what it covers — it
  recurses into nested objects and arrays (lines 21-33), and `refreshToken`,
  `accessToken`, `Authorization`, `Set-Cookie` and `apiKey` all normalise into its
  substring list, so the specific concern raised in the brief (a redactor missing
  `refreshToken` or nested objects) is **not** present. What it misses is the HR data:
  a query string such as `?search=<national id>` or `?iban=…`, or an
  `AppError.details` payload carrying `bankAccountNumber` or `basicSalary`, is stored
  in the clear.
- **Expected behaviour:** One key list, shared by both redactors.
- **Risk:** Search terms typed by an HR user — routinely a name, a CNIC or an employee
  code — are persisted on any 4xx/5xx and are readable by any tenant support-role user
  through `GET /api/error-logs/:traceId/download`, and by any platform admin for every
  tenant.
- **Mitigating fact worth recording:** `includeRequestBody` defaults to **false**
  (`common/errors/error-config.ts:27-31`) and is set nowhere in the repository, so full
  request bodies are *not* stored today. That is the single most important thing this
  code gets right.
- **Remediation:** Export the key sets from one module (extend
  `sanitize-error-log.ts` with `audit-snapshot.ts`'s `SENSITIVE_KEY_NAMES`), and keep
  `ERROR_LOG_INCLUDE_REQUEST_BODY` unset in production.
- **Difficulty:** LOW · **Regression risk:** LOW · **Fix now:** YES

---

### OBS-08 — `POST /api/error-logs/client` accepts an unvalidated arbitrary JSON body, stores it verbatim, and has no rate limit

- **Category:** Input Validation / Privacy / Availability
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/error-logs/error-logs.controller.ts`
- **Evidence:**
  `services/api/src/modules/error-logs/error-logs.controller.ts:25-29`:
  ```ts
  @Post('client')
  async persistClientLog(
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
  ```
  `Record<string, unknown>` has no class metatype, so the global `ValidationPipe`
  (`main.ts:98-104`, `whitelist: true, forbidNonWhitelisted: true`) does not apply —
  it is the one authenticated write endpoint in the API with no DTO.
  `body.details` is stored without inspection (controller:50-55):
  ```ts
  details: { details: body.details, componentStack: readString(body.componentStack), ... },
  ```
  The controller carries `@UseGuards(JwtAuthGuard)` only (line 21) — no
  `PublicRateLimitGuard`, no throttle.
  Storage is per-`traceId`, and the client chooses the `traceId` (controller:30-36,
  only `/^(client|admin)_/` is required):
  `error-logs.service.ts:156-166` — `tx.errorLogOccurrence.upsert({ where: { traceId }, create: { … diagnosticJson: JSON.parse(JSON.stringify(data)) } })`.
  Body limit for this path is the global 1 MB (`main.ts:150`).
- **Current behaviour:** Any authenticated user (the lowest-privilege employee
  included) can write an unbounded number of ~1 MB JSON rows into
  `ErrorLogOccurrence`, with arbitrary attacker-chosen content, attributed to their own
  tenant, and readable back by tenant support roles and platform admins.
- **Expected behaviour:** A `ClientErrorReportDto` with `class-validator` bounds on
  every field, a length cap on `details`/`stack`/`componentStack`, and a rate limit.
- **Risk:** (a) storage growth and cost in the primary Postgres, (b) a stored-content
  vector into a support-facing screen and a downloadable `.txt`, (c) audit-noise: an
  attacker can flood the incident queue to bury a real event — the same failure mode
  BUG-1754 already documents from benign traffic.
- **Remediation:** Introduce a DTO for `persistClientLog`, add
  `@UseGuards(PublicRateLimitGuard)` (or a per-user equivalent), and cap the serialised
  `details` size in `ErrorLogsService.persist`.
- **Difficulty:** LOW · **Regression risk:** LOW · **Fix now:** YES

---

### OBS-09 — `MailerService` logs password-reset and account-activation links, including the signed token, in plain text

- **Category:** Privacy / Secret handling
- **Severity:** LOW (currently unreachable — see Current behaviour)
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/common/mailer/mailer.service.ts`
- **Evidence:**
  `services/api/src/common/mailer/mailer.service.ts:39-57`:
  ```ts
  const deliveryMode = this.configService.get('MAIL_DELIVERY_MODE') ?? 'log';
  if (deliveryMode === 'log') {
    this.logger.log(`${input.subject} email queued for ${input.to}: ${input.link}`);
    return { deliveryMode: 'log', accepted: true, link: input.link };
  }
  this.logger.warn(`Unsupported mail delivery mode "${deliveryMode}". Falling back to log.`);
  this.logger.log(`${input.subject} email queued for ${input.to}: ${input.link}`);
  ```
  `input.link` is the reset URL, which carries the reset JWT as a query parameter
  (compare the live implementation at
  `modules/employees/employee-profiles.service.ts:1672`:
  `const resetLink = \`${baseUrl}?token=${encodeURIComponent(resetToken)}\`;`).
  There is **no** delivery mode other than `log`: every branch falls back to it.
- **Current behaviour:** `MailerService` has no production caller —
  `rg "MailerService|sendPasswordResetLink|sendAccountActivationLink"` shows the only
  `sendPasswordResetLink` in use is `EmployeeProfilesService`'s own method, which does
  **not** route through `MailerService`. The class is dead code. It is also
  double-mitigated: `logger.log` is suppressed in production (OBS-03).
- **Expected behaviour:** A credential-bearing URL is never written to a log at any
  level.
- **Risk:** If anyone wires this up — the obvious thing to do when adding a new
  invitation flow — every password reset token in the product lands in the log stream,
  and anyone with Render console access can take over any account.
- **Remediation:** Delete `common/mailer/` (it is superseded by the `notifications`
  module, which `AGENTS.md` names as the only route for tenant e-mail), or at minimum
  log only `input.to` and a token fingerprint.
- **Difficulty:** LOW · **Regression risk:** LOW · **Fix now:** YES (deletion is
  cheaper than the risk)

---

### OBS-10 — Platform-admin and tenant-admin login failures are not audited; only tenant-user login failures are

- **Category:** Auditability / Attack detection
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/auth/auth.service.ts`
- **Evidence:**
  Tenant login failures **are** audited, with reason, IP, user agent and client —
  `modules/auth/auth.service.ts:1301-1319` and `:1412-1424`, both calling
  `logTenantAuthEvent` → `AuditService.log` (`:1748-1766`).
  The two admin paths write only a console warning and stop:
  `modules/auth/auth.service.ts:1461-1476` (`validateAdminCredentials`):
  ```ts
  this.logger.warn(JSON.stringify({
    event: 'admin.auth.login.failed',
    reason: adminCandidates.length > 0 ? 'PASSWORD_MISMATCH' : 'NO_ADMIN_USER',
    identifier: normalizedEmail,
  }));
  throw this.authUnauthorized('ADMIN_AUTH_INVALID_CREDENTIALS', 'Invalid admin credentials.');
  ```
  `modules/auth/auth.service.ts:1481-1508` (`validatePlatformAdminCredentials`) — same
  shape, `PLATFORM_USER_NOT_FOUND` / `PASSWORD_MISMATCH`, no `AuditService` call and no
  `PlatformAuditLog` row.
- **Current behaviour:** Brute force against the platform admin console — the account
  that can reach every tenant — produces no durable record. The `logger.warn` is at a
  level that *is* emitted, so it reaches Render's console, but nothing aggregates or
  retains it (OBS-01).
- **Expected behaviour:** `AuditService.log({ tenantId: 'platform', action: 'PLATFORM_AUTH_LOGIN_FAILED', … })`
  with IP and user agent, symmetric with the tenant path.
- **Risk:** After a platform-admin compromise there is no record of the attempts that
  preceded it, and no way to establish when the attack began.
- **Remediation:** Add a `logPlatformAuthEvent` mirroring `logTenantAuthEvent`
  (`auth.service.ts:1735`) and call it from both admin validators, success and failure.
- **Difficulty:** LOW · **Regression risk:** LOW · **Fix now:** YES

---

### OBS-11 — The only automatic authorization-denial audit writer is dead code on the installed Prisma client

- **Category:** Attack detection
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** KNOWN in part (`AGENTS.md` records that `$use` is unavailable on
  `@prisma/client@7.8.0` and that the middleware is "effectively inert"; that the
  middleware is also the **only** denial-audit writer is NEW)
- **Component:** `services/api/src/common/prisma/prisma.service.ts`
- **Evidence:**
  `services/api/src/common/prisma/prisma.service.ts:33-39`:
  ```ts
  const middlewareRegistrar = (this as any).$use;
  if (typeof middlewareRegistrar !== 'function') {
    this.logger.debug('Prisma middleware registration skipped because PrismaClient.$use is unavailable in this runtime/client build.');
    return;
  }
  ```
  The code that would never run includes the only automatic denial record —
  `prisma.service.ts:88-106`:
  ```ts
  if (accessDeniedByScope) {
    const auditData = { tenantId: context.tenantId, actorUserId: context.userId,
      action: 'BUSINESS_UNIT_ACCESS_DENIED', entityType: model, ... };
    setImmediate(() => { void this.auditLog.create({ data: auditData }).catch(() => undefined); });
  ```
  Installed client: `services/api/package.json:71` `"@prisma/client": "^7.8.0"`.
  The skip is logged at `debug`, which is below the production level (OBS-03), so
  nothing announces that it did not register.
  `common/guards/permissions.guard.ts` contains no `Logger` and no `AuditService`
  (`rg -n "Logger|audit" common/guards/permissions.guard.ts` → no matches), so an
  ordinary 403 is not audited either.
- **Current behaviour:** No permission denial is written to `AuditLog` by any code path.
- **Expected behaviour:** A denied access attempt is auditable — it is the primary
  signal for privilege probing.
- **Risk:** See OBS-12 for the detection consequences.
- **Remediation:** Move the denial record out of the dead middleware: emit it from
  `PermissionsGuard` and from `buildScopedAccessWhere` callers that return empty for an
  explicit-id lookup. Meanwhile, raise the `$use`-unavailable message from `debug` to
  `warn` so the inert state is visible.
- **Difficulty:** MEDIUM · **Regression risk:** LOW · **Fix now:** LATER

---

### OBS-12 — Can we detect an attack? The raw material exists in one table; nothing looks at it

- **Category:** Attack detection
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW (as a consolidated assessment)
- **Component:** `modules/error-logs`, `modules/platform-monitoring`, `modules/audit`
- **Evidence and per-scenario answer:**

  | Attack | Recorded? | Detectable? |
  |---|---|---|
  | **Credential stuffing (tenant)** | **Yes.** Every failure writes an `AuditLog` row with reason, e-mail, IP, user agent, `appClientId` — `auth.service.ts:1748-1766`. Lockout counters at `login-lockout.service.ts:81-98`. 429s from `PublicRateLimitGuard` (20 writes / 10 min / IP+path, `common/guards/public-rate-limit.guard.ts:13,24`) become `ErrorLog` rows with `supportStatus: 'NEW'`. | **Only by manual inspection.** No query counts failures per window; no threshold; no alert. |
  | **Credential stuffing (platform admin)** | **No** — `logger.warn` only (OBS-10). | No. |
  | **Tenant-isolation probe (many 403s across ids)** | **Partly.** Each 403 becomes an `ErrorLog` row: `http-exception.filter.ts:124-149` persists every handled exception with `userId`, `tenantId`, `path`, `ipAddress`. `ACCESS_DENIED` is *not* in `isExpectedProtocolOutcome` (`modules/error-logs/expected-protocol-outcome.ts:84-104`), so it lands as `supportStatus: 'NEW'` and stays in the triage queue. No `AuditLog` row (OBS-11). | **Only by someone opening Platform Admin → monitoring and noticing.** There is no rule, count or alert. |
  | **Mass export** | **No.** `GET /employees/export` writes no audit row (`employees.controller.ts:127-129` → `employees.service.ts:1883`, no `auditService` call). Document downloads write nothing (OBS-15). | No. |
  | **Unusual privilege grant** | **Partly.** `USER_ROLE_ASSIGNMENT_UPDATED` and `USER_DIRECT_PERMISSIONS_UPDATED` are audited with before/after (`modules/users/users.service.ts:359-366`, `:419`). But **role creation is not** — `rg "ROLE_CREATED"` returns zero hits, and `roles.service.ts:54 async create(...)` contains no audit call. So creating a role that grants everything, then assigning it, records only the assignment. | Partially, retrospectively, by hand. |
  | **Data exfiltration** | **No.** No access log (OBS-04), no read auditing except DLP content (OBS-15 healthy counter-example), no egress volume metric (OBS-06). | No. |

- **Current behaviour:** The platform records enough to *investigate* an authentication
  attack after the fact within one tenant, and enough to *notice* a 403 storm if a human
  is looking at the right screen. It records nothing that would let anyone find a mass
  read, and it has no detection logic of any kind — no thresholds, no correlation, no
  alerts.
- **Expected behaviour:** At minimum, a scheduled check on `AuditLog` for
  `AUTH_LOGIN_FAILED` volume per tenant/IP and on `ErrorLog` for `ACCESS_DENIED` volume
  per user, raising a platform-ops notification.
- **Risk:** An attacker with valid low-privilege credentials can enumerate and export
  employee PII and never appear in any record the platform keeps.
- **Remediation:** Build the two counting queries above into
  `PlatformMonitoringService` as tiles first (the console already exists and already
  aggregates — `platform-monitoring.service.ts:93-135`), then wire the same predicates
  to the lifecycle-notification path once OBS-02 is fixed.
- **Difficulty:** MEDIUM · **Regression risk:** LOW · **Fix now:** LATER

---

### OBS-13 — The Platform Admin "log files" browser reads a directory nothing ever writes to

- **Category:** Observability
- **Severity:** INFORMATIONAL
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/platform-monitoring/platform-monitoring.service.ts`
- **Evidence:**
  `platform-monitoring.service.ts:559-564`:
  ```ts
  function resolveLogDir() {
    const configured = process.env.DIJIPEOPLE_LOG_DIR ?? process.env.LOG_DIR ?? process.env.ERROR_LOG_DIR;
    return path.resolve(configured ?? path.join(process.cwd(), 'logs'));
  }
  ```
  serving `GET /api/platform/logs` and `GET /api/platform/logs/:fileName/download`
  (`platform-monitoring.controller.ts:26-28`, `:71-73`).
  Nothing in the API writes a log file: `rg -n "createWriteStream|appendFile|writeFile"`
  over `services/api/src` (non-spec) returns only `common/storage/storage.service.ts`
  (uploads), `modules/super-admin/super-admin.service.ts:4185` and an invoice-PDF
  sample. Nest's logger writes to stdout only (`main.ts:33`), and none of the three env
  vars is declared in `render.yaml`.
- **Current behaviour:** The screen lists an empty (or non-existent) directory.
- **Risk:** An operator believes they have a log archive and they do not.
- **Remediation:** Either remove the file-listing endpoints, or state on the screen that
  file logging is not configured in this deployment.
- **Difficulty:** LOW · **Regression risk:** LOW · **Fix now:** NO

---

### OBS-14 — `JwtAuthGuard` logs e-mail addresses on token mismatch

- **Category:** Privacy / Logging
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/common/guards/jwt-auth.guard.ts`
- **Evidence:** `common/guards/jwt-auth.guard.ts:120-122`:
  ```ts
  this.logger.warn(
    `Token email mismatch. TokenEmail=${payload.email}, CurrentEmail=${authUser.email}, UserId=${payload.sub}, TenantId=${payload.tenantId}`,
  );
  ```
  At `warn`, so it is emitted in production.
- **Current behaviour:** Two e-mail addresses per occurrence in the log stream, which
  has no defined retention or access control beyond Render account access.
- **Expected behaviour:** `userId` and `tenantId` are sufficient to investigate; the
  e-mail adds nothing the database cannot supply.
- **Risk:** PII accumulating in an unmanaged log store; a GDPR erasure request cannot
  reach it (OBS-27).
- **Remediation:** Drop the two e-mail interpolations; keep `payload.sub` and
  `payload.tenantId`.
- **Difficulty:** LOW · **Regression risk:** LOW · **Fix now:** YES

---

## Part 2 — Auditability

### Coverage table

Read from the services, not inferred. `AuditService.log` call sites (non-spec):
**234** across **43** of 68 modules. Mutating controller handlers
(`@Post|@Put|@Patch|@Delete` in `modules/**/*.controller.ts`): **719**.
**Ratio ≈ 33 %**, and that is an upper bound — several sites are batch/telemetry rows.

| Domain | Audited? | Before/after | Actor | Ts | Tenant | Employee | Request ctx | Evidence |
|---|---|---|---|---|---|---|---|---|
| Salary / compensation | **YES** | **YES** | yes | yes | yes | via `entityId` | **no** | `compensation.service.ts:200,209-210`; `salary-package-rules.service.ts:134,140-141`; `pay-components.service.ts:195,201-202` |
| Bank details (employee) | **YES**, masked at source | YES on update | yes | yes | yes | via `entityId` | **no** | `loans.service.ts:845,911,944,976,996,1039,1094`; wrapper at `:1168-1181`; masking at `:848,914` |
| Bank details (employer) | **YES** | **YES** | yes | yes | yes | n/a | **no** | `payroll/employer-bank-accounts.service.ts:120,126-127` |
| Payroll run + finalisation | **YES** | **YES** | yes | yes | yes | n/a | **no** | `payroll-operations.service.ts:923` (`PAYROLL_RUN_FINALIZED`, before=`run`, after=`finalized`), `:1751` disbursed, `:2004` wrapper |
| Payroll **cycle** finalisation | **NO** | — | — | — | — | — | — | `payroll.service.ts:987 async finalizeCycle(...)` — the only audit call in the file is `:548` `PAYROLL_PERIODS_GENERATED` |
| Payslip issue | **YES** | partial | yes | yes | yes | via `entityId` | **no** | `payslips.service.ts:691,697`; `:356,362-363`; delivery `:650-651` |
| Attendance edits | **YES** | **YES** | yes | yes | yes | yes | **no** | `attendance.service.ts:1465-1471` (`ATTENDANCE_MANUAL_UPDATED`), `:1260`, `:723` |
| Leave approval | **YES** | partial | yes | yes | yes | via `entityId` | **no** | `leave.service.ts:1822,1827-1828`; `approvals.service.ts:664-668` (transactional form) |
| Role **update/delete/matrix** | **YES** | **YES** | yes | yes | yes | n/a | **no** | `roles.service.ts:221-228,261,322,403,497` |
| Role **creation** | **NO** | — | — | — | — | — | — | `roles.service.ts:54 async create(...)`; `rg "ROLE_CREATED"` → 0 hits |
| User role assignment / direct grants | **YES** | **YES** | yes | yes | yes | n/a | **no** | `users.service.ts:359-366`, `:419` |
| Single role revocation | **NO** | — | — | — | — | — | — | `users.service.ts:645 async removeRole(...)` |
| **Employee termination** | **NO** | — | — | — | — | — | — | `employees.service.ts:2045-2071`; `rg "EMPLOYEE_TERMINATED"` → 0 hits — see OBS-15 |
| Contracts (31 mutating endpoints) | **NO** | — | — | — | — | — | — | no `AuditService` import in `modules/contracts` — see OBS-17 |
| Tenant settings | **PARTIAL** (3 coarse actions vs 38 endpoints) | partial | yes | yes | yes | n/a | **no** | `tenant-settings.service.ts:335-338,469,595`; `settings-runtime.service.ts:172` |
| Subscription / entitlement | **PARTIAL** | partial | mixed | yes | mixed | n/a | **no** | `retention-hold.service.ts:73,142`; `payment-recheck.service.ts:204`; **plan/seat/cancellation unaudited**; 6 raw `tx.auditLog.create` in `webhook.service.ts:499,637,688,701,743,1679` — see OBS-18 |
| User creation | **YES** | after only | yes | yes | yes | n/a | **no** | `users.service.ts:161-167` |
| User **update / deactivation** | **NO** | — | — | — | — | — | — | `users.service.ts:183-270`; `rg "USER_UPDATED"` → 0 hits — see OBS-17 |
| User deletion | **YES** | before | yes | yes | yes | n/a | **no** | `users.service.ts:530-533` |
| **Document access (view/download)** | **NO** | — | — | — | — | — | — | `documents.service.ts:446,464`; `documents.controller.ts:158,181` — see OBS-16 |
| DLP captured-content read | **YES** | n/a | yes | yes | yes | yes | **no** | `agent/dlp/dlp.service.ts:361-380` — the one read-audited surface in the product |
| Auth login success/failure (tenant) | **YES** | after only, **with IP/UA/session** | yes | yes | yes | n/a | **partially — in JSON** | `auth.service.ts:1748-1766` |
| Auth login failure (platform/admin) | **NO** | — | — | — | — | — | — | `auth.service.ts:1461-1476`, `:1481-1508` — see OBS-10 |

Modules with **zero** audit call sites include `contracts` (31 write endpoints),
`customization` (33), `notifications` (16), `partner-experience` (14), `recruitment`
(14), `lookups` (10), `onboarding` (8), `support-cases` (8), plus `views`, `workflows`,
`legal`, `inbox`, `navigation`, `sla`, `permissions`.

---

### OBS-15 — Employee termination writes no audit row, and the coverage spec designed to catch exactly this cannot see it

- **Category:** Auditability
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** NEW (adjacent to BUG-2044 / REG-355, "No employee lifecycle event is
  audited", `Status: FIXED` — that fix covered creation and reporting-manager
  assignment; termination was not in scope and remains uncovered)
- **Component:** `services/api/src/modules/employees/employees.service.ts`
- **Evidence:**
  `services/api/src/modules/employees/employees.service.ts:2045-2071` — the entire
  method:
  ```ts
  async terminate(tenantId: string, employeeId: string, dto: TerminateEmployeeDto, actorId: string) {
    const employee = await this.employeesRepository.findByIdAndTenant(tenantId, employeeId);
    if (!employee) { throw new NotFoundException('Employee was not found for this tenant.'); }
    const terminationDate = dto.terminationDate ? new Date(dto.terminationDate) : new Date();
    await this.employeesRepository.update(tenantId, employeeId, {
      employmentStatus: EmployeeEmploymentStatus.TERMINATED,
      terminationDate,
      updatedById: actorId,
    });
    return this.findById(tenantId, employeeId);
  }
  ```
  No `auditService` call. `rg "EMPLOYEE_TERMINATED" services/api/src` → **zero hits**.
  The endpoint is live and separately permissioned —
  `modules/employees/employees.controller.ts:785-787`:
  ```ts
  @Post(':employeeId/terminate')
  @Permissions('employees.terminate')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'delete')
  ```
  The guard that exists to make missing audit calls visible structurally cannot see it —
  `modules/audit/lifecycle-audit-coverage.spec.ts:37-38`:
  ```ts
  const WRITE_METHOD_PATTERN = /^(create|update|delete|assign|submit|cancel|archive|deactivate|provision|import|restore)/;
  ```
  `terminate` matches none of these alternatives, so it is filtered out at `:129`
  (`.filter((name) => WRITE_METHOD_PATTERN.test(name))`) before the `unclassified`
  assertion at `:141-154` ever runs.
- **Current behaviour:** An employee is terminated and the only durable evidence is
  `Employee.updatedById` / `terminationDate` on the row itself — which the next update
  overwrites.
- **Expected behaviour:** `EMPLOYEE_TERMINATED` with `beforeSnapshot`
  (`employmentStatus`, `terminationDate`) and `afterSnapshot`, per `AGENTS.md`'s
  "every state-changing operation that a tenant admin or auditor would need to see".
- **Risk:** Termination is the most consequential and most litigated event in an HR
  system. In a wrongful-dismissal dispute the platform cannot say who terminated the
  employee, when the record was changed, or what the prior state was. The same gap
  makes a malicious termination unattributable.
- **Remediation:** Add an `AuditService.log` call in `EmployeesService.terminate` using
  `AUDIT_ACTIONS`; add `terminate|reinstate|offboard|promote|transfer` to
  `WRITE_METHOD_PATTERN` in `lifecycle-audit-coverage.spec.ts:37`; and extend that spec
  so a method listed as `audited` is verified to actually reach `AuditService` (today
  membership in the `audited` array is an unchecked string claim —
  `lifecycle-audit-coverage.spec.ts:49-124`).
- **Difficulty:** LOW · **Regression risk:** LOW · **Fix now:** YES

---

### OBS-16 — Reading or downloading a document is recorded nowhere

- **Category:** Auditability / Privacy
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/documents/documents.service.ts`
- **Evidence:**
  `services/api/src/modules/documents/documents.service.ts:446-462`:
  ```ts
  async openForView(currentUser: AuthenticatedUser, documentId: string) {
    const document = await this.documentsRepository.findById(currentUser.tenantId, documentId);
    if (!document || document.isArchived || !document.storageKey) { throw new NotFoundException(...); }
    await this.assertDocumentReadAccess(currentUser, document);
    return { document, file: await this.storageService.openFile(document.storageKey) };
  }
  ```
  and `:464-474` — `openForDownload` performs a settings check then
  `return this.openForView(currentUser, documentId);`. Neither touches `AuditService`.
  Both are reachable: `modules/documents/documents.controller.ts:158` `@Get(':documentId/view')`,
  `:181` `@Get(':documentId/download')`.
  Only writes are logged: `documents.service.ts:324 'DOCUMENT_UPLOADED'`,
  `:400 'DOCUMENT_UPDATED'`, `:436 'DOCUMENT_ARCHIVED'`.
  `rg "DOCUMENT_DOWNLOADED|DOCUMENT_VIEWED|DOCUMENT_ACCESSED" services/api/src/modules`
  returns exactly one hit — `modules/contracts/contracts.service.ts:4410` — and that
  writes a contract-scoped *timeline* row, not an `AuditLog` row (OBS-17).
- **Current behaviour:** Nobody can answer "who read this employee's medical
  certificate, salary letter, or scanned CNIC".
- **Expected behaviour:** A read of a stored personal document is an audited action.
  The product already knows how — `modules/agent/dlp/dlp.service.ts:361-380` audits
  every read of captured clipboard content, and `dlp.controller.ts:42-45` explains why:
  *"Reading content is a different authority from configuring the agent, and every read
  is audited in the service."* The same reasoning applies to HR documents and was not
  applied.
- **Risk:** A GDPR/labour-law subject access request asking "who accessed my file"
  cannot be answered. Insider exfiltration of employee identity documents leaves no
  trace at all.
- **Remediation:** Add `AuditService.log({ action: 'DOCUMENT_VIEWED' | 'DOCUMENT_DOWNLOADED', entityType: 'Document', entityId, … })`
  in `openForView`/`openForDownload`, distinguishing the two so a bulk download is
  visible. Mirror it in `modules/payslips` download and `modules/employees` export.
- **Difficulty:** LOW · **Regression risk:** LOW (audit volume — index already exists on
  `(tenantId, action, createdAt)`) · **Fix now:** YES

---

### OBS-17 — Whole modules have no audit trail: `contracts` (31 mutating endpoints), `customization` (33), `users.update`, role creation

- **Category:** Auditability
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `modules/contracts`, `modules/customization`, `modules/users`, `modules/roles`
- **Evidence:**
  `rg "AuditService|auditService|audit\.log" services/api/src/modules/contracts --glob '!*.spec.ts'`
  → **no matches**, against 31 `@Post|@Put|@Patch|@Delete` handlers. Contracts keep a
  private parallel trail instead — `modules/contracts/contracts.service.ts:4406-4410`
  writes `'DOCUMENT_DOWNLOADED'` into a contract timeline row, and `:3990` builds an
  `auditTrail` from signature events. Neither is queryable from `/api/audit-logs`,
  neither passes through `redactAuditSnapshot`, and both are deleted with the contract.
  `modules/users/users.service.ts:183-270` — `async update(...)` returns
  `this.mapUserSummary(updatedUser)` with no audit call; `rg "USER_UPDATED"` → **zero
  hits**. Since status/`isActive` changes route through `update`, **user deactivation is
  effectively unaudited** unless it goes through `remove` (`:500`).
  `modules/roles/roles.service.ts:54 async create(...)` — no audit call;
  `rg "ROLE_CREATED"` → **zero hits**.
  `modules/users/users.service.ts:645 removeRole`, `:716 updateAccessTeam`,
  `:733 removeAccessTeam` — no audit calls.
- **Current behaviour:** Contract signature, amendment and termination; every
  customization change; user e-mail/status changes; and the creation of a role with an
  arbitrary permission matrix all leave no entry on the tenant's compliance surface.
- **Expected behaviour:** `AGENTS.md`: *"call `AuditService.log()` for every
  state-changing operation that a tenant admin or auditor would need to see."*
- **Risk:** A signed employment contract can be amended with no attributable record. A
  privileged role can be created, used, and deleted, and only the deletion is recorded.
- **Remediation:** Prioritise `contracts` (legal exposure) and `users.update` +
  `roles.create` (security exposure). Extend
  `modules/audit/lifecycle-audit-coverage.spec.ts:49` — which today covers exactly
  three services (`EmployeesService`, `OrganizationService`, `LeaveService`) — to
  enumerate every module and require an explicit `exempt` entry, so a new unaudited
  module fails CI.
- **Difficulty:** MEDIUM · **Regression risk:** LOW · **Fix now:** LATER (contracts:
  YES)

---

### OBS-18 — Billing plan/seat/cancellation changes are unaudited, and six webhook paths write raw `auditLog` rows that bypass central redaction and actor resolution

- **Category:** Auditability
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/billing/services/`
- **Evidence:**
  Only 3 of 27 files in `modules/billing/services/` reference `AuditService` —
  `retention-hold.service.ts:73,142`, `payment-recheck.service.ts:204`. No audit call
  exists in `plan-change.service.ts`, `seat-change.service.ts`,
  `cancellation.service.ts`, `subscription-order.service.ts`,
  `order-activation.service.ts` or `commercial-config.service.ts`.
  Six raw inserts bypass the service —
  `modules/billing/services/webhook.service.ts:499, 637, 688, 701, 743, 1679`:
  ```ts
  await tx.auditLog.create({ data: { ... action: 'SUBSCRIPTION_ACTIVATED_BY_INVOICE_PAID', ... } });
  ```
  Two more in `modules/employees/employees.service.ts:1426` and `:1548`.
  Bypassing `AuditService.log` skips `normalizeSnapshot` → `redactAuditSnapshot`
  (`audit.service.ts:267-269`) and the actor resolution at `:46-54` that distinguishes a
  tenant user from a platform actor.
- **Current behaviour:** Entitlement changes — which decide what a customer is billed
  for and what they can reach — are largely untraceable, and the paths that do write use
  an unredacted side door.
- **Expected behaviour:** All eight raw inserts route through `AuditService.log(data, tx)`
  (the two-argument transactional form already exists and is used correctly by
  `approvals.service.ts:664`).
- **Risk:** A billing dispute cannot be reconstructed. A snapshot written raw can carry
  an unredacted field that the central redactor would have caught.
- **Remediation:** Replace the eight `tx.auditLog.create` calls with
  `this.auditService.log({...}, tx)`; add audit calls to plan/seat/cancellation
  services; add a lint or spec rule forbidding `auditLog.create` outside
  `modules/audit/audit.repository.ts`.
- **Difficulty:** LOW · **Regression risk:** LOW · **Fix now:** YES (the raw-insert
  half)

---

### OBS-19 — No audit row carries an IP address, user agent, session id or request id; the two indexed correlation columns are dead

- **Category:** Auditability / Forensics
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/prisma/schema.prisma`, `modules/audit/audit.service.ts`, `common/request-context/`
- **Evidence:**
  `services/api/prisma/schema.prisma:10440-10466` — the complete `AuditLog` model. It
  has `requestId`, `traceId`, `sourceModule`, `scope`, `beforeSnapshot`,
  `afterSnapshot`. It has **no** `ipAddress`, **no** `userAgent`, **no** `sessionId`,
  **no** `employeeId`, and no integrity hash / previous-hash chain.
  `AuditService.log`'s input type (`modules/audit/audit.service.ts:13-27`) offers no
  network or session parameter either.
  A multiline scan for those keys inside an `audit.log({...})` block —
  `rg -U "audit(Service)?\.log\(\s*\{[^}]*(requestId|traceId):" services/api/src --glob '!*.spec.ts'`
  — returns **zero matches**. Every row is written through
  `audit.service.ts:65-66` with both inputs undefined:
  ```ts
  requestId: input.requestId ?? null,
  traceId: input.traceId ?? null,
  ```
  So `schema.prisma:10464 @@index([tenantId, requestId])` and
  `:10488 @@index([requestId])` on `PlatformAuditLog` index a permanently-null column.
  `RequestContextService` — the one `AsyncLocalStorage` in the API — carries no request
  identity: `common/request-context/request-context.service.ts:5-14` holds only
  `userId, tenantId, businessUnitId, organizationId, accessibleBusinessUnitIds, accessibleUserIds, effectiveAccessLevel, requiresSelfScope`.
  `AuditService`'s sole constructor dependency is `AuditRepository`
  (`audit.service.ts:10`), so it cannot reach it anyway.
  The one exception is smuggled into JSON by the auth module, and the read side digs it
  back out — `audit.service.ts:215-218`:
  ```ts
  ipAddress: readSnapshotString(item.afterSnapshot, 'ipAddress'),
  appClientId: readSnapshotString(item.afterSnapshot, 'appClientId'),
  userAgent: readSnapshotString(item.afterSnapshot, 'userAgent'),
  sessionId: readSnapshotString(item.afterSnapshot, 'sessionId'),
  ```
  These are unindexed and unfilterable — `audit.repository.ts:59-73`'s `where` supports
  only `action`, `entityType`, `actorUserId` and a date range — and are `null` for all
  233 non-auth call sites while the API response still presents them as though they were
  columns.
- **Current behaviour:** For a salary change, a role grant or a payroll finalisation the
  trail answers *who* (if the actor still exists — OBS-20), *what*, *when* and *which
  tenant*. It cannot answer *from where*, *on which session*, or *as part of which
  request* — and two changes made in the same HTTP request cannot be tied together.
- **Expected behaviour:** `ipAddress`, `userAgent`, `sessionId` as real columns, and
  `requestId` populated from `req.requestId` for every write.
- **Risk:** After a compromise, the audit log cannot separate the attacker's session
  from the legitimate user's, and cannot establish the blast radius of a single request.
- **Remediation:** (1) Extend `BuAccessRequestContext` with `requestId`, `ipAddress`,
  `userAgent`, `sessionId`, populated by `RequestIdMiddleware` /
  `BusinessUnitAccessMiddleware`. (2) Inject `RequestContextService` into
  `AuditService` and default the four fields from it, so no call site has to remember.
  (3) Add the three columns by migration with `@@index([tenantId, createdAt])` already
  present. This makes OBS-12's detection queries possible.
- **Difficulty:** MEDIUM · **Regression risk:** LOW · **Fix now:** LATER

---

### OBS-20 — Deleting a user nulls the actor on every audit row they ever wrote

- **Category:** Auditability / Integrity
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/prisma/schema.prisma`
- **Evidence:**
  `services/api/prisma/schema.prisma:10457`:
  ```prisma
  actorUser User? @relation("AuditLogActor", fields: [actorUserId], references: [id], onDelete: SetNull)
  ```
  Same at `:10481` for `PlatformAuditLog.platformActorUser`.
  A hard user delete exists and is reachable: `modules/users/users.service.ts:500 async remove(`.
  The read side then renders the row as unattributed —
  `modules/audit/audit.service.ts:158`: `: 'System',`.
- **Current behaviour:** An administrator who deletes a user erases that user's
  attribution across the tenant's entire audit history in one operation. The rows
  survive; the "who" does not.
- **Expected behaviour:** `onDelete: Restrict` on the audit relation, or denormalise
  actor identity (id + e-mail + name at the time) into the row so deletion cannot erase
  it. The service already does exactly this for platform actors —
  `audit.service.ts:92-100` snapshots `{ id, email, fullName, role }` into `scope`.
- **Risk:** A deliberate cover-up is a single `DELETE /users/:id` away, and it is itself
  audited only as `USER_DELETED` — one row, next to hundreds now reading "System".
- **Remediation:** Denormalise `actorEmail`/`actorName` onto `AuditLog` at write time
  (extend `resolveTenantAuditActor`), and change `onDelete` to `Restrict`.
- **Difficulty:** MEDIUM (migration + backfill) · **Regression risk:** MEDIUM · **Fix now:** LATER

---

### OBS-21 — The audit log is append-only in application code but is hard-deleted by tenant erasure, and carries no integrity chain

- **Category:** Auditability / Integrity
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** NEW (the erasure behaviour is intentional and documented; its interaction
  with audit integrity is not recorded anywhere)
- **Component:** `modules/audit`, `modules/tenant-control-plane`
- **Evidence:**
  **Good:** no application code updates or deletes audit rows —
  `rg "auditLog\.(delete|deleteMany|update|updateMany)|platformAuditLog\.(delete|deleteMany|update|updateMany)" services/api/src services/api/prisma services/api/scripts`
  → **zero matches**. No retention job targets audit (the only retention loop is
  `modules/error-logs/error-logs.service.ts:277-310`, on `ErrorLog`).
  The controller is read-only — `modules/audit/audit.controller.ts:19 @Get()`,
  `:29 @Get(':id')`, both `@Permissions('audit.read')`. A tenant admin therefore
  **cannot** edit or delete audit rows through the API.
  **But:** `modules/tenant-control-plane/tenant-erasure.constants.ts:252` lists
  `'auditLog',` inside `TENANT_ERASURE_DELETE_ORDER` and *not* in
  `TENANT_ERASURE_PRESERVED_MODELS` (`:140`); it is executed at
  `modules/tenant-control-plane/tenant-erasure.service.ts:545`
  (`const result = await delegate.deleteMany({ where: { tenantId } });`). Independently,
  `schema.prisma:10456` `tenant Tenant @relation(..., onDelete: Cascade)` would take the
  rows anyway when `tenant-erasure.service.ts:555` deletes the tenant.
  No `hash`, `prevHash` or signature column exists on either audit model
  (`schema.prisma:10440-10489`).
  Audit is **not** retained separately from operational data: same database, same
  Postgres instance, same backup.
  Five services read `auditLog` directly rather than through the repository —
  `modules/dashboard/dashboard.service.ts:2128`,
  `modules/super-admin/super-admin.service.ts:1243`,
  `modules/tenant-control-plane/tenant-control-plane.service.ts:93,754`,
  `modules/users/users.repository.ts:784` — read-only, but bypassing the tenant scoping
  at `audit.repository.ts:60`.
- **Current behaviour:** Append-only by convention and by API surface; destroyable in
  bulk by a platform operator running tenant erasure; tamper-evident nowhere.
- **Expected behaviour:** For a compliance audit trail, either an integrity chain
  (hash of the previous row) or write-only database credentials, plus separate
  retention.
- **Risk:** Anyone with direct database access (a platform operator, a compromised
  `DATABASE_URL`, a restored backup) can alter history undetectably. Tenant erasure
  destroys the evidence of what was erased — the erasure itself is recorded, but only in
  `PlatformAuditLog`.
- **Remediation:** Low priority relative to the coverage gaps. If pursued: add
  `prevHash`/`rowHash` columns computed in `AuditRepository.create`, and export audit
  rows to append-only storage before tenant erasure.
- **Difficulty:** HIGH · **Regression risk:** MEDIUM · **Fix now:** NO

---

### OBS-22 — The audit IP address on authentication events is read from `X-Forwarded-For` without the trust check the codebase built for exactly this

- **Category:** Auditability / Forensics
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED (missing trust gate) / LIKELY (end-to-end spoofability, see
  the unverified link below)
- **Known:** NEW
- **Component:** `services/api/src/modules/auth/auth.service.ts`
- **Evidence:**
  `modules/auth/auth.service.ts:2492-2497` — the only producer of the IP that reaches
  the audit trail:
  ```ts
  function getAuthRequestInfo(req?: Request) {
    const forwardedFor: string | string[] | undefined = req?.headers['x-forwarded-for'];
    const ipAddress = Array.isArray(forwardedFor) ? forwardedFor[0]
      : forwardedFor?.split(',')[0]?.trim() || req?.ip || null;
  ```
  There is no trust check. The codebase's own correct implementation, written for the
  identical problem, is `common/security/client-ip.ts:26-34`:
  ```ts
  export function resolveClientIp(request: Request): string {
    if (isProxyTrusted(request)) {
      const forwarded = readForwardedForClientIp(request.headers['x-forwarded-for']);
      if (forwarded) return forwarded;
    }
    return request.ip ?? request.socket?.remoteAddress ?? 'unknown';
  }
  ```
  with the reasoning spelled out at lines 15-20: *"reachable directly, it is an
  attacker-controlled string and trusting it would hand any caller an unlimited supply
  of identities to rotate through. So the same `isProxyTrusted` decision that governs
  the forwarded host governs the forwarded address."* `getAuthRequestInfo` does not use
  it.
  **Unverified link:** whether Render's edge overwrites or appends to a client-supplied
  `X-Forwarded-For`. If it overwrites, direct-to-API forgery is the only vector; if it
  appends after the client value, the leftmost entry is client-controlled on every
  request. Either way the API is publicly reachable, so the direct vector exists.
- **Current behaviour:** The IP address recorded against every login, and every login
  failure, in the tenant audit trail may be a value the caller chose.
- **Expected behaviour:** `getAuthRequestInfo` calls `resolveClientIp(req)`.
- **Risk:** An attacker brute-forcing an account can make every audited failure appear
  to originate from an arbitrary address — including a colleague's. Any incident
  response keyed on the audited IP is then actively misleading, which is worse than
  having no IP at all.
- **Remediation:** One-line change in `auth.service.ts:2492` to delegate to
  `resolveClientIp` from `common/security/client-ip.ts`. Add a spec asserting a forged
  `X-Forwarded-For` is ignored when `isProxyTrusted` is false.
- **Difficulty:** LOW · **Regression risk:** LOW · **Fix now:** YES

---

### OBS-23 — The eight forensic questions, answered

For a sensitive change today — take "employee EMP-0007's salary was raised":

| Question | Answerable? | Evidence |
|---|---|---|
| **Who** | **YES**, unless the actor has since been deleted | `AuditLog.actorUserId` — `schema.prisma:10445`; nulled on user delete (OBS-20) |
| **What** | **YES** | `action`, `entityType`, `entityId` — `schema.prisma:10446-10448`; `compensation.service.ts:200-210` |
| **When** | **YES** | `createdAt @default(now())` — `schema.prisma:10455` |
| **From what value** | **YES for compensation, payroll, roles, attendance; NO for termination, contracts, user updates, billing** | `compensation.service.ts:209 beforeSnapshot: existing`; snapshots are **optional** in the signature (`audit.service.ts:25-26`) and nothing requires a before/after pair on an update |
| **To what value** | **YES**, same scope | `compensation.service.ts:210 afterSnapshot: updated`; money deliberately survives redaction (`audit-snapshot.ts:40-41`) |
| **For which employee** | **PARTLY** — only via the generic `entityType`/`entityId` pair; there is **no `employeeId` column**, so "everything that ever happened to EMP-0007" is not a query, it is a scan across entity types | `schema.prisma:10440-10466` |
| **Which tenant** | **YES** | `AuditLog.tenantId` — `schema.prisma:10442`, indexed six ways. Platform actions land in `PlatformAuditLog`, which has **no tenant column at all** (`:10468-10489`), so a platform admin's action *on* a tenant is not tenant-attributable |
| **Which session** | **NO** — except for login events, where it is buried in `afterSnapshot` JSON and is unindexed and unfilterable | `audit.service.ts:215-218`; OBS-19 |

**Five and a half of eight.** The two structural misses — no per-employee axis, no
session/request axis — are the ones that turn a forensic question into a manual
reconstruction.

---

## Part 3 — Privacy and data protection

### OBS-24 — Employee bank account numbers, IBANs, CNICs and tax identifiers are stored in plain text, while a working AES-256-GCM service in the same codebase encrypts SMTP passwords

- **Category:** Privacy / Encryption at rest
- **Severity:** CRITICAL
- **Confidence:** CONFIRMED
- **Known:** NEW (grep for `"encryption at rest"|"field-level encryption"|pii|"personally identifiable"` across `docs/knowledge`, `docs/bugs`, `docs/backlog` → **zero files**)
- **Component:** `services/api/prisma/schema.prisma`, `services/api/src/common/security/secret-encryption.service.ts`
- **Evidence:**
  The service exists and works —
  `services/api/src/common/security/secret-encryption.service.ts:26`
  `const ALGORITHM = 'aes-256-gcm';`, 12-byte IV (`:28`), format
  `enc:v1:<iv>:<authTag>:<ciphertext>` (`:25`), key from `SECRET_ENCRYPTION_KEY` with
  fallback `APP_ENCRYPTION_KEY` (`:39-41`), and it fails closed in production
  (`:52-55`). `render.yaml` declares `SECRET_ENCRYPTION_KEY` as required.
  Its own header states the threat it was built for (`:16-20`): *"written to the
  database as plain JSON… Masking them in API responses hid them from the screen but not
  from anyone with database access, a backup, or a replica."*
  **The complete list of call sites** —
  `rg "\.encrypt\(|encryptSecrets\(" services/api/src --glob '!*.spec.ts'`:
  ```
  modules/agent/dlp/dlp.service.ts:129            clipboard text
  modules/agent/dlp/dlp.service.ts:183            screenshot bytes
  modules/platform-communications/platform-email-settings.service.ts:169   smtp password
  modules/attendance-integrations/integrations/attendance-integration.service.ts:585  connector secret
  modules/notifications/notifications.service.ts:846                       provider config
  ```
  (plus the decrypt counterparts and `gateway-configuration.service.ts:394`,
  `email-execution.service.ts:451`, `platform-email-provider.resolver.ts:94`).
  **Not one touches an employee financial or identity column.**
  Those columns are plain `String?` with no `@db.` annotation:
  ```
  schema.prisma:9374  EmployeeBankAccount.accountNumber        String?
  schema.prisma:9375  EmployeeBankAccount.iban                 String?
  schema.prisma:9376  EmployeeBankAccount.swiftOrRoutingCode   String?
  schema.prisma:10263 EmployeeCompensation.bankAccountNumber   String?
  schema.prisma:10264 EmployeeCompensation.bankIban            String?
  schema.prisma:10265 EmployeeCompensation.bankRoutingNumber   String?
  schema.prisma:10266 EmployeeCompensation.taxIdentifier       String?
  schema.prisma:4966  Employee.cnic                            String?
  schema.prisma:10090 EmployeeTaxProfile.taxIdentificationNumber String?
  schema.prisma:9411  EmployerBankAccount.accountNumber        String?
  ```
  Contrast `schema.prisma:10895 ClipboardCaptureEvent.encryptedContent String?` — the
  one PII column that *is* encrypted, and documented as such at `:10870-10872`.
  Values are written raw — `modules/loans/loans.service.ts:829-830`:
  ```ts
  accountNumber: dto.accountNumber?.replace(/\s/g, '') || null,
  iban: dto.iban?.replace(/\s/g, '').toUpperCase() || null,
  ```
  `Employee.cnic` additionally sits under `@@unique([tenantId, cnic])`
  (`schema.prisma:5113`), which structurally forecloses non-deterministic encryption of
  that column without a schema change.
- **Current behaviour:** Every employee's national id and full bank details are readable
  by anyone with database access, a replica, a backup file, or a leaked `DATABASE_URL`.
  Neon (the production database) provides volume-level encryption at rest; there is no
  field-level protection above it.
- **Expected behaviour:** The same `SecretEncryptionService` applied to
  `EmployeeBankAccount.{accountNumber,iban,swiftOrRoutingCode}`,
  `EmployeeCompensation.{bankAccountNumber,bankIban,bankRoutingNumber}`,
  `EmployeeTaxProfile.taxIdentificationNumber` and `Employee.cnic`; the uniqueness
  constraint on `cnic` replaced by a deterministic HMAC column.
- **Risk:** A single database credential leak, a mis-scoped read replica, or an
  unencrypted backup exposes the national identity number and bank account of every
  employee of every tenant. This is the highest-value dataset the product holds and it
  has the least protection of any secret in the codebase — less than an SMTP password.
- **Remediation:** Expand/backfill/contract migration per `PLANS.md`: add
  `accountNumberEnc` columns, dual-write, backfill, switch reads, drop plaintext. Add
  `cnicHmac` for uniqueness and drop `@@unique([tenantId, cnic])`. Requires an ExecPlan.
- **Difficulty:** HIGH · **Regression risk:** HIGH · **Fix now:** LATER (but plan now)

---

### OBS-25 — `FieldSecurityRule` masking is enforced only in the browser; the API sends the full value

- **Category:** Privacy / AuthZ
- **Severity:** CRITICAL
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/tenant-settings/field-security.controller.ts`, `apps/web`
- **Evidence:**
  The feature is real and configurable — `schema.prisma:7594 model FieldSecurityRule`
  with `visibility` (VISIBLE/HIDDEN/MASKED) and `maskingPattern`, and a runtime endpoint
  that compiles rules — `modules/tenant-settings/field-security.controller.ts:718-763`
  emitting `effect: 'deny'` / `effect: 'mask'`.
  Nothing on the server consumes them:
  `rg "applyFieldSecurity|maskingPattern|fieldSecurityRule" services/api/src --glob '!*.spec.ts'`
  returns hits **only** inside `field-security.controller.ts` itself (the CRUD) and one
  entry in `tenant-erasure.constants.ts:316`. There is no interceptor, no service, no
  serializer that applies them.
  The only consumers are React pages:
  ```
  apps/web/app/(authenticated)/employees/[employeeId]/page.tsx:55
    "/field-security-policies/runtime-rules?entityKey=employees"
  apps/web/app/(authenticated)/employees/[employeeId]/edit/page.tsx:60   (same)
  ```
- **Current behaviour:** A tenant administrator configures "mask salary for managers",
  the screen honours it, and the API response still contains the unmasked value. Any
  direct API call, browser DevTools network tab, or `curl` with the session cookie
  returns the field in full.
- **Expected behaviour:** `AGENTS.md`: *"Permissions in the UI are cosmetic… Every gated
  action must also be enforced server-side."* A field-security rule is a gate.
- **Risk:** The product sells a data-protection control that does not protect data. A
  tenant relying on it to satisfy an internal policy or a regulator is misled — which is
  worse than not offering the feature, because it substitutes for a real control.
- **Remediation:** Add a Nest interceptor (there are currently none — OBS-04) that
  resolves the caller's field-security rules for the responding entity and strips or
  masks fields before serialisation; or apply them in the runtime data layer
  (`modules/data/`) where entity projections are already assembled.
- **Difficulty:** HIGH · **Regression risk:** MEDIUM · **Fix now:** YES (at minimum,
  stop presenting it as a security control until it is enforced)

---

### OBS-26 — The employee list and detail projection returns CNIC, date of birth, home address, emergency contacts and tax identifier to anyone holding `dashboard.view`

- **Category:** Privacy / AuthZ
- **Severity:** CRITICAL
- **Confidence:** CONFIRMED
- **Known:** NEW (BUG-0001, `Status: VERIFIED`, `ResolvedAt: 2026-08-17`, fixed the
  *compensation* half of this — the employee record itself was not in its scope)
- **Component:** `services/api/src/modules/employees/`
- **Evidence:**
  `modules/employees/employees.service.ts:3556 private mapEmployee()` returns, without
  any field-level gate:
  ```
  :3587  dateOfBirth: employee.dateOfBirth,
  :3592  cnic: employee.cnic,
  :3604  addressLine1: employee.addressLine1,
  :3625  emergencyContactPhone: employee.emergencyContactPhone,
  :3641  taxIdentifier: employee.taxIdentifier,
  ```
  It is the shared projection for the **list** (`employees.service.ts:345, 389`) and the
  **detail** (`:435`).
  The detail endpoint is gated on the weakest legacy key in the product —
  `modules/employees/employees.controller.ts:206-208`:
  ```ts
  @Get(':employeeId')
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  ```
  (`GET :employeeId/compensation` at `:446-447` is likewise `@Permissions('dashboard.view')`,
  against `@Put :employeeId/compensation` at `:459-460` which requires `payroll.write`.)
  The money half **is** correctly gated, by BUG-0001 —
  `modules/employees/employee-profiles.service.ts:617-641, 660-661`:
  ```ts
  private canViewCompensation(...)
    if (accessMode === 'SELF') return true;
    if (permissions.has(PERMISSION_KEYS.COMPENSATION_READ) || ... PAYROLL_READ) ...
  ...
    if (!this.canViewCompensation(currentUser, accessMode)) { return null; }
  ```
  That is the **only** field-level gate in the module. Identity and contact data has
  none.
- **Current behaviour:** Any user whose row-level scope reaches an employee — a team
  lead with `TEAM` scope, for instance — receives that employee's national identity
  number, date of birth, home address and emergency contact details in the *list*
  response, for every employee in scope, on a page they open routinely.
- **Expected behaviour:** Identity and contact fields gated the way compensation is, and
  the detail endpoint gated on `employees.read` rather than `dashboard.view`.
- **Risk:** Bulk PII exposure to low-privilege staff with no audit trail (OBS-12), and
  a CNIC is a reusable identity credential in the product's primary market.
- **Remediation:** Extend the `canViewCompensation` pattern to a
  `canViewIdentityFields` gate applied inside `mapEmployee`, defaulting to `SELF` plus
  an explicit `employees.pii.read` permission; change
  `employees.controller.ts:207` and `:446` to `@Permissions('employees.read')`.
- **Difficulty:** MEDIUM · **Regression risk:** MEDIUM (screens will lose fields) ·
  **Fix now:** YES
- **Routing note:** overlaps the AuthZ specialist's area; recorded here because the
  exposure is of personal data.

---

### OBS-27 — No individual erasure or anonymisation path exists, and employee deletion is soft, so personal data survives deletion indefinitely

- **Category:** Privacy / Retention
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** NEW for the individual-erasure gap. KNOWN for tenant erasure
  (ITEM-0003, `DONE` scope-reduced; QA-TENANT-005) and for the missing published policy
  (ITEM-0053, open).
- **Component:** `modules/employees`, `modules/tenant-control-plane`, `docs/`
- **Evidence:**
  Employee deletion is soft only — `schema.prisma:5094-5096`
  (`deletedAt DateTime?`, `isDeleted Boolean @default(false)`);
  `modules/employees/employees.controller.ts:87` and `:252` both route to `bulkDelete`,
  which sets `const deletedAt = new Date()` (`employees.service.ts:1407`). There is no
  `prisma.employee.delete` anywhere in the module. Reads filter
  `isDeleted: false, deletedAt: null` (`employees.repository.ts:243, 260-261, 284-285, …`).
  So a "deleted" employee's CNIC, DOB, address, bank rows and salary history all remain.
  No erasure primitives exist: `rg "anonymi|erasure|gdpr|rightToBeForgotten|purge|retention"`
  across `services/api/src` finds matches **only** in `tenant-control-plane` (whole-tenant),
  `modules/agent` + `agent/dlp` (desktop-agent telemetry and DLP captures), and
  `modules/billing` (post-cancellation holds). No `anonymise` function, no subject-access
  endpoint, no per-employee erasure route.
  Retention exists **only** for agent data — `modules/agent/agent.service.ts:1241-1254`,
  `modules/agent/dlp/dlp.service.ts:233-246, 440-468`,
  `schema.prisma:10832 screenshotRetentionDays Int @default(30)` — and for tenants after
  access ends (`render.yaml` `TENANT_RETENTION_DAYS: "60"`). **No retention policy of any
  kind covers HR, payroll, attendance or recruitment tables.**
  Whole-tenant erasure *is* implemented and is genuinely destructive —
  `modules/tenant-control-plane/tenant-control-plane.controller.ts:369-375 @Post(':tenantId/erase')`
  → `tenant-erasure.service.ts:131 async erase(...)`, an ordered `deleteMany` driven by
  an explicit list (`tenant-erasure.constants.ts:151`) inside one transaction
  (`tenant-erasure.service.ts:84, 229`) with row counts recorded (`:240`).
  No privacy or retention document exists in `docs/` —
  `find docs -iname '*privacy*' -o -iname '*retention*' -o -iname '*gdpr*' -o -iname '*erasure*'`
  returns only the backlog/QA records above, of which ITEM-0053 ("publish privacy policy
  and terms") is still open.
- **What a GDPR-style erasure request could satisfy today:**
  - *"Delete my whole company's data"* — **YES**, `POST /tenants/:id/erase` genuinely
    removes rows in dependency order, DLP tables included.
  - *"Delete my personal data as an individual employee"* — **NO**. There is no code
    path. The best available action is a soft delete that hides the row and retains
    every field.
  - *"Tell me who accessed my file"* — **NO** (OBS-16).
  - *"Rectify / export my data"* — **NO dedicated path**; only whatever the employee
    self-service screens happen to show.
  - *"Confirm it is gone from backups and logs"* — **NO**. Neon backups and the Render
    log stream retain whatever they retain; nothing tracks or purges them, and PII does
    reach logs (OBS-14, OBS-07).
- **Risk:** The product cannot honour an individual erasure or subject-access request,
  which for an HR platform operating in or selling to GDPR jurisdictions is a direct
  compliance failure, and one the customer inherits as controller.
- **Remediation:** (1) Implement `EmployeesService.anonymise(employeeId)` — null or hash
  `cnic`, `dateOfBirth`, addresses, personal contact, emergency contacts, bank rows —
  retaining only what payroll law requires, audited. (2) Define a retention policy per
  data class and enforce it, reusing the DLP retention pattern. (3) Publish the privacy
  policy (ITEM-0053). Needs an ExecPlan and a legal decision on statutory retention
  minimums.
- **Difficulty:** HIGH · **Regression risk:** MEDIUM · **Fix now:** LATER (plan now)

---

### OBS-28 — The API sets no security response headers: no HSTS, no `nosniff`, helmet is not installed

- **Category:** Transport security
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** KNOWN for the frontends (BUG-0040, `Status: VERIFIED` — fixed for
  `apps/web` and `apps/landing`); NEW for the API, which the fix did not cover
- **Component:** `services/api/src/main.ts`, `packages/config/security-headers.js`
- **Evidence:**
  `rg -rn helmet services apps --include=*.ts --include=*.json --include=*.js`
  (excluding `node_modules`) → **zero results**. Not installed, not imported.
  `services/api/src/main.ts` sets only `trust proxy` (`:58-62`), `cookieParser()`
  (`:92`), body parsing and CORS (`:96`). No `Strict-Transport-Security`, no
  `X-Content-Type-Options`, no `Referrer-Policy` on any API response.
  The Next apps **do** set them, from one shared definition —
  `packages/config/security-headers.js:73-74`:
  ```js
  key: "Strict-Transport-Security",
  value: "max-age=63072000; includeSubDomains",
  ```
  consumed by `apps/web/next.config.ts:29` and `apps/landing/next.config.ts:22`.
  No `preload` token.
  Cookies are configurable rather than hardcoded —
  `services/api/src/common/config/auth.config.ts:306-351` — and line 335 refuses the one
  genuinely unsafe combination in production-like environments:
  ```ts
  if (isProductionLike(configService) && sameSite === 'none' && !secure) { ... }
  ```
  **Gap:** `secure` is only forced when `sameSite === 'none'`. A production deployment
  configured `sameSite=lax, secure=false` passes both this check and
  `config/env.validation.ts:85-94`, and would emit auth cookies over plain HTTP.
  No plain-HTTP path was found in `render.yaml`.
- **Current behaviour:** `api.dijipeople.com` responses carry no HSTS. Because the API
  is called directly by the Electron agent and the .NET gateway — clients with no
  browser HSTS cache — a downgrade on the first connection is not mitigated.
- **Expected behaviour:** `helmet()` in `main.ts` with HSTS and `nosniff`, matching
  `packages/config/security-headers.js`; `secure: true` unconditional in production.
- **Risk:** First-connection downgrade for non-browser clients; MIME sniffing on API
  responses.
- **Remediation:** Add `helmet` to `services/api` and configure it from
  `packages/config/security-headers.js` so the API and the apps cannot drift; change
  `auth.config.ts:335` to require `secure` in every production-like configuration.
- **Difficulty:** LOW · **Regression risk:** LOW · **Fix now:** YES
- **Routing note:** belongs partly to the Security/AuthN specialist.

---

### OBS-29 — `exportEmployeeProfile` skips the row-level access scope

- **Category:** AuthZ / Privacy
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/employees/employees.service.ts`
- **Evidence:**
  `modules/employees/employees.controller.ts:216-217` gates on `employees.export`. The
  service then reads by id and tenant only —
  `modules/employees/employees.service.ts:1985`:
  ```ts
  const employee = await this.findById(currentUser.tenantId, employeeId);
  ```
  `findById` (`:425-436`) filters on `tenantId` alone and does not apply
  `buildReadableEmployeeWhere`. Contrast the **list** export, which does hold —
  `employees.service.ts:1886-1890` delegates to `findByTenant`, which builds
  `buildScopedAccessWhere<Prisma.EmployeeWhereInput>(… ENTITY_KEYS.EMPLOYEES, SecurityPrivilege.READ)`
  at `:320-329` and short-circuits self-service users to their own row plus direct
  reports at `:331-344`.
- **Current behaviour:** Any holder of `employees.export` can export any employee in the
  tenant regardless of their OWN/TEAM/BUSINESS_UNIT scope. The payload is limited
  (`:1990-2023`: code, name, work e-mail, phone, status, department, designation,
  owner), so impact is bounded — but the scope check is genuinely absent.
- **Expected behaviour:** `findById` replaced with the scoped read used by the list path.
- **Risk:** Scope bypass for directory data. Bounded, but it is a hole in a control that
  is otherwise correctly applied two methods away.
- **Remediation:** Use `buildReadableEmployeeWhere` in `exportEmployeeProfile`.
- **Difficulty:** LOW · **Regression risk:** LOW · **Fix now:** YES
- **Routing note:** belongs to the AuthZ / tenant-isolation specialist.

---

### OBS-30 — Error-log downloads expose route params, query strings and IP addresses to any tenant support-role user

- **Category:** Privacy
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `modules/error-logs`
- **Evidence:**
  `modules/error-logs/error-log.formatter.ts:62-86` renders
  `IP address`, `Route Parameters`, `Query Parameters` and `Request Body` into the
  downloadable text file. Access is `modules/error-logs/error-logs.service.ts:230-240`:
  any user holding a tenant support role — `isSupportUser` at `:312-321`
  (`global-admin`, `system-admin`, `system-customizer`, …) — may read any log **in
  their own tenant**, plus the log's owner.
  `modules/error-logs/error-logs.service.ts:227-232` explicitly fixed the cross-tenant
  half of this (the comment at `:211-226` records that the support branch previously
  returned on role alone), so the remaining exposure is intra-tenant only.
  `Request Body` is `N/A` in practice because `includeRequestBody` defaults false
  (OBS-07).
- **Current behaviour:** A tenant support user can read the search terms and IP address
  of any colleague whose request failed.
- **Expected behaviour:** Query strings redacted by the shared key list (OBS-07); IP
  address restricted to platform monitoring.
- **Risk:** Minor intra-tenant PII exposure to a privileged role.
- **Remediation:** Fold OBS-07's key list into `sanitizeForErrorLog`; drop `IP address`
  from the tenant-facing formatter.
- **Difficulty:** LOW · **Regression risk:** LOW · **Fix now:** NO

---

### OBS-31 — Error-log incident fingerprints include the full path with record ids, so a scan produces one incident row per probed id

- **Category:** Observability / Availability
- **Severity:** INFORMATIONAL
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/error-logs/error-logs.service.ts`
- **Evidence:**
  `modules/error-logs/error-logs.service.ts:456-480` — the message is normalised
  (`.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id')`) but the **path is not**:
  ```ts
  return createHash('sha256').update([input.sourceApp, input.errorCode, input.method ?? '', input.path ?? '', stableMessage].join('|')).digest('hex');
  ```
  and `path` is `request.originalUrl` (`http-exception.filter.ts:135`), which carries
  both the record UUID and the query string.
- **Current behaviour:** A tenant-isolation probe across 10,000 employee ids creates
  10,000 distinct `ErrorLog` incidents rather than one with `occurrenceCount: 10000`.
- **Risk:** Cuts both ways: it makes a probe visible in the row count (a detection
  positive, per OBS-12), and it lets any authenticated user inflate the monitoring
  queue — the failure mode BUG-1754 already documents from benign traffic.
- **Remediation:** Normalise UUIDs and strip the query string from `path` before
  fingerprinting; keep the full path in `diagnosticJson`.
- **Difficulty:** LOW · **Regression risk:** LOW · **Fix now:** NO

---

## Healthy — verified good

These were checked specifically and are correctly implemented. Several are better than
the industry norm and deserve to be recorded as such.

- **Audit snapshots are redacted centrally, not at the call site.**
  `modules/audit/audit.service.ts:255-269` runs every snapshot through
  `redactAuditSnapshot` inside `normalizeSnapshot`, so a call site that forgets is
  still safe. `modules/audit/audit-snapshot.ts:43-58` redacts `cnic`, `nationalid`,
  `passportnumber`, `taxidentifier`, `ssn`, `accountnumber`, `iban`, `swiftcode`,
  `routingnumber`. And it deliberately does **not** redact money (`:40-41`: *"A
  compensation change is precisely the kind of thing an audit trail exists to record, so
  salaries and amounts stay"*) — exactly the right call for an HR audit trail.
- **Salary and compensation changes are audited with true before/after values.**
  `modules/compensation/compensation.service.ts:200,209-210`
  (`beforeSnapshot: existing, afterSnapshot: updated`), seven sites;
  `salary-package-rules.service.ts:134,140-141`;
  `pay-components.service.ts:195,201-202`. The brief asked that an HR platform which
  audits salary changes properly be given credit — it does.
- **Bank details are masked before they reach the audit row, and again by the central
  redactor.** `modules/loans/loans.service.ts:848,914` (`iban: mask(created.iban)`),
  `modules/payroll/employer-bank-accounts.service.ts:126-127`
  (`beforeSnapshot: maskEmployerBankAccount(existing)`). Defence in depth, correctly.
- **Payroll finalisation and disbursement are audited with before/after.**
  `modules/payroll/payroll-operations.service.ts:923`
  (`this.audit(user, 'PAYROLL_RUN_FINALIZED', runId, run, finalized)`), `:1751`
  (`PAYROLL_RUN_DISBURSED`), plus eleven adjacent actions.
- **Authentication events are audited with IP, user agent, app client and session.**
  `modules/auth/auth.service.ts:1748-1766`, called on `USER_NOT_FOUND`,
  `IDENTITY_SUSPENDED`, `ACCOUNT_LOCKED` and `PASSWORD_MISMATCH`
  (`:1301, 1341, 1370, 1412`), each with a distinct `failureReason` while returning an
  identical response to the caller (`:1391-1393`: *"Deliberately the same response as a
  wrong password: naming the lock confirms the account exists"*). This is the single
  best-instrumented path in the product.
- **`sanitizeForErrorLog` recurses correctly and covers the credential-shaped keys.**
  `common/errors/sanitize-error-log.ts:18-34` handles nested objects, arrays and Dates
  with a depth guard; `refreshToken`, `accessToken`, `Authorization`, `Set-Cookie`,
  `apiKey`, `otp` and `DATABASE_URL` all normalise into the pattern list at `:1-14`. The
  specific concern in the brief — a redactor missing `refreshToken` or nested objects —
  is **NOT OBSERVED**.
- **Full request bodies are not persisted.** `common/errors/error-config.ts:27-31` —
  `includeRequestBody` defaults `false` and `ERROR_LOG_INCLUDE_REQUEST_BODY` is set
  nowhere in the repository. Payroll and employee payloads therefore do not reach the
  error store.
- **NOT OBSERVED: no fetch interceptor logs response bodies.** The client error path
  captures only the normalised `StandardApiError` envelope —
  `apps/web/app/components/errors/client-error-log.ts:41-55` sends `traceId`,
  `errorCode`, `message`, `path`, `details`, `stack`, `componentStack`, `browserInfo`.
  `apps/web/lib/api-error.ts:135-160` constructs those from the API's error contract,
  not from response payloads. The one PII-adjacent item is
  `client-error-log.ts:11-13`, which includes `window.location.search` in `path`.
- **The client error reporter is rate-limited on the client side.**
  `apps/web/app/components/errors/client-error-log.ts:19-31` — a 60-second per-
  fingerprint cooldown with pruning. (The server has no equivalent — OBS-08.)
- **A trace id is minted for every request and returned in two response headers.**
  `common/middleware/request-id.middleware.ts:22-30`, applied globally
  (`app.module.ts:170-172`), echoed by the exception filter
  (`http-exception.filter.ts:322-340`) and surfaced to the user as
  `support.reference` in the error contract (`http-exception.filter.ts:74-77`). For a
  request that *failed*, a user complaint **can** be turned into the exact record via
  `GET /api/error-logs/:traceId`.
- **Non-incident classification is thoughtful and evidence-driven.**
  `modules/error-logs/expected-protocol-outcome.ts:84-104` files routine 401s and
  unmatched-route 404s as `NOT_AN_INCIDENT` while explicitly refusing to do the same for
  400s, with the reasoning at `:15-29` grounded in a real defect (BUG-1742). 403
  `ACCESS_DENIED` is correctly **not** in the list, so authorization failures stay in
  the queue.
- **Error-log reads are tenant-scoped, including for support roles.**
  `modules/error-logs/error-logs.service.ts:227-242` — `belongsToCallerTenant` is
  required on both branches, and a foreign trace id returns `null` rather than throwing,
  so it stays indistinguishable from one that does not exist. The comment at `:211-226`
  records that the support branch previously did not check tenant.
- **The audit API is read-only.** `modules/audit/audit.controller.ts` exposes only
  `@Get()` and `@Get(':id')`, both `@Permissions('audit.read')` +
  `@RequirePermission(ENTITY_KEYS.REPORTS, 'read')`. No application code updates or
  deletes audit rows (`rg "auditLog\.(delete|update)…"` → zero).
- **DLP captured content is encrypted at rest, consent-gated, retention-bounded, and
  every read of it is audited.** `modules/agent/dlp/dlp.service.ts:129`
  (`this.encryption.encrypt(event.text)`), `:183` (screenshot bytes encrypted before
  storage), `:82-89` and `:155-163` (consent gate, both channels), `:233-246` and
  `:440-468` (retention purge), `:361-380` (`AuditService.log` on every content read).
  `schema.prisma:10828-10832` — all four capture switches default `false`. This is the
  most carefully built privacy feature in the product and it is the model the rest of
  the codebase should follow (contrast OBS-16, OBS-24).
- **Employee CSV export is materially narrower than the API's own list response.**
  `modules/employees/employees.service.ts:1883-1932` omits `basicSalary`,
  `bankAccountNumber`, `bankIban`, `cnic`, `taxIdentifier` and `dateOfBirth` entirely.
  It emits personal e-mail, personal phone and emergency contact
  (`:1901-1902, 1919-1921`), which is worth trimming, but **a low-privilege user cannot
  export salaries or bank details** — the scoped `where` at `:1886-1890 → :320-344`
  holds. Answering the brief's question directly: **no**.
- **Field-level compensation gating exists and works.**
  `modules/employees/employee-profiles.service.ts:617-641, 660-661` — `SELF` always,
  otherwise `COMPENSATION_READ` / `COMPENSATION_MANAGE` / `PAYROLL_READ`. The BUG-0001
  fix is real.
- **Tenant erasure genuinely deletes.**
  `modules/tenant-control-plane/tenant-erasure.service.ts:131, 540-555` — an ordered
  `deleteMany` driven by an explicit model list rather than relying on cascade, in one
  transaction so a partial failure erases nothing, with per-model row counts recorded
  (`:240 erasedRecordCounts`). DLP and field-security tables are included
  (`tenant-erasure.constants.ts:222, 313-316`).
- **Client IP resolution for rate limiting is correct and well reasoned.**
  `common/security/client-ip.ts:26-34` gates `X-Forwarded-For` behind `isProxyTrusted`;
  `packages/config/client-ip.js:31-40` reads the leftmost entry with the reasoning
  written down. (`getAuthRequestInfo` fails to use it — OBS-22.)
- **The deployed commit is exposed on `/api/health`** (`config/env.validation.ts:227-238`,
  `commit` + `commitShort`), which ITEM-0010 added and which makes "which SHA is
  serving" answerable from outside.
- **Log-level resolution accepts `info`/`warning`/`trace` as aliases and warns on an
  unrecognised value instead of silently falling back.**
  `services/api/src/log-level.ts:48-79`, with the incident that motivated it recorded at
  `:29-46`.
- **The outbox marks undeliverable work `MANUAL_ACTION_REQUIRED` rather than dropping
  it,** and refuses to invent a recipient —
  `modules/notifications/lifecycle-notification.handler.ts:17-27, 69-73`. The design is
  right; only the delivery half is missing (OBS-02).

---

## Not examined / limits

- **Nothing was executed against a running system.** No API was started, no database was
  queried, no production environment was inspected. Every finding is from reading code
  and configuration at `f55cf4b2`. In particular I did **not** verify: the actual
  `LOG_LEVEL` set on the live Render service (only that `render.yaml` does not declare
  one, and `render.yaml` is known to diverge from the dashboard — see the BUG-0767
  warning in that file); Render's actual log retention window; whether any external
  alerting exists outside the repository (a Render notification rule, an UptimeRobot,
  a Neon alert); and the real contents of the production `ErrorLog` and `AuditLog`
  tables.
- **OBS-22's exploitability has one unverified link**: whether Render's edge overwrites
  or appends to a client-supplied `X-Forwarded-For`. The missing trust gate in
  `getAuthRequestInfo` is CONFIRMED; end-to-end spoofing through the edge is LIKELY.
- **`apps/admin`'s client error path was not read in full.** I confirmed it posts to
  `/api/error-logs/client` (`apps/admin/components/errors/error-provider.tsx`,
  `apps/admin/app/api/error-logs/client/route.ts`) and assumed it mirrors
  `apps/web`'s shape. If it captures more, OBS-08 widens.
- **`apps/agent-desktop` (Electron) and `gateway/` (.NET) logging were not examined.**
  The desktop agent handles clipboard and screenshot content locally before it reaches
  the API, and its local logging is a real privacy surface that this audit did not open.
- **The 33 % audit-coverage ratio is an upper bound on coverage, not a precise figure.**
  234 `AuditService.log` sites against 719 mutating handlers counts sites, not logical
  operations: several modules route many writes through one private wrapper
  (`loans.service.ts:1168`, `payroll-run.service.ts:2779`,
  `payroll-operations.service.ts:2004`), which understates them, while
  `super-admin.service.ts` concentrates 26 sites in one file, which overstates it. The
  per-domain table above is the reliable part; the ratio is directional.
- **Notification/queue processors** (`modules/notifications/processors`, `queues`,
  `jobs`) were read only far enough to establish that the lifecycle handler does not
  send. Their own error handling and logging were not audited.
- **`beforeSnapshot`/`afterSnapshot` population was verified by reading call sites, not
  by inspecting stored rows.** I can say the arguments are passed; I cannot say what
  proportion of production rows have non-null snapshots. BUG-2044's QA run is the only
  evidence of real row contents and it predates several fixes.
- **I did not attempt to quantify how much PII currently sits in the Render log stream.**
  OBS-14 and OBS-07 establish the paths; the volume is unmeasured.
