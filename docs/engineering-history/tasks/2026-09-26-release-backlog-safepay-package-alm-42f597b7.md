# Engineering History — Release backlog safepay package alm

| | |
|---|---|
| **Task Title** | Release develop to main: ITEM-0215 fix, then backlog ITEM-0200/0201/0203/0204/0206, Safepay billing (SESSION-0108) and package ALM (TASK-0033) |
| **Task Type** | RELEASE (plus one INFRA fix, ITEM-0215) |
| **Date** | 2026-09-26 |
| **Architect Plan** | NOT_APPLICABLE — a release of work already integrated and CI-verified on develop, each part with its own record; ITEM-0215 is a scoped tooling fix |
| **Agents Used** | Architect (ITEM-0215, release checks, integration, deployment verification) acting as Release/DevOps and Integrator. Not used: other specialists — nothing new was built beyond ITEM-0215 |

## Git

| | |
|---|---|
| **Base Branch** | `origin/main` (`562dee91`) |
| **Task Branch** | `agent/item-0215-and-release` |
| **Base SHA** | `562dee918abc8633bca402ec68bf476e5d012a5f` |
| **Final Task SHA** | `42f597b7dbaae270aee362d7ab803a7d8854c6eb` |
| **Target Branch** | `main` |
| **Merge Commit** | `42f597b7` — PR #83 merged `develop` (`80610b88`) into `main` |
| **Final Target SHA** | `42f597b7dbaae270aee362d7ab803a7d8854c6eb`; `develop` fast-forwarded to it (this records commit follows through a `[skip render]` PR) |

### Commits

