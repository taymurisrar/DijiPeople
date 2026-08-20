---
ID: BUG-0070
aliases: [BUG-0070]
Title: Outbox deduplication aborted the caller transaction on PostgreSQL
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-18
DetectedInSha: 1fb2bf9
AffectedModules: [outbox]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: QA-BILLING-002
RegressionId: REG-064
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: TASK-0007 WP-01
CreatedAt: 2026-08-18
UpdatedAt: 2026-08-18
ResolvedAt: 2026-08-18
---

# BUG-0070 — Outbox deduplication aborted the caller transaction on PostgreSQL

## Summary

The transactional outbox deduplicated a repeated emission by catching the unique
constraint violation and reading the existing row back. On PostgreSQL a
constraint violation **aborts the entire surrounding transaction**, so that read
could never execute — and because `OutboxService.emit` is deliberately required
to run inside the *caller's* transaction, the failure poisoned the caller's
business write too. Every subsequent statement in that transaction failed with
`current transaction is aborted, commands ignored until end of transaction
block`, and the whole thing rolled back.

## Expected Behavior

Emitting the same domain event twice is a success, not a conflict. The second
`emit` returns the id of the event that already exists, the caller's business
transaction is unaffected, and exactly one `OutboxEvent` row exists.

## Actual Behavior

The second `emit` threw `DriverAdapterError: current transaction is aborted`.
The caller's transaction — the business state change the event was announcing —
rolled back with it.

## Reproduction

1. Apply migrations through `20260818090000_transactional_outbox` to a real
   PostgreSQL database.
2. `await prisma.$transaction((tx) => service.emit(tx, event))` with a fixed
   `idempotencyKey`. Commit.
3. Repeat step 2 with the **same** `idempotencyKey`.

Step 3 throws instead of returning `{ deduplicated: true }`.

## Evidence

`services/api/test/outbox-delivery.e2e-spec.ts`, first case, before the fix:

```
● Transactional outbox (DB-backed) › collapses a repeated emission to one row
  DriverAdapterError: current transaction is aborted, commands ignored until
  end of transaction block
    at PgTransaction.performIO (@prisma/adapter-pg)
Tests: 1 failed, 4 passed, 5 total
```

Defective code was `services/api/src/modules/outbox/outbox.service.ts:40-79` at
`1fb2bf9` — `create()` inside `try`, `findUniqueOrThrow()` inside
`catch (isUniqueViolation)`.

## Root Cause

PostgreSQL aborts a transaction on any statement error; it does not offer
statement-level rollback without an explicit `SAVEPOINT`. Catching the error in
application code does not undo the abort. The pattern is only viable on engines
with statement-level error isolation, or with a savepoint around the insert.

**Why it shipped.** The unit spec proved the behaviour against a Prisma double,
and a double returns whatever it is told to return — it raised a `P2002` and then
happily answered the follow-up read. Nothing in a mocked test can model a
poisoned transaction. This is the `mocked-proof-of-a-database-guarantee` shape:
the closer a guarantee sits to the database, the less a double can say about it.

## Impact

**Production-reachable and silent.** Every redelivered Stripe webhook, every
retried activation and every reconciliation job that re-derived a state it had
already derived would have rolled back the business change it was confirming.
The caller would see a transaction failure with no indication that
deduplication caused it.

Not yet reached in practice only because no emitter is wired at this SHA —
`DomainEventType` names the transitions but WP-05..WP-08 supply the callers. The
defect would have detonated on the first real consumer.

## Affected Areas

`services/api/src/modules/outbox/outbox.service.ts` — `emit()` and, through it,
every future caller that pairs a business write with an event.

## Proposed Resolution

Replace catch-the-violation with `INSERT … ON CONFLICT ("idempotencyKey") DO
NOTHING RETURNING "id"`. `ON CONFLICT` never raises, so the transaction stays
healthy; an empty `RETURNING` is the duplicate signal, and the existing row is
then read normally. Uniqueness stays enforced by the index rather than by a
pre-check, so concurrent emitters still collapse to one row. No ExecPlan needed —
single function, no schema change.

## Acceptance Criteria

1. Repeated `emit` with the same key returns `{ deduplicated: true }` and the
   same id, against real PostgreSQL.
2. Exactly one `OutboxEvent` row exists afterwards.
3. The caller's transaction commits normally after a deduplicated emit.
4. A non-constraint failure still propagates, so the caller rolls back.

## Regression Coverage

`services/api/test/outbox-delivery.e2e-spec.ts` — *"collapses a repeated
emission to one row, by unique index rather than by a pre-check"*. It fails
against the pre-fix implementation with the abort error above, which is the
property that makes it a regression test rather than a restatement.

The unit spec cannot cover this and now says so in a comment, pointing at the
DB-backed proof as the authority.

## Dependencies

Real PostgreSQL. Found only once a local credential became available; the
CI database jobs would also have caught it, but no consumer existed to exercise
`emit` there.

## Related Items

[[QA-BILLING-002]] · [[PLAN-014]] · [[TASK-0007]] · [[outbox]]

## Resolution

Fixed on `agent/commercial-platform-completion`.
`services/api/src/modules/outbox/outbox.service.ts` now uses `ON CONFLICT DO
NOTHING RETURNING`, with the reasoning recorded inline so the next person does
not "simplify" it back into a try/catch. The now-unused `isUniqueViolation`
helper was removed.

## QA Retest

`outbox-delivery.e2e-spec.ts` — 5 passed against PostgreSQL 18, including the
two-dispatcher concurrency case and the rollback case. Outbox unit specs: 14
passed.

## History

- 2026-08-18 — created from qa run at `1fb2bf9`.
- 2026-08-18 — root cause established, fixed, and verified against real PostgreSQL. `VERIFIED`.
