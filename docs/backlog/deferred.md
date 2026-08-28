# Deferred

> **Generated file — do not edit by hand.** Rebuild with `node scripts/rebuild-backlog.mjs`.

Deliberately not now, with a reason. Deferring is a legitimate disposition —
silently dropping is not.

A `CRITICAL` record may never appear here: the Architect must choose `FIX_NOW`
or `BLOCKED_EXTERNAL` with an explicit reason. See
[`.agent/agents/architect.md`](../../.agent/agents/architect.md).

## Deferred records

| ID | Title | Type | Severity | Priority | Status | Affected | Architect |
|---|---|---|---|---|---|---|---|
| [BUG-1543](../../docs/bugs/BUG-1543-stripe-webhook-rejected-as-validation-failed-during-a-live-p.md) | Stripe webhook rejected as VALIDATION_FAILED during a live payment | INTEGRATION | HIGH | P1 | DEFERRED | billing | DEFER |
| [BUG-0084](../../docs/bugs/BUG-0084-seven-unique-constraints-in-schema-prisma-are-absent-from-th.md) | Seven unique constraints in schema.prisma are absent from the migration chain | DATA_INTEGRITY | MEDIUM | P2 | DEFERRED | contracts, partner-experience, support-cases, approvals, tenant-settings | DEFER |
| [BUG-1548](../../docs/bugs/BUG-1548-customer-onboarding-validate-accepts-payloads-that-create-re.md) | Customer onboarding validate accepts payloads that create rejects | BUG | MEDIUM | P2 | DEFERRED | onboarding | DEFER |
| [BUG-1668](../../docs/bugs/BUG-1668-tenant-workspace-pages-scroll-horizontally-at-mobile-width.md) | Tenant workspace pages scroll horizontally at mobile width | UX | MEDIUM | P2 | DEFERRED | views | DEFER |
| [ITEM-0054](../../docs/backlog/items/ITEM-0054-contract-placeholder-examples-fabricate-a-saudi-legal-entity.md) | Contract placeholder examples fabricate a Saudi legal entity, CR number and tax ID | DOCUMENTATION | MEDIUM | P2 | DEFERRED | contracts | DEFER |
| [ITEM-0055](../../docs/backlog/items/ITEM-0055-database-e2e-runs-serially-and-now-dominates-its-own-job.md) | Database e2e runs serially and now dominates its own job | PERFORMANCE | MEDIUM | P2 | DEFERRED | api, ci | DEFER |
| [ITEM-0060](../../docs/backlog/items/ITEM-0060-schema-prisma-and-the-applied-migration-history-do-not-agree.md) | schema.prisma and the applied migration history do not agree | TECH_DEBT | MEDIUM | P2 | DEFERRED | prisma, timesheets, attendance, payroll, billing | DEFER |
| [ITEM-0073](../../docs/backlog/items/ITEM-0073-agent-role-names-are-spelled-inconsistently-across-bug-and-t.md) | Agent role names are spelled inconsistently across bug and task records | TECH_DEBT | MEDIUM | P2 | DEFERRED | framework | DEFER |
| [ITEM-0070](../../docs/backlog/items/ITEM-0070-move-the-excel-write-path-off-xlsx-and-drop-the-dependency.md) | Move the Excel write path off xlsx and drop the dependency | SECURITY | LOW | P2 | DEFERRED | payroll, timesheets | DEFER |
| [ITEM-0087](../../docs/backlog/items/ITEM-0087-stripe-api-version-is-commented-out-in-the-local-api-env-and.md) | STRIPE_API_VERSION is commented out in the local API env and documented with two different values | DOCUMENTATION | LOW | P2 | DEFERRED | services/api | DEFER |
| [ITEM-0088](../../docs/backlog/items/ITEM-0088-npm-workspace-api-run-start-dev-always-frees-port-4000-regar.md) | npm --workspace api run start:dev always frees port 4000 regardless of PORT, killing any other API instance | TECH_DEBT | LOW | P2 | DEFERRED | services/api | DEFER |
| [ITEM-0089](../../docs/backlog/items/ITEM-0089-the-contact-form-is-the-only-public-lead-creating-form-with-.md) | The contact form is the only public lead-creating form with no honeypot | SECURITY | LOW | P2 | DEFERRED | apps/landing | DEFER |
| [ITEM-0098](../../docs/backlog/items/ITEM-0098-753-of-846-shared-frontend-exports-carry-no-doc-comment.md) | 753 of 846 shared frontend exports carry no doc-comment | DOCUMENTATION | LOW | P2 | DEFERRED | admin, web | DEFER |
| [ITEM-0056](../../docs/backlog/items/ITEM-0056-ci-cache-hit-rate-is-not-observable-from-the-actions-rest-ap.md) | CI cache hit rate is not observable from the Actions REST API | INFRA | LOW | P3 | DEFERRED | ci | DEFER |
| [ITEM-0061](../../docs/backlog/items/ITEM-0061-notification-coverage-is-asymmetric-seat-change-applied-and-.md) | Notification coverage is asymmetric — SEAT_CHANGE_APPLIED and SUBSCRIPTION_TERMINATED notify nobody | FOLLOW_UP | LOW | P3 | DEFERRED | notifications, billing | DEFER |
| [ITEM-0064](../../docs/backlog/items/ITEM-0064-unscoped-duplicate-planprice-rows-shadow-every-real-price.md) | Unscoped duplicate PlanPrice rows shadow every real price | TECH_DEBT | LOW | P3 | DEFERRED | billing, super-admin | DEFER |
| [ITEM-0065](../../docs/backlog/items/ITEM-0065-two-e2e-suites-still-borrow-a-customeraccount-which-is-what-.md) | Two e2e suites still borrow a CustomerAccount, which is what blocks parallel execution | TEST_GAP | LOW | P3 | DEFERRED | services/api/test | DEFER |
| [ITEM-0066](../../docs/backlog/items/ITEM-0066-verify-database-mjs-cannot-spawn-npm-on-windows.md) | verify-database.mjs cannot spawn npm on Windows | TECH_DEBT | LOW | P3 | DEFERRED | scripts | DEFER |
| [ITEM-0072](../../docs/backlog/items/ITEM-0072-six-published-self-service-prices-with-no-market-and-a-zero-.md) | Six published self-service prices with no market and a zero amount exist on every database | TECH_DEBT | LOW | P3 | DEFERRED | billing, super-admin | DEFER |
| [ITEM-0082](../../docs/backlog/items/ITEM-0082-contract-phase-drop-the-inert-plan-ispublic-column.md) | Contract phase: drop the inert Plan.isPublic column | DATA_MIGRATION | LOW | P3 | DEFERRED | services/api/prisma, api:billing | DEFER |
| [ITEM-0083](../../docs/backlog/items/ITEM-0083-scheduled-reconciliation-sweep-for-orders-stuck-awaiting-pay.md) | Scheduled reconciliation sweep for orders stuck awaiting payment | FOLLOW_UP | LOW | P3 | DEFERRED | api:billing | DEFER |
| [ITEM-0099](../../docs/backlog/items/ITEM-0099-sync-obsidian-does-not-map-docs-plans-so-every-execplan-wiki.md) | sync-obsidian does not map docs/plans, so every ExecPlan wikilink is an orphan | DOCUMENTATION | LOW | P3 | DEFERRED | scripts | DEFER |
| [ITEM-0101](../../docs/backlog/items/ITEM-0101-mailerservice-silently-logs-instead-of-sending-and-nothing-u.md) | MailerService silently logs instead of sending, and nothing uses it | TECH_DEBT | — | P2 | DEFERRED | services/api/src/common/mailer | DEFER |
| [ITEM-0102](../../docs/backlog/items/ITEM-0102-move-switch-workspace-into-the-avatar-menu.md) | Move Switch workspace into the avatar menu | UX | — | P2 | DEFERRED | views | DEFER |
| [ITEM-0058](../../docs/backlog/items/ITEM-0058-next-env-d-ts-churns-between-dev-and-build-forms-and-the-fou.md) | next-env.d.ts churns between dev and build forms and the four apps disagree | TECH_DEBT | — | P3 | DEFERRED | apps/landing, apps/web, apps/admin | DEFER |
| [ITEM-0059](../../docs/backlog/items/ITEM-0059-49-tracked-text-files-have-no-final-newline-and-nothing-enfo.md) | 49 tracked text files have no final newline, and nothing enforces one | TECH_DEBT | — | P3 | DEFERRED | apps/admin, apps/web, apps/agent-desktop | DEFER |
