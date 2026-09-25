# Monitoring and Observability

The platform admin's investigation surface: a real-dependency health
overview, deduplicated and correlated application errors, the platform audit
trail, and how a trace id connects a failed request to everything it did.
Extends [`audit-events.md`](audit-events.md) (the four underlying mechanisms —
audit log, platform event, error log, application log — are described there
and not repeated here) with what TASK-0032 built on top of them.

> **Last verified:** 2026-09-25
> **Verified against:** `services/api/src/modules/platform-monitoring/`,
> `common/errors/sanitize-error-log.ts`, `common/errors/derive-error-module.ts`,
> `common/middleware/request-id.middleware.ts`,
> `common/middleware/access-log.middleware.ts`,
> `common/request-context/trace-context.service.ts`,
> `services/api/src/modules/audit/platform-audit.controller.ts`,
> TASK-0032 WP-06 and WP-10. Journeys confirmed by TASK-0032 WP-09 live QA
> (`docs/tasks/TASK-0032-streams/QA-summary.md`).

---

## Health overview

`GET /platform/monitoring/health` (`platform-health.controller.ts` +
`platform-health.service.ts`) — seven components, each from a real,
time-boxed (3-second) probe. **No component ever fabricates `OK`**: a probe
that cannot complete reports `UNKNOWN` with a stated reason, never an assumed
healthy status.

| Component | Probe | Statuses |
|---|---|---|
| `api` | Existing `getRuntimeHealthPayload` (process, version, commit) | — |
| `database` | Timed `SELECT 1` | `OK` (<500ms), `DEGRADED` (≥500ms), `DOWN` (real failure), `UNKNOWN` (timeout) |
| `backgroundProcessing` | Real `OutboxEvent` queries: pending count, oldest-pending age, failed count in the last hour | `OK`/`DEGRADED`/`DOWN` by threshold |
| `notificationQueue` | — | Always `UNKNOWN`, honestly — there is no deployed async notification queue (`NotificationQueueService` is sync-fallback only), so `OK` would assert a queue is healthy that does not exist |
| `authentication` | Failed `AUTH_LOGIN_FAILED` audit rows in the last hour vs. the previous hour (spike detection), plus `User.lockedUntil` count | `OK`/`DEGRADED`/`DOWN` |
| `storage` | `StorageService.checkReadiness()` — the same probe `StorageReadinessController` already exposes | `OK`/`DEGRADED`/`DOWN` |
| `email` | Most recent `EmailDeliveryLog` row (platform-wide) plus a provider-configured check | `OK`/`DEGRADED`/`DOWN` |

**`notificationQueue` does not vote on the overall status** — its
`UNKNOWN` reflects an intentional architecture (synchronous delivery, no
queue deployed), not a fault, so it is excluded from the aggregate via
`votesOnOverallStatus: false`. Every other component's `UNKNOWN` (e.g. a
timed-out database probe) *does* count toward the aggregate — the distinction
is "this will never be anything but unknown by design" versus "this could not
be determined right now."

Authorization follows the same handler-level pattern its siblings
(`PlatformMonitoringController`, `StorageReadinessController`) already use:
`JwtAuthGuard` + an explicit `monitoring.read` check inside the handler, not
`PermissionsGuard`/`resolvePlatformPermission` — that resolver only serves
`SuperAdminController`-style routes, and `platform/monitoring` was never one
of its mapped prefixes, so no change to the WP-02-owned permission files was
needed for this route.

**Thresholds are reasoned defaults, not tuned against production traffic**:
the 500ms database latency line, the outbox 200-pending/15-minute-oldest
lines, and the failed-login spike multiplier (3× baseline, minimum 10) are
documented in the source but should be revisited once this has run against
real load.

## Grouped errors

`ErrorLog` already computed `fingerprint` (deduplication key),
`occurrenceCount`, `firstSeenAt` and `lastSeenAt` before TASK-0032; the actual
gap was **`module`**, added to the schema by WP-01 but written by nothing.
`deriveErrorModule()` (`common/errors/derive-error-module.ts`) derives it from
the request path's first segment after `/api`, with the second segment
appended for umbrella prefixes (`platform`, `super-admin`, `settings`) so
"platform" does not become one bucket for two dozen unrelated features. Wired
into `http-exception.filter.ts` → `ErrorLogsService.persist()` on **both** the
create and the update (repeat-occurrence) branch — the update branch was the
one actually missing it, so a recurring error's `module` now backfills on its
next occurrence even if the original row predates this change.

**Note**: `deriveErrorModule`'s umbrella-prefix list is a fixed set of three.
A new umbrella-shaped route prefix added later files under one bucket again
until someone adds it here.

Admin `error-logs-table.tsx` gained **Module** and **Occurrences** columns,
and matching **Module** / **Correlation ID** (exact-match) filters in the
advanced-filters drawer — distinct from the existing substring `reference`
filter. The list already paginated in the database (`skip`/`take` — BUG-3175);
this was re-verified, not just assumed, with a test asserting the actual
Prisma call arguments.

