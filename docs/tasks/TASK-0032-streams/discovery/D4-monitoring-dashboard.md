# D4 — Discovery: Admin Monitoring, Error Capture/Observability, Correlation IDs, Admin Dashboard

Read-only discovery. Worktree: `D:/My Work/hrm-dijipeople/dp-partner-admin`
(branch `agent/partner-agreements-admin-hardening`). No source, git state or
database was modified.

## 0. Prior findings consulted

- `docs/bugs/BUG-3227-...` (DEFERRED, MEDIUM) — a trace id is minted
  (`services/api/src/common/middleware/request-id.middleware.ts:22-30`) and
  returned on every response, but is consumed nowhere except the exception
  filter and `partner-experience.controller.ts:40`. **No HTTP access-log
  interceptor exists** (`rg -ln "NestInterceptor"` returns nothing) — a
  successful request leaves zero log output. Confirmed still true by direct
  read of `request-id.middleware.ts` and `http-exception.filter.ts` (below).
- `docs/bugs/BUG-3183-...` (OPEN, HIGH, `FIX_NOW`) — `PAYMENT_FAILED` /
  `TENANT_PROVISIONING_FAILED` platform-ops alerts are only `logger.log`'d
  (not sent) in `services/api/src/modules/notifications/lifecycle-notification.handler.ts:76-95`,
  and `logger.log` is below the production log level filter
  (`log-level.ts:73-77` → `['error','warn']` in production, `render.yaml` sets
  no `LOG_LEVEL`). Still open — not touched by this discovery.
- `docs/bugs/BUG-3220-...` (DEFERRED, MEDIUM) — `apps/admin/app/` has **zero**
  `loading.tsx`/`error.tsx` anywhere (88 pages), so every admin monitoring/
  dashboard page falls back to Next's unstyled default on a failed
  server-side fetch. Still true — confirmed no `loading.tsx`/`error.tsx` under
  `apps/admin/app/(internal)/settings/monitoring/` or `operations/`.

## 1. Error capture backend

**Trace id minting** — `services/api/src/common/middleware/request-id.middleware.ts`:
reads `ERROR_TRACE_HEADER` (default header name `x-trace-id`) or `x-request-id`
from the incoming request, else mints `req_<uuid>`; sets `req.requestId` and
both `X-Request-Id` / `X-Trace-Id` response headers. Applied globally via
`app.module.ts:170-172` (`forRoutes('*path', ALL)`).

**Exception filter** — `services/api/src/common/filters/http-exception.filter.ts`:
- `resolveTraceId()` (line 362) re-derives/re-sets the trace id defensively.
- Normalizes `AppError`, `HttpException`, Multer upload errors, and Prisma
  errors (`P2002`→duplicate, `P2025`→not-found, `P2003`→constraint,
  connection-loss patterns →`DATABASE_CONNECTION_FAILED`) into one
  `StandardErrorContract` (`success, traceId, timestamp, statusCode,
  errorCode, message, description, path, method, details, fieldErrors,
  support.reference=traceId, stack?`).
- Logs one line per **error** (`logger.error`/`logger.warn`, line 118-122)
  with `traceId, method, path, statusCode, errorCode, severity, userId,
  callerTenantId, platformUserId, platformRole, appClientId, sessionId,
  targetTenantId, routeParams`. This is the **only** structured log line in
  the whole request lifecycle (confirms BUG-3227: nothing logs a successful
  request).
- Calls `ErrorLogsService.persist()` unconditionally for every thrown
  exception (line 124-149).
- `enrichErrorDetails()` (line 424) attaches a `platformActor` block
  (`id, email, role, status, sessionId, appClientId`) to `details` when the
  caller is a platform user — useful context for platform-caused failures.

