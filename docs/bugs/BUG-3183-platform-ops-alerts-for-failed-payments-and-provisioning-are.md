---
ID: BUG-3183
aliases: [BUG-3183]
Title: Platform-ops alerts for failed payments and provisioning are written to a log line that is never sent and is suppressed at the production log level
Status: OPEN
Severity: HIGH
Priority: P1
Type: INFRA
Source: REVIEWER
DetectedDate: 2026-09-10
DetectedInSha: 23504f4b
AffectedModules: [services/api/src/modules/platform-monitoring]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-11
ResolvedAt:
---

# BUG-3183 — Platform-ops alerts for failed payments and provisioning are written to a log line that is never sent and is suppressed at the production log level

> **Architect triage, 2026-09-11 — `FIX_NOW`.** Platform alerts for failed payments written somewhere nobody reads is a routing fix, not a monitoring project. Send them where an operator already looks.

## Summary

Platform-ops alerts for failed payments and provisioning are written to a log line that is never sent and is suppressed at the production log level

Identified by the 2026-09-10 full technical audit as OBS-02 (confidence: OBS-02=CONFIRMED).

## Expected Behavior

These events reach `PLATFORM_OPS_NOTIFICATION_EMAILS` through the notification orchestrator, or the handler returns `MANUAL_ACTION_REQUIRED` so the event stays visible in the outbox — which is exactly what the same file's header comment (lines 17-27) says the design intends when no recipient is configured.

## Actual Behavior

A payment fails, or provisioning breaks for a paying customer, and the system marks the event successfully processed with no output whatsoever.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**OBS-02** (services/api/src/modules/notifications/lifecycle-notification.handler.ts):

`services/api/src/modules/notifications/lifecycle-notification.handler.ts:76-95` — the handler resolves recipients and then does not use them:
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
The events this covers include the two most urgent commercial states — `services/api/src/modules/notifications/platform-lifecycle-notifications.catalog.ts:60-85`:
```ts
eventType: DomainEventType.PAYMENT_FAILED, code: 'OPS_PAYMENT_FAILED', severity: 'WARNING',
rationale: 'A failed payment is recoverable for a few days and then is not. Nobody discovers it by reading the database.',
...
eventType: DomainEventType.TENANT_PROVISIONING_FAILED, code: 'OPS_PROVISIONING_FAILED', severity: 'CRITICAL',
rationale: 'Somebody has paid and cannot use the product. This is the highest-severity operational state the platform has.',
```
It also covers the only tenant-facing provisioning message — `TENANT_WORKSPACE_READY` (catalog:86-94) — and the customer-facing `CUSTOMER_SEAT_OVERAGE` / `CUSTOMER_PLAN_CHANGED` (catalog:95-112). None are sent. The handler returns `'PROCESSED'`, so the outbox marks the event delivered and it disappears from the backlog — the one place an operator might otherwise have seen it.
**Second failure, compounding:** the line it does write is `logger.log`, i.e. Nest's `log` level. `services/api/src/log-level.ts:73-77` returns `env.NODE_ENV === 'production' ? ['error', 'warn'] : [...]`, and `render.yaml` declares no `LOG_LEVEL`. So in production the notification is neither sent nor logged.

---


Full finding text: OBS-02 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/OBS.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

A customer pays, provisioning fails, nobody at DijiPeople learns of it. The recovery window for a failed card payment ("recoverable for a few days and then is not", per the catalogue's own rationale) passes unnoticed. This is revenue loss and a customer-facing outage with zero detection.

## Affected Areas

services/api/src/modules/platform-monitoring

## Proposed Resolution

In `LifecycleNotificationHandler.handle`, dispatch through `NotificationOrchestratorService` / `PlatformCommunicationsService` instead of logging; until that lands, return `MANUAL_ACTION_REQUIRED` for `PLATFORM_OPS` severities `WARNING`/`CRITICAL` so the outbox retains them, and raise the log call to `logger.warn` so it survives the production level filter.

(Difficulty: MEDIUM; Regression risk: LOW; Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for services/api/src/modules/notifications/lifecycle-notification.handler.ts (audit id OBS-02).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: OBS-02=LOW. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `OBS-02` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/OBS.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (OBS-02) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
