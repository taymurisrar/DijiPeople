---
ID: BUG-0077
aliases: [BUG-0077]
Title: Public subscribe creates a Tenant and a second CustomerAccount before payment
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: DATA_INTEGRITY
Source: ARCHITECT
DetectedDate: 2026-08-19
DetectedInSha: 4f966ea
AffectedModules: [billing, super-admin, tenants]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-072
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-19
UpdatedAt: 2026-08-22
ResolvedAt: 2026-08-19
---

# BUG-0077 — Public subscribe creates a Tenant and a second CustomerAccount before payment

## Summary

Every submission of the public subscribe form creates, **before any money
moves**: a `Lead`, a `CustomerAccount`, a `Tenant` — permanently consuming a
workspace slug — and an `INCOMPLETE` `Subscription`.

It does this *in addition to* the `CustomerAccount` and `SubscriptionOrder` that
`openOrder` created moments earlier in the same request. So one visitor filling
in one form produces two customer records: the order points at the first, and
the tenant, the subscription and the Stripe customer all point at the second.

TASK-0007 WP-05 was the package that introduced `openOrder` specifically to stop
this, and its own comment describes the behaviour as historical: *"Previously
every submission — a refresh, a double click, a retried abandoned checkout —
created a fresh Lead, CustomerAccount, Tenant and Subscription, permanently
consuming a tenant slug each time."* The old path was never removed. Both run.

## Expected Behavior

A visitor who submits the subscribe form and never pays leaves behind a
`CustomerAccount` in `PROSPECT` and a `SubscriptionOrder` — a followable lead and
a financial record — and nothing else. No `Tenant` exists until payment is
confirmed, and the workspace slug they asked for is a *reservation*, not an
issued name.

## Actual Behavior

A `Tenant` row exists with a slug taken from the company name, `status:
INACTIVE`, before payment. A second `CustomerAccount` exists carrying
`industry: 'Unknown'` and `companySize: 'Unknown'`.

## Reproduction

1. `POST /public/subscribe` with any valid plan price and company details.
2. Do not pay.
3. `SELECT id, slug, status FROM "Tenant" ORDER BY "createdAt" DESC LIMIT 1` —
   the tenant is there.
4. `SELECT count(*) FROM "CustomerAccount" WHERE "contactEmail" = <the email>` —
   two.
5. Submit again after the order's 24h TTL expires. A second `Lead`,
   `CustomerAccount`, `Tenant` and `Subscription` appear. `submissionHash`
   deduplicates the *order*; it does not guard the legacy block.

## Evidence

`services/api/src/modules/billing/services/billing.service.ts`. `openOrder` is
called at :280, and then :315 onward creates the parallel estate unconditionally
— the only early return above it is the reused-order-with-a-live-session branch:

```ts
const created = await this.prisma.$transaction(async (tx) => {
  const lead = await tx.lead.create({ /* … industry: 'Unknown' … */ });
  const customer = await tx.customerAccount.create({
    industry: 'Unknown',
    companySize: 'Unknown',
    /* … */
  });
  const tenant = await tx.tenant.create({
    slug: await this.resolveUniqueTenantSlug(tx, companyName),
    status: TenantStatus.INACTIVE,
  });
  const subscription = await tx.subscription.create({ /* INCOMPLETE */ });
```

The file states the defect against itself at :503:

```ts
// The order now points at what payment will activate. Until WP-07 moves
// tenant creation behind the payment, the tenant already exists here; the
// order is still the record that survives an abandoned checkout.
```

**WP-07 is recorded as `DONE` in `docs/tasks/TASK-0007-…`, with `QA_STATUS =
PASS` and `CI_STATUS = PASS`.** Its title is "Payment to onboarding to
provisioning automation, steps, resumability, targets". The automation half was
built — `confirmPayment` → `PAYMENT_CONFIRMED` → outbox → `openOnboarding` →
`PROVISIONING_REQUESTED` all exist and work. The half named in the comment was
not, and nothing failed when it was left behind.

The `industry: 'Unknown'` fabrication is the same value that `resolveCustomer`,
200 lines away in `subscription-order.service.ts`, explicitly refuses to write:
*"writing 'Unknown' into a reportable column makes a fabricated value
indistinguishable from a real one."* Two functions in one request disagree about
whether that is acceptable.

## Root Cause

An additive migration that was never finished. WP-05 added the new pre-payment
model beside the old one and deferred deleting the old one to WP-07; WP-07
delivered the post-payment automation and did not do the deletion. No test
asserts the absence of a `Tenant` after an unpaid submission, so nothing went
red when the removal was skipped, and the package closed green.

## Impact

- **Slug exhaustion, permanently.** Every unpaid submission consumes a workspace
  name for good. `resolveUniqueTenantSlug` then hands the *real* buyer
  `maseer-2`. A competitor or a bored script can take any company's name by
  submitting a form and never paying.
- **This makes BUG-0075's endpoint materially worse.** Unauthenticated and, until
  that fix, unthrottled — so the slug namespace was writable at request rate.
- **It defeats TASK-0008 WP-01.** `SubscriptionOrder.requestedSlug` reserves the
  name the buyer chose, and then this path creates the tenant with a slug derived
  from the company name and ignores the reservation entirely. The feature is
  inert on the only path that matters.
- **Two sources of truth for the customer.** `SubscriptionOrder.customerAccountId`
  and `Tenant.customerAccountId` name different rows for the same buyer. Revenue,
  seat counts and support all resolve "who is this" differently depending on
  which they start from.