**Client error endpoint** — `POST /error-logs/client`
(`error-logs.controller.ts:25-86`), guarded by `JwtAuthGuard` (authenticated
users only — there is no unauthenticated client-error sink). Requires a
`traceId` matching `/^(client|admin)_/` (minted client-side, see §2). Frontend
errors are tagged `sourceApp` `web`/`admin` by prefix
(`error-logs.service.ts:450-454 sourceAppFor()`); everything else is `api`.

**Persistence / grouping** — `ErrorLogsService.persist()`
(`error-logs.service.ts:76-183`):
- Sanitizes via `sanitizeForErrorLog` (§ Redaction below), then computes a
  **fingerprint** (`incidentFingerprint()`, line 456-480): SHA-256 of
  `sourceApp|errorCode|method|path|stableMessage`, where the message has
  UUIDs replaced with `:id` and digit runs with `:n` so two occurrences of
  "record :id not found" collapse into one incident regardless of which
  record.
- Upserts into `ErrorLog` by `fingerprint`: first occurrence creates the row
  (`occurrenceCount=1`, `firstSeenAt=lastSeenAt=now`), a repeat increments
  `occurrenceCount` and bumps `lastSeenAt` (this **is** real dedup/grouping —
  see gap in §3, it is not surfaced in the admin UI).
- Every individual occurrence is also recorded in `ErrorLogOccurrence`
  (`traceId` unique, `diagnosticJson` = the full sanitized payload), so a
  single traceId always resolves back to its own full context even after the
  parent incident has been updated by later occurrences.
