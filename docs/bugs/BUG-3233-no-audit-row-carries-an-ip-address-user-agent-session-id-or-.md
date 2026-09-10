---
ID: BUG-3233
aliases: [BUG-3233]
Title: No audit row carries an IP address, user agent, session id or request id; the two indexed correlation columns are dead
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: DATA_INTEGRITY
Source: SECURITY_REVIEW
DetectedDate: 2026-09-10
DetectedInSha: f36749b3
AffectedModules: [services/api/src/modules/audit]
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

# BUG-3233 — No audit row carries an IP address, user agent, session id or request id; the two indexed correlation columns are dead

## Summary

No audit row carries an IP address, user agent, session id or request id; the two indexed correlation columns are dead

Identified by the 2026-09-10 full technical audit as OBS-19 (confidence: OBS-19=CONFIRMED).

## Expected Behavior

`ipAddress`, `userAgent`, `sessionId` as real columns, and `requestId` populated from `req.requestId` for every write.

## Actual Behavior

For a salary change, a role grant or a payroll finalisation the trail answers *who* (if the actor still exists — OBS-20), *what*, *when* and *which tenant*. It cannot answer *from where*, *on which session*, or *as part of which request* — and two changes made in the same HTTP request cannot be tied together.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**OBS-19** (services/api/prisma/schema.prisma, modules/audit/audit.service.ts, common/request-context/):

`services/api/prisma/schema.prisma:10440-10466` — the complete `AuditLog` model. It has `requestId`, `traceId`, `sourceModule`, `scope`, `beforeSnapshot`, `afterSnapshot`. It has **no** `ipAddress`, **no** `userAgent`, **no** `sessionId`, **no** `employeeId`, and no integrity hash / previous-hash chain.
`AuditService.log`'s input type (`modules/audit/audit.service.ts:13-27`) offers no network or session parameter either.
A multiline scan for those keys inside an `audit.log({...})` block — `rg -U "audit(Service)?\.log\(\s*\{[^}]*(requestId|traceId):" services/api/src --glob '!*.spec.ts'` — returns **zero matches**. Every row is written through `audit.service.ts:65-66` with both inputs undefined:
```ts
requestId: input.requestId ?? null,
traceId: input.traceId ?? null,
```
So `schema.prisma:10464 @@index([tenantId, requestId])` and `:10488 @@index([requestId])` on `PlatformAuditLog` index a permanently-null column.
`RequestContextService` — the one `AsyncLocalStorage` in the API — carries no request identity: `common/request-context/request-context.service.ts:5-14` holds only `userId, tenantId, businessUnitId, organizationId, accessibleBusinessUnitIds, accessibleUserIds, effectiveAccessLevel, requiresSelfScope`.
`AuditService`'s sole constructor dependency is `AuditRepository` (`audit.service.ts:10`), so it cannot reach it anyway.
The one exception is smuggled into JSON by the auth module, and the read side digs it back out — `audit.service.ts:215-218`:
```ts
ipAddress: readSnapshotString(item.afterSnapshot, 'ipAddress'),
appClientId: readSnapshotString(item.afterSnapshot, 'appClientId'),
userAgent: readSnapshotString(item.afterSnapshot, 'userAgent'),
sessionId: readSnapshotString(item.afterSnapshot, 'sessionId'),
```
These are unindexed and unfilterable — `audit.repository.ts:59-73`'s `where` supports only `action`, `entityType`, `actorUserId` and a date range — and are `null` for all 233 non-auth call sites while the API response still presents them as though they were columns.

---


Full finding text: OBS-19 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/OBS.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

After a compromise, the audit log cannot separate the attacker's session from the legitimate user's, and cannot establish the blast radius of a single request.

## Affected Areas

services/api/src/modules/audit

## Proposed Resolution

(1) Extend `BuAccessRequestContext` with `requestId`, `ipAddress`, `userAgent`, `sessionId`, populated by `RequestIdMiddleware` / `BusinessUnitAccessMiddleware`. (2) Inject `RequestContextService` into `AuditService` and default the four fields from it, so no call site has to remember. (3) Add the three columns by migration with `@@index([tenantId, createdAt])` already present. This makes OBS-12's detection queries possible.

(Difficulty: MEDIUM; Regression risk: LOW; Fix now: LATER)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for services/api/prisma/schema.prisma, modules/audit/audit.service.ts, common/request-context/ (audit id OBS-19).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: OBS-19=LOW. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `OBS-19` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/OBS.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (OBS-19) at `f36749b3`.
