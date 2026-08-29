---
ID: BUG-1543
aliases: [BUG-1543]
Title: Stripe webhook rejected as VALIDATION_FAILED during a live payment
Status: FIXED
Severity: HIGH
Priority: P1
Type: INTEGRATION
Source: QA_RUN
DetectedDate: 2026-08-26
DetectedInSha: 21032ae
AffectedModules: [billing]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-299
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-26
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1543 — Stripe webhook rejected as VALIDATION_FAILED during a live payment

> **Architect triage, 2026-08-27 — `DEFER`.** Diagnosis is blocked behind BUG-1516, which is the most likely cause and is FIX_NOW. Re-evaluate once that lands; the symptom may simply go.
>
> **Superseded 2026-08-29 — `FIXED`.** The cause was found by reading the code rather than by re-running a payment. See Resolution.


## Summary

During a real Stripe payment on production, the billing webhook endpoint
rejected Stripe's callbacks twice with `400 VALIDATION_FAILED`. The payment
itself succeeded and the tenant provisioned, so the rejection did not stop the
funnel — but it raised the critical "a customer may have paid without us
knowing" alert, which is exactly the condition the alert exists to detect.

## Expected Behavior

Every webhook Stripe delivers is accepted and processed, or is rejected for a
reason the platform records and an operator can act on. A successful payment
does not produce a rejected webhook.

## Actual Behavior

`POST /api/billing/stripe/webhook` returned `400 VALIDATION_FAILED` twice during
a single live payment. Two platform events were raised, including the critical
payment-attribution alert.

## Reproduction

1. Complete a paid signup through `www.dijipeople.com` with a Stripe test card.
2. Observe the payment succeed and the tenant provision.
3. Read the API logs for the webhook endpoint across the payment window.
4. Observe two `400 VALIDATION_FAILED` responses.

Reproduction depends on the duplicate-customer condition in [[BUG-1516]] being
present; see Root Cause.

## Evidence

Observed on production, 2026-08-26:

- Render API logs at 13:36:42Z contain two `POST /api/billing/stripe/webhook`
  responses of `400 VALIDATION_FAILED`.
- Two platform events were raised in the same window, one of them the critical
  payment-attribution alert.
- The payment completed: `PAID` invoice, `SUCCEEDED` payment, `ACTIVE`
  subscription and an `ACTIVE` tenant, all within roughly four seconds.

## Root Cause

Not established, but causally linked to [[BUG-1516]]: public signup creates
duplicate customer records, and Stripe tenant resolution cannot then decide
which customer the payment belongs to. Whether the 400 is thrown by that
ambiguity or by an unrelated payload validation failure has not been confirmed.

## Impact

The alert fires on real payments, which trains operators to ignore the one
signal that would tell them a customer paid and was not provisioned. Because the
funnel currently succeeds anyway, the defect is a monitoring integrity problem
rather than a revenue-loss problem — but it sits on the path where a genuine
attribution failure would appear, and would be indistinguishable from this noise.

Reachable in production on every paid signup that hits the duplicate condition.

## Affected Areas

- `services/api/src/modules/billing` — Stripe webhook handler
- `services/api/src/modules/platform-events` — the critical alert
- `services/api/src/modules/super-admin` — customer resolution

## Proposed Resolution

Fix [[BUG-1516]] first and re-run a paid signup, because the duplicate customer
is the most likely cause and clearing it may remove the symptom entirely. If the
400 survives that fix, capture the rejected payload shape and the specific
validation failure before designing anything further.

A rejected webhook should record which validation failed, so this does not
require log archaeology next time.

## Acceptance Criteria

- A complete paid signup produces no `400` response from the Stripe webhook
  endpoint.
- No critical payment-attribution alert is raised by a payment that succeeded.
- A webhook that is genuinely rejected records the failing field.

## Regression Coverage

None yet. Needs a test that drives the webhook handler with the payload shape
Stripe sends for this flow and asserts acceptance. Requires a `REG-nnn` entry
once written.

