# WP-06 report — monitoring and observability

TASK-0032, EXECPLAN-0051. Branch `agent/pah-wp06-monitoring`, worktree
`D:/My Work/hrm-dijipeople/dp-pah-wp06`. REG range REG-575..REG-584 (all used).

## IMPLEMENTED

**Backend**

1. **Health overview API** — `GET /platform/monitoring/health`
   (`platform-health.controller.ts` + `platform-health.service.ts`, new
   `platform-monitoring` module additions). Seven components, each from a
   real, time-boxed (3s) probe:
   - `api` — process/version/commit via the existing `getRuntimeHealthPayload`.
   - `database` — `SELECT 1` timed; `OK` <500ms, `DEGRADED` ≥500ms, `DOWN` on a
     real failure, `UNKNOWN` on timeout.
   - `backgroundProcessing` — real `OutboxEvent` queries: pending count,
     oldest-pending age, failed count in the last hour.
   - `notificationQueue` — always `UNKNOWN`, honestly: there is no deployed
     async queue (`NotificationQueueService` confirms sync-fallback only), so
     `OK` would assert a queue is healthy that doesn't exist. Excluded from
     the overall-status vote via `votesOnOverallStatus: false` since this is
     an intentional architecture, not a fault.
   - `authentication` — failed `AUTH_LOGIN_FAILED` audit rows in the last hour
     vs. the previous hour (spike detection) plus `User.lockedUntil` count.
   - `storage` — reuses `StorageService.checkReadiness()` (the same probe
     `StorageReadinessController` already exposes).
   - `email` — the most recent `EmailDeliveryLog` row (platform-wide) plus a
     provider-configured check (`EmailProviderSetting` or `EMAIL_PROVIDER`).
   - Authorization follows the exact pattern its siblings
     `PlatformMonitoringController`/`StorageReadinessController` already use:
     `JwtAuthGuard` + an explicit `monitoring.read` check inside the handler.
     `platform/monitoring` is not one of the prefixes `resolvePlatformPermission`
     maps (that resolver only feeds `PermissionsGuard`-based routes), so no
     change to it, `permissions.ts` or `rbac-matrix.ts` was needed —
     **no `PERMISSION_NEEDED`**.

2. **Error grouping surfaced.** `ErrorLog.fingerprint`/`occurrenceCount`/
   `firstSeenAt`/`lastSeenAt` were already computed and already returned by
   `enrichEvents()` — the actual gap was `module`, which WP-01 added to the
   schema but nothing wrote. A new `deriveErrorModule()`
   (`common/errors/derive-error-module.ts`) derives it from the request path's
   first segment after `/api`, with the second segment appended for umbrella
   prefixes (`platform`, `super-admin`, `settings`) so "platform" doesn't
   become a bucket for two dozen unrelated features — documented in the file.
   Wired into `http-exception.filter.ts` → `ErrorLogsService.persist()`, fixed
   on **both** the create and update (repeat-occurrence) branches — the update
   branch was the one actually missing it. `module` filter and an exact-match
   `correlationId` filter (distinct from the existing substring `reference`
   filter) added to `listEvents()`. The list already paginates in the
   database (`skip`/`take`) per BUG-3175 — reverified, not just assumed, with
   a test on the actual Prisma call arguments.

3. **Error detail.** `getEvent()` now also returns `module`,
   `relatedOccurrences` (other occurrences of the same fingerprint),
   `relatedAuditEvents` (tenant + platform audit rows sharing the trace id,
   merged and sorted), and `relatedOutboxEvents` (outbox jobs sharing the same
   `correlationId`, with `lastError` run through the same free-text redaction
   as everything else).

