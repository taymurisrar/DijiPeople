# Engineering History — Open bug sweep

| | |
|---|---|
| **Task Title** | Open bug sweep |
| **Task Type** | BUGFIX |
| **Date** | 2026-08-28 |
| **Architect Plan** | NOT_APPLICABLE — no single change met the PLANS.md threshold. The two that would have (BUG-0015's provisioning rewrite, BUG-0084's unique-index migration) were deliberately not implemented; see Release / Deployment Impact. |
| **Agents Used** | None. The user's standing instruction for this session is not to call the Agent tool unless asked, so the work was done in one context rather than delegated. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/open-bug-sweep` |
| **Base SHA** | `1b85b0b5acfbfd6353843fe95740c21675733256` |
| **Final Task SHA** | `cd4edb863297450f25ccd1d5af3f5da25e0b0b2b` |
| **Target Branch** | `develop` |
| **Merge Commit** | None — integrated by ref-push, so `develop`'s tip is the CI-verified SHA itself rather than a merge above it. |
| **Final Target SHA** | `cd4edb863297450f25ccd1d5af3f5da25e0b0b2b` |

### Commits

```
37a0db54 fix(web): BUG-1644 verified fixed in production, and the reasoning corrected
912f4e61 docs(handoff): browser QA after the release, and what it must not assume
454e4349 docs(qa): the admin console cannot create a lead or edit a customer
b6ef6ec0 docs(qa): a fix scoped to one module, behind a test shaped like that module
d78f0fc4 docs(qa): the paid signups were test-mode, so BUG-0903 is live not stale
1b85b0b5 docs(history): close the admin console QA session
1c0f6b79 fix(admin): the runtime form and the API stop disagreeing about what a write accepts
79f313fc fix(billing): subscriptions, plans and promotions stop lying about their own state
fb67698b fix(admin): screens stop telling operators things that are not true
af8b5bc1 fix(a11y): the shells stop owning structure the pages own, and forms get labels
53db392b fix(admin): six screens stop presenting values they cannot stand behind
fd73257d fix(admin): commercial terms are published deliberately, and a zero says which kind it is
78aeadbd fix: two stale premises measured, two hydration mismatches, and a way back out
7f03da08 fix(leads): withdraw bulk delete, and record two fixes that were already done
cd4edb86 fix(billing): a rejected Stripe webhook says which check refused it
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            cd4edb86 [develop]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75a [agent/agent-framework-hardening]
D:/My Work/hrm-dijipeople/dijipeople-admin-qa                   1b85b0b5 [agent/admin-console-e2e-qa]
D:/My Work/hrm-dijipeople/dijipeople-agent-os                   dc8c532b [agent/agent-operating-system]
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0               7f5eacda [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-bugs                       953ab110 [agent/provisioning-ops-and-qa]
D:/My Work/hrm-dijipeople/dijipeople-ci-e2e                     b7382f00 [agent/ci-e2e-remediation]
D:/My Work/hrm-dijipeople/dijipeople-db-coherence               3221625a [agent/db-coherence-postflight]
D:/My Work/hrm-dijipeople/dijipeople-depsec                     08b8661a [agent/lockfile-resolution-and-tar]
D:/My Work/hrm-dijipeople/dijipeople-global-remediation         423a7a8a [agent/global-remediation-program]
D:/My Work/hrm-dijipeople/dijipeople-integration-wp02           3f9063f5 (detached HEAD)
D:/My Work/hrm-dijipeople/dijipeople-qa                         2df0e3a6 [agent/qa-verify-and-burndown]
D:/My Work/hrm-dijipeople/dijipeople-recon                      2d609724 [agent/record-state-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-record-reconciliation      03f30cb7 [agent/remediation-record-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-release                    9cd2f40f [agent/release-site-ux-and-admin]
D:/My Work/hrm-dijipeople/DijiPeople-relprep                    ead6638c [agent/develop-hygiene-and-release]
D:/My Work/hrm-dijipeople/dijipeople-remediation-authorization  257622ed [agent/dependency-and-desktop]
D:/My Work/hrm-dijipeople/DijiPeople-selfservice                d6aa7380 [agent/go-live-readiness]
D:/My Work/hrm-dijipeople/dijipeople-ux2                        c1d3d7b0 [agent/plans-reset]
D:/My Work/hrm-dijipeople/wt-landing-e2e                        004ee666 [agent/release-landing-e2e]
D:/My Work/hrm-dijipeople/wt-open-bug-sweep                     cd4edb86 [agent/open-bug-sweep]
```