```
8f414c58 feat(platform): individual-partner party type, permission-based admin tiers, exact dashboard drill-downs
1c5876d3 docs(backlog): close ITEM-0203, ITEM-0204, ITEM-0206 with REG-630..632 and their QA scenarios
7866e11e chore(index): regenerate the component index for the ITEM-0203/0204/0206 source changes
60f4b5fd docs(history): close the ITEM-0203/0204/0206 backlog task (SESSION-0107)
ed7eb7e6 feat(runtime): refuse stale admin record edits with 409 instead of overwriting (ITEM-0201)
cccc0f34 docs(backlog): close ITEM-0201 with REG-633 and QA-PLATFORM-044; regenerate derived docs
5dda7524 test(api): e2e coverage for agreements and the partner/lead funnel (ITEM-0200)
fa2be8df fix(contracts): document-field saves follow the shared immutability rule (BUG-3668)
856747e7 docs(backlog): close ITEM-0200 and BUG-3668 (REG-634, QA-CONTRACT-014); file ITEM-0215
97b75ce6 docs(history): close the ITEM-0201/0200 backlog task (SESSION-0109)
aa2c507e feat(billing): Safepay for PKR alongside Stripe, with DijiPeople owning the subscription
254af088 docs(history): close the Safepay multi-provider billing task (SESSION-0108)
7a6c2855 feat(customization): WP-01 package ALM schema, migration and backfill (TASK-0033)
0b5b7e7d feat(customization): package ALM engine and API — release, export, staged import, uninstall (TASK-0033)
60c94e50 test(customization): DB-backed package ALM round trip; fix module demotion and release ordering (TASK-0033)
b5e971c9 fix(customization): refuse deleting a field, form or view another package's layer still names (TASK-0033, B3)
b4296862 feat(web): package lifecycle UI — release, versions, dependencies, deployments, environment, import wizard (TASK-0033)
d5289e0a fix(customization): browser-pass fixes — Default Customizations always present; accurate read-only state for installed packages (TASK-0033)
f1bccbb5 docs(TASK-0033): ADR-0022, package ALM architecture, bug and backlog records, QA scenario
c823ef5c chore(TASK-0033): order the package ALM migration after Safepay's; regenerate schema-derived artifacts
4523542e chore(TASK-0033): keep the API within its lint budget; regenerate component index and screen map
54fcac43 docs(TASK-0033): task progress WP-01..WP-07 done; plan divergences recorded
b55afdb2 chore(TASK-0033): regenerate the Engineering Control Center
a87d5a57 docs(TASK-0033): close the task — QA run, engineering history, module knowledge, session and task records
504c7438 docs(history): file TASK-0033's Obsidian sync result
80610b88 fix(tooling): verify-database runs on Windows; seed:demo no longer runs out of memory (ITEM-0215)
42f597b7 Release: backlog ITEM-0200/0201/0203/0204/0206/0215, Safepay billing, package ALM (#83)
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            504c7438 [develop]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75a [agent/agent-framework-hardening]
D:/My Work/hrm-dijipeople/dijipeople-admin-fx                   2ee22c79 [agent/reconcile-main-into-develop]
D:/My Work/hrm-dijipeople/dijipeople-admin-qa                   1b85b0b5 [agent/admin-console-e2e-qa]
D:/My Work/hrm-dijipeople/dijipeople-agent-os                   dc8c532b [agent/agent-operating-system]
D:/My Work/hrm-dijipeople/dijipeople-attendance-loc             2a1a1e06 [agent/attendance-location-capture]
D:/My Work/hrm-dijipeople/dijipeople-audit                      911be0fa [agent/full-technical-audit]
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0               7f5eacda [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-bugs                       953ab110 [agent/provisioning-ops-and-qa]
D:/My Work/hrm-dijipeople/dijipeople-ci-e2e                     b7382f00 [agent/ci-e2e-remediation]
D:/My Work/hrm-dijipeople/dijipeople-closeout                   caad4a56 [agent/closeout-sweep]
D:/My Work/hrm-dijipeople/dijipeople-db-coherence               3221625a [agent/db-coherence-postflight]
D:/My Work/hrm-dijipeople/dijipeople-depsec                     08b8661a [agent/lockfile-resolution-and-tar]
D:/My Work/hrm-dijipeople/dijipeople-global-remediation         423a7a8a [agent/global-remediation-program]
D:/My Work/hrm-dijipeople/dijipeople-integration-wp02           3f9063f5 (detached HEAD)
D:/My Work/hrm-dijipeople/dijipeople-monitoring                 c18b5024 [agent/prod-monitoring-triage]
D:/My Work/hrm-dijipeople/dijipeople-qa                         2df0e3a6 [agent/qa-verify-and-burndown]
D:/My Work/hrm-dijipeople/dijipeople-r2-storage                 2d86d506 [agent/r2-durable-storage]
D:/My Work/hrm-dijipeople/dijipeople-recon                      2d609724 [agent/record-state-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-record-reconciliation      03f30cb7 [agent/remediation-record-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-release                    9cd2f40f [agent/release-site-ux-and-admin]
D:/My Work/hrm-dijipeople/DijiPeople-relprep                    ead6638c [agent/develop-hygiene-and-release]
D:/My Work/hrm-dijipeople/dijipeople-remediation-authorization  257622ed [agent/dependency-and-desktop]
D:/My Work/hrm-dijipeople/DijiPeople-selfservice                d6aa7380 [agent/go-live-readiness]
D:/My Work/hrm-dijipeople/dijipeople-ux2                        c1d3d7b0 [agent/plans-reset]
D:/My Work/hrm-dijipeople/dp-plans-review                       516b6ede [agent/review-subscription-plans-screen]
D:/My Work/hrm-dijipeople/dp-release                            42f597b7 [agent/item-0215-and-release]
D:/My Work/hrm-dijipeople/dp-s1-openbugs                        6b87e8fa [agent/cs-s1-openbugs]
D:/My Work/hrm-dijipeople/dp-s10-pii                            484e44c4 [agent/cs-s10-pii]
D:/My Work/hrm-dijipeople/dp-s2-decisions                       3da4a860 [agent/cs-s2-decisions]
D:/My Work/hrm-dijipeople/dp-s3-itemsa                          7017d36f [agent/cs-s3-itemsa]
D:/My Work/hrm-dijipeople/dp-s4-itemsb                          1df6f9e8 [agent/cs-s4-itemsb]
D:/My Work/hrm-dijipeople/dp-s5-security                        eaf29471 [agent/cs-s5-security]
D:/My Work/hrm-dijipeople/dp-s6-triaged                         f3f0977b [agent/cs-s6-triaged]
D:/My Work/hrm-dijipeople/dp-s7-planbugs                        00a5058a [agent/cs-s7-planbugs]
D:/My Work/hrm-dijipeople/dp-s8-planitems                       7b197797 [agent/cs-s8-planitems]
D:/My Work/hrm-dijipeople/dp-s9-auditrecords                    7977a9fd [agent/cs-s9-auditrecords]
D:/My Work/hrm-dijipeople/dp-ux-findings                        b7bd1ca7 [agent/ux-findings-sweep]
D:/My Work/hrm-dijipeople/wt-landing-e2e                        004ee666 [agent/release-landing-e2e]
D:/My Work/hrm-dijipeople/wt-open-bug-sweep                     1003a2ac [agent/release-closeout]
```

