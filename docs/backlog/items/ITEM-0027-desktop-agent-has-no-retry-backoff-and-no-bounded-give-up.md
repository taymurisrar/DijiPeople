---
ID: ITEM-0027
aliases: [ITEM-0027]
Title: Desktop agent has no retry backoff and no bounded give up
Type: TECH_DEBT
Status: READY
Priority: P2
Severity: MEDIUM
AffectedModules: [apps/agent-desktop, services/api/src/modules/agent]
Source: ARCHITECT
OwnerAgent: integration
ArchitectDisposition: PLAN_REQUIRED
CreatedAt: 2026-08-16
UpdatedAt: 2026-08-16
RelatedBug: BUG-0036
RelatedQA: docs/qa/runs/2026-08-16-monorepo-app-documentation-78072d2.md
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0027 — Desktop agent has no retry backoff and no bounded give up

## Summary

The desktop agent retries failed heartbeats at a **fixed interval, forever**,
with no exponential backoff, no jittered escalation and no give-up. It also
never drops an event the server permanently rejects, so a single malformed event
becomes an immortal poison pill at the head of the offline queue.

## Why It Matters

`.agent/context/integration-patterns.md` requires the opposite, in terms:
"No unbounded outbound call. No unbounded retry loop. State the timeout, retry
count, backoff, give-up behaviour, and what happens to the record when it gives
up."

Two concrete costs:

1. **A failing API is hammered at full rate by every installed agent
   simultaneously.** Heartbeats carry a 0–10 s jitter on their normal schedule,
   which spreads steady-state load but does nothing during an outage — every
   agent simply keeps its cadence. An API recovering from an incident faces the
   full fleet at full rate, plus each agent's accumulated queue.
2. **One oversized field can silence an agent permanently.** `ActivityTracker`
   truncates text at 300 characters while `HeartbeatEventDto.activeApp` is
   `@MaxLength(200)`. An application whose window/app name falls in that
   201–300 character band produces an event the server rejects with a `400`
   **for the whole batch**. The agent requeues the batch unchanged and retries
   it forever. That agent never reports again, and nothing surfaces it — the
   failure path is `console.error`, and `logger.error()` is never called
   anywhere in the codebase.

## Evidence

- `apps/agent-desktop/src/main/session-manager.ts` — the failure path sets
  `connectionStatus = "OFFLINE"` and prepends the batch; the next attempt is the
  same fixed interval. There is no backoff computation anywhere in `src/`.
- Same file — the only retry that exists is a single post-token-refresh retry.
- `apps/agent-desktop/src/main/offline-queue.ts` — `prepend` puts failed events
  back at the head. There is no attempt counter on an event and no
  drop-after-N logic.
- `apps/agent-desktop/src/main/activity-tracker.ts` — 300-character truncation.
- `services/api/src/modules/agent/dto/agent-session.dto.ts` — `activeApp` is
  `@MaxLength(200)`.
- `apps/agent-desktop/src/main/logger.ts` — an `error` level exists; no call
  site uses it.

## Proposed Approach

**Needs an ExecPlan**, jointly with
[[BUG-0036-agent-heartbeat-has-no-idempotency-so-retries-double-count-p]] —
give-up behaviour and idempotency are the same design conversation, and a
backoff added without idempotency just spaces out the double-counting.

Direction: exponential backoff with jitter on transient failures; classify `4xx`
as non-retryable and drop the offending event after a bounded number of attempts
with a logged reason; reconcile the truncation limit with the DTO limit so the
poison pill cannot be created in the first place; and route failures through
`logger.error` so they are observable in the file a support engineer would ask
for.

## Acceptance Criteria

- Repeated heartbeat failures produce increasing, jittered intervals rather than
  a fixed cadence.
- An event the server rejects with a `4xx` is dropped after a bounded number of
  attempts and does not block the queue behind it.
- No client-side truncation limit exceeds its server-side `@MaxLength`.
- Every heartbeat failure reaches the rotating log file, not only stdout.

## Dependencies

[[BUG-0036-agent-heartbeat-has-no-idempotency-so-retries-double-count-p]] —
shares the plan.

## Related Items

[[BUG-0036-agent-heartbeat-has-no-idempotency-so-retries-double-count-p]] ·
[[desktop-agent-architecture]] · [[integration-architecture]] · [[ITEM-0028]].

## History

- 2026-08-16 — created at `78072d2` during the `apps/agent-desktop` deep
  documentation audit (TASK-0002).
- 2026-08-16 — Architect triage: `PLAN_REQUIRED`, sequenced with BUG-0036.
</content>