### Files Changed

280 file(s) against `origin/main`.

```
M	.agent/context/component-index.md
M	.github/workflows/ci.yml
M	apps/admin/app/(internal)/account-settings/page.tsx
M	apps/admin/app/(internal)/billing/page.tsx
M	apps/admin/app/(internal)/billing/webhooks/page.tsx
M	apps/admin/app/(internal)/commissions/[commissionId]/page.tsx
M	apps/admin/app/(internal)/commissions/page.tsx
M	apps/admin/app/(internal)/contract-templates/[templateId]/page.tsx
M	apps/admin/app/(internal)/contract-templates/new/page.tsx
M	apps/admin/app/(internal)/contract-templates/page.tsx
M	apps/admin/app/(internal)/contracts/[contractId]/page.tsx
M	apps/admin/app/(internal)/contracts/new/page.tsx
M	apps/admin/app/(internal)/contracts/page.tsx
M	apps/admin/app/(internal)/customers/[customerAccountId]/page.tsx
M	apps/admin/app/(internal)/customers/new/page.tsx
M	apps/admin/app/(internal)/customers/page.tsx
M	apps/admin/app/(internal)/invoices/[invoiceId]/page.tsx
M	apps/admin/app/(internal)/invoices/page.tsx
M	apps/admin/app/(internal)/leads/[leadId]/page.tsx
M	apps/admin/app/(internal)/leads/new/page.tsx
M	apps/admin/app/(internal)/leads/page.tsx
M	apps/admin/app/(internal)/notifications/page.tsx
M	apps/admin/app/(internal)/onboarding/[onboardingId]/page.tsx
M	apps/admin/app/(internal)/onboarding/new/page.tsx
M	apps/admin/app/(internal)/onboarding/page.tsx
M	apps/admin/app/(internal)/page.tsx
M	apps/admin/app/(internal)/partner-inquiries/[inquiryId]/page.tsx
M	apps/admin/app/(internal)/partner-inquiries/page.tsx
M	apps/admin/app/(internal)/partner-onboarding/[applicationId]/page.tsx
M	apps/admin/app/(internal)/partner-onboarding/page.tsx
M	apps/admin/app/(internal)/partners/[partnerId]/page.tsx
M	apps/admin/app/(internal)/partners/new/page.tsx
M	apps/admin/app/(internal)/partners/page.tsx
M	apps/admin/app/(internal)/payments/[paymentId]/page.tsx
M	apps/admin/app/(internal)/payments/page.tsx
M	apps/admin/app/(internal)/plans/[planId]/page.tsx
M	apps/admin/app/(internal)/plans/new/page.tsx
M	apps/admin/app/(internal)/plans/page.tsx
M	apps/admin/app/(internal)/preferences/page.tsx
M	apps/admin/app/(internal)/profile/page.tsx
M	apps/admin/app/(internal)/promotions/page.tsx
M	apps/admin/app/(internal)/security/page.tsx
M	apps/admin/app/(internal)/settings/appearance/page.tsx
M	apps/admin/app/(internal)/settings/billing/page.tsx
M	apps/admin/app/(internal)/settings/branding/page.tsx
M	apps/admin/app/(internal)/settings/company-profile/page.tsx
M	apps/admin/app/(internal)/settings/contracts/page.tsx
M	apps/admin/app/(internal)/settings/customer-definitions/page.tsx
M	apps/admin/app/(internal)/settings/customers/page.tsx
M	apps/admin/app/(internal)/settings/demo-data/page.tsx
M	apps/admin/app/(internal)/settings/email/page.tsx
M	apps/admin/app/(internal)/settings/features/page.tsx
M	apps/admin/app/(internal)/settings/integrations/stripe/page.tsx
M	apps/admin/app/(internal)/settings/invoices/page.tsx
M	apps/admin/app/(internal)/settings/lead-definitions/page.tsx
M	apps/admin/app/(internal)/settings/legal/page.tsx
M	apps/admin/app/(internal)/settings/monitoring/error-logs/page.tsx
M	apps/admin/app/(internal)/settings/monitoring/events/page.tsx
M	apps/admin/app/(internal)/settings/monitoring/integrations/page.tsx
M	apps/admin/app/(internal)/settings/monitoring/page.tsx
M	apps/admin/app/(internal)/settings/onboarding-definitions/page.tsx
M	apps/admin/app/(internal)/settings/partners/page.tsx
M	apps/admin/app/(internal)/settings/plans/page.tsx
M	apps/admin/app/(internal)/settings/platform-defaults/page.tsx
M	apps/admin/app/(internal)/settings/security/page.tsx
M	apps/admin/app/(internal)/settings/support/page.tsx
M	apps/admin/app/(internal)/settings/tenant-provisioning/page.tsx
M	apps/admin/app/(internal)/settings/users/page.tsx
M	apps/admin/app/(internal)/signature-requests/[requestId]/page.tsx
M	apps/admin/app/(internal)/signature-requests/page.tsx
M	apps/admin/app/(internal)/subscriptions/[subscriptionId]/page.tsx
M	apps/admin/app/(internal)/subscriptions/page.tsx
M	apps/admin/app/(internal)/support/cases/[caseId]/page.tsx
M	apps/admin/app/(internal)/support/cases/new/page.tsx
M	apps/admin/app/(internal)/support/cases/page.tsx
M	apps/admin/app/(internal)/templates/[templateId]/page.tsx
M	apps/admin/app/(internal)/templates/new/page.tsx
M	apps/admin/app/(internal)/templates/page.tsx
M	apps/admin/app/(internal)/tenants/[tenantId]/page.tsx
M	apps/admin/app/(internal)/tenants/page.tsx
M	apps/admin/app/_components/admin-shell.tsx
M	apps/admin/app/_components/admin-sidebar.tsx
M	apps/admin/app/_components/admin-topbar.tsx
M	apps/admin/app/_components/dashboard/platform-dashboard.tsx
M	apps/admin/app/_components/monitoring/monitoring-overview.tsx
M	apps/admin/app/_components/promotions-manager.tsx
M	apps/admin/app/_components/runtime/module-action-bar.tsx
M	apps/admin/app/_components/runtime/runtime-form.tsx
M	apps/admin/app/_components/runtime/runtime-module-list.tsx
M	apps/admin/app/_components/runtime/runtime-record-page.tsx
M	apps/admin/app/_components/runtime/use-confirm-action.tsx
A	apps/admin/app/api/super-admin/promotions/[promotionId]/deactivate/route.ts
M	apps/admin/app/layout.tsx
A	apps/admin/lib/dashboard-hydration.spec.ts
M	apps/admin/lib/formatters.ts
M	apps/admin/lib/monitoring-overview.spec.ts
M	apps/admin/lib/reference-data/platform-reference-data.ts
A	apps/admin/lib/runtime/blocked-save-feedback.spec.ts
A	apps/admin/lib/runtime/blocked-save-feedback.ts
A	apps/admin/lib/runtime/destructive-confirm.spec.ts
A	apps/admin/lib/runtime/destructive-confirm.ts
A	apps/admin/lib/runtime/form-accessibility.spec.ts
A	apps/admin/lib/runtime/humanize-field-error.spec.ts
A	apps/admin/lib/runtime/humanize-field-error.ts
A	apps/admin/lib/runtime/humanize-label.spec.ts
A	apps/admin/lib/runtime/humanize-label.ts
A	apps/admin/lib/runtime/lookup-disambiguation.spec.ts
M	apps/admin/lib/runtime/platform-module-registry.ts
M	apps/admin/lib/runtime/platform-runtime.types.ts
M	apps/admin/lib/runtime/runtime-lookups.ts
A	apps/admin/lib/runtime/runtime-write-contract.spec.ts
A	apps/admin/lib/runtime/runtime-write-payload.ts
A	apps/admin/lib/shell-landmarks.spec.ts
M	apps/landing/app/subscribe/subscribe-form.tsx
A	apps/landing/lib/workspace-address.spec.ts
M	apps/web/app/(authenticated)/_components/dashboard-sidebar.tsx
M	apps/web/app/(public)/login/login-form.tsx
M	apps/web/app/components/ui/form-control.tsx
A	apps/web/app/components/ui/login-field-accessibility.spec.ts
A	apps/web/app/components/workspace-shell-headings.spec.ts
A	apps/web/lib/tenant-root-domain.spec.ts
M	docs/backlog/completed.md
M	docs/backlog/deferred.md
M	docs/backlog/index.md
A	docs/backlog/items/ITEM-0103-deployment-check-the-composed-tenant-workspace-host-must-res.md
M	docs/backlog/open.md
M	docs/bugs/BUG-0015-a-tenant-that-fails-before-identities-and-billing-is-unrecoverable.md
M	docs/bugs/BUG-0016-partner-onboarding-review-has-no-state-machine.md
M	docs/bugs/BUG-0018-bulk-lead-delete-is-unreachable-for-every-role.md
M	docs/bugs/BUG-0898-self-service-checkout-is-blocked-for-every-plan-no-plan-pric.md
M	docs/bugs/BUG-0903-production-runs-stripe-in-test-mode-so-no-real-payment-can-b.md
M	docs/bugs/BUG-0904-production-is-missing-outbox-worker-enabled-so-no-workspace-.md
M	docs/bugs/BUG-0905-production-defines-direct-url-but-the-code-reads-direct-data.md
M	docs/bugs/BUG-1419-every-incident-on-the-monitoring-overview-links-to-a-route-t.md
M	docs/bugs/BUG-1420-the-monitoring-severity-filter-cannot-match-99-7-percent-of-.md
M	docs/bugs/BUG-1421-every-admin-screen-shares-one-page-title-two-main-landmarks-.md
M	docs/bugs/BUG-1422-runtime-form-validation-discards-every-field-reason-and-show.md
M	docs/bugs/BUG-1423-runtime-form-controls-have-no-accessible-name-so-screen-read.md
M	docs/bugs/BUG-1424-the-admin-console-serves-no-content-security-policy-header.md
M	docs/bugs/BUG-1425-currencycode-accepts-any-string-of-three-characters-or-fewer.md
M	docs/bugs/BUG-1541-generated-agreement-pdfs-render-unsubstituted-template-place.md
M	docs/bugs/BUG-1543-stripe-webhook-rejected-as-validation-failed-during-a-live-p.md
M	docs/bugs/BUG-1544-public-signup-advertises-a-workspace-domain-that-does-not-re.md
M	docs/bugs/BUG-1545-manual-customer-onboarding-creation-fails-on-an-owner-foreig.md
M	docs/bugs/BUG-1546-required-fields-on-unfocused-tabs-give-no-indication-of-wher.md
M	docs/bugs/BUG-1547-onboarding-prerequisite-message-states-the-inverse-of-the-tr.md
M	docs/bugs/BUG-1549-database-and-validator-internals-are-surfaced-in-user-facing.md
M	docs/bugs/BUG-1550-lead-record-shows-two-different-owners-on-the-same-screen.md
M	docs/bugs/BUG-1553-owner-and-template-pickers-list-indistinguishable-duplicate-.md
M	docs/bugs/BUG-1554-admin-requests-its-own-partners-api-with-a-rejected-pagesize.md
M	docs/bugs/BUG-1555-an-inactive-plan-with-no-prices-is-offered-as-a-customer-pre.md
M	docs/bugs/BUG-1556-contract-dates-with-no-value-render-as-the-unix-epoch.md
M	docs/bugs/BUG-1557-react-hydration-error-418-on-the-admin-dashboard.md
M	docs/bugs/BUG-1558-admin-list-copy-uses-incorrect-pluralisation-and-articles.md
M	docs/bugs/BUG-1559-empty-states-instruct-the-user-to-create-records-on-screens-.md
M	docs/bugs/BUG-1560-delete-confirmation-does-not-name-the-record-being-deleted.md
M	docs/bugs/BUG-1561-signup-verification-step-has-no-way-back-to-correct-a-mistyp.md
M	docs/bugs/BUG-1578-admin-customer-form-stores-a-country-lookup-id-where-every-r.md
M	docs/bugs/BUG-1644-tenant-root-domain-is-misconfigured-so-no-customer-can-reach.md
M	docs/bugs/BUG-1649-api-proxy-routes-copy-the-upstream-content-encoding-onto-an-.md
M	docs/bugs/BUG-1654-every-empty-list-in-a-new-workspace-blames-filters-that-are-.md
M	docs/bugs/BUG-1655-tenant-login-password-field-has-no-accessible-name-and-no-au.md
M	docs/bugs/BUG-1673-tenant-workspace-shell-repeats-three-h1-headings-and-two-mai.md
A	docs/bugs/BUG-1742-lead-creation-is-impossible-the-runtime-form-always-sends-pa.md
A	docs/bugs/BUG-1743-customers-and-partners-cannot-be-edited-the-runtime-form-ech.md
A	docs/bugs/BUG-1744-every-subscription-has-a-zero-length-billing-period-and-a-re.md
A	docs/bugs/BUG-1745-the-executive-dashboard-reports-zero-revenue-because-reporti.md
A	docs/bugs/BUG-1746-required-fields-on-unselected-tabs-are-undiscoverable-so-cre.md
A	docs/bugs/BUG-1747-partner-currency-is-a-required-numeric-input-so-partner-crea.md
A	docs/bugs/BUG-1748-the-subscription-record-page-cannot-resolve-its-own-tenant-p.md
A	docs/bugs/BUG-1749-admin-creates-plans-that-can-never-be-sold-and-can-never-be-.md
A	docs/bugs/BUG-1750-the-monitoring-critical-tile-miscounts-and-links-to-a-filter.md
A	docs/bugs/BUG-1751-a-promotion-goes-live-against-every-subscription-the-instant.md
A	docs/bugs/BUG-1752-admin-empty-states-blame-filters-that-are-not-set.md
A	docs/bugs/BUG-1753-lookup-display-labels-mangle-acronyms-and-numeric-ranges-acr.md
A	docs/bugs/BUG-1754-the-incident-queue-counts-routine-401s-and-unknown-route-404.md
A	docs/bugs/BUG-1755-the-plans-list-cannot-show-publication-status-or-sales-model.md
A	docs/bugs/BUG-1756-bulk-delete-confirms-without-naming-how-many-records-or-whic.md
A	docs/bugs/BUG-1757-promotions-cannot-be-deleted-and-the-delete-route-silently-d.md
A	docs/bugs/BUG-1822-landing-csp-permits-the-api-over-http-so-its-own-connect-src.md
A	docs/engineering-history/tasks/2026-08-28-admin-console-e2e-qa-d78f0fc4.md
A	docs/handoff/2026-08-28-post-release-browser-qa.md
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/DijiPeople Product Dashboard.md
M	docs/knowledge/dashboards/Engineering Control Center.md
M	docs/qa/coverage-matrix.md
M	docs/qa/known-bug-patterns/README.md
A	docs/qa/known-bug-patterns/per-module-fix-behind-a-per-module-test.md
M	docs/qa/regressions/index.md
A	docs/qa/runs/2026-08-28-admin-console-e2e-912f4e6.md
A	docs/qa/scenarios/QA-AUTH-006-a-tenant-workspace-url-survives-a-multi-label-root-domain.md
A	docs/qa/scenarios/QA-DEPLOY-022-the-deployment-says-whether-it-is-draining-the-outbox.md
A	docs/qa/scenarios/QA-DEPLOY-023-every-app-serves-a-usable-content-security-policy.md
A	docs/qa/scenarios/QA-TENANT-025-every-admin-module-writes-only-what-its-dto-accepts.md
A	docs/qa/scenarios/QA-TENANT-026-a-currency-code-is-a-currency-not-a-three-character-string.md
A	docs/qa/scenarios/QA-TENANT-027-a-blocked-save-always-points-at-the-field-that-blocked-it.md
A	docs/qa/scenarios/QA-TENANT-028-migrations-run-over-a-direct-connection-under-either-variabl.md
A	docs/qa/scenarios/QA-TENANT-029-a-subscription-carries-a-billing-period-with-length.md
A	docs/qa/scenarios/QA-TENANT-030-a-subscription-record-names-its-tenant-plan-and-price.md
A	docs/qa/scenarios/QA-TENANT-031-a-plan-cannot-be-sold-unpriced-and-can-be-removed-unsold.md
A	docs/qa/scenarios/QA-TENANT-032-deleting-a-promotion-removes-it-or-says-why-not.md
A	docs/qa/scenarios/QA-TENANT-033-the-critical-tile-and-the-screen-it-opens-agree.md
A	docs/qa/scenarios/QA-TENANT-034-routine-protocol-outcomes-stay-out-of-the-triage-queue.md
A	docs/qa/scenarios/QA-TENANT-035-an-empty-list-says-which-kind-of-empty-it-is.md
A	docs/qa/scenarios/QA-TENANT-036-a-destructive-dialog-names-what-it-will-destroy.md
A	docs/qa/scenarios/QA-TENANT-037-dropdown-labels-keep-their-acronyms-and-ranges.md
A	docs/qa/scenarios/QA-TENANT-038-a-field-error-names-the-field-on-the-screen.md
A	docs/qa/scenarios/QA-TENANT-039-runtime-form-controls-have-accessible-names.md
A	docs/qa/scenarios/QA-TENANT-040-a-shell-owns-no-headings-or-landmarks-the-page-should-own.md
A	docs/qa/scenarios/QA-TENANT-041-the-login-password-field-names-itself.md
A	docs/qa/scenarios/QA-TENANT-042-the-onboarding-prerequisite-message-names-what-is-missing.md
A	docs/qa/scenarios/QA-TENANT-043-a-tenant-is-never-provisioned-onto-a-plan-nothing-can-bill.md
A	docs/qa/scenarios/QA-TENANT-044-absent-dates-render-as-absent-rather-than-as-1970.md
A	docs/qa/scenarios/QA-TENANT-045-duplicate-picker-entries-tell-themselves-apart.md
A	docs/qa/scenarios/QA-TENANT-046-creating-a-promotion-does-not-publish-it.md
A	docs/qa/scenarios/QA-TENANT-047-a-filtered-revenue-figure-says-what-it-excludes.md
A	docs/qa/scenarios/QA-TENANT-048-nothing-formats-against-the-runtime-locale-across-a-hydratio.md
A	docs/qa/scenarios/QA-TENANT-049-the-signup-wizard-advertises-the-address-the-tenant-will-get.md
A	docs/qa/scenarios/QA-TENANT-050-leads-are-withdrawn-rather-than-bulk-deleted.md
A	docs/qa/scenarios/QA-TENANT-051-a-rejected-stripe-webhook-names-the-check-that-refused-it.md
M	docs/qa/scenarios/index.md
M	docs/qa/test-plans/PLAN-001-authentication.md
M	docs/qa/test-plans/PLAN-005-lead-management.md
M	docs/qa/test-plans/PLAN-012-deployment-release.md
M	docs/qa/test-plans/PLAN-013-landing.md
M	docs/qa/test-plans/PLAN-014-outbox.md
M	docs/qa/test-plans/PLAN-019-platform-admin.md
M	docs/qa/test-plans/PLAN-020-billing.md
M	docs/qa/test-plans/index.md
A	docs/sessions/SESSION-0065-admin-console-end-to-end-browser-qa-and-go-live-assessment.md
A	docs/sessions/SESSION-0066-fix-all-open-and-deferred-bugs.md
M	docs/sessions/active.md
M	docs/sessions/completed.md
M	docs/sessions/index.md
M	docs/tasks/remediation/TASK-0005-inventory.json
M	package.json
M	packages/config/database-urls.js
M	packages/config/database-urls.test.js
A	packages/config/empty-list-message.js
A	packages/config/empty-list-message.test.js
M	packages/config/index.d.ts
M	packages/config/index.js
A	packages/config/platform-currencies.js
A	packages/config/platform-currencies.test.js
M	packages/config/platform-runtime-schema.generated.json
M	packages/config/security-headers.js
M	packages/config/security-headers.test.js
M	scripts/generate-platform-runtime-schema.mjs
A	scripts/lib/runtime-write-contract.mjs
M	scripts/smoke-deployment.mjs
M	services/api/package.json
A	services/api/prisma/repair-routine-incidents.ts
M	services/api/src/app.controller.spec.ts
A	services/api/src/app.service.spec.ts
M	services/api/src/app.service.ts
M	services/api/src/common/filters/http-exception.filter.ts
M	services/api/src/common/reference-data/platform-reference-data.ts
M	services/api/src/modules/billing/controllers/stripe-webhook.controller.ts
M	services/api/src/modules/billing/services/webhook.service.ts
A	services/api/src/modules/billing/subscription-billing-period.spec.ts
A	services/api/src/modules/billing/webhook-rejection-diagnostics.spec.ts
M	services/api/src/modules/error-logs/error-logs.service.ts
A	services/api/src/modules/error-logs/expected-protocol-outcome.spec.ts
A	services/api/src/modules/error-logs/expected-protocol-outcome.ts
M	services/api/src/modules/leads/admin-leads.controller.ts
A	services/api/src/modules/leads/bulk-delete-withdrawn.spec.ts
A	services/api/src/modules/partners/dto/partner-currency.spec.ts
M	services/api/src/modules/partners/dto/partner.dto.ts
M	services/api/src/modules/platform-monitoring/incident-severity-case.spec.ts
M	services/api/src/modules/platform-monitoring/platform-monitoring.service.ts
M	services/api/src/modules/platform-runtime/platform-runtime.service.ts
M	services/api/src/modules/super-admin/billing.service.ts
A	services/api/src/modules/super-admin/onboarding-prerequisites.spec.ts
A	services/api/src/modules/super-admin/plan-lifecycle.spec.ts
M	services/api/src/modules/super-admin/platform-lifecycle.service.ts
A	services/api/src/modules/super-admin/promotion-deletion.spec.ts
A	services/api/src/modules/super-admin/promotion-safety.spec.ts
A	services/api/src/modules/super-admin/subscription-record-shape.spec.ts
M	services/api/src/modules/super-admin/super-admin.controller.ts
M	services/api/src/modules/super-admin/super-admin.service.ts
```

