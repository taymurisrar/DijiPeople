---
ID: BUG-0075
aliases: [BUG-0075]
Title: Public subscribe checkout has no rate limit and the invariant that should catch it is inert
Status: FIXED
Severity: HIGH
Priority: P1
Type: SECURITY
Source: ARCHITECT
DetectedDate: 2026-08-19
DetectedInSha: 494c44d
AffectedModules: [billing, common/guards]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: docs/qa/scenarios/QA-BILLING-007-every-unauthenticated-write-handler-is-rate-limited.md
RegressionId: REG-071
RelatedBacklogItem: ITEM-0013
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-19
UpdatedAt: 2026-08-19
ResolvedAt: 2026-08-19
---

# BUG-0075 — Public subscribe checkout has no rate limit and the invariant that should catch it is inert

## Summary

`POST /public/subscribe` — the unauthenticated endpoint that creates a
`SubscriptionOrder` and opens a Stripe checkout session — carries no
`PublicRateLimitGuard`. This is BUG-0031 returning to the same handler it was
originally filed against.

The second half is why it matters more than a single missing decorator.
ITEM-0013 built `public-write-rate-limit.invariant.spec.ts` specifically so this
class of defect could not recur. That invariant **passes** against the
unguarded endpoint. Its class-level detection asks whether the source *before*
`@Controller(` mentions `PublicRateLimitGuard` — and in this file the `import`
statement does. Every controller that imports the guard is therefore treated as
though it applies it to the class, whatever it actually does with it.

So the endpoint is unprotected, and the check written to prevent exactly that is
structurally unable to see it.

## Expected Behavior

`POST /public/subscribe` is throttled by `PublicRateLimitGuard`, like every
other unauthenticated write. `public-write-rate-limit.invariant.spec.ts` fails
while it is not.

## Actual Behavior

The handler has no guard. The invariant reports 13 passing tests.

## Reproduction

1. Read `services/api/src/modules/billing/controllers/public-billing.controller.ts`.
   `@UseGuards(PublicRateLimitGuard)` appears on the `commercial-config` GET
   handler only. The `subscribe` POST handler beneath it carries `@Public()` and
   `@Post('subscribe')` and nothing else.
2. Confirm no global registration compensates:
   `grep -n "APP_GUARD\|useGlobalGuards" services/api/src/app.module.ts services/api/src/main.ts`
   returns nothing.
3. Run the invariant that exists to catch this:
   `npm --workspace api run test -- public-write-rate-limit`
   → `Test Suites: 1 passed`, `Tests: 13 passed`.

Step 3 is the finding. Steps 1 and 2 establish that there is something for it to
have caught.

## Evidence

`services/api/src/modules/billing/controllers/public-billing.controller.ts:75-77`

```ts
  @Public()
  @Post('subscribe')
  createSubscriptionCheckout(
```

Compare the correctly-guarded sibling,
`services/api/src/modules/leads/public-leads.controller.ts:14-15`, which applies
the guard above `@Controller(...)` so handlers added later inherit it:

```ts
@UseGuards(PublicRateLimitGuard)
@Controller('public/leads')
```

The defeated check, `services/api/src/common/guards/public-write-rate-limit.invariant.spec.ts:76-81`:

```ts
  function hasControllerLevelGuard(source: string) {
    const controllerIndex = source.search(/@Controller\s*\(/);
    if (controllerIndex < 0) return false;
    // Decorators above @Controller() apply to the class.
    return source.slice(0, controllerIndex).includes(GUARD);
  }
```

`source.slice(0, controllerIndex)` spans the whole import block. Line 14 of the
billing controller is
`import { PublicRateLimitGuard } from '../../../common/guards/public-rate-limit.guard';`,
so the predicate is satisfied by the import alone and the per-handler walk is
skipped entirely.

Its own doc comment names the exact failure it is now blind to: *"Per-handler
application is precisely how BUG-0031 happened: the guard was put on one handler
of `PublicBillingController` and the `subscribe` handler added beside it
inherited nothing."* The comment describes this file. The check cannot see it.

## Root Cause

Two distinct causes, and fixing only the first would leave the system exactly as
exposed as it was before ITEM-0013.

1. **The endpoint.** The guard was applied per-handler on
   `PublicBillingController` rather than at class level, so `subscribe`
   inherited nothing — the same shape as the original BUG-0031.
2. **The invariant.** `hasControllerLevelGuard` matches the guard's *name*
   anywhere before `@Controller(`, and a file cannot apply a decorator it has
   not imported. The predicate is therefore true for every controller that could
   possibly be guarded, which makes it true for every controller worth checking.
   This is the `assertion-matches-mention` pattern: a check that asserts a file
   mentions something passes after the behaviour is removed.

