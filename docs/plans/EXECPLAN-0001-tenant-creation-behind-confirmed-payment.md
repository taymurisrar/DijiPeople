# ExecPlan — Move tenant creation behind confirmed payment

> Written for [[BUG-0077]] under [[TASK-0008]]. Required by
> [`PLANS.md`](../../PLANS.md) on two triggers: **tenant provisioning** (tenant
> creation, domains, lifecycle, subscription state) and **integrations**
> (Stripe).

CONTEXT_FILES_REQUIRED:
  - `.agent/context/task-completion-contract.md`
  - `.agent/context/branch-model.md`
  - `.agent/context/multi-session.md`
  - `services/api/prisma/AGENTS.md`
  - `docs/knowledge/architecture/tenant-workspace-routing.md`

SPECIALIST_AGENTS_REQUIRED:
  - Backend/API — the checkout path, the webhook branch, the provisioning step.
  - Integration — Stripe metadata contract and redelivery behaviour.
  - Database — no schema change, but the transaction boundaries move.
  - Security — the webhook is the trust boundary that authorises provisioning.
  - QA — DB-backed proof that an unpaid submission creates no tenant.
DELIBERATELY_NOT_USED:
  - Frontend / UI/UX — no visible surface changes. `POST /public/subscribe`
    keeps its response shape; `tenantId` becomes `null` until payment, which no
    landing screen reads.
  - Release/DevOps — `develop` only, no deployment in this package.

SINGLE_WRITER_FILES:
  - none. No `schema.prisma`, `app.module.ts`, `permissions.ts` or
    `rbac-matrix.ts` change.

QA_REQUIRED: yes

KNOWN_BUG_PATTERNS_IN_SCOPE:
  - `docs/qa/known-bug-patterns/declared-but-unwired-step.md` — the shape of the
    original defect: WP-07 declared the move and never wired it.

REGRESSION_ENTRIES_IN_SCOPE:
  - REG-nnn — an unpaid public subscribe creates zero `Tenant` rows.

TARGET_BRANCH:            develop
TARGET_ENVIRONMENT:       LOCAL
DEPLOYMENT_REQUIRED:      no
DEPLOYMENT_COMPONENTS:    api
DEPLOYMENT_ORDER:         api
ROLLBACK_CLASS:           EXTERNAL_INTEGRATION
INTEGRATOR_REQUIRED:      yes
RELEASE_DEVOPS_REQUIRED:  no
POST_DEPLOY_QA_REQUIRED:  no
MERGE_STRATEGY:           merge --no-ff
KNOWN_CONCURRENT_WORK:    SESSION-0003, SESSION-0015, SESSION-0017 — none touch
                          `modules/billing`; `session.mjs check` returned
                          SAFE_PARALLEL.
ENVIRONMENT_DEPENDENCIES: none

## Objective

A visitor who submits the public subscribe form and never pays leaves behind one
`CustomerAccount` in `PROSPECT` and one `SubscriptionOrder`, and nothing else. A
`Tenant` exists only after Stripe has confirmed payment, is created by the
provisioning engine, and takes the workspace address the buyer actually chose.

## Business requirement

From the parent brief's MUST NOT HAPPEN list, verbatim: *"click Subscribe →
active Customer immediately"* and *"abandoned onboarding → active tenant"*. Also
*"Payment does not provision the tenant. Verified payment/subscription state
authorizes the provisioning workflow."*

Commercially: a workspace address is customer-visible identity. Today an unpaid
form submission consumes one permanently, so the buyer who does pay can be handed
`maseer-2` because somebody — or something — submitted a form first.

## Existing behavior

`BillingService.createPublicSubscriptionCheckout`
(`services/api/src/modules/billing/services/billing.service.ts:218`) runs two
creation paths in one request.

1. `openOrder` at `:280` — the WP-05 path. Deduplicates the customer, resolves
   money server-side, writes `SubscriptionOrder`, reserves `requestedSlug`
   (TASK-0008 WP-01).