## Dependencies

Blocked behind [[BUG-1516]] for diagnosis — fixing that may resolve this.

## Related Items

Causally linked to [[BUG-1516]]. Found in the same production pass as
[[BUG-1515]].

## Resolution

**Fixed 2026-08-29.** The cause is a race inherent to the public self-service
funnel, and it was found by reading the code rather than by re-running a
payment.

### The theory this record was carrying, and why it is wrong

The obvious suspect for a `400 VALIDATION_FAILED` on a third-party callback is
the global `ValidationPipe` — `whitelist`, `transform`, `forbidNonWhitelisted`,
so any field Stripe adds becomes a 400. That would be a real design error.

**It is not what happened, and it cannot happen on this route.**
`StripeWebhookController.handleStripeWebhook` takes `@Req() request` and
`@Headers('stripe-signature')` and no `@Body()` at all
(`services/api/src/modules/billing/controllers/stripe-webhook.controller.ts:51-54`).
The pipe only validates parameters with a DTO metatype, so it never sees a
Stripe payload. `dispatchStripeEvent` returns `false` for an event type it does
not know, which is recorded as `IGNORED` and answered 200, and every handler
casts `event.data.object` rather than validating it. An additive Stripe payload
change has never been able to reject a delivery here, and there is now a test
holding that true.

### What actually threw

A public self-service signup has no tenant until the payment authorises
provisioning to create one (BUG-0077). Stripe's `customer.subscription.created`
and `invoice.paid` callbacks routinely arrive before provisioning finishes, and
both resolvers then fail to find anything to attribute the event to:

- `resolveSubscriptionContext` — no `tenantId` in metadata, no `Subscription`
  for that `stripeSubscriptionId` yet, and the `CustomerAccount` has no tenant
  — threw `BadRequestException('Stripe subscription customer could not be
  resolved to one tenant.')`.
- `resolveInvoiceContext` — the same shape one layer up — threw
  `BadRequestException('Stripe invoice could not be mapped to a DijiPeople
  subscription.')`.

Two callbacks, two `BadRequestException`s, which `HttpExceptionFilter` renders
as `400 VALIDATION_FAILED` — the status that asserts *the caller* sent
something malformed. Each also marked the stored event `FAILED` and recorded a
`STRIPE_WEBHOOK_PROCESSED` platform event with result `FAILED`, and the
notification rule matching `^STRIPE_WEBHOOK` raises its CRITICAL alert on
exactly that. That is the whole of the reported symptom: two 400s, two platform
events, one critical payment-attribution alert, on a payment that succeeded.

The duplicate-customer condition of BUG-1516 reaches the same branch, which is
why this record was sequenced behind it. It is a second route into one defect
rather than the defect itself.

### The fix

A callback that arrives before the record it is about is not a malformed
payload, and it is not a failure.

- `INTEGRATION_EVENT_NOT_READY` added to
  `services/api/src/common/errors/error-catalog.ts` — 409, `info` severity,
  retryable. Distinct from `VALIDATION_FAILED`, which is what every 400 renders
  as and which says the payload was invalid.
- `WebhookService.assertNotAwaitingProvisioning`
  (`services/api/src/modules/billing/services/webhook.service.ts`) is consulted
  before either resolver gives up. It throws that error **only** when an
  unactivated `SubscriptionOrder` exists for the event's Stripe customer —
  `tenantId` and `subscriptionId` both null, status DRAFT, PENDING_PAYMENT or
  PAID. The message names the order number, so the log line identifies the
  order rather than describing a category.
- `processStripeEvent` treats that error separately: the stored event stays
  `RECEIVED` rather than becoming `FAILED`, and the platform event is recorded
  as `IGNORED`, which the notification rules do not surface.

### Two decisions worth stating, because both could reasonably have gone the other way

