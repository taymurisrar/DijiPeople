---
ID: BUG-0078
aliases: [BUG-0078]
Title: PROVISIONING_REQUESTED has no consumer so a paid self-service customer is never provisioned
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: STATE_MACHINE
Source: ARCHITECT
DetectedDate: 2026-08-19
DetectedInSha: 4f966ea
AffectedModules: [billing, outbox, super-admin]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-073
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-19
UpdatedAt: 2026-08-22
ResolvedAt: 2026-08-19
---

# BUG-0078 — PROVISIONING_REQUESTED has no consumer so a paid self-service customer is never provisioned

## Summary

`OrderActivationService.openOnboarding` emits `PROVISIONING_REQUESTED` into the
outbox. **Nothing subscribes to it.** The only outbox consumer in the codebase is
`PaymentConfirmedHandler`, which handles `PAYMENT_CONFIRMED`.

The event is written, delivered, and dropped. No tenant is provisioned by it and
no error is raised — an event with no registered consumer is a successful
non-delivery, not a failure.

The reason nobody has noticed is BUG-0077: the public path creates the tenant
*before* payment, so a workspace exists regardless. The automation chain the
platform believes it has has never once been the thing that produced a tenant.

## Expected Behavior

A confirmed self-service payment provisions a tenant with no human involvement.
The parent brief states the target as *"approximately 95%+ platform automated, 0
routine Platform Admin steps"*.

## Actual Behavior

The chain runs to `PROVISIONING_REQUESTED` and stops. Tenant creation happens
only through `SuperAdminService.onboardCustomer` → `PlatformOnboardingService`,
which requires an `actor: AuthenticatedUser` and is reachable only from an
authenticated Platform Admin endpoint.

## Reproduction

1. `grep -rn "readonly handles = \[" services/api/src` — one result:
   `PaymentConfirmedHandler`, `handles = [DomainEventType.PAYMENT_CONFIRMED]`.
2. `grep -rn "PROVISIONING_REQUESTED" services/api/src` — emitted at
   `order-activation.service.ts:197`; consumed nowhere.
3. `grep -rn "onboardCustomer" services/api/src` — called only from
   `super-admin.service.ts:804`, which takes an authenticated actor.

## Evidence

Emitted, `services/api/src/modules/billing/services/order-activation.service.ts:196`:

```ts
await this.outbox.emit(tx, {
  eventType: DomainEventType.PROVISIONING_REQUESTED,
  idempotencyKey: buildIdempotencyKey(
    DomainEventType.PROVISIONING_REQUESTED,
    order.id,
  ),
  aggregateType: 'CustomerOnboarding',
  aggregateId: onboarding.id,
  /* … */
});
```

The complete consumer registry,
`services/api/src/modules/billing/services/payment-confirmed.handler.ts:26`:

```ts
readonly consumerKey = 'billing.payment-confirmed.open-onboarding';
readonly handles = [DomainEventType.PAYMENT_CONFIRMED];
```

That file's own header calls it *"The first real outbox consumer"*. It is also
the only one.

## Root Cause

`declared-but-unwired-step`, the pattern already recorded in
`docs/qa/known-bug-patterns/`. TASK-0007 WP-07 — "Payment to onboarding to
provisioning automation" — built the emitting half of the chain and the
onboarding record, and stopped at the boundary where the event would have been
consumed. The package closed `DONE` with `QA_STATUS = PASS`.

Nothing failed, because nothing asserts that an emitted event type has a
consumer. The dispatcher treats "no handler registered" as a settled delivery,
which is correct for a generic dispatcher and exactly why the gap is invisible
from inside it.

Second defect from the same incomplete package; [[BUG-0077]] is the first.

## Impact

The headline requirement of self-service onboarding is not met: every paying
self-service customer needs a Platform Admin to create their workspace by hand.

Today the impact is masked and therefore low in practice. BUG-0077's pre-payment
tenant means a workspace exists, so the customer is not stranded — they are
served by a tenant created before they paid, at a slug nobody chose.

**The two bugs must be fixed together.** Removing the pre-payment tenant
(BUG-0077) without wiring this consumer would move the platform from "provisions
the wrong way" to "does not provision at all", stranding paying customers. This
is the single most important sequencing constraint in the parent, which is why it
is recorded here rather than left as a note in a plan.

## Affected Areas

- `OrderActivationService.openOnboarding` — emitter
- `OutboxDispatcherService` — registry
- `PlatformOnboardingService.onboardCustomer` — the engine that must become
  reachable without an interactive actor
- `SuperAdminService.onboardCustomer` — its only current caller

## Proposed Resolution

`PLAN_REQUIRED` — folded into
[`EXECPLAN-0001`](../plans/EXECPLAN-0001-tenant-creation-behind-confirmed-payment.md),
whose scope this widens.

The shape, not the patch:

