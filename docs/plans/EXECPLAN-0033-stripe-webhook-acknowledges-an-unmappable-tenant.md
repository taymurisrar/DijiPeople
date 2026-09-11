---
ID: PLAN-037
aliases: [PLAN-037, EXECPLAN-0033]
Title: Stripe webhook acknowledges an unmappable customer instead of looping Stripe's redelivery
Status: IMPLEMENTED
Session: N/A — single-agent task, no multi-session framework invoked
Type: INTEGRATION
Size: SMALL
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-11
---

# EXECPLAN-0033 — Stripe webhook acknowledges an unmappable tenant

```
CONTEXT_FILES_REQUIRED:
  - .agent/context/task-completion-contract.md

SPECIALIST_AGENTS_REQUIRED:
  - Backend/API                        — billing webhook processing, error catalog

DELIBERATELY_NOT_USED:
  - Database                           — no schema change. `StripeWebhookEvent`,
                                         `WebhookProcessingStatus.FAILED` and the
                                         operator retry path already exist and are
                                         unmodified by this plan.
  - Security                           — no permission, no guard, no auth change.
                                         The webhook route stays `@Public()`, and
                                         signature verification is untouched.

SINGLE_WRITER_FILES:
  - none

QA_REQUIRED: no                        — fixed and verified by targeted regression
                                         specs in this pass; no QA session was
                                         convened for this task. Live Stripe
                                         verification against production traffic
                                         is explicitly out of scope — see Risks.

KNOWN_BUG_PATTERNS_IN_SCOPE:
  - none new

REGRESSION_ENTRIES_IN_SCOPE:
  - None registered as REG-nnn in this pass. Coverage is the new/extended spec
    files under Testing strategy.

TARGET_BRANCH:            agent/cs-s7-planbugs (task branch; not pushed by this task)
TARGET_ENVIRONMENT:       LOCAL
DEPLOYMENT_REQUIRED:      no — not part of this task
DEPLOYMENT_COMPONENTS:    api
DEPLOYMENT_ORDER:         api only
ROLLBACK_CLASS:           CODE_ONLY
INTEGRATOR_REQUIRED:      yes — mandatory per AGENTS.md once tracked files change,
                          though this task does not push/merge/finalize
RELEASE_DEVOPS_REQUIRED:  no — not part of this task
POST_DEPLOY_QA_REQUIRED:  no — not part of this task
MERGE_STRATEGY:           rebase
KNOWN_CONCURRENT_WORK:    none identified in api:billing at task start
ENVIRONMENT_DEPENDENCIES: none — no Stripe account setting, mode or key touched;
                          code-only, as the assignment required
```

## Objective

A Stripe `customer.subscription.*` or `invoice.*` event whose customer cannot
be resolved to exactly one tenant stops being answered `400` — which Stripe
retries on a backoff schedule forever, since nothing about redelivering an
identical payload ever changes the mapping — and is instead acknowledged
`2xx` once its failure is durably recorded, so the redelivery loop ends and
reconciling the customer becomes a bounded operator task.

## Business requirement

BUG-2462's own record, itself derived from a production incident
(`req_f180fe6f-554a-452a-a9f0-9638dd92a3c3`, 19 occurrences over six days,
2026-08-24 to 2026-08-30). The record's Proposed Resolution names this
explicitly as needing an ExecPlan: *"Stop the retry loop — record the
unmappable event durably... and acknowledge it to Stripe, so redelivery stops
and reconciliation becomes an operator task with a queue behind it. Keep
`4xx` for a genuinely invalid or unsigned payload."*

## Existing behavior

**FACT**, verified against `services/api/src/modules/billing/services/webhook.service.ts`
and `services/api/src/modules/billing/controllers/stripe-webhook.controller.ts`
at the branch point of this task:

- The diagnostic half of BUG-2462 was already fixed before this task started:
  both `resolveSubscriptionContext` and `resolveInvoiceContext` throw with
  `details` naming the Stripe customer id, subscription id, resolved
  `customerAccountId` and how many tenants/subscriptions actually matched —
  see the record's own `## Resolution` section, dated before this session.
  This plan does not redo that part.
- `processStripeEvent` (`webhook.service.ts:165-264`) already distinguishes
  three outcomes: duplicate (short-circuit), success/ignored, and failure. On
  failure it already persists `StripeWebhookEvent.processingStatus = FAILED`
  with `errorMessage`, already records a `PlatformEventResult.FAILED`
  platform event (the "a customer may have paid without us knowing" alert),
  and already rethrows. An operator retry path already exists —
  `retryStoredEvent` (`webhook.service.ts:288-318`), reachable from
  `SuperAdminService.retryStripeWebhookEvent` — for a human to re-run a
  `FAILED` event once the underlying mapping is fixed.
