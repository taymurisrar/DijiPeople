CONTEXT_FILES_REQUIRED:
  - services/api/AGENTS.md
  - services/api/src/modules/billing/services/plan-change.service.ts
  - services/api/src/modules/billing/services/billing.service.ts
  - services/api/src/modules/billing/billing-seat-pricing.ts

SPECIALIST_AGENTS_REQUIRED:
  - Backend/API — this plan is entirely `services/api`

DELIBERATELY_NOT_USED:
  - Frontend — the tenant Plans screen (`apps/web`) is owned by a concurrent
    session (SESSION-0103's sibling stream); this plan is the API contract
    that stream builds against, not the UI change itself.
  - Database/Prisma (as a separate specialist) — no schema change; see
    Database impact.

SINGLE_WRITER_FILES:
  - none (no touch to schema.prisma, permissions.ts, rbac-matrix.ts,
    app.module.ts or common/guards/**)

QA_REQUIRED: yes — money-movement change (proration, real Stripe subscription
mutation on confirm).

KNOWN_BUG_PATTERNS_IN_SCOPE:
  - Two implementations of one billing rule disagreeing (this repo's history:
    `resolveBillableSeats` had to be de-duplicated once; BUG-0027's legacy
    pricing fallback). Guarded against here by reusing
    `calculateSeatPricing`/`resolveBillableSeats` rather than re-deriving
    proration arithmetic in a second place.

REGRESSION_ENTRIES_IN_SCOPE:
  - REG entry to be filed by the Architect/QA cycle for: "a tenant on an
    ACTIVE subscription can move to a different plan and to Annual billing for
    the same plan, both without a 409."

# EXECPLAN-0037 — A tenant plan-change endpoint, quoted before confirmation

## Objective

A tenant administrator can change plan, and change billing cycle on the same
plan, from the tenant product, with the cost difference shown before they
confirm — without ever routing through `POST /billing/checkout-sessions`,
which by design refuses (409) the moment a subscription already exists. When
this is done: `PlanChangeService` — written, tested by nothing, wired to
nothing — is reachable over the API, actually mutates the Stripe subscription
it changes (not only the local `Subscription` row), and its scheduled-downgrade
half actually runs (it does not today; see Existing behavior).

## Business requirement

BUG-3331: "no control on the plans screen can produce a 409 from
`POST /billing/checkout-sessions` under any combination of plan, cycle and
currency, and a tenant on Monthly can reach Annual billing for the same plan."
The record's Proposed Resolution offers two routes — expose a plan-change
endpoint with quoted proration, or route changes to the Stripe Customer
Portal. This plan takes the first: `services/api` already has
`PlanChangeService` half-built (**FACT**,
`services/api/src/modules/billing/services/plan-change.service.ts`), and a
Portal-based route would still need the tenant's own market/eligible-plan data
computed somewhere for the frontend to link correctly — most of that work is
this plan's `preview` endpoint regardless of which route the button takes.
`TODO: Confirm product/business rule` — whether Growth→Enterprise mid-cycle
upgrades should also let the tenant pick a different billing cycle in the same
action, or whether cycle changes are plan-preserving only. This plan
implements the general case (any (plan, cycle) target), which is a superset
of both.

## Existing behavior

- `BillingService.createCheckoutSession` (`billing.service.ts:995-1040` at
  this plan's baseline) refuses with `409 ConflictException` whenever the
  tenant has an `ACTIVE`/`TRIALING` subscription
  (`resolveCheckoutState`, same file, `~1230-1260`). **FACT** — correct and
  deliberate; not changed by this plan.
- `PlanChangeService` (`services/api/src/modules/billing/services/plan-change.service.ts`)
  has `preview()`, `requestChange()` and `applyDueChanges()`. **FACT.**
  `requestChange()`'s UPGRADE branch writes `Subscription.planId`/`planPriceId`
  locally and marks the request `APPLIED` — it never calls Stripe.
  `applyDueChanges()` (the DOWNGRADE-at-renewal path) has **zero callers**
  anywhere in the running application or in any worker — confirmed by
  repository-wide search, matching the exact shape of BUG-2618
  (`abandonExpired` before `SubscriptionOrderSweeperWorker` existed). **FACT.**
- No controller injects `PlanChangeService` or `SeatChangeService`. **FACT** —
  `billing.module.ts` registers both as providers with zero other references,
  which is the record's own evidence.
- `PlanChangePreview` carries no money at all —
  `{direction, fromPlanId, toPlanId, effectiveAt, impact, dataRetained}`.
  **FACT.** The record asks for "proration quoted before confirmation"; there
  is nothing to quote today.
- Stripe subscription updates already flow back into the local `Subscription`
  row automatically via the existing webhook —
  `WebhookService.upsertSubscriptionFromStripe`
  (`services/api/src/modules/billing/services/webhook.service.ts:835-917`)
  re-derives `planId`/`planPriceId`/`billingCycle`/`finalPrice`/period dates
  from the Stripe subscription object on every
  `customer.subscription.updated` event. **FACT.** This is the mechanism this
  plan relies on rather than duplicating: calling Stripe to change the price
  is sufficient; the local plan/price/period fields do not need to be written
  by `PlanChangeService` for a Stripe-backed subscription.
- Stripe SDK is `stripe@22.1.1` (**FACT**, `services/api/package.json`), which
  exposes `stripe.invoices.createPreview(...)` for a non-mutating proration
  quote (confirmed against the installed type declarations,
  `node_modules/stripe/esm/resources/Invoices.d.ts`); `retrieveUpcoming` does
  not exist on this version.

## Existing architecture

- `BillingController` (`controllers/billing.controller.ts`) — thin, delegates
  to `BillingService`. This plan adds two handlers here rather than a new
  controller: the tenant billing surface is already one controller for one
  reason (`AGENTS.md`'s "controllers are thin" plus the existing shape).
- `PlanChangeService` — owns the business rule (direction, impact,
  scheduling). This plan extends it with a Stripe-facing preview and a
  Stripe-facing apply, rather than putting Stripe calls in the controller or a
  new service — `StripeBillingService` is already the one place Stripe is
  called from in this module.
- `SubscriptionOrderSweeperWorker` (`services/subscription-order-sweeper.worker.ts`)
  — the template this plan's new worker copies: `OnModuleInit`/`OnModuleDestroy`,
  unref'd interval, re-entrancy guard, explicit env flag, tick that cannot
  throw.
- `webhook.service.ts`'s `upsertSubscriptionFromStripe` — reused, not
  reimplemented; see Existing behavior.

## Requirements

1. `GET /billing/plan-changes/preview?toPlanId=<uuid>&toPlanPriceId=<uuid>`
   returns the entitlement impact (existing `PlanChangeService.preview`) plus a
   money quote: current price, target price, and — for an UPGRADE, which is
   immediate — the actual Stripe proration amount due now, computed via a
   non-mutating `stripe.invoices.createPreview` call. For a DOWNGRADE
   (effective at renewal), the quote is the new recurring amount from the next
   renewal date, with `prorationNow: 0` stated explicitly — nothing is charged
   today.
2. `POST /billing/plan-changes` with `{ toPlanId, toPlanPriceId?, reason? }`
   calls `PlanChangeService.requestChange()`. For an UPGRADE, after the local
   `Subscription`/`PlanChangeRequest` write, it also calls
   `stripe.subscriptions.update(...)` with the new price and quantity and
   `proration_behavior: 'create_prorations'`, when the subscription is
   Stripe-backed (`stripeSubscriptionId`/`stripeSubscriptionItemId` present).
   The resulting `customer.subscription.updated`/`invoice.*` webhooks
   reconcile period dates and the invoice record exactly as they do for any
   other Stripe-initiated subscription change — no duplicate reconciliation
   logic is written here.
3. For a subscription with no `stripeSubscriptionId` (a test/demo tenant with
   no live Stripe object), the Stripe call is skipped and a warning is logged;
   the local state change still applies. This must not throw — a demo tenant
   changing plans is a real, supported case today.
4. `PlanChangeService.applyDueChanges()` gains a caller: a new
   `SubscriptionChangeSweeperWorker`, off by default
   (`SUBSCRIPTION_CHANGE_SWEEPER_ENABLED`), polling on an interval, calling
   `PlanChangeService.applyDueChanges()`. When it applies a due DOWNGRADE, it
   also updates Stripe (`proration_behavior: 'none'` — the change lands
   exactly at the boundary the customer already paid through).
5. No control on the (future, out-of-scope-here) Plans screen may reach a 409
   from `POST /billing/checkout-sessions` for a tenant with a live
   subscription — this plan does not change `createCheckoutSession`'s refusal
   (Requirement 5 is about the frontend routing an existing-subscriber's
   action to the new endpoints instead, which is the sibling stream's work;
   this API's job is to make that endpoint exist and be correct).
6. A tenant on Monthly can reach Annual billing for the same plan by naming a
   `toPlanPriceId` on the same plan with a different `billingCycle` —
   `PlanChangeService.load`/`resolveDirection` already accept a same-plan
   `toPlanId` (`load()` currently throws `"already on <plan>"` when
   `toPlanId === fromPlanId`, so this requires a small change — see Backend
   impact item 3).

## Dependencies

None blocking. `apps/web`'s Plans-screen fix (owned by the concurrent
session/stream) depends on this endpoint's route and response shape, which
this plan fixes before implementation so that stream is not blocked on this
one's completion. `PlanChangeService`, `StripeBillingService`,
`WebhookService`, `OutboxService` all already exist and are unchanged in
shape.

## Files / modules affected

- `services/api/src/modules/billing/services/plan-change.service.ts` — extend
  `preview()`/`requestChange()`, add `previewProration()`, add Stripe calls,
  relax the same-plan restriction for a cycle-only change.
- `services/api/src/modules/billing/controllers/billing.controller.ts` — two
  new handlers.
- `services/api/src/modules/billing/dto/` — two new DTOs.
- `services/api/src/modules/billing/services/subscription-change-sweeper.worker.ts`
  — new, modelled on `subscription-order-sweeper.worker.ts`.
- `services/api/src/modules/billing/billing.module.ts` — register the new
  worker as a provider.
- `services/api/src/modules/billing/services/plan-change.service.spec.ts` —
  new (none exists today).
- `services/api/src/modules/billing/services/subscription-change-sweeper.worker.spec.ts`
  — new.
- `docs/environment-variables.md` — register
  `SUBSCRIPTION_CHANGE_SWEEPER_ENABLED` and
  `SUBSCRIPTION_CHANGE_SWEEPER_POLL_INTERVAL_MS` (runtime configuration, not a
  build input — no `turbo.json` change needed).

No `apps/web`, `apps/admin` or `schema.prisma` change in this plan.

## Database impact

None. No new model, no new column, no migration. `PlanChangeRequest`,
`Subscription`, `SeatChangeRequest` already carry every field this plan reads
or writes.

## Backend impact

1. `PlanChangeService.previewProration(tenantId, toPlanPriceId)`: loads the
   subscription and target price, and — when `stripeSubscriptionId` is set —
   calls `stripeBillingService.client.invoices.createPreview({ subscription:
   stripeSubscriptionId, subscription_details: { items: [{ id:
   stripeSubscriptionItemId, price: targetStripePriceId, quantity:
   purchasedSeats }], proration_behavior: 'create_prorations' } })` and reads
   `.amount_due`/`.total` off the result. When there is no
   `stripeSubscriptionId` (demo/test tenant), returns an `estimated: true`
   quote computed as `(targetUnitAmount - currentUnitAmount) *
   billableSeats`, using the existing `resolveBillableSeats` — never a second
   arithmetic rule.
2. `requestChange()`: after the existing transaction commits, for
   `direction === UPGRADE` and a Stripe-backed subscription, call
   `stripe.subscriptions.update(stripeSubscriptionId, { items: [{ id:
   stripeSubscriptionItemId, price: targetPrice.stripePriceId, quantity }],
   proration_behavior: 'create_prorations' })`. Wrapped in try/catch: a Stripe
   failure here must not leave the local DB and Stripe permanently
   disagreeing silently — log at `error` level with the tenant and request id,
   and return the result with a `stripeSyncPending: true` flag the frontend
   can show as "we're finishing this — check back shortly" rather than a raw
   500, since the local write already committed and retrying the whole
   request would double-apply it.
3. `load()`'s `toPlan.id === fromPlan.id` refusal narrows to: refuse only when
   the plan AND the resolved target price are identical to the current
   subscription's. A same-plan, different-cycle request must resolve a
   different `toPlanPriceId` and proceed.
4. `SubscriptionChangeSweeperWorker.tick()` calls
   `planChangeService.applyDueChanges()` and, for each applied result,
   updates Stripe the same way (best-effort, logged, non-blocking) with
   `proration_behavior: 'none'`.
5. Response shape for `POST /billing/plan-changes` (confirmed with the
   sibling frontend stream): `{ requestId, direction, status, effectiveAt,
   impact, dataRetained, quote: { currency, prorationNow, newRecurringAmount },
   stripeSyncPending }`.

## Frontend impact

Out of this plan's scope (owned by a concurrent stream) — recorded here only
so that stream has the contract:

- `GET /billing/plan-changes/preview?toPlanId=&toPlanPriceId=` — call before
  showing a confirm dialog for any non-"Subscribe" plan-card action once a
  subscription exists.
- `POST /billing/plan-changes` — the action itself. No 409 is possible from
  this route for an existing subscriber; a same-plan/different-cycle change
  goes through it too, not through `checkout-sessions`.
- The dead "Subscribe" button (BUG-3331 items 1-4, short-term UI fixes) is
  this other stream's job, not touched here.

## Permission / RBAC impact

Both new endpoints carry the same decorators as every other tenant billing
endpoint: `@Permissions(MISC_PERMISSION_KEYS.BILLING_MANAGE)` +
`@RequirePermission(ENTITY_KEYS.TENANT_ADMINISTRATION, 'manage')` for
`POST /billing/plan-changes`; `BILLING_VIEW`/`'read'` for the `GET` preview.
No new permission key. No row-level access level beyond `@CurrentUser()`'s
`tenantId` — a plan change is always the caller's own tenant, never a param.

## Tenant-isolation impact

`tenantId` comes from `@CurrentUser()` on both new handlers, passed to
`PlanChangeService`, which already scopes `load()`'s subscription lookup by
`tenantId` (`this.prisma.subscription.findFirst({ where: { tenantId } })`).
No id is ever accepted that names another tenant's subscription, plan-change
request or Stripe object. No cross-tenant read or write is possible: confirm
by grepping the diff for every `prisma.*.find*`/`update`/`create` call this
plan adds and checking each carries `tenantId` or is scoped through a row
already loaded by `tenantId`.

## Audit / event / logging impact

`PlanChangeService.requestChange()` already emits
`DomainEventType.PLAN_CHANGE_REQUESTED`/`PLAN_CHANGE_APPLIED` via the outbox —
unchanged. This plan adds an `AuditService.log()` call in the controller
handler for `POST /billing/plan-changes` (`action:
'TENANT_PLAN_CHANGE_REQUESTED'`, `entityType: 'Subscription'`, before/after
snapshot of `{ planId, planPriceId, billingCycle }`), since a plan change is
exactly the kind of state-changing operation a tenant admin or auditor needs
to see and the existing service-level outbox event is not the same thing as
an audit row. Never log a Stripe secret or the full Stripe response body —
log `stripeSubscriptionId` and the resulting invoice id only.

## Integration impact

Stripe: two new call shapes (`invoices.createPreview`, a targeted
`subscriptions.update`) against the already-configured `StripeBillingService`
client. No gateway or desktop-agent contract change.

## Migration / data compatibility

Fully additive. A subscription created before this plan ships behaves
identically until a plan-change request is made against it. No stored data
changes shape.

## Parallel-safe tasks

- DTOs — `PARALLEL_SAFE`
- `previewProration()` — `PARALLEL_SAFE` (pure addition to
  `PlanChangeService`)
- `SubscriptionChangeSweeperWorker` — `PARALLEL_SAFE`

## Dependency-blocked tasks

- The two controller handlers — `DEPENDENCY_BLOCKED` on the DTOs and on
  `requestChange()`'s Stripe-call extension.
- `applyDueChanges()`'s Stripe update — `DEPENDENCY_BLOCKED` on the same
  Stripe-call helper `requestChange()` uses (factor once, call from both).

## Integration tasks

- Wiring the worker into `billing.module.ts` — `INTEGRATION`, run last.

## Testing strategy

```
npm --workspace api run test         # plan-change.service.spec.ts (new),
                                      # subscription-change-sweeper.worker.spec.ts (new)
npm --workspace api run check-types
npm --workspace api run lint
```

New spec assertions:

- `previewProration` returns the Stripe-derived amount for a Stripe-backed
  subscription (mocked `invoices.createPreview`), and the estimated fallback
  for one with no `stripeSubscriptionId`, and the two never disagree on sign
  (upgrade quote is positive, downgrade quote is non-positive) for the same
  fixture pair.
- `requestChange()` calls `stripe.subscriptions.update` exactly once for an
  UPGRADE on a Stripe-backed subscription, not at all for one with no
  `stripeSubscriptionId`, and not at all for a DOWNGRADE (scheduled, not
  immediate).
- A Stripe failure inside `requestChange()` is caught, logged, and returned as
  `stripeSyncPending: true` rather than thrown — the local write is not rolled
  back for a Stripe-side failure that happens after commit.
- `load()` accepts a same-plan, different-price (cycle) target and refuses a
  same-plan, same-price target with the existing message.
- `SubscriptionChangeSweeperWorker.tick()` calls
  `PlanChangeService.applyDueChanges()` once per tick, is disabled by default,
  and a rejected `applyDueChanges()` call does not throw out of `tick()`.
- Controller wiring: both handlers carry `JwtAuthGuard`+`PermissionsGuard` and
  both permission decorators (extend `billing-authorization.spec.ts`'s
  existing table-driven check).

Manual verification (QA, against a Stripe test-mode account): create a
Stripe-backed tenant on Starter Monthly, request a change to Growth Monthly,
confirm the Stripe subscription's price actually changed in the Stripe
dashboard and a proration invoice was generated; request a change to Starter
Annual, confirm `effectiveAt` is immediate (Annual costs more) or scheduled
(if it does not) matching `resolveDirection`'s existing rule.

## Risks

1. **Stripe call inside a Nest service after a Prisma transaction has
   committed** (likelihood: designed-for, impact: medium if mishandled) — a
   local write with no matching Stripe write leaves the subscription's
   `planId` ahead of what Stripe is actually charging. Mitigated by
   `stripeSyncPending` in the response and an `error`-level log naming the
   request id, so this state is visible and re-driveable rather than silent;
   full saga/retry handling is out of scope for this plan and should be a
   follow-up if it proves to happen in practice.
2. **Money correctness of the proration preview** (likelihood: low, impact:
   high) — mitigated by using Stripe's own preview endpoint rather than
   computing proration locally; DijiPeople never invents a proration formula.
3. **`applyDueChanges()` running unattended for the first time** (likelihood:
   low, impact: medium) — mitigated by copying
   `SubscriptionOrderSweeperWorker`'s exact safety shape: off by default,
   re-entrancy guard, a tick that cannot throw.

## Rollback considerations

`ROLLBACK_CLASS: CODE_ONLY`. No migration to reverse. Reverting this plan's
commits removes the two endpoints and the worker; any `PlanChangeRequest` rows
already written by them remain as history (same as any other request row) and
are harmless — `PlanChangeService.applyDueChanges()` simply stops being called
again, leaving any still-`SCHEDULED` downgrade unapplied until either the
worker is re-enabled or an operator applies it by hand. The new
`SUBSCRIPTION_CHANGE_SWEEPER_ENABLED` env var defaults to unset/false, so
rollback requires no environment change.

## Definition of Done

- [ ] `npm --workspace api run test`, `check-types`, `lint` pass
- [ ] New specs listed under Testing strategy exist and pass
- [ ] Both new endpoints carry both permission decorators
- [ ] Every new/changed query is tenant-scoped from `@CurrentUser()`
- [ ] `AuditService.log()` called for the state-changing endpoint
- [ ] No unrelated file touched
- [ ] `docs/environment-variables.md` updated with the two new env vars
- [ ] This plan's own bug record (BUG-3331) updated with what shipped

---

TARGET_BRANCH: develop
TARGET_ENVIRONMENT: LOCAL
DEPLOYMENT_REQUIRED: no (this task; a later RELEASE task deploys develop → main)
DEPLOYMENT_COMPONENTS: api
DEPLOYMENT_ORDER: n/a — no schema change, api-only
ROLLBACK_CLASS: CODE_ONLY
INTEGRATOR_REQUIRED: yes
RELEASE_DEVOPS_REQUIRED: no
POST_DEPLOY_QA_REQUIRED: yes — manual Stripe test-mode verification per
  Testing strategy, before this reaches `main`
MERGE_STRATEGY: merge --no-ff
KNOWN_CONCURRENT_WORK: a sibling stream on the tenant Plans screen
  (`apps/web`) depends on this plan's endpoint contract; no shared file
ENVIRONMENT_DEPENDENCIES: `SUBSCRIPTION_CHANGE_SWEEPER_ENABLED`,
  `SUBSCRIPTION_CHANGE_SWEEPER_POLL_INTERVAL_MS` — runtime configuration
  (read by the API process only, not a Next.js build input), registered in
  `docs/environment-variables.md`; no `turbo.json` `globalEnv` entry needed.

## Related

[[BUG-0027]] · [[BUG-2618]] · [[BUG-3331]] · [[SESSION-0103]]
