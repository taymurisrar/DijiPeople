# Billing

> Generated from repository evidence at `ad8f77f`. **Thin note — this module has
> less verified coverage than its importance warrants.**

## Purpose

Plans, subscriptions, invoices and payments for tenant accounts, plus the Stripe
integration.

## Current state

- `billing/` is the Stripe integration point at this baseline.
- **Stripe billing is a stub in code** and was not testable during the
  2026-08-15 E2E. It is recorded there as untested, not as working.
- Smoke helpers exist: `scripts/stripe-test-mode-smoke.mjs`,
  `scripts/stripe-webhook-smoke.mjs`.
- A second health endpoint lives under billing — see
  [[deployment-architecture]].

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

## Related

[[tenant-provisioning]] · [[customers]] · [[settings]] ·
[[integration-architecture]] · [[deployment-architecture]]
