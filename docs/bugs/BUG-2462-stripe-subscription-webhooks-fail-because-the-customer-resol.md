---
ID: BUG-2462
aliases: [BUG-2462]
Title: Stripe subscription webhooks fail because the customer resolves to no tenant
Status: OPEN
Severity: HIGH
Priority: P1
Type: INTEGRATION
Source: QA_RUN
DetectedDate: 2026-08-30
DetectedInSha: 39d8ddc4
AffectedModules: [api:billing, api:super-admin]
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
QAReport:
RegressionId:
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-30
UpdatedAt: 2026-08-30
ResolvedAt:
---

# BUG-2462 — Stripe subscription webhooks fail because the customer resolves to no tenant

## Summary

`WebhookService.resolveSubscriptionContext` throws
`BadRequestException('Stripe subscription customer could not be resolved to one
tenant.')` when the `stripeCustomerId` on an incoming subscription event does
not match exactly one tenant. Production has been answering Stripe with `400`
for this since **2026-08-24, and was still doing so on 2026-08-30** — 19
recorded occurrences of one event, six days apart.

Two problems compound. Stripe retries a non-2xx webhook on a backoff schedule,
so a single unresolvable event is redelivered indefinitely and can never drain.
And the recorded incident carries **no diagnostic context at all** — `details`
is `{}` — so there is no way to learn from the log which Stripe customer,
subscription or event is stuck.

## Expected Behavior

- A webhook event the platform cannot map to a tenant is acknowledged to Stripe
  (`2xx`) once its receipt is durably recorded, so Stripe stops redelivering,
  and is surfaced to operators as something to reconcile.
- The recorded failure names the Stripe object it could not resolve, so an
  operator can find it in the Stripe dashboard without guessing.
- A genuinely malformed or unsigned payload still fails loudly.

## Actual Behavior

- The handler answers `400`. Stripe treats that as a delivery failure and
  retries; the occurrence count climbs on the same fingerprint for six days.
- The stored incident has empty `details`, so the row says only that *some*
  customer could not be resolved.

## Reproduction

1. In Stripe, have a customer whose `stripeCustomerId` matches either no
   `CustomerAccount` row, or a `CustomerAccount` with zero or more than one
   tenant.
2. Trigger a `customer.subscription.*` event for that customer.
3. `POST /api/billing/stripe/webhook` returns `400`
   `"Stripe subscription customer could not be resolved to one tenant."`.
4. Stripe redelivers on its retry schedule; each attempt increments the same
   incident.

## Evidence

Production incident `req_f180fe6f-554a-452a-a9f0-9638dd92a3c3`, read from
`GET /api/platform/logs/events/{traceId}` on 2026-08-30 (API commit `ec1d58d`):

```
message         Stripe subscription customer could not be resolved to one tenant.
route           /api/billing/stripe/webhook
occurrenceCount 19
firstSeenAt     2026-08-24T23:34:26.289Z
lastSeenAt      2026-08-30T00:54:20.594Z
details         {}
stack           BadRequestException: ...
                at WebhookService.resolveSubscriptionContext
                (.../modules/billing/services/webhook.service.js:614:19)
```

A sibling failure on the same endpoint, now quiet:

```
req_24fb7144  "Stripe invoice could not be mapped to a DijiPeople subscription."
              5 occurrences, 2026-08-24T19:18 .. 2026-08-24T21:36
              at WebhookService.resolveInvoiceContext
```

Source:

- `services/api/src/modules/billing/services/webhook.service.ts:978-989` — the
  `customerAccount.tenants.length !== 1` branch that throws.
- `services/api/src/modules/billing/services/webhook.service.ts:1173` — the
  invoice equivalent.
- `services/api/src/modules/billing/services/webhook.service.ts:1111` — a third,
  `"could not be mapped to a DijiPeople plan price"`, not yet observed firing.

Note `assertNotAwaitingProvisioning` is consulted first, so the "tenant is not
provisioned yet" case is already distinguished. What reaches the throw is a
customer that is genuinely unmapped or ambiguously mapped.