## Conflicts

None.

Nine integrations by ref-push over roughly six hours, and `origin/develop` did
not move under any of them — every one was a clean fast-forward from a base this
branch already contained. Two other sessions were registered as ACTIVE
throughout (SESSION-0061, SESSION-0064) but neither wrote to `develop` in that
window.

## Conflict Resolutions

None required.

Worth recording in their place, because they are the decisions this task did
have to make and they carried the same "what is lost by the other choice"
weight:

**BUG-1749 — `isPublic: false` versus `publicationStatus: DRAFT`.** The obvious
way to stop a priceless plan reaching the catalogue is to write `isPublic:
false` at creation. `one-self-service-gate.spec.ts` rejected it, and correctly:
BUG-0223 retired that boolean because two gates that can disagree are worse than
either alone. Choosing the obvious side would have re-created the disagreement
that record exists to prevent, on a new call site, with a passing test suite.

**BUG-0018 — `delete: false` versus a separate `bulkDelete` capability.** The
console capability gated single and bulk deletion together, so withholding bulk
by setting `delete: false` also removes deleting one lead from its own record
page. That was not the decision the owner made. Splitting the capability costs a
type change; the other side would have silently widened a scoped decision.

**BUG-1754 — excluding `400`s from the triage queue.** The record proposing the
fix suggested sweeping client validation rejections along with the 401s and
404s. BUG-1742 — no lead could be created from Platform Admin, for anyone, in
production — presented as exactly that: a `400` saying `partnerId must be a
UUID`. Taking that side would have hidden a defect blocking the entry point of
the commercial funnel.

