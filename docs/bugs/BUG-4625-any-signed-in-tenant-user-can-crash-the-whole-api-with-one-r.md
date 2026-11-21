---
ID: BUG-4625
aliases: [BUG-4625]
Title: Any signed-in tenant user can crash the whole API with one request to GET /platform/logs
Status: FIXED
Severity: CRITICAL
Priority: P0
Type: SECURITY
Source: QA_RUN
DetectedDate: 2026-11-21
DetectedInSha: 4c2517e7
AffectedModules: [platform-monitoring]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-703
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-11-21
UpdatedAt: 2026-11-21
ResolvedAt:
---

# BUG-4625 — Any signed-in tenant user can crash the whole API with one request to GET /platform/logs

## Summary

`GET /api/platform/logs` is a platform-only route. When a caller without platform permission reaches it, `PlatformMonitoringService.assertSuperAdmin` records a denial audit and answers 403. For a tenant caller the audit write put a tenant user id into `PlatformAuditLog.platformActorUserId`, a foreign key to platform users, so the insert failed. The call was `void this.auditService.log(...)` with no `.catch`, so the rejection was unhandled, and Node ends the process on an unhandled rejection by default. One request from any signed-in tenant user ended the API process.

## Expected Behavior

A tenant caller gets 403 and the denial is recorded. A failed audit write never changes the response and never ends the process.

## Actual Behavior

The caller never received a response: the API process exited. The denial was not recorded either.

## Reproduction

1. Boot the API (`nest start`) against a database containing a tenant and a user with NO roles.
2. Sign a tenant access token for that user and call `GET /api/platform/logs` with `X-DijiPeople-App: web`.
3. Observe the connection fail and `/api/health/live` stop answering. The log shows `insert or update on table "PlatformAuditLog" violates foreign key constraint "PlatformAuditLog_platformActorUserId_fkey"`.

Reproduced on 2026-11-22: liveness answered 200 before the request and "Unable to connect" after it. Run in development mode; production runs `node dist/src/main.js` and has the same Node default, but the production process was not tested and was not touched.

## Evidence

- `services/api/src/modules/platform-monitoring/platform-monitoring.service.ts` `assertSuperAdmin`: `void this.auditService.log({ tenantId: 'platform', actorUserId: user.platform?.id ?? user.userId ... })` with no catch.
- `services/api/src/modules/audit/audit.service.ts`: for `tenantId === 'platform'` the actor is written to `platformActorUserId`.
- No `unhandledRejection` handler existed anywhere in `services/api/src`.
- Before the fix, the regression test failed with `Foreign key constraint violated on the constraint: PlatformAuditLog_platformActorUserId_fkey` and no audit row; after, it passes.

## Root Cause

A fire-and-forget promise with no rejection handler, whose write could fail for a caller class the code did not consider (a tenant user reaching a platform route), combined with Node's default of ending the process on an unhandled rejection and no process-level net.

## Impact

Reachable by any authenticated tenant user, whatever their role, including a free trial account: a single request ended the process, and repeating it keeps it down while the platform restarts it. This is a remote denial of service against every tenant. Not known to have been exploited. Production was not tested; whether the platform restarts the process, and how quickly, determines the duration of each outage. A sweep found no other `void this.*.log(` call without a catch.

## Affected Areas

`platform-monitoring`: the routes that call `assertSuperAdmin` (`GET /platform/logs` and the two log download routes). Process-wide: any other fire-and-forget promise.

## Proposed Resolution

Record a tenant caller's denial against their own tenant and user, and give the call its own catch so it can never reject into the void. Add a logged `unhandledRejection` handler as a net so one forgotten catch elsewhere cannot end the process. Done.

## Acceptance Criteria

- A tenant caller of `GET /platform/logs` gets 403, an audit row exists against their tenant and user, and no unhandled rejection is raised.
- An unhandled rejection is logged with its stack and the process keeps serving; `uncaughtException` is unchanged.

## Regression Coverage

`services/api/test/platform-tenant-boundary.e2e-spec.ts` ("BUG-4625"), and `services/api/src/common/process/unhandled-rejection.spec.ts`. REG-703, QA-AUTHZ-021. Fails without the fix: the foreign-key violation is raised and no audit row exists.

## Dependencies

Other records, decisions or infrastructure this waits on.

## Related Items

Wikilinks to related bugs, items, modules and decisions — for the Obsidian graph.

## Resolution

Fixed on branch `agent/dependency-alert-remediation` (SESSION-0137, WP3): `assertSuperAdmin` now audits a platform caller against the platform log and a tenant caller against their own tenant, with a `.catch` that logs; `installUnhandledRejectionHandler` is installed at bootstrap. Residual risk: the handler keeps the process alive after an unhandled rejection, which is a deliberate trade against an outage and is logged at error level each time.

## QA Retest

QA-AUTHZ-021 on the isolated database, 2026-11-22: passing with the fix and failing on the original code. Independent QA/Security review of this fix is pending.

## History

- 2026-11-21 — created from qa run at `4c2517e7`.
- 2026-11-22 — reproduced against a booted API, root cause established, fixed in source, REG-703 and QA-AUTHZ-021 added.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Regression — REG-703 (see the regression register)

<!-- GRAPH:END -->
