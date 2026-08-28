# Open Product Decisions

> **Generated file — do not edit by hand.** Rebuild with `node scripts/rebuild-backlog.mjs`.

Records where the engineering behaviour is understood but the **correct product**
**behaviour is not decided**. These are questions for a human, not tasks for an
agent, and no agent may resolve one by guessing.

Each states the question, the options and what each option costs.

## Awaiting a product decision

| ID | Title | Type | Severity | Priority | Status | Affected | Architect |
|---|---|---|---|---|---|---|---|
| [BUG-0898](../../docs/bugs/BUG-0898-self-service-checkout-is-blocked-for-every-plan-no-plan-pric.md) | Self-service checkout is blocked for every plan: no plan price has ever been synced to Stripe | BUG | CRITICAL | P0 | PRODUCT_DECISION | api:super-admin, app:landing | PRODUCT_DECISION |
| [BUG-0903](../../docs/bugs/BUG-0903-production-runs-stripe-in-test-mode-so-no-real-payment-can-b.md) | Production runs Stripe in test mode, so no real payment can be collected | BUG | HIGH | P1 | PRODUCT_DECISION | api:billing | PRODUCT_DECISION |
| [ITEM-0062](../../docs/backlog/items/ITEM-0062-no-multi-tenant-membership-one-user-belongs-to-one-tenant-so.md) | No multi-tenant membership — one user belongs to one tenant, so discovery and switching cannot exist | ARCHITECTURE | HIGH | P1 | PRODUCT_DECISION | auth, users, tenant-domains, web | PRODUCT_DECISION |
| [ITEM-0079](../../docs/backlog/items/ITEM-0079-activation-does-not-gate-on-a-workspace-having-any-module-en.md) | Activation does not gate on a workspace having any module enabled | PRODUCT_DECISION | LOW | P3 | PRODUCT_DECISION | api:tenant-control-plane | PRODUCT_DECISION |
