---
ID: ITEM-0076
aliases: [ITEM-0076]
Title: Operators cannot recover an order whose Stripe webhook never arrived
Type: PRODUCT_DECISION
Status: DONE
Priority: P2
Severity: MEDIUM
AffectedModules: [api:billing, apps/admin]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-08-21
UpdatedAt: 2026-08-22
RelatedBug: 
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0076 — Operators cannot recover an order whose Stripe webhook never arrived

## Summary

Payment confirmation has exactly one input: a signature-verified Stripe webhook.
`StripeWebhookController` verifies the signature, `WebhookService` resolves the
event to an order, `OrderActivationService.confirmPayment` marks it `PAID` and
emits `PAYMENT_CONFIRMED`, and the outbox consumer opens onboarding and requests
provisioning. The browser redirect to `/subscribe/success` is deliberately not
treated as evidence.

That is the right design. What it lacks is a recovery path: when the webhook
does not arrive — misconfigured endpoint, a rotated signing secret, an outage,
or a local environment with no tunnel — the buyer's money has moved, the order
sits at `PENDING_PAYMENT` forever, and no operator has any way to move it.

## Why It Matters

The failure is invisible from Platform Admin and highly visible to the customer,
who sees "We're confirming your payment" indefinitely on a page that tells them
their payment is safe. Every minute of that is a support contact against a
system that already has the money.

There is also no monitoring answer. Nothing surfaces "orders that were sent to
Stripe more than an hour ago and never came back", which is the query that turns
this from a customer complaint into an operations alert.

## Evidence

- `services/api/src/modules/billing/controllers/stripe-webhook.controller.ts` —
  the only entry point.
- `services/api/src/modules/billing/services/order-activation.service.ts:44-124`
  — `confirmPayment` is reachable only from webhook processing.
- `services/api/src/modules/billing/services/subscription-order.service.ts:790`
  — `resolveOnboardingState` returns `AWAITING_PAYMENT` while
  `SubscriptionOrder.status` is `PENDING_PAYMENT`, with no timeout.
- `apps/landing/lib/provisioning-view.ts` — `isTerminalState` excludes
  `AWAITING_PAYMENT`, so the page polls until the tab is closed.
- `ReconciliationService` runs `INTERNAL` and Stripe scopes on a schedule and
  reports findings; it has no order-activation path and no operator trigger.

## The decision this needs

The obvious request is a manual status field on the order form — an operator
sets "Paid". **That should not be built**, for three reasons:

1. It lets someone assert money that never arrived. Payment state is the one
   field on a commercial record where the platform must not be its own witness.
2. It writes the column without emitting `PAYMENT_CONFIRMED`, so onboarding and
   provisioning would still never run. The operator would mark the order paid
   and the customer would still have no workspace — a worse failure, because it
   now looks resolved.
3. It is unauditable in the way that matters: the record would say `PAID` with
   no provider evidence behind it.

**Recommended instead: a "Re-check payment with Stripe" record action.** It
fetches the checkout session from Stripe by the id already stored on the order,
and — only if Stripe reports it paid — calls the same `confirmPayment` path the
webhook uses. Stripe stays the authority, the outbox chain runs exactly as it
would have, the action is permissioned and audited, and the idempotency already
in `confirmPayment` makes a later webhook redelivery a no-op.

Pair it with a saved view — orders in `PENDING_PAYMENT` whose
`stripeCheckoutSessionId` is set and older than one hour — so the cases find the
operator rather than the other way round.

## Proposed Approach

**Needs an ExecPlan** — a new operator-triggered path that writes billing state.

1. `BillingService.recheckCheckoutSession(orderId)` — retrieve the session,
   refuse anything not `paid`, delegate to `confirmPayment`.
2. A `recheck-payment` record action on the `subscriptions`/orders module,
   permissioned on `billing.manage` and audited with before/after snapshots.
3. A stuck-payment view and a monitoring signal.
4. A named error when Stripe says the session is unpaid, so the operator learns
   the truth rather than seeing a no-op.

## Acceptance Criteria

- An order stuck at `PENDING_PAYMENT` whose Stripe session is paid can be
  advanced by an operator, and provisioning follows as it would have.
- An order whose Stripe session is **not** paid cannot be advanced by anyone.
- Every re-check is audited with the actor and the provider's answer.
- A later webhook redelivery changes nothing.

## Dependencies

None blocking.

## Related Items

[[ITEM-0022]] — the same principle applied to publication: governed, audited
transitions rather than an editable field.

## Resolution — 2026-08-22, SESSION-0040

The user chose option 3 — *"the operator action now, the scheduled sweep later,
once the recheck has proven itself."*

**Part one already existed.** Like [[ITEM-0053]] and [[ITEM-0032]], this record's
premise had gone stale. Everything the Proposed Resolution asked for is built:

| Asked for | Where it is |
|---|---|
| `recheckCheckoutSession(orderId)` | `PaymentRecheckService.recheckOrder` / `recheckCustomerPayment` |
| A `recheck-payment` record action | `POST /super-admin/customers/:id/recheck-payment` |
| Audited with before/after | `BILLING_PAYMENT_RECHECKED`, logged on every outcome |
| A named error when Stripe says unpaid | `payment-diagnosis.ts`, with a sentence the operator can send |
| Operator UI | `payment-recheck-panel.tsx`, mounted on `runtime-record-page` |

The design is better than this record proposed. It refuses to be a manual "mark
as paid" for a reason worth keeping: setting the column by hand would let the
platform witness its own payment, **and** would skip `PAYMENT_CONFIRMED`, so no
onboarding would open and no tenant would be provisioned. The operator would
close the ticket and the customer would still have no workspace — worse than the
original failure, because it now looks fixed.

### What was actually missing: any test

No spec referenced `PaymentRecheckService` or `recheckCustomerPayment`. For a
path that can move an order to `PAID` and start a provisioning run on a button
press, that is the gap that mattered.

REG-227 now covers it — seven tests, aimed at the refusals rather than the happy
path, and mutation-proven: replacing `if (diagnosis.advanced)` with `if (true)`
fails both the unpaid case and the unreachable-provider case.

**One thing worth recording about writing it.** The first version stubbed
`stripe.retrieveCheckoutSession` — a method the service does not call. Six of
seven tests passed over a service they never reached. It was caught only because
the seventh asserted that an advance *does* happen, and that one cannot pass on a
stub returning nothing. A spec where everything is green is not evidence that it
ran the code.

### Part two, deferred as agreed

The scheduled reconciliation sweep is [[ITEM-0083]]. Deferred on purpose: it acts
without a human, and a Stripe outage turns a sweep into a retry storm. It should
wait until the operator path has been used enough to show the diagnosis is right.

## History

- 2026-08-21 — raised after a local checkout sat at "We're confirming your
  payment" indefinitely. The database's most recent Stripe webhook of any kind
  predated the checkout by eleven days: in development Stripe cannot reach
  `localhost` without `stripe listen --forward-to`, and nothing on either the
  customer page or the operator side says so.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[billing]], [[platform-admin]]

<!-- GRAPH:END -->

- 2026-08-22 — user chose option 3. Part one was already built end to end; what it lacked was any test, now REG-227. Part two deferred as ITEM-0083.