2. `:315`–`:422` — the pre-WP-05 path, unconditional. Creates `Lead`,
   a **second** `CustomerAccount` with `industry: 'Unknown'` and
   `companySize: 'Unknown'`, a `Tenant` with a slug from
   `resolveUniqueTenantSlug(tx, companyName)` and `status: INACTIVE`, and an
   `INCOMPLETE` `Subscription`.

Then a Stripe customer is created against customer #2 (`:424`), the checkout
session carries `metadata.tenantId` and `client_reference_id: tenant.id`
(`:437`–`:476`), and `:503` back-fills `order.tenantId` with the comment *"Until
WP-07 moves tenant creation behind the payment, the tenant already exists here"*.

`WebhookService.handleCheckoutSessionCompleted`
(`webhook.service.ts:277`) calls `requireBillingMetadata`, which requires
`tenantId`, then upserts `Subscription` on `where: { tenantId }`. After the
transaction it calls `OrderActivationService.confirmPayment`, which marks the
order `PAID` and emits `PAYMENT_CONFIRMED`; the outbox consumer calls
`openOnboarding`, which reads `order.tenantId` and emits
`PROVISIONING_REQUESTED`.

### What already works and must keep working

- The **tenant-initiated** checkout path, where a tenant legitimately exists
  before checkout. Its metadata must not change.
- Webhook idempotency: `StripeWebhookEvent`, the `lastStripeEventCreatedAt`
  ordering guard, and `confirmPayment` being idempotent on order status.
- `openOrder` deduplication, server-authoritative money, the commercial snapshot,
  and the `requestedSlug` hold.
- The provisioning engine itself — runs, steps, retryability — which is not
  changed, only invoked with a tenant it creates rather than one it is handed.

## Existing architecture

| Concern | Where |
|---|---|
| Public checkout | `modules/billing/services/billing.service.ts` |
| Pre-payment order | `modules/billing/services/subscription-order.service.ts` |
| Provider events | `modules/billing/services/webhook.service.ts` |
| Payment → onboarding | `modules/billing/services/order-activation.service.ts` |
| Provisioning engine | `modules/super-admin/tenant-provisioning.service.ts` |
| Slug rules | `common/utils/slug.util.ts` |
| Event delivery | `modules/outbox/` |

The pattern this must follow is the one `openOrder` already establishes: the
database decides uniqueness, the server decides money, and the provider is told
about a decision rather than asked to make one.

## Requirements

1. `POST /public/subscribe` creates no `Tenant`, no `Subscription`, no `Lead` and
   no second `CustomerAccount`.
2. The Stripe customer for the public path is created against the order's own
   `CustomerAccount`, and `CustomerAccount.stripeCustomerId` is set on it.
3. Public-path checkout metadata carries `subscriptionOrderId` and no
   `tenantId`. Tenant-initiated metadata is unchanged.
4. `handleCheckoutSessionCompleted` handles a session with no `tenantId` by
   recording the provider facts on the order and deferring the `Subscription`
   until provisioning has created the tenant.
5. Provisioning creates the `Tenant` using `order.requestedSlug` when present,
   falling back to derivation from the company name.
6. `Tenant.customerAccountId` equals `SubscriptionOrder.customerAccountId`.
7. No `CustomerAccount` is written with a fabricated `industry` or
   `companySize`.
8. A redelivered `checkout.session.completed` produces one tenant, one
   subscription and one onboarding.

## Dependencies

- TASK-0008 WP-01 (`requestedSlug`) — landed at `4f966ea`. Requirement 5 depends
  on it.
- No external credentials. Stripe is exercised through the existing test doubles;
  no live provider call is made by this plan.

## Files / modules affected

**services/api**

- `src/modules/billing/services/billing.service.ts` — remove the legacy block,
  repoint the Stripe customer, change public metadata.
- `src/modules/billing/services/webhook.service.ts` — branch on metadata shape.
- `src/modules/billing/services/order-activation.service.ts` — tolerate a null
  `order.tenantId`, pass the order through to provisioning.
- `src/modules/super-admin/tenant-provisioning.service.ts` — consume
  `requestedSlug`; create the subscription after the tenant.
- `test/subscription-order.e2e-spec.ts`, `test/commercial-bootstrap.e2e-spec.ts`
  — extend.

No single-writer files. No frontend files.

## Database impact

