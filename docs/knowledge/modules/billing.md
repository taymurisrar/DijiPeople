# Billing

> Generated from repository evidence at `ad8f77f`; the **Current state** and
> **Two commercial paths** sections re-derived from source at `caad4a56` on
> 2026-09-11.

## Purpose

Plans, subscriptions, invoices and payments for tenant accounts, plus the Stripe
integration.

## Current state

> The line below previously read "**Stripe billing is a stub in code**". That was
> true when this note was generated and has not been true for some time — the
> module now carries roughly thirty services including a seat engine, a market
> and publication model, an order sweeper worker and webhook reconciliation. The
> claim is kept rather than deleted because it is exactly the kind of stale
> assertion an agent would act on: read as current, it invites building a second
> billing integration beside the real one. See the `doc-code-drift` pattern.

- `billing/` is the Stripe integration point and is substantially implemented.
  `services/` holds the seat, plan-change, cancellation, reconciliation,
  webhook, order and tax-basis services; `controllers/` exposes a tenant
  surface, a public surface and the Stripe webhook.
- Prices carry a **billing model**. `PER_SEAT` multiplies `unitAmount` by the
  purchased seat count; `FLAT` bills `unitAmount` once and uses `includedSeats`
  as a capacity statement. `billing-seat-pricing.ts` is the single home of that
  rule, and its header records what happened when two copies of it disagreed.
- `PlanPrice` has **three** independent gates beyond `isActive`: its own
  `publicationStatus` (default `DRAFT`), its `marketId` (null means unavailable,
  not wildcard), and Stripe readiness via `deriveCheckoutReadiness`.
- Smoke helpers exist: `scripts/stripe-test-mode-smoke.mjs`,
  `scripts/stripe-webhook-smoke.mjs`.
- A second health endpoint lives under billing — see
  [[deployment-architecture]].

## Two commercial paths that do not enforce the same rules

There are two ways a price reaches a buyer, and as of 2026-09-11 they disagree.

- **Public / website** — `resolveCommercialOffer` narrows by channel, then by
  market publication, then by price publication. It fails closed.
- **Tenant product** — `BillingService.getPublicPlans` selects prices on
  `isActive` alone, and every tenant-side checkout guard tests the *plan's*
  publication status rather than the *price's*. `marketId` is not read anywhere
  in `billing.service.ts`.

The visible consequence is the currency selector on
`/settings/subscription/plans`, which offers a tenant every currency any plan
has a price in — PKR, QAR and USD — with no market scoping and no server-side
validation that the chosen price belongs to the buyer. The schedules are not at
parity, so the cheapest currency is roughly half price in real terms.
[[BUG-3333]] and [[BUG-3334]].

**The rule that matters for future work:** when adding a commercial gate, add it
to the shared predicate, not to one of the paths. This divergence is what three
independent copies of the publication rule produced.

## The tenant Plans screen quotes a shape the API stopped using

`BillingSettingsClient` was written against `unitAmount` before the seat model
existed and was never revisited. It renders a per-seat price as a flat monthly
charge, ignores the seat field it collects, truncates plan feature lists to
eight, and offers a Subscribe button to tenants whose subscription is already
active — which the server correctly refuses with 409, because there is no
tenant-facing plan-change endpoint at all. [[BUG-3330]], [[BUG-3331]],
[[BUG-3332]].

The pattern is worth naming: the server grew `billingModel`, `includedSeats`,
`minimumSeats`, `pricePerSeat`, `isPopular` and `checkoutReadinessReasons`, the
response type declared them optional, and the component kept compiling while
quoting the old shape. **An optional field on a response type is where a
presentation layer goes stale silently.**

## Where billing meets provisioning

The `identities-and-billing` step of tenant provisioning creates the tenant's
**subscription and first invoice** alongside its owner and service account. That
bundling is why the step is non-retryable, and why a tenant that fails before it
is currently unrecoverable:
[[BUG-0015-a-tenant-that-fails-before-identities-and-billing-is-unrecoverable]].

## Where billing meets provisioning

The `identities-and-billing` step of tenant provisioning creates the tenant's
**subscription and first invoice** alongside its owner and service account. That
bundling is why the step is non-retryable, and why a tenant that fails before it
is currently unrecoverable:
[[BUG-0015-a-tenant-that-fails-before-identities-and-billing-is-unrecoverable]].

The proposed fix depends on billing supplying an idempotency anchor — invoice
`idempotencyKey` — so the step can be replayed without producing a second
invoice. **That is a billing design question inside a provisioning bug.**

[[BUG-0022-provision-tenant-has-no-confirmation-step]] has the same shape from
the other side: an unconfirmed click that creates a billable subscription and
invoice, with no request-level idempotency.

## Data sensitivity

`subscription.finalPrice` leaked through an unguarded settings alias —
[[BUG-0007-unguarded-duplicate-of-a-permission-gated-route]]. Commercial pricing
is not automatically as visible as the feature flags it sits beside.

## Gaps

No QA run covers billing end to end. Anything asserted about Stripe behaviour
here would be inference, so nothing is asserted.

Not measured as of 2026-09-11, and worth measuring before the next commercial
change: how many production `PlanPrice` rows are `DRAFT` or carry a null
`marketId`, and whether the entitlement enforcement mode is still the
`REPORT_ONLY` default. The second matters because the plan comparison table
promises module exclusivity the platform only logs about until an owner switches
that setting to `ENFORCE`.

## Related

[[tenant-provisioning]] · [[customers]] · [[settings]] ·
[[integration-architecture]] · [[deployment-architecture]] ·
[[BUG-3330]] · [[BUG-3331]] · [[BUG-3332]] · [[BUG-3333]] · [[BUG-3334]] ·
[[BUG-3335]] · [[BUG-3336]]
