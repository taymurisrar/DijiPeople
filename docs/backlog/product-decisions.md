# Open Product Decisions

> **Generated file — do not edit by hand.** Rebuild with `node scripts/rebuild-backlog.mjs`.

Records where the engineering behaviour is understood but the **correct product**
**behaviour is not decided**. These are questions for a human, not tasks for an
agent, and no agent may resolve one by guessing.

Each states the question, the options and what each option costs.

## Awaiting a product decision

| ID | Title | Type | Severity | Priority | Status | Affected | Architect |
|---|---|---|---|---|---|---|---|
| [ITEM-0131](../../docs/backlog/items/ITEM-0131-production-hr-and-payroll-data-has-no-backup-the-database-is.md) | Production HR and payroll data has no backup: the database is on the Neon free plan | INFRA | CRITICAL | P0 | PRODUCT_DECISION | services/api | PRODUCT_DECISION |
| [BUG-3178](../../docs/bugs/BUG-3178-no-malware-scanning-exists-anywhere-the-tenant-setting-that-.md) | No malware scanning exists anywhere; the tenant setting that claims it does is inert | SECURITY | HIGH | P1 | PRODUCT_DECISION | services/api/src/common | PRODUCT_DECISION |
| [BUG-3180](../../docs/bugs/BUG-3180-the-render-service-cannot-be-rebuilt-from-the-repository-sev.md) | The Render service cannot be rebuilt from the repository: seven boot-required env vars are absent from render.yaml | INFRA | HIGH | P1 | PRODUCT_DECISION | render.yaml | PRODUCT_DECISION |
| [BUG-3181](../../docs/bugs/BUG-3181-single-environment-no-staging-one-neon-branch-one-stripe-acc.md) | Single environment: no staging, one Neon branch, one Stripe account, one email sender, and demo data in production | INFRA | HIGH | P1 | PRODUCT_DECISION | docs/deployment | PRODUCT_DECISION |
| [BUG-3182](../../docs/bugs/BUG-3182-no-per-tenant-restore-is-possible-restoring-one-tenant-means.md) | No per-tenant restore is possible: restoring one tenant means rolling back all of them | INFRA | HIGH | P1 | PRODUCT_DECISION | api:tenants | PRODUCT_DECISION |
| [ITEM-0132](../../docs/backlog/items/ITEM-0132-no-multi-factor-authentication-exists-anywhere-including-for.md) | No multi-factor authentication exists anywhere, including for platform super admins | SECURITY | HIGH | P2 | PRODUCT_DECISION | api:auth | PRODUCT_DECISION |