**None.** No model, column, index or constraint changes. `SubscriptionOrder`
already carries `tenantId` and `subscriptionId` as nullable, which is exactly the
shape this plan needs — they stop being written at checkout and start being
written at provisioning.

`Tenant.slug` uniqueness is unchanged and remains the permanent authority;
`SubscriptionOrder.requestedSlug` remains the pre-tenant hold.

## Backend impact

`createPublicSubscriptionCheckout` loses roughly 110 lines and gains nothing:
after `openOrder`, it creates the Stripe customer against
`order.customerAccountId`, creates the session with
`metadata = { subscriptionOrderId, planId, planPriceId, seatQuantity, publicSubscription: 'true' }`,
and calls `attachCheckoutSession`. Response shape is preserved, with `tenantId:
null` and `leadId: null` until provisioning.

`handleCheckoutSessionCompleted` gains one branch at the top: when metadata
carries no `tenantId`, skip the `Subscription` upsert entirely and fall through
to `confirmPayment`. The existing tenant-bearing branch is untouched.

Transaction boundaries: the deferred `Subscription` creation moves inside the
provisioning transaction that creates the tenant, so a tenant without its
subscription is not a reachable state. Stripe calls stay outside every
transaction, as they are today.

## Frontend impact

None. `POST /public/subscribe` keeps `{ submitted, checkoutSessionId, url,
orderNumber, reused }`; `tenantId` and `leadId` become `null` on that response
and no landing screen reads them (`subscribe-form.tsx` uses `url` only).

## Permission / RBAC impact

None. No new or changed permission keys, no `rbac-matrix.ts` entries, no
decorators added or removed, no elevated-role involvement, nothing to mirror into
`apps/web/lib/security-keys.ts`. The public endpoint keeps `@Public()` and now
inherits `PublicRateLimitGuard` at class level (BUG-0075).

## Tenant-isolation impact

This plan *reduces* tenant surface: it deletes a code path that creates tenants
from unauthenticated input.

No new tenant-scoped query is introduced. The provisioning path is a background
path with no request context, so it takes the tenant it just created as an
explicit argument — the rule for jobs and consumers in `AGENTS.md`. The webhook
resolves its order by `stripeCheckoutSessionId`, a provider-issued value on a
signature-verified request, never from a client-supplied tenant id.

A reviewer can confirm no cross-tenant access is possible by checking that the
only new lookups are `subscriptionOrder.findUnique({ stripeCheckoutSessionId })`
and `tenant.create(...)`, neither of which reads another tenant's rows.

## Audit / event / logging impact

The two audit rows the legacy block wrote — `PUBLIC_SUBSCRIBE_FORM_SUBMITTED` and
`PUBLIC_TENANT_CREATED_INACTIVE` — described events that will no longer happen.
`PUBLIC_TENANT_CREATED_INACTIVE` is deleted outright. The submission fact is
already carried by the `CHECKOUT_STARTED` outbox event `openOrder` emits, so it
is not re-added.

`STRIPE_CHECKOUT_SESSION_CREATED` moves to reference the order rather than the
subscription. Tenant creation is audited by the provisioning engine, which
already does so.

Never logged: the Stripe secret, the full session object, the customer email in
error payloads.

## Integration impact

**Stripe metadata contract changes for the public path only.** Sessions created
before this lands carry `tenantId`; sessions created after carry
`subscriptionOrderId`. Both must be handled, because in-flight checkouts will
complete after deployment — see Migration.

No change to the .NET gateway, the desktop agent, email or storage.

## Migration / data compatibility

- **In-flight checkouts.** A session created by the old code and paid after the
  new code deploys still carries `tenantId` and a pre-created tenant. The webhook
  branch keys on the *presence* of `tenantId`, so those sessions take the old
  path and complete exactly as before. This is why the branch is on metadata
  shape rather than on a version flag or a deployment date.
- **Existing orphan tenants.** Rows already created by the legacy path are left
  alone by this plan. They are `INACTIVE`, have no users, and deleting them is a
  separate decision with its own erasure semantics. Counting and dispositioning
  them is follow-up work, recorded rather than done here.
- Old and new code can run simultaneously.

