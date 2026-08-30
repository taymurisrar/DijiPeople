# ADR-0004 — Recurring background jobs run in the API process, on a claim-and-guard pattern

## Status

Accepted — 2026-08-31.

Recorded as part of TASK-0028 (Reports & Analytics platform), which needed the
platform's first scheduled job and therefore had to decide how scheduled jobs
work here at all.

## Context

DijiPeople had no scheduler. That is not an inference — it is recorded:
[`BUG-2618`](../bugs/BUG-2618-expired-subscription-orders-are-never-swept-abandonexpired-h.md)
states that `abandonExpired` has no caller and the API has no scheduler, and
[`ITEM-0083`](../backlog/items/ITEM-0083-scheduled-reconciliation-sweep-for-orders-stuck-awaiting-pay.md)
(scheduled reconciliation sweep) is deferred behind it.

What did exist was three *ad hoc* recurring workers, each solving the problem
slightly differently:

- `modules/outbox/outbox-worker.service.ts` — `setInterval` in `OnModuleInit`,
  an env flag, a re-entrancy guard, `timer.unref()`, and a claim using real
  `FOR UPDATE SKIP LOCKED` in `outbox-dispatcher.service.ts`.
- `modules/data-management/data-job-worker.service.ts` — the same timer shape,
  but claiming with a conditional `updateMany` whose `where` still contains the
  previous status, and running work under the *submitter's* access context
  rather than a privileged one. It has **no** env flag, so it starts in every
  process that loads the module, including test containers.
- `modules/timesheets/timesheet-jobs.service.ts` — a 15-minute tenant sweep with
  idempotency keys but **no cross-instance lock** at all; two instances both run
  it and only a read-then-write race prevents duplicate work.

Adding a fourth variant for scheduled reports would have made four. The
alternative — introducing BullMQ, Redis, or a separate worker service — was
considered and rejected below.

## Decision

**Recurring jobs run inside the API process, and follow one pattern.** The
pattern is the outbox worker's, with the data-management worker's identity rule
folded in:

1. `@Injectable()` implementing `OnModuleInit` / `OnModuleDestroy`, holding a
   private `timer` and a private `running` boolean.
2. `setInterval` in `onModuleInit`, `this.timer.unref?.()` so CLI and seed
   processes can still exit, `clearInterval` in `onModuleDestroy`.
3. **Gated by an env flag, default off.** A deploy that does not set the flag
   changes nothing rather than quietly starting background work.
4. `tick()` never throws. Everything is wrapped; failures are logged; `running`
   is reset in `finally`.
5. **Work is claimed, not merely selected.** Either a conditional `updateMany`
   whose `where` still contains the state being transitioned away from, or
   `FOR UPDATE SKIP LOCKED`. One winner, one no-op.
6. **Background work runs as a real user, never as a privileged service
   identity.** The job loads that user's access context through
   `AuthAccessService.loadAccessContext`, and if the context cannot be loaded —
   deactivated user, revoked access — the job **fails** rather than falling back
   to something broader.

Rule 6 is the one that matters most and is the least obvious. A scheduled report
is a standing instruction to send data to people on a timetable. If the schedule
ran with elevated rights, revoking someone's access would leave a standing export
of data they can no longer see arriving in inboxes every month. Evaluating
authorization at execution time, under the owner's own context, is what makes
revocation actually revoke.

## Consequences

**Accepted:**

- The API service is the only place recurring work happens, so it must not be
  scaled to multiple instances without revisiting this. Today it cannot be:
  `render.yaml` mounts a persistent disk, and a Render disk pins the service to a
  single instance. The claim in rule 5 is therefore belt-and-braces today, and
  the thing that keeps this correct if that ever changes.
- Job cadence is bounded by the poll interval, so this is unsuitable for work
  needing sub-minute latency. Nothing currently does.
- A long tick blocks the next one for that job only (the `running` guard), not
  the API's request handling, which stays on the event loop.

**Rejected alternatives:**

- **BullMQ + Redis.** The notification module already has the shape of this —
  `queues/notification-queue.service.ts`, `jobs/notification-job-payload.interface.ts`,
  an `EmailNotificationProcessor` — and none of it is wired: `dispatchEmail`
  logs *"Notification queue requested but BullMQ is not wired; using sync
  fallback"* and calls the synchronous path anyway. Adopting BullMQ properly
  means adding Redis to the deployment, which is a hosting decision with a
  monthly cost, not a code decision. It remains the right answer if job volume
  grows; this ADR is what it would supersede.
- **A separate Render worker service.** Doubles the deployment surface and the
  build minutes for two jobs, and the persistent disk holding export artifacts
  would have to move to object storage first.
- **`@nestjs/schedule`.** Would give cron expressions but not claiming, not the
  identity rule, and not the env gating — the three parts that are actually
  load-bearing. It would standardise the timer, which is the part already
  agreed.

**Follow-ups this unblocks, deliberately not done here:**
`BUG-2618` and `ITEM-0083` can now be fixed by adding a job to this pattern
rather than by first inventing a scheduler. Both remain open and are the
Architect's to triage; TASK-0028 did not touch them.

## Related

[[BUG-2618]] · [[ITEM-0083]] · [[EXECPLAN-0030]] · [[TASK-0028]]
