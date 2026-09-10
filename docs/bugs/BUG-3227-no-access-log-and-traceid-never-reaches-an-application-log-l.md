---
ID: BUG-3227
aliases: [BUG-3227]
Title: No access log, and traceId never reaches an application log line: a successful request leaves no trace at all
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: INFRA
Source: REVIEWER
DetectedDate: 2026-09-10
DetectedInSha: f36749b3
AffectedModules: [services/api/src/common]
OwnerAgent: architect
ArchitectDisposition: TRIAGE_REQUIRED
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-10
ResolvedAt:
---

# BUG-3227 — No access log, and traceId never reaches an application log line: a successful request leaves no trace at all

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

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: OBS-04=LOW. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `OBS-04` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/OBS.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (OBS-04) at `f36749b3`.
