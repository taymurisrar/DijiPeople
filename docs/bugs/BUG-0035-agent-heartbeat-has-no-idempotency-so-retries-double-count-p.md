---
ID: BUG-0035
aliases: [BUG-0035]
Title: Agent heartbeat has no idempotency so retries double count productivity
Status: OPEN
Severity: HIGH
Priority: P1
Type: DATA_INTEGRITY
Source: QA_RUN
DetectedDate: 2026-08-16
DetectedInSha: 78072d2
AffectedModules: [services/api/src/modules/agent, services/api/prisma, apps/agent-desktop]
OwnerAgent: integration
ArchitectDisposition: PLAN_REQUIRED
QAReport: docs/qa/runs/2026-08-16-monorepo-app-documentation-78072d2.md
RegressionId:
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-16
UpdatedAt: 2026-08-16
ResolvedAt:
---

# BUG-0035 — Agent heartbeat has no idempotency so retries double count productivity

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
[[ITEM-0026]].

## Related Items

[[desktop-agent-architecture]] · [[desktop-agent]] ·
[[desktop-api-gateway-relationship]] · [[integration-architecture]] ·
[[attendance]] · [[ITEM-0026]] · bug pattern [[declared-but-unwired-step]].

## Resolution

Not resolved. Found by an audit; no product code changed by that task.

## QA Retest

Not applicable — not yet fixed. Verified by reading the batch loop, the create
call, the increment updates, the `ActivityEvent` model and the client requeue
path at `78072d2`. **The duplication was not executed against a live database** —
it follows from an unconditional `create` on a table with no unique constraint,
combined with a full-batch requeue.

## History

- 2026-08-16 — found during the `apps/agent-desktop` deep documentation audit
  (TASK-0002) and verified against source at `78072d2`.
- 2026-08-16 — Architect triage: `PLAN_REQUIRED`. Client contract, schema
  migration and aggregate semantics must change together; doing any one alone
  leaves the totals wrong.
</content>