4. **Correlation (BUG-3227).**
   - `request-id.middleware.ts` already minted and returned a trace id on
     every response (`X-Request-Id`/`X-Trace-Id`) — that part needed no
     change.
   - A new `TraceContextService` (`common/request-context/trace-context.service.ts`,
     AsyncLocalStorage) is set by `RequestIdMiddleware` for the whole request.
     Deliberately **not** a broadened `RequestContextService` (the existing
     ALS store) — that one carries a business-unit-access-scoping shape
     resolved later, by a different middleware, for a different purpose;
     reusing it would tie a trace id's availability to auth resolution
     succeeding.
   - `AuditService.log()` now fills `requestId`/`traceId` from that ambient
     context whenever a caller doesn't pass its own — the D4 discovery found
     **zero** call sites across the codebase that ever did, so every audit row
     had a null trace id before this.
   - A new `AccessLogMiddleware` writes one structured line per request on
     `finish` (`method, route, statusCode, durationMs, traceId, tenantId,
     userId` — never a body, header or query string), gated on
     `REQUEST_LOGGING_ENABLED`. That env var already existed in every
     committed `.env*` example but was read by no code anywhere — it is now
     live rather than a new variable, so no new registration in
     `packages/config`/`render.yaml`/`docs/environment-variables.md` was
     triggered by AGENTS.md's "new env var" rule; I did not add it to
     `render.yaml`/the docs table either, matching its two siblings
     (`ERROR_TRACE_HEADER`, `LOG_LEVEL`) which are also undocumented there —
     flagging this as a pre-existing gap rather than fixing it myself, since
     `render.yaml` is known-drifted terrain outside this package's scope.
   - The response header was already present; frontend `server-api.ts` in
     both `apps/admin` and `apps/web` already forward
     `X-Request-Id`/`X-Trace-Id` on every server-side call and already surface
     the trace id as "Reference: …" on error — verified by direct read, no
     change needed.

5. **Redaction (BUG-3555).** `sanitize-error-log.ts`:
   - Extended the key-based denylist with the PII/financial fields AGENTS.md's
     own Security checklist names (`iban`, `cnic`, `ssn`, `nationalId`,
     `taxId`, `bankAccountNumber`, `accountNumber`, `routingNumber`,
     `cardNumber`, `cvv`/`cvc`, `pin`, `signingKey`, `privateKey`) —
     deliberately **not** bare `account`/`bank`, which would erase harmless
     fields like `accountId`/`accountStatus` (documented in the source).
   - Added free-text scrubbing (`redactSecretsInText`), applied to every
     string value the sanitizer touches, not just keyed fields — this is the
     actual BUG-3555 fix, since `stack` and interpolated messages are free
     text and the old function only ever redacted whole keyed values.
     Patterns: Bearer tokens, JWT-shaped strings, connection-string
     credentials (`user:pass@host` → host survives), `password=`/`secret=`
     pairs, real IBANs, Luhn-valid 13–19-digit card numbers, PEM private-key
     blocks.
   - Decided and documented: a free-standing email address in a message/stack
     is left intact (support needs it to identify the affected user; it is
     not a credential). An email inside a connection string's credential
     segment is still redacted as part of that whole segment.
   - No-false-positive guard: a UUID, a `req_…` trace id and a deliberately
     Luhn-invalid 13-digit epoch timestamp all survive untouched.
   - `findRelatedOutboxEvents()` in `platform-monitoring.service.ts` runs the
     same scrubber over `OutboxEvent.lastError` before it reaches the new
     "related background jobs" panel — that field was never sanitized before.

**Frontend (`apps/admin`)**

6. `error-logs-table.tsx`: `PlatformErrorEvent` now carries `module`,
   `fingerprint`, `firstSeenAt`, `lastSeenAt`, `occurrenceCount`. New
   **Module** and **Occurrences** table columns; matching detail fields;
   **Module** and **Correlation ID** (exact) added to the advanced-filters
   drawer; a new `IncidentDetailPanel`, fetched lazily on row expand from a
   new `GET` on the existing `events/[traceId]` proxy route, rendering the
   sanitized stack, request metadata, recurring occurrences, related audit
   events and related background jobs.
