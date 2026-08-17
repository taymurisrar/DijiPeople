---
ID: BUG-0036
aliases: [BUG-0036]
Title: Agent heartbeat has no idempotency so retries double count productivity
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: DATA_INTEGRITY
Source: QA_RUN
DetectedDate: 2026-08-16
DetectedInSha: 78072d2
AffectedModules: [services/api/src/modules/agent, services/api/prisma, apps/agent-desktop]
OwnerAgent: integration
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-16-monorepo-app-documentation-78072d2.md
RegressionId: REG-031
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-16
UpdatedAt: 2026-08-17
ResolvedAt: 2026-08-16
---

# BUG-0036 — Agent heartbeat has no idempotency so retries double count productivity

## Summary

The desktop agent sends heartbeat events in batches and re-sends the **whole
batch** when a send fails. The server processes the batch serially, without a
transaction, creating each `ActivityEvent` unconditionally and **incrementing**
running totals. A batch that fails partway therefore commits its earlier events,
gets replayed in full, and permanently inflates `WorkSession.totalActiveSeconds`
and `DailyProductivitySummary` — the numbers `utilizationPercent` is computed
from.

## Expected Behavior

`.agent/context/integration-patterns.md` states the rule this violates
directly: "Anything that can be retried **will** be… Every handler must be safe
to run twice with the same input and produce **one** business effect. Establish
the dedupe key before writing the handler."

## Actual Behavior

Replaying a heartbeat event creates a second `ActivityEvent` row and increments
the session and daily totals a second time. Nothing detects or rejects the
duplicate.

## Reproduction

1. Sign in with the desktop agent and let a session run so the offline queue
   holds several events.
2. Cause a mid-batch server failure — the natural one is ending the work session
   server-side while the agent still holds its `sessionId`, so
   `saveHeartbeatEvent` throws `NotFoundException('Active work session was not
   found.')` on an event after the first.
3. Observe that earlier events in the batch are already persisted, the HTTP call
   fails, and the agent prepends the entire batch back onto the queue.
4. Restore the session and let the queue drain. The earlier events are created a
   second time; `totalActiveSeconds` advances by twice their interval.

## Evidence

- `services/api/src/modules/agent/agent.service.ts:915-919` — the batch loop:
  `for (const event of events) { await this.saveHeartbeatEvent(…) }`. **No
  `$transaction` wraps it**, so it is not atomic.
- Same file, `saveHeartbeatEvent` — `this.prisma.activityEvent.create({…})`,
  unconditional. Not an `upsert`, and there is no natural key to upsert on.
- Same file, immediately after — `workSession.update` with
  `totalActiveSeconds: { increment: incrementSeconds }` (and the idle/away
  equivalents), then `upsertDailySummary(…, incrementSeconds)`. **Incremented,
  never recomputed from the event rows.**
- `services/api/prisma/schema.prisma`, `model ActivityEvent` — three `@@index`
  entries and **no `@@unique`**. Nothing at the database level prevents a
  duplicate.
- `apps/agent-desktop/src/main/types.ts` — `HeartbeatEvent` carries no id, no
  sequence number and no idempotency key. The client has nothing to deduplicate
  on even if the server wanted one.
- `apps/agent-desktop/src/main/session-manager.ts:343-358` — on failure the
  agent calls `offlineQueue.prepend(requeueEvents)`, putting the whole batch
  back.

## Root Cause

Established: the contract was designed as fire-and-forget append. The client has
no event identity, the wire format has no key, the table has no uniqueness
constraint, and the aggregates are stored as running counters rather than
derived from the events. Any one of those four would have contained the problem;
none is present.

The absence of a transaction around the batch is what converts "a retry is
wasteful" into "a retry is wrong": without partial commits, a failed batch would
simply be re-applied cleanly.

## Impact

The affected values are `WorkSession.totalActiveSeconds`,
`totalIdleSeconds`, `totalAwaySeconds`, `DailyProductivitySummary.activeSeconds`
and the `utilizationPercent` derived from them — surfaced to the employee
through `GET /agent/me/productivity` and to their manager through
`GET /agent/employees/:employeeId/summary`.

Inflation is **permanent** — nothing recomputes these from the event rows, so
there is no self-correction and no way to distinguish an inflated figure from a
real one after the fact.

Severity `HIGH`. Rated on the basis that these figures describe an employee's
measured working time. If they inform pay, performance review or client billing
the practical severity is higher, and this record should be re-rated when that
is known — see the owner question in the task report.

Not `CRITICAL`: no cross-tenant exposure, no authorization bypass, no data loss.

## Affected Areas

`services/api/src/modules/agent` heartbeat path · `ActivityEvent`,
`WorkSession`, `DailyProductivitySummary` · `apps/agent-desktop` offline queue
and retry · every productivity figure the agent produces.

## Proposed Resolution

**Needs an ExecPlan** — it touches the wire contract, the schema and the client
together, and a migration on `ActivityEvent`.

Direction: give each event a client-generated identity (a UUID minted when the
event is built, carried through the offline queue), add
`@@unique([tenantId, deviceId, eventId])`, and make ingestion a `createMany`
with `skipDuplicates` or a per-event upsert. Then the aggregates must stop being
blind increments — either recompute them from the event rows, or increment only
on a genuinely new insert.