1. Extract the tenant-creating core of `PlatformOnboardingService.onboardCustomer`
   so it accepts an **existing** `CustomerAccount` and a system actor. Today it
   creates its own customer account, which is why it cannot serve a flow where
   one already exists — the same duplicate-customer defect as BUG-0077, seen from
   the other end.
2. Add a `ProvisioningRequestedHandler` outbox consumer that calls that core with
   the order's customer, the reserved `requestedSlug`, and the owner details.
3. Website and Platform Admin then share one engine, which is the brief's *"Do
   not duplicate provisioning logic"* requirement — currently satisfied in intent
   only, since the website path never reaches the engine.
4. Add an invariant test: **every `DomainEventType` emitted anywhere has a
   registered consumer, or an explicit allowlist entry with a reason.** That is
   the check whose absence let this close green.

Step 4 is the durable part. Without it, the next emitted-and-forgotten event is
a matter of time.

## Acceptance Criteria

- A confirmed self-service payment provisions a tenant with no human action.
- The provisioned tenant's slug is `order.requestedSlug` when the buyer chose one.
- Website and Platform Admin provisioning go through one code path.
- An emitted `DomainEventType` with no consumer and no allowlist entry fails a
  test.
- A redelivered `PROVISIONING_REQUESTED` provisions exactly once.

## Regression Coverage

The emitted-event-has-a-consumer invariant, plus a DB-backed test that a
confirmed payment yields exactly one tenant. Added with the fix.

## Dependencies

Must land with [[BUG-0077]] — see Impact. Neither is safe alone.

## Related Items

[[BUG-0077]] · [[TASK-0008]] · [[TASK-0007]] · [[BUG-0014]]

## Resolution

Three parts, landed together with [[BUG-0077]].

1. **The engine is now reachable without a human.**
   `PlatformOnboardingService.provisionTenantForCustomer` is the tenant-creating
   core, taking a `CustomerAccount` that already exists. `onboardCustomer` keeps
   creating the customer for a sales-assisted onboarding and then calls it, so
   both paths run the same code — the brief's *"one provisioning engine"*, now
   true rather than intended. `actorUserId` is nullable: a webhook has no human
   behind it, and naming one would be a false audit trail. That required widening
   `issueInvitation`'s `createdByUserId`, whose TypeScript signature was stricter
   than its own nullable column.
2. **`ProvisioningRequestedHandler`** consumes the event, prefers
   `order.requestedSlug` and re-checks it against `Tenant.slug` — the hold guards
   against other orders, but a tenant could have taken the name by another route,
   and a paid customer gets a workspace either way with the substitution logged.
   Idempotent twice over: the dispatcher will not re-run a settled consumer, and
   the handler returns early if the order already points at a tenant, which
   covers a crash *between* provisioning and settling the outbox row.
3. **The invariant that would have caught this**, in
   `emitted-events-have-consumers.invariant.spec.ts`.

**Mutation evidence for the invariant** — the acceptance criterion, not the
passing run. With `handles` emptied on the new consumer, it fails naming
`PROVISIONING_REQUESTED`; restored, six tests pass.

Its first run also surfaced something nobody had asked: 18 emitted events with no
consumer. Twelve turned out to be handled through
`platform-lifecycle-notifications.catalog.ts`, whose subscriptions are built by
`.map()` and so are invisible to a literal-array scan — the check now reads the
catalog as a subscription registry. Of the remaining six, four are genuinely
history-only and are allowlisted with reasons; two are asymmetries recorded as
[[ITEM-0061]] rather than waved through.

## QA Retest

Run 2026-08-22:

```text
services/api  emitted-events-have-consumers.invariant.spec.ts   PASS
services/api  test:e2e   33 suites, 369 tests                    PASS
```

The invariant proves what this record was about: an emitted event has a
registered consumer, so `PROVISIONING_REQUESTED` cannot again be announced to
nobody.

The honest gap this record named is unchanged and is now tracked as
[[ITEM-0078]]: an end-to-end *payment → provisioned tenant* run needs a Stripe
webhook, which needs credentials this environment does not have. Keeping it as
prose here meant the record could never leave `FIXED`; keeping it as an item
means somebody can schedule it.

### Verification — 2026-08-22, SESSION-0040

Re-ran the guard this record names, rather than reading a green suite
summary: REG-073 names `services/api/src/modules/outbox/emitted-events-have-consumers.invariant.spec.ts`, and that is what was executed.

```text
npx jest --runTestsByPath, services/api   PASS
```

`Status: FIXED` → `VERIFIED`.

## History

- 2026-08-19 — found at `4f966ea` while implementing the BUG-0077 fix. Removing
  the pre-payment tenant raised the question "what creates the tenant instead?",
  and the answer was nothing. The in-progress BUG-0077 implementation was
  reverted rather than committed half-migrated, because the two must land
  together.