## Parallel-safe tasks

- `PARALLEL_SAFE` — extending `slug.util` tests for the derivation fallback.
- `PARALLEL_SAFE` — the QA scenario and regression register entries.

## Dependency-blocked tasks

- `DEPENDENCY_BLOCKED` — provisioning consuming `requestedSlug` waits on the
  checkout path no longer creating the tenant, or the two writers race.
- `DEPENDENCY_BLOCKED` — the DB-backed "zero tenants" assertion waits on the
  legacy block being removed, since it is the assertion that it is gone.

## Integration tasks

- `INTEGRATION` — the webhook branch. It joins the new checkout path to the
  existing provisioning chain and must land after both.

## Testing strategy

Commands from `AGENTS.md`, against `dijipeople_t8_test`:

```bash
npm --workspace api run test:e2e -- subscription-order
npm --workspace api run test:e2e -- commercial-bootstrap
npm --workspace api run test
npm --workspace api run check-types
npm --workspace api run lint
node scripts/validate-framework.mjs
```

Extended: `test/subscription-order.e2e-spec.ts` — an unpaid submission creates
zero tenants, one customer, and does not fabricate `industry`; a repeat
submission after TTL still creates zero tenants.

New assertions in the webhook specs: a session without `tenantId` defers the
subscription and still confirms payment; a session with `tenantId` behaves
exactly as before; a redelivered event produces one of everything.

Manual verification is not practical for the Stripe leg without live
credentials, which this environment does not have (TASK-0007 OD-03). The
provider interaction is exercised through the existing doubles, and that
limitation is stated rather than papered over.

## Risks

1. **In-flight checkout breakage** — likelihood MEDIUM, impact HIGH. A customer
   who paid against an old-format session gets no workspace. Mitigated by
   branching on metadata shape so both formats work indefinitely, and by an
   explicit test for the old shape.
2. **Webhook regression on the tenant-initiated path** — likelihood LOW, impact
   HIGH. That path is how existing tenants renew. Mitigated by leaving its code
   untouched and asserting it in tests.
3. **Deferred subscription never created** — likelihood LOW, impact HIGH. If
   provisioning fails after payment, the customer is charged with no
   subscription row. Mitigated by creating it inside the provisioning
   transaction and by the existing retry: `confirmPayment` is idempotent, and a
   retried provisioning run resumes.
4. **Orphan tenants already in the database** — likelihood HIGH, impact LOW.
   Left in place deliberately; recorded as follow-up.

## Rollback considerations

`ROLLBACK_CLASS: EXTERNAL_INTEGRATION`. Reverting the commit restores the old
behaviour with no data migration, because nothing is dropped or rewritten — the
change is which rows get *written*, not a transformation of existing ones.

The one asymmetry: sessions created while the new code was live carry
`subscriptionOrderId` and no `tenantId`. Rolled-back code would call
`requireBillingMetadata` and throw on them. If a rollback is ever needed, the
forward fix is preferred; if it is not, those orders must be provisioned by the
Platform Admin retry path, which already exists.

Frontend without API: no effect, the response shape is unchanged. API without
frontend: no effect, no frontend change is required.

## Definition of Done

- [ ] An unpaid `POST /public/subscribe` creates one `CustomerAccount`, one
      `SubscriptionOrder`, zero `Tenant`, zero `Subscription`, zero `Lead`.
- [ ] A confirmed payment creates exactly one `Tenant`, whose slug is
      `order.requestedSlug` when the buyer chose one.
- [ ] `Tenant.customerAccountId` equals `SubscriptionOrder.customerAccountId`.
- [ ] No `CustomerAccount` written with a fabricated `industry`/`companySize`.
- [ ] A session carrying `tenantId` still behaves exactly as before, proven by
      test.
- [ ] A redelivered `checkout.session.completed` yields one of everything.
- [ ] All commands above run and pass; results reported honestly, with any
      pre-existing failure identified as pre-existing.
- [ ] BUG-0077 resolved with a `REG-nnn` entry and a reusable QA scenario.
- [ ] TASK-0007's WP-07 row corrected — it is recorded `DONE` and was not.
- [ ] No unrelated changes in the diff.