- **Fabricated reportable data.** `industry` and `companySize` read `'Unknown'`
  on every self-service customer, indistinguishable from a real answer.
- Directly contradicts two entries on the parent brief's MUST NOT HAPPEN list:
  *"click Subscribe → active Customer immediately"* and *"abandoned onboarding →
  active tenant"*.

Not a security or isolation defect: the pre-created tenant is `INACTIVE`, has no
users and no memberships, so nobody can sign into it.

## Affected Areas

- `POST /public/subscribe` — `BillingService.createPublicSubscriptionCheckout`
- `WebhookService.handleCheckoutSessionCompleted`, which requires
  `metadata.tenantId` and therefore depends on the tenant pre-existing
- `OrderActivationService.openOnboarding`, which reads `order.tenantId`
- TASK-0007 WP-07's completion claim

## Proposed Resolution

Finish WP-07: move `Tenant` and `Subscription` creation behind confirmed payment,
into the provisioning engine that already exists for it.

1. Delete the legacy `Lead` / `CustomerAccount` / `Tenant` / `Subscription` block
   from `createPublicSubscriptionCheckout`. The Stripe customer is created against
   the order's own `CustomerAccount`.
2. Stripe metadata for the public path carries `subscriptionOrderId`, not
   `tenantId` — there is no tenant to name yet. **The tenant-initiated checkout
   path keeps its current metadata**, so the webhook branches on which is present
   rather than having its contract changed underneath it.
3. `handleCheckoutSessionCompleted` defers the `Subscription` upsert when there is
   no `tenantId`; provisioning creates the tenant, then the subscription, then
   attaches the Stripe ids.
4. Provisioning consumes `order.requestedSlug` when present, falling back to
   derivation from the company name — which is what makes WP-01 real.

Needs an ExecPlan: it changes the money path and the webhook contract.

## Acceptance Criteria

- An unpaid `POST /public/subscribe` creates exactly one `CustomerAccount`, one
  `SubscriptionOrder`, and **zero** `Tenant` rows.
- Repeating that submission after the order TTL expires still creates zero
  tenants and does not create a third customer.
- A confirmed payment creates exactly one `Tenant`, whose slug is
  `order.requestedSlug` when the buyer chose one.
- `Tenant.customerAccountId` equals `SubscriptionOrder.customerAccountId`.
- No `CustomerAccount` is written with a fabricated `industry` or `companySize`.
- The tenant-initiated checkout path is unchanged and its tests still pass.

## Regression Coverage

A DB-backed test asserting **zero tenants after an unpaid submission**. Its
absence is the reason this survived a package closing green, so the regression is
the assertion that was never written rather than a new one about the fix.

## Dependencies

Found while starting TASK-0008 WP-02. Blocks the value of WP-01.

## Related Items

[[TASK-0008]] · [[TASK-0007]] · [[BUG-0075]] · [[ITEM-0060]]

## Resolution

Landed with [[BUG-0078]], which is the only safe order — see that record.

`createPublicSubscriptionCheckout` lost 110 lines and gained nothing. The Stripe
customer is now created against `order.customerAccountId`; the session metadata
carries `subscriptionOrderId` and no `tenantId`; `client_reference_id` is the
order number. `tenantId` and `subscriptionId` on the order stay null until
provisioning fills them in, and the response returns them as `null` rather than
dropping the keys, so an already-deployed caller reading them sees an honest
"not yet".

`handleCheckoutSessionCompleted` branches on the **shape** of the metadata, not
on a version flag or a deploy date. A checkout started before this change and
paid after it still carries a `tenantId` and a real pre-created tenant, and
still completes on the old path — so there is no cutover moment and no window in
which a paying customer falls between the two.

**Mutation evidence.** `test/payment-authorised-provisioning.e2e-spec.ts` was run
against the pre-fix source with `git stash`, and the failures reproduce the whole
defect rather than merely going red:

```
creates no tenant …            Expected: 0   Received: 1
creates exactly one customer … Expected length: 1  Received length: 2
  [{"companySize": "Unknown", "industry": "Unknown"}, {"companySize": null, "industry": null}]
reports the order as awaiting payment …  tenantId Received: "958e6d09-…"
sends Stripe the order, not a tenant …   Expected "cus_double_4"  Received: null
```

The second line is the fabrication and the duplicate customer in one diff; the
fourth is the Stripe customer having been keyed to the *other* account. Restored,
all four pass.

## QA Retest

Run 2026-08-22. The regression is DB-backed and runs in `test:e2e`, which was
executed against a migrated, seeded throwaway Postgres:

```text
services/api  test:e2e   33 suites, 369 tests   PASS
  including payment-authorised-provisioning.e2e-spec.ts, which asserts no
  Tenant, Subscription or Lead exists before payment and that exactly one
  CustomerAccount is created per buyer.
```

What that does **not** cover is the seam past payment — letting Stripe say
"paid" and watching a tenant appear. That is a real gap, and it is now
[[ITEM-0078]] rather than a sentence in this record that would keep it at
`FIXED` for ever.

### Verification — 2026-08-22, SESSION-0040

Re-ran the guard this record names, rather than reading a green suite
summary: REG-072 names `services/api/test/payment-authorised-provisioning.e2e-spec.ts`, and that is what was executed.

```text
npm --workspace api run test:e2e against a migrated, seeded throwaway Postgres   PASS
```

`Status: FIXED` → `VERIFIED`.

## History

- 2026-08-19 — found at `4f966ea` while tracing where an email-verification gate
  would sit in the checkout path. Not looked for: the function had to be read end
  to end to place the gate, and the legacy block was in the middle of it.
