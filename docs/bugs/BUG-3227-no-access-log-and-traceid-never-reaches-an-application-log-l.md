---
ID: BUG-3227
aliases: [BUG-3227]
Title: No access log, and traceId never reaches an application log line: a successful request leaves no trace at all
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: INFRA
Source: REVIEWER
DetectedDate: 2026-09-10
DetectedInSha: f36749b3
AffectedModules: [services/api/src/common]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/tasks/TASK-0032-streams/QA-summary.md
RegressionId: REG-579
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: TASK-0032
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-25
ResolvedAt: 2026-09-25
---

# BUG-3227 — No access log, and traceId never reaches an application log line: a successful request leaves no trace at all

> **Architect triage, 2026-09-11 — `DEFER`.** Real and recorded, below the line for this cycle. Revisit at the next backlog review — the evidence is in the record, so nothing is lost by scheduling it later.

## Summary

No access log, and traceId never reaches an application log line: a successful request leaves no trace at all

Identified by the 2026-09-10 full technical audit as OBS-04 (confidence: OBS-04=CONFIRMED).

## Expected Behavior

Take a user complaint ("it broke at 14:32, reference `req_8f3…`") and find the request. Today you can do this **only if the request errored**, and only by querying the `ErrorLog` table — `GET /api/error-logs/:traceId` or Platform Admin monitoring. For a slow request, a wrong-result request, or a suspicious successful request, there is nothing to find.

## Actual Behavior

The only log line that carries the trace id is `common/filters/http-exception.filter.ts:118-122`, which runs only when a request throws. A successful request produces zero log output. A `logger.warn` emitted deep inside a service cannot be tied to the request that caused it.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**OBS-04** (services/api/src/common/middleware/request-id.middleware.ts, services/api/src/app.module.ts):

A trace id **is** minted and returned on every response — `common/middleware/request-id.middleware.ts:22-30`:
```ts
const incoming = req.header(traceHeader) ?? req.header(REQUEST_ID_HEADER);
const requestId = incoming && incoming.trim().length > 0 ? incoming.trim().slice(0, 128) : `req_${randomUUID()}`;
req.requestId = requestId;
res.setHeader('X-Request-Id', requestId);
res.setHeader('X-Trace-Id', requestId);
```
applied globally at `app.module.ts:170-172` (`.forRoutes({ path: '*path', method: RequestMethod.ALL })`).
But `rg "requestId"` across `services/api/src` excluding specs shows it is consumed in exactly **one** place outside the middleware itself — `modules/partner-experience/partner-experience.controller.ts:40` — and by the exception filter. Every other hit is an unrelated route parameter (`timesheets`, `agent`). No `Logger` call anywhere interpolates it.
There is **no HTTP logging interceptor**: `rg -ln "NestInterceptor" services/api/src` returns nothing at all, and `rg -n "morgan|accessLog"` returns nothing.

---


Full finding text: OBS-04 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/OBS.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

Support cannot reconstruct incidents. Security cannot reconstruct an attacker's session — every read of employee data that *succeeded* is invisible.

## Affected Areas

services/api/src/common

## Proposed Resolution

Add a Nest interceptor emitting one structured line per request (`traceId`, method, path, status, duration, `userId`, `tenantId`) at `log` level, and set `LOG_LEVEL` accordingly (OBS-03). Thread `req.requestId` into `RequestContextService` so services and `AuditService` can read it (see OBS-19).

(Difficulty: MEDIUM; Regression risk: LOW; Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for services/api/src/common/middleware/request-id.middleware.ts, services/api/src/app.module.ts (audit id OBS-04).

## Regression Coverage

REG-579 (`services/api/src/common/middleware/access-log.middleware.spec.ts` —
one structured line per request when `REQUEST_LOGGING_ENABLED=true`, never the
body/headers/query/token, no listener attached when the flag is unset) and
REG-578 (`services/api/src/modules/audit/audit.service.spec.ts` — a new
`TraceContextService` supplies the ambient trace id to `AuditService.log()`
whenever a caller does not pass one explicitly). Both proven to fail against
the pre-fix code — neither the middleware nor the trace-context fallback
existed before this branch.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `OBS-04` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/OBS.md`

## Resolution

Fixed on `agent/pah-wp06-monitoring` (TASK-0032 WP-06, commits `c45da293`,
`31d57471`, `d7ce82fc`, `c03d0d33`, `d80ab317`, merged as `9abb01f4`): a new
`AccessLogMiddleware` writes one structured line per request (`method`,
`route`, `statusCode`, `durationMs`, `traceId`, `tenantId`, `userId`) on
`finish`, gated on `REQUEST_LOGGING_ENABLED`; a new `TraceContextService`
(`AsyncLocalStorage`, set by `RequestIdMiddleware`) supplies the ambient trace
id to `AuditService.log()` whenever a caller does not pass one explicitly, for
both tenant and platform audit rows.

## QA Retest

Verified by the passing `access-log.middleware.spec.ts` and
`audit.service.spec.ts`; the resulting audit-trail traceId linkage was
exercised end to end during TASK-0032 WP-10's platform audit trail work
(REG-582's "related audit events" join) and WP-09 live QA of the monitoring
screens.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (OBS-04) at `f36749b3`.
- 2026-09-25 — fixed on `agent/pah-wp06-monitoring` (WP-06, merged
  `9abb01f4`); verified by regression suite and downstream WP-10/WP-09 use;
  Architect disposition DONE.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Regression — REG-579 (see the regression register)

<!-- GRAPH:END -->