7. `health-overview-tiles.tsx` (new): the seven health components as a top
   band on `/settings/monitoring`, wired into `page.tsx` alongside the
   existing incident-queue and event-health fetches. Every tile shows its
   real status/reason and links to its drill-down; no chart library, no
   fabricated tile.
8. `monitoring-nav.tsx`: added the **Provisioning queue** link — a real,
   working screen (`operations/provisioning`) that D4 found was reachable
   only by direct URL.
9. `loading.tsx`/`error.tsx` added for the `settings/monitoring` route
   segment (BUG-3220, scoped here only — WP-08 owns the rest of
   `apps/admin`). Covers `monitoring/page.tsx` and every nested route under
   it that does not define its own.

## CHANGED_BEHAVIOR

- `AuditService.log()` constructor now requires a `TraceContextService`
  (three existing spec files updated to pass a stub — mechanical, no
  behavior change in those tests). Any future direct instantiation outside
  Nest DI needs the same second argument.
- Audit rows written inside a request now carry a non-null `requestId`/
  `traceId` where they previously carried `null` — additive, no existing
  reader breaks, but anything that asserted "these are always null" would
  need updating (nothing in this codebase did).
- `ErrorLog.module` is now populated going forward; historical rows stay
  `null` until they next recur (the update path backfills them then).
- A new access-log line appears per request when `REQUEST_LOGGING_ENABLED=true`
  (already the case in every non-empty `.env`) — additive log volume, no
  response contract change.
- `error-logs.controller`/`platform-monitoring` routes gained one new GET
  route each (`platform/monitoring/health`, and a GET on the admin's
  `events/[traceId]` proxy) — additive.

## RISK_AREAS

- **Health thresholds are judgment calls**, not measured SLOs: the 500ms DB
  latency line, the outbox 200-pending/15-minute-oldest lines, and the
  failed-login spike multiplier (3× baseline, minimum 10) are documented in
  the source but not validated against real production traffic. Worth
  revisiting once this has run against real load.
- **`deriveErrorModule`'s umbrella-prefix list is a fixed set of three**
  (`platform`, `super-admin`, `settings`). A new umbrella-shaped route prefix
  added later would file under one bucket again until someone adds it here.
- **The access log is unconditional per request** when the flag is on — no
  sampling. On a very high-traffic tenant this is added log volume; the flag
  exists precisely so an operator opts in deliberately.
- **`getEvent()`'s related-audit-events query has no index on `traceId` alone**
  (`AuditLog` is indexed `[tenantId, requestId]`; `PlatformAuditLog` on
  `[requestId]`) — the schema is frozen for this package (WP-01 only), so this
  is a full scan under load. Acceptable for a low-frequency, manual
  investigation action; would need a follow-up ExecPlan if usage grows.
- **`IncidentDetailPanel` fetches on every row expand**, uncached — expanding
  the same row twice re-fetches. Deliberate (freshness during an active
  incident) but worth a cache if this becomes a heavily-used panel.

## KNOWN_MISTAKES_AVOIDED

- BUG-3175 (list must paginate in the database) — reverified with a real
  assertion on the Prisma call arguments (`skip`/`take`), not just trusted.
- BUG-1420/BUG-1750 (severity/critical-view case-folding, one definition
  shared by metric and view) — read and left untouched; new filters added
  alongside without duplicating that logic.
- BUG-1754/BUG-2495 (`NOT_AN_INCIDENT` protocol outcomes miscounted as open
  work) — not touched; new module/correlationId filters compose with the
  existing `AND` array rather than replacing it.
- The `resolvePlatformPermission`/`PermissionsGuard` pattern was **not**
  force-fit onto the new health route; used the already-reviewed
  handler-level-check pattern its siblings use instead, and registered it in
  the same wiring-invariant allowlist rather than leaving CI red.
