# ExecPlan — Multi-payment billing and bank-transfer settlement

> PLAN-056 for [[TASK-0038]], GitHub Issue #137, and draft PR #136. Required by
> `PLANS.md` because this changes billing authority, tenant provisioning,
> external-provider routing, permissions, and database persistence.

TARGET_BRANCH: develop
TASK_BRANCH: feature/pk-payment-methods-bank-first
DEPLOYMENT_REQUIRED: no
ROLLBACK_CLASS: DATABASE_ADDITIVE + EXTERNAL_INTEGRATION
QA_REQUIRED: yes
DATABASE_WRITE_LEASE: SESSION-0133

## Objective

For an eligible PKR price, an email-verified buyer can receive a server-priced
invoice and unique bank reference, submit an untrusted transfer claim, and wait
for an authorized operator to independently verify received funds. Exactly one
atomic verification creates the successful payment, pays the invoice, confirms
the order, and emits the existing provisioning outbox event. A screenshot,
transaction id, redirect, duplicate approval, or client-supplied amount can
never activate a subscription.

## Architecture to extend

- `SubscriptionOrderService` freezes price, plan version, seats, market,
  currency, interval, and email-verification state.
- `OrderActivationService` emits the idempotent `PAYMENT_CONFIRMED` event.
- `PaymentSettlementService` owns provider settlement, duplicates,
  reconciliation, refunds, renewals, and managed-provider state.
- Platform Admin already has invoice, payment, subscription, provider-event,
  refund, and diagnostics surfaces using `ProDataTable` and runtime pages.
- Private object storage exists, but malware scanning and reliable magic-byte
  validation do not; evidence fails closed in production until scanner-ready.

PR #136's assisted-sales request remains the honest fallback when no approved
receiving account is configured. It is not treated as a paid order.

## Data and trust design

Add platform-owned method configuration keyed by market, currency, method, and
environment, with enabled/public, approval, and readiness state. Add encrypted,
masked receiving-account configuration whose public projection is available
only when active and approved. Add a bank-transfer claim for customer assertions,
verification decisions, duplicate fingerprints, and optional quarantined
evidence metadata.

Bridge pre-provisioning financial records to `SubscriptionOrder` and
`CustomerAccount`. Existing invoice/payment tenant and subscription relations
must become nullable or be complemented by dedicated pre-provisioning records;
the implementation must preserve one post-provisioning history and update every
projection that assumes non-null relations. Changes are additive or nullable
relaxations. No applied migration is edited and no enum member is removed.

Public DTOs never accept tenant id, computed price, tax, discount, invoice or
payment status, approval state, bank configuration, or activation state.
Approval conditionally claims one reviewable record in one transaction; re-reads
order, invoice, readiness, email verification, expiry, amount, currency, and
existing allocations; writes one payment and audit decision; updates the
invoice; moves only an eligible order to paid; and emits the existing outbox
event. Partial, excess, wrong-currency, duplicate, expired, cancelled, and
already-paid states route to reconciliation without activation.

## Provider and market routing

Public availability is the intersection of market/currency eligibility,
enabled/public state, production environment, merchant approval, credential
readiness, and provider health. Safepay sandbox stays non-production. Stripe is
preserved for USD but hidden until explicitly live-ready. USD never falls back
to Pakistani methods. Bank transfer is a method/channel, not a gateway executor.

## UI behavior

The landing wizard keeps plan/cycle/seats, organization/admin/legal acceptance,
and email verification, then fetches methods for the frozen order. Bank
instructions appear only after invoice creation and include exact amount,
currency, due date, invoice/reference, masked approved account, and a warning
that evidence is not payment confirmation.

Admin extends the billing shell with provider-neutral Payment Methods, Receiving
Accounts, Verification Queue, Reconciliation, audit/evidence detail, and guarded
decision dialogs. Tenant billing gains provider-neutral pending, clarification,
rejection, expiry, variance, refund, and history states.

## Work packages

1. Restore PR #136 formatting and landing invariant test.
2. Add schema, migration, generated client, permission/configuration wiring, and database tests.
3. Add registry/readiness, public order/invoice/status/claim/evidence APIs, and atomic verification services.
4. Add Platform Admin configuration, queue, decisions, evidence, history, and dashboards.
5. Add landing and tenant lifecycle surfaces.
6. Validate renewals, adjustments, refunds, and provider transitions through existing services.
7. Run durable QA/security/reviewer gates and update architecture/runbooks.
8. Obtain exact-SHA CI, update PR/issue, integrate to `develop`, and post-merge validate.

## Validation

Focused specs and DB-backed E2E cover readiness, server pricing, authorization,
concurrency, duplicate references, amount/currency variance, evidence security,
and provisioning only after verified settlement. Existing Stripe/Safepay tests,
responsive/accessibility browser journeys, Prisma validation/client freshness,
migration status, lint, typecheck, build, framework, backlog, task, and QA checks
must pass. Final merge requires the exact-SHA `CI required gate`.

## External dependencies and fallback

The repository cannot determine the legally eligible merchant bank/Raast
account, verified display details, Safepay live approval/credentials, or a
production malware scanner. Engineering continues. Until the account is
approved, public PKR checkout shows assisted sales and no invented instructions.
Evidence stays production-disabled until scanning is ready.

## Rollback and compatibility

Old Stripe/Safepay orders retain their locked provider paths. New records are
additive, but after pre-tenant invoices exist the preferred recovery is a
forward fix. No production deployment or financial transaction is authorized.
`main` remains untouched.

## Definition of done

- One verified transfer produces one invoice, credited payment, subscription, and provisioned workspace.
- Unready methods are never public or treated as live.
- Unauthorized, duplicate, concurrent, mismatched, expired, cancelled, and cross-provider attempts cannot activate.
- Starter, Growth, Enterprise, and explicit custom entitlements are preserved.
- Required agents, durable QA/review, exact-SHA CI, PR/issue updates, and validated integration into `develop` all pass.