## Root Cause

Not yet established, and the record deliberately stops short of guessing. Two
candidates, distinguishable only with the Stripe customer id the log does not
record:

1. A `CustomerAccount` with no tenant or two tenants — the duplicate-customer
   shape of [[BUG-1516]] would produce exactly this.
2. Test-mode webhook traffic against production, from checkout experiments that
   never provisioned a tenant.

Independent of which, the response code is wrong: an event the platform cannot
map is not a client error on Stripe's part, and answering `400` guarantees an
unbounded retry loop.

## Impact

Billing correctness. Subscription lifecycle events — activations, plan changes,
cancellations, payment outcomes — are being dropped for at least one customer,
and the platform's record of that subscription drifts from Stripe's. Because
Stripe eventually exhausts its retries and disables an endpoint that keeps
failing, this can escalate from "one customer's events are lost" to "all
webhook delivery stops".

HIGH: it is live in production, it touches money, and it is on the go-live path.

## Affected Areas

- `POST /api/billing/stripe/webhook`
- `services/api/src/modules/billing/services/webhook.service.ts`
- `CustomerAccount` ↔ `Tenant` ↔ `Subscription` mapping
- Platform monitoring, which cannot currently diagnose this class of failure

## Proposed Resolution

Investigation first, then two changes. This one **needs an ExecPlan** — it
touches billing state and the fix changes what the platform tells Stripe.

1. **Diagnose** — add the Stripe object identifiers to the recorded `details`
   (customer id, subscription id, event id and type), taking care that no
   secret or full payload is written. Without this the root cause cannot be
   settled from production evidence.
2. **Stop the retry loop** — record the unmappable event durably (the `outbox`
   or a dead-letter of received-but-unmapped events) and acknowledge it to
   Stripe, so redelivery stops and reconciliation becomes an operator task with
   a queue behind it. Keep `4xx` for a genuinely invalid or unsigned payload.
3. **Reconcile** the affected customer once identified.

## Acceptance Criteria

- An unmappable subscription or invoice event is acknowledged to Stripe and
  recorded once, with the customer, subscription and event identifiers present
  in the incident.
- No secret, key or full webhook payload is written to the error log.
- An unsigned or malformed payload is still rejected.
- The stuck event stops being redelivered, and the occurrence count stops
  climbing.
- Signature verification behaviour is unchanged.

## Regression Coverage

A spec driving `resolveSubscriptionContext` with a customer that maps to zero
and to two tenants, asserting the recorded context and the acknowledged
response. Registered as a regression entry once written.

## Dependencies

Needs an ExecPlan before implementation. May depend on production Stripe data
to identify the affected customer.

## Related Items

[[BUG-1516]] — duplicate customer records, the most likely mechanism for a
customer that maps to no single tenant. [[BUG-2465]] — the classification gap
that kept this row invisible in a queue of 1,870.

## Resolution

**Partially fixed; the substantive half needs the ExecPlan.**

Done now — the diagnostic gap, which blocked root-causing anything else. Both
`resolveSubscriptionContext` and `resolveInvoiceContext` now throw with
`details` naming the Stripe customer id, the subscription id, the resolved
`customerAccountId` and **how many tenants or subscriptions actually matched**.
That last field is the one that matters: it separates "unmapped" from
"ambiguously mapped", which have different causes and different fixes. The
incident previously recorded `details: {}`.

Identifiers only — no payload, no keys, nothing `sanitizeForErrorLog` would
have to strip.

**Not done: the response code.** Answering Stripe `400` is what drives the
six-day redelivery loop, but changing it means deciding where an unmappable
event goes instead — an outbox, a dead-letter, an operator queue — and that is
a billing-state decision, not a one-line change. Left as `400` deliberately
rather than guessed at.

The next occurrence of this failure will carry the customer id, which is what
the ExecPlan needs to identify the affected account.

## QA Retest

Pending.

## History

- 2026-08-30 — created from the production monitoring triage at `39d8ddc4`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[billing]], [[super-admin]]

<!-- GRAPH:END -->
