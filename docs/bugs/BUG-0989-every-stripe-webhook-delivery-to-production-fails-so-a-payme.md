---
ID: BUG-0989
aliases: [BUG-0989]
Title: Every Stripe webhook delivery to production fails, so a payment never reaches the platform
Status: OPEN
Severity: CRITICAL
Priority: P0
Type: INFRA
Source: USER_REPORT
DetectedDate: 2026-08-23
DetectedInSha: c9e78072
AffectedModules: [services/api/src/modules/billing]
OwnerAgent: architect
ArchitectDisposition: BLOCKED_EXTERNAL
QAReport: docs/qa/runs/2026-08-24-record-state-reconciliation-0a5586f.md
RegressionId: 
RelatedBacklogItem: ITEM-0078
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-23
UpdatedAt: 2026-08-24
ResolvedAt:
---

# BUG-0989 — Every Stripe webhook delivery to production fails, so a payment never reaches the platform

## Summary

Stripe delivers events to `POST /api/billing/stripe/webhook` and production
rejects every one of them with `400 VALIDATION_FAILED` and the message
**"Invalid Stripe webhook signature."** Because a Stripe webhook is the only
thing that tells DijiPeople a payment succeeded, a customer can complete
checkout and pay, and the platform never learns of it: the order stays awaiting
payment, no `PROVISIONING_REQUESTED` event is emitted, and no workspace is ever
built. The money moves and nothing else does.

The code is not at fault. The failure is a **mismatch between the signing secret
Stripe signs with and the `STRIPE_WEBHOOK_SECRET` the service verifies with**.
That is one environment variable on one service.

## Expected Behavior

Stripe signs each delivery with the signing secret belonging to the endpoint it
is delivering to. `BillingService.verifyWebhookSignature` passes the raw request
body, the `stripe-signature` header and `getWebhookSecret()` to
`stripe.webhooks.constructEvent`, which returns a verified event. `WebhookService`
then persists it and the billing lifecycle proceeds.

## Actual Behavior

`constructEvent` throws for every delivery. The `catch` in
`verifyWebhookSignature` converts it into
`BadRequestException('Invalid Stripe webhook signature.')`, which
`HttpExceptionFilter` renders as `400 VALIDATION_FAILED`. Stripe records the
delivery as failed and retries on its own schedule; each retry fails the same
way.

## Reproduction

1. Read the production service logs and filter for the webhook path:

   ```bash
   render logs --resources srv-d7js7fqqqhas739v4i7g --limit 1000 -o json --confirm
   ```

   Eleven lines in the sampled window match, all of the form:

   ```
   WARN [HttpExceptionFilter] {"method":"POST","path":"/api/billing/stripe/webhook",
     "statusCode":400,"errorCode":"VALIDATION_FAILED","severity":"warning"}
   ```

2. Confirm which of the handler's three rejections is firing, by sending a
   deliberately invalid signature. This is safe — a request that fails signature
   verification can never be processed as a real event:

   ```bash
   curl -s -X POST https://api.dijipeople.com/api/billing/stripe/webhook \
     -H "Content-Type: application/json" \
     -H "stripe-signature: t=1,v1=deadbeef" \
     -d '{"id":"evt_probe","type":"ping"}'
   ```

   Production answers:

   ```json
   {"statusCode":400,"errorCode":"VALIDATION_FAILED",
    "message":"Invalid Stripe webhook signature."}
   ```

## Evidence

- `services/api/src/modules/billing/controllers/stripe-webhook.controller.ts:22-40`
  — the handler rejects in three distinct ways: a missing `stripe-signature`
  header, a body that is not a `Buffer`, and a signature `constructEvent`
  refuses. All three surface as `400 VALIDATION_FAILED`, which is why the log
  line alone cannot identify the cause.
- `services/api/src/modules/billing/services/billing.service.ts:1068-1082` —
  `verifyWebhookSignature`, and the `catch` that produces the observed message.
- `services/api/src/main.ts:156-195` — `configureBodyParsing` mounts
  `raw({ type: 'application/json' })` on the webhook path *before* the JSON and
  urlencoded parsers, and both of those skip the path via
  `isStripeWebhookRequest`. The raw body therefore survives.
- Production returned the third message, not the second. **That is the finding**:
  execution reached `constructEvent`, so the header was present and the body was
  a `Buffer`. Everything up to the secret is working.

## Root Cause

`STRIPE_WEBHOOK_SECRET` on `srv-d7js7fqqqhas739v4i7g` is not the signing secret
of the Stripe webhook endpoint that is delivering these events.

The most likely explanations, in order:

1. **Mode mismatch.** BUG-0903 records that production runs `STRIPE_MODE = test`.
   A test-mode endpoint and a live-mode endpoint have different signing secrets,
   and a secret from the wrong mode fails every verification while looking
   entirely correct in the dashboard.
2. **The endpoint was recreated.** Deleting and re-adding an endpoint in Stripe
   issues a new `whsec_…`; the service keeps the old one.
3. **The variable was never set for this endpoint** and holds a value from an
   earlier local or staging configuration.

This cannot be narrowed further from outside: it requires reading
`STRIPE_WEBHOOK_SECRET` on the service and comparing it with the endpoint's
signing secret in the Stripe dashboard. Both are operator actions.

## Impact

**Critical, and reachable in production right now.** Every self-service purchase
is affected. The customer is charged by Stripe and receives nothing: no
workspace, no confirmation the platform can act on, and an order permanently
stuck awaiting payment. `PaymentRecheckService` can rescue an individual order
after the fact, but it is a manual re-check, not a substitute for delivery.

This sits upstream of [[BUG-0904]]. Even with the outbox worker running, no
`PROVISIONING_REQUESTED` event is ever emitted, because the event that would
emit it never arrives.

## Affected Areas

- `POST /api/billing/stripe/webhook` — the only ingress for Stripe events.
- `WebhookService.processStripeEvent` and every lifecycle it drives: order
  confirmation, subscription activation, invoice and payment records.
- `ProvisioningRequestedHandler` — starved of the event that triggers it.
- The self-service checkout on `www.dijipeople.com`, end to end.

## Proposed Resolution

**No code change.** One operator action, in this order:

1. In the Stripe dashboard, open the webhook endpoint pointed at
   `https://api.dijipeople.com/api/billing/stripe/webhook` and copy its signing
   secret. Note which mode — test or live — the endpoint belongs to.
2. Set `STRIPE_WEBHOOK_SECRET` on `srv-d7js7fqqqhas739v4i7g` to that value, in
   the mode matching `STRIPE_MODE`.
3. Redeploy, or restart, so the process picks up the new value.
4. Use **Resend** on a recent failed delivery in the Stripe dashboard and confirm
   it returns `200`.

Do this **together with** [[BUG-0903]] rather than before it. Switching
`STRIPE_MODE` to live requires the live endpoint's secret, so setting the test
secret first means setting it twice.

No ExecPlan is needed. This is configuration, not a change to the system.

## Acceptance Criteria

- A Stripe **Resend** of a previously failed delivery returns `200`.
- No `path: "/api/billing/stripe/webhook", statusCode: 400` line appears in
  service logs after the change.
- A test-mode checkout run end to end produces a `StripeWebhookEvent` row, a
  confirmed order, a `PROVISIONING_REQUESTED` outbox row, and a provisioned
  tenant.

## Regression Coverage

A signing-secret mismatch cannot be caught by a unit test — it is environment
state, not code. Two things do catch it, and both are already recorded:

- **[[ITEM-0078]]** — an end-to-end payment-to-provisioned-tenant run against
  Stripe test mode. This defect is precisely what that item exists to find, and
  it reached production because that run has never been performed.
- **[[ITEM-0084]]** — drift detection between `render.yaml` and the live Render
  service, which is the same class of failure as [[BUG-0767]] and [[BUG-0904]]:
  the file says one thing and the running service does another.

No `REG-nnn` is added, because there is no test to name. That is a deliberate
decision, not an omission.

## Dependencies

- [[BUG-0903]] — sequence with it, per Proposed Resolution.
- Requires Stripe dashboard access and permission to write a production
  environment variable. Both are the owner's.

## Related Items

[[BUG-0903]], [[BUG-0904]], [[BUG-0767]], [[ITEM-0078]], [[ITEM-0084]],
[[billing]], [[outbox]]

## Resolution

Not yet resolved. Awaiting the operator action in Proposed Resolution.

## QA Retest

Diagnosed — not fixed — by
[`2026-08-24-record-state-reconciliation-0a5586f.md`](../qa/runs/2026-08-24-record-state-reconciliation-0a5586f.md),
scenario S10. That run established the failure mode and eliminated the raw-body
and missing-header explanations; it did not change anything.

Retest after the secret is corrected, against the Acceptance Criteria above.

## History

- 2026-08-23 — created from user report at `c9e78072`. The record was filed with
  its template body unedited: title and frontmatter only.
- 2026-08-24 — investigated and written up at `0a5586f`. Root cause established
  as a signing-secret mismatch, and the code exonerated by probing which of the
  three possible 400s production actually returns.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Backlog item — [[ITEM-0078]]
- Referenced by — [[ITEM-0094]]
- Modules — [[billing]]

<!-- GRAPH:END -->