## QA

| | |
|---|---|
| **QA Report** | None — this task was driven from the existing records in `docs/bugs/`, not from a new QA run. The run that produced most of them is `docs/qa/runs/2026-08-28-admin-console-e2e-912f4e6.md`. |
| **Bug IDs** | **Closed (42):** BUG-0015, BUG-0016, BUG-0018, BUG-0904, BUG-0905, BUG-1421, BUG-1423, BUG-1424, BUG-1425, BUG-1544, BUG-1545, BUG-1546, BUG-1547, BUG-1549, BUG-1550, BUG-1553, BUG-1554, BUG-1555, BUG-1556, BUG-1557, BUG-1558, BUG-1559, BUG-1560, BUG-1561, BUG-1655, BUG-1673, BUG-1742, BUG-1743, BUG-1744, BUG-1745, BUG-1746, BUG-1747, BUG-1748, BUG-1749, BUG-1750, BUG-1751, BUG-1752, BUG-1753, BUG-1754, BUG-1755, BUG-1756, BUG-1757. **Created (1):** BUG-1822. **Advanced but still open:** BUG-1543 (diagnostics only). BUG-0084 was **not** closed - see Release / Deployment Impact. |
| **Backlog Items** | None created, advanced or closed. |

## CI

| | |
|---|---|
| **CI Run ID** | `33186254827` — on `cd4edb86`, the exact SHA pushed to `develop`. |
| **CI Result** | PASS |