- `supportStatus` defaults via `initialSupportStatus()`
  (`expected-protocol-outcome.ts`) rather than always `NEW` — session-expiry
  and unmatched-route (404 to a path the app doesn't serve) rows are
  classified `NOT_AN_INCIDENT`/expected rather than queued (this is the
  BUG-1754 fix mentioned in the comments; already landed).
- Table-availability and DB-unavailability are both handled gracefully
  (`P2021` missing table, `P1001/P1002/P1017`/connection-string matches) —
  logging degrades to a one-time warning rather than crashing error handling
  itself.

**Prisma models** (`services/api/prisma/schema.prisma`):
- `ErrorLog` (line 10559-10608): `id, traceId (unique), fingerprint (unique),
  firstSeenAt, lastSeenAt, occurrenceCount, errorCode, statusCode, severity,
  sourceApp, environment, message, description, stack?, cause? (Json),
  details? (Json), method?, path?, params?/query?/requestBody? (Json),
  userAgent?, ipAddress?, userId?, tenantId?, organizationId?,
  businessUnitId?, supportStatus (default NEW), assignedTo?,
  assignedToUserId? (FK → PlatformUser), internalNote?, customerUpdate?,
  resolvedAt?, createdAt, updatedAt`. Indexes on `tenantId+createdAt`,
  `errorCode+createdAt`, `severity+createdAt`, `sourceApp+createdAt`,
  `supportStatus+createdAt`, `lastSeenAt+occurrenceCount`.
- `ErrorLogOccurrence` (10610-10620): `id, incidentId (FK→ErrorLog, cascade),
  traceId (unique), occurredAt, diagnosticJson (Json)`.
- `SupportCaseIncident` (schema.prisma:3808): join table
  `supportCaseId + errorLogId` (unique pair) — lets a support case link one or
  more diagnostic incidents; this is the "related audit event" style linkage
  that exists today, though it links to a *support case*, not directly to an
  `AuditLog`/`PlatformAuditLog` row.
- `AuditLog` / `PlatformAuditLog` (10508-10557) both carry `requestId`,
  `traceId` **and** `sourceModule` columns and are indexed on
  `tenantId+requestId` / `requestId` — the schema already anticipates joining
  an audit trail to a trace id. In practice `AuditService.log()`
  (`modules/audit/audit.service.ts:21-38, 65-67`) only ever receives
  `requestId`/`traceId` as **optional** inputs; a repo-wide grep for call
  sites shows **no controller/service passes `request.requestId`/`traceId`
  into `AuditService.log()`** — the columns exist and are queryable but are
  effectively always `null` today, which is the same root cause BUG-3227
  documents ("thread `req.requestId` into `RequestContextService`... OBS-19"
  proposed but not done). This means the "related audit event" drawer the
  target design wants cannot be built by joining on trace id yet — it would
  need this wiring first (BUG-3227's proposed resolution, still `DEFERRED`).
- There is **no separate `PlatformErrorLog`/`ClientErrorLog`/`Incident`
  model** — `ErrorLog` is shared by all three sources (`web`, `admin`, `api`),
  discriminated by `sourceApp`. There is also no dedicated "incidents" table
  distinct from `ErrorLog`; the admin UI's "incident queue" language refers to
  `ErrorLog` rows.

**Background job / outbox / queue failure capture**: `platform-events`
(`services/api/src/modules/platform-events/`) implements the transactional
outbox side (event persistence + delivery bookkeeping); `PlatformEvent`
records carry `source, result (SUCCEEDED/PENDING/FAILED/IGNORED), severity,
environment, correlationId, entityType/entityId, tenantId, customerAccountId,
occurredAt, metadata` (types read from `apps/admin/.../events/page.tsx:16`).
A failed lifecycle notification (BUG-3183) is recorded as a `PROCESSED`
`PlatformEvent` today rather than surfaced as `FAILED` — i.e. the queue/outbox
mechanism *can* represent failure, but this specific handler currently hides
it (that's the exact BUG-3183 defect).

**Redaction (`sanitize-error-log.ts`)** — recursive, depth-capped at 8, keys
matched (case/separator-normalized) against: `password, token, secret, cookie,
authorization, apikey, api_key, pass, connectionstring, database_url, jwt,
otp`, plus a bare `auth` exact-match, with allowlisted false positives
(`authEnabled`, `smtpAuthEnabled`). **Gaps**:
- `pass` as a substring redacts `passport`, `passcode`, `password2` etc. too
  (over-redaction, not a leak — acceptable) but also would **not** catch a
  field named e.g. `bankAccountNumber`, `nationalId`, `ssn`, `iban`,
  `cardNumber`, `cvv`, `clientSecret` (would be caught by `secret`), `pin`,
  `signingKey` (would be caught by neither `token` nor `secret` unless spelled
  with one of those substrings) — i.e. redaction is a **generic auth-token
  denylist**, not a PII/financial-data denylist. AGENTS.md's own Security
  checklist calls out "national ids or bank details" as sensitive; the error
  log path only guards secrets/credentials, not PII, by pattern.
  `getErrorFrameworkConfig().includeRequestBody` (see `error-config.ts`, not
  read in depth here) gates whether request bodies are stored at all, which
  is the main mitigation for PII in bodies today — worth confirming its
  default before extending the monitoring UI to show raw request bodies.
- Sanitization does **not** run over the `stack` string itself — a stack
  trace containing an interpolated secret in an error message (e.g. `throw
  new Error(`Invalid token ${token}`)`) would not be caught by key-based
  redaction since it's free text, not a keyed object field.
- `sanitizeHeaders()` exists as a thin wrapper but the exception filter never
  actually calls it on `request.headers` — headers are not currently
  persisted into `ErrorLog` at all (only `userAgent`, `ipAddress`), so this is
  moot today but would need wiring if a future "request headers" panel is
  added to the detail view.

## 2. Frontend: trace headers and error normalization

Both `apps/admin/lib/server-api.ts` and `apps/web/lib/server-api.ts` set
**both** `X-Request-Id` and `X-Trace-Id` on every outgoing server-side fetch
to the API (admin: lines 37-40; web: lines 263-266, 353-354, 419-420),
generating a fresh id per call via `createRequestId()` when the caller didn't
supply one. On failure, both read the trace id back from the standard error
contract (`data.traceId`, `admin/lib/server-api.ts:279`; `web/lib/server-api.ts:742-746`
also falls back to the `X-Request-Id` response header) and surface it to the
user as `support.reference`/`Reference: <traceId>` (see
`apps/admin/app/(internal)/page.tsx:52-55` rendering `Reference: ${traceId}`
on a dashboard load failure) rather than a bare generic message — `web`'s
fallback string is literally `"Something went wrong."` (`server-api.ts:719`)
but only as a last-resort default when no message/traceId could be read at
all, not the norm.

Client-side JS errors are posted to `POST /error-logs/client` with a minted
`client_<...>`/`admin_<...>` traceId (`apps/admin/lib/api-error.ts:108`)
carrying `message, statusCode, errorCode, description, stack, details,
componentStack, browserInfo, timestamp, path, method`. This is a genuine
RUM-style client error pipeline, not just a passthrough of server errors.

**Route handlers as thin proxies**: consistent with `apps/admin/AGENTS.md`,
`app/api/platform/logs/events/[traceId]/route.ts` forwards straight to
`/platform/logs/events/:traceId` with no authorization logic of its own.

## 3. Admin monitoring pages — current state

Location: `apps/admin/app/(internal)/settings/monitoring/` (4 tabs via
`MonitoringNav`, `apps/admin/app/_components/monitoring/monitoring-nav.tsx`)
plus a separate, **not** cross-linked, `apps/admin/app/(internal)/operations/provisioning/`
page.

| Tab | Route | Backing endpoint(s) |
|---|---|---|
| Overview | `/settings/monitoring` | `GET /platform/logs/events?pageSize=25...` + `GET /platform/events/overview` (parallel) |
| Incidents / Errors | `/settings/monitoring/error-logs` | `GET /platform/logs/events` (filtered/paged), `GET /platform-users/owner-candidates`, `GET /platform-users/me/module-preferences` |
| Events | `/settings/monitoring/events` | `GET /platform/events` |
| Integrations | `/settings/monitoring/integrations` | `GET /super-admin/billing/diagnostics` |

**Overview** (`monitoring-overview.tsx`, ~ well-commented, recently rewritten
per its own header comment) is genuinely good: three bands — "is anything on
fire" (critical/untriaged counts as links), the actual triage queue
(client-side filter/sort over a 25-row slice with severity/sourceApp/status/
search, "Open in the full queue" preserving filters), and event health by
source. It explicitly says it dropped decorative counters/sparklines that had
no action attached — a deliberate design decision documented in the file.

**Incidents / Errors** (`error-logs-table.tsx`, 1202 lines) is the deep
screen: uses `ProDataTable` (per AGENTS.md convention), auto-refresh (30s
poll), advanced filter drawer, CSV export, and a **support workflow panel**
(`SUPPORT_STATUSES`: New/Investigating/Waiting on customer/Fix in progress/
Resolved; assignment to a platform user or a named team; internal note +
customer-facing update; "Create support case" which POSTs
`/support-cases/from-incident/:traceId` and links the resulting case; a
"Diagnostics" download link to `/api/error-logs/:traceId/download`).
Server-side filters already cover: `search, reference(traceId), severity,
status, sourceApp, environment, tenantId, userId, category(errorCode),
route(path), method, from, to` (`platform-monitoring.service.ts:44-93`,
`error-logs/page.tsx:80-99`).

**Confirmed gaps vs. the target design** (grep of `error-logs-table.tsx` and
`platform-monitoring.service.ts::getEvent`):
- **No occurrence/grouping surfaced in the UI.** `ErrorLog.occurrenceCount`,
  `firstSeenAt`, `lastSeenAt`, `fingerprint` are computed and stored
  (§1) but `PlatformErrorEvent` (the type the table renders,
  `error-logs-table.tsx:39-65`) does **not** include them, and
  `getEvent()` (`platform-monitoring.service.ts:162-191`, used by the detail
  fetch at `error-logs-table.tsx:718`) does not add them either — a support
  agent cannot currently see "this has happened 500 times since 08:00", only
  the latest occurrence's own fields plus `status/assignedTo/notes`.
- **No explicit "module" column/filter.** Grouping today is by `sourceApp`
  (web/admin/api) and `category` (= `errorCode` substring match), not by
  backend module (`employees`, `payroll`, etc.) — `errorCode` is a catalog
  code, not a module name, so filtering "which module is failing" requires
  reading error codes rather than a `module` facet. `sourceModule` exists on
  `AuditLog`/`PlatformAuditLog` but, per §1, is essentially unpopulated and
  isn't on `ErrorLog` at all.
- **No correlation-id-based join to a related audit event.** The detail view
  (`getEvent`) does return `stack, cause, details, request{method,path,
  params,query,body,ipAddress}, client{userAgent}, context{userId,tenantId,
  organizationId,businessUnitId,platformActor}` — a genuinely rich, already
  sanitized detail payload — but nothing in it queries `AuditLog`/
  `PlatformAuditLog` by `traceId`/`requestId`. Building "related audit event"
  requires the BUG-3227 wiring first (audit rows don't reliably carry a trace
  id yet).
- **Detail view is not a slide-over drawer** — the "detail" fetched from
  `/api/platform/logs/events/:traceId` feeds the inline support-workflow
  panel shown under the selected row, not a separate stack/request-metadata
  inspector; there is no visible rendering of `stack`/`request`/`context` in
  `error-logs-table.tsx` even though the API returns them (worth confirming
  by reading the omitted middle of the file if this becomes the actual build
  target — the fields exist server-side and just need a panel).

**Events tab** (`events/page.tsx`, business/system event stream, distinct
from the incident queue by design — "without mixing it into the incident
queue") already has: `search, source(LANDING/WEB_APP/ADMIN/API/BACKGROUND/
STRIPE/EMAIL/INTEGRATION), result(SUCCEEDED/PENDING/FAILED/IGNORED),
severity, environment, correlationId, tenantId, customerAccountId, eventCode,
from/to` filters, and a table with a `<details>` expandable JSON metadata
blob per row and a monospace correlation-id column. This is close to the
"grouped errors with correlation id" ask already, just for the event stream
rather than the error stream.

**Integrations tab** is thin — two static cards (Stripe: configured/action
required from `/super-admin/billing/diagnostics`; Platform email: always
"Review provider", no live check) linking out to settings pages. **No queue
depth, no DB health, no auth service health, no storage health tile exists
anywhere in the admin app** — confirmed by absence of any such widget across
all four monitoring tabs and the dashboard (§4). This is the largest gap
against the requested "health overview (API, DB, jobs, auth, storage,
queue/integration)" — none of these six exist as a monitoring tile today.

**Provisioning queue** (`operations/provisioning/page.tsx` +
`provisioning-queue.tsx`) is a separate, real (non-fabricated, per its own
header comment) tenant-provisioning-stuck-run queue fed by
`GET /platform/tenants/provisioning-queue`, but it is **not linked from
`MonitoringNav`** — an operator following the monitoring tabs would not
discover it; it's only reachable by direct URL or wherever `/operations/...`
is linked from elsewhere in the shell nav.

## 4. Admin dashboard

`apps/admin/app/(internal)/page.tsx` (73 lines) fetches
`GET /super-admin/dashboard-summary?range=30d|3m|6m|12m` (default `6m`) and
`GET /platform-users/me/module-preferences?moduleKey=dashboard`, then renders
`PlatformDashboard` (`apps/admin/app/_components/dashboard/platform-dashboard.tsx`,
1685 lines). On fetch failure it shows a dedicated error card with
`Reference: <traceId>` — the one page in admin with an explicit error state,
built ad hoc in the page rather than via `error.tsx` (consistent with
BUG-3220: no route-level `error.tsx` exists).

**Backend**: `SuperAdminController.getDashboardSummary` →
`SuperAdminService.getDashboardSummary(range)`
(`services/api/src/modules/super-admin/super-admin.service.ts:333-...`,
guarded by `JwtAuthGuard, RolesGuard, PlatformPermissionsGuard` at the
controller). This is a large `Promise.all` of ~40 real Prisma
queries/aggregations — **no fabricated or hardcoded metrics found**. Notably:
resolves an FX reporting currency and refreshes rates before aggregating
money (`this.fx.ensureFresh/loadConverter`, with an explicit comment citing
BUG-1745 — money used to be filtered to one currency and silently zeroed);
groups payments/invoices/commissions **by currency** rather than filtering,
so multi-currency data isn't dropped.

**Confirmed real data sources** (all via direct Prisma count/groupBy):
- Tenants by status: `tenant.groupBy(status)` — real.
- Customers: `customerAccount.count()` — real.
- Subscriptions by status / active count: `subscription.groupBy`/`count` — real.
- Invoices (due, by status, by currency for outstanding) — real.
- Payments (by currency, succeeded sum) — real, and this **is** Stripe-backed:
  `Payment` rows are the platform's own ledger populated from the `billing`
  module's Stripe integration, not synthesized for the dashboard.
- Leads/partner leads by status, conversion rate — real.
- Partners by status, partner onboarding applications by status — real.
- Contracts by status/type, signature requests by status, expiring contracts
  — real.
- Support cases by status/severity, critical (S1, unresolved) count, SLA
  breached (`resolutionDueAt < now`, unresolved) count — real.
- Commissions by status, exposure by currency — real.
- `errorLog.groupBy({ by: ['supportStatus'] })` feeds the "system-health"
  view's incident breakdown — real, and reuses the exact `ErrorLog` table
  from §1/§3, so the dashboard's error tile and the monitoring queue cannot
  disagree by construction.
- Revenue/lead/collections trend series (current vs previous period,
  `addPeriodComparisons`) — computed from real `findMany` slices over the
  selected range, not estimated.

**Confirmed NOT present anywhere in the dashboard or its 9 role-scoped
views** (`DASHBOARD_VIEWS` in
`apps/admin/lib/runtime/platform-module-registry.ts:714-800`: `executive,
presales, partner-operations, agreement-operations, customer-onboarding,
customer-support, billing-revenue, platform-administration, system-health`
— all 9 have real `dashboardContent()` implementations, confirmed by
grepping the quoted keys in `platform-dashboard.tsx`):
- **Logins / failed logins.** No grep hit for a login-audit/failed-login
  metric anywhere in `super-admin.service.ts`. There is no `LoginAttempt`-
  style aggregate feeding any dashboard view or the "platform-administration"
  view, despite that view's own description mentioning "security".
- **Error rate** (errors per request, or trend) — only a point-in-time
  `supportStatus` breakdown exists (§ above); no rate calculation.
- **Job/queue failures** (background jobs, outbox delivery failure rate) —
  absent; `PlatformEvent.result = FAILED` counts are not aggregated into any
  dashboard tile.
- **Users** (platform user counts) exist (`platformUserCount,
  activePlatformUsers`) but tenant-side employee/user counts are not part of
  this dashboard (out of scope — this is the platform, not a tenant, view).
- **Invitations pending** — no grep hit for an invitation-status aggregate.

**Charting**: `apps/admin/package.json` has **no charting library** (no
`recharts`, `chart.js`, `d3`, `victory`, `nivo`, `visx` — none of these
strings appear). All "charts" in `platform-dashboard.tsx` are hand-rolled:
`BreakdownChart` (line 1432) renders bars as `<div style={{ width:
`${(value/max)*100}%` }}>`, and `TrendChart` (line 1489) does the same for
the period series. There is no line/area chart, no sparkline, no tooltip —
purely CSS-width bars, consistent with `dataviz` skill guidance not having
been applied here. Drill-downs exist as plain links (`m(...)` metric factory
takes an `href` per tile, e.g. `/customers`, `/tenants?status=ACTIVE`,
`/support/cases?severity=S1_CRITICAL`) rather than in-page expansion.

**Locale/hydration note** (documented in-file, not a new finding): money
formatting is pinned to `en-US` deliberately (line ~248) after a prior
hydration-mismatch bug (BUG-1557) where `undefined` locale differed between
SSR and the browser.

## 5. Existing design system / shared components to reuse

Per `apps/admin/AGENTS.md` (already read in full) and confirmed by file
presence:
- **`ProDataTable`** — `apps/admin/app/_components/crm/data-table.tsx` — the
  required table; already used by `error-logs-table.tsx`. Any grouped-errors
  table for the target design should extend this, not a new table.
- `RuntimeModulePage` / `RuntimeRecordPage` / `RuntimeForm` /
  `RuntimeViewSelector` (`app/_components/runtime/`) — the monitoring
  incidents screen already registers a `monitoring-incidents` module in
  `lib/runtime/platform-module-registry.ts` and uses `RuntimeViewSelector`
  for saved views (`error-logs/page.tsx:61`) — a "views" mechanism for
  filters/columns already exists and should be reused rather than building
  ad hoc filter persistence.
- `ModuleActionBar`, `record-status-group.tsx`, `record-command-bar.tsx` —
  standard action/status chrome, not currently used on the monitoring pages
  (monitoring pages use bespoke headers/`PageHeader` + `MonitoringNav`
  instead of the runtime module chrome — consistent since monitoring is a
  cross-cutting settings screen rather than a CRUD module, but worth noting
  the pattern diverges slightly from other admin screens).
- `app/_components/dashboard/` + a "dashboard widget registry" — referenced
  in AGENTS.md (`Dashboard widgets | app/_components/dashboard/ + the
  dashboard widget registry`); confirmed present as `DASHBOARD_VIEWS` +
  `buildDashboardWidgets()`/`DashboardWidget()` (`platform-dashboard.tsx:470,
  554`) — a real per-view widget system already exists; new dashboard tiles
  (e.g. login/error-rate/job-failure) would be new entries in this registry,
  not a new dashboard framework.
- `lib/formatters.ts` / `lib/platform-formatters.ts` — used throughout
  (`formatPlatformDateTime` in `error-logs-table.tsx:23`).
- No charting library is installed in `apps/admin` (§4) — introducing trend
  lines/sparklines for a redesigned monitoring/dashboard screen would need
  either a new dependency (needs justification per root AGENTS.md "do not add
  dependencies without justification") or continuing the hand-rolled
  CSS-bar approach already established in `platform-dashboard.tsx`.

## Summary of the biggest gaps against the stated target

1. No request-level access logging / trace-id-to-log-line correlation for
   successful requests (BUG-3227, still DEFERRED) — blocks "find any request
   by correlation id," not just failed ones.
2. `AuditLog`/`PlatformAuditLog` have `requestId`/`traceId`/`sourceModule`
   columns but they are effectively never populated by call sites today —
   blocks an "error detail → related audit event" join even after BUG-3227
   is fixed on the logging side; audit call sites also need the id threaded
   through.
3. Real grouping/dedup data (`fingerprint`, `occurrenceCount`, `firstSeenAt`,
   `lastSeenAt`) exists in `ErrorLog` but is not exposed by
   `PlatformErrorEvent`/`getEvent()` or rendered anywhere in
   `error-logs-table.tsx` — a UI/DTO gap, not a data gap; comparatively cheap
   to close.
4. No health-overview tile for API/DB/jobs/auth/storage/queue anywhere in
   the app (Integrations tab only covers Stripe + "review" email).
5. No module-level grouping/filter on errors (only sourceApp + errorCode
   substring); `sourceModule` would need to be added to `ErrorLog` and
   populated at throw time to support it.
6. Dashboard has no login/failed-login, error-rate, or job/queue-failure
   metrics despite `PlatformEvent.result=FAILED` and `ErrorLog` already
   existing as real data sources for exactly those.
7. `MonitoringNav` doesn't link to `operations/provisioning`, so a real,
   working provisioning-stuck queue is monitoring-adjacent but undiscoverable
   from the monitoring tabs.
8. No charting library; all dashboard "charts" are hand-rolled CSS-width
   bars with no tooltip/interaction — fine for simple breakdowns, insufficient
   for a genuine trend/sparkline redesign without either new code or a new
   dependency decision.

## Key file paths (absolute)

- `D:\My Work\hrm-dijipeople\dp-partner-admin\services\api\src\common\middleware\request-id.middleware.ts`
- `D:\My Work\hrm-dijipeople\dp-partner-admin\services\api\src\common\filters\http-exception.filter.ts`
- `D:\My Work\hrm-dijipeople\dp-partner-admin\services\api\src\common\errors\sanitize-error-log.ts`
- `D:\My Work\hrm-dijipeople\dp-partner-admin\services\api\src\modules\error-logs\error-logs.service.ts`
- `D:\My Work\hrm-dijipeople\dp-partner-admin\services\api\src\modules\error-logs\error-logs.controller.ts`
- `D:\My Work\hrm-dijipeople\dp-partner-admin\services\api\src\modules\platform-monitoring\platform-monitoring.service.ts`
- `D:\My Work\hrm-dijipeople\dp-partner-admin\services\api\src\modules\platform-monitoring\platform-monitoring.controller.ts`
- `D:\My Work\hrm-dijipeople\dp-partner-admin\services\api\src\modules\platform-events\platform-events.service.ts`
- `D:\My Work\hrm-dijipeople\dp-partner-admin\services\api\src\modules\audit\audit.service.ts`
- `D:\My Work\hrm-dijipeople\dp-partner-admin\services\api\src\modules\super-admin\super-admin.service.ts` (line 333 `getDashboardSummary`)
- `D:\My Work\hrm-dijipeople\dp-partner-admin\services\api\prisma\schema.prisma` (`ErrorLog` 10559, `ErrorLogOccurrence` 10610, `AuditLog` 10508, `PlatformAuditLog` 10536, `SupportCaseIncident` 3808)
- `D:\My Work\hrm-dijipeople\dp-partner-admin\apps\admin\app\(internal)\settings\monitoring\page.tsx`
- `D:\My Work\hrm-dijipeople\dp-partner-admin\apps\admin\app\(internal)\settings\monitoring\error-logs\page.tsx`
- `D:\My Work\hrm-dijipeople\dp-partner-admin\apps\admin\app\(internal)\settings\monitoring\events\page.tsx`
- `D:\My Work\hrm-dijipeople\dp-partner-admin\apps\admin\app\(internal)\settings\monitoring\integrations\page.tsx`
- `D:\My Work\hrm-dijipeople\dp-partner-admin\apps\admin\app\_components\monitoring\monitoring-overview.tsx`
- `D:\My Work\hrm-dijipeople\dp-partner-admin\apps\admin\app\_components\monitoring\error-logs-table.tsx`
- `D:\My Work\hrm-dijipeople\dp-partner-admin\apps\admin\app\(internal)\operations\provisioning\page.tsx`
- `D:\My Work\hrm-dijipeople\dp-partner-admin\apps\admin\app\(internal)\page.tsx`
- `D:\My Work\hrm-dijipeople\dp-partner-admin\apps\admin\app\_components\dashboard\platform-dashboard.tsx`
- `D:\My Work\hrm-dijipeople\dp-partner-admin\apps\admin\lib\runtime\platform-module-registry.ts` (`DASHBOARD_VIEWS` line 714)
- `D:\My Work\hrm-dijipeople\dp-partner-admin\apps\admin\lib\server-api.ts`
- `D:\My Work\hrm-dijipeople\dp-partner-admin\apps\admin\lib\api-error.ts`
- `D:\My Work\hrm-dijipeople\dp-partner-admin\apps\web\lib\server-api.ts`
