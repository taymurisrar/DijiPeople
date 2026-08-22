# Open Product Decisions

> **Generated file — do not edit by hand.** Rebuild with `node scripts/rebuild-backlog.mjs`.

Records where the engineering behaviour is understood but the **correct product**
**behaviour is not decided**. These are questions for a human, not tasks for an
agent, and no agent may resolve one by guessing.

Each states the question, the options and what each option costs.

## Awaiting a product decision

| ID | Title | Type | Severity | Priority | Status | Affected | Architect |
|---|---|---|---|---|---|---|---|
| [BUG-0714](../../docs/bugs/BUG-0714-customer-emails-link-to-the-vercel-app-host-and-api-base-url.md) | Customer emails link to the vercel.app host, and API_BASE_URL is plain HTTP | INFRA | HIGH | P1 | PRODUCT_DECISION | services/api, apps/web, docs/deployment | PRODUCT_DECISION |
| [ITEM-0062](../../docs/backlog/items/ITEM-0062-no-multi-tenant-membership-one-user-belongs-to-one-tenant-so.md) | No multi-tenant membership — one user belongs to one tenant, so discovery and switching cannot exist | ARCHITECTURE | HIGH | P1 | PRODUCT_DECISION | auth, users, tenant-domains, web | PRODUCT_DECISION |
| [ITEM-0076](../../docs/backlog/items/ITEM-0076-operators-cannot-recover-an-order-whose-stripe-webhook-never.md) | Operators cannot recover an order whose Stripe webhook never arrived | PRODUCT_DECISION | MEDIUM | P2 | PRODUCT_DECISION | api:billing, apps/admin | PRODUCT_DECISION |
| [ITEM-0079](../../docs/backlog/items/ITEM-0079-activation-does-not-gate-on-a-workspace-having-any-module-en.md) | Activation does not gate on a workspace having any module enabled | PRODUCT_DECISION | LOW | P3 | PRODUCT_DECISION | api:tenant-control-plane | PRODUCT_DECISION |