- What did not exist: any way to tell "the customer cannot be mapped, and
  redelivery will not help" apart from every other kind of failure at the
  point that decides what Stripe hears back. `StripeWebhookController`
  (`stripe-webhook.controller.ts`) let every exception from
  `processStripeEvent` propagate uncaught, which `HttpExceptionFilter`
  renders as the exception's own status — `400` for the
  `BadRequestException` both resolvers throw.

## Existing architecture

- `services/api/src/modules/billing/controllers/stripe-webhook.controller.ts`
  — the public webhook endpoint, signature verification, and (now) the
  acknowledge-vs-rethrow decision
- `services/api/src/modules/billing/services/webhook.service.ts` —
  `processStripeEvent`, `resolveSubscriptionContext`, `resolveInvoiceContext`,
  `retryStoredEvent`
- `services/api/src/common/errors/error-catalog.ts` — the error code registry
  `HttpExceptionFilter` renders from
- `StripeWebhookEvent` (`schema.prisma`) — the durable record and its
  `WebhookProcessingStatus` enum (`RECEIVED`/`PROCESSED`/`FAILED`/`IGNORED`)

## Requirements

1. An unmappable subscription or invoice event is acknowledged to Stripe
   (`2xx`) once its failure is durably recorded.
2. The recorded failure continues to name the Stripe customer, subscription
   and event identifiers (already true; unchanged by this plan).
3. No secret, key or full webhook payload is written to the error log
   (already true; unchanged).
4. A genuinely invalid or unsigned payload still fails loudly with a
   non-2xx status (unchanged — the signature/header checks in the controller
   are untouched, and any other exception the handler throws still
   propagates).
5. Signature verification behavior is unchanged.
6. `processStripeEvent`'s own internal semantics are unchanged: the event is
   still marked `FAILED`, the critical payment-attribution platform event
   still fires, and an operator's manual retry (`retryStoredEvent`) still
   surfaces a real error if the mapping is still broken. Only what the public
   webhook boundary tells Stripe changes.

## Dependencies

None. Reconciling the specific affected Stripe customer (the record's item 3,
"Reconcile the affected customer once identified") is an operational task
against the live Stripe/production database, not a code change, and is out of
scope for this plan.

## Files / modules affected

- `services/api/src/modules/billing/services/webhook.service.ts`
- `services/api/src/modules/billing/controllers/stripe-webhook.controller.ts`
- `services/api/src/common/errors/error-catalog.ts`
- `services/api/src/modules/billing/controllers/stripe-webhook.controller.spec.ts` (new)
- `services/api/src/modules/billing/services/webhook-event-not-ready.spec.ts` (extended)

## Database impact

None. `StripeWebhookEvent` and `WebhookProcessingStatus` are unchanged.

## Backend impact

- `resolveSubscriptionContext` and `resolveInvoiceContext` now throw
  `BadRequestException({ code: 'STRIPE_CUSTOMER_UNMAPPED', message, details })`
  instead of `code: 'VALIDATION_FAILED'`. `details` is unchanged (both already
  carry the diagnostic identifiers from the prior fix).
- New exported function `isUnmappableStripeTenantError(error)` in
  `webhook.service.ts`, matched on that code — the same pattern
  `isEventNotReadyError` already uses for `INTEGRATION_EVENT_NOT_READY`, so
  the distinction lives in one place.
- `StripeWebhookController.handleStripeWebhook` wraps the
  `processStripeEvent` call in try/catch: on
  `isUnmappableStripeTenantError`, logs
  `stripe.webhook.unmapped_tenant_acknowledged` (event id and type only — no
  payload) and returns the same success-shaped body
  (`{received, duplicate, stripeEventId, status: 'FAILED'}`) that a 2xx
  response always carries here (`@HttpCode(200)` was already on the route).
  Every other error is rethrown unchanged.
- New error catalog entry `STRIPE_CUSTOMER_UNMAPPED` (400, category
  `integration`, `retryable: false`) — added because the code is genuinely a
  new class of error a caller might see via `retryStoredEvent`'s admin path,
  not because every ad-hoc code in this file is catalogued (it is not; see
  `LOCATION_CAPTURE_REQUIRED` in `attendance.service.ts` for the codebase's
  existing precedent of an uncatalogued one-off code, which BUG-2504's
  `ATTENDANCE_MODE_NOT_SUPPORTED` also follows).

`processStripeEvent` and `retryStoredEvent` themselves are **not modified**.
This is the design's central decision: the acknowledge-vs-fail choice lives
only at the public controller boundary, so an operator's explicit retry
through `SuperAdminService.retryStripeWebhookEvent` still surfaces a real
error when the mapping is still broken, while Stripe's automatic redelivery
of the same failure gets a 2xx.

## Frontend impact

None. No admin or web screen changes.

## Permission / RBAC impact

None. The webhook route is `@Public()` and stays that way; no new endpoint,
no new permission key.