## Impact

Reachable in production and unauthenticated. `POST /public/subscribe` resolves
commercial configuration, writes a `SubscriptionOrder`, and creates a Stripe
checkout session. Unthrottled, one caller can drive unbounded order growth and
unbounded checkout-session creation against the payment provider.

`submissionHash` absorbs an *identical* repeated submission, so the exposure is
not duplicate orders for one company — it is volume from varied payloads, each
of which is a distinct legitimate-looking order and a distinct provider call.

The invariant half is worse than the endpoint half: it means the next public
write added to any controller that imports the guard will also go unprotected,
and the suite will stay green while it happens. That is the third recurrence of
BUG-0013/0031/0033 waiting to happen, with the alarm disconnected.

## Affected Areas

- `POST /public/subscribe` — `PublicBillingController.createSubscriptionCheckout`
- `public-write-rate-limit.invariant.spec.ts` — and therefore every public write
  handler in every controller that imports `PublicRateLimitGuard`

## Proposed Resolution

No ExecPlan needed; both fixes are local.

1. Move `@UseGuards(PublicRateLimitGuard)` to class level on
   `PublicBillingController`, matching `PublicLeadsController`. Class level
   rather than adding a second per-handler decorator, because the per-handler
   form is the root cause and would reproduce this the next time a handler is
   added.
2. Narrow `hasControllerLevelGuard` to the contiguous decorator block
   immediately above `@Controller(`, so an import can no longer satisfy it.
3. Re-run the invariant across every controller after the change — the
   corrected predicate may reveal further unguarded handlers that were hidden by
   the same hole. Anything it finds is part of this fix, not a follow-up.

## Acceptance Criteria

- `POST /public/subscribe` is rejected with the platform's rate-limit response
  once the public write threshold is exceeded.
- Reverting only the controller fix makes
  `public-write-rate-limit.invariant.spec.ts` **fail**, naming
  `createSubscriptionCheckout`. The invariant is not accepted as fixed on the
  evidence that it passes — it is accepted on the evidence that it fails when it
  should.
- No other public write handler is unguarded under the corrected predicate.

## Regression Coverage

REG-071. The corrected invariant is itself the regression: it must fail without
the controller fix, and the register records the before/after runs that prove it
does.

## Dependencies

None. Found during TASK-0008 reconciliation; fixed inside it.

## Related Items

[[TASK-0008]] · [[ITEM-0013]] · [[BUG-0013]] · [[BUG-0031]] · [[BUG-0033]] ·
[[QA-BILLING-007]]

## Resolution

Three changes on `agent/self-service-onboarding-provisioning`.

1. **`public-billing.controller.ts`** — `@UseGuards(PublicRateLimitGuard)` moved
   to class level, above `@Controller('public')`. This also brings
   `GET /public/plans` under the limit, which was unguarded for the same reason
   and was never separately filed.
2. **`public-write-rate-limit.invariant.spec.ts`** — `hasControllerLevelGuard`
   now walks back over the contiguous decorator lines immediately above
   `@Controller(` and looks for the guard only there, so an import can no longer
   satisfy it.
3. **The redundant per-handler decorator on `commercial-config` was removed, not
   left in place.** Nest concatenates class-level and handler-level guards
   without deduplicating, and `PublicRateLimitGuard.canActivate` increments a
   shared counter (`current.count += 1`). Keeping both would have run the same
   singleton twice per request and spent two tokens from a one-request budget —
   halving that endpoint's effective limit from 120 to 60 while looking like
   extra protection. This is the one part of the fix that would have been a new
   defect if done carelessly.

**Mutation evidence — the acceptance criterion, not the passing run.**

| state | `npm --workspace api run test -- public-write-rate-limit` |
|---|---|
| old predicate, unguarded controller (as shipped at `494c44d`) | 13 passed — blind |
| corrected predicate, unguarded controller | **1 failed**, diff naming `"createSubscriptionCheckout("` |
| corrected predicate, guarded controller | 13 passed |

The middle row is the one that matters: it is the run that proves the invariant
can now see the thing it was written to see. The corrected predicate was also
swept across all 106 controllers and found exactly one offender, so no other
public write was hidden by the same hole.

`npm --workspace api run test -- billing` — 7 suites, 55 tests, all passing after
the change.

## QA Retest

Pending — WP-08 of [[TASK-0008]]. Scenario: exceed the public write threshold
against `POST /public/subscribe` and assert `429 PUBLIC_RATE_LIMITED`.

## History

- 2026-08-18 — found at `494c44d` during the TASK-0008 reconciliation of the
  public onboarding surface. The endpoint gap was visible on reading; the inert
  invariant was established by running it and watching it pass.
