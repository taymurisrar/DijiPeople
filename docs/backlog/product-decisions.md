# Open Product Decisions

> **Generated file — do not edit by hand.** Rebuild with `node scripts/rebuild-backlog.mjs`.

Records where the engineering behaviour is understood but the **correct product**
**behaviour is not decided**. These are questions for a human, not tasks for an
agent, and no agent may resolve one by guessing.

Each states the question, the options and what each option costs.

## Awaiting a product decision

| ID | Title | Type | Severity | Priority | Status | Affected | Architect |
|---|---|---|---|---|---|---|---|
| [BUG-0163](../../docs/bugs/BUG-0163-package-lock-json-cannot-be-regenerated-npm-overrides-are-si.md) | package-lock.json cannot be regenerated - npm overrides are silently ignored | INFRA | HIGH | P1 | PRODUCT_DECISION | package-lock.json, apps/admin | PRODUCT_DECISION |
| [ITEM-0062](../../docs/backlog/items/ITEM-0062-no-multi-tenant-membership-one-user-belongs-to-one-tenant-so.md) | No multi-tenant membership — one user belongs to one tenant, so discovery and switching cannot exist | ARCHITECTURE | HIGH | P1 | PRODUCT_DECISION | auth, users, tenant-domains, web | PRODUCT_DECISION |
| [BUG-0223](../../docs/bugs/BUG-0223-admin-cannot-set-a-plan-ispublic-flag-which-gates-self-servi.md) | Admin cannot set a plan isPublic flag which gates self-service checkout | UX | MEDIUM | P2 | PRODUCT_DECISION | apps/admin, api:super-admin, api:billing | PRODUCT_DECISION |
| [ITEM-0032](../../docs/backlog/items/ITEM-0032-recompute-productivity-totals-inflated-by-heartbeat-replays.md) | Recompute productivity totals inflated by heartbeat replays | DATA_MIGRATION | MEDIUM | P2 | PRODUCT_DECISION | api:agent | PRODUCT_DECISION |
| [ITEM-0053](../../docs/backlog/items/ITEM-0053-publish-privacy-policy-and-terms-for-the-public-landing-site.md) | Publish privacy policy and terms for the public landing site | PRODUCT_DECISION | MEDIUM | P2 | PRODUCT_DECISION | apps/landing | PRODUCT_DECISION |
| [ITEM-0076](../../docs/backlog/items/ITEM-0076-operators-cannot-recover-an-order-whose-stripe-webhook-never.md) | Operators cannot recover an order whose Stripe webhook never arrived | PRODUCT_DECISION | MEDIUM | P2 | PRODUCT_DECISION | api:billing, apps/admin | PRODUCT_DECISION |
| [ITEM-0079](../../docs/backlog/items/ITEM-0079-activation-does-not-gate-on-a-workspace-having-any-module-en.md) | Activation does not gate on a workspace having any module enabled | PRODUCT_DECISION | LOW | P3 | PRODUCT_DECISION | api:tenant-control-plane | PRODUCT_DECISION |
| [ITEM-0057](../../docs/backlog/items/ITEM-0057-landing-production-env-examples-still-name-the-vercel-and-re.md) | Landing production env examples still name the vercel and render hosts, not the dijipeople.com apex | PRODUCT_DECISION | — | P2 | PRODUCT_DECISION | apps/landing | PRODUCT_DECISION |