## Error detail and correlation (BUG-3227)

`getEvent()` now also returns:

- `module` (see above)
- `relatedOccurrences` — other occurrences of the same fingerprint
- `relatedAuditEvents` — tenant and platform audit rows sharing the same
  trace id, merged and sorted
- `relatedOutboxEvents` — outbox jobs sharing the same `correlationId`, with
  `lastError` run through the same redaction as everything else

**End-to-end trace id path**:

```
RequestIdMiddleware (mints/accepts req_<uuid>, sets req.requestId)
  -> X-Request-Id / X-Trace-Id response headers (unchanged by TASK-0032)
  -> TraceContextService (AsyncLocalStorage, set by RequestIdMiddleware
     for the whole request — new, deliberately NOT the existing
     RequestContextService, which carries business-unit-access-scoping
     resolved later by a different middleware for a different purpose)
  -> AuditService.log() fills requestId/traceId from that ambient context
     whenever a caller doesn't pass its own (before this, ZERO call sites
     anywhere ever did, so every audit row had a null trace id)
  -> AccessLogMiddleware writes one structured line per request on finish
     (method, route, statusCode, durationMs, traceId, tenantId, userId —
     never a body, header or query string), gated on
     REQUEST_LOGGING_ENABLED
```

`REQUEST_LOGGING_ENABLED` already existed in every committed `.env*` example
but was read by no code anywhere before this — it is now live rather than a
newly introduced variable, matching its two undocumented siblings
(`ERROR_TRACE_HEADER`, `LOG_LEVEL`); none of the three are registered in
`render.yaml`/`docs/environment-variables.md`, a pre-existing gap not
introduced or closed by this work.

`apps/admin`/`apps/web`'s `server-api.ts` already forwarded
`X-Request-Id`/`X-Trace-Id` on every server-side call and already surfaced the
trace id as "Reference: …" on error — verified by direct read, no change
needed there.

**Known limitation**: `getEvent()`'s related-audit-events query has no
supporting index on `traceId` alone (`AuditLog` is indexed
`[tenantId, requestId]`; `PlatformAuditLog` on `[requestId]`) — a full scan
under load. Acceptable for a low-frequency, manual investigation action;
would need a follow-up if usage grows. `schema.prisma` was frozen to WP-01 for
this task, so no index was added.

## Redaction (BUG-3555)

`common/errors/sanitize-error-log.ts` covers two distinct problems:

1. **Key-based denylist**, extended with the PII/financial fields AGENTS.md's
   own Security checklist names: `iban`, `cnic`, `ssn`, `nationalId`, `taxId`,
   `bankAccountNumber`, `accountNumber`, `routingNumber`, `cardNumber`,
   `cvv`/`cvc`, `pin`, `signingKey`, `privateKey`. Deliberately **not** bare
   `account`/`bank`, which would erase harmless fields like `accountId`/
   `accountStatus`.
2. **Free-text scrubbing** (`redactSecretsInText`) — the actual BUG-3555 fix,
   since a stack trace or an interpolated message is free text, and the
   pre-existing sanitizer only ever redacted whole keyed values. Applied to
   every string value the sanitizer touches. Patterns covered: Bearer tokens,
   JWT-shaped strings, connection-string credentials (`user:pass@host` — the
   host survives), `password=`/`secret=` pairs, real IBANs, Luhn-valid
   13–19-digit card numbers, PEM private-key blocks.

**Deliberate non-redaction**: a free-standing email address in a message or
stack is left intact — support needs it to identify the affected user, and it
is not a credential. An email *inside* a connection string's credential
segment is still redacted as part of that whole segment. A UUID, a `req_…`
trace id, and a deliberately Luhn-invalid 13-digit epoch timestamp all survive
untouched (a no-false-positive guard, not incidental).

`findRelatedOutboxEvents()` runs the same scrubber over `OutboxEvent.lastError`
before it reaches the "related background jobs" panel — that field was never
sanitized before this.

## Platform audit trail