## Tenant-isolation impact

None. No new query. The failure this plan changes the response for is
precisely the case where no tenant could be determined at all — nothing here
reads or writes tenant-scoped data differently than before.

## Audit / event / logging impact

- The critical `STRIPE_WEBHOOK_PROCESSED` platform event with
  `result: FAILED` still fires exactly as before — `processStripeEvent` is
  unmodified. The "a customer may have paid without us knowing" alert is
  unaffected by this plan; it alerts on the same condition it always did.
- New controller-level `logger.warn` on acknowledgment, logging only the
  Stripe event id and type — no payload, no customer identifiers beyond the
  event id already logged elsewhere in this file's diagnostic details.

## Integration impact

Stripe: the webhook endpoint now answers `2xx` for this one class of failure
instead of `400`. This stops Stripe's redelivery backoff for that event and,
per Stripe's own webhook reliability documentation, avoids the endpoint being
flagged for reliability given a redelivery storm. No Stripe account setting,
webhook secret, mode or endpoint configuration is touched — this is
code-only, per the task's explicit instruction not to change Stripe account
settings or switch modes.

## Migration / data compatibility

None. Already-stored `FAILED` events and their `errorMessage` are unaffected
in shape; only newly-thrown errors carry the new `code` value, and only the
controller's handling of that specific code changes.

## Parallel-safe tasks

- `PARALLEL_SAFE` — entirely independent of the attendance-correction fixes
  in EXECPLAN-0032; no shared file.

## Dependency-blocked tasks

None.

## Integration tasks

None beyond the normal commit this task's completion contract requires. No
PR, merge or deploy is performed by this task.

## Testing strategy

- `npm --workspace api run test -- src/modules/billing` — full billing suite,
  to prove no regression across all 23 existing spec files.
- Extended `webhook-event-not-ready.spec.ts`:
  - the existing "cannot be attributed at all" test now also asserts the
    thrown error is tagged `isUnmappableStripeTenantError(error) === true`
    (`processStripeEvent`'s own throw/FAILED/alert behavior remains asserted
    exactly as before — unchanged)
  - a new case for the ambiguous-mapping branch (`customerAccount` with two
    tenants), asserting the same tag and `details.matchedTenants: 2`
  - a classifier unit test: an unrelated `Error` and a generic
    `VALIDATION_FAILED` `BadRequestException` are NOT tagged
- New `stripe-webhook.controller.spec.ts`:
  - `processStripeEvent` rejecting with the tagged error resolves to the
    acknowledged 2xx-shaped body
  - the ambiguous-mapping variant of the same tagged error is acknowledged
    the same way
  - a rejection that is not the tagged class (a plain `Error`, or an
    untagged `BadRequestException`) still propagates and rejects the
    controller call
  - a successful `processStripeEvent` result is passed through unchanged

## Risks

1. **Stripe still sees the 400 for six more days of already-scheduled
   redeliveries of the specific incident named in the record**, until this
   ships to production. Likelihood: certain, unavoidable without a deploy.
   Impact: none beyond what is already happening. Mitigation: none needed —
   this is a forward fix, not a backfill; deploying it is what stops the next
   redelivery from 400-ing.
2. **A future resolver throws `BadRequestException` with a coincidentally
   matching `code` for an unrelated reason**, and gets silently acknowledged.
   Likelihood: low — the code is specific
   (`STRIPE_CUSTOMER_UNMAPPED`) and is only ever thrown from the two resolver
   call sites this plan touches. Mitigation: the classifier is a named,
   exported function with its own regression tests asserting what it does
   and does not tag; a reviewer adding a third throw site with this code
   would be doing so deliberately.
3. **No live Stripe verification was performed** — this task was explicitly
   told not to touch Stripe account settings, switch modes, or touch live
   keys. The fix is verified at the unit level (the controller's
   try/catch decision and the resolvers' tagged throw) rather than against a
   real redelivered webhook. Mitigation: the existing diagnostic fix already
   in production means the next real occurrence will carry full identifiers,
   and `retryStoredEvent` remains available to reconcile it once a human
   fixes the underlying `CustomerAccount` mapping.

## Rollback considerations

`CODE_ONLY`. Reverting the commit restores the previous `400` response for
this failure class exactly — no persisted data changes shape.
`StripeWebhookEvent` rows already written with the old `VALIDATION_FAILED`
code or the new `STRIPE_CUSTOMER_UNMAPPED` code are both valid history either
way; nothing reads that field back as a discriminator except the classifier
this plan adds, and a reverted deploy simply stops calling it.

## Definition of Done

- `npm --workspace api run test`, `check-types`, `lint` pass
- `npm run backlog:check` passes
- BUG-2462 record updated to `Status: FIXED` with an updated `## Resolution`
  section describing this half of the fix
- No unrelated file touched
