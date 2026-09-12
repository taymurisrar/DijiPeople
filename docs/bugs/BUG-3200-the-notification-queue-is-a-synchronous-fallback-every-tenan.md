---
ID: BUG-3200
aliases: [BUG-3200]
Title: The notification queue is a synchronous fallback: every tenant email is sent on the HTTP request thread with no retry
Status: OPEN
Severity: HIGH
Priority: P1
Type: PERFORMANCE
Source: REVIEWER
DetectedDate: 2026-09-10
DetectedInSha: 23504f4b
AffectedModules: [services/api/src/modules/notifications]
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-11
ResolvedAt:
---

# BUG-3200 — The notification queue is a synchronous fallback: every tenant email is sent on the HTTP request thread with no retry

> **Architect triage, 2026-09-11 — `PLAN_REQUIRED`.** A synchronous "queue" means every tenant email blocks a request. Real async delivery is the fix and it is infrastructure-shaped — the outbox already exists to build on.

## Summary

The notification queue is a synchronous fallback: every tenant email is sent on the HTTP request thread with no retry

Identified by the 2026-09-10 full technical audit as RES-06 (confidence: RES-06=CONFIRMED).

## Expected Behavior

the same durable-queue treatment the platform side
  already has, or the outbox, which is already in the process and already
  handles claim, retry and backoff.

## Actual Behavior

a tenant notification is a blocking SMTP conversation
  inside the request that triggered it — TCP + TLS + AUTH + DATA + QUIT, up to
  three 10-second timeouts if the relay is unreachable. Tenant-side email has no
  retry at all (only the *platform* side has `PlatformOutboundEmail` with
  `nextRetryAt`); a transient relay failure loses the notification permanently
  apart from a delivery-log row.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**RES-06** (`services/api/src/modules/notifications/queues/notification-queue.service.ts`, `notifications/email/providers.ts`):

`notification-queue.service.ts:45-77` — both branches call `executeSync`:
  ```ts
  if (!this.isQueueEnabled()) {
    return executeSync({ ... queue: { enabled: false, mode: 'sync' } ... });
  }
  this.logger.warn(JSON.stringify({
    message: 'Notification queue requested but BullMQ is not wired; using sync fallback.',
  }));
  return executeSync({ ... mode: 'sync-fallback' ... });
  ```
  and its own diagnostics say so — `:33`:
  ```ts
  note: 'BullMQ package/Redis worker is not wired in this workspace yet; sync fallback is active.',
  ```
  A new SMTP transport is created and torn down per message —
  `notifications/email/providers.ts:192`, `:284-305`, `:230-233`:
  ```ts
  const transport = this.createTransport(config);
  ...
  connectionTimeout: Number(config.connectionTimeoutMs ?? 10000),
  greetingTimeout: ...,
  socketTimeout: ...,
  ...
  } finally { transport.close(); }
  ```
  On failure it returns rather than retries — `:220-232`:
  ```ts
  // Surfaced to the delivery log rather than thrown, so one bad mailbox
  // does not abort the notification that triggered it.
  return { accepted: false, providerType: this.providerType, ... };
  ```
  There are 51 awaited notification dispatches across the codebase, in request
  handlers such as `payslips.service.ts:546` (`deliverPayslip`) and
  `payslips.service.ts:764`.

---


Full finding text: RES-06 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/RES.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

every state change that notifies is as slow as the mail relay and
  fails when it does. A relay outage adds up to 10 s (per attempt, per
  recipient) to user-facing requests such as payslip delivery, leave decisions
  and contract signature requests — and on top of RES-01 a mail-relay brownout
  becomes an API-wide connection-pool exhaustion.

## Affected Areas

services/api/src/modules/notifications

## Proposed Resolution

route tenant email through the existing outbox — emit an
  event in the caller's transaction and let a handler send it — rather than
  wiring BullMQ and a Redis dependency the repository has deliberately avoided.
  That gives claim, backoff, `maxAttempts` and a dead-letter status for free.
  Failing that, mirror the `PlatformOutboundEmail` pattern for tenant email.

(Difficulty: MEDIUM; Regression risk: MEDIUM — callers that currently observe the send result
  synchronously (`deliverPayslip` sets `deliveredAt`) need reworking.; Fix now: LATER (but it is the largest single resilience gap in the request path))

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for `services/api/src/modules/notifications/queues/notification-queue.service.ts`, `notifications/email/providers.ts` (audit id RES-06).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: RES-06=MEDIUM — callers that currently observe the send result
  synchronously (`deliverPayslip` sets `deliveredAt`) need reworking.. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `RES-06` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/RES.md`
- [[ITEM-0168]] — the manual, operator-initiated delivery retry. Resolved
  2026-09-12 independently of this bug (its own ExecPlan, EXECPLAN-0039); its
  record explicitly leaves reviving `listRetryableDeliveryLogs` into a real
  automatic/scheduled retry to this bug, since that depends on the outbox
  work proposed here rather than on the current synchronous send path.

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (RES-06) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Referenced by — [[ITEM-0168]]
- Modules — [[notifications]]

<!-- GRAPH:END -->
