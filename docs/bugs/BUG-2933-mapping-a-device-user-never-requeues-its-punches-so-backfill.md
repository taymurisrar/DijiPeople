---
ID: BUG-2933
aliases: [BUG-2933]
Title: Mapping a device user never requeues its punches, so backfilled attendance is silently never built
Status: FIXED
Severity: HIGH
Priority: P1
Type: INTEGRATION
Source: QA_RUN
DetectedDate: 2026-09-09
DetectedInSha: 233c6e1f
AffectedModules: [services/api/src/modules/attendance-integrations]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-395
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-09
UpdatedAt: 2026-09-09
ResolvedAt: 2026-09-09
---

# BUG-2933 — Mapping a device user never requeues its punches, so backfilled attendance is silently never built

## Summary

Attendance ingestion deliberately does not queue reconciliation for a punch that
has no employee yet — there is no attendance day to rebuild for an event nobody
owns. It says so in a comment, and that comment ends: *"When the mapping is
created later, the mapping service requeues its events, so nothing is
stranded."*

The mapping service did not. `confirmMapping` attributed the waiting punches to
the employee and returned a count, and nothing asked for those days to be built.
The punches stayed at `processingStatus: PENDING` for ever, unless some later
punch happened to land on the same employee-day and queued it as a side effect.

The other half of the design existed too: `AttendanceReconciliationQueueService`
provides `requeueForMapping`, written for exactly this, with a doc comment
saying attendance "silently stays missing" without it. **It had zero callers.**
Both ends were built and documented; the wire between them was never run.

## Expected Behavior

Mapping a device user to an employee should make that employee's
already-collected punches turn into attendance without any further action.

## Actual Behavior

The mapping succeeds and reports `backfilledEvents: N`. No attendance day is
created, no session appears, and nothing anywhere reports a problem. To an
administrator the integration looks connected, healthy and synced, while the
attendance screen stays empty.

## Reproduction

Observed end to end on the production demo tenant, 2026-09-09.

1. Pair a gateway, verify a device, activate the integration, and let one sync
   run. Punches arrive for a device user nobody has mapped yet.
2. `GET /integrations/attendance/external-users` — the user is `UNMATCHED`.
3. `POST /integrations/attendance/external-users/{id}/map` with an `employeeId`
   → `201 {"mapped":true,"backfilledEvents":1}`.
4. Wait. The reconciliation queue drains every 30 seconds.
5. `GET /attendance/engine/days/{employeeId}/{date}` → `{"exists": false}`, and
   `GET /attendance/mine/today` stays empty. Polled for five and a half minutes.
6. `POST /attendance/engine/reconcile/day` for the same employee and date → the
   day is built immediately: one session, `startSource: DEVICE`, work site Head
   Office, `firstCheckInAt` correct.

Step 6 is what proves the engine was never the problem. Nothing had asked it to
run.

## Evidence

`raw-attendance-ingestion.service.ts:311` skips unmapped events when collecting
the employee-days to enqueue:

```ts
// Only mapped events: an event nobody owns yet has no attendance day
// to rebuild. When the mapping is created later, the mapping service
// requeues its events, so nothing is stranded.
if (!item.data.employeeId) continue;
```

`employee-mapping.service.ts` `confirmMapping` backfilled `employeeId` onto
those events with `updateMany` and returned `{ identity, backfilledEvents }`.
There was no queue call anywhere in the file.

`attendance-reconciliation-queue.service.ts` `requeueForMapping` existed,
complete and bounded to 5000 events, carrying this comment:

```text
An unmapped device punch is not a permanent failure — it is a punch waiting
for someone to say who it belongs to. When that mapping is created, the
events it now resolves have to be reconsidered, or the employee's attendance
silently stays missing.
```

`grep -rn "requeueForMapping" services/api/src` returned exactly one line: its
own definition.

## Root Cause

A contract agreed in comments between two services and implemented in neither.
Ingestion correctly narrowed its responsibility and named who would pick the work
up; the queue correctly provided the entry point; the mapping service was written
without knowing it had been volunteered. Nothing failed, so nothing surfaced —
the missing call has no error path, only an absence.

## Impact

Every device user mapped after their first punches arrived, which is the normal
order: a gateway syncs a device directory and its punches, and an administrator
maps the discovered users afterwards. Their historical attendance never
materialised.

Reachable in production and reached: found on the live demo tenant while
validating the ZKTeco K50 setup, on the first mapping ever performed there.

Not a data-loss bug. The raw events are durable and correctly attributed; only
the derived attendance was missing, and a manual **Recalculate** produced it
correctly, which is what made the diagnosis unambiguous.

## Affected Areas

- `services/api/src/modules/attendance-integrations/mapping/employee-mapping.service.ts`
  — `confirmMapping`
- `services/api/src/modules/attendance-engine/attendance-reconciliation-queue.service.ts`
  — `requeueForMapping`, previously uncalled
- `services/api/test/attendance-integrations-isolation.e2e-spec.ts` — its
  hand-written provider list stubs the queue and needed the new method

## Proposed Resolution

Call the method that was already written for this. No new mechanism.

## Acceptance Criteria

1. `confirmMapping` calls `requeueForMapping` when the mapping attributed at
   least one punch.
2. It does not queue when nothing was backfilled — a device user mapped before
   they have ever punched creates no work.
3. A queue failure does not fail the mapping. The mapping is durable and is what
   the operator asked for; the day stays reachable through Recalculate.
4. After mapping, attendance appears without any manual reconciliation.

## Regression Coverage

`services/api/src/modules/attendance-integrations/mapping/employee-mapping-requeue.service.spec.ts`,
registered as REG-395. Mutation-tested: disabling the call fails the first
assertion, so the test is not vacuous.

## Dependencies

None.

## Related Items

[[BUG-2732]] — the activation deadlock, found in the same validation run. Both
were invisible for the same reason: the failure mode is an absence, not an error.

## Resolution

`confirmMapping` now calls `requeueForMapping` after its transaction commits,
when `backfilledEvents > 0`. Outside the transaction so a queue write is not
rolled back with the mapping and a queue failure does not roll back the mapping;
best effort and logged, exactly the trade the ingestion service already makes for
the same reason.

The isolation e2e's stub gained `requeueForMapping` — that suite lists its
providers by hand, so it has to mirror a constructor change.

## QA Retest

Verified locally against the real database: 42/42 isolation e2e, 146 unit tests
in the module. Reproduced end to end on the production demo tenant before the
fix, and the engine proved correct there by an explicit reconcile.

## History

- 2026-09-09 — found on production while validating the ZKTeco K50 setup, at the
  last link of the chain: the punches were ingested, the mapping was accepted,
  and the attendance screen stayed empty.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Regression — REG-395 (see the regression register)

<!-- GRAPH:END -->