Nine runs in total. Three failed and each failure was informative rather than
flaky:

| SHA | Result | What failed |
|---|---|---|
| `1c0f6b79` | PASS | — |
| `79f313fc` | PASS | — |
| `fb67698b` | **FAILED** | Component index stale — I regenerated it *before* the last source edits rather than after. |
| `af8b5bc1` | PASS | — |
| `53db392b` | **FAILED** | API tests. My own spec, and it was right: it found a second prerequisite function with the identical defect that the local CRLF checkout could not see. |
| `fd73257d` | **FAILED** | One prettier error. The repo's own `npm run lint` runs `eslint --fix`; CI runs check-only. |
| `78aeadbd` | PASS | — |
| `7f03da08` | CANCELLED | Superseded by `cd4edb86`, as the concurrency policy intends for `agent/*`. |
| `cd4edb86` | PASS | The verdict this integration used. |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

`develop`'s tip is byte-identical to `cd4edb86`, because integration was by
ref-push rather than by a merge commit. The CI verdict above is therefore a
verdict on the integrated tree, not only on the branch — which is the reason
this repository integrates that way.

Run locally against that SHA before the push:

| Command | Result |
|---|---|
| `npm --workspace api run test` | 1940 passed, 241 suites |
| `npm --workspace admin run test` | 369 passed, 40 suites |
| `npm --workspace web run test` | 884 passed, 27 suites |
| `npm run validate:framework` | 4208 checks passed |
| `npm run components:check` | current |
| `npm run check:runtime-schema` | matches `schema.prisma` |
| `npx eslint` (check-only, all four workspaces) | 0 errors |

