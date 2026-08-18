# Outbox

> Generated from repository evidence at `1fb2bf9`, plus the real-PostgreSQL run
> that produced [[BUG-0070]] on 2026-08-18.

## Purpose

The delivery half of domain eventing. A business state change and the event
announcing it are written in the **same transaction**, so the pair is atomic:
there is no window in which a subscription activates with nothing scheduled to
provision it, and none in which provisioning is scheduled for an activation that
rolled back.

## The distinction that matters

`PlatformEvent` and `OutboxEvent` are easy to confuse and answer different
questions:

| | Answers | Has |
|---|---|---|
| `PlatformEvent` | *What happened?* — observability | no status, no attempts, nothing to claim |
| `OutboxEvent` | *What must still happen?* — delivery | status, attempts, claim, backoff, consumers |

`PlatformEvent` cannot deliver anything. Before this module existed, a domain
service needing a side effect to survive a crash had nowhere to put it, so every
such side effect ran inline and inherited the failure modes of whatever it
called.

## Main API / services

`services/api/src/modules/outbox/`:

- `OutboxService.emit(tx, input)` — **requires the caller's transaction client.**
  This is the entire guarantee, not a convenience. `emitStandalone` exists only
  for a caller whose business change is already committed.
- `OutboxDispatcherService.drain(batchSize)` — claim, dispatch, settle.
- `OutboxWorkerService` — the poll loop, **off by default**
  (`OUTBOX_WORKER_ENABLED`).

Consumers implement `OutboxHandler` and are collected through the
`OUTBOX_HANDLERS` token, so a domain module contributes a consumer without the
outbox module depending on it.

## Important business rules

- **Emission is idempotent** on `idempotencyKey`, which is the *business
  identity* of a transition — never a timestamp or a random value, or every
  redelivery looks like a new transition.
- **Consumption is idempotent** on a unique `(outboxEventId, consumerKey)`. A
  consumer that already succeeded is never re-run, which is what makes
  redelivery safe when only one of several consumers failed.
- **Delivery is at-least-once**, never exactly-once. Consumers must be idempotent.
- **An event with no registered consumer is `PROCESSED`, not failed.** Emitting a
  transition nobody listens to yet is legitimate.
- **`MANUAL_ACTION_REQUIRED` is not a failure.** Retrying what no retry can fix
  burns the attempt budget and then misreports the cause as infrastructure.
- **Lease reclaim does not increment `attemptCount`.** A restart is not a failed
  attempt.

## Traps

**Do not "simplify" the insert back into try/catch.** This is [[BUG-0070]], and
it is the single most likely regression in this module. The obvious
implementation — `create()`, catch `P2002`, read the row back — passes every
mocked test and cannot work on PostgreSQL: a constraint violation **aborts the
surrounding transaction**, so the read in the catch block never runs, and because
`emit` runs inside the *caller's* transaction it rolls back the business change
too. The code uses `INSERT … ON CONFLICT DO NOTHING RETURNING` and says why
inline. See [[REG-064]].

**Claiming must stay `FOR UPDATE SKIP LOCKED`.** A find-then-update dispatcher
hands the same row to two workers. The two-dispatcher case in
`test/outbox-delivery.e2e-spec.ts` is what proves it.

**Running the worker on zero instances fails silently.** Events accumulate in
`PENDING` and the transitions they carry simply never happen. More than one
instance is safe.

## Why a poll loop and not a broker

This is a modular monolith with one database and no queue infrastructure — the
notification "queue" is a synchronous fallback with no Redis behind it. A broker
would add a second deployable and a second failure mode to solve what
`SKIP LOCKED` already solves inside the transaction boundary that already exists.

## Testing

`PLAN-014` and `QA-BILLING-002`. The unit specs cover branching; the guarantees
that matter are referential and live in
`services/api/test/outbox-delivery.e2e-spec.ts`, which needs real PostgreSQL.
A Prisma double will happily "prove" all four guarantees while the schema
enforces none of them.

## Current state

Delivers correctly and delivers nothing: no emitter and no consumer are wired at
this SHA. `DomainEventType` names 24 transitions; the services that emit them are
WP-05..WP-08 of [[TASK-0007]], and the first consumer is WP-07.

## Related

[[legal]] · [[TASK-0007]] · [[BUG-0070]] · [[REG-064]] · [[QA-BILLING-002]]
