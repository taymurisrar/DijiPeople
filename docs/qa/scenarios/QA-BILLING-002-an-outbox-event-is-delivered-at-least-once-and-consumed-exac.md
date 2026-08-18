---
SCENARIO_ID: QA-BILLING-002
aliases: [QA-BILLING-002]
TITLE: An outbox event is delivered at least once and consumed exactly once
AREA: outbox
MODULE: outbox
TYPE: DATABASE
RISK: HIGH
AUTOMATION_STATUS: PARTIAL
TEST_REFERENCE: services/api/src/modules/outbox/outbox-dispatcher.service.spec.ts
RELATED_BUGS: []
RELATED_REGRESSIONS: []
LAST_RUN: 2026-08-18
LAST_RESULT: PASS_WITH_RISKS
CREATED_AT: 2026-08-18
UPDATED_AT: 2026-08-18
---

# QA-BILLING-002 — An outbox event is delivered at least once and consumed exactly once

## Preconditions

A real PostgreSQL database with the migration history applied through
`20260818090000_transactional_outbox`. The dispatcher is exercised directly via
`OutboxDispatcherService.drain()`; the poll loop (`OUTBOX_WORKER_ENABLED`) is
**not** required and should stay off, so the test controls when a drain happens.

At least one registered handler for the event type under test.

## Steps

1. Inside one transaction, write a business change and call
   `OutboxService.emit(tx, …)` with a fixed `idempotencyKey`. Commit.
2. Call `emit` again in a second transaction with the **same** `idempotencyKey`.
3. Roll back a third transaction that also called `emit` with a different key.
4. Run `drain()`. Let the handler succeed.
5. Run `drain()` again.
6. Force a handler failure on a second event and run `drain()` until the attempt
   budget is exhausted.
7. Simulate a crashed dispatcher: set a row to `CLAIMED` with a `claimedAt`
   older than the five-minute lease, then `drain()`.
8. Run two `drain()` calls concurrently against a batch of pending events.

## Expected Result

1. One `OutboxEvent` row exists.
2. Step 2 returns `deduplicated: true` and the **same** event id. Still one row —
   the unique index on `idempotencyKey`, not a pre-check, is what refuses it.
3. No event row survives the rollback. The business change and its event are
   atomic in both directions.
4. The event reaches `PROCESSED`, and exactly one `OutboxEventConsumption` row
   exists for `(event, consumerKey)` with `succeeded = true`.
5. The handler is **not** invoked a second time, and no duplicate consumption row
   is created — the unique constraint on `(outboxEventId, consumerKey)` refuses it.
6. The event moves `RETRY_SCHEDULED` → … → `FAILED` once `attemptCount` reaches
   `maxAttempts`. Each retry's `availableAt` is strictly in the future, and the
   backoff is non-decreasing.
7. The expired claim returns to `RETRY_SCHEDULED` with `claimedBy` cleared, and
   `attemptCount` is **unchanged** — a restart is not a failed attempt.
8. Every event is claimed by exactly one dispatcher. No event is handed to both,
   which is what `FOR UPDATE SKIP LOCKED` buys over find-then-update.

A handler returning `MANUAL_ACTION_REQUIRED` must leave the event in
`MANUAL_ACTION_REQUIRED`, not `RETRY_SCHEDULED` — retrying what no retry can fix
burns the budget and then misreports the cause as infrastructure.

## Notes

Created 2026-08-18 at `bd0fb36`.

**`LAST_RESULT: PASS_WITH_RISKS` is deliberate and is not a clean pass.** Steps 1–7 are covered
by the two unit specs against Prisma doubles and pass. Step 8, and the
database-level guarantees behind steps 2, 5 and 7 — the unique indexes and
`FOR UPDATE SKIP LOCKED` — are **not** proven by those specs: a double cannot
refuse a duplicate insert or serialise a claim. They need real PostgreSQL, and no
local credential was available in the environment this was written in.

WP-13 owns promoting this to a real-PostgreSQL run. Until then the concurrency and
constraint claims are designed-for, not demonstrated.