- Never fabricated an `OK`: every health component either reflects a real
  query/probe result or reports `UNKNOWN` with a stated reason (proven by the
  timeout and no-notification-queue test cases).

## TESTS_ADDED

All under `services/api/src/`, run with
`DATABASE_URL=postgresql://u:p@localhost:5432/x` (no live DB needed):

| File | Proves |
|---|---|
| `common/errors/sanitize-error-log.spec.ts` (extended, 12 tests) | Key-based PII/bank redaction; free-text scrubbing of bearer tokens, JWTs, connection strings, PEM keys, Luhn-valid cards, `password=`/`secret=` pairs, IBANs; no-false-positive guard (UUID/trace-id/timestamp); documented email decision |
| `common/errors/derive-error-module.spec.ts` (6 tests) | Path-based module derivation, umbrella-prefix widening, query-string stripping, null-safety |
| `common/middleware/access-log.middleware.spec.ts` (4 tests) | One line per request when enabled; no body/headers/query/token in the line; null identity when unauthenticated; nothing logged and no listener attached when disabled |
| `modules/audit/audit.service.spec.ts` (+4 tests) | `requestId`/`traceId` filled from ambient trace context for tenant and platform rows; explicit caller values never overridden; null outside any request |
| `modules/error-logs/error-logs.service.spec.ts` (+3 tests) | `module` written on create, on update (the actual regression), and backfilled from the existing row |
| `modules/platform-monitoring/platform-health.service.spec.ts` (8 tests) | Every status path per component; timeout → `UNKNOWN` not `DOWN`/fabricated `OK`; notification queue always `UNKNOWN` and excluded from the overall vote; outbox/auth/storage/email degrade/down conditions |
| `modules/platform-monitoring/platform-monitoring-list-filters.spec.ts` (7 tests) | `module`/`correlationId` filters reach the actual `where` clause; DB pagination (`skip`/`take`) on the real call args; `module` surfaced on list items; `getEvent()`'s related occurrences/audit events/outbox events, including outbox `lastError` redaction |

Total new/changed spec assertions: 44. Every one of the load-bearing fixes
(module on update, correlationId filter, module surfaced on list items,
AuditService trace fill) was confirmed to fail against the pre-fix code by
temporarily reverting the fix and re-running — not merely asserted.

## TEST_HOOKS

- `GET /platform/monitoring/health` — platform-guarded, `monitoring.read`.
- `GET /platform/logs/events?module=<name>&correlationId=<traceId>` — new
  filters, composable with all existing ones.
- `GET /api/platform/logs/events/:traceId` (admin proxy, new) — the detail
  panel's data source; also directly curl-able for QA.
- Admin: `/settings/monitoring` (health tiles), `/settings/monitoring/error-logs`
  (Module/Occurrences columns, Module/Correlation ID filters, expand a row for
  the investigation panel), `MonitoringNav` now links `/operations/provisioning`.
- To see `REQUEST_LOGGING_ENABLED` do something: set it to `"true"` (already
  the value in every non-empty `.env*`), hit any route, look for the
  `AccessLog` logger context in stdout.
- To see BUG-3227 close end to end: make any authenticated request, note the
  `X-Trace-Id` response header, then check the corresponding `AuditLog`/
  `PlatformAuditLog` row (if that request wrote one) — `traceId` matches.

## RECORD_CLOSURES

| Record | Commit(s) | Spec | Fails without fix |
|---|---|---|---|
| BUG-3555 (redaction) | d80ab317 and earlier on this branch (`sanitize-error-log.ts`, `platform-monitoring.service.ts`) | `sanitize-error-log.spec.ts`, `platform-monitoring-list-filters.spec.ts` (outbox redaction case) | Yes |
| BUG-3227 (access log + traceId) | same branch (`trace-context.service.ts`, `access-log.middleware.ts`, `audit.service.ts`) | `audit.service.spec.ts`, `access-log.middleware.spec.ts` | Yes |
| ITEM-0198 (monitoring redesign) | same branch (health API + admin health tiles + grouping/module/correlation surfaced + detail panel + nav link + loading/error boundaries) | `platform-health.service.spec.ts`, `platform-monitoring-list-filters.spec.ts`, `derive-error-module.spec.ts`, `error-logs.service.spec.ts` | Yes |
| REG-575..REG-584 | see `docs/qa/regressions/_incoming/wp06.md` | as above | Yes, each |

