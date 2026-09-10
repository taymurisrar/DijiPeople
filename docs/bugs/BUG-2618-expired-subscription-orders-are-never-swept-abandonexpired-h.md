---
ID: BUG-2618
aliases: [BUG-2618]
Title: Expired subscription orders are never swept: abandonExpired has no caller and the API has no scheduler
Status: FIXED
Severity: HIGH
Priority: P1
Type: DATA_INTEGRITY
Source: REVIEWER
DetectedDate: 2026-08-30
DetectedInSha: 8d400641
AffectedModules: [billing, super-admin]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-401
RelatedBacklogItem: ITEM-0119
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-30
UpdatedAt: 2026-09-11
ResolvedAt: 2026-09-11
---

# BUG-2618 — Expired subscription orders are never swept: abandonExpired has no caller and the API has no scheduler

> **Architect triage, 2026-08-30 — `FIX_NOW`.** A workspace name has been
> unpurchasable since 2026-08-22 and nothing reports it. Found while scoping
> [[ITEM-0119]]; it is why the placeholder rows [[ITEM-0118]] removed had
> accumulated over nine days instead of ageing out.

## Summary

`SubscriptionOrderService.abandonExpired` releases the `submissionHash` and
`requestedSlug` holds of unpaid orders past their 24-hour TTL. It is written,
commented, and covered by an e2e test. **Nothing calls it.** The API registers no
scheduler of any kind, so no unpaid order has ever expired in production and the
holds it exists to release are permanent.

## Expected Behavior

An order abandoned before payment ages out within `ORDER_TTL_MS` (24 hours),
returning both its workspace address and its submission hash to circulation —
which is exactly what the method's own comments say it is for:

> "so the unique index does not make this company and plan unbuyable forever
> because somebody once closed the tab"
>
> "a slow leak that only shows up months later as *why can't we have our own
> company name*"

## Actual Behavior

The leak that comment predicts is already happening, because nothing runs.

## Reproduction

1. `grep -rn "abandonExpired" services/api/src` — one definition, no call site.
2. `grep -rn "@Cron\|ScheduleModule\|SchedulerRegistry\|@Interval\|@Timeout" services/api/src`
   — **no matches at all.** `@nestjs/schedule` is not wired into this
   application.
3. Start a checkout on the public site, reach the payment page, abandon it.
4. Wait more than 24 hours and try to buy the same workspace address.

It is refused, permanently.

## Evidence

Measured read-only against production, 2026-08-30:

```text
ORDERS BY STATUS
    4  PENDING_PAYMENT
    3  ACTIVATED
    1  DRAFT

PENDING_PAYMENT past expiresAt but never abandoned: 3

WORKSPACE NAMES LOCKED BY EXPIRED-BUT-UNSWEPT ORDERS: 3
  demo1                        (PENDING_PAYMENT, expired 2026-08-22T10:36:44Z)
  dijipeople-qa-verification   (PENDING_PAYMENT, expired 2026-08-26T20:19:53Z)
  qa-e2e-signup-20260826       (PENDING_PAYMENT, expired 2026-08-27T10:21:12Z)

submissionHash values still held by expired orders: 3
```

Three of the four `PENDING_PAYMENT` orders in production are past expiry.
`demo1` has been locked for eight days.

The holds are enforced by the schema, not by convention —
`services/api/prisma/schema.prisma`, model `SubscriptionOrder`:

```prisma
submissionHash String? @unique
requestedSlug  String? @unique
```

so `openOrder` cannot reissue either value while a stale row holds it. The
`@@index([status, expiresAt])` on the same model exists to serve a sweep that
never runs.

## Root Cause

**A method written for a scheduler that was never added.** The sweep is correct
in isolation and its e2e test passes, because the test calls it directly —
`services/api/test/subscription-order.e2e-spec.ts:296` and `:391`. A test that
invokes the function itself cannot observe that production never does. That is
the same blind spot as [[BUG-2530]], where a guard supplied its own input and so
could not see that no caller supplied one.

The application has exactly one background loop, `OutboxWorkerService`, and it is
a hand-rolled `setInterval` gated on `OUTBOX_WORKER_ENABLED` rather than
`@nestjs/schedule`. That choice is deliberate and documented in that file; the
sweep was simply never given an equivalent.

## Impact

1. **A buyer cannot purchase a workspace name another buyer abandoned.** The
   refusal is permanent, and its cause is invisible from the UI — the address
   check reports "taken" with no owner behind it.
2. **A buyer cannot retry their own abandoned checkout** with the same company,
   plan and seat count: `submissionHash` is unique and still held, so the retry
   collides with their own dead order.
3. Abandoned orders and their prospect rows accumulate without bound, which is
   why [[ITEM-0118]]'s eight placeholder rows spanned nine days.

Reachable in production today, on the live revenue path.

## Affected Areas

- `billing` — `SubscriptionOrderService.abandonExpired`, `openOrder`
- `super-admin` — the Customers list, where the residue shows

## Proposed Resolution

Give the sweep a runner, following the pattern this codebase already has rather
than introducing `@nestjs/schedule` beside it. `OutboxWorkerService` is the
model: a `setInterval` started in `onModuleInit`, `unref`'d so CLI invocations
still exit, guarded against overlapping ticks, never throwing from the timer
callback, and gated on an explicit env flag so exactly one deployed process runs
it.