Before TASK-0032, `PlatformAuditLog` was **write-only** — every
platform-runtime mutation (leads, partners, customers, customer-onboarding,
contracts, support-cases, tenants, plans) wrote there, but no endpoint
anywhere read it back. The one exposed reader, `GET /audit-logs`, queries the
*different* tenant `AuditLog` table by `user.tenantId` — and a platform
user's `tenantId` is the literal string `'platform'`, so even an authorized
Super Admin got a `200` with an empty page, never the platform trail
(BUG-3564, discovered by WP-08's live CRUD sweep).

**`GET`/`GET :id` `/platform/audit-logs`** (`PlatformAuditController`) closes
this:

- Guarded by `@RequirePlatformPermission('monitoring.read')` — the permission
  every audit-facing role already holds (see
  [`rbac.md`](rbac.md#platform-audit-trail-read-access)), not a new key.
- **Filters**: actor (`platformActorUserId`), action (expanded through the
  same alias resolution the tenant reader uses), entity type/id, a trace-id
  filter matching either `traceId` or `requestId`, a free-text `search` over
  `action`/`entityType` (not snapshot contents — those are redacted, and a
  `contains` filter over them would be the wrong tool; not actor name either
  — use the Actor filter), and a date range. Built as an `AND` array of
  clauses so a `traceId` filter and a `search` filter never collide on the
  same object key.
- **List rows carry no snapshot** (nothing to leak, nothing to ship
  needlessly); **detail rows re-run `redactAuditSnapshot` on read** —
  defence in depth beyond the redaction `AuditService.log()` already applies
  at write time, guarding a historical row or a hypothetical caller that
  bypassed `log()`.
- Server-side pagination (`skip`/`take`), proven against the actual Prisma
  call arguments, not an in-memory slice.
- **`GET /audit-logs` (the tenant reader) now refuses a platform caller
  explicitly** — `400 PLATFORM_AUDIT_TRAIL_USE_DEDICATED_ENDPOINT` — instead
  of silently returning an empty page. The root cause was narrower than "any
  platform user": `PermissionsGuard`'s elevated-role bypass let only
  `SUPER_ADMIN`/`PLATFORM_OWNER` through the tenant guard (via the
  `system-admin` role alias); every other platform role was already refused
  by the guard for lacking the tenant `audit.read` permission. This closes
  the gap for the two roles the bypass let through.

**Admin UI**: a new "Audit trail" tab under Monitoring
(`/settings/monitoring/audit-logs`) — `ProDataTable` with the filters above,
server-driven pagination, and an expandable row showing a **field-level diff**
of before/after (`diffAuditSnapshotFields`), not two raw JSON blobs. The
incident detail panel's existing "related audit events" section gained a
"View in audit trail" link, filtering the trail by that incident's trace id —
for `platform`-scope related events only (this admin app has no tenant audit
screen, so a `tenant`-scope related event gets no link; a deliberate,
documented asymmetry, not a bug).

### A same-shaped fix: bulk-delete admin tier

While closing the audit-reader gap, WP-10 also closed a related "two paths,
one decision, decided differently" defect the WP-02 route-widening had left
open: `DELETE /super-admin/customers` and `/customer-onboarding` decided who
could bulk-delete on a **weaker** rule than the identical action through the
generic runtime delete path — a non-admin-tier role holding
`customers.update`/`onboarding.update` (`PLATFORM_OPERATIONS`, `MEMBER`,
`PRESALES_MANAGER`) could still bulk-delete records it "owned," where the
runtime path refused those roles outright regardless of ownership. Both paths
now call one exported predicate, `isPlatformAdminTier()`
(`platform-auth/platform-permissions.ts`), so they cannot diverge again.

## Debugging workflow (alert to root cause)

1. **Alert fires** (an error-rate alert, a customer report, a support agent
   with "Reference: req_8f3c2d1a…"). Open `/settings/monitoring`.
2. **The health band answers "is the platform healthy" in one glance.** A
   `DEGRADED`/`DOWN` tile names the specific problem in its reason line (e.g.
   "3 pending, oldest 22m, 1 failed in the last hour") and links straight to
   the relevant screen.
3. **If it's an application error**, open Incidents/Errors — already one row
   per fingerprint-deduplicated incident, with Module and Occurrences
   (`Nx since <first seen>`) visible without opening anything.
4. **Filter** by Module, Tenant ID, Correlation ID (exact match — paste a
   "Reference: req_…" a user already gave support), Category or date range.
5. **Expand the row**: sanitized stack trace, request metadata (method,
   route, user agent — never the raw body or headers), recurring occurrences
   with clickable trace ids, related audit events (what this exact request
   *did*), and related background jobs (an `OutboxEvent` sharing the same
   correlation id).
6. **Resolve or escalate** through the existing support workflow panel
   (status/assignment/notes/customer update/support-case creation) —
   unchanged by TASK-0032.
7. **Recurring or systemic?** Check the access log
   (`REQUEST_LOGGING_ENABLED`) by trace id for the full request timeline even
   if it never errored — answers "was this slow" or "did this succeed but do
   the wrong thing," which the error log alone cannot.
8. **Need the operational history of what a request or an operator changed?**
   Filter the Audit trail tab by the same trace id — it is a separate,
   immutable technical record from the readable Timeline views elsewhere in
   the platform admin (see [`tenant-control-plane.md`](tenant-control-plane.md#timeline-and-audit-are-not-the-same-thing)
   for that distinction, which holds here too).

## Related

[[audit-events]] (the four underlying mechanisms) · [`rbac.md`](rbac.md#platform-audit-trail-read-access) ·
[`tenant-control-plane.md`](tenant-control-plane.md#timeline-and-audit-are-not-the-same-thing).