### Files Changed

241 file(s) against `562dee91`.

```
M	.agent/context/component-index.md
M	.env.development.example
M	.env.example
M	.env.production.example
M	apps/admin/app/(internal)/billing/page.tsx
M	apps/admin/app/(internal)/settings/monitoring/error-logs/page.tsx
A	apps/admin/app/_components/billing/provider-payments-client.tsx
M	apps/admin/app/_components/dashboard/platform-dashboard.tsx
M	apps/admin/app/_components/runtime/runtime-record-page.tsx
A	apps/admin/app/api/super-admin/billing/provider-events/route.ts
A	apps/admin/app/api/super-admin/payments/[paymentId]/refund/route.ts
A	apps/admin/app/api/super-admin/payments/[paymentId]/verify/route.ts
D	apps/admin/app/api/super-admin/tenants/[tenantId]/status/route.ts
M	apps/admin/lib/runtime/platform-module-registry.ts
M	apps/web/app/(authenticated)/settings/billing/_components/billing-settings-client.tsx
M	apps/web/app/(authenticated)/settings/customization/_components/columns-management.tsx
M	apps/web/app/(authenticated)/settings/customization/_components/forms-management.tsx
M	apps/web/app/(authenticated)/settings/customization/_components/package-detail-shell.tsx
A	apps/web/app/(authenticated)/settings/customization/_components/package-import-wizard.tsx
A	apps/web/app/(authenticated)/settings/customization/_components/package-lifecycle-panels.tsx
M	apps/web/app/(authenticated)/settings/customization/_components/packages-list.tsx
M	apps/web/app/(authenticated)/settings/customization/_components/table-detail-shell.tsx
M	apps/web/app/(authenticated)/settings/customization/_components/tables-list.tsx
M	apps/web/app/(authenticated)/settings/customization/_components/views-management.tsx
M	apps/web/app/(authenticated)/settings/customization/_lib/customization-page-permissions.json
M	apps/web/app/(authenticated)/settings/customization/packages/[packageId]/page.tsx
A	apps/web/app/(authenticated)/settings/customization/packages/import/page.tsx
M	apps/web/app/(authenticated)/settings/customization/types.ts
A	apps/web/app/(authenticated)/settings/subscription/_components/payment-status-panel.tsx
M	apps/web/app/(authenticated)/settings/subscription/cancel/page.tsx
M	apps/web/app/(authenticated)/settings/subscription/success/page.tsx
A	apps/web/app/api/billing/invoices/[invoiceId]/pay/route.ts
A	apps/web/app/api/billing/payments/[paymentId]/route.ts
A	apps/web/app/api/billing/subscription/cancel/route.ts
A	apps/web/app/api/billing/subscription/resume/route.ts
M	apps/web/app/api/customization/[...path]/route.ts
A	apps/web/app/api/customization/package-imports/analyze/route.ts
A	apps/web/app/api/customization/packages/[packageId]/versions/[version]/artifact/route.ts
A	docs/architecture/customization-packages.md
M	docs/architecture/module-runtime-overhaul.md
M	docs/architecture/partners.md
M	docs/architecture/rbac.md
M	docs/backlog/blocked.md
M	docs/backlog/completed.md
M	docs/backlog/deferred.md
M	docs/backlog/index.md
M	docs/backlog/items/ITEM-0184-employee-record-and-customization-usability-defects-found-in.md
M	docs/backlog/items/ITEM-0186-the-form-designer-palette-adds-a-field-on-click-only-and-dra.md
M	docs/backlog/items/ITEM-0188-custom-module-screens-ignore-the-module-s-published-action-b.md
M	docs/backlog/items/ITEM-0195-the-legacy-publish-snapshot-shape-can-expose-a-never-publish.md
M	docs/backlog/items/ITEM-0200-agreements-have-no-end-to-end-test-coverage-and-partners-lea.md
M	docs/backlog/items/ITEM-0201-platform-runtime-edits-ignore-the-record-version-so-concurre.md
M	docs/backlog/items/ITEM-0203-an-individual-partner-s-agreement-still-records-the-counterp.md
M	docs/backlog/items/ITEM-0204-adr-0018-follow-ups-platform-role-literal-tier-checks-and-th.md
M	docs/backlog/items/ITEM-0206-admin-dashboard-drill-downs-for-active-users-failed-sign-ins.md
A	docs/backlog/items/ITEM-0209-confirm-the-safepay-refund-request-body-and-webhook-signing-.md
A	docs/backlog/items/ITEM-0210-decide-when-pkr-checkout-moves-to-safepay-and-what-happens-t.md
A	docs/backlog/items/ITEM-0211-safepay-renewal-invoices-are-issued-but-never-emailed-to-the.md
A	docs/backlog/items/ITEM-0212-public-signup-offers-no-promotion-code-field-for-safepay-rou.md
A	docs/backlog/items/ITEM-0213-mid-period-seat-increases-on-a-safepay-subscription-are-not-.md
A	docs/backlog/items/ITEM-0214-flipping-safepay-enabled-while-a-pkr-stripe-checkout-is-open.md
A	docs/backlog/items/ITEM-0215-scripts-verify-database-mjs-cannot-run-on-windows-and-seed-d.md
A	docs/backlog/items/ITEM-0216-connection-references-for-customization-packages.md
A	docs/backlog/items/ITEM-0217-platform-admin-read-only-view-of-tenant-package-installation.md
A	docs/backlog/items/ITEM-0218-carry-module-views-navigation-workflows-and-reports-in-custo.md
A	docs/backlog/items/ITEM-0219-package-cli-and-a-ci-pipeline-step-for-validate-export-and-i.md
A	docs/backlog/items/ITEM-0220-publisher-signing-for-customization-package-artifacts.md
M	docs/backlog/open.md
M	docs/backlog/product-decisions.md
A	docs/billing/safepay.md
M	docs/bugs/BUG-1546-required-fields-on-unfocused-tabs-give-no-indication-of-wher.md
M	docs/bugs/BUG-3141-branding-svg-served-unauthenticated-and-inline-enabled-store.md
M	docs/bugs/BUG-3231-whole-modules-have-no-audit-trail-contracts-31-mutating-endp.md
M	docs/bugs/BUG-3374-settings-customization-and-its-twelve-child-routes-silently-.md
M	docs/bugs/BUG-3491-customization-pages-crash-for-a-user-who-holds-customization.md
M	docs/bugs/BUG-3492-every-custom-field-type-without-a-length-is-rejected-with-ma.md
M	docs/bugs/BUG-3493-publishing-customizations-dead-ends-because-new-drafts-land-.md
M	docs/bugs/BUG-3494-a-published-custom-module-has-no-sidebar-entry-and-no-list-f.md
M	docs/bugs/BUG-3495-customization-editors-accept-invalid-metadata-and-silently-r.md
A	docs/bugs/BUG-3668-saving-agreement-document-fields-skips-the-shared-immutabili.md
A	docs/bugs/BUG-3697-a-custom-field-added-to-a-system-module-has-nowhere-to-store.md
A	docs/bugs/BUG-3698-draft-edits-to-custom-fields-take-effect-before-they-are-pub.md
A	docs/bugs/BUG-3699-deleting-a-field-form-or-view-ignored-references-held-in-oth.md
A	docs/bugs/BUG-3700-any-signed-in-user-can-read-the-full-published-customization.md
A	docs/bugs/BUG-3701-platform-scope-customization-packages-are-not-unique-by-key.md
A	docs/bugs/BUG-3702-adding-a-field-to-a-package-s-own-custom-module-demoted-the-.md
A	docs/bugs/BUG-3703-package-export-readiness-could-never-report-a-missing-depend.md
A	docs/bugs/BUG-3704-settings-pages-scroll-horizontally-at-phone-width-again.md
A	docs/bugs/BUG-3705-package-sub-page-breadcrumbs-end-in-a-second-packages-instea.md
A	docs/decisions/ADR-0022-customization-packages-are-the-alm-unit.md
M	docs/decisions/README.md
A	docs/engineering-history/tasks/2026-09-26-backlog-0201-0200-856747e7.md
A	docs/engineering-history/tasks/2026-09-26-backlog-0203-0204-0206-7866e11e.md
A	docs/engineering-history/tasks/2026-09-26-billing-safepay-provider-aa2c507e.md
A	docs/engineering-history/tasks/2026-09-26-task-0033-package-alm-b55afdb2.md
M	docs/environment-variables.md
M	docs/knowledge/architecture/screen-map.md
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/DijiPeople Product Dashboard.md
M	docs/knowledge/dashboards/Engineering Control Center.md
M	docs/knowledge/data-model/domain-map.md
M	docs/knowledge/data-model/entity-customer-account.md
M	docs/knowledge/data-model/entity-subscription.md
M	docs/knowledge/data-model/entity-tenant.md
M	docs/knowledge/modules/billing.md
A	docs/knowledge/modules/customization.md
A	docs/plans/EXECPLAN-0052-package-alm.md
M	docs/qa/coverage-matrix.md
M	docs/qa/regressions/index.md
A	docs/qa/runs/2026-09-26-safepay-multi-provider-billing-562dee9.md
A	docs/qa/runs/2026-09-26-task-0033-package-alm-b55afdb.md
A	docs/qa/scenarios/QA-AUTHZ-019-platform-administrator-tiers-are-held-by-exactly-the-intende.md
A	docs/qa/scenarios/QA-BILLING-038-a-safepay-payment-activates-a-subscription-only-on-the-provi.md
A	docs/qa/scenarios/QA-BILLING-039-concurrent-confirmations-of-one-safepay-payment-credit-it-ex.md
A	docs/qa/scenarios/QA-BILLING-040-a-forged-tampered-or-replayed-safepay-webhook-changes-nothin.md
A	docs/qa/scenarios/QA-BILLING-041-pkr-routes-to-safepay-only-while-safepay-is-enabled-and-ever.md
A	docs/qa/scenarios/QA-BILLING-042-a-dijipeople-billed-subscription-moves-through-grace-expiry-.md
A	docs/qa/scenarios/QA-BILLING-043-a-safepay-checkout-is-priced-on-the-server-and-a-fixed-coupo.md
A	docs/qa/scenarios/QA-BILLING-044-a-renewal-paid-or-a-cancellation-revoked-while-the-billing-s.md
A	docs/qa/scenarios/QA-CONTRACT-013-an-individual-partner-s-agreement-records-an-individual-coun.md
A	docs/qa/scenarios/QA-CONTRACT-014-changing-a-document-field-on-an-executed-agreement-is-refuse.md
A	docs/qa/scenarios/QA-PLATFORM-043-the-dashboard-s-errors-needing-attention-tile-opens-a-list-m.md
A	docs/qa/scenarios/QA-PLATFORM-044-a-stale-admin-record-edit-is-refused-instead-of-overwriting-.md
A	docs/qa/scenarios/QA-SETTINGS-033-customization-package-moves-dev-to-uat-release-export-staged.md
M	docs/qa/scenarios/index.md
M	docs/qa/test-plans/PLAN-002-authorization.md
M	docs/qa/test-plans/PLAN-015-legal.md
M	docs/qa/test-plans/PLAN-019-platform-admin.md
M	docs/qa/test-plans/PLAN-020-billing.md
M	docs/qa/test-plans/PLAN-021-settings.md
M	docs/qa/test-plans/PLAN-030-monitoring.md
M	docs/qa/test-plans/index.md
M	docs/sessions/SESSION-0101-review-and-file-eight-ui-ux-and-settings-findings-from-demo-.md
M	docs/sessions/SESSION-0103-implement-the-34-open-records-from-sessions-0099-0102.md
M	docs/sessions/SESSION-0104-release-promote-the-session-0103-records-to-production.md
A	docs/sessions/SESSION-0107-backlog-item-0203-individual-party-type-item-0204-platform-p.md
A	docs/sessions/SESSION-0108-multi-provider-billing-safepay-for-pkr-alongside-stripe.md
A	docs/sessions/SESSION-0109-backlog-item-0201-runtime-optimistic-concurrency-item-0200-c.md
A	docs/sessions/SESSION-0110-package-alm-versions-portable-artifact-staged-import-upgrade.md
A	docs/sessions/SESSION-0111-release-develop-to-main-item-0215-then-full-release-of-item-.md
M	docs/sessions/active.md
M	docs/sessions/completed.md
M	docs/sessions/index.md
M	docs/tasks/TASK-0030-implement-the-34-open-records-from-sessions-0099-0102.md
M	docs/tasks/TASK-0031-demo-walkthrough-2-remediation-hierarchy-work-sites-customiz.md
A	docs/tasks/TASK-0033-package-alm-versions-portable-artifact-staged-import-upgrade.md
M	docs/tasks/completed.md
M	docs/tasks/index.md
M	docs/tasks/remediation/TASK-0005-inventory.json
M	packages/config/platform-runtime-schema.generated.json
M	render.yaml
M	scripts/verify-database.mjs
M	services/api/package.json
A	services/api/prisma/migrations/20260926120000_payment_provider_and_safepay/migration.sql
A	services/api/prisma/migrations/20260926180000_customization_package_alm/migration.sql
M	services/api/prisma/schema.prisma
M	services/api/prisma/seed-config.ts
M	services/api/src/common/constants/audit-actions.ts
M	services/api/src/common/constants/permissions.ts
M	services/api/src/common/constants/rbac-matrix.ts
M	services/api/src/common/errors/error-catalog.ts
M	services/api/src/common/guards/public-write-rate-limit.invariant.spec.ts
A	services/api/src/common/security/tenant-entitlement.rule.spec.ts
M	services/api/src/common/security/tenant-entitlement.rule.ts
M	services/api/src/common/security/tenant-entitlement.service.ts
M	services/api/src/common/storage/upload-limits.ts
M	services/api/src/main.ts
M	services/api/src/modules/billing/billing-seat-pricing.ts
M	services/api/src/modules/billing/billing.module.ts
M	services/api/src/modules/billing/controllers/billing.controller.ts
M	services/api/src/modules/billing/controllers/public-billing.controller.ts
A	services/api/src/modules/billing/controllers/safepay-webhook.controller.spec.ts
A	services/api/src/modules/billing/controllers/safepay-webhook.controller.ts
A	services/api/src/modules/billing/managed-billing.rules.spec.ts
A	services/api/src/modules/billing/managed-billing.rules.ts
A	services/api/src/modules/billing/promotion-evaluation.spec.ts
M	services/api/src/modules/billing/promotion-pricing.ts
A	services/api/src/modules/billing/providers/payment-gateway.ts
A	services/api/src/modules/billing/providers/payment-gateways.ts
A	services/api/src/modules/billing/providers/payment-provider.resolver.spec.ts
A	services/api/src/modules/billing/providers/payment-provider.resolver.ts
A	services/api/src/modules/billing/providers/safepay.gateway.spec.ts
A	services/api/src/modules/billing/providers/safepay.gateway.ts
M	services/api/src/modules/billing/services/billing-price-market-scoping.spec.ts
M	services/api/src/modules/billing/services/billing.service.ts
M	services/api/src/modules/billing/services/checkout-draft-id-reaches-the-order.spec.ts
A	services/api/src/modules/billing/services/managed-billing.worker.ts
A	services/api/src/modules/billing/services/managed-checkout.service.spec.ts
A	services/api/src/modules/billing/services/managed-checkout.service.ts
A	services/api/src/modules/billing/services/managed-renewal.service.spec.ts
A	services/api/src/modules/billing/services/managed-renewal.service.ts
M	services/api/src/modules/billing/services/order-activation.service.ts
A	services/api/src/modules/billing/services/payment-settlement.service.spec.ts
A	services/api/src/modules/billing/services/payment-settlement.service.ts
M	services/api/src/modules/billing/services/plan-change.service.ts
M	services/api/src/modules/billing/services/stripe-billing.service.ts
M	services/api/src/modules/billing/services/subscription-order.service.ts
M	services/api/src/modules/billing/services/webhook.service.ts
M	services/api/src/modules/contracts/contracts.agreement-immutability.spec.ts
M	services/api/src/modules/contracts/contracts.partner-source.spec.ts
M	services/api/src/modules/contracts/contracts.service.ts
M	services/api/src/modules/customization/customization-publish-and-metadata.spec.ts
M	services/api/src/modules/customization/customization-web-gate.seam.spec.ts
M	services/api/src/modules/customization/customization.module.ts
M	services/api/src/modules/customization/customization.service.ts
A	services/api/src/modules/customization/dto/package-alm.dto.ts
A	services/api/src/modules/customization/package-alm.controller.ts
A	services/api/src/modules/customization/package-alm.service.ts
A	services/api/src/modules/customization/package-artifact.spec.ts
A	services/api/src/modules/customization/package-artifact.ts
A	services/api/src/modules/customization/package-comparison.spec.ts
A	services/api/src/modules/customization/package-comparison.ts
A	services/api/src/modules/customization/package-kind.ts
A	services/api/src/modules/customization/package-portable.reader.ts
M	services/api/src/modules/leads/leads.service.ts
M	services/api/src/modules/partners/partner-type-policy.ts
A	services/api/src/modules/platform-auth/platform-admin-tier.spec.ts
M	services/api/src/modules/platform-auth/platform-permissions.spec.ts
M	services/api/src/modules/platform-auth/platform-permissions.ts
A	services/api/src/modules/platform-monitoring/open-incident-view.spec.ts
M	services/api/src/modules/platform-monitoring/platform-monitoring.service.ts
M	services/api/src/modules/platform-runtime/platform-runtime.service.ts
A	services/api/src/modules/platform-runtime/runtime-stale-update.spec.ts
M	services/api/src/modules/super-admin/billing.service.ts
A	services/api/src/modules/super-admin/dto/refund-provider-payment.dto.ts
D	services/api/src/modules/super-admin/dto/update-tenant-status.dto.ts
M	services/api/src/modules/super-admin/operations-dashboard.service.ts
M	services/api/src/modules/super-admin/platform-lifecycle.service.ts
M	services/api/src/modules/super-admin/platform-onboarding.service.ts
M	services/api/src/modules/super-admin/provisioning-requested.handler.ts
M	services/api/src/modules/super-admin/super-admin.controller.ts
M	services/api/src/modules/super-admin/super-admin.service.ts
M	services/api/src/modules/tenant-control-plane/tenant-control-plane.guard.ts
M	services/api/src/modules/tenant-control-plane/tenant-erasure.constants.ts
M	services/api/src/modules/tenant-settings/feature-access.service.ts
A	services/api/test/contracts-agreements.e2e-spec.ts
A	services/api/test/customization-package-alm.e2e-spec.ts
A	services/api/test/helpers/http-actors.ts
A	services/api/test/managed-payment-settlement.e2e-spec.ts
A	services/api/test/partner-lead-funnel.e2e-spec.ts
M	services/api/test/payment-authorised-provisioning.e2e-spec.ts
```