Exact commit SHAs on `agent/pah-wp06-monitoring` (oldest to newest, all in this
package): `c45da293`, `31d57471`, `d7ce82fc`, `c03d0d33`, `d80ab317`. The
Architect assigns the final merged SHA when integrating; `_incoming/wp06.md`
says so explicitly per COMMON-RULES.

## VALIDATION

| Command | Result |
|---|---|
| `npm --workspace api run check-types` (`tsc --noEmit -p tsconfig.build.json`) | PASS |
| `cd services/api && npx eslint <every file changed>` | PASS — 0 errors, 15 pre-existing-style warnings (test-mock `any` assignments, one `JSON.parse` return type), all in test files or a dynamic-JSON path |
| `npm --workspace api run test` (full suite) | **6962/6964 passed**, 2 failing — see below |
| `npm --workspace admin run check-types` | PASS |
| `npm --workspace admin run lint` | PASS (0 errors; 2 pre-existing warnings in unrelated files: `runtime-module-list.tsx`, `auth-cookies.ts`) |
| `npm --workspace admin run test` | PASS — 422/422 |

**The 2 full-suite failures, both identified and one fixed:**

1. `common/constants/wiring-invariants.spec.ts` — **caused by this package**,
   fixed in commit `d80ab317` (added `PlatformHealthController` to the
   reviewed-authorization-surface allowlist, matching its siblings). Re-ran
   in isolation after the fix: PASS.
2. `modules/tenant-control-plane/tenant-erasure.constants.spec.ts` —
   **pre-existing**, from WP-01 (commit `10d5d148`, which added
   `UserMfaRecoveryCode`/`PlatformUserMfaRecoveryCode` but never registered
   them in the tenant-erasure model order). Confirmed by `git diff 10d5d148
   HEAD -- services/api/src/modules/tenant-control-plane/` returning empty —
   this package never touched that directory. Not fixed here: out of scope
   (WP-01's own gap) and touching the erasure order is exactly the kind of
   drive-by fix AGENTS.md asks not to make.

A second full run of `npm --workspace api run test` was started to reconfirm
the final count after the wiring-invariants fix; it is still completing as
this report is filed (background job, ~90s runtime) — the isolated re-run of
`wiring-invariants.spec.ts` above already confirms the fix in the meantime.

## UNRESOLVED

- **`render.yaml`/`docs/environment-variables.md`** do not document
  `REQUEST_LOGGING_ENABLED` (nor its siblings `ERROR_TRACE_HEADER`,
  `LOG_LEVEL`) — a pre-existing gap, not introduced here, and out of scope to
  fix given `render.yaml`'s known drift from the live service (per prior
  session notes). Flagging for the Architect rather than editing
  deployment-adjacent files unprompted.
- **Health-check thresholds** (DB latency, outbox age/count, login-spike
  multiplier) are reasoned defaults, not tuned against production telemetry —
  see RISK_AREAS.
- **`tenant-erasure.constants.spec.ts` failure** — pre-existing, not fixed
  (see VALIDATION). Belongs to whoever owns TASK-0032 WP-01 follow-up or a
  fresh backlog item.
- No admin-side pure-helper unit tests were added: nothing introduced in
  `apps/admin` this package is a standalone pure function outside the
  components themselves (which are covered by `check-types`/`lint`/the
  existing 422-test suite staying green); the substantive logic (redaction,
  module derivation, health probes, filters, correlation) is entirely
  backend and is covered there.