**The response is still a non-2xx.** A 409 is returned, so Stripe redelivers.
Answering 200 would have satisfied this record's first acceptance criterion more
literally and lost data: nothing in this codebase except the webhook writes the
`Invoice` and `Payment` rows for a self-service order, so Stripe's redelivery is
what eventually writes them. That is why the original incident lost nothing
despite the two 400s. What changed is what the status *means* — not "your
payload is invalid" but "the record is not here yet, send it again".

**The stored event stays `RECEIVED`, not `IGNORED`.** `processStripeEvent`
short-circuits `PROCESSED` and `IGNORED` as duplicates, so marking it `IGNORED`
would have made the redelivery a no-op and lost the same rows.

**The alert is not silenced.** An event that cannot be attributed and has no
order in flight still fails, still records `FAILED`, and still raises the
critical alert — there is a test for exactly that. This record's own note was
right that a fix which silenced the alert would be the wrong one. What changed
is that a payment which succeeded no longer looks like one that may have gone
missing.

### Tests

`services/api/src/modules/billing/services/webhook-event-not-ready.spec.ts` —
seven cases driving `processStripeEvent` against a fake Prisma:

- the deferral is `INTEGRATION_EVENT_NOT_READY` with status 409, not a 400;
- it names the order it is waiting on;
- the stored event is left `RECEIVED` so the redelivery reprocesses it;
- the platform event is `IGNORED`, not `FAILED`, so no critical alert;
- an unattributable event with no order in flight still fails and still alerts;
- an unknown Stripe event type is ignored and answered 200;
- the controller declares no `@Body()`, still takes the raw request and the
  signature header, and still calls `verifyWebhookSignature`.

The diagnostics added on 2026-08-28 are unchanged and still covered by
`webhook-rejection-diagnostics.spec.ts`.

### Signature verification

Unchanged and not weakened. `BillingService.verifyWebhookSignature` still calls
`stripe.webhooks.constructEvent(payload, signature, secret)` with the raw
buffer, the controller still refuses a missing header, a non-buffer body and a
failed verification with a 400 before anything is parsed, and the new path sits
entirely **after** verification — it is reachable only by a payload Stripe
signed.

## QA Retest

**Not retested against a live Stripe, and that is a real limit on this fix.**

Verified here, by unit test: the code path, the status code, the stored-event
state, and which platform event result is recorded.

Not verified, and not verifiable without a paid signup on production:

- that the two rejections in the 2026-08-26 incident were these two branches
  rather than some third one. The reasoning is strong — two callbacks, the
  funnel completing through the order-activation path, and these being the only
  two `BadRequestException`s reachable when a self-service order has no tenant
  yet — but it is reasoning from the code, not an observation. The diagnostics
  added on 2026-08-28 will name the branch if it recurs.
- that Stripe's redelivery timing actually clears the race in practice.
- the end-to-end absence of the critical alert on a real paid signup.

No Stripe API call, price sync, mode change or configuration change was made
while fixing this, and the production database was not touched.

The next step is unchanged from what this record has always said: run a paid
signup on production and read the webhook log. It should now show either a clean
run or a 409 naming an order number, and no critical alert.

## History

- 2026-08-26 — found during the production admin E2E pass; recorded from the
  session transcript, where it had existed only as prose.
- 2026-08-28 - added the rejection diagnostics this record asks for; the cause is still unknown and needs a paid signup re-run, which is out of scope today. REG-299.
- 2026-08-29 — fixed in SESSION-0076. The cause was the self-service provisioning race, not payload validation: this route has no DTO, so the global ValidationPipe never sees a Stripe payload. A callback arriving before the tenant exists now answers `409 INTEGRATION_EVENT_NOT_READY` and records an IGNORED platform event, so Stripe still redelivers but the critical payment-attribution alert no longer fires on a payment that succeeded. Not verified against a live Stripe.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[billing]]
- Regression — REG-299 (see the regression register)

<!-- GRAPH:END -->