## Conflicts

None. `main` (`562dee91`) was an ancestor of `develop`, so the merge was conflict-free and the merged tree equals `develop`'s.

Write `None.` if the merge was clean. Do not omit the section.

## Conflict Resolutions

None — no conflicts.

## QA

| | |
|---|---|
| **QA Report** | No new QA run; each released part carries its own (SESSION-0107, SESSION-0109, SESSION-0108, TASK-0033 records). ITEM-0215 verified on Windows against a throwaway database |
| **Bug IDs** | None created or closed by the release itself |
| **Backlog Items** | Closed DONE: ITEM-0215 |

## CI

| | |
|---|---|
| **CI Run ID** | 36256315856 (push) and 36257103425 (pull_request) on `80610b88`, the SHA merged by PR #83 |
| **CI Result** | PASS — `CI required gate` green on the exact merged head |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

The merged tree equals `develop` at `80610b88`, which passed the full CI gate twice (push and pull_request), including Database e2e and Browser e2e. Post-deploy: `/api/health` commit `42f597b`; `/api/public/legal` and `/api/public/commercial-config` 200; admin, app and www login/home pages 200; the retired `PATCH /super-admin/tenants/:tenantId/status` returns 404.

## Release / Deployment Impact

Deployed to production. Render deploy of `42f597b7`: build, pre-deploy `release` (migrate deploy + seeds) and update all succeeded; live. Migrations applied and not rolled back: `20260926120000_payment_provider_and_safepay`, `20260926180000_customization_package_alm`. Vercel web, admin and landing READY on `42f597b7`. Pre-release: last deploy live, database-backed endpoints 200 (Neon quota incident ITEM-0208 not recurring). Safepay stays off (`SAFEPAY_ENABLED` unset). Rollback class: code revert; both migrations additive (package ALM backfill idempotent).