- WP-07 (dashboard) and WP-08 (broader `apps/admin` loading/error rollout)
  were not touched, per the brief's boundary.

## Debugging workflow — alert to root cause, using this page

1. **Alert fires** ("payroll API error rate up" / a customer reports a 500 /
   a support agent gets "Reference: req_8f3c2d1a…"). Open
   `/settings/monitoring`.
2. **Top band answers "is the platform healthy" in one glance.** If
   `database`, `storage`, `backgroundProcessing`, `authentication` or `email`
   shows `DEGRADED`/`DOWN`, its reason line names the specific problem (e.g.
   "3 pending, oldest 22m, 1 failed in the last hour") and its tile links
   straight to the relevant screen. If the alert is dependency-shaped, this
   is often the whole investigation.
3. **If it's an application error**, open **Incidents / Errors**. The list is
   already one row per incident (fingerprint-deduplicated) with **Module**,
   **Occurrences** (`Nx since <first seen>`) and **Since** visible without
   opening anything — "is this new or has it been going on since 3am" is
   answered by the row itself.
4. **Filter**: by `Module` (which backend area), `Tenant ID` (which
   customer), `Correlation ID` (if support already has a `Reference: req_…`
   from the user — exact match, not a fuzzy search), `Category` (error code),
   `Environment`, or the date range.
5. **Expand the row.** The top grid gives tenant/user/route/module/occurrence
   counts/first-and-last-seen at a glance. Below it, the investigation panel
   shows:
   - the **sanitized stack trace** (credentials/PII scrubbed even if they were
     interpolated into the message, not just in a keyed field);
   - **request metadata** (method, route, user agent — never the raw body or
     headers);
   - **recurring occurrences** — other trace ids that hit the same
     fingerprint, so "how many times has this happened" has actual trace ids
     to click into, not just a count;
   - **related audit events** — what this exact request *did* (an
     `AuditLog`/`PlatformAuditLog` row sharing its trace id) — this is new:
     before BUG-3227's fix, these rows existed in the schema but were always
     null, so this section was unbuildable;
   - **related background jobs** — an `OutboxEvent` sharing the same
     correlation id, if the error traces back to an async job rather than the
     original request.
6. **Resolve or escalate** using the existing support workflow panel
   (status/assignment/notes/customer update/support-case creation) — unchanged.
7. **Recurring/systemic?** Check the access log (`REQUEST_LOGGING_ENABLED`) by
   trace id for the full request timeline even if it never errored — answers
   "was this slow" or "did this succeed but do the wrong thing," which the
   error log alone cannot.

## Before / after

**Before:** Monitoring had a genuinely good incident queue (severity/status/
source filters, CSV export, support workflow) but: no way to tell if the
platform's own dependencies (DB, storage, auth, jobs, email) were healthy
without opening five different screens or none; no module facet, so "which
backend area is failing" meant reading error codes; no visible grouping
despite the data existing (fingerprint/occurrence count computed and stored,
never rendered); no way to see what else a failing request actually did
(audit rows existed but were always null); a successful or slow request left
zero log trace; secrets embedded in a stack trace or a related job's error
message could leak; the real, working provisioning-stuck queue was
undiscoverable from monitoring; a failed server-side fetch on any monitoring
page fell through to Next's unstyled default error screen.

**After:** The page opens with seven real dependency-health tiles, each
linking to where to look next. The incident list shows module and occurrence
history without opening anything. A correlation id from a user's error toast
finds their exact request by exact match. Expanding an incident shows the
sanitized stack, request metadata, other occurrences, the audit trail that
same request wrote, and any background job sharing its correlation id.
Redaction covers national-id/bank-account-shaped fields and scrubs secrets
out of free text (stacks, messages, job error strings), not just keyed
fields. Every request — successful or not — leaves one structured log line
when the operator opts in. The provisioning queue is one click from the
monitoring tabs. The monitoring segment has a styled loading skeleton and
error boundary instead of Next's default.