**Not run:** anything requiring a database or a browser. No e2e suite, no
migration, no axe-core pass. Several records name a browser retest as the thing
that would actually close them and say so explicitly.

## Release / Deployment Impact

None — not deployed. `main` is untouched (`MAIN_CHANGE_STATUS = UNTOUCHED`
against baseline `e0aeabc`), so nothing here reaches production until the owner
promotes it.

Two behaviour changes an operator will notice as soon as it does deploy, and
both are intended:

- **Promotions are created inactive.** Someone used to the old screen will add
  one and find it does nothing until they press Activate. This is the fix for
  BUG-1751, where one press published a live 10% global discount.
- **Partners with an invalid `currencyCode` will not save until corrected.**
  Rows carrying `currencyCode: "5"` exist in production; editing one now asks
  for a real currency. That is BUG-1425/BUG-1747 working, but it is the kind of
  thing reported as a regression.

Three things were deliberately **not** done because they need an environment or
a decision this task should not make:

- **BUG-0084** — seven missing unique indexes. `CREATE UNIQUE INDEX` fails if
  duplicates exist and a failure inside `preDeployCommand` aborts the
  deployment. Writing an untested migration with that blast radius was not
  worth the risk without a database.
- **BUG-0015's live replay** — the fix was verified as already present and its
  spec passes, but no failed provisioning was actually retried. A local database
  was offered; the credential supplied did not authenticate.