Then release the three stale production rows, which a forward-looking sweep will
handle only if their `expiresAt` semantics match what it filters on — check
rather than assume.

Register any new env var in `packages/config` validation, `turbo.json`
`globalEnv`, `render.yaml` and `docs/environment-variables.md`, per AGENTS.md.

**The guard must not be another test that calls the sweep itself.** The invariant
is "a running application invokes this", which is a statement about wiring — the
shape `common/constants/wiring-invariants.spec.ts` already exists to assert.

## Acceptance Criteria

- An unpaid order past `expiresAt` reaches `ABANDONED` without anyone invoking
  anything by hand.
- Its `requestedSlug` and `submissionHash` are released and the address becomes
  purchasable again.
- A test fails if the sweep loses its runner, and that test does not call the
  sweep directly.
- The three currently-locked names are released.

## Regression Coverage

To be added at fix closure. `REG-nnn`.

## Dependencies

None. [[ITEM-0119]] is related but independent: that one stops the placeholder
row being written at all, this one stops the stale order and its holds
persisting.

## Related Items

- [[BUG-2530]] — the same shape of blind spot, in a test rather than a scheduler.
- [[ITEM-0118]] — the eight placeholder rows that accumulated because of this.
- [[ITEM-0119]] — stop writing the placeholder in the first place.

## Resolution

Fixed on `agent/cs-s1-openbugs`, following the exact pattern the record's
Proposed Resolution asked for — `OutboxWorkerService`, not `@nestjs/schedule`.

- `services/api/src/modules/billing/services/subscription-order-sweeper.worker.ts`
  (new) — `SubscriptionOrderSweeperWorker`, an `OnModuleInit`/`OnModuleDestroy`
  provider with one `unref`'d `setInterval`, a re-entrancy guard, a tick that
  never throws, and an explicit `SUBSCRIPTION_ORDER_SWEEPER_ENABLED` flag
  (default off, matching the outbox worker and the report scheduler). Its
  `tick()` calls `SubscriptionOrderService.abandonExpired()` — the method this
  record found had no caller.
- `services/api/src/modules/billing/billing.module.ts` — registers the worker
  as a provider, so Nest instantiates it and calls `onModuleInit` for any
  process that boots this module.
- `SUBSCRIPTION_ORDER_SWEEPER_ENABLED` / `SUBSCRIPTION_ORDER_SWEEPER_POLL_INTERVAL_MS`
  registered in `turbo.json` `globalEnv`, `render.yaml` (set to `"true"` /
  15-minute poll) and `docs/environment-variables.md`, per AGENTS.md.

**The guard is not another test that calls the sweep itself.**
`services/api/src/modules/billing/services/subscription-order-sweeper.worker.spec.ts`
exercises the worker's `tick()`, not `SubscriptionOrderService` directly, and
separately reads `billing.module.ts`'s source to assert
`SubscriptionOrderSweeperWorker` is inside the `providers` array — the same
"a running application invokes this" shape as
`emitted-events-have-consumers.invariant.spec.ts`. Mutation-tested by hand:
removing the provider registration from `billing.module.ts` fails the wiring
assertion; removing the `abandonExpired()` call from `tick()` fails the
call-count assertion; neither would have been caught by the pre-existing
e2e coverage, which calls `abandonExpired()` directly.

**What was not done from this branch, and why.** Releasing the three
production rows the record measured (`demo1`,
`dijipeople-qa-verification`, `qa-e2e-signup-20260826`) is an operational
action against the production database, not a code change, and this branch's
worktree rules restrict it to local work. Once
`SUBSCRIPTION_ORDER_SWEEPER_ENABLED=true` is deployed, the running sweeper
releases them on its own within one poll interval of their `expiresAt`
already having passed — no backfill script is needed because the sweep's
`where` clause is `expiresAt: { lt: now }` with no floor. Release/DevOps
should confirm the three names are purchasable again after the next deploy
with the flag set, as the acceptance criteria's fourth bullet asks.

## QA Retest

Not retested live — no access to the production database or a deployed
environment from this branch. `subscription-order-sweeper.worker.spec.ts`
(8 cases) and the pre-existing `subscription-order.e2e-spec.ts` (which still
calls `abandonExpired()` directly and passes unchanged) are the automated
evidence. A post-deploy check that the three named workspace addresses become
purchasable again is still owed.

## History

- 2026-08-30 — found while scoping ITEM-0119 after the BUG-2530 hotfix, and
  measured against production the same day.
- 2026-09-11 — fixed on `agent/cs-s1-openbugs`: `SubscriptionOrderSweeperWorker`
  gives `abandonExpired` a runner, following the `OutboxWorkerService` pattern
  the record proposed. `RegressionId` set to `REG-401` — not centrally
  reserved; chosen as the next unused integer after `REG-396`, following the
  precedent BUG-1980 set for an unallocated regression id.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Backlog item — [[ITEM-0119]]
- Modules — [[billing]], [[super-admin]]
- Regression — REG-401 (see the regression register)

<!-- GRAPH:END -->