## Knowledge Capture

Nothing durable beyond the records; the Safepay and package ALM knowledge was captured by their own tasks.

## Obsidian Sync

Ran `knowledge:sync` and `knowledge:verify` at `42f597b7` before filing this record; verify reported only the pre-existing problems, none from this release's records.

## Cleanup

Worktree `dp-release` removed with `npm run worktree:remove` and branch `agent/item-0215-and-release` deleted after this records commit is integrated; the throwaway database `dijipeople_item0215_test` was dropped.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[ADR-0022]] · [[BUG-1546]] · [[BUG-3141]] · [[BUG-3231]] · [[BUG-3374]] · [[BUG-3491]] · [[BUG-3492]] · [[BUG-3493]] · [[BUG-3494]] · [[BUG-3495]] · [[BUG-3668]] · [[BUG-3697]] · [[BUG-3698]] · [[BUG-3699]] · [[BUG-3700]] · [[BUG-3701]] · [[BUG-3702]] · [[BUG-3703]] · [[BUG-3704]] · [[BUG-3705]] · [[ITEM-0184]] · [[ITEM-0186]] · [[ITEM-0188]] · [[ITEM-0195]] · [[ITEM-0200]] · [[ITEM-0201]] · [[ITEM-0203]] · [[ITEM-0204]] · [[ITEM-0206]] · [[ITEM-0208]] · [[ITEM-0209]] · [[ITEM-0210]] · [[ITEM-0211]] · [[ITEM-0212]] · [[ITEM-0213]] · [[ITEM-0214]] · [[ITEM-0215]] · [[ITEM-0216]] · [[ITEM-0217]] · [[ITEM-0218]] · [[ITEM-0219]] · [[ITEM-0220]] · [[PLAN-002]] · [[PLAN-015]] · [[PLAN-019]] · [[PLAN-020]] · [[PLAN-021]] · [[PLAN-030]] · [[QA-AUTHZ-019]] · [[QA-BILLING-038]] · [[QA-BILLING-039]] · [[QA-BILLING-040]] · [[QA-BILLING-041]] · [[QA-BILLING-042]] · [[QA-BILLING-043]] · [[QA-BILLING-044]] · [[QA-CONTRACT-013]] · [[QA-CONTRACT-014]] · [[QA-PLATFORM-043]] · [[QA-PLATFORM-044]] · [[QA-SETTINGS-033]] · [[SESSION-0101]] · [[SESSION-0103]] · [[SESSION-0104]] · [[SESSION-0107]] · [[SESSION-0108]] · [[SESSION-0109]] · [[SESSION-0110]] · [[SESSION-0111]] · [[TASK-0005]] · [[TASK-0030]] · [[TASK-0031]] · [[TASK-0033]]

<!-- GRAPH:END -->