- **BUG-0898 / BUG-0903** — the Stripe go-live, put out of scope by the owner
  mid-task. Production still runs test-mode keys.

## Knowledge Capture

No `docs/knowledge/` file was written. The durable output of this task is
`docs/qa/regressions/index.md` — **REG-272 through REG-299**, twenty-eight
entries — and **QA-TENANT-025..051** plus **QA-DEPLOY-022..023**, each naming
the test that holds the fix and, where it applies, what is still open.

Three lessons went to the operator's own memory rather than to the vault,
because they are about how to work in this repository rather than about the
product:

1. **Measure a record before implementing against it.** Five of about fifty
   open records had premises that were already false — BUG-0015, BUG-0016,
   BUG-0018, BUG-1424 and BUG-1544. Two took a single `curl` to disprove.
   Measuring also *found* BUG-1822, which nobody had recorded.
2. **A source-reading spec asserting on a `\n` literal passes vacuously on a
   CRLF checkout.** BUG-1208's class inverted: it passed here and failed on CI,
   where it was right. Every such spec in this task now normalises line endings.
3. **`replace(old, new, 1)` takes the first match, not the one you were looking
   at.** It edited `createPlanPrice` instead of `createPromotion` and would have
   made every new plan price inactive; typecheck and 1930 tests all passed.

## Obsidian Sync

Not run. `knowledge:sync` needs a local vault configuration this session does
not have, and `knowledge:dashboards` — the generated half that lives in the
repository — was regenerated before every commit and is current at
`cd4edb86`.

Nothing is lost by the gap: the bug records, regression register and QA
scenarios are all Git-tracked, and a later `knowledge:sync` will pick them up
from there.

## Cleanup

Neither yet, deliberately.

The worktree at `D:/My Work/hrm-dijipeople/wt-open-bug-sweep` and the branch
`agent/open-bug-sweep` are both retained until the owner has read this report,
because eight records remain open and several name a browser or database retest
that is easier to run from a checkout that already has the context.

`TASK_WORKTREE_STATUS = CLEAN` and `UNEXPLAINED_DIRTY_FILES = 0`. The primary
checkout is `DIRTY_USER_OWNED` on `.mcp.json` alone — the same path it carried
before this task started, recorded as the `--primary-baseline` and never
touched. Local `develop` was fast-forwarded to the integrated SHA; `.mcp.json`
survived that unchanged.

When removing the worktree, use `npm run worktree:remove` and not
`git worktree remove` — the latter follows the `node_modules` junctions and has
previously deleted thousands of files out of the primary checkout.