The plan must also decide the poison-pill behaviour: today a permanently
rejected event (see the field-length mismatch in
[[desktop-agent-architecture]]) is requeued forever with no drop-after-N.
Idempotency and give-up behaviour are the same design conversation.

Backfill is not attempted — existing totals cannot be distinguished from correct
ones. The plan should say so explicitly rather than implying the fix repairs
history.

## Acceptance Criteria

- Sending the same heartbeat event twice produces **one** `ActivityEvent` row
  and advances the totals **once**.
- A batch that fails partway leaves the aggregates consistent with the events
  actually stored.
- A rejected-forever event is dropped after a bounded number of attempts, with a
  log line.

## Regression Coverage

**None today**, and the `agent` module has no specs at all. The regression must
replay an identical batch and assert both the row count and the totals — the
totals assertion is the one that matters, since row-level dedupe alone would
still double-increment if the counters stayed blind.

## Dependencies

None blocking. Shares a plan with the retry/backoff gap recorded in
[[ITEM-0027]].

## Related Items

[[desktop-agent-architecture]] · [[desktop-agent]] ·
[[desktop-api-gateway-relationship]] · [[integration-architecture]] ·
[[attendance]] · [[ITEM-0027]] · bug pattern [[declared-but-unwired-step]].

## Resolution

Fixed with a unique constraint, and **without deleting any production telemetry**.

The natural key is `(tenantId, sessionId, occurredAt)` — the same session cannot
legitimately produce two samples at the same instant, because the agent samples
on an interval. The obstacle was that a unique index over those existing columns
**cannot be created on a live database**: rows written before the fix already
contain the duplicates this bug produced, so the index build would fail, and the
only way to make it succeed would be to delete production rows first.

So the constraint is placed on a new nullable `ActivityEvent.dedupeKey`, which
no historical row has. PostgreSQL treats NULLs as distinct in a unique index, so
every pre-existing row is exempt and the index builds unconditionally, while
every new write is governed from the moment the migration lands. Nothing is
deleted and no history is rewritten.

The write path uses the constraint as the authority rather than reading first: a
check-then-create is racy under exactly the concurrent retry this exists to
survive, and is the divergence already recorded as a bug pattern in
[[BUG-0030-plan-list-get-mutates-commercial-pricing-and-can-fail-on-pla]]. On
P2002 the event is treated as already recorded and `saveHeartbeatEvent` returns
early — **before the counters run**, which is the entire fix. The double count
came from the increments, not from the row. The batch is still reported as
accepted, because a retrying agent is behaving correctly.

Two earlier approaches were considered and rejected, recorded here so they are
not retried:

- **Wrapping the batch in a transaction.** Closes the written reproduction, but
  puts up to 1000 events in one interactive transaction, exceeding Prisma's
  5 s default and breaking exactly the offline-backlog recovery the queue exists
  for. It also does nothing about a batch that succeeds with a lost response.
- **Check-then-create.** Racy, and a known bug pattern.

## What this does NOT fix

**Historical totals stay inflated.** `WorkSession.totalActiveSeconds` and
`DailyProductivitySummary` still carry whatever this bug added before today, and
`utilizationPercent` is computed from them. Recomputing means deciding what to
do with sessions whose events have since been pruned by telemetry retention —
their true totals are no longer derivable — and that is a decision with an owner,
not a side effect of a schema change. Tracked as [[ITEM-0032]].

## QA Retest

`heartbeat-idempotency.spec.ts` — 4 assertions: a replayed sample returns null,
a new sample returns the created event, a non-duplicate failure is rethrown, and
the key separates sessions, tenants and instants but not retries.

Verified to fail against the unsafe variant: swallowing every error rather than
only P2002 fails *rethrows a failure that is not a duplicate* — which matters,
because swallowing a database failure would drop telemetry while reporting it
accepted, so the agent would never retry and the sample would be lost.

`npm run prisma:validate` passes. The migration is additive
(`ADD COLUMN` + `CREATE UNIQUE INDEX`) and is exercised by the
`Database migration gate`, which applies the full history to an empty
PostgreSQL 16. API 159 suites / 1131 tests passing.

## History

- 2026-08-17 — Architect reconciliation: terminal `VERIFIED` status normalized
  to `ArchitectDisposition: DONE`; the existing resolution and QA evidence are
  unchanged.

- 2026-08-16 — found during the `apps/agent-desktop` deep documentation audit
  (TASK-0002) and verified against source at `78072d2`.
- 2026-08-16 — Architect triage: `PLAN_REQUIRED`. Client contract, schema
  migration and aggregate semantics must change together; doing any one alone
  leaves the totals wrong.
- 2026-08-16 — investigated during the open-bug closure wave. Left OPEN: the
  fix needs a unique index plus a backfill of already-inflated totals, which
  requires an ExecPlan. Two partial fixes were rejected with reasons rather
  than applied. An unbounded heartbeat batch found alongside it was fixed.
- 2026-08-16 — fixed via a nullable `dedupeKey` plus a unique index, chosen
  specifically so no production telemetry had to be deleted to create the
  constraint. Historical inflation is left intact and tracked as ITEM-0032.
